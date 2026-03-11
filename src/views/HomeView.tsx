
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart2, Building2, MapPinned, Plus, ScrollText, Users } from 'lucide-react';
import { ActivityItem } from '../components/ui/ActivityItem';
import { StatCard } from '../components/ui/StatCard';
import { TICKET_STATUS } from '../constants/ticketStatus';
import { useApp } from '../context/AppContext';
import { fetchAuditLogs, type AuditLogEntry } from '../services/auditLogsApi';
import { fetchCatalog, type CatalogRegion, type CatalogSite } from '../services/catalogApi';
import { formatDateTimeSafe } from '../utils/date';
import { getTicketRegionId, getTicketRegionLabel, getTicketSiteId, getTicketSiteLabel } from '../utils/ticketTerritory';

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

function normalizeText(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

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

function getAuditActionLabel(log: AuditLogEntry) {
  const action = log.action || '';
  const entity = log.entity || '';

  if (action === 'tickets.create') return 'OS criada';
  if (action === 'tickets.update') return 'OS atualizada';
  if (action === 'tickets.delete') return 'OS excluída';
  if (action === 'tickets.status.change') return 'Status da OS alterado';
  if (action.startsWith('users.')) return 'Cadastro de usuário atualizado';
  if (action.startsWith('catalog.')) return 'Catálogo operacional alterado';
  if (action.startsWith('procurement.quotes')) return 'Orçamento atualizado';
  if (action.startsWith('procurement.contract')) return 'Contrato atualizado';
  if (action.startsWith('procurement.payment')) return 'Pagamento atualizado';
  if (action.startsWith('procurement.measurement')) return 'Medição registrada';
  if (action.startsWith('settings.')) return 'Configuração atualizada';
  if (action.startsWith('notifications.')) return 'Notificação alterada';
  if (entity === 'tickets') return 'OS atualizada';
  return action || 'Atualização registrada';
}

function getAuditSummary(log: AuditLogEntry) {
  const entityId = log.entityId ? ` · ${log.entityId}` : '';
  return `${getAuditActionLabel(log)}${entityId}`;
}

export function HomeView() {
  const { navigateTo, setActiveTicketId, setInboxFilter, tickets, currentUser, currentUserEmail } = useApp();
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedSite, setSelectedSite] = useState('all');
  const [regions, setRegions] = useState<CatalogRegion[]>([]);
  const [sites, setSites] = useState<CatalogSite[]>([]);
  const [auditActivity, setAuditActivity] = useState<AuditLogEntry[]>([]);
  const greetingName = buildGreetingName(currentUser?.name, currentUserEmail);
  const isExecutive = currentUser?.role === 'Admin' || currentUser?.role === 'Diretor';
  const isSupervisor = currentUser?.role === 'Supervisor';
  const isRequester = currentUser?.role === 'Usuario';

  const clearInboxFilters = () =>
    setInboxFilter({ status: [], priority: [], region: [], site: [], type: [] });

  const openInboxWithStatus = (statuses: string[]) => {
    setInboxFilter({ status: statuses, priority: [], region: [], site: [], type: [] });
    navigateTo('inbox');
  };

  const openTicketWorkspace = (ticketId: string, destination: 'inbox' | 'approvals' | 'finance' = 'inbox') => {
    setActiveTicketId(ticketId);
    if (destination === 'inbox') clearInboxFilters();
    navigateTo(destination);
  };

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const logs = await fetchAuditLogs(8, false);
        if (!cancelled) setAuditActivity(logs);
      } catch {
        if (!cancelled) setAuditActivity([]);
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
    if (selectedRegion !== 'all' && !availableRegions.includes(selectedRegion)) setSelectedRegion('all');
  }, [availableRegions, selectedRegion]);

  useEffect(() => {
    if (selectedSite !== 'all' && !availableSites.includes(selectedSite)) setSelectedSite('all');
  }, [availableSites, selectedSite]);

  const scopedTickets = useMemo(() => {
    return tickets.filter(ticket => {
      if (selectedRegion !== 'all' && getTicketRegionLabel(ticket, regions, sites) !== selectedRegion) return false;
      if (selectedSite !== 'all' && getTicketSiteLabel(ticket, sites) !== selectedSite) return false;
      return true;
    });
  }, [regions, selectedRegion, selectedSite, sites, tickets]);

  const stats = useMemo(() => ({
    novas: scopedTickets.filter(ticket => ticket.status === TICKET_STATUS.NEW).length,
    aguardandoOrcamento: scopedTickets.filter(ticket => ticket.status === TICKET_STATUS.WAITING_BUDGET).length,
    aguardandoAprovacao: scopedTickets.filter(ticket => ticket.status.toLowerCase().includes('aprova')).length,
    encerradas: scopedTickets.filter(ticket => ticket.status === TICKET_STATUS.CLOSED).length,
    slaVencido: scopedTickets.filter(ticket => ticket.sla?.status === 'overdue').length,
  }), [scopedTickets]);

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
    const grouped = new Map<string, { site: string; open: number; waitingValidation: number; inProgress: number; closed: number }>();
    for (const ticket of scopedTickets) {
      const siteLabel = getTicketSiteLabel(ticket, sites);
      const key = getTicketSiteId(ticket, sites) || siteLabel;
      if (!grouped.has(key)) {
        grouped.set(key, { site: siteLabel, open: 0, waitingValidation: 0, inProgress: 0, closed: 0 });
      }
      const current = grouped.get(key)!;
      if (isOpenStatus(ticket.status)) current.open += 1;
      if (ticket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL) current.waitingValidation += 1;
      if (ticket.status === TICKET_STATUS.IN_PROGRESS) current.inProgress += 1;
      if (ticket.status === TICKET_STATUS.CLOSED) current.closed += 1;
    }
    return [...grouped.values()].sort((a, b) => b.open - a.open);
  }, [isSupervisor, scopedTickets, sites]);

  const supervisorScopeSummary = useMemo(() => {
    if (!isSupervisor) return null;
    return {
      sites: sites.filter(site => (currentUser?.siteIds || []).includes(site.id)),
      regions: regions.filter(region => (currentUser?.regionIds || []).includes(region.id)),
    };
  }, [currentUser?.regionIds, currentUser?.siteIds, isSupervisor, regions, sites]);

  const supervisorTickets = useMemo(() => {
    if (!isSupervisor) return [];
    return scopedTickets.slice().sort((a, b) => b.time.getTime() - a.time.getTime());
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

  const regionalExecutiveBoard = useMemo(() => {
    const grouped = new Map<string, { label: string; region: string; open: number; approvals: number; waitingValidation: number; overdue: number; closed: number }>();
    for (const ticket of scopedTickets) {
      const regionLabel = getTicketRegionLabel(ticket, regions, sites);
      const siteLabel = getTicketSiteLabel(ticket, sites);
      const label = selectedRegion === 'all' ? regionLabel : siteLabel;
      const key = selectedRegion === 'all'
        ? getTicketRegionId(ticket, regions, sites) || regionLabel
        : `${getTicketRegionId(ticket, regions, sites) || regionLabel}|${getTicketSiteId(ticket, sites) || siteLabel}`;
      if (!grouped.has(key)) {
        grouped.set(key, { label, region: regionLabel, open: 0, approvals: 0, waitingValidation: 0, overdue: 0, closed: 0 });
      }
      const current = grouped.get(key)!;
      if (isOpenStatus(ticket.status)) current.open += 1;
      if (ticket.status.toLowerCase().includes('aprova')) current.approvals += 1;
      if (ticket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL) current.waitingValidation += 1;
      if (ticket.sla?.status === 'overdue') current.overdue += 1;
      if (ticket.status === TICKET_STATUS.CLOSED) current.closed += 1;
    }
    return [...grouped.values()]
      .sort((a, b) => b.open + b.approvals + b.waitingValidation - (a.open + a.approvals + a.waitingValidation))
      .slice(0, 8);
  }, [regions, scopedTickets, selectedRegion, sites]);

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-4 md:p-5 xl:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="mb-5 rounded-2xl border border-roman-border bg-roman-surface px-5 py-5 shadow-sm">
          <div className="text-[10px] font-serif uppercase tracking-[0.24em] text-roman-text-sub">Painel operacional</div>
          <h1 className="mt-2 text-[2rem] font-serif font-medium text-roman-text-main">Olá, {greetingName}</h1>
          <p className="mt-2 text-sm text-roman-text-sub font-serif italic">
            {isExecutive
              ? 'Visão operacional consolidada por região e sede, com foco em fluxo, decisão e acompanhamento das OS.'
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
            <select value={selectedRegion} onChange={event => { setSelectedRegion(event.target.value); setSelectedSite('all'); }} className="border border-roman-border rounded-sm px-3 py-2 bg-roman-surface text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary">
              <option value="all">Todas as regiões</option>
              {availableRegions.map(region => <option key={region} value={region}>{region}</option>)}
            </select>
            <select value={selectedSite} onChange={event => setSelectedSite(event.target.value)} className="border border-roman-border rounded-sm px-3 py-2 bg-roman-surface text-[13px] font-medium text-roman-text-main outline-none focus:border-roman-primary">
              <option value="all">Todas as sedes</option>
              {availableSites.map(site => <option key={site} value={site}>{site}</option>)}
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
              <><span className="font-medium text-roman-text-main">Recorte atual:</span> suas solicitações visíveis no sistema</>
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
                    <div><span className="font-medium text-roman-text-main">Sedes:</span>{' '}{supervisorScopeSummary.sites.length > 0 ? supervisorScopeSummary.sites.map(site => site.code || site.name).join(', ') : 'nenhuma sede vinculada'}</div>
                    <div className="mt-1"><span className="font-medium text-roman-text-main">Regiões:</span>{' '}{supervisorScopeSummary.regions.length > 0 ? supervisorScopeSummary.regions.map(region => region.name).join(', ') : 'nenhuma região vinculada'}</div>
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
                        <div className="text-sm"><div className="text-[10px] uppercase tracking-widest text-roman-text-sub">Execução</div><div>{item.inProgress}</div></div>
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
                      <button key={ticket.id} onClick={() => openTicketWorkspace(ticket.id)} className="w-full text-left border border-roman-border rounded-sm bg-roman-bg px-4 py-3 hover:border-roman-primary transition-colors">
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
                <h2 className="font-serif text-lg font-medium text-roman-text-main">{isSupervisor ? 'Validações e próximos passos' : 'Acompanhamento operacional'}</h2>
                <AlertTriangle size={16} className="text-roman-text-sub" />
              </div>
              <div className="space-y-3">
                {pendingRequesterValidations.length === 0 && upcomingPreliminaries.length === 0 ? (
                  <p className="text-sm text-roman-text-sub font-serif italic">Nenhum destaque operacional neste momento.</p>
                ) : (
                  <>
                    {pendingRequesterValidations.map(ticket => (
                      <button key={`validation-${ticket.id}`} onClick={() => openTicketWorkspace(ticket.id)} className="w-full text-left border border-roman-border rounded-sm bg-roman-bg px-4 py-3 hover:border-roman-primary transition-colors">
                        <div className="font-medium text-roman-text-main">{ticket.id} • aguardando validação do solicitante</div>
                        <div className="text-sm text-roman-text-main mt-1">{ticket.subject}</div>
                        <div className="text-xs text-roman-text-sub mt-2">{getTicketSiteLabel(ticket, sites)} • {ticket.requester}</div>
                      </button>
                    ))}
                    {upcomingPreliminaries.slice(0, 3).map(ticket => (
                      <button key={`prelim-${ticket.id}`} onClick={() => openTicketWorkspace(ticket.id)} className="w-full text-left border border-roman-border rounded-sm bg-roman-bg px-4 py-3 hover:border-roman-primary transition-colors">
                        <div className="font-medium text-roman-text-main">{ticket.id} • ação preliminar</div>
                        <div className="text-sm text-roman-text-main mt-1">{ticket.subject}</div>
                        <div className="text-xs text-roman-text-sub mt-2">{ticket.preliminaryActions?.plannedStartAt ? `Início previsto ${formatActivityTime(ticket.preliminaryActions.plannedStartAt)}` : ticket.preliminaryActions?.materialEta ? `Material previsto ${formatActivityTime(ticket.preliminaryActions.materialEta)}` : getTicketSiteLabel(ticket, sites)}</div>
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
                  <button key={ticket.id} onClick={() => openTicketWorkspace(ticket.id)} className="w-full text-left border border-roman-border rounded-sm bg-roman-bg px-4 py-3 hover:border-roman-primary transition-colors">
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="font-medium text-roman-text-main">{ticket.id} • {ticket.subject}</div>
                        <div className="text-xs text-roman-text-sub mt-1">{getTicketSiteLabel(ticket, sites)} • {getTicketRegionLabel(ticket, regions, sites)} • {ticket.requester}</div>
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
            <StatCard title="SLA vencido" value={String(stats.slaVencido)} subtitle="OS fora do prazo" />
            <StatCard title="Aguardando validação" value={String(scopedTickets.filter(ticket => ticket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL).length)} subtitle="Solicitante precisa validar" />
            <StatCard title="Em andamento" value={String(scopedTickets.filter(ticket => ticket.status === TICKET_STATUS.IN_PROGRESS).length)} subtitle="Obras em execução" />
            <StatCard title="Concluídas" value={String(stats.encerradas)} subtitle="Entregas finalizadas" />
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
          <div className="xl:col-span-2 bg-roman-surface border border-roman-border rounded-2xl p-4 md:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 border-b border-roman-border pb-2">
              <h2 className="font-serif text-lg font-medium text-roman-text-main">{selectedRegion === 'all' ? 'Painel por Região' : 'Painel por Sede'}</h2>
              <MapPinned size={16} className="text-roman-text-sub" />
            </div>
            {regionalExecutiveBoard.length === 0 ? (
              <p className="text-sm text-roman-text-sub font-serif italic">Nenhuma OS disponível para consolidar.</p>
            ) : (
              <div className="space-y-3">
                {regionalExecutiveBoard.map(item => (
                  <div key={`${item.region}-${item.label}`} className="grid grid-cols-1 md:grid-cols-[1.6fr_repeat(5,0.75fr)] gap-3 items-center border border-roman-border rounded-sm bg-roman-bg px-4 py-3">
                    <div>
                      <div className="font-medium text-roman-text-main">{item.label}</div>
                      <div className="text-xs text-roman-text-sub">{selectedRegion === 'all' ? 'Visão regional' : item.region}</div>
                    </div>
                    <div className="text-sm"><div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Abertas</div><div className="font-medium text-roman-text-main">{item.open}</div></div>
                    <div className="text-sm"><div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Aprovação</div><div className="font-medium text-roman-text-main">{item.approvals}</div></div>
                    <div className="text-sm"><div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Validação</div><div className="font-medium text-roman-text-main">{item.waitingValidation}</div></div>
                    <div className="text-sm"><div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">SLA</div><div className={`font-medium ${item.overdue > 0 ? 'text-red-700' : 'text-roman-text-main'}`}>{item.overdue}</div></div>
                    <div className="text-sm"><div className="text-[10px] font-serif uppercase tracking-widest text-roman-text-sub">Concluídas</div><div className="font-medium text-roman-text-main">{item.closed}</div></div>
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
                  <span className="font-medium">Gerenciar Acessos</span>
                </button>
              )}
              {isExecutive && (
                <button onClick={() => navigateTo('kpi')} className="w-full text-left px-4 py-3 border border-roman-border rounded-sm hover:border-roman-primary hover:bg-roman-primary/5 transition-colors flex items-center gap-3">
                  <BarChart2 size={18} className="text-roman-primary" />
                  <span className="font-medium">Ver Indicadores</span>
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5">
          <div className="bg-roman-surface border border-roman-border rounded-2xl p-4 md:p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4 border-b border-roman-border pb-2">
              <h2 className="font-serif text-lg font-medium text-roman-text-main">Atividade Recente</h2>
              <ScrollText size={16} className="text-roman-text-sub" />
            </div>
            <div className="space-y-4">
              {auditActivity.length === 0 ? (
                <p className="text-sm text-roman-text-sub font-serif italic">Nenhuma auditoria recente registrada.</p>
              ) : (
                auditActivity.map(item => (
                  <ActivityItem key={item.id} time={formatDateTimeSafe(item.createdAt)} title={item.actor || 'Sistema'} desc={getAuditSummary(item)} />
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
