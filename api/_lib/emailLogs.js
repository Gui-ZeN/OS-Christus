import { getAdminDb } from './firebaseAdmin.js';

export async function logEmailEvent(event) {
  try {
    const db = getAdminDb();
    await db.collection('emailEvents').add({
      createdAt: new Date(),
      ...event,
    });
  } catch {
    // Não interrompe o fluxo principal.
  }
}
