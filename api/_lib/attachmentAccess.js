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

// Campos de um anexo que só o SERVIDOR grava (o job de arquivamento no Drive).
// O download confia em `driveFileId` como o ponteiro do arquivo: se o cliente
// pudesse escrevê-lo, um Gestor plantaria numa OS DELE o id de um arquivo de outra
// OS (outra região) e o proxy entregaria — a service account lê o Drive inteiro.
const SERVER_ONLY_ATTACHMENT_FIELDS = ['driveFileId', 'archived', 'archivedAt'];

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Identidade do anexo = TODAS as chaves de path juntas, não uma delas. Casar por
// qualquer uma deixava o cliente montar `{ path: <messages>, attachmentPath:
// <payments> }`: o pin colava o driveFileId do pagamento, a matriz de papel olhava
// só `messages` e o Diretor baixava o comprovante.
function attachmentIdentityOf(value) {
  return [...ATTACHMENT_PATH_KEYS]
    .map(key => [key, String(value[key] || '').trim()])
    .filter(([, path]) => path)
    .map(([key, path]) => `${key}=${path}`)
    .join('\n');
}

function indexServerOnlyAttachmentFields(value, index, seen) {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  if (!Array.isArray(value)) {
    const stored = {};
    for (const field of SERVER_ONLY_ATTACHMENT_FIELDS) {
      if (value[field] !== undefined) stored[field] = value[field];
    }
    const identity = attachmentIdentityOf(value);
    if (identity && Object.keys(stored).length > 0 && !index.has(identity)) {
      index.set(identity, stored);
    }
  }
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    indexServerOnlyAttachmentFields(child, index, seen);
  }
}

function pinValue(value, index) {
  if (Array.isArray(value)) return value.map(item => pinValue(item, index));
  if (!isPlainObject(value)) return value;
  const next = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SERVER_ONLY_ATTACHMENT_FIELDS.includes(key)) continue;
    next[key] = pinValue(entry, index);
  }
  const identity = attachmentIdentityOf(value);
  const stored = identity ? index.get(identity) : undefined;
  return stored ? { ...next, ...stored } : next;
}

/**
 * Descarta `driveFileId`/`archived`/`archivedAt` vindos do cliente em qualquer
 * profundidade do PATCH e devolve, para cada anexo, o valor que JÁ estava gravado
 * na OS para o mesmo conjunto de paths. Anexo arquivado reenviado pela tela continua
 * arquivado; anexo novo nunca nasce apontando para o Drive.
 */
export function pinServerOnlyAttachmentFields(updates, storedTicket) {
  const index = new Map();
  indexServerOnlyAttachmentFields(storedTicket, index, new Set());
  return pinValue(updates, index);
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

