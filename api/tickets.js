import { getAdminDb } from './_lib/firebaseAdmin.js';
import { readJsonBody, sendJson } from './_lib/http.js';
import { normalizeTicketForStorage, serializeTicketForApi } from './_lib/tickets.js';

function sortTimeValue(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

export default async function handler(req, res) {
  try {
    const db = getAdminDb();
    const col = db.collection('tickets');

    if (req.method === 'GET') {
      const snap = await col.get();
      const tickets = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .map(serializeTicketForApi)
        .sort((a, b) => sortTimeValue(b.time) - sortTimeValue(a.time));
      return sendJson(res, 200, { ok: true, tickets });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!body?.ticket?.id) {
        return sendJson(res, 400, { ok: false, error: 'ticket.id é obrigatório.' });
      }
      const ticket = normalizeTicketForStorage(body.ticket);
      await col.doc(ticket.id).set({
        ...ticket,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      if (!body?.id || !body?.updates) {
        return sendJson(res, 400, { ok: false, error: 'id e updates são obrigatórios.' });
      }
      const updates = normalizeTicketForStorage(body.updates);
      await col.doc(body.id).set({ ...updates, updatedAt: new Date() }, { merge: true });
      return sendJson(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha no endpoint de tickets.' });
  }
}
