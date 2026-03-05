import { getAdminDb } from '../_lib/firebaseAdmin.js';
import { sendJson } from '../_lib/http.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendJson(res, 405, { error: 'Método não permitido.' });
    }

    const db = getAdminDb();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const snap = await db
      .collection('emailEvents')
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();

    const events = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const total = events.length;
    const success = events.filter(e => e.status === 'success').length;
    const errors = events.filter(e => e.status === 'error').length;
    const outbound = events.filter(e => e.type === 'outbound').length;
    const inbound = events.filter(e => e.type === 'inbound').length;
    const sync = events.filter(e => e.type === 'sync').length;
    const byProvider = events.reduce((acc, ev) => {
      const key = ev.provider || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return sendJson(res, 200, {
      ok: true,
      windowHours: 24,
      summary: {
        total,
        success,
        errors,
        outbound,
        inbound,
        sync,
        byProvider,
      },
      recentErrors: events
        .filter(e => e.status === 'error')
        .slice(0, 20)
        .map(e => ({
          id: e.id,
          createdAt: e.createdAt,
          provider: e.provider || null,
          type: e.type || null,
          ticketId: e.ticketId || null,
          error: e.error || 'Erro não detalhado',
        })),
    });
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha ao ler saúde de e-mail.' });
  }
}
