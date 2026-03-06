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
  const response = await fetch('/api/firestore-legacy-health');
  if (!response.ok) {
    throw new Error('Falha ao buscar diagnostico de legado do Firestore.');
  }
  const json = await response.json();
  if (!json.ok) {
    throw new Error(json.error || 'Resposta invalida do diagnostico de legado.');
  }
  return json as { ok: true } & FirestoreLegacyHealth;
}
