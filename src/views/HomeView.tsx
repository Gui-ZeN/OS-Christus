
import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart2, Plus, Users } from 'lucide-react';
import { StatCard } from '../components/ui/StatCard';
import { isTicketOpen } from '../constants/ticketLifecycle';
import { TICKET_STATUS } from '../constants/ticketStatus';
import { useApp } from '../context/AppContext';
import { fetchCatalog, type CatalogRegion, type CatalogSite } from '../services/catalogApi';
import { formatDateTimeSafe } from '../utils/date';
import { getTicketRegionLabel, getTicketSiteLabel } from '../utils/ticketTerritory';
import { bloqueioParaAvancar } from '../utils/statusChangeGuard';
import type { OsBoardFilter } from '../types';

function buildGreetingName(name: string | null | undefined, email: string) {
  if (name) return name;
  return (
    email
      .split('@')[0]
      ?.replace(/[-_.]+/g, ' ')
      ?.replace(/\b\w/g, char => char.toUpperCase()) || 'Usuário'
  );
}

export function HomeView() {
  const { navigateTo, setInboxFilter, setOsBoardFilter, tickets, currentUser, currentUserEmail } = useApp();
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedSite, setSelectedSite] = useState('all');
  const [requesterTab, setRequesterTab] = useState<'open' | 'history'>('open');
  const [regions, setRegions] = useState<CatalogRegion[]>([]);
  const [sites, setSites] = useState<CatalogSite[]>([]);
  const greetingName = buildGreetingName(currentUser?.name, currentUserEmail);
  const isExecutive = currentUser?.role === 'Admin' || currentUser?.role === 'Diretor';
  const canApprove = currentUser?.role === 'Admin' || currentUser?.role === 'Diretor';
  const canOperate = currentUser?.role === 'Admin' || currentUser?.role === 'Gestor';
  const hasOperationalActions = canApprove || canOperate;
  const isRequester = currentUser?.role === 'Usuario';

  const openInboxWithStatus = (statuses: string[]) => {
    setInboxFilter({ status: statuses, priority: [], region: [], site: [], type: [] });
    navigateTo('inbox');
  };

  /**
   * Abre a Gestão já filtrada. Limpa o resto do filtro de propósito: cartão que
   * herda seleção anterior mostra um número na tela inicial e outro na tabela, e
   * quem clicou conclui que o sistema perdeu OS.
   */
  const abrirGestao = (patch: Partial<OsBoardFilter>) => {
    setOsBoardFilter({
      search: '',
      sede: 'all',
      macroService: 'all',
      service: 'all',
      team: 'all',
      status: 'all',
      responsible: 'all',
      showClosed: false,
      bloqueadas: false,
      agua: false,
      ordem: 'parada',
      ...patch,
    });
    navigateTo('os-board');
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

  /**
   * Os números que o Início mostra passaram a ser os que doem.
   *
   * Eram "Novas OS / Aguardando Orçamento / Aguardando Aprovação / Concluídas" — e a
   * fila dominante não aparecia em nenhum: 97 das 117 OS vivas estão em Parecer
   * Técnico, com mediana de 23 dias. "Aguardando Aprovação" nem clicável era, e
   * aponta para etapas aposentadas.
   *
   * Todos contam na hora, sobre o escopo territorial de quem está olhando.
   */
  const stats = useMemo(() => ({
    novas: scopedTickets.filter(ticket => ticket.status === TICKET_STATUS.NEW).length,
    aguardandoParecer: scopedTickets.filter(ticket => ticket.status === TICKET_STATUS.WAITING_TECH_OPINION).length,
    travadas: scopedTickets.filter(ticket => isTicketOpen(ticket.status) && bloqueioParaAvancar(ticket)).length,
    semResponsavel: scopedTickets.filter(ticket => isTicketOpen(ticket.status) && !ticket.responsible?.email).length,
  }), [scopedTickets]);

  /** O trio de entrega, pela mesma regra: cartão zerado não aparece, e trio vazio some. */
  const entregas = useMemo(() => {
    const aguardandoAceite = scopedTickets.filter(t => t.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL).length;
    const emCampo = scopedTickets.filter(t => t.status === TICKET_STATUS.IN_PROGRESS).length;
    const finalizadas = scopedTickets.filter(t => t.status === TICKET_STATUS.CLOSED).length;
    return { aguardandoAceite, emCampo, finalizadas, total: aguardandoAceite + emCampo + finalizadas };
  }, [scopedTickets]);

  /** Quantos gargalos têm o que mostrar. Zero em todos = a fileira inteira some. */
  const gargalosVisiveis = [
    stats.aguardandoParecer,
    stats.travadas,
    stats.semResponsavel,
    stats.novas,
  ].filter(quantidade => quantidade > 0).length;

  const executiveNextActions = useMemo(() => {
    if (!hasOperationalActions) return [];
    return [
      canOperate ? {
        key: 'budget',
        // "Cobrar" é verbo de ordem — o oposto da decisão de produto ("o Serv3
        // registra, não cobra"). O cartão constata; quem cobra é gente.
        title: 'Aguardando orçamento',
        subtitle: 'esperando composição financeira.',
        count: scopedTickets.filter(ticket => ticket.status === TICKET_STATUS.WAITING_BUDGET).length,
        action: () => abrirGestao({ status: TICKET_STATUS.WAITING_BUDGET }),
      } : null,
      canOperate ? {
        key: 'payment',
        title: 'Liberar pagamentos',
        subtitle: 'Lançamento ou quitação pendente.',
        count: scopedTickets.filter(ticket => ticket.status === TICKET_STATUS.WAITING_PAYMENT).length,
        action: () => navigateTo('finance'),
      } : null,
      canOperate ? {
        key: 'execution',
        title: 'Em execução',
        subtitle: 'obra ativa ou aguardando fechamento.',
        count: scopedTickets.filter(ticket =>
          ticket.status === TICKET_STATUS.WAITING_PRELIM_ACTIONS ||
          ticket.status === TICKET_STATUS.IN_PROGRESS ||
          ticket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL
        ).length,
        action: () => abrirGestao({ status: TICKET_STATUS.IN_PROGRESS }),
      } : null,
    ]
      .filter((item): item is NonNullable<typeof item> => Boolean(item) && item.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [canApprove, canOperate, hasOperationalActions, navigateTo, openInboxWithStatus, scopedTickets]);

  const requesterOpenTickets = useMemo(
    () => (isRequester ? scopedTickets.filter(ticket => isTicketOpen(ticket.status)).sort((a, b) => b.time.getTime() - a.time.getTime()) : []),
    [isRequester, scopedTickets]
  );

  const requesterHistoryTickets = useMemo(
    () => (isRequester ? scopedTickets.filter(ticket => !isTicketOpen(ticket.status)).sort((a, b) => b.time.getTime() - a.time.getTime()) : []),
    [isRequester, scopedTickets]
  );

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-4 md:p-5 xl:p-6 2xl:p-8">
      <div className="max-w-7xl mx-auto">
        {/* O cabeçalho também perdeu a moldura: ele não se clica, e a borda agora
            significa só isso. O que separa do resto é o espaço e a escala do nome. */}
        <header className="mb-6 px-1">
          {/* Esta tela virou o PORTAL DO SOLICITANTE quando quem opera passou a entrar
              direto na agenda. Chamar de "painel operacional" para quem só acompanha
              as próprias solicitações é prometer uma tela que não é esta. */}
          <div className="text-[11px] font-serif uppercase tracking-[0.24em] text-roman-text-sub">
            {isRequester ? 'Minhas solicitações' : 'Painel operacional'}
          </div>
          <h1 className="mt-2 text-[1.65rem] font-serif font-medium text-roman-text-main md:text-[2rem]">Olá, {greetingName}</h1>
          <p className="mt-2 text-sm text-roman-text-sub font-serif italic">
            {isExecutive
              ? 'Visão operacional consolidada por região e sede, com foco em fluxo, decisão e acompanhamento das OS.'
              : isRequester
                  ? 'Painel do solicitante com acompanhamento resumido das suas solicitações e do retorno da infraestrutura.'
                  : 'Aqui está o resumo das suas responsabilidades operacionais de hoje.'}
          </p>
        </header>
        {isExecutive ? (
          <div className="mb-6 grid gap-3 lg:grid-cols-[1fr_220px_220px] lg:items-center">
            {/* Sem caixa: é uma frase de contexto, não um objeto. Medido em 13/08, o
                Início tinha 18 elementos com borda ou sombra e 9 deles dentro de
                outros — moldura em tudo faz tudo pesar igual e nada se destacar.
                Borda aqui passa a significar "isto se clica". */}
            <div className="text-sm text-roman-text-sub px-1 py-2.5">
              Recorte atual: <span className="font-medium text-roman-text-main">{selectedRegion === 'all' ? 'todas as regiões visíveis' : selectedRegion}</span>
              {selectedSite !== 'all' && <span className="font-medium text-roman-text-main"> • {selectedSite}</span>}
            </div>
            <select value={selectedRegion} onChange={event => { setSelectedRegion(event.target.value); setSelectedSite('all'); }} className="border border-roman-border rounded-xl px-3 py-2.5 bg-roman-surface text-sm font-medium text-roman-text-main outline-none focus:border-roman-primary">
              <option value="all">Todas as regiões</option>
              {availableRegions.map(region => <option key={region} value={region}>{region}</option>)}
            </select>
            <select value={selectedSite} onChange={event => setSelectedSite(event.target.value)} className="border border-roman-border rounded-xl px-3 py-2.5 bg-roman-surface text-sm font-medium text-roman-text-main outline-none focus:border-roman-primary">
              <option value="all">Todas as sedes</option>
              {availableSites.map(site => <option key={site} value={site}>{site}</option>)}
            </select>
          </div>
        ) : (
          <div className="mb-6 px-1 text-sm text-roman-text-sub">
            <span className="font-medium text-roman-text-main">Recorte atual:</span> suas solicitações visíveis no sistema
          </div>
        )}

        {/* CARTÃO ZERADO NÃO APARECE.
            Medido em 13/08: o Início mostrava 19 números, 15 sem abrir nada e 8
            zerados. Zero ocupa o mesmo espaço de um problema real e não é nem
            informação nem convite — e uma tela cheia de números que não respondem ao
            clique ensina a pessoa a não clicar.
            É a mesma regra que a faixa de próxima ação já aplica (`NextActionStrip`):
            aviso que aparece sempre vira moldura; sumindo, o silêncio passa a
            significar "nada pendente", e isso é informação. */}
        {/* Os gargalos são pergunta de quem OPERA a fila, e `abrirGestao` só existe
            para Admin/Gestor. Para o solicitante eles chegavam sem clique — números
            mortos na única tela dele, que é o defeito que passamos o dia tirando. */}
        {isRequester ? null : gargalosVisiveis === 0 ? (
          <p className="mb-5 border-l-2 border-roman-primary/40 pl-4 font-serif italic text-roman-text-sub">
            Nenhum gargalo agora: nada aguardando parecer, travado, sem responsável ou por triar.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
            {/* Todos abrem a GESTÃO filtrada, não a Inbox. A Inbox é a tela que o dono
                chamou de ameaçadora, e mandar alguém para lá para responder "quais
                estão paradas" é pedir que ela atravesse 3.000 linhas de conversa para
                ver uma lista. */}
            {stats.aguardandoParecer > 0 && (
              <StatCard
                title="Aguardando parecer"
                value={String(stats.aguardandoParecer)}
                subtitle="a fila que segura o resto"
                highlight
                onClick={canOperate ? () => abrirGestao({ status: TICKET_STATUS.WAITING_TECH_OPINION }) : undefined}
              />
            )}
            {stats.travadas > 0 && (
              <StatCard
                title="Travadas"
                value={String(stats.travadas)}
                subtitle="falta classificar para avançar"
                onClick={canOperate ? () => abrirGestao({ bloqueadas: true }) : undefined}
              />
            )}
            {stats.semResponsavel > 0 && (
              <StatCard
                title="Sem responsável"
                value={String(stats.semResponsavel)}
                subtitle="ninguém respondendo por elas"
                onClick={canOperate ? () => abrirGestao({ responsible: 'none' }) : undefined}
              />
            )}
            {stats.novas > 0 && (
              <StatCard
                title="Novas OS"
                value={String(stats.novas)}
                subtitle="ainda não triadas"
                onClick={canOperate ? () => abrirGestao({ status: TICKET_STATUS.NEW }) : undefined}
              />
            )}
          </div>
        )}

        {isRequester && (
          <div className="mb-6 rounded-xl border border-roman-border bg-roman-surface p-4 md:p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-roman-border pb-3">
              <div>
                <h2 className="font-serif text-lg font-medium text-roman-text-main">Painel de Tickets da Minha Estrutura</h2>
                <p className="mt-1 text-sm text-roman-text-sub">Lista de tickets por sede/região com status atual e histórico.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => navigateTo('public-form')}
                  className="inline-flex items-center gap-2 rounded-full border border-roman-border bg-roman-bg px-4 py-1.5 text-sm font-medium text-roman-text-main transition-colors hover:border-roman-primary"
                >
                  <Plus size={14} className="text-roman-primary" />
                  Nova Solicitação
                </button>
                <button
                  type="button"
                  onClick={() => setRequesterTab('open')}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${requesterTab === 'open' ? 'bg-roman-sidebar text-white' : 'border border-roman-border bg-roman-bg text-roman-text-main hover:border-roman-primary'}`}
                >
                  Abertos ({requesterOpenTickets.length})
                </button>
                <button
                  type="button"
                  onClick={() => setRequesterTab('history')}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${requesterTab === 'history' ? 'bg-roman-sidebar text-white' : 'border border-roman-border bg-roman-bg text-roman-text-main hover:border-roman-primary'}`}
                >
                  Histórico ({requesterHistoryTickets.length})
                </button>
              </div>
            </div>

            {requesterTab === 'open' ? (
              requesterOpenTickets.length === 0 ? (
                <p className="py-6 text-sm text-roman-text-sub font-serif italic">Nenhum ticket aberto para sua sede/região no momento.</p>
              ) : (
                <>
                  <div className="mt-4 space-y-3 md:hidden">
                    {requesterOpenTickets.map(ticket => (
                      <div key={`open-mobile-${ticket.id}`} className="rounded-xl border border-roman-border bg-roman-bg p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xs font-semibold text-roman-text-main">{ticket.id}</div>
                            <div className="mt-1 text-sm text-roman-text-main">{ticket.subject || '-'}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => window.open(`/?tracking=${encodeURIComponent(ticket.trackingToken)}`, '_blank', 'noopener,noreferrer')}
                            className="shrink-0 text-xs font-medium text-roman-primary hover:underline"
                          >
                            Timeline
                          </button>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                          <div><span className="text-roman-text-sub">Sede:</span> {getTicketSiteLabel(ticket, sites)}</div>
                          <div><span className="text-roman-text-sub">Região:</span> {getTicketRegionLabel(ticket, regions, sites)}</div>
                          <div><span className="text-roman-text-sub">Prioridade:</span> {ticket.priority || '-'}</div>
                          <div><span className="text-roman-text-sub">Status:</span> {ticket.status}</div>
                        </div>
                        <div className="mt-2 text-xs text-roman-text-sub">{formatDateTimeSafe(ticket.time)}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[880px] border-collapse text-left">
                      <thead>
                        <tr className="border-b border-roman-border bg-roman-bg/60 text-[11px] uppercase tracking-[0.2em] text-roman-text-sub">
                          <th className="px-3 py-2">Ticket</th>
                          <th className="px-3 py-2">Assunto</th>
                          <th className="px-3 py-2">Sede</th>
                          <th className="px-3 py-2">Região</th>
                          <th className="px-3 py-2">Solicitante</th>
                          <th className="px-3 py-2">Prioridade</th>
                          <th className="px-3 py-2">Status atual</th>
                          <th className="px-3 py-2">Atualizado</th>
                          <th className="px-3 py-2">Timeline</th>
                        </tr>
                      </thead>
                      <tbody>
                        {requesterOpenTickets.map(ticket => (
                          <tr key={`open-${ticket.id}`} className="border-b border-roman-border/70 hover:bg-roman-bg/50">
                            <td className="px-3 py-2 font-semibold text-roman-text-main">{ticket.id}</td>
                            <td className="px-3 py-2 text-roman-text-main">{ticket.subject || '-'}</td>
                            <td className="px-3 py-2 text-roman-text-sub">{getTicketSiteLabel(ticket, sites)}</td>
                            <td className="px-3 py-2 text-roman-text-sub">{getTicketRegionLabel(ticket, regions, sites)}</td>
                            <td className="px-3 py-2 text-roman-text-sub">{ticket.requester || '-'}</td>
                            <td className="px-3 py-2 text-roman-text-sub">{ticket.priority || '-'}</td>
                            <td className="px-3 py-2 text-roman-text-main">{ticket.status}</td>
                            <td className="px-3 py-2 text-roman-text-sub">{formatDateTimeSafe(ticket.time)}</td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() => window.open(`/?tracking=${encodeURIComponent(ticket.trackingToken)}`, '_blank', 'noopener,noreferrer')}
                                className="text-sm font-medium text-roman-primary hover:underline"
                              >
                                Ver timeline
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            ) : requesterHistoryTickets.length === 0 ? (
              <p className="py-6 text-sm text-roman-text-sub font-serif italic">Nenhum ticket encerrado/cancelado no histórico da sua estrutura.</p>
            ) : (
              <>
                <div className="mt-4 space-y-3 md:hidden">
                  {requesterHistoryTickets.map(ticket => (
                    <div key={`history-mobile-${ticket.id}`} className="rounded-xl border border-roman-border bg-roman-bg p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold text-roman-text-main">{ticket.id}</div>
                          <div className="mt-1 text-sm text-roman-text-main">{ticket.subject || '-'}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => window.open(`/?tracking=${encodeURIComponent(ticket.trackingToken)}`, '_blank', 'noopener,noreferrer')}
                          className="shrink-0 text-xs font-medium text-roman-primary hover:underline"
                        >
                          Timeline
                        </button>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                        <div><span className="text-roman-text-sub">Sede:</span> {getTicketSiteLabel(ticket, sites)}</div>
                        <div><span className="text-roman-text-sub">Região:</span> {getTicketRegionLabel(ticket, regions, sites)}</div>
                        <div><span className="text-roman-text-sub">Solicitante:</span> {ticket.requester || '-'}</div>
                        <div><span className="text-roman-text-sub">Status:</span> {ticket.status}</div>
                      </div>
                      <div className="mt-2 text-xs text-roman-text-sub">{formatDateTimeSafe(ticket.time)}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[880px] border-collapse text-left">
                    <thead>
                      <tr className="border-b border-roman-border bg-roman-bg/60 text-[11px] uppercase tracking-[0.2em] text-roman-text-sub">
                        <th className="px-3 py-2">Ticket</th>
                        <th className="px-3 py-2">Assunto</th>
                        <th className="px-3 py-2">Sede</th>
                        <th className="px-3 py-2">Região</th>
                        <th className="px-3 py-2">Solicitante</th>
                        <th className="px-3 py-2">Status final</th>
                        <th className="px-3 py-2">Último registro</th>
                        <th className="px-3 py-2">Timeline</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requesterHistoryTickets.map(ticket => (
                        <tr key={`history-${ticket.id}`} className="border-b border-roman-border/70 hover:bg-roman-bg/50">
                          <td className="px-3 py-2 font-semibold text-roman-text-main">{ticket.id}</td>
                          <td className="px-3 py-2 text-roman-text-main">{ticket.subject || '-'}</td>
                          <td className="px-3 py-2 text-roman-text-sub">{getTicketSiteLabel(ticket, sites)}</td>
                          <td className="px-3 py-2 text-roman-text-sub">{getTicketRegionLabel(ticket, regions, sites)}</td>
                          <td className="px-3 py-2 text-roman-text-sub">{ticket.requester || '-'}</td>
                          <td className="px-3 py-2 text-roman-text-main">{ticket.status}</td>
                          <td className="px-3 py-2 text-roman-text-sub">{formatDateTimeSafe(ticket.time)}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => window.open(`/?tracking=${encodeURIComponent(ticket.trackingToken)}`, '_blank', 'noopener,noreferrer')}
                              className="text-sm font-medium text-roman-primary hover:underline"
                            >
                              Ver timeline
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
        {/* Seção sem moldura: o título e o espaço agrupam, a borda fica para o que se
            clica. Antes eram três níveis de borda encaixados — painel, botão e pílula. */}
        {hasOperationalActions && (
          <div className="mb-6">
            <div className="flex items-center gap-2 border-b border-roman-border/70 pb-2">
              <AlertTriangle size={14} className="text-roman-primary" />
              <h2 className="font-serif text-[11px] uppercase tracking-[0.24em] text-roman-text-sub">Próximas decisões</h2>
            </div>
            {executiveNextActions.length === 0 ? (
              <p className="pt-4 text-sm text-roman-text-sub font-serif italic">Nenhuma pendência crítica no recorte atual.</p>
            ) : (
              <div className="mt-4 grid grid-cols-1 xl:grid-cols-4 gap-3">
                {executiveNextActions.map(item => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={item.action}
                    className="rounded-xl border border-roman-border bg-roman-bg px-4 py-4 text-left transition-colors hover:border-roman-primary hover:bg-roman-primary/5"
                  >
                    <div className="font-serif text-[11px] uppercase tracking-[0.24em] text-roman-text-sub">Próxima ação</div>
                    <div className="mt-2 text-lg font-medium text-roman-text-main">{item.title}</div>
                    <div className="mt-1 text-sm text-roman-text-sub">{item.subtitle}</div>
                    {/* Era uma pílula com borda DENTRO de um botão com borda. A
                        contagem é texto, não objeto: o número em serifa e cor de
                        destaque pesa mais que a moldura pesava. */}
                    <div className="mt-4 font-serif text-roman-primary">
                      <span className="text-xl leading-none">{item.count}</span>
                      <span className="ml-1 text-[11px] uppercase tracking-[0.18em] text-roman-text-sub">OS</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Estes três também abrem a Gestão filtrada — eram os últimos números do
            Início que não levavam a lugar nenhum.
            A guarda é `canOperate` (Admin/Gestor) e não `isExecutive`: o bloco aparece
            para o Diretor, que NÃO acessa a Gestão (`canAccessOsBoard` em App.tsx).
            Sem isso, o clique dele navegaria para uma tela que não renderiza — que é
            exatamente o defeito do botão "Abrir em Financeiro", removido em 12/08 por
            levar sempre ao vazio. Para o Diretor os cartões seguem só leitura. */}
        {isExecutive && entregas.total > 0 && (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3 mb-5">
            {entregas.aguardandoAceite > 0 && (
              <StatCard
                title="Entrega aguardando aceite"
                value={String(entregas.aguardandoAceite)}
                subtitle="Obras prontas para fechamento"
                onClick={canOperate ? () => abrirGestao({ status: TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL }) : undefined}
              />
            )}
            {entregas.emCampo > 0 && (
              <StatCard
                title="Obras em campo"
                value={String(entregas.emCampo)}
                subtitle="Execução ativa agora"
                onClick={canOperate ? () => abrirGestao({ status: TICKET_STATUS.IN_PROGRESS }) : undefined}
              />
            )}
            {entregas.finalizadas > 0 && (
              <StatCard
                title="Entregas finalizadas"
                value={String(entregas.finalizadas)}
                subtitle="OS já encerradas"
                // `showClosed` só esconde encerradas quando o status é "todos"
                // (OsBoardView:136) — filtrar por Encerrada já as revela. Ligado
                // mesmo assim para que limpar o status na tabela não faça a lista
                // sumir na cara de quem acabou de chegar por este cartão.
                onClick={canOperate ? () => abrirGestao({ status: TICKET_STATUS.CLOSED, showClosed: true }) : undefined}
              />
            )}
          </div>
        )}

        {/* O "Painel por Região" saiu daqui em 13/08.
            Ele era 12 dos 34 números mortos do sistema — 3 regiões × 4 contadores,
            nenhum clicável — e o maior bloco isolado de leitura sem saída. O recorte
            por região/sede continua existindo onde dá para AGIR sobre ele: os filtros
            no topo desta tela e a Gestão. Se voltar, que volte com cada número
            abrindo a lista correspondente. */}
        {isExecutive && (
        <div className="mb-5">
          <div className="xl:max-w-sm">
            <h2 className="font-serif text-[11px] uppercase tracking-[0.24em] text-roman-text-sub mb-3 border-b border-roman-border/70 pb-2">Ações Rápidas</h2>
            <div className="space-y-3">
              <button onClick={() => navigateTo('public-form')} className="w-full text-left px-4 py-3 border border-roman-border rounded-sm hover:border-roman-primary hover:bg-roman-primary/5 transition-colors flex items-center gap-3">
                <Plus size={16} className="text-roman-primary" />
                <span className="font-medium">Registrar Nova OS</span>
              </button>
              {currentUser?.role === 'Admin' && (
                <button onClick={() => navigateTo('settings')} className="w-full text-left px-4 py-3 border border-roman-border rounded-sm hover:border-roman-primary hover:bg-roman-primary/5 transition-colors flex items-center gap-3">
                  <Users size={16} className="text-roman-primary" />
                  <span className="font-medium">Gerenciar Acessos</span>
                </button>
              )}
              {isExecutive && (
                <button onClick={() => navigateTo('kpi')} className="w-full text-left px-4 py-3 border border-roman-border rounded-sm hover:border-roman-primary hover:bg-roman-primary/5 transition-colors flex items-center gap-3">
                  <BarChart2 size={16} className="text-roman-primary" />
                  <span className="font-medium">Ver Indicadores</span>
                </button>
              )}
            </div>
          </div>
        </div>
        )}

      </div>
    </div>
  );
}
