import { randomUUID } from 'node:crypto';
import { HttpError } from './http.js';
import { boundEmbeddedHistory, mergeTicketHistory, writeTicketHistoryEntries } from './tickets.js';
import { TICKET_STATUS } from './statusFlow.js';

const COMMAND_KEY_PATTERN = /^[A-Za-z0-9_-]{8,100}$/;

function parseCurrency(value) {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrencyValue(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function quoteValue(quote) {
  return parseCurrency(quote?.totalValue || quote?.value || '0');
}

function actorSnapshot(user) {
  return {
    id: user?.id || null,
    name: user?.name || user?.email || 'Diretoria',
    email: user?.email || null,
    role: user?.role || null,
  };
}

function actorLabel(user) {
  const base = String(user?.name || user?.email || 'Diretoria').trim();
  return user?.role ? `${base} (${user.role})` : base;
}

function requireReason(value) {
  const reason = String(value || '').trim();
  if (reason.length < 3) {
    throw new HttpError(400, 'Informe um motivo com pelo menos 3 caracteres.');
  }
  return reason.slice(0, 1000);
}

export function normalizeIdempotencyKey(value) {
  const key = String(value || '').trim();
  if (!COMMAND_KEY_PATTERN.test(key)) {
    throw new HttpError(400, 'idempotencyKey inválida.');
  }
  return key;
}

export function resolveAdditiveReturnStatus(ticket) {
  const hasExecutionStarted =
    Boolean(ticket?.executionProgress?.startedAt) ||
    Number(ticket?.executionProgress?.currentPercent || 0) > 0 ||
    Boolean(ticket?.preliminaryActions?.actualStartAt) ||
    Boolean(ticket?.closureChecklist?.serviceStartedAt);

  return hasExecutionStarted ? TICKET_STATUS.IN_PROGRESS : TICKET_STATUS.WAITING_PRELIM_ACTIONS;
}

function assertTicketStatus(ticket, expected, message) {
  if (String(ticket?.status || '') !== expected) {
    throw new HttpError(409, message);
  }
}

export function quoteRoundMatches(quote, category, initialRoundIndex, additiveIndex) {
  const quoteCategory = quote?.category === 'additive' ? 'additive' : 'initial';
  if (quoteCategory !== category) return false;
  if (category === 'initial') {
    return Number(quote?.initialRoundIndex || 1) === Number(initialRoundIndex || 1);
  }
  return Number(quote?.additiveIndex || 1) === Number(additiveIndex || 1);
}

function approvalSnapshotBase({ action, commandKey, ticketId, user, now }) {
  return {
    commandKey,
    action,
    ticketId,
    actor: actorSnapshot(user),
    decidedAt: now,
  };
}

function appendHistory(ticket, entry) {
  // A entrada completa já foi espelhada na subcoleção (writeTicketHistoryEntries no
  // mesmo tx); aqui o embutido fica limitado à janela para o doc não crescer.
  return boundEmbeddedHistory(
    mergeTicketHistory(ticket?.history, entry).merged,
    ticket?.historySubcollectionReady === true
  );
}

function createHistoryEntry(user, text, now) {
  return {
    id: `approval-${randomUUID()}`,
    type: 'system',
    sender: actorLabel(user),
    time: now,
    text,
    visibility: 'internal',
  };
}

function writeCommandRecords(tx, db, ticketRef, commandKey, snapshot, result, now) {
  const commandRef = ticketRef.collection('approvalCommands').doc(commandKey);
  const snapshotRef = ticketRef.collection('approvalSnapshots').doc(commandKey);
  const auditRef = db.collection('auditLogs').doc();

  tx.create(commandRef, {
    action: snapshot.action,
    result,
    actor: snapshot.actor,
    createdAt: now,
  });
  tx.create(snapshotRef, snapshot);
  tx.create(auditRef, {
    actor: snapshot.actor?.name || 'Diretoria',
    action: `approval.${snapshot.action}`,
    entity: 'ticket',
    entityId: snapshot.ticketId,
    before: null,
    after: snapshot,
    metadata: { commandKey },
    createdAt: now,
  });
}

async function runSimpleTicketDecision({ db, user, ticketId, action, commandKey, reason }) {
  const ticketRef = db.collection('tickets').doc(ticketId);
  const commandRef = ticketRef.collection('approvalCommands').doc(commandKey);

  return db.runTransaction(async tx => {
    const commandSnap = await tx.get(commandRef);
    if (commandSnap.exists) return { ...commandSnap.data()?.result, replayed: true };

    const ticketSnap = await tx.get(ticketRef);
    if (!ticketSnap.exists) throw new HttpError(404, 'OS não encontrada.');
    const ticket = ticketSnap.data() || {};
    const now = new Date();
    const isApproval = action === 'approveSolution';
    assertTicketStatus(
      ticket,
      TICKET_STATUS.WAITING_SOLUTION_APPROVAL,
      'A solução técnica não está mais pendente de decisão.'
    );

    const nextStatus = isApproval ? TICKET_STATUS.WAITING_BUDGET : TICKET_STATUS.CANCELED;
    const decisionReason = isApproval ? null : requireReason(reason);
    const text = isApproval
      ? `Solução técnica aprovada por ${actorLabel(user)}. OS liberada para a etapa de orçamentação.`
      : `OS cancelada por ${actorLabel(user)}. Motivo: ${decisionReason}`;
    const historyEntry = createHistoryEntry(user, text, now);
    const snapshot = {
      ...approvalSnapshotBase({ action, commandKey, ticketId, user, now }),
      outcome: isApproval ? 'approved' : 'rejected',
      reason: decisionReason,
      previousStatus: ticket.status,
      nextStatus,
    };
    const result = { ok: true, action, ticketId, nextStatus };

    writeTicketHistoryEntries(tx, ticketRef, [historyEntry], now);
    tx.set(ticketRef, {
      status: nextStatus,
      viewingBy: null,
      history: appendHistory(ticket, historyEntry),
      updatedAt: now,
    }, { merge: true });
    writeCommandRecords(tx, db, ticketRef, commandKey, snapshot, result, now);
    return result;
  });
}

async function runBudgetDecision({
  db,
  user,
  ticketId,
  action,
  commandKey,
  selectedQuoteId,
  roundCategory,
  roundInitialIndex,
  roundAdditiveIndex,
  reason,
}) {
  const ticketRef = db.collection('tickets').doc(ticketId);
  const commandRef = ticketRef.collection('approvalCommands').doc(commandKey);
  const quotesQuery = ticketRef.collection('quotes');
  const contractsQuery = ticketRef.collection('contracts').limit(1);
  // Doc CANÔNICO do contrato. O `.limit(1)` sem orderBy resolve por ID, então um doc
  // com id lexicograficamente menor venceria o contrato real — vetor de "contrato
  // sombra". Preferimos sempre 'contract-1'; o limit(1) fica só como compat legado.
  const canonicalContractRef = ticketRef.collection('contracts').doc('contract-1');

  return db.runTransaction(async tx => {
    const commandSnap = await tx.get(commandRef);
    if (commandSnap.exists) return { ...commandSnap.data()?.result, replayed: true };

    const ticketSnap = await tx.get(ticketRef);
    const quotesSnap = await tx.get(quotesQuery);
    const contractsSnap = await tx.get(contractsQuery);
    const canonicalContractSnap = await tx.get(canonicalContractRef);
    if (!ticketSnap.exists) throw new HttpError(404, 'OS não encontrada.');

    const ticket = ticketSnap.data() || {};
    assertTicketStatus(
      ticket,
      TICKET_STATUS.WAITING_BUDGET_APPROVAL,
      'O orçamento não está mais pendente de decisão.'
    );
    const quotes = quotesSnap.docs.map(doc => ({ id: doc.id, ref: doc.ref, ...doc.data() }));
    if (quotes.length === 0) throw new HttpError(409, 'Nenhuma cotação submetida para decisão.');

    const now = new Date();
    const approving = action === 'approveBudget';
    let category;
    let initialRoundIndex;
    let additiveIndex;
    let selectedQuote = null;

    if (approving) {
      const targetId = String(selectedQuoteId || '').trim();
      selectedQuote = quotes.find(quote => String(quote.id) === targetId) || null;
      if (!selectedQuote) throw new HttpError(404, 'Cotação selecionada não encontrada.');
      category = selectedQuote.category === 'additive' ? 'additive' : 'initial';
      initialRoundIndex = category === 'initial' ? Math.max(1, Number(selectedQuote.initialRoundIndex || 1)) : null;
      additiveIndex = category === 'additive' ? Number(selectedQuote.additiveIndex || 1) : null;
    } else {
      category = roundCategory === 'additive' ? 'additive' : 'initial';
      initialRoundIndex = category === 'initial' ? Math.max(1, Number(roundInitialIndex || 1)) : null;
      additiveIndex = category === 'additive' ? Math.max(1, Number(roundAdditiveIndex || 1)) : null;
    }

    const roundQuotes = quotes.filter(quote =>
      quoteRoundMatches(quote, category, initialRoundIndex, additiveIndex)
    );
    if (roundQuotes.length === 0) throw new HttpError(409, 'Rodada de cotação não encontrada.');
    if (!roundQuotes.every(quote => String(quote.status || 'pending') === 'pending')) {
      throw new HttpError(409, 'Esta rodada já recebeu uma decisão.');
    }

    for (const quote of roundQuotes) {
      const isSelected = approving && String(quote.id) === String(selectedQuote.id);
      tx.set(quote.ref, {
        recommended: isSelected,
        status: isSelected ? 'approved' : 'rejected',
        decidedAt: now,
        decidedBy: actorSnapshot(user),
        updatedAt: now,
      }, { merge: true });
    }

    const rejectionReason = approving ? null : requireReason(reason);
    const isAdditive = category === 'additive';
    const currentContractSnap = canonicalContractSnap.exists
      ? canonicalContractSnap
      : (contractsSnap.docs[0] || null);
    const currentContract = currentContractSnap?.data() || {};
    const contractRef = currentContractSnap?.ref || ticketRef.collection('contracts').doc('contract-1');
    let nextStatus;
    let historyText;
    let financialSnapshot;
    let additivePaymentCreated = false;

    if (approving) {
      const approvedQuoteValue = quoteValue(selectedQuote);
      if (approvedQuoteValue <= 0) throw new HttpError(409, 'A cotação selecionada não possui valor válido.');

      const projectedQuotes = quotes.map(quote => {
        if (!quoteRoundMatches(quote, category, initialRoundIndex, additiveIndex)) return quote;
        const isSelected = String(quote.id) === String(selectedQuote.id);
        return { ...quote, status: isSelected ? 'approved' : 'rejected' };
      });
      const approvedInitial = projectedQuotes.find(quote => quote.category !== 'additive' && quote.status === 'approved');
      const currentInitialValue = parseCurrency(currentContract.initialPlannedValue || currentContract.value || '0');
      const initialValue = isAdditive ? quoteValue(approvedInitial) || currentInitialValue : approvedQuoteValue;
      const additivesTotal = projectedQuotes
        .filter(quote => quote.category === 'additive' && quote.status === 'approved')
        .reduce((sum, quote) => sum + quoteValue(quote), 0);
      const realizedValue = isAdditive ? initialValue + additivesTotal : approvedQuoteValue;
      const formattedInitial = initialValue > 0 ? formatCurrencyValue(initialValue) : null;
      const formattedRealized = formatCurrencyValue(realizedValue);

      // No ADITIVO o contrato NÃO volta para 'pending_upload' (isso reabriria a
      // edição livre — a imutabilidade do writeContract só bloqueia 'approved'): o
      // contrato original já está aprovado e continua aprovado; o aditivo entra como
      // pagamento à parte. O vendor e o initialPlannedValue do contrato original são
      // preservados (o vendor/valor do aditivo vivem no doc de pagamento abaixo).
      tx.set(contractRef, {
        id: currentContract.id || contractRef.id,
        ticketId,
        vendor: isAdditive
          ? String(currentContract.vendor || selectedQuote.vendor || '').trim()
          : String(selectedQuote.vendor || '').trim(),
        value: formattedRealized,
        initialPlannedValue: isAdditive
          ? (currentContract.initialPlannedValue || formattedInitial)
          : formattedInitial,
        realizedValue: formattedRealized,
        status: isAdditive ? (currentContract.status || 'approved') : 'pending_upload',
        viewingBy: null,
        items: isAdditive
          ? (Array.isArray(currentContract.items) ? currentContract.items : [])
          : (Array.isArray(selectedQuote.items) ? selectedQuote.items : []),
        classification: selectedQuote.classification || currentContract.classification || null,
        createdAt: currentContract.createdAt || now,
        updatedAt: now,
      }, { merge: true });

      if (isAdditive) {
        const paymentRef = ticketRef.collection('payments').doc(`payment-additive-${additiveIndex}`);
        const additiveValue = formatCurrencyValue(approvedQuoteValue);
        tx.set(paymentRef, {
          id: paymentRef.id,
          ticketId,
          vendor: String(selectedQuote.vendor || currentContract.vendor || 'Fornecedor não definido'),
          value: additiveValue,
          grossValue: additiveValue,
          budgetSource: 'additive',
          taxValue: '',
          netValue: additiveValue,
          progressPercent: Number(ticket.executionProgress?.currentPercent || 0),
          expectedBaselineValue: formattedInitial,
          status: 'approved',
          label: `Lançamento de aditivo ${additiveIndex}`,
          installmentNumber: null,
          totalInstallments: null,
          dueAt: now,
          measurementId: `additive-${additiveIndex}`,
          releasedPercent: 0,
          milestonePercent: null,
          attachments: [],
          receiptFileName: null,
          classification: selectedQuote.classification || null,
          createdAt: now,
          updatedAt: now,
        }, { merge: true });
        additivePaymentCreated = true;
      }

      nextStatus = isAdditive ? resolveAdditiveReturnStatus(ticket) : TICKET_STATUS.WAITING_CONTRACT_UPLOAD;
      historyText = isAdditive
        ? `Aditivo aprovado por ${actorLabel(user)}. ${selectedQuote.vendor || 'Fornecedor vencedor'} definido para atualização do valor realizado. Lançamento financeiro criado automaticamente.`
        : `Orçamento aprovado por ${actorLabel(user)}. ${selectedQuote.vendor || 'Fornecedor vencedor'} definido; aguardando anexo do contrato pelo gestor.`;
      financialSnapshot = {
        submittedBy: selectedQuote.submittedBy || null,
        quote: {
          id: selectedQuote.id,
          vendor: selectedQuote.vendor || null,
          value: selectedQuote.value || null,
          laborValue: selectedQuote.laborValue || null,
          materialValue: selectedQuote.materialValue || null,
          totalValue: selectedQuote.totalValue || null,
          category,
          initialRoundIndex,
          additiveIndex,
          items: Array.isArray(selectedQuote.items) ? selectedQuote.items : [],
          attachmentName: selectedQuote.attachmentName || null,
          attachmentPath: selectedQuote.attachmentPath || null,
        },
        frozenInitialValue: formattedInitial,
        frozenRealizedValue: formattedRealized,
      };
    } else {
      nextStatus = isAdditive ? resolveAdditiveReturnStatus(ticket) : TICKET_STATUS.WAITING_BUDGET;
      const label = isAdditive ? `Aditivo ${additiveIndex}` : 'Orçamento';
      historyText = isAdditive
        ? `${label} reprovado por ${actorLabel(user)}. Motivo: ${rejectionReason}. Nova rodada de aditivo liberada para o gestor.`
        : `${label} reprovado por ${actorLabel(user)}. Motivo: ${rejectionReason}. Nova rodada de cotações liberada para o gestor.`;
      financialSnapshot = {
        submittedBy: roundQuotes.map(quote => quote.submittedBy).filter(Boolean),
        quotes: roundQuotes.map(quote => ({
          id: quote.id,
          vendor: quote.vendor || null,
          value: quote.value || null,
          totalValue: quote.totalValue || null,
          category,
          initialRoundIndex,
          additiveIndex,
        })),
      };
    }

    const historyEntry = createHistoryEntry(user, historyText, now);
    writeTicketHistoryEntries(tx, ticketRef, [historyEntry], now);
    tx.set(ticketRef, {
      status: nextStatus,
      viewingBy: null,
      history: appendHistory(ticket, historyEntry),
      updatedAt: now,
    }, { merge: true });

    const snapshot = {
      ...approvalSnapshotBase({ action, commandKey, ticketId, user, now }),
      outcome: approving ? 'approved' : 'rejected',
      reason: rejectionReason,
      previousStatus: ticket.status,
      nextStatus,
      round: { category, initialRoundIndex, additiveIndex },
      financial: financialSnapshot,
    };
    const result = {
      ok: true,
      action,
      ticketId,
      nextStatus,
      selectedQuoteId: selectedQuote?.id || null,
      additivePaymentCreated,
    };
    writeCommandRecords(tx, db, ticketRef, commandKey, snapshot, result, now);
    return result;
  });
}

async function runContractDecision({ db, user, ticketId, action, commandKey, contractId, reason }) {
  const ticketRef = db.collection('tickets').doc(ticketId);
  const commandRef = ticketRef.collection('approvalCommands').doc(commandKey);
  const targetContractId = String(contractId || 'contract-1').trim() || 'contract-1';
  const contractRef = ticketRef.collection('contracts').doc(targetContractId);

  return db.runTransaction(async tx => {
    const commandSnap = await tx.get(commandRef);
    if (commandSnap.exists) return { ...commandSnap.data()?.result, replayed: true };

    const [ticketSnap, contractSnap] = await Promise.all([
      tx.get(ticketRef),
      tx.get(contractRef),
    ]);
    if (!ticketSnap.exists) throw new HttpError(404, 'OS não encontrada.');
    if (!contractSnap.exists) throw new HttpError(404, 'Contrato não encontrado.');
    const ticket = ticketSnap.data() || {};
    const contract = contractSnap.data() || {};
    assertTicketStatus(
      ticket,
      TICKET_STATUS.WAITING_CONTRACT_APPROVAL,
      'O contrato não está mais pendente de decisão.'
    );

    const approving = action === 'approveContract';
    if (approving && !contract.signedFileName && !contract.signedFilePath && !contract.signedFileUrl) {
      throw new HttpError(409, 'O contrato assinado ainda não foi anexado.');
    }
    const rejectionReason = approving ? null : requireReason(reason);
    const now = new Date();
    const nextStatus = approving ? TICKET_STATUS.WAITING_PRELIM_ACTIONS : TICKET_STATUS.WAITING_CONTRACT_UPLOAD;
    const nextContractStatus = approving ? 'approved' : 'pending_upload';
    const historyText = approving
      ? `Contrato aprovado por ${actorLabel(user)}${contract.signedFileName ? ` (${contract.signedFileName})` : '.'}`
      : `Contrato reprovado por ${actorLabel(user)}. Motivo: ${rejectionReason}. Gestor deve reenviar o contrato para nova aprovação da Diretoria.`;
    const historyEntry = createHistoryEntry(user, historyText, now);

    tx.set(contractRef, {
      status: nextContractStatus,
      viewingBy: null,
      decidedAt: now,
      decidedBy: actorSnapshot(user),
      updatedAt: now,
    }, { merge: true });
    writeTicketHistoryEntries(tx, ticketRef, [historyEntry], now);
    tx.set(ticketRef, {
      status: nextStatus,
      viewingBy: null,
      history: appendHistory(ticket, historyEntry),
      updatedAt: now,
    }, { merge: true });

    const snapshot = {
      ...approvalSnapshotBase({ action, commandKey, ticketId, user, now }),
      outcome: approving ? 'approved' : 'rejected',
      reason: rejectionReason,
      previousStatus: ticket.status,
      nextStatus,
      financial: {
        submittedBy: contract.submittedBy || null,
        contract: {
          id: contractRef.id,
          vendor: contract.vendor || null,
          value: contract.value || null,
          initialPlannedValue: contract.initialPlannedValue || null,
          realizedValue: contract.realizedValue || null,
          signedFileName: contract.signedFileName || null,
          signedFilePath: contract.signedFilePath || null,
          items: Array.isArray(contract.items) ? contract.items : [],
        },
      },
    };
    const result = { ok: true, action, ticketId, nextStatus, contractId: contractRef.id };
    writeCommandRecords(tx, db, ticketRef, commandKey, snapshot, result, now);
    return result;
  });
}

export async function executeApprovalCommand({ db, user, ticketId, body }) {
  const action = String(body?.action || '').trim();
  const commandKey = normalizeIdempotencyKey(body?.idempotencyKey);

  if (action === 'approveSolution' || action === 'rejectSolution') {
    return runSimpleTicketDecision({
      db,
      user,
      ticketId,
      action,
      commandKey,
      reason: body?.reason,
    });
  }

  if (action === 'approveBudget' || action === 'rejectBudget') {
    return runBudgetDecision({
      db,
      user,
      ticketId,
      action,
      commandKey,
      selectedQuoteId: body?.selectedQuoteId,
      roundCategory: body?.roundCategory,
      roundInitialIndex: body?.roundInitialIndex,
      roundAdditiveIndex: body?.roundAdditiveIndex,
      reason: body?.reason,
    });
  }

  if (action === 'approveContract' || action === 'rejectContract') {
    return runContractDecision({
      db,
      user,
      ticketId,
      action,
      commandKey,
      contractId: body?.contractId,
      reason: body?.reason,
    });
  }

  throw new HttpError(400, 'Comando de aprovação inválido.');
}
