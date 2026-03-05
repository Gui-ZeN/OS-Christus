import { Ticket } from '../types';

type ApiTicket = Omit<Ticket, 'time' | 'history' | 'sla' | 'viewingBy'> & {
  time: string;
  viewingBy?: { name: string; at: string } | null;
  sla?: { dueAt: string; status: 'on_time' | 'at_risk' | 'overdue' } | null;
  history: Array<Omit<Ticket['history'][number], 'time'> & { time: string }>;
};

function hydrateTicket(ticket: ApiTicket): Ticket {
  return {
    ...ticket,
    time: new Date(ticket.time),
    viewingBy: ticket.viewingBy
      ? { ...ticket.viewingBy, at: new Date(ticket.viewingBy.at) }
      : null,
    sla: ticket.sla
      ? { ...ticket.sla, dueAt: new Date(ticket.sla.dueAt) }
      : undefined,
    history: ticket.history.map(item => ({ ...item, time: new Date(item.time) })),
  };
}

export async function fetchTicketsFromApi(): Promise<Ticket[]> {
  const response = await fetch('/api/tickets');
  if (!response.ok) throw new Error('Falha ao buscar tickets da API.');
  const json = await response.json();
  if (!json.ok || !Array.isArray(json.tickets)) throw new Error('Resposta inválida da API de tickets.');
  return json.tickets.map(hydrateTicket);
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
  const response = await fetch('/api/tickets', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, updates }),
  });
  if (!response.ok) {
    throw new Error('Falha ao atualizar ticket na API.');
  }
}
