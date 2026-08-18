import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { writeAuditLog } from './_lib/auditLogs.js';
import { authorizeCronOrAdmin, requireAdminUser, requireAuthenticatedUser, requireUserWithRoles, resolveActor } from './_lib/authz.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { HttpError, parseInboundBody, readJsonBody, sendError, sendJson } from './_lib/http.js';
import {
  COMMITMENT_STATE,
  DEFAULT_TOLERANCE_MINUTES,
  isCommitmentClosed,
  normalizeCommitmentForStorage,
  serializeCommitmentForApi,
  validateConfirmation,
} from './_lib/commitments.js';
import { montarPergunta, tokenExpirou, validarEscolhaDaSede } from './_lib/visitConfirm.js';
import { concluirSeTemDesfecho, novaPendenciaDeDesfecho, temPendenciaAberta } from './_lib/desfechoPendente.js';
import { donoDoAlertaDeFalta } from './_lib/checagemDaVisita.js';
import { RESPOSTA, diasParada, efeitoDaResposta, podeDesfazer } from './_lib/fechamentoAssistido.js';
import { EVENTO_DE_CONTATO, podeCobrar, tentativasDe, validarDesfecho } from './_lib/cobranca.js';
import { collectMessageIds, recordDeletedTicket } from './_lib/deletedTickets.js';
import { toDateOrNull } from './_lib/dates.js';
import {
  ATTENTION_RULE_VERSION,
  computeOperationalAttention,
  isLegacyAttention,
  recomputeOperationalAttention,
} from './_lib/operationalAttention.js';
import { FieldPath } from 'firebase-admin/firestore';
import { hasWaterIssueSignal } from './_lib/inboundBody.js';
import { canUserAccessTicket, readAccessibleTickets, readTerritoryCatalog, readTicketsChangedSince } from './_lib/ticketAccess.js';
import {
  boundEmbeddedHistory,
  copyTicketHistoryToSubcollection,
  mergeTicketHistory,
  normalizeTicketForStorage,
  readTicketHistoryPage,
  readTicketHistoryFromSubcollection,
  reserveNextTicketId,
  serializeTicketForApi,
  ticketHistoryEntryRef,
  writeTicketHistoryEntries,
} from './_lib/tickets.js';
import { enforceRateLimit } from './_lib/rateLimit.js';
import { assertAllowedAttachmentContent } from './_lib/attachments.js';
import { slugFilename } from './_lib/text.js';
import { parseEmailList } from './_lib/email.js';
import { TICKET_STATUS, addStageMarco, canTransitionStatus, isRetiredStatus, isTicketOpen, isValidStatus } from './_lib/statusFlow.js';

/** As duas saídas da fila. Cancelada conta: a OS deixa de ser pendência do mesmo jeito. */
const CLOSED_STATUSES = new Set([TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELED]);
import { filterTicketPatchFields } from './_lib/ticketPatchScope.js';
import { notificationTtlAt } from './_lib/notificationState.js';
// A rota /api/report-pdf vive AQUI (relatório gerencial DAS OS). Limite de 12
// Serverless Functions no plano Hobby: o vercel.json reescreve /api/report-pdf ->
// /api/tickets?route=report-pdf, então o front continua igual.
import { buildReportPdf } from './_lib/reportPdf.js';

// Teto de leituras da subcoleção por PATCH ao deduplicar histórico reenviado pelo
// cliente. Um PATCH legítimo traz 1-3 entradas novas; o resto é histórico paginado.
const HISTORY_DEDUP_LOOKUP_LIMIT = 200;

const STATUS_IN_PROGRESS = 'Em andamento';
const STATUS_WAITING_MAINTENANCE_APPROVAL = 'Aguardando aprovação da manutenção';
const STATUS_WAITING_PAYMENT = 'Aguardando pagamento';
const STATUS_CLOSED = 'Encerrada';
const STATUS_CANCELED = 'Cancelada';
const TICKET_MULTIPART_LIMITS = Object.freeze({
  maxFiles: 10,
  maxFileSizeBytes: 10 * 1024 * 1024,
  maxTotalFileBytes: 25 * 1024 * 1024,
  maxFields: 10,
  maxFieldSizeBytes: 1024 * 1024,
  maxParts: 20,
  maxRequestSizeBytes: 30 * 1024 * 1024,
});



function sortTimeValue(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
}

function isAlreadyExistsError(error) {
  return (
    error?.code === 6 ||
    error?.code === 'already-exists' ||
    /already exists/i.test(String(error?.message || ''))
  );
}

function buildActorLabel(user, fallbackActor) {
  if (user?.name) return user.name;
  if (fallbackActor) return fallbackActor;
  if (user?.email) return user.email;
  return 'Sistema';
}

// Tipos válidos de entrada de histórico (espelha HistoryItem em src/types/index.ts).
export const HISTORY_ENTRY_TYPES = new Set(['customer', 'system', 'tech', 'internal', 'field_change']);

// Rótulo do remetente derivado do usuário autenticado, no MESMO formato que o
// front usa ("Nome (Papel)"). Forçar isto como sender das entradas NOVAS impede
// forjar remetentes oficiais ('Diretoria'/'Sistema') que apareceriam na página
// pública como comunicação do sistema — sem alterar o rótulo legítimo (que já é
// exatamente "Nome (Papel)").
export function actorHistoryLabel(user, fallbackActor) {
  const name = user?.name || fallbackActor || user?.email || 'Gestor';
  return user?.role ? `${name} (${user.role})` : name;
}

// Sanitiza uma entrada de histórico NOVA vinda do cliente: coage type inválido e
// força o sender ao ator. NÃO toca em `visibility` ausente — a página pública
// decide por marcador de texto quando ela não vem (coagir para 'internal'
// esconderia marcos como "Triagem concluída"/"Execução iniciada"). Só coage uma
// visibility inválida que veio preenchida.
// Só URLs de anexo navegáveis e seguras: http(s) ou o proxy interno relativo
// (`/api/attachments`). Bloqueia `javascript:`/`data:` — o painel abre a prévia do
// anexo em iframe/href, então uma url forjada seria XSS armazenado (vetor insider).
function isSafeAttachmentUrl(url) {
  const value = String(url || '').trim();
  if (!value) return false;
  return /^https?:\/\//i.test(value) || value.startsWith('/api/attachments');
}

