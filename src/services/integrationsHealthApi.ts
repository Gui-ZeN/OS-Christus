import { getAuthenticatedActorHeaders } from './actorHeaders';

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
  const response = await fetch('/api/integrations-health', {
    headers: await getAuthenticatedActorHeaders(),
  });
  if (!response.ok) {
    throw new Error('Falha ao buscar saúde das integrações.');
  }

  const json = await response.json();
  if (!json.ok) {
    throw new Error(json.error || 'Resposta inválida da saúde das integrações.');
  }

  return json as { ok: true } & IntegrationsHealthResponse;
}
