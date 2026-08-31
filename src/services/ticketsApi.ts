import { getAuthenticatedActorHeaders } from './actorHeaders';
import { ApiError, expectApiJson, readApiJson, resolveApiError } from './apiClient';
import { ClosureChecklist, ContractRecord, ExecutionProgress, GuaranteeInfo, HistoryItem, MeasurementRecord, PaymentRecord, PreliminaryActions, Ticket } from '../types';
import { coerceDate } from '../utils/date';
import { repairMojibake } from '../utils/text';
import { UserFacingError } from '../utils/errorMessage';
type ApiTicket = Omit<
  Ticket,
  | 'time'
  | 'history'
  | 'viewingBy'
  | 'nextAction'
  | 'attention'
  | 'operationalAttention'
  | 'attentionOverride'
  | 'lastInboundAt'
  | 'lastOutboundAt'
> & {
  time: string;
  /** Agenda operacional: datas chegam em ISO e são hidratadas em `hydrateTicket`. */
  nextAction?: (Omit<NonNullable<Ticket['nextAction']>, 'dueAt' | 'createdAt'> & {
    dueAt: string;
    createdAt?: string;
  }) | null;
  attention?: (Omit<NonNullable<Ticket['attention']>, 'reviewAt' | 'setAt'> & {
    reviewAt: string;
    setAt?: string;
  }) | null;
  operationalAttention?: (Omit<NonNullable<Ticket['operationalAttention']>, 'dueAt' | 'computedAt'> & {
    dueAt: string;
    computedAt?: string | null;
  }) | null;
  attentionOverride?: (Omit<NonNullable<Ticket['attentionOverride']>, 'dueAt' | 'changedAt'> & {
    dueAt?: string | null;
    changedAt?: string | null;
  }) | null;
  lastInboundAt?: string | null;
  lastOutboundAt?: string | null;
  closedAt?: string | null;
  excludedFromMetrics?: boolean;
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
  attachments?: Array<{
    id: string;
    name: string;
    path: string;
    url: string;
    contentType?: string | null;
    size?: number | null;
    uploadedAt?: string | null;
    category?: 'closure_report' | 'closure_evidence' | 'attachment';
  }> | null;
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

/**
 * ⚠️ EXPORTADO PARA SER TESTADO, e não porque outra tela o chame.
 *
 * Ele é peça estrutural: entre a resposta da API (onde toda data é string ISO) e a
 * tela Hoje existe esta função, e três consumidores LEVANTAM EXCEÇÃO se ela deixar
 * um campo de fora — `idleDays`, `agendaGroupOf` e `activeSuspension`. Um campo
 * esquecido aqui não dá número errado: dá tela branca. `tests/unit/contratoDoCliente`
 * prende isso.
 */
export function hydrateTicket(ticket: ApiTicket): Ticket {
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
    requesterCcEmails: Array.isArray(ticket.requesterCcEmails)
      ? ticket.requesterCcEmails.map(email => repairMojibake(email || '')).filter(Boolean)
      : [],
    directorCcEmails: Array.isArray(ticket.directorCcEmails)
      ? ticket.directorCcEmails.map(email => repairMojibake(email || '')).filter(Boolean)
      : [],
    directorIds: Array.isArray(ticket.directorIds)
      ? ticket.directorIds.map(id => repairMojibake(id || '')).filter(Boolean)
      : [],
    directorEmails: Array.isArray(ticket.directorEmails)
      ? ticket.directorEmails.map(email => repairMojibake(email || '')).filter(Boolean)
      : [],
    type: repairMojibake(ticket.type),
    macroServiceName: repairMojibake(ticket.macroServiceName || ''),
    serviceCatalogName: repairMojibake(ticket.serviceCatalogName || ''),
    region: repairMojibake(ticket.region),
    sede: repairMojibake(ticket.sede),
    sector: repairMojibake(ticket.sector),
    location: repairMojibake(ticket.location || ''),
    priority: repairMojibake(ticket.priority),
    time: coerceDate(ticket.time),
    /**
     * `dueAt` ordena a agenda inteira: se chegar como string, toda comparação de
     * data vira comparação de texto e a tela ordena errado sem avisar.
     *
     * ⚠️ MAS AUSENTE TEM QUE CONTINUAR AUSENTE. `coerceDate(undefined)` devolve
     * AGORA — o fallback dele existe para campo que sempre tem valor. Aqui não:
     * ação sem prazo virava ação vencendo neste instante, e a OS aparecia em
     * "Hoje" por causa de um campo que ninguém preencheu. `resolvedAttentionOf`
     * já sabe tratar `dueAt` vazio como "sem ação" — o hidratador é que nunca
     * deixava chegar vazio.
     *
     * É a mesma lição que `marcos.ts` já carrega escrita: o vazio é o dado.
     */
    nextAction: ticket.nextAction
      ? {
          ...ticket.nextAction,
          dueAt: ticket.nextAction.dueAt ? coerceDate(ticket.nextAction.dueAt) : null,
          createdAt: ticket.nextAction.createdAt ? coerceDate(ticket.nextAction.createdAt) : undefined,
        }
      : null,
    /**
     * Sem hidratar `reviewAt`, a comparação "a suspensão já venceu?" viraria
     * comparação de texto e a OS ficaria suspensa para sempre.
     *
     * ⚠️ E sem a guarda, o contrário: suspensão SEM data de revisão ganhava
     * `new Date()` e passava a vencer no instante da leitura — o estado da OS
     * oscilava entre "esperando" e "impedida" conforme o microssegundo em que a
     * tela renderizou. Sem data para voltar, a resposta certa é IMPEDIDA: alguém
     * precisa decidir.
     */
    attention: ticket.attention
      ? {
          ...ticket.attention,
          reviewAt: ticket.attention.reviewAt ? coerceDate(ticket.attention.reviewAt) : null,
          setAt: ticket.attention.setAt ? coerceDate(ticket.attention.setAt) : undefined,
        }
      : null,
    // Sem hidratar `dueAt`, a agenda ordenaria texto em vez de data — e a tela
    // colocaria "vence hoje" depois de "vence em setembro".
    operationalAttention: ticket.operationalAttention
      ? {
          ...ticket.operationalAttention,
          // Mesma regra: `resolvedAttentionOf` só usa a proposta se ela TEM prazo.
          dueAt: ticket.operationalAttention.dueAt ? coerceDate(ticket.operationalAttention.dueAt) : null,
          computedAt: ticket.operationalAttention.computedAt
            ? coerceDate(ticket.operationalAttention.computedAt)
            : null,
        }
      : null,
    attentionOverride: ticket.attentionOverride
      ? {
          ...ticket.attentionOverride,
          dueAt: ticket.attentionOverride.dueAt ? coerceDate(ticket.attentionOverride.dueAt) : null,
          changedAt: ticket.attentionOverride.changedAt
            ? coerceDate(ticket.attentionOverride.changedAt)
            : null,
        }
      : null,
    lastInboundAt: ticket.lastInboundAt ? coerceDate(ticket.lastInboundAt) : null,
    lastOutboundAt: ticket.lastOutboundAt ? coerceDate(ticket.lastOutboundAt) : null,
    closedAt: ticket.closedAt ? coerceDate(ticket.closedAt) : null,
    viewingBy: ticket.viewingBy ? { ...ticket.viewingBy, at: coerceDate(ticket.viewingBy.at) } : null,
    /**
     * `Array.isArray` como em todo array vizinho — este era o único sem guarda.
     *
     * Os quatro caminhos do servidor garantem uma lista hoje, então não havia
     * defeito ativo. Mas `hydrateTicket` roda em TODA OS de TODA tela: se um dia
     * `history` chegar ausente, não é uma OS que some, é o app inteiro que não
     * abre. Custo da guarda: uma linha. Custo da falta dela: tela branca para as
     * oito pessoas.
     */
    history: (Array.isArray(ticket.history) ? ticket.history : []).map(item => ({
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
    attachments: Array.isArray(item.attachments)
      ? item.attachments.map(attachment => ({
          ...attachment,
          uploadedAt: attachment.uploadedAt ? coerceDate(attachment.uploadedAt) : null,
        }))
      : [],
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

export interface TicketsFetchResult {
  tickets: Ticket[];
  /** Relógio do servidor no início da leitura; reenviado como `since` no próximo poll. */
  serverTime: string | null;
  /** 'delta' = só o que mudou desde `since`; 'full' = coleção acessível inteira. */
  mode: 'full' | 'delta';
}

// Com `since`, o servidor devolve só as OS alteradas desde então (leitura
// incremental) — corta drasticamente as leituras do Firestore no polling. Sem
// `since`, faz a carga completa (primeira vez e reconciliação periódica).
export async function fetchTicketsFromApi(since?: string | null): Promise<TicketsFetchResult> {
  const url = since ? `/api/tickets?since=${encodeURIComponent(since)}` : '/api/tickets';
  const response = await fetch(url, {
    cache: 'no-store',
    headers: await getAuthenticatedActorHeaders(),
  });
  const json = await expectApiJson<{ ok: boolean; tickets?: ApiTicket[]; serverTime?: string; mode?: string }>(
    response,
    'Falha ao buscar tickets da API.'
  );
  if (!json.ok || !Array.isArray(json.tickets)) {
    throw new UserFacingError('Resposta inválida da API de tickets.');
  }

  return {
    tickets: json.tickets.map((ticket: ApiTicket) => hydrateTicket(ticket)),
    serverTime: typeof json.serverTime === 'string' ? json.serverTime : null,
    mode: json.mode === 'delta' ? 'delta' : 'full',
  };
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

export interface TicketHistoryPage {
  history: HistoryItem[];
  nextCursor: string | null;
}

export async function fetchTicketHistoryPage(
  ticketId: string,
  options: { cursor?: string | null; limit?: number } = {}
): Promise<TicketHistoryPage> {
  const query = new URLSearchParams({
    historyTicketId: ticketId,
    historyLimit: String(options.limit || 50),
  });
  if (options.cursor) query.set('historyCursor', options.cursor);
  const response = await fetch(`/api/tickets?${query.toString()}`, {
    cache: 'no-store',
    headers: await getAuthenticatedActorHeaders(),
  });
  const json = await expectApiJson<{ ok: boolean; history?: ApiTicket['history']; nextCursor?: string | null }>(
    response,
    'Falha ao carregar histórico da OS.'
  );
  if (!json.ok || !Array.isArray(json.history)) throw new UserFacingError('Resposta inválida do histórico da OS.');
  return {
    history: json.history.map(item => ({
      ...item,
      time: coerceDate(item.time),
      attachments: Array.isArray(item.attachments)
        ? item.attachments.map(attachment => ({
            ...attachment,
            uploadedAt: attachment.uploadedAt ? coerceDate(attachment.uploadedAt) : null,
          }))
        : undefined,
    })),
    nextCursor: typeof json.nextCursor === 'string' ? json.nextCursor : null,
  };
}

export async function createTicketInApi(ticket: Partial<Ticket>): Promise<Ticket> {
  const authHeaders = await getAuthenticatedActorHeaders().catch(() => ({}));
  const response = await fetch('/api/tickets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify({ ticket }),
  });
  const json = await expectApiJson<{ ok: boolean; ticket?: ApiTicket }>(response, 'Falha ao criar ticket na API.');
  if (!json.ok || !json.ticket) {
    throw new UserFacingError('Resposta inválida ao criar ticket.');
  }

  return hydrateTicket(json.ticket as ApiTicket);
}

export async function createTicketWithFilesInApi(ticket: Partial<Ticket>, files: File[]): Promise<Ticket> {
  const authHeaders = await getAuthenticatedActorHeaders().catch(() => ({}));
  const formData = new FormData();
  formData.append('ticket', JSON.stringify(ticket));
  files.forEach(file => formData.append('attachment', file));

  const response = await fetch('/api/tickets', {
    method: 'POST',
    headers: { ...authHeaders },
    body: formData,
  });
  const json = await expectApiJson<{ ok: boolean; ticket?: ApiTicket }>(response, 'Falha ao criar ticket na API.');
  if (!json.ok || !json.ticket) {
    throw new UserFacingError('Resposta inválida ao criar ticket.');
  }

  return hydrateTicket(json.ticket as ApiTicket);
}

export interface TicketPatchExtras {
  /** Edição pontual do horário de UMA entrada de histórico já existente. */
  historyTimeEdit?: { id: string; time: string };
}

export async function patchTicketInApi(id: string, updates: Partial<Ticket>, extras?: TicketPatchExtras) {
  const headers = await getAuthenticatedActorHeaders();
  const response = await fetch('/api/tickets', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ id, updates, ...(extras?.historyTimeEdit ? { historyTimeEdit: extras.historyTimeEdit } : {}) }),
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

export async function postTrackingMessageInApi(trackingToken: string, publicMessage: string) {
  const response = await fetch('/api/tickets', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackingToken, publicMessage }),
  });
  await expectApiJson(response, 'Falha ao enviar mensagem pelo acompanhamento.');
}

/**
 * O PDF do estado atual de UMA OS, montado no servidor.
 *
 * ⚠️ O TAMANHO ZERO É CONFERIDO AQUI. Um `Blob` vazio vira um download que abre em
 * branco e não gera erro nenhum — o defeito que já apareceu neste projeto como
 * "botão que descarta o resultado". Melhor recusar com uma frase do que entregar um
 * arquivo que só decepciona quando alguém tenta abrir.
 */
export async function baixarPdfDaOs(ticketId: string): Promise<Blob> {
  const response = await fetch(`/api/tickets?route=ticket-pdf&id=${encodeURIComponent(ticketId)}`, {
    cache: 'no-store',
    headers: await getAuthenticatedActorHeaders(),
  });
  // O corpo de sucesso é binário: só faz sentido lê-lo como JSON quando deu errado.
  if (!response.ok) {
    const payload = await readApiJson(response);
    throw new ApiError(resolveApiError(payload, 'Falha ao gerar o PDF da OS.'), response.status);
  }
  const blob = await response.blob();
  if (blob.size === 0) {
    throw new UserFacingError('O PDF da OS voltou vazio. Nada foi baixado.');
  }
  return blob;
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


