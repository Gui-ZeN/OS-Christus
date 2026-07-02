import { HttpError, sendError } from './_lib/http.js';
import { streamDriveFile, verifyAttachmentToken } from './_lib/attachmentProxy.js';

/**
 * Serve um anexo arquivado no Google Drive (OS encerrada há +30d, ver
 * [[Serv3 — Arquivamento de Anexos]]). O arquivo no Drive é privado; aqui a gente
 * valida o token-capacidade e faz stream. Sem login: o token é a credencial
 * (mesmo modelo das URLs de Storage de hoje), porém revogável e com fonte privada.
 *
 * Lê os params direto da URL (não depende de `req.query` ser populado — funciona
 * no Vercel e no adapter local).
 */
export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      throw new HttpError(405, 'Método não permitido.');
    }

    const { searchParams } = new URL(req.url, 'http://localhost');
    const driveFileId = String(searchParams.get('f') || '').trim();
    const token = String(searchParams.get('t') || '').trim();

    if (!driveFileId || !token) {
      throw new HttpError(400, 'Parâmetros obrigatórios ausentes (f, t).');
    }
    if (!verifyAttachmentToken(driveFileId, token)) {
      throw new HttpError(403, 'Token de anexo inválido.');
    }

    await streamDriveFile(driveFileId, res);
  } catch (error) {
    // Se o stream já começou (headers enviados), não dá pra mandar JSON de erro.
    if (res.headersSent) {
      res.end();
      return;
    }
    sendError(res, error);
  }
}
