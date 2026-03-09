import { randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { requireAuthenticatedUser, requireUserWithRoles } from './_lib/authz.js';
import { logEmailEvent } from './_lib/emailLogs.js';
import { buildTicketEmailTemplate } from './_lib/emailTemplates.js';
import { DEFAULT_SETTINGS } from './_lib/settingsDefaults.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { reserveNextTicketId } from './_lib/tickets.js';
import {
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
  const match = String(text).match(/^\s*\[([^\]]+)\]\s*-\s*(.+?)\s*$/);
  if (!match) return null;
  return {
    siteCode: String(match[1] || '').trim(),
    subject: String(match[2] || '').trim(),
  };
}

function displayNameFromEmail(raw) {
  const email = firstEmail(raw);
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

  const markers = [/^\s*On .+ wrote:\s*$/im, /^\s*Em .+ escreveu:\s*$/im, /^\s*-----Original Message-----\s*$/im];
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
    .filter(line => !line.trim().startsWith('>'))
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

function repairMojibake(value) {
  const input = String(value || '');
  if (!input || (!input.includes('Ã') && !input.includes('Â') && !input.includes('â'))) {
    return input;
  }

  try {
    const repaired = Buffer.from(input, 'latin1').toString('utf8');
    if (!repaired || repaired.includes('�')) return input;
    return repaired;
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
  };
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

function buildConversationSubject(ticketId, ticketSubject, fallbackSubject) {
  const cleanSubject = String(ticketSubject || fallbackSubject || '').trim();
  if (!ticketId) return repairMojibake(cleanSubject || fallbackSubject || 'Atualização da OS');
  if (!cleanSubject) return `${ticketId} - Atualização da OS`;
  if (cleanSubject.toUpperCase().startsWith(`${ticketId.toUpperCase()} - `)) {
    return repairMojibake(cleanSubject);
  }
  return repairMojibake(`${ticketId} - ${cleanSubject}`);
}

function buildInboundHistoryId(messageId, fallbackKey) {
  const base = String(messageId || fallbackKey || Date.now())
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return `mail-${base || Date.now()}`;
}

function buildInboundHistoryEntry(message, fallbackSender) {
  const sender = displayNameFromEmail(message.from) || fallbackSender || 'Solicitante';
  const text = stripQuotedReply(message.text) || stripQuotedReply(stripHtml(message.html)) || 'Resposta recebida por e-mail.';
  return {
    id: buildInboundHistoryId(message.messageId || message.id, sender),
    type: 'customer',
    sender,
    time: message.internalDate || new Date(),
    text,
  };
}

async function appendInboundMessageToTicketHistory(db, ticketId, message) {
  const ticketRef = db.collection('tickets').doc(ticketId);
  const ticketSnap = await ticketRef.get();
  if (!ticketSnap.exists) return;

  const ticket = ticketSnap.data() || {};
  const history = Array.isArray(ticket.history) ? ticket.history : [];
  const nextEntry = buildInboundHistoryEntry(message, ticket.requester || 'Solicitante');
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
  const createdTicket =
    msg.ticketId || parseTicketId(msg.subject) || parseTicketId(msg.text) ? null : await createTicketFromInbound(db, msg);
  const ticketId = msg.ticketId || parseTicketId(msg.subject) || parseTicketId(msg.text) || createdTicket?.id;
  if (!ticketId) return false;

  const threadRef = db.collection('emailThreads').doc(ticketId);
  const now = msg.internalDate || new Date();
  const fromEmail = firstEmail(msg.from);
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
      lastMessageId: msg.messageId || msg.id,
      lastDirection: 'inbound',
      lastInboundAt: now,
      updatedAt: now,
      references,
      gmailThreadId: msg.threadId || null,
      ...(participants.length > 0 ? { participants: FieldValue.arrayUnion(...participants) } : {}),
    },
    { merge: true }
  );

  await threadRef.collection('messages').add({
    direction: 'inbound',
    fromEmail: fromEmail || null,
    toEmail: toEmail || null,
    subject: msg.subject || '',
    text: msg.text || null,
    html: msg.html || null,
    messageId: msg.messageId || msg.id || null,
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
    attachments: Array.isArray(createdTicket?.attachments) ? createdTicket.attachments : [],
    createdAt: now,
    source,
  });

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
    messageId: msg.messageId || msg.id || null,
  });

  return true;
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
  const requesterEmail = String(ticket.requesterEmail || '').trim().toLowerCase();
  const internalEmail = getInternalNotificationEmail();
  const normalizedRecipient = String(toEmail || '').trim().toLowerCase();

  if (internalCopy && internalEmail) return true;
  return Boolean(requesterEmail && normalizedRecipient && requesterEmail === normalizedRecipient);
}

