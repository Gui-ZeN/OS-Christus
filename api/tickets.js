import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { writeAuditLog } from './_lib/auditLogs.js';
import { requireAdminUser, requireAuthenticatedUser , resolveActor } from './_lib/authz.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { HttpError, parseInboundBody, readJsonBody, sendError, sendJson } from './_lib/http.js';
import { canUserAccessTicket, readAccessibleTickets, readTerritoryCatalog, readTicketsChangedSince } from './_lib/ticketAccess.js';
import { mergeTicketHistory, normalizeTicketForStorage, reserveNextTicketId, serializeTicketForApi } from './_lib/tickets.js';
import { enforceRateLimit } from './_lib/rateLimit.js';
import { assertAllowedAttachmentMime } from './_lib/attachments.js';
import { slugFilename } from './_lib/text.js';
import { parseEmailList } from './_lib/email.js';
import { canTransitionStatus, isValidStatus } from './_lib/statusFlow.js';

const STATUS_IN_PROGRESS = 'Em andamento';
const STATUS_WAITING_MAINTENANCE_APPROVAL = 'Aguardando aprovação da manutenção';
const STATUS_WAITING_PAYMENT = 'Aguardando pagamento';
const STATUS_CLOSED = 'Encerrada';
const STATUS_CANCELED = 'Cancelada';

// Allow-list dos campos que o PATCH do painel pode gravar. Enumerado a partir de
// TODAS as chamadas updateTicket() do front. Tudo fora daqui é descartado — em vez
// de uma deny-list (que só bloqueia o que alguém lembrou e deixava requesterEmail,
// requester, subject, time... editáveis por qualquer perfil com acesso à OS).
// id / trackingToken / createdAt / updatedAt ficam DE FORA de propósito
// (identidade e campos controlados pelo servidor). As transições territoriais
// (regionId/siteId/region/sede) entram na lista mas são restritas a Admin abaixo.
const ALLOWED_TICKET_PATCH_FIELDS = new Set([
  'status', 'priority', 'sector', 'location', 'time', 'waterIssue',
  'assignedTeam', 'assignedEmail',
  'macroServiceId', 'macroServiceName', 'serviceCatalogId', 'serviceCatalogName',
  'directorIds', 'directorEmails', 'directorCcEmails', 'requesterCcEmails',
  'attachments', 'history', 'viewingBy',
  'preliminaryActions', 'closureChecklist', 'executionProgress', 'guarantee',
  // reclassificação territorial — só Admin (gate logo abaixo, no handler)
  'regionId', 'siteId', 'region', 'sede',
]);

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

// Tipos válidos de entrada de histórico (espelha HistoryItem em src/types/index.ts).
const HISTORY_ENTRY_TYPES = new Set(['customer', 'system', 'tech', 'internal', 'field_change']);

// Rótulo do remetente derivado do usuário autenticado, no MESMO formato que o
// front usa ("Nome (Papel)"). Forçar isto como sender das entradas NOVAS impede
// forjar remetentes oficiais ('Diretoria'/'Sistema') que apareceriam na página
// pública como comunicação do sistema — sem alterar o rótulo legítimo (que já é
// exatamente "Nome (Papel)").
function actorHistoryLabel(user, fallbackActor) {
  const name = user?.name || fallbackActor || user?.email || 'Gestor';
  return user?.role ? `${name} (${user.role})` : name;
}

// Sanitiza uma entrada de histórico NOVA vinda do cliente: coage type inválido e
// força o sender ao ator. NÃO toca em `visibility` ausente — a página pública
// decide por marcador de texto quando ela não vem (coagir para 'internal'
// esconderia marcos como "Triagem concluída"/"Execução iniciada"). Só coage uma
// visibility inválida que veio preenchida.
function sanitizeClientHistoryEntry(entry, senderLabel) {
  const sanitized = {
    ...entry,
    type: HISTORY_ENTRY_TYPES.has(entry?.type) ? entry.type : 'internal',
    sender: senderLabel,
  };
  if (entry?.visibility !== undefined && entry.visibility !== 'public' && entry.visibility !== 'internal') {
    sanitized.visibility = 'internal';
  }
  return sanitized;
}