export function sanitizeClientHistoryEntry(entry, senderLabel) {
  const sanitized = {
    ...entry,
    type: HISTORY_ENTRY_TYPES.has(entry?.type) ? entry.type : 'internal',
    sender: senderLabel,
  };
  if (entry?.visibility !== undefined && entry.visibility !== 'public' && entry.visibility !== 'internal') {
    sanitized.visibility = 'internal';
  }
  // Escova as URLs dos anexos da entrada; url insegura vira '' (o anexo fica sem link).
  if (Array.isArray(entry?.attachments)) {
    sanitized.attachments = entry.attachments
      .filter(att => att && typeof att === 'object')
      .map(att => ({
        ...att,
        url: att.path ? '' : isSafeAttachmentUrl(att.url) ? String(att.url).trim() : '',
      }));
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

async function hydrateTicketHistoryForRead(ticket, ticketRef, options = {}) {
  if (!ticket?.historySubcollectionReady) return ticket;
  if (options.paginated) {
    const page = await readTicketHistoryPage(ticketRef, { limit: options.limit || 50 });
    return {
      ...ticket,
      history: [...page.history].reverse(),
      historyPagination: {
        nextCursor: page.nextCursor,
        isComplete: !page.nextCursor,
      },
    };
  }
  const history = await readTicketHistoryFromSubcollection(ticketRef, ticket.history);
  return { ...ticket, history };
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
  } else if (isTicketOpen(currentStatus)) {
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
    // Corte também aqui: a entrada completa vai para a subcoleção no call site, e sem
    // isto o embutido de uma OS migrada voltaria a crescer sem teto pelo caminho
    // público (só seria recortado se um PATCH do painel viesse depois).
    history: boundEmbeddedHistory(nextHistory, beforeData?.historySubcollectionReady === true),
    updatedAt: now,
  };
}

function buildPublicRequesterMessagePayload(beforeData, message) {
  const now = new Date();
  const requesterLabel = String(beforeData?.requester || '').trim() || 'Solicitante';
  const nextHistory = [
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
  ];
  return {
    // Corte também aqui (ver buildPublicTrackingPayload): sem ele o embutido cresce
    // +1 a cada mensagem do solicitante numa OS migrada.
    history: boundEmbeddedHistory(nextHistory, beforeData?.historySubcollectionReady === true),
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
    stageEnteredAt: now,
    // Primeiro marco da linha do tempo: a OS existir já é um evento datado. Sem ele,
    // a carteira mostraria a coluna vazia para toda OS que ainda não se moveu.
    marcos: { 'Nova OS': now },
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
    // Problema de água sai do TEXTO, não de uma caixinha. O formulário público nunca
    // marcou isto — 36 OS entraram cegas — e na triagem por e-mail a marcação também
    // ficava para trás: 14 das 270 OS falavam de vazamento no assunto e estavam sem
    // sinal nenhum. Ninguém digita o que o próprio pedido já diz.
    waterIssue: hasWaterIssueSignal(subject) || hasWaterIssueSignal(description),
    // Solicitação do formulário também é mensagem de gente: sem o carimbo, a OS
    // nasceria fora da projeção, igual às que vinham por e-mail.
    lastInboundAt: now,
    lastInboundMessageId: `form-${now.getTime()}`,
    // Anexos JSON do cliente são descartados; arquivos reais sobem por upload.
    attachments: [],
    history,
  };

  return normalizeTicketForStorage(allowed);
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

// Só apaga arquivos DENTRO do Storage da própria OS: `attachments/tickets/<pasta>/<ticketId>/...`.
// Sem isto, um gestor plantaria em `attachments`/`closureChecklist.documents` (ambos na
// allow-list do PATCH) o path de OUTRA OS; ao Admin excluir a OS descartável, o arquivo
// alheio (ou qualquer objeto do bucket) seria destruído sem ninguém perceber.
function isPathInTicketScope(path, ticketId) {
  if (!path || !ticketId) return false;
  const parts = path.split('/');
  return parts.length > 4 && parts[0] === 'attachments' && parts[1] === 'tickets' && parts[3] === ticketId;
}

/**
 * Lista os arquivos da OS VARRENDO o bucket pelo prefixo dela — não a lista de
 * paths do documento.
 *
 * A versão anterior lia só `attachments[]` e `closureChecklist.documents[]`. Mas
 * anexo que chega por e-mail é gravado em `attachments/tickets/inbound/<id>/` e fica
 * referenciado pelo HISTÓRICO, nunca por aqueles arrays — então nenhuma exclusão
 * jamais o apagava. O passivo limpo em 12/08/2026 era de 459 arquivos e 761 MB de
 * OS que já não existiam, com PII de e-mail de gente real dentro.
 *
 * A varredura mantém a mesma trava (`isPathInTicketScope`): o prefixo já limita à
 * pasta da OS, e a checagem por arquivo é a rede embaixo dela.
 *
 * Separada da exclusão porque o BACKUP precisa da MESMA resposta. Enquanto ele lia
 * os arrays do documento e a cascata varria o prefixo, o backup salvava menos do que
 * a exclusão destruía — o anexo de e-mail ia embora sem cópia, que é o oposto do
 * motivo de o backup existir. Um critério só, lido pelos dois lados.
 */
export async function listTicketStorageFiles(ticketId) {
  if (!ticketId) return [];
  const bucket = getStorage().bucket();

  // As pastas por tipo (inbound, messages, quotes, contracts…) são DESCOBERTAS, e não
  // fixadas numa lista: uma pasta nova criada amanhã voltaria a vazar arquivo órfão.
  const [, , resposta] = await bucket.getFiles({
    prefix: 'attachments/tickets/',
    delimiter: '/',
    autoPaginate: false,
  });

  const arquivos = [];
  for (const pasta of resposta?.prefixes || []) {
    const [files] = await bucket.getFiles({ prefix: `${pasta}${ticketId}/` });
    for (const file of files) {
      if (!isPathInTicketScope(file.name, ticketId)) {
        console.error('[tickets] path de anexo fora do escopo da OS recusado', { ticketId, path: file.name });
        continue;
      }
      arquivos.push(file);
    }
  }

  return arquivos;
}

export async function deleteTicketStorageFolder(ticketId) {
  if (!ticketId) return 0;

  let deleted = 0;
  for (const file of await listTicketStorageFiles(ticketId)) {
    try {
      await file.delete({ ignoreNotFound: true });
      deleted += 1;
    } catch (error) {
      // Não interrompe a exclusão da OS, mas registra: o arquivo pode ficar órfão.
      console.error('[tickets] falha ao apagar anexo do Storage', file.name, error);
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
    const contentType = assertAllowedAttachmentContent(
      attachment.buffer,
      attachment.mimeType,
      attachment.filename || `anexo-${index + 1}`
    );

    const filename = slugFilename(attachment.filename || `anexo-${index + 1}`) || `anexo-${Date.now()}-${index + 1}`;
    const isPdf = contentType === 'application/pdf';
    const baseFolder = isPdf ? 'attachments/tickets/pdfs' : 'attachments/tickets/images';
    const path = `${baseFolder}/${ticketId}/public-${Date.now()}-${index + 1}-${filename}`;
    const file = bucket.file(path);

    try {
      await file.save(attachment.buffer, {
        resumable: false,
        contentType,
        metadata: {
          contentType,
        },
      });

    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(500, `Nao foi possivel salvar o anexo "${attachment.filename || `anexo-${index + 1}`}". Tente com uma imagem menor ou registre a solicitacao sem foto.`);
    }

    results.push({
      id: randomUUID(),
      name: attachment.filename || filename,
      path,
      url: '',
      contentType,
      size: Number(attachment.size || attachment.buffer.length || 0),
      uploadedAt,
      category: 'attachment',
    });
  }

  return results;
}

export async function deleteTicketCascade(db, ticketId) {
  const ticketRef = db.collection('tickets').doc(ticketId);
  const ticketSnap = await ticketRef.get();
  if (!ticketSnap.exists) {
    throw new HttpError(404, 'Ticket não encontrado.');
  }

  const ticketData = ticketSnap.data() || {};

  const [quotesDeleted, contractsDeleted, paymentsDeleted, measurementsDeleted, historyEntriesDeleted] = await Promise.all([
    deleteSubcollection(ticketRef, 'quotes'),
    deleteSubcollection(ticketRef, 'contracts'),
    deleteSubcollection(ticketRef, 'payments'),
    deleteSubcollection(ticketRef, 'measurements'),
    deleteSubcollection(ticketRef, 'historyEntries'),
  ]);

  const threadRef = db.collection('emailThreads').doc(ticketId);

  // LÁPIDE, antes de apagar: a conversa continua viva na caixa de quem participou
  // dela, e a primeira resposta faria o inbound criar uma OS NOVA — sem histórico,
  // ressuscitando o trabalho que alguém decidiu apagar. Só identificadores técnicos;
  // conteúdo aqui derrotaria o propósito de excluir.
  try {
    const [threadSnap, mensagensSnap, inboundSnap] = await Promise.all([
      threadRef.get(),
      threadRef.collection('messages').limit(200).get(),
      db.collection('ticketInbound').where('ticketId', '==', ticketId).limit(200).get(),
    ]);
    const thread = threadSnap.exists ? threadSnap.data() || {} : {};
    await recordDeletedTicket(db, {
      ticketId,
      gmailThreadId: thread.gmailThreadId,
      messageIds: collectMessageIds([
        thread.lastMessageId,
        thread.rootMessageId,
        thread.references,
        mensagensSnap.docs.map(doc => doc.data()?.messageId),
        inboundSnap.docs.map(doc => doc.data()?.messageId),
      ]),
    });
  } catch (error) {
    // Best-effort: a lápide não pode impedir a exclusão que alguém pediu.
    console.error('[tickets] falha ao registrar lápide da OS apagada', ticketId, error);
  }

  const [threadMessagesDeleted, inboundDeleted, emailEventsDeleted, preferenceEventsDeleted, filesDeleted] = await Promise.all([
    deleteSubcollection(threadRef, 'messages'),
    deleteCollectionDocs(db.collection('ticketInbound').where('ticketId', '==', ticketId)),
    deleteCollectionDocs(db.collection('emailEvents').where('ticketId', '==', ticketId)),
    deleteCollectionDocs(db.collection('vendorPreferenceEvents').where('ticketId', '==', ticketId)),
    deleteTicketStorageFolder(ticketId),
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
      historyEntries: historyEntriesDeleted,
      threadMessages: threadMessagesDeleted,
      inbound: inboundDeleted,
      emailEvents: emailEventsDeleted,
      preferenceEvents: preferenceEventsDeleted,
      storageFiles: filesDeleted,
    },
  };
}

async function readPublicTrackingProcurement(ticketRef) {
  // Contrato canônico ('contract-1') com fallback ao legado: o `.limit(1)` sem
  // orderBy resolve por ID, então um doc com id menor venceria o contrato real.
  const [canonicalContractSnap, contractSnap, paymentsSnap, measurementsSnap] = await Promise.all([
    ticketRef.collection('contracts').doc('contract-1').get(),
    ticketRef.collection('contracts').limit(1).get(),
    ticketRef.collection('payments').get(),
    ticketRef.collection('measurements').get(),
  ]);

  const contractDoc = canonicalContractSnap.exists
    ? canonicalContractSnap
    : (contractSnap.empty ? null : contractSnap.docs[0]);
  const contractRaw = contractDoc
    ? serializeValue({
        id: contractDoc.id,
        ...contractDoc.data(),
      })
    : null;

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

/**
 * Gera o Relatório Gerencial de OS em PDF no servidor (pdfkit) — impecável pra
 * diretoria, sem barra do navegador. Recebe do front os números já computados
 * (ver KpiView.reportData) e devolve o PDF pra download. Autenticado.
 */
/**
 * COMPROMISSOS — a promessa do terceiro de comparecer.
 *
 * Entra como `?route=commitments` dentro de tickets.js de propósito: o plano da
 * Vercel está no teto de funções, então rota nova não pode virar arquivo novo.
 */
/**
 * As OS deste compromisso estão no território de quem pediu?
 *
 * Toda rota de OS do sistema passa por `canUserAccessTicket`; esta nasceu sem o
 * filtro. Sem ele, um Gestor de uma região lia (e confirmava) visitas de outra —
 * nome de fornecedor, data, sede — de OS que ele nem consegue abrir.
 *
 * Basta UMA OS acessível: a visita atende várias, e esconder a visita inteira porque
 * uma das OS é de outro território esconderia trabalho que é dele.
 */
function novoCacheDeEscopo() {
  return { territory: null, tickets: new Map() };
}

async function podeVerCompromisso(db, user, ticketIds, cache) {
  if (!user) return false;
  if (user.role === 'Admin') return true;
  const ids = (ticketIds || []).map(value => String(value || '').trim()).filter(Boolean);
  if (ids.length === 0) return false;

  if (!cache.territory) cache.territory = await readTerritoryCatalog(db);

  for (const id of ids) {
    // Cache por requisição: uma lista de 500 compromissos toca as MESMAS OS várias
    // vezes, e sem isto cada carregamento da tela viraria centenas de leituras.
    if (!cache.tickets.has(id)) {
      const snap = await db.collection('tickets').doc(id).get();
      cache.tickets.set(id, snap.exists ? { id: snap.id, ...snap.data() } : null);
    }
    const ticket = cache.tickets.get(id);
    if (!ticket) continue;
    if (canUserAccessTicket(user, ticket, cache.territory.regions, cache.territory.sites)) {
      return true;
    }
  }
  return false;
}

async function handleCommitments(req, res) {
  try {
    const actor = await requireUserWithRoles(req, ['Admin', 'Gestor', 'Diretor']);
    const db = getAdminDb();
    const col = db.collection('commitments');
    const agora = new Date();

    if (req.method === 'GET') {
      // Sem índice composto (o projeto não usa nenhum): faixa num campo só, e o
      // resto em memória. São poucas visitas por semana.
      const desde = new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000);
      const snap = await col.where('startAt', '>=', desde).orderBy('startAt', 'asc').limit(500).get();
      const escopo = novoCacheDeEscopo();
      const commitments = [];
      for (const doc of snap.docs) {
        const data = { id: doc.id, ...doc.data() };
        if (!(await podeVerCompromisso(db, actor, data.ticketIds, escopo))) continue;
        commitments.push(serializeCommitmentForApi(data, agora));
      }
      return sendJson(res, 200, { ok: true, commitments });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const ticketIds = (Array.isArray(body?.ticketIds) ? body.ticketIds : [])
        .map(value => String(value || '').trim())
        .filter(Boolean);
      const startAt = toDateOrNull(body?.startAt);
      if (ticketIds.length === 0) throw new HttpError(400, 'Informe ao menos uma OS.');
      if (!startAt) throw new HttpError(400, 'Informe a data e a hora combinadas.');

      if (!(await podeVerCompromisso(db, actor, ticketIds, novoCacheDeEscopo()))) {
        throw new HttpError(403, 'Sem acesso a esta OS.');
      }

      const id = `cmt-${randomUUID()}`;
      const commitment = normalizeCommitmentForStorage({
        kind: 'visita-fornecedor',
        ticketIds,
        siteId: String(body?.siteId || '').trim() || null,
        sede: String(body?.sede || '').trim() || null,
        vendorId: String(body?.vendorId || '').trim() || null,
        vendorName: String(body?.vendorName || '').trim() || null,
        startAt,
        endAt: body?.endAt || null,
        toleranceMinutes: Number(body?.toleranceMinutes) || DEFAULT_TOLERANCE_MINUTES,
        state: COMMITMENT_STATE.SCHEDULED,
        outcome: null,
        createdAt: agora,
        createdBy: actor?.email || null,
        updatedAt: agora,
      });
      await col.doc(id).set(commitment);
      // A visita muda o que a OS exige: sem recalcular aqui, a atenção só apareceria
      // no próximo e-mail — que pode nunca vir.
      for (const alvoId of ticketIds) await recomputeOperationalAttention(db, alvoId);
      return sendJson(res, 201, {
        ok: true,
        commitment: serializeCommitmentForApi({ id, ...commitment }, agora),
      });
    }

    if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      const id = String(body?.id || '').trim();
      if (!id) throw new HttpError(400, 'Compromisso não informado.');

      const ref = col.doc(id);
      const snap = await ref.get();
      if (!snap.exists) throw new HttpError(404, 'Compromisso não encontrado.');
      const atual = { id, ...snap.data() };
      if (!(await podeVerCompromisso(db, actor, atual.ticketIds, novoCacheDeEscopo()))) {
        throw new HttpError(403, 'Sem acesso a esta OS.');
      }

      /**
       * COBRANÇA — duas ações num campo só.
       *
       * `tentativa` grava que alguém foi cobrar e abre a conversa. Ela NÃO conta
       * como atuação: a auditoria pegou que registrar-antes-de-cobrar inflava
       * justamente a métrica que existe para proteger quem cobrou. O que conta é o
       * `desfecho`, que vem depois — respondeu, não respondeu, ou marcou nova data.
       */
      if (body?.cobranca) {
        const acao = String(body.cobranca.acao || '').trim();

        if (acao === 'tentativa') {
          if (!podeCobrar(atual)) {
            throw new HttpError(409, 'Só se cobra falta confirmada pela sede.');
          }
          const tentativa = {
            em: agora,
            por: String(actor?.email || '').trim() || null,
            canal: String(body.cobranca.canal || 'whatsapp'),
            // O nome diz o que o dado PROVA: a conversa foi aberta. Se a mensagem
            // foi enviada, só quem registra o desfecho sabe.
            evento: EVENTO_DE_CONTATO,
            desfecho: null,
          };
          await ref.update({
            cobrancas: [...(Array.isArray(atual.cobrancas) ? atual.cobrancas : []), tentativa],
            updatedAt: agora,
          });
          return sendJson(res, 200, { ok: true, tentativas: tentativasDe(atual) + 1 });
        }

        if (acao === 'desfecho') {
          const check = validarDesfecho(atual, body.cobranca.desfecho);
          if (!check.ok) throw new HttpError(409, check.error);
          const lista = [...atual.cobrancas];
          lista[check.indice] = {
            ...lista[check.indice],
            desfecho: String(body.cobranca.desfecho),
            desfechoEm: agora,
            desfechoPor: String(actor?.email || '').trim() || null,
          };
          await ref.update({ cobrancas: lista, updatedAt: agora });
          return sendJson(res, 200, { ok: true, concluidas: lista.filter(c => c.desfecho).length });
        }

        throw new HttpError(400, 'Ação de cobrança desconhecida.');
      }

      if (body?.cancel) {
        if (isCommitmentClosed(atual)) throw new HttpError(409, 'Este compromisso já foi encerrado.');
        await ref.update({ state: COMMITMENT_STATE.CANCELED, updatedAt: agora });
        return sendJson(res, 200, { ok: true });
      }

      const state = String(body?.state || '').trim();
      const outcome = body?.outcome ? String(body.outcome).trim() : null;
      const check = validateConfirmation(atual, { state, outcome });
      if (!check.ok) throw new HttpError(409, check.error);

      // A pendência de desfecho se conclui SOZINHA aqui. É o que separa esta de uma
      // tarefa comum: ninguém precisa lembrar de marcá-la feita, e por isso ela não
      // vira a próxima gaveta. (Consulta 13.)
      const concluida = outcome ? concluirSeTemDesfecho({ ...atual, outcome }, agora) : null;

      await ref.update({
        state,
        outcome: outcome || null,
        confirmedBy: String(body?.confirmedBy || actor?.email || '').trim() || null,
        confirmedAt: agora,
        updatedAt: agora,
        ...(concluida ? { desfechoPendente: concluida } : {}),
      });
      for (const alvoId of atual.ticketIds || []) await recomputeOperationalAttention(db, alvoId);

      return sendJson(res, 200, {
        ok: true,
        commitment: serializeCommitmentForApi({ ...atual, state, outcome, confirmedAt: agora }, agora),
      });
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    throw new HttpError(405, 'Método não permitido.');
  } catch (error) {
    sendError(res, error);
  }
}

/**
 * BACKFILL DA ATENÇÃO OPERACIONAL.
 *
 * A atenção é incremental: nasce de eventos. As 194 OS vivas de hoje nunca receberam
 * esses eventos, então sem este backfill elas só entrariam no modelo novo quando
 * chegasse e-mail — o que, pelos números, seria pouca coisa por semana.
 *
 * Deriva os carimbos do histórico COMPLETO (subcoleção), não da janela embutida no
 * documento: a janela tem só as últimas N entradas e daria uma conclusão diferente da
 * verdade.
 *
 * `?route=rebuild-attention&limit=40&cursor=OS-0100&apply=1`
 * Sem `apply`, é DRY-RUN: conta e mostra, não grava.
 */
async function handleRebuildAttention(req, res) {
  try {
    // Cron OU Admin. Deixou de ser só-Admin porque a atenção precisa de varredura
    // PERIÓDICA, não de um backfill de uma vez: as regras são de TEMPO ("parada há 7
    // dias") e o recálculo nascia de EVENTO. OS que fica parada não gera evento — ou
    // seja, a população que as regras existem para pegar era exatamente a que nunca
    // era recalculada. Medido em 12/08: as regras apontavam 116 OS e havia 4 gravadas,
    // todas de e-mail recebido nas 48 h anteriores.
    await authorizeCronOrAdmin(req);
    const db = getAdminDb();
    const agora = new Date();

    const aplicar = String(req.query?.apply || '') === '1';
    const forcar = String(req.query?.force || '') === '1';
    const limite = Math.min(50, Math.max(5, Number(req.query?.limit) || 25));
    const cursor = String(req.query?.cursor || '').trim();

    // Pagina por ID do documento: ordenação num campo só, sem índice composto.
    let consulta = db.collection('tickets').orderBy(FieldPath.documentId()).limit(limite);
    if (cursor) consulta = consulta.startAfter(cursor);
    const snap = await consulta.get();

    const resultado = { lidas: snap.size, ignoradas: 0, calculadas: 0, gravadas: 0, legado: 0, porTipo: {}, amostra: [] };
    let ultimo = cursor;

    for (const doc of snap.docs) {
      ultimo = doc.id;
      const ticket = { id: doc.id, ...doc.data() };

      if (MORTAS_BACKFILL.has(String(ticket.status || ''))) { resultado.ignoradas += 1; continue; }
      // NÃO pula por `ruleVersion`: os dados mudam mesmo com a regra igual, e pular
      // deixaria a projeção velha para sempre. Recalcula sempre; quem evita escrita à
      // toa é o `attentionChanged` lá embaixo. `force` existe só para reprocessar o
      // que já está igual, quando se quer medir.

      const historico = await doc.ref.collection('historyEntries').get();
      let lastInboundAt = null;
      let lastInboundMessageId = null;
      let lastOutboundAt = null;
      historico.forEach(entrada => {
        const item = entrada.data() || {};
        const quando = toDateOrNull(item.time);
        if (!quando) return;
        if (item.type === 'customer') {
          if (!lastInboundAt || quando > lastInboundAt) {
            lastInboundAt = quando;
            lastInboundMessageId = entrada.id;
          }
        } else if (item.type === 'internal' || item.type === 'outbound') {
          if (!lastOutboundAt || quando > lastOutboundAt) lastOutboundAt = quando;
        }
      });

      const visitas = await db.collection('commitments').where('ticketIds', 'array-contains', doc.id).limit(20).get();
      const atencao = computeOperationalAttention(
        {
          ticket: { ...ticket, lastInboundAt, lastInboundMessageId, lastOutboundAt },
          commitments: visitas.docs.map(d => ({ id: d.id, ...d.data() })),
        },
        agora
      );

      resultado.calculadas += 1;
      const tipo = atencao ? atencao.kind : '(sem sinal)';
      resultado.porTipo[tipo] = (resultado.porTipo[tipo] || 0) + 1;
      const ehLegado = isLegacyAttention(atencao, agora);
      if (ehLegado) resultado.legado += 1;
      if (resultado.amostra.length < 8) {
        resultado.amostra.push({ id: doc.id, kind: tipo, dueAt: atencao?.dueAt?.toISOString() || null, legacy: ehLegado });
      }

      if (!aplicar) continue;
      // `force` grava mesmo quando nada mudou — útil para carimbar `ruleVersion` numa
      // migração de regra. Sem ele, o set abaixo só acontece quando há diferença.
      if (!forcar && ticket.operationalAttention?.ruleVersion === ATTENTION_RULE_VERSION
          && ticket.operationalAttention?.sourceId === (atencao?.sourceId ?? null)) {
        continue;
      }

      await doc.ref.set({
        lastInboundAt: lastInboundAt || null,
        lastInboundMessageId: lastInboundMessageId || null,
        lastOutboundAt: lastOutboundAt || null,
        operationalAttention: atencao
          ? {
              kind: atencao.kind,
              dueAt: atencao.dueAt,
              sourceId: atencao.sourceId,
              ruleVersion: ATTENTION_RULE_VERSION,
              legacy: ehLegado,
              computedAt: agora,
            }
          : null,
      }, { merge: true });
      resultado.gravadas += 1;
    }

    return sendJson(res, 200, {
      ok: true,
      dryRun: !aplicar,
      ...resultado,
      proximoCursor: snap.size === limite ? ultimo : null,
    });
  } catch (error) {
    sendError(res, error);
  }
}

const MORTAS_BACKFILL = new Set(['Encerrada', 'Cancelada']);

async function handleReportPdf(req, res) {
  try {
    if (req.method !== 'POST') {
      throw new HttpError(405, 'Método não permitido.');
    }
    await requireAuthenticatedUser(req);

    const body = await readJsonBody(req);
    const data = body?.data;
    if (!data || typeof data !== 'object') {
      throw new HttpError(400, 'Dados do relatório ausentes.');
    }

    const pdf = await buildReportPdf(data);

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="relatorio-gerencial-os.pdf"');
    res.setHeader('Content-Length', String(pdf.length));
    res.end(pdf);
  } catch (error) {
    if (res.headersSent) {
      res.end();
      return;
    }
    sendError(res, error);
  }
}

/**
 * A CONFIRMAÇÃO DA SEDE, sem login.
 *
 * Entra como `?route=confirm-visit` dentro de tickets.js pelo mesmo motivo de
 * `commitments`: a Vercel está no teto de funções do plano, então rota nova não
 * pode virar arquivo novo.
 *
 * ⚠️ O GET NÃO ESCREVE. É a trava mais importante desta rota: filtro de segurança
 * de e-mail corporativo abre os links sozinho para checar se são seguros. Se o
 * botão do e-mail gravasse direto, o sistema registraria "não apareceu" em visitas
 * que ninguém olhou — e cobraria fornecedor que compareceu. O e-mail abre a
 * página; a página grava no POST.
 */
async function handleConfirmVisit(req, res) {
  try {
    const db = getAdminDb();
    const agora = new Date();

    // Lê o corpo UMA vez: `readJsonBody` consome o stream, e uma segunda leitura
    // devolveria vazio — o `escolha` chegaria nulo e nada seria gravado.
    const corpo = req.method === 'POST' ? await readJsonBody(req) : null;
    const token =
      req.method === 'GET'
        ? String(req.query?.token || '').trim()
        : String(corpo?.token || '').trim();

    // Teto por IP: o token tem 192 bits, mas caminho público sem teto é convite
    // para varredura. Folgado o bastante para quem recarrega a página.
    await enforceRateLimit(req, {
      bucket: 'confirm-visit',
      limit: 120,
      windowMs: 5 * 60 * 1000,
      message: 'Muitas tentativas. Aguarde alguns instantes.',
    });

    if (!token) throw new HttpError(400, 'Link incompleto.');

    const tokenSnap = await db.collection('visitConfirmTokens').doc(token).get();
    // Mesma resposta para token inexistente e token expirado: distinguir os dois
    // diria a quem varre que aquele token um dia existiu.
    const dadosDoToken = tokenSnap.exists
      ? { ...tokenSnap.data(), createdAt: toDateOrNull(tokenSnap.data()?.createdAt) }
      : null;
    if (!dadosDoToken || tokenExpirou(dadosDoToken, agora)) {
      throw new HttpError(410, 'Este link não vale mais. Peça um novo à equipe de manutenção.');
    }

    const ref = db.collection('commitments').doc(String(dadosDoToken.commitmentId || ''));
    const snap = await ref.get();
    if (!snap.exists) throw new HttpError(404, 'Visita não encontrada.');
    const commitment = { id: snap.id, ...snap.data(), startAt: toDateOrNull(snap.data()?.startAt) };

    const resumoDasOrdens = async () => {
      const ids = (commitment.ticketIds || []).slice(0, 5);
      const docs = await Promise.all(ids.map(id => db.collection('tickets').doc(String(id)).get()));
      return docs
        .filter(d => d.exists)
        .map(d => ({ id: d.id, assunto: String(d.data()?.subject || '') }));
    };

    if (req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        pergunta: montarPergunta({
          commitment: { ...commitment, confirmedAt: toDateOrNull(commitment.confirmedAt) },
          token: dadosDoToken,
          ticketsResumo: await resumoDasOrdens(),
        }),
      });
    }

    if (req.method === 'POST') {
      const escolha = String(corpo?.escolha || '').trim();
      const check = validarEscolhaDaSede(commitment, escolha);
      if (!check.ok) {
        return sendJson(res, check.jaRespondido ? 409 : 400, {
          ok: false,
          error: check.error,
          pergunta: montarPergunta({
            commitment: { ...commitment, confirmedAt: toDateOrNull(commitment.confirmedAt) },
            token: dadosDoToken,
            ticketsResumo: await resumoDasOrdens(),
          }),
        });
      }

      /**
       * "Chegou" NÃO fecha a OS — abre a pendência de registrar o desfecho.
       *
       * A pendência mora no COMPROMISSO, não em `ticket.nextAction`. A primeira
       * versão criava uma ação por OS da visita: visita com três OS gerava três
       * cartões idênticos, e a ação carregava `commitmentId`, que a agenda
       * classifica como "Aguardando a sede" — a tarefa da gestora aparecia como
       * silêncio da sede, acusando quem já tinha respondido. (Consulta 13.)
       *
       * ⚠️ ESCRITA ÚNICA. A pendência entra no MESMO `update` da confirmação. São
       * o mesmo documento, então não há janela entre uma coisa e outra: ou a visita
       * fica respondida COM dono do desfecho, ou não fica de jeito nenhum.
       */
      let pendencia = null;
      if (check.efeito.state === COMMITMENT_STATE.ARRIVED && !check.efeito.outcome && !temPendenciaAberta(commitment)) {
        const siteId = String(commitment.siteId || commitment.sede || '').trim();
        const territorio = await readTerritoryCatalog(db);
        const regiao = territorio?.sites?.find?.(t => String(t?.id || '') === siteId)?.regionId || null;
        const ativos = (await db.collection('users').where('status', '==', 'Ativo').get()).docs.map(d => ({
          id: d.id,
          ...d.data(),
        }));
        const { dono } = donoDoAlertaDeFalta(ativos, {
          siteId,
          regiao,
          responsavelDireto: commitment.alertOwnerEmail || null,
          plantao: String(process.env.ALERTA_FALTA_PLANTAO || '').trim() || null,
        });
        pendencia = novaPendenciaDeDesfecho({ dono, now: agora });
      }

      const quem = String(dadosDoToken.email || '').trim() || null;
      await ref.update({
        state: check.efeito.state,
        outcome: check.efeito.outcome,
        confirmedBy: quem,
        confirmedAt: agora,
        updatedAt: agora,
        // Fica registrado que veio da sede, e não de dentro do app: é o que permite
        // distinguir depois "a sede respondeu" de "o gestor preencheu por ela".
        //
        // O link prova POSSE DO TOKEN, nao a identidade de quem tocou (auditoria
        // consulta 12). Por isso a origem e "link da sede": quem ler o registro
        // depois precisa saber que isto e relato, nao identificacao.
        confirmedVia: 'link-da-sede',
        ...(pendencia ? { desfechoPendente: pendencia } : {}),
      });

      for (const alvoId of commitment.ticketIds || []) await recomputeOperationalAttention(db, alvoId);

      const atualizado = { ...commitment, ...check.efeito, confirmedBy: quem, confirmedAt: agora };
      return sendJson(res, 200, {
        ok: true,
        pergunta: montarPergunta({
          commitment: atualizado,
          token: dadosDoToken,
          ticketsResumo: await resumoDasOrdens(),
        }),
      });
    }

    res.setHeader('Allow', 'GET, POST');
    throw new HttpError(405, 'Método não permitido.');
  } catch (error) {
    sendError(res, error);
  }
}

/**
 * A REVISÃO SEMANAL — a página do fechamento assistido.
 *
 * Mesma trava da confirmação da visita, e aqui ela pesa mais: encerrar OS é a ação
 * mais destrutiva do sistema. O e-mail NÃO encerra nada — leva para esta página, e
 * o GET não escreve. Um link que fechasse OS ao ser aberto entregaria uma limpeza
 * silenciosa do backlog ao antivírus do servidor de e-mail.
 */
async function handleRevisaoSemanal(req, res) {
  try {
    const db = getAdminDb();
    const agora = new Date();

    const corpo = req.method === 'POST' ? await readJsonBody(req) : null;
    const token = req.method === 'GET' ? String(req.query?.token || '').trim() : String(corpo?.token || '').trim();

    await enforceRateLimit(req, {
      bucket: 'revisao-semanal',
      limit: 200,
      windowMs: 5 * 60 * 1000,
      message: 'Muitas tentativas. Aguarde alguns instantes.',
    });
    if (!token) throw new HttpError(400, 'Link incompleto.');

    const tokenSnap = await db.collection('revisaoTokens').doc(token).get();
    const dadosDoToken = tokenSnap.exists
      ? { ...tokenSnap.data(), createdAt: toDateOrNull(tokenSnap.data()?.createdAt) }
      : null;
    // Uma semana: o e-mail é semanal, e um link que morre antes do próximo faria a
    // gestora abrir na sexta e encontrar porta fechada.
    if (!dadosDoToken || tokenExpirou(dadosDoToken, agora, 7 * 24)) {
      throw new HttpError(410, 'Este link não vale mais. O próximo resumo chega na semana que vem.');
    }

    const idsDoLote = (dadosDoToken.ticketIds || []).map(String);

    const lerOrdens = async () => {
      const docs = await Promise.all(idsDoLote.map(id => db.collection('tickets').doc(id).get()));
      return docs
        .filter(d => d.exists)
        .map(d => {
          const t = { id: d.id, ...d.data(), updatedAt: toDateOrNull(d.data()?.updatedAt) };
          const marca = t.fechamentoAssistido;
          return {
            id: t.id,
            assunto: String(t.subject || ''),
            sede: String(t.sede || ''),
            status: String(t.status || ''),
            dias: diasParada(t, agora),
            encerradaAqui: Boolean(marca?.em),
            podeDesfazer: podeDesfazer({ ...t, fechamentoAssistido: marca ? { ...marca, em: toDateOrNull(marca.em) } : null }, agora),
            adiadaAte: t.revisaoAdiadaAte ? String(toDateOrNull(t.revisaoAdiadaAte)?.toISOString() || '') : null,
          };
        });
    };

    if (req.method === 'GET') {
      return sendJson(res, 200, {
        ok: true,
        gestora: { nome: dadosDoToken.nome || null, email: dadosDoToken.email || null },
        ordens: await lerOrdens(),
      });
    }

    if (req.method === 'POST') {
      const ticketId = String(corpo?.ticketId || '').trim();
      const resposta = String(corpo?.resposta || '').trim();
      // O token delimita o que este link pode tocar: sem isto, quem o tivesse
      // encerraria qualquer OS do sistema mandando outro id.
      if (!idsDoLote.includes(ticketId)) throw new HttpError(403, 'Esta OS não faz parte deste resumo.');

      const ref = db.collection('tickets').doc(ticketId);
      const snap = await ref.get();
      if (!snap.exists) throw new HttpError(404, 'OS não encontrada.');
      const ticket = { id: snap.id, ...snap.data() };

      if (resposta === RESPOSTA.DESFAZER) {
        const marca = ticket.fechamentoAssistido;
        const normalizada = marca ? { ...marca, em: toDateOrNull(marca.em) } : null;
        if (!podeDesfazer({ ...ticket, fechamentoAssistido: normalizada }, agora)) {
          throw new HttpError(409, 'Esta OS não pode mais ser reaberta por este link.');
        }
        const efeito = efeitoDaResposta(RESPOSTA.DESFAZER, { now: agora, statusAnterior: normalizada?.statusAnterior });
        await ref.update({ ...efeito, revisaoRespondidaPor: String(dadosDoToken.email || '') || null });
        return sendJson(res, 200, { ok: true, ordens: await lerOrdens() });
      }

      // ⚠️ `ticketAtual` NÃO é opcional. Sem ele, `efeitoDaResposta` não tem como
      // preservar o tempo parado nem ler o contador, e o adiamento zerava os dois —
      // a correção existia só no teste, que passava o objeto. (Consulta 13.)
      const efeito = efeitoDaResposta(resposta, {
        now: agora,
        statusAnterior: String(ticket.status || ''),
        ticketAtual: ticket,
      });
      if (!efeito) throw new HttpError(400, 'Resposta desconhecida.');

      /**
       * ENCERRAR AQUI PASSA PELA MESMA TRANSIÇÃO DO RESTO DO SISTEMA.
       *
       * ⚠️ Antes esta rota mudava só o `status`. A auditoria (consulta 13) mostrou
       * que isso repete um defeito histórico conhecido do projeto: sem `closedAt`,
       * `stageEnteredAt` e `marcos`, a OS some do gráfico de encerramentos — foi
       * exatamente assim que 92 de 92 OS fechadas apareceram como zero, por meses,
       * sem ninguém notar. Uma limpeza que não aparece no indicador que ela existe
       * para mover não serve para nada.
       */
      const extras = {};
      if (efeito.status && efeito.status !== ticket.status) {
        extras.stageEnteredAt = agora;
        if (CLOSED_STATUSES.has(efeito.status)) extras.closedAt = agora;
        else if (CLOSED_STATUSES.has(String(ticket.status || ''))) extras.closedAt = null;
        const marcos = addStageMarco(ticket.marcos, efeito.status, agora);
        if (marcos) extras.marcos = marcos;
      }

      // Quem respondeu fica gravado em TODOS os casos: é o que faz a limpeza ter
      // autor, e sem autor ninguém consegue dizer depois o que foi fechado e por quem.
      const autor = String(dadosDoToken.email || '') || null;
      await ref.update({ ...efeito, ...extras, revisaoRespondidaPor: autor });

      /**
       * OS encerrada não deixa visita marcada de pé.
       *
       * Sem isto o fornecedor apareceria para um serviço que já não existe — com
       * deslocamento cobrado —, ou seria marcado como faltoso numa visita que a
       * própria manutenção cancelou. É o mesmo motivo pelo qual "resolvido pela
       * sede" cancela o compromisso.
       */
      if (efeito.status && CLOSED_STATUSES.has(efeito.status)) {
        const visitas = await db
          .collection('commitments')
          .where('ticketIds', 'array-contains', ticketId)
          .get();
        for (const doc of visitas.docs) {
          const estado = String(doc.data()?.state || '');
          if (estado === 'agendado' || estado === 'sem-confirmacao') {
            await doc.ref.update({
              state: 'cancelado',
              canceladaPor: 'os-encerrada-na-revisao',
              updatedAt: agora,
            });
          }
        }
      }

      if (autor) {
        await writeAuditLog({
          action: efeito.status === 'Encerrada' ? 'ticket.close.revisao-semanal' : 'ticket.revisao-semanal',
          actorEmail: autor,
          targetId: ticketId,
          details: { resposta, statusAnterior: String(ticket.status || ''), via: 'link-da-revisao' },
        }).catch(() => {});
      }

      return sendJson(res, 200, { ok: true, ordens: await lerOrdens() });
    }

    res.setHeader('Allow', 'GET, POST');
    throw new HttpError(405, 'Método não permitido.');
  } catch (error) {
    sendError(res, error);
  }
}

export default async function handler(req, res) {
  const route = String(req.query?.route || '').trim().toLowerCase();
  if (route === 'revisao-semanal') return handleRevisaoSemanal(req, res);
  if (route === 'report-pdf') return handleReportPdf(req, res);
  if (route === 'commitments') return handleCommitments(req, res);
  if (route === 'confirm-visit') return handleConfirmVisit(req, res);
  if (route === 'rebuild-attention') return handleRebuildAttention(req, res);

  try {
    const db = getAdminDb();
    const col = db.collection('tickets');

    if (req.method === 'GET') {
      const trackingToken = String(req.query?.tracking || '').trim();
      if (trackingToken) {
        // Rate-limit por IP no acompanhamento público. O token tem 64 bits (brute
        // force inviável), mas o GET era o único caminho público sem teto — folgado
        // o bastante para o polling da página, só barra varredura/abuso sem custo.
        await enforceRateLimit(req, {
          bucket: 'ticket-tracking-get',
          limit: 300,
          windowMs: 5 * 60 * 1000,
          message: 'Muitas consultas de acompanhamento. Aguarde alguns instantes e tente novamente.',
        });
        const trackingSnap = await col.where('trackingToken', '==', trackingToken).limit(1).get();
        if (trackingSnap.empty) {
          return sendJson(res, 404, { ok: false, error: 'Ticket não encontrado.' });
        }

        const trackingDoc = trackingSnap.docs[0];
        const hydratedTicket = await hydrateTicketHistoryForRead({
          id: trackingDoc.id,
          ...trackingDoc.data(),
        }, trackingDoc.ref);
        const ticket = sanitizeTicketForPublicTracking(serializeTicketForApi(hydratedTicket));
        const procurement = await readPublicTrackingProcurement(trackingDoc.ref);

        return sendJson(res, 200, { ok: true, ticket, procurement });
      }

      const historyTicketId = String(req.query?.historyTicketId || '').trim().toUpperCase();
      if (historyTicketId) {
        const user = await requireAuthenticatedUser(req);
        const ticketRef = col.doc(historyTicketId);
        const ticketSnap = await ticketRef.get();
        if (!ticketSnap.exists) return sendJson(res, 404, { ok: false, error: 'OS não encontrada.' });
        const ticketData = ticketSnap.data() || {};
        const territory = user.role === 'Admin'
          ? { regions: [], sites: [] }
          : await readTerritoryCatalog(db);
        if (!canUserAccessTicket(user, { id: ticketSnap.id, ...ticketData }, territory.regions, territory.sites)) {
          return sendJson(res, 403, { ok: false, error: 'Você não tem acesso a esta OS.' });
        }
        if (!ticketData.historySubcollectionReady) {
          return sendJson(res, 409, {
            ok: false,
            error: 'O histórico desta OS ainda não foi migrado para paginação.',
          });
        }
        const page = await readTicketHistoryPage(ticketRef, {
          cursor: req.query?.historyCursor,
          limit: req.query?.historyLimit,
        });
        return sendJson(res, 200, {
          ok: true,
          history: serializeTicketForApi({ history: page.history }).history,
          nextCursor: page.nextCursor,
        });
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
      let user = null;
      const hasAuthHeader = String(req.headers.authorization || '').trim().length > 0;
      if (hasAuthHeader) {
        const authedUser = await requireAuthenticatedUser(req);
        // Só papéis de gestão usam o caminho autenticado. Usuários comuns seguem
        // pelo fluxo público e continuam sujeitos ao limite por IP.
        if (authedUser.role === 'Admin' || authedUser.role === 'Gestor' || authedUser.role === 'Diretor') {
          user = authedUser;
        }
      }
      if (!user) {
        // O rate limit vem antes do parse multipart para rejeitar abuso sem
        // carregar anexos potencialmente grandes em memória.
        await enforceRateLimit(req, {
          bucket: 'ticket-create',
          limit: 5,
          windowMs: 10 * 60 * 1000,
          message: 'Muitas solicitações enviadas. Aguarde alguns minutos e tente novamente.',
        });
      }

      const parsedBody = await parseInboundBody(req, {
        multipartLimits: TICKET_MULTIPART_LIMITS,
      });
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
        // Duplicata = MESMA requisição, workflow ZERADO. Os campos de identidade/
        // requisição vêm da OS de ORIGEM (dado do servidor, confiável), NUNCA do
        // payload do cliente — senão um gestor forjaria sede/região (reclassificação
        // territorial que o PATCH restringe a Admin) ou o e-mail do solicitante ao
        // "duplicar". Só a conversa da origem é copiada; todo o resto é regenerado.
        const DUPLICATE_REQUEST_FIELDS = [
          'subject', 'requester', 'requesterEmail', 'requesterCcEmails',
          'type', 'macroServiceId', 'macroServiceName', 'serviceCatalogId', 'serviceCatalogName',
          'regionId', 'region', 'siteId', 'sede', 'sector', 'location', 'priority', 'waterIssue',
        ];
        ticket = {};
        for (const field of DUPLICATE_REQUEST_FIELDS) {
          if (Object.prototype.hasOwnProperty.call(sourceData, field)) {
            ticket[field] = sourceData[field];
          }
        }
        ticket.status = 'Nova OS';
        ticket.attachments = []; // arquivos reais sobem por upload; refs da origem apontam pro Storage dela
        // OS migrada guarda no doc só a JANELA recente — a conversa completa está na
        // subcoleção. Hidrata dela para a duplicata não nascer com o histórico
        // truncado (a cópia é o que semeia a subcoleção da OS nova; a perda seria
        // permanente).
        const sourceHistory = sourceData.historySubcollectionReady
          ? await readTicketHistoryFromSubcollection(sourceSnap.ref, sourceData.history)
          : (Array.isArray(sourceData.history) ? sourceData.history : []);
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
        ticket = normalizeTicketForStorage(ticket);
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

      // create() (não set()): se a sequência de OS regredir (restauração de backup,
      // seed de emulador apontado pra prod, edição manual do contador), o id colidiria
      // com uma OS real — set() a sobrescreveria INTEIRA em silêncio. create() falha
      // alto, forçando o conserto da sequência em vez de destruir a OS existente.
      try {
        await col.doc(ticketId).create(createdTicket);
      } catch (error) {
        if (isAlreadyExistsError(error)) {
          console.error('[tickets] colisão de id na criação — sequência de OS regredida?', { ticketId, error: error?.message });
          throw new HttpError(409, 'Conflito ao gerar o número da OS. A sequência precisa ser verificada — avise o suporte.');
        }
        throw error;
      }
      await copyTicketHistoryToSubcollection(db, col.doc(ticketId), createdTicket.history)
        .catch(error => console.error('[tickets] falha ao espelhar histórico inicial', { ticketId, error }));

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
          if (!isTicketOpen(currentStatus)) {
            return sendJson(res, 409, { ok: false, error: 'Esta OS nao aceita novas mensagens pelo link.' });
          }

          // Transação: relê o estado fresco antes de anexar a mensagem ao histórico.
          const msgResult = await db.runTransaction(async tx => {
            const snap = await tx.get(trackingDoc.ref);
            const data = snap.data() || {};
            const status = String(data.status || '');
            if (!isTicketOpen(status)) {
              return { blocked: true };
            }
            const payload = buildPublicRequesterMessagePayload(data, publicMessage);
            writeTicketHistoryEntries(tx, trackingDoc.ref, [payload.history.at(-1)]);
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
            ttlAt: notificationTtlAt(),
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

        // Transação: revalida status e idempotência sobre o estado fresco e
        // anexa a entrada de histórico atomicamente.
        const approvalResult = await db.runTransaction(async tx => {
          const snap = await tx.get(trackingDoc.ref);
          const data = snap.data() || {};
          // Idempotência: reenvio do link após a aprovação já registrada não repete.
          if (approved && data?.closureChecklist?.requesterApproved === true) {
            return { alreadyApproved: true };
          }
          const status = String(data.status || '');
          // APROVAR: a UI oferece a confirmação em WAITING_MAINTENANCE_APPROVAL
          // (→ Aguardando pagamento) E em "Aguardando pagamento" (validação tardia,
          // quando o gestor já moveu a OS antes do clique — aqui só carimba, sem
          // transição). REPROVAR: só de WAITING_MAINTENANCE_APPROVAL (→ Em andamento).
          // Fora disso → 409: senão um "reprovar" devolveria pra execução uma OS já
          // em pagamento/encerrada e mutilaria o checklist (transição fora da máquina).
          const canApprove =
            approved && (status === STATUS_WAITING_MAINTENANCE_APPROVAL || status === STATUS_WAITING_PAYMENT);
          const canReject = !approved && status === STATUS_WAITING_MAINTENANCE_APPROVAL;
          if (!canApprove && !canReject) {
            return { notAllowed: true };
          }
          const payload = buildPublicTrackingPayload(data, approved);
          writeTicketHistoryEntries(tx, trackingDoc.ref, [payload.history.at(-1)]);
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
      // Escopo POR PAPEL (ver _lib/ticketPatchScope.js): Admin tudo, Gestor os
      // operacionais, Diretor só viewingBy + entradas novas de history.
      const updates = filterTicketPatchFields(
        user.role,
        normalizedUpdates,
        new Set(Object.keys(rawUpdates))
      );
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
        const subcollectionReady = data.historySubcollectionReady === true;
        const payload = { ...updates, updatedAt: new Date() };
        let newHistoryEntries = [];
        let editedHistoryEntry = null;
        const statusChanged = updates.status && updates.status !== data.status;

        // Integridade do fluxo: rejeita status inexistente e transições fora
        // do que o papel pode acionar (Admin/Gestor livres; Diretor restrito).
        if (statusChanged) {
          if (!isValidStatus(updates.status)) {
            return { invalidStatus: updates.status };
          }
          // Etapa aposentada não aceita ENTRADA nova. A tela já não oferece, mas
          // `canTransitionStatus` libera Admin/Gestor para qualquer destino — sem esta
          // recusa, um bundle em cache recolocaria a OS numa etapa que não existe mais.
          if (isRetiredStatus(updates.status)) {
            return { retiredStatus: updates.status };
          }
          if (!canTransitionStatus(user.role, data.status, updates.status)) {
            return { invalidTransition: { from: data.status, to: updates.status } };
          }
          // Quando a OS entrou NESTA etapa. Carimbado pelo SERVIDOR, junto da
          // transição que ele acabou de validar — se viesse do cliente seria só mais
          // um campo que uma tela poderia esquecer de mandar, e o relógio de "etapa
          // parada" mediria a memória da tela em vez do fluxo.
          //
          // Existe porque cada regra precisa do SEU relógio: "parada" e "parada nesta
          // etapa" são perguntas diferentes, e responder as duas com o mesmo carimbo
          // dá precisão aparente com semântica errada.
          payload.stageEnteredAt = new Date();

          // Quando a OS SAIU da fila. Carimbado aqui pela mesma razão do
          // `stageEnteredAt`: sair da fila é um evento, e evento que depende de a
          // tela lembrar de mandar não acontece.
          //
          // Existia um candidato — `closureChecklist.closedAt` — e ele estava vazio
          // em 92 de 92 OS fechadas na produção, porque o checklist de encerramento
          // tem 0 usos em 61 encerramentos. O gráfico de tendência lia desse campo e
          // por isso mostrava ZERO encerradas desde sempre, sem ninguém notar.
          //
          // Limpa ao REABRIR: desde hoje dá para tirar uma OS de "Encerrada", e sem
          // isto ela ficaria fora da contagem de pendências para sempre — viva na
          // tela e morta no gráfico.
          if (CLOSED_STATUSES.has(updates.status)) {
            payload.closedAt = payload.stageEnteredAt;
          } else if (CLOSED_STATUSES.has(data.status)) {
            payload.closedAt = null;
          }

          // O marco PERMANENTE da etapa, ao lado do relógio que é sobrescrito.
          // Nasce aqui, dentro da MESMA transação que acabou de validar a transição:
          // numa segunda escrita ele poderia falhar sozinho e a linha do tempo ficaria
          // com buraco justamente na OS que se moveu. `marcos` não está na allow-list
          // do PATCH (`ticketPatchScope.js`), então é campo só-servidor por construção.
          const marcos = addStageMarco(data.marcos, updates.status, payload.stageEnteredAt);
          if (marcos) payload.marcos = marcos;
        }

        if (Array.isArray(updates.history)) {
          // Cliente enviou histórico (ex.: nova mensagem). Mescla só as entradas
          // NOVAS (por id) sobre o histórico fresco + a entrada de status auto.
          // Sanitiza só as novas (as já existentes o merge ignora): type inválido
          // coagido e sender FORÇADO ao ator — impede forjar entrada "oficial"
          // (type:'system'/sender:'Diretoria') na página pública de acompanhamento.
          const senderLabel = actorHistoryLabel(user, actor);
          const existingIds = new Set(freshHistory.map(entry => entry?.id).filter(Boolean));
          let candidates = updates.history.filter(entry => entry?.id && !existingIds.has(entry.id));

          // Com a subcoleção como fonte da verdade, o array embutido é só uma JANELA
          // recente — o cliente pode ter paginado entradas antigas e reenviá-las.
          // Sem deduplicar contra a subcoleção, elas passariam por "novas": o
          // sanitize reescreveria o `sender` das ORIGINAIS (forja retroativa do que
          // ele existe para impedir) e a janela seria reordenada. O cap evita
          // explodir a transação; PATCH legítimo traz 1-3 entradas novas.
          if (subcollectionReady && candidates.length > 0) {
            // Checa os MAIS RECENTES primeiro: o array do cliente é cronológico, então
            // um slice cru pegaria as mais ANTIGAS e descartaria justamente a mensagem
            // recém-escrita (perda silenciosa). O que passar do cap é tratado como já
            // existente — conservador: no pior caso não regrava algo antigo, nunca
            // perde o que é novo.
            const byRecency = [...candidates].sort((a, b) => sortTimeValue(b?.time) - sortTimeValue(a?.time));
            const checked = byRecency.slice(0, HISTORY_DEDUP_LOOKUP_LIMIT);
            const snaps = await tx.getAll(...checked.map(entry => ticketHistoryEntryRef(docRef, entry.id)));
            const trulyNewIds = new Set(
              checked.filter((_entry, index) => !snaps[index]?.exists).map(entry => entry.id)
            );
            // Reaplica sobre `candidates` para preservar a ordem cronológica original.
            candidates = candidates.filter(entry => trulyNewIds.has(entry.id));
          }

          const sanitizedNew = candidates.map(entry => sanitizeClientHistoryEntry(entry, senderLabel));
          // Entrada automática de status só quando o cliente NÃO registrou nenhuma
          // entrada nova. A heurística antiga comparava TAMANHOS de array, o que
          // deixa de valer quando o embutido é uma janela (cliente com histórico
          // paginado mandaria mais itens que o servidor e duplicaria o marco).
          const statusEntry =
            statusChanged && sanitizedNew.length === 0
              ? [buildAutomaticStatusHistoryEntry(buildActorLabel(user, actor), data.status || 'Sem status', updates.status)]
              : [];
          newHistoryEntries = [...sanitizedNew, ...statusEntry];
          payload.history = mergeTicketHistory(freshHistory, newHistoryEntries).merged;
        } else if (statusChanged) {
          const statusEntry = buildAutomaticStatusHistoryEntry(
            buildActorLabel(user, actor),
            data.status || 'Sem status',
            updates.status
          );
          newHistoryEntries = [statusEntry];
          payload.history = [...freshHistory, statusEntry];
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
            const isInWindow = base.some(entry => entry?.id === body.historyTimeEdit.id);
            if (isInWindow) {
              payload.history = base.map(entry =>
                entry?.id === body.historyTimeEdit.id ? { ...entry, time: editTime } : entry
              );
              editedHistoryEntry = payload.history.find(entry => entry?.id === body.historyTimeEdit.id) || null;
            } else if (subcollectionReady) {
              // Entrada mais antiga que a janela do embutido: edita direto na
              // subcoleção (merge de `time` apenas). Sem isto a edição virava no-op
              // silencioso — a API respondia 200 e o horário voltava no próximo poll.
              const entrySnap = await tx.get(ticketHistoryEntryRef(docRef, body.historyTimeEdit.id));
              if (entrySnap.exists) {
                editedHistoryEntry = { id: body.historyTimeEdit.id, time: editTime };
              }
            }
          }
        }

        if (newHistoryEntries.length > 0 || editedHistoryEntry) {
          writeTicketHistoryEntries(tx, docRef, [...newHistoryEntries, editedHistoryEntry].filter(Boolean));
        }
        // Corta o array embutido: as entradas completas já foram para a subcoleção,
        // que é a fonte de leitura das OS migradas. Sem o corte o doc segue rumo ao
        // teto de 1 MiB (o motivo da migração).
        if (Array.isArray(payload.history)) {
          payload.history = boundEmbeddedHistory(payload.history, subcollectionReady);
        }
        tx.set(docRef, payload, { merge: true });
        return { before: data, payload };
      });

      /**
       * A RECUSA TAMBÉM VIRA REGISTRO.
       *
       * Motivo concreto: chegou um relato de "às vezes ocorrem erros quando
       * atualizamos" e não havia como responder — `writeAuditLog` só rodava no
       * caminho de sucesso, então toda recusa morria na tela de quem tentou. Relato
       * assim vira caça ao fantasma, e a mesma coisa acontece de novo no mês
       * seguinte.
       *
       * Não registra 404 nem 403 de propósito: o primeiro é ruído de link velho, e
       * o segundo já tem trilha própria no acesso negado.
       */
      const recusa =
        (txResult.retiredStatus && { motivo: 'etapa-aposentada', detalhe: txResult.retiredStatus }) ||
        (txResult.invalidStatus && { motivo: 'status-invalido', detalhe: txResult.invalidStatus }) ||
        (txResult.invalidTransition && {
          motivo: 'transicao-nao-permitida',
          detalhe: `${txResult.invalidTransition.from} -> ${txResult.invalidTransition.to}`,
        }) ||
        null;
      if (recusa) {
        // Não derruba a resposta se a auditoria falhar: a recusa é o que importa.
        await writeAuditLog({
          actor: buildActorLabel(user, actor),
          action: 'tickets.update.rejected',
          entity: 'ticket',
          entityId: body.id,
          before: { motivo: recusa.motivo, detalhe: recusa.detalhe, campos: Object.keys(updates) },
          after: null,
        }).catch(erro => console.error('[tickets] falha ao registrar recusa', erro));
      }

      if (txResult.notFound) {
        return sendJson(res, 404, { ok: false, error: 'Ticket não encontrado.' });
      }
      if (txResult.forbidden) {
        return sendJson(res, 403, { ok: false, error: 'Você não tem acesso a esta OS.' });
      }
      if (txResult.retiredStatus) {
        return sendJson(res, 409, {
          ok: false,
          error: `A etapa "${txResult.retiredStatus}" saiu do fluxo: a aprovação da diretoria não existe mais.`,
        });
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

      // A projeção depende de campos que ESTE patch escreve: suspensão, status,
      // próxima ação e a própria correção humana. Sem recalcular aqui, suspender uma
      // OS deixava a atenção antiga na tela até chegar um e-mail — que pode nunca vir.
      if (
        'attention' in updates ||
        'attentionOverride' in updates ||
        'nextAction' in updates ||
        'status' in updates
      ) {
        await recomputeOperationalAttention(db, body.id);
      }

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
