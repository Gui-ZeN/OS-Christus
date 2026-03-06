import { FieldValue } from 'firebase-admin/firestore';
import { requireAuthenticatedUser, requireUserWithRoles } from './_lib/authz.js';
import { logEmailEvent } from './_lib/emailLogs.js';
import { buildTicketEmailTemplate } from './_lib/emailTemplates.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { gmailGetMessage, gmailGetProfile, gmailListRecentInbox, gmailSend } from './_lib/gmail.js';
import { parseInboundBody, readJsonBody, sendJson } from './_lib/http.js';
import { sendWithSendGrid } from './_lib/sendgrid.js';

function required(input, name) {
  if (!input || String(input).trim() === '') throw new Error(`Campo obrigatório: ${name}`);
  return String(input).trim();
}

function parseTicketId(text) {
  if (!text) return null;
  const match = String(text).match(/\bOS-\d{3,}\b/i);
  return match ? match[0].toUpperCase() : null;
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

async function handleSend(req, res) {
  let ticketIdForLog = null;
  let toEmailForLog = null;
  const providerForLog = (process.env.EMAIL_PROVIDER || 'sendgrid').toLowerCase();

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
    }

    await requireAuthenticatedUser(req);

    const body = await readJsonBody(req);
    const ticketId = required(body.ticketId, 'ticketId');
    ticketIdForLog = ticketId;

    const toEmailInput = body.toEmail ? String(body.toEmail).trim() : '';
    const subject = body.subject ? String(body.subject) : `Atualização da OS ${ticketId}`;
    const text = body.text ? String(body.text) : '';
    const html = body.html ? String(body.html) : '';
    const templateId = body.templateId ? String(body.templateId) : null;
    const templateData = body.templateData && typeof body.templateData === 'object' ? body.templateData : {};
    const trackingToken = body.trackingToken ? String(body.trackingToken) : null;

    if (!templateId && !text && !html) {
      throw new Error('Informe text/html ou templateId para envio.');
    }

    const fallbackTemplate = buildTicketEmailTemplate({
      title: templateData.title || `Atualização da OS ${ticketId}`,
      intro: templateData.intro || 'Sua solicitação recebeu uma nova atualização.',
      ticketId,
      subject: templateData.ticketSubject || subject,
      status: templateData.status || 'Atualizada',
      ctaUrl: templateData.ctaUrl || null,
      ctaLabel: templateData.ctaLabel || 'Acompanhar OS',
      bodyText: text || templateData.bodyText || '',
    });

    const finalText = text || fallbackTemplate.text;
    const finalHtml = html || fallbackTemplate.html;

    const db = getAdminDb();
    const threadRef = db.collection('emailThreads').doc(ticketId);
    const threadSnap = await threadRef.get();
    const thread = threadSnap.exists ? threadSnap.data() : null;

    const toEmail = toEmailInput || thread?.toEmail || null;
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
            subject,
            text: finalText,
            html: finalHtml,
            inReplyTo: priorMessageId || undefined,
            references: nextReferences,
            ticketId,
            trackingToken: trackingToken || undefined,
          })
        : await sendWithSendGrid({
            toEmail,
            subject,
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

    await threadRef.set(
      {
        ticketId,
        toEmail,
        lastMessageId: messageId,
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
      subject,
      text: finalText || null,
      html: finalHtml || null,
      templateId: templateId || null,
      messageId,
      inReplyTo: priorMessageId,
      references: mergedReferences,
      headers,
      createdAt: now,
    });

    await logEmailEvent({
      type: 'outbound',
      status: 'success',
      provider,
      ticketId,
      toEmail,
      subject,
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

    const syncSecret = process.env.GMAIL_SYNC_SECRET;
    const cronSecret = process.env.CRON_SECRET;
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (syncSecret || cronSecret) {
      const provided = req.query?.secret || req.headers['x-sync-secret'] || bearer;
      const validSecrets = [syncSecret, cronSecret].filter(Boolean);
      if (!provided || !validSecrets.includes(provided)) {
        return sendJson(res, 401, { ok: false, error: 'Segredo inválido.' });
      }
    }

    const db = getAdminDb();
    const stateRef = db.collection('config').doc('gmailSync');
    const stateSnap = await stateRef.get();
    const state = stateSnap.exists ? stateSnap.data() : {};
    const seenIds = new Set(Array.isArray(state.seenMessageIds) ? state.seenMessageIds : []);

    const refs = await gmailListRecentInbox(40);
    let processed = 0;
    const newSeen = [...seenIds];

    for (const ref of refs) {
      if (!ref.id || seenIds.has(ref.id)) continue;
      const msg = await gmailGetMessage(ref.id);
      const ticketId = msg.ticketId || parseTicketId(msg.subject) || parseTicketId(msg.text);
      if (!ticketId) continue;

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
        messageId: msg.messageId || msg.id || null,
        inReplyTo: msg.inReplyTo || null,
        references,
        provider: 'gmail',
        createdAt: now,
      });

      await db.collection('ticketInbound').add({
        ticketId,
        fromEmail: fromEmail || null,
        subject: msg.subject || '',
        text: msg.text || null,
        createdAt: now,
        source: 'gmail-api-sync',
      });

      await logEmailEvent({
        type: 'inbound',
        status: 'success',
        provider: 'gmail',
        ticketId,
        fromEmail: fromEmail || null,
        subject: msg.subject || '',
        messageId: msg.messageId || msg.id || null,
      });

      processed += 1;
      newSeen.push(ref.id);
      seenIds.add(ref.id);
    }

    await stateRef.set(
      {
        seenMessageIds: newSeen.slice(-200),
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

    const explicitTicketId = body.ticketId || body.ticket_id || headers['x-os-ticket-id'];
    const subjectTicketId = parseTicketId(body.subject);
    const ticketId = (explicitTicketId || subjectTicketId || '').toString().trim().toUpperCase();

    if (!ticketId) {
      return sendJson(res, 422, { ok: false, error: 'Não foi possível identificar o ticket no inbound.' });
    }

    const fromEmail = firstEmail(body.from);
    const toEmail = firstEmail(body.to);
    const text = body.text ? String(body.text) : '';
    const html = body.html ? String(body.html) : '';
    const subject = body.subject ? String(body.subject) : '';
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

    const db = getAdminDb();
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
      subject,
      text: text || null,
      html: html || null,
      messageId,
      inReplyTo,
      references,
      headers,
      createdAt: now,
    });

    await db.collection('ticketInbound').add({
      ticketId,
      fromEmail: fromEmail || null,
      subject,
      text: text || null,
      html: html || null,
      createdAt: now,
      source: 'sendgrid-inbound',
    });

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
  if (route === 'inbound') return handleInbound(req, res);

  res.setHeader('Allow', 'GET, POST');
  return sendJson(res, 404, { ok: false, error: 'Rota de mail inválida.' });
}