function buildAutomaticStatusHistoryEntry(sender, previousStatus, nextStatus) {
  const publicStatusMessages = {
    [STATUS_WAITING_MAINTENANCE_APPROVAL]: 'Execução concluída.',
    [STATUS_IN_PROGRESS]: 'Execução iniciada.',
    [STATUS_CLOSED]: 'OS encerrada.',
    [STATUS_CANCELED]: 'OS cancelada.',
    'Aguardando Parecer Técnico': 'Solicitação aceita e encaminhada para atendimento.',
    'Aguardando Ações Preliminares': 'Ações preliminares em andamento.',
  };

  const publicText = publicStatusMessages[nextStatus] || null;
  return {
    id: `status-${Date.now()}`,
    type: 'system',
    sender,
    time: new Date(),
    text: publicText || `Status atualizado de "${previousStatus}" para "${nextStatus}".`,
    visibility: publicText ? 'public' : 'internal',
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
    visibility: 'public',
  };
}

function normalizeHistoryText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const PUBLIC_HISTORY_SYSTEM_MARKERS = [
  'solicitacao registrada via formulario publico',
  'status atualizado de',
  'triagem concluida',
  'parecer consolidado e enviado para aprovacao da diretoria',
  'solucao tecnica aprovada',
  'orcamentos consolidados e enviados para aprovacao da diretoria',
  'orcamento aprovado',
  'contrato anexado pelo gestor',
  'contrato aprovado pela diretoria',
  'acoes preliminares concluidas',
  'execucao iniciada',
  'inicio da execucao',
  'execucao concluida',
  'os encerrada',
  'os cancelada',
];

const PUBLIC_HISTORY_SENSITIVE_MARKERS = [
  'orcamento',
  'contrato',
  'aditivo',
  'pagamento',
  'parcela',
  'r$',
];

const PUBLIC_HISTORY_INTERNAL_MARKERS = [
  'parecer consolidado e enviado para aprovacao da diretoria',
  'painel da os atualizado',
];

function isPublicTrackingHistoryEntry(item) {
  if (!item || typeof item !== 'object') return false;
  const text = String(item.text || '').trim();
  if (!text) return false;

  const type = String(item.type || '').trim().toLowerCase();
  const visibility = String(item.visibility || '').trim().toLowerCase();
  if (type === 'customer') return true;
  if (type === 'tech') {
    if (visibility === 'internal') return false;

    const normalizedText = normalizeHistoryText(text);
    const hasStatusMarker = PUBLIC_HISTORY_SYSTEM_MARKERS.some(marker => normalizedText.includes(marker));
    if (hasStatusMarker) return true;

    if (visibility === 'public') return true;
    const hasSensitiveMarker = PUBLIC_HISTORY_SENSITIVE_MARKERS.some(marker => normalizedText.includes(marker));
    const hasInternalMarker = PUBLIC_HISTORY_INTERNAL_MARKERS.some(marker => normalizedText.includes(marker));
    return !hasSensitiveMarker && !hasInternalMarker;
  }
  if (type !== 'system') return false;
  if (visibility === 'internal') return false;
  if (visibility === 'public') return true;

  const normalizedText = normalizeHistoryText(text);
  const hasPublicMarker = PUBLIC_HISTORY_SYSTEM_MARKERS.some(marker => normalizedText.includes(marker));
  return hasPublicMarker;
}

// Campos permitidos em cada entrada de histórico pública (sem anexos/URLs assinadas).
function sanitizePublicHistoryEntry(item) {
  if (!item || typeof item !== 'object') return item;
  return {
    id: item.id ?? null,
    type: item.type ?? null,
    sender: item.sender ?? null,
    time: item.time ?? null,
    text: item.text ?? null,
    visibility: item.visibility ?? null,
    channel: item.channel ?? null,
    field: item.field ?? null,
    to: item.to ?? null,
  };
}

// Allow-list: monta o payload público apenas com campos seguros, evitando vazar
// PII (e-mails de solicitante/diretores), anexos e demais dados internos.
function sanitizeTicketForPublicTracking(ticket) {
  if (!ticket || typeof ticket !== 'object') return ticket;

  const history = Array.isArray(ticket.history)
    ? ticket.history.filter(isPublicTrackingHistoryEntry).map(sanitizePublicHistoryEntry)
    : [];

  let closureChecklist = null;
  if (ticket.closureChecklist && typeof ticket.closureChecklist === 'object') {
    closureChecklist = { ...ticket.closureChecklist };
    delete closureChecklist.infrastructureApprovalPrimary;
    delete closureChecklist.infrastructureApprovalSecondary;
    delete closureChecklist.infrastructureApprovedByRafael;
    delete closureChecklist.infrastructureApprovedByFernando;
    delete closureChecklist.documents;
  }

  let executionProgress = null;
  if (ticket.executionProgress && typeof ticket.executionProgress === 'object') {
    executionProgress = { ...ticket.executionProgress };
    delete executionProgress.measurementSheetUrl;
  }

  // Apenas as datas consumidas pelo rastreio; nunca blockerNotes/outros campos internos.
  let preliminaryActions = null;
  if (ticket.preliminaryActions && typeof ticket.preliminaryActions === 'object') {
    preliminaryActions = {
      updatedAt: ticket.preliminaryActions.updatedAt ?? null,
      plannedStartAt: ticket.preliminaryActions.plannedStartAt ?? null,
      actualStartAt: ticket.preliminaryActions.actualStartAt ?? null,
    };
  }

  return {
    id: ticket.id ?? null,
    subject: ticket.subject ?? null,
    status: ticket.status ?? null,
    time: ticket.time ?? null,
    requester: ticket.requester ?? null,
    type: ticket.type ?? null,
    priority: ticket.priority ?? null,
    region: ticket.region ?? null,
    sede: ticket.sede ?? null,
    sector: ticket.sector ?? null,
    location: ticket.location ?? null,
    macroServiceName: ticket.macroServiceName ?? null,
    serviceCatalogName: ticket.serviceCatalogName ?? null,
    // O solicitante já possui o token (está na URL de acompanhamento).
    trackingToken: ticket.trackingToken ?? null,
    preliminaryActions,
    closureChecklist,
    executionProgress,
    history,
  };
}

