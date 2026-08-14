import { getAuthenticatedActorHeaders } from './actorHeaders';

export interface AttachmentLocator {
  ticketId?: string | null;
  path?: string | null;
  driveFileId?: string | null;
  url?: string | null;
}

const objectUrlCache = new Map<string, string>();
const MAX_CACHE_ENTRIES = 40;

function cacheObjectUrl(key: string, objectUrl: string) {
  objectUrlCache.set(key, objectUrl);
  if (objectUrlCache.size <= MAX_CACHE_ENTRIES) return;
  const oldestKey = objectUrlCache.keys().next().value;
  if (!oldestKey) return;
  const oldestUrl = objectUrlCache.get(oldestKey);
  if (oldestUrl) URL.revokeObjectURL(oldestUrl);
  objectUrlCache.delete(oldestKey);
}

async function readAttachmentError(response: Response) {
  const payload = await response.json().catch(() => null);
  return payload?.error || 'Não foi possível abrir o anexo.';
}

export async function resolveAttachmentUrl(locator: AttachmentLocator) {
  const ticketId = String(locator.ticketId || '').trim();
  const path = String(locator.path || '').trim();
  const driveFileId = String(locator.driveFileId || '').trim();

  if (!ticketId || !path) {
    return String(locator.url || '').trim() || null;
  }

  const cacheKey = `${ticketId}|${path}|${driveFileId}`;
  const cached = objectUrlCache.get(cacheKey);
  if (cached) return cached;

  const query = new URLSearchParams({ ticketId, path });
  if (driveFileId) query.set('driveFileId', driveFileId);
  const response = await fetch(`/api/attachments?${query.toString()}`, {
    headers: await getAuthenticatedActorHeaders(),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new Error(await readAttachmentError(response));
  }

  const objectUrl = URL.createObjectURL(await response.blob());
  cacheObjectUrl(cacheKey, objectUrl);
  return objectUrl;
}

