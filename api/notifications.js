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
  let snap = await db.collection('notifications').get();
  // Seed dos defaults só quando a coleção está GLOBALMENTE vazia (uma vez) — não
  // quando o resultado FILTRADO do usuário está vazio. Antes, o handler refazia a
  // leitura toda vez que um usuário não tinha notificação no escopo (2x por poll).
  if (snap.empty) {
    await ensureDefaults(db);
    snap = await db.collection('notifications').get();
  }
  const visibleByRole = snap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(notification => canUserSeeNotification(user, notification));

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
        await ref.set({ read: true, updatedAt: new Date() }, { merge: true });
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
        // O doc de notificação é COMPARTILHADO: dismiss faz ref.delete(), então
        // dispensar um aviso GERAL (sem audienceRoles e sem ticketId) o apagaria para
        // TODOS, inclusive Admins. Restringe esse caso a Admin/Gestor; avisos
        // escopados (por papel/OS) seguem dispensáveis por quem tem acesso.
        // Mesma normalização de canUserSeeNotification (trim/filter): um doc
        // malformado com audienceRoles:[''] é geral de fato (visível a todos), então
        // não pode ser classificado como "escopado" e escapar da checagem.
        const normalizedAudience = Array.isArray(notificationData?.audienceRoles)
          ? notificationData.audienceRoles.map(role => String(role || '').trim()).filter(Boolean)
          : [];
        const isGeneralNotification = normalizedAudience.length === 0 && !resolveNotificationTicketId(notificationData);
        if (isGeneralNotification && user?.role !== 'Admin' && user?.role !== 'Gestor') {
          return sendJson(res, 403, { ok: false, error: 'Apenas Admin ou Gestor podem dispensar avisos gerais (o aviso é compartilhado por todos).' });
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

