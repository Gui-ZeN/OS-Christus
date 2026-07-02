import { createHmac, timingSafeEqual } from 'node:crypto';
import { google } from 'googleapis';
import { HttpError } from './http.js';
import { parseServiceAccountFromEnv } from './firebaseAdmin.js';

/**
 * Proxy de anexos arquivados no Google Drive (modelo "token-capacidade", ver
 * [[Serv3 — Arquivamento de Anexos]]).
 *
 * Depois que um anexo de OS encerrada é movido pro Drive e apagado do Storage, o
 * `url` do anexo passa a apontar pra `/api/attachments?f=<driveFileId>&t=<token>`.
 * O arquivo no Drive fica PRIVADO (só a service account alcança); o Serv3 é quem
 * serve, validando um token assinado (HMAC) e não-adivinhável — mesmo "nível de
 * porta" das URLs de hoje (quem tem a URL abre), porém revogável (basta girar o
 * segredo) e com o arquivo-fonte privado. Determinístico (sem expiração) pra a URL
 * poder ficar gravada, igual às URLs longas de hoje.
 */

function getProxySecret() {
  const secret = process.env.ATTACHMENT_PROXY_SECRET;
  if (!secret) {
    throw new HttpError(500, 'ATTACHMENT_PROXY_SECRET não configurado no servidor.');
  }
  return secret;
}

/** Token determinístico e não-adivinhável de um arquivo do Drive. */
export function signAttachmentToken(driveFileId) {
  return createHmac('sha256', getProxySecret()).update(String(driveFileId)).digest('base64url');
}

/** Confere o token em tempo constante. Retorna false (nunca lança) em token inválido. */
export function verifyAttachmentToken(driveFileId, token) {
  if (!driveFileId || !token) return false;
  const expected = Buffer.from(signAttachmentToken(driveFileId));
  const provided = Buffer.from(String(token));
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

/** URL do proxy pra gravar no `url` do anexo (usado pelo job de migração — F2). */
export function buildAttachmentProxyUrl(driveFileId) {
  return `/api/attachments?f=${encodeURIComponent(driveFileId)}&t=${signAttachmentToken(driveFileId)}`;
}

// Cliente Drive memoizado. Escopo `drive` (o job de migração escreve; o proxy só lê,
// mas compartilham o cliente). A service account precisa ter acesso ao Shared Drive.
let driveClient = null;
function getDriveClient() {
  if (driveClient) return driveClient;
  let serviceAccount;
  try {
    serviceAccount = parseServiceAccountFromEnv();
  } catch {
    throw new HttpError(500, 'Google Drive não configurado (service account ausente).');
  }
  const auth = new google.auth.JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  driveClient = google.drive({ version: 'v3', auth });
  return driveClient;
}

/**
 * Faz stream de um arquivo do Drive direto pro `res` (proxy). Seta content-type e
 * nome a partir dos metadados do Drive. `supportsAllDrives` habilita Shared Drives.
 */
export async function streamDriveFile(driveFileId, res) {
  const drive = getDriveClient();

  const meta = await drive.files.get({
    fileId: driveFileId,
    fields: 'name,mimeType',
    supportsAllDrives: true,
  });
  const { name, mimeType } = meta.data;

  const media = await drive.files.get(
    { fileId: driveFileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );

  res.statusCode = 200;
  res.setHeader('Content-Type', mimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(name || 'anexo')}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');

  await new Promise((resolve, reject) => {
    media.data.on('end', resolve).on('error', reject).pipe(res);
  });
}
