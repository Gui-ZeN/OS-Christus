import process from 'node:process';
import { createStorageClient, readServiceAccount, resolveCredentialsPath } from './shared-auth.mjs';

async function main() {
  const credentialsPath = resolveCredentialsPath();
  const serviceAccount = readServiceAccount(credentialsPath);
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || serviceAccount.project_id;
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET?.trim() || `${projectId}-attachments`;

  const storage = createStorageClient(serviceAccount, projectId);
  const bucket = storage.bucket(bucketName);
  const [exists] = await bucket.exists();

  if (!exists) {
    throw new Error(`Bucket não encontrado: ${bucketName}`);
  }

  const [files] = await bucket.getFiles({ prefix: 'attachments/' });
  const [metadata] = await bucket.getMetadata();

  console.log(`Projeto: ${projectId}`);
  console.log(`Bucket: ${bucketName}`);
  console.log(`Arquivos em attachments/: ${files.length}`);
  console.log('CORS:');
  console.log(JSON.stringify(metadata.cors || [], null, 2));
}

main().catch(error => {
  console.error('Falha ao validar Storage:', error.message);
  process.exitCode = 1;
});
