import { randomUUID } from 'node:crypto';
import { requireAuthenticatedUser, resolveActor } from './_lib/authz.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { HttpError, readJsonBody, sendError, sendJson } from './_lib/http.js';
import { readProcurement, readProcurementForTicketIds, seedProcurementDefaults } from './_lib/procurement.js';
import { canUserAccessTicket, readAccessibleTickets, readTerritoryCatalog } from './_lib/ticketAccess.js';
import { writeAuditLog } from './_lib/auditLogs.js';
import { assertProcurementMutationAllowed } from './_lib/procurementAccess.js';

// Converte para número finito ou null — evita gravar NaN no Firestore quando o
// cliente manda string não-numérica em campos numéricos.
function finiteOrNull(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Upsert que preserva o createdAt original de forma atômica (read+set em transação). */
async function upsertWithCreatedAt(db, ref, data, now, options = {}) {
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const existing = snap.data() || {};
    const currentStatus = String(existing.status || '');
    const isImmutable =
      snap.exists && Array.isArray(options.immutableStatuses) && options.immutableStatuses.includes(currentStatus);

    if (isImmutable && !Array.isArray(options.mutableWhenImmutable)) {
      throw new HttpError(409, options.immutableMessage || 'Este registro já recebeu uma decisão e não pode mais ser editado.');
    }

    if (isImmutable) {
      // Doc imutável (ex.: pagamento já 'paid'), mas alguns campos seguem editáveis
      // (anexo/recibo). Preserva TODO o resto do doc existente — sem isto, reenviar
      // o pagamento inteiro só pra anexar um arquivo reescrevia valor/status/etc de
      // um pagamento já quitado (o vetor de fraude financeira do caminho antigo).
      const patch = { updatedAt: data.updatedAt || now };
      for (const field of options.mutableWhenImmutable) {
        if (Object.prototype.hasOwnProperty.call(data, field)) patch[field] = data[field];
      }
      tx.set(ref, patch, { merge: true });
      return;
    }

    const createdAt = existing.createdAt || now;
    tx.set(ref, { ...data, createdAt }, { merge: true });
  });
}

async function writeQuotes(db, ticketId, quotes, submittedBy) {
  const now = new Date();
  const classification = quotes[0]?.classification || null;

  const quotesCol = db.collection('tickets').doc(ticketId).collection('quotes');
  const entries = quotes.map((quote, index) => {
    const id = String(quote.id || `quote-${index + 1}`);
    return { id, ref: quotesCol.doc(id), data: {
        id,
        ticketId,
        vendor: String(quote.vendor || '').trim(),
        value: String(quote.value || '').trim(),
        laborValue: quote.laborValue != null ? String(quote.laborValue).trim() : null,
        materialValue: quote.materialValue != null ? String(quote.materialValue).trim() : null,
        totalValue: quote.totalValue != null ? String(quote.totalValue).trim() : null,
        category: quote.category === 'additive' ? 'additive' : 'initial',
        additiveIndex: finiteOrNull(quote.additiveIndex),
        // Índice da rodada inicial: sem isso, recarregar colapsa as rodadas.
        initialRoundIndex: finiteOrNull(quote.initialRoundIndex),
        additiveReason: quote.additiveReason != null ? String(quote.additiveReason).trim() : null,
        recommended: Boolean(quote.recommended),
        status: 'pending',
        attachmentName: quote.attachmentName ? String(quote.attachmentName) : null,
        // Anexo da proposta (URL/caminho): sem isso, o PDF some ao recarregar.
        attachmentUrl: quote.attachmentPath
          ? null
          : quote.attachmentUrl ? String(quote.attachmentUrl).trim() : null,
        attachmentPath: quote.attachmentPath ? String(quote.attachmentPath).trim() : null,
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
              quantity: finiteOrNull(item.quantity),
              costUnitPrice: item.costUnitPrice ? String(item.costUnitPrice).trim() : null,
              totalPrice: item.totalPrice ? String(item.totalPrice).trim() : null,
            }))
          : [],
        classification: quote.classification || classification,
        submittedBy,
        submittedAt: now,
        updatedAt: now,
      } };
  });
  if (entries.length === 0) return;

  // A rodada inteira participa da mesma transação da leitura. Assim, uma
  // aprovação concorrente força retry e nunca volta uma cotação decidida para
  // "pending".
  await db.runTransaction(async tx => {
    const existing = await Promise.all(entries.map(entry => tx.get(entry.ref)));
    const existingById = new Map(
      existing.filter(snap => snap.exists).map(snap => [snap.id, snap.data() || {}])
    );

    for (const entry of entries) {
      const previous = existingById.get(String(entry.id)) || {};
      const hasDecision = previous.status === 'approved' || previous.status === 'rejected';
      if (hasDecision) continue;
      tx.set(entry.ref, {
        ...entry.data,
        createdAt: previous.createdAt || now,
      }, { merge: true });
    }
  });
}

