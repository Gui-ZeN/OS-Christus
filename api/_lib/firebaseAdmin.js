import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

export function parseServiceAccountFromEnv() {
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
    // Dev local: com FIRESTORE_EMULATOR_HOST setado, o firebase-admin fala só
    // com o emulador e dispensa service account real. Inócuo em produção.
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      const projectId = process.env.FIREBASE_PROJECT_ID || 'os-christus';
      // ⚠️ O BUCKET TAMBÉM NO EMULADOR.
      //
      // Sem `storageBucket` aqui, toda chamada ao Storage falhava com "Bucket name
      // not specified or invalid" — dez vezes numa execução do CI. E os testes
      // PASSAVAM: eles afirmam que a referência saiu do Firestore, e a remoção do
      // arquivo no bucket só virava um aviso no log ("referência removida, mas o
      // objeto permaneceu no bucket").
      //
      // Ou seja, a cascata para o Storage — a parte que de fato apaga o anexo —
      // nunca era exercitada. Se ela quebrasse em produção, um anexo "excluído"
      // continuaria baixável e nenhum teste reclamaria.
      initializeApp({
        projectId,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
      });
    } else {
      const serviceAccount = parseServiceAccountFromEnv();
      const projectId = process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id;
      initializeApp({
        credential: cert(serviceAccount),
        projectId,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || undefined,
      });
    }
  }
  return getFirestore();
}
