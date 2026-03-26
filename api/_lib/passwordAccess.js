import { getAuth } from 'firebase-admin/auth';
import { gmailSend } from './gmail.js';
import { sendWithSendGrid } from './sendgrid.js';
import { buildAccessEmailTemplate } from './emailTemplates.js';

function resolveBaseUrlFromRequest(req) {
  const explicit = String(process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').trim();
  if (!host) return 'https://os-christus.vercel.app';
  const proto = String(req?.headers?.['x-forwarded-proto'] || 'https').trim();
  return `${proto}://${host}`.replace(/\/$/, '');
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

export async function generatePasswordResetUrl(email, req) {
  const auth = getAuth();
  const baseUrl = resolveBaseUrlFromRequest(req);
  const actionCodeSettings = {
    url: `${baseUrl}/?view=login`,
    handleCodeInApp: false,
  };
  return auth.generatePasswordResetLink(email, actionCodeSettings);
}

export async function sendPasswordAccessEmail({
  email,
  name,
  mode = 'forgot',
  resetUrl,
}) {
  const subject =
    mode === 'invite'
      ? 'OS Christus - Defina sua senha de acesso'
      : 'OS Christus - Recuperacao de senha';
  const intro =
    mode === 'invite'
      ? 'Seu acesso foi criado. Clique no botao abaixo para definir sua senha inicial.'
      : 'Recebemos uma solicitacao para redefinir sua senha. Clique no botao abaixo para continuar.';

  const template = buildAccessEmailTemplate({
    title: mode === 'invite' ? 'Seu acesso foi liberado' : 'Recuperacao de senha',
    intro,
    recipientName: name || '',
    ctaUrl: resetUrl,
    ctaLabel: mode === 'invite' ? 'Definir senha' : 'Redefinir senha',
  });

  const provider = String(process.env.EMAIL_PROVIDER || 'sendgrid').trim().toLowerCase();
  if (provider === 'gmail') {
    await gmailSend({
      toEmail: email,
      subject,
      text: template.text,
      html: template.html,
      ticketId: 'access-reset',
      trackingToken: undefined,
      inReplyTo: undefined,
      references: [],
      threadId: undefined,
    });
    return { provider: 'gmail' };
  }

  await sendWithSendGrid({
    toEmail: email,
    subject,
    text: template.text,
    html: template.html,
    templateId: null,
    templateData: null,
    headers: null,
    replyTo: process.env.SENDGRID_REPLY_TO_EMAIL || undefined,
  });
  return { provider: 'sendgrid' };
}
