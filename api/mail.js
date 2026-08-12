import { createHash, randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { requireAuthenticatedUser, requireUserWithRoles, secretsMatch } from './_lib/authz.js';
import { canUserAccessTicket, readTerritoryCatalog } from './_lib/ticketAccess.js';
import { logEmailEvent } from './_lib/emailLogs.js';
import { writeAuditLog } from './_lib/auditLogs.js';
import { getCachedSites, getCachedRegions, getCachedUsers } from './_lib/refCache.js';
import { buildTicketEmailTemplate } from './_lib/emailTemplates.js';
import { DEFAULT_SETTINGS } from './_lib/settingsDefaults.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import {
  appendTicketHistory,
  copyTicketHistoryToSubcollection,
  reserveNextTicketId,
} from './_lib/tickets.js';
import {
  gmailGetMessage,
  gmailListHistory,
  gmailListRecentInbox,
  gmailSend,
  gmailStartWatch,
} from './_lib/gmail.js';
import { readJsonBody, sendError, sendJson } from './_lib/http.js';
import { isAttachmentContentCompatible, isAllowedAttachmentMime, normalizeMimeType } from './_lib/attachments.js';
import { normalizeKey, repairMojibake, slugFilename } from './_lib/text.js';
// Helpers puros de assunto/threading/Message-Id (extraidos deste arquivo).
import {
  buildConversationSubject,
  buildInboundHistoryId,
  buildReplySubject,
  buildSimpleHtmlEmail,
  buildThreadRootMessageId,
  isTicketConversationSubject,
  normalizeMessageIdToken,
  parseMessageIdCandidates,
} from './_lib/emailThreading.js';
// Limpeza pura do conteudo recebido (assinatura/citacao/encaminhamento).
import {
  displayNameFromEmail,
  extractInboundMessageBody,
  hasWaterIssueSignal,
} from './_lib/inboundBody.js';
import { isAttachmentPathInTicketScope } from './_lib/attachmentAccess.js';
import { isTicketOpen } from './_lib/statusFlow.js';
import { matchSiteCode } from './_lib/siteMatch.js';
import { detectAuthorization } from './_lib/authorization.js';
import { recomputeOperationalAttention } from './_lib/operationalAttention.js';
import { detectBounce } from './_lib/bounce.js';
import { parseTicketId, stripReplyForwardPrefixes, parseNewTicketSubjectCandidates, isLikelyThreadReply } from './_lib/inboundSubject.js';
import {
  filterCopyRecipients as filterCopyRecipientsPure,
  firstEmail,
  mergeEmailLists,
  parseEmailList,
} from './_lib/email.js';
import { toDateOrNull } from './_lib/dates.js';
import {
  claimEmailOutbox,
  EMAIL_OUTBOX_TYPES,
  markEmailOutboxFailed,
  markEmailOutboxSent,
} from './_lib/emailOutbox.js';
import { processEmailOutboxBatch } from './_lib/emailOutboxWorker.js';
import { fetchCemaden } from './_lib/cemaden.js';
import { fetchMetar } from './_lib/metar.js';
import { detectRainTransition, stateToPersist } from './_lib/rainWatch.js';
import { avaliarChuva, montarEmail, sinalSimulado } from './_lib/rainAlert.js';
import { notificationTtlAt } from './_lib/notificationState.js';

const GMAIL_SYNC_STATE_DOC = 'gmailSync';
// Estado do aviso de chuva. Mora no Firestore, ao lado do estado do Gmail — antes
// vivia num arquivo no cache do GitHub Actions, que pode ser despejado e levaria
// junto a memória de "estava chovendo ou não".
const RAIN_STATE_DOC = 'rainWatch';

function required(input, name) {
  if (!input || String(input).trim() === '') throw new Error(`Campo obrigatório: ${name}`);
  return String(input).trim();
}

function formatFinanceMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function buildFinanceOutboxPayload(ticket, outbox) {
  const payment = outbox?.payment || {};
  const financial = outbox?.financial || {};
  const label = String(payment.label || 'Lançamento');
  const baseUrl = process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || 'https://serv3.vercel.app';
  const params = new URLSearchParams({ view: 'finance', ticketId: ticket.id });
  const subject = `${ticket.id} - Pagamento - ${label}`;
  const bodyText = [
    `Segue o lançamento de pagamento referente à OS ${ticket.id}.`,
    '',
    `Assunto: ${ticket.subject || 'Não informado'}`,
    `Solicitante: ${ticket.requester || 'Não informado'}`,
    `Sede: ${ticket.sede || 'Não definida'}`,
    `Local: ${ticket.sector || 'Não informado'}`,
    `Fornecedor: ${payment.vendor || 'Não definido'}`,
  ].join('\n');

  return {
    ticketId: ticket.id,
    trackingToken: ticket.trackingToken || null,
    toEmail: Array.isArray(outbox?.recipients) ? outbox.recipients.join(', ') : '',
    trigger: 'EMAIL-FINANCEIRO-PAGAMENTO',
    subject,
    attachments: Array.isArray(payment.attachments) ? payment.attachments : [],
    variables: {
      requester: {
        name: String(ticket.requester || 'Solicitante'),
        email: String(ticket.requesterEmail || ''),
      },
      ticket: {
        id: ticket.id,
        subject: String(ticket.subject || ''),
        status: String(ticket.status || ''),
        region: String(ticket.region || ''),
        sede: String(ticket.sede || ''),
        sector: String(ticket.sector || ''),
        location: String(ticket.location || ''),
        macroService: String(ticket.macroServiceName || ''),
        service: String(ticket.serviceCatalogName || ''),
      },
      message: { sender: 'Financeiro', body: bodyText },
    },
    templateData: {
      title: subject,
      intro: `Lançamento de pagamento para a OS ${ticket.id}.`,
      ticketSubject: ticket.subject || '',
      status: ticket.status || '',
      bodyText,
      metricRows: [
        { label: 'Lançamento', value: label },
        { label: 'Valor bruto', value: formatFinanceMoney(financial.grossAmount) },
        { label: 'Imposto', value: formatFinanceMoney(financial.taxAmount) },
        { label: 'Valor a pagar', value: formatFinanceMoney(financial.netAmount) },
      ],
      ctaUrl: `${baseUrl}/?${params.toString()}`,
      ctaLabel: 'Abrir financeiro',
    },
  };
}

// Renderiza o aviso de NOVA OS ao gestor a partir do doc da outbox — mesmo conteúdo
// que antes saía direto no loop do inbound (agora entregue pela fila, com retry).
function buildManagerNotificationEmail(ticket) {
  const baseUrl = process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || 'https://serv3.vercel.app';
  const ctaUrl = ticket?.trackingToken
    ? `${baseUrl}/?tracking=${encodeURIComponent(ticket.trackingToken)}`
    : '';
  const template = buildTicketEmailTemplate({
    trigger: 'EMAIL-NOVA-OS-GESTOR',
    title: `Nova solicitação recebida (${ticket.id || 'OS'})`,
    intro: 'Uma nova solicitação de OS foi registrada por e-mail para sua estrutura.',
    ticketId: ticket.id || '-',
    status: ticket.status || 'Nova OS',
    ctaUrl: ctaUrl || null,
    ctaLabel: 'Acompanhar solicitação',
    bodyText: [
      `Assunto: ${ticket.subject || '-'}`,
      `Solicitante: ${ticket.requester || '-'} (${ticket.requesterEmail || '-'})`,
      `Sede: ${ticket.sede || '-'}`,
      `Região: ${ticket.region || '-'}`,
    ].join('\n'),
  });
  return { subject: `Nova OS recebida - ${ticket.id || 'Sem ID'}`, text: template.text, html: template.html };
}

/**
 * Entrega AVULSA (sem thread, sem CC de conversa) para tipos da outbox que são
 * comunicação INTERNA. Não pode passar pela máquina de thread do handleSend: lá o
 * e-mail herdaria a thread do solicitante e o CC da conversa — vazando a triagem
 * interna para o cliente.
 */
async function deliverStandaloneEmail({ toEmail, subject, text, html, ticketId, trackingToken }) {
  const result = await gmailSend({
    toEmail,
    subject,
    text,
    html,
    ticketId: ticketId || 'new-ticket',
    trackingToken: trackingToken || undefined,
    inReplyTo: undefined,
    references: [],
    threadId: undefined,
  });
  return { provider: 'gmail', messageId: result?.messageId || result?.id || null };
}

// parseTicketId, stripReplyForwardPrefixes, parseNewTicketSubjectCandidates e
// isLikelyThreadReply vivem em ./_lib/inboundSubject.js (parsing puro + testado).

function safeJsonParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
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

function normalizeResolvedTemplate(template) {
  if (!template || typeof template !== 'object') return null;
  return {
    ...template,
    subject: repairMojibake(template.subject),
    body: repairMojibake(template.body),
    recipients: repairMojibake(template.recipients || ''),
  };
}

// As caixas do próprio sistema nunca entram em cópia — sem isto, todo e-mail volta
// para a fila de entrada e vira OS nova.
function filterCopyRecipients(input, excluded = []) {
  return filterCopyRecipientsPure(input, [...getSystemMailboxEmails(), ...excluded]);
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
    '';
  return String(candidate || '').trim().toLowerCase() || null;
}

function getSystemMailboxEmails() {
  return [
    process.env.GMAIL_FROM_EMAIL,
    process.env.TICKET_NOTIFICATION_EMAIL,
  ]
    .map(value => String(value || '').trim().toLowerCase())
    .filter(Boolean);
}

// Gmail e o UNICO provedor de envio deste sistema.
function resolveConfiguredEmailProvider() {
  return 'gmail';
}

async function resolveFlowFallbackRecipients(db, trigger) {
  const normalizedTrigger = String(trigger || '').trim().toUpperCase();
  if (!normalizedTrigger.startsWith('EMAIL-DIRETORIA-')) return [];

  const normalizeLabel = value =>
    String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const users = await getCachedUsers(db);
  const userRecipients = users
    .filter(user => {
      const role = normalizeLabel(user.role);
      const status = normalizeLabel(user.status || 'ativo');
      const isDirectorRole = role === 'diretor' || role === 'director';
      const isActive = user.active !== false && (status === '' || status === 'ativo' || status === 'active');
      return isDirectorRole && isActive;
    })
    .map(user => firstEmail(user.email))
    .filter(Boolean);

  const templateKeys = ['EMAIL-DIRETORIA-SOLUCAO', 'EMAIL-DIRETORIA-APROVACAO'];
  const templateRecipientBuckets = await Promise.all(
    templateKeys.map(async key => {
      const template = await resolveEmailTemplate(db, key);
      return parseEmailList(template?.recipients || '');
    })
  );
  const templateRecipients = templateRecipientBuckets.flat();

  return [...new Set([...templateRecipients, ...userRecipients])];
}

function normalizeDirectorGreeting(body) {
  const text = String(body || '');
  if (!text.trim()) return 'Olá,';

  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const normalized = [];
  let greetingFound = false;

  for (const line of lines) {
    const trimmed = String(line || '').trim();
    if (/^Ol[áa]\b/i.test(trimmed)) {
      if (greetingFound) continue;
      normalized.push('Olá,');
      greetingFound = true;
      continue;
    }
    normalized.push(line);
  }

  const compacted = normalized.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  const withoutRepeatedGreeting = compacted.replace(/^(?:Ol[áa],?\s*){2,}/i, 'Olá,\n\n');
  if (greetingFound) return withoutRepeatedGreeting;
  return `Olá,\n\n${withoutRepeatedGreeting}`;
}




async function resolveRequesterThreadSubject(threadRef, thread, ticketId) {
  const originalSubject = repairMojibake(String(thread?.originalSubject || '').trim());
  if (originalSubject) return originalSubject;

  const storedSubject = repairMojibake(String(thread?.subject || '').trim());
  if (storedSubject && !isTicketConversationSubject(ticketId, storedSubject)) return storedSubject;

  try {
    const messagesSnap = await threadRef.collection('messages').where('direction', '==', 'inbound').limit(20).get();
    const inboundMessages = messagesSnap.docs
      .map(doc => doc.data() || {})
      .filter(message => String(message.subject || '').trim())
      .sort((a, b) => {
        const aTime = typeof a.createdAt?.toMillis === 'function' ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
        const bTime = typeof b.createdAt?.toMillis === 'function' ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
        return aTime - bTime;
      });
    const inboundSubject = inboundMessages.find(message => !isTicketConversationSubject(ticketId, message.subject))?.subject;
    if (inboundSubject) return repairMojibake(String(inboundSubject));
  } catch (error) {
    // Mantém o fallback abaixo, mas registra a falha de leitura do histórico.
    console.error('[mail] falha ao ler histórico para resolver o assunto da thread', error);
  }

  return storedSubject;
}



function readProviderErrorStatus(error) {
  const rawStatus = error?.response?.status ?? error?.status ?? error?.code ?? null;
  const parsed = Number(rawStatus);
  return Number.isFinite(parsed) ? parsed : null;
}

function isThreadReferenceMissingError(error) {
  const status = readProviderErrorStatus(error);
  const providerMessage = String(
    error?.response?.data?.error?.message || error?.message || ''
  ).toLowerCase();
  return status === 404 || providerMessage.includes('requested entity was not found');
}

function isGenericPolicyBlock(error) {
  const raw = String(
    error?.response?.data?.error?.message ||
      error?.response?.body ||
      error?.message ||
      ''
  ).toLowerCase();
  return raw.includes('message rejected') || raw.includes('answer/69585') || raw.includes('message blocked');
}

