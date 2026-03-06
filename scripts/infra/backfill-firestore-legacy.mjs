import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { runFirestoreLegacyBackfill } from '../../api/_lib/firestoreBackfill.js';
import { readServiceAccount, resolveCredentialsPath } from './shared-auth.mjs';

async function main() {
  const credentialsPath = resolveCredentialsPath();
  const serviceAccount = readServiceAccount(credentialsPath);

  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id,
    });
  }

  const db = getFirestore();
  const result = await runFirestoreLegacyBackfill(db, 'system-migration');

  console.log(
    JSON.stringify(
      {
        ok: true,
        ...result,
      },
      null,
      2
    )
  );
}

main().catch(error => {
  console.error(JSON.stringify({ ok: false, error: error.message, stack: error.stack }, null, 2));
  process.exit(1);
});
