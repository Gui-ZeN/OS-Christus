import { TICKET_STATUS } from '../constants/ticketStatus';
import { PaymentRecord, Quote, Ticket, TicketAttachment } from '../types';
import { getAuthenticatedActorHeaders } from './actorHeaders';
import { fetchCatalog } from './catalogApi';
import { fetchDirectory } from './directoryApi';
import { fetchProcurementData } from './procurementApi';
import { getTicketRegionLabel, getTicketSiteLabel } from '../utils/ticketTerritory';

function resolveTicketEmail(ticket: Ticket): string | null {
  if (ticket.requesterEmail?.trim()) return ticket.requesterEmail.trim();
  return null;
}

function buildTrackingUrl(ticket: Ticket) {
  return `${window.location.origin}/?tracking=${encodeURIComponent(ticket.trackingToken)}`;
}

function buildDirectorReviewUrl(ticket: Ticket, approvalTab: 'solutions' | 'budgets' | 'contracts') {
  const params = new URLSearchParams({
    view: 'approvals',
    approvalTab,
    ticketId: ticket.id,
  });
  return `${window.location.origin}/?${params.toString()}`;
}

function buildFinanceReviewUrl(ticket: Ticket) {
  const params = new URLSearchParams({
    view: 'finance',
    ticketId: ticket.id,
  });
  return `${window.location.origin}/?${params.toString()}`;
}

function guaranteeSummary(ticket: Ticket) {
  if (!ticket.guarantee?.startAt || !ticket.guarantee?.endAt) return 'Não informada';
  return `${ticket.guarantee.months} mês(es) - até ${ticket.guarantee.endAt.toLocaleDateString('pt-BR')}`;
}

async function buildVariables(ticket: Ticket, extra: Record<string, unknown> = {}) {
  let regionLabel = ticket.region;
  let siteLabel = ticket.sede;

  try {
    const catalog = await fetchCatalog();
    regionLabel = getTicketRegionLabel(ticket, catalog.regions, catalog.sites);
    siteLabel = getTicketSiteLabel(ticket, catalog.sites);
  } catch {
    // Mantém fallback com os dados atuais do ticket.
  }

  return {
    requester: {
      name: ticket.requester,
      email: ticket.requesterEmail || '',
    },
    ticket: {
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      region: regionLabel,
      sede: siteLabel,
      sector: ticket.sector,
      macroService: ticket.macroServiceName || '',
      service: ticket.serviceCatalogName || '',
    },
    tracking: {
      url: buildTrackingUrl(ticket),
    },
    guarantee: {
      summary: guaranteeSummary(ticket),
    },
    ...extra,
  };
}

function resolveStatusTrigger(status: string) {
  switch (status) {
    case TICKET_STATUS.WAITING_TECH_OPINION:
      return 'EMAIL-TRIAGEM-EM-ANDAMENTO';
    case TICKET_STATUS.WAITING_SOLUTION_APPROVAL:
      return 'EMAIL-PARECER-TECNICO';
    case TICKET_STATUS.WAITING_BUDGET:
      return 'EMAIL-AGUARDANDO-ORCAMENTO';
    case TICKET_STATUS.WAITING_BUDGET_APPROVAL:
    case TICKET_STATUS.WAITING_CONTRACT_APPROVAL:
      return 'EMAIL-EM-APROVACAO';
    case TICKET_STATUS.WAITING_PRELIM_ACTIONS:
      return 'EMAIL-ACOES-PRELIMINARES';
    case TICKET_STATUS.IN_PROGRESS:
      return 'EMAIL-EXECUCAO-INICIADA';
    case TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL:
      return 'EMAIL-VALIDACAO-SOLICITANTE';
    case TICKET_STATUS.WAITING_PAYMENT:
      return 'EMAIL-AGUARDANDO-PAGAMENTO';
    case TICKET_STATUS.CLOSED:
      return 'EMAIL-OS-ENCERRADA';
    case TICKET_STATUS.CANCELED:
      return 'EMAIL-OS-CANCELADA';
    default:
      return null;
  }
}

