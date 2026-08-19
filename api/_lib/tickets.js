import { createHash } from 'node:crypto';
import { FieldPath, Timestamp } from 'firebase-admin/firestore';

export const TICKET_HISTORY_SUBCOLLECTION = 'historyEntries';

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
}

// ATENÇÃO: contrato DIFERENTE do toDateOrNull de dates.js, de propósito. Aqui o que
// não é data reconhecível volta INTACTO, porque esta função normaliza o documento
// inteiro da OS antes de gravar: transformar um campo desconhecido em null apagaria
// dado. Não unifique com dates.js sem olhar cada chamador.
function toDate(value) {
  if (!value) return value;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (isIsoDate(value)) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? value : d;
  }
  if (typeof value === 'object' && value !== null && '_seconds' in value) {
    const seconds = Number(value._seconds || 0);
    return new Date(seconds * 1000);
  }
  return value;
}

function stripUndefinedDeep(value) {
  if (Array.isArray(value)) {
    return value
      .map(stripUndefinedDeep)
      .filter(item => item !== undefined);
  }

  if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof Timestamp)) {
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
      const normalized = stripUndefinedDeep(entry);
      if (normalized !== undefined) {
        next[key] = normalized;
      }
    }
    return next;
  }

  return value === undefined ? undefined : value;
}

function serializeAttachment(item) {
  return {
    ...item,
    url: item?.path ? '' : String(item?.url || ''),
    uploadedAt: serializeDate(item?.uploadedAt),
  };
}

function normalizeAttachmentForStorage(item) {
  return {
    ...item,
    url: item?.path ? '' : String(item?.url || ''),
    uploadedAt: toDate(item?.uploadedAt) || null,
  };
}

