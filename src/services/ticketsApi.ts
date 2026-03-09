import { getAuthenticatedActorHeaders } from './actorHeaders';
import { ClosureChecklist, ContractRecord, GuaranteeInfo, MeasurementRecord, PaymentRecord, PreliminaryActions, Ticket } from '../types';
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
  closureChecklist?: Omit<ClosureChecklist, 'requesterApprovedAt' | 'serviceStartedAt' | 'serviceCompletedAt' | 'closedAt' | 'documents'> & {
    requesterApprovedAt?: string | null;
    serviceStartedAt?: string | null;
    serviceCompletedAt?: string | null;
    closedAt?: string | null;
    documents?: Array<{
      id: string;
      name: string;
      path: string;
      url: string;
      contentType?: string | null;
      size?: number | null;
      uploadedAt?: string | null;
      category?: 'closure_report' | 'closure_evidence' | 'attachment';
    }> | null;
  } | null;
  guarantee?: Omit<GuaranteeInfo, 'startAt' | 'endAt'> & {
    startAt?: string | null;
    endAt?: string | null;
  } | null;
};

type ApiMeasurement = Omit<MeasurementRecord, 'requestedAt' | 'approvedAt'> & {
  requestedAt?: string | null;
  approvedAt?: string | null;
};

type ApiPayment = Omit<PaymentRecord, 'dueAt' | 'paidAt'> & {
  dueAt?: string | null;
  paidAt?: string | null;
};

type ApiContract = ContractRecord;

export interface TrackingProcurementSummary {
  contract: ContractRecord | null;
  measurements: MeasurementRecord[];
  payments: PaymentRecord[];
}

export interface TrackingTicketPayload {
  ticket: Ticket;
  procurement: TrackingProcurementSummary;
}

function hydrateTicket(ticket: ApiTicket): Ticket {
  const primaryInfrastructureApproval =
    ticket.closureChecklist?.infrastructureApprovalPrimary ??
    ticket.closureChecklist?.infrastructureApprovedByRafael ??
    false;
  const secondaryInfrastructureApproval =
    ticket.closureChecklist?.infrastructureApprovalSecondary ??
    ticket.closureChecklist?.infrastructureApprovedByFernando ??
    false;

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
    closureChecklist: ticket.closureChecklist
      ? {
          ...ticket.closureChecklist,
          infrastructureApprovalPrimary: primaryInfrastructureApproval,
          infrastructureApprovalSecondary: secondaryInfrastructureApproval,
          requesterApprovedAt: ticket.closureChecklist.requesterApprovedAt ? coerceDate(ticket.closureChecklist.requesterApprovedAt) : null,
          serviceStartedAt: ticket.closureChecklist.serviceStartedAt ? coerceDate(ticket.closureChecklist.serviceStartedAt) : null,
          serviceCompletedAt: ticket.closureChecklist.serviceCompletedAt ? coerceDate(ticket.closureChecklist.serviceCompletedAt) : null,
          closedAt: ticket.closureChecklist.closedAt ? coerceDate(ticket.closureChecklist.closedAt) : null,
          documents: Array.isArray(ticket.closureChecklist.documents)
            ? ticket.closureChecklist.documents.map(document => ({
                ...document,
                uploadedAt: document.uploadedAt ? coerceDate(document.uploadedAt) : null,
              }))
            : [],
        }
      : undefined,
    guarantee: ticket.guarantee
      ? {
          ...ticket.guarantee,
          startAt: ticket.guarantee.startAt ? coerceDate(ticket.guarantee.startAt) : null,
          endAt: ticket.guarantee.endAt ? coerceDate(ticket.guarantee.endAt) : null,
        }
      : undefined,
  };
}

function hydrateMeasurement(item: ApiMeasurement): MeasurementRecord {
  return {
    ...item,
    requestedAt: item.requestedAt ? coerceDate(item.requestedAt) : null,
    approvedAt: item.approvedAt ? coerceDate(item.approvedAt) : null,
  };
}

function hydratePayment(item: ApiPayment): PaymentRecord {
  return {
    ...item,
    dueAt: item.dueAt ? coerceDate(item.dueAt) : null,
    paidAt: item.paidAt ? coerceDate(item.paidAt) : null,
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

export async function fetchTrackingDetailsFromApi(trackingToken: string): Promise<TrackingTicketPayload> {
  const response = await fetch(`/api/tickets?tracking=${encodeURIComponent(trackingToken)}`);
  const json = await response.json();
  if (!response.ok || !json.ok || !json.ticket) {
    throw new Error(json.error || 'Falha ao buscar ticket de acompanhamento.');
  }

  return {
    ticket: hydrateTicket(json.ticket as ApiTicket),
    procurement: {
      contract: (json.procurement?.contract as ApiContract | null) || null,
      measurements: Array.isArray(json.procurement?.measurements)
        ? json.procurement.measurements.map((item: ApiMeasurement) => hydrateMeasurement(item))
        : [],
      payments: Array.isArray(json.procurement?.payments)
        ? json.procurement.payments.map((item: ApiPayment) => hydratePayment(item))
        : [],
    },
  };
}

export async function fetchTrackingTicketFromApi(trackingToken: string): Promise<Ticket> {
  const payload = await fetchTrackingDetailsFromApi(trackingToken);
  return payload.ticket;
}

export async function createTicketInApi(ticket: Partial<Ticket>): Promise<Ticket> {
  const response = await fetch('/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ticket }),
  });
  if (!response.ok) {
    throw new Error('Falha ao criar ticket na API.');
  }

  const json = await response.json();
  if (!json.ok || !json.ticket) {
    throw new Error('Resposta inválida ao criar ticket.');
  }

  return hydrateTicket(json.ticket as ApiTicket);
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
