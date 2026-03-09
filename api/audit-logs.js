import { requireAdminUser } from './_lib/authz.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { sendJson } from './_lib/http.js';

function normalizeTimestamp(value) {
  if (!value) return null;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

function normalizeValue(value) {
  if (value == null) return null;
  if (typeof value?.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === 'object') {
    if ('_seconds' in value) {
      const seconds = Number(value._seconds || 0);
      return new Date(seconds * 1000).toISOString();
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, normalizeValue(entry)]));
  }
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
    const includeSystem = String(req.query?.includeSystem || '').trim().toLowerCase() === 'true';
    const snapshot = await db.collection('auditLogs').orderBy('createdAt', 'desc').limit(limit).get();

    const technicalActions = new Set(['system.bootstrap', 'firestore.backfill_legacy', 'firebase.auth-pending']);
    const technicalEntities = new Set(['firebase', 'firestore.legacy']);

    const logs = snapshot.docs
      .map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          actor: data.actor || 'sistema',
          action: data.action || 'unknown',
          entity: data.entity || 'unknown',
          entityId: data.entityId || null,
          before: normalizeValue(data.before || null),
          after: normalizeValue(data.after || null),
          metadata: normalizeValue(data.metadata || null),
          createdAt: normalizeTimestamp(data.createdAt),
        };
      })
      .filter(log => {
        if (includeSystem) return true;
        return !(technicalActions.has(log.action) || technicalEntities.has(log.entity));
      });

    return sendJson(res, 200, { ok: true, logs });
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha ao carregar auditoria.' });
  }
}
