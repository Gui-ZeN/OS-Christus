import { getCurrentIdToken } from './authClient';
import { expectApiJson } from './apiClient';

export interface FirestoreBackfillResult {
  updatedUsers: number;
  updatedTickets: number;
  updatedNotifications: number;
  updatedSla: number;
}

export interface TicketHistoryBackfillResult {
  scannedTickets: number;
  ticketsWithHistory: number;
  copiedEntries: number;
  nextCursor: string | null;
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

  const json = await expectApiJson<any>(response, 'Falha ao executar backfill.');
  if (!json.ok) {
    throw new Error(json.error || 'Falha ao executar backfill.');
  }

  return json as {
    ok: true;
    result: FirestoreBackfillResult;
    actor: { email: string | null; name: string | null };
  };
}

export async function runTicketHistoryBackfill(cursor?: string | null) {
  const idToken = await getCurrentIdToken();
  if (!idToken) throw new Error('Sessão inválida. Faça login novamente.');

  const response = await fetch('/api/admin-tools?route=ticket-history-backfill', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ limit: 25, cursor: cursor || null }),
  });
  const json = await expectApiJson<any>(response, 'Falha ao copiar o histórico das OS.');
  if (!json.ok) throw new Error(json.error || 'Falha ao copiar o histórico das OS.');
  return json as { ok: true; result: TicketHistoryBackfillResult };
}


