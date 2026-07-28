import { basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { getStorage } from 'firebase-admin/storage';

import { canRoleReadAttachmentPath, findAttachmentReference, isAttachmentPathInTicketScope } from './_lib/attachmentAccess.js';
import {
  clearFlatAttachmentFields,
  findProtectedEvidenceReason,
  removeAttachmentReference,
} from './_lib/attachmentRemoval.js';
import { writeAuditLog } from './_lib/auditLogs.js';
import { TICKET_HISTORY_SUBCOLLECTION } from './_lib/tickets.js';
import { streamDriveFile } from './_lib/attachmentProxy.js';
import { assertAllowedAttachmentContent } from './_lib/attachments.js';
import { requireUserWithRoles } from './_lib/authz.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { HttpError, parseInboundBody, sendError, sendJson } from './_lib/http.js';
import { enforceRateLimit } from './_lib/rateLimit.js';
import { canUserAccessTicket, readTerritoryCatalog } from './_lib/ticketAccess.js';
import { slugFilename } from './_lib/text.js';

const ATTACHMENT_UPLOAD_LIMITS = Object.freeze({
  maxFiles: 1,
  maxFileSizeBytes: 25 * 1024 * 1024,
  maxTotalFileBytes: 25 * 1024 * 1024,
  maxFields: 12,
  maxFieldSizeBytes: 1024,
  maxParts: 16,
  maxRequestSizeBytes: 26 * 1024 * 1024,
});

const UPLOAD_SCOPES = new Set(['closure', 'payment', 'measurement', 'quote', 'contract', 'message']);

function safePathSegment(value, label) {
  const normalized = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(normalized)) {
    throw new HttpError(400, `${label} inválido.`);
  }
  return normalized;
}

function isImage(contentType) {
  return String(contentType || '').startsWith('image/');
}

function resolveUploadTarget(ticketId, scope, contentType, filename, fields) {
  const safeTicketId = safePathSegment(ticketId, 'OS');
  const safeFilename = slugFilename(filename) || `anexo-${Date.now()}`;
  const uniqueName = `${Date.now()}-${randomUUID().slice(0, 8)}-${safeFilename}`;
  const image = isImage(contentType);

  switch (scope) {
    case 'closure':
      if (!image && contentType !== 'application/pdf') {
        throw new HttpError(400, 'Documentos de encerramento devem ser imagem ou PDF.');
      }
      return {
        path: `attachments/tickets/${contentType === 'application/pdf' ? 'pdfs' : 'images'}/${safeTicketId}/closure-${uniqueName}`,
        category: contentType === 'application/pdf' ? 'closure_report' : 'closure_evidence',
      };
    case 'payment':
      return {
        path: `attachments/tickets/payments/${safeTicketId}/${safePathSegment(fields.paymentId, 'Pagamento')}/${uniqueName}`,
        category: 'attachment',
      };
    case 'measurement':
      return {
        path: `attachments/tickets/measurements/${safeTicketId}/${safePathSegment(fields.measurementId, 'Medição')}/${uniqueName}`,
        category: 'attachment',
      };
    case 'quote':
      if (!image && contentType !== 'application/pdf') {
        throw new HttpError(400, 'Anexos de cotação devem ser imagem ou PDF.');
      }
      return {
        path: `attachments/tickets/quotes/${safeTicketId}/${safePathSegment(fields.roundKey, 'Rodada')}/${safePathSegment(fields.quoteId, 'Cotação')}/${uniqueName}`,
        category: 'attachment',
      };
    case 'contract':
      if (contentType !== 'application/pdf') {
        throw new HttpError(400, 'O contrato deve ser enviado em PDF.');
      }
      return {
        path: `attachments/tickets/contracts/${safeTicketId}/${uniqueName}`,
        category: 'attachment',
      };
    case 'message': {
      const channel = String(fields.channel || '').trim();
      if (!['internal', 'public', 'director'].includes(channel)) {
        throw new HttpError(400, 'Canal da mensagem inválido.');
      }
      return {
        path: `attachments/tickets/messages/${safeTicketId}/${channel}/${uniqueName}`,
        category: 'attachment',
      };
    }
    default:
      throw new HttpError(400, 'Tipo de anexo inválido.');
  }
}

