import { TICKET_STATUS } from '../constants/ticketStatus';
import { Ticket } from '../types';
import { getAuthenticatedActorHeaders } from './actorHeaders';
import { fetchCatalog } from './catalogApi';
import { getTicketRegionLabel, getTicketSiteLabel } from '../utils/ticketTerritory';

function resolveTicketEmail(ticket: Ticket): string | null {
  if (ticket.requesterEmail?.trim()) return ticket.requesterEmail.trim();
  return null;
}

function buildTrackingUrl(ticket: Ticket) {
  return `${window.location.origin}/?tracking=${encodeURIComponent(ticket.trackingToken)}`;
}

function buildBudgetReviewUrl(ticket: Ticket) {
  const params = new URLSearchParams({
    view: 'approvals',
    approvalTab: 'budgets',
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
    // Mant?m fallback com os dados atuais do ticket.
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

async function postEmail(payload: Record<string, unknown>) {
  try {
    const headers = await getAuthenticatedActorHeaders();
    const response = await fetch('/api/mail?route=send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const json = await response.json().catch(() => null);
      throw new Error(json?.error || 'Falha ao enviar e-mail.');
    }
    return true;
  } catch (error) {
    console.error('[ticketEmail] envio falhou', error);
    return false;
  }
}

function shouldNotifyRequesterForStatus(status: string) {
  const blockedStatuses = new Set<string>([
    TICKET_STATUS.WAITING_BUDGET,
    TICKET_STATUS.WAITING_BUDGET_APPROVAL,
    TICKET_STATUS.WAITING_CONTRACT_APPROVAL,
    TICKET_STATUS.WAITING_PAYMENT,
  ]);
  return !blockedStatuses.has(status);
}

const DIRECTOR_FLOW_STATUSES = new Set<string>([
  TICKET_STATUS.WAITING_SOLUTION_APPROVAL,
  TICKET_STATUS.WAITING_BUDGET_APPROVAL,
  TICKET_STATUS.WAITING_CONTRACT_APPROVAL,
]);

const FINANCE_FLOW_STATUSES = new Set<string>([
  TICKET_STATUS.WAITING_PAYMENT,
]);

async function sendToConfiguredFlowRecipients(payload: Record<string, unknown>) {
  const sentToConfiguredRecipients = await postEmail({
    ...payload,
    allowThreadRecipientFallback: false,
  });
  if (sentToConfiguredRecipients) return;
  await postEmail({
    ...payload,
    allowThreadRecipientFallback: false,
    internalCopy: true,
    skipThread: true,
  });
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
  const variables = await buildVariables(ticket, {
    previousStatus,
    currentStatus: ticket.status,
    message: {
      sender: 'Sistema OS Christus',
      body: `Status alterado de "${previousStatus}" para "${ticket.status}".`,
    },
  });

  if (requesterEmail && shouldNotifyRequesterForStatus(ticket.status)) {
    await postEmail({
      ticketId: ticket.id,
      trackingToken: ticket.trackingToken,
      toEmail: requesterEmail,
      trigger: trigger || 'EMAIL-NOVA-MENSAGEM',
      variables,
      templateData: {
        title: 'Atualização da solicitação',
        intro: `Status alterado de "${previousStatus}" para "${ticket.status}".`,
        ticketSubject: ticket.subject,
        status: ticket.status,
        ctaUrl: buildTrackingUrl(ticket),
        ctaLabel: 'Ver atualização',
      },
    });
  }

  if (DIRECTOR_FLOW_STATUSES.has(ticket.status)) {
    const isApprovalStatus =
      ticket.status === TICKET_STATUS.WAITING_BUDGET_APPROVAL ||
      ticket.status === TICKET_STATUS.WAITING_CONTRACT_APPROVAL;
    await sendToConfiguredFlowRecipients({
      ticketId: ticket.id,
      trackingToken: ticket.trackingToken,
      trigger: isApprovalStatus ? 'EMAIL-DIRETORIA-APROVACAO' : 'EMAIL-DIRETORIA-SOLUCAO',
      variables,
      templateData: {
        title: isApprovalStatus ? 'Etapa em aprovação da Diretoria' : 'Nova demanda para avaliação da Diretoria',
        intro: isApprovalStatus
          ? `${ticket.id} já está pronta para revisão da Diretoria.`
          : `${ticket.id} entrou na etapa de solução e requer acompanhamento da Diretoria.`,
        ticketSubject: ticket.subject,
        status: ticket.status,
        ctaUrl: isApprovalStatus ? buildBudgetReviewUrl(ticket) : buildTrackingUrl(ticket),
        ctaLabel: isApprovalStatus ? 'Abrir aprovação' : 'Acompanhar evolução',
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
        ctaUrl: buildTrackingUrl(ticket),
        ctaLabel: 'Acompanhar OS',
      },
    });
  }
}

export async function notifyTicketPublicReply(ticket: Ticket, sender: string, message: string) {
  const toEmail = resolveTicketEmail(ticket);
  if (!toEmail || !message.trim()) return;

  await postEmail({
    ticketId: ticket.id,
    trackingToken: ticket.trackingToken,
    toEmail,
    trigger: 'EMAIL-NOVA-MENSAGEM',
    variables: await buildVariables(ticket, {
      message: {
        sender,
        body: message.trim(),
      },
    }),
    templateData: {
      title: 'Nova mensagem registrada',
      intro: `${sender} enviou uma nova mensagem sobre o chamado ${ticket.subject}.`,
      ticketSubject: ticket.subject,
      status: ticket.status,
      bodyText: message.trim(),
      ctaUrl: buildTrackingUrl(ticket),
      ctaLabel: 'Ver mensagem',
    },
  });
}
