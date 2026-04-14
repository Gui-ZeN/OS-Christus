import { createHash, randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { requireAuthenticatedUser, requireUserWithRoles } from './_lib/authz.js';
import { logEmailEvent } from './_lib/emailLogs.js';
import { buildTicketEmailTemplate } from './_lib/emailTemplates.js';
import { DEFAULT_SETTINGS } from './_lib/settingsDefaults.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { reserveNextTicketId } from './_lib/tickets.js';
import {
  decodeMimeHeader,
  gmailGetMessage,
  gmailGetProfile,
  gmailListHistory,
  gmailListRecentInbox,
  gmailSend,
  gmailStartWatch,
} from './_lib/gmail.js';
import { parseInboundBody, readJsonBody, sendJson } from './_lib/http.js';
import { sendWithSendGrid } from './_lib/sendgrid.js';

const GMAIL_SYNC_STATE_DOC = 'gmailSync';

function required(input, name) {
  if (!input || String(input).trim() === '') throw new Error(`Campo obrigatório: ${name}`);
  return String(input).trim();
}

function parseTicketId(text) {
  if (!text) return null;
  const match = String(text).match(/\bOS-\d{3,}\b/i);
  return match ? match[0].toUpperCase() : null;
}

function parseNewTicketSubject(text) {
  if (!text) return null;
  const match = String(text).match(/^\s*(?:(?:re|fw|fwd)\s*:\s*)*\[([^\]]+)\]\s*[-–—:]\s*(.+?)\s*$/i);
  if (!match) return null;
  return {
    siteCode: String(match[1] || '').trim(),
    subject: String(match[2] || '').trim(),
  };
}

