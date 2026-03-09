import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Landmark, CheckSquare, Loader2, CheckCircle, Users, Activity, FileText, ShieldCheck, ClipboardList, DollarSign, Hammer } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { TICKET_STATUS } from '../constants/ticketStatus';
import { useApp } from '../context/AppContext';
import { fetchCatalog, type CatalogSite } from '../services/catalogApi';
import { fetchTrackingDetailsFromApi, patchTrackingTicketInApi, TrackingProcurementSummary } from '../services/ticketsApi';
import type { HistoryItem, Ticket } from '../types';
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
  const paidCount = payments.filter(payment => payment.status === 'paid').length;
  const totalPayments = payments.length;
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
        totalPayments > 0
          ? `${paidCount} de ${totalPayments} parcela(s) confirmada(s).`
          : 'Plano de pagamento ainda não gerado.',
      date: payments.find(payment => payment.status === 'paid')?.paidAt || payments[0]?.dueAt || null,
      status:
        totalPayments === 0 ? 'pending' : paidCount === totalPayments ? 'done' : ticket.status === TICKET_STATUS.WAITING_PAYMENT ? 'current' : 'pending',
      icon: 'payment',
    },
    {
      id: 'closure',
      title: 'Encerramento',
      description: ticket.closureChecklist?.requesterApproved
        ? 'Solicitante validou a entrega do serviço.'
        : 'Aguardando validação final do encerramento.',
      date: ticket.closureChecklist?.requesterApprovedAt || ticket.closureChecklist?.closedAt || null,
      status:
        ticket.status === TICKET_STATUS.CLOSED || ticket.closureChecklist?.requesterApproved
          ? 'done'
          : ticket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL
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
  const [isProcessing, setIsProcessing] = useState(false);

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
        <div className="bg-roman-surface border border-roman-border p-8 rounded-sm shadow-sm text-center max-w-md w-full">
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
          <div className="bg-roman-surface border border-roman-border p-8 rounded-sm shadow-sm mb-6 text-center">
            <h1 className="text-2xl font-serif text-roman-text-main font-medium mb-2">OS não encontrada</h1>
            <p className="text-roman-text-sub">O link de acompanhamento é inválido ou expirou.</p>
          </div>
        </div>
      </div>
    );
  }

  const closureDocuments = ticket.closureChecklist?.documents || [];
  const siteLabel = getTicketSiteLabel(ticket, sites);

  const handleValidate = async (approved: boolean) => {
    setIsProcessing(true);

    const newStatus = approved ? TICKET_STATUS.WAITING_PAYMENT : TICKET_STATUS.IN_PROGRESS;
    const newHistoryItem: HistoryItem = {
      id: uuidv4(),
      type: 'customer',
      sender: ticket.requester,
      time: new Date(),
      text: approved
        ? 'Manutenção aprovada pelo solicitante. Aguardando liberação do pagamento.'
        : 'Solicitante reportou pendências. Equipe técnica notificada para revisão.',
    };

    const nextTicket: Ticket = {
      ...ticket,
      status: newStatus,
      closureChecklist: approved
        ? {
            requesterApproved: true,
            requesterApprovedBy: ticket.requester,
            requesterApprovedAt: new Date(),
            infrastructureApprovedByRafael: ticket.closureChecklist?.infrastructureApprovedByRafael ?? false,
            infrastructureApprovedByFernando: ticket.closureChecklist?.infrastructureApprovedByFernando ?? false,
            closureNotes: ticket.closureChecklist?.closureNotes || '',
            serviceStartedAt:
              ticket.closureChecklist?.serviceStartedAt ||
              ticket.preliminaryActions?.actualStartAt ||
              ticket.preliminaryActions?.plannedStartAt ||
              null,
            serviceCompletedAt: new Date(),
            closedAt: ticket.closureChecklist?.closedAt || null,
            documents: ticket.closureChecklist?.documents || [],
          }
        : ticket.closureChecklist,
      history: [...ticket.history, newHistoryItem],
    };

    try {
      await patchTrackingTicketInApi(ticketToken, {
        status: newStatus,
        closureChecklist: nextTicket.closureChecklist,
        history: nextTicket.history,
      });
      setTicket(nextTicket);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="h-screen w-full bg-roman-bg overflow-y-auto flex flex-col items-center py-12 px-4 relative">
      <button onClick={onBack} className="absolute top-6 left-6 flex items-center gap-2 text-roman-text-sub hover:text-roman-text-main font-medium transition-colors">
        <ArrowRight size={16} className="rotate-180" /> Voltar ao sistema interno
      </button>

      <div className="max-w-4xl w-full">
        <div className="bg-roman-surface border border-roman-border p-8 rounded-sm shadow-sm mb-6">
          <div className="flex justify-between items-start mb-8 border-b border-roman-border pb-6 gap-4">
            <div>
              <div className="text-roman-primary mb-4">
                <Landmark size={36} strokeWidth={1.5} />
              </div>
              <h1 className="text-2xl font-serif text-roman-text-main font-medium mb-1">Acompanhamento de OS</h1>
              <p className="text-roman-text-sub font-serif italic">Portal do solicitante</p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-serif text-roman-text-main font-medium">#{ticket.id}</div>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-roman-primary/10 text-roman-primary border border-roman-primary/20 rounded-sm text-sm font-medium mt-2">
                <span className="w-2 h-2 rounded-full bg-roman-primary animate-pulse"></span> {ticket.status}
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-serif text-roman-text-main mb-2">{ticket.subject}</h2>
            <p className="text-roman-text-sub">
              Solicitado por: {ticket.requester} • Setor: {ticket.sector} ({siteLabel})
            </p>
          </div>

          <section className="mb-8 border border-roman-border rounded-sm bg-roman-bg p-4">
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <h3 className="font-serif text-lg text-roman-text-main">Linha do tempo da OS</h3>
                <p className="text-sm text-roman-text-sub">Visão resumida de preliminar, execução, medição, pagamento e encerramento.</p>
              </div>
              <div className="text-xs text-roman-text-sub">Contrato: {procurement.contract?.vendor || 'A definir'}</div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {timeline.map(item => (
                <div key={item.id} className={`rounded-sm border px-4 py-3 ${item.status === 'done' ? 'border-green-200 bg-green-50/60' : item.status === 'current' ? 'border-roman-primary/30 bg-roman-primary/5' : 'border-roman-border bg-roman-surface'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full ${item.status === 'done' ? 'bg-green-700 text-white' : item.status === 'current' ? 'bg-roman-primary text-white' : 'bg-roman-bg text-roman-text-sub border border-roman-border'}`}>
                      {getTimelineIcon(item.icon)}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-roman-text-main">{item.title}</div>
                      <div className="text-sm text-roman-text-sub mt-1">{item.description}</div>
                      <div className="text-xs text-roman-text-sub mt-2">{item.date ? formatDateTimeSafe(item.date) : 'Sem data registrada'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2 mb-8">
            <div className="border border-roman-border rounded-sm bg-roman-bg p-4">
              <h3 className="font-serif text-lg text-roman-text-main mb-3 flex items-center gap-2">
                <Activity size={18} /> Medições e pagamento
              </h3>
              <div className="space-y-2 text-sm text-roman-text-main">
                <div>Medições registradas: {procurement.measurements.length}</div>
                <div>Parcelas previstas: {procurement.payments.length}</div>
                <div>Parcelas pagas: {procurement.payments.filter(payment => payment.status === 'paid').length}</div>
                <div>Fornecedor: {procurement.contract?.vendor || 'Não definido'}</div>
              </div>
            </div>

            <div className="border border-roman-border rounded-sm bg-roman-bg p-4">
              <h3 className="font-serif text-lg text-roman-text-main mb-3 flex items-center gap-2">
                <ShieldCheck size={18} /> Garantia e encerramento
              </h3>
              <div className="space-y-2 text-sm text-roman-text-main">
                <div>Início do serviço: {formatDateLabel(ticket.closureChecklist?.serviceStartedAt)}</div>
                <div>Término do serviço: {formatDateLabel(ticket.closureChecklist?.serviceCompletedAt)}</div>
                <div>Garantia: {normalizeGuaranteeStatus(ticket.guarantee?.status)}</div>
                <div>Fim da garantia: {formatDateLabel(ticket.guarantee?.endAt)}</div>
              </div>
            </div>
          </div>

          {(ticket.closureChecklist || ticket.guarantee) && (
            <div className="grid gap-4 md:grid-cols-2 mb-8">
              <div className="border border-roman-border rounded-sm bg-roman-bg p-4">
                <h3 className="font-serif text-lg text-roman-text-main mb-3 flex items-center gap-2">
                  <FileText size={18} /> Encerramento
                </h3>
                <div className="space-y-2 text-sm text-roman-text-main">
                  <div>Solicitante validou: {ticket.closureChecklist?.requesterApproved ? 'Sim' : 'Não'}</div>
                  <div>
                    Infraestrutura validou: {ticket.closureChecklist?.infrastructureApprovedByRafael || ticket.closureChecklist?.infrastructureApprovedByFernando ? 'Sim' : 'Não'}
                  </div>
                  <div>Laudos anexados: {closureDocuments.length}</div>
                  {ticket.closureChecklist?.closureNotes && <div>Observações: {ticket.closureChecklist.closureNotes}</div>}
                </div>

                {closureDocuments.length > 0 && (
                  <div className="mt-4 space-y-2">
                    {closureDocuments.map(document => (
                      <button
                        key={document.id}
                        onClick={() => window.open(document.url, '_blank', 'noopener,noreferrer')}
                        className="w-full text-left px-3 py-2 rounded-sm border border-roman-border hover:border-roman-primary hover:bg-roman-surface transition-colors text-sm"
                      >
                        {document.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-roman-border rounded-sm bg-roman-bg p-4">
                <h3 className="font-serif text-lg text-roman-text-main mb-3 flex items-center gap-2">
                  <DollarSign size={18} /> Parcelas
                </h3>
                <div className="space-y-2">
                  {procurement.payments.length === 0 ? (
                    <div className="text-sm text-roman-text-sub">Plano de pagamento ainda não cadastrado.</div>
                  ) : (
                    procurement.payments.map(payment => (
                      <div key={payment.id} className="border border-roman-border rounded-sm bg-roman-surface px-3 py-2 text-sm">
                        <div className="font-medium text-roman-text-main">{payment.label || `Parcela ${payment.installmentNumber || '-'}`}</div>
                        <div className="text-roman-text-sub">
                          {payment.value} • {payment.status === 'paid' ? 'Pago' : 'Pendente'} • {payment.paidAt ? `confirmado em ${formatDateLabel(payment.paidAt)}` : `vencimento ${formatDateLabel(payment.dueAt)}`}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {ticket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL && (
            <div className="bg-roman-primary/10 border border-roman-primary/30 p-6 rounded-sm shadow-sm mb-8 animate-in fade-in slide-in-from-bottom-4">
              <h3 className="font-serif text-lg font-medium text-roman-primary mb-2 flex items-center gap-2">
                <CheckSquare size={20} /> Validação da manutenção
              </h3>
              <p className="text-sm text-roman-text-main mb-6">
                A equipe técnica informou que o serviço foi concluído. Verifique o local e confirme se a entrega está aprovada.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button onClick={() => void handleValidate(false)} disabled={isProcessing} className="px-6 py-2 border border-red-200 text-red-700 hover:bg-red-50 rounded-sm font-medium transition-colors text-sm disabled:opacity-50">
                  Ainda com pendências
                </button>
                <button onClick={() => void handleValidate(true)} disabled={isProcessing} className="px-6 py-2 bg-roman-primary hover:bg-roman-primary-hover text-white rounded-sm font-medium transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-50">
                  {isProcessing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
                  Serviço aprovado
                </button>
              </div>
            </div>
          )}

          <div>
            <h3 className="font-serif text-lg font-medium text-roman-text-main mb-6">Histórico</h3>
            <div className="space-y-6 relative md:before:absolute md:before:inset-0 md:before:mx-auto md:before:translate-x-0 md:before:h-full md:before:w-0.5 md:before:bg-gradient-to-b md:before:from-transparent md:before:via-roman-border md:before:to-transparent">
              {ticket.history
                .filter(item => item.type !== 'field_change' && item.text)
                .map((item, index) => (
                  <div key={index} className="relative flex flex-col md:flex-row items-start md:items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active gap-4 md:gap-0">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-roman-surface text-roman-primary shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10 self-start md:self-center">
                      {item.type === 'customer' ? <Users size={16} /> : item.type === 'tech' ? <Activity size={16} /> : <CheckCircle size={16} />}
                    </div>
                    <div className="w-full md:w-[calc(50%-2.5rem)] bg-roman-surface border border-roman-border p-4 rounded-sm shadow-sm md:group-odd:text-right">
                      <div className="flex items-center justify-between md:group-odd:flex-row-reverse mb-1">
                        <div className="font-serif font-medium text-roman-text-main">{item.sender || 'Sistema'}</div>
                        {item.time && <div className="text-xs text-roman-text-sub font-serif italic">{formatDateTimeSafe(item.time)}</div>}
                      </div>
                      <div className="text-sm text-roman-text-main leading-relaxed">{item.text}</div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
