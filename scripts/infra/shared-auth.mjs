import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Storage } from '@google-cloud/storage';

export function resolveCredentialsPath() {
  return (
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
    path.resolve(process.cwd(), '.secrets', 'firebase-admin.json')
  );
}

export function readServiceAccount(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Service account não encontrada em: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export function createStorageClient(serviceAccount, projectId) {
  return new Storage({
    projectId,
    credentials: {
      client_email: serviceAccount.client_email,
      private_key: serviceAccount.private_key,
    },
  });
}
