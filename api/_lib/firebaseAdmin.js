import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

function parseServiceAccountFromEnv() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (b64) {
    const decoded = Buffer.from(b64, 'base64').toString('utf8');
    return JSON.parse(decoded);
  }

  const raw = requiredEnv('FIREBASE_SERVICE_ACCOUNT_JSON');
  const normalized = raw.replace(/\\n/g, '\n');
  return JSON.parse(normalized);
}

export function getAdminDb() {
  if (getApps().length === 0) {
    const serviceAccount = parseServiceAccountFromEnv();
    const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id;
    initializeApp({
      credential: cert(serviceAccount),
      projectId,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined,
    });
  }
  return getFirestore();
}
