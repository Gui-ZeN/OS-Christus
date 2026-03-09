import { getStorage } from 'firebase-admin/storage';
import { writeAuditLog } from './_lib/auditLogs.js';
import { requireAdminUser, requireAuthenticatedUser } from './_lib/authz.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { readActorFromHeaders, readJsonBody, sendJson } from './_lib/http.js';
import { normalizeTicketForStorage, serializeTicketForApi } from './_lib/tickets.js';

function sortTimeValue(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function buildActorLabel(user, fallbackActor) {
  if (user?.name) return user.name;
  if (fallbackActor) return fallbackActor;
  if (user?.email) return user.email;
  return 'Sistema';
}

function buildAutomaticStatusHistoryEntry(sender, previousStatus, nextStatus) {
  return {
    id: `status-${Date.now()}`,
    type: 'system',
    sender,
    time: new Date(),
    text: `Status atualizado de "${previousStatus}" para "${nextStatus}".`,
  };
}

function shouldAppendAutomaticHistory(previousHistory, nextHistory) {
  const previousLength = Array.isArray(previousHistory) ? previousHistory.length : 0;
  const nextLength = Array.isArray(nextHistory) ? nextHistory.length : 0;
  return nextLength <= previousLength;
}

function serializeValue(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value && typeof value === 'object' && typeof value.toDate === 'function') {
    const parsed = value.toDate();
    return parsed instanceof Date && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null;
  }

  if (Array.isArray(value)) {
    return value.map(serializeValue);
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, serializeValue(entry)]));
  }

  return value ?? null;
}

async function deleteCollectionDocs(query) {
  const snap = await query.get();
  if (snap.empty) return 0;
  const batch = query.firestore.batch();
  snap.docs.forEach(doc => batch.delete(doc.ref));
  await batch.commit();
  return snap.size;
}

async function deleteSubcollection(ticketRef, name) {
  return deleteCollectionDocs(ticketRef.collection(name));
}

async function deleteStoragePaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return 0;
  const bucket = getStorage().bucket();
  let deleted = 0;

  for (const rawPath of paths) {
    const path = String(rawPath || '').trim();
    if (!path) continue;
    try {
      await bucket.file(path).delete({ ignoreNotFound: true });
      deleted += 1;
    } catch {
      // Não interrompe a exclusão da OS por falha pontual no Storage.
    }
  }

  return deleted;
}

async function deleteTicketCascade(db, ticketId) {
  const ticketRef = db.collection('tickets').doc(ticketId);
  const ticketSnap = await ticketRef.get();
  if (!ticketSnap.exists) {
    throw new Error('Ticket não encontrado.');
  }

  const ticketData = ticketSnap.data() || {};
  const rootAttachments = Array.isArray(ticketData?.attachments)
    ? ticketData.attachments.map(item => item?.path).filter(Boolean)
    : [];
  const closureDocuments = Array.isArray(ticketData?.closureChecklist?.documents)
    ? ticketData.closureChecklist.documents.map(item => item?.path).filter(Boolean)
    : [];

  const [quotesDeleted, contractsDeleted, paymentsDeleted, measurementsDeleted] = await Promise.all([
    deleteSubcollection(ticketRef, 'quotes'),
    deleteSubcollection(ticketRef, 'contracts'),
    deleteSubcollection(ticketRef, 'payments'),
    deleteSubcollection(ticketRef, 'measurements'),
  ]);

  const threadRef = db.collection('emailThreads').doc(ticketId);
  const [threadMessagesDeleted, inboundDeleted, emailEventsDeleted, preferenceEventsDeleted, filesDeleted] = await Promise.all([
    deleteSubcollection(threadRef, 'messages'),
    deleteCollectionDocs(db.collection('ticketInbound').where('ticketId', '==', ticketId)),
    deleteCollectionDocs(db.collection('emailEvents').where('ticketId', '==', ticketId)),
    deleteCollectionDocs(db.collection('vendorPreferenceEvents').where('ticketId', '==', ticketId)),
    deleteStoragePaths([...rootAttachments, ...closureDocuments]),
  ]);

  await Promise.all([
    threadRef.delete().catch(() => undefined),
    ticketRef.delete(),
  ]);

  return {
    before: { id: ticketSnap.id, ...ticketData },
    deleted: {
      ticket: true,
      quotes: quotesDeleted,
      contracts: contractsDeleted,
      payments: paymentsDeleted,
      measurements: measurementsDeleted,
      threadMessages: threadMessagesDeleted,
      inbound: inboundDeleted,
      emailEvents: emailEventsDeleted,
      preferenceEvents: preferenceEventsDeleted,
      storageFiles: filesDeleted,
    },
  };
}

async function readPublicTrackingProcurement(ticketRef) {
  const [contractSnap, paymentsSnap, measurementsSnap] = await Promise.all([
    ticketRef.collection('contracts').limit(1).get(),
    ticketRef.collection('payments').get(),
    ticketRef.collection('measurements').get(),
  ]);

  const contract = contractSnap.empty
    ? null
    : serializeValue({
        id: contractSnap.docs[0].id,
        ...contractSnap.docs[0].data(),
      });

  const payments = paymentsSnap.docs
    .map(doc => serializeValue({ id: doc.id, ...doc.data() }))
    .sort((a, b) => Number(a.installmentNumber || 0) - Number(b.installmentNumber || 0));

  const measurements = measurementsSnap.docs
    .map(doc => serializeValue({ id: doc.id, ...doc.data() }))
    .sort((a, b) => sortTimeValue(b.requestedAt || b.createdAt) - sortTimeValue(a.requestedAt || a.createdAt));

  return {
    contract,
    payments,
    measurements,
  };
}

