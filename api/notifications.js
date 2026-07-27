import { requireAuthenticatedUser , resolveActor } from './_lib/authz.js';
import { canUserAccessTicket, readTerritoryCatalog } from './_lib/ticketAccess.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { readJsonBody, sendError, sendJson } from './_lib/http.js';
import { writeAuditLog } from './_lib/auditLogs.js';
import {
  canUserSeeNotification,
  getNotificationStateCollection,
  isNotificationDismissed,
  mergeNotificationState,
  resolveNotificationTicketId,
} from './_lib/notificationState.js';

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

// Escopo territorial de uma notificação ligada a uma OS. Admin vê tudo;
// notificação sem ticketId é geral. Demais perfis só veem se a OS referenciada
// estiver no seu escopo (região/sede).
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
  const [snap, stateSnap] = await Promise.all([
    db.collection('notifications').get(),
    getNotificationStateCollection(db, user.id).get(),
  ]);
  const stateByNotificationId = new Map(
    stateSnap.docs.map(doc => [doc.id, doc.data()])
  );
  const visibleByRole = snap.docs
    .map(doc => {
      const notification = { id: doc.id, ...doc.data() };
      return mergeNotificationState(notification, stateByNotificationId.get(doc.id));
    })
    .filter(notification => canUserSeeNotification(user, notification))
    .filter(notification => !isNotificationDismissed(stateByNotificationId.get(notification.id)));

  // Admin não precisa de escopo territorial; demais perfis filtram por OS acessível.
  if (user?.role === 'Admin') {
    return visibleByRole.sort((a, b) => (toDate(b.time)?.getTime() || 0) - (toDate(a.time)?.getTime() || 0));
  }

  // Escopo territorial em lote: busca todos os tickets referenciados de uma vez
  // (db.getAll) em vez de uma leitura por notificação (antes era O(N) em série).
  const ticketIds = [...new Set(visibleByRole.map(resolveNotificationTicketId).filter(Boolean))];
  const ticketMap = new Map();
  if (ticketIds.length > 0) {
    const refs = ticketIds.map(id => db.collection('tickets').doc(id));
    const snaps = await db.getAll(...refs);
    for (const ticketSnap of snaps) {
      if (ticketSnap.exists) ticketMap.set(ticketSnap.id, { id: ticketSnap.id, ...ticketSnap.data() });
    }
  }

  const territory = await readTerritoryCatalog(db);
  const scoped = visibleByRole.filter(notification => {
    const ticketId = resolveNotificationTicketId(notification);
    if (!ticketId) return true; // notificação geral
    const ticket = ticketMap.get(ticketId);
    if (!ticket) return false; // OS inexistente → fail-closed
    return canUserAccessTicket(user, ticket, territory.regions, territory.sites);
  });
  return scoped.sort((a, b) => (toDate(b.time)?.getTime() || 0) - (toDate(a.time)?.getTime() || 0));
}

export default async function handler(req, res) {
  try {
    const db = getAdminDb();

    if (req.method === 'GET') {
      const user = await requireAuthenticatedUser(req);
      const notifications = await readNotifications(db, user);
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
        const now = new Date();
        await getNotificationStateCollection(db, user.id).doc(id).set(
          {
            notificationId: id,
            userId: user.id,
            readAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'dismiss') {
        const id = String(body?.id || '').trim();
        if (!id) return sendJson(res, 400, { ok: false, error: 'id obrigatório.' });
        const ref = db.collection('notifications').doc(id);
        const snap = await ref.get();
        if (!snap.exists) return sendJson(res, 404, { ok: false, error: 'Notificação não encontrada.' });
        const notificationData = snap.data();
        if (!canUserSeeNotification(user, notificationData) || !(await canUserAccessNotificationTicket(db, user, notificationData))) {
          return sendJson(res, 403, { ok: false, error: 'Permissão insuficiente.' });
        }
        const now = new Date();
        await getNotificationStateCollection(db, user.id).doc(id).set(
          {
            notificationId: id,
            userId: user.id,
            dismissedAt: now,
            updatedAt: now,
          },
          { merge: true }
        );
        await writeAuditLog({
          actor,
          action: 'notifications.dismiss',
          entity: 'notification',
          entityId: id,
          metadata: { userId: user.id },
        });
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'markAllRead') {
        // Marca apenas as notificações visíveis ao usuário.
        const notifications = await readNotifications(db, user);
        const now = new Date();
        const stateCollection = getNotificationStateCollection(db, user.id);
        for (let start = 0; start < notifications.length; start += 400) {
          const batch = db.batch();
          for (const item of notifications.slice(start, start + 400)) {
            batch.set(
              stateCollection.doc(item.id),
              {
                notificationId: item.id,
                userId: user.id,
                readAt: now,
                updatedAt: now,
              },
              { merge: true }
            );
          }
          await batch.commit();
        }
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