async function sendWithGmailThreadFallback({
  toEmail,
  ccEmail,
  subject,
  text,
  html,
  inReplyTo,
  references,
  ticketId,
  trackingToken,
  threadId,
  attachments,
}) {
  const normalizedReferences = Array.isArray(references) ? references : [];
  const hasThreadContext = Boolean(threadId || inReplyTo || normalizedReferences.length > 0);

  try {
    const result = await gmailSend({
      toEmail,
      ccEmail,
      subject,
      text,
      html,
      inReplyTo,
      references: normalizedReferences,
      ticketId,
      trackingToken,
      threadId,
      attachments,
    });

    return {
      result,
      inReplyTo: inReplyTo || null,
      references: normalizedReferences,
      recoveredThread: false,
    };
  } catch (error) {
    if (!hasThreadContext || !isThreadReferenceMissingError(error)) {
      throw error;
    }

    const retryResult = await gmailSend({
      toEmail,
      ccEmail,
      subject,
      text,
      html,
      ticketId,
      trackingToken,
      attachments,
    });

    return {
      result: retryResult,
      inReplyTo: null,
      references: [],
      recoveredThread: true,
    };
  }
}



async function resolveTicketIdByThreadReferences(db, inReplyTo, referencesRaw) {
  const candidates = parseMessageIdCandidates(inReplyTo, referencesRaw);
  if (candidates.length === 0) return null;

  for (const messageId of candidates) {
    const byLastMessage = await db.collection('emailThreads').where('lastMessageId', '==', messageId).limit(1).get();
    if (!byLastMessage.empty) {
      const ticketId = String(byLastMessage.docs[0].data()?.ticketId || byLastMessage.docs[0].id || '').trim();
      if (ticketId) return ticketId;
    }

    const byReferences = await db.collection('emailThreads').where('references', 'array-contains', messageId).limit(1).get();
    if (!byReferences.empty) {
      const ticketId = String(byReferences.docs[0].data()?.ticketId || byReferences.docs[0].id || '').trim();
      if (ticketId) return ticketId;
    }
  }

  return null;
}

// Casa a mensagem com uma OS existente pelo threadId do Gmail. Toda a conversa
// compartilha o mesmo threadId, então isto é INDEPENDENTE DE ORDEM: se a resposta
// for processada antes do original (ou vice-versa), a 2ª mensagem acha o thread da
// 1ª e cai na mesma OS, em vez de criar duplicata. Cobre o buraco do match por
// References, que falha quando o original (a raiz da thread) chega sem In-Reply-To.
async function resolveTicketIdByGmailThread(db, threadId) {
  if (!threadId) return null;
  const snap = await db
    .collection('emailThreads')
    .where('gmailThreadId', '==', String(threadId))
    .limit(1)
    .get();
  if (snap.empty) return null;
  return String(snap.docs[0].data()?.ticketId || '').trim() || null;
}

// Fallback para respostas que perderam o vínculo de thread (sem OS-id no assunto,
// sem In-Reply-To/References que casem, sem gmailThreadId): casa pela dupla
// remetente + assunto normalizado numa OS AINDA ABERTA. Sem isto, o assunto
// "Re: [SEDE] ..." (o prefixo Re: é removido no parse) casa como OS nova e o
// createTicketFromInbound abre uma "Nova OS" DUPLICADA quando o cliente responde
// uma OS em andamento — o bug relatado. Com o match, a resposta entra na OS
// original e o status é preservado.
async function resolveTicketIdByRequesterSubject(db, fromEmail, subject) {
  const email = firstEmail(fromEmail);
  if (!email) return null;
  const normalizedSubject = normalizeKey(stripReplyForwardPrefixes(subject || ''));
  if (!normalizedSubject) return null;

  const snap = await db
    .collection('tickets')
    .where('requesterEmail', '==', email)
    .limit(25)
    .get();
  if (snap.empty) return null;

  let best = null;
  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (!isTicketOpen(data.status)) continue;
    const docSubject = normalizeKey(stripReplyForwardPrefixes(String(data.subject || '')));
    if (!docSubject || docSubject !== normalizedSubject) continue;
    const when = toDateOrNull(data.time) || toDateOrNull(data.createdAt) || new Date(0);
    if (!best || when > best.when) best = { id: doc.id, when };
  }
  return best?.id || null;
}

function buildInboundHistoryEntry(message, options = {}) {
  const sender = displayNameFromEmail(message.from) || options.sender || 'Solicitante';
  const text = extractInboundMessageBody(message.text, message.html) || 'Resposta recebida por e-mail.';
  const attachments = Array.isArray(message.attachments)
    ? message.attachments.filter(item => item?.path || item?.driveFileId || item?.url)
    : [];
  return {
    id: buildInboundHistoryId(message.messageId || message.id, sender),
    type: options.type || 'customer',
    sender,
    time: message.internalDate || new Date(),
    text,
    visibility: options.visibility || 'public',
    ...(attachments.length > 0 ? { attachments } : {}),
  };
}

function shouldIgnoreInboundMessage(message) {
  const fromEmail = firstEmail(message.from);
  const labelIds = Array.isArray(message.labelIds) ? message.labelIds.map(value => String(value || '').toUpperCase()) : [];
  const autoSubmitted = String(message.autoSubmitted || '').trim().toLowerCase();
  const precedence = String(message.precedence || '').trim().toLowerCase();
  const systemEmails = getSystemMailboxEmails();

  if (labelIds.includes('SENT') || labelIds.includes('DRAFT')) return true;
  if (fromEmail && systemEmails.includes(fromEmail)) return true;
  if (autoSubmitted && autoSubmitted !== 'no') return true;
  if (['bulk', 'list', 'junk', 'auto_reply'].includes(precedence)) return true;

  return false;
}

async function appendInboundMessageToTicketHistory(db, ticketId, message) {
  const ticketRef = db.collection('tickets').doc(ticketId);
  const ticketSnap = await ticketRef.get();
  if (!ticketSnap.exists) return;

  const ticket = ticketSnap.data() || {};
  const fromEmail = firstEmail(message.from);
  const requesterEmail = firstEmail(ticket.requesterEmail);

  let type = 'customer';
  let visibility = 'public';
  let sender = ticket.requester || 'Solicitante';

  if (!fromEmail || !requesterEmail || normalizeKey(fromEmail) !== normalizeKey(requesterEmail)) {
    type = 'internal';
    visibility = 'internal';
    sender = displayNameFromEmail(message.from) || 'Colaborador';

    if (fromEmail) {
      const userSnap = await db.collection('users').where('email', '==', fromEmail).limit(1).get();
      if (!userSnap.empty) {
        const user = userSnap.docs[0].data() || {};
        sender = String(user.name || sender);
        const role = String(user.role || '').trim();
        if (role !== 'Admin' && role !== 'Diretor') {
          sender = String(user.name || displayNameFromEmail(message.from) || 'Colaborador');
        }
      }
    }
  }

  const nextEntry = buildInboundHistoryEntry(message, {
    sender,
    type,
    visibility,
  });

  // Atômico (dedup por id, preserva entradas concorrentes — ex.: edição no painel).
  await appendTicketHistory(db, ticketRef, [nextEntry]);

  // EVENTO ESTRUTURADO. A atenção derivada não lê o histórico inteiro para descobrir
  // "chegou mensagem e ninguém respondeu" — ela lê estes dois carimbos. Sem eles, cada
  // cálculo teria de varrer a subcoleção de uma OS que pode ter centenas de entradas.
  const carimbo = {};
  if (type === 'customer') {
    carimbo.lastInboundAt = nextEntry.time;
    carimbo.lastInboundMessageId = nextEntry.id;
  } else {
    carimbo.lastOutboundAt = nextEntry.time;
  }
  await ticketRef.set(carimbo, { merge: true });

  await registrarAutorizacao(db, ticketRef, ticketId, message, nextEntry);
  await recomputeOperationalAttention(db, ticketId);
}

/**
 * Lista de quem pode autorizar por e-mail. Vazia por padrão: o recurso nasce
 * DESLIGADO e só liga quando alguém disser quem manda.
 */
async function lerAutorizadores(db) {
  const snap = await db.collection('settings').doc('authorizers').collection('items').doc('default').get();
  const lista = snap.exists ? snap.data()?.emails : null;
  return Array.isArray(lista) ? lista : [];
}

/**
 * Marca na OS que um superior autorizou por e-mail.
 *
 * REGISTRA, NÃO DECIDE — de propósito. A etapa da OS não anda sozinha:
 *  - "ainda não está autorizado" contém a palavra, e autorização errada move dinheiro;
 *  - "autorizado" numa thread com três orçamentos não diz QUAL;
 *  - `From` é falsificável (o Gmail valida SPF/DKIM na entrega, mas quem manda um
 *    e-mail não é necessariamente quem pode aprovar um gasto).
 *
 * Quem transforma isto em ação é a gestora, olhando a frase que a pessoa escreveu.
 */
async function registrarAutorizacao(db, ticketRef, ticketId, message, entradaOrigem) {
  try {
    const autorizadores = await lerAutorizadores(db);
    if (autorizadores.length === 0) return;

    // Lê o texto JÁ limpo de citação. Sem isso, toda resposta da thread
    // redetectaria a mesma autorização, para sempre.
    const detectada = detectAuthorization(
      { from: message.from, text: entradaOrigem?.text || '' },
      autorizadores
    );
    if (!detectada) return;

    const quem = displayNameFromEmail(message.from) || detectada.email;
    await appendTicketHistory(db, ticketRef, [{
      id: `auth-${entradaOrigem.id}`,
      type: 'system',
      sender: 'Sistema',
      time: message.internalDate || new Date(),
      text: `✅ Autorização por e-mail de ${quem} (${detectada.email}): “${detectada.quote}” — confira o que foi autorizado antes de seguir.`,
      visibility: 'internal',
    }]);

    await ticketRef.set({
      lastAuthorization: {
        email: detectada.email,
        name: quem,
        quote: detectada.quote,
        messageId: message.messageId || null,
        at: message.internalDate || new Date(),
      },
      updatedAt: new Date(),
    }, { merge: true });
  } catch (error) {
    // Detecção é um EXTRA: se falhar, a mensagem já entrou na OS e o e-mail está lá
    // para ser lido. Derrubar o inbound por causa disto seria trocar o certo pelo
    // duvidoso.
    console.error('[mail] Falha ao registrar autorizacao', ticketId, error);
  }
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

// Comparação em tempo constante para evitar timing oracle na verificação de segredos.
function matchesAnySecret(provided, secrets) {
  return secrets.some(secret => secretsMatch(provided, secret));
}

async function authorizeEmailOutboxDelivery(req) {
  const authHeader = String(req.headers.authorization || '');
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && secretsMatch(bearer, cronSecret)) {
    return { automated: true, user: null };
  }
  return {
    automated: false,
    user: await requireUserWithRoles(req, ['Admin', 'Gestor']),
  };
}

async function authorizeEmailOutboxWorker(req) {
  const authHeader = String(req.headers.authorization || '');
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && secretsMatch(bearer, cronSecret)) return;
  await requireUserWithRoles(req, ['Admin']);
}

// `allowedRoles` só vale para a via "usuário logado pelo painel"; a via do
// cron/Pub-Sub continua sendo o segredo compartilhado. Default Admin: só o
// gmail-sync (que o InboxView dispara sozinho) abre para Gestor — o gmail-watch
// reconfigura o watch do Gmail e fica restrito.
async function authorizeGmailAutomation(req, allowedRoles = ['Admin']) {
  const watchSecret = process.env.GMAIL_PUSH_SECRET;
  const syncSecret = process.env.GMAIL_SYNC_SECRET;
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const provided = req.query?.secret || req.headers['x-sync-secret'] || req.headers['x-gmail-push-secret'] || bearer;
  const validSecrets = [watchSecret, syncSecret, cronSecret].filter(Boolean);

  if (provided && matchesAnySecret(provided, validSecrets)) {
    return;
  }

  let adminError = null;
  try {
    await requireUserWithRoles(req, allowedRoles);
    return;
  } catch (error) {
    adminError = error;
    // Segue para validação por segredo abaixo.
  }

  if (validSecrets.length === 0) {
    await requireUserWithRoles(req, allowedRoles);
    return;
  }

  // Chamada de GENTE pelo painel (bearer que não é segredo, com User-Agent de
  // navegador): o motivo real é o do requireUserWithRoles — "Permissão
  // insuficiente" (não é Admin), "Usuário inativo", "sem cadastro no diretório".
  // Mascarar isso como "Segredo inválido" mandava o usuário caçar um segredo de
  // cron que não tem nada a ver com o problema dele.
  const looksLikeBrowser = /mozilla|chrome|safari|edge/i.test(String(req.headers['user-agent'] || ''));
  if (adminError && bearer && looksLikeBrowser) {
    throw adminError;
  }

  if (!provided || !matchesAnySecret(provided, validSecrets)) {
    // Detalha o chamador (sem expor o segredo) para diagnosticar de onde vem o
    // segredo errado: bearer = cron do GitHub; x-gmail-push-secret = push do
    // Gmail/Pub-Sub; query.secret = chamada manual; user-agent ajuda a confirmar.
    const via = [
      req.query?.secret ? 'query.secret' : null,
      req.headers['x-sync-secret'] ? 'x-sync-secret' : null,
      req.headers['x-gmail-push-secret'] ? 'x-gmail-push-secret' : null,
      bearer ? 'bearer' : null,
    ].filter(Boolean).join(',') || 'nenhum';
    const ua = String(req.headers['user-agent'] || '?').slice(0, 80);
    throw new Error(`Segredo inválido (via: ${via}; ua: ${ua}).`);
  }
}

