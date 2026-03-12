import { getAuthenticatedActorHeaders } from './actorHeaders';
import { expectApiJson } from './apiClient';

export interface IntegrationCheck {
  ok: boolean;
  label: string;
  detail: string;
  meta: Record<string, unknown> | null;
}

export interface IntegrationsHealthResponse {
  checks: {
    firebaseAdmin: IntegrationCheck;
    auth: IntegrationCheck;
    storage: IntegrationCheck;
    email: IntegrationCheck;
  };
}

export async function fetchIntegrationsHealth() {
  const response = await fetch('/api/admin-tools?route=integrations-health', {
    headers: await getAuthenticatedActorHeaders(),
  });
  const json = await expectApiJson<any>(response, 'Falha ao buscar saúde das integrações.');
  if (!json.ok) {
    throw new Error(json.error || 'Resposta inválida da saúde das integrações.');
  }

  return json as { ok: true } & IntegrationsHealthResponse;
}