export function normalizeTicketForStorage(ticket) {
  const next = { ...ticket };
  next.time = toDate(next.time) || new Date();
  if (next.stageEnteredAt !== undefined) next.stageEnteredAt = toDate(next.stageEnteredAt) || null;
  if (next.followUpRequestedAt !== undefined) next.followUpRequestedAt = toDate(next.followUpRequestedAt) || null;
  if (next.viewingBy?.at) {
    next.viewingBy = { ...next.viewingBy, at: toDate(next.viewingBy.at) };
  }
  if (next.sla?.dueAt) {
    next.sla = { ...next.sla, dueAt: toDate(next.sla.dueAt) };
  }
  if (Array.isArray(next.history)) {
    next.history = next.history.map(item => ({
      ...item,
      time: toDate(item.time) || new Date(),
      attachments: Array.isArray(item?.attachments)
        ? item.attachments.map(normalizeAttachmentForStorage)
        : undefined,
    }));
  }
  if (next.nextAction) {
    // Agenda operacional: sem isto, `dueAt` ficaria gravado como STRING ISO enquanto
    // todo o resto do banco usa Timestamp — e qualquer ordenacao/where futuro sobre
    // a data compararia texto com data.
    next.nextAction = {
      ...next.nextAction,
      dueAt: toDate(next.nextAction.dueAt) || null,
      createdAt: toDate(next.nextAction.createdAt) || null,
    };
  }
  if (next.operationalAttention) {
    next.operationalAttention = {
      ...next.operationalAttention,
      dueAt: toDate(next.operationalAttention.dueAt) || null,
      computedAt: toDate(next.operationalAttention.computedAt) || null,
    };
  }
  if (next.attentionOverride) {
    next.attentionOverride = {
      ...next.attentionOverride,
      dueAt: toDate(next.attentionOverride.dueAt) || null,
      changedAt: toDate(next.attentionOverride.changedAt) || null,
    };
  }
  if (next.attention) {
    next.attention = {
      ...next.attention,
      reviewAt: toDate(next.attention.reviewAt) || null,
      setAt: toDate(next.attention.setAt) || null,
    };
  }
  if (next.responsible) {
    // `setAt` e a data que a regra "com responsavel e sem progresso" usa como
    // relogio. Como STRING ISO ela nao compara com Timestamp, e a regra decidiria
    // pelo texto da data.
    next.responsible = {
      ...next.responsible,
      setAt: toDate(next.responsible.setAt) || null,
    };
  }
  if (next.preliminaryActions) {
    next.preliminaryActions = {
      ...next.preliminaryActions,
      materialEta: toDate(next.preliminaryActions.materialEta) || null,
      plannedStartAt: toDate(next.preliminaryActions.plannedStartAt) || null,
      actualStartAt: toDate(next.preliminaryActions.actualStartAt) || null,
      updatedAt: toDate(next.preliminaryActions.updatedAt) || new Date(),
    };
  }
  if (next.closureChecklist) {
    const infrastructureApprovalPrimary =
      next.closureChecklist.infrastructureApprovalPrimary ??
      next.closureChecklist.infrastructureApprovedByRafael ??
      false;
    const infrastructureApprovalSecondary =
      next.closureChecklist.infrastructureApprovalSecondary ??
      next.closureChecklist.infrastructureApprovedByFernando ??
      false;
    next.closureChecklist = {
      ...next.closureChecklist,
      infrastructureApprovalPrimary: Boolean(infrastructureApprovalPrimary),
      infrastructureApprovalSecondary: Boolean(infrastructureApprovalSecondary),
      requesterApprovedAt: toDate(next.closureChecklist.requesterApprovedAt) || null,
      serviceStartedAt: toDate(next.closureChecklist.serviceStartedAt) || null,
      serviceCompletedAt: toDate(next.closureChecklist.serviceCompletedAt) || null,
      closedAt: toDate(next.closureChecklist.closedAt) || null,
      documents: Array.isArray(next.closureChecklist.documents)
        ? next.closureChecklist.documents.map(normalizeAttachmentForStorage)
        : [],
    };
    delete next.closureChecklist.infrastructureApprovedByRafael;
    delete next.closureChecklist.infrastructureApprovedByFernando;
  }
  if (Array.isArray(next.attachments)) {
    next.attachments = next.attachments.map(normalizeAttachmentForStorage);
  }
  if (next.guarantee) {
    next.guarantee = {
      ...next.guarantee,
      startAt: toDate(next.guarantee.startAt) || null,
      endAt: toDate(next.guarantee.endAt) || null,
    };
  }
  if (next.executionProgress) {
    const measurementSheetUrlRaw = String(next.executionProgress.measurementSheetUrl || '').trim();
    next.executionProgress = {
      ...next.executionProgress,
      paymentFlowParts: Math.max(1, Number(next.executionProgress.paymentFlowParts || 1)),
      currentPercent: Math.max(0, Number(next.executionProgress.currentPercent || 0)),
      releasedPercent: Math.min(100, Math.max(0, Number(next.executionProgress.releasedPercent || 0))),
      measurementSheetUrl: measurementSheetUrlRaw || null,
      startedAt: toDate(next.executionProgress.startedAt) || null,
      lastUpdatedAt: toDate(next.executionProgress.lastUpdatedAt) || null,
    };
  }
  return stripUndefinedDeep(next);
}

function serializeDate(value) {
  const d = toDate(value);
  if (d instanceof Date && !isNaN(d.getTime())) return d.toISOString();
  return value ?? null;
}