// Avisa na OS (histórico + notificação) quando um e-mail enviado foi
// rejeitado/bloqueado. Resolve a OS pelo X-OS-Ticket-ID embutido no bounce
// (header que setamos nos envios), pelo OS-xxxx do corpo, ou pela thread.
async function handleBounceNotice(db, message) {
  const bounce = detectBounce(message);
  if (!bounce) return false;

  const body = `${message.text || ''}\n${message.html || ''}`;
  const ticketId =
    (body.match(/X-OS-Ticket-ID:\s*(OS-\d+)/i) || [])[1]?.toUpperCase() ||
    parseTicketId(message.subject) ||
    parseTicketId(body) ||
    (await resolveTicketIdByThreadReferences(db, message.inReplyTo, message.references));

  // O aviso PRECISA dizer para quem não chegou: sem o endereço, ninguém consegue
  // agir (foi o que aconteceu com 261 bounces gravados sem destinatario). Quando o
  // NDR não entrega o endereço, cai no texto genérico em vez de mentir.
  const paraQuem = bounce.recipients.length ? ` para ${bounce.recipients.join(', ')}` : '';
  const noteText = `⚠️ E-mail bloqueado: a resposta enviada por e-mail${paraQuem} foi rejeitada/bloqueada pelo provedor de destino e pode não ter chegado ao destinatário.`;
  const dedupeKey = buildInboundMessageLockId(message.messageId, body) || randomUUID().replace(/-/g, '');
  // Um único aviso por OS (por dia): vários bounces do mesmo envio — ou um NDR
  // por destinatário — colapsam num só "e-mail bloqueado", sem encher a OS/sino.
  const dayBucket = new Date().toISOString().slice(0, 10);
  const consolidationKey = ticketId ? `${ticketId}-${dayBucket}` : dedupeKey;

  if (ticketId) {
    const ticketRef = db.collection('tickets').doc(ticketId);
    const entryId = `bounce-${consolidationKey}`;
    await appendTicketHistory(db, ticketRef, [{
      id: entryId,
      type: 'system',
      sender: 'Sistema',
      time: message.internalDate || new Date(),
      text: noteText,
      visibility: 'internal',
    }]);
  }

  // Notificação consolidada por OS (idempotente): um só aviso no sino por OS.
  await db.collection('notifications').doc(`bounce-${consolidationKey}`).set({
    type: 'email-bounce',
    ticketId: ticketId || null,
    title: ticketId ? `E-mail bloqueado — ${ticketId}${paraQuem}` : `E-mail bloqueado${paraQuem}`,
    body: noteText,
    audienceRoles: ['Admin', 'Gestor'],
    read: false,
    ttlAt: notificationTtlAt(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }, { merge: true });

  await logEmailEvent({
    type: 'bounce',
    status: 'failed',
    provider: 'gmail',
    ticketId: ticketId || null,
    fromEmail: bounce.recipients[0] || null,
    subject: message.subject || '',
    messageId: message.messageId || message.id || null,
    error: `${bounce.recipients.join(', ')} — ${bounce.reason}`.slice(0, 250),
  });
  return true;
}

async function processGmailInboundMessage(db, msg, source) {
  // Trava o tamanho do corpo ANTES de qualquer persistência: e-mail com corpo
  // gigante (thread reencaminhada N vezes) estouraria o teto de 1 MiB/doc do
  // Firestore e derrubaria o processamento de TODAS as mensagens do lote.
  msg = { ...msg, text: truncateInboundBody(msg?.text), html: truncateInboundBody(msg?.html) };

  // Bounce/NDR do provedor (ex.: "Message blocked"): avisa na OS em vez de
  // descartar como mensagem automática (o ignore abaixo o jogaria fora).
  if (await handleBounceNotice(db, msg)) return false;

  if (shouldIgnoreInboundMessage(msg)) {
    await logEmailEvent({
      type: 'inbound',
      status: 'skipped',
      provider: 'gmail',
      ticketId: msg.ticketId || parseTicketId(msg.subject) || parseTicketId(msg.text) || null,
      fromEmail: firstEmail(msg.from),
      subject: msg.subject || '',
      messageId: msg.messageId || msg.id || null,
      error: 'Mensagem automática ou enviada pelo próprio sistema ignorada.',
    });
    return false;
  }

  const messageId = msg.messageId || msg.id || null;
  const fromEmail = firstEmail(msg.from);
  const lock = await acquireInboundMessageLock(db, {
    messageId,
    fallbackKey: `${msg.threadId || 'gmail'}:${msg.subject || ''}:${fromEmail || ''}`,
    provider: 'gmail',
    source,
    fromEmail,
    subject: msg.subject || '',
  });

  if (!lock.acquired) {
    return false;
  }

  try {
    const explicitTicketId = msg.ticketId || parseTicketId(msg.subject) || parseTicketId(msg.text);
    let referencedTicketId = explicitTicketId
      ? null
      : (await resolveTicketIdByThreadReferences(db, msg.inReplyTo, msg.references))
        || (await resolveTicketIdByGmailThread(db, msg.threadId));
    // Resposta cujo vínculo de thread falhou: casa por remetente+assunto numa OS
    // aberta antes de cogitar abrir OS nova — senão viraria "Nova OS" duplicada.
    if (!explicitTicketId && !referencedTicketId && isLikelyThreadReply(msg)) {
      referencedTicketId = await resolveTicketIdByRequesterSubject(db, fromEmail, msg.subject);
    }
    const createdTicket =
      explicitTicketId || referencedTicketId ? null : await createTicketFromInbound(db, msg);
    const ticketId = explicitTicketId || referencedTicketId || createdTicket?.id;
    if (!ticketId) {
      // Antes isto era um descarte MUDO: e-mail com [SEDE] desconhecida (ou sem
      // colchete) sumia sem log nenhum e ninguém percebia a OS perdida. Agora
      // aparece na tela de Saúde de E-mail com o motivo.
      await logEmailEvent({
        type: 'inbound',
        status: 'skipped',
        provider: 'gmail',
        fromEmail: fromEmail || null,
        subject: msg.subject || '',
        messageId,
        error: 'Nenhuma OS: assunto sem [SEDE] reconhecida e sem vínculo com OS existente.',
      });
      // ...e também numa coleção PRÓPRIA. Pescar isto de dentro de emailEvents não
      // funciona: são 8,7 mil eventos, dominados por `sync`, e qualquer consulta com
      // teto perde justamente as mensagens mais antigas — as que estão esquecidas há
      // mais tempo. Aqui são poucos documentos, com TTL, e a tela lê todos.
      const dropId = buildInboundMessageLockId(messageId, msg.subject || '') || randomUUID().replace(/-/g, '');
      // Guarda os anexos ANTES de a OS existir. Sem isto a mensagem entra na fila
      // mutilada, e "criar OS" a partir dela nasceria sem as fotos do problema.
      const anexosGuardados = await uploadInboundAttachments(dropId, msg.attachments || [], 'dropped');
      await db
        .collection('inboundDropped')
        .doc(dropId)
        .set(
          {
            fromEmail: fromEmail || null,
            ccEmail: msg.cc || null,
            subject: msg.subject || '',
            // O CORPO fica guardado. Sem ele, a fila mostraria que uma mensagem se
            // perdeu e não daria como recuperá-la: a OS criada depois nasceria vazia,
            // e a pessoa teria que ir caçar o e-mail no Gmail.
            text: truncateInboundBody(extractInboundMessageBody(msg.text, msg.html) || ''),
            messageId: messageId || null,
            threadId: msg.threadId || null,
            // Anexos NÃO são preservados: eles só sobem quando há uma OS de destino.
            // Quem resolver a fila precisa saber disso.
            attachmentCount: Array.isArray(msg.attachments) ? msg.attachments.length : 0,
            attachments: anexosGuardados,
            reason: 'sem-sede-e-sem-vinculo',
            status: 'pendente',
            receivedAt: msg.internalDate || new Date(),
            createdAt: new Date(),
            ttlAt: notificationTtlAt(),
          },
          { merge: true }
        );
      await finalizeInboundMessageLock(lock.ref);
      return false;
    }
    const inboundAttachments = createdTicket
      ? (Array.isArray(createdTicket.attachments) ? createdTicket.attachments : [])
      : await uploadInboundAttachments(ticketId, msg.attachments || []);

    let threadRef = db.collection('emailThreads').doc(ticketId);
    if (msg.threadId) {
      const byThreadSnap = await db
        .collection('emailThreads')
        .where('ticketId', '==', ticketId)
        .limit(20)
        .get();
      const matchedDoc = byThreadSnap.docs.find(doc => String(doc.data()?.gmailThreadId || '') === String(msg.threadId));
      if (matchedDoc) {
        threadRef = matchedDoc.ref;
      }
    }
    const now = msg.internalDate || new Date();
    const toEmail = firstEmail(msg.to);
    const ccRecipients = filterCopyRecipients(mergeEmailLists(msg.to, msg.cc), [fromEmail]);
    const references = String(msg.references || '')
      .split(/\s+/)
      .map(value => value.trim())
      .filter(Boolean)
      .slice(-20);
    const mergedReferences = [...new Set([...references, msg.inReplyTo, messageId].filter(Boolean))].slice(-20);
    const participants = [fromEmail, toEmail, ...ccRecipients].filter(Boolean);

    await threadRef.set(
      {
        ticketId,
        ...(createdTicket && messageId ? { rootMessageId: messageId } : {}),
        ...(createdTicket && msg.subject ? { originalSubject: repairMojibake(msg.subject), subject: repairMojibake(msg.subject) } : {}),
        lastMessageId: messageId,
        lastDirection: 'inbound',
        lastInboundAt: now,
        updatedAt: now,
        references: mergedReferences,
        gmailThreadId: msg.threadId || null,
        ...(ccRecipients.length > 0 ? { ccEmail: ccRecipients.join(', ') } : {}),
        ...(participants.length > 0 ? { participants: FieldValue.arrayUnion(...participants) } : {}),
      },
      { merge: true }
    );

    if (messageId) {
      const duplicateSnap = await threadRef
        .collection('messages')
        .where('messageId', '==', messageId)
        .limit(1)
        .get();
      if (!duplicateSnap.empty) {
        await finalizeInboundMessageLock(lock.ref);
        return false;
      }
    }

    await threadRef.collection('messages').add({
      direction: 'inbound',
      fromEmail: fromEmail || null,
      toEmail: toEmail || null,
      ccEmail: ccRecipients.join(', ') || null,
      subject: msg.subject || '',
      text: msg.text || null,
      html: msg.html || null,
      messageId,
      inReplyTo: msg.inReplyTo || null,
      references: mergedReferences,
      provider: 'gmail',
      attachments: inboundAttachments,
      createdAt: now,
    });

    await db.collection('ticketInbound').add({
      ticketId,
      fromEmail: fromEmail || null,
      ccEmail: ccRecipients.join(', ') || null,
      subject: msg.subject || '',
      text: msg.text || null,
      html: msg.html || null,
      messageId,
      attachments: inboundAttachments,
      createdAt: now,
      source,
    });

    await finalizeInboundMessageLock(lock.ref, ticketId);

    if (!createdTicket) {
      await appendInboundMessageToTicketHistory(db, ticketId, {
        ...msg,
        attachments: inboundAttachments,
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
      messageId,
    });

    return true;
  } catch (error) {
    await releaseInboundMessageLock(lock.ref);
    throw error;
  }
}

async function processGmailInboundMessageIds(db, messageIds, source) {
  let processed = 0;
  const failedIds = [];

  for (const messageId of messageIds) {
    if (!messageId) continue;
    try {
      const msg = await gmailGetMessage(messageId);
      const ok = await processGmailInboundMessage(db, msg, source);
      if (ok) processed += 1;
    } catch (error) {
      // Uma única mensagem-veneno (corpo gigante que estoura o teto de 1 MiB/doc,
      // parse quebrado) NÃO pode abortar o lote e travar todo o inbound em loop de
      // reentrega. Loga (visível na saúde de e-mail), marca como falha e segue.
      // O sync usa `failedIds` para NÃO marcar a mensagem como vista → falha
      // transitória (429/hiccup do Firestore) é retentada no próximo ciclo.
      failedIds.push(messageId);
      console.error('[mail] falha ao processar mensagem inbound', messageId, error);
      try {
        await logEmailEvent({
          type: 'inbound',
          status: 'error',
          provider: 'gmail',
          messageId,
          error: error?.message || 'Falha ao processar mensagem inbound.',
        });
      } catch {
        // logEmailEvent é best-effort; nunca deve mascarar o loop.
      }
    }
  }

  return { processed, failedIds };
}

async function canSendPublicCreationEmail(db, ticketId, toEmail, internalCopy) {
  if (!ticketId) return false;

  const ticketSnap = await db.collection('tickets').doc(ticketId).get();
  if (!ticketSnap.exists) return false;

  const ticket = ticketSnap.data() || {};

  // Only allow within 10 minutes of ticket creation to prevent replay abuse.
  const createdAt =
    ticket.createdAt instanceof Date
      ? ticket.createdAt
      : typeof ticket.createdAt?.toDate === 'function'
        ? ticket.createdAt.toDate()
        : null;
  if (!createdAt || Date.now() - createdAt.getTime() > 10 * 60 * 1000) return false;

  const requesterEmail = String(ticket.requesterEmail || '').trim().toLowerCase();
  const internalEmail = getInternalNotificationEmail();
  const normalizedRecipient = String(toEmail || '').trim().toLowerCase();

  if (internalCopy && internalEmail) return true;
  return Boolean(requesterEmail && normalizedRecipient && requesterEmail === normalizedRecipient);
}

async function buildNextTicketId(db) {
  return reserveNextTicketId(db);
}
function buildInboundMessageLockId(messageId, fallbackKey = '') {
  const base = String(messageId || fallbackKey || '')
    .trim()
    .toLowerCase();
  if (!base) return null;
  return createHash('sha256').update(base).digest('hex');
}
function isAlreadyExistsError(error) {
  return (
    error?.code === 6 ||
    error?.code === 'already-exists' ||
    /already exists/i.test(String(error?.message || ''))
  );
}
async function acquireInboundMessageLock(db, options) {
  const lockId = buildInboundMessageLockId(options.messageId, options.fallbackKey);
  if (!lockId) {
    return { acquired: true, ref: null, data: null };
  }
  const ref = db.collection('inboundMessageLocks').doc(lockId);
  try {
    await ref.create({
      messageId: options.messageId || null,
      fallbackKey: options.fallbackKey || null,
      provider: options.provider || null,
      source: options.source || null,
      fromEmail: options.fromEmail || null,
      subject: options.subject || '',
      status: 'processing',
      createdAt: new Date(),
    });
    return { acquired: true, ref, data: null };
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error;
    const snap = await ref.get();
    return { acquired: false, ref, data: snap.exists ? snap.data() : null };
  }
}
async function finalizeInboundMessageLock(ref, ticketId = null) {
  if (!ref) return;
  // Marca como processado em vez de apagar: reentregas da MESMA mensagem
  // (push seguido de sync) reencontram este lock, recaem em acquired:false e
  // são deduplicadas — antes o delete deixava recriar o lock e criava OS dupla.
  await ref
    .set({ status: 'done', ticketId: ticketId || null, completedAt: new Date() }, { merge: true })
    .catch(() => undefined);
}
async function releaseInboundMessageLock(ref) {
  if (!ref) return;
  try {
    await ref.delete();
  } catch (error) {
    // Não bloqueia (permite novo processamento), mas registra: falha recorrente
    // aqui pode indicar problema no lock de deduplicação.
    console.error('[mail] falha ao liberar lock de mensagem inbound', error);
  }
}
// Os apelidos de sede e o matcher do [SEDE] vivem em ./_lib/siteMatch.js
// (lógica pura + testada — foi a origem de vários bugs de inbound).
async function resolveSiteContext(db, siteCode) {
  // Cacheado (TTL ~60s): roda por e-mail de entrada (e por-doc no reprocess).
  const [sites, regions] = await Promise.all([
    getCachedSites(db),
    getCachedRegions(db),
  ]);
  const site = matchSiteCode(siteCode, sites);
  const region = site ? regions.find(item => item.id === site.regionId) || null : null;
  return { site, region };
}

function isActiveUser(user) {
  const status = normalizeKey(user?.status || 'ativo');
  return user?.active !== false && (status === '' || status === 'ativo' || status === 'active');
}

function isGestorRole(role) {
  const normalized = normalizeKey(role);
  return normalized === 'gestor';
}

async function notifyScopedManagersNewInboundTicket(db, ticket, message) {
  const siteId = String(ticket?.siteId || '').trim();
  const regionId = String(ticket?.regionId || '').trim();
  if (!siteId && !regionId) return;

  const copiedRecipients = new Set(
    mergeEmailLists(message?.to, message?.cc)
      .map(value => String(value || '').trim().toLowerCase())
      .filter(Boolean)
  );

  const users = await getCachedUsers(db);
  const gestores = users
    .filter(user => isGestorRole(user.role))
    .filter(user => isActiveUser(user))
    .filter(user => {
      const userSiteIds = Array.isArray(user.siteIds) ? user.siteIds.map(value => String(value || '').trim()).filter(Boolean) : [];
      const userRegionIds = Array.isArray(user.regionIds) ? user.regionIds.map(value => String(value || '').trim()).filter(Boolean) : [];
      const matchesSite = siteId && userSiteIds.includes(siteId);
      const matchesRegion = regionId && userRegionIds.includes(regionId);
      return Boolean(matchesSite || matchesRegion);
    })
    .filter(user => {
      const email = firstEmail(user.email);
      if (!email) return false;
      return !copiedRecipients.has(email);
    });

  const ticketId = String(ticket?.id || '').trim();
  if (gestores.length === 0 || !ticketId) return;

  // ENFILEIRA (não envia direto): antes eram N envios SÍNCRONOS no caminho do
  // inbound — uma rajada de OS batia no rate limit do Gmail e o catch engolia a
  // falha, então o gestor simplesmente não era avisado e ninguém percebia. Agora
  // cada aviso é um item da outbox, com retry/backoff e dead-letter alertado; o
  // worker drena com throttle. A chave é determinística por (OS, gestor) e usamos
  // create(): reprocessar a mesma mensagem inbound não duplica o aviso.
  const now = new Date();
  await Promise.all(gestores.map(async gestor => {
    const toEmail = firstEmail(gestor.email);
    if (!toEmail) return;
    const outboxKey = `mgrnotify-${createHash('sha256').update(toEmail.toLowerCase()).digest('hex').slice(0, 16)}`;
    try {
      await db.collection('emailOutbox').doc(`${ticketId}__${outboxKey}`).create({
        id: outboxKey,
        commandKey: outboxKey,
        type: EMAIL_OUTBOX_TYPES.MANAGER_NEW_TICKET,
        ticketId,
        trigger: 'EMAIL-NOVA-OS-GESTOR',
        recipients: [toEmail],
        status: 'pending',
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      });
    } catch (error) {
      // Já enfileirado (reprocessamento da mesma mensagem) — não duplica o aviso.
      if (isAlreadyExistsError(error)) return;
      console.error('[mail] falha ao enfileirar aviso de nova OS ao gestor', error);
    }
  }));
}

const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024; // 10 MB per file

// Teto por campo de corpo de e-mail persistido (~100 KB). Firestore limita cada
// doc a 1 MiB; uma thread reencaminhada N vezes estouraria o limite e derrubaria
// a gravação da mensagem/OS. Truncar mantém o inbound vivo e o doc da OS enxuto.
const MAX_INBOUND_BODY_CHARS = 100_000;
function truncateInboundBody(value) {
  const input = typeof value === 'string' ? value : value == null ? '' : String(value);
  if (input.length <= MAX_INBOUND_BODY_CHARS) return input;
  return `${input.slice(0, MAX_INBOUND_BODY_CHARS)}\n\n[…mensagem truncada pelo sistema…]`;
}

/**
 * Sobe os anexos de um e-mail que entrou.
 *
 * `escopo` existe porque nem toda mensagem tem OS na hora em que chega: a que não
 * casa com nenhuma vai para a fila de não-associados, e até hoje os anexos dela eram
 * simplesmente PERDIDOS — avisar "2 anexos não preservados" é honesto, mas não é
 * preservar. Guardados sob `dropped/`, eles são copiados para a OS quando alguém
 * resolve a fila.
 */
async function uploadInboundAttachments(ticketId, attachments, escopo = 'inbound') {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];

  const filtered = attachments.slice(0, MAX_ATTACHMENTS);

  const bucket = getStorage().bucket();
  const uploadedAt = new Date();
  const results = [];

  for (let index = 0; index < filtered.length; index += 1) {
    const attachment = filtered[index];
    if (!attachment?.buffer) continue;

    const fileSize = Number(attachment.size || attachment.buffer.length || 0);
    if (fileSize > MAX_ATTACHMENT_SIZE) continue;

    // Allow-list de MIME: anexos não permitidos (SVG/HTML/executáveis) são
    // ignorados sem interromper o processamento do e-mail inbound.
    if (!isAllowedAttachmentMime(attachment.mimeType)) continue;
    if (!isAttachmentContentCompatible(attachment.buffer, attachment.mimeType)) continue;
    const contentType = normalizeMimeType(attachment.mimeType);

    const filename = slugFilename(attachment.filename || `anexo-${index + 1}`);
    const path =
      escopo === 'dropped'
        ? `attachments/dropped/${ticketId}/${Date.now()}-${index + 1}-${filename}`
        : `attachments/tickets/inbound/${ticketId}/${Date.now()}-${index + 1}-${filename}`;
    const file = bucket.file(path);

    await file.save(attachment.buffer, {
      resumable: false,
      contentType,
      metadata: {
        contentType,
      },
    });

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

/**
 * Move os anexos guardados na fila para dentro da OS.
 *
 * COPIA, não referencia: o proxy de anexos só libera caminhos em
 * `attachments/tickets/.../<ticketId>/...` — e essa checagem existe para impedir que
 * uma OS sirva arquivo de outra. Apontar para `dropped/` faria o anexo aparecer na
 * tela e dar 403 no clique.
 */
async function copiarAnexosDaFila(dropId, ticketId, guardados) {
  if (!Array.isArray(guardados) || guardados.length === 0) return [];
  const bucket = getStorage().bucket();
  const copiados = [];

  for (const item of guardados) {
    try {
      const origem = String(item?.path || '');
      if (!origem.startsWith('attachments/dropped/')) continue;
      const nome = origem.split('/').pop();
      const destino = `attachments/tickets/inbound/${ticketId}/${nome}`;
      await bucket.file(origem).copy(bucket.file(destino));
      copiados.push({ ...item, id: randomUUID(), path: destino, url: '' });
    } catch (error) {
      // Um anexo que falha não pode impedir a OS de nascer: o e-mail original
      // continua no Gmail, e perder a OS inteira seria pior.
      console.error('[fila] falha ao copiar anexo', dropId, item?.path, error);
    }
  }
  return copiados;
}

/**
 * Primeiro candidato de "[SEDE] assunto" que casa com uma sede REAL do catálogo.
 *
 * A validação é o que separa `[BS]` de `[GitHub]`/`[Action Required]`: o padrão de
 * colchete casa com qualquer notificação, e sem o catálogo o sistema criaria OS-lixo
 * a partir delas. Por isso percorre os candidatos em ordem de confiança em vez de
 * confiar no primeiro colchete que encontrar.
 */
async function resolveSiteFromSubject(db, subject) {
  for (const candidate of parseNewTicketSubjectCandidates(subject)) {
    const { site, region } = await resolveSiteContext(db, candidate.siteCode);
    if (site) return { site, region, parsedSubject: candidate };
  }
  return null;
}

async function createTicketFromInbound(db, message) {
  // Checa antes de consumir um número de OS, para não deixar buracos na sequência.
  const resolved = await resolveSiteFromSubject(db, message.subject);
  if (!resolved) return null;
  const { site, region, parsedSubject } = resolved;

  const ticketId = await buildNextTicketId(db);
  const trackingToken = `trk_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = message.internalDate || new Date();
  const attachments = await uploadInboundAttachments(ticketId, message.attachments || []);
  const fromEmail = firstEmail(message.from);
  const ccRecipients = filterCopyRecipients(mergeEmailLists(message.to, message.cc), [fromEmail]);
  const requester = displayNameFromEmail(message.from);
  const description = extractInboundMessageBody(String(message.text || '').trim(), message.html) || parsedSubject.subject;
  const waterIssue = hasWaterIssueSignal(parsedSubject.subject) || hasWaterIssueSignal(description);

  const ticket = {
    id: ticketId,
    trackingToken,
    subject: parsedSubject.subject,
    requester,
    requesterEmail: fromEmail || '',
    requesterCcEmails: ccRecipients,
    time: now,
    status: 'Nova OS',
    stageEnteredAt: now,
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
    priority: 'Trivial',
    waterIssue,
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

  // create() (não set()): id vindo de sequência regredida colidiria com uma OS real
  // e set() a sobrescreveria em silêncio. create() falha alto em vez de destruir dados.
  await db.collection('tickets').doc(ticketId).create({
    ...ticket,
    // A OS NASCE de uma mensagem de gente — 234 das 270 vieram assim. Sem este
    // carimbo ela nascia sem projeção nenhuma e só ganharia atenção no SEGUNDO
    // e-mail. Era o buraco mais caro da matriz: o caminho mais comum do sistema.
    lastInboundAt: now,
    lastInboundMessageId: `inbound-${ticketId}`,
    createdAt: now,
    updatedAt: now,
  });
  await copyTicketHistoryToSubcollection(db, db.collection('tickets').doc(ticketId), ticket.history)
    .catch(error => console.error('[mail] falha ao espelhar histórico inicial', { ticketId, error }));

  await recomputeOperationalAttention(db, ticketId);

  // Não bloqueia a criação da OS, mas registra: uma falha TOTAL do enfileiramento
  // (ex.: leitura do diretório de usuários indisponível) deixaria os gestores sem
  // aviso — silenciosamente, se este catch continuasse mudo.
  await notifyScopedManagersNewInboundTicket(db, ticket, message).catch(error => {
    console.error('[mail] falha ao enfileirar avisos de nova OS aos gestores', error);
  });

  return ticket;
}

async function handleSend(req, res) {
  let ticketIdForLog = null;
  let toEmailForLog = null;
  let outboxRefForDelivery = null;
  let outboxLeaseToken = null;
  let outboxDeliveryConfirmed = false;
  const providerForLog = resolveConfiguredEmailProvider();

  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
    }

    let body = await readJsonBody(req);
    const db = getAdminDb();
    let preauthenticatedUser = null;
    let automatedOutboxDelivery = false;
    const requestedOutboxKey = String(body?.outboxKey || '').trim();
    if (requestedOutboxKey) {
      const authorization = await authorizeEmailOutboxDelivery(req);
      preauthenticatedUser = authorization.user;
      automatedOutboxDelivery = authorization.automated;
      const requestedTicketId = required(body.ticketId, 'ticketId');
      const requestedTicketSnap = await db.collection('tickets').doc(requestedTicketId).get();
      if (!requestedTicketSnap.exists) {
        return sendJson(res, 404, { ok: false, error: 'OS não encontrada.' });
      }
      const requestedTicket = { id: requestedTicketSnap.id, ...requestedTicketSnap.data() };
      if (preauthenticatedUser && preauthenticatedUser.role !== 'Admin') {
        const territory = await readTerritoryCatalog(db);
        if (!canUserAccessTicket(
          preauthenticatedUser,
          requestedTicket,
          territory.regions,
          territory.sites
        )) {
          return sendJson(res, 403, { ok: false, error: 'Sem acesso a esta OS.' });
        }
      }

      const claim = await claimEmailOutbox(db, requestedTicketId, requestedOutboxKey, {
        respectSchedule: automatedOutboxDelivery,
        allowDeadLetterRetry: !automatedOutboxDelivery,
      });
      if (claim.state === 'sent') {
        return sendJson(res, 200, {
          ok: true,
          ticketId: requestedTicketId,
          outboxKey: requestedOutboxKey,
          alreadySent: true,
          messageId: claim.data?.messageId || null,
        });
      }
      if (claim.state === 'busy') {
        return sendJson(res, 409, {
          ok: false,
          error: 'Este e-mail já está sendo enviado. Aguarde alguns instantes.',
        });
      }
      if (claim.state === 'deferred') {
        return sendJson(res, 200, {
          ok: true,
          ticketId: requestedTicketId,
          outboxKey: requestedOutboxKey,
          skipped: 'backoff-active',
        });
      }
      if (claim.state === 'dead-letter') {
        return sendJson(res, 409, {
          ok: false,
          error: 'Este e-mail atingiu o limite de tentativas e requer intervenção administrativa.',
        });
      }

      outboxRefForDelivery = claim.ref;
      outboxLeaseToken = claim.leaseToken;

      // Tipos de comunicação INTERNA saem por entrega avulsa (sem thread/CC da
      // conversa do solicitante). Passá-los pelo corpo do handleSend faria o aviso
      // herdar a thread e o CC do cliente — vazamento de triagem interna.
      if (claim.data.type === EMAIL_OUTBOX_TYPES.MANAGER_NEW_TICKET) {
        const recipient = firstEmail(
          Array.isArray(claim.data.recipients) ? claim.data.recipients[0] : claim.data.recipients
        );
        if (!recipient) {
          await markEmailOutboxSent(claim.ref, claim.leaseToken, { messageId: null, provider: 'skipped' });
          return sendJson(res, 200, {
            ok: true,
            ticketId: requestedTicketId,
            outboxKey: requestedOutboxKey,
            skipped: 'no-recipient',
          });
        }
        const managerEmail = buildManagerNotificationEmail(requestedTicket);
        toEmailForLog = recipient;
        const delivery = await deliverStandaloneEmail({
          toEmail: recipient,
          subject: managerEmail.subject,
          text: managerEmail.text,
          html: managerEmail.html,
          ticketId: requestedTicketId,
          trackingToken: requestedTicket.trackingToken,
        });
        await markEmailOutboxSent(claim.ref, claim.leaseToken, delivery);
        outboxDeliveryConfirmed = true;
        await logEmailEvent({
          type: 'outbound',
          status: 'success',
          provider: delivery.provider,
          ticketId: requestedTicketId,
          toEmail: recipient,
          subject: managerEmail.subject,
        });
        return sendJson(res, 200, {
          ok: true,
          ticketId: requestedTicketId,
          outboxKey: requestedOutboxKey,
          messageId: delivery.messageId,
        });
      }

      // Guarda para quem adicionar o PRÓXIMO tipo: sem ramo próprio acima, o item
      // cairia no renderizador financeiro (payload vazio + máquina de thread do
      // solicitante). Falha explícito em vez de enviar um e-mail errado.
      if (claim.data.type !== EMAIL_OUTBOX_TYPES.FINANCE_PAYMENT) {
        throw new Error(`Tipo de e-mail sem renderizador dedicado: ${claim.data.type}`);
      }
      body = {
        ...buildFinanceOutboxPayload(requestedTicket, claim.data),
        outboxKey: requestedOutboxKey,
      };
    }

    const ticketId = required(body.ticketId, 'ticketId');
    ticketIdForLog = ticketId;

    const toEmailInput = body.toEmail ? String(body.toEmail).trim() : '';
    const subject = body.subject ? String(body.subject) : 'Atualização da OS';
    let text = body.text ? String(body.text) : '';
    let html = body.html ? String(body.html) : '';
    const templateId = body.templateId ? String(body.templateId) : null;
    const trigger = body.trigger ? String(body.trigger) : null;
    let templateData = body.templateData && typeof body.templateData === 'object' ? body.templateData : {};
    let variables = body.variables && typeof body.variables === 'object' ? body.variables : {};
    const trackingToken = body.trackingToken ? String(body.trackingToken) : null;
    const skipThread = body.skipThread === true;
    const internalCopy = body.internalCopy === true;
    const allowThreadRecipientFallback = body.allowThreadRecipientFallback !== false;
    const internalEmail = getInternalNotificationEmail();

    if (internalCopy && !internalEmail) {
      return sendJson(res, 200, { ok: true, skipped: 'internal-copy-without-recipient' });
    }

    if (!templateId && !trigger && !text && !html) {
      throw new Error('Informe text, html, templateId ou trigger para envio.');
    }

    const ticketSnapForSend = await db.collection('tickets').doc(ticketId).get();
    const ticketDataForSend = ticketSnapForSend.exists
      ? { id: ticketSnapForSend.id, ...ticketSnapForSend.data() }
      : null;
    const isPublicCreationEmail =
      trigger === 'EMAIL-NOVA-OS' &&
      (await canSendPublicCreationEmail(db, ticketId, firstEmail(toEmailInput) || '', internalCopy));

    if (!isPublicCreationEmail) {
      const user = automatedOutboxDelivery
        ? null
        : preauthenticatedUser || await requireAuthenticatedUser(req);
      // Perfis não-Admin só disparam e-mail de OS dentro do seu escopo
      // territorial — evita usar o remetente corporativo como relay para OS de
      // outra região (texto/destinatário controlados pelo chamador).
      if (user && user.role !== 'Admin' && ticketId) {
        if (!ticketDataForSend) {
          return sendJson(res, 404, { ok: false, error: 'OS não encontrada.' });
        }
        const territory = await readTerritoryCatalog(db);
        if (!canUserAccessTicket(user, ticketDataForSend, territory.regions, territory.sites)) {
          return sendJson(res, 403, { ok: false, error: 'Sem acesso a esta OS.' });
        }
      }
    }

    // Fluxo público (SEM autenticação): a caixa corporativa assina DKIM, então
    // aceitar html/assunto/CC/destinatário do cliente transformaria o endpoint em
    // relay de phishing (confirmado por auditoria). Aqui ignoramos TODO conteúdo do
    // cliente e renderizamos o e-mail de nova OS a partir dos dados do servidor,
    // enviando só para o solicitante da própria OS.
    let publicRecipientOverride = null;
    if (isPublicCreationEmail) {
      const t = ticketDataForSend || {};
      html = '';
      text = '';
      body.ccEmail = '';
      body.cc = '';
      const serviceName = String(t.macroServiceName || t.serviceCatalogName || t.service || '');
      const ctaUrl = t.trackingToken
        ? `${process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || 'https://serv3.vercel.app'}/?tracking=${encodeURIComponent(t.trackingToken)}`
        : null;
      // variables vêm do DOC DO SERVIDOR (mesma forma que o cliente montava), não
      // zeradas — senão o template default ("Olá {{requester.name}} … Sede:
      // {{ticket.sede}}") renderiza em branco e o assunto perde a sede.
      variables = {
        requester: { name: String(t.requester || 'Solicitante'), email: String(t.requesterEmail || '') },
        ticket: {
          id: ticketId,
          subject: String(t.subject || ''),
          status: String(t.status || 'Nova OS'),
          region: String(t.region || ''),
          sede: String(t.sede || ''),
          sector: String(t.sector || ''),
          location: String(t.location || ''),
          macroService: String(t.macroServiceName || ''),
          service: String(t.serviceCatalogName || ''),
        },
        tracking: { url: ctaUrl || '' },
      };
      // Confirmação ao solicitante × cópia de triagem à caixa interna: títulos/CTA
      // distintos, mas ambos 100% do servidor (nada do cliente).
      templateData = internalCopy
        ? {
            title: `${ticketId} na fila de triagem`,
            intro: 'Uma nova solicitação foi registrada por e-mail e já pode ser triada pela equipe.',
            ticketSubject: String(t.subject || ''),
            status: String(t.status || 'Nova OS'),
            region: String(t.region || ''),
            site: String(t.sede || ''),
            service: serviceName,
          }
        : {
            title: `${ticketId} registrada`,
            intro: 'Sua solicitação foi registrada. Você pode responder este e-mail para continuar a conversa no sistema.',
            ticketSubject: String(t.subject || ''),
            status: String(t.status || 'Nova OS'),
            region: String(t.region || ''),
            site: String(t.sede || ''),
            service: serviceName,
            ctaUrl,
            ctaLabel: 'Acompanhar OS',
          };
      publicRecipientOverride = internalCopy ? null : firstEmail(String(t.requesterEmail || ''));
    }

    // Anexos de saída resolvidos SÓ após o authz e restritos ao Storage da própria
    // OS — sem isto, qualquer chamador (até não autenticado) baixaria path/URL
    // arbitrários do bucket (SSRF/exfiltração de contratos de outra sede). No fluxo
    // público, as fotos da abertura acompanham o e-mail (feature intencional), mas
    // vindas do DOC DO SERVIDOR (paths da própria OS), não do payload do cliente.
    const outboundAttachments = isPublicCreationEmail
      ? await resolveOutboundAttachments(
          (Array.isArray(ticketDataForSend?.attachments) ? ticketDataForSend.attachments : []).map(a => ({
            path: a?.path,
            name: a?.name,
            contentType: a?.contentType,
          })),
          ticketId
        )
      : await resolveOutboundAttachments(body.attachments, ticketId);

    const storedTemplate = await resolveEmailTemplate(db, trigger);
    const templateSubject = repairMojibake(
      storedTemplate?.subject ? renderTemplateString(storedTemplate.subject, variables) : subject
    );
    const triggerKey = String(trigger || '').trim();
    const isDirectorTrigger = triggerKey.startsWith('EMAIL-DIRETORIA-');
    const templateBodyText = String(templateData.bodyText || '').trim();
    const forceBodyFromTemplateData =
      isDirectorTrigger ||
      triggerKey === 'EMAIL-FINANCEIRO-PAGAMENTO' ||
      templateData.useBodyOnly === true;
    const isFinanceTrigger = triggerKey === 'EMAIL-FINANCEIRO-PAGAMENTO';
    const shouldUseRequesterThread = !internalCopy && !isDirectorTrigger && !isFinanceTrigger;
    const shouldUseFinanceThread = !internalCopy && isFinanceTrigger;
    const shouldUseManagedThread = shouldUseRequesterThread || isDirectorTrigger || shouldUseFinanceThread;
    const requestedBodyOverride = forceBodyFromTemplateData ? templateBodyText : '';
    const baseResolvedBody = requestedBodyOverride || repairMojibake(
      storedTemplate?.body ? renderTemplateString(storedTemplate.body, variables) : text
    );
    const directorSummary = repairMojibake(String(templateData.directorSummary || '').trim());
    const resolvedBody =
      isDirectorTrigger && !requestedBodyOverride && directorSummary
        ? (baseResolvedBody
            ? baseResolvedBody.includes(directorSummary)
              ? baseResolvedBody
              : `${baseResolvedBody}\n\n${directorSummary}`
            : directorSummary)
        : baseResolvedBody;
    const resolvedTicket = variables.ticket && typeof variables.ticket === 'object' ? variables.ticket : {};
    const resolvedGuarantee = variables.guarantee && typeof variables.guarantee === 'object' ? variables.guarantee : {};
    const resolvedSubject = ticketId
      ? buildConversationSubject(ticketId, repairMojibake(templateData.ticketSubject || resolvedTicket.subject), 'Atualização da OS', resolvedTicket.sede)
      : templateSubject;


    const threadDocId = isDirectorTrigger ? `${ticketId}__director` : shouldUseFinanceThread ? `${ticketId}__finance` : ticketId;
    const threadRef = db.collection('emailThreads').doc(threadDocId);
    const threadSnap = await threadRef.get();
    const baseThread = threadSnap.exists ? threadSnap.data() : null;
    // Diretoria entra na MESMA conversa da OS: o e-mail ao diretor herda assunto, raiz
    // (rootMessageId), References e gmailThreadId da thread do solicitante (doc
    // `${ticketId}`) quando a thread do diretor ainda não tem contexto próprio. Assim
    // o aviso cai na conversa da OS em vez de uma thread isolada.
    // IMPORTANTE: CC e participantes continuam isolados neste doc `__director` (não
    // herdamos `ccEmail`/`participants` da OS), e o envio ao solicitante lê o doc da OS
    // — nunca este — então as cópias das duas audiências nunca se misturam (sem vazamento).
    let thread = baseThread;
    if (isDirectorTrigger && !baseThread?.rootMessageId && !baseThread?.lastMessageId) {
      const osThreadSnap = await db.collection('emailThreads').doc(ticketId).get();
      const osThread = osThreadSnap.exists ? osThreadSnap.data() : null;
      if (osThread && (osThread.rootMessageId || osThread.lastMessageId)) {
        thread = {
          ...(baseThread || {}),
          subject: baseThread?.subject || osThread.subject || null,
          rootMessageId: osThread.rootMessageId || osThread.lastMessageId || null,
          lastMessageId: osThread.lastMessageId || osThread.rootMessageId || null,
          references: Array.isArray(osThread.references) ? osThread.references : [],
          gmailThreadId: osThread.gmailThreadId || null,
        };
      }
    }
    const ticketSnapForCopies = await db.collection('tickets').doc(ticketId).get();
    const ticketForCopies = ticketSnapForCopies.exists ? ticketSnapForCopies.data() || {} : {};
    const requesterThreadSubject = shouldUseRequesterThread
      ? buildReplySubject(await resolveRequesterThreadSubject(threadRef, thread, ticketId))
      : '';
    const canonicalSubject =
      requesterThreadSubject ||
      (isDirectorTrigger && String(thread?.subject || '').trim() ? repairMojibake(String(thread.subject)) : '') ||
      (shouldUseFinanceThread && String(thread?.subject || '').trim() ? repairMojibake(String(thread.subject)) : '') ||
      resolvedSubject;

    const explicitRecipients = publicRecipientOverride !== null
      ? (publicRecipientOverride ? [publicRecipientOverride] : [])
      : parseEmailList(toEmailInput);
    const templateRecipients = parseEmailList(storedTemplate?.recipients || '');
    const flowFallbackRecipients = await resolveFlowFallbackRecipients(db, trigger);
    const threadRecipients = parseEmailList(thread?.toEmail || '');
    const directorRecipientsMerged = [...new Set([...templateRecipients, ...flowFallbackRecipients])];
    const recipients = internalCopy
      ? (internalEmail ? [internalEmail] : [])
      : explicitRecipients.length > 0
        ? explicitRecipients
        : isDirectorTrigger
          ? directorRecipientsMerged
          : templateRecipients.length > 0
            ? templateRecipients
            : flowFallbackRecipients.length > 0
              ? flowFallbackRecipients
              : allowThreadRecipientFallback
                ? threadRecipients
                : [];
    const toEmail = recipients.join(', ');
    const ticketCopyRecipients = Array.isArray(ticketForCopies.requesterCcEmails)
      ? ticketForCopies.requesterCcEmails
      : parseEmailList(ticketForCopies.requesterCcEmails || ticketForCopies.requesterCcEmail || '');
    const shouldUseConversationCopies =
      !internalCopy &&
      !isDirectorTrigger &&
      triggerKey !== 'EMAIL-FINANCEIRO-PAGAMENTO' &&
      triggerKey !== 'EMAIL-DIRETORIA-SOLUCAO' &&
      triggerKey !== 'EMAIL-DIRETORIA-APROVACAO';
    const overrideConversationCopies = body.overrideConversationCopies === true;
    const baseCcRecipients = shouldUseConversationCopies
      ? filterCopyRecipients(
          overrideConversationCopies
            ? mergeEmailLists(body.ccEmail || body.cc || '')
            : mergeEmailLists(body.ccEmail || body.cc || '', thread?.ccEmail || '', ticketCopyRecipients),
          recipients
        )
      : filterCopyRecipients(body.ccEmail || body.cc || '', recipients);
    // CC fixo da caixa de recebimento: garante que a resposta do cliente (mesmo
    // "responder a todos") também chegue à caixa que o sistema vigia — cinto e
    // suspensório com o Reply-To. Só na conversa com o solicitante; adicionado
    // DEPOIS do filtro de mailbox do sistema (senão seria removido, por ser a
    // conta do inbound) e sem duplicar quem já está no To/CC.
    const alwaysCcEmail = firstEmail(process.env.TICKET_ALWAYS_CC_EMAIL || '');
    const ccRecipients =
      alwaysCcEmail &&
      shouldUseConversationCopies &&
      !recipients.some(recipient => firstEmail(recipient) === alwaysCcEmail) &&
      !baseCcRecipients.some(copy => firstEmail(copy) === alwaysCcEmail)
        ? [...baseCcRecipients, alwaysCcEmail]
        : baseCcRecipients;
    const ccEmail = ccRecipients.join(', ');
    toEmailForLog = toEmail;
    if (!toEmail || recipients.length === 0) {
      throw new Error('Campo obrigatório: toEmail (ou thread existente com destinatário).');
    }

    const storedRootMessageId = normalizeMessageIdToken(thread?.rootMessageId);
    const rootMessageId = storedRootMessageId || buildThreadRootMessageId(threadDocId);
    const hasRequesterThreadContext = Boolean(storedRootMessageId || thread?.lastMessageId);
    const reuseThread = shouldUseManagedThread && Boolean(thread?.lastMessageId);
    const priorMessageId =
      shouldUseManagedThread && hasRequesterThreadContext
        ? storedRootMessageId || thread?.lastMessageId || null
        : null;
    const references = shouldUseManagedThread && Array.isArray(thread?.references) ? thread.references : [];
    const nextReferences = shouldUseManagedThread && hasRequesterThreadContext
      ? [...new Set([...references, rootMessageId, priorMessageId].filter(Boolean))].slice(-20)
      : [];

    const _headers = {
      'X-OS-Ticket-ID': ticketId,
      ...(trackingToken ? { 'X-OS-Tracking-Token': trackingToken } : {}),
      ...(priorMessageId ? { 'In-Reply-To': priorMessageId } : {}),
      ...(nextReferences.length > 0 ? { References: nextReferences.join(' ') } : {}),
    };

    const provider = providerForLog;
    const skipDirectorGreeting = Boolean(templateData?.skipGreeting);
    let personalizedBody = resolvedBody;
    if (isDirectorTrigger && !internalCopy && !skipDirectorGreeting) {
      personalizedBody = normalizeDirectorGreeting(resolvedBody);
    }
    const shouldUseMinimalConversationBody =
      !internalCopy &&
      triggerKey === 'EMAIL-NOVA-MENSAGEM' &&
      templateData.useBodyOnly === true;

    const fallbackTemplate = buildTicketEmailTemplate({
      trigger: trigger || templateId || resolvedSubject,
      title: repairMojibake(templateData.title || '') || `Atualização de ${ticketId}`,
      intro:
        repairMojibake(templateData.intro || '') ||
        'Sua solicitação recebeu uma nova atualização. Você pode responder este e-mail para continuar a conversa no sistema.',
      ticketId,
      subject: repairMojibake(templateData.ticketSubject || resolvedSubject),
      status: repairMojibake(templateData.status || 'Atualizada'),
      region: repairMojibake(templateData.region || resolvedTicket.region || '') || null,
      site: repairMojibake(templateData.site || resolvedTicket.sede || '') || null,
      sector: repairMojibake(templateData.sector || resolvedTicket.sector || '') || null,
      service: repairMojibake(templateData.service || resolvedTicket.service || resolvedTicket.macroService || '') || null,
      guaranteeSummary: repairMojibake(templateData.guaranteeSummary || resolvedGuarantee.summary || '') || null,
      ctaUrl: templateData.ctaUrl || null,
      ctaLabel: repairMojibake(templateData.ctaLabel || 'Acompanhar OS'),
      bodyText: repairMojibake(personalizedBody || templateData.bodyText || ''),
      metricRows: Array.isArray(templateData.metricRows) ? templateData.metricRows : [],
      detailCards: Array.isArray(templateData.detailCards) ? templateData.detailCards : [],
    });

    const finalText = repairMojibake(personalizedBody || text || fallbackTemplate.text);
    const finalHtml = shouldUseMinimalConversationBody
      ? buildSimpleHtmlEmail(finalText)
      : (html || fallbackTemplate.html);

    let sendResult;
    let effectiveInReplyTo = priorMessageId || null;
    let effectiveReferences = nextReferences;
    let recoveredThread = false;

    {
      try {
        const gmailSendResult = await sendWithGmailThreadFallback({
          toEmail,
          ccEmail,
          subject: canonicalSubject,
          text: finalText,
          html: finalHtml,
          inReplyTo: priorMessageId || undefined,
          references: nextReferences,
          ticketId,
          trackingToken: trackingToken || undefined,
          threadId: reuseThread ? thread?.gmailThreadId || undefined : undefined,
          attachments: outboundAttachments,
        });
        sendResult = gmailSendResult.result;
        effectiveInReplyTo = gmailSendResult.inReplyTo;
        effectiveReferences = gmailSendResult.references;
        recoveredThread = gmailSendResult.recoveredThread;
      } catch (error) {
        const shouldBatchRetryFallback =
          !internalCopy &&
          triggerKey === 'EMAIL-NOVA-MENSAGEM' &&
          ccRecipients.length > 0 &&
          recipients.length === 1 &&
          isGenericPolicyBlock(error);

        if (!shouldBatchRetryFallback) throw error;

        // Retry em lote, mantendo todos os destinatários, mas sem contexto de thread.
        // Alguns filtros bloqueiam respostas em corrente com muitos participantes.
        const retrySend = await sendWithGmailThreadFallback({
          toEmail,
          ccEmail,
          subject: canonicalSubject,
          text: finalText,
          html: finalHtml,
          inReplyTo: undefined,
          references: [],
          ticketId,
          trackingToken: trackingToken || undefined,
          threadId: undefined,
          attachments: outboundAttachments,
        });
        sendResult = retrySend.result;
        effectiveInReplyTo = retrySend.inReplyTo;
        effectiveReferences = retrySend.references;
        recoveredThread = retrySend.recoveredThread;
      }
    }

    const now = new Date();
    const messageId = sendResult.messageId || sendResult.id || `<os-${ticketId}-${now.getTime()}@serv3>`;
    if (outboxRefForDelivery && outboxLeaseToken) {
      await markEmailOutboxSent(outboxRefForDelivery, outboxLeaseToken, {
        messageId,
        provider,
      });
      outboxDeliveryConfirmed = true;
    }
    const effectiveRootMessageId = storedRootMessageId || (recoveredThread ? messageId : rootMessageId);
    const mergedReferences = [...new Set([effectiveRootMessageId, ...effectiveReferences, messageId].filter(Boolean))].slice(-20);
    const persistedHeaders = {
      'X-OS-Ticket-ID': ticketId,
      ...(trackingToken ? { 'X-OS-Tracking-Token': trackingToken } : {}),
      ...(effectiveInReplyTo ? { 'In-Reply-To': effectiveInReplyTo } : {}),
      ...(effectiveReferences.length > 0 ? { References: effectiveReferences.join(' ') } : {}),
    };

    if (!skipThread && shouldUseManagedThread) {
      await threadRef.set(
        {
          ticketId,
          threadScope: isDirectorTrigger ? 'director' : shouldUseFinanceThread ? 'finance' : 'requester',
          subject: canonicalSubject,
          toEmail,
          ...(ccEmail ? { ccEmail } : {}),
          rootMessageId: effectiveRootMessageId,
          lastMessageId: messageId,
          gmailThreadId: (reuseThread ? thread?.gmailThreadId : null) || sendResult.threadId || null,
          references: mergedReferences,
          lastDirection: 'outbound',
          lastOutboundAt: now,
          updatedAt: now,
          ...(recipients.length + ccRecipients.length > 0
            ? { participants: FieldValue.arrayUnion(...recipients, ...ccRecipients) }
            : {}),
        },
        { merge: true }
      );

      await threadRef.collection('messages').add({
        direction: 'outbound',
        toEmail,
        ccEmail: ccEmail || null,
        subject: canonicalSubject,
        text: finalText || null,
        html: finalHtml || null,
        templateId: templateId || null,
        trigger: trigger || null,
        messageId,
        rootMessageId: effectiveRootMessageId,
        inReplyTo: effectiveInReplyTo,
        references: mergedReferences,
        headers: persistedHeaders,
        attachments: outboundAttachments.map(item => ({
          name: item.filename,
          contentType: item.mimeType,
          size: item.size,
        })),
        createdAt: now,
      });
    }

    await logEmailEvent({
      type: 'outbound',
      status: 'success',
      provider,
      ticketId,
      toEmail,
      ccEmail: ccEmail || null,
      subject: canonicalSubject,
      messageId,
    });

    // Respondemos: o carimbo de saída fecha a atenção "revisar mensagem" que a
    // mensagem de entrada tinha aberto. É o par que faz a fila esvaziar sozinha em
    // vez de exigir que alguém clique "feito".
    if (ticketId) {
      await db.collection('tickets').doc(ticketId).set({ lastOutboundAt: now }, { merge: true });
      await recomputeOperationalAttention(db, ticketId);
    }

    return sendJson(res, 200, {
      ok: true,
      ticketId,
      toEmail,
      ccEmail: ccEmail || null,
      messageId,
      inReplyTo: effectiveInReplyTo,
      references: mergedReferences,
      recoveredThread,
    });
  } catch (error) {
    if (outboxRefForDelivery && outboxLeaseToken && !outboxDeliveryConfirmed) {
      await markEmailOutboxFailed(outboxRefForDelivery, outboxLeaseToken, error).catch(markError => {
        console.error('[mail] falha ao registrar erro da outbox', markError);
      });
    }
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

/**
 * FILA DE MENSAGENS NÃO ASSOCIADAS — entrar e sumir deixou de ser opção.
 *
 * Vinte e três e-mails entraram e viraram nada: todos `Re:` de conversas reais
 * (goteiras, telas de portão), a mesma thread voltando semana após semana enquanto
 * as pessoas achavam que tinham avisado. O sistema pode classificar errado; não pode
 * silenciar entrada.
 *
 * GET  -> o que esta pendente
 * POST -> resolve: `vincular` (anexa a uma OS existente) ou `descartar`
 *
 * Criar OS a partir daqui NÃO passa por esta rota: reusa o POST de tickets, que já
 * sabe montar OS com sede, histórico e e-mail de confirmação. Duplicar isso aqui
 * criaria um segundo jeito de nascer OS — e o primeiro já é complicado o bastante.
 */
async function handleDroppedInbound(req, res) {
  try {
    const user = await requireUserWithRoles(req, ['Admin', 'Gestor']);
    const db = getAdminDb();
    const col = db.collection('inboundDropped');

    if (req.method === 'GET') {
      // Mensagem AINDA não associada não tem OS, logo não tem território — e por isso
      // ela é visível para quem tria. O que NÃO pode é ela sobreviver resolvida: o
      // Gestor vê o que chegou na caixa da operação, o mesmo universo que já recebe
      // por e-mail — mas o que ja foi resolvido sai da lista.
      const snap = await col.orderBy('createdAt', 'desc').limit(60).get();
      const items = snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(item => item.status !== 'resolvido')
        .map(item => ({
          id: item.id,
          fromEmail: item.fromEmail || null,
          subject: item.subject || '',
          text: String(item.text || '').slice(0, 4000),
          attachmentCount: Number(item.attachmentCount || 0),
          receivedAt: toDateOrNull(item.receivedAt || item.createdAt)?.toISOString() || null,
          createdAt: toDateOrNull(item.createdAt)?.toISOString() || null,
        }));
      return sendJson(res, 200, { ok: true, items });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
    }

    const body = await readJsonBody(req);
    const id = String(body?.id || '').trim();
    const acao = String(body?.action || '').trim();
    if (!id) return sendJson(res, 400, { ok: false, error: 'id é obrigatório.' });

    const ref = col.doc(id);
    const snap = await ref.get();
    if (!snap.exists) return sendJson(res, 404, { ok: false, error: 'Mensagem não encontrada na fila.' });
    const item = snap.data() || {};
    if (item.status === 'resolvido') {
      return sendJson(res, 409, { ok: false, error: 'Esta mensagem já foi resolvida.' });
    }

    if (acao === 'descartar') {
      await ref.set({
        status: 'resolvido',
        resolution: 'descartada',
        resolvedBy: user?.email || null,
        resolvedAt: new Date(),
      }, { merge: true });
      return sendJson(res, 200, { ok: true });
    }

    if (acao === 'criar') {
      const sede = String(body?.sede || '').trim();
      if (!sede) return sendJson(res, 400, { ok: false, error: 'Escolha a sede da nova OS.' });

      // REUSA o fluxo que já sabe nascer OS de e-mail: número, token, anexos, cópia,
      // detecção de água, histórico e e-mail de confirmação. O que faltava na
      // mensagem era exatamente a sede — então ela entra no assunto, no formato que
      // o parser já entende, e o resto do caminho é o mesmo de sempre.
      //
      // Segundo botão não pode virar segundo jeito de nascer OS.
      const criada = await createTicketFromInbound(db, {
        subject: `[${sede}] ${String(item.subject || '').replace(/^\s*re:\s*/i, '').trim()}`,
        from: item.fromEmail || '',
        cc: item.ccEmail || '',
        text: String(item.text || ''),
        html: '',
        attachments: [],
        internalDate: toDateOrNull(item.receivedAt) || toDateOrNull(item.createdAt) || new Date(),
        messageId: item.messageId || null,
      });

      if (!criada?.id) {
        return sendJson(res, 400, { ok: false, error: `Sede "${sede}" não existe no catálogo.` });
      }

      const anexos = await copiarAnexosDaFila(id, criada.id, item.attachments);
      if (anexos.length > 0) {
        await db.collection('tickets').doc(criada.id).set({ attachments: anexos }, { merge: true });
      }

      await ref.set({
        status: 'resolvido',
        resolution: 'virou-os',
        resolvedTicketId: criada.id,
        resolvedBy: user?.email || null,
        resolvedAt: new Date(),
      }, { merge: true });

      await recomputeOperationalAttention(db, criada.id);
      return sendJson(res, 201, { ok: true, ticketId: criada.id });
    }

    if (acao !== 'vincular') {
      return sendJson(res, 400, { ok: false, error: 'action deve ser "vincular", "criar" ou "descartar".' });
    }

    const ticketId = String(body?.ticketId || '').trim();
    if (!ticketId) return sendJson(res, 400, { ok: false, error: 'ticketId é obrigatório para vincular.' });

    const ticketRef = db.collection('tickets').doc(ticketId);
    const ticketSnap = await ticketRef.get();
    if (!ticketSnap.exists) return sendJson(res, 404, { ok: false, error: 'OS não encontrada.' });

    // Mesmo escopo territorial do resto do sistema: ninguém anexa mensagem a uma OS
    // que não consegue abrir.
    const territory = user.role === 'Admin' ? { regions: [], sites: [] } : await readTerritoryCatalog(db);
    if (!canUserAccessTicket(user, { id: ticketSnap.id, ...ticketSnap.data() }, territory.regions, territory.sites)) {
      return sendJson(res, 403, { ok: false, error: 'Sem acesso a esta OS.' });
    }

    const quem = displayNameFromEmail(item.fromEmail) || item.fromEmail || 'Remetente desconhecido';
    const corpo = String(item.text || '').trim() || 'Mensagem recebida por e-mail.';
    // O aviso só vale para mensagem que entrou ANTES de a fila guardar anexos.
    const guardou = Array.isArray(item.attachments) && item.attachments.length > 0;
    const aviso = !guardou && Number(item.attachmentCount || 0) > 0
      ? `\n\n(Esta mensagem tinha ${item.attachmentCount} anexo(s) que não foram preservados — abra o e-mail original.)`
      : '';

    const anexosDaFila = await copiarAnexosDaFila(id, ticketId, item.attachments);
    await appendTicketHistory(db, ticketRef, [{
      id: `dropped-${id}`,
      type: 'customer',
      sender: quem,
      time: toDateOrNull(item.receivedAt) || toDateOrNull(item.createdAt) || new Date(),
      text: `${corpo}${aviso}`,
      visibility: 'internal',
      ...(anexosDaFila.length > 0 ? { attachments: anexosDaFila } : {}),
    }, {
      id: `dropped-sys-${id}`,
      type: 'system',
      sender: 'Sistema',
      time: new Date(),
      text: `Mensagem que havia entrado sem vínculo foi anexada a esta OS por ${user?.name || user?.email || 'painel'}. Assunto original: "${String(item.subject || '').slice(0, 120)}".`,
      visibility: 'internal',
    }]);

    // O carimbo só ANDA PARA A FRENTE. Vincular hoje um e-mail de junho não pode
    // apagar uma conversa de ontem — a atenção voltaria a apontar para a mensagem
    // errada e a OS pareceria sem resposta quando já foi respondida.
    const chegadaDaFila = toDateOrNull(item.receivedAt) || toDateOrNull(item.createdAt) || new Date();
    const inboundAtual = toDateOrNull(ticketSnap.data()?.lastInboundAt);
    if (!inboundAtual || chegadaDaFila.getTime() > inboundAtual.getTime()) {
      await ticketRef.set({
        lastInboundAt: chegadaDaFila,
        lastInboundMessageId: `dropped-${id}`,
      }, { merge: true });
    }
    await recomputeOperationalAttention(db, ticketId);

    await ref.set({
      status: 'resolvido',
      resolution: 'vinculada',
      resolvedTicketId: ticketId,
      resolvedBy: user?.email || null,
      resolvedAt: new Date(),
    }, { merge: true });

    await logEmailEvent({
      type: 'inbound',
      status: 'success',
      provider: 'gmail',
      ticketId,
      fromEmail: item.fromEmail || null,
      subject: item.subject || '',
      messageId: item.messageId || null,
    });

    return sendJson(res, 200, { ok: true, ticketId });
  } catch (error) {
    sendError(res, error);
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
    const [snap, outboxSnap] = await Promise.all([
      db
        .collection('emailEvents')
        .where('createdAt', '>=', since)
        .orderBy('createdAt', 'desc')
        .limit(200)
        .get(),
      db
        .collection('emailOutbox')
        .where('status', 'in', ['pending', 'processing', 'failed', 'dead-letter'])
        .limit(500)
        .get(),
    ]);

    // E-MAIL QUE ENTROU E NÃO VIROU NADA.
    //
    // Resposta de uma conversa que nunca virou OS: sem [SEDE] no assunto e sem
    // vínculo com OS existente, o sistema recusa criar (certo) e apenas registrava
    // `skipped` — que esta tela não mostrava, porque só lista `error`. Foram 23
    // mensagens sumindo em silêncio, a mesma conversa voltando semana após semana,
    // com as pessoas achando que tinham avisado.
    const droppedSnap = await db
      .collection('inboundDropped')
      .orderBy('createdAt', 'desc')
      .limit(30)
      .get();
    const droppedInbound = droppedSnap.docs.map(doc => {
      const data = doc.data() || {};
      return {
        id: doc.id,
        createdAt: data.createdAt,
        fromEmail: data.fromEmail || null,
        subject: data.subject || '',
      };
    });

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
    const outbox = outboxSnap.docs.reduce((acc, doc) => {
      const status = String(doc.data()?.status || 'pending');
      if (status in acc) acc[status] += 1;
      return acc;
    }, { pending: 0, processing: 0, failed: 0, 'dead-letter': 0 });

    // Idade do item mais antigo AINDA NÃO ENTREGUE. O worker roda por cron externo
    // (GitHub Actions), que é best-effort e é DESATIVADO após ~60 dias sem push —
    // se ele morrer, nada falha alto e os e-mails simplesmente param. Uma fila cuja
    // cabeça envelhece (minutos virando horas) é o sintoma visível disso.
    const nowMs = Date.now();
    let oldestPendingMinutes = null;
    for (const doc of outboxSnap.docs) {
      const data = doc.data() || {};
      if (data.status === 'dead-letter') continue;
      const createdAt = data.createdAt?.toDate?.() || (data.createdAt ? new Date(data.createdAt) : null);
      if (!createdAt || Number.isNaN(createdAt.getTime())) continue;
      const ageMinutes = Math.floor((nowMs - createdAt.getTime()) / 60000);
      if (oldestPendingMinutes === null || ageMinutes > oldestPendingMinutes) {
        oldestPendingMinutes = ageMinutes;
      }
    }
    outbox.oldestPendingMinutes = oldestPendingMinutes;

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
      droppedInbound,
      outbox,
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
    // O último 500 fixo do arquivo. Ele devolvia a MENSAGEM certa com o STATUS
    // errado — "Token de autenticação ausente" acompanhado de 500 —, então quem
    // olhava o código de resposta via falha do servidor onde havia sessão vencida.
    // Achado por sonda na produção, não por teste.
    return sendError(res, error, 'Falha ao ler saúde de e-mail.');
  }
}

function getOutboxSendUrl() {
  const baseUrl = process.env.VERCEL_URL
    ? `https://${String(process.env.VERCEL_URL).replace(/^https?:\/\//, '')}`
    : process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL;
  if (!baseUrl) throw new Error('URL interna do Serv3 não configurada para processar a outbox.');
  return new URL('/api/mail?route=send', baseUrl).toString();
}

async function dispatchAutomatedOutboxItem(item) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) throw new Error('CRON_SECRET não configurado.');

  const response = await fetch(getOutboxSendUrl(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ticketId: item.ticketId,
      outboxKey: item.outboxKey,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const payload = await response.json().catch(() => ({}));
  if (response.status === 409 && /sendo enviado|aguarde/i.test(String(payload?.error || ''))) {
    return { ok: true, skipped: 'lease-active' };
  }
  if (!response.ok) {
    throw new Error(payload?.error || `Falha HTTP ${response.status} ao entregar e-mail.`);
  }
  return payload;
}

/**
 * AVISO DE CHUVA — decide e envia, do lado do servidor.
 *
 * Estava no runner do GitHub Actions, e era o ÚNICO dos quatro workflows que mandava
 * e-mail sozinho: os outros três chamam uma rota daqui com `CRON_SECRET` e quem envia
 * é a Vercel, onde as credenciais do Gmail já moram. A exceção custava caro — exigia
 * as mesmas quatro credenciais num segundo lugar, num repositório público, e com
 * rotação em dobro.
 *
 * `?simular=chovendo` produz o mesmo caminho com leitura sintética, para validar o
 * envio sem esperar chover. O e-mail sai marcado `[TESTE]` no assunto.
 */
async function handleRainAlert(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
    }
    await authorizeEmailOutboxWorker(req);

    const destino = String(process.env.RAIN_ALERT_TO || '').trim();
    if (!destino) {
      // 200, não erro: enquanto o destinatário não existir, cada execução viraria uma
      // falha vermelha a cada 5 minutos — ~288 por dia. Ruído nesse volume ensina todo
      // mundo a ignorar o vermelho, inclusive quando ele for de verdade.
      return sendJson(res, 200, { ok: true, enviado: false, motivo: 'RAIN_ALERT_TO não configurado' });
    }

    const simular = String(req.query?.simular || '').trim();
    const forcar = String(req.query?.forcar || '') === '1';
    const sede = String(req.query?.sede || '').trim() || null;

    // Uma fonte fora do ar não pode derrubar a outra: cada uma cai para vazio e o
    // `avaliarChuva` resolve com o que sobrou.
    const [lista, metar] = await Promise.all([
      fetchCemaden({}).catch(() => []),
      fetchMetar({}).catch(() => null),
    ]);

    const now = new Date();
    const real = avaliarChuva({ lista, metar, sede, now });
    const sinal = simular ? sinalSimulado(real, simular) : real;

    const db = getAdminDb();
    const ref = db.collection('config').doc(RAIN_STATE_DOC);
    const snap = await ref.get();
    const estado = snap.exists ? snap.data() || {} : {};
    const chave = sede || 'FORTALEZA';
    const anterior = estado[chave]?.state || null;
    const transicao = detectRainTransition(anterior, sinal.state);

    let enviado = false;
    if (transicao === 'comecou' || forcar) {
      const quando = now.toLocaleString('pt-BR', { timeZone: 'America/Fortaleza' });
      const email = montarEmail(sinal, quando, sede);
      await gmailSend({
        toEmail: destino,
        subject: email.subject,
        text: email.text,
        ticketId: sinal.simulado ? 'aviso-chuva-teste' : 'aviso-chuva',
        references: [],
      });
      enviado = true;
    }

    // Grava DEPOIS de enviar: se o envio falhar, o estado não avança e a próxima
    // execução tenta de novo. O contrário perderia o aviso em silêncio.
    const paraGuardar = stateToPersist(anterior, sinal.state);
    if (paraGuardar && paraGuardar !== anterior) {
      await ref.set({ [chave]: { state: paraGuardar, at: now } }, { merge: true });
    }

    return sendJson(res, 200, {
      ok: true,
      enviado,
      estado: { anterior, agora: sinal.state, transicao },
      fontes: sinal.fontes,
      simulado: Boolean(sinal.simulado),
    });
  } catch (error) {
    console.error('[mail] falha no aviso de chuva', error);
    // `sendError` preserva o status do HttpError: sem isto, credencial errada vira
    // 500 e o log do Actions diz "erro interno" quando o problema é o segredo. Foi
    // exatamente o que atrapalhou o diagnóstico da fila de e-mail.
    return sendError(res, error, 'Falha ao avaliar a chuva.');
  }
}

async function handleEmailOutboxWorker(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
    }
    await authorizeEmailOutboxWorker(req);
    const result = await processEmailOutboxBatch({
      db: getAdminDb(),
      dispatch: dispatchAutomatedOutboxItem,
      batchSize: 8,
    });
    return sendJson(res, 200, result);
  } catch (error) {
    console.error('[mail] falha no worker da outbox', error);
    // Idem: recusa de credencial precisa chegar como 401/403 no log do Actions. Com
    // o 500 genérico, 10 dias de fila parada não disseram qual era o problema.
    return sendError(res, error, 'Falha ao processar a fila de e-mails.');
  }
}