function safeHeaderFilename(value) {
  return String(value || 'anexo')
    .replace(/[\r\n"]/g, '')
    .trim()
    .slice(0, 180) || 'anexo';
}

function asciiHeaderFilename(value) {
  return safeHeaderFilename(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '_');
}

function appendSnapshotData(target, snapshot) {
  for (const doc of snapshot.docs) target.push(doc.data() || {});
}

async function readProcurementAttachmentSources(ticketRef) {
  const [quotesSnap, contractsSnap, paymentsSnap, measurementsSnap] = await Promise.all([
    ticketRef.collection('quotes').get(),
    ticketRef.collection('contracts').get(),
    ticketRef.collection('payments').get(),
    ticketRef.collection('measurements').get(),
  ]);
  const sources = [];
  appendSnapshotData(sources, quotesSnap);
  appendSnapshotData(sources, contractsSnap);
  appendSnapshotData(sources, paymentsSnap);
  appendSnapshotData(sources, measurementsSnap);
  return sources;
}

async function readHistoryAttachmentReference(ticketRef, locator) {
  const historySnap = await ticketRef.collection(TICKET_HISTORY_SUBCOLLECTION).get();
  for (const doc of historySnap.docs) {
    const reference = findAttachmentReference(doc.data() || {}, locator);
    if (reference) return reference;
  }
  return null;
}

// Coleções varridas na exclusão, na mesma ordem em que a busca as consulta.
const ATTACHMENT_OWNER_COLLECTIONS = ['quotes', 'contracts', 'payments', 'measurements'];

// Contrato guarda o arquivo assinado em campos SOLTOS, não em lista.
const FLAT_ATTACHMENT_FIELD_GROUPS = [
  {
    pathField: 'signedFilePath',
    fields: ['signedFilePath', 'signedFileName', 'signedFileUrl', 'signedFileContentType', 'signedFileSize'],
  },
];

/**
 * Tira a referência do anexo de TODO lugar onde ela viva, numa transação só:
 * doc da OS (attachments, closureChecklist.documents, history embutido),
 * subcoleções de compras e a subcoleção de histórico.
 *
 * Roda ANTES de apagar o objeto e recusa evidência financeira já aprovada.
 */
async function removeAttachmentReferences(db, ticketRef, locator) {
  const [quotesSnap, contractsSnap, paymentsSnap, measurementsSnap] = await Promise.all(
    ATTACHMENT_OWNER_COLLECTIONS.map(name => ticketRef.collection(name).get())
  );
  const ownerDocs = [
    ...quotesSnap.docs.map(doc => ({ collection: 'quotes', doc })),
    ...contractsSnap.docs.map(doc => ({ collection: 'contracts', doc })),
    ...paymentsSnap.docs.map(doc => ({ collection: 'payments', doc })),
    ...measurementsSnap.docs.map(doc => ({ collection: 'measurements', doc })),
  ];

  // A busca por entrada de histórico é feita fora da transação (a subcoleção pode
  // ser grande); dentro dela relemos só os documentos que realmente têm o anexo.
  const historyMatches = [];
  const historySnap = await ticketRef.collection(TICKET_HISTORY_SUBCOLLECTION).get();
  for (const doc of historySnap.docs) {
    if (findAttachmentReference(doc.data() || {}, locator)) historyMatches.push(doc.ref);
  }

  return db.runTransaction(async tx => {
    const refsToRead = [ticketRef, ...ownerDocs.map(item => item.doc.ref), ...historyMatches];
    const snaps = await tx.getAll(...refsToRead);
    const ticketSnap = snaps[0];
    if (!ticketSnap.exists) throw new HttpError(404, 'OS não encontrada.');

    const removedFrom = [];

    // 1) Documentos de compras: primeiro a guarda de evidência, depois a remoção.
    ownerDocs.forEach((item, index) => {
      const snap = snaps[1 + index];
      if (!snap.exists) return;
      const data = snap.data() || {};
      if (!findAttachmentReference(data, locator)) return;

      const blocked = findProtectedEvidenceReason(item.collection, data);
      if (blocked) throw new HttpError(409, blocked);

      const listResult = removeAttachmentReference(data, locator);
      const flatResult = clearFlatAttachmentFields(
        listResult.value,
        locator,
        FLAT_ATTACHMENT_FIELD_GROUPS
      );
      if (listResult.removed || flatResult.removed) {
        tx.set(snap.ref, { ...flatResult.value, updatedAt: new Date() }, { merge: false });
        removedFrom.push(`${item.collection}/${snap.id}`);
      }
    });

    // 2) Entradas de histórico na subcoleção.
    historyMatches.forEach((ref, index) => {
      const snap = snaps[1 + ownerDocs.length + index];
      if (!snap.exists) return;
      const result = removeAttachmentReference(snap.data() || {}, locator);
      if (result.removed) {
        tx.set(ref, result.value, { merge: false });
        removedFrom.push(`historyEntries/${snap.id}`);
      }
    });

    // 3) Doc da OS: anexos soltos, checklist de encerramento e histórico embutido.
    const ticketData = ticketSnap.data() || {};
    const ticketResult = removeAttachmentReference(ticketData, locator);
    if (ticketResult.removed) {
      tx.set(
        ticketRef,
        { ...ticketResult.value, updatedAt: new Date() },
        { merge: false }
      );
      removedFrom.push('ticket');
    }

    if (removedFrom.length === 0) {
      throw new HttpError(409, 'A referência do anexo não foi encontrada para remoção.');
    }
    return { removedFrom };
  });
}

async function readAccessibleTicket(db, user, ticketId) {
  const ticketRef = db.collection('tickets').doc(ticketId);
  const ticketSnap = await ticketRef.get();
  if (!ticketSnap.exists) throw new HttpError(404, 'OS não encontrada.');

  const territory = user.role === 'Admin'
    ? { regions: [], sites: [] }
    : await readTerritoryCatalog(db);
  const ticketData = ticketSnap.data() || {};
  if (!canUserAccessTicket(user, { id: ticketSnap.id, ...ticketData }, territory.regions, territory.sites)) {
    throw new HttpError(403, 'Você não tem acesso a esta OS.');
  }
  return { ticketRef, ticketData };
}

async function uploadAttachment(req, res, user) {
  await enforceRateLimit(req, {
    bucket: 'attachment-upload',
    limit: 40,
    windowMs: 5 * 60 * 1000,
    message: 'Muitos anexos enviados em pouco tempo. Aguarde alguns minutos e tente novamente.',
  });
  const body = await parseInboundBody(req, { multipartLimits: ATTACHMENT_UPLOAD_LIMITS });
  const ticketId = safePathSegment(body.ticketId, 'OS').toUpperCase();
  const scope = String(body.scope || '').trim();
  if (!UPLOAD_SCOPES.has(scope)) throw new HttpError(400, 'Tipo de anexo inválido.');
  if (user.role === 'Diretor' && scope !== 'message') {
    throw new HttpError(403, 'Diretores só podem anexar arquivos em mensagens.');
  }

  const attachment = Array.isArray(body.attachments) ? body.attachments[0] : null;
  if (!attachment?.buffer) throw new HttpError(400, 'Selecione um arquivo para enviar.');

  const db = getAdminDb();
  await readAccessibleTicket(db, user, ticketId);

  const contentType = assertAllowedAttachmentContent(
    attachment.buffer,
    attachment.mimeType,
    attachment.filename || 'anexo'
  );
  const target = resolveUploadTarget(ticketId, scope, contentType, attachment.filename || 'anexo', body);
  const file = getStorage().bucket().file(target.path);
  await file.save(attachment.buffer, {
    resumable: false,
    contentType,
    metadata: { contentType },
  });

  return sendJson(res, 200, {
    ok: true,
    attachment: {
      id: randomUUID(),
      name: attachment.filename || target.path.split('/').at(-1),
      path: target.path,
      url: '',
      contentType,
      size: Number(attachment.size || attachment.buffer.length || 0),
      uploadedAt: new Date().toISOString(),
      category: target.category,
    },
  });
}

async function streamStorageFile(path, reference, res) {
  const file = getStorage().bucket().file(path);
  const [metadata] = await file.getMetadata();
  const contentType = reference.contentType || metadata.contentType || 'application/octet-stream';
  const filename = safeHeaderFilename(reference.name || basename(path));
  const asciiFilename = asciiHeaderFilename(filename);
  const inline =
    (contentType.startsWith('image/') && contentType !== 'image/svg+xml') ||
    contentType === 'application/pdf';

  res.statusCode = 200;
  res.setHeader('Content-Type', contentType);
  if (metadata.size) res.setHeader('Content-Length', String(metadata.size));
  res.setHeader(
    'Content-Disposition',
    `${inline ? 'inline' : 'attachment'}; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`
  );
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  await pipeline(file.createReadStream(), res);
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET' && req.method !== 'DELETE' && req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST, DELETE');
      return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
    }

    const user = await requireUserWithRoles(
      req,
      req.method === 'DELETE' ? ['Admin', 'Gestor'] : ['Admin', 'Gestor', 'Diretor']
    );
    if (req.method === 'POST') return await uploadAttachment(req, res, user);

    const ticketId = String(req.query?.ticketId || '').trim().toUpperCase();
    const path = String(req.query?.path || '').trim();
    const driveFileId = String(req.query?.driveFileId || '').trim();

    if (!ticketId || !path || ticketId.length > 80 || path.length > 1024 || driveFileId.length > 256) {
      throw new HttpError(400, 'Localizador de anexo inválido.');
    }
    if (!isAttachmentPathInTicketScope(path, ticketId)) {
      throw new HttpError(400, 'Caminho de anexo inválido para esta OS.');
    }
    // Escopo por PAPEL na leitura (o upload já restringia): ter acesso à OS não
    // implica poder abrir qualquer anexo dela. Ver a matriz em attachmentAccess.js.
    if (!canRoleReadAttachmentPath(user.role, path)) {
      throw new HttpError(403, 'Seu perfil não tem acesso a este tipo de anexo.');
    }

    const db = getAdminDb();
    const { ticketRef, ticketData } = await readAccessibleTicket(db, user, ticketId);

    const locator = { path, driveFileId: driveFileId || null };
    let reference = findAttachmentReference(ticketData, locator);
    if (!reference) {
      const sources = await readProcurementAttachmentSources(ticketRef);
      for (const source of sources) {
        reference = findAttachmentReference(source, locator);
        if (reference) break;
      }
    }
    // Após o cutover, anexos antigos podem existir apenas na subcoleção completa;
    // o documento principal guarda só a janela das 50 entradas mais recentes.
    if (!reference && ticketData.historySubcollectionReady === true) {
      reference = await readHistoryAttachmentReference(ticketRef, locator);
    }
    if (!reference) throw new HttpError(404, 'Anexo não encontrado.');

    if (req.method === 'DELETE') {
      if (driveFileId || reference.driveFileId) {
        throw new HttpError(409, 'Anexo arquivado não pode ser excluído por este fluxo.');
      }
      // ORDEM DELIBERADA: a referência sai primeiro, numa transação, e só depois o
      // objeto é apagado. O inverso (Storage primeiro, referência pela tela) deixava
      // referência apontando para arquivo inexistente quando a segunda etapa falhava.
      // Agora o pior caso é um binário órfão no bucket — invisível para o usuário.
      const removal = await removeAttachmentReferences(db, ticketRef, locator);

      // A referência já saiu, então o anexo sumiu da OS do ponto de vista de quem
      // usa. Se o objeto não puder ser apagado agora, NÃO se desfaz o que foi
      // feito: sobra um binário órfão (lixo coletável) em vez de reviver uma
      // referência que o usuário mandou remover. A auditoria registra o caso.
      let storageDeleted = true;
      let storageError = null;
      try {
        await getStorage().bucket().file(path).delete({ ignoreNotFound: true });
      } catch (error) {
        storageDeleted = false;
        storageError = error instanceof Error ? error.message : String(error);
        console.error('[attachments] referência removida, mas o objeto permaneceu no bucket', path, error);
      }

      await writeAuditLog({
        actor: user.name || user.email || 'Sistema',
        action: 'attachment.delete',
        entity: 'ticket',
        entityId: ticketId,
        before: { path, name: reference.name, contentType: reference.contentType },
        after: { removedFrom: removal.removedFrom, storageDeleted, storageError },
      });
      return sendJson(res, 200, { ok: true, removedFrom: removal.removedFrom, storageDeleted });
    }

    if (driveFileId) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      await streamDriveFile(driveFileId, res);
      return;
    }

    await streamStorageFile(path, reference, res);
  } catch (error) {
    if (res.headersSent) {
      res.destroy(error instanceof Error ? error : undefined);
      return;
    }
    return sendError(res, error, 'Falha ao abrir o anexo.');
  }
}
