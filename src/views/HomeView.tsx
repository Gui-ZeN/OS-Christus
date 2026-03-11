import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart2,
  Building2,
  CircleDollarSign,
  MapPinned,
  Plus,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { ActivityItem } from '../components/ui/ActivityItem';
import { StatCard } from '../components/ui/StatCard';
import { TICKET_STATUS } from '../constants/ticketStatus';
import { useApp } from '../context/AppContext';
import { fetchCatalog, type CatalogRegion, type CatalogSite } from '../services/catalogApi';
import { fetchProcurementData } from '../services/procurementApi';
import type { ContractRecord, PaymentRecord } from '../types';
import { getTicketRegionId, getTicketRegionLabel, getTicketSiteId, getTicketSiteLabel } from '../utils/ticketTerritory';

const ACTIVITY_TITLES: Record<string, string> = {
  customer: 'Mensagem do Solicitante',
  tech: 'Parecer Técnico Recebido',
  system: 'Atualização de Status',
};

function formatActivityTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return 'agora';
  if (diffMins < 60) return `${diffMins}min`;
  if (diffHours < 24) {
    const h = date.getHours().toString().padStart(2, '0');
    const m = date.getMinutes().toString().padStart(2, '0');
    return `${h}:${m}`;
  }
  if (diffDays === 1) return 'Ontem';
  return `${diffDays}d`;
}

function isOpenStatus(status: string) {
  return status !== TICKET_STATUS.CLOSED && status !== TICKET_STATUS.CANCELED;
}

function buildGreetingName(name: string | null | undefined, email: string) {
  if (name) return name;
  return (
    email
      .split('@')[0]
      ?.replace(/[-_.]+/g, ' ')
      ?.replace(/\b\w/g, char => char.toUpperCase()) || 'Usuário'
  );
}

