import { requireOperationalManager } from './_lib/authz.js';
import { isEmailOutboxLeaseActive } from './_lib/emailOutbox.js';
import { executeFinanceCommand } from './_lib/financeCommands.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { readJsonBody, sendError, sendJson } from './_lib/http.js';
import {
  canUserAccessTicket,
  readAccessibleTickets,
  readTerritoryCatalog,
} from './_lib/ticketAccess.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
    }

    const user = await requireOperationalManager(req);
    const db = getAdminDb();
    if (req.method === 'GET') {
      const allowedTicketIds = user.role === 'Admin'
        ? null
        : new Set((await readAccessibleTickets(db, user)).map(ticket => ticket.id));
      if (allowedTicketIds && allowedTicketIds.size === 0) {
        return sendJson(res, 200, { ok: true, emailOutboxByTicket: {} });
      }

      const outboxSnap = await db
        .collection('emailOutbox')
        .where('status', 'in', ['pending', 'processing', 'failed', 'dead-letter'])
        .get();
      const emailOutboxByTicket = {};
      for (const doc of outboxSnap.docs) {
        const data = doc.data() || {};
        const ticketId = String(data.ticketId || '').trim();
        if (allowedTicketIds && !allowedTicketIds.has(ticketId)) continue;
        if (!emailOutboxByTicket[ticketId]) emailOutboxByTicket[ticketId] = [];
        const hasActiveLease = isEmailOutboxLeaseActive(data);
        const visibleStatus =
          data.status === 'processing' && !hasActiveLease ? 'failed' : data.status || 'pending';
        emailOutboxByTicket[ticketId].push({
          id: data.commandKey || data.id,
          ticketId,
          paymentId: data.paymentId || null,
          status: visibleStatus,
          attempts: Number(data.attempts || 0),
          recipients: Array.isArray(data.recipients) ? data.recipients : [],
          lastError:
            data.lastError ||
            (data.status === 'processing' && !hasActiveLease
              ? 'A tentativa anterior foi interrompida e pode ser reenviada.'
              : null),
          updatedAt: data.updatedAt || data.createdAt || null,
        });
      }
      return sendJson(res, 200, { ok: true, emailOutboxByTicket });
    }

    const body = await readJsonBody(req);
    const ticketId = String(body?.ticketId || '').trim();
    if (!ticketId) {
      return sendJson(res, 400, { ok: false, error: 'ticketId é obrigatório.' });
    }

    const ticketSnap = await db.collection('tickets').doc(ticketId).get();
    if (!ticketSnap.exists) {
      return sendJson(res, 404, { ok: false, error: 'OS não encontrada.' });
    }
    if (user.role !== 'Admin') {
      const territory = await readTerritoryCatalog(db);
      const ticket = { id: ticketSnap.id, ...ticketSnap.data() };
      if (!canUserAccessTicket(user, ticket, territory.regions, territory.sites)) {
        return sendJson(res, 403, { ok: false, error: 'Permissão insuficiente para esta OS.' });
      }
    }

    const result = await executeFinanceCommand({ db, user, ticketId, body });
    return sendJson(res, 200, result);
  } catch (error) {
    return sendError(res, error, 'Falha ao processar operação financeira.');
  }
}
