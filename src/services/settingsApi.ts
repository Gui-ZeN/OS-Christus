import { getActorHeaders, getAuthenticatedActorHeaders } from './actorHeaders';

export interface EmailTemplateSettings {
  trigger: string;
  subject: string;
  body: string;
}

export interface SettingsPayload {
  emailTemplate: EmailTemplateSettings;
  emailTemplates: EmailTemplateSettings[];
  dailyDigest: DailyDigestSettings;
  sla: SlaSettings;
}

export interface DailyDigestSettings {
  enabled: boolean;
  time: string;
  recipients: string;
  subject: string;
}

export interface SlaSettings {
  rules: Array<{ priority: string; prazo: string }>;
}

function normalizeSlaSettings(value: unknown): SlaSettings {
  const sla = (value || {}) as {
    rules?: Array<{ priority?: string; prazo?: string }>;
    urgentHours?: number;
    highHours?: number;
    normalHours?: number;
    lowHours?: number;
  };

  if (Array.isArray(sla.rules)) {
    return {
      rules: sla.rules.map(rule => ({
        priority: String(rule.priority || '').trim(),
        prazo: String(rule.prazo || '').trim(),
      })),
    };
  }

  return {
    rules: [
      { priority: 'Urgente', prazo: `${Number(sla?.urgentHours || 24)}h` },
      { priority: 'Alta', prazo: `${Number(sla?.highHours || 72)}h` },
      { priority: 'Normal', prazo: `${Number(sla?.normalHours || 120)}h` },
      { priority: 'Trivial', prazo: `${Number(sla?.lowHours || 240)}h` },
    ],
  };
}

export async function fetchSettings(): Promise<SettingsPayload> {
  const response = await fetch('/api/settings', {
    headers: await getAuthenticatedActorHeaders(),
  });
  if (!response.ok) {
    throw new Error('Falha ao buscar settings.');
  }
  const json = await response.json();
  if (!json.ok) {
    throw new Error('Resposta invalida de settings.');
  }
  return {
    emailTemplate: json.emailTemplate as EmailTemplateSettings,
    emailTemplates: Array.isArray(json.emailTemplates) ? (json.emailTemplates as EmailTemplateSettings[]) : [],
    dailyDigest: json.dailyDigest as DailyDigestSettings,
    sla: normalizeSlaSettings(json.sla),
  };
}

export async function saveSettings(section: 'emailTemplates' | 'dailyDigest' | 'sla', data: object) {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers, ...getActorHeaders() },
    body: JSON.stringify({ section, data }),
  });
  if (!response.ok) {
    throw new Error('Falha ao salvar settings.');
  }
}