function parseCurrency(value: string) {
  const normalized = String(value || '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function normalizeText(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function HomeView() {
  const { navigateTo, setActiveTicketId, setInboxFilter, tickets, currentUser, currentUserEmail } = useApp();
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedSite, setSelectedSite] = useState('all');
  const [contractsByTicket, setContractsByTicket] = useState<Record<string, ContractRecord>>({});
  const [paymentsByTicket, setPaymentsByTicket] = useState<Record<string, PaymentRecord[]>>({});
  const [regions, setRegions] = useState<CatalogRegion[]>([]);
  const [sites, setSites] = useState<CatalogSite[]>([]);
  const greetingName = buildGreetingName(currentUser?.name, currentUserEmail);
  const isExecutive = currentUser?.role === 'Admin' || currentUser?.role === 'Diretor';
  const isSupervisor = currentUser?.role === 'Supervisor';
  const isRequester = currentUser?.role === 'Usuario';

  const clearInboxFilters = () =>
    setInboxFilter({
      status: [],
      priority: [],
      region: [],
      site: [],
      type: [],
    });

  const openInboxWithStatus = (statuses: string[]) => {
    setInboxFilter({
      status: statuses,
      priority: [],
      region: [],
      site: [],
      type: [],
    });
    navigateTo('inbox');
  };

  const openTicketWorkspace = (ticketId: string, destination: 'inbox' | 'approvals' | 'finance' = 'inbox') => {
    setActiveTicketId(ticketId);
    if (destination === 'inbox') {
      clearInboxFilters();
    }
    navigateTo(destination);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchProcurementData();
        if (!cancelled) {
          setContractsByTicket(data.contractsByTicket);
          setPaymentsByTicket(data.paymentsByTicket);
        }
      } catch {
        if (!cancelled) {
          setContractsByTicket({});
          setPaymentsByTicket({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const catalog = await fetchCatalog();
        if (!cancelled) {
          setRegions(catalog.regions);
          setSites(catalog.sites);
        }
      } catch {
        if (!cancelled) {
          setRegions([]);
          setSites([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const availableRegions = useMemo(() => {
    const values: string[] = tickets.map(ticket => getTicketRegionLabel(ticket, regions, sites)).filter((value): value is string => Boolean(value));
    const fallbackValues: string[] = regions.map(region => region.name).filter((value): value is string => Boolean(value));
    const source = values.length ? values : fallbackValues;
    return [...new Set(source)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [regions, sites, tickets]);

  const selectedRegionId = useMemo(() => {
    if (selectedRegion === 'all') return null;
    return regions.find(region => region.name === selectedRegion)?.id || null;
  }, [regions, selectedRegion]);

  const availableSites = useMemo(() => {
    const values: string[] = tickets
      .filter(ticket => selectedRegion === 'all' || getTicketRegionLabel(ticket, regions, sites) === selectedRegion)
      .map(ticket => getTicketSiteLabel(ticket, sites))
      .filter((value): value is string => Boolean(value));
    const fallbackValues: string[] = sites
      .filter(site => selectedRegion === 'all' || !selectedRegionId || site.regionId === selectedRegionId)
      .map(site => site.code || site.name)
      .filter((value): value is string => Boolean(value));
    const source = values.length ? values : fallbackValues;
    return [...new Set(source)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [selectedRegion, selectedRegionId, sites, tickets, regions]);

  useEffect(() => {
    if (selectedRegion !== 'all' && !availableRegions.includes(selectedRegion)) {
      setSelectedRegion('all');
    }
  }, [availableRegions, selectedRegion]);

  useEffect(() => {
    if (selectedSite !== 'all' && !availableSites.includes(selectedSite)) {
      setSelectedSite('all');
    }
  }, [availableSites, selectedSite]);

  const scopedTickets = useMemo(() => {
    return tickets.filter(ticket => {
      if (selectedRegion !== 'all' && getTicketRegionLabel(ticket, regions, sites) !== selectedRegion) return false;
      if (selectedSite !== 'all' && getTicketSiteLabel(ticket, sites) !== selectedSite) return false;
      return true;
    });
  }, [regions, selectedRegion, selectedSite, sites, tickets]);

  const stats = useMemo(
    () => ({
      novas: scopedTickets.filter(ticket => ticket.status === TICKET_STATUS.NEW).length,
      aguardandoOrcamento: scopedTickets.filter(ticket => ticket.status === TICKET_STATUS.WAITING_BUDGET).length,
      aguardandoAprovacao: scopedTickets.filter(ticket => ticket.status.toLowerCase().includes('aprova')).length,
      encerradas: scopedTickets.filter(ticket => ticket.status === TICKET_STATUS.CLOSED).length,
      slaVencido: scopedTickets.filter(ticket => ticket.sla?.status === 'overdue').length,
      aguardandoPagamento: scopedTickets.filter(ticket => ticket.status === TICKET_STATUS.WAITING_PAYMENT).length,
    }),
    [scopedTickets]
  );

  const recentActivity = useMemo(() => {
    return scopedTickets
      .flatMap(ticket =>
        ticket.history
          .filter(item => item.type !== 'field_change')
          .map(item => ({ ...item, ticketId: ticket.id, subject: ticket.subject }))
      )
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .slice(0, 6);
  }, [scopedTickets]);

  const regionalExecutiveBoard = useMemo(() => {
    const grouped = new Map<string, {
      label: string;
      region: string;
      open: number;
      approvals: number;
      waitingPayment: number;
      overdue: number;
      contractedValue: number;
      paidValue: number;
    }>();

    for (const ticket of scopedTickets) {
      const regionLabel = getTicketRegionLabel(ticket, regions, sites);
      const siteLabel = getTicketSiteLabel(ticket, sites);
      const label = selectedRegion === 'all' ? regionLabel : siteLabel;
      const key = selectedRegion === 'all' ? getTicketRegionId(ticket, regions, sites) || regionLabel : `${getTicketRegionId(ticket, regions, sites) || regionLabel}|${getTicketSiteId(ticket, sites) || siteLabel}`;
      if (!grouped.has(key)) {
        grouped.set(key, {
          label,
          region: regionLabel,
          open: 0,
          approvals: 0,
          waitingPayment: 0,
          overdue: 0,
          contractedValue: 0,
          paidValue: 0,
        });
      }

      const current = grouped.get(key)!;
      if (isOpenStatus(ticket.status)) current.open += 1;
      if (ticket.status.toLowerCase().includes('aprova')) current.approvals += 1;
      if (ticket.status === TICKET_STATUS.WAITING_PAYMENT) current.waitingPayment += 1;
      if (ticket.sla?.status === 'overdue') current.overdue += 1;
      current.contractedValue += parseCurrency(contractsByTicket[ticket.id]?.value || '');
      current.paidValue += (paymentsByTicket[ticket.id] || [])
        .filter(payment => payment.status === 'paid')
        .reduce((total, payment) => total + parseCurrency(payment.value), 0);
    }

    return [...grouped.values()]
      .sort((a, b) => b.open + b.approvals + b.waitingPayment - (a.open + a.approvals + a.waitingPayment))
      .slice(0, 8);
  }, [contractsByTicket, paymentsByTicket, regions, scopedTickets, selectedRegion, sites]);

  const executiveFinancialSummary = useMemo(() => {
    let contracted = 0;
    let planned = 0;
    let paid = 0;

    for (const ticket of scopedTickets) {
      contracted += parseCurrency(contractsByTicket[ticket.id]?.value || '');
      const payments = paymentsByTicket[ticket.id] || [];
      planned += payments.reduce((total, payment) => total + parseCurrency(payment.value), 0);
      paid += payments
        .filter(payment => payment.status === 'paid')
        .reduce((total, payment) => total + parseCurrency(payment.value), 0);
    }

    return {
      contracted,
      planned,
      paid,
      pending: Math.max(0, planned - paid),
    };
  }, [contractsByTicket, paymentsByTicket, scopedTickets]);

  const criticalTickets = useMemo(() => {
    return scopedTickets
      .filter(ticket => ticket.sla?.status === 'overdue' || ticket.status.toLowerCase().includes('aprova') || ticket.status === TICKET_STATUS.WAITING_PAYMENT)
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .slice(0, 6);
  }, [scopedTickets]);

  const guaranteeAlerts = useMemo(() => {
    return scopedTickets
      .filter(ticket => ticket.guarantee?.status === 'active' && ticket.guarantee.endAt)
      .map(ticket => ({
        id: ticket.id,
        subject: ticket.subject,
        site: getTicketSiteLabel(ticket, sites),
        region: getTicketRegionLabel(ticket, regions, sites),
        endAt: ticket.guarantee!.endAt!,
        daysLeft: Math.ceil((ticket.guarantee!.endAt!.getTime() - Date.now()) / 86400000),
      }))
      .filter(item => item.daysLeft <= 45)
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 5);
  }, [regions, scopedTickets, sites]);

  const executiveQueue = useMemo(() => {
    return scopedTickets
      .filter(ticket => [
        TICKET_STATUS.WAITING_SOLUTION_APPROVAL,
        TICKET_STATUS.WAITING_BUDGET_APPROVAL,
        TICKET_STATUS.WAITING_CONTRACT_APPROVAL,
        TICKET_STATUS.WAITING_PAYMENT,
      ].includes(ticket.status))
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .slice(0, 6);
  }, [scopedTickets]);

  const siteSpotlight = useMemo(
    () => scopedTickets.slice().sort((a, b) => b.time.getTime() - a.time.getTime()).slice(0, 6),
    [scopedTickets]
  );

  const requesterTickets = useMemo(() => {
    if (!isRequester) return [];
    const requesterEmailKey = normalizeText(currentUserEmail);
    const requesterNameKey = normalizeText(currentUser?.name);
    const emailPrefixKey = normalizeText(currentUserEmail.split('@')[0]);

    return scopedTickets
      .filter(ticket => {
        const ticketRequesterEmail = normalizeText(ticket.requesterEmail);
        const ticketRequesterName = normalizeText(ticket.requester);
        if (requesterEmailKey && ticketRequesterEmail === requesterEmailKey) return true;
        if (requesterNameKey && ticketRequesterName === requesterNameKey) return true;
        if (emailPrefixKey && ticketRequesterName.includes(emailPrefixKey)) return true;
        return false;
      })
      .sort((a, b) => b.time.getTime() - a.time.getTime());
  }, [currentUser?.name, currentUserEmail, isRequester, scopedTickets]);

  const supervisorBoard = useMemo(() => {
    if (!isSupervisor) return [];

    const grouped = new Map<string, { site: string; open: number; waitingValidation: number; waitingPayment: number; closed: number }>();
    for (const ticket of scopedTickets) {
      const siteLabel = getTicketSiteLabel(ticket, sites);
      const key = getTicketSiteId(ticket, sites) || siteLabel;
      if (!grouped.has(key)) {
        grouped.set(key, {
          site: siteLabel,
          open: 0,
          waitingValidation: 0,
          waitingPayment: 0,
          closed: 0,
        });
      }

      const current = grouped.get(key)!;
      if (isOpenStatus(ticket.status)) current.open += 1;
      if (ticket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL) current.waitingValidation += 1;
      if (ticket.status === TICKET_STATUS.WAITING_PAYMENT) current.waitingPayment += 1;
      if (ticket.status === TICKET_STATUS.CLOSED) current.closed += 1;
    }

    return [...grouped.values()].sort((a, b) => b.open - a.open);
  }, [isSupervisor, scopedTickets, sites]);

  const supervisorScopeSummary = useMemo(() => {
    if (!isSupervisor) return null;
    const assignedSites = sites.filter(site => (currentUser?.siteIds || []).includes(site.id));
    const assignedRegions = regions.filter(region => (currentUser?.regionIds || []).includes(region.id));
    return {
      sites: assignedSites,
      regions: assignedRegions,
    };
  }, [currentUser?.regionIds, currentUser?.siteIds, isSupervisor, regions, sites]);

  const supervisorTickets = useMemo(() => {
    if (!isSupervisor) return [];
    return scopedTickets
      .slice()
      .sort((a, b) => b.time.getTime() - a.time.getTime());
  }, [isSupervisor, scopedTickets]);

  const pendingRequesterValidations = useMemo(() => {
    return scopedTickets
      .filter(ticket => ticket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL)
      .sort((a, b) => b.time.getTime() - a.time.getTime())
      .slice(0, 5);
  }, [scopedTickets]);

  const upcomingPreliminaries = useMemo(() => {
    return scopedTickets
      .filter(ticket => ticket.preliminaryActions?.plannedStartAt || ticket.preliminaryActions?.materialEta)
      .sort((a, b) => {
        const aDate = (a.preliminaryActions?.plannedStartAt || a.preliminaryActions?.materialEta || a.time).getTime();
        const bDate = (b.preliminaryActions?.plannedStartAt || b.preliminaryActions?.materialEta || b.time).getTime();
        return aDate - bDate;
      })
      .slice(0, 5);
  }, [scopedTickets]);

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-4 md:p-5 xl:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-5 rounded-2xl border border-roman-border bg-roman-surface px-5 py-5 shadow-sm">
          <div className="text-[10px] font-serif uppercase tracking-[0.24em] text-roman-text-sub">Painel operacional</div>
          <h1 className="mt-2 text-[2rem] font-serif font-medium text-roman-text-main">Olá, {greetingName}</h1>
          <p className="mt-2 text-sm text-roman-text-sub font-serif italic">
            {isExecutive
              ? 'Dashboard executivo por região e sede, com foco em decisão, custo, pagamento e risco operacional.'
              : isSupervisor
                ? 'Painel da supervisão com foco em andamento por sede, validações pendentes e próximos movimentos.'
                : isRequester
                  ? 'Painel do solicitante com acompanhamento resumido das suas solicitações e do retorno da infraestrutura.'
                  : 'Aqui está o resumo das suas responsabilidades operacionais de hoje.'}
          </p>
        </header>

        {isExecutive ? (
          <div className="mb-6 grid gap-3 lg:grid-cols-[1fr_220px_220px] lg:items-center">
            <div className="text-sm text-roman-text-sub">
              Recorte atual: <span className="font-medium text-roman-text-main">{selectedRegion === 'all' ? 'todas as regiões visíveis' : selectedRegion}</span>
              {selectedSite !== 'all' && <span className="font-medium text-roman-text-main"> • {selectedSite}</span>}
            </div>
            <select
              value={selectedRegion}
              onChange={event => {
                setSelectedRegion(event.target.value);
                setSelectedSite('all');
              }}
              className="border border-roman-border rounded-sm px-3 py-2 bg-roman-surface text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
            >
              <option value="all">Todas as regiões</option>
              {availableRegions.map(region => (
                <option key={region} value={region}>{region}</option>
              ))}
            </select>
            <select
              value={selectedSite}
              onChange={event => setSelectedSite(event.target.value)}
              className="border border-roman-border rounded-sm px-3 py-2 bg-roman-surface text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary"
            >
              <option value="all">Todas as sedes</option>
              {availableSites.map(site => (
                <option key={site} value={site}>{site}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="mb-5 rounded-2xl border border-roman-border bg-roman-surface px-4 py-3 text-sm text-roman-text-sub shadow-sm">
            {isSupervisor ? (
              <>
                <span className="font-medium text-roman-text-main">Escopo visível:</span>{' '}
                {supervisorScopeSummary?.sites.length
                  ? supervisorScopeSummary.sites.map(site => site.code || site.name).join(', ')
                  : supervisorScopeSummary?.regions.length
                    ? supervisorScopeSummary.regions.map(region => region.name).join(', ')
                    : 'nenhuma sede ou região vinculada'}
              </>
            ) : (
              <>
                <span className="font-medium text-roman-text-main">Recorte atual:</span> suas solicitações visíveis no sistema
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          <StatCard title="Novas OS" value={String(stats.novas)} subtitle="Fila inicial" highlight onClick={() => openInboxWithStatus([TICKET_STATUS.NEW])} />
          <StatCard title="Aguardando Orçamento" value={String(stats.aguardandoOrcamento)} subtitle="Em preparação" onClick={() => openInboxWithStatus([TICKET_STATUS.WAITING_BUDGET])} />
          <StatCard title="Aguardando Aprovação" value={String(stats.aguardandoAprovacao)} subtitle="Decisão pendente" onClick={isExecutive ? () => navigateTo('approvals') : undefined} />
          <StatCard title="OS Concluídas" value={String(stats.encerradas)} subtitle="Encerradas" onClick={() => openInboxWithStatus([TICKET_STATUS.CLOSED])} />
        </div>

        {!isExecutive && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
            {isSupervisor && (
              <div className="bg-roman-surface border border-roman-border rounded-2xl p-4 md:p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4 border-b border-roman-border pb-2">
                  <h2 className="font-serif text-lg font-medium text-roman-text-main">Resumo da Supervisão</h2>
                  <Building2 size={16} className="text-roman-text-sub" />
                </div>
                {supervisorScopeSummary && (
                  <div className="mb-4 rounded-sm border border-roman-border bg-roman-bg px-4 py-3 text-sm text-roman-text-sub">
                    <div className="text-[10px] uppercase tracking-widest text-roman-text-sub mb-2">Escopo da supervisão</div>
                    <div>
                      <span className="font-medium text-roman-text-main">Sedes:</span>{' '}
                      {supervisorScopeSummary.sites.length > 0
                        ? supervisorScopeSummary.sites.map(site => site.code || site.name).join(', ')
                        : 'nenhuma sede vinculada'}
                    </div>
                    <div className="mt-1">
                      <span className="font-medium text-roman-text-main">Regiões:</span>{' '}
                      {supervisorScopeSummary.regions.length > 0
                        ? supervisorScopeSummary.regions.map(region => region.name).join(', ')
                        : 'nenhuma região vinculada'}
                    </div>
                  </div>
                )}
                {supervisorBoard.length === 0 ? (
                  <p className="text-sm text-roman-text-sub font-serif italic">Nenhuma OS visível para a sua supervisão.</p>
                ) : (
                  <div className="space-y-3">
                    {supervisorBoard.map(item => (
                      <div key={item.site} className="grid grid-cols-1 md:grid-cols-[1.2fr_repeat(4,0.75fr)] gap-3 items-center border border-roman-border rounded-sm bg-roman-bg px-4 py-3">
                        <div className="font-medium text-roman-text-main">{item.site}</div>
                        <div className="text-sm"><div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Abertas</div><div>{item.open}</div></div>
                        <div className="text-sm"><div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Validação</div><div>{item.waitingValidation}</div></div>
                        <div className="text-sm"><div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Pagamento</div><div>{item.waitingPayment}</div></div>
                        <div className="text-sm"><div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Concluídas</div><div>{item.closed}</div></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {isRequester && (
              <div className="bg-roman-surface border border-roman-border rounded-sm p-5">
                <div className="flex items-center justify-between mb-4 border-b border-roman-border pb-2">
                  <h2 className="font-serif text-lg font-medium text-roman-text-main">Minhas Solicitações</h2>
                  <Users size={16} className="text-roman-text-sub" />
                </div>
                {requesterTickets.length === 0 ? (
                  <p className="text-sm text-roman-text-sub font-serif italic">Nenhuma solicitação vinculada ao seu usuário apareceu neste recorte.</p>
                ) : (
                  <div className="space-y-3">
                    {requesterTickets.slice(0, 6).map(ticket => (
                      <button
                        key={ticket.id}
                        onClick={() => openTicketWorkspace(ticket.id)}
                        className="w-full text-left border border-roman-border rounded-sm bg-roman-bg px-4 py-3 hover:border-roman-primary transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-medium text-roman-text-main">{ticket.id}</div>
                          <div className="text-xs text-roman-text-sub">{ticket.status}</div>
                        </div>
                        <div className="text-sm text-roman-text-main mt-1">{ticket.subject}</div>
                        <div className="text-xs text-roman-text-sub mt-2">{getTicketSiteLabel(ticket, sites)} • {formatActivityTime(ticket.time)}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="bg-roman-surface border border-roman-border rounded-2xl p-4 md:p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4 border-b border-roman-border pb-2">
                <h2 className="font-serif text-lg font-medium text-roman-text-main">
                  {isSupervisor ? 'Validações e próximos passos' : 'Acompanhamento operacional'}
                </h2>
                <AlertTriangle size={16} className="text-roman-text-sub" />
              </div>
              <div className="space-y-3">
                {pendingRequesterValidations.length === 0 && upcomingPreliminaries.length === 0 ? (
                  <p className="text-sm text-roman-text-sub font-serif italic">Nenhum destaque operacional neste momento.</p>
                ) : (
                  <>
                    {pendingRequesterValidations.map(ticket => (
                      <button
                        key={`validation-${ticket.id}`}
                        onClick={() => openTicketWorkspace(ticket.id)}
                        className="w-full text-left border border-roman-border rounded-sm bg-roman-bg px-4 py-3 hover:border-roman-primary transition-colors"
                      >
                        <div className="font-medium text-roman-text-main">{ticket.id} • aguardando validação do solicitante</div>
                        <div className="text-sm text-roman-text-main mt-1">{ticket.subject}</div>
                        <div className="text-xs text-roman-text-sub mt-2">{getTicketSiteLabel(ticket, sites)} • {ticket.requester}</div>
                      </button>
                    ))}
                    {upcomingPreliminaries.slice(0, 3).map(ticket => (
                      <button
                        key={`prelim-${ticket.id}`}
                        onClick={() => openTicketWorkspace(ticket.id)}
                        className="w-full text-left border border-roman-border rounded-sm bg-roman-bg px-4 py-3 hover:border-roman-primary transition-colors"
                      >
                        <div className="font-medium text-roman-text-main">{ticket.id} • ação preliminar</div>
                        <div className="text-sm text-roman-text-main mt-1">{ticket.subject}</div>
                        <div className="text-xs text-roman-text-sub mt-2">
                          {ticket.preliminaryActions?.plannedStartAt
                            ? `Início previsto ${formatActivityTime(ticket.preliminaryActions.plannedStartAt)}`
                            : ticket.preliminaryActions?.materialEta
                              ? `Material previsto ${formatActivityTime(ticket.preliminaryActions.materialEta)}`
                              : getTicketSiteLabel(ticket, sites)}
                        </div>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {isSupervisor && (
          <div className="bg-roman-surface border border-roman-border rounded-2xl p-4 md:p-5 mb-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 border-b border-roman-border pb-2">
              <h2 className="font-serif text-lg font-medium text-roman-text-main">OS da Supervisão</h2>
              <Users size={16} className="text-roman-text-sub" />
            </div>
            {supervisorTickets.length === 0 ? (
              <p className="text-sm text-roman-text-sub font-serif italic">Nenhuma OS encontrada para a sede ou região sob sua supervisão.</p>
            ) : (
              <div className="space-y-3">
                {supervisorTickets.map(ticket => (
                  <button
                    key={ticket.id}
                    onClick={() => openTicketWorkspace(ticket.id)}
                    className="w-full text-left border border-roman-border rounded-sm bg-roman-bg px-4 py-3 hover:border-roman-primary transition-colors"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="font-medium text-roman-text-main">{ticket.id} • {ticket.subject}</div>
                        <div className="text-xs text-roman-text-sub mt-1">
                          {getTicketSiteLabel(ticket, sites)} • {getTicketRegionLabel(ticket, regions, sites)} • {ticket.requester}
                        </div>
                      </div>
                      <div className="text-right text-xs text-roman-text-sub">
                        <div className="font-medium text-roman-text-main">{ticket.status}</div>
                        <div>{formatActivityTime(ticket.time)}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {isExecutive && (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
            <div className="border border-roman-border rounded-2xl bg-roman-surface px-4 py-4 shadow-sm">
              <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2">Contrato no recorte</div>
              <div className="text-2xl font-serif text-roman-text-main">{formatCurrency(executiveFinancialSummary.contracted)}</div>
            </div>
            <div className="border border-roman-border rounded-2xl bg-roman-surface px-4 py-4 shadow-sm">
              <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2">Previsto para pagar</div>
              <div className="text-2xl font-serif text-roman-text-main">{formatCurrency(executiveFinancialSummary.planned)}</div>
            </div>
            <div className="border border-roman-border rounded-2xl bg-roman-surface px-4 py-4 shadow-sm">
              <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2">Pago</div>
              <div className="text-2xl font-serif text-green-800">{formatCurrency(executiveFinancialSummary.paid)}</div>
            </div>
            <div className="border border-roman-border rounded-2xl bg-roman-surface px-4 py-4 shadow-sm">
              <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub mb-2">Risco no recorte</div>
              <div className="text-2xl font-serif text-red-700">{stats.slaVencido + stats.aguardandoPagamento}</div>
              <div className="text-xs text-roman-text-sub mt-1">{stats.slaVencido} SLA vencido • {stats.aguardandoPagamento} aguardando pagamento</div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
          <div className="xl:col-span-2 bg-roman-surface border border-roman-border rounded-2xl p-4 md:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 border-b border-roman-border pb-2">
              <h2 className="font-serif text-lg font-medium text-roman-text-main">
                {selectedRegion === 'all' ? 'Dashboard por Região' : 'Dashboard por Sede'}
              </h2>
              <MapPinned size={16} className="text-roman-text-sub" />
            </div>
            {regionalExecutiveBoard.length === 0 ? (
              <p className="text-sm text-roman-text-sub font-serif italic">Nenhuma OS disponível para consolidar.</p>
            ) : (
              <div className="space-y-3">
                {regionalExecutiveBoard.map(item => (
                  <div key={`${item.region}-${item.label}`} className="grid grid-cols-1 md:grid-cols-[1.6fr_repeat(6,0.75fr)] gap-3 items-center border border-roman-border rounded-sm bg-roman-bg px-4 py-3">
                    <div>
                      <div className="font-medium text-roman-text-main">{item.label}</div>
                      <div className="text-xs text-roman-text-sub">{selectedRegion === 'all' ? 'Visão regional' : item.region}</div>
                    </div>
                    <div className="text-sm">
                      <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Abertas</div>
                      <div className="font-medium text-roman-text-main">{item.open}</div>
                    </div>
                    <div className="text-sm">
                      <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Aprovação</div>
                      <div className="font-medium text-roman-text-main">{item.approvals}</div>
                    </div>
                    <div className="text-sm">
                      <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Pagamento</div>
                      <div className="font-medium text-roman-text-main">{item.waitingPayment}</div>
                    </div>
                    <div className="text-sm">
                      <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">SLA</div>
                      <div className={`font-medium ${item.overdue > 0 ? 'text-red-700' : 'text-roman-text-main'}`}>{item.overdue}</div>
                    </div>
                    <div className="text-sm">
                      <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Contrato</div>
                      <div className="font-medium text-roman-text-main">{formatCurrency(item.contractedValue)}</div>
                    </div>
                    <div className="text-sm">
                      <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Pago</div>
                      <div className="font-medium text-green-800">{formatCurrency(item.paidValue)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-roman-surface border border-roman-border rounded-2xl p-4 md:p-5 shadow-sm">
            <h2 className="font-serif text-lg font-medium text-roman-text-main mb-4 border-b border-roman-border pb-2">Ações Rápidas</h2>
            <div className="space-y-3">
              <button onClick={() => navigateTo('public-form')} className="w-full text-left px-4 py-3 border border-roman-border rounded-sm hover:border-roman-primary hover:bg-roman-primary/5 transition-colors flex items-center gap-3">
                <Plus size={18} className="text-roman-primary" />
                <span className="font-medium">Registrar Nova OS</span>
              </button>
              {currentUser?.role === 'Admin' && (
                <button onClick={() => navigateTo('settings')} className="w-full text-left px-4 py-3 border border-roman-border rounded-sm hover:border-roman-primary hover:bg-roman-primary/5 transition-colors flex items-center gap-3">
                  <Users size={18} className="text-roman-primary" />
                  <span className="font-medium">Gerenciar Equipes</span>
                </button>
              )}
              {isExecutive && (
                <>
                  <button onClick={() => navigateTo('kpi')} className="w-full text-left px-4 py-3 border border-roman-border rounded-sm hover:border-roman-primary hover:bg-roman-primary/5 transition-colors flex items-center gap-3">
                    <BarChart2 size={18} className="text-roman-primary" />
                    <span className="font-medium">Ver Indicadores</span>
                  </button>
                  <button onClick={() => navigateTo('finance')} className="w-full text-left px-4 py-3 border border-roman-border rounded-sm hover:border-roman-primary hover:bg-roman-primary/5 transition-colors flex items-center gap-3">
                    <CircleDollarSign size={18} className="text-roman-primary" />
                    <span className="font-medium">Ir para Financeiro</span>
                  </button>
                </>
              )}
            </div>

            <div className="mt-6 space-y-3">
              <div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Alertas de garantia</div>
              {guaranteeAlerts.length === 0 ? (
                <p className="text-sm text-roman-text-sub font-serif italic">Nenhuma garantia próxima do vencimento.</p>
              ) : (
                guaranteeAlerts.map(item => (
                  <div key={item.id} className="border border-amber-200 bg-amber-50 rounded-sm px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 text-amber-800 font-medium"><ShieldAlert size={14} /> {item.id}</div>
                    <div className="text-amber-900">{item.subject}</div>
                    <div className="text-xs text-amber-800">{item.region} • {item.site} • {item.daysLeft} dia(s) para vencer</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-5">
          <div className="lg:col-span-2 bg-roman-surface border border-roman-border rounded-2xl p-4 md:p-5 shadow-sm">
            <h2 className="font-serif text-lg font-medium text-roman-text-main mb-4 border-b border-roman-border pb-2">Atividade Recente</h2>
            <div className="space-y-4">
              {recentActivity.length === 0 ? (
                <p className="text-sm text-roman-text-sub font-serif italic">Nenhuma atividade registrada.</p>
              ) : (
                recentActivity.map(item => (
                  <ActivityItem
                    key={item.id}
                    time={formatActivityTime(item.time)}
                    title={ACTIVITY_TITLES[item.type] ?? 'Atualização'}
                    desc={`${item.subject}: ${item.text ? item.text.slice(0, 80) + (item.text.length > 80 ? '...' : '') : '-'} (${item.ticketId})`}
                  />
                ))
              )}
            </div>
          </div>

          <div className="bg-roman-surface border border-roman-border rounded-2xl p-4 md:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 border-b border-roman-border pb-2">
              <h2 className="font-serif text-lg font-medium text-roman-text-main">Fila Executiva</h2>
              <AlertTriangle size={16} className="text-roman-text-sub" />
            </div>
            {executiveQueue.length === 0 ? (
              <p className="text-sm text-roman-text-sub font-serif italic">Nenhum item crítico aguardando decisão.</p>
            ) : (
              <div className="space-y-3">
                {executiveQueue.map(ticket => (
                  <button
                    key={ticket.id}
                      onClick={() => {
                        openTicketWorkspace(ticket.id, ticket.status === TICKET_STATUS.WAITING_PAYMENT ? 'finance' : 'approvals');
                      }}
                    className="w-full text-left border border-roman-border rounded-sm bg-roman-bg px-4 py-3 hover:border-roman-primary transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-roman-text-main">{ticket.id}</div>
                      <div className="text-[10px] uppercase tracking-widest text-roman-text-sub">{getTicketSiteLabel(ticket, sites)}</div>
                    </div>
                    <div className="text-sm text-roman-text-main mt-1">{ticket.subject}</div>
                    <div className="text-xs text-roman-text-sub mt-2">{ticket.status}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="bg-roman-surface border border-roman-border rounded-2xl p-4 md:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 border-b border-roman-border pb-2">
              <h2 className="font-serif text-lg font-medium text-roman-text-main">Chamados Críticos</h2>
              <AlertTriangle size={16} className="text-roman-text-sub" />
            </div>
            {criticalTickets.length === 0 ? (
              <p className="text-sm text-roman-text-sub font-serif italic">Nenhum chamado crítico neste recorte.</p>
            ) : (
              <div className="space-y-3">
                {criticalTickets.map(ticket => (
                  <button
                    key={ticket.id}
                    onClick={() =>
                      openTicketWorkspace(
                        ticket.id,
                        ticket.status === TICKET_STATUS.WAITING_PAYMENT
                          ? 'finance'
                          : ticket.status.toLowerCase().includes('aprova')
                            ? 'approvals'
                            : 'inbox'
                      )
                    }
                    className="w-full text-left border border-roman-border rounded-sm bg-roman-bg px-4 py-3 hover:border-roman-primary transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium text-roman-text-main">{ticket.id}</div>
                      <div className={`text-xs ${ticket.sla?.status === 'overdue' ? 'text-red-700' : 'text-roman-text-sub'}`}>{ticket.sla?.status === 'overdue' ? 'SLA vencido' : ticket.status}</div>
                    </div>
                    <div className="text-sm text-roman-text-main mt-1">{ticket.subject}</div>
                    <div className="text-xs text-roman-text-sub mt-2">{getTicketRegionLabel(ticket, regions, sites)} • {getTicketSiteLabel(ticket, sites)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="bg-roman-surface border border-roman-border rounded-2xl p-4 md:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 border-b border-roman-border pb-2">
              <h2 className="font-serif text-lg font-medium text-roman-text-main">Chamados do Recorte</h2>
              <Building2 size={16} className="text-roman-text-sub" />
            </div>
            {siteSpotlight.length === 0 ? (
              <p className="text-sm text-roman-text-sub font-serif italic">Nenhum chamado disponível para este recorte.</p>
            ) : (
              <div className="space-y-3">
                {siteSpotlight.map(ticket => (
                  <button
                    key={ticket.id}
                    onClick={() =>
                      openTicketWorkspace(
                        ticket.id,
                        ticket.status === TICKET_STATUS.WAITING_PAYMENT
                          ? 'finance'
                          : ticket.status.toLowerCase().includes('aprova')
                            ? 'approvals'
                            : 'inbox'
                      )
                    }
                    className="w-full text-left border border-roman-border rounded-sm bg-roman-bg px-4 py-3 hover:border-roman-primary transition-colors"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="font-medium text-roman-text-main">{ticket.id} • {ticket.subject}</div>
                        <div className="text-xs text-roman-text-sub">{ticket.requester} • {getTicketSiteLabel(ticket, sites)} • {getTicketRegionLabel(ticket, regions, sites)}</div>
                        <div className="text-xs text-roman-text-sub mt-1">Laudos anexados: {ticket.closureChecklist?.documents?.length || 0}</div>
                      </div>
                      <div className="text-xs text-roman-text-sub md:text-right">
                        <div>{ticket.status}</div>
                        <div>{formatActivityTime(ticket.time)}</div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
