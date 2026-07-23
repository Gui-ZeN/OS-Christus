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

function createGmailClient() {
  return google.gmail({ version: 'v1', auth: createOAuthClient() });
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
  const normalized = String(input).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function encodeMimeHeader(value) {
  const input = String(value || '');
  if (!input) return '';
  // eslint-disable-next-line no-control-regex -- range ASCII \x00-\x7F é intencional
  if (!/[^\x00-\x7F]/.test(input)) return input;
  return `=?UTF-8?B?${Buffer.from(input, 'utf8').toString('base64')}?=`;
}

function sanitizeFilename(value) {
  const input = String(value || 'anexo').trim() || 'anexo';
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'anexo';
}

function decodeQuotedPrintableWord(value) {
  const normalized = String(value || '')
    .replace(/_/g, ' ')
    .replace(/=([A-F0-9]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return Buffer.from(normalized, 'latin1').toString('utf8');
}

export function decodeMimeHeader(value) {
  const input = String(value || '');
  if (!input) return '';
  return input.replace(/=\?([^?]+)\?([bq])\?([^?]+)\?=/gi, (_, charset, encoding, data) => {
    const normalizedCharset = String(charset || '').toLowerCase();
    const normalizedEncoding = String(encoding || '').toLowerCase();

    try {
      if (normalizedEncoding === 'b') {
        const decoded = Buffer.from(String(data || ''), 'base64');
        return decoded.toString(normalizedCharset === 'utf-8' ? 'utf8' : 'latin1');
      }

      return decodeQuotedPrintableWord(data);
    } catch {
      return String(data || '');
    }
  });
}

function foldBase64(input) {
  return String(input || '').replace(/.{1,76}/g, '$&\r\n').trim();
}

// Remove CR/LF e caracteres de controle para impedir injeção de cabeçalhos MIME
// (ex.: Bcc oculto, Reply-To forjado) via valores controlados pelo usuário.
function sanitizeHeaderValue(value) {
  return String(value ?? '')
    .replace(/[\r\n]+/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim();
}

function buildRawMessage({ from, to, cc, subject, text, html, inReplyTo, references, extraHeaders = {}, attachments = [] }) {
  const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
  const mixedBoundary = `oschristus_mixed_${Math.random().toString(16).slice(2)}`;
  const alternativeBoundary = `oschristus_alt_${Math.random().toString(16).slice(2)}`;
  const safeCc = sanitizeHeaderValue(cc);
  const safeInReplyTo = sanitizeHeaderValue(inReplyTo);
  const safeReferences = Array.isArray(references)
    ? references.map(sanitizeHeaderValue).filter(Boolean)
    : [];
  const headers = [
    `From: ${sanitizeHeaderValue(from)}`,
    `To: ${sanitizeHeaderValue(to)}`,
    ...(safeCc ? [`Cc: ${safeCc}`] : []),
    `Subject: ${encodeMimeHeader(sanitizeHeaderValue(subject))}`,
    'MIME-Version: 1.0',
    `Content-Type: ${hasAttachments ? `multipart/mixed; boundary="${mixedBoundary}"` : `multipart/alternative; boundary="${alternativeBoundary}"`}`,
    ...(safeInReplyTo ? [`In-Reply-To: ${safeInReplyTo}`] : []),
    ...(safeReferences.length > 0 ? [`References: ${safeReferences.join(' ')}`] : []),
    ...Object.entries(extraHeaders).map(
      ([key, value]) => `${sanitizeHeaderValue(key)}: ${sanitizeHeaderValue(value)}`
    ),
    '',
  ];

  const parts = [];

  if (hasAttachments) {
    parts.push(
      `--${mixedBoundary}`,
      `Content-Type: multipart/alternative; boundary="${alternativeBoundary}"`,
      ''
    );
  }

  parts.push(
    `--${alternativeBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    text || '',
    '',
    `--${alternativeBoundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    '',
    html || `<pre>${(text || '').replace(/[<>&]/g, '')}</pre>`,
    '',
    `--${alternativeBoundary}--`
  );

  if (hasAttachments) {
    for (const attachment of attachments) {
      const filename = String(attachment?.filename || 'anexo');
      const safeFilename = sanitizeFilename(filename);
      const mimeType = sanitizeHeaderValue(String(attachment?.mimeType || 'application/octet-stream')) || 'application/octet-stream';
      const content = Buffer.isBuffer(attachment?.buffer) ? attachment.buffer.toString('base64') : '';
      if (!content) continue;

      parts.push(
        '',
        `--${mixedBoundary}`,
        `Content-Type: ${mimeType}; name="${safeFilename}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        `Content-Description: ${encodeMimeHeader(filename)}`,
        '',
        foldBase64(content)
      );
    }

    parts.push('', `--${mixedBoundary}--`);
  }

  return toBase64Url([...headers, ...parts].join('\r\n'));
}

function extractHeader(headers, name) {
  const found = (headers || []).find(header => header.name?.toLowerCase() === name.toLowerCase());
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

function extractHtml(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return fromBase64Url(payload.body.data);
  }
  for (const part of payload.parts || []) {
    const value = extractHtml(part);
    if (value) return value;
  }
  return '';
}

function collectAttachments(payload, items = []) {
  if (!payload) return items;

  if (payload.filename && payload.body?.attachmentId) {
    items.push({
      filename: payload.filename,
      mimeType: payload.mimeType || 'application/octet-stream',
      attachmentId: payload.body.attachmentId,
      size: Number(payload.body.size || 0),
    });
  }

  for (const part of payload.parts || []) {
    collectAttachments(part, items);
  }

  return items;
}

async function gmailGetAttachment(gmail, messageId, attachmentId) {
  const result = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  });

  const data = result.data?.data || '';
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64');
}

export async function gmailSend({ toEmail, ccEmail, subject, text, html, inReplyTo, references, ticketId, trackingToken, threadId, attachments = [] }) {
  const gmail = createGmailClient();
  const fromEmail = requiredEnv('GMAIL_FROM_EMAIL');
  // Reply-To global: quando o "De:" é um endereço diferente da caixa que o
  // sistema vigia (ex.: remetente com domínio próprio, mas o inbound continua no
  // Gmail de recebimento), isto garante que a resposta do cliente volte para a
  // caixa vigiada. Sem ele, a resposta iria para o "De:" e a OS não a receberia.
  const replyToEmail = String(process.env.GMAIL_REPLY_TO_EMAIL || '').trim();

  // Message-Id RFC próprio: setamos explicitamente no header e o RETORNAMOS,
  // para que o In-Reply-To/References da próxima resposta case com o e-mail real.
  // Antes retornávamos result.data.id (id INTERNO do Gmail, que nunca casa) →
  // cada resposta virava uma thread nova no cliente do destinatário.
  const fromDomain = (String(fromEmail).split('@')[1] || 'serv3.local').trim();
  const generatedMessageId = `<os-${ticketId || 'msg'}-${Date.now()}-${Math.random().toString(16).slice(2)}@${fromDomain}>`;

  const raw = buildRawMessage({
    from: fromEmail,
    to: toEmail,
    cc: ccEmail,
    subject,
    text,
    html,
    inReplyTo,
    references,
    attachments,
    extraHeaders: {
      'Message-Id': generatedMessageId,
      'X-OS-Ticket-ID': ticketId,
      ...(replyToEmail ? { 'Reply-To': replyToEmail } : {}),
      ...(trackingToken ? { 'X-OS-Tracking-Token': trackingToken } : {}),
    },
  });

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw,
      ...(threadId ? { threadId } : {}),
    },
  });

  return {
    status: 200,
    id: result.data.id || null,
    messageId: generatedMessageId,
    threadId: result.data.threadId || null,
  };
}

export async function gmailListRecentInbox(maxResults = 30) {
  const gmail = createGmailClient();

  const list = await gmail.users.messages.list({
    userId: 'me',
    labelIds: ['INBOX'],
    maxResults,
    q: 'newer_than:3d',
  });

  return list.data.messages || [];
}

export async function gmailGetMessage(messageId) {
  const gmail = createGmailClient();
  const result = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  });

  const payload = result.data.payload;
  const headers = payload?.headers || [];
  const attachmentMetas = collectAttachments(payload);
  const attachments = [];

  for (const item of attachmentMetas) {
    if (!item.attachmentId) continue;
    const buffer = await gmailGetAttachment(gmail, messageId, item.attachmentId);
    attachments.push({
      filename: item.filename,
      mimeType: item.mimeType,
      size: item.size || buffer.length,
      buffer,
    });
  }

  return {
    id: result.data.id || null,
    threadId: result.data.threadId || null,
    historyId: result.data.historyId || null,
    labelIds: Array.isArray(result.data.labelIds) ? result.data.labelIds : [],
    internalDate: result.data.internalDate ? new Date(Number(result.data.internalDate)) : new Date(),
    from: extractHeader(headers, 'From'),
    to: extractHeader(headers, 'To'),
    cc: extractHeader(headers, 'Cc'),
    subject: decodeMimeHeader(extractHeader(headers, 'Subject') || ''),
    messageId: extractHeader(headers, 'Message-Id') || null,
    inReplyTo: extractHeader(headers, 'In-Reply-To') || null,
    references: extractHeader(headers, 'References') || '',
    autoSubmitted: extractHeader(headers, 'Auto-Submitted') || null,
    precedence: extractHeader(headers, 'Precedence') || null,
    ticketId: extractHeader(headers, 'X-OS-Ticket-ID') || null,
    text: extractPlainText(payload),
    html: extractHtml(payload),
    attachments,
  };
}

export async function gmailGetProfile() {
  const gmail = createGmailClient();
  const result = await gmail.users.getProfile({ userId: 'me' });

  return {
    emailAddress: result.data.emailAddress || null,
    messagesTotal: Number(result.data.messagesTotal || 0),
    threadsTotal: Number(result.data.threadsTotal || 0),
    historyId: result.data.historyId || null,
  };
}

export async function gmailStartWatch({
  topicName,
  labelIds = ['INBOX'],
  labelFilterBehavior = 'INCLUDE',
} = {}) {
  const gmail = createGmailClient();
  const resolvedTopic = topicName || requiredEnv('GMAIL_PUBSUB_TOPIC_NAME');

  const result = await gmail.users.watch({
    userId: 'me',
    requestBody: {
      topicName: resolvedTopic,
      labelIds,
      labelFilterBehavior,
    },
  });

  return {
    historyId: result.data.historyId || null,
    expiration: result.data.expiration ? Number(result.data.expiration) : null,
  };
}

export async function gmailListHistory({
  startHistoryId,
  labelId = 'INBOX',
  historyTypes = ['messageAdded'],
  maxResults = 100,
} = {}) {
  if (!startHistoryId) throw new Error('startHistoryId é obrigatório.');

  const gmail = createGmailClient();
  const history = [];
  let pageToken;
  let latestHistoryId = null;

  do {
    const result = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: String(startHistoryId),
      pageToken,
      labelId,
      historyTypes,
      maxResults,
    });

    history.push(...(result.data.history || []));
    latestHistoryId = result.data.historyId || latestHistoryId;
    pageToken = result.data.nextPageToken || null;
  } while (pageToken);

  return {
    history,
    historyId: latestHistoryId,
  };
}

