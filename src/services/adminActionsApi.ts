import { getCurrentIdToken } from './authClient';
import { expectApiJson } from './apiClient';
import { UserFacingError } from '../utils/errorMessage';
export interface FirestoreBackfillResult {
  updatedUsers: number;
  updatedTickets: number;
  updatedNotifications: number;
  updatedSla: number;
}

export interface TicketHistoryBackfillResult {
  dryRun?: boolean;
  scannedTickets: number;
  ticketsWithHistory: number;
  /** OS que já têm a subcoleção pronta (puladas). */
  alreadyMigrated?: number;
  /** OS que ainda serão migradas neste lote. */
  pendingTickets?: number;
  /** Entradas que seriam copiadas (estimativa no ensaio). */
  entriesToCopy?: number;
  copiedEntries: number;
  /** Entradas legadas sem `id` — ganham id determinístico derivado do conteúdo. */
  entriesWithoutId?: number;
  largestHistory?: number;
  sample?: Array<{ ticketId: string; entries: number; entriesWithoutId: number }>;
  nextCursor: string | null;
}

export interface AttachmentMigrationResult {
  dryRun: boolean;
  scannedTickets: number;
  scannedDocuments: number;
  changedDocuments: number;
  updatedDocuments: number;
  storagePaths: number;
  invalidStoragePaths: number;
  invalidStoragePathSamples: Array<{ ticketId: string; path: string }>;
  removedUrlFields: number;
  firebaseTokenUrls: number;
  signedUrls: number;
  otherLegacyUrls: number;
  unresolvedUrls: number;
  unresolvedSamples: Array<{ location: string; kind: string }>;
  storage: {
    inspectedObjects: number;
    tokenizedObjects: number;
    revokedTokens: number;
    missingObjects: number;
    failedObjects: number;
    failures: Array<{ path: string; error: string }>;
  };
  nextCursor: string | null;
}

export async function runFirestoreLegacyBackfill() {
  const idToken = await getCurrentIdToken();
  if (!idToken) {
    throw new UserFacingError('Sessão inválida. Faça login novamente.');
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

export async function runTicketHistoryBackfill(
  cursor?: string | null,
  options?: { dryRun?: boolean }
) {
  const idToken = await getCurrentIdToken();
  if (!idToken) throw new UserFacingError('Sessão inválida. Faça login novamente.');

  const response = await fetch('/api/admin-tools?route=ticket-history-backfill', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    // dryRun: ensaio — o servidor inspeciona e relata sem escrever nada.
    body: JSON.stringify({ limit: 25, cursor: cursor || null, dryRun: options?.dryRun === true }),
  });
  const json = await expectApiJson<any>(response, 'Falha ao copiar o histórico das OS.');
  if (!json.ok) throw new Error(json.error || 'Falha ao copiar o histórico das OS.');
  return json as { ok: true; result: TicketHistoryBackfillResult };
}

export async function runAttachmentSecurityMigration(
  cursor?: string | null,
  options?: { dryRun?: boolean }
) {
  const idToken = await getCurrentIdToken();
  if (!idToken) throw new UserFacingError('Sessão inválida. Faça login novamente.');

  const response = await fetch('/api/attachment-security-migration', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      limit: 5,
      cursor: cursor || null,
      dryRun: options?.dryRun !== false,
    }),
  });
  const json = await expectApiJson<any>(response, 'Falha ao migrar anexos legados.');
  if (!json.ok) throw new Error(json.error || 'Falha ao migrar anexos legados.');
  return json as { ok: true; result: AttachmentMigrationResult };
}