function buildPublicTrackingPayload(beforeData, approved) {
  const now = new Date();
  const previousChecklist = beforeData?.closureChecklist || {};
  const requesterLabel = String(beforeData?.requester || '').trim() || 'Solicitante';
  const currentStatus = String(beforeData?.status || '');

  let nextStatus = currentStatus;
  if (approved) {
    if (currentStatus === STATUS_WAITING_MAINTENANCE_APPROVAL) {
      nextStatus = STATUS_WAITING_PAYMENT;
    }
  } else if (currentStatus !== STATUS_CLOSED && currentStatus !== STATUS_CANCELED) {
    nextStatus = STATUS_IN_PROGRESS;
  }

  const nextHistory = [
    ...(Array.isArray(beforeData?.history) ? beforeData.history : []),
    buildPublicTrackingHistoryEntry(requesterLabel, approved),
  ];

  return {
    status: nextStatus,
    closureChecklist: {
      ...previousChecklist,
      requesterApproved: approved,
      requesterApprovedBy: requesterLabel,
      requesterApprovedAt: approved ? now : null,
    },
    history: nextHistory,
    updatedAt: now,
  };
}

function buildPublicRequesterMessagePayload(beforeData, message) {
  const now = new Date();
  const requesterLabel = String(beforeData?.requester || '').trim() || 'Solicitante';
  return {
    history: [
      ...(Array.isArray(beforeData?.history) ? beforeData.history : []),
      {
        id: `public-message-${randomUUID()}`,
        type: 'customer',
        sender: requesterLabel,
        time: now,
        text: message,
        visibility: 'public',
        channel: 'public',
      },
    ],
    updatedAt: now,
  };
}

const PUBLIC_TEXT_LIMITS = {
  subject: 200,
  requester: 120,
  type: 60,
  catalogId: 80,
  serviceName: 200,
  region: 160,
  sede: 60,
  sector: 160,
  location: 240,
  description: 5000,
};

