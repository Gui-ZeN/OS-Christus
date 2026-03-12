import { getAuthenticatedActorHeaders } from './actorHeaders';
import { expectApiJson } from './apiClient';

export interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  metadata: unknown;
  createdAt: string | null;
}

export async function fetchAuditLogs(limit = 100, includeSystem = false) {
  const response = await fetch(`/api/audit-logs?limit=${limit}&includeSystem=${includeSystem ? 'true' : 'false'}`, {
    headers: await getAuthenticatedActorHeaders(),
  });
  const json = await expectApiJson<any>(response, 'Falha ao buscar auditoria.');
  if (!json.ok || !Array.isArray(json.logs)) {
    throw new Error('Resposta inválida de auditoria.');
  }
  return json.logs as AuditLogEntry[];
}


