import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '../_lib/firebaseAdmin.js';
import { sendJson } from '../_lib/http.js';
import { gmailGetMessage, gmailListRecentInbox } from '../_lib/gmail.js';
import { logEmailEvent } from '../_lib/emailLogs.js';

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

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Método não permitido.' });
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
        .map(v => v.trim())
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
