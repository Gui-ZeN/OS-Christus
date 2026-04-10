import { randomUUID } from 'node:crypto';
import { requireAuthenticatedUser, requireUserWithRoles } from './_lib/authz.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { HttpError, readJsonBody, sendError, sendJson } from './_lib/http.js';
import { readProcurement, readProcurementForTicketIds, seedProcurementDefaults } from './_lib/procurement.js';
import { readAccessibleTickets } from './_lib/ticketAccess.js';
import { writeAuditLog } from './_lib/auditLogs.js';

const REVIEW_LOCK_WINDOW_MS = 20 * 60 * 1000;

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function parseCurrency(value) {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function isReviewActive(review) {
  if (!review?.at) return false;
  const reviewedAt = new Date(review.at);
  if (Number.isNaN(reviewedAt.getTime())) return false;
  return reviewedAt.getTime() + REVIEW_LOCK_WINDOW_MS > Date.now();
}

async function ensureBudgetReviewLock(db, ticketId, reviewerName) {
  const ticketSnap = await db.collection('tickets').doc(ticketId).get();
  if (!ticketSnap.exists) {
    throw new HttpError(404, 'Ticket não encontrado para revisão de orçamento.');
  }

  const review = ticketSnap.data()?.viewingBy || null;
  if (review && isReviewActive(review) && normalizeKey(review.name) !== normalizeKey(reviewerName)) {
    throw new HttpError(409, `${review.name} já está revisando este orçamento.`);
  }

  await ticketSnap.ref.set(
    {
      viewingBy: {
        name: reviewerName,
        at: new Date(),
      },
      updatedAt: new Date(),
    },
    { merge: true }
  );
}

function getItemUnitPrice(item) {
  const explicit = parseCurrency(item?.unitPrice);
  if (explicit !== null) return explicit;

  const quantity = item?.quantity != null ? Number(item.quantity) : null;
  const total = parseCurrency(item?.totalPrice);
  if (quantity && quantity > 0 && total !== null) {
    return total / quantity;
  }
  return null;
}

function buildPreferenceEvents(ticketId, approvedQuote, classification) {
  const vendor = String(approvedQuote?.vendor || '').trim();
  if (!vendor) return [];

  const approvedValue = parseCurrency(approvedQuote?.value);
  const serviceCatalogId = classification?.serviceCatalogId ? String(classification.serviceCatalogId).trim() : '';
  const serviceCatalogName = classification?.serviceCatalogName ? String(classification.serviceCatalogName).trim() : '';
  const macroServiceId = classification?.macroServiceId ? String(classification.macroServiceId).trim() : '';
  const macroServiceName = classification?.macroServiceName ? String(classification.macroServiceName).trim() : '';
  const vendorSlug = slugify(vendor) || 'fornecedor';

  const events = [];
  if (serviceCatalogId || macroServiceId) {
    const scopeType = serviceCatalogId ? 'service' : 'macroService';
    const scopeId = serviceCatalogId || macroServiceId;
    const scopeName = serviceCatalogName || macroServiceName || scopeId;
    events.push({
      id: `${scopeType}__${scopeId}__${ticketId}`,
      ticketId,
      scopeType,
      scopeId,
      scopeName,
      vendor,
      vendorSlug,
      serviceCatalogId: serviceCatalogId || null,
      serviceCatalogName: serviceCatalogName || null,
      macroServiceId: macroServiceId || null,
      macroServiceName: macroServiceName || null,
      materialId: null,
      materialName: null,
      unit: null,
      approvedValue,
      unitPrice: null,
      regionId: classification?.regionId || null,
      regionName: classification?.regionName || null,
      siteId: classification?.siteId || null,
      siteName: classification?.siteName || null,
      sector: classification?.sector || null,
    });
  }

  for (const item of Array.isArray(approvedQuote?.items) ? approvedQuote.items : []) {
    const materialKey = String(item?.materialId || item?.materialName || item?.description || '').trim();
    if (!materialKey) continue;
    const normalizedMaterialKey = slugify(materialKey);
    if (!normalizedMaterialKey) continue;

    events.push({
      id: `material__${normalizedMaterialKey}__${ticketId}`,
      ticketId,
      scopeType: 'material',
      scopeId: normalizedMaterialKey,
      scopeName: String(item?.materialName || item?.description || materialKey).trim(),
      vendor,
      vendorSlug,
      serviceCatalogId: serviceCatalogId || null,
      serviceCatalogName: serviceCatalogName || null,
      macroServiceId: macroServiceId || null,
      macroServiceName: macroServiceName || null,
      materialId: item?.materialId ? String(item.materialId).trim() : null,
      materialName: item?.materialName ? String(item.materialName).trim() : String(item?.description || '').trim() || null,
      unit: item?.unit ? String(item.unit).trim() : null,
      approvedValue,
      unitPrice: getItemUnitPrice(item),
      regionId: classification?.regionId || null,
      regionName: classification?.regionName || null,
      siteId: classification?.siteId || null,
      siteName: classification?.siteName || null,
      sector: classification?.sector || null,
    });
  }

  return events;
}

async function syncVendorPreferenceEvents(db, ticketId, approvedQuote, classification) {
  const events = buildPreferenceEvents(ticketId, approvedQuote, classification);
  const existingSnap = await db.collection('vendorPreferenceEvents').where('ticketId', '==', ticketId).get();
  const desiredIds = new Set(events.map(event => event.id));
  const now = new Date();
  const batch = db.batch();

  existingSnap.docs.forEach(doc => {
    if (!desiredIds.has(doc.id)) {
      batch.delete(doc.ref);
    }
  });

  events.forEach(event => {
    batch.set(
      db.collection('vendorPreferenceEvents').doc(event.id),
      {
        ...event,
        approvedAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  });

  await batch.commit();
}

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
        laborValue: quote.laborValue != null ? String(quote.laborValue).trim() : null,
        materialValue: quote.materialValue != null ? String(quote.materialValue).trim() : null,
        totalValue: quote.totalValue != null ? String(quote.totalValue).trim() : null,
        category: quote.category === 'additive' ? 'additive' : 'initial',
        additiveIndex: quote.additiveIndex != null ? Number(quote.additiveIndex) : null,
        additiveReason: quote.additiveReason != null ? String(quote.additiveReason).trim() : null,
        recommended: Boolean(quote.recommended),
        status: String(quote.status || 'pending'),
        attachmentName: quote.attachmentName ? String(quote.attachmentName) : null,
        proposalHeader: quote.proposalHeader
          ? {
              unitName: quote.proposalHeader.unitName ? String(quote.proposalHeader.unitName).trim() : null,
              location: quote.proposalHeader.location ? String(quote.proposalHeader.location).trim() : null,
              folderLink: quote.proposalHeader.folderLink ? String(quote.proposalHeader.folderLink).trim() : null,
              contractedVendor: quote.proposalHeader.contractedVendor ? String(quote.proposalHeader.contractedVendor).trim() : null,
              totalQuantity: quote.proposalHeader.totalQuantity ? String(quote.proposalHeader.totalQuantity).trim() : null,
              totalEstimatedValue: quote.proposalHeader.totalEstimatedValue ? String(quote.proposalHeader.totalEstimatedValue).trim() : null,
            }
          : null,
        items: Array.isArray(quote.items)
          ? quote.items.map(item => ({
              id: String(item.id || '').trim() || randomUUID(),
              section: item.section ? String(item.section).trim() : null,
              description: String(item.description || '').trim(),
              materialId: item.materialId ? String(item.materialId).trim() : null,
              materialName: item.materialName ? String(item.materialName).trim() : null,
              unit: item.unit ? String(item.unit).trim() : null,
              quantity: item.quantity != null ? Number(item.quantity) : null,
              costUnitPrice: item.costUnitPrice ? String(item.costUnitPrice).trim() : null,
              totalPrice: item.totalPrice ? String(item.totalPrice).trim() : null,
            }))
          : [],
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
      signedFileUrl: contract.signedFileUrl ? String(contract.signedFileUrl) : null,
      signedFilePath: contract.signedFilePath ? String(contract.signedFilePath) : null,
      signedFileContentType: contract.signedFileContentType ? String(contract.signedFileContentType) : null,
      signedFileSize: contract.signedFileSize != null ? Number(contract.signedFileSize) : null,
      items: Array.isArray(contract.items)
        ? contract.items.map(item => ({
            id: String(item.id || '').trim() || `item-${Date.now()}`,
            description: String(item.description || '').trim(),
            materialId: item.materialId ? String(item.materialId).trim() : null,
            materialName: item.materialName ? String(item.materialName).trim() : null,
            unit: item.unit ? String(item.unit).trim() : null,
            quantity: item.quantity != null ? Number(item.quantity) : null,
            costUnitPrice: item.costUnitPrice ? String(item.costUnitPrice).trim() : null,
            totalPrice: item.totalPrice ? String(item.totalPrice).trim() : null,
          }))
        : [],
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
      grossValue: payment.grossValue != null ? String(payment.grossValue).trim() : null,
      budgetSource: payment.budgetSource === 'additive' ? 'additive' : 'initial',
      taxValue: payment.taxValue != null ? String(payment.taxValue).trim() : null,
      netValue: payment.netValue != null ? String(payment.netValue).trim() : null,
      progressPercent: payment.progressPercent != null ? Number(payment.progressPercent) : null,
      expectedBaselineValue: payment.expectedBaselineValue != null ? String(payment.expectedBaselineValue).trim() : null,
      status: String(payment.status || 'pending'),
      label: payment.label ? String(payment.label) : null,
      installmentNumber: payment.installmentNumber ? Number(payment.installmentNumber) : null,
      totalInstallments: payment.totalInstallments ? Number(payment.totalInstallments) : null,
      dueAt: payment.dueAt ? new Date(payment.dueAt) : null,
      measurementId: payment.measurementId ? String(payment.measurementId) : null,
      releasedPercent: payment.releasedPercent != null ? Number(payment.releasedPercent) : null,
      milestonePercent: payment.milestonePercent != null ? Number(payment.milestonePercent) : null,
      receiptFileName: payment.receiptFileName ? String(payment.receiptFileName) : null,
      attachments: Array.isArray(payment.attachments)
        ? payment.attachments.map(item => ({
            id: String(item?.id || '').trim() || `payment-attachment-${Date.now()}`,
            name: String(item?.name || '').trim() || 'Anexo',
            path: String(item?.path || '').trim() || '',
            url: String(item?.url || '').trim() || '',
            contentType: item?.contentType ? String(item.contentType).trim() : null,
            size: item?.size != null ? Number(item.size) : null,
            uploadedAt: item?.uploadedAt ? new Date(item.uploadedAt) : null,
            category: item?.category || 'attachment',
          }))
        : [],
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
      grossValue: measurement.grossValue != null ? String(measurement.grossValue).trim() : null,
      budgetSource: measurement.budgetSource === 'additive' ? 'additive' : 'initial',
      status: String(measurement.status || 'approved'),
      notes: measurement.notes ? String(measurement.notes) : '',
      attachments: Array.isArray(measurement.attachments)
        ? measurement.attachments.map(item => ({
            id: String(item?.id || '').trim() || `measurement-attachment-${Date.now()}`,
            name: String(item?.name || '').trim() || 'Anexo',
            path: String(item?.path || '').trim() || '',
            url: String(item?.url || '').trim() || '',
            contentType: item?.contentType ? String(item.contentType).trim() : null,
            size: item?.size != null ? Number(item.size) : null,
            uploadedAt: item?.uploadedAt ? new Date(item.uploadedAt) : null,
            category: item?.category || 'attachment',
          }))
        : [],
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
      const user = await requireAuthenticatedUser(req);
      const data =
        user.role === 'Admin' || user.role === 'Diretor'
          ? await readProcurement(db)
          : await readProcurementForTicketIds(
              db,
              (await readAccessibleTickets(db, user)).map(ticket => ticket.id)
            );

      return sendJson(res, 200, { ok: true, ...data });
    }

    if (req.method === 'POST') {
      const user = await requireUserWithRoles(req, ['Admin', 'Diretor']);
      const actor = user.name || user.email || 'painel';
      const body = await readJsonBody(req);
      const ticketId = String(body?.ticketId || '').trim();
      const type = String(body?.type || '').trim();
      const classification = body?.classification || null;

      if (!ticketId || !type) {
        return sendJson(res, 400, { ok: false, error: 'ticketId e type são obrigatórios.' });
      }

      if (type === 'quotes') {
        await ensureBudgetReviewLock(db, ticketId, user.name || actor);
        const quotes = (Array.isArray(body?.quotes) ? body.quotes : []).map(quote => ({
          ...quote,
          classification: quote?.classification || classification || null,
        }));
        const additiveQuotes = quotes.filter(quote => (quote?.category === 'additive'));
        if (additiveQuotes.length > 1) {
          return sendJson(res, 400, { ok: false, error: 'Aditivo deve conter somente 1 cotação.' });
        }
        await writeQuotes(db, ticketId, quotes);
        const approvedQuote = quotes.find(quote => String(quote?.status || '').trim() === 'approved');
        if (approvedQuote) {
          await syncVendorPreferenceEvents(db, ticketId, approvedQuote, approvedQuote.classification || classification || null);
        }
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

      return sendJson(res, 400, { ok: false, error: 'type inválido.' });
    }

    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (error) {
    return sendError(res, error, 'Falha no procurement.');
  }
}

