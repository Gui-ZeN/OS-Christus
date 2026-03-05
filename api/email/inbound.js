import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '../_lib/firebaseAdmin.js';
import { parseInboundBody, sendJson } from '../_lib/http.js';
import { logEmailEvent } from '../_lib/emailLogs.js';

function parseTicketIdFromSubject(subject) {
  if (!subject) return null;
  const match = String(subject).match(/\bOS-\d{3,}\b/i);
  return match ? match[0].toUpperCase() : null;
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

function getFirstEmail(raw) {
  if (!raw) return null;
  const value = String(raw);
  const emailMatch = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return emailMatch ? emailMatch[0].toLowerCase() : null;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Método não permitido.' });
    }

    const configuredSecret = process.env.SENDGRID_INBOUND_SECRET;
    if (configuredSecret) {
      const provided =
        req.query?.secret ||
        req.headers['x-os-secret'] ||
        req.headers['x-inbound-secret'] ||
        null;
      if (provided !== configuredSecret) {
        return sendJson(res, 401, { ok: false, error: 'Segredo inválido no inbound.' });
      }
    }

    const body = await parseInboundBody(req);
    const headers = normalizeHeaders(body.headers);

    const explicitTicketId = body.ticketId || body.ticket_id || headers['x-os-ticket-id'];
    const subjectTicketId = parseTicketIdFromSubject(body.subject);
    const ticketId = (explicitTicketId || subjectTicketId || '').toString().trim().toUpperCase();

    if (!ticketId) {
      return sendJson(res, 422, { ok: false, error: 'Não foi possível identificar o ticket no inbound.' });
    }

    const fromEmail = getFirstEmail(body.from);
    const toEmail = getFirstEmail(body.to);
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
      .map(v => v.trim())
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

    // Espelho simplificado para consumo do app interno.
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
