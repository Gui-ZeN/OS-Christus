import {
  describeEmailOutboxType,
  EMAIL_OUTBOX_TYPES,
  isEmailOutboxEligible,
  isEmailOutboxLeaseActive,
  markEmailOutboxDispatchFailure,
  MAX_EMAIL_OUTBOX_ATTEMPTS,
} from './emailOutbox.js';
import { notificationTtlAt } from './notificationState.js';

const DEFAULT_BATCH_SIZE = 8;
// Tamanho de cada página do scan e teto total de documentos varridos por
// execução. O teto existe para o custo de leitura não explodir quando a fila
// tem muito item em backoff; o worker roda a cada 5 min, então o que passar do
// teto entra na execução seguinte (com a fila menor, por já ter drenado).
const SCAN_PAGE_SIZE = 100;
const MAX_TOTAL_SCAN = 1000;

function normalizeBatchSize(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return DEFAULT_BATCH_SIZE;
  return Math.min(parsed, 20);
}

export async function selectEligibleEmailOutbox(db, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const batchSize = normalizeBatchSize(options.batchSize);

  const exhausted = [];
  const eligible = [];

  // Scan PAGINADO por documentId. Antes era um `.limit(100)` sem `orderBy`: o
  // Firestore devolve por id, então eram SEMPRE os mesmos 100 documentos. Bastava
  // esses cem estarem em backoff para os elegíveis atrás deles nunca rodarem —
  // starvation estável, não atraso.
  //
  // Paginar resolve sem campo novo nem índice composto, e portanto sem a
  // armadilha das queries por desigualdade: documento sem o campo não aparece em
  // `where`/`orderBy`, então introduzir `availableAt` agora esconderia os itens
  // legados e sumiria com e-mail em silêncio. Esse caminho fica para depois do
  // backfill, na ordem combinada.
  let cursor = null;
  let scanned = 0;

  while (eligible.length < batchSize && scanned < MAX_TOTAL_SCAN) {
    let query = db
      .collection('emailOutbox')
      .where('status', 'in', ['pending', 'processing', 'failed'])
      .limit(SCAN_PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);

    const snap = await query.get();
    if (snap.empty) break;
    scanned += snap.docs.length;

    for (const doc of snap.docs) {
      const data = doc.data() || {};
      if (Number(data.attempts || 0) >= MAX_EMAIL_OUTBOX_ATTEMPTS) {
        // NÃO marca dead-letter enquanto a lease está ativa: o attempts é incrementado
        // no claim, então um item na última tentativa EM VOO cai aqui. Zerar o
        // leaseToken faria o markSent do envio em curso estourar 409 → o doc ficaria
        // dead-letter apesar de entregue, e o retry manual reenviaria o mesmo e-mail.
        if (isEmailOutboxLeaseActive(data, now)) continue;
        exhausted.push({ ref: doc.ref, data });
        continue;
      }
      if (!isEmailOutboxEligible(data, now)) continue;
      eligible.push({
        id: doc.id,
        // A referência viaja junto para que a falha do DESPACHO tenha onde ser
        // registrada. Sem ela, o worker só sabia reclamar no corpo da resposta HTTP.
        ref: doc.ref,
        ticketId: String(data.ticketId || '').trim(),
        outboxKey: String(data.commandKey || data.id || '').trim(),
      });
      if (eligible.length >= batchSize) break;
    }

    // Última página: não há mais o que varrer.
    if (snap.docs.length < SCAN_PAGE_SIZE) break;
    cursor = snap.docs.at(-1);
  }

  if (exhausted.length > 0) {
    const batch = db.batch();
    for (const item of exhausted) {
      batch.set(item.ref, {
        status: 'dead-letter',
        leaseToken: null,
        leaseAt: null,
        nextAttemptAt: null,
        deadLetterAt: now,
        updatedAt: now,
      }, { merge: true });
      batch.set(db.collection('notifications').doc(`outbox-${item.ref.id}`), {
        type: 'alert',
        ticketId: item.data.ticketId || null,
        title: `Falha definitiva no envio - ${item.data.ticketId || 'Serv3'}`,
        body: `${describeEmailOutboxType(item.data.type)} atingiu o limite de tentativas e precisa de intervenção administrativa.`,
        audienceRoles: ['Admin', 'Gestor'],
        action: item.data.ticketId
          ? item.data.type === EMAIL_OUTBOX_TYPES.FINANCE_PAYMENT
            ? { label: 'Abrir financeiro', view: 'finance', ticketId: item.data.ticketId }
            : { label: 'Abrir OS', view: 'inbox', ticketId: item.data.ticketId }
          : null,
        createdAt: now,
        updatedAt: now,
        ttlAt: notificationTtlAt(now),
      }, { merge: true });
    }
    await batch.commit();
  }

  return {
    eligible: eligible.filter(item => item.ticketId && item.outboxKey),
    // Agora é o total varrido em TODAS as páginas, não o tamanho de uma leitura.
    scanned,
    deadLettered: exhausted.length,
  };
}

export async function processEmailOutboxBatch({
  db,
  dispatch,
  now = undefined,
  batchSize = undefined,
}) {
  const selection = await selectEligibleEmailOutbox(db, { now, batchSize });
  const results = await Promise.all(selection.eligible.map(async item => {
    try {
      const result = await dispatch(item);
      return {
        ...item,
        status: result?.alreadySent ? 'already-sent' : result?.skipped ? 'skipped' : 'sent',
      };
    } catch (error) {
      // GRAVA a falha, não só devolve. Devolver apenas no corpo da resposta HTTP
      // deixou 85 avisos parados por 15 dias com `attempts: 0` — retentados a cada
      // execução e idênticos depois de cada uma — enquanto o Actions somava 277
      // execuções VERDES. Erro que não fica no dado é erro que ninguém encontra.
      await markEmailOutboxDispatchFailure(item.ref, error).catch(() => {});
      return {
        ...item,
        status: 'failed',
        error: String(error?.message || error || 'Falha ao processar e-mail.').slice(0, 500),
      };
    }
  }));

  return {
    ok: true,
    scanned: selection.scanned,
    selected: selection.eligible.length,
    sent: results.filter(item => item.status === 'sent').length,
    alreadySent: results.filter(item => item.status === 'already-sent').length,
    skipped: results.filter(item => item.status === 'skipped').length,
    failed: results.filter(item => item.status === 'failed').length,
    deadLettered: selection.deadLettered,
    results,
  };
}