async function handleGmailSync(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
    }

    // Gestor entra junto com Admin: o InboxView dispara este sync sozinho (a cada
    // ~60s, para Admin E Gestor) e o backend só aceitava Admin — cada Gestor com a
    // inbox aberta enchia o log de recusa. O sync só PUXA e-mail pra dentro, e o
    // reprocess-inbound (mais pesado) já aceita Gestor.
    await authorizeGmailAutomation(req, ['Admin', 'Gestor']);

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
      const result = await processGmailInboundMessageIds(db, [ref.id], 'gmail-api-sync');
      processed += result.processed;
      // Só marca como vista quando NÃO falhou: falha transitória (429/hiccup) é
      // retentada no próximo sync em vez de dropar a mensagem para sempre.
      if (!result.failedIds.includes(ref.id)) {
        newSeen.push(ref.id);
        seenIds.add(ref.id);
      }
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

async function reprocessInboundWindow(db, sinceDate) {
  const counters = {
    scanned: 0,
    processed: 0,
    ticketsUpdated: 0,
    historyRecovered: 0,
    threadRecovered: 0,
  };

  let query = db
    .collection('ticketInbound')
    .where('createdAt', '>=', sinceDate)
    .orderBy('createdAt', 'asc')
    .limit(200);

  while (true) {
    const snap = await query.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      counters.scanned += 1;
      const inbound = doc.data() || {};
      const ticketId = String(
        inbound.ticketId ||
        parseTicketId(inbound.subject) ||
        parseTicketId(inbound.text) ||
        ''
      )
        .trim()
        .toUpperCase();
      if (!ticketId) continue;

      const ticketRef = db.collection('tickets').doc(ticketId);
      const ticketSnap = await ticketRef.get();
      if (!ticketSnap.exists) continue;

      const ticketData = ticketSnap.data() || {};
      const ticketPatch = {};
      const resolvedSite = await resolveSiteFromSubject(db, inbound.subject || '');
      if (resolvedSite) {
        const { site, region } = resolvedSite;
        if (site?.id && site.id !== ticketData.siteId) ticketPatch.siteId = site.id;
        if (site?.code && site.code !== ticketData.sede) ticketPatch.sede = site.code;
        if (region?.id && region.id !== ticketData.regionId) ticketPatch.regionId = region.id;
        if (region?.name && region.name !== ticketData.region) ticketPatch.region = region.name;
      }
      if (Object.keys(ticketPatch).length > 0) {
        ticketPatch.updatedAt = new Date();
        await ticketRef.set(ticketPatch, { merge: true });
        counters.ticketsUpdated += 1;
      }

      const threadRef = db.collection('emailThreads').doc(ticketId);
      const createdAt = toDateOrNull(inbound.createdAt) || new Date();
      await threadRef.set(
        {
          ticketId,
          subject: repairMojibake(String(inbound.subject || ticketData.subject || '')),
          updatedAt: new Date(),
          lastInboundAt: createdAt,
        },
        { merge: true }
      );

      const messageId = String(inbound.messageId || '').trim();
      if (messageId) {
        const existingMessage = await threadRef
          .collection('messages')
          .where('messageId', '==', messageId)
          .limit(1)
          .get();
        if (existingMessage.empty) {
          await threadRef.collection('messages').add({
            direction: 'inbound',
            fromEmail: inbound.fromEmail || null,
            toEmail: inbound.toEmail || null,
            subject: inbound.subject || '',
            text: inbound.text || null,
            html: inbound.html || null,
            messageId,
            inReplyTo: inbound.inReplyTo || null,
            references: Array.isArray(inbound.references) ? inbound.references : [],
            provider: 'gmail',
            attachments: Array.isArray(inbound.attachments) ? inbound.attachments : [],
            createdAt,
          });
          counters.threadRecovered += 1;
        }
      }

      const historyEntry = buildInboundHistoryEntry(
        {
          from: inbound.from || inbound.fromEmail || ticketData.requesterEmail || '',
          text: inbound.text || '',
          html: inbound.html || '',
          messageId: inbound.messageId || doc.id,
          internalDate: createdAt,
        },
        {}
      );
      // Atômico: relê o histórico fresco DENTRO da transação. Antes lia o
      // snapshot stale `ticketData` e escrevia sem transação — race com edição
      // concorrente do painel/inbound podia clobberar entradas.
      if (await appendTicketHistory(db, ticketRef, [historyEntry])) {
        counters.historyRecovered += 1;
      }

      counters.processed += 1;
    }

    if (snap.size < 200) break;
    const last = snap.docs[snap.docs.length - 1];
    query = db
      .collection('ticketInbound')
      .where('createdAt', '>=', sinceDate)
      .orderBy('createdAt', 'asc')
      .startAfter(last)
      .limit(200);
  }

  return counters;
}