export function serializeTicketForApi(ticket) {
  return {
    ...ticket,
    time: serializeDate(ticket.time),
    updatedAt: serializeDate(ticket.updatedAt),
    stageEnteredAt: serializeDate(ticket.stageEnteredAt),
    /**
     * Estes dois escapavam CRUS — achados pelo teste de contrato, que varre o
     * documento inteiro procurando `{_seconds}` sobrevivente.
     *
     * Nenhum cliente os lê hoje, então não havia defeito ativo. O que havia era uma
     * mina: dois campos do mesmo documento com formatos diferentes, esperando a
     * primeira pessoa que escrevesse `new Date(ticket.createdAt)` e recebesse
     * Invalid Date sem entender por quê. Uniformizar custa duas linhas.
     */
    createdAt: serializeDate(ticket.createdAt),
    historySubcollectionUpdatedAt: serializeDate(ticket.historySubcollectionUpdatedAt),
    // A linha do tempo (uma data por etapa). O spread acima já traria o campo, mas
    // com Timestamp do Firestore dentro — e a tela compararia objeto com data, que é
    // a mesma armadilha descrita logo abaixo para `nextAction.dueAt`.
    marcos:
      ticket.marcos && typeof ticket.marcos === 'object' && !Array.isArray(ticket.marcos)
        ? Object.fromEntries(
            Object.entries(ticket.marcos).map(([etapa, quando]) => [etapa, serializeDate(quando)])
          )
        : null,
    followUpRequestedAt: serializeDate(ticket.followUpRequestedAt),
    // Agenda operacional: `dueAt` e a data que ORDENA a tela inteira. Sem serializar
    // aqui, chegaria como Timestamp do Firestore e o front nao conseguiria comparar.
    nextAction: ticket.nextAction
      ? {
          ...ticket.nextAction,
          dueAt: serializeDate(ticket.nextAction.dueAt),
          createdAt: serializeDate(ticket.nextAction.createdAt),
        }
      : null,
    // A suspensão só vale até `reviewAt`: se chegasse como Timestamp, o front
    // compararia objeto com data e a suspensão nunca venceria.
    attention: ticket.attention
      ? {
          ...ticket.attention,
          reviewAt: serializeDate(ticket.attention.reviewAt),
          setAt: serializeDate(ticket.attention.setAt),
        }
      : null,
    responsible: ticket.responsible
      ? { ...ticket.responsible, setAt: serializeDate(ticket.responsible.setAt) }
      : null,
    // Projeção do servidor: o front só apresenta. Se cada tela derivasse por conta
    // própria, duas telas discordariam sobre a mesma OS.
    operationalAttention: ticket.operationalAttention
      ? {
          ...ticket.operationalAttention,
          dueAt: serializeDate(ticket.operationalAttention.dueAt),
          computedAt: serializeDate(ticket.operationalAttention.computedAt),
        }
      : null,
    attentionOverride: ticket.attentionOverride
      ? {
          ...ticket.attentionOverride,
          dueAt: serializeDate(ticket.attentionOverride.dueAt),
          changedAt: serializeDate(ticket.attentionOverride.changedAt),
        }
      : null,
    lastInboundAt: serializeDate(ticket.lastInboundAt),
    lastOutboundAt: serializeDate(ticket.lastOutboundAt),
    viewingBy: ticket.viewingBy
      ? { ...ticket.viewingBy, at: serializeDate(ticket.viewingBy.at) }
      : null,
    sla: ticket.sla
      ? { ...ticket.sla, dueAt: serializeDate(ticket.sla.dueAt) }
      : null,
    history: Array.isArray(ticket.history)
      ? ticket.history.map(item => ({
          ...item,
          attachments: Array.isArray(item?.attachments)
            ? item.attachments.map(serializeAttachment)
            : undefined,
          time: serializeDate(item.time),
        }))
      : [],
    preliminaryActions: ticket.preliminaryActions
      ? {
          ...ticket.preliminaryActions,
          materialEta: serializeDate(ticket.preliminaryActions.materialEta),
          plannedStartAt: serializeDate(ticket.preliminaryActions.plannedStartAt),
          actualStartAt: serializeDate(ticket.preliminaryActions.actualStartAt),
          updatedAt: serializeDate(ticket.preliminaryActions.updatedAt),
        }
      : null,
    closureChecklist: ticket.closureChecklist
      ? {
          ...ticket.closureChecklist,
          infrastructureApprovalPrimary:
            ticket.closureChecklist.infrastructureApprovalPrimary ??
            ticket.closureChecklist.infrastructureApprovedByRafael ??
            false,
          infrastructureApprovalSecondary:
            ticket.closureChecklist.infrastructureApprovalSecondary ??
            ticket.closureChecklist.infrastructureApprovedByFernando ??
            false,
          requesterApprovedAt: serializeDate(ticket.closureChecklist.requesterApprovedAt),
          serviceStartedAt: serializeDate(ticket.closureChecklist.serviceStartedAt),
          serviceCompletedAt: serializeDate(ticket.closureChecklist.serviceCompletedAt),
          closedAt: serializeDate(ticket.closureChecklist.closedAt),
          documents: Array.isArray(ticket.closureChecklist.documents)
            ? ticket.closureChecklist.documents.map(serializeAttachment)
            : [],
        }
      : null,
    attachments: Array.isArray(ticket.attachments)
      ? ticket.attachments.map(serializeAttachment)
      : [],
    guarantee: ticket.guarantee
      ? {
          ...ticket.guarantee,
          startAt: serializeDate(ticket.guarantee.startAt),
          endAt: serializeDate(ticket.guarantee.endAt),
        }
      : null,
    executionProgress: ticket.executionProgress
      ? {
          ...ticket.executionProgress,
          startedAt: serializeDate(ticket.executionProgress.startedAt),
          lastUpdatedAt: serializeDate(ticket.executionProgress.lastUpdatedAt),
        }
      : null,
  };
}

