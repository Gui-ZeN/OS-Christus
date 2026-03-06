import { getCurrentIdToken } from './authClient';

export interface FirestoreBackfillResult {
  updatedUsers: number;
  updatedTickets: number;
  updatedNotifications: number;
  updatedSla: number;
}

export async function runFirestoreLegacyBackfill() {
  const idToken = await getCurrentIdToken();
  if (!idToken) {
    throw new Error('Sessão inválida. Faça login novamente.');
  }

  const response = await fetch('/api/admin-tools?route=backfill', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });

  const json = await response.json();
  if (!response.ok || !json.ok) {
    throw new Error(json.error || 'Falha ao executar backfill.');
  }

  return json as {
    ok: true;
    result: FirestoreBackfillResult;
    actor: { email: string | null; name: string | null };
  };
}
