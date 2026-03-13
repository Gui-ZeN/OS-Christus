import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Landmark, CheckSquare, Loader2, CheckCircle, Users, Activity, FileText, ShieldCheck, ClipboardList, DollarSign, Hammer } from 'lucide-react';
import { TICKET_STATUS } from '../constants/ticketStatus';
import { useApp } from '../context/AppContext';
import { fetchCatalog, type CatalogSite } from '../services/catalogApi';
import { fetchTrackingDetailsFromApi, TrackingProcurementSummary } from '../services/ticketsApi';
import type { Ticket } from '../types';
import { formatDateTimeSafe } from '../utils/date';
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
      title: 'Ações preliminares',
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
          : 'Aguardando conclusão financeira para encerramento definitivo.',
      date: ticket.closureChecklist?.closedAt || null,
      status:
        ticket.status === TICKET_STATUS.CLOSED
          ? 'done'
          : ticket.status === TICKET_STATUS.WAITING_PAYMENT
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
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [procurement, setProcurement] = useState<TrackingProcurementSummary>({ contract: null, measurements: [], payments: [] });
  const [sites, setSites] = useState<CatalogSite[]>([]);
  const [loading, setLoading] = useState(true);

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
          setTicket(tickets.find(item => item.trackingToken === ticketToken) || null);
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
  }, [ticketToken, tickets]);

  const timeline = useMemo(() => {
    if (!ticket) return [];
    return buildPublicTimeline(ticket, procurement, sites);
  }, [ticket, procurement, sites]);

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
                <span className="w-2 h-2 rounded-full bg-roman-primary animate-pulse"></span> {ticket.status}
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h2 className="text-xl font-serif text-roman-text-main mb-2">{ticket.subject}</h2>
            <p className="text-roman-text-sub">
              Solicitado por: {ticket.requester} • Setor: {ticket.sector} ({siteLabel})
            </p>
          </div>

          <div>
            <h3 className="font-serif text-lg font-medium text-roman-text-main mb-6">Histórico</h3>
            <div className="space-y-4 relative md:before:absolute md:before:inset-0 md:before:mx-auto md:before:translate-x-0 md:before:h-full md:before:w-0.5 md:before:bg-gradient-to-b md:before:from-transparent md:before:via-roman-border md:before:to-transparent">
              {ticket.history
                .filter(item => item.type !== 'field_change' && item.text)
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
                          <div className="font-serif font-medium text-roman-text-main">{item.sender || 'Sistema'}</div>
                          {item.time && <div className="text-xs text-roman-text-sub font-serif italic">{formatDateTimeSafe(item.time)}</div>}
                        </div>
                        <div className="text-sm text-roman-text-main leading-relaxed">{item.text}</div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

