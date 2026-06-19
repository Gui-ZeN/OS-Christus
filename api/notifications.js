import { requireAuthenticatedUser , resolveActor } from './_lib/authz.js';
import { canUserAccessTicket, readTerritoryCatalog } from './_lib/ticketAccess.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { readJsonBody, sendError, sendJson } from './_lib/http.js';
import { DEFAULT_NOTIFICATIONS } from './_lib/notificationDefaults.js';
import { writeAuditLog } from './_lib/auditLogs.js';

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value?.toDate === 'function') return value.toDate();
  if (typeof value === 'object' && value !== null) {
    const seconds = typeof value._seconds === 'number' ? value._seconds : value.seconds;
    if (typeof seconds === 'number') return new Date(seconds * 1000);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

async function ensureDefaults(db) {
  const batch = db.batch();
  const now = new Date();
  for (let index = 0; index < DEFAULT_NOTIFICATIONS.length; index += 1) {
    const item = DEFAULT_NOTIFICATIONS[index];
    batch.set(
      db.collection('notifications').doc(item.id),
      {
        ...item,
        time: new Date(now.getTime() - index * 2 * 60 * 60 * 1000),
        updatedAt: now,
        createdAt: now,
      },
      { merge: true }
    );
  }
  await batch.commit();
}

// Notificação sem audienceRoles é geral (visível a todos). Com audienceRoles,
// só é visível a usuários cujo papel esteja na lista.
function canUserSeeNotification(user, notification) {
  const audience = Array.isArray(notification?.audienceRoles)
    ? notification.audienceRoles.map(role => String(role || '').trim()).filter(Boolean)
    : [];
  if (audience.length === 0) return true;
  return audience.includes(user?.role);
}

// Escopo territorial de uma notificação ligada a uma OS. Admin vê tudo;
// notificação sem ticketId é geral. Demais perfis só veem se a OS referenciada
// estiver no seu escopo (região/sede).
function resolveNotificationTicketId(notification) {
  return String(notification?.ticketId || notification?.action?.ticketId || '').trim();
}

async function canUserAccessNotificationTicket(db, user, notification, territory) {
  if (user?.role === 'Admin') return true;
  const ticketId = resolveNotificationTicketId(notification);
  if (!ticketId) return true;
  const ticketSnap = await db.collection('tickets').doc(ticketId).get();
  if (!ticketSnap.exists) return false;
  const cat = territory || (await readTerritoryCatalog(db));
  return canUserAccessTicket(user, { id: ticketSnap.id, ...ticketSnap.data() }, cat.regions, cat.sites);
}

async function readNotifications(db, user) {
  const snap = await db.collection('notifications').get();
  const visibleByRole = snap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(notification => canUserSeeNotification(user, notification));

  // Admin não precisa de escopo territorial; demais perfis filtram por OS acessível.
  if (user?.role === 'Admin') {
    return visibleByRole.sort((a, b) => (toDate(b.time)?.getTime() || 0) - (toDate(a.time)?.getTime() || 0));
  }

  const territory = await readTerritoryCatalog(db);
  const scoped = [];
  for (const notification of visibleByRole) {
    if (await canUserAccessNotificationTicket(db, user, notification, territory)) {
      scoped.push(notification);
    }
  }
  return scoped.sort((a, b) => (toDate(b.time)?.getTime() || 0) - (toDate(a.time)?.getTime() || 0));
}

export default async function handler(req, res) {
  try {
    const db = getAdminDb();

    if (req.method === 'GET') {
      const user = await requireAuthenticatedUser(req);
      let notifications = await readNotifications(db, user);
      if (notifications.length === 0) {
        await ensureDefaults(db);
        notifications = await readNotifications(db, user);
      }
      return sendJson(res, 200, { ok: true, notifications });
    }

    if (req.method === 'POST') {
      const user = await requireAuthenticatedUser(req);
      const actor = resolveActor(user);
      const body = await readJsonBody(req);
      const action = String(body?.action || '').trim();

      if (action === 'markRead') {
        const id = String(body?.id || '').trim();
        if (!id) return sendJson(res, 400, { ok: false, error: 'id obrigatório.' });
        const ref = db.collection('notifications').doc(id);
        const snap = await ref.get();
        if (!snap.exists) return sendJson(res, 404, { ok: false, error: 'Notificação não encontrada.' });
        if (!canUserSeeNotification(user, snap.data()) || !(await canUserAccessNotificationTicket(db, user, snap.data()))) {
          return sendJson(res, 403, { ok: false, error: 'Permissão insuficiente.' });
        }
        await ref.set({ read: true, updatedAt: new Date() }, { merge: true });
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'dismiss') {
        const id = String(body?.id || '').trim();
        if (!id) return sendJson(res, 400, { ok: false, error: 'id obrigatório.' });
        const ref = db.collection('notifications').doc(id);
        const snap = await ref.get();
        if (!snap.exists) return sendJson(res, 404, { ok: false, error: 'Notificação não encontrada.' });
        if (!canUserSeeNotification(user, snap.data()) || !(await canUserAccessNotificationTicket(db, user, snap.data()))) {
          return sendJson(res, 403, { ok: false, error: 'Permissão insuficiente.' });
        }
        await ref.delete();
        await writeAuditLog({
          actor,
          action: 'notifications.dismiss',
          entity: 'notification',
          entityId: id,
        });
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'markAllRead') {
        // Marca apenas as notificações visíveis ao usuário.
        const notifications = await readNotifications(db, user);
        const batch = db.batch();
        for (const item of notifications) {
          batch.set(db.collection('notifications').doc(item.id), { read: true, updatedAt: new Date() }, { merge: true });
        }
        await batch.commit();
        return sendJson(res, 200, { ok: true });
      }

      return sendJson(res, 400, { ok: false, error: 'Ação inválida.' });
    }

    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (error) {
    return sendError(res, error, 'Falha nas notificações.');
  }
}

