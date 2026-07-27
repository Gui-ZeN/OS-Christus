const ATTACHMENT_PATH_KEYS = new Set([
  'path',
  'attachmentPath',
  'signedFilePath',
]);

const ATTACHMENT_NAME_KEYS = [
  'name',
  'filename',
  'attachmentName',
  'signedFileName',
];

const ATTACHMENT_CONTENT_TYPE_KEYS = [
  'contentType',
  'mimeType',
  'signedFileContentType',
];

function firstString(source, keys) {
  for (const key of keys) {
    const value = String(source?.[key] || '').trim();
    if (value) return value;
  }
  return '';
}

export function isAttachmentPathInTicketScope(path, ticketId) {
  const normalizedPath = String(path || '').trim();
  const normalizedTicketId = String(ticketId || '').trim();
  if (!normalizedPath || !normalizedTicketId || normalizedPath.includes('\\')) return false;
  const parts = normalizedPath.split('/');
  return (
    parts.length > 4 &&
    parts[0] === 'attachments' &&
    parts[1] === 'tickets' &&
    parts[3] === normalizedTicketId &&
    parts.every(part => part && part !== '.' && part !== '..')
  );
}

/**
 * Pastas de anexo que um papel NÃO pode LER. A restrição por papel existia só no
 * upload (Diretor limitado a `message`); na leitura qualquer papel com acesso à OS
 * baixava qualquer anexo dela — inclusive financeiro.
 *
 * A matriz é derivada do que cada tela realmente abre: o Diretor opera apenas o
 * Painel da Diretoria, onde precisa do parecer técnico, do PDF da cotação e do
 * contrato (é o que ele aprova — bloquear travaria a aprovação). Financeiro
 * (pagamentos/medições) é do FinanceView, que ele não acessa. Admin e Gestor
 * operam o fluxo inteiro e seguem sem restrição de pasta (o escopo territorial
 * continua sendo aplicado à parte, por OS).
 */
const ROLE_ALLOWED_ATTACHMENT_FOLDERS = {
  // Allow-list (não deny-list): uma pasta NOVA nasce negada para o Diretor em vez de
  // legível por omissão. `pdfs`/`images` entram porque guardam anexos legados e
  // documentos de encerramento — o parecer técnico antigo pode estar ali.
  Diretor: new Set(['quotes', 'contracts', 'messages', 'pdfs', 'images', 'inbound']),
};

export function canRoleReadAttachmentPath(role, path) {
  const allowed = ROLE_ALLOWED_ATTACHMENT_FOLDERS[String(role || '').trim()];
  // Papel sem restrição declarada (Admin/Gestor) opera o fluxo inteiro. O gate de
  // papel do endpoint (requireUserWithRoles) já barrou quem não pode nem chegar aqui.
  if (!allowed) return true;
  // attachments/tickets/<pasta>/<ticketId>/... — o formato já foi validado por
  // isAttachmentPathInTicketScope. Normaliza o caso para não depender da grafia.
  const folder = String(path || '').split('/')[2]?.toLowerCase() || '';
  return allowed.has(folder);
}

export function findAttachmentReference(value, locator, seen = new Set()) {
  if (!value || typeof value !== 'object') return null;
  if (seen.has(value)) return null;
  seen.add(value);

  if (!Array.isArray(value)) {
    const matchingPathKey = [...ATTACHMENT_PATH_KEYS].find(
      key => String(value[key] || '').trim() === locator.path
    );
    const sourceDriveFileId = String(value.driveFileId || '').trim();
    const driveMatches = !locator.driveFileId || sourceDriveFileId === locator.driveFileId;
    if (matchingPathKey && driveMatches) {
      return {
        path: locator.path,
        driveFileId: sourceDriveFileId || null,
        name: firstString(value, ATTACHMENT_NAME_KEYS) || locator.path.split('/').pop() || 'anexo',
        contentType: firstString(value, ATTACHMENT_CONTENT_TYPE_KEYS) || null,
      };
    }
  }

  const children = Array.isArray(value) ? value : Object.values(value);
  for (const child of children) {
    const match = findAttachmentReference(child, locator, seen);
    if (match) return match;
  }
  return null;
}

