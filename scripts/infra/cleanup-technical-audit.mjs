import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readServiceAccount } from './shared-auth.mjs';

const credentialsPath =
  process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
  'C:/Users/M7QO/Downloads/os-christus-firebase-adminsdk-fbsvc-ae0417d86f.json';

const serviceAccount = readServiceAccount(credentialsPath);

if (getApps().length === 0) {
  initializeApp({
    credential: cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });
}

const db = getFirestore();
const technicalActions = new Set(['system.bootstrap', 'firestore.backfill_legacy', 'firebase.auth-pending']);
const technicalEntities = new Set(['firebase', 'firestore.legacy']);

const snapshot = await db.collection('auditLogs').get();
const docsToDelete = snapshot.docs.filter(doc => {
  const data = doc.data();
  const action = String(data.action || '').trim();
  const entity = String(data.entity || '').trim();
  return technicalActions.has(action) || technicalEntities.has(entity);
});

let removed = 0;
for (let index = 0; index < docsToDelete.length; index += 400) {
  const chunk = docsToDelete.slice(index, index + 400);
  const batch = db.batch();
  for (const doc of chunk) {
    batch.delete(doc.ref);
  }
  await batch.commit();
  removed += chunk.length;
}

console.log(JSON.stringify({ ok: true, removed }, null, 2));
