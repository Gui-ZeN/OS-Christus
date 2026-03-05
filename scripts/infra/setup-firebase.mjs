import process from 'node:process';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { createStorageClient, readServiceAccount, resolveCredentialsPath } from './shared-auth.mjs';

async function resolveBucketName(storage, projectId) {
  const explicit = process.env.FIREBASE_STORAGE_BUCKET?.trim();
  const allowCreate = process.env.FIREBASE_ALLOW_BUCKET_CREATE === 'true';
  const location = process.env.FIREBASE_BUCKET_LOCATION?.trim() || 'us-central1';
  if (explicit) return explicit;

  const candidates = [
    `${projectId}.appspot.com`,
    `${projectId}.firebasestorage.app`,
  ];

  for (const name of candidates) {
    const [exists] = await storage.bucket(name).exists();
    if (exists) return name;
  }

  const [buckets] = await storage.getBuckets({ prefix: projectId });
  if (buckets.length > 0) return buckets[0].name;

  if (allowCreate) {
    const newBucketName = `${projectId}-attachments`;
    await storage.createBucket(newBucketName, {
      location,
      uniformBucketLevelAccess: true,
    });
    return newBucketName;
  }

  throw new Error(
    `Nenhum bucket encontrado para o projeto ${projectId}. ` +
      'Defina FIREBASE_STORAGE_BUCKET para usar um bucket existente ' +
      'ou use FIREBASE_ALLOW_BUCKET_CREATE=true para criar automaticamente.'
  );
}

async function ensurePlaceholderFiles(bucket) {
  const files = [
    'attachments/tickets/images/.keep',
    'attachments/tickets/pdfs/.keep',
    'attachments/contracts/.keep',
    'attachments/quotes/.keep',
  ];

  for (const name of files) {
    const file = bucket.file(name);
    const [exists] = await file.exists();
    if (!exists) {
      await file.save('', { resumable: false, contentType: 'text/plain' });
    }
  }
}

async function ensureCors(bucket) {
  const origins = (process.env.FIREBASE_CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

  await bucket.setCorsConfiguration([
    {
      origin: origins,
      method: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
      responseHeader: ['Content-Type', 'Authorization', 'x-goog-meta-*'],
      maxAgeSeconds: 3600,
    },
  ]);
}

async function ensureFirestoreConfig(projectId) {
  const db = getFirestore();
  const now = FieldValue.serverTimestamp();

  await db.collection('config').doc('system').set(
    {
      projectId,
      updatedAt: now,
      workflowVersion: 'v1',
    },
    { merge: true }
  );

  await db.collection('config').doc('presence').set(
    {
      heartbeatSeconds: 30,
      ttlSeconds: 90,
      updatedAt: now,
    },
    { merge: true }
  );

  await db.collection('config').doc('attachments').set(
    {
      maxImageMb: 8,
      maxPdfMb: 20,
      allowedImageTypes: ['image/jpeg', 'image/png', 'image/webp'],
      allowedPdfTypes: ['application/pdf'],
      updatedAt: now,
    },
    { merge: true }
  );
}

async function main() {
  const credentialsPath = resolveCredentialsPath();
  const serviceAccount = readServiceAccount(credentialsPath);
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || serviceAccount.project_id;
  const skipStorage = process.env.FIREBASE_SKIP_STORAGE === 'true';
  const skipFirestore = process.env.FIREBASE_SKIP_FIRESTORE === 'true';

  if (!projectId) {
    throw new Error('FIREBASE_PROJECT_ID não definido e project_id ausente na service account.');
  }

  const storage = createStorageClient(serviceAccount, projectId);

  let bucketName = process.env.FIREBASE_STORAGE_BUCKET?.trim() || null;
  if (!skipStorage) {
    bucketName = await resolveBucketName(storage, projectId);
  }

  if (getApps().length === 0) {
    initializeApp({
      credential: cert(serviceAccount),
      storageBucket: bucketName || undefined,
      projectId,
    });
  }

  if (bucketName) {
    const bucket = storage.bucket(bucketName);
    await ensurePlaceholderFiles(bucket);
    await ensureCors(bucket);
  }
  if (!skipFirestore) {
    await ensureFirestoreConfig(projectId);
  }

  console.log('Infra Firebase provisionada com sucesso.');
  console.log(`Projeto: ${projectId}`);
  console.log(`Bucket: ${bucketName || 'não configurado (storage pulado)'}`);
  if (skipFirestore) {
    console.log('Firestore: pulado');
  }
}

main().catch(error => {
  console.error('Falha ao provisionar Firebase:', error.message);
  process.exitCode = 1;
});