async function writeContract(db, ticketId, contract, classification, submittedBy) {
  const now = new Date();
  // Id FIXO 'contract-1' (ignora contract.id do cliente): há UM contrato por OS e
  // todos os leitores usam .limit(1) ordenado por doc id. Aceitar id arbitrário
  // deixava o Gestor criar um contrato-SOMBRA ('a-contrato' < 'contract-1' vence a
  // ordenação) SEM passar pela imutabilidade do 'contract-1' aprovado — reabrindo a
  // inflação do baseline de medição que o fix do aditivo fechou.
  const id = 'contract-1';
  const contractRef = db.collection('tickets').doc(ticketId).collection('contracts').doc(id);
  await upsertWithCreatedAt(db, contractRef, {
      id,
      ticketId,
      vendor: String(contract.vendor || '').trim(),
      value: String(contract.value || '').trim(),
      initialPlannedValue: contract.initialPlannedValue != null ? String(contract.initialPlannedValue).trim() : null,
      realizedValue: contract.realizedValue != null ? String(contract.realizedValue).trim() : null,
      status: ['pending_signature', 'pending_upload', 'pending_approval'].includes(String(contract.status || ''))
        ? String(contract.status)
        : 'pending_upload',
      viewingBy: contract.viewingBy ? String(contract.viewingBy) : null,
      signedFileName: contract.signedFileName ? String(contract.signedFileName) : null,
      signedFileUrl: contract.signedFilePath
        ? null
        : contract.signedFileUrl ? String(contract.signedFileUrl) : null,
      signedFilePath: contract.signedFilePath ? String(contract.signedFilePath) : null,
      signedFileContentType: contract.signedFileContentType ? String(contract.signedFileContentType) : null,
      signedFileSize: finiteOrNull(contract.signedFileSize),
      items: Array.isArray(contract.items)
        ? contract.items.map(item => ({
            id: String(item.id || '').trim() || `item-${randomUUID()}`,
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
      submittedBy,
      submittedAt: now,
      updatedAt: now,
    }, now, {
      immutableStatuses: ['approved'],
      immutableMessage: 'O contrato já foi aprovado e não pode mais ser alterado.',
    });
}

async function writePayment(db, ticketId, payment, classification, submittedBy) {
  const now = new Date();
  const id = payment.id || 'payment-1';
  const paymentRef = db.collection('tickets').doc(ticketId).collection('payments').doc(id);
  await upsertWithCreatedAt(db, paymentRef, {
      id,
      ticketId,
      vendor: String(payment.vendor || '').trim(),
      value: String(payment.value || '').trim(),
      grossValue: payment.grossValue != null ? String(payment.grossValue).trim() : null,
      budgetSource: payment.budgetSource === 'additive' ? 'additive' : 'initial',
      taxValue: payment.taxValue != null ? String(payment.taxValue).trim() : null,
      netValue: payment.netValue != null ? String(payment.netValue).trim() : null,
      progressPercent: finiteOrNull(payment.progressPercent),
      expectedBaselineValue: payment.expectedBaselineValue != null ? String(payment.expectedBaselineValue).trim() : null,
      // 'paid' só é setado pelo comando settlePayment (transação + snapshot). Este
      // caminho legado não pode CRIAR um pagamento já quitado com valores forjados.
      status: String(payment.status) === 'paid' ? 'approved' : String(payment.status || 'pending'),
      label: payment.label ? String(payment.label) : null,
      installmentNumber: finiteOrNull(payment.installmentNumber),
      totalInstallments: finiteOrNull(payment.totalInstallments),
      dueAt: payment.dueAt ? new Date(payment.dueAt) : null,
      measurementId: payment.measurementId ? String(payment.measurementId) : null,
      releasedPercent: finiteOrNull(payment.releasedPercent),
      milestonePercent: finiteOrNull(payment.milestonePercent),
      receiptFileName: payment.receiptFileName ? String(payment.receiptFileName) : null,
      attachments: Array.isArray(payment.attachments)
        ? payment.attachments.map(item => ({
            id: String(item?.id || '').trim() || `payment-attachment-${randomUUID()}`,
            name: String(item?.name || '').trim() || 'Anexo',
            path: String(item?.path || '').trim() || '',
            url: item?.path ? '' : String(item?.url || '').trim() || '',
            contentType: item?.contentType ? String(item.contentType).trim() : null,
            size: finiteOrNull(item?.size),
            uploadedAt: item?.uploadedAt ? new Date(item.uploadedAt) : null,
            category: item?.category || 'attachment',
          }))
        : [],
      paidAt: payment.paidAt ? new Date(payment.paidAt) : null,
      classification: payment.classification || classification || null,
      submittedBy,
      submittedAt: now,
      updatedAt: now,
    }, now, {
      // Pagamento já 'paid' (quitado pelo settlePayment) é imutável nos financeiros —
      // reenviar o pagamento inteiro só atualiza anexo/recibo, nunca valor/status.
      // `paidAt` fica FORA da lista (só o settle o define, server-side) — senão o
      // Gestor retro-dataria a data de pagamento de um pagamento quitado.
      immutableStatuses: ['paid'],
      mutableWhenImmutable: ['attachments', 'receiptFileName'],
      immutableMessage: 'Pagamento já quitado — apenas anexos podem ser atualizados.',
    });
}

async function writeMeasurement(db, ticketId, measurement, classification, submittedBy) {
  const now = new Date();
  const id = measurement.id || `measurement-${randomUUID()}`;
  const measurementRef = db.collection('tickets').doc(ticketId).collection('measurements').doc(id);
  await upsertWithCreatedAt(db, measurementRef, {
      id,
      ticketId,
      label: String(measurement.label || 'Medição').trim(),
      progressPercent: finiteOrNull(measurement.progressPercent) ?? 0,
      releasePercent: finiteOrNull(measurement.releasePercent) ?? 0,
      grossValue: measurement.grossValue != null ? String(measurement.grossValue).trim() : null,
      budgetSource: measurement.budgetSource === 'additive' ? 'additive' : 'initial',
      status: String(measurement.status || 'approved'),
      notes: measurement.notes ? String(measurement.notes) : '',
      attachments: Array.isArray(measurement.attachments)
        ? measurement.attachments.map(item => ({
            id: String(item?.id || '').trim() || `measurement-attachment-${randomUUID()}`,
            name: String(item?.name || '').trim() || 'Anexo',
            path: String(item?.path || '').trim() || '',
            url: item?.path ? '' : String(item?.url || '').trim() || '',
            contentType: item?.contentType ? String(item.contentType).trim() : null,
            size: finiteOrNull(item?.size),
            uploadedAt: item?.uploadedAt ? new Date(item.uploadedAt) : null,
            category: item?.category || 'attachment',
          }))
        : [],
      requestedAt: measurement.requestedAt ? new Date(measurement.requestedAt) : now,
      approvedAt: measurement.approvedAt ? new Date(measurement.approvedAt) : null,
      classification: measurement.classification || classification || null,
      submittedBy,
      submittedAt: now,
      updatedAt: now,
    }, now, {
      // Medição já registrada ('approved') é imutável no valor/percentual (é uma
      // leitura pontual da obra) — a CRIAÇÃO segue livre (doc inexistente); só a
      // reescrita fica restrita a anexos/notas, fechando a adulteração do baseline.
      immutableStatuses: ['approved'],
      mutableWhenImmutable: ['attachments', 'notes'],
      immutableMessage: 'Medição já registrada — apenas anexos podem ser atualizados.',
    });
}

export default async function handler(req, res) {
  try {
    const db = getAdminDb();

    if (req.method === 'GET') {
      const user = await requireAuthenticatedUser(req);
      const data =
        user.role === 'Admin'
          ? await readProcurement(db)
          : await readProcurementForTicketIds(
              db,
              (await readAccessibleTickets(db, user)).map(ticket => ticket.id)
            );

      return sendJson(res, 200, { ok: true, ...data });
    }

    if (req.method === 'POST') {
      const user = await requireAuthenticatedUser(req);
      const actor = resolveActor(user);
      const submitter = {
        id: user.id || null,
        name: user.name || user.email || actor,
        email: user.email || null,
        role: user.role || null,
      };
      const body = await readJsonBody(req);
      const ticketId = String(body?.ticketId || '').trim();
      const type = String(body?.type || '').trim();
      const classification = body?.classification || null;

      if (!type) {
        return sendJson(res, 400, { ok: false, error: 'ticketId e type são obrigatórios.' });
      }
      assertProcurementMutationAllowed(user.role, type);
      if (type !== 'seedDefaults' && !ticketId) {
        return sendJson(res, 400, { ok: false, error: 'ticketId e type são obrigatórios.' });
      }

      // Garante que o ator pode acessar a OS-alvo antes de gravar dados de compras.
      if (type !== 'seedDefaults') {
        const ticketSnap = await db.collection('tickets').doc(ticketId).get();
        if (!ticketSnap.exists) {
          return sendJson(res, 404, { ok: false, error: 'OS não encontrada.' });
        }
        if (user.role !== 'Admin') {
          const territory = await readTerritoryCatalog(db);
          const targetTicket = { id: ticketSnap.id, ...ticketSnap.data() };
          if (!canUserAccessTicket(user, targetTicket, territory.regions, territory.sites)) {
            return sendJson(res, 403, { ok: false, error: 'Permissão insuficiente para esta OS.' });
          }
        }
      }

      if (type === 'quotes') {
        const quotes = (Array.isArray(body?.quotes) ? body.quotes : []).map(quote => ({
          ...quote,
          classification: quote?.classification || classification || null,
        }));
        // Cada RODADA de aditivo (additiveIndex) admite no máx. 1 cotação — mas
        // várias rodadas de aditivo coexistem no mesmo payload (o ApprovalsView
        // reenvia TODAS as cotações da OS). Contar aditivos globalmente travava com
        // 400 a aprovação/reprovação do 2º aditivo em diante, depois que os ids
        // passaram a ser únicos por rodada (antes o 2º sobrescrevia o 1º e escondia isso).
        const additiveCountByRound = new Map();
        for (const quote of quotes) {
          if (quote?.category !== 'additive') continue;
          const roundIndex = Number(quote?.additiveIndex || 1);
          additiveCountByRound.set(roundIndex, (additiveCountByRound.get(roundIndex) || 0) + 1);
        }
        if ([...additiveCountByRound.values()].some(count => count > 1)) {
          return sendJson(res, 400, { ok: false, error: 'Cada rodada de aditivo deve conter somente 1 cotação.' });
        }
        await writeQuotes(db, ticketId, quotes, submitter);
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
        await writeContract(db, ticketId, body?.contract || {}, classification, submitter);
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
        await writePayment(db, ticketId, body?.payment || {}, classification, submitter);
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
        await writeMeasurement(db, ticketId, body?.measurement || {}, classification, submitter);
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
