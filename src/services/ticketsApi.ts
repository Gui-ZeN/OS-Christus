import { getAuthenticatedActorHeaders } from './actorHeaders';
import { PreliminaryActions, Ticket } from '../types';
import { coerceDate } from '../utils/date';

type ApiTicket = Omit<Ticket, 'time' | 'history' | 'sla' | 'viewingBy'> & {
  time: string;
  viewingBy?: { name: string; at: string } | null;
  sla?: { dueAt: string; status: 'on_time' | 'at_risk' | 'overdue' } | null;
  history: Array<Omit<Ticket['history'][number], 'time'> & { time: string }>;
  preliminaryActions?: Omit<PreliminaryActions, 'materialEta' | 'plannedStartAt' | 'actualStartAt' | 'updatedAt'> & {
    materialEta?: string | null;
    plannedStartAt?: string | null;
    actualStartAt?: string | null;
    updatedAt?: string | null;
  } | null;
};

function hydrateTicket(ticket: ApiTicket): Ticket {
  return {
    ...ticket,
    time: coerceDate(ticket.time),
    viewingBy: ticket.viewingBy ? { ...ticket.viewingBy, at: coerceDate(ticket.viewingBy.at) } : null,
    sla: ticket.sla ? { ...ticket.sla, dueAt: coerceDate(ticket.sla.dueAt) } : undefined,
    history: ticket.history.map(item => ({ ...item, time: coerceDate(item.time) })),
    preliminaryActions: ticket.preliminaryActions
      ? {
          ...ticket.preliminaryActions,
          materialEta: ticket.preliminaryActions.materialEta ? coerceDate(ticket.preliminaryActions.materialEta) : null,
          plannedStartAt: ticket.preliminaryActions.plannedStartAt ? coerceDate(ticket.preliminaryActions.plannedStartAt) : null,
          actualStartAt: ticket.preliminaryActions.actualStartAt ? coerceDate(ticket.preliminaryActions.actualStartAt) : null,
          updatedAt: ticket.preliminaryActions.updatedAt ? coerceDate(ticket.preliminaryActions.updatedAt) : null,
        }
      : undefined,
  };
}

export async function fetchTicketsFromApi(): Promise<Ticket[]> {
  const response = await fetch('/api/tickets', {
    headers: await getAuthenticatedActorHeaders(),
  });
  if (!response.ok) {
    throw new Error('Falha ao buscar tickets da API.');
  }

  const json = await response.json();
  if (!json.ok || !Array.isArray(json.tickets)) {
    throw new Error('Resposta inválida da API de tickets.');
  }

  return json.tickets.map((ticket: ApiTicket) => hydrateTicket(ticket));
}

export async function fetchTrackingTicketFromApi(trackingToken: string): Promise<Ticket> {
  const response = await fetch(`/api/tickets?tracking=${encodeURIComponent(trackingToken)}`);
  const json = await response.json();
  if (!response.ok || !json.ok || !json.ticket) {
    throw new Error(json.error || 'Falha ao buscar ticket de acompanhamento.');
  }

  return hydrateTicket(json.ticket as ApiTicket);
}

export async function createTicketInApi(ticket: Ticket) {
  const response = await fetch('/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket }),
  });
  if (!response.ok) {
    throw new Error('Falha ao criar ticket na API.');
  }
}

export async function patchTicketInApi(id: string, updates: Partial<Ticket>) {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/tickets', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ id, updates }),
  });
  if (!response.ok) {
    throw new Error('Falha ao atualizar ticket na API.');
  }
}

export async function patchTrackingTicketInApi(trackingToken: string, updates: Partial<Ticket>) {
  const response = await fetch('/api/tickets', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackingToken, updates }),
  });
  if (!response.ok) {
    throw new Error('Falha ao atualizar ticket por acompanhamento.');
  }
}