export default async function handler(req, res) {
  try {
    const db = getAdminDb();
    const col = db.collection('tickets');

    if (req.method === 'GET') {
      const trackingToken = String(req.query?.tracking || '').trim();
      if (trackingToken) {
        const trackingSnap = await col.where('trackingToken', '==', trackingToken).limit(1).get();
        if (trackingSnap.empty) {
          return sendJson(res, 404, { ok: false, error: 'Ticket não encontrado.' });
        }

        const trackingDoc = trackingSnap.docs[0];
        const ticket = serializeTicketForApi({
          id: trackingDoc.id,
          ...trackingDoc.data(),
        });
        const procurement = await readPublicTrackingProcurement(trackingDoc.ref);

        return sendJson(res, 200, { ok: true, ticket, procurement });
      }

      await requireAuthenticatedUser(req);

      const snap = await col.get();
      const tickets = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .map(serializeTicketForApi)
        .sort((a, b) => sortTimeValue(b.time) - sortTimeValue(a.time));

      return sendJson(res, 200, { ok: true, tickets });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      if (!body?.ticket?.id) {
        return sendJson(res, 400, { ok: false, error: 'ticket.id é obrigatório.' });
      }

      const ticket = normalizeTicketForStorage(body.ticket);
      await col.doc(ticket.id).set({
        ...ticket,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      if (!body?.updates) {
        return sendJson(res, 400, { ok: false, error: 'updates são obrigatórios.' });
      }

      if (body?.trackingToken) {
        const trackingToken = String(body.trackingToken || '').trim();
        const trackingSnap = await col.where('trackingToken', '==', trackingToken).limit(1).get();
        if (trackingSnap.empty) {
          return sendJson(res, 404, { ok: false, error: 'Ticket não encontrado.' });
        }

        const normalized = normalizeTicketForStorage(body.updates);
        const allowedUpdates = {};
        if (normalized.status) allowedUpdates.status = normalized.status;
        if (Array.isArray(normalized.history)) allowedUpdates.history = normalized.history;
        if (normalized.closureChecklist) allowedUpdates.closureChecklist = normalized.closureChecklist;

        if (Object.keys(allowedUpdates).length === 0) {
          return sendJson(res, 400, { ok: false, error: 'Nenhuma atualização pública permitida foi enviada.' });
        }

        const beforeData = trackingSnap.docs[0].data() || {};
        if (
          normalized.status &&
          normalized.status !== beforeData.status &&
          shouldAppendAutomaticHistory(beforeData.history, normalized.history)
        ) {
          allowedUpdates.history = [
            ...(Array.isArray(beforeData.history) ? beforeData.history : []),
            buildAutomaticStatusHistoryEntry(
              beforeData.requester || 'Solicitante',
              beforeData.status || 'Sem status',
              normalized.status
            ),
          ];
        }

        await trackingSnap.docs[0].ref.set({ ...allowedUpdates, updatedAt: new Date() }, { merge: true });
        return sendJson(res, 200, { ok: true });
      }

      const user = await requireAuthenticatedUser(req);
      const actor = readActorFromHeaders(req) || user.email || user.name || 'painel';

      if (!body?.id) {
        return sendJson(res, 400, { ok: false, error: 'id e updates são obrigatórios.' });
      }

      const updates = normalizeTicketForStorage(body.updates);
      const docRef = col.doc(body.id);
      const beforeSnap = await docRef.get();
      if (!beforeSnap.exists) {
        return sendJson(res, 404, { ok: false, error: 'Ticket não encontrado.' });
      }

      const beforeData = beforeSnap.data() || {};
      const payload = { ...updates, updatedAt: new Date() };

      if (
        updates.status &&
        updates.status !== beforeData.status &&
        shouldAppendAutomaticHistory(beforeData.history, updates.history)
      ) {
        payload.history = [
          ...(Array.isArray(beforeData.history) ? beforeData.history : []),
          buildAutomaticStatusHistoryEntry(
            buildActorLabel(user, actor),
            beforeData.status || 'Sem status',
            updates.status
          ),
        ];
      }

      await docRef.set(payload, { merge: true });
      return sendJson(res, 200, { ok: true });
    }

    if (req.method === 'DELETE') {
      const admin = await requireAdminUser(req);
      const actor = readActorFromHeaders(req) || admin.email || admin.name || 'painel';
      const body = await readJsonBody(req);
      const id = String(body?.id || '').trim();
      if (!id) {
        return sendJson(res, 400, { ok: false, error: 'id é obrigatório.' });
      }

      const result = await deleteTicketCascade(db, id);
      await writeAuditLog({
        actor,
        action: 'tickets.delete',
        entity: 'ticket',
        entityId: id,
        before: result.before,
        after: result.deleted,
      });

      return sendJson(res, 200, { ok: true, id, deleted: result.deleted });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha no endpoint de tickets.' });
  }
}
