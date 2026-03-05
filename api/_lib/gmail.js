import { google } from 'googleapis';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
}

function createOAuthClient() {
  const clientId = requiredEnv('GMAIL_CLIENT_ID');
  const clientSecret = requiredEnv('GMAIL_CLIENT_SECRET');
  const refreshToken = requiredEnv('GMAIL_REFRESH_TOKEN');
  const redirectUri = process.env.GMAIL_REDIRECT_URI || 'https://developers.google.com/oauthplayground';

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

function toBase64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input) {
  if (!input) return '';
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function buildRawMessage({ from, to, subject, text, html, inReplyTo, references, extraHeaders = {} }) {
  const boundary = `oschristus_${Math.random().toString(16).slice(2)}`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`] : []),
    ...(references && references.length > 0 ? [`References: ${references.join(' ')}`] : []),
    ...Object.entries(extraHeaders).map(([k, v]) => `${k}: ${v}`),
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    text || '',
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    '',
    html || `<pre>${(text || '').replace(/[<>&]/g, '')}</pre>`,
    '',
    `--${boundary}--`,
  ];
  return toBase64Url(headers.join('\r\n'));
}

function extractHeader(headers, name) {
  const found = (headers || []).find(h => h.name?.toLowerCase() === name.toLowerCase());
  return found?.value || null;
}

function extractPlainText(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return fromBase64Url(payload.body.data);
  }
  for (const part of payload.parts || []) {
    const value = extractPlainText(part);
    if (value) return value;
  }
  return '';
}

export async function gmailSend({ toEmail, subject, text, html, inReplyTo, references, ticketId, trackingToken }) {
  const oauth2Client = createOAuthClient();
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const fromEmail = requiredEnv('GMAIL_FROM_EMAIL');

  const raw = buildRawMessage({
    from: fromEmail,
    to: toEmail,
    subject,
    text,
    html,
    inReplyTo,
    references,
    extraHeaders: {
      'X-OS-Ticket-ID': ticketId,
      ...(trackingToken ? { 'X-OS-Tracking-Token': trackingToken } : {}),
    },
  });

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });

  return {
    status: 200,
    id: result.data.id || null,
    threadId: result.data.threadId || null,
  };
}

export async function gmailListRecentInbox(maxResults = 30) {
  const oauth2Client = createOAuthClient();
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  const list = await gmail.users.messages.list({
    userId: 'me',
    labelIds: ['INBOX'],
    maxResults,
    q: 'newer_than:3d',
  });

  return list.data.messages || [];
}

export async function gmailGetMessage(messageId) {
  const oauth2Client = createOAuthClient();
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const result = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const payload = result.data.payload;
  const headers = payload?.headers || [];
  return {
    id: result.data.id || null,
    threadId: result.data.threadId || null,
    internalDate: result.data.internalDate ? new Date(Number(result.data.internalDate)) : new Date(),
    from: extractHeader(headers, 'From'),
    to: extractHeader(headers, 'To'),
    subject: extractHeader(headers, 'Subject') || '',
    messageId: extractHeader(headers, 'Message-Id') || null,
    inReplyTo: extractHeader(headers, 'In-Reply-To') || null,
    references: extractHeader(headers, 'References') || '',
    ticketId: extractHeader(headers, 'X-OS-Ticket-ID') || null,
    text: extractPlainText(payload),
  };
}
