import { requireAdminUser } from './_lib/authz.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { sendJson } from './_lib/http.js';

function normalizeTimestamp(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
    }

    await requireAdminUser(req);
    const db = getAdminDb();
    const rawLimit = Number.parseInt(String(req.query?.limit || '100'), 10);
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 100;
    const snapshot = await db.collection('auditLogs').orderBy('createdAt', 'desc').limit(limit).get();

    const logs = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        actor: data.actor || 'sistema',
        action: data.action || 'unknown',
        entity: data.entity || 'unknown',
        entityId: data.entityId || null,
        before: data.before || null,
        after: data.after || null,
        metadata: data.metadata || null,
        createdAt: normalizeTimestamp(data.createdAt),
      };
    });

    return sendJson(res, 200, { ok: true, logs });
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha ao carregar auditoria.' });
  }
}
