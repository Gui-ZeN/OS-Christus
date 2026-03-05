import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '../_lib/firebaseAdmin.js';
import { readJsonBody, sendJson } from '../_lib/http.js';
import { sendWithSendGrid } from '../_lib/sendgrid.js';

function required(input, name) {
  if (!input || String(input).trim() === '') throw new Error(`Campo obrigatório: ${name}`);
  return String(input).trim();
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { error: 'Método não permitido.' });
    }

    const body = await readJsonBody(req);
    const ticketId = required(body.ticketId, 'ticketId');
    const toEmail = required(body.toEmail, 'toEmail');
    const subject = body.subject ? String(body.subject) : `Atualização da OS ${ticketId}`;
    const text = body.text ? String(body.text) : '';
    const html = body.html ? String(body.html) : '';
    const templateId = body.templateId ? String(body.templateId) : null;
    const templateData = body.templateData && typeof body.templateData === 'object' ? body.templateData : {};
    const trackingToken = body.trackingToken ? String(body.trackingToken) : null;

    if (!templateId && !text && !html) {
      throw new Error('Informe text/html ou templateId para envio.');
    }

    const db = getAdminDb();
    const threadRef = db.collection('emailThreads').doc(ticketId);
    const threadSnap = await threadRef.get();
    const thread = threadSnap.exists ? threadSnap.data() : null;

    const priorMessageId = thread?.lastMessageId || null;
    const references = thread?.references || [];
    const nextReferences = priorMessageId
      ? [...new Set([...references, priorMessageId])].slice(-20)
      : references;

    const headers = {
      'X-OS-Ticket-ID': ticketId,
      ...(trackingToken ? { 'X-OS-Tracking-Token': trackingToken } : {}),
      ...(priorMessageId ? { 'In-Reply-To': priorMessageId } : {}),
      ...(nextReferences.length > 0 ? { References: nextReferences.join(' ') } : {}),
    };

    const sendResult = await sendWithSendGrid({
      toEmail,
      subject,
      text,
      html,
      templateId,
      templateData,
      headers,
      replyTo: process.env.SENDGRID_REPLY_TO_EMAIL || undefined,
    });

    const now = new Date();
    const messageId = sendResult.messageId || `<os-${ticketId}-${now.getTime()}@os-christus>`;
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
      text: text || null,
      templateId: templateId || null,
      messageId,
      inReplyTo: priorMessageId,
      references: mergedReferences,
      headers,
      createdAt: now,
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
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha ao enviar e-mail.' });
  }
}
