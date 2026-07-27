import { google } from 'googleapis';
import { HttpError } from './http.js';
import { parseServiceAccountFromEnv } from './firebaseAdmin.js';

/**
 * Streaming de anexos arquivados no Google Drive. A autorização acontece no
 * endpoint `api/attachments.js`, antes desta função ser chamada.
 */

// Cliente Drive memoizado e somente leitura. A service account precisa ter acesso
// ao Shared Drive onde os anexos arquivados são mantidos.
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
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
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
  const filename = String(name || 'anexo').replace(/[\r\n"]/g, '').trim().slice(0, 180) || 'anexo';
  const asciiFilename = filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '_');
  const contentType = mimeType || 'application/octet-stream';
  const inline = (contentType.startsWith('image/') && contentType !== 'image/svg+xml') || contentType === 'application/pdf';

  const media = await drive.files.get(
    { fileId: driveFileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );

  res.statusCode = 200;
  res.setHeader('Content-Type', contentType);
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  await new Promise((resolve, reject) => {
    media.data.on('end', resolve).on('error', reject).pipe(res);
  });
}
