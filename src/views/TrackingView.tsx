import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Landmark, Loader2, CheckCircle, Users, Activity } from 'lucide-react';
import { TICKET_STATUS, type TicketStatus } from '../constants/ticketStatus';
import { useApp } from '../context/AppContext';
import { fetchCatalog, type CatalogSite } from '../services/catalogApi';
import { fetchTrackingDetailsFromApi, patchTrackingTicketInApi } from '../services/ticketsApi';
import type { HistoryItem, Ticket } from '../types';
import { formatDateTimeSafe } from '../utils/date';
import { repairMojibake } from '../utils/text';
import { getTicketSiteLabel } from '../utils/ticketTerritory';

interface TrackingViewProps {
  ticketToken: string | null;
  onBack: () => void;
}

interface TimelineEntry {
  id: string;
  kind: 'status' | 'message';
  time: Date | null;
  sortMs: number;
  isCustomerMessage: boolean;
  sender: string;
  title: string;
  description: string;
  status?: TicketStatus;
}

interface StatusStage {
  id: string;
  title: string;
  description: string;
  statuses: TicketStatus[];
}

const STATUS_STAGES: StatusStage[] = [
  {
    id: 'new',
    title: 'Nova OS',
    description: 'Solicitação aberta no sistema.',
    statuses: [TICKET_STATUS.NEW],
  },
  {
    id: 'tech-opinion',
    title: 'Aguardando Parecer Técnico',
    description: 'A OS foi aceita e está aguardando parecer técnico.',
    statuses: [TICKET_STATUS.WAITING_TECH_OPINION],
  },
  {
    id: 'solution-approval',
    title: 'Aguardando Aprovação da Solução',
    description: 'A solução técnica está em aprovação da diretoria.',
    statuses: [TICKET_STATUS.WAITING_SOLUTION_APPROVAL],
  },
  {
    id: 'administrative-planning',
    title: 'Planejamento Administrativo',
    description: 'Orçamento e contrato em gestão/aprovação.',
    statuses: [
      TICKET_STATUS.WAITING_BUDGET,
      TICKET_STATUS.WAITING_BUDGET_APPROVAL,
      TICKET_STATUS.WAITING_CONTRACT_UPLOAD,
      TICKET_STATUS.WAITING_CONTRACT_APPROVAL,
    ],
  },
  {
    id: 'prelim-actions',
    title: 'Aguardando Ações Preliminares',
    description: 'Ações preliminares em andamento para início da obra.',
    statuses: [TICKET_STATUS.WAITING_PRELIM_ACTIONS],
  },
  {
    id: 'in-progress',
    title: 'Em andamento',
    description: 'Execução da obra iniciada.',
    statuses: [TICKET_STATUS.IN_PROGRESS],
  },
  {
    id: 'maintenance-approval',
    title: 'Aguardando aprovação da manutenção',
    description: 'Execução concluída, aguardando validação do solicitante.',
    statuses: [TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL],
  },
  {
    id: 'payment',
    title: 'Aguardando pagamento',
    description: 'Validação concluída. Fluxo financeiro em andamento.',
    statuses: [TICKET_STATUS.WAITING_PAYMENT],
  },
  {
    id: 'closed',
    title: 'Encerrada',
    description: 'OS encerrada.',
    statuses: [TICKET_STATUS.CLOSED],
  },
];

const CANCELED_STAGE: StatusStage = {
  id: 'canceled',
  title: 'Cancelada',
  description: 'OS cancelada.',
  statuses: [TICKET_STATUS.CANCELED],
};

const STATUS_TO_STAGE_INDEX = new Map<TicketStatus, number>();
STATUS_STAGES.forEach((stage, index) => {
  stage.statuses.forEach(status => STATUS_TO_STAGE_INDEX.set(status, index));
});

const NORMALIZED_STATUS_TO_VALUE = new Map<string, TicketStatus>(
  Object.values(TICKET_STATUS).map(status => [normalizeText(status), status as TicketStatus]),
);

function normalizeText(value: unknown) {
  return repairMojibake(String(value ?? ''))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (!value) return null;
  const parsed = new Date(value as string);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isSensitiveText(normalizedText: string) {
  return (
    normalizedText.includes('orcamento') ||
    normalizedText.includes('contrato') ||
    normalizedText.includes('aditivo') ||
    normalizedText.includes('pagamento') ||
    normalizedText.includes('parcela') ||
    normalizedText.includes('r$')
  );
}

function getPublicStatusLabel(status: string) {
  const cleanStatus = repairMojibake(status);
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
      return 'Planejamento administrativo';
    case TICKET_STATUS.WAITING_PRELIM_ACTIONS:
      return 'Ações preliminares';
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
      return cleanStatus || 'Atualização';
  }
}

