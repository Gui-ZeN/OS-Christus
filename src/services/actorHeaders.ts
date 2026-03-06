import { getCurrentIdToken } from './authClient';

function readStoredEmail() {
  if (typeof window === 'undefined') return '';
  return (window.localStorage.getItem('os-christus-user-email') || '').trim().toLowerCase();
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
  return {
    'X-Actor-Email': email,
    'X-Actor-Name': normalizeNameFromEmail(email),
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
