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
 */
export async function backfillTicketHistoryBatch(db, options = {}) {
  const limit = normalizeLimit(options.limit);
  const cursor = String(options.cursor || '').trim();
  let query = db.collection('tickets').orderBy(FieldPath.documentId()).limit(limit);
  if (cursor) query = query.startAfter(cursor);

  const snap = await query.get();
  let ticketsWithHistory = 0;
  let copiedEntries = 0;
  for (const doc of snap.docs) {
    const history = Array.isArray(doc.data()?.history) ? doc.data().history : [];
    if (history.length > 0) ticketsWithHistory += 1;
    copiedEntries += await copyTicketHistoryToSubcollection(db, doc.ref, history);
  }

  const last = snap.docs.at(-1);
  return {
    scannedTickets: snap.size,
    ticketsWithHistory,
    copiedEntries,
    nextCursor: snap.size === limit && last ? last.id : null,
  };
}