function resolveStatusTimestamp(ticket: Ticket, status: TicketStatus): Date | null {
  switch (status) {
    case TICKET_STATUS.NEW:
      return parseDate(ticket.time);
    case TICKET_STATUS.WAITING_PRELIM_ACTIONS:
      return parseDate(ticket.preliminaryActions?.updatedAt) || parseDate(ticket.preliminaryActions?.plannedStartAt);
    case TICKET_STATUS.IN_PROGRESS:
      return parseDate(ticket.closureChecklist?.serviceStartedAt)
        || parseDate(ticket.preliminaryActions?.actualStartAt)
        || parseDate(ticket.executionProgress?.startedAt);
    case TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL:
      return parseDate(ticket.closureChecklist?.serviceCompletedAt);
    case TICKET_STATUS.WAITING_PAYMENT:
      return parseDate(ticket.closureChecklist?.requesterApprovedAt);
    case TICKET_STATUS.CLOSED:
      return parseDate(ticket.closureChecklist?.closedAt);
    default:
      return null;
  }
}

function extractStatusFromHistoryItem(item: HistoryItem): TicketStatus | null {
  const field = normalizeText(item.field || '');
  if (field === 'status' && item.to) {
    const parsedFromField = NORMALIZED_STATUS_TO_VALUE.get(normalizeText(item.to));
    if (parsedFromField) return parsedFromField;
  }

  const text = repairMojibake(item.text || '').trim();
  if (!text) return null;

  const statusMatch = text.match(/Status atualizado de\s+"([^"]+)"\s+para\s+"([^"]+)"/i);
  if (statusMatch?.[2]) {
    const parsed = NORMALIZED_STATUS_TO_VALUE.get(normalizeText(statusMatch[2]));
    if (parsed) return parsed;
  }

  const normalized = normalizeText(text);
  if (normalized.includes('solicitacao aceita e encaminhada para atendimento')) return TICKET_STATUS.WAITING_TECH_OPINION;
  if (normalized.includes('acoes preliminares em andamento')) return TICKET_STATUS.WAITING_PRELIM_ACTIONS;
  if (normalized.includes('execucao iniciada') || normalized.includes('inicio da execucao')) return TICKET_STATUS.IN_PROGRESS;
  if (normalized.includes('execucao concluida')) return TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL;
  if (normalized.includes('solicitante validou a execucao do servico')) return TICKET_STATUS.WAITING_PAYMENT;
  if (normalized.includes('os encerrada')) return TICKET_STATUS.CLOSED;
  if (normalized.includes('os cancelada')) return TICKET_STATUS.CANCELED;

  return null;
}

function shouldShowMessageInPublicTimeline(item: HistoryItem) {
  const text = repairMojibake(item?.text || '').trim();
  if (!text) return false;

  if (extractStatusFromHistoryItem(item)) {
    return false;
  }

  if (item.type === 'customer') return true;

  const normalized = normalizeText(text);
  if (isSensitiveText(normalized)) return false;

  if (item.type === 'tech') {
    if (item.visibility === 'internal') return false;
    return !normalized.includes('painel da os atualizado');
  }

  if (item.type === 'system') {
    if (item.visibility === 'internal') return false;
    return !normalized.includes('painel da os atualizado');
  }

  return false;
}

