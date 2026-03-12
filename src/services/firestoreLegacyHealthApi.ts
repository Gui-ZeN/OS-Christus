import { getAuthenticatedActorHeaders } from './actorHeaders';
import { expectApiJson } from './apiClient';

export interface FirestoreLegacyHealth {
  summary: {
    legacyUsers: number;
    ticketsMissingCatalog: number;
    notificationsLegacy: number;
    slaLegacy: number;
  };
  samples: {
    legacyUsers: Array<{ id: string; email: string; role: string }>;
    ticketsMissingCatalog: Array<{ id: string; region: string | null; regionId: string | null; sede: string | null; siteId: string | null }>;
    notificationsLegacy: Array<{ id: string; time: unknown }>;
    sla: { hasRules: boolean; hasLegacyHours: boolean } | null;
  };
}

export async function fetchFirestoreLegacyHealth() {
  const response = await fetch('/api/admin-tools?route=legacy-health', {
    headers: await getAuthenticatedActorHeaders(),
  });
  const json = await expectApiJson<any>(response, 'Falha ao buscar diagnóstico de legado do Firestore.');
  if (!json.ok) {
    throw new Error(json.error || 'Resposta inválida do diagnóstico de legado.');
  }
  return json as { ok: true } & FirestoreLegacyHealth;
}