async function buildNextTicketId(db) {
  return reserveNextTicketId(db);
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

async function uploadInboundAttachments(ticketId, attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];

  const bucket = getStorage().bucket();
  const uploadedAt = new Date();
  const results = [];

  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    if (!attachment?.buffer) continue;

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
  const description = String(message.text || '').trim() || stripHtml(message.html) || parsedSubject.subject;

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
    priority: 'Normal',
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
    const internalEmail = getInternalNotificationEmail();

    if (internalCopy && !internalEmail) {
      return sendJson(res, 200, { ok: true, skipped: 'internal-copy-without-recipient' });
    }

    if (!templateId && !trigger && !text && !html) {
      throw new Error('Informe text, html, templateId ou trigger para envio.');
    }

    const db = getAdminDb();
    const isPublicCreationEmail =
      trigger === 'EMAIL-NOVA-OS' &&
      (await canSendPublicCreationEmail(db, ticketId, toEmailInput, internalCopy));

    if (!isPublicCreationEmail) {
      await requireAuthenticatedUser(req);
    }

    const storedTemplate = await resolveEmailTemplate(db, trigger);
    const templateSubject = repairMojibake(
      storedTemplate?.subject ? renderTemplateString(storedTemplate.subject, variables) : subject
    );
    const resolvedBody = repairMojibake(storedTemplate?.body ? renderTemplateString(storedTemplate.body, variables) : text);
    const resolvedTicket = variables.ticket && typeof variables.ticket === 'object' ? variables.ticket : {};
    const resolvedGuarantee = variables.guarantee && typeof variables.guarantee === 'object' ? variables.guarantee : {};
    const resolvedSubject = buildConversationSubject(
      ticketId,
      templateData.ticketSubject || resolvedTicket.subject,
      templateSubject
    );

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
      bodyText: resolvedBody || templateData.bodyText || '',
    });

    const finalText = resolvedBody || text || fallbackTemplate.text;
    const finalHtml = html || fallbackTemplate.html;
    const threadRef = db.collection('emailThreads').doc(ticketId);
    const threadSnap = await threadRef.get();
    const thread = threadSnap.exists ? threadSnap.data() : null;

    const toEmail = internalCopy ? internalEmail : toEmailInput || thread?.toEmail || null;
    toEmailForLog = toEmail;
    if (!toEmail) {
      throw new Error('Campo obrigatório: toEmail (ou thread existente com destinatário).');
    }

    const priorMessageId = thread?.lastMessageId || null;
    const references = thread?.references || [];
    const nextReferences = priorMessageId ? [...new Set([...references, priorMessageId])].slice(-20) : references;

    const headers = {
      'X-OS-Ticket-ID': ticketId,
      ...(trackingToken ? { 'X-OS-Tracking-Token': trackingToken } : {}),
      ...(priorMessageId ? { 'In-Reply-To': priorMessageId } : {}),
      ...(nextReferences.length > 0 ? { References: nextReferences.join(' ') } : {}),
    };

    const provider = providerForLog;
    const sendResult =
      provider === 'gmail'
        ? await gmailSend({
            toEmail,
            subject: resolvedSubject,
            text: finalText,
            html: finalHtml,
            inReplyTo: priorMessageId || undefined,
            references: nextReferences,
            ticketId,
            trackingToken: trackingToken || undefined,
            threadId: thread?.gmailThreadId || undefined,
          })
        : await sendWithSendGrid({
            toEmail,
            subject: resolvedSubject,
            text: finalText,
            html: finalHtml,
            templateId,
            templateData,
            headers,
            replyTo: process.env.SENDGRID_REPLY_TO_EMAIL || undefined,
          });

    const now = new Date();
    const messageId = sendResult.messageId || sendResult.id || `<os-${ticketId}-${now.getTime()}@os-christus>`;
    const mergedReferences = [...new Set([...nextReferences, messageId])].slice(-20);

    if (!skipThread) {
      await threadRef.set(
        {
          ticketId,
          toEmail,
          lastMessageId: messageId,
          gmailThreadId: sendResult.threadId || thread?.gmailThreadId || null,
          references: mergedReferences,
          lastDirection: 'outbound',
          lastOutboundAt: now,
          updatedAt: now,
          participants: FieldValue.arrayUnion(toEmail),
        },
        { merge: true }
      );

      await threadRef.collection('messages').add({
        direction: 'outbound',
        toEmail,
        subject: resolvedSubject,
        text: finalText || null,
        html: finalHtml || null,
        templateId: templateId || null,
        trigger: trigger || null,
        messageId,
        inReplyTo: priorMessageId,
        references: mergedReferences,
        headers,
        createdAt: now,
      });
    }

    await logEmailEvent({
      type: 'outbound',
      status: 'success',
      provider,
      ticketId,
      toEmail,
      subject: resolvedSubject,
      messageId,
    });

    return sendJson(res, 200, {
      ok: true,
      ticketId,
      toEmail,
      messageId,
      inReplyTo: priorMessageId,
      references: mergedReferences,
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
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha ao ler saúde de e-mail.' });
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
    const db = getAdminDb();
    const createdTicket =
      explicitTicketId || subjectTicketId
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
    const ticketId = (explicitTicketId || subjectTicketId || createdTicket?.id || '').toString().trim().toUpperCase();

    if (!ticketId) {
      return sendJson(res, 422, { ok: false, error: 'Não foi possível identificar o ticket no inbound.' });
    }

    const messageId =
      body['Message-Id'] ||
      body['message-id'] ||
      body.message_id ||
      headers['message-id'] ||
      `<inbound-${ticketId}-${Date.now()}@sendgrid>`;
    const inReplyTo = body.in_reply_to || headers['in-reply-to'] || null;
    const referencesRaw = body.references || headers.references || '';
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

    await threadRef.collection('messages').add({
      direction: 'inbound',
      fromEmail: fromEmail || null,
      toEmail: toEmail || null,
      subject: subject,
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
      subject: subject,
      text: text || null,
      html: html || null,
      attachments: Array.isArray(createdTicket?.attachments) ? createdTicket.attachments : [],
      createdAt: now,
      source: createdTicket ? 'sendgrid-inbound-new-ticket' : 'sendgrid-inbound',
    });

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
      subject: subject,
      messageId,
    });

    return sendJson(res, 200, { ok: true, ticketId, messageId });
  } catch (error) {
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



