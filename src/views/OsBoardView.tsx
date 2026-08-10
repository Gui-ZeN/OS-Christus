import React, { useEffect, useMemo, useState } from 'react';
import { RecurrencePanel } from './RecurrencePanel';
import { ArrowRightLeft, MessageSquare, Search, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { fetchCatalog, type CatalogSite } from '../services/catalogApi';
import { getTicketSiteLabel } from '../utils/ticketTerritory';
import { TICKET_STATUS } from '../constants/ticketStatus';
import { isTicketOpen } from '../constants/ticketLifecycle';
import { StatusBadge } from '../components/ui/StatusBadge';
import { formatDateTimeSafe } from '../utils/date';
import { matchesSearch } from '../utils/search';
import { ConversaModal } from './osboard/ConversaModal';
import { EtapaModal } from './osboard/EtapaModal';
import { repairMojibake } from '../utils/text';

const ALL = 'all';
const STATUS_ORDER = Object.values(TICKET_STATUS) as string[];

/**
 * Quadro de gestão de OS: tabela resumo de TODAS as OS, com filtros por sede,
 * macroserviço, serviço, equipe e status (+ busca). Clicar numa linha abre a OS
 * na Caixa de Entrada. Para Admin/Gestor (ver canAccess no App).
 */
export function OsBoardView() {
  const { tickets, navigateTo, setActiveTicketId, osBoardFilter, setOsBoardFilter, currentUser } = useApp();
  // As duas ações que dispensam abrir a OS inteira. Guardam o ID, não a OS: os
  // modais resolvem a versão viva do contexto, senão o que eles mostram congela no
  // instante em que abriram — a resposta enviada não aparecia na própria conversa.
  const [conversaDe, setConversaDe] = useState<string | null>(null);
  const [etapaDe, setEtapaDe] = useState<string | null>(null);
  const podeTrocarEtapa = currentUser?.role === 'Admin' || currentUser?.role === 'Gestor';
  const [sites, setSites] = useState<CatalogSite[]>([]);

  // O filtro mora no CONTEXTO, não em estado local: esta view desmonta ao abrir
  // uma OS, e com `useState` a seleção se perdia toda vez que a pessoa voltava.
  const { search, sede, macroService, service, team, status, showClosed } = osBoardFilter;
  const setFilter = (patch: Partial<typeof osBoardFilter>) => setOsBoardFilter({ ...osBoardFilter, ...patch });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const catalog = await fetchCatalog();
        if (!cancelled) setSites(catalog.sites);
      } catch {
        if (!cancelled) setSites([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Decora cada ticket com o rótulo da sede uma vez (evita resolver no filtro + no render).
  const decorated = useMemo(
    () =>
      tickets.map(ticket => ({
        ticket,
        siteLabel: getTicketSiteLabel(ticket, sites),
        macro: repairMojibake(ticket.macroServiceName || ''),
        service: repairMojibake(ticket.serviceCatalogName || ''),
        team: repairMojibake(ticket.assignedTeam || ''),
      })),
    [tickets, sites]
  );

  const distinct = (values: string[]) =>
    Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const sedeOptions = useMemo(() => distinct(decorated.map(d => d.siteLabel)), [decorated]);
  const macroOptions = useMemo(() => distinct(decorated.map(d => d.macro)), [decorated]);
  const serviceOptions = useMemo(() => distinct(decorated.map(d => d.service)), [decorated]);
  const teamOptions = useMemo(() => distinct(decorated.map(d => d.team)), [decorated]);
  const statusOptions = useMemo(() => {
    const present = new Set<string>(tickets.map(t => t.status));
    return STATUS_ORDER.filter(s => present.has(s));
  }, [tickets]);

  const filtered = useMemo(() => {
    return decorated.filter(entry => {
      if (sede !== ALL && entry.siteLabel !== sede) return false;
      if (macroService !== ALL && entry.macro !== macroService) return false;
      if (service !== ALL && entry.service !== service) return false;
      if (team !== ALL && entry.team !== team) return false;
      if (status !== ALL && entry.ticket.status !== status) return false;
      // Encerrada/Cancelada só entram com a caixa marcada — a não ser que a pessoa
      // tenha filtrado explicitamente por uma delas, quando esconder seria absurdo.
      if (!showClosed && status === ALL && !isTicketOpen(entry.ticket.status)) return false;
      // A sede entra no que é vasculhado de propósito: colar o título do Gmail traz
      // junto o `[SUL 3]`, que foi removido do assunto ao criar a OS. Sem ela na
      // busca, o termo colado nunca casa. Ver src/utils/search.ts.
      const haystack = `${entry.ticket.id} ${repairMojibake(entry.ticket.subject)} ${repairMojibake(entry.ticket.requester || '')} ${entry.siteLabel} ${entry.ticket.sede || ''}`;
      return matchesSearch(haystack, search);
    });
  }, [decorated, sede, macroService, service, team, status, search, showClosed]);

  const openTicket = (id: string) => {
    setActiveTicketId(id);
    navigateTo('inbox');
  };

  const hasActiveFilter =
    sede !== ALL || macroService !== ALL || service !== ALL || team !== ALL || status !== ALL || search.trim() !== '' || showClosed;
  const clearFilters = () =>
    setOsBoardFilter({ search: '', sede: ALL, macroService: ALL, service: ALL, team: ALL, status: ALL, showClosed: false });

  const selectClass =
    'rounded-sm border border-roman-border bg-roman-surface px-2.5 py-1.5 text-sm text-roman-text-main outline-none focus:border-roman-primary';

  const priorityClass = (priority: string) =>
    priority === 'Urgente'
      ? 'text-red-600'
      : priority === 'Alta'
        ? 'text-roman-primary'
        : 'text-roman-text-sub';

  return (
    <div className="flex h-full flex-col bg-roman-bg">
      <header className="border-b border-roman-border bg-roman-surface px-4 py-4 md:px-6">
        <h1 className="text-xl font-serif font-medium text-roman-text-main">Gestão de OS</h1>
        <p className="font-serif italic text-roman-text-sub">
          Todas as ordens de serviço em uma tabela — filtre e clique para abrir.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-roman-border bg-roman-bg px-4 py-3 md:px-6">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-roman-text-sub" />
          <input
            type="text"
            value={search}
            onChange={event => setFilter({ search: event.target.value })}
            placeholder="Buscar OS, assunto ou solicitante…"
            className="w-56 rounded-sm border border-roman-border bg-roman-surface py-1.5 pl-8 pr-2.5 text-sm text-roman-text-main outline-none focus:border-roman-primary"
          />
        </div>
        <select value={sede} onChange={e => setFilter({ sede: e.target.value })} className={selectClass} aria-label="Filtrar por sede">
          <option value={ALL}>Sede: todas</option>
          {sedeOptions.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <select value={macroService} onChange={e => setFilter({ macroService: e.target.value })} className={selectClass} aria-label="Filtrar por macroserviço">
          <option value={ALL}>Macroserviço: todos</option>
          {macroOptions.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <select value={service} onChange={e => setFilter({ service: e.target.value })} className={selectClass} aria-label="Filtrar por serviço">
          <option value={ALL}>Serviço: todos</option>
          {serviceOptions.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <select value={team} onChange={e => setFilter({ team: e.target.value })} className={selectClass} aria-label="Filtrar por equipe">
          <option value={ALL}>Equipe: todas</option>
          {teamOptions.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <select value={status} onChange={e => setFilter({ status: e.target.value })} className={selectClass} aria-label="Filtrar por status">
          <option value={ALL}>Status: todos</option>
          {statusOptions.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-roman-text-sub">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={event => setFilter({ showClosed: event.target.checked })}
            className="h-3.5 w-3.5 accent-roman-primary"
          />
          Mostrar encerradas e canceladas
        </label>
        {hasActiveFilter && (
          <button
            onClick={clearFilters}
            className="inline-flex items-center gap-1 rounded-sm border border-roman-border bg-roman-surface px-2.5 py-1.5 text-sm text-roman-text-sub hover:border-roman-primary/40 hover:text-roman-text-main"
          >
            <X size={14} /> Limpar
          </button>
        )}
        <span className="ml-auto text-sm text-roman-text-sub">
          {filtered.length} {filtered.length === 1 ? 'OS' : 'OS'} {hasActiveFilter ? `de ${tickets.length}` : ''}
        </span>
      </div>

      {/* Reincidência: o mesmo lugar voltando. Fica logo acima da tabela e
          respeita o recorte filtrado — a pergunta é sempre "dentro do que estou
          olhando, o que repete?". */}
      <RecurrencePanel tickets={filtered.map(entry => entry.ticket)} onOpenTicket={openTicket} />

      <div className="min-h-0 flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center p-10 text-center text-roman-text-sub">
            {tickets.length === 0 ? 'Nenhuma OS carregada.' : 'Nenhuma OS corresponde aos filtros.'}
          </div>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-roman-surface text-left">
              <tr className="border-b border-roman-border text-[11px] uppercase tracking-wider text-roman-text-sub">
                <th className="px-3 py-2.5 font-medium">OS</th>
                <th className="px-3 py-2.5 font-medium">Assunto</th>
                <th className="px-3 py-2.5 font-medium">Sede</th>
                <th className="px-3 py-2.5 font-medium">Macroserviço</th>
                <th className="px-3 py-2.5 font-medium">Serviço</th>
                <th className="px-3 py-2.5 font-medium">Equipe</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Prioridade</th>
                <th className="px-3 py-2.5 font-medium">Atualizado</th>
                <th className="px-3 py-2.5 font-medium">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ ticket, siteLabel, macro, service: svc, team: tm }) => (
                <tr
                  key={ticket.id}
                  onClick={() => openTicket(ticket.id)}
                  onKeyDown={event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      openTicket(ticket.id);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer border-b border-roman-border/60 align-top transition-colors hover:bg-roman-primary/[0.06] focus:bg-roman-primary/10 focus:outline-none"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-roman-text-main">{ticket.id}</td>
                  {/* Sem `truncate`: o assunto é o que identifica a OS na tabela.
                      Corta-lo economizava uma linha e custava a leitura. */}
                  <td className="min-w-[16rem] max-w-[26rem] px-3 py-2.5">
                    <div className="font-medium text-roman-text-main">{repairMojibake(ticket.subject)}</div>
                    <div className="truncate text-xs text-roman-text-sub">{repairMojibake(ticket.requester || 'Sem solicitante')}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-roman-text-sub">{siteLabel || '—'}</td>
                  <td className="px-3 py-2.5 text-roman-text-sub">{macro || '—'}</td>
                  <td className="px-3 py-2.5 text-roman-text-sub">{svc || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-roman-text-sub">{tm || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2.5"><StatusBadge status={ticket.status} /></td>
                  <td className={`whitespace-nowrap px-3 py-2.5 font-medium ${priorityClass(repairMojibake(ticket.priority || ''))}`}>
                    {repairMojibake(ticket.priority || '—')}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 font-serif italic text-roman-text-sub">{formatDateTimeSafe(ticket.time)}</td>
                  {/* `stopPropagation` porque a linha inteira abre a OS: sem isso,
                      clicar em "Etapa" abria o modal E navegava para a Inbox — que é
                      exatamente o que estas ações existem para evitar. */}
                  <td className="whitespace-nowrap px-3 py-2.5" onClick={event => event.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setConversaDe(ticket.id)}
                        className="inline-flex items-center gap-1 rounded-sm border border-roman-border bg-roman-surface px-2 py-1 text-xs font-medium text-roman-text-sub hover:border-roman-primary hover:text-roman-text-main"
                      >
                        <MessageSquare size={13} /> Conversa
                      </button>
                      {podeTrocarEtapa && (
                        <button
                          type="button"
                          onClick={() => setEtapaDe(ticket.id)}
                          className="inline-flex items-center gap-1 rounded-sm border border-roman-border bg-roman-surface px-2 py-1 text-xs font-medium text-roman-text-sub hover:border-roman-primary hover:text-roman-text-main"
                        >
                          <ArrowRightLeft size={13} /> Etapa
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {conversaDe && <ConversaModal ticketId={conversaDe} onClose={() => setConversaDe(null)} />}
      {etapaDe && <EtapaModal ticketId={etapaDe} onClose={() => setEtapaDe(null)} />}
    </div>
  );
}
