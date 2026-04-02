import { getCurrentIdToken } from './authClient';

function readStoredEmail() {
  if (typeof window === 'undefined') return '';
  return (window.localStorage.getItem('os-christus-user-email') || '').trim().toLowerCase();
}

function readStoredName() {
  if (typeof window === 'undefined') return '';
  return (window.localStorage.getItem('os-christus-user-name') || '').trim();
}

function normalizeNameFromEmail(email: string) {
  const localPart = email.split('@')[0] || '';
  return localPart
    .replace(/[-_.]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
    .trim();
}

export function getActorHeaders(): Record<string, string> {
  const email = readStoredEmail();
  if (!email) return {};
  const storedName = readStoredName();
  const actorName = storedName || normalizeNameFromEmail(email);
  return {
    'X-Actor-Email': email,
    'X-Actor-Name': actorName,
  };
}

export async function getAuthenticatedActorHeaders(): Promise<Record<string, string>> {
  const headers = getActorHeaders();
  const token = await getCurrentIdToken();
  if (!token) return headers;
  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  };
}
