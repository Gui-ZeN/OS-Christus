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

