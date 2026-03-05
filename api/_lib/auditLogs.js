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
  } catch {
    // Auditoria nao deve quebrar o fluxo principal.
  }
}
