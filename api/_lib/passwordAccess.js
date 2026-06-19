import { getAuth } from 'firebase-admin/auth';
import { gmailSend } from './gmail.js';
import { sendWithSendGrid } from './sendgrid.js';
import { buildAccessEmailTemplate } from './emailTemplates.js';

function resolveBaseUrlFromRequest(req) {
  const explicit = String(process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').trim();
  if (!host) return 'https://serv3.vercel.app';
  const proto = String(req?.headers?.['x-forwarded-proto'] || 'https').trim();
  return `${proto}://${host}`.replace(/\/$/, '');
}

export function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function resolveCodePayloadFromActionLink(firebaseUrl) {
  const parsed = new URL(firebaseUrl);
  let oobCode = parsed.searchParams.get('oobCode');
  let mode = parsed.searchParams.get('mode') || 'resetPassword';
  let apiKey = parsed.searchParams.get('apiKey') || '';
  let lang = parsed.searchParams.get('lang') || '';

  const nestedLink = parsed.searchParams.get('link');
  if ((!oobCode || !mode) && nestedLink) {
    try {
      const nested = new URL(decodeURIComponent(nestedLink));
      oobCode = oobCode || nested.searchParams.get('oobCode');
      mode = mode || nested.searchParams.get('mode') || 'resetPassword';
      apiKey = apiKey || nested.searchParams.get('apiKey') || '';
      lang = lang || nested.searchParams.get('lang') || '';
    } catch {
      // mantém fallback externo
    }
  }

  return { oobCode, mode, apiKey, lang };
}

export async function generatePasswordResetUrl(email, req) {
  const auth = getAuth();
  const baseUrl = resolveBaseUrlFromRequest(req);
  const actionCodeSettings = {
    url: `${baseUrl}/?view=password-reset`,
    handleCodeInApp: false,
  };
  const firebaseUrl = await auth.generatePasswordResetLink(email, actionCodeSettings);
  const { oobCode, mode, apiKey, lang } = resolveCodePayloadFromActionLink(firebaseUrl);
  if (!oobCode) return firebaseUrl;
  const appUrl = new URL(`${baseUrl}/`);
  appUrl.searchParams.set('view', 'password-reset');
  appUrl.searchParams.set('mode', mode);
  appUrl.searchParams.set('oobCode', oobCode);
  if (apiKey) appUrl.searchParams.set('apiKey', apiKey);
  if (lang) appUrl.searchParams.set('lang', lang);
  appUrl.searchParams.set('issuedAt', String(Date.now()));
  return appUrl.toString();
}

export async function sendPasswordAccessEmail({
  email,
  name,
  mode = 'forgot',
  resetUrl,
}) {
  const subject =
    mode === 'invite'
      ? 'Serv3 - Defina sua senha de acesso'
      : 'Serv3 - Recuperacao de senha';
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

  // Autodetect alinhado ao mail.js: sem EMAIL_PROVIDER explícito, usa Gmail se
  // as credenciais Gmail existirem (antes ia direto para SendGrid e o e-mail de
  // convite/reset falhava para quem usa Gmail).
  const explicitProvider = String(process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
  const provider =
    explicitProvider === 'gmail' || explicitProvider === 'sendgrid'
      ? explicitProvider
      : process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET && process.env.GMAIL_REFRESH_TOKEN
        ? 'gmail'
        : 'sendgrid';
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

