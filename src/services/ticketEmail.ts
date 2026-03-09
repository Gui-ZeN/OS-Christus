import { TICKET_STATUS } from '../constants/ticketStatus';
import { Ticket } from '../types';
import { getAuthenticatedActorHeaders } from './actorHeaders';

function requesterEmailFallback(requester: string): string | null {
  const key = requester.toLowerCase();
  const map: Record<string, string> = {
    'recepção': 'recepcao@empresa.com',
    'diretoria': 'diretoria@empresa.com',
    rh: 'rh@empresa.com',
    ti: 'ti@empresa.com',
    limpeza: 'limpeza@empresa.com',
    facilities: 'facilities@empresa.com',
    'engenharia predial': 'engenharia@empresa.com',
  };
  return map[key] || null;
}

function resolveTicketEmail(ticket: Ticket): string | null {
  if (ticket.requesterEmail?.trim()) return ticket.requesterEmail.trim();
  return requesterEmailFallback(ticket.requester);
}

function buildTrackingUrl(ticket: Ticket) {
  return `${window.location.origin}/?tracking=${encodeURIComponent(ticket.trackingToken)}`;
}

function guaranteeSummary(ticket: Ticket) {
  if (!ticket.guarantee?.startAt || !ticket.guarantee?.endAt) return 'Não informada';
  return `${ticket.guarantee.months} mês(es) - até ${ticket.guarantee.endAt.toLocaleDateString('pt-BR')}`;
}

function buildVariables(ticket: Ticket, extra: Record<string, unknown> = {}) {
  return {
    requester: {
      name: ticket.requester,
      email: ticket.requesterEmail || '',
    },
    ticket: {
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      region: ticket.region,
      sede: ticket.sede,
      sector: ticket.sector,
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
    await fetch('/api/mail?route=send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload),
    });
  } catch {
    // Não interrompe o fluxo da UI se o e-mail falhar.
  }
}

export async function notifyTicketCreated(ticket: Ticket) {
  const toEmail = resolveTicketEmail(ticket);
  if (!toEmail) return;

  await postEmail({
    ticketId: ticket.id,
    trackingToken: ticket.trackingToken,
    toEmail,
    trigger: 'EMAIL-NOVA-OS',
    variables: buildVariables(ticket),
    templateData: {
      title: `OS ${ticket.id} registrada`,
      intro: 'Recebemos sua solicitação e ela já está em análise pela equipe.',
      ticketSubject: ticket.subject,
      status: ticket.status,
      ctaUrl: buildTrackingUrl(ticket),
      ctaLabel: 'Acompanhar OS',
    },
  });
}

export async function notifyTicketStatusChange(ticket: Ticket, previousStatus: string) {
  const toEmail = resolveTicketEmail(ticket);
  if (!toEmail) return;
  if (previousStatus === ticket.status) return;

  const trigger = resolveStatusTrigger(ticket.status);
  await postEmail({
    ticketId: ticket.id,
    trackingToken: ticket.trackingToken,
    toEmail,
    trigger: trigger || 'EMAIL-NOVA-MENSAGEM',
    variables: buildVariables(ticket, {
      previousStatus,
      currentStatus: ticket.status,
      message: {
        sender: 'Sistema OS Christus',
        body: `Status alterado de "${previousStatus}" para "${ticket.status}".`,
      },
    }),
    templateData: {
      title: `Atualização da OS ${ticket.id}`,
      intro: `Status alterado de "${previousStatus}" para "${ticket.status}".`,
      ticketSubject: ticket.subject,
      status: ticket.status,
      ctaUrl: buildTrackingUrl(ticket),
      ctaLabel: 'Ver atualização',
    },
  });
}

export async function notifyTicketPublicReply(ticket: Ticket, sender: string, message: string) {
  const toEmail = resolveTicketEmail(ticket);
  if (!toEmail || !message.trim()) return;

  await postEmail({
    ticketId: ticket.id,
    trackingToken: ticket.trackingToken,
    toEmail,
    trigger: 'EMAIL-NOVA-MENSAGEM',
    variables: buildVariables(ticket, {
      message: {
        sender,
        body: message.trim(),
      },
    }),
    templateData: {
      title: `Nova mensagem na OS ${ticket.id}`,
      intro: `${sender} enviou uma nova mensagem no ticket.`,
      ticketSubject: ticket.subject,
      status: ticket.status,
      bodyText: message.trim(),
      ctaUrl: buildTrackingUrl(ticket),
      ctaLabel: 'Abrir acompanhamento',
    },
  });
}
