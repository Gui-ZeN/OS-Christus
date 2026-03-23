import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Landmark, CheckSquare, Loader2, CheckCircle, Users, Activity, FileText, ShieldCheck, ClipboardList, DollarSign, Hammer } from 'lucide-react';
import { TICKET_STATUS } from '../constants/ticketStatus';
import { useApp } from '../context/AppContext';
import { fetchCatalog, type CatalogSite } from '../services/catalogApi';
import { fetchTrackingDetailsFromApi, patchTrackingTicketInApi, TrackingProcurementSummary } from '../services/ticketsApi';
import type { Ticket } from '../types';
import { formatDateTimeSafe } from '../utils/date';
import { repairMojibake } from '../utils/text';
import { getTicketSiteLabel } from '../utils/ticketTerritory';

interface TrackingViewProps {
  ticketToken: string | null;
  onBack: () => void;
}

interface PublicTimelineItem {
  id: string;
  title: string;
  description: string;
  date?: Date | null;
  status: 'done' | 'current' | 'pending';
  icon: 'opened' | 'preliminary' | 'execution' | 'measurement' | 'payment' | 'closure' | 'guarantee';
}

function formatDateLabel(date?: Date | null) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'Não informado';
  return date.toLocaleDateString('pt-BR');
}

function normalizeGuaranteeStatus(status?: string | null) {
  if (status === 'active') return 'Ativa';
  if (status === 'expired') return 'Expirada';
  return 'Pendente';
}

function getTimelineIcon(icon: PublicTimelineItem['icon']) {
  switch (icon) {
    case 'opened':
      return <Landmark size={16} />;
    case 'preliminary':
      return <ClipboardList size={16} />;
    case 'execution':
      return <Hammer size={16} />;
    case 'measurement':
      return <Activity size={16} />;
    case 'payment':
      return <DollarSign size={16} />;
    case 'closure':
      return <CheckSquare size={16} />;
    case 'guarantee':
      return <ShieldCheck size={16} />;
    default:
      return <CheckCircle size={16} />;
  }
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
      return cleanStatus || 'Atualização';
  }
}

function isPublicSafeHistoryItem(item: Ticket['history'][number]) {
  const text = repairMojibake(item?.text || '').trim();
  if (!text) return false;
  if (item.type === 'customer') return true;
  if (item.type === 'tech') {
    if (item.visibility === 'internal') return false;
    if (item.visibility === 'public') return true;
    const normalizedText = text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const hasSensitiveTerm =
      normalizedText.includes('orcamento') ||
      normalizedText.includes('contrato') ||
      normalizedText.includes('aditivo') ||
      normalizedText.includes('pagamento') ||
      normalizedText.includes('parcela') ||
      normalizedText.includes('r$');
    const isInternalOnly =
      normalizedText.includes('parecer consolidado e enviado para aprovacao da diretoria') ||
      normalizedText.includes('painel da os atualizado');
    return !hasSensitiveTerm && !isInternalOnly;
  }
  if (item.type !== 'system') return false;

  const normalizedText = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (item.visibility === 'public') return true;

  const allowedPublicSystemEvents = [
    'solicitacao registrada via formulario publico',
    'status atualizado de',
    'execucao iniciada',
    'inicio da execucao',
    'execucao concluida',
    'os encerrada',
    'os cancelada',
  ];

  const hasPublicEvent = allowedPublicSystemEvents.some(value => normalizedText.includes(value));
  if (!hasPublicEvent) return false;

  const hasSensitiveTerm =
    normalizedText.includes('orcamento') ||
    normalizedText.includes('contrato') ||
    normalizedText.includes('aditivo') ||
    normalizedText.includes('pagamento') ||
    normalizedText.includes('parcela') ||
    normalizedText.includes('r$');

  return !hasSensitiveTerm;
}

function getPublicHistoryText(item: Ticket['history'][number]) {
  const rawText = repairMojibake(item.text || '').trim();
  if (!rawText) return rawText;
  if (item.type !== 'system') return rawText;

  const statusMatch = rawText.match(/Status atualizado de\s+"([^"]+)"\s+para\s+"([^"]+)"/i);
  if (statusMatch?.[2]) {
    return `Status atualizado: ${getPublicStatusLabel(statusMatch[2].trim())}.`;
  }

  const normalizedText = rawText
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (
    normalizedText.includes('execucao iniciada') ||
    normalizedText.includes('inicio da execucao')
  ) {
    return 'Execução iniciada.';
  }

  if (normalizedText.includes('execucao concluida')) {
    return 'Execução concluída.';
  }

  return rawText;
}

