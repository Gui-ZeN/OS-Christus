import { toDateOrNull } from './dates.js';
import { randomUUID } from 'node:crypto';
import { HttpError } from './http.js';

import { boundEmbeddedHistory, mergeTicketHistory, writeTicketHistoryEntries } from './tickets.js';
import { TICKET_STATUS } from './statusFlow.js';

/**
 * Chave de idempotência dos comandos financeiros.
 *
 * Morava em `approvalCommands.js`, que saiu junto com a etapa de aprovação da
 * diretoria. É o que faz o retry de uma falha de rede virar REPLAY em vez de um
 * segundo lançamento — não podia sair junto.
 */
const COMMAND_KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

export function normalizeIdempotencyKey(value) {
  const key = String(value || '').trim();
  if (!COMMAND_KEY_PATTERN.test(key)) {
    throw new HttpError(400, 'idempotencyKey inválida.');
  }
  return key;
}

function parseCurrency(value) {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function finiteNumber(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeAttachment(item, fallbackCategory = 'attachment') {
  const path = String(item?.path || '').trim();
  return {
    id: String(item?.id || '').trim() || `attachment-${randomUUID()}`,
    name: String(item?.name || '').trim() || 'Anexo',
    path,
    url: path ? '' : String(item?.url || '').trim(),
    contentType: item?.contentType ? String(item.contentType).trim() : null,
    size: finiteNumber(item?.size),
    uploadedAt: toDateOrNull(item?.uploadedAt),
    category: String(item?.category || fallbackCategory),
  };
}

function actorSnapshot(user) {
  return {
    id: user?.id || null,
    name: user?.name || user?.email || 'Financeiro',
    email: user?.email || null,
    role: user?.role || null,
  };
}

function actorLabel(user) {
  const base = String(user?.name || user?.email || 'Financeiro').trim();
  return user?.role ? `${base} (${user.role})` : base;
}

export function normalizeFinanceRecipients(values) {
  const input = Array.isArray(values) ? values : [];
  const emails = [];
  const seen = new Set();
  for (const value of input) {
    const email = String(value || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email)) continue;
    seen.add(email);
    emails.push(email);
  }
  if (emails.length === 0) {
    throw new HttpError(400, 'Adicione pelo menos um destinatário válido.');
  }
  if (emails.length > 50) {
    throw new HttpError(400, 'O envio financeiro aceita no máximo 50 destinatários.');
  }
  return emails;
}

export function calculateMeasurementProgress({
  baselineValue,
  currentPercent,
  measuredGross,
  newGross,
}) {
  const baseline = Number(baselineValue || 0);
  const current = Number(currentPercent || 0);
  const exactGross = Number(measuredGross || 0);
  const addedGross = Number(newGross || 0);
  if (baseline <= 0 || addedGross <= 0) {
    throw new HttpError(400, 'Valores inválidos para calcular o andamento.');
  }
  const reconstructedGross = (baseline * current) / 100;
  const accumulatedGross = Math.max(exactGross, reconstructedGross) + addedGross;
  const progressPercent = Number(((accumulatedGross / baseline) * 100).toFixed(2));
  const releasePercent = Math.max(0, Number((progressPercent - current).toFixed(2)));
  return { accumulatedGross, progressPercent, releasePercent };
}

function isLegacyMilestonePlaceholder(payment) {
  const hasGross = parseCurrency(payment?.grossValue || '') > 0;
  const hasValue = parseCurrency(payment?.value || '') > 0;
  const hasTax = parseCurrency(payment?.taxValue || '') > 0;
  const hasNet = parseCurrency(payment?.netValue || '') > 0;
  const hasMeasurementLink = Boolean(payment?.measurementId);
  const hasAttachments = Array.isArray(payment?.attachments) && payment.attachments.length > 0;
  const hasReceipt = Boolean(payment?.receiptFileName);
  const isUnpaidStatus = payment?.status === 'pending' || payment?.status === 'approved';
  return (
    isUnpaidStatus &&
    !hasGross &&
    !hasValue &&
    !hasTax &&
    !hasNet &&
    !hasMeasurementLink &&
    !hasAttachments &&
    !hasReceipt
  );
}

export function resolveLegacyMeasurementPayment({
  paymentId,
  fallback,
  payments,
  measurements,
}) {
  const measurementId = String(fallback?.measurementId || '').trim();
  const measurement = (Array.isArray(measurements) ? measurements : [])
    .find(item => String(item?.id || '').trim() === measurementId);
  if (!measurement) {
    throw new HttpError(404, 'Lançamento financeiro não encontrado.');
  }

  const expectedPaymentId = `measurement-payment-${measurementId}`;
  if (paymentId !== expectedPaymentId) {
    throw new HttpError(409, 'Identificador inválido para o lançamento legado.');
  }

  const duplicate = (Array.isArray(payments) ? payments : [])
    .find(item => String(item?.measurementId || '').trim() === measurementId);
  if (duplicate) {
    throw new HttpError(409, 'Esta medição já possui um lançamento financeiro.');
  }

  const grossValue = String(measurement.grossValue || '').trim();
  const status = String(measurement.status || 'pending').trim();
  const createdAt =
    toDateOrNull(measurement.requestedAt) ||
    toDateOrNull(measurement.approvedAt) ||
    toDateOrNull(measurement.createdAt) ||
    new Date();

  return {
    id: expectedPaymentId,
    ticketId: String(measurement.ticketId || fallback?.ticketId || '').trim() || null,
    vendor: String(fallback?.vendor || '').trim() || 'Fornecedor não definido',
    value: grossValue,
    grossValue,
    taxValue: '',
    netValue: grossValue,
    progressPercent: finiteNumber(measurement.progressPercent),
    expectedBaselineValue: null,
    status,
    label: String(fallback?.label || measurement.label || '').trim() || 'Lançamento legado',
    installmentNumber: finiteNumber(fallback?.installmentNumber),
    totalInstallments: finiteNumber(fallback?.totalInstallments),
    dueAt: toDateOrNull(fallback?.dueAt) || createdAt,
    measurementId,
    releasedPercent: finiteNumber(measurement.releasePercent),
    milestonePercent: finiteNumber(measurement.progressPercent),
    attachments: Array.isArray(measurement.attachments)
      ? measurement.attachments.map(item => normalizeAttachment(item))
      : [],
    receiptFileName: null,
    submittedBy: measurement.submittedBy || null,
    submittedAt: toDateOrNull(measurement.submittedAt) || createdAt,
    createdAt,
    updatedAt: toDateOrNull(measurement.updatedAt) || createdAt,
  };
}

export function assertUniquePaymentMeasurement(payments, currentPayment) {
  const measurementId = String(currentPayment?.measurementId || '').trim();
  if (!measurementId) return;
  const duplicate = (Array.isArray(payments) ? payments : []).find(item =>
    String(item?.id || '').trim() !== String(currentPayment?.id || '').trim() &&
    String(item?.measurementId || '').trim() === measurementId
  );
  if (duplicate) {
    throw new HttpError(
      409,
      'Há mais de um lançamento vinculado a esta medição. Regularize os dados antes de pagar.'
    );
  }
}

function mergeClosureChecklist(ticket, patch = {}) {
  const current = ticket?.closureChecklist || {};
  return {
    requesterApproved: current.requesterApproved ?? false,
    requesterApprovedBy: current.requesterApprovedBy || null,
    requesterApprovedAt: toDateOrNull(current.requesterApprovedAt),
    infrastructureApprovalPrimary:
      current.infrastructureApprovalPrimary ?? current.infrastructureApprovedByRafael ?? false,
    infrastructureApprovalSecondary:
      current.infrastructureApprovalSecondary ?? current.infrastructureApprovedByFernando ?? false,
    infrastructureApprovedByRafael: current.infrastructureApprovedByRafael ?? null,
    infrastructureApprovedByFernando: current.infrastructureApprovedByFernando ?? null,
    closureNotes: String(current.closureNotes || ''),
    serviceStartedAt:
      toDateOrNull(current.serviceStartedAt) ||
      toDateOrNull(ticket?.executionProgress?.startedAt) ||
      toDateOrNull(ticket?.preliminaryActions?.actualStartAt) ||
      toDateOrNull(ticket?.preliminaryActions?.plannedStartAt),
    serviceCompletedAt: toDateOrNull(current.serviceCompletedAt),
    closedAt: toDateOrNull(current.closedAt),
    documents: Array.isArray(current.documents)
      ? current.documents.map(item => normalizeAttachment(item, 'closure_report'))
      : [],
    ...patch,
  };
}

function addMonths(date, months) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function resolvePaymentClosure(ticket, allPaid, closureDraft, now = new Date()) {
  const inFinalFinancialStage =
    ticket?.status === TICKET_STATUS.WAITING_PAYMENT ||
    ticket?.status === TICKET_STATUS.CLOSED;
  if (!allPaid || !inFinalFinancialStage) {
    return {
      canClose: false,
      nextStatus: inFinalFinancialStage ? TICKET_STATUS.WAITING_PAYMENT : ticket?.status,
      closureChecklist: ticket?.closureChecklist || null,
      guarantee: ticket?.guarantee || null,
    };
  }

  const guaranteeMonths = Number(closureDraft?.guaranteeMonths || 0);
  const serviceStartedAt = toDateOrNull(closureDraft?.serviceStartedAt);
  const serviceCompletedAt = toDateOrNull(closureDraft?.serviceCompletedAt);
  const reasons = [];
  if (!closureDraft?.infrastructureApprovalPrimary) reasons.push('Aprovação técnica 1 pendente');
  if (!closureDraft?.infrastructureApprovalSecondary) reasons.push('Aprovação técnica 2 pendente');
  if (!serviceStartedAt) reasons.push('Início do serviço não informado');
  if (!serviceCompletedAt) reasons.push('Término do serviço não informado');
  if (!Number.isFinite(guaranteeMonths) || guaranteeMonths <= 0) reasons.push('Garantia inválida');
  if (reasons.length > 0) {
    throw new HttpError(409, `Último lançamento bloqueado. ${reasons.join(' | ')}`);
  }

  const guaranteeEndAt = addMonths(serviceCompletedAt, guaranteeMonths);
  return {
    canClose: true,
    nextStatus: TICKET_STATUS.CLOSED,
    closureChecklist: mergeClosureChecklist(ticket, {
      infrastructureApprovalPrimary: true,
      infrastructureApprovalSecondary: true,
      closureNotes: String(closureDraft?.closureNotes || '').trim(),
      serviceStartedAt,
      serviceCompletedAt,
      closedAt: now,
    }),
    guarantee: {
      startAt: serviceCompletedAt,
      endAt: guaranteeEndAt,
      months: guaranteeMonths,
      status: guaranteeEndAt.getTime() < now.getTime() ? 'expired' : 'active',
    },
  };
}

function createHistoryEntry(user, text, now) {
  return {
    id: `finance-${randomUUID()}`,
    type: 'system',
    sender: actorLabel(user),
    time: now,
    text,
    visibility: 'internal',
  };
}

function writeCommandRecords(tx, db, ticketRef, commandKey, snapshot, result, now) {
  tx.create(ticketRef.collection('financeCommands').doc(commandKey), {
    action: snapshot.action,
    result,
    actor: snapshot.actor,
    createdAt: now,
  });
  tx.create(ticketRef.collection('financeSnapshots').doc(commandKey), snapshot);
  tx.create(db.collection('auditLogs').doc(), {
    actor: snapshot.actor?.name || 'Financeiro',
    action: `finance.${snapshot.action}`,
    entity: 'ticket',
    entityId: snapshot.ticketId,
    before: null,
    after: snapshot,
    metadata: { commandKey },
    createdAt: now,
  });
}

async function recordMeasurement({ db, user, ticketId, commandKey, body }) {
  const ticketRef = db.collection('tickets').doc(ticketId);
  const commandRef = ticketRef.collection('financeCommands').doc(commandKey);
  const paymentId = String(body?.payment?.id || '').trim();
  const measurementId = String(body?.measurement?.id || '').trim();
  if (!paymentId || !measurementId) {
    throw new HttpError(400, 'Pagamento e medição precisam de identificadores.');
  }
  const paymentRef = ticketRef.collection('payments').doc(paymentId);
  const measurementRef = ticketRef.collection('measurements').doc(measurementId);
  const paymentsQuery = ticketRef.collection('payments');
  const measurementsQuery = ticketRef.collection('measurements');
  const contractsQuery = ticketRef.collection('contracts').limit(1);
  // Contrato canônico: o `.limit(1)` sem orderBy resolve por ID, então um doc com id
  // menor venceria o real (vetor de "contrato sombra" que inflaria o baseline da
  // medição). Preferimos 'contract-1'; o limit(1) fica como compat legado.
  const canonicalContractRef = ticketRef.collection('contracts').doc('contract-1');

  return db.runTransaction(async tx => {
    const [
      commandSnap,
      ticketSnap,
      paymentSnap,
      measurementSnap,
      paymentsSnap,
      measurementsSnap,
      contractsSnap,
      canonicalContractSnap,
    ] = await Promise.all([
      tx.get(commandRef),
      tx.get(ticketRef),
      tx.get(paymentRef),
      tx.get(measurementRef),
      tx.get(paymentsQuery),
      tx.get(measurementsQuery),
      tx.get(contractsQuery),
      tx.get(canonicalContractRef),
    ]);
    if (commandSnap.exists) return { ...commandSnap.data()?.result, replayed: true };
    if (!ticketSnap.exists) throw new HttpError(404, 'OS não encontrada.');
    if (paymentSnap.exists || measurementSnap.exists) {
      throw new HttpError(409, 'Este lançamento ou medição já foi registrado.');
    }

    const ticket = ticketSnap.data() || {};
    if (!ticket.executionProgress?.paymentFlowParts) {
      throw new HttpError(409, 'Defina o fluxo de pagamento antes de registrar o andamento.');
    }
    const currentPercent = Number(ticket.executionProgress?.currentPercent || 0);
    const grossAmount = parseCurrency(body?.measurement?.grossValue || body?.payment?.grossValue);
    if (grossAmount <= 0) throw new HttpError(400, 'Informe um valor bruto válido.');
    const contract = (canonicalContractSnap.exists ? canonicalContractSnap.data() : contractsSnap.docs[0]?.data()) || {};
    const existingPayments = paymentsSnap.docs.map(doc => doc.data() || {});
    const existingMeasurements = measurementsSnap.docs.map(doc => doc.data() || {});
    const baselineValue =
      parseCurrency(contract.initialPlannedValue) ||
      parseCurrency(existingPayments[0]?.expectedBaselineValue) ||
      parseCurrency(contract.value) ||
      parseCurrency(existingPayments[0]?.value);
    if (baselineValue <= 0) {
      throw new HttpError(409, 'Valor previsto da obra não encontrado para calcular o andamento.');
    }
    const measuredGross = existingMeasurements.reduce(
      (sum, item) => sum + parseCurrency(item?.grossValue),
      0
    );
    const {
      accumulatedGross,
      progressPercent,
      releasePercent,
    } = calculateMeasurementProgress({
      baselineValue,
      currentPercent,
      measuredGross,
      newGross: grossAmount,
    });

    const now = new Date();
    const submitter = actorSnapshot(user);
    const formattedGross = formatCurrency(grossAmount);
    const classification = body?.classification || null;
    const installmentNumber =
      existingPayments.filter(item => !isLegacyMilestonePlaceholder(item)).length + 1;
    const paymentLabel = `Lançamento ${installmentNumber}`;
    const attachments = Array.isArray(body?.measurement?.attachments)
      ? body.measurement.attachments.map(item => normalizeAttachment(item, 'closure_report'))
      : [];
    const payment = {
      id: paymentId,
      ticketId,
      vendor: String(body?.payment?.vendor || '').trim() || 'Fornecedor não definido',
      value: formattedGross,
      grossValue: formattedGross,
      budgetSource: body?.payment?.budgetSource === 'additive' ? 'additive' : 'initial',
      taxValue: '',
      netValue: formattedGross,
      progressPercent,
      expectedBaselineValue: formatCurrency(baselineValue),
      status: 'approved',
      label: paymentLabel,
      installmentNumber,
      totalInstallments: finiteNumber(body?.payment?.totalInstallments),
      dueAt: toDateOrNull(body?.payment?.dueAt),
      measurementId,
      releasedPercent: releasePercent,
      milestonePercent: progressPercent,
      attachments: [],
      receiptFileName: null,
      classification,
      submittedBy: submitter,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    const measurement = {
      id: measurementId,
      ticketId,
      label:
        String(body?.measurement?.label || '').trim() &&
        !String(body?.measurement?.label || '').startsWith('Andamento atualizado para')
          ? String(body.measurement.label).trim()
          : `Andamento atualizado para ${progressPercent}% (bruto ${formattedGross} | acumulado ${formatCurrency(accumulatedGross)})`,
      progressPercent,
      releasePercent,
      grossValue: formattedGross,
      budgetSource: body?.measurement?.budgetSource === 'additive' ? 'additive' : 'initial',
      status: 'approved',
      notes: String(body?.measurement?.notes || '').trim(),
      attachments,
      requestedAt: toDateOrNull(body?.measurement?.requestedAt) || now,
      approvedAt: now,
      classification,
      submittedBy: submitter,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,
    };
    const notesSuffix = measurement.notes ? ` ${measurement.notes}` : '';
    const attachmentSuffix = attachments.length > 0 ? ` ${attachments.length} anexo(s) de relatório.` : '';
    const historyEntry = createHistoryEntry(
      user,
      `Andamento atualizado para ${progressPercent}% com lançamento bruto de ${formattedGross}. ${paymentLabel} liberado para o financeiro.${notesSuffix}${attachmentSuffix}`,
      now
    );
    const executionProgress = {
      paymentFlowParts: Number(ticket.executionProgress.paymentFlowParts),
      currentPercent: progressPercent,
      releasedPercent: Math.max(Number(ticket.executionProgress?.releasedPercent || 0), progressPercent),
      measurementSheetUrl: ticket.executionProgress.measurementSheetUrl || null,
      startedAt:
        toDateOrNull(ticket.executionProgress.startedAt) ||
        toDateOrNull(ticket.preliminaryActions?.actualStartAt) ||
        now,
      lastUpdatedAt: now,
    };

    tx.create(paymentRef, payment);
    tx.create(measurementRef, measurement);
    writeTicketHistoryEntries(tx, ticketRef, [historyEntry], now);
    tx.set(ticketRef, {
      executionProgress,
      history: boundEmbeddedHistory(mergeTicketHistory(ticket.history, historyEntry).merged, ticket.historySubcollectionReady === true),
      updatedAt: now,
    }, { merge: true });

    const result = {
      ok: true,
      action: 'recordMeasurement',
      ticketId,
      payment,
      measurement,
      nextStatus: ticket.status,
    };
    const snapshot = {
      commandKey,
      action: 'recordMeasurement',
      ticketId,
      actor: submitter,
      recordedAt: now,
      previousProgress: currentPercent,
      nextProgress: progressPercent,
      baselineValue: formatCurrency(baselineValue),
      accumulatedGross: formatCurrency(accumulatedGross),
      payment,
      measurement,
    };
    writeCommandRecords(tx, db, ticketRef, commandKey, snapshot, result, now);
    return result;
  });
}

async function settlePayment({ db, user, ticketId, commandKey, body }) {
  const ticketRef = db.collection('tickets').doc(ticketId);
  const commandRef = ticketRef.collection('financeCommands').doc(commandKey);
  const paymentId = String(body?.paymentId || body?.payment?.id || '').trim();
  if (!paymentId) throw new HttpError(400, 'paymentId é obrigatório.');
  const paymentRef = ticketRef.collection('payments').doc(paymentId);
  const paymentsQuery = ticketRef.collection('payments');
  const measurementsQuery = ticketRef.collection('measurements');
  const outboxRef = db.collection('emailOutbox').doc(`${ticketId}__${commandKey}`);

  return db.runTransaction(async tx => {
    const [commandSnap, ticketSnap, paymentsSnap, measurementsSnap] = await Promise.all([
      tx.get(commandRef),
      tx.get(ticketRef),
      tx.get(paymentsQuery),
      tx.get(measurementsQuery),
    ]);
    if (commandSnap.exists) return { ...commandSnap.data()?.result, replayed: true };
    if (!ticketSnap.exists) throw new HttpError(404, 'OS não encontrada.');

    const ticket = ticketSnap.data() || {};
    const payments = paymentsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id, ref: doc.ref }));
    const measurements = measurementsSnap.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    let currentPayment = payments.find(item => item.id === paymentId) || null;
    if (!currentPayment) {
      currentPayment = {
        ...resolveLegacyMeasurementPayment({
          paymentId,
          fallback: body?.payment || {},
          payments,
          measurements,
        }),
        ref: paymentRef,
      };
      payments.push(currentPayment);
    }
    assertUniquePaymentMeasurement(payments, currentPayment);
    if (currentPayment.status === 'paid') {
      throw new HttpError(409, 'Este lançamento já foi pago.');
    }
    if (currentPayment.status !== 'approved') {
      throw new HttpError(409, 'O lançamento ainda não foi liberado para pagamento.');
    }

    const grossAmount = parseCurrency(body?.grossAmount);
    const taxAmount = parseCurrency(body?.taxAmount);
    if (grossAmount <= 0) throw new HttpError(400, 'Informe um valor bruto válido.');
    if (taxAmount < 0 || taxAmount > grossAmount) {
      throw new HttpError(400, 'O imposto deve ficar entre zero e o valor bruto.');
    }
    const netAmount = grossAmount - taxAmount;
    const recipients = normalizeFinanceRecipients(body?.recipients);
    const now = new Date();
    const submitter = actorSnapshot(user);
    const nextPayment = {
      ...currentPayment,
      ref: undefined,
      id: paymentId,
      ticketId,
      vendor: String(currentPayment.vendor || '').trim() || 'Fornecedor não definido',
      value: String(currentPayment.value || formatCurrency(grossAmount)),
      grossValue: formatCurrency(grossAmount),
      taxValue: formatCurrency(taxAmount),
      netValue: formatCurrency(netAmount),
      status: 'paid',
      paidAt: now,
      attachments: Array.isArray(currentPayment.attachments)
        ? currentPayment.attachments.map(item => normalizeAttachment(item))
        : [],
      submittedBy: currentPayment.submittedBy || submitter,
      settledBy: submitter,
      settledAt: now,
      createdAt: toDateOrNull(currentPayment.createdAt) || now,
      updatedAt: now,
    };
    delete nextPayment.ref;

    const projectedPayments = payments
      .filter(item => !isLegacyMilestonePlaceholder(item))
      .map(item => item.id === paymentId ? nextPayment : item);
    const allPaid =
      projectedPayments.length > 0 &&
      projectedPayments.every(item => item.status === 'paid');
    const remainingPendingPayments = projectedPayments.filter(item => item.status !== 'paid').length;
    const closure = resolvePaymentClosure(ticket, allPaid, body?.closureDraft, now);
    const deliveryText = `E-mail financeiro enfileirado para ${recipients.join(', ')}.`;
    const historyText = closure.canClose
      ? `${nextPayment.label || 'Pagamento'} confirmado com bruto ${nextPayment.grossValue}, imposto ${nextPayment.taxValue} e líquido ${nextPayment.netValue}. ${deliveryText} Todos os lançamentos foram quitados, checklist concluído e garantia iniciada.`
      : remainingPendingPayments > 0
        ? `${nextPayment.label || 'Pagamento'} confirmado com líquido ${nextPayment.netValue}. ${deliveryText} Restam ${remainingPendingPayments} lançamento(s) pendente(s).`
        : `${nextPayment.label || 'Pagamento'} confirmado com líquido ${nextPayment.netValue}. ${deliveryText} Todos os lançamentos atuais foram quitados.`;
    const historyEntry = createHistoryEntry(user, historyText, now);

    const outbox = {
      id: commandKey,
      commandKey,
      type: 'finance.payment',
      ticketId,
      paymentId,
      trigger: 'EMAIL-FINANCEIRO-PAGAMENTO',
      recipients,
      status: 'pending',
      attempts: 0,
      financial: {
        grossAmount,
        taxAmount,
        netAmount,
      },
      payment: {
        id: paymentId,
        label: nextPayment.label || `Lançamento ${nextPayment.installmentNumber || 1}`,
        vendor: nextPayment.vendor,
        installmentNumber: nextPayment.installmentNumber || null,
        attachments: nextPayment.attachments,
      },
      createdBy: submitter,
      createdAt: now,
      updatedAt: now,
    };

    tx.set(paymentRef, nextPayment, { merge: true });
    writeTicketHistoryEntries(tx, ticketRef, [historyEntry], now);
    tx.set(ticketRef, {
      status: closure.nextStatus,
      closureChecklist: closure.closureChecklist,
      guarantee: closure.guarantee,
      history: boundEmbeddedHistory(mergeTicketHistory(ticket.history, historyEntry).merged, ticket.historySubcollectionReady === true),
      updatedAt: now,
    }, { merge: true });
    tx.create(outboxRef, outbox);

    const result = {
      ok: true,
      action: 'settlePayment',
      ticketId,
      paymentId,
      payment: nextPayment,
      nextStatus: closure.nextStatus,
      closed: closure.canClose,
      remainingPendingPayments,
      outboxKey: commandKey,
      emailStatus: 'pending',
    };
    const snapshot = {
      commandKey,
      action: 'settlePayment',
      ticketId,
      actor: submitter,
      settledAt: now,
      previousStatus: ticket.status,
      nextStatus: closure.nextStatus,
      payment: nextPayment,
      recipients,
      outboxKey: commandKey,
    };
    writeCommandRecords(tx, db, ticketRef, commandKey, snapshot, result, now);
    return result;
  });
}

export async function executeFinanceCommand({ db, user, ticketId, body }) {
  const action = String(body?.action || '').trim();
  const commandKey = normalizeIdempotencyKey(body?.idempotencyKey);
  if (action === 'recordMeasurement') {
    return recordMeasurement({ db, user, ticketId, commandKey, body });
  }
  if (action === 'settlePayment') {
    return settlePayment({ db, user, ticketId, commandKey, body });
  }
  throw new HttpError(400, 'Comando financeiro inválido.');
}
