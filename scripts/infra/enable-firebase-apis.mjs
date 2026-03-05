import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { JWT } from 'google-auth-library';

function resolveCredentialsPath() {
  return (
    process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim() ||
    path.resolve(process.cwd(), '.secrets', 'firebase-admin.json')
  );
}

function readServiceAccount(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Service account não encontrada em: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function callJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function main() {
  const credentialsPath = resolveCredentialsPath();
  const serviceAccount = readServiceAccount(credentialsPath);
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim() || serviceAccount.project_id;

  const auth = new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const { token } = await auth.getAccessToken();
  if (!token) throw new Error('Falha ao obter access token.');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const project = await callJson(
    `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`,
    { method: 'GET', headers }
  );
  const projectNumber = String(project.projectNumber);

  const services = [
    'serviceusage.googleapis.com',
    'firestore.googleapis.com',
    'storage.googleapis.com',
    'firebase.googleapis.com',
    'firebasestorage.googleapis.com',
  ];

  for (const service of services) {
    const url = `https://serviceusage.googleapis.com/v1/projects/${projectNumber}/services/${service}:enable`;
    try {
      await callJson(url, { method: 'POST', headers });
      console.log(`API habilitada: ${service}`);
    } catch (error) {
      const message = String(error.message || error);
      if (message.includes('already enabled')) {
        console.log(`API já habilitada: ${service}`);
        continue;
      }
      console.log(`Falha ao habilitar ${service}: ${message}`);
    }
  }
}

main().catch(error => {
  console.error('Falha ao habilitar APIs Firebase:', error.message);
  process.exitCode = 1;
});
