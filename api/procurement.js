import { requireAuthenticatedUser, requireUserWithRoles } from './_lib/authz.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { readActorFromHeaders, readJsonBody, sendJson } from './_lib/http.js';
import { readProcurement, seedProcurementDefaults } from './_lib/procurement.js';
import { writeAuditLog } from './_lib/auditLogs.js';

async function writeQuotes(db, ticketId, quotes) {
  const batch = db.batch();
  const now = new Date();
  const classification = quotes[0]?.classification || null;

  for (let index = 0; index < quotes.length; index += 1) {
    const quote = quotes[index];
    const id = quote.id || `quote-${index + 1}`;
    batch.set(
      db.collection('tickets').doc(ticketId).collection('quotes').doc(id),
      {
        id,
        ticketId,
        vendor: String(quote.vendor || '').trim(),
        value: String(quote.value || '').trim(),
        recommended: Boolean(quote.recommended),
        status: String(quote.status || 'pending'),
        attachmentName: quote.attachmentName ? String(quote.attachmentName) : null,
        classification: quote.classification || classification,
        updatedAt: now,
        createdAt: now,
      },
      { merge: true }
    );
  }

  await batch.commit();
}

async function writeContract(db, ticketId, contract, classification) {
  const now = new Date();
  const id = contract.id || 'contract-1';
  await db.collection('tickets').doc(ticketId).collection('contracts').doc(id).set(
    {
      id,
      ticketId,
      vendor: String(contract.vendor || '').trim(),
      value: String(contract.value || '').trim(),
      status: String(contract.status || 'pending_signature'),
      viewingBy: contract.viewingBy ? String(contract.viewingBy) : null,
      signedFileName: contract.signedFileName ? String(contract.signedFileName) : null,
      classification: contract.classification || classification || null,
      updatedAt: now,
      createdAt: now,
    },
    { merge: true }
  );
}

async function writePayment(db, ticketId, payment, classification) {
  const now = new Date();
  const id = payment.id || 'payment-1';
  await db.collection('tickets').doc(ticketId).collection('payments').doc(id).set(
    {
      id,
      ticketId,
      vendor: String(payment.vendor || '').trim(),
      value: String(payment.value || '').trim(),
      status: String(payment.status || 'pending'),
      label: payment.label ? String(payment.label) : null,
      installmentNumber: payment.installmentNumber ? Number(payment.installmentNumber) : null,
      totalInstallments: payment.totalInstallments ? Number(payment.totalInstallments) : null,
      dueAt: payment.dueAt ? new Date(payment.dueAt) : null,
      measurementId: payment.measurementId ? String(payment.measurementId) : null,
      releasedPercent: payment.releasedPercent != null ? Number(payment.releasedPercent) : null,
      receiptFileName: payment.receiptFileName ? String(payment.receiptFileName) : null,
      paidAt: payment.paidAt ? new Date(payment.paidAt) : null,
      classification: payment.classification || classification || null,
      updatedAt: now,
      createdAt: now,
    },
    { merge: true }
  );
}

async function writeMeasurement(db, ticketId, measurement, classification) {
  const now = new Date();
  const id = measurement.id || `measurement-${Date.now()}`;
  await db.collection('tickets').doc(ticketId).collection('measurements').doc(id).set(
    {
      id,
      ticketId,
      label: String(measurement.label || 'Medição').trim(),
      progressPercent: Number(measurement.progressPercent || 0),
      releasePercent: Number(measurement.releasePercent || 0),
      status: String(measurement.status || 'approved'),
      notes: measurement.notes ? String(measurement.notes) : '',
      requestedAt: measurement.requestedAt ? new Date(measurement.requestedAt) : now,
      approvedAt: measurement.approvedAt ? new Date(measurement.approvedAt) : null,
      classification: measurement.classification || classification || null,
      updatedAt: now,
      createdAt: now,
    },
    { merge: true }
  );
}

export default async function handler(req, res) {
  try {
    const db = getAdminDb();

    if (req.method === 'GET') {
      await requireAuthenticatedUser(req);
      let data = await readProcurement(db);
      const hasAnyData =
        Object.keys(data.quotesByTicket).length > 0 ||
        Object.keys(data.contractsByTicket).length > 0 ||
        Object.keys(data.paymentsByTicket).length > 0 ||
        Object.keys(data.measurementsByTicket).length > 0;

      if (!hasAnyData) {
        await seedProcurementDefaults(db);
        data = await readProcurement(db);
      }

      return sendJson(res, 200, { ok: true, ...data });
    }

    if (req.method === 'POST') {
      const user = await requireUserWithRoles(req, ['Admin', 'Diretor']);
      const actor = readActorFromHeaders(req) || user.email || user.name || 'painel';
      const body = await readJsonBody(req);
      const ticketId = String(body?.ticketId || '').trim();
      const type = String(body?.type || '').trim();
      const classification = body?.classification || null;

      if (!ticketId || !type) {
        return sendJson(res, 400, { ok: false, error: 'ticketId e type sao obrigatorios.' });
      }

      if (type === 'quotes') {
        const quotes = (Array.isArray(body?.quotes) ? body.quotes : []).map(quote => ({
          ...quote,
          classification: quote?.classification || classification || null,
        }));
        await writeQuotes(db, ticketId, quotes);
        await writeAuditLog({
          actor,
          action: 'procurement.quotes.save',
          entity: 'ticket',
          entityId: ticketId,
          after: { type, classification, quotes },
        });
        return sendJson(res, 200, { ok: true });
      }

      if (type === 'contract') {
        await writeContract(db, ticketId, body?.contract || {}, classification);
        await writeAuditLog({
          actor,
          action: 'procurement.contract.save',
          entity: 'ticket',
          entityId: ticketId,
          after: { type, classification, contract: body?.contract || {} },
        });
        return sendJson(res, 200, { ok: true });
      }

      if (type === 'payment') {
        await writePayment(db, ticketId, body?.payment || {}, classification);
        await writeAuditLog({
          actor,
          action: 'procurement.payment.save',
          entity: 'ticket',
          entityId: ticketId,
          after: { type, classification, payment: body?.payment || {} },
        });
        return sendJson(res, 200, { ok: true });
      }

      if (type === 'measurement') {
        await writeMeasurement(db, ticketId, body?.measurement || {}, classification);
        await writeAuditLog({
          actor,
          action: 'procurement.measurement.save',
          entity: 'ticket',
          entityId: ticketId,
          after: { type, classification, measurement: body?.measurement || {} },
        });
        return sendJson(res, 200, { ok: true });
      }

      if (type === 'seedDefaults') {
        await seedProcurementDefaults(db);
        const data = await readProcurement(db);
        return sendJson(res, 200, { ok: true, ...data });
      }

      return sendJson(res, 400, { ok: false, error: 'type invalido.' });
    }

    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { ok: false, error: 'Metodo nao permitido.' });
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha no procurement.' });
  }
}
