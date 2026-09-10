import React, { useEffect, useMemo, useState } from 'react';
import { DollarSign, Search, SlidersHorizontal, X } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { EmptyState } from '../components/ui/EmptyState';
import { FloatingToast } from '../components/ui/FloatingToast';
import { FiltroMultiplo, type OpcaoDeFiltro } from '../components/ui/FiltroMultiplo';
import { useToast } from '../hooks/useToast';
import { fetchCatalog, type CatalogSite } from '../services/catalogApi';
import { getTicketSiteLabel } from '../utils/ticketTerritory';
import { mensagemDeErro } from '../utils/errorMessage';
import { repairMojibake } from '../utils/text';
import { matchesSearch } from '../utils/search';
import { formatCurrency } from '../utils/currency';
import { isTicketOpen } from '../constants/ticketLifecycle';
import { etapaDe as etapaDoStatus, ORDEM_DAS_ETAPAS } from '../../api/_lib/etapas.js';
import { passaNoRecorte } from './osboard/recorte';
import { BotaoDeOrcado, CampoDeValor, Variacao } from './financeiro/LinhaDeOrcamento';
import { ModalDeOrcamento } from './financeiro/ModalDeOrcamento';
import { orcamentoParaGravar, resumoDoOrcamento } from './financeiro/orcamento';
import type { ItemDoOrcamento, OrcamentoDaOs, Ticket } from '../types';

/**
 * PAINEL FINANCEIRO — o que cada OS custou.
 *
 * ⚠️ SUBSTITUI UM PAINEL QUE NUNCA RODOU. Medido em produção em 10/09/2026: das 281
 * OS, **zero** têm cotação, contrato, medição ou pagamento; zero têm diretor
 * designado; zero e-mails de pagamento foram disparados. O painel anterior tinha
 * 2.293 linhas para acompanhar medição e liberação de pagamento de contratos que
 * nunca existiram — e deixava 8 OS paradas esperando a aprovação de uma diretoria
 * que nunca foi cadastrada.
 *
 * A pergunta que a operação faz está escrita na thread de 04/09:
 *
 *   Larissa: "registrar todos os custos envolvidos, permitindo uma análise mais
 *   precisa do custo real de cada serviço... parâmetros para comparar serviços da
 *   mesma categoria"
 *
 * ⚠️ FORMATO DE TABELA, E NÃO O ACORDEÃO DE ANTES, por causa dessa frase: comparar
 * exige ver muitas OS ao mesmo tempo. O acordeão mostrava uma por vez.
 *
 * ⚠️ SEM APROVAÇÃO, SEM DIRETORIA. Registrar não é pedir permissão. Quem tem acesso à
 * OS registra o valor dela, e o território é conferido pelo servidor — o mesmo
 * `canUserAccessTicket` de todo o resto.
 */

const NENHUMA_ETAPA: string[] = [];
const comoOpcoes = (valores: string[]): OpcaoDeFiltro[] => valores.map(v => ({ value: v, label: v }));
const STATUS_ORDER = ORDEM_DAS_ETAPAS as string[];

