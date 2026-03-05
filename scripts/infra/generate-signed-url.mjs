import crypto from 'node:crypto';
import path from 'node:path';
import process from 'node:process';
import { createStorageClient, readServiceAccount, resolveCredentialsPath } from './shared-auth.mjs';

function ensureEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Variável obrigatória ausente: ${name}`);
  }
  return value;
}

function sanitizeName(fileName) {
  return fileName.replace(/[^\w.\-]/g, '_');
}

async function main() {
  const credentialsPath = resolveCredentialsPath();
  const serviceAccount = readServiceAccount(credentialsPath);

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || serviceAccount.project_id;
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET?.trim() || `${projectId}-attachments`;
  const mode = (process.env.STORAGE_SIGN_MODE || 'upload').trim().toLowerCase();

  const ticketId = ensureEnv('TICKET_ID');
  const fileName = ensureEnv('FILE_NAME');
  const mimeType = process.env.FILE_MIME_TYPE?.trim() || 'application/octet-stream';
  const expiresMinutes = Number(process.env.SIGNED_URL_EXPIRES_MIN || '15');

  const safeFileName = sanitizeName(path.basename(fileName));
  const nonce = crypto.randomUUID().slice(0, 8);
  const objectPath =
    process.env.STORAGE_OBJECT_PATH?.trim() ||
    `attachments/tickets/pdfs/${ticketId}/${Date.now()}-${nonce}-${safeFileName}`;

  const storage = createStorageClient(serviceAccount, projectId);
  const file = storage.bucket(bucketName).file(objectPath);
  const expires = Date.now() + expiresMinutes * 60 * 1000;

  if (mode === 'upload') {
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires,
      contentType: mimeType,
    });
    console.log(
      JSON.stringify(
        {
          mode,
          bucket: bucketName,
          objectPath,
          contentType: mimeType,
          expiresAt: new Date(expires).toISOString(),
          signedUrl: url,
        },
        null,
        2
      )
    );
    return;
  }

  if (mode === 'download') {
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires,
    });
    console.log(
      JSON.stringify(
        {
          mode,
          bucket: bucketName,
          objectPath,
          expiresAt: new Date(expires).toISOString(),
          signedUrl: url,
        },
        null,
        2
      )
    );
    return;
  }

  throw new Error(`Modo inválido: ${mode}. Use "upload" ou "download".`);
}

main().catch(error => {
  console.error('Falha ao gerar signed URL:', error.message);
  process.exitCode = 1;
});