export async function reserveNextTicketId(db) {
  const sequenceRef = db.collection('config').doc('ticketSequence');

  const nextNumber = await db.runTransaction(async transaction => {
    const sequenceSnap = await transaction.get(sequenceRef);
    let current = Number(sequenceSnap.data()?.lastNumber || 0);

    if (!sequenceSnap.exists) {
      current = 0;
    }

    const next = current + 1;
    transaction.set(
      sequenceRef,
      {
        lastNumber: next,
        updatedAt: new Date(),
      },
      { merge: true }
    );
    return next;
  });

  return `OS-${String(nextNumber).padStart(4, '0')}`;
}

/**
 * Mescla entradas novas no histórico deduplicando por `id` (as já presentes são
 * ignoradas). Puro — não toca no banco. Fonte única do "append-preservando-
 * concorrentes" antes copiado em tickets.js e mail.js.
 */
export function mergeTicketHistory(currentHistory, newEntries) {
  const current = Array.isArray(currentHistory) ? currentHistory : [];
  const entries = Array.isArray(newEntries) ? newEntries : [newEntries];
  const existingIds = new Set(current.map(item => item?.id).filter(Boolean));
  const appended = entries.filter(item => item?.id && !existingIds.has(item.id));
  return { merged: appended.length ? [...current, ...appended] : current, appendedCount: appended.length };
}

export function ticketHistoryEntryDocumentId(ticketId, entryId) {
  return `history-${createHash('sha256')
    .update(`${String(ticketId || '')}\u0000${String(entryId || '')}`)
    .digest('base64url')
    .slice(0, 40)}`;
}

// Id estável para uma entrada de histórico. Entradas LEGADAS sem `id` (o próprio
// front tolera) sumiam na migração — o write pulava sem id → some da leitura pós-flag.
// Aqui geramos um id determinístico do conteúdo (idempotente: reprocessar o backfill
// não duplica). Duas entradas idênticas em time+type+sender+text colidem num só doc —
// aceitável (são efetivamente duplicatas).
function ensureHistoryEntryId(entry) {
  const existing = String(entry?.id || '').trim();
  if (existing) return existing;
  const time = toDate(entry?.time);
  const basis = [
    time instanceof Date && !Number.isNaN(time.getTime()) ? time.toISOString() : '',
    entry?.type || '',
    entry?.sender || '',
    entry?.text || '',
  ].join(' ');
  return `legacy-${createHash('sha256').update(basis).digest('base64url').slice(0, 32)}`;
}

