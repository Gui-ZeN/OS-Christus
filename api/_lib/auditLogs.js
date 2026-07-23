import { getAdminDb } from './firebaseAdmin.js';

export async function writeAuditLog(entry) {
  try {
    const db = getAdminDb();
    await db.collection('auditLogs').add({
      actor: entry.actor || 'sistema',
      action: entry.action || 'unknown',
      entity: entry.entity || 'unknown',
      entityId: entry.entityId || null,
      before: entry.before || null,
      after: entry.after || null,
      metadata: entry.metadata || null,
      createdAt: new Date(),
    });
  } catch (error) {
    // Auditoria não deve quebrar o fluxo principal — mas o erro PRECISA deixar
    // rastro nos logs (senão uma trilha de auditoria perdida passa despercebida).
    console.error('[auditLogs] falha ao gravar log de auditoria', entry?.action, error);
  }
}