function resolveDirectorCancellationReason(ticket: Ticket): string | null {
  const historyItems = Array.isArray(ticket.history) ? [...ticket.history] : [];
  for (let index = historyItems.length - 1; index >= 0; index -= 1) {
    const item = historyItems[index];
    const text = String(item?.text || '').trim();
    if (!text) continue;
    if (!/OS cancelada pela Diretoria\./i.test(text)) continue;

    const match = text.match(/Motivo:\s*(.+)$/i);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
    return text;
  }
  return null;
}

function buildDirectorTicketSummary(ticket: Ticket): string {
  const serviceLabel = ticket.serviceCatalogName || ticket.macroServiceName || 'Não informado';
  const locationLabel = `${ticket.region || 'Não informada'} / ${ticket.sede || 'Não informada'}`;

  return [
    `- Assunto: ${ticket.subject || 'Não informado'}`,
    `- Solicitante: ${ticket.requester || 'Não informado'}`,
    `- Setor: ${ticket.sector || 'Não informado'}`,
    `- Local: ${locationLabel}`,
    `- Tipo de manutenção: ${ticket.type || 'Não informado'}`,
    `- Classificação técnica: ${serviceLabel}`,
    `- Status atual: ${ticket.status || 'Não informado'}`,
  ].join('\n');
}

function buildDirectorEmailBody(ticket: Ticket, isApprovalStatus: boolean, summaryList: string): string {
  const intro = isApprovalStatus
    ? `A OS ${ticket.id} está em aprovação e aguarda decisão.`
    : `A OS ${ticket.id} entrou na etapa de solução e requer acompanhamento da Diretoria.`;

  return [
    intro,
    `Status atual: ${ticket.status || 'Não informado'}`,
    '',
    'Resumo da OS:',
    '',
    summaryList,
  ].join('\n');
}

function normalizeRoundCategory(value: unknown): 'initial' | 'additive' {
  return value === 'additive' ? 'additive' : 'initial';
}

