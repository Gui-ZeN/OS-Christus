import { getActorHeaders } from './actorHeaders';

export interface EmailTemplateSettings {
  trigger: string;
  subject: string;
  body: string;
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

export async function fetchSettings() {
  const response = await fetch('/api/settings');
  if (!response.ok) {
    throw new Error('Falha ao buscar settings.');
  }
  const json = await response.json();
  if (!json.ok) {
    throw new Error('Resposta invalida de settings.');
  }
  return {
    emailTemplate: json.emailTemplate as EmailTemplateSettings,
    dailyDigest: json.dailyDigest as DailyDigestSettings,
    sla: json.sla as SlaSettings,
  };
}

export async function saveSettings(section: 'emailTemplates' | 'dailyDigest' | 'sla', data: object) {
  const response = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getActorHeaders() },
    body: JSON.stringify({ section, data }),
  });
  if (!response.ok) {
    throw new Error('Falha ao salvar settings.');
  }
}