function displayNameFromEmail(raw) {
  const input = decodeMimeHeader(String(raw || '')).trim();
  if (!input) return 'Solicitante por e-mail';

  const angleMatch = input.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  const bareNameMatch = input.match(/^\s*"?([^"<@]+?)"?\s*$/);

  const candidate = (angleMatch?.[1] || bareNameMatch?.[1] || '').trim();
  if (candidate && !candidate.includes('@')) {
    return candidate.replace(/^"+|"+$/g, '').trim();
  }

  const email = firstEmail(input);
  if (!email) return 'Solicitante por e-mail';
  return email
    .split('@')[0]
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function slugFilename(value) {
  return String(value || 'arquivo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripQuotedReply(value) {
  const text = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  const markers = [
    /^\s*On .+ wrote:?\s*$/im,
    /^\s*Em .+ escreveu:?\s*$/im,
    /^\s*-----Original Message-----\s*$/im,
    /^\s*De:\s.+$/im,
  ];
  let next = text;

  for (const marker of markers) {
    const match = marker.exec(next);
    if (match?.index != null && match.index > 0) {
      next = next.slice(0, match.index).trim();
      break;
    }
  }

  const inlineMarkers = [
    /\bEm\s.+?<[^>\n]+>\s+escreveu:\s*/i,
    /\bOn\s.+?<[^>\n]+>\s+wrote:\s*/i,
    /\bEm\s.+?[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\s+escreveu:\s*/i,
    /\bOn\s.+?[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\s+wrote:\s*/i,
    /\bEm\s.+?escreveu:\s*/i,
    /\bOn\s.+?wrote:\s*/i,
  ];

  for (const marker of inlineMarkers) {
    const match = marker.exec(next);
    if (match?.index != null && match.index > 0) {
      next = next.slice(0, match.index).trim();
      break;
    }
  }

  return next
    .split('\n')
    .filter(line => {
      const normalized = line.trim();
      if (!normalized.startsWith('>')) return true;
      return false;
    })
    .join('\n')
    .trim();
}

function stripSignature(value) {
  const text = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';

  const markers = [
    /^\s*--\s*$/m,
    /^\s*__+\s*$/m,
    /^\s*Atenciosamente[,!.\s]*$/im,
    /^\s*Cordialmente[,!.\s]*$/im,
    /^\s*Abs[,!.\s]*$/im,
    /^\s*Assinatura[:\s]*$/im,
    /^\s*\[image:.*\]\s*$/im,
  ];

  let next = text;
  for (const marker of markers) {
    const match = marker.exec(next);
    if (match?.index != null && match.index > 0) {
      next = next.slice(0, match.index).trim();
      break;
    }
  }

  return next
    .split('\n')
    .filter(line => {
      const normalized = line.trim();
      if (!normalized) return true;
      if (/^\[image:.*\]$/i.test(normalized)) return false;
      if (/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(normalized)) return false;
      if (/^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/.test(normalized.replace(/\s+/g, ' '))) return false;
      if (/^(R\.|Av\.|Rua|Avenida)\s/i.test(normalized)) return false;
      return true;
    })
    .join('\n')
    .trim();
}

function firstEmail(raw) {
  if (!raw) return null;
  const match = String(raw).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeHeaders(rawHeaders) {
  const parsed = typeof rawHeaders === 'string' ? safeJsonParse(rawHeaders) : rawHeaders;
  if (!parsed || typeof parsed !== 'object') return {};
  const result = {};
  for (const [key, value] of Object.entries(parsed)) {
    result[String(key).toLowerCase()] = value;
  }
  return result;
}

function readPathValue(source, path) {
  return String(path || '')
    .split('.')
    .filter(Boolean)
    .reduce((current, key) => (current && typeof current === 'object' ? current[key] : undefined), source);
}

function renderTemplateString(template, variables) {
  return String(template || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const value = readPathValue(variables, path);
    return value == null ? '' : String(value);
  });
}

const LIKELY_MOJIBAKE_REGEX = /(?:Ã.|Â.|â.|ð.|ï¿½|�)/g;
const LIKELY_MOJIBAKE_TEST_REGEX = /(?:Ã.|Â.|â.|ð.|ï¿½|�)/;

function mojibakeScore(input) {
  const matches = String(input || '').match(LIKELY_MOJIBAKE_REGEX);
  return matches ? matches.length : 0;
}

function repairMojibake(value) {
  const input = String(value || '');
  if (!input || !LIKELY_MOJIBAKE_TEST_REGEX.test(input)) {
    return input;
  }

  try {
    let current = input;
    let currentScore = mojibakeScore(current);

    for (let index = 0; index < 3; index += 1) {
      const repaired = Buffer.from(current, 'latin1').toString('utf8');
      if (!repaired || repaired.includes('\uFFFD')) break;

      const repairedScore = mojibakeScore(repaired);
      if (repairedScore >= currentScore) break;

      current = repaired;
      currentScore = repairedScore;
      if (currentScore === 0) break;
    }

    return current;
  } catch {
    return input;
  }
}

function normalizeResolvedTemplate(template) {
  if (!template || typeof template !== 'object') return null;
  return {
    ...template,
    subject: repairMojibake(template.subject),
    body: repairMojibake(template.body),
    recipients: repairMojibake(template.recipients || ''),
  };
}

function parseEmailList(input) {
  if (!input) return [];
  const values = Array.isArray(input) ? input : String(input).split(/[;,]+/);
  const emails = values
    .map(value => firstEmail(value))
    .filter(Boolean);
  return [...new Set(emails)];
}

function sameRecipientSet(current, previous) {
  if (!Array.isArray(current) || !Array.isArray(previous)) return false;
  if (current.length !== previous.length) return false;
  const left = [...new Set(current)].sort();
  const right = [...new Set(previous)].sort();
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

async function resolveEmailTemplate(db, trigger) {
  const normalized = String(trigger || '').trim();
  if (!normalized) return null;

  const snap = await db.collection('settings').doc('emailTemplates').collection('items').doc(normalized).get();
  if (snap.exists) return normalizeResolvedTemplate(snap.data());
  return normalizeResolvedTemplate(DEFAULT_SETTINGS.emailTemplates.items[normalized] || null);
}

function getInternalNotificationEmail() {
  const candidate =
    process.env.TICKET_NOTIFICATION_EMAIL ||
    process.env.GMAIL_FROM_EMAIL ||
    process.env.SENDGRID_FROM_EMAIL ||
    '';
  return String(candidate || '').trim().toLowerCase() || null;
}

function getSystemMailboxEmails() {
  return [
    process.env.GMAIL_FROM_EMAIL,
    process.env.SENDGRID_FROM_EMAIL,
    process.env.TICKET_NOTIFICATION_EMAIL,
  ]
    .map(value => String(value || '').trim().toLowerCase())
    .filter(Boolean);
}

async function resolveFlowFallbackRecipients(db, trigger) {
  const normalizedTrigger = String(trigger || '').trim().toUpperCase();
  if (!normalizedTrigger.startsWith('EMAIL-DIRETORIA-')) return [];

  const normalizeLabel = value =>
    String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const usersSnap = await db.collection('users').get();
  const userRecipients = usersSnap.docs
    .map(doc => doc.data() || {})
    .filter(user => {
      const role = normalizeLabel(user.role);
      const status = normalizeLabel(user.status || 'ativo');
      const isDirectorRole = role === 'diretor' || role === 'director';
      const isActive = user.active !== false && (status === '' || status === 'ativo' || status === 'active');
      return isDirectorRole && isActive;
    })
    .map(user => firstEmail(user.email))
    .filter(Boolean);

  const templateKeys = ['EMAIL-DIRETORIA-SOLUCAO', 'EMAIL-DIRETORIA-APROVACAO'];
  const templateRecipientBuckets = await Promise.all(
    templateKeys.map(async key => {
      const template = await resolveEmailTemplate(db, key);
      return parseEmailList(template?.recipients || '');
    })
  );
  const templateRecipients = templateRecipientBuckets.flat();

  return [...new Set([...templateRecipients, ...userRecipients])];
}

function normalizeDirectorGreeting(body) {
  const text = String(body || '');
  if (!text.trim()) return 'Olá,';

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const normalized = [];
  let greetingFound = false;

  for (const line of lines) {
    const trimmed = String(line || '').trim();
    if (/^Ol[áa]\b/i.test(trimmed)) {
      if (greetingFound) continue;
      normalized.push('Olá,');
      greetingFound = true;
      continue;
    }
    normalized.push(line);
  }

  const compacted = normalized.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const withoutRepeatedGreeting = compacted.replace(/^(?:Ol[áa],?\s*){2,}/i, 'Olá,\n\n');
  if (greetingFound) return withoutRepeatedGreeting;
  return `Olá,\n\n${withoutRepeatedGreeting}`;
}

function buildConversationSubject(ticketId, ticketSubject, fallbackSubject) {
  const cleanSubject = String(ticketSubject || fallbackSubject || '').trim();
  if (!ticketId) return repairMojibake(cleanSubject || fallbackSubject || 'Atualização da OS');
  if (!cleanSubject) return `${ticketId} - Atualização da OS`;
  if (cleanSubject.toUpperCase().startsWith(`${ticketId.toUpperCase()} - `)) {
    return repairMojibake(cleanSubject);
  }
  return repairMojibake(`${ticketId} - ${cleanSubject}`);
}

function buildThreadRootMessageId(ticketId) {
  const normalizedTicketId = String(ticketId || 'ticket')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `<os-thread-${normalizedTicketId || 'ticket'}@os-christus>`;
}

function buildInboundHistoryId(messageId, fallbackKey) {
  const base = String(messageId || fallbackKey || Date.now())
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `mail-${base || Date.now()}`;
}

function readProviderErrorStatus(error) {
  const rawStatus = error?.response?.status ?? error?.status ?? error?.code ?? null;
  const parsed = Number(rawStatus);
  return Number.isFinite(parsed) ? parsed : null;
}

function isThreadReferenceMissingError(error) {
  const status = readProviderErrorStatus(error);
  const providerMessage = String(
    error?.response?.data?.error?.message || error?.message || ''
  ).toLowerCase();
  return status === 404 || providerMessage.includes('requested entity was not found');
}

async function sendWithGmailThreadFallback({
  toEmail,
  subject,
  text,
  html,
  inReplyTo,
  references,
  ticketId,
  trackingToken,
  threadId,
  attachments,
}) {
  const normalizedReferences = Array.isArray(references) ? references : [];
  const hasThreadContext = Boolean(threadId || inReplyTo || normalizedReferences.length > 0);

  try {
    const result = await gmailSend({
      toEmail,
      subject,
      text,
      html,
      inReplyTo,
      references: normalizedReferences,
      ticketId,
      trackingToken,
      threadId,
      attachments,
    });

    return {
      result,
      inReplyTo: inReplyTo || null,
      references: normalizedReferences,
      recoveredThread: false,
    };
  } catch (error) {
    if (!hasThreadContext || !isThreadReferenceMissingError(error)) {
      throw error;
    }

    const retryResult = await gmailSend({
      toEmail,
      subject,
      text,
      html,
      ticketId,
      trackingToken,
      attachments,
    });

    return {
      result: retryResult,
      inReplyTo: null,
      references: [],
      recoveredThread: true,
    };
  }
}

function normalizeMessageIdToken(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const wrapped = raw.startsWith('<') && raw.endsWith('>') ? raw : `<${raw.replace(/^<|>$/g, '')}>`;
  return wrapped;
}

function parseMessageIdCandidates(inReplyTo, referencesRaw) {
  const candidates = new Set();
  const direct = normalizeMessageIdToken(inReplyTo);
  if (direct) candidates.add(direct);
  String(referencesRaw || '')
    .split(/\s+/)
    .map(token => normalizeMessageIdToken(token))
    .filter(Boolean)
    .forEach(token => candidates.add(token));
  return [...candidates];
}

async function resolveTicketIdByThreadReferences(db, inReplyTo, referencesRaw) {
  const candidates = parseMessageIdCandidates(inReplyTo, referencesRaw);
  if (candidates.length === 0) return null;

  for (const messageId of candidates) {
    const byLastMessage = await db.collection('emailThreads').where('lastMessageId', '==', messageId).limit(1).get();
    if (!byLastMessage.empty) {
      const ticketId = String(byLastMessage.docs[0].data()?.ticketId || byLastMessage.docs[0].id || '').trim();
      if (ticketId) return ticketId;
    }

    const byReferences = await db.collection('emailThreads').where('references', 'array-contains', messageId).limit(1).get();
    if (!byReferences.empty) {
      const ticketId = String(byReferences.docs[0].data()?.ticketId || byReferences.docs[0].id || '').trim();
      if (ticketId) return ticketId;
    }
  }

  return null;
}

function buildInboundHistoryEntry(message, options = {}) {
  const sender = displayNameFromEmail(message.from) || options.sender || 'Solicitante';
  const text =
    stripSignature(stripQuotedReply(message.text)) ||
    stripSignature(stripQuotedReply(stripHtml(message.html))) ||
    'Resposta recebida por e-mail.';
  return {
    id: buildInboundHistoryId(message.messageId || message.id, sender),
    type: options.type || 'customer',
    sender,
    time: message.internalDate || new Date(),
    text,
    visibility: options.visibility || 'public',
  };
}

function shouldIgnoreInboundMessage(message) {
  const fromEmail = firstEmail(message.from);
  const labelIds = Array.isArray(message.labelIds) ? message.labelIds.map(value => String(value || '').toUpperCase()) : [];
  const autoSubmitted = String(message.autoSubmitted || '').trim().toLowerCase();
  const precedence = String(message.precedence || '').trim().toLowerCase();
  const systemEmails = getSystemMailboxEmails();

  if (labelIds.includes('SENT') || labelIds.includes('DRAFT')) return true;
  if (fromEmail && systemEmails.includes(fromEmail)) return true;
  if (autoSubmitted && autoSubmitted !== 'no') return true;
  if (['bulk', 'list', 'junk', 'auto_reply'].includes(precedence)) return true;

  return false;
}

async function appendInboundMessageToTicketHistory(db, ticketId, message) {
  const ticketRef = db.collection('tickets').doc(ticketId);
  const ticketSnap = await ticketRef.get();
  if (!ticketSnap.exists) return;

  const ticket = ticketSnap.data() || {};
  const history = Array.isArray(ticket.history) ? ticket.history : [];
  const fromEmail = firstEmail(message.from);
  const requesterEmail = firstEmail(ticket.requesterEmail);

  let type = 'customer';
  let visibility = 'public';
  let sender = ticket.requester || 'Solicitante';

  if (!fromEmail || !requesterEmail || normalizeKey(fromEmail) !== normalizeKey(requesterEmail)) {
    type = 'internal';
    visibility = 'internal';
    sender = displayNameFromEmail(message.from) || 'Colaborador';

    if (fromEmail) {
      const userSnap = await db.collection('users').where('email', '==', fromEmail).limit(1).get();
      if (!userSnap.empty) {
        const user = userSnap.docs[0].data() || {};
        sender = String(user.name || sender);
        const role = String(user.role || '').trim();
        if (role !== 'Admin' && role !== 'Diretor') {
          sender = String(user.name || displayNameFromEmail(message.from) || 'Colaborador');
        }
      }
    }
  }

  const nextEntry = buildInboundHistoryEntry(message, {
    sender,
    type,
    visibility,
  });
  if (history.some(item => item?.id === nextEntry.id)) return;

  await ticketRef.set(
    {
      history: [...history, nextEntry],
      updatedAt: new Date(),
    },
    { merge: true }
  );
}

function getGmailStateRef(db) {
  return db.collection('config').doc(GMAIL_SYNC_STATE_DOC);
}

function decodeBase64Any(input) {
  if (!input) return '';
  const normalized = String(input).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function decodePubSubPayload(input) {
  const decoded = decodeBase64Any(input);
  return safeJsonParse(decoded);
}

async function authorizeGmailAutomation(req) {
  const watchSecret = process.env.GMAIL_PUSH_SECRET;
  const syncSecret = process.env.GMAIL_SYNC_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const provided = req.query?.secret || req.headers['x-sync-secret'] || req.headers['x-gmail-push-secret'] || bearer;
  const validSecrets = [watchSecret, syncSecret, cronSecret].filter(Boolean);

  if (provided && validSecrets.includes(provided)) {
    return;
  }

  try {
    await requireUserWithRoles(req, ['Admin']);
    return;
  } catch {
    // Segue para validação por segredo abaixo.
  }

  if (validSecrets.length === 0) {
    await requireUserWithRoles(req, ['Admin']);
    return;
  }

  if (!provided || !validSecrets.includes(provided)) {
    throw new Error('Segredo inválido.');
  }
}

async function processGmailInboundMessage(db, msg, source) {
  if (shouldIgnoreInboundMessage(msg)) {
    await logEmailEvent({
      type: 'inbound',
      status: 'skipped',
      provider: 'gmail',
      ticketId: msg.ticketId || parseTicketId(msg.subject) || parseTicketId(msg.text) || null,
      fromEmail: firstEmail(msg.from),
      subject: msg.subject || '',
      messageId: msg.messageId || msg.id || null,
      error: 'Mensagem automática ou enviada pelo próprio sistema ignorada.',
    });
    return false;
  }

  const messageId = msg.messageId || msg.id || null;
  const fromEmail = firstEmail(msg.from);
  const lock = await acquireInboundMessageLock(db, {
    messageId,
    fallbackKey: `${msg.threadId || 'gmail'}:${msg.subject || ''}:${fromEmail || ''}`,
    provider: 'gmail',
    source,
    fromEmail,
    subject: msg.subject || '',
  });

  if (!lock.acquired) {
    return false;
  }

  try {
    const createdTicket =
      msg.ticketId || parseTicketId(msg.subject) || parseTicketId(msg.text) ? null : await createTicketFromInbound(db, msg);
    const ticketId = msg.ticketId || parseTicketId(msg.subject) || parseTicketId(msg.text) || createdTicket?.id;
    if (!ticketId) {
      await finalizeInboundMessageLock(lock.ref);
      return false;
    }

    let threadRef = db.collection('emailThreads').doc(ticketId);
    if (msg.threadId) {
      const byThreadSnap = await db
        .collection('emailThreads')
        .where('ticketId', '==', ticketId)
        .limit(20)
        .get();
      const matchedDoc = byThreadSnap.docs.find(doc => String(doc.data()?.gmailThreadId || '') === String(msg.threadId));
      if (matchedDoc) {
        threadRef = matchedDoc.ref;
      }
    }
    const now = msg.internalDate || new Date();
    const toEmail = firstEmail(msg.to);
    const references = String(msg.references || '')
      .split(/\s+/)
      .map(value => value.trim())
      .filter(Boolean)
      .slice(-20);
    const participants = [fromEmail, toEmail].filter(Boolean);

    await threadRef.set(
      {
        ticketId,
        lastMessageId: messageId,
        lastDirection: 'inbound',
        lastInboundAt: now,
        updatedAt: now,
        references,
        gmailThreadId: msg.threadId || null,
        ...(participants.length > 0 ? { participants: FieldValue.arrayUnion(...participants) } : {}),
      },
      { merge: true }
    );

    if (messageId) {
      const duplicateSnap = await threadRef
        .collection('messages')
        .where('messageId', '==', messageId)
        .limit(1)
        .get();
      if (!duplicateSnap.empty) {
        await finalizeInboundMessageLock(lock.ref);
        return false;
      }
    }

    await threadRef.collection('messages').add({
      direction: 'inbound',
      fromEmail: fromEmail || null,
      toEmail: toEmail || null,
      subject: msg.subject || '',
      text: msg.text || null,
      html: msg.html || null,
      messageId,
      inReplyTo: msg.inReplyTo || null,
      references,
      provider: 'gmail',
      attachments: Array.isArray(createdTicket?.attachments) ? createdTicket.attachments : [],
      createdAt: now,
    });

    await db.collection('ticketInbound').add({
      ticketId,
      fromEmail: fromEmail || null,
      subject: msg.subject || '',
      text: msg.text || null,
      html: msg.html || null,
      messageId,
      attachments: Array.isArray(createdTicket?.attachments) ? createdTicket.attachments : [],
      createdAt: now,
      source,
    });

    await finalizeInboundMessageLock(lock.ref);

    if (!createdTicket) {
      await appendInboundMessageToTicketHistory(db, ticketId, {
        ...msg,
        internalDate: now,
      });
    }

    await logEmailEvent({
      type: 'inbound',
      status: 'success',
      provider: 'gmail',
      ticketId,
      fromEmail: fromEmail || null,
      subject: msg.subject || '',
      messageId,
    });

    return true;
  } catch (error) {
    await releaseInboundMessageLock(lock.ref);
    throw error;
  }
}

async function processGmailInboundMessageIds(db, messageIds, source) {
  let processed = 0;

  for (const messageId of messageIds) {
    if (!messageId) continue;
    const msg = await gmailGetMessage(messageId);
    const ok = await processGmailInboundMessage(db, msg, source);
    if (ok) processed += 1;
  }

  return processed;
}

async function canSendPublicCreationEmail(db, ticketId, toEmail, internalCopy) {
  if (!ticketId) return false;

  const ticketSnap = await db.collection('tickets').doc(ticketId).get();
  if (!ticketSnap.exists) return false;

  const ticket = ticketSnap.data() || {};

  // Only allow within 10 minutes of ticket creation to prevent replay abuse.
  const createdAt =
    ticket.createdAt instanceof Date
      ? ticket.createdAt
      : typeof ticket.createdAt?.toDate === 'function'
        ? ticket.createdAt.toDate()
        : null;
  if (!createdAt || Date.now() - createdAt.getTime() > 10 * 60 * 1000) return false;

  const requesterEmail = String(ticket.requesterEmail || '').trim().toLowerCase();
  const internalEmail = getInternalNotificationEmail();
  const normalizedRecipient = String(toEmail || '').trim().toLowerCase();

  if (internalCopy && internalEmail) return true;
  return Boolean(requesterEmail && normalizedRecipient && requesterEmail === normalizedRecipient);
}

async function buildNextTicketId(db) {
  return reserveNextTicketId(db);
}
function buildInboundMessageLockId(messageId, fallbackKey = '') {
  const base = String(messageId || fallbackKey || '')
    .trim()
    .toLowerCase();
  if (!base) return null;
  return createHash('sha256').update(base).digest('hex');
}
function isAlreadyExistsError(error) {
  return (
    error?.code === 6 ||
    error?.code === 'already-exists' ||
    /already exists/i.test(String(error?.message || ''))
  );
}
async function acquireInboundMessageLock(db, options) {
  const lockId = buildInboundMessageLockId(options.messageId, options.fallbackKey);
  if (!lockId) {
    return { acquired: true, ref: null, data: null };
  }
  const ref = db.collection('inboundMessageLocks').doc(lockId);
  try {
    await ref.create({
      messageId: options.messageId || null,
      fallbackKey: options.fallbackKey || null,
      provider: options.provider || null,
      source: options.source || null,
      fromEmail: options.fromEmail || null,
      subject: options.subject || '',
      status: 'processing',
      createdAt: new Date(),
    });
    return { acquired: true, ref, data: null };
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error;
    const snap = await ref.get();
    return { acquired: false, ref, data: snap.exists ? snap.data() : null };
  }
}
async function finalizeInboundMessageLock(ref) {
  if (!ref) return;
  await ref.delete().catch(() => undefined);
}
async function releaseInboundMessageLock(ref) {
  if (!ref) return;
  try {
    await ref.delete();
  } catch {
    // Ignora falha na limpeza do lock para permitir novo processamento.
  }
}
async function resolveSiteContext(db, siteCode) {
  const normalized = normalizeKey(siteCode);
  const [sitesSnap, regionsSnap] = await Promise.all([
    db.collection('sites').get(),
    db.collection('regions').get(),
  ]);

  const sites = sitesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  const regions = regionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  const site =
    sites.find(item => [item.id, item.code, item.name].some(value => normalizeKey(value) === normalized)) || null;
  const region = site ? regions.find(item => item.id === site.regionId) || null : null;

  return { site, region };
}

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10 MB per file

async function uploadInboundAttachments(ticketId, attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];

  const filtered = attachments.slice(0, MAX_ATTACHMENTS);

  const bucket = getStorage().bucket();
  const uploadedAt = new Date();
  const results = [];

  for (let index = 0; index < filtered.length; index += 1) {
    const attachment = filtered[index];
    if (!attachment?.buffer) continue;

    const fileSize = Number(attachment.size || attachment.buffer.length || 0);
    if (fileSize > MAX_ATTACHMENT_SIZE) continue;

    const filename = slugFilename(attachment.filename || `anexo-${index + 1}`);
    const path = `attachments/tickets/inbound/${ticketId}/${Date.now()}-${index + 1}-${filename}`;
    const file = bucket.file(path);

    await file.save(attachment.buffer, {
      resumable: false,
      contentType: attachment.mimeType || 'application/octet-stream',
      metadata: {
        contentType: attachment.mimeType || 'application/octet-stream',
      },
    });

    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: '2035-01-01',
    });

    results.push({
      id: randomUUID(),
      name: attachment.filename || filename,
      path,
      url,
      contentType: attachment.mimeType || 'application/octet-stream',
      size: Number(attachment.size || attachment.buffer.length || 0),
      uploadedAt,
      category: 'attachment',
    });
  }

  return results;
}

async function createTicketFromInbound(db, message) {
  const parsedSubject = parseNewTicketSubject(message.subject);
  if (!parsedSubject?.siteCode || !parsedSubject?.subject) return null;

  const ticketId = await buildNextTicketId(db);
  const trackingToken = `trk_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = message.internalDate || new Date();
  const { site, region } = await resolveSiteContext(db, parsedSubject.siteCode);
  const attachments = await uploadInboundAttachments(ticketId, message.attachments || []);
  const fromEmail = firstEmail(message.from);
  const requester = displayNameFromEmail(message.from);
  const description =
    stripSignature(stripQuotedReply(String(message.text || '').trim())) ||
    stripSignature(stripQuotedReply(stripHtml(message.html))) ||
    parsedSubject.subject;

  const ticket = {
    id: ticketId,
    trackingToken,
    subject: parsedSubject.subject,
    requester,
    requesterEmail: fromEmail || '',
    time: now,
    status: 'Nova OS',
    type: 'Manutenção Predial Estrutural',
    macroServiceId: null,
    macroServiceName: null,
    serviceCatalogId: null,
    serviceCatalogName: null,
    regionId: region?.id || null,
    region: region?.name || 'Não definida',
    siteId: site?.id || null,
    sede: site?.code || parsedSubject.siteCode,
    sector: 'E-mail',
    priority: 'Trivial',
    attachments,
    history: [
      {
        id: `${ticketId}-c1`,
        type: 'customer',
        sender: requester,
        time: now,
        text: description,
      },
      {
        id: `${ticketId}-s1`,
        type: 'system',
        sender: 'Sistema',
        time: now,
        text: `${ticketId} registrada automaticamente por e-mail.`,
      },
    ],
  };

  await db.collection('tickets').doc(ticketId).set({
    ...ticket,
    createdAt: now,
    updatedAt: now,
  });

  return ticket;
}

async function handleSend(req, res) {
  let ticketIdForLog = null;
  let toEmailForLog = null;
  const providerForLog = (process.env.EMAIL_PROVIDER || 'sendgrid').toLowerCase();

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
    }

    const body = await readJsonBody(req);
    const ticketId = required(body.ticketId, 'ticketId');
    ticketIdForLog = ticketId;

    const toEmailInput = body.toEmail ? String(body.toEmail).trim() : '';
    const subject = body.subject ? String(body.subject) : `Atualização da OS ${ticketId}`;
    const text = body.text ? String(body.text) : '';
    const html = body.html ? String(body.html) : '';
    const templateId = body.templateId ? String(body.templateId) : null;
    const trigger = body.trigger ? String(body.trigger) : null;
    const templateData = body.templateData && typeof body.templateData === 'object' ? body.templateData : {};
    const variables = body.variables && typeof body.variables === 'object' ? body.variables : {};
    const trackingToken = body.trackingToken ? String(body.trackingToken) : null;
    const skipThread = body.skipThread === true;
    const internalCopy = body.internalCopy === true;
    const allowThreadRecipientFallback = body.allowThreadRecipientFallback !== false;
    const internalEmail = getInternalNotificationEmail();

    if (internalCopy && !internalEmail) {
      return sendJson(res, 200, { ok: true, skipped: 'internal-copy-without-recipient' });
    }

    if (!templateId && !trigger && !text && !html) {
      throw new Error('Informe text, html, templateId ou trigger para envio.');
    }

    const db = getAdminDb();
    const outboundAttachments = await resolveOutboundAttachments(body.attachments);
    const isPublicCreationEmail =
      trigger === 'EMAIL-NOVA-OS' &&
      (await canSendPublicCreationEmail(db, ticketId, firstEmail(toEmailInput) || '', internalCopy));

    if (!isPublicCreationEmail) {
      await requireAuthenticatedUser(req);
    }

    const storedTemplate = await resolveEmailTemplate(db, trigger);
    const templateSubject = repairMojibake(
      storedTemplate?.subject ? renderTemplateString(storedTemplate.subject, variables) : subject
    );
    const triggerKey = String(trigger || '').trim();
    const isDirectorTrigger = triggerKey.startsWith('EMAIL-DIRETORIA-');
    const templateBodyText = String(templateData.bodyText || '').trim();
    const forceBodyFromTemplateData =
      isDirectorTrigger ||
      triggerKey === 'EMAIL-FINANCEIRO-PAGAMENTO';
    const requestedBodyOverride = forceBodyFromTemplateData ? templateBodyText : '';
    const baseResolvedBody = requestedBodyOverride || repairMojibake(
      storedTemplate?.body ? renderTemplateString(storedTemplate.body, variables) : text
    );
    const directorSummary = String(templateData.directorSummary || '').trim();
    const resolvedBody =
      isDirectorTrigger && !requestedBodyOverride && directorSummary
        ? (baseResolvedBody
            ? baseResolvedBody.includes(directorSummary)
              ? baseResolvedBody
              : `${baseResolvedBody}\n\n${directorSummary}`
            : directorSummary)
        : baseResolvedBody;
    const resolvedTicket = variables.ticket && typeof variables.ticket === 'object' ? variables.ticket : {};
    const resolvedGuarantee = variables.guarantee && typeof variables.guarantee === 'object' ? variables.guarantee : {};
    const resolvedSubject = ticketId
      ? buildConversationSubject(ticketId, templateData.ticketSubject || resolvedTicket.subject, 'Atualização da OS')
      : templateSubject;


    const threadRef = db.collection('emailThreads').doc(ticketId);
    const threadSnap = await threadRef.get();
    const thread = threadSnap.exists ? threadSnap.data() : null;
    const canonicalSubject =
      ticketId && String(thread?.subject || '').trim()
        ? repairMojibake(String(thread.subject))
        : resolvedSubject;

    const explicitRecipients = parseEmailList(toEmailInput);
    const templateRecipients = parseEmailList(storedTemplate?.recipients || '');
    const flowFallbackRecipients = await resolveFlowFallbackRecipients(db, trigger);
    const threadRecipients = parseEmailList(thread?.toEmail || '');
    const directorRecipientsMerged = [...new Set([...templateRecipients, ...flowFallbackRecipients])];
    const recipients = internalCopy
      ? (internalEmail ? [internalEmail] : [])
      : explicitRecipients.length > 0
        ? explicitRecipients
        : isDirectorTrigger
          ? directorRecipientsMerged
          : templateRecipients.length > 0
            ? templateRecipients
            : flowFallbackRecipients.length > 0
              ? flowFallbackRecipients
              : allowThreadRecipientFallback
                ? threadRecipients
                : [];
    const toEmail = recipients.join(', ');
    toEmailForLog = toEmail;
    if (!toEmail || recipients.length === 0) {
      throw new Error('Campo obrigatório: toEmail (ou thread existente com destinatário).');
    }

    const rootMessageId = normalizeMessageIdToken(thread?.rootMessageId) || buildThreadRootMessageId(ticketId);
    const reuseThread = !internalCopy && Boolean(thread?.lastMessageId);
    const priorMessageId = internalCopy
      ? null
      : reuseThread
        ? thread?.lastMessageId || rootMessageId
        : rootMessageId;
    const references = !internalCopy && Array.isArray(thread?.references) ? thread.references : [];
    const nextReferences = !internalCopy
      ? [...new Set([...references, rootMessageId, priorMessageId].filter(Boolean))].slice(-20)
      : [];

    const headers = {
      'X-OS-Ticket-ID': ticketId,
      ...(trackingToken ? { 'X-OS-Tracking-Token': trackingToken } : {}),
      ...(priorMessageId ? { 'In-Reply-To': priorMessageId } : {}),
      ...(nextReferences.length > 0 ? { References: nextReferences.join(' ') } : {}),
    };

    const provider = providerForLog;
    const skipDirectorGreeting = Boolean(templateData?.skipGreeting);
    let personalizedBody = resolvedBody;
    if (isDirectorTrigger && !internalCopy && !skipDirectorGreeting) {
      personalizedBody = normalizeDirectorGreeting(resolvedBody);
    }

    const fallbackTemplate = buildTicketEmailTemplate({
      trigger: trigger || templateId || resolvedSubject,
      title: templateData.title || `Atualização da OS ${ticketId}`,
      intro:
        templateData.intro ||
        'Sua solicitação recebeu uma nova atualização. Você pode responder este e-mail para continuar a conversa no sistema.',
      ticketId,
      subject: templateData.ticketSubject || resolvedSubject,
      status: templateData.status || 'Atualizada',
      region: templateData.region || resolvedTicket.region || null,
      site: templateData.site || resolvedTicket.sede || null,
      sector: templateData.sector || resolvedTicket.sector || null,
      service: templateData.service || resolvedTicket.service || resolvedTicket.macroService || null,
      guaranteeSummary: templateData.guaranteeSummary || resolvedGuarantee.summary || null,
      ctaUrl: templateData.ctaUrl || null,
      ctaLabel: templateData.ctaLabel || 'Acompanhar OS',
      bodyText: personalizedBody || templateData.bodyText || '',
    });

    const finalText = personalizedBody || text || fallbackTemplate.text;
    const finalHtml = html || fallbackTemplate.html;

    let sendResult;
    let effectiveInReplyTo = priorMessageId || null;
    let effectiveReferences = nextReferences;
    let recoveredThread = false;

    if (provider === 'gmail') {
      const gmailSendResult = await sendWithGmailThreadFallback({
        toEmail,
        subject: canonicalSubject,
        text: finalText,
        html: finalHtml,
        inReplyTo: priorMessageId || undefined,
        references: nextReferences,
        ticketId,
        trackingToken: trackingToken || undefined,
        threadId: reuseThread ? thread?.gmailThreadId || undefined : undefined,
        attachments: outboundAttachments,
      });
      sendResult = gmailSendResult.result;
      effectiveInReplyTo = gmailSendResult.inReplyTo;
      effectiveReferences = gmailSendResult.references;
      recoveredThread = gmailSendResult.recoveredThread;
    } else {
      sendResult = await sendWithSendGrid({
        toEmail,
        subject: canonicalSubject,
        text: finalText,
        html: finalHtml,
        templateId,
        templateData,
        headers,
        replyTo: process.env.SENDGRID_REPLY_TO_EMAIL || undefined,
        attachments: outboundAttachments,
      });
    }

    const now = new Date();
    const messageId = sendResult.messageId || sendResult.id || `<os-${ticketId}-${now.getTime()}@os-christus>`;
    const effectiveRootMessageId = recoveredThread ? messageId : rootMessageId;
    const mergedReferences = [...new Set([effectiveRootMessageId, ...effectiveReferences, messageId].filter(Boolean))].slice(-20);
    const persistedHeaders = {
      'X-OS-Ticket-ID': ticketId,
      ...(trackingToken ? { 'X-OS-Tracking-Token': trackingToken } : {}),
      ...(effectiveInReplyTo ? { 'In-Reply-To': effectiveInReplyTo } : {}),
      ...(effectiveReferences.length > 0 ? { References: effectiveReferences.join(' ') } : {}),
    };

    if (!skipThread) {
      await threadRef.set(
        {
          ticketId,
          subject: canonicalSubject,
          toEmail,
          rootMessageId: effectiveRootMessageId,
          lastMessageId: messageId,
          gmailThreadId: sendResult.threadId || (reuseThread ? thread?.gmailThreadId : null) || null,
          references: mergedReferences,
          lastDirection: 'outbound',
          lastOutboundAt: now,
          updatedAt: now,
          ...(recipients.length > 0 ? { participants: FieldValue.arrayUnion(...recipients) } : {}),
        },
        { merge: true }
      );

      await threadRef.collection('messages').add({
        direction: 'outbound',
        toEmail,
        subject: canonicalSubject,
        text: finalText || null,
        html: finalHtml || null,
        templateId: templateId || null,
        trigger: trigger || null,
        messageId,
        rootMessageId: effectiveRootMessageId,
        inReplyTo: effectiveInReplyTo,
        references: mergedReferences,
        headers: persistedHeaders,
        attachments: outboundAttachments.map(item => ({
          name: item.filename,
          contentType: item.mimeType,
          size: item.size,
        })),
        createdAt: now,
      });
    }

    await logEmailEvent({
      type: 'outbound',
      status: 'success',
      provider,
      ticketId,
      toEmail,
      subject: canonicalSubject,
      messageId,
    });

    return sendJson(res, 200, {
      ok: true,
      ticketId,
      toEmail,
      messageId,
      inReplyTo: effectiveInReplyTo,
      references: mergedReferences,
      recoveredThread,
    });
  } catch (error) {
    await logEmailEvent({
      type: 'outbound',
      status: 'error',
      provider: providerForLog,
      ticketId: ticketIdForLog,
      toEmail: toEmailForLog,
      error: error.message || 'Falha ao enviar e-mail.',
    });
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha ao enviar e-mail.' });
  }
}

async function handleHealth(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
    }

    await requireUserWithRoles(req, ['Admin', 'Diretor']);

    const db = getAdminDb();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const snap = await db
      .collection('emailEvents')
      .where('createdAt', '>=', since)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();

    const events = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    const total = events.length;
    const success = events.filter(event => event.status === 'success').length;
    const errors = events.filter(event => event.status === 'error').length;
    const outbound = events.filter(event => event.type === 'outbound').length;
    const inbound = events.filter(event => event.type === 'inbound').length;
    const sync = events.filter(event => event.type === 'sync').length;
    const byProvider = events.reduce((acc, event) => {
      const key = event.provider || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});

    return sendJson(res, 200, {
      ok: true,
      windowHours: 24,
      summary: {
        total,
        success,
        errors,
        outbound,
        inbound,
        sync,
        byProvider,
      },
      recentErrors: events
        .filter(event => event.status === 'error')
        .slice(0, 20)
        .map(event => ({
          id: event.id,
          createdAt: event.createdAt,
          provider: event.provider || null,
          type: event.type || null,
          ticketId: event.ticketId || null,
          error: event.error || 'Erro não detalhado',
        })),
    });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || 'Falha ao ler saúde de e-mail.' });
  }
}

async function handleGmailSync(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
    }

    await authorizeGmailAutomation(req);

    const db = getAdminDb();
    const stateRef = getGmailStateRef(db);
    const stateSnap = await stateRef.get();
    const state = stateSnap.exists ? stateSnap.data() : {};
    const seenIds = new Set(Array.isArray(state.seenMessageIds) ? state.seenMessageIds : []);

    const refs = await gmailListRecentInbox(40);
    let processed = 0;
    const newSeen = [...seenIds];

    for (const ref of refs) {
      if (!ref.id || seenIds.has(ref.id)) continue;
      processed += await processGmailInboundMessageIds(db, [ref.id], 'gmail-api-sync');
      newSeen.push(ref.id);
      seenIds.add(ref.id);
    }

    await stateRef.set(
      {
        seenMessageIds: newSeen.slice(-200),
        lastSyncAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true }
    );

    await logEmailEvent({
      type: 'sync',
      status: 'success',
      provider: 'gmail',
      processed,
    });

    return sendJson(res, 200, { ok: true, processed });
  } catch (error) {
    await logEmailEvent({
      type: 'sync',
      status: 'error',
      provider: 'gmail',
      error: error.message || 'Falha no sync do Gmail.',
    });
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha no sync do Gmail.' });
  }
}

async function resolveOutboundAttachments(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];

  const filtered = attachments.slice(0, MAX_ATTACHMENTS);
  const bucket = getStorage().bucket();
  const results = [];

  for (const attachment of filtered) {
    const path = String(attachment?.path || '').trim();
    const url = String(attachment?.url || '').trim();
    const filename = String(attachment?.name || attachment?.filename || 'anexo').trim() || 'anexo';
    const mimeType = String(attachment?.contentType || attachment?.mimeType || 'application/octet-stream').trim() || 'application/octet-stream';
    let buffer = null;

    try {
      if (path) {
        const [downloaded] = await bucket.file(path).download();
        buffer = downloaded;
      } else if (url) {
        const response = await fetch(url);
        if (response.ok) {
          const arrayBuffer = await response.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
        }
      }
    } catch {
      buffer = null;
    }

    if (!buffer) continue;
    if (buffer.length > MAX_ATTACHMENT_SIZE) continue;

    results.push({
      filename,
      mimeType,
      size: buffer.length,
      buffer,
    });
  }

  return results;
}

async function handleGmailWatch(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
    }

    await authorizeGmailAutomation(req);

    const watch = await gmailStartWatch({
      topicName: process.env.GMAIL_PUBSUB_TOPIC_NAME,
    });

    const db = getAdminDb();
    await getGmailStateRef(db).set(
      {
        watchHistoryId: watch.historyId || null,
        lastHistoryId: watch.historyId || null,
        watchExpiration: watch.expiration ? new Date(Number(watch.expiration)) : null,
        lastWatchRenewedAt: new Date(),
        updatedAt: new Date(),
      },
      { merge: true }
    );

    await logEmailEvent({
      type: 'sync',
      status: 'success',
      provider: 'gmail',
      action: 'watch-renew',
      historyId: watch.historyId || null,
    });

    return sendJson(res, 200, {
      ok: true,
      historyId: watch.historyId || null,
      expiration: watch.expiration || null,
    });
  } catch (error) {
    await logEmailEvent({
      type: 'sync',
      status: 'error',
      provider: 'gmail',
      action: 'watch-renew',
      error: error.message || 'Falha ao renovar watch do Gmail.',
    });
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha ao renovar watch do Gmail.' });
  }
}

async function handleGmailPush(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
    }

    await authorizeGmailAutomation(req);

    const body = await readJsonBody(req);
    const envelope = body?.message;
    const payload = decodePubSubPayload(envelope?.data);

    if (!payload?.historyId) {
      return sendJson(res, 200, { ok: true, skipped: 'empty-push' });
    }

    const db = getAdminDb();
    const stateRef = getGmailStateRef(db);
    const stateSnap = await stateRef.get();
    const state = stateSnap.exists ? stateSnap.data() : {};
    const previousHistoryId = state.lastHistoryId || state.watchHistoryId || null;
    const nextHistoryId = String(payload.historyId);

    if (!previousHistoryId) {
      await stateRef.set(
        {
          lastHistoryId: nextHistoryId,
          lastPushAt: new Date(),
          updatedAt: new Date(),
        },
        { merge: true }
      );

      return sendJson(res, 200, { ok: true, bootstrap: true, processed: 0, historyId: nextHistoryId });
    }

    let processed = 0;

    try {
      const historyResult = await gmailListHistory({
        startHistoryId: previousHistoryId,
      });

      const messageIds = [
        ...new Set(
          historyResult.history.flatMap(item =>
            (item.messagesAdded || [])
              .map(entry => entry?.message?.id)
              .filter(Boolean)
          )
        ),
      ];

      processed = await processGmailInboundMessageIds(db, messageIds, 'gmail-api-push');

      await stateRef.set(
        {
          lastHistoryId: String(historyResult.historyId || nextHistoryId),
          lastPushAt: new Date(),
          updatedAt: new Date(),
        },
        { merge: true }
      );
    } catch (error) {
      if (error?.code !== 404) throw error;

      const refs = await gmailListRecentInbox(20);
      processed = await processGmailInboundMessageIds(
        db,
        refs.map(item => item.id).filter(Boolean),
        'gmail-api-push-recovery'
      );

      await stateRef.set(
        {
          lastHistoryId: nextHistoryId,
          lastPushAt: new Date(),
          updatedAt: new Date(),
        },
        { merge: true }
      );
    }

    await logEmailEvent({
      type: 'sync',
      status: 'success',
      provider: 'gmail',
      action: 'push',
      processed,
    });

    return sendJson(res, 200, { ok: true, processed, historyId: nextHistoryId });
  } catch (error) {
    await logEmailEvent({
      type: 'sync',
      status: 'error',
      provider: 'gmail',
      action: 'push',
      error: error.message || 'Falha no push do Gmail.',
    });
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha no push do Gmail.' });
  }
}

async function handleInbound(req, res) {
  let lockRef = null;

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
    }

    const configuredSecret = process.env.SENDGRID_INBOUND_SECRET;
    if (configuredSecret) {
      const provided = req.query?.secret || req.headers['x-os-secret'] || req.headers['x-inbound-secret'] || null;
      if (provided !== configuredSecret) {
        return sendJson(res, 401, { ok: false, error: 'Segredo inválido no inbound.' });
      }
    }

    const body = await parseInboundBody(req);
    const headers = normalizeHeaders(body.headers);
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];

    const explicitTicketId = body.ticketId || body.ticket_id || headers['x-os-ticket-id'];
    const subjectTicketId = parseTicketId(body.subject);

    const fromEmail = firstEmail(body.from);
    const toEmail = firstEmail(body.to);
    const text = body.text ? String(body.text) : '';
    const html = body.html ? String(body.html) : '';
    const subject = body.subject ? String(body.subject) : '';
    const inboundPreview = {
      from: body.from,
      to: body.to,
      subject,
      text,
      html,
      autoSubmitted: headers['auto-submitted'] || null,
      precedence: headers.precedence || null,
    };

    if (shouldIgnoreInboundMessage(inboundPreview)) {
      await logEmailEvent({
        type: 'inbound',
        status: 'skipped',
        provider: 'sendgrid',
        fromEmail: fromEmail || null,
        subject,
        messageId: body['message-id'] || headers['message-id'] || null,
        error: 'Mensagem automática ou enviada pelo próprio sistema ignorada.',
      });
      return sendJson(res, 200, { ok: true, skipped: true });
    }

    const db = getAdminDb();
    const rawMessageId =
      body['Message-Id'] ||
      body['message-id'] ||
      body.message_id ||
      headers['message-id'] ||
      null;
    const inReplyTo = body.in_reply_to || headers['in-reply-to'] || null;
    const referencesRaw = body.references || headers.references || '';
    const lock = await acquireInboundMessageLock(db, {
      messageId: rawMessageId,
      fallbackKey: `${subject}:${fromEmail || ''}:${toEmail || ''}`,
      provider: 'sendgrid',
      source: 'sendgrid-inbound',
      fromEmail,
      subject,
    });
    lockRef = lock.ref;

    if (!lock.acquired) {
      return sendJson(res, 200, {
        ok: true,
        duplicate: true,
        ticketId: lock.data?.ticketId || null,
        messageId: rawMessageId,
      });
    }

    const referencedTicketId = await resolveTicketIdByThreadReferences(db, inReplyTo, referencesRaw);
    const createdTicket =
      explicitTicketId || subjectTicketId || referencedTicketId
        ? null
        : await createTicketFromInbound(db, {
            from: body.from,
            to: body.to,
            subject,
            text,
            html,
            attachments,
            internalDate: new Date(),
          });
    const ticketId = (explicitTicketId || subjectTicketId || referencedTicketId || createdTicket?.id || '')
      .toString()
      .trim()
      .toUpperCase();

    if (!ticketId) {
      await finalizeInboundMessageLock(lock.ref);
      return sendJson(res, 422, { ok: false, error: 'Não foi possível identificar o ticket no inbound.' });
    }

    const messageId = rawMessageId || `<inbound-${ticketId}-${Date.now()}@sendgrid>`;
    const references = String(referencesRaw)
      .split(/\s+/)
      .map(value => value.trim())
      .filter(Boolean)
      .slice(-20);

    const threadRef = db.collection('emailThreads').doc(ticketId);
    const now = new Date();
    const participants = [fromEmail, toEmail].filter(Boolean);

    await threadRef.set(
      {
        ticketId,
        lastMessageId: messageId,
        lastDirection: 'inbound',
        lastInboundAt: now,
        updatedAt: now,
        references,
        ...(participants.length > 0 ? { participants: FieldValue.arrayUnion(...participants) } : {}),
      },
      { merge: true }
    );

    if (messageId) {
      const duplicateSnap = await threadRef
        .collection('messages')
        .where('messageId', '==', messageId)
        .limit(1)
        .get();
      if (!duplicateSnap.empty) {
        await finalizeInboundMessageLock(lock.ref);
        return sendJson(res, 200, { ok: true, duplicate: true, ticketId, messageId });
      }
    }

    await threadRef.collection('messages').add({
      direction: 'inbound',
      fromEmail: fromEmail || null,
      toEmail: toEmail || null,
      subject,
      text: text || null,
      html: html || null,
      messageId,
      inReplyTo,
      references,
      headers,
      attachments: Array.isArray(createdTicket?.attachments) ? createdTicket.attachments : [],
      createdAt: now,
    });

    await db.collection('ticketInbound').add({
      ticketId,
      fromEmail: fromEmail || null,
      subject,
      text: text || null,
      html: html || null,
      messageId,
      attachments: Array.isArray(createdTicket?.attachments) ? createdTicket.attachments : [],
      createdAt: now,
      source: createdTicket ? 'sendgrid-inbound-new-ticket' : 'sendgrid-inbound',
    });

    await finalizeInboundMessageLock(lock.ref);

    if (!createdTicket) {
      await appendInboundMessageToTicketHistory(db, ticketId, {
        from: body.from,
        text,
        html,
        messageId,
        internalDate: now,
      });
    }

    await logEmailEvent({
      type: 'inbound',
      status: 'success',
      provider: 'sendgrid',
      ticketId,
      fromEmail: fromEmail || null,
      subject,
      messageId,
    });

    return sendJson(res, 200, { ok: true, ticketId, messageId });
  } catch (error) {
    await releaseInboundMessageLock(lockRef);
    await logEmailEvent({
      type: 'inbound',
      status: 'error',
      provider: 'sendgrid',
      error: error.message || 'Falha no inbound.',
    });
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha no inbound.' });
  }
}

export default async function handler(req, res) {
  const route = String(req.query?.route || '').trim().toLowerCase();

  if (route === 'send') return handleSend(req, res);
  if (route === 'health') return handleHealth(req, res);
  if (route === 'gmail-sync') return handleGmailSync(req, res);
  if (route === 'gmail-watch') return handleGmailWatch(req, res);
  if (route === 'gmail-push') return handleGmailPush(req, res);
  if (route === 'inbound') return handleInbound(req, res);

  res.setHeader('Allow', 'GET, POST');
  return sendJson(res, 404, { ok: false, error: 'Rota de mail inválida.' });
}





