import { HttpError } from './http.js';

// Allow-list de tipos MIME aceitos para anexos. Bloqueia explicitamente
// conteúdo executável/renderizável (SVG, HTML, JS) que poderia virar XSS
// armazenado quando servido inline pelo Storage.
export const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  // Imagens (sem SVG, que pode carregar script)
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
  'image/heic',
  'image/heif',
  // Documentos
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
]);

export function normalizeMimeType(mimeType) {
  return String(mimeType || '')
    .split(';')[0]
    .trim()
    .toLowerCase();
}

export function isAllowedAttachmentMime(mimeType) {
  return ALLOWED_ATTACHMENT_MIME_TYPES.has(normalizeMimeType(mimeType));
}

/**
 * Valida o tipo MIME de um anexo e retorna o valor canônico (minúsculo, sem
 * parâmetros). Lança HttpError 400 quando o tipo não é permitido.
 */
export function assertAllowedAttachmentMime(mimeType, filename) {
  const normalized = normalizeMimeType(mimeType);
  if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(normalized)) {
    const label = filename ? `"${filename}"` : 'enviado';
    throw new HttpError(
      400,
      `Tipo de arquivo ${label} não permitido. Envie imagens, PDF ou documentos do Office.`
    );
  }
  return normalized;
}
