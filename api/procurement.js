import { getAdminDb } from './_lib/firebaseAdmin.js';
import { readJsonBody, sendJson } from './_lib/http.js';
import { readProcurement, seedProcurementDefaults } from './_lib/procurement.js';

async function writeQuotes(db, ticketId, quotes) {
  const batch = db.batch();
  const now = new Date();

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
        updatedAt: now,
        createdAt: now,
      },
      { merge: true }
    );
  }

  await batch.commit();
}

async function writeContract(db, ticketId, contract) {
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
      updatedAt: now,
      createdAt: now,
    },
    { merge: true }
  );
}

async function writePayment(db, ticketId, payment) {
  const now = new Date();
  const id = payment.id || 'payment-1';
  await db.collection('tickets').doc(ticketId).collection('payments').doc(id).set(
    {
      id,
      ticketId,
      vendor: String(payment.vendor || '').trim(),
      value: String(payment.value || '').trim(),
      status: String(payment.status || 'pending'),
      receiptFileName: payment.receiptFileName ? String(payment.receiptFileName) : null,
      paidAt: payment.paidAt ? new Date(payment.paidAt) : null,
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
      let data = await readProcurement(db);
      const hasAnyData =
        Object.keys(data.quotesByTicket).length > 0 ||
        Object.keys(data.contractsByTicket).length > 0 ||
        Object.keys(data.paymentsByTicket).length > 0;

      if (!hasAnyData) {
        await seedProcurementDefaults(db);
        data = await readProcurement(db);
      }

      return sendJson(res, 200, { ok: true, ...data });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const ticketId = String(body?.ticketId || '').trim();
      const type = String(body?.type || '').trim();

      if (!ticketId || !type) {
        return sendJson(res, 400, { ok: false, error: 'ticketId e type sao obrigatorios.' });
      }

      if (type === 'quotes') {
        await writeQuotes(db, ticketId, Array.isArray(body?.quotes) ? body.quotes : []);
        return sendJson(res, 200, { ok: true });
      }

      if (type === 'contract') {
        await writeContract(db, ticketId, body?.contract || {});
        return sendJson(res, 200, { ok: true });
      }

      if (type === 'payment') {
        await writePayment(db, ticketId, body?.payment || {});
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
