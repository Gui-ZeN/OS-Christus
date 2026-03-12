import { getActorHeaders, getAuthenticatedActorHeaders } from './actorHeaders';
import { expectApiJson } from './apiClient';

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

function normalizeEmailTemplate(value: unknown, fallback?: Partial<EmailTemplateSettings>): EmailTemplateSettings {
  const template = (value || {}) as Partial<EmailTemplateSettings>;
  return {
    trigger: String(template.trigger || fallback?.trigger || '').trim(),
    subject: String(template.subject || fallback?.subject || '').trim(),
    body: String(template.body || fallback?.body || '').trim(),
  };
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
  const json = await expectApiJson<any>(response, 'Falha ao buscar configurações.');
  if (!json.ok) {
    throw new Error('Resposta inválida de configurações.');
  }
  const emailTemplates = Array.isArray(json.emailTemplates)
    ? (json.emailTemplates as unknown[])
        .map(item => normalizeEmailTemplate(item))
        .filter(item => item.trigger)
    : [];

  const emailTemplate = normalizeEmailTemplate(json.emailTemplate, emailTemplates[0]);

  return {
    emailTemplate,
    emailTemplates,
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
  await expectApiJson(response, 'Falha ao salvar configurações.'); return;
}