export function FinanceView() {
  const { tickets, ticketsLoading, currentUser, updateTicket } = useApp();
  const { toast, showToast } = useToast();
  const [sites, setSites] = useState<CatalogSite[]>([]);
  const [busca, setBusca] = useState('');
  const [sede, setSede] = useState<string[]>([]);
  const [servico, setServico] = useState<string[]>([]);
  const [equipe, setEquipe] = useState<string[]>([]);
  const [etapa, setEtapa] = useState<string[]>(NENHUMA_ETAPA);
  const [soSemRegistro, setSoSemRegistro] = useState(false);
  const [mostrarEncerradas, setMostrarEncerradas] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  /** A OS cujo orçamento está aberto. Um modal para a tabela inteira. */
  const [orcamentoDe, setOrcamentoDe] = useState<Ticket | null>(null);

  const podeAcessar = currentUser?.role === 'Admin' || currentUser?.role === 'Gestor';

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const catalogo = await fetchCatalog();
        if (!cancelado) setSites(catalogo.sites);
      } catch {
        if (!cancelado) setSites([]);
      }
    })();
    return () => { cancelado = true; };
  }, []);

  const decorados = useMemo(
    () =>
      tickets.map(ticket => ({
        ticket,
        siteLabel: getTicketSiteLabel(ticket, sites),
        macro: repairMojibake(ticket.macroServiceName || ''),
        service: repairMojibake(ticket.serviceCatalogName || ''),
        team: repairMojibake(ticket.assignedTeam || ''),
        etapa: etapaDoStatus(ticket.status) as string,
      })),
    [tickets, sites]
  );

  const distintos = (valores: string[]) =>
    [...new Set(valores.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const opcoesDeSede = useMemo(() => distintos(decorados.map(d => d.siteLabel)), [decorados]);
  const opcoesDeServico = useMemo(() => distintos(decorados.map(d => d.service)), [decorados]);
  const opcoesDeEquipe = useMemo(() => distintos(decorados.map(d => d.team)), [decorados]);
  const opcoesDeEtapa = useMemo(() => {
    const presentes = new Set(decorados.map(d => d.etapa));
    return [...STATUS_ORDER.filter(s => presentes.has(s)), ...[...presentes].filter(s => !STATUS_ORDER.includes(s)).sort()];
  }, [decorados]);

  const recortadas = useMemo(() => {
    const escolhas = { sede, macroService: [], service: servico, team: equipe, status: etapa, responsible: [] };
    return decorados
      .filter(d => {
        if (!passaNoRecorte(
          { siteLabel: d.siteLabel, macro: d.macro, service: d.service, team: d.team, etapa: d.etapa, responsibleEmail: d.ticket.responsible?.email },
          escolhas
        )) return false;
        // Encerradas ficam fora por padrão, como na Gestão — a não ser que a pessoa
        // tenha filtrado por uma etapa final de propósito.
        if (!mostrarEncerradas && etapa.length === 0 && !isTicketOpen(d.ticket.status)) return false;
        // ⚠️ O ATALHO QUE FAZ O PAINEL SER USADO: "o que ainda não tem valor". Sem
        // ele, achar as OS por preencher é rolar a lista inteira procurando traço.
        if (soSemRegistro && (d.ticket.orcamento?.previsto || d.ticket.orcamento?.realizado)) return false;
        const palheiro = `${d.ticket.id} ${repairMojibake(d.ticket.subject)} ${d.siteLabel} ${d.ticket.sede || ''}`;
        return matchesSearch(palheiro, busca);
      })
      .sort((a, b) => a.ticket.id.localeCompare(b.ticket.id));
  }, [decorados, sede, servico, equipe, etapa, busca, mostrarEncerradas, soSemRegistro]);

  const resumo = useMemo(() => resumoDoOrcamento(recortadas.map(d => d.ticket)), [recortadas]);

  const gravar = async (
    ticket: Ticket,
    entrada: { previsto?: string; realizado?: string; itens?: ItemDoOrcamento[]; anexo?: OrcamentoDaOs['anexo'] }
  ) => {
    const quem = currentUser?.name || currentUser?.email || '';
    const orcamento = orcamentoParaGravar(ticket.orcamento, entrada, quem);
    try {
      const salvou = await updateTicket(ticket.id, { orcamento });
      // ⚠️ `updateTicket` devolve false sem lançar. Sem esta checagem, apagar um valor
      // e ver o campo continuar vazio na tela pareceria sucesso — e o número velho
      // voltaria no próximo carregamento.
      if (!salvou) showToast(`Não foi possível salvar o valor da ${ticket.id}. Verifique a conexão.`, 5000);
    } catch (erro) {
      showToast(mensagemDeErro(erro, `Falha ao salvar o valor da ${ticket.id}.`), 5000);
    }
  };

  if (!podeAcessar) {
    return (
      <div className="flex-1 overflow-y-auto bg-roman-bg p-4 md:p-6">
        <div className="mx-auto max-w-4xl min-h-[60vh]">
          <EmptyState icon={DollarSign} title="Acesso restrito" description="Apenas Gestor e Admin podem acessar o painel financeiro." />
        </div>
      </div>
    );
  }

  const filtrosAtivos = [sede.length > 0, servico.length > 0, equipe.length > 0, etapa.length > 0, soSemRegistro, mostrarEncerradas].filter(Boolean).length;
  const selectClass = 'rounded-sm border border-roman-border bg-roman-surface px-2.5 py-1.5 text-sm text-roman-text-main outline-none focus:border-roman-primary';
  const limpar = () => {
    setSede([]); setServico([]); setEquipe([]); setEtapa([]);
    setSoSemRegistro(false); setMostrarEncerradas(false); setBusca('');
  };

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-4 md:p-6">
      <FloatingToast message={toast} />
      <div className="mx-auto max-w-[1600px]">
        <header className="mb-4">
          <h1 className="font-serif text-2xl font-medium text-roman-text-main">Painel Financeiro</h1>
          <p className="mt-1 text-sm text-roman-text-sub">
            O que cada OS custou: o valor orçado e o realizado. Registro, sem aprovação.
          </p>
        </header>

        {/* ⚠️ O QUE FALTA VEM PRIMEIRO. Num painel que nasce vazio, "R$ 0,00 previsto"
            se lê como "não gastamos nada" em vez de "ninguém preencheu ainda". */}
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-sm border border-roman-border bg-roman-surface p-3">
            <div className="text-[11px] uppercase tracking-widest text-roman-text-sub">Sem valor registrado</div>
            <div className="mt-1 text-lg font-semibold text-roman-text-main">
              {resumo.semRegistro} <span className="text-sm font-normal text-roman-text-sub">de {recortadas.length}</span>
            </div>
          </div>
          <div className="rounded-sm border border-roman-border bg-roman-surface p-3">
            <div className="text-[11px] uppercase tracking-widest text-roman-text-sub">Orçado</div>
            <div className="mt-1 text-lg font-semibold text-roman-text-main">{formatCurrency(resumo.previsto)}</div>
          </div>
          <div className="rounded-sm border border-roman-border bg-roman-surface p-3">
            <div className="text-[11px] uppercase tracking-widest text-roman-text-sub">Realizado</div>
            <div className="mt-1 text-lg font-semibold text-roman-text-main">{formatCurrency(resumo.realizado)}</div>
          </div>
          {/* ⚠️ A DIFERENÇA SÓ CONTA AS OS COM OS DOIS LADOS, e o denominador vai à
              vista: sem ele, "R$ 0,00" não distingue "bateu certinho" de "não havia o
              que comparar". Subtrair os dois cartões acima daria a diferença entre
              duas amostras diferentes, que não é economia nenhuma. */}
          <div className="rounded-sm border border-roman-primary/35 bg-roman-primary/8 p-3">
            <div className="text-[11px] uppercase tracking-widest text-roman-text-main">Diferença comparável</div>
            <div className="mt-1 text-lg font-semibold text-roman-text-main">
              {resumo.comparaveis > 0 ? formatCurrency(resumo.diferencaComparavel) : '—'}
            </div>
            <div className="text-xs text-roman-text-sub">
              {resumo.comparaveis > 0 ? `em ${resumo.comparaveis} OS com orçado e realizado` : 'nenhuma OS tem os dois valores'}
            </div>
          </div>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative w-full md:w-auto">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-roman-text-sub" />
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar OS, assunto ou sede"
              aria-label="Buscar"
              className={`${selectClass} w-full pl-8 md:w-64`}
            />
          </div>
          <button
            type="button"
            onClick={() => setFiltrosAbertos(a => !a)}
            aria-expanded={filtrosAbertos}
            className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-sm md:hidden ${
              filtrosAtivos > 0 ? 'border-roman-primary/45 bg-roman-primary/10 text-roman-text-main' : 'border-roman-border bg-roman-surface text-roman-text-sub'
            }`}
          >
            <SlidersHorizontal size={14} />
            Filtros{filtrosAtivos > 0 ? ` (${filtrosAtivos})` : ''}
          </button>
          <div className={`${filtrosAbertos ? 'flex' : 'hidden'} w-full flex-wrap items-center gap-2 md:contents`}>
            <FiltroMultiplo rotulo="Sede" todos="todas" className={selectClass} opcoes={comoOpcoes(opcoesDeSede)} selecionados={sede} onChange={setSede} />
            <FiltroMultiplo rotulo="Serviço" todos="todos" className={selectClass} opcoes={comoOpcoes(opcoesDeServico)} selecionados={servico} onChange={setServico} />
            <FiltroMultiplo rotulo="Equipe" todos="todas" className={selectClass} opcoes={comoOpcoes(opcoesDeEquipe)} selecionados={equipe} onChange={setEquipe} />
            <FiltroMultiplo rotulo="Etapa" todos="todas" className={selectClass} opcoes={comoOpcoes(opcoesDeEtapa)} selecionados={etapa} onChange={setEtapa} />
            <button
              type="button"
              onClick={() => setSoSemRegistro(v => !v)}
              className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-sm transition-colors ${
                soSemRegistro ? 'border-roman-primary/45 bg-roman-primary/12 text-roman-text-main' : 'border-roman-border bg-roman-surface text-roman-text-sub hover:border-roman-primary/40'
              }`}
            >
              Falta preencher
            </button>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-roman-text-sub">
              <input type="checkbox" checked={mostrarEncerradas} onChange={e => setMostrarEncerradas(e.target.checked)} className="h-3.5 w-3.5 accent-roman-primary" />
              Mostrar encerradas
            </label>
            {(filtrosAtivos > 0 || busca) && (
              <button onClick={limpar} className="inline-flex items-center gap-1 rounded-sm border border-roman-border bg-roman-surface px-2.5 py-1.5 text-sm text-roman-text-sub hover:text-roman-text-main">
                <X size={13} /> Limpar
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto rounded-sm border border-roman-border bg-roman-surface">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-roman-border text-left text-[11px] uppercase tracking-widest text-roman-text-sub">
                <th className="px-3 py-2 font-medium">OS</th>
                <th className="px-3 py-2 font-medium">Assunto</th>
                <th className="px-3 py-2 font-medium">Sede</th>
                <th className="px-3 py-2 font-medium">Serviço</th>
                <th className="px-3 py-2 font-medium">Etapa</th>
                <th className="px-3 py-2 text-right font-medium">Orçado</th>
                <th className="px-3 py-2 text-right font-medium">Realizado</th>
                <th className="px-3 py-2 font-medium">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {recortadas.map(({ ticket, siteLabel, service, etapa: etapaDaLinha }) => (
                <tr key={ticket.id} className="border-b border-roman-border/60 last:border-0 hover:bg-roman-bg/60">
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-roman-text-main">{ticket.id}</td>
                  <td className="max-w-md px-3 py-2 text-roman-text-main">
                    <span className="line-clamp-2">{repairMojibake(ticket.subject)}</span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-roman-text-sub">{siteLabel || '—'}</td>
                  <td className="px-3 py-2 text-roman-text-sub">{service || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-roman-text-sub">{etapaDaLinha}</td>
                  <td className="px-3 py-2 text-right">
                    <BotaoDeOrcado orcamento={ticket.orcamento} onAbrir={() => setOrcamentoDe(ticket)} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <CampoDeValor rotulo={`Valor realizado da ${ticket.id}`} valor={ticket.orcamento?.realizado} aoSalvar={v => gravar(ticket, { realizado: v })} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2"><Variacao orcamento={ticket.orcamento} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {recortadas.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-roman-text-sub">
              {ticketsLoading ? 'Carregando…' : 'Nenhuma OS neste recorte.'}
            </p>
          )}
        </div>

        <ModalDeOrcamento
          ticket={orcamentoDe}
          onFechar={() => setOrcamentoDe(null)}
          onSalvar={async entrada => {
            if (orcamentoDe) await gravar(orcamentoDe, entrada);
          }}
        />
      </div>
    </div>
  );
}
