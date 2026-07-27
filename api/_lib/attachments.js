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

function startsWith(buffer, bytes) {
  return Buffer.isBuffer(buffer) && buffer.length >= bytes.length && bytes.every((byte, index) => buffer[index] === byte);
}

function containsAscii(buffer, value) {
  return Buffer.isBuffer(buffer) && buffer.includes(Buffer.from(value, 'utf8'));
}

function isUtf8Text(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.includes(0)) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

/**
 * Identifica a família do arquivo pelo conteúdo, sem confiar no MIME enviado
 * pelo navegador. Não é antivírus: serve para impedir binários disfarçados de
 * imagem/PDF/documento antes que cheguem ao Storage.
 */
export function detectAttachmentContent(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return 'unknown';
  if (startsWith(buffer, [0xFF, 0xD8, 0xFF])) return 'jpeg';
  if (startsWith(buffer, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return 'png';
  if (startsWith(buffer, [...Buffer.from('GIF87a')]) || startsWith(buffer, [...Buffer.from('GIF89a')])) return 'gif';
  if (startsWith(buffer, [...Buffer.from('RIFF')]) && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp';
  if (startsWith(buffer, [0x42, 0x4D])) return 'bmp';
  if (startsWith(buffer, [0x49, 0x49, 0x2A, 0x00]) || startsWith(buffer, [0x4D, 0x4D, 0x00, 0x2A])) return 'tiff';
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.subarray(8, 16).toString('ascii').toLowerCase();
    if (/hei[cf]|heix|hevc|mif1|msf1/.test(brand)) return 'heif';
  }
  if (startsWith(buffer, [...Buffer.from('%PDF-')])) return 'pdf';
  if (startsWith(buffer, [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])) return 'office-legacy';
  if (startsWith(buffer, [0x50, 0x4B, 0x03, 0x04])) {
    if (!containsAscii(buffer, '[Content_Types].xml')) return 'zip';
    if (containsAscii(buffer, 'word/')) return 'docx';
    if (containsAscii(buffer, 'xl/')) return 'xlsx';
    if (containsAscii(buffer, 'ppt/')) return 'pptx';
    return 'zip';
  }
  if (isUtf8Text(buffer)) return 'text';
  return 'unknown';
}

const MIME_CONTENT_FAMILIES = Object.freeze({
  'image/jpeg': new Set(['jpeg']),
  'image/jpg': new Set(['jpeg']),
  'image/png': new Set(['png']),
  'image/gif': new Set(['gif']),
  'image/webp': new Set(['webp']),
  'image/bmp': new Set(['bmp']),
  'image/tiff': new Set(['tiff']),
  'image/heic': new Set(['heif']),
  'image/heif': new Set(['heif']),
  'application/pdf': new Set(['pdf']),
  'application/msword': new Set(['office-legacy']),
  'application/vnd.ms-excel': new Set(['office-legacy']),
  'application/vnd.ms-powerpoint': new Set(['office-legacy']),
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': new Set(['docx']),
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': new Set(['xlsx']),
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': new Set(['pptx']),
  'text/plain': new Set(['text']),
  'text/csv': new Set(['text']),
});

export function isAttachmentContentCompatible(buffer, mimeType) {
  const expected = MIME_CONTENT_FAMILIES[normalizeMimeType(mimeType)];
  return Boolean(expected?.has(detectAttachmentContent(buffer)));
}

/** Valida MIME declarado e assinatura/conteúdo real antes do upload. */
export function assertAllowedAttachmentContent(buffer, mimeType, filename) {
  const normalized = assertAllowedAttachmentMime(mimeType, filename);
  if (!isAttachmentContentCompatible(buffer, normalized)) {
    const label = filename ? `"${filename}"` : 'enviado';
    throw new HttpError(
      400,
      `O conteúdo do arquivo ${label} não corresponde ao tipo informado. Envie um arquivo válido.`
    );
  }
  return normalized;
}