function resolveStageTimestamp(
  ticket: Ticket,
  stage: StatusStage,
  explicitStatusTimes: Map<TicketStatus, Date>,
) {
  const candidates = stage.statuses
    .map(status => explicitStatusTimes.get(status) || resolveStatusTimestamp(ticket, status))
    .filter((value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  return candidates[0] || null;
}

function buildStagePath(currentStatus: TicketStatus, explicitStatuses: TicketStatus[]) {
  if (currentStatus === TICKET_STATUS.CANCELED) {
    const knownIndexes = explicitStatuses
      .map(status => STATUS_TO_STAGE_INDEX.get(status))
      .filter((value): value is number => typeof value === 'number');
    const maxKnown = knownIndexes.length > 0 ? Math.max(...knownIndexes) : 0;
    return [...STATUS_STAGES.slice(0, maxKnown + 1), CANCELED_STAGE];
  }

  const currentIndex = STATUS_TO_STAGE_INDEX.get(currentStatus) ?? 0;
  const knownIndexes = explicitStatuses
    .map(status => STATUS_TO_STAGE_INDEX.get(status))
    .filter((value): value is number => typeof value === 'number');
  const maxKnown = knownIndexes.length > 0 ? Math.max(...knownIndexes) : 0;
  const targetIndex = Math.max(currentIndex, maxKnown);

  return STATUS_STAGES.slice(0, targetIndex + 1);
}

function buildTimelineEntries(ticket: Ticket): TimelineEntry[] {
  const history = [...(ticket.history || [])].sort((a, b) => a.time.getTime() - b.time.getTime());
  const baseMs = parseDate(ticket.time)?.getTime() || Date.now();

  const explicitStatusTimes = new Map<TicketStatus, Date>();
  explicitStatusTimes.set(TICKET_STATUS.NEW, parseDate(ticket.time) || new Date(baseMs));

  history.forEach(item => {
    const status = extractStatusFromHistoryItem(item);
    if (!status || explicitStatusTimes.has(status)) return;
    const parsed = parseDate(item.time);
    if (parsed) explicitStatusTimes.set(status, parsed);
  });

  const currentStatus = ticket.status as TicketStatus;
  if (!explicitStatusTimes.has(currentStatus)) {
    const resolved = resolveStatusTimestamp(ticket, currentStatus);
    if (resolved) explicitStatusTimes.set(currentStatus, resolved);
  }

  const stagesPath = buildStagePath(currentStatus, [...explicitStatusTimes.keys()]);

  let lastSortMs = baseMs;
  const statusEntries: TimelineEntry[] = stagesPath.map((stage, index) => {
    const resolvedTime = resolveStageTimestamp(ticket, stage, explicitStatusTimes);
    let sortMs = resolvedTime?.getTime() ?? (lastSortMs + 1);
    if (sortMs <= lastSortMs) sortMs = lastSortMs + 1;
    lastSortMs = sortMs;

    return {
      id: `stage-${stage.id}-${index}`,
      kind: 'status',
      time: resolvedTime,
      sortMs,
      isCustomerMessage: false,
      sender: 'Sistema',
      title: stage.title,
      description: stage.description,
      status: stage.statuses[stage.statuses.length - 1],
    };
  });

  const messageEntries: TimelineEntry[] = history
    .filter(shouldShowMessageInPublicTimeline)
    .map((item, index) => {
      const parsedTime = parseDate(item.time);
      return {
        id: item.id || `msg-${index}`,
        kind: 'message',
        time: parsedTime,
        sortMs: parsedTime?.getTime() ?? (baseMs + stagesPath.length + index + 1000),
        isCustomerMessage: item.type === 'customer',
        sender: repairMojibake(item.sender || (item.type === 'customer' ? ticket.requester : 'Sistema')),
        title: repairMojibake(item.sender || (item.type === 'customer' ? ticket.requester : 'Sistema')),
        description: repairMojibake(item.text || ''),
      };
    });

  return [...statusEntries, ...messageEntries].sort((a, b) => {
    if (a.sortMs === b.sortMs) {
      if (a.kind === b.kind) return 0;
      return a.kind === 'status' ? -1 : 1;
    }
    return a.sortMs - b.sortMs;
  });
}

export function TrackingView({ ticketToken, onBack }: TrackingViewProps) {
  const { tickets } = useApp();
  const latestTicketsRef = useRef(tickets);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [sites, setSites] = useState<CatalogSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmittingValidation, setIsSubmittingValidation] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    latestTicketsRef.current = tickets;
  }, [tickets]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const catalog = await fetchCatalog();
        if (!cancelled) {
          setSites(catalog.sites);
        }
      } catch {
        if (!cancelled) {
          setSites([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!ticketToken) {
      setTicket(null);
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    (async () => {
      try {
        const remote = await fetchTrackingDetailsFromApi(ticketToken);
        if (!cancelled) {
          setTicket(remote.ticket);
        }
      } catch {
        if (!cancelled) {
          setTicket(latestTicketsRef.current.find(item => item.trackingToken === ticketToken) || null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ticketToken]);

  const canRequesterApprove =
    Boolean(ticket) &&
    (ticket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL || ticket.status === TICKET_STATUS.WAITING_PAYMENT) &&
    !ticket.closureChecklist?.requesterApproved;

  const timelineEntries = useMemo(() => {
    if (!ticket) return [];
    return buildTimelineEntries(ticket);
  }, [ticket]);

  const handleRequesterApproval = async () => {
    if (!ticket || isSubmittingValidation) return;
    setIsSubmittingValidation(true);
    try {
      await patchTrackingTicketInApi(ticket.trackingToken, {
        closureChecklist: {
          requesterApprovedBy: ticket.closureChecklist?.requesterApprovedBy || null,
          requesterApprovedAt: ticket.closureChecklist?.requesterApprovedAt || null,
          requesterApproved: true,
          infrastructureApprovalPrimary: ticket.closureChecklist?.infrastructureApprovalPrimary ?? false,
          infrastructureApprovalSecondary: ticket.closureChecklist?.infrastructureApprovalSecondary ?? false,
          closureNotes: ticket.closureChecklist?.closureNotes || '',
          serviceStartedAt: ticket.closureChecklist?.serviceStartedAt || null,
          serviceCompletedAt: ticket.closureChecklist?.serviceCompletedAt || null,
          closedAt: ticket.closureChecklist?.closedAt || null,
          documents: ticket.closureChecklist?.documents || [],
        },
      });
      const refreshed = await fetchTrackingDetailsFromApi(ticket.trackingToken);
      setTicket(refreshed.ticket);
      setFeedback('Entrega validada com sucesso. A equipe interna dará sequência ao fluxo financeiro.');
      window.setTimeout(() => setFeedback(null), 4000);
    } catch {
      setFeedback('Não foi possível confirmar a entrega agora. Tente novamente em instantes.');
      window.setTimeout(() => setFeedback(null), 5000);
    } finally {
      setIsSubmittingValidation(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-full bg-roman-bg overflow-y-auto flex flex-col items-center justify-center px-4">
        <div className="bg-roman-surface border border-roman-border p-6 rounded-2xl shadow-sm text-center max-w-md w-full">
          <Loader2 size={28} className="animate-spin mx-auto text-roman-primary mb-4" />
          <h1 className="text-xl font-serif text-roman-text-main font-medium mb-2">Carregando acompanhamento</h1>
          <p className="text-roman-text-sub">Estamos buscando sua OS no sistema.</p>
        </div>
      </div>
    );
  }

  if (!ticket || !ticketToken) {
    return (
      <div className="h-screen w-full bg-roman-bg overflow-y-auto flex flex-col items-center py-12 px-4 relative">
        <button onClick={onBack} className="absolute top-6 left-6 flex items-center gap-2 text-roman-text-sub hover:text-roman-text-main font-medium transition-colors">
          <ArrowRight size={16} className="rotate-180" /> Voltar
        </button>
        <div className="max-w-3xl w-full">
          <div className="bg-roman-surface border border-roman-border p-6 rounded-2xl shadow-sm mb-6 text-center">
            <h1 className="text-2xl font-serif text-roman-text-main font-medium mb-2">OS não encontrada</h1>
            <p className="text-roman-text-sub">O link de acompanhamento é inválido ou expirou.</p>
          </div>
        </div>
      </div>
    );
  }

  const siteLabel = getTicketSiteLabel(ticket, sites);

  return (
    <div className="h-screen w-full bg-roman-bg overflow-y-auto flex flex-col items-center py-12 px-4 relative">
      <button onClick={onBack} className="absolute top-6 left-6 flex items-center gap-2 text-roman-text-sub hover:text-roman-text-main font-medium transition-colors">
        <ArrowRight size={16} className="rotate-180" /> Voltar ao sistema interno
      </button>

      <div className="max-w-4xl w-full">
        <div className="bg-roman-surface border border-roman-border p-5 md:p-6 rounded-2xl shadow-sm mb-6">
          <div className="flex justify-between items-start mb-6 border-b border-roman-border pb-5 gap-4">
            <div>
              <div className="text-roman-primary mb-4">
                <Landmark size={36} strokeWidth={1.5} />
              </div>
              <h1 className="text-[1.75rem] font-serif text-roman-text-main font-medium mb-1">Acompanhamento de OS</h1>
              <p className="text-roman-text-sub font-serif italic">Portal do solicitante</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-serif text-roman-text-main font-medium">#{ticket.id}</div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-roman-primary/10 text-roman-primary border border-roman-primary/20 rounded-xl text-sm font-medium mt-2">
                <span className="w-2 h-2 rounded-full bg-roman-primary animate-pulse" /> {getPublicStatusLabel(ticket.status)}
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-serif text-roman-text-main mb-2">{ticket.subject}</h2>
            <p className="text-roman-text-sub">
              Solicitado por: {ticket.requester} - Setor: {ticket.sector} ({siteLabel})
            </p>
          </div>

          {(canRequesterApprove || ticket.closureChecklist?.requesterApproved || feedback) && (
            <div className="mb-6 rounded-2xl border border-roman-border bg-roman-bg/70 p-4">
              <div className="text-sm font-medium text-roman-text-main">Validação da entrega</div>
              {ticket.closureChecklist?.requesterApproved ? (
                <p className="mt-1 text-sm text-emerald-700">
                  Entrega validada em {formatDateTimeSafe(ticket.closureChecklist.requesterApprovedAt || ticket.time)}.
                </p>
              ) : (
                <p className="mt-1 text-sm text-roman-text-sub">
                  Se a obra foi entregue conforme esperado, confirme abaixo para liberar a continuidade interna.
                </p>
              )}
              {feedback && <p className="mt-2 text-sm text-roman-text-sub">{feedback}</p>}
              {canRequesterApprove && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => void handleRequesterApproval()}
                    disabled={isSubmittingValidation}
                    className="inline-flex items-center gap-2 rounded-full bg-roman-sidebar px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-900 disabled:opacity-70"
                  >
                    {isSubmittingValidation ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                    Confirmar entrega da obra
                  </button>
                </div>
              )}
            </div>
          )}

          <div>
            <h3 className="font-serif text-lg font-medium text-roman-text-main mb-6">Linha do tempo</h3>
            <div className="space-y-4 relative md:before:absolute md:before:inset-0 md:before:mx-auto md:before:h-full md:before:w-0.5 md:before:bg-gradient-to-b md:before:from-transparent md:before:via-roman-border md:before:to-transparent">
              {timelineEntries.map((entry, index) => {
                const isCustomerMessage = entry.kind === 'message' && entry.isCustomerMessage;
                const isStatusEntry = entry.kind === 'status';

                return (
                  <div
                    key={`${entry.id}-${index}`}
                    className={`relative flex flex-col md:flex-row items-start md:items-center justify-between md:justify-normal gap-4 md:gap-0 ${
                      isCustomerMessage ? 'md:flex-row-reverse' : ''
                    }`}
                  >
                    <div
                      className={`flex items-center justify-center w-10 h-10 rounded-full border border-white shadow shrink-0 md:order-1 z-10 self-start md:self-center ${
                        isCustomerMessage
                          ? 'bg-roman-primary text-white md:-translate-x-1/2'
                          : isStatusEntry
                            ? 'bg-roman-primary/15 text-roman-primary md:translate-x-1/2'
                            : 'bg-roman-surface text-roman-primary md:translate-x-1/2'
                      }`}
                    >
                      {isStatusEntry ? <CheckCircle size={16} /> : isCustomerMessage ? <Users size={16} /> : <Activity size={16} />}
                    </div>

                    <div
                      className={`w-full md:w-[calc(50%-2.5rem)] border px-4 py-3.5 rounded-2xl shadow-sm ${
                        isStatusEntry
                          ? 'bg-roman-primary/5 border-roman-primary/25 text-left'
                          : isCustomerMessage
                            ? 'bg-roman-primary/5 border-roman-primary/20 text-right'
                            : 'bg-roman-surface border-roman-border text-left'
                      }`}
                    >
                      <div className={`flex items-center gap-3 mb-1 ${isCustomerMessage ? 'justify-end' : 'justify-between'}`}>
                        <div className="font-serif font-medium text-roman-text-main">
                          {isStatusEntry ? 'Status da OS' : entry.sender}
                        </div>
                        <div className="text-xs text-roman-text-sub font-serif italic">
                          {entry.time ? formatDateTimeSafe(entry.time) : 'Data não registrada'}
                        </div>
                      </div>

                      {isStatusEntry ? (
                        <>
                          <div className="inline-flex items-center rounded-full border border-roman-primary/30 bg-roman-primary/10 px-2 py-0.5 text-xs font-medium text-roman-primary">
                            {entry.title}
                          </div>
                          <div className="mt-2 text-sm text-roman-text-sub leading-relaxed">{entry.description}</div>
                        </>
                      ) : (
                        <div className="text-sm text-roman-text-main leading-relaxed">{entry.description}</div>
                      )}
                    </div>
                  </div>
                );
              })}

              {timelineEntries.length === 0 && (
                <div className="rounded-2xl border border-roman-border bg-roman-surface px-4 py-3 text-sm text-roman-text-sub">
                  Ainda não há atualizações públicas disponíveis na linha do tempo.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
