import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { writeAuditLog } from './_lib/auditLogs.js';
import { requireAdminUser, requireAuthenticatedUser } from './_lib/authz.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { HttpError, parseInboundBody, readActorFromHeaders, readJsonBody, sendError, sendJson } from './_lib/http.js';
import { canUserAccessTicket, readAccessibleTickets, readTerritoryCatalog } from './_lib/ticketAccess.js';
import { normalizeTicketForStorage, reserveNextTicketId, serializeTicketForApi } from './_lib/tickets.js';

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

function buildPublicTrackingHistoryEntry(sender, approved) {
  return {
    id: `tracking-${Date.now()}`,
    type: 'customer',
    sender,
    time: new Date(),
    text: approved
      ? 'Solicitante validou a execução do serviço.'
      : 'Solicitante reprovou a entrega e devolveu a OS para execução.',
  };
}

function sanitizePublicTicketCreate(rawTicket) {
  const allowed = {
    subject: rawTicket.subject,
    requester: rawTicket.requester,
    requesterEmail: rawTicket.requesterEmail,
    time: rawTicket.time,
    status: 'Nova OS',
    type: rawTicket.type,
    macroServiceId: rawTicket.macroServiceId,
    macroServiceName: rawTicket.macroServiceName,
    serviceCatalogId: rawTicket.serviceCatalogId,
    serviceCatalogName: rawTicket.serviceCatalogName,
    regionId: rawTicket.regionId,
    region: rawTicket.region,
    siteId: rawTicket.siteId,
    sede: rawTicket.sede,
    sector: rawTicket.sector,
    priority: rawTicket.priority || 'Normal',
    attachments: Array.isArray(rawTicket.attachments) ? rawTicket.attachments : [],
    history: Array.isArray(rawTicket.history) ? rawTicket.history : [],
  };

  return normalizeTicketForStorage(allowed);
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

function slugFilename(value) {
  return String(value || 'arquivo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function uploadTicketAttachments(ticketId, attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];

  const bucket = getStorage().bucket();
  const uploadedAt = new Date();
  const results = [];

  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    if (!attachment?.buffer) continue;

    const filename = slugFilename(attachment.filename || `anexo-${index + 1}`) || `anexo-${Date.now()}-${index + 1}`;
    const isPdf = String(attachment.mimeType || '').toLowerCase() === 'application/pdf';
    const baseFolder = isPdf ? 'attachments/tickets/pdfs' : 'attachments/tickets/images';
    const path = `${baseFolder}/${ticketId}/public-${Date.now()}-${index + 1}-${filename}`;
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

async function deleteTicketCascade(db, ticketId) {
  const ticketRef = db.collection('tickets').doc(ticketId);
  const ticketSnap = await ticketRef.get();
  if (!ticketSnap.exists) {
    throw new HttpError(404, 'Ticket não encontrado.');
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

      const user = await requireAuthenticatedUser(req);
      const tickets = await readAccessibleTickets(db, user);

      return sendJson(
        res,
        200,
        {
          ok: true,
          tickets: tickets
            .map(serializeTicketForApi)
            .sort((a, b) => sortTimeValue(b.time) - sortTimeValue(a.time)),
        }
      );
    }

    if (req.method === 'POST') {
      const parsedBody = await parseInboundBody(req);
      let ticketPayload = parsedBody?.ticket;
      if (typeof ticketPayload === 'string') {
        try {
          ticketPayload = JSON.parse(ticketPayload);
        } catch {
          ticketPayload = null;
        }
      }

      if (!ticketPayload || typeof ticketPayload !== 'object') {
        return sendJson(res, 400, { ok: false, error: 'ticket é obrigatório.' });
      }

      let user = null;
      const hasAuthHeader = String(req.headers.authorization || '').trim().length > 0;
      if (hasAuthHeader) {
        user = await requireAuthenticatedUser(req);
      } else {
        user = null;
      }

      const ticket = user ? normalizeTicketForStorage(ticketPayload) : sanitizePublicTicketCreate(ticketPayload);
      const now = new Date();
      const ticketId = await reserveNextTicketId(db);
      const trackingToken =
        String(ticket.trackingToken || '').trim() || `trk_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
      const uploadedAttachments = await uploadTicketAttachments(
        ticketId,
        Array.isArray(parsedBody?.attachments) ? parsedBody.attachments : []
      );
      const createdTicket = {
        ...ticket,
        id: ticketId,
        trackingToken,
        time: ticket.time || now,
        attachments: [...(Array.isArray(ticket.attachments) ? ticket.attachments : []), ...uploadedAttachments],
        createdAt: now,
        updatedAt: now,
      };

      await col.doc(ticketId).set(createdTicket);

      await writeAuditLog({
        actor: user ? buildActorLabel(user, user.email || user.name || 'painel') : 'Sistema',
        action: 'tickets.create',
        entity: 'ticket',
        entityId: ticketId,
        before: null,
        after: createdTicket,
      });

      return sendJson(res, 200, { ok: true, ticket: serializeTicketForApi(createdTicket) });
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
        const beforeData = trackingSnap.docs[0].data() || {};
        const requesterName = beforeData.requester || 'Solicitante';
        const nextStatus = String(normalized.status || '').trim();
        const isApproval =
          nextStatus === 'Aguardando pagamento' &&
          normalized.closureChecklist?.requesterApproved === true &&
          beforeData.status === 'Aguardando aprovação da manutenção';
        const isRejection =
          nextStatus === 'Em andamento' &&
          beforeData.status === 'Aguardando aprovação da manutenção';

        if (!isApproval && !isRejection) {
          return sendJson(res, 400, { ok: false, error: 'Atualização pública inválida para este ticket.' });
        }

        const nextClosureChecklist = isApproval
          ? {
              ...(beforeData.closureChecklist || {}),
              requesterApproved: true,
              requesterApprovedBy: requesterName,
              requesterApprovedAt: new Date(),
            }
          : {
              ...(beforeData.closureChecklist || {}),
              requesterApproved: false,
              requesterApprovedBy: null,
              requesterApprovedAt: null,
            };

        const nextHistory = [
          ...(Array.isArray(beforeData.history) ? beforeData.history : []),
          buildPublicTrackingHistoryEntry(requesterName, isApproval),
          buildAutomaticStatusHistoryEntry(
            requesterName,
            beforeData.status || 'Sem status',
            nextStatus
          ),
        ];

        await trackingSnap.docs[0].ref.set(
          {
            status: nextStatus,
            closureChecklist: nextClosureChecklist,
            history: nextHistory,
            updatedAt: new Date(),
          },
          { merge: true }
        );

        await writeAuditLog({
          actor: requesterName,
          action: 'tickets.status.change',
          entity: 'ticket',
          entityId: trackingSnap.docs[0].id,
          before: {
            status: beforeData.status || null,
            subject: beforeData.subject || null,
            requester: beforeData.requester || null,
          },
          after: {
            status: nextStatus,
            subject: beforeData.subject || null,
            requester: beforeData.requester || null,
          },
        });
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
      if (user.role !== 'Admin' && user.role !== 'Diretor') {
        const { regions, sites } = await readTerritoryCatalog(db);
        if (!canUserAccessTicket(user, { id: beforeSnap.id, ...beforeData }, regions, sites)) {
          return sendJson(res, 403, { ok: false, error: 'Permissão insuficiente para editar este ticket.' });
        }
      }
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

      const auditAction =
        updates.status && updates.status !== beforeData.status
          ? 'tickets.status.change'
          : 'tickets.update';

      await writeAuditLog({
        actor: buildActorLabel(user, actor),
        action: auditAction,
        entity: 'ticket',
        entityId: beforeSnap.id,
        before: beforeData,
        after: {
          ...beforeData,
          ...payload,
        },
      });

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
    return sendError(res, error, 'Falha no endpoint de tickets.');
  }
}

