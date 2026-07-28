import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  LIFECYCLE_TICKET_IDS,
  seedLifecycleFixtures,
} from '../../scripts/dev/lifecycle-fixtures.mjs';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'os-christus';
const APP_NAME = 'serv3-playwright-lifecycle';

function getLifecycleDb() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('FIRESTORE_EMULATOR_HOST é obrigatório para o E2E de ciclo de vida.');
  }

  const app =
    getApps().find(candidate => candidate.name === APP_NAME) ||
    initializeApp({ projectId: PROJECT_ID }, APP_NAME);
  return getFirestore(app);
}

export async function resetLifecycleFixtures() {
  const db = getLifecycleDb();
  await seedLifecycleFixtures(db);
}

export async function readTicketState(ticketId: string) {
  const snapshot = await getLifecycleDb().collection('tickets').doc(ticketId).get();
  return snapshot.exists ? snapshot.data() : null;
}

export async function readTicketRecord(
  ticketId: string,
  collection: string,
  documentId: string
) {
  const snapshot = await getLifecycleDb()
    .collection('tickets')
    .doc(ticketId)
    .collection(collection)
    .doc(documentId)
    .get();
  return snapshot.exists ? snapshot.data() : null;
}

export async function readTicketRecords(ticketId: string, collection: string) {
  const snapshot = await getLifecycleDb()
    .collection('tickets')
    .doc(ticketId)
    .collection(collection)
    .get();
  // Record<string, any>: o spread de doc.data() perde os campos na inferência e os
  // testes precisam ler atributos do domínio (status, value, ...) sem cast em cada uso.
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as Record<string, any>);
}

export { LIFECYCLE_TICKET_IDS };
