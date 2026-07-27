import { FieldPath } from 'firebase-admin/firestore';
import { copyTicketHistoryToSubcollection } from './tickets.js';

function normalizeLimit(value) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) return 25;
  return Math.min(parsed, 50);
}

/**
 * Copia um lote do `history[]` legado para a subcoleção. Pode ser chamado
 * repetidamente com o cursor devolvido; entradas usam ID determinístico e o
 * processo é idempotente.
 *
 * `dryRun: true` NÃO escreve nada — só inspeciona e devolve o que aconteceria.
 * Use antes de rodar em produção: o relatório mostra quantas OS faltam migrar,
 * quantas entradas seriam copiadas e, principalmente, quantas entradas LEGADAS
 * SEM `id` existem (elas ganham id determinístico derivado do conteúdo; antes de
 * `ensureHistoryEntryId` eram descartadas silenciosamente e sumiam da leitura
 * depois que a flag ligava).
 */
export async function backfillTicketHistoryBatch(db, options = {}) {
  const limit = normalizeLimit(options.limit);
  const cursor = String(options.cursor || '').trim();
  const dryRun = options.dryRun === true;

  let query = db.collection('tickets').orderBy(FieldPath.documentId()).limit(limit);
  if (cursor) query = query.startAfter(cursor);

  const snap = await query.get();
  let ticketsWithHistory = 0;
  let alreadyMigrated = 0;
  let pendingTickets = 0;
  let entriesToCopy = 0;
  let copiedEntries = 0;
  let entriesWithoutId = 0;
  let largestHistory = 0;
  const sample = [];

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    const history = Array.isArray(data.history) ? data.history : [];
    if (history.length > 0) ticketsWithHistory += 1;
    if (history.length > largestHistory) largestHistory = history.length;

    // A flag só é ligada DEPOIS da cópia completa, então `ready` implica subcoleção
    // íntegra: pular é seguro e torna o backfill retomável/barato em re-execuções.
    if (data.historySubcollectionReady === true) {
      alreadyMigrated += 1;
      continue;
    }

    pendingTickets += 1;
    const missingId = history.filter(entry => !String(entry?.id || '').trim()).length;
    entriesWithoutId += missingId;
    entriesToCopy += history.length;

    if (dryRun) {
      if (sample.length < 10) {
        sample.push({ ticketId: doc.id, entries: history.length, entriesWithoutId: missingId });
      }
      continue;
    }

    copiedEntries += await copyTicketHistoryToSubcollection(db, doc.ref, history);
  }

  const last = snap.docs.at(-1);
  return {
    dryRun,
    scannedTickets: snap.size,
    ticketsWithHistory,
    alreadyMigrated,
    pendingTickets,
    entriesToCopy,
    copiedEntries,
    entriesWithoutId,
    largestHistory,
    ...(dryRun ? { sample } : {}),
    nextCursor: snap.size === limit && last ? last.id : null,
  };
}
