import { requireAuthenticatedUser } from './_lib/authz.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { readJsonBody, sendJson } from './_lib/http.js';
import { normalizeTicketForStorage, serializeTicketForApi } from './_lib/tickets.js';

function sortTimeValue(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function serializeValue(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value && typeof value === 'object' && typeof value.toDate === 'function') {
    const parsed = value.toDate();
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serializeValue(entry)]));
  }

  return value ?? null;
}

async function readPublicTrackingProcurement(ticketRef) {
  const [contractSnap, paymentsSnap, measurementsSnap] = await Promise.all([
    ticketRef.collection('contracts').limit(1).get(),
    ticketRef.collection('payments').get(),
    ticketRef.collection('measurements').get(),
  ]);

  const contract = contractSnap.empty
    ? null
    : serializeValue({
        id: contractSnap.docs[0].id,
        ...contractSnap.docs[0].data(),
      });

  const payments = paymentsSnap.docs
    .map(doc => serializeValue({ id: doc.id, ...doc.data() }))
    .sort((a, b) => Number(a.installmentNumber || 0) - Number(b.installmentNumber || 0));

  const measurements = measurementsSnap.docs
    .map(doc => serializeValue({ id: doc.id, ...doc.data() }))
    .sort((a, b) => sortTimeValue(b.requestedAt || b.createdAt) - sortTimeValue(a.requestedAt || a.createdAt));

  return {
    contract,
    payments,
    measurements,
  };
}

export default async function handler(req, res) {
  try {
    const db = getAdminDb();
    const col = db.collection('tickets');

    if (req.method === 'GET') {
      const trackingToken = String(req.query?.tracking || '').trim();
      if (trackingToken) {
        const trackingSnap = await col.where('trackingToken', '==', trackingToken).limit(1).get();
        if (trackingSnap.empty) {
          return sendJson(res, 404, { ok: false, error: 'Ticket não encontrado.' });
        }

        const trackingDoc = trackingSnap.docs[0];
        const ticket = serializeTicketForApi({
          id: trackingDoc.id,
          ...trackingDoc.data(),
        });
        const procurement = await readPublicTrackingProcurement(trackingDoc.ref);

        return sendJson(res, 200, { ok: true, ticket, procurement });
      }

      await requireAuthenticatedUser(req);

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
      if (!body?.updates) {
        return sendJson(res, 400, { ok: false, error: 'updates são obrigatórios.' });
      }

      if (body?.trackingToken) {
        const trackingToken = String(body.trackingToken || '').trim();
        const trackingSnap = await col.where('trackingToken', '==', trackingToken).limit(1).get();
        if (trackingSnap.empty) {
          return sendJson(res, 404, { ok: false, error: 'Ticket não encontrado.' });
        }

        const normalized = normalizeTicketForStorage(body.updates);
        const allowedUpdates = {};
        if (normalized.status) allowedUpdates.status = normalized.status;
        if (Array.isArray(normalized.history)) allowedUpdates.history = normalized.history;
        if (normalized.closureChecklist) allowedUpdates.closureChecklist = normalized.closureChecklist;

        if (Object.keys(allowedUpdates).length === 0) {
          return sendJson(res, 400, { ok: false, error: 'Nenhuma atualização pública permitida foi enviada.' });
        }

        await trackingSnap.docs[0].ref.set({ ...allowedUpdates, updatedAt: new Date() }, { merge: true });
        return sendJson(res, 200, { ok: true });
      }

      await requireAuthenticatedUser(req);

      if (!body?.id) {
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