async function handleReprocessInbound(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
    }

    // SÓ Admin: reprocessar reescreve sede, thread e histórico de VÁRIOS tickets
    // numa janela de até 60 dias. Gestor e Diretor tinham acesso, o que contraria
    // a segregação adotada no resto do sistema (a tela continua visível para o
    // Diretor; o botão é que sai — ver EmailHealthView).
    const actingUser = await requireUserWithRoles(req, ['Admin']);
    const body = await readJsonBody(req);
    const daysRaw = Number(body?.days || 30);
    const days = Number.isFinite(daysRaw) ? Math.min(60, Math.max(1, Math.floor(daysRaw))) : 30;
    const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const db = getAdminDb();

    const result = await reprocessInboundWindow(db, sinceDate);
    await logEmailEvent({
      type: 'sync',
      status: 'success',
      provider: 'gmail',
      action: 'reprocess-inbound',
      processed: result.processed,
      windowDays: days,
    });
    // Trilha permanente: QUEM disparou, sobre QUAL janela e com que RESULTADO.
    // O logEmailEvent acima é operacional (e tem TTL de 90 dias); uma operação
    // que reescreve histórico de várias OS precisa sobreviver a isso.
    await writeAuditLog({
      actor: actingUser?.name || actingUser?.email || 'Admin',
      action: 'mail.reprocess-inbound',
      entity: 'mail',
      entityId: 'inbound-window',
      before: { windowDays: days, since: sinceDate.toISOString() },
      after: result,
    });

    return sendJson(res, 200, {
      ok: true,
      idempotent: true,
      windowDays: days,
      since: sinceDate.toISOString(),
      result,
    });
  } catch (error) {
    await logEmailEvent({
      type: 'sync',
      status: 'error',
      provider: 'gmail',
      action: 'reprocess-inbound',
      error: error.message || 'Falha no reprocessamento inbound.',
    });
    // Antes: 400 para QUALQUER erro, o que transformava o 403 de permissão (e o
    // 401 de sessão ausente) em "requisição inválida" — indistinguíveis para o
    // cliente. sendError preserva o status do HttpError.
    return sendError(res, error, 'Falha no reprocessamento inbound.');
  }
}

