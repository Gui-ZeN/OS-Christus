import { getAuthenticatedActorHeaders } from './actorHeaders';
import { expectApiJson, readApiJson, resolveApiError } from './apiClient';
import { ClosureChecklist, ContractRecord, ExecutionProgress, GuaranteeInfo, MeasurementRecord, PaymentRecord, PreliminaryActions, Ticket } from '../types';
import { coerceDate } from '../utils/date';
import { repairMojibake } from '../utils/text';

type ApiTicket = Omit<Ticket, 'time' | 'history' | 'viewingBy'> & {
  time: string;
  viewingBy?: { name: string; at: string } | null;
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
  executionProgress?: Omit<ExecutionProgress, 'startedAt' | 'lastUpdatedAt'> & {
    startedAt?: string | null;
    lastUpdatedAt?: string | null;
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
    subject: repairMojibake(ticket.subject),
    requester: repairMojibake(ticket.requester),
    requesterEmail: repairMojibake(ticket.requesterEmail || ''),
    type: repairMojibake(ticket.type),
    macroServiceName: repairMojibake(ticket.macroServiceName || ''),
    serviceCatalogName: repairMojibake(ticket.serviceCatalogName || ''),
    region: repairMojibake(ticket.region),
    sede: repairMojibake(ticket.sede),
    sector: repairMojibake(ticket.sector),
    priority: repairMojibake(ticket.priority),
    time: coerceDate(ticket.time),
    viewingBy: ticket.viewingBy ? { ...ticket.viewingBy, at: coerceDate(ticket.viewingBy.at) } : null,
    history: ticket.history.map(item => ({
      ...item,
      sender: item.sender ? repairMojibake(item.sender) : item.sender,
      text: item.text ? repairMojibake(item.text) : item.text,
      field: item.field ? repairMojibake(item.field) : item.field,
      from: item.from ? repairMojibake(item.from) : item.from,
      to: item.to ? repairMojibake(item.to) : item.to,
      attachments: Array.isArray(item.attachments)
        ? item.attachments.map(attachment => ({
            ...attachment,
            uploadedAt: attachment.uploadedAt ? coerceDate(attachment.uploadedAt) : null,
          }))
        : undefined,
      time: coerceDate(item.time),
    })),
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
    executionProgress: ticket.executionProgress
      ? {
          ...ticket.executionProgress,
          startedAt: ticket.executionProgress.startedAt ? coerceDate(ticket.executionProgress.startedAt) : null,
          lastUpdatedAt: ticket.executionProgress.lastUpdatedAt ? coerceDate(ticket.executionProgress.lastUpdatedAt) : null,
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
    cache: 'no-store',
    headers: await getAuthenticatedActorHeaders(),
  });
  const json = await expectApiJson<{ ok: boolean; tickets?: ApiTicket[] }>(
    response,
    'Falha ao buscar tickets da API.'
  );
  if (!json.ok || !Array.isArray(json.tickets)) {
    throw new Error('Resposta inválida da API de tickets.');
  }

  return json.tickets.map((ticket: ApiTicket) => hydrateTicket(ticket));
}

export async function fetchTrackingDetailsFromApi(trackingToken: string): Promise<TrackingTicketPayload> {
  const response = await fetch(`/api/tickets?tracking=${encodeURIComponent(trackingToken)}`, {
    cache: 'no-store',
  });
  const json = await readApiJson<any>(response);
  if (!response.ok || !json?.ok || !json.ticket) {
    throw new Error(resolveApiError(json, 'Falha ao buscar ticket de acompanhamento.'));
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
  const json = await expectApiJson<{ ok: boolean; ticket?: ApiTicket }>(response, 'Falha ao criar ticket na API.');
  if (!json.ok || !json.ticket) {
    throw new Error('Resposta inválida ao criar ticket.');
  }

  return hydrateTicket(json.ticket as ApiTicket);
}

export async function createTicketWithFilesInApi(ticket: Partial<Ticket>, files: File[]): Promise<Ticket> {
  const formData = new FormData();
  formData.append('ticket', JSON.stringify(ticket));
  files.forEach(file => formData.append('attachment', file));

  const response = await fetch('/api/tickets', {
    method: 'POST',
    body: formData,
  });
  const json = await expectApiJson<{ ok: boolean; ticket?: ApiTicket }>(response, 'Falha ao criar ticket na API.');
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
  await expectApiJson(response, 'Falha ao atualizar ticket na API.');
}

export async function patchTrackingTicketInApi(trackingToken: string, updates: Partial<Ticket>) {
  const response = await fetch('/api/tickets', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackingToken, updates }),
  });
  await expectApiJson(response, 'Falha ao atualizar ticket por acompanhamento.');
}

export async function deleteTicketInApi(id: string) {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/tickets', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ id }),
  });
  await expectApiJson(response, 'Falha ao excluir ticket na API.');
}