/**
 * Referência do doc de UMA entrada na subcoleção (id determinístico). Usado para
 * deduplicar contra a subcoleção: com o array embutido reduzido a uma janela, o
 * cliente pode reenviar entradas antigas (que ele paginou) e elas não estariam
 * mais no embutido — sem esta checagem seriam tratadas como NOVAS e o sanitize
 * reescreveria o `sender` das originais (forja retroativa).
 */
export function ticketHistoryEntryRef(ticketRef, entryId) {
  return ticketRef
    .collection(TICKET_HISTORY_SUBCOLLECTION)
    .doc(ticketHistoryEntryDocumentId(ticketRef.id, entryId));
}

// Janela de entradas mantidas no doc da OS quando a subcoleção já é a fonte da
// verdade. Sem este CORTE, cada escrita regrava o array inteiro no doc e ele segue
// crescendo rumo ao teto de 1 MiB — o próprio motivo da migração. As entradas
// completas vivem na subcoleção; o embutido é só um atalho de leitura recente.
export const EMBEDDED_HISTORY_WINDOW = 50;
export function boundEmbeddedHistory(mergedHistory, subcollectionReady) {
  const list = Array.isArray(mergedHistory) ? mergedHistory : [];
  return subcollectionReady && list.length > EMBEDDED_HISTORY_WINDOW
    ? list.slice(-EMBEDDED_HISTORY_WINDOW)
    : list;
}

function normalizeHistoryEntryForStorage(entry) {
  return stripUndefinedDeep({
    ...entry,
    time: toDate(entry?.time) || new Date(),
    attachments: Array.isArray(entry?.attachments)
      ? entry.attachments.map(normalizeAttachmentForStorage)
      : undefined,
  });
}

/**
 * Espelha entradas na subcoleção paginável do histórico. O ID determinístico
 * torna escrita concorrente/retry idempotente e permite backfill sem duplicar.
 * Durante a migração o array legado continua no documento principal.
 */
export function writeTicketHistoryEntries(tx, ticketRef, entries, now = new Date()) {
  const list = Array.isArray(entries) ? entries : [entries];
  const unique = new Map();
  for (const entry of list) {
    // Gera id para entradas legadas sem id (antes eram puladas → perda de dado).
    const id = ensureHistoryEntryId(entry);
    if (id && !unique.has(id)) unique.set(id, entry);
  }

  for (const [entryId, rawEntry] of unique) {
    const entry = normalizeHistoryEntryForStorage(rawEntry);
    tx.set(
      ticketRef.collection(TICKET_HISTORY_SUBCOLLECTION)
        .doc(ticketHistoryEntryDocumentId(ticketRef.id, entryId)),
      {
        ...entry,
        id: entryId,
        ticketId: ticketRef.id,
        updatedAt: now,
      },
      { merge: true }
    );
  }
  return unique.size;
}

export async function copyTicketHistoryToSubcollection(db, ticketRef, entries, options = {}) {
  const list = Array.isArray(entries) ? entries : [entries];
  const batchSize = Math.min(Math.max(Number(options.batchSize || 300), 1), 400);
  let copied = 0;

  for (let start = 0; start < list.length; start += batchSize) {
    const batch = db.batch();
    copied += writeTicketHistoryEntries(batch, ticketRef, list.slice(start, start + batchSize));
    await batch.commit();
  }
  await ticketRef.set({
    historySubcollectionReady: true,
    historySubcollectionUpdatedAt: new Date(),
  }, { merge: true });
  return copied;
}

export async function readTicketHistoryFromSubcollection(ticketRef, legacyHistory = []) {
  if (!ticketRef) return Array.isArray(legacyHistory) ? legacyHistory : [];
  const snap = await ticketRef.collection(TICKET_HISTORY_SUBCOLLECTION).orderBy('time', 'asc').get();
  if (snap.empty) return Array.isArray(legacyHistory) ? legacyHistory : [];
  return snap.docs.map(doc => {
    const { ticketId: _ticketId, updatedAt: _updatedAt, ...entry } = doc.data() || {};
    return { ...entry, id: entry.id || doc.id };
  });
}