// Aceita SÓ anexos do Storage da própria OS: `attachments/tickets/<pasta>/<ticketId>/...`.
// Sem esta checagem, `path` livre baixaria qualquer objeto do bucket (contratos de
// outra sede) e o antigo fallback `fetch(url)` permitia SSRF — ambos disparáveis
// antes mesmo da autenticação. O fallback por URL foi removido de propósito.
async function resolveOutboundAttachments(attachments, ticketId) {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];

  const filtered = attachments.slice(0, MAX_ATTACHMENTS);
  const bucket = getStorage().bucket();
  const results = [];

  for (const attachment of filtered) {
    const path = String(attachment?.path || '').trim();
    const filename = String(attachment?.name || attachment?.filename || 'anexo').trim() || 'anexo';
    const mimeType = String(attachment?.contentType || attachment?.mimeType || 'application/octet-stream').trim() || 'application/octet-stream';
    let buffer = null;

    if (!isAttachmentPathInTicketScope(path, ticketId)) {
      console.error('[mail] anexo de saída recusado: path fora do escopo da OS', { ticketId, path });
      continue;
    }

    try {
      const [downloaded] = await bucket.file(path).download();
      buffer = downloaded;
    } catch (error) {
      console.error('[mail] falha ao baixar anexo do Storage para reenvio', error);
      buffer = null;
    }

    if (!buffer) continue;
    if (buffer.length > MAX_ATTACHMENT_SIZE) continue;

    results.push({
      filename,
      mimeType,
      size: buffer.length,
      buffer,
    });
  }

  return results;
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

      // Push avança o historyId mesmo com falha por-mensagem: uma msg que falha aqui
      // NÃO entra em seenMessageIds (só o sync o gerencia), então o próximo sync a
      // repega e retenta — sem bloquear o avanço do push nem dropar a mensagem.
      ({ processed } = await processGmailInboundMessageIds(db, messageIds, 'gmail-api-push'));

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


export default async function handler(req, res) {
  const route = String(req.query?.route || '').trim().toLowerCase();

  if (route === 'send') return handleSend(req, res);
  if (route === 'health') return handleHealth(req, res);
  if (route === 'dropped-inbound') return handleDroppedInbound(req, res);
  if (route === 'outbox-worker') return handleEmailOutboxWorker(req, res);
  if (route === 'rain-alert') return handleRainAlert(req, res);
  if (route === 'gmail-sync') return handleGmailSync(req, res);
  if (route === 'reprocess-inbound') return handleReprocessInbound(req, res);
  if (route === 'gmail-watch') return handleGmailWatch(req, res);
  if (route === 'gmail-push') return handleGmailPush(req, res);

  res.setHeader('Allow', 'GET, POST');
  return sendJson(res, 404, { ok: false, error: 'Rota de mail inválida.' });
}
