import { getAdminDb } from './firebaseAdmin.js';

// Quantas entradas de history[] preservar no snapshot de auditoria. A trilha
// COMPLETA vive no doc do ticket; no auditLog só precisamos do contexto recente
// (inclui a entrada recém-adicionada) — sem isto, cada PATCH gravava o history
// inteiro DUAS vezes (before+after), e a partir de ~500 KB de doc o add() estourava
// o teto de 1 MiB/doc do Firestore, matando a trilha JUSTO nas OS mais movimentadas.
const AUDIT_HISTORY_KEEP = 8;
// Margem sob o teto de 1 MiB/doc para os demais campos grandes do snapshot.
const AUDIT_MAX_BYTES = 400 * 1024;

function compactAuditSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const compact = { ...value };
  if (Array.isArray(compact.history) && compact.history.length > AUDIT_HISTORY_KEEP) {
    // Mantém a FORMA (array) — o AuditLogsView lê campos escalares, não o history,
    // então truncar não quebra a UI e ainda captura a mudança recente.
    compact.history = compact.history.slice(-AUDIT_HISTORY_KEEP);
  }
  return compact;
}

function fitAuditSnapshots(before, after) {
  let fittedBefore = compactAuditSnapshot(before);
  let fittedAfter = compactAuditSnapshot(after);
  // Backstop: se ainda passar do limite (outros arrays grandes — attachments,
  // executionProgress…), descarta os snapshots com marcador. Perder o detalhe do
  // before/after é muito melhor que perder o registro de auditoria inteiro.
  try {
    const size = Buffer.byteLength(JSON.stringify({ before: fittedBefore, after: fittedAfter }) || '', 'utf8');
    if (size > AUDIT_MAX_BYTES) {
      fittedBefore = before ? { __audit: 'omitido', reason: 'oversize' } : null;
      fittedAfter = after ? { __audit: 'omitido', reason: 'oversize' } : null;
    }
  } catch {
    // JSON circular / falha de serialização não pode derrubar a auditoria.
  }
  return { before: fittedBefore, after: fittedAfter };
}

export async function writeAuditLog(entry) {
  try {
    const db = getAdminDb();
    const { before, after } = fitAuditSnapshots(entry.before || null, entry.after || null);
    await db.collection('auditLogs').add({
      actor: entry.actor || 'sistema',
      action: entry.action || 'unknown',
      entity: entry.entity || 'unknown',
      entityId: entry.entityId || null,
      before,
      after,
      metadata: entry.metadata || null,
      createdAt: new Date(),
    });
  } catch (error) {
    // Auditoria não deve quebrar o fluxo principal — mas o erro PRECISA deixar
    // rastro nos logs (senão uma trilha de auditoria perdida passa despercebida).
    console.error('[auditLogs] falha ao gravar log de auditoria', entry?.action, error);
  }
}
