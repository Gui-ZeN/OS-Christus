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

export async function fetchAuditLogs(limit = 100) {
  const response = await fetch(`/api/audit-logs?limit=${limit}`);
  if (!response.ok) {
    throw new Error('Falha ao buscar auditoria.');
  }
  const json = await response.json();
  if (!json.ok || !Array.isArray(json.logs)) {
    throw new Error('Resposta invalida de auditoria.');
  }
  return json.logs as AuditLogEntry[];
}
