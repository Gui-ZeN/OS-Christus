import { executeApprovalCommand } from './_lib/approvalCommands.js';
import { requireAuthenticatedUser } from './_lib/authz.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { readJsonBody, sendError, sendJson } from './_lib/http.js';
import { assertProcurementMutationAllowed } from './_lib/procurementAccess.js';
import {
  canUserAccessTicket,
  isDirectorAssignedToTicket,
  readTerritoryCatalog,
} from './_lib/ticketAccess.js';
import { syncVendorPreferenceEvents } from './_lib/vendorPreferences.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
    }

    const user = await requireAuthenticatedUser(req);
    const body = await readJsonBody(req);
    const action = String(body?.action || '').trim();
    const ticketId = String(body?.ticketId || '').trim();
    assertProcurementMutationAllowed(user.role, action);
    if (!ticketId) return sendJson(res, 400, { ok: false, error: 'ticketId é obrigatório.' });

    const db = getAdminDb();
    const ticketSnap = await db.collection('tickets').doc(ticketId).get();
    if (!ticketSnap.exists) return sendJson(res, 404, { ok: false, error: 'OS não encontrada.' });

    if (user.role !== 'Admin') {
      const territory = await readTerritoryCatalog(db);
      const ticket = { id: ticketSnap.id, ...ticketSnap.data() };
      if (user.role === 'Diretor' && !isDirectorAssignedToTicket(user, ticket)) {
        return sendJson(res, 403, {
          ok: false,
          error: 'Apenas Diretores envolvidos nesta OS podem registrar a decisão.',
        });
      }
      if (!canUserAccessTicket(user, ticket, territory.regions, territory.sites)) {
        return sendJson(res, 403, { ok: false, error: 'Permissão insuficiente para esta OS.' });
      }
    }

    const result = await executeApprovalCommand({ db, user, ticketId, body });
    if (action === 'approveBudget' && result.selectedQuoteId) {
      try {
        const approvedQuoteSnap = await db
          .collection('tickets')
          .doc(ticketId)
          .collection('quotes')
          .doc(String(result.selectedQuoteId))
          .get();
        if (approvedQuoteSnap.exists) {
          const approvedQuote = approvedQuoteSnap.data() || {};
          await syncVendorPreferenceEvents(db, ticketId, approvedQuote, approvedQuote.classification || null);
        }
      } catch (error) {
        console.error('[approvals] falha ao sincronizar preferência de fornecedor', ticketId, error);
      }
    }
    return sendJson(res, 200, result);
  } catch (error) {
    return sendError(res, error, 'Falha ao processar decisão da Diretoria.');
  }
}
