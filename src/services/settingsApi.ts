import { getActorHeaders, getAuthenticatedActorHeaders } from './actorHeaders';
import { expectApiJson } from './apiClient';

export interface EmailTemplateSettings {
  trigger: string;
  subject: string;
  body: string;
  recipients: string;
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
    recipients: String(template.recipients || fallback?.recipients || '').trim(),
  };
}

function normalizeSlaSettings(value: unknown): SlaSettings {
  const allowedPriorities = ['Urgente', 'Alta', 'Trivial'];
  const sla = (value || {}) as {
    rules?: Array<{ priority?: string; prazo?: string }>;
    urgentHours?: number;
    highHours?: number;
    normalHours?: number;
    lowHours?: number;
  };

  if (Array.isArray(sla.rules)) {
    const normalized = sla.rules
      .map(rule => ({
        priority: String(rule.priority || '').trim(),
        prazo: String(rule.prazo || '').trim() || 'Sem medição de tempo',
      }))
      .filter(rule => allowedPriorities.includes(rule.priority));
    const byPriority = new Map(normalized.map(rule => [rule.priority, rule]));
    return {
      rules: allowedPriorities.map(priority => byPriority.get(priority) || ({ priority, prazo: 'Sem medição de tempo' })),
    };
  }

  return {
    rules: [
      { priority: 'Urgente', prazo: 'Sem medição de tempo' },
      { priority: 'Alta', prazo: 'Sem medição de tempo' },
      { priority: 'Trivial', prazo: 'Sem medição de tempo' },
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