function normalizeHistoryPageLimit(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return 50;
  return Math.min(parsed, 100);
}

function encodeHistoryCursor(timeValue, documentId) {
  const time = toDate(timeValue);
  if (!(time instanceof Date) || Number.isNaN(time.getTime()) || !documentId) return null;
  return Buffer.from(JSON.stringify({ time: time.toISOString(), id: String(documentId) })).toString('base64url');
}

function decodeHistoryCursor(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    const time = new Date(parsed?.time);
    const id = String(parsed?.id || '').trim();
    return !Number.isNaN(time.getTime()) && id ? { time, id } : null;
  } catch {
    return null;
  }
}

/** Lê a timeline nova do mais recente para o mais antigo, com cursor opaco. */
export async function readTicketHistoryPage(ticketRef, options = {}) {
  const limit = normalizeHistoryPageLimit(options.limit);
  const cursor = decodeHistoryCursor(options.cursor);
  let query = ticketRef.collection(TICKET_HISTORY_SUBCOLLECTION)
    .orderBy('time', 'desc')
    .orderBy(FieldPath.documentId(), 'desc')
    .limit(limit + 1);
  if (cursor) query = query.startAfter(cursor.time, cursor.id);

  const snap = await query.get();
  const docs = snap.docs.slice(0, limit);
  const history = docs.map(doc => {
    const { ticketId: _ticketId, updatedAt: _updatedAt, ...entry } = doc.data() || {};
    return { ...entry, id: entry.id || doc.id };
  });
  return {
    history,
    nextCursor: snap.docs.length > limit
      ? encodeHistoryCursor(docs.at(-1)?.data()?.time, docs.at(-1)?.id)
      : null,
  };
}

/**
 * Anexa entradas ao histórico de uma OS de forma ATÔMICA: relê o histórico
 * fresco DENTRO de uma transação e mescla (dedup por id), preservando entradas
 * concorrentes. Retorna quantas entradas foram realmente anexadas (0 = nada novo
 * ou OS inexistente). Usar nos caminhos que NÃO estão dentro de uma transação.
 */
export async function appendTicketHistory(db, ticketRef, newEntries) {
  const entries = (Array.isArray(newEntries) ? newEntries : [newEntries]).filter(Boolean);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ticketRef);
    if (!snap.exists) return 0;
    const ready = snap.data()?.historySubcollectionReady === true;

    // Com o embutido reduzido a uma JANELA, o dedup por array deixa de enxergar
    // entradas antigas. Alguns ids são reutilizados de propósito para idempotência
    // (`mail-<messageId>`, `bounce-<os>-<dia>`): reprocessar inbound antigo numa OS
    // migrada re-anexaria a entrada, inflando o contador de "recuperadas" e pondo
    // uma entrada velha num slot recente da janela. Checa a subcoleção (1-2 docs).
    let candidates = entries;
    if (ready) {
      const withId = entries.filter(entry => entry?.id);
      if (withId.length > 0) {
        const snaps = await tx.getAll(...withId.map(entry => ticketHistoryEntryRef(ticketRef, entry.id)));
        const persisted = new Set(
          withId.filter((_entry, index) => snaps[index]?.exists).map(entry => entry.id)
        );
        candidates = entries.filter(entry => !persisted.has(entry?.id));
      }
    }
    if (candidates.length === 0) return 0;

    const { merged, appendedCount } = mergeTicketHistory(snap.data()?.history, candidates);
    if (!appendedCount) return 0;
    writeTicketHistoryEntries(tx, ticketRef, candidates);
    tx.set(
      ticketRef,
      { history: boundEmbeddedHistory(merged, ready), updatedAt: new Date() },
      { merge: true }
    );
    return appendedCount;
  });
}
