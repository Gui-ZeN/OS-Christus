import {
  describeEmailOutboxType,
  EMAIL_OUTBOX_TYPES,
  isEmailOutboxEligible,
  isEmailOutboxLeaseActive,
  MAX_EMAIL_OUTBOX_ATTEMPTS,
} from './emailOutbox.js';

const DEFAULT_BATCH_SIZE = 8;
const MAX_SCAN_SIZE = 100;

function normalizeBatchSize(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return DEFAULT_BATCH_SIZE;
  return Math.min(parsed, 20);
}

export async function selectEligibleEmailOutbox(db, options = {}) {
  const now = options.now instanceof Date ? options.now : new Date();
  const batchSize = normalizeBatchSize(options.batchSize);
  const snap = await db
    .collection('emailOutbox')
    .where('status', 'in', ['pending', 'processing', 'failed'])
    .limit(MAX_SCAN_SIZE)
    .get();

  const exhausted = [];
  const eligible = [];
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
      ticketId: String(data.ticketId || '').trim(),
      outboxKey: String(data.commandKey || data.id || '').trim(),
    });
    if (eligible.length >= batchSize) break;
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
      }, { merge: true });
    }
    await batch.commit();
  }

  return {
    eligible: eligible.filter(item => item.ticketId && item.outboxKey),
    scanned: snap.size,
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