function clampText(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

// O formulário público envia a descrição do solicitante embutida no primeiro
// item de histórico. Extraímos apenas o texto; o restante do array é descartado
// e reconstruído pelo servidor para impedir injeção de entradas system/tech.
function extractPublicDescription(rawTicket) {
  if (Array.isArray(rawTicket?.history)) {
    const customerEntry = rawTicket.history.find(
      item =>
        item &&
        typeof item === 'object' &&
        String(item.type || '').toLowerCase() === 'customer' &&
        String(item.text || '').trim()
    );
    if (customerEntry) return String(customerEntry.text || '').trim();
    const anyEntry = rawTicket.history.find(item => item && String(item?.text || '').trim());
    if (anyEntry) return String(anyEntry.text || '').trim();
  }
  return String(rawTicket?.description || '').trim();
}

async function preparePublicTicketCreate(db, rawTicket) {
  const requesterEmail = parseEmailList(rawTicket.requesterEmail || '', { splitWhitespace: true })[0] || '';
  if (!requesterEmail) {
    throw new HttpError(400, 'E-mail do solicitante inválido.');
  }

  const subject = clampText(rawTicket.subject, PUBLIC_TEXT_LIMITS.subject);
  if (!subject) {
    throw new HttpError(400, 'Assunto é obrigatório.');
  }

  const description = clampText(extractPublicDescription(rawTicket), PUBLIC_TEXT_LIMITS.description);
  if (!description) {
    throw new HttpError(400, 'Descrição é obrigatória.');
  }

  const regionId = String(rawTicket.regionId || '').trim();
  const siteId = String(rawTicket.siteId || '').trim();
  if (!regionId || !siteId) {
    throw new HttpError(400, 'Região e sede são obrigatórias.');
  }

  const [regionSnap, siteSnap] = await Promise.all([
    db.collection('regions').doc(regionId).get(),
    db.collection('sites').doc(siteId).get(),
  ]);
  if (!regionSnap.exists || regionSnap.data()?.active === false) {
    throw new HttpError(400, 'Região inválida.');
  }
  if (!siteSnap.exists || siteSnap.data()?.active === false) {
    throw new HttpError(400, 'Sede inválida.');
  }
  const regionData = regionSnap.data() || {};
  const siteData = siteSnap.data() || {};
  if (String(siteData.regionId || '').trim() !== regionId) {
    throw new HttpError(400, 'Sede não pertence à região informada.');
  }

  const requesterName = clampText(rawTicket.requester, PUBLIC_TEXT_LIMITS.requester) || 'Solicitante';
  const now = new Date();

  // Histórico reconstruído pelo servidor: o cliente só influencia o texto da
  // própria descrição (entrada 'customer'); tipo/visibilidade são fixos.
  const history = [
    {
      id: `customer-${randomUUID()}`,
      type: 'customer',
      sender: requesterName,
      time: now,
      text: description,
      visibility: 'public',
    },
    {
      id: `status-${randomUUID()}`,
      type: 'system',
      sender: 'Sistema',
      time: now,
      text: 'Solicitação registrada via formulário público. Aguardando triagem.',
      visibility: 'public',
    },
  ];

  const allowed = {
    subject,
    requester: requesterName,
    requesterEmail,
    requesterCcEmails: parseEmailList(rawTicket.requesterCcEmails || rawTicket.requesterCcEmail || '', { splitWhitespace: true }),
    time: now,
    status: 'Nova OS',
    type: clampText(rawTicket.type, PUBLIC_TEXT_LIMITS.type),
    macroServiceId: clampText(rawTicket.macroServiceId, PUBLIC_TEXT_LIMITS.catalogId),
    macroServiceName: clampText(rawTicket.macroServiceName, PUBLIC_TEXT_LIMITS.serviceName),
    serviceCatalogId: clampText(rawTicket.serviceCatalogId, PUBLIC_TEXT_LIMITS.catalogId),
    serviceCatalogName: clampText(rawTicket.serviceCatalogName, PUBLIC_TEXT_LIMITS.serviceName),
    regionId,
    // Nomes canônicos vêm do catálogo, não do cliente.
    region: clampText(regionData.name || rawTicket.region, PUBLIC_TEXT_LIMITS.region),
    siteId,
    sede: clampText(siteData.code || rawTicket.sede, PUBLIC_TEXT_LIMITS.sede),
    sector: clampText(rawTicket.sector, PUBLIC_TEXT_LIMITS.sector),
    location: clampText(rawTicket.location, PUBLIC_TEXT_LIMITS.location),
    // Prioridade é definida na triagem; o solicitante não escolhe.
    priority: 'Trivial',
    // Anexos JSON do cliente são descartados; arquivos reais sobem por upload.
    attachments: [],
    history,
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

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10 MB per file

async function uploadTicketAttachments(ticketId, attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];

  if (attachments.length > MAX_ATTACHMENTS) {
    throw new HttpError(400, `Máximo de ${MAX_ATTACHMENTS} anexos por ticket.`);
  }

  let bucket;
  try {
    bucket = getStorage().bucket();
  } catch {
    throw new HttpError(500, 'Nao foi possivel acessar o armazenamento de anexos. Registre a solicitacao sem foto ou tente novamente mais tarde.');
  }
  const uploadedAt = new Date();
  const results = [];

  for (let index = 0; index < attachments.length; index += 1) {
    const attachment = attachments[index];
    if (!attachment?.buffer) continue;

    const fileSize = Number(attachment.size || attachment.buffer.length || 0);
    if (fileSize > MAX_ATTACHMENT_SIZE) {
      throw new HttpError(400, `Arquivo "${attachment.filename || `anexo-${index + 1}`}" excede o tamanho máximo de 10 MB.`);
    }

    // Allow-list de MIME: rejeita SVG/HTML/executáveis (XSS armazenado).
    const contentType = assertAllowedAttachmentMime(attachment.mimeType, attachment.filename || `anexo-${index + 1}`);

    const filename = slugFilename(attachment.filename || `anexo-${index + 1}`) || `anexo-${Date.now()}-${index + 1}`;
    const isPdf = contentType === 'application/pdf';
    const baseFolder = isPdf ? 'attachments/tickets/pdfs' : 'attachments/tickets/images';
    const path = `${baseFolder}/${ticketId}/public-${Date.now()}-${index + 1}-${filename}`;
    const file = bucket.file(path);

    let url;
    try {
      await file.save(attachment.buffer, {
        resumable: false,
        contentType,
        metadata: {
          contentType,
        },
      });

      [url] = await file.getSignedUrl({
        action: 'read',
        expires: '2035-01-01',
      });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(500, `Nao foi possivel salvar o anexo "${attachment.filename || `anexo-${index + 1}`}". Tente com uma imagem menor ou registre a solicitacao sem foto.`);
    }

    results.push({
      id: randomUUID(),
      name: attachment.filename || filename,
      path,
      url,
      contentType,
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

  const contractRaw = contractSnap.empty
    ? null
    : serializeValue({
        id: contractSnap.docs[0].id,
        ...contractSnap.docs[0].data(),
      });

  const contract = contractRaw
    ? {
        id: contractRaw.id,
        vendor: '',
        value: '',
        status: contractRaw.status || '',
        signedFileName: null,
      }
    : null;

  const payments = paymentsSnap.docs
    .map(doc => {
      const payment = serializeValue({ id: doc.id, ...doc.data() });
      return {
        id: payment.id,
        vendor: '',
        value: '',
        status: payment.status || '',
        label: null,
        installmentNumber: null,
        totalInstallments: null,
        dueAt: payment.dueAt || null,
        paidAt: payment.paidAt || null,
      };
    })
    .sort((a, b) => Number(a.installmentNumber || 0) - Number(b.installmentNumber || 0));

  const measurements = measurementsSnap.docs
    .map(doc => {
      const measurement = serializeValue({ id: doc.id, ...doc.data() });
      return {
        id: measurement.id,
        label: measurement.label || '',
        status: measurement.status || 'pending',
        progressPercent: measurement.progressPercent || 0,
        releasePercent: measurement.releasePercent || 0,
        requestedAt: measurement.requestedAt || null,
        approvedAt: measurement.approvedAt || null,
      };
    })
    .sort((a, b) => sortTimeValue(b.requestedAt || b.approvedAt) - sortTimeValue(a.requestedAt || a.approvedAt));

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
        const ticket = sanitizeTicketForPublicTracking(serializeTicketForApi({
          id: trackingDoc.id,
          ...trackingDoc.data(),
        }));
        const procurement = await readPublicTrackingProcurement(trackingDoc.ref);

        return sendJson(res, 200, { ok: true, ticket, procurement });
      }

      const user = await requireAuthenticatedUser(req);

      // Carimbado ANTES da leitura: o cliente devolve este `serverTime` como o
      // próximo `since`, então nada escrito durante a query se perde (cai no
      // próximo delta). Mesmo domínio de relógio do updatedAt (Date do servidor),
      // sem depender do relógio do cliente.
      const serverTime = new Date();
      const sinceRaw = req.query?.since ? String(req.query.since).trim() : '';
      const sinceDate = sinceRaw ? new Date(sinceRaw) : null;
      const useDelta = Boolean(sinceDate) && !Number.isNaN(sinceDate.getTime());

      const tickets = useDelta
        ? await readTicketsChangedSince(db, user, sinceDate)
        : await readAccessibleTickets(db, user);

      return sendJson(
        res,
        200,
        {
          ok: true,
          mode: useDelta ? 'delta' : 'full',
          serverTime: serverTime.toISOString(),
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
        const authedUser = await requireAuthenticatedUser(req);
        // Só papéis de gestão usam o caminho AUTENTICADO (ticket completo, história
        // do cliente, duplicação). Um 'Usuario' logado — ou qualquer sessão Firebase
        // persistida no navegador que caia no formulário público (o actorHeaders
        // anexa o token sempre que há sessão) — segue pelo caminho PÚBLICO (rebuild
        // server-side + rate limit), NÃO 403: senão o form público quebraria.
        if (authedUser.role === 'Admin' || authedUser.role === 'Gestor' || authedUser.role === 'Diretor') {
          user = authedUser;
        }
      }
      if (!user) {
        // Criação pública (ou não-gestor autenticado): limita abuso/spam por IP.
        await enforceRateLimit(req, {
          bucket: 'ticket-create',
          limit: 5,
          windowMs: 10 * 60 * 1000,
          message: 'Muitas solicitações enviadas. Aguarde alguns minutos e tente novamente.',
        });
      }

      const now = new Date();

      // Duplicação autenticada manda `duplicateFromTicketId`: o servidor copia a
      // conversa REAL da origem (o cliente não dita mais o histórico — era
      // forjável). QUALQUER outra criação — pública OU o "Nova OS" do painel de um
      // gestor logado (mesmo PublicFormView) — passa pelo rebuild completo de
      // preparePublicTicketCreate (allow-list de campos + histórico reconstruído a
      // partir da descrição do solicitante).
      const duplicateFromId = user ? String(ticketPayload.duplicateFromTicketId || '').trim().toUpperCase() : '';
      let ticket;
      if (duplicateFromId) {
        const sourceSnap = await col.doc(duplicateFromId).get();
        if (!sourceSnap.exists) {
          return sendJson(res, 404, { ok: false, error: 'OS de origem da duplicação não encontrada.' });
        }
        const sourceData = sourceSnap.data() || {};
        const territory = user.role === 'Admin' ? { regions: [], sites: [] } : await readTerritoryCatalog(db);
        if (!canUserAccessTicket(user, { id: sourceSnap.id, ...sourceData }, territory.regions, territory.sites)) {
          return sendJson(res, 403, { ok: false, error: 'Você não tem acesso à OS de origem da duplicação.' });
        }
        ticket = normalizeTicketForStorage(ticketPayload);
        delete ticket.duplicateFromTicketId;
        // Duplicata começa LIMPA: reseta o estado de workflow (o cliente não dita
        // status/aprovações/execução da OS nova). Só a requisição (assunto/sede/
        // solicitante) + a conversa copiada da origem seguem.
        ticket.status = 'Nova OS';
        delete ticket.closureChecklist;
        delete ticket.executionProgress;
        delete ticket.guarantee;
        delete ticket.preliminaryActions; // datas de planejamento antigas não valem na cópia
        delete ticket.viewingBy;          // "quem está vendo" da origem é stale
        const sourceHistory = Array.isArray(sourceData.history) ? sourceData.history : [];
        ticket.history = [
          ...sourceHistory,
          {
            id: `dup-${randomUUID()}`,
            type: 'system',
            sender: 'Sistema',
            time: now,
            text: `OS duplicada de ${duplicateFromId} e reiniciada para triagem.`,
            visibility: 'internal',
          },
        ];
      } else {
        ticket = await preparePublicTicketCreate(db, ticketPayload);
      }

      const ticketId = await reserveNextTicketId(db);
      // trackingToken é capacidade de acesso público à OS — SEMPRE gerado no
      // servidor, nunca aceito do cliente. Aceitá-lo permitia criar uma OS com o
      // token de OUTRA (GET/PATCH público usam limit(1) → o link do solicitante
      // viraria não determinístico). A duplicação ganha um token novo — o certo.
      const trackingToken = `trk_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
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
      if (!body?.updates && !body?.publicMessage && !body?.historyTimeEdit) {
        return sendJson(res, 400, { ok: false, error: 'updates são obrigatórios.' });
      }

      if (body?.trackingToken) {
        const trackingToken = String(body.trackingToken || '').trim();
        if (!trackingToken) {
          return sendJson(res, 400, { ok: false, error: 'trackingToken inválido.' });
        }

        // Ações públicas via link (aprovação/mensagem): limita abuso por IP.
        await enforceRateLimit(req, {
          bucket: 'ticket-tracking-patch',
          limit: 30,
          windowMs: 10 * 60 * 1000,
        });

        const trackingSnap = await col.where('trackingToken', '==', trackingToken).limit(1).get();
        if (trackingSnap.empty) {
          return sendJson(res, 404, { ok: false, error: 'Ticket não encontrado.' });
        }

        const trackingDoc = trackingSnap.docs[0];
        const beforeData = trackingDoc.data() || {};
        const publicMessage = String(body?.publicMessage || '').trim().slice(0, 3000);
        if (publicMessage) {
          const currentStatus = String(beforeData.status || '');
          if (currentStatus === STATUS_CLOSED || currentStatus === STATUS_CANCELED) {
            return sendJson(res, 409, { ok: false, error: 'Esta OS nao aceita novas mensagens pelo link.' });
          }

          // Transação: relê o estado fresco antes de anexar a mensagem ao histórico.
          const msgResult = await db.runTransaction(async tx => {
            const snap = await tx.get(trackingDoc.ref);
            const data = snap.data() || {};
            const status = String(data.status || '');
            if (status === STATUS_CLOSED || status === STATUS_CANCELED) {
              return { blocked: true };
            }
            const payload = buildPublicRequesterMessagePayload(data, publicMessage);
            tx.set(trackingDoc.ref, payload, { merge: true });
            return { before: data, payload };
          });

          if (msgResult.blocked) {
            return sendJson(res, 409, { ok: false, error: 'Esta OS nao aceita novas mensagens pelo link.' });
          }
          const payload = msgResult.payload;
          await db.collection('notifications').add({
            type: 'requester-message',
            ticketId: trackingDoc.id,
            title: `Nova mensagem do solicitante - ${trackingDoc.id}`,
            body: publicMessage,
            audienceRoles: ['Admin', 'Gestor'],
            read: false,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          await writeAuditLog({
            actor: String(beforeData.requester || 'Solicitante'),
            action: 'tickets.tracking.message',
            entity: 'ticket',
            entityId: trackingDoc.id,
            before: beforeData,
            after: {
              ...beforeData,
              ...payload,
            },
          });
          return sendJson(res, 200, { ok: true });
        }

        const approved = body?.updates?.closureChecklist?.requesterApproved;
        if (approved !== true && approved !== false) {
          return sendJson(res, 400, {
            ok: false,
            error: 'A confirmação do solicitante deve informar closureChecklist.requesterApproved.',
          });
        }

        const ALLOWED_TRACKING_STATUSES = new Set([
          STATUS_IN_PROGRESS,
          STATUS_WAITING_MAINTENANCE_APPROVAL,
          STATUS_WAITING_PAYMENT,
          STATUS_CLOSED,
          STATUS_CANCELED,
        ]);

        // Transação: revalida status e idempotência sobre o estado fresco e
        // anexa a entrada de histórico atomicamente.
        const approvalResult = await db.runTransaction(async tx => {
          const snap = await tx.get(trackingDoc.ref);
          const data = snap.data() || {};
          if (!ALLOWED_TRACKING_STATUSES.has(String(data.status || ''))) {
            return { notAllowed: true };
          }
          if (approved && data?.closureChecklist?.requesterApproved) {
            return { alreadyApproved: true };
          }
          const payload = buildPublicTrackingPayload(data, approved);
          tx.set(trackingDoc.ref, payload, { merge: true });
          return { before: data, payload };
        });

        if (approvalResult.notAllowed) {
          return sendJson(res, 409, { ok: false, error: 'Status atual não permite validação pública.' });
        }
        if (approvalResult.alreadyApproved) {
          return sendJson(res, 200, { ok: true, alreadyApproved: true });
        }
        const payload = approvalResult.payload;

        await writeAuditLog({
          actor: String(beforeData.requester || 'Solicitante'),
          action: approved ? 'tickets.tracking.approve' : 'tickets.tracking.reject',
          entity: 'ticket',
          entityId: trackingDoc.id,
          before: beforeData,
          after: {
            ...beforeData,
            ...payload,
          },
        });

        return sendJson(res, 200, { ok: true });
      }

      const user = await requireAuthenticatedUser(req);
      const actor = resolveActor(user);

      if (user.role !== 'Admin' && user.role !== 'Gestor' && user.role !== 'Diretor') {
        return sendJson(res, 403, { ok: false, error: 'Somente Admin, Gestor ou Diretor podem atualizar tickets pelo painel.' });
      }

      if (!body?.id) {
        return sendJson(res, 400, { ok: false, error: 'id e updates são obrigatórios.' });
      }

      const rawUpdates = body.updates && typeof body.updates === 'object' ? body.updates : {};
      const normalizedUpdates = normalizeTicketForStorage(rawUpdates);
      // Allow-list: só passa campo que (a) está na lista E (b) o cliente REALMENTE
      // enviou. O `hasOwnProperty(rawUpdates, field)` é essencial: o normalizer
      // injeta `time: agora` quando ausente — sem o guard, TODO PATCH parcial
      // (inclusive o heartbeat de viewingBy de 45s) sobrescreveria a data de
      // abertura da OS. Identidade (id/trackingToken/createdAt), campos do servidor
      // (updatedAt) e sensíveis (requesterEmail/requester/subject) ficam fora da lista.
      const updates = {};
      for (const field of Object.keys(normalizedUpdates)) {
        if (
          ALLOWED_TICKET_PATCH_FIELDS.has(field) &&
          Object.prototype.hasOwnProperty.call(rawUpdates, field)
        ) {
          updates[field] = normalizedUpdates[field];
        }
      }
      // Reclassificação territorial só por Admin (senão um perfil escopado poderia
      // mover a OS para dentro/fora do próprio território).
      if (user.role !== 'Admin') {
        delete updates.regionId;
        delete updates.siteId;
        delete updates.region;
        delete updates.sede;
      }
      const docRef = col.doc(body.id);

      // Catálogo territorial para checar escopo (Gestor/Diretor/Usuario são
      // escopados por região/sede). Admin ignora o escopo, então não carrega.
      const territory = user.role === 'Admin'
        ? { regions: [], sites: [] }
        : await readTerritoryCatalog(db);

      // Transação: relê o documento e remonta o histórico a partir do estado
      // fresco, evitando que edições concorrentes (ex.: inbound) sejam perdidas.
      const txResult = await db.runTransaction(async tx => {
        const snap = await tx.get(docRef);
        if (!snap.exists) return { notFound: true };

        const data = snap.data() || {};
        if (!canUserAccessTicket(user, { id: snap.id, ...data }, territory.regions, territory.sites)) {
          return { forbidden: true };
        }

        const freshHistory = Array.isArray(data.history) ? data.history : [];
        const payload = { ...updates, updatedAt: new Date() };
        const statusChanged = updates.status && updates.status !== data.status;

        // Integridade do fluxo: rejeita status inexistente e transições fora
        // do que o papel pode acionar (Admin/Gestor livres; Diretor restrito).
        if (statusChanged) {
          if (!isValidStatus(updates.status)) {
            return { invalidStatus: updates.status };
          }
          if (!canTransitionStatus(user.role, data.status, updates.status)) {
            return { invalidTransition: { from: data.status, to: updates.status } };
          }
        }

        if (Array.isArray(updates.history)) {
          // Cliente enviou histórico (ex.: nova mensagem). Mescla só as entradas
          // NOVAS (por id) sobre o histórico fresco + a entrada de status auto.
          // Sanitiza só as novas (as já existentes o merge ignora): type inválido
          // coagido e sender FORÇADO ao ator — impede forjar entrada "oficial"
          // (type:'system'/sender:'Diretoria') na página pública de acompanhamento.
          const senderLabel = actorHistoryLabel(user, actor);
          const existingIds = new Set(freshHistory.map(entry => entry?.id).filter(Boolean));
          const sanitizedNew = updates.history
            .filter(entry => entry?.id && !existingIds.has(entry.id))
            .map(entry => sanitizeClientHistoryEntry(entry, senderLabel));
          const statusEntry =
            statusChanged && shouldAppendAutomaticHistory(data.history, updates.history)
              ? [buildAutomaticStatusHistoryEntry(buildActorLabel(user, actor), data.status || 'Sem status', updates.status)]
              : [];
          payload.history = mergeTicketHistory(freshHistory, [...sanitizedNew, ...statusEntry]).merged;
        } else if (statusChanged) {
          payload.history = [
            ...freshHistory,
            buildAutomaticStatusHistoryEntry(buildActorLabel(user, actor), data.status || 'Sem status', updates.status),
          ];
        }

        // Edição de horário de UMA entrada JÁ existente (caminho dedicado): o
        // cliente manda {id, time}, não o array inteiro — o merge dedup-por-id
        // ignoraria a alteração. SÓ o campo `time` da entrada muda; texto/sender/
        // type/visibility permanecem imutáveis, e as demais entradas não são
        // tocadas (sem o clobber de reescrever todos os horários da visão do cliente).
        if (body.historyTimeEdit && body.historyTimeEdit.id) {
          const editTime = new Date(body.historyTimeEdit.time);
          if (!Number.isNaN(editTime.getTime())) {
            const base = Array.isArray(payload.history) ? payload.history : freshHistory;
            payload.history = base.map(entry =>
              entry?.id === body.historyTimeEdit.id ? { ...entry, time: editTime } : entry
            );
          }
        }

        tx.set(docRef, payload, { merge: true });
        return { before: data, payload };
      });

      if (txResult.notFound) {
        return sendJson(res, 404, { ok: false, error: 'Ticket não encontrado.' });
      }
      if (txResult.forbidden) {
        return sendJson(res, 403, { ok: false, error: 'Você não tem acesso a esta OS.' });
      }
      if (txResult.invalidStatus) {
        return sendJson(res, 400, { ok: false, error: `Status inválido: "${txResult.invalidStatus}".` });
      }
      if (txResult.invalidTransition) {
        return sendJson(res, 409, {
          ok: false,
          error: `Transição não permitida para o seu perfil: "${txResult.invalidTransition.from}" → "${txResult.invalidTransition.to}".`,
        });
      }

      const beforeData = txResult.before;
      const payload = txResult.payload;

      const auditAction =
        updates.status && updates.status !== beforeData.status
          ? 'tickets.status.change'
          : 'tickets.update';

      await writeAuditLog({
        actor: buildActorLabel(user, actor),
        action: auditAction,
        entity: 'ticket',
        entityId: body.id,
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
      const actor = resolveActor(admin);
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

