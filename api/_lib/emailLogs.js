import { getAdminDb } from './firebaseAdmin.js';

// Retenção dos logs de e-mail: ~90 dias. Grava `ttlAt` para que uma TTL policy
// do Firestore (campo `ttlAt`) apague os registros antigos automaticamente, sem
// custo de leitura/delete. A coleção cresce ~1.400 docs/dia.
const EMAIL_EVENT_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export async function logEmailEvent(event) {
  try {
    const db = getAdminDb();
    const now = new Date();
    await db.collection('emailEvents').add({
      createdAt: now,
      ttlAt: new Date(now.getTime() + EMAIL_EVENT_TTL_MS),
      ...event,
    });
  } catch (error) {
    // Não interrompe o fluxo principal, mas registra: sem isto, perder um evento
    // de e-mail (a observabilidade da inbox) some sem rastro.
    console.error('[emailLogs] falha ao registrar evento de e-mail', event?.type, event?.status, error);
  }
}
