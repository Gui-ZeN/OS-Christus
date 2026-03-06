import { requireAuthenticatedUser } from './_lib/authz.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { readActorFromHeaders, readJsonBody, sendJson } from './_lib/http.js';
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

async function readNotifications(db) {
  const snap = await db.collection('notifications').get();
  return snap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => (toDate(b.time)?.getTime() || 0) - (toDate(a.time)?.getTime() || 0));
}

export default async function handler(req, res) {
  try {
    const db = getAdminDb();

    if (req.method === 'GET') {
      await requireAuthenticatedUser(req);
      let notifications = await readNotifications(db);
      if (notifications.length === 0) {
        await ensureDefaults(db);
        notifications = await readNotifications(db);
      }
      return sendJson(res, 200, { ok: true, notifications });
    }

    if (req.method === 'POST') {
      const user = await requireAuthenticatedUser(req);
      const actor = readActorFromHeaders(req) || user.email || user.name || 'painel';
      const body = await readJsonBody(req);
      const action = String(body?.action || '').trim();

      if (action === 'markRead') {
        const id = String(body?.id || '').trim();
        if (!id) return sendJson(res, 400, { ok: false, error: 'id obrigatorio.' });
        await db.collection('notifications').doc(id).set({ read: true, updatedAt: new Date() }, { merge: true });
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'dismiss') {
        const id = String(body?.id || '').trim();
        if (!id) return sendJson(res, 400, { ok: false, error: 'id obrigatorio.' });
        await db.collection('notifications').doc(id).delete();
        await writeAuditLog({
          actor,
          action: 'notifications.dismiss',
          entity: 'notification',
          entityId: id,
        });
        return sendJson(res, 200, { ok: true });
      }

      if (action === 'markAllRead') {
        const notifications = await readNotifications(db);
        const batch = db.batch();
        for (const item of notifications) {
          batch.set(db.collection('notifications').doc(item.id), { read: true, updatedAt: new Date() }, { merge: true });
        }
        await batch.commit();
        return sendJson(res, 200, { ok: true });
      }

      return sendJson(res, 400, { ok: false, error: 'action invalida.' });
    }

    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { ok: false, error: 'Metodo nao permitido.' });
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha em notifications.' });
  }
}
