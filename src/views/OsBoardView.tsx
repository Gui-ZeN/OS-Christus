import React, { useEffect, useMemo, useState } from 'react';
import { RecurrencePanel } from './RecurrencePanel';
import { ArrowRightLeft, Droplets, MessageSquare, Search, TriangleAlert, UserRound, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { fetchCatalog, type CatalogSite } from '../services/catalogApi';
import { getTicketSiteLabel } from '../utils/ticketTerritory';
import { TICKET_STATUS } from '../constants/ticketStatus';
import { isTicketOpen } from '../constants/ticketLifecycle';
import { StatusBadge } from '../components/ui/StatusBadge';
import { coerceDate, formatDateTimeSafe, formatShortDate } from '../utils/date';
import { contarMarcos, lerMarcos } from '../utils/marcos';
import { matchesSearch } from '../utils/search';
import { bloqueioParaAvancar } from '../utils/statusChangeGuard';
import type { Ticket } from '../types';
import { ConversaModal } from './osboard/ConversaModal';
import { EtapaModal } from './osboard/EtapaModal';
import { ResponsavelModal } from './osboard/ResponsavelModal';
import { repairMojibake } from '../utils/text';

const ALL = 'all';
const NONE = 'none';
const STATUS_ORDER = Object.values(TICKET_STATUS) as string[];

/**
 * Há quanto tempo a OS está NESTA etapa — não a idade dela.
 *
 * São perguntas diferentes e a tabela respondia a errada: OS aberta há 40 dias e
 * movida ontem não está parada há 40 dias. `stageEnteredAt` é carimbado pelo servidor
 * a cada transição; sem ele (9 OS na produção), cai para a abertura.
 */
function diasNaEtapa(ticket: Ticket): string {
  const desde = coerceDate(ticket.stageEnteredAt, ticket.time);
  const dias = Math.floor((Date.now() - desde.getTime()) / 86_400_000);
  if (dias <= 0) return 'hoje';
  if (dias === 1) return '1 dia';
  return `${dias} dias`;
}

/**
 * A linha do tempo em texto — é ela que o leitor de tela anuncia e o mouse revela.
 *
 * Seis quadrados coloridos são inúteis para quem não os vê, e quase inúteis para quem
 * vê: "3 de 6" não diz QUAIS três. Aqui cada marco sai com a data, e o que falta sai
 * como "—" em vez de sumir, senão a ausência vira invisível.
 */
function resumoDaLinhaDoTempo(ticket: Ticket): string {
  const partes = lerMarcos(ticket).map(
    marco => `${marco.rotulo}: ${marco.data ? formatShortDate(marco.data) : '—'}`
  );
  return `${contarMarcos(ticket)} de 6 marcos · ${partes.join(' · ')}`;
}

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
  const [responsavelDe, setResponsavelDe] = useState<string | null>(null);
  const podeTrocarEtapa = currentUser?.role === 'Admin' || currentUser?.role === 'Gestor';
  const [sites, setSites] = useState<CatalogSite[]>([]);

  // O filtro mora no CONTEXTO, não em estado local: esta view desmonta ao abrir
  // uma OS, e com `useState` a seleção se perdia toda vez que a pessoa voltava.
  const { search, sede, macroService, service, team, status, responsible, showClosed, bloqueadas, agua, ordem } = osBoardFilter;
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
  // Sai das OS, não do diretório: a lista mostra quem REALMENTE responde por alguma
  // coisa. Diretório inteiro traria nomes sem nenhuma OS e o filtro viraria ruído.
  const responsibleOptions = useMemo(() => {
    const porEmail = new Map<string, string>();
    decorated.forEach(d => {
      const r = d.ticket.responsible;
      if (r?.email) porEmail.set(r.email, r.name || r.email);
    });
    return [...porEmail.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR'));
  }, [decorated]);
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
      // `none` é filtro de primeira classe: "quais OS ninguém assumiu" é a pergunta
      // que o campo existe para responder, e ela não cabe numa lista de e-mails.
      if (responsible === NONE && entry.ticket.responsible?.email) return false;
      if (responsible !== ALL && responsible !== NONE && entry.ticket.responsible?.email !== responsible) return false;
      // Encerrada/Cancelada só entram com a caixa marcada — a não ser que a pessoa
      // tenha filtrado explicitamente por uma delas, quando esconder seria absurdo.
      if (!showClosed && status === ALL && !isTicketOpen(entry.ticket.status)) return false;
      // A sede entra no que é vasculhado de propósito: colar o título do Gmail traz
      // junto o `[SUL 3]`, que foi removido do assunto ao criar a OS. Sem ela na
      // busca, o termo colado nunca casa. Ver src/utils/search.ts.
      const haystack = `${entry.ticket.id} ${repairMojibake(entry.ticket.subject)} ${repairMojibake(entry.ticket.requester || '')} ${entry.siteLabel} ${entry.ticket.sede || ''}`;
      // "Falta classificar" era visível linha a linha (o selo) e impossível de
      // agrupar. A fila precisa da pergunta inteira: quais estão travadas AGORA.
      if (bloqueadas && !bloqueioParaAvancar(entry.ticket)) return false;
      // Chuva vira goteira: é por aqui que o bloco de tempo da tela Hoje entrega uma
      // lista em vez de só um termômetro.
      if (agua && !entry.ticket.waterIssue) return false;
      return matchesSearch(haystack, search);
    })
      .sort((a, b) => {
        // A ordem anterior vinha da API e não significava nada. Com 97 OS na mesma
        // etapa, sem ordenação não havia como perguntar "qual ataco primeiro" — e a
        // resposta operacional é a que está parada há mais tempo NESTA etapa.
        const quando = (t: Ticket) => coerceDate(t.stageEnteredAt, t.time).getTime();
        return ordem === 'parada' ? quando(a.ticket) - quando(b.ticket) : quando(b.ticket) - quando(a.ticket);
      });
  }, [decorated, sede, macroService, service, team, status, responsible, search, showClosed, bloqueadas, agua, ordem]);

  // Conta sobre as OS VIVAS do escopo, não sobre o recorte filtrado: o atalho
  // precisa dizer quantas existem, e não quantas sobraram do filtro atual.
  const totalBloqueadas = useMemo(
    () => decorated.filter(e => isTicketOpen(e.ticket.status) && bloqueioParaAvancar(e.ticket)).length,
    [decorated]
  );

  /** Conta na hora, como o de travadas: número fixo mente na semana seguinte. */
  const totalDeAgua = useMemo(
    () => decorated.filter(e => isTicketOpen(e.ticket.status) && e.ticket.waterIssue).length,
    [decorated]
  );

  const openTicket = (id: string) => {
    setActiveTicketId(id);
    navigateTo('inbox');
  };

  const hasActiveFilter =
    sede !== ALL || macroService !== ALL || service !== ALL || team !== ALL || status !== ALL || responsible !== ALL || search.trim() !== '' || showClosed || bloqueadas || agua;
  const clearFilters = () =>
    setOsBoardFilter({ search: '', sede: ALL, macroService: ALL, service: ALL, team: ALL, status: ALL, responsible: ALL, showClosed: false, bloqueadas: false, agua: false, ordem });

  const selectClass =
    'rounded-sm border border-roman-border bg-roman-surface px-2.5 py-1.5 text-sm text-roman-text-main outline-none focus:border-roman-primary';

  const priorityClass = (priority: string) =>
    priority === 'Urgente'
      ? 'text-roman-danger'
      : priority === 'Alta'
        ? 'text-roman-primary'
        : 'text-roman-text-sub';

  return (
    <div className="flex h-full flex-col bg-roman-bg">
      <header className="border-b border-roman-border bg-roman-surface px-4 py-4 md:px-6">
        <h1 className="text-xl font-serif font-medium text-roman-text-main">Gestão de OS</h1>
        {/* O subtítulo ENSINA. O anterior dizia "clique para abrir" — e o ponto desta
            tela passou a ser justamente não precisar abrir. Frase permanente errada é
            pior que aviso faltando: ela ensina o comportamento antigo todo dia, sem
            data de validade. */}
        <p className="font-serif italic text-roman-text-sub">
          Conversa, etapa e responsável sem sair daqui — a OS completa só quando precisar.
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
        <select value={responsible} onChange={e => setFilter({ responsible: e.target.value })} className={selectClass} aria-label="Filtrar por responsável">
          <option value={ALL}>Responsável: todos</option>
          <option value={NONE}>Sem responsável</option>
          {responsibleOptions.map(([email, nome]) => (
            <option key={email} value={email}>{nome}</option>
          ))}
        </select>
        <select value={status} onChange={e => setFilter({ status: e.target.value })} className={selectClass} aria-label="Filtrar por status">
          <option value={ALL}>Status: todos</option>
          {statusOptions.map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        {/* Atalho, não mais um seletor: a pergunta "o que está travado" é a que a
            fila faz todo dia, e o selo de bloqueio na linha mostrava o problema um a
            um sem dar como juntá-los. Conta na hora — número fixo mente na semana
            seguinte. */}
        <button
          type="button"
          onClick={() => setFilter({ bloqueadas: !bloqueadas })}
          className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-sm transition-colors ${
            bloqueadas
              ? 'border-roman-primary/35 bg-roman-primary/12 text-roman-text-main'
              : 'border-roman-border bg-roman-surface text-roman-text-sub hover:border-roman-primary/40 hover:text-roman-text-main'
          }`}
          title="OS que não avançam enquanto faltar classificação"
        >
          <TriangleAlert size={14} />
          Travadas ({totalBloqueadas})
        </button>
        {/* Visível mesmo quando ligado de fora (pelo bloco de tempo da tela Hoje):
            chegar numa lista recortada sem enxergar o recorte é como a pessoa conclui
            que o sistema perdeu OS. Daqui ela vê o filtro aceso e desliga num clique. */}
        <button
          type="button"
          onClick={() => setFilter({ agua: !agua })}
          className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-sm transition-colors ${
            agua
              ? 'border-roman-primary bg-roman-primary/10 text-roman-text-main'
              : 'border-roman-border bg-roman-surface text-roman-text-sub hover:border-roman-primary/40 hover:text-roman-text-main'
          }`}
          title="OS marcadas como problema de água — as que a chuva faz reaparecer"
        >
          <Droplets size={14} />
          Água ({totalDeAgua})
        </button>
        <label className="inline-flex min-h-6 cursor-pointer items-center gap-1.5 text-sm text-roman-text-sub">
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
                {/* Macroserviço e serviço viraram UMA coluna: são hierárquicos, e
                    duas colunas para "Móveis" + "Reposição" custavam largura que a
                    tabela não tem. A prioridade saiu para junto do assunto. */}
                <th className="px-3 py-2.5 font-medium">Serviço</th>
                <th className="px-3 py-2.5 font-medium">Equipe</th>
                <th className="px-3 py-2.5 font-medium">Responsável</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                {/* UMA coluna, não seis. A régua da planilha tem seis datas, mas a
                    tabela já perdeu essa briga uma vez (11 colunas → 9, medido em
                    1366/1280px). A faixa dá a mesma leitura de relance e as datas
                    saem no title da linha.
                    "Marcos" e não "Linha do tempo": medido no navegador, o TEXTO do
                    cabeçalho — não a faixa — era o que definia a largura da coluna
                    (95px) e devolvia a rolagem horizontal em 1280px. */}
                <th className="px-2 py-2.5 font-medium" title="Visita técnica · Aprovação da solução · Orçamento · Ações preliminares · Início da execução · Conclusão">
                  Marcos
                </th>
                <th className="px-3 py-2.5 font-medium">
                  {/* Dizia "Atualizado" e mostrava a data de CRIAÇÃO. E data
                      absoluta não responde a pergunta da fila, que é "há quanto
                      tempo isto está parado". */}
                  <button
                    type="button"
                    onClick={() => setFilter({ ordem: ordem === 'parada' ? 'recentes' : 'parada' })}
                    className="inline-flex items-center gap-1 font-medium hover:text-roman-text-main"
                    title={ordem === 'parada' ? 'Mais paradas primeiro — clique para inverter' : 'Mais recentes primeiro — clique para inverter'}
                  >
                    Parada há {ordem === 'parada' ? '↓' : '↑'}
                  </button>
                </th>
                {/* Grudada à direita: se ainda sobrar rolagem em tela estreita, as
                    ações continuam alcançáveis sem arrastar até o fim. */}
                <th className="sticky right-0 bg-roman-surface px-3 py-2.5 font-medium">Ações</th>
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
                  // `focus:outline-none` saiu daqui: a linha ficava com a tinta de 10%
                  // como único sinal de foco, e isso mede 1,13:1 — invisível. Quem navega
                  // a tabela por teclado não sabia onde estava. A tinta fica como reforço,
                  // e o contorno do tema volta a ser o indicador.
                  className="cursor-pointer border-b border-roman-border/60 align-top transition-colors hover:bg-roman-primary/[0.06] focus:bg-roman-primary/10"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-roman-text-main">{ticket.id}</td>
                  {/* Sem `truncate`: o assunto é o que identifica a OS na tabela.
                      Corta-lo economizava uma linha e custava a leitura. */}
                  <td className="min-w-[16rem] max-w-[26rem] px-3 py-2.5">
                    <div className="font-medium text-roman-text-main">{repairMojibake(ticket.subject)}</div>
                    <div className="truncate text-xs text-roman-text-sub">
                      {repairMojibake(ticket.requester || 'Sem solicitante')}
                      {ticket.priority && (
                        <>
                          {' · '}
                          <span className={priorityClass(repairMojibake(ticket.priority))}>
                            {repairMojibake(ticket.priority)}
                          </span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-roman-text-sub">{siteLabel || '—'}</td>
                  <td className="px-3 py-2.5 text-roman-text-sub">
                    <div>{svc || macro || '—'}</div>
                    {svc && macro && <div className="text-xs text-roman-text-sub">{macro}</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-roman-text-sub">{tm || '—'}</td>
                  {/* Clicável na própria célula: definir responsável tem que custar um
                      clique, senão continua não sendo feito. */}
                  <td className="whitespace-nowrap px-3 py-2.5" onClick={event => event.stopPropagation()}>
                    {podeTrocarEtapa ? (
                      <button
                        type="button"
                        onClick={() => setResponsavelDe(ticket.id)}
                        className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-1 text-left hover:bg-roman-primary/10 ${ticket.responsible?.name ? 'text-roman-text-main' : 'text-roman-text-sub italic'}`}
                      >
                        <UserRound size={14} />
                        {ticket.responsible?.name || 'definir'}
                      </button>
                    ) : (
                      <span className="text-roman-text-sub">{ticket.responsible?.name || '—'}</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={ticket.status} />
                    {/* O bloqueio deixa de ser invisível: até agora ele só aparecia
                        para quem TENTAVA avançar, e por isso 88 OS estavam paradas
                        por um motivo que ninguém sabia que existia. */}
                    {bloqueioParaAvancar(ticket) && (
                      <div
                        className="mt-1 flex w-fit items-center gap-1 rounded-sm bg-roman-primary/12 px-1.5 py-0.5 text-[11px] font-medium leading-tight text-roman-text-main"
                        title="A OS não avança enquanto isto não for resolvido. Use o botão Etapa."
                      >
                        <TriangleAlert size={14} />
                        {bloqueioParaAvancar(ticket)?.motivo}
                      </div>
                    )}
                  </td>
                  {/* Apertada de propósito: medida no navegador, a faixa custava 49px
                      e era exatamente o que jogava a tabela de volta na rolagem
                      horizontal em 1280px — a briga que o corte de 11 para 9 colunas
                      tinha acabado de ganhar. */}
                  <td className="whitespace-nowrap px-2 py-2.5">
                    <div
                      className="flex items-center gap-px"
                      aria-label={resumoDaLinhaDoTempo(ticket)}
                      title={resumoDaLinhaDoTempo(ticket)}
                    >
                      {lerMarcos(ticket).map(marco => (
                        <span
                          key={marco.chave}
                          aria-hidden="true"
                          className={`h-2.5 w-1.5 ${
                            marco.data ? 'bg-roman-primary' : 'bg-roman-border/50'
                          }`}
                        />
                      ))}
                      {/* O número resolve o que a faixa sozinha não resolve: seis
                          quadrados quase iguais não se contam de relance. */}
                      <span className="ml-1 text-[11px] tabular-nums text-roman-text-sub">
                        {contarMarcos(ticket)}/6
                      </span>
                    </div>
                  </td>
                  <td
                    className="whitespace-nowrap px-3 py-2.5 font-serif italic text-roman-text-sub"
                    title={`Nesta etapa desde ${formatDateTimeSafe(coerceDate(ticket.stageEnteredAt, ticket.time))} · aberta em ${formatDateTimeSafe(ticket.time)}`}
                  >
                    {diasNaEtapa(ticket)}
                  </td>
                  {/* `stopPropagation` porque a linha inteira abre a OS: sem isso,
                      clicar em "Etapa" abria o modal E navegava para a Inbox — que é
                      exatamente o que estas ações existem para evitar. */}
                  <td
                    className="sticky right-0 whitespace-nowrap bg-roman-surface px-3 py-2.5"
                    onClick={event => event.stopPropagation()}
                  >
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setConversaDe(ticket.id)}
                        className="inline-flex items-center gap-1 rounded-sm border border-roman-border bg-roman-surface px-2 py-1 text-xs font-medium text-roman-text-sub hover:border-roman-primary hover:text-roman-text-main"
                      >
                        <MessageSquare size={14} /> Conversa
                      </button>
                      {podeTrocarEtapa && (
                        <button
                          type="button"
                          onClick={() => setEtapaDe(ticket.id)}
                          className="inline-flex items-center gap-1 rounded-sm border border-roman-border bg-roman-surface px-2 py-1 text-xs font-medium text-roman-text-sub hover:border-roman-primary hover:text-roman-text-main"
                        >
                          <ArrowRightLeft size={14} /> Etapa
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
      {responsavelDe && <ResponsavelModal ticketId={responsavelDe} onClose={() => setResponsavelDe(null)} />}
    </div>
  );
}