function buildPublicTimeline(ticket: Ticket, procurement: TrackingProcurementSummary, sites: CatalogSite[]): PublicTimelineItem[] {
  const measurements = procurement.measurements || [];
  const payments = procurement.payments || [];
  const hasPayments = payments.length > 0;
  const siteLabel = getTicketSiteLabel(ticket, sites);

  return [
    {
      id: 'opened',
      title: 'Solicitação registrada',
      description: `OS aberta para ${siteLabel}.`,
      date: ticket.time,
      status: 'done',
      icon: 'opened',
    },
    {
      id: 'preliminary',
      title: 'Preparação da execução',
      description: ticket.preliminaryActions
        ? `Checklist operacional ${ticket.preliminaryActions.updatedAt ? 'atualizado' : 'iniciado'} com material, cronograma e alinhamentos.`
        : 'Planejamento pré-execução ainda não informado no sistema.',
      date:
        ticket.preliminaryActions?.updatedAt ||
        ticket.preliminaryActions?.plannedStartAt ||
        ticket.preliminaryActions?.materialEta ||
        null,
      status: ticket.preliminaryActions ? 'done' : ticket.status === TICKET_STATUS.NEW ? 'pending' : 'current',
      icon: 'preliminary',
    },
    {
      id: 'execution',
      title: 'Execução do serviço',
      description: ticket.closureChecklist?.serviceStartedAt || ticket.preliminaryActions?.actualStartAt
        ? 'A equipe técnica iniciou a execução da manutenção.'
        : 'Serviço ainda não marcado como iniciado.',
      date: ticket.closureChecklist?.serviceStartedAt || ticket.preliminaryActions?.actualStartAt || null,
      status:
        ticket.closureChecklist?.serviceStartedAt || ticket.preliminaryActions?.actualStartAt
          ? 'done'
          : ticket.status === TICKET_STATUS.IN_PROGRESS
            ? 'current'
            : 'pending',
      icon: 'execution',
    },
    {
      id: 'measurement',
      title: 'Medições registradas',
      description:
        measurements.length > 0
          ? `${measurements.length} medição(ões) lançadas para acompanhamento da obra.`
          : 'Nenhuma medição formal registrada até o momento.',
      date: measurements[0]?.requestedAt || measurements[0]?.approvedAt || null,
      status: measurements.length > 0 ? 'done' : ticket.status === TICKET_STATUS.WAITING_PAYMENT ? 'current' : 'pending',
      icon: 'measurement',
    },
    {
      id: 'payment',
      title: 'Pagamento',
      description:
        hasPayments
          ? 'Etapa financeira em andamento no time interno.'
          : 'Plano financeiro ainda não iniciado.',
      date: payments.find(payment => payment.status === 'paid')?.paidAt || payments[0]?.dueAt || null,
      status:
        !hasPayments ? 'pending' : ticket.status === TICKET_STATUS.CLOSED ? 'done' : ticket.status === TICKET_STATUS.WAITING_PAYMENT ? 'current' : 'pending',
      icon: 'payment',
    },
    {
      id: 'closure',
      title: 'Encerramento',
      description:
        ticket.status === TICKET_STATUS.CLOSED
          ? 'OS encerrada com sucesso.'
          : ticket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL
            ? 'Aguardando confirmação do solicitante sobre a conclusão da obra.'
          : 'Aguardando conclusão financeira para encerramento definitivo.',
      date: ticket.closureChecklist?.closedAt || null,
      status:
        ticket.status === TICKET_STATUS.CLOSED
          ? 'done'
          : ticket.status === TICKET_STATUS.WAITING_PAYMENT || ticket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL
            ? 'current'
            : 'pending',
      icon: 'closure',
    },
    {
      id: 'guarantee',
      title: 'Garantia',
      description: ticket.guarantee?.startAt
        ? `Garantia ${normalizeGuaranteeStatus(ticket.guarantee.status).toLowerCase()} até ${formatDateLabel(ticket.guarantee.endAt)}.`
        : 'Garantia ainda não iniciada.',
      date: ticket.guarantee?.startAt || ticket.guarantee?.endAt || null,
      status: ticket.guarantee?.startAt ? 'done' : ticket.status === TICKET_STATUS.CLOSED ? 'current' : 'pending',
      icon: 'guarantee',
    },
  ];
}