function normalizeQuoteStatus(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function parseCurrencyInput(value: string) {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

function resolveQuoteDisplayValue(quote: Quote) {
  const raw = String(quote.totalValue || quote.value || '').trim();
  if (raw) return raw;
  const numeric = parseCurrencyInput(raw);
  return numeric > 0 ? formatCurrency(numeric) : '-';
}

async function buildDirectorBudgetContext(ticket: Ticket) {
  const measurementSheetUrl = String(ticket.executionProgress?.measurementSheetUrl || '').trim();
  try {
    const procurement = await fetchProcurementData();
    const allQuotes = Array.isArray(procurement.quotesByTicket?.[ticket.id]) ? procurement.quotesByTicket[ticket.id] : [];
    if (allQuotes.length === 0) {
      return {
        roundTypeLabel: 'Orçamento inicial - rodada 1',
        additiveReason: null as string | null,
        quoteBlocks: [] as string[],
        measurementSheetUrl,
      };
    }

    const pendingQuotes = allQuotes.filter(quote => normalizeQuoteStatus((quote as Quote).status) === 'pending');
    const sourceQuotes = pendingQuotes.length > 0 ? pendingQuotes : allQuotes;
    const additivePending = sourceQuotes.filter(quote => normalizeRoundCategory((quote as Quote).category) === 'additive');

    if (additivePending.length > 0) {
      const additiveIndexes = additivePending
        .map(quote => Number((quote as Quote).additiveIndex || 0))
        .filter(value => Number.isFinite(value) && value > 0);
      const additiveIndex = additiveIndexes.length > 0 ? Math.max(...additiveIndexes) : 1;
      const roundQuotes = additivePending.filter(quote => Number((quote as Quote).additiveIndex || 0) === additiveIndex);
      const additiveReason = String((roundQuotes[0] as Quote)?.additiveReason || '').trim() || null;
      const quoteBlocks = roundQuotes.map((quote, index) => {
        const normalized = quote as Quote;
        return [
          `- Cotação ${index + 1}`,
          `- Fornecedor: ${normalized.vendor || 'Fornecedor não informado'}`,
          `- Valor total: ${resolveQuoteDisplayValue(normalized)}`,
          `- Material: ${normalized.materialValue || '-'}`,
          `- Mão de obra: ${normalized.laborValue || '-'}`,
        ].join('\n');
      });
      return {
        roundTypeLabel: `Aditivo ${additiveIndex}`,
        additiveReason,
        quoteBlocks,
        measurementSheetUrl,
      };
    }

    const initialQuotes = sourceQuotes.filter(quote => normalizeRoundCategory((quote as Quote).category) === 'initial');
    const initialRoundIndex = Math.max(
      1,
      ...initialQuotes.map(quote => Number((quote as Quote).initialRoundIndex || 1)).filter(value => Number.isFinite(value) && value > 0)
    );
    const roundQuotes = initialQuotes.filter(quote => Number((quote as Quote).initialRoundIndex || 1) === initialRoundIndex);
    const quoteBlocks = roundQuotes.map((quote, index) => {
      const normalized = quote as Quote;
      return [
        `- Cotação ${index + 1}`,
        `- Fornecedor: ${normalized.vendor || 'Fornecedor não informado'}`,
        `- Valor total: ${resolveQuoteDisplayValue(normalized)}`,
        `- Material: ${normalized.materialValue || '-'}`,
        `- Mão de obra: ${normalized.laborValue || '-'}`,
      ].join('\n');
    });
    return {
      roundTypeLabel: `Orçamento inicial - rodada ${initialRoundIndex}`,
      additiveReason: null as string | null,
      quoteBlocks,
      measurementSheetUrl,
    };
  } catch {
    return {
      roundTypeLabel: 'Orçamento inicial - rodada 1',
      additiveReason: null as string | null,
      quoteBlocks: [] as string[],
      measurementSheetUrl,
    };
  }
}

function buildAttachmentList(attachments: TicketAttachment[]) {
  return attachments
    .filter(item => String(item?.url || '').trim())
    .map(item => `- ${item.name || 'Arquivo'}: ${item.url}`);
}

function resolveLatestInternalTechEntry(ticket: Ticket) {
  return [...(Array.isArray(ticket.history) ? ticket.history : [])]
    .reverse()
    .find(item => item.type === 'tech' && item.visibility === 'internal');
}

function appendAttachmentsToBody(message: string, attachments: TicketAttachment[]) {
  const links = buildAttachmentList(attachments);
  if (links.length === 0) return message.trim();
  const base = message.trim();
  if (!base) return ['Anexos enviados:', ...links].join('\n');
  return [base, '', 'Anexos enviados:', ...links].join('\n');
}

async function postEmail(payload: Record<string, unknown>, options?: { throwOnError?: boolean }) {
  try {
    const headers = await getAuthenticatedActorHeaders();
    const response = await fetch('/api/mail?route=send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const json = await response.json().catch(() => null);
      const error = new Error(json?.error || 'Falha ao enviar e-mail.');
      if (options?.throwOnError) {
        throw error;
      }
      throw error;
    }
    return true;
  } catch (error) {
    console.error('[ticketEmail] envio falhou', error);
    if (options?.throwOnError) {
      throw error instanceof Error ? error : new Error('Falha ao enviar e-mail.');
    }
    return false;
  }
}

function normalizeEmailAttachments(attachments: TicketAttachment[] = []) {
  return attachments
    .filter(item => String(item?.path || item?.url || '').trim())
    .map(item => ({
      id: item.id,
      name: item.name,
      path: item.path,
      url: item.url,
      contentType: item.contentType,
      size: item.size,
    }));
}

function shouldNotifyRequesterForStatus(ticket: Ticket, status: string, previousStatus: string) {
  if (status === TICKET_STATUS.WAITING_TECH_OPINION) {
    return previousStatus === TICKET_STATUS.NEW;
  }

  const blockedStatuses = new Set<string>([
    TICKET_STATUS.WAITING_SOLUTION_APPROVAL,
    TICKET_STATUS.WAITING_BUDGET,
    TICKET_STATUS.WAITING_BUDGET_APPROVAL,
    TICKET_STATUS.WAITING_CONTRACT_UPLOAD,
    TICKET_STATUS.WAITING_CONTRACT_APPROVAL,
    TICKET_STATUS.WAITING_PAYMENT,
  ]);
  if (blockedStatuses.has(status)) return false;

  const returningFromApprovalToExecution =
    status === TICKET_STATUS.IN_PROGRESS &&
    previousStatus === TICKET_STATUS.WAITING_BUDGET_APPROVAL &&
    Boolean(ticket.executionProgress?.startedAt);
  if (returningFromApprovalToExecution) return false;

  return true;
}

function buildRequesterStatusLabel(status: string) {
  switch (status) {
    case TICKET_STATUS.NEW:
      return 'Solicitação registrada';
    case TICKET_STATUS.WAITING_TECH_OPINION:
      return 'Solicitação aceita para atendimento';
    case TICKET_STATUS.WAITING_SOLUTION_APPROVAL:
      return 'Plano técnico em avaliação';
    case TICKET_STATUS.WAITING_BUDGET:
    case TICKET_STATUS.WAITING_BUDGET_APPROVAL:
    case TICKET_STATUS.WAITING_CONTRACT_UPLOAD:
    case TICKET_STATUS.WAITING_CONTRACT_APPROVAL:
      return 'Planejamento administrativo em andamento';
    case TICKET_STATUS.WAITING_PRELIM_ACTIONS:
      return 'Obra em preparação';
    case TICKET_STATUS.IN_PROGRESS:
      return 'Execução iniciada';
    case TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL:
      return 'Execução concluída';
    case TICKET_STATUS.WAITING_PAYMENT:
      return 'Entrega validada';
    case TICKET_STATUS.CLOSED:
      return 'Obra concluída';
    case TICKET_STATUS.CANCELED:
      return 'Solicitação encerrada';
    default:
      return status || 'Atualização da solicitação';
  }
}

function buildRequesterUpdateCopy(status: string, messageBody: string, cancellationReason: string | null) {
  switch (status) {
    case TICKET_STATUS.WAITING_TECH_OPINION:
      return {
        title: 'Solicitação aceita para atendimento',
        intro: 'Sua solicitação foi aceita pela equipe e seguirá para o plano técnico.',
        ctaLabel: 'Acompanhar solicitação',
      };
    case TICKET_STATUS.WAITING_SOLUTION_APPROVAL:
      return {
        title: 'Plano técnico em avaliação',
        intro: 'O parecer técnico foi consolidado e está em avaliação da diretoria.',
        ctaLabel: 'Acompanhar solicitação',
      };
    case TICKET_STATUS.WAITING_BUDGET:
    case TICKET_STATUS.WAITING_BUDGET_APPROVAL:
    case TICKET_STATUS.WAITING_CONTRACT_UPLOAD:
    case TICKET_STATUS.WAITING_CONTRACT_APPROVAL:
      return {
        title: 'Planejamento administrativo em andamento',
        intro: 'Sua OS está em preparação administrativa para execução.',
        ctaLabel: 'Acompanhar solicitação',
      };
    case TICKET_STATUS.WAITING_PRELIM_ACTIONS:
      return {
        title: 'Obra em preparação',
        intro: 'A equipe está concluindo as preparações para iniciar a execução.',
        ctaLabel: 'Acompanhar solicitação',
      };
    case TICKET_STATUS.IN_PROGRESS:
      return {
        title: 'Execução da obra iniciada',
        intro: 'A obra foi iniciada pela equipe técnica.',
        ctaLabel: 'Acompanhar execução',
      };
    case TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL:
      return {
        title: 'Execução concluída',
        intro: 'A obra foi concluída. Confirme a entrega no link para seguir com o encerramento.',
        ctaLabel: 'Avaliar e confirmar entrega',
      };
    case TICKET_STATUS.CLOSED:
      return {
        title: 'Obra concluída e encerrada',
        intro: 'Sua solicitação foi concluída com sucesso.',
        ctaLabel: 'Ver encerramento',
      };
    case TICKET_STATUS.CANCELED:
      return {
        title: 'Solicitação encerrada',
        intro: cancellationReason || messageBody,
        ctaLabel: 'Ver atualização',
      };
    default:
      return {
        title: 'Atualização da solicitação',
        intro: messageBody,
        ctaLabel: 'Ver atualização',
      };
  }
}

const DIRECTOR_FLOW_STATUSES = new Set<string>([
  TICKET_STATUS.WAITING_SOLUTION_APPROVAL,
  TICKET_STATUS.WAITING_BUDGET_APPROVAL,
  TICKET_STATUS.WAITING_CONTRACT_APPROVAL,
]);

const FINANCE_FLOW_STATUSES = new Set<string>([
  TICKET_STATUS.WAITING_PAYMENT,
]);

function resolveDirectorApprovalTab(status: string): 'solutions' | 'budgets' | 'contracts' {
  if (status === TICKET_STATUS.WAITING_CONTRACT_APPROVAL) return 'contracts';
  if (status === TICKET_STATUS.WAITING_BUDGET_APPROVAL) return 'budgets';
  const normalized = String(status || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  if (normalized.includes('contrato')) return 'contracts';
  if (normalized.includes('orcamento') || normalized.includes('aditivo')) return 'budgets';
  return 'solutions';
}

async function sendToConfiguredFlowRecipients(payload: Record<string, unknown>) {
  const trigger = String(payload?.trigger || '').trim().toUpperCase();
  let enrichedPayload = { ...payload };

  if (!payload?.toEmail && trigger.startsWith('EMAIL-DIRETORIA-')) {
    try {
      const directory = await fetchDirectory();
      const directorRecipients = (directory.users || [])
        .filter(user => {
          const role = String(user.role || '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
          const status = String(user.status || 'Ativo')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
          return (role === 'diretor' || role === 'director') && user.active !== false && (status === 'ativo' || status === 'active');
        })
        .map(user => String(user.email || '').trim().toLowerCase())
        .filter(Boolean);

      if (directorRecipients.length > 0) {
        enrichedPayload = {
          ...payload,
          toEmail: [...new Set(directorRecipients)].join(', '),
        };
      }
    } catch (error) {
      console.error('[ticketEmail] failed to resolve director recipients from directory', error);
    }
  }

  const sentToConfiguredRecipients = await postEmail({
    ...enrichedPayload,
    allowThreadRecipientFallback: false,
  });
  if (sentToConfiguredRecipients) return true;

  if (trigger === 'EMAIL-DIRETORIA-SOLUCAO') {
    const sentUsingApprovalTrigger = await postEmail({
      ...enrichedPayload,
      trigger: 'EMAIL-DIRETORIA-APROVACAO',
      allowThreadRecipientFallback: false,
    });
    if (sentUsingApprovalTrigger) return true;
  }

  await postEmail({
    ...enrichedPayload,
    allowThreadRecipientFallback: false,
    internalCopy: true,
    skipThread: true,
  });
  return false;
}

export async function notifyTicketCreated(ticket: Ticket) {
  const requesterEmail = resolveTicketEmail(ticket);
  if (!requesterEmail) return;

  const variables = await buildVariables(ticket);
  await postEmail({
    ticketId: ticket.id,
    trackingToken: ticket.trackingToken,
    toEmail: requesterEmail,
    trigger: 'EMAIL-NOVA-OS',
    variables,
    templateData: {
      title: 'Nova solicitação registrada',
      intro: 'Recebemos sua solicitação e ela já está em análise pela equipe.',
      ticketSubject: ticket.subject,
      status: ticket.status,
      ctaUrl: buildTrackingUrl(ticket),
      ctaLabel: 'Ver atualização',
    },
  });

  await postEmail({
    ticketId: ticket.id,
    trackingToken: ticket.trackingToken,
    trigger: 'EMAIL-NOVA-OS',
    internalCopy: true,
    skipThread: true,
    variables,
    templateData: {
      title: 'Nova OS na fila de triagem',
      intro: `${ticket.id} foi registrada e já pode ser triada pela equipe.`,
      ticketSubject: ticket.subject,
      status: ticket.status,
      ctaUrl: buildTrackingUrl(ticket),
      ctaLabel: 'Ver atualização',
    },
  });
}

export async function notifyTicketStatusChange(ticket: Ticket, previousStatus: string) {
  if (previousStatus === ticket.status) return;

  const trigger = resolveStatusTrigger(ticket.status);
  const requesterEmail = resolveTicketEmail(ticket);
  const directorSummary =
    DIRECTOR_FLOW_STATUSES.has(ticket.status) ? buildDirectorTicketSummary(ticket) : '';
  const cancellationReason =
    ticket.status === TICKET_STATUS.CANCELED ? resolveDirectorCancellationReason(ticket) : null;
  const messageBody = cancellationReason || `Status alterado de "${previousStatus}" para "${ticket.status}".`;
  const variables = await buildVariables(ticket, {
    previousStatus,
    currentStatus: ticket.status,
    director: {
      summary: directorSummary,
    },
    message: {
      sender: 'Sistema OS Christus',
      body: messageBody,
    },
  });

  if (requesterEmail && shouldNotifyRequesterForStatus(ticket, ticket.status, previousStatus)) {
    const requesterCopy = buildRequesterUpdateCopy(ticket.status, messageBody, cancellationReason);
    await postEmail({
      ticketId: ticket.id,
      trackingToken: ticket.trackingToken,
      toEmail: requesterEmail,
      trigger: trigger || 'EMAIL-NOVA-MENSAGEM',
      variables,
      templateData: {
        title: requesterCopy.title,
        intro: requesterCopy.intro,
        ticketSubject: ticket.subject,
        status: buildRequesterStatusLabel(ticket.status),
        ctaUrl: buildTrackingUrl(ticket),
        ctaLabel: requesterCopy.ctaLabel,
      },
    });
  }

  if (DIRECTOR_FLOW_STATUSES.has(ticket.status)) {
    const directorTab = resolveDirectorApprovalTab(ticket.status);
    const isApprovalStatus = directorTab !== 'solutions';
    const budgetContext = directorTab === 'budgets' ? await buildDirectorBudgetContext(ticket) : null;
    const latestInternalTechEntry = resolveLatestInternalTechEntry(ticket);
    const latestAttachments = Array.isArray(latestInternalTechEntry?.attachments) ? latestInternalTechEntry.attachments : [];
    const technicalBlock = directorTab === 'solutions' && latestInternalTechEntry?.text
      ? `Parecer técnico:\n${latestInternalTechEntry.text}`
      : '';
    const budgetBlock =
      budgetContext
        ? [
            `Tipo da rodada: ${budgetContext.roundTypeLabel}`,
            budgetContext.additiveReason ? `Motivo do aditivo: ${budgetContext.additiveReason}` : null,
            budgetContext.quoteBlocks.length > 0 ? ['', 'Cotações da rodada:', '', ...budgetContext.quoteBlocks] : null,
            budgetContext.measurementSheetUrl ? ['', `Planilha de medição: ${budgetContext.measurementSheetUrl}`] : null,
          ]
            .flat()
            .filter(Boolean)
            .join('\n')
        : '';
    const directorBody = [buildDirectorEmailBody(ticket, isApprovalStatus, directorSummary), budgetBlock, technicalBlock].filter(Boolean).join('\n\n');
    await sendToConfiguredFlowRecipients({
      ticketId: ticket.id,
      trackingToken: ticket.trackingToken,
      trigger: isApprovalStatus ? 'EMAIL-DIRETORIA-APROVACAO' : 'EMAIL-DIRETORIA-SOLUCAO',
      attachments: normalizeEmailAttachments(latestAttachments),
      variables,
      templateData: {
        title: isApprovalStatus
          ? (budgetContext ? `${budgetContext.roundTypeLabel} em aprovação da Diretoria` : 'Etapa em aprovação da Diretoria')
          : 'Nova demanda para avaliação da Diretoria',
        intro: isApprovalStatus
          ? (budgetContext
            ? `${ticket.id} está em ${budgetContext.roundTypeLabel.toLowerCase()} e requer aprovação da Diretoria.`
            : `${ticket.id} já está pronta para revisão da Diretoria.`)
          : `${ticket.id} entrou na etapa de solução e requer acompanhamento da Diretoria.`,
        ticketSubject: ticket.subject,
        status: ticket.status,
        bodyText: directorBody,
        ctaUrl: buildDirectorReviewUrl(ticket, directorTab),
        ctaLabel: isApprovalStatus ? 'Abrir aprovação' : 'Abrir painel da Diretoria',
      },
    });
  }

  if (FINANCE_FLOW_STATUSES.has(ticket.status)) {
    await sendToConfiguredFlowRecipients({
      ticketId: ticket.id,
      trackingToken: ticket.trackingToken,
      trigger: 'EMAIL-FINANCEIRO-PAGAMENTO',
      variables,
      templateData: {
        title: 'Pagamento pendente',
        intro: `${ticket.id} entrou em etapa financeira e precisa de tratativa de pagamento.`,
        ticketSubject: ticket.subject,
        status: ticket.status,
        ctaUrl: buildFinanceReviewUrl(ticket),
        ctaLabel: 'Abrir financeiro',
      },
    });
  }
}

export async function notifyTicketPublicReply(
  ticket: Ticket,
  sender: string,
  message: string,
  attachments: TicketAttachment[] = []
) {
  const toEmail = resolveTicketEmail(ticket);
  const bodyText = appendAttachmentsToBody(message, attachments);
  if (!toEmail || !bodyText.trim()) return;

  await postEmail({
    ticketId: ticket.id,
    trackingToken: ticket.trackingToken,
    toEmail,
    trigger: 'EMAIL-NOVA-MENSAGEM',
    variables: await buildVariables(ticket, {
      message: {
        sender,
        body: bodyText,
      },
    }),
    templateData: {
      title: 'Nova mensagem registrada',
      intro: `${sender} enviou uma nova mensagem sobre o chamado ${ticket.subject}.`,
      ticketSubject: ticket.subject,
      status: ticket.status,
      bodyText,
      ctaUrl: buildTrackingUrl(ticket),
      ctaLabel: 'Ver mensagem',
    },
  });
}

export async function notifyTicketDirectorReply(
  ticket: Ticket,
  sender: string,
  message: string,
  attachments: TicketAttachment[] = []
) {
  const bodyText = appendAttachmentsToBody(message, attachments);
  if (!bodyText.trim()) return;

  const directorTab = resolveDirectorApprovalTab(ticket.status);
  const trigger = directorTab === 'solutions' ? 'EMAIL-DIRETORIA-SOLUCAO' : 'EMAIL-DIRETORIA-APROVACAO';
  const variables = await buildVariables(ticket, {
    message: {
      sender,
      body: bodyText,
    },
  });

  await sendToConfiguredFlowRecipients({
    ticketId: ticket.id,
    trackingToken: ticket.trackingToken,
    trigger,
    attachments: normalizeEmailAttachments(attachments),
    variables,
    templateData: {
      title: 'Nova mensagem para a Diretoria',
      intro: `${sender} enviou uma atualização interna para a Diretoria.`,
      ticketSubject: ticket.subject,
      status: ticket.status,
      bodyText,
      skipGreeting: true,
      ctaUrl: buildDirectorReviewUrl(ticket, directorTab),
      ctaLabel: 'Abrir painel da Diretoria',
    },
  });
}

export async function notifyAdditiveToDirector(ticket: Ticket, additiveIndex: number, additiveReason: string) {
  const budgetContext = await buildDirectorBudgetContext(ticket);
  const summaryList = buildDirectorTicketSummary(ticket);
  const bodyText = [
    `${budgetContext.roundTypeLabel || `Aditivo ${additiveIndex}`} criado na etapa de execução e aguarda aprovação da Diretoria.`,
    `Motivo do aditivo: ${additiveReason || budgetContext.additiveReason || 'Não informado'}`,
    ...(budgetContext.quoteBlocks.length > 0 ? ['', 'Cotações da rodada:', '', ...budgetContext.quoteBlocks] : []),
    ...(budgetContext.measurementSheetUrl ? ['', `Planilha de medição: ${budgetContext.measurementSheetUrl}`] : []),
    '',
    'Resumo da OS:',
    '',
    summaryList,
  ].join('\n');

  const variables = await buildVariables(ticket, {
    director: { summary: summaryList },
    message: { sender: 'Sistema OS Christus', body: bodyText },
  });

  await sendToConfiguredFlowRecipients({
    ticketId: ticket.id,
    trackingToken: ticket.trackingToken,
    trigger: 'EMAIL-DIRETORIA-APROVACAO',
    variables,
    templateData: {
      title: `${budgetContext.roundTypeLabel || `Aditivo ${additiveIndex}`} aguardando aprovação`,
      intro: `${ticket.id} possui ${budgetContext.roundTypeLabel?.toLowerCase() || `aditivo ${additiveIndex}`} em andamento e requer aprovação da Diretoria.`,
      ticketSubject: ticket.subject,
      status: ticket.status,
      bodyText,
      ctaUrl: buildDirectorReviewUrl(ticket, 'budgets'),
      ctaLabel: 'Abrir aprovação do aditivo',
    },
  });
}

export async function notifyPaymentDispatch(
  ticket: Ticket,
  payment: PaymentRecord,
  grossAmount: number,
  taxAmount: number,
  netAmount: number,
  recipients: string[]
) {
  if (recipients.length === 0) return;

  const lancamentoLabel = payment.label || `Lançamento ${payment.installmentNumber || 1}`;
  const subject = `${ticket.id} - Pagamento - ${lancamentoLabel}`;
  const measurementSheetUrl = String(ticket.executionProgress?.measurementSheetUrl || '').trim();

  const attachmentLinks = buildAttachmentList(payment.attachments || []);
  const bodyLines = [
    `Segue o lançamento de pagamento referente à OS ${ticket.id}.`,
    '',
    `Lançamento: ${lancamentoLabel}`,
    `Valor bruto: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(grossAmount)}`,
    `Imposto: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(taxAmount)}`,
    `Valor a pagar (líquido): ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(netAmount)}`,
  ];
  if (measurementSheetUrl) {
    bodyLines.push('', `Planilha de medição: ${measurementSheetUrl}`);
  }
  if (attachmentLinks.length > 0) {
    bodyLines.push('', 'Anexos do lançamento (links):', ...attachmentLinks);
  }
  const bodyText = bodyLines.join('\n');

  const variables = await buildVariables(ticket, {
    message: { sender: 'Financeiro', body: bodyText },
  });

  await postEmail({
    ticketId: ticket.id,
    trackingToken: ticket.trackingToken,
    toEmail: recipients.join(', '),
    trigger: 'EMAIL-FINANCEIRO-PAGAMENTO',
    subject,
    variables,
    templateData: {
      title: subject,
      intro: `Lançamento de pagamento para a OS ${ticket.id}.`,
      ticketSubject: ticket.subject,
      status: ticket.status,
      bodyText,
      ctaUrl: buildFinanceReviewUrl(ticket),
      ctaLabel: 'Abrir financeiro',
    },
  }, { throwOnError: true });
}