export function TrackingView({ ticketToken, onBack }: TrackingViewProps) {
  const { tickets } = useApp();
  const latestTicketsRef = useRef(tickets);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [procurement, setProcurement] = useState<TrackingProcurementSummary>({ contract: null, measurements: [], payments: [] });
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
      setProcurement({ contract: null, measurements: [], payments: [] });
      setLoading(false);
      return undefined;
    }

    setLoading(true);
    (async () => {
      try {
        const remote = await fetchTrackingDetailsFromApi(ticketToken);
        if (!cancelled) {
          setTicket(remote.ticket);
          setProcurement(remote.procurement);
        }
      } catch {
        if (!cancelled) {
          setTicket(latestTicketsRef.current.find(item => item.trackingToken === ticketToken) || null);
          setProcurement({ contract: null, measurements: [], payments: [] });
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

  const timeline = useMemo(() => {
    if (!ticket) return [];
    return buildPublicTimeline(ticket, procurement, sites);
  }, [ticket, procurement, sites]);

  const canRequesterApprove =
    Boolean(ticket) &&
    (ticket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL || ticket.status === TICKET_STATUS.WAITING_PAYMENT) &&
    !ticket.closureChecklist?.requesterApproved;

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
      setProcurement(refreshed.procurement);
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

  const closureDocuments = ticket.closureChecklist?.documents || [];
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
                <span className="w-2 h-2 rounded-full bg-roman-primary animate-pulse"></span> {getPublicStatusLabel(ticket.status)}
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

          <div className="mb-6">
            <h3 className="font-serif text-lg font-medium text-roman-text-main mb-3">Etapas da OS</h3>
            <div className="grid gap-2 md:grid-cols-2">
              {timeline.map(step => (
                <div
                  key={step.id}
                  className={`rounded-xl border px-3 py-3 ${
                    step.status === 'done'
                      ? 'border-emerald-200 bg-emerald-50/60'
                      : step.status === 'current'
                        ? 'border-roman-primary/40 bg-roman-primary/10'
                        : 'border-roman-border bg-roman-surface'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
                        step.status === 'done'
                          ? 'bg-emerald-600 text-white'
                          : step.status === 'current'
                            ? 'bg-roman-primary text-white'
                            : 'bg-roman-bg text-roman-text-sub'
                      }`}
                    >
                      {getTimelineIcon(step.icon)}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-roman-text-main">{step.title}</div>
                      <div className="text-xs text-roman-text-sub">
                        {step.date ? formatDateTimeSafe(step.date) : 'Sem data'}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-roman-text-sub">{step.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="font-serif text-lg font-medium text-roman-text-main mb-6">Histórico</h3>
            <div className="space-y-4 relative md:before:absolute md:before:inset-0 md:before:mx-auto md:before:translate-x-0 md:before:h-full md:before:w-0.5 md:before:bg-gradient-to-b md:before:from-transparent md:before:via-roman-border md:before:to-transparent">
              {ticket.history
                .filter(isPublicSafeHistoryItem)
                .map((item, index) => {
                  const isExternalMessage = item.type === 'customer';

                  return (
                    <div
                      key={index}
                      className={`relative flex flex-col md:flex-row items-start md:items-center justify-between md:justify-normal gap-4 md:gap-0 ${
                        isExternalMessage ? 'md:flex-row-reverse' : ''
                      }`}
                    >
                      <div
                        className={`flex items-center justify-center w-10 h-10 rounded-full border border-white shadow shrink-0 md:order-1 z-10 self-start md:self-center ${
                          isExternalMessage
                            ? 'bg-roman-primary text-white md:-translate-x-1/2'
                            : 'bg-roman-surface text-roman-primary md:translate-x-1/2'
                        }`}
                      >
                        {item.type === 'customer' ? <Users size={16} /> : item.type === 'tech' ? <Activity size={16} /> : <CheckCircle size={16} />}
                      </div>
                      <div
                        className={`w-full md:w-[calc(50%-2.5rem)] border px-4 py-3.5 rounded-2xl shadow-sm ${
                          isExternalMessage
                            ? 'bg-roman-primary/5 border-roman-primary/20 text-right'
                            : 'bg-roman-surface border-roman-border text-left'
                        }`}
                      >
                        <div className={`flex items-center gap-3 mb-1 ${isExternalMessage ? 'justify-end' : 'justify-between'}`}>
                          <div className="font-serif font-medium text-roman-text-main">
                            {repairMojibake(item.sender || 'Sistema')}
                          </div>
                          {item.time && <div className="text-xs text-roman-text-sub font-serif italic">{formatDateTimeSafe(item.time)}</div>}
                        </div>
                        <div className="text-sm text-roman-text-main leading-relaxed">{getPublicHistoryText(item)}</div>
                      </div>
                    </div>
                  );
                })}
              {ticket.history.filter(isPublicSafeHistoryItem).length === 0 && (
                <div className="rounded-2xl border border-roman-border bg-roman-surface px-4 py-3 text-sm text-roman-text-sub">
                  Ainda não há atualizações públicas disponíveis no histórico.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

