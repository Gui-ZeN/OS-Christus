import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis, BarChart, Bar, Cell, Legend, LabelList, ComposedChart, Area, ReferenceLine } from 'recharts';
import { Briefcase, TrendingUp, Download } from 'lucide-react';
import type { KpiReportData } from './kpi/reportTypes';
import { getAuthenticatedActorHeaders } from '../services/actorHeaders';
import { PeriodPicker, type PeriodMode } from './kpi/PeriodPicker';
import { PainelDeCobranca } from './kpi/PainelDeCobranca';
import { usePaletaDeGraficos } from './kpi/paletaDeGraficos';
import { useApp } from '../context/AppContext';
import { EmptyState } from '../components/ui/EmptyState';
import { fetchCatalog, type CatalogRegion, type CatalogSite } from '../services/catalogApi';
import type { Ticket } from '../types';
import { ORDEM_DAS_ETAPAS, etapaDe } from '../../api/_lib/etapas.js';
import { PAPEIS_COM_INDICADORES_LABEL, podeVerIndicadores } from '../constants/acessoIndicadores';
import { TICKET_STATUS } from '../constants/ticketStatus';
import { granularidadeSugerida, resumoDoFluxo, serieDeFluxo } from '../utils/fluxoDemandas';
import { isTicketOpen } from '../constants/ticketLifecycle';
import { getTicketGroupLabel, getTicketRegionLabel, getTicketSiteLabel, rotuloDoGrupo } from '../utils/ticketTerritory';
import {
  backlogPorEquipe as calcBacklogPorEquipe,
  backlogPorEtapa as calcBacklogPorEtapa,
  envelhecimentoDaFila,
  esperaMaisLonga,
  esperaNaEtapaAtual,
  urgenciaDaFila,
  volumeDoPeriodo,
  volumeAgrupado,
  coberturaDaProximaAcao,
  esperaDaFila,
  filaTravada,
  tempoDeResolucao,
  reguaDosMarcos,
} from './kpi/calculos';
import { mensagemDeErro, UserFacingError } from '../utils/errorMessage';
import { repairMojibake } from '../utils/text';
import { bloqueioParaAvancar } from '../utils/statusChangeGuard';
import { activeSuspension } from '../utils/agenda';
import { lerMarcos } from '../utils/marcos';

/**
 * Rótulo de barra de DINHEIRO. `compactChartValue` arredonda para o milhar mais
 * próximo — R$ 1.500 virava "2k", erro de 33% em cima de um valor financeiro — e
 * some com o zero, que numa barra de custo é informação.
 */
/** Rótulo de barra de DIAS. `null` (etapa sem OS) não desenha rótulo nenhum. */
function rotuloDeDias(value: number | string | null) {
  const n = Number(value);
  if (value == null || !Number.isFinite(n)) return '';
  return `${n}d`;
}


// Rótulo de dados dos gráficos: compacto (esconde zeros; 15k / 1.2M pros valores altos).
/** Severidade, para ordenar o filtro. Produção hoje usa só as três primeiras.
 *  `Moderado` fica porque o formulário ainda o oferece. */
const PRIORITY_ORDER = ['Urgente', 'Alta', 'Moderado', 'Trivial'];

/* O estilo do rótulo passou a depender do tema, então virou função: uma constante
   de módulo congelaria a cor do primeiro tema carregado. */
const rotuloDeDados = (cor: string) => ({ fontSize: 11, fill: cor, fontWeight: 500 });
function compactChartValue(value: number | string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return '';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${n}`;
}



const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function KpiView() {
  const { currentUser, tickets: todasAsTickets } = useApp();
  const paleta = usePaletaDeGraficos();
  const CHART_LABEL_STYLE = rotuloDeDados(paleta.rotulo);

  /**
   * A base de TODO número desta tela, sem as OS de teste.
   *
   * Aplicado aqui, na raiz, e não em cada cartão: dois critérios convivendo na mesma
   * tela é como o gráfico de tendência ficou meses mostrando zero — cada número
   * parecia plausível sozinho, e ninguém confere o painel inteiro de uma vez.
   *
   * Só o painel. A Inbox e a Gestão continuam mostrando essas OS, porque lá elas são
   * registro do que aconteceu; aqui elas seriam trabalho que não houve.
   */
  const tickets = useMemo(
    () => todasAsTickets.filter(ticket => !ticket.excludedFromMetrics),
    [todasAsTickets]
  );
  // Mesma fonte que acende o ícone na barra lateral: duas listas escritas à mão
  // divergiam em silêncio, e o sintoma era ver o ícone e levar "acesso restrito".
  const canAccess = podeVerIndicadores(currentUser?.role);
  const [period, setPeriod] = useState<PeriodMode>('month');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  // O degrau acima da região: Colégio ou Universidade. Até aqui a tela só sabia
  // recortar UMA região por vez, e "todas as OS do Colégio" — 209 das 224 — não
  // tinha como ser perguntado.
  const [selectedGroup, setSelectedGroup] = useState('all');
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedSite, setSelectedSite] = useState('all');
  // Status, urgência e equipe entraram por pedido de quem usa: o relatório saía
  // sempre com tudo, e a pergunta real é "o que está parado na sede X".
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedPriority, setSelectedPriority] = useState('all');
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [regions, setRegions] = useState<CatalogRegion[]>([]);
  const [sites, setSites] = useState<CatalogSite[]>([]);
  const [generating, setGenerating] = useState(false);


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

  const timelineDates = useMemo(() => {
    const dates: Date[] = [];
    for (const ticket of tickets) {
      if (ticket.time instanceof Date && !Number.isNaN(ticket.time.getTime())) {
        dates.push(ticket.time);
      }
      /**
       * ⚠️ `ticket.closedAt`, NÃO `closureChecklist.closedAt`. O segundo estava
       * preenchido em ZERO das 92 OS fechadas — foi por isso que o primeiro nasceu,
       * e o tipo documenta exatamente isso. Lendo o campo morto, um ano em que todas
       * as OS foram ABERTAS no ano anterior sumia do seletor de ano, e "Últimos 12
       * meses" ancorava numa data velha.
       */
      const fechadaEm = ticket.closedAt instanceof Date ? ticket.closedAt : null;
      if (fechadaEm && !Number.isNaN(fechadaEm.getTime())) {
        dates.push(fechadaEm);
      }
    }
    return dates;
  }, [tickets]);

  const latestBalanceDate = useMemo(() => {
    if (timelineDates.length === 0) return new Date();
    const latestMs = Math.max(...timelineDates.map(date => date.getTime()));
    return new Date(latestMs);
  }, [timelineDates]);

  const latestBalanceYear = latestBalanceDate.getFullYear();

  const availableYears = useMemo(() => {
    const years = new Set<number>(timelineDates.map(date => date.getFullYear()));
    if (years.size === 0) {
      years.add(new Date().getFullYear());
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [timelineDates]);

  useEffect(() => {
    if (!availableYears.includes(selectedYear)) {
      setSelectedYear(latestBalanceYear);
    }
  }, [availableYears, latestBalanceYear, selectedYear]);

  const periodRange = useMemo(() => {
    const now = new Date();
    if (period === 'range') {
      const start = customStart ? new Date(`${customStart}T00:00:00`) : null;
      const end = customEnd ? new Date(`${customEnd}T23:59:59`) : null;
      if (start && end && !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())) {
        return { start, end };
      }
    }
    if (period === 'specificMonth') {
      return {
        start: new Date(selectedYear, selectedMonth, 1, 0, 0, 0, 0),
        end: new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999),
      };
    }
    /**
     * ⚠️ O DIA COMEÇA À MEIA-NOITE, não na hora em que a tela abriu. Sem normalizar,
     * "Últimos 30 dias" às 15h excluía as OS abertas antes das 15h do 30º dia — o
     * total do card mudava sozinho ao longo do dia, sem ninguém mexer em filtro. Os
     * outros períodos já normalizavam; só estes dois não.
     */
    const inicioDeDia = (dias: number) => {
      const inicio = new Date(now);
      inicio.setDate(inicio.getDate() - dias);
      inicio.setHours(0, 0, 0, 0);
      return inicio;
    };
    if (period === 'month') return { start: inicioDeDia(29), end: now };
    if (period === 'semester') return { start: inicioDeDia(179), end: now };

    if (selectedYear === latestBalanceYear) {
      const end = new Date(
        latestBalanceDate.getFullYear(),
        latestBalanceDate.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      );
      const start = new Date(latestBalanceDate.getFullYear(), latestBalanceDate.getMonth() - 11, 1, 0, 0, 0, 0);
      return { start, end };
    }

    return {
      start: new Date(selectedYear, 0, 1, 0, 0, 0, 0),
      end: new Date(selectedYear, 11, 31, 23, 59, 59, 999),
    };
  }, [latestBalanceDate, latestBalanceYear, period, selectedYear, selectedMonth, customStart, customEnd]);

  const periodTickets = useMemo(() => {
    const startMs = periodRange.start.getTime();
    const endMs = periodRange.end.getTime();
    return tickets.filter(ticket => {
      const ticketMs = ticket.time.getTime();
      return ticketMs >= startMs && ticketMs <= endMs;
    });
  }, [periodRange, tickets]);

  const groupOptions = useMemo(
    () => {
      const values: string[] = periodTickets.map(ticket => getTicketGroupLabel(ticket, regions, sites));
      /*
       * ⚠️ O RECUO SAI DAS OS, NÃO DO CATÁLOGO.
       *
       * Ele existe para o seletor não ficar vazio quando o período escolhido não tem
       * OS nenhuma. Lendo `regions`, oferecia o catálogo INTEIRO — inclusive grupos
       * que esta pessoa não acessa: quem tem duas regiões via as onze só por escolher
       * um mês vazio. `tickets` já vem escopado pelo servidor, então recuar para ele
       * mantém o seletor útil sem mostrar o que não é dela.
       */
      const fallbackValues: string[] = tickets.map(ticket => getTicketGroupLabel(ticket, regions, sites));
      const source = values.length ? values : fallbackValues;
      return [...new Set(source)].filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    },
    // `tickets` entra porque o RECUO lê dele. Na prática `periodTickets` já deriva
    // de `tickets` e recalcularia junto — mas dependência que o código usa e o array
    // não declara é a que engana quem mexer aqui depois.
    [periodTickets, tickets, regions, sites]
  );

  const regionOptions = useMemo(
    () => {
      // Cascata: escolhido o Colégio, o seletor de região passa a oferecer só as
      // cinco regiões dele. Sem isto, sobrava "Universidade" numa lista que já não
      // tem OS da universidade — e escolher devolveria a tela vazia.
      const doGrupo = (ticket: Ticket) =>
        selectedGroup === 'all' || getTicketGroupLabel(ticket, regions, sites) === selectedGroup;
      const values: string[] = periodTickets.filter(doGrupo).map(ticket => getTicketRegionLabel(ticket, regions, sites)).filter((value): value is string => Boolean(value));
      // Mesmo motivo do grupo: recuar para as OS da pessoa, e não para o catálogo.
      const fallbackValues: string[] = tickets
        .filter(doGrupo)
        .map(ticket => getTicketRegionLabel(ticket, regions, sites))
        .filter((value): value is string => Boolean(value));
      const source = values.length ? values : fallbackValues;
      return [...new Set(source)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    },
    // `tickets` pelo mesmo motivo do grupo acima: o recuo lê dele.
    [periodTickets, tickets, regions, selectedGroup, sites]
  );

  const selectedRegionId = useMemo(() => {
    if (selectedRegion === 'all') return null;
    return regions.find(region => region.name === selectedRegion)?.id || null;
  }, [regions, selectedRegion]);

  const siteOptions = useMemo(
    () => {
      const values: string[] = periodTickets
        .filter(ticket => selectedGroup === 'all' || getTicketGroupLabel(ticket, regions, sites) === selectedGroup)
        .filter(ticket => selectedRegion === 'all' || getTicketRegionLabel(ticket, regions, sites) === selectedRegion)
        .map(ticket => getTicketSiteLabel(ticket, sites))
        .filter((value): value is string => Boolean(value));
      // A cascata do grupo vale aqui também: com "Colégio" e região "todas", a lista
      // de sedes não pode oferecer DL, PE, EUS — elas são da Universidade.
      const regioesDoGrupo = new Set(
        regions
          .filter(region => selectedGroup === 'all' || rotuloDoGrupo(region.group) === selectedGroup)
          .map(region => region.id)
      );
      const fallbackValues: string[] = sites
        .filter(site => selectedRegion === 'all' || !selectedRegionId || site.regionId === selectedRegionId)
        .filter(site => selectedGroup === 'all' || regioesDoGrupo.has(site.regionId))
        .map(site => site.code || site.name)
        .filter((value): value is string => Boolean(value));
      const source = values.length ? values : fallbackValues;
      return [...new Set(source)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    },
    [periodTickets, selectedGroup, selectedRegion, selectedRegionId, regions, sites]
  );


  useEffect(() => {
    if (selectedGroup !== 'all' && !groupOptions.includes(selectedGroup)) {
      setSelectedGroup('all');
    }
  }, [groupOptions, selectedGroup]);

  useEffect(() => {
    if (selectedRegion !== 'all' && !regionOptions.includes(selectedRegion)) {
      setSelectedRegion('all');
    }
  }, [regionOptions, selectedRegion]);

  useEffect(() => {
    if (selectedSite !== 'all' && !siteOptions.includes(selectedSite)) {
      setSelectedSite('all');
    }
  }, [selectedSite, siteOptions]);

  /** Os filtros de recorte, sem o período — que cada quadro aplica ao seu jeito. */
  const passaNosFiltros = useCallback(
    (ticket: Ticket) => {
      if (selectedGroup !== 'all' && getTicketGroupLabel(ticket, regions, sites) !== selectedGroup) return false;
      if (selectedRegion !== 'all' && getTicketRegionLabel(ticket, regions, sites) !== selectedRegion) return false;
      if (selectedSite !== 'all' && getTicketSiteLabel(ticket, sites) !== selectedSite) return false;
      // ⚠️ `etapaDe`, e não `ticket.status`. O dropdown é montado com as SEIS
      // etapas e o filtro comparava contra os TREZE status do banco: escolher
      // "Em orçamento" comparava com "Aguardando Orçamento" e não casava com OS
      // nenhuma. Cinco das sete opções devolviam a tela vazia, sem erro.
      if (selectedStatus !== 'all' && etapaDe(String(ticket.status)) !== selectedStatus) return false;
      if (selectedPriority !== 'all' && ticket.priority !== selectedPriority) return false;
      if (selectedTeam !== 'all' && repairMojibake(ticket.assignedTeam || '') !== selectedTeam) return false;
      return true;
    },
    [regions, selectedGroup, selectedRegion, selectedSite, selectedStatus, selectedPriority, selectedTeam, sites]
  );

  /** FLUXO: o que aconteceu no período. Recorta por data de abertura. */
  const filteredTickets = useMemo(() => periodTickets.filter(passaNosFiltros), [passaNosFiltros, periodTickets]);

  /**
   * FILA: o que está parado AGORA — os mesmos filtros, sem o corte de data.
   *
   * ⚠️ ESTA SEPARAÇÃO É O CONSERTO DE METADE DOS DEFEITOS DO PAINEL. Todo card de
   * estado atual lia a lista recortada por data de ABERTURA: no padrão "Últimos
   * 30 dias", a OS de janeiro ainda parada — justamente a que importa — não
   * existia para o backlog, para o envelhecimento nem para a maior espera. O
   * gráfico de fluxo já tinha percebido isso e documentado logo abaixo; a regra
   * só não valia para o resto da tela.
   */
  const ticketsDaFila = useMemo(() => tickets.filter(passaNosFiltros), [passaNosFiltros, tickets]);

  /**
   * As OS do recorte SEM o corte de período, para o quadro de cobrança.
   *
   * O período dele é a data da VISITA, não a da abertura da OS: uma visita de ontem
   * numa OS aberta em março é trabalho deste mês. Reaproveitar `filteredTickets`
   * apagaria justamente essas.
   *
   * `null` quando não há filtro nenhum — e não a lista inteira. Uma visita cuja OS o
   * navegador ainda não carregou sumiria da lista, e o quadro mostraria menos
   * trabalho do que houve sem nada na tela indicando filtro.
   */
  const idsDoRecorte = useMemo(() => {
    const semFiltro =
      selectedRegion === 'all' &&
      selectedSite === 'all' &&
      selectedStatus === 'all' &&
      selectedPriority === 'all' &&
      selectedTeam === 'all';
    if (semFiltro) return null;
    return tickets.filter(passaNosFiltros).map(ticket => ticket.id);
  }, [passaNosFiltros, tickets, selectedRegion, selectedSite, selectedStatus, selectedPriority, selectedTeam]);

  const statusOptions = useMemo(() => {
    const presentes = new Set<string>(periodTickets.map(ticket => etapaDe(String(ticket.status))).filter(Boolean));
    // Ordem do fluxo, não alfabética: quem lê procura a etapa onde a OS está. Etapas
    // aposentadas continuam na lista SE houver OS nelas — esconder o filtro não
    // esconde a OS, só impede de achá-la.
    const conhecidas = (ORDEM_DAS_ETAPAS as string[]).filter(status => presentes.has(status));
    const outras = [...presentes].filter(status => !conhecidas.includes(status)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return [...conhecidas, ...outras];
  }, [periodTickets]);

  const priorityOptions = useMemo(() => {
    const presentes = [...new Set(periodTickets.map(ticket => ticket.priority).filter(Boolean))];
    // Conhecidas primeiro, por severidade; qualquer valor novo entra no fim em vez
    // de sumir — opção que desaparece em silêncio vira OS que ninguém consegue filtrar.
    const conhecidas = PRIORITY_ORDER.filter(priority => presentes.includes(priority));
    const outras = presentes.filter(priority => !PRIORITY_ORDER.includes(priority)).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    return [...conhecidas, ...outras];
  }, [periodTickets]);

  const teamOptions = useMemo(() => {
    const values = periodTickets
      .map(ticket => repairMojibake(ticket.assignedTeam || ''))
      .filter(Boolean);
    return [...new Set(values)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [periodTickets]);

  const osPorSede = useMemo(
    () => volumeAgrupado(filteredTickets, ticket => getTicketSiteLabel(ticket, sites)),
    [filteredTickets, sites]
  );

  /**
   * VOLUME POR CATEGORIA — a pergunta que o dado respondia e a tela não.
   *
   * Medido em 04/09/2026: 92% das 226 OS têm macroserviço preenchido (76% têm o
   * serviço específico), e mesmo assim "quantas OS de cada categoria" só existia na
   * aba Financeira, agrupada por CUSTO — que é zero em todas as OS da base. A
   * pergunta tinha resposta e não tinha tela.
   *
   * ⚠️ MACROSERVIÇO, e não o serviço específico. São 14 macroserviços contra 24
   * serviços, com 92% de preenchimento contra 76%: mais barra e menos dado é o pior
   * dos dois lados. Com o filtro de sede ligado, este mesmo gráfico responde "quais
   * categorias concentram na sede X".
   *
   * "Não classificada" fica À VISTA, e não some: são 18 OS, e uma categoria que a
   * operação não preencheu é justamente o que o painel precisa mostrar.
   *
   * SEM TETO, ao contrário dos rankings. São 14 macroserviços e o gráfico vizinho já
   * desenha 18 sedes sem apertar — e cortar a cauda numa pergunta que é "quantas em
   * cada categoria" seria responder outra coisa.
   */
  const osPorCategoria = useMemo(
    () =>
      volumeAgrupado(filteredTickets, ticket =>
        repairMojibake(ticket.macroServiceName || '') || 'Não classificada'
      ),
    [filteredTickets]
  );

  const volume = useMemo(() => volumeDoPeriodo(filteredTickets), [filteredTickets]);

  const backlogPorEtapa = useMemo(() => calcBacklogPorEtapa(ticketsDaFila), [ticketsDaFila]);

  const esperaPorEtapa = useMemo(() => esperaNaEtapaAtual(ticketsDaFila), [ticketsDaFila]);

  /**
   * A base do gráfico de fluxo: os mesmos filtros da tela, MENOS data e MENOS etapa.
   *
   * Data sai porque `periodTickets` recorta por data de ABERTURA — usá-lo perderia
   * todo fechamento de OS aberta antes da janela, que é a maioria (mediana de 21 dias
   * entre abrir e fechar), e a linha de pendências começaria em zero.
   *
   * Etapa sai porque etapa é atributo de AGORA, não de então: a OS que hoje está
   * "Encerrada" estava "Em andamento" na semana passada. Filtrar uma série temporal
   * pelo estado atual responde uma pergunta que ninguém fez.
   */
  const ticketsDoEscopo = useMemo(() => {
    return tickets.filter(ticket => {
      if (selectedGroup !== 'all' && getTicketGroupLabel(ticket, regions, sites) !== selectedGroup) return false;
      if (selectedRegion !== 'all' && getTicketRegionLabel(ticket, regions, sites) !== selectedRegion) return false;
      if (selectedSite !== 'all' && getTicketSiteLabel(ticket, sites) !== selectedSite) return false;
      if (selectedPriority !== 'all' && ticket.priority !== selectedPriority) return false;
      if (selectedTeam !== 'all' && repairMojibake(ticket.assignedTeam || '') !== selectedTeam) return false;
      return true;
    });
  }, [regions, selectedGroup, selectedRegion, selectedSite, selectedPriority, selectedTeam, sites, tickets]);

  const fluxoDemandas = useMemo(
    () => serieDeFluxo(ticketsDoEscopo, { inicio: periodRange.start, fim: periodRange.end }),
    [periodRange.end, periodRange.start, ticketsDoEscopo]
  );

  const resumoFluxo = useMemo(() => resumoDoFluxo(fluxoDemandas), [fluxoDemandas]);

  const granularidadeFluxo = useMemo(
    () => granularidadeSugerida(periodRange.start, periodRange.end),
    [periodRange.end, periodRange.start]
  );

  // O PDF gerencial continua mensal e com o formato que o servidor espera. Vem da
  // MESMA conta do gráfico da tela — duas contas para a mesma pergunta acabariam
  // discordando, e o relatório impresso é o que sai da empresa.
  const tendenciaMensal = useMemo(() => {
    return serieDeFluxo(ticketsDoEscopo, {
      inicio: periodRange.start,
      fim: periodRange.end,
      granularidade: 'mes',
    }).map(ponto => ({ name: ponto.rotulo, abertas: ponto.abertas, encerradas: ponto.encerradas }));
  }, [periodRange.end, periodRange.start, ticketsDoEscopo]);

  const agingBuckets = useMemo(() => envelhecimentoDaFila(ticketsDaFila), [ticketsDaFila]);

  const backlogPorEquipe = useMemo(() => calcBacklogPorEquipe(ticketsDaFila), [ticketsDaFila]);

  const distribuicaoUrgencia = useMemo(() => urgenciaDaFila(ticketsDaFila), [ticketsDaFila]);








  const pendingPaymentsCount = useMemo(
    () => ticketsDaFila.filter(ticket => ticket.status === TICKET_STATUS.WAITING_PAYMENT).length,
    [ticketsDaFila]
  );

  const waitingValidationCount = useMemo(
    () => ticketsDaFila.filter(ticket => ticket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL).length,
    [ticketsDaFila]
  );

  const urgentOpenCount = useMemo(
    () =>
      ticketsDaFila.filter(ticket =>
        (ticket.priority === 'Urgente' || ticket.priority === 'Alta') &&
        isTicketOpen(ticket.status)
      ).length,
    [ticketsDaFila]
  );

  /**
   * ⚠️ LÊ A BASE SEM DATA. Garantia é estado de AGORA: a OS aberta em janeiro,
   * encerrada em julho e protegida até dezembro não aparecia em "Últimos 30 dias".
   * O número era sempre menor que a realidade e nada na tela dizia isso.
   */
  const ticketsInGuaranteeCount = useMemo(
    () =>
      ticketsDaFila.filter(ticket =>
        ticket.status === TICKET_STATUS.CLOSED &&
        ticket.guarantee?.endAt instanceof Date &&
        ticket.guarantee.endAt.getTime() >= Date.now()
      ).length,
    [ticketsDaFila]
  );

  const esperaAberta = useMemo(() => esperaMaisLonga(ticketsDaFila), [ticketsDaFila]);

  /**
   * A TERCEIRA BASE: o que FECHOU no período.
   *
   * ⚠️ NÃO É `filteredTickets`, e a diferença é o indicador inteiro. Aquela recorta
   * por data de ABERTURA — uma OS aberta este mês e ainda viva não tem tempo de
   * resolução, e uma aberta em janeiro e concluída ontem é justamente a notícia. É o
   * mesmo recorte que o gráfico de fluxo usa para contar saídas.
   */
  const ticketsFechadosNoPeriodo = useMemo(() => {
    const inicio = periodRange.start.getTime();
    const fim = periodRange.end.getTime();
    return ticketsDaFila.filter(ticket => {
      if (!ticket.closedAt) return false;
      const data = ticket.closedAt instanceof Date ? ticket.closedAt : new Date(ticket.closedAt);
      const quando = data.getTime();
      return !Number.isNaN(quando) && quando >= inicio && quando <= fim;
    });
  }, [ticketsDaFila, periodRange.start, periodRange.end]);

  const resolucao = useMemo(() => tempoDeResolucao(ticketsFechadosNoPeriodo), [ticketsFechadosNoPeriodo]);
  const proximaAcao = useMemo(() => coberturaDaProximaAcao(ticketsDaFila), [ticketsDaFila]);
  const travadas = useMemo(() => filaTravada(ticketsDaFila, bloqueioParaAvancar), [ticketsDaFila]);
  const espera = useMemo(() => esperaDaFila(ticketsDaFila, activeSuspension), [ticketsDaFila]);
  const regua = useMemo(() => reguaDosMarcos(ticketsFechadosNoPeriodo, lerMarcos), [ticketsFechadosNoPeriodo]);







  const periodLabel = useMemo(() => {
    if (period === 'month') return 'Últimos 30 dias';
    if (period === 'semester') return 'Últimos 6 meses';
    if (period === 'specificMonth') return `${MONTH_NAMES[selectedMonth]} de ${selectedYear}`;
    if (period === 'range') {
      if (customStart && customEnd) {
        const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('pt-BR');
        return `${fmt(customStart)} – ${fmt(customEnd)}`;
      }
      return 'Período personalizado';
    }
    return selectedYear === latestBalanceYear ? 'Últimos 12 meses' : `Ano ${selectedYear}`;
  }, [period, selectedMonth, selectedYear, customStart, customEnd, latestBalanceYear]);

  const handleQuickPeriod = (p: 'month' | 'semester' | 'custom') => {
    setPeriod(p);
    if (p === 'custom') setSelectedYear(latestBalanceYear);
  };
  const handleSelectMonth = (month: number, year: number) => {
    setSelectedMonth(month);
    setSelectedYear(year);
    setPeriod('specificMonth');
  };
  const handleSelectRange = (start: string, end: string) => {
    setCustomStart(start);
    setCustomEnd(end);
    setPeriod('range');
  };

  const reportData = useMemo<KpiReportData>(() => {
    const encerradas = filteredTickets.filter(t => t.status === TICKET_STATUS.CLOSED).length;
    const canceladas = volume.canceladas;
    const abertas = volume.emCurso;
    // Período, sede e região saem SEMPRE (mesmo em "Todas"), porque a ausência
    // delas seria lida como esquecimento. Os demais só aparecem quando restringem
    // de fato — linha de recorte com sete "Todos" não informa, atrapalha.
    const filtros = [
      { label: 'Período', value: periodLabel },
      { label: 'Sede', value: selectedSite === 'all' ? 'Todas' : selectedSite },
      { label: 'Região', value: selectedRegion === 'all' ? 'Todas' : selectedRegion },
      // Sai só quando recorta: com "Colégio e Universidade" ele não estreita nada, e
      // a régua desta lista é justamente essa. Mas quando recorta, ele PRECISA sair —
      // um relatório do Colégio que não diz que é do Colégio vira relatório do grupo
      // inteiro na mão de quem receber.
      ...(selectedGroup !== 'all' ? [{ label: 'Unidade', value: selectedGroup }] : []),
      ...(selectedStatus !== 'all' ? [{ label: 'Etapa', value: selectedStatus }] : []),
      ...(selectedPriority !== 'all' ? [{ label: 'Urgência', value: selectedPriority }] : []),
      ...(selectedTeam !== 'all' ? [{ label: 'Equipe', value: selectedTeam }] : []),
    ];
    return {
      filtros,
      geradoEm: '',
      totalOs: filteredTickets.length,
      abertas,
      encerradas,
      canceladas,
      urgentesAbertas: urgentOpenCount,
      osMaisAntigaDias: esperaAberta?.dias ?? null,
      osPorSede,
      backlogPorEtapa,
      agingBuckets,
      tempoPorEtapa: esperaPorEtapa,
      tendenciaMensal,
      distribuicaoUrgencia,
      backlogPorEquipe: backlogPorEquipe.itens,
    };
  }, [filteredTickets, volume, periodLabel, selectedSite, selectedRegion, selectedStatus, selectedPriority, selectedTeam, urgentOpenCount, esperaAberta, osPorSede, backlogPorEtapa, agingBuckets, esperaPorEtapa, tendenciaMensal, distribuicaoUrgencia, backlogPorEquipe]);

  const handleExportPdf = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const payload = {
        ...reportData,
        geradoEm: new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
      };
      const headers = await getAuthenticatedActorHeaders();
      const response = await fetch('/api/report-pdf', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: payload }),
      });
      if (!response.ok) throw new UserFacingError('Falha ao gerar o PDF.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'relatorio-gerencial-os.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      window.alert(mensagemDeErro(error, 'Falha ao gerar o PDF.'));
    } finally {
      setGenerating(false);
    }
  };

  if (!canAccess) {
    return (
      <div className="flex-1 overflow-y-auto bg-roman-bg p-4 md:p-5 xl:p-6 2xl:p-8">
        <div className="max-w-4xl mx-auto min-h-[60vh]">
          <EmptyState
            icon={TrendingUp}
            title="Acesso restrito"
            description={`Os indicadores gerenciais estão disponíveis para: ${PAPEIS_COM_INDICADORES_LABEL}.`}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto bg-roman-bg p-4 md:p-5 xl:p-6 2xl:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-roman-primary">
                Grupo Christus · Indicadores
              </div>
              <h1 className="font-serif text-2xl font-medium leading-tight text-roman-text-main md:text-[1.9rem]">
                Painel Executivo
              </h1>
              <p className="mt-1.5 max-w-xl font-serif text-sm italic text-roman-text-sub">
                Leitura consolidada da operação: volume, risco, decisões pendentes e pressão da fila.
              </p>
            </div>
              <button
                onClick={handleExportPdf}
                disabled={generating}
                className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-roman-primary px-4 py-2.5 text-sm font-semibold text-roman-on-primary shadow-sm transition-colors hover:bg-roman-primary-hover disabled:opacity-60"
                title="Gera um relatório gerencial em PDF com os filtros atuais (período, sede, região)"
              >
                <Download size={16} /> {generating ? 'Gerando…' : 'Exportar PDF'}
              </button>
          </div>

          {/* Barra de filtros unificada */}
          <div className="mt-5 flex flex-wrap items-center gap-2 rounded-xl border border-roman-border bg-roman-surface p-2 shadow-sm">
            {/* O par Gerencial/Financeira saiu com a aba financeira: com uma
                perspectiva só, um seletor de uma opção é ruído que ocupa o lugar
                onde os filtros de verdade começam. */}
            <PeriodPicker
              period={period}
              selectedMonth={selectedMonth}
              selectedYear={selectedYear}
              customStart={customStart}
              customEnd={customEnd}
              minYear={availableYears.length ? Math.min(...availableYears) : latestBalanceYear}
              maxYear={availableYears.length ? Math.max(...availableYears) : latestBalanceYear}
              label={periodLabel}
              onQuick={handleQuickPeriod}
              onMonth={handleSelectMonth}
              onRange={handleSelectRange}
            />

            {/* ANTES da região, porque é o degrau de cima: escolhido o Colégio, a
                lista de regiões e a de sedes já vêm recortadas. Só aparece quando há
                mais de um grupo — com um só, o seletor não recorta nada e seria mais
                um controle para ler. */}
            {groupOptions.length > 1 && (
              <select
                value={selectedGroup}
                onChange={event => {
                  setSelectedGroup(event.target.value);
                  setSelectedRegion('all');
                  setSelectedSite('all');
                }}
                className="rounded-sm border border-roman-border bg-roman-bg px-3 py-2 text-sm font-medium text-roman-text-main outline-none focus:border-roman-primary"
                aria-label="Filtrar por unidade"
              >
                <option value="all">Colégio e Universidade</option>
                {groupOptions.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            )}

            <select
              value={selectedRegion}
              onChange={event => {
                setSelectedRegion(event.target.value);
                setSelectedSite('all');
              }}
              className="rounded-sm border border-roman-border bg-roman-bg px-3 py-2 text-sm font-medium text-roman-text-main outline-none focus:border-roman-primary"
              aria-label="Filtrar por região"
            >
              <option value="all">Todas as regiões</option>
              {regionOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>

            <select
              value={selectedSite}
              onChange={event => setSelectedSite(event.target.value)}
              className="rounded-sm border border-roman-border bg-roman-bg px-3 py-2 text-sm font-medium text-roman-text-main outline-none focus:border-roman-primary"
              aria-label="Filtrar por sede"
            >
              <option value="all">Todas as sedes</option>
              {siteOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>

            <select
              value={selectedStatus}
              onChange={event => setSelectedStatus(event.target.value)}
              className="rounded-sm border border-roman-border bg-roman-bg px-3 py-2 text-sm font-medium text-roman-text-main outline-none focus:border-roman-primary"
              aria-label="Filtrar por etapa"
            >
              <option value="all">Todas as etapas</option>
              {statusOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>

            <select
              value={selectedPriority}
              onChange={event => setSelectedPriority(event.target.value)}
              className="rounded-sm border border-roman-border bg-roman-bg px-3 py-2 text-sm font-medium text-roman-text-main outline-none focus:border-roman-primary"
              aria-label="Filtrar por urgência"
            >
              <option value="all">Todas as urgências</option>
              {priorityOptions.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>

            {teamOptions.length > 0 && (
              <select
                value={selectedTeam}
                onChange={event => setSelectedTeam(event.target.value)}
                className="rounded-sm border border-roman-border bg-roman-bg px-3 py-2 text-sm font-medium text-roman-text-main outline-none focus:border-roman-primary"
                aria-label="Filtrar por equipe"
              >
                <option value="all">Todas as equipes</option>
                {teamOptions.map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            )}

            {/* O filtro de Fornecedor saiu junto: o nome vinha de
                `contractsByTicket[id].vendor`, e sem contrato a lista era sempre
                vazia — um seletor que só oferecia "Todos os fornecedores". */}

            {(selectedRegion !== 'all' || selectedSite !== 'all' || selectedStatus !== 'all' || selectedPriority !== 'all' || selectedTeam !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSelectedRegion('all');
                  setSelectedSite('all');
                  setSelectedStatus('all');
                  setSelectedPriority('all');
                  setSelectedTeam('all');
                }}
                className="ml-auto rounded-sm px-3 py-2 text-sm font-medium text-roman-text-sub transition-colors hover:bg-roman-bg hover:text-roman-text-main"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </header>

          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Briefcase size={64} />
                </div>
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Volume operacional</h3>
                <div className="text-2xl font-medium text-roman-text-main mb-1">{volume.total}</div>
                <div className="text-sm text-roman-text-sub mb-4">
                  {volume.emCurso} em curso · {volume.concluidas} concluídas · {volume.canceladas} canceladas
                </div>
                {/* As três parcelas fecham o total. Antes a tela mostrava só duas, e a
                    diferença — as canceladas — não tinha rótulo: quem somava não
                    batia e não descobria por quê. */}
                <div className="flex items-center gap-2 text-xs font-medium text-roman-text-main bg-roman-bg w-fit px-2 py-1 rounded-sm border border-roman-border">
                  Abertas no período
                </div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <TrendingUp size={64} />
                </div>
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Fechamento pendente</h3>
                <div className="text-2xl font-medium text-roman-text-main mb-1">{waitingValidationCount}</div>
                {/* A frase repetia o mesmo número do card — "5 / 5 entregas". */}
                <div className="text-sm text-roman-text-sub mb-4">Entregas que dependem de aceite para fechar o ciclo</div>
                <div className="flex items-center gap-2 text-xs font-medium text-roman-text-main bg-roman-bg w-fit px-2 py-1 rounded-sm border border-roman-border">
                  Pagamentos pendentes: {pendingPaymentsCount}
                </div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                  <TrendingUp size={64} />
                </div>
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Obras em andamento</h3>
                {/* Sai da MESMA tradução de etapas do resto da tela, e não de uma
                    lista de status escrita à mão — era o quarto agrupamento diferente
                    dos mesmos treze status, no mesmo painel. */}
                <div className="text-2xl font-medium text-roman-text-main mb-1">
                  {backlogPorEtapa.find(etapa => etapa.name === 'Em execução')?.total ?? 0}
                </div>
                <div className="text-sm text-roman-text-sub mb-4">Na etapa de execução agora</div>
                <div className="flex items-center gap-2 text-xs font-medium text-roman-text-main bg-roman-bg w-fit px-2 py-1 rounded-sm border border-roman-border">
                  Risco alto em aberto: {urgentOpenCount}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Aceite final pendente</h3>
                <div className="text-2xl font-medium text-roman-text-main mb-1">{waitingValidationCount}</div>
                <div className="text-sm text-roman-text-sub">Obras concluídas aguardando retorno para encerrar</div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Risco operacional</h3>
                <div className="text-2xl font-medium text-roman-text-main mb-1">{urgentOpenCount}</div>
                <div className="text-sm text-roman-text-sub">Chamados de prioridade alta ou urgente ainda sem encerramento</div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Cobertura de garantia</h3>
                <div className="text-2xl font-medium text-roman-text-main mb-1">{ticketsInGuaranteeCount}</div>
                <div className="text-sm text-roman-text-sub">OS encerradas ainda protegidas pelo período de garantia</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Maior espera em aberto</h3>
                {/* "—", e não "0 dia": sem OS aberta não há espera zero, há ausência
                    de espera. O PDF já mandava `null` aqui e a tela escrevia zero — o
                    relatório impresso e o painel discordavam sobre o mesmo número. */}
                <div className="text-2xl font-medium text-roman-text-main mb-1">{esperaAberta ? `${esperaAberta.dias} dias` : '—'}</div>
                <div className="text-sm text-roman-text-sub truncate" title={esperaAberta?.subject || ''}>
                  {esperaAberta ? `${esperaAberta.id} · ${esperaAberta.subject}` : 'Nenhuma OS aberta no recorte'}
                </div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Concentração de fila</h3>
                {/* `.total`, e não o tamanho da lista já cortada em 8: com doze
                    equipes em fila, o card afirmava "8". */}
                <div className="text-2xl font-medium text-roman-text-main mb-1">{backlogPorEquipe.total}</div>
                <div className="text-sm text-roman-text-sub">
                  {backlogPorEquipe.itens[0]
                    ? `${backlogPorEquipe.itens[0].name} lidera com ${backlogPorEquipe.itens[0].total} OS`
                    : 'Nenhuma fila ativa'}
                </div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Prioridade dominante</h3>
                <div className="text-2xl font-medium text-roman-text-main mb-1">{distribuicaoUrgencia[0]?.name || 'Não definida'}</div>
                <div className="text-sm text-roman-text-sub">
                  {distribuicaoUrgencia[0] ? `${distribuicaoUrgencia[0].total} OS em aberto` : 'Nenhuma OS em aberto'}
                </div>
              </div>
            </div>

            {/*
              OS QUATRO QUE O PAINEL NÃO TINHA.
              Eles medem o que o Serv3 GANHOU nos últimos meses e continuava
              invisível aqui: quanto tempo se leva para resolver, se a próxima ação
              está sendo preenchida, o que não anda por bloqueio, e o que espera com
              data marcada — que não é a mesma coisa que estar parado.
            */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Tempo de resolução</h3>
                {/* Mediana, e a amostra ao lado: média de duas OS não é média. */}
                <div className="text-2xl font-medium text-roman-text-main mb-1">
                  {resolucao.mediana === null ? '—' : `${resolucao.mediana} dias`}
                </div>
                <div className="text-sm text-roman-text-sub">
                  {resolucao.amostra === 0
                    ? 'Nenhuma OS concluída neste período'
                    : `Mediana de ${resolucao.amostra} OS concluída(s) no período`}
                </div>
                {resolucao.maisLento !== null && (
                  <div className="mt-3 flex items-center gap-2 text-xs font-medium text-roman-text-main bg-roman-bg w-fit px-2 py-1 rounded-sm border border-roman-border">
                    Mais demorada: {resolucao.maisLento} dias
                  </div>
                )}
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Próxima ação definida</h3>
                {/* Percentual com o denominador à vista — "78%" sozinho não deixa
                    ninguém checar, e sem OS aberta não existe percentual nenhum. */}
                <div className="text-2xl font-medium text-roman-text-main mb-1">
                  {proximaAcao.total === 0
                    ? '—'
                    : `${Math.round((proximaAcao.comData / proximaAcao.total) * 100)}%`}
                </div>
                <div className="text-sm text-roman-text-sub">
                  {proximaAcao.total === 0
                    ? 'Nenhuma OS aberta no recorte'
                    : `${proximaAcao.comData} de ${proximaAcao.total} OS abertas têm data para andar`}
                </div>
                {proximaAcao.vencidas > 0 && (
                  <div className="mt-3 flex items-center gap-2 text-xs font-medium text-roman-danger bg-roman-danger/12 w-fit px-2 py-1 rounded-sm border border-roman-danger/35">
                    {proximaAcao.vencidas} com a data já vencida
                  </div>
                )}
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Travadas por bloqueio</h3>
                <div className="text-2xl font-medium text-roman-text-main mb-1">{travadas.travadas}</div>
                <div className="text-sm text-roman-text-sub">
                  {travadas.travadas === 0
                    ? 'Nenhuma OS bloqueada — a fila anda'
                    : 'Não avançam enquanto isto não for resolvido'}
                </div>
                {travadas.motivos.map(motivo => (
                  <div
                    key={motivo.name}
                    className="mt-3 flex items-center gap-2 text-xs font-medium text-roman-text-main bg-roman-bg w-fit px-2 py-1 rounded-sm border border-roman-border"
                  >
                    {motivo.name}: {motivo.total}
                  </div>
                ))}
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-2">Esperando com data</h3>
                {/* Suspensa com motivo e revisão marcada é gestão, não falha — e no
                    envelhecimento as duas contavam igual. */}
                <div className="text-2xl font-medium text-roman-text-main mb-1">{espera.suspensas}</div>
                <div className="text-sm text-roman-text-sub">
                  Suspensas com motivo e data de revisão
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs font-medium text-roman-text-main bg-roman-bg w-fit px-2 py-1 rounded-sm border border-roman-border">
                  Paradas sem previsão: {espera.paradas}
                </div>
              </div>
            </div>
          </>

        {/*
          VOLUME POR CATEGORIA — largura cheia, e só no Gerencial.
          A pergunta "como dividimos as categorias e quantas em cada uma" tinha
          resposta no banco (92% das OS classificadas) e não tinha tela: o único
          gráfico por categoria era o de CUSTO, na aba Financeira, que é zero em toda
          a base. Com o filtro de sede ligado, este mesmo gráfico responde "quais
          categorias concentram na sede X".
          Deitado porque os nomes são longos ("Acabamentos e Divisórias"): em pé eles
          se atropelam ou giram, e o de sedes ao lado já usa rótulo curto.
        */}
          <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0 mb-6">
            <h2 className="font-serif text-lg font-medium text-roman-text-main">Volume de OS por categoria</h2>
            <p className="mb-6 font-serif italic text-sm text-roman-text-sub">
              Por macroserviço. Segue o recorte dos filtros acima — com uma sede escolhida, mostra a
              concentração daquela sede.
            </p>
            <div className="min-w-0" style={{ height: `${Math.max(18, osPorCategoria.length * 2.2)}rem` }}>
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={osPorCategoria} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={paleta.grade} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: paleta.eixo }} allowDecimals={false} />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: paleta.eixo }} width={170} />
                  <Tooltip
                    cursor={{ fill: paleta.cursor }}
                    contentStyle={{ backgroundColor: paleta.superficie, border: `1px solid ${paleta.borda}`, borderRadius: '2px', fontSize: '12px' }}
                    itemStyle={{ color: paleta.textoDica }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '12px' }} formatter={valor => <span style={{ color: paleta.textoDica }}>{valor}</span>} />
                  {/* As MESMAS três séries do gráfico de sedes, pelo mesmo motivo:
                      cancelada não é entrega, e uma barra só faria "concluídas"
                      incluir obra que não aconteceu. */}
                  <Bar dataKey="abertas" name="Em aberto" stackId="a" fill={paleta.serieC}>
                    <LabelList dataKey="abertas" position="center" formatter={compactChartValue} style={{ fontSize: 10, fill: paleta.textoDica, fontWeight: 600 }} />
                  </Bar>
                  <Bar dataKey="concluidas" name="Concluídas" stackId="a" fill={paleta.serieA}>
                    <LabelList dataKey="concluidas" position="center" formatter={compactChartValue} style={{ fontSize: 10, fill: paleta.superficie, fontWeight: 600 }} />
                  </Bar>
                  <Bar dataKey="canceladas" name="Canceladas" stackId="a" fill={paleta.grade} radius={[0, 2, 2, 0]}>
                    <LabelList dataKey="canceladas" position="center" formatter={compactChartValue} style={{ fontSize: 10, fill: paleta.textoDica, fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0">
            <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">
              Volume de OS por sede
            </h2>
            <div className="h-72 min-w-0 min-h-[18rem]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={osPorSede} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={paleta.grade} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: paleta.eixo }} dy={10} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: paleta.eixo }}
                    dx={-10}
                  />
                  <Tooltip
                    cursor={{ fill: paleta.cursor }}
                    contentStyle={{ backgroundColor: paleta.superficie, border: `1px solid ${paleta.borda}`, borderRadius: '2px', fontSize: '12px' }}
                    itemStyle={{ color: paleta.textoDica }}
                  />
                  <Legend wrapperStyle={{ paddingTop: '20px' }} formatter={valor => <span style={{ color: paleta.textoDica }}>{valor}</span>} />
                  <Bar dataKey="abertas" name="Em aberto" stackId="a" fill={paleta.serieC} barSize={40}>
                    <LabelList dataKey="abertas" position="center" formatter={compactChartValue} style={{ fontSize: 10, fill: paleta.textoDica, fontWeight: 600 }} />
                  </Bar>
                  {/* ⚠️ TRÊS SÉRIES, NÃO DUAS. A barra "Concluídas" somava as
                      encerradas COM as canceladas — obra cancelada aparecia como
                      entrega, e a legenda dizia o contrário do que a barra era. */}
                  <Bar dataKey="concluidas" name="Concluídas" stackId="a" fill={paleta.serieA} barSize={40}>
                    <LabelList dataKey="concluidas" position="center" formatter={compactChartValue} style={{ fontSize: 10, fill: paleta.superficie, fontWeight: 600 }} />
                  </Bar>
                  <Bar dataKey="canceladas" name="Canceladas" stackId="a" fill={paleta.grade} radius={[2, 2, 0, 0]} barSize={40}>
                    <LabelList dataKey="canceladas" position="center" formatter={compactChartValue} style={{ fontSize: 10, fill: paleta.textoDica, fontWeight: 600 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0">
            <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">
              Espera média na etapa atual
            </h2>
            <div className="h-72 min-w-0 min-h-[18rem]">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={esperaPorEtapa} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={paleta.grade} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: paleta.eixo }} />
                  <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: paleta.eixo }} width={130} />
                  <Tooltip
                    cursor={{ fill: paleta.cursor }}
                    contentStyle={{ backgroundColor: paleta.superficie, border: `1px solid ${paleta.borda}`, borderRadius: '2px', fontSize: '12px' }}
                    itemStyle={{ color: paleta.textoDica }}
                    formatter={(value: number) => [value == null ? 'sem OS na etapa' : `${value} dias`, 'Espera média']}
                  />
                  {/* Este gráfico já teve duas unidades — dias aqui, dinheiro na visão
                      financeira que saiu. Com uma só, o rótulo deixa de poder escrever
                      a espera média como "R$ 18,70". */}
                  <Bar dataKey="dias" fill={paleta.serieB} radius={[0, 2, 2, 0]} barSize={20}>
                    <LabelList
                      dataKey="dias"
                      position="right"
                      formatter={rotuloDeDias}
                      style={CHART_LABEL_STYLE}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

          <>
            <PainelDeCobranca inicio={periodRange.start} fim={periodRange.end} ticketIds={idsDoRecorte} />

            {/*
              A RÉGUA DA COORDENAÇÃO.
              ⚠️ Não mostra "% preenchido" e não chama buraco de pendência: 45% das OS
              pulam etapa, e um indicador de completude cobraria um processo que a
              operação não executa. Mostra o que o sistema REGISTROU e quanto tempo
              passou entre marcos vizinhos — só das OS que têm os dois.
            */}
            <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm mb-6">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-1">
                <h2 className="font-serif text-lg font-medium text-roman-text-main">A régua da coordenação</h2>
                <div className="text-xs text-roman-text-sub">
                  {regua.coorte === 0
                    ? 'Nenhuma OS concluída no período'
                    : `${regua.coorte} OS concluída(s) no período`}
                </div>
              </div>
              <p className="text-xs text-roman-text-sub mb-6 max-w-3xl">
                Marco em branco é informação, não pendência — 45% das OS pulam etapa. Aqui se lê o
                que o sistema <strong>registrou</strong> e quanto tempo levou entre um marco e o
                seguinte, contando só as OS que têm os dois.
              </p>

              {regua.coorte === 0 ? (
                <div className="border border-dashed border-roman-border rounded-sm p-6 bg-roman-bg text-sm text-roman-text-sub">
                  Sem OS concluída neste recorte, não há régua para ler. Numa OS ainda aberta, marco
                  vazio no fim não é falta de registro — é a verdade.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                    {regua.marcos.map(marco => (
                      <div key={marco.curto} className="border border-roman-border rounded-sm bg-roman-bg px-3 py-3">
                        <div className="text-[11px] font-serif uppercase tracking-widest text-roman-text-sub">
                          {marco.curto}
                        </div>
                        <div className="text-lg font-medium text-roman-text-main mt-1">
                          {Math.round((marco.registradas / regua.coorte) * 100)}%
                        </div>
                        {/* O denominador à vista: "45%" sozinho não deixa ninguém conferir. */}
                        <div className="text-[11px] text-roman-text-sub">
                          {marco.registradas} de {regua.coorte} · {marco.rotulo}
                        </div>
                      </div>
                    ))}
                  </div>

                  <h3 className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-3">
                    Tempo entre marcos vizinhos
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                    {regua.intervalos.map(intervalo => (
                      <div
                        key={`${intervalo.de}-${intervalo.para}`}
                        className="border border-roman-border rounded-sm bg-roman-bg px-3 py-3"
                      >
                        <div className="text-[11px] font-serif uppercase tracking-widest text-roman-text-sub">
                          {intervalo.de} → {intervalo.para}
                        </div>
                        <div className="text-lg font-medium text-roman-text-main mt-1">
                          {intervalo.medianaDias === null ? '—' : `${intervalo.medianaDias} dias`}
                        </div>
                        {/* Cada par tem a própria amostra, e ela muda muito entre eles:
                            sem o número ao lado, "12 dias" de uma OS parece regra. */}
                        <div className="text-[11px] text-roman-text-sub">
                          {intervalo.amostra === 0
                            ? 'Nenhuma OS com os dois marcos'
                            : `mediana de ${intervalo.amostra} OS`}
                        </div>
                        {intervalo.foraDeOrdem > 0 && (
                          <div className="text-[11px] text-roman-danger mt-1">
                            {intervalo.foraDeOrdem} com data invertida, fora da conta
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0">
                <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">Backlog por etapa</h2>
                <div className="h-72 min-w-0 min-h-[18rem]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={backlogPorEtapa} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={paleta.grade} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: paleta.eixo }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: paleta.eixo }} dx={-10} allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: paleta.cursor }}
                        contentStyle={{ backgroundColor: paleta.superficie, border: `1px solid ${paleta.borda}`, borderRadius: '2px', fontSize: '12px' }}
                        itemStyle={{ color: paleta.textoDica }}
                        formatter={(value: number) => [`${value}`, 'OS']}
                      />
                      <Bar dataKey="total" fill={paleta.serieB} radius={[2, 2, 0, 0]} barSize={36}>
                        <LabelList dataKey="total" position="top" formatter={compactChartValue} style={CHART_LABEL_STYLE} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0">
                <h2 className="font-serif text-lg font-medium text-roman-text-main">
                  Fluxo de demandas: o que entrou, o que saiu, o que sobrou
                </h2>
                {/* A frase que o gráfico existe para dizer. Quem só tem trinta segundos
                    lê esta linha e já sabe se a fila cresceu ou encolheu. */}
                <p className="text-sm text-roman-text-sub mt-1 mb-5">
                  No período: <strong className="text-roman-text-main">{resumoFluxo.abertas}</strong> abertas e{' '}
                  <strong className="text-roman-text-main">{resumoFluxo.saidas}</strong> encerradas — a fila foi de{' '}
                  <strong className="text-roman-text-main">{resumoFluxo.pendenciasInicio}</strong> para{' '}
                  <strong className="text-roman-text-main">{resumoFluxo.pendenciasFim}</strong>
                  {resumoFluxo.saldo === 0
                    ? ' (empate).'
                    : resumoFluxo.saldo > 0
                      ? ` (${resumoFluxo.saldo} a mais).`
                      : ` (${Math.abs(resumoFluxo.saldo)} a menos).`}
                  <span className="block text-xs text-roman-text-sub mt-1">
                    Acumulado desde a primeira OS, por {granularidadeFluxo === 'semana' ? 'semana' : 'mês'}: a altura
                    total é tudo que já foi aberto e a <strong className="font-medium">faixa dourada é a fila</strong>{' '}
                    — quando ela afina, a equipe está fechando mais do que entra. Não segue o filtro de etapa, porque
                    etapa é o estado de hoje e o gráfico é histórico.
                  </span>
                </p>
                <div className="h-72 min-w-0 min-h-[18rem]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    {/* Áreas EMPILHADAS, e a escolha não é estética: embaixo o que já
                        saiu, em cima o que continua na fila. O topo da pilha é, por
                        construção, tudo que já foi aberto — a identidade
                        `abertas − saídas = pendências` vale em todo balde e está
                        travada por teste. A faixa dourada É a fila; quando ela afina,
                        a equipe está ganhando da entrada. */}
                    <ComposedChart data={fluxoDemandas} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={paleta.grade} />
                      <XAxis dataKey="rotulo" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: paleta.eixo }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: paleta.eixo }} allowDecimals={false} />
                      <Tooltip
                        cursor={{ stroke: paleta.serieC, strokeWidth: 1 }}
                        contentStyle={{ backgroundColor: paleta.superficie, border: `1px solid ${paleta.borda}`, borderRadius: '2px', fontSize: '12px' }}
                        itemStyle={{ color: paleta.textoDica }}
                        labelFormatter={(rotulo: string) => {
                          const ponto = fluxoDemandas.find(item => item.rotulo === rotulo);
                          if (!ponto) return rotulo;
                          const dia = (data: Date) => data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                          const intervalo = granularidadeFluxo === 'semana' ? `${dia(ponto.inicio)} a ${dia(ponto.fim)}` : rotulo;
                          // O movimento da semana continua legível aqui: o acumulado
                          // mostra a tendência, mas a pergunta do diretor era "20 e 21".
                          // "saíram", e não "fechadas": o número é `saidas`, que soma encerradas E
                          // canceladas. Em produção são 3 canceladas dentro de 113 — pouco,
                          // mas o card de Volume logo acima separa as duas, e o painel não
                          // pode chamar de "fechada" o que ele mesmo chama de "cancelada".
                          return `${intervalo} · ${ponto.abertas} abertas, ${ponto.saidas} saíram`;
                        }}
                      />
                      <Legend wrapperStyle={{ paddingTop: '16px' }} formatter={valor => <span style={{ color: paleta.textoDica }}>{valor}</span>} />
                      <Area
                        type="monotone"
                        dataKey="saidasAcumuladas"
                        name="Já saíram da fila (acumulado)"
                        stackId="acumulado"
                        stroke={paleta.serieA}
                        strokeWidth={2}
                        fill={paleta.serieA}
                        fillOpacity={0.85}
                      />
                      <Area
                        type="monotone"
                        dataKey="pendencias"
                        name="Ainda na fila"
                        stackId="acumulado"
                        stroke={paleta.destaque}
                        strokeWidth={2}
                        fill={paleta.destaque}
                        fillOpacity={0.35}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/*
              O MESMO FLUXO, DISSECADO EM DUAS PERGUNTAS.
              O acumulado acima conta a história longa, mas esconde duas leituras
              dentro do próprio desenho: a fila é a ESPESSURA de uma faixa entre duas
              curvas que sobem, e o ritmo de cada semana é a INCLINAÇÃO dela. Espessura
              e inclinação se julgam mal a olho — tanto que o parágrafo precisa
              explicar as duas em prosa. Aqui elas viram altura, que se lê sozinha.

              ⚠️ Os três saem da MESMA série (`fluxoDemandas`) e da mesma identidade
              travada por teste. Não há conta nova: se discordarem, é bug, não
              interpretação.
            */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0">
                <h2 className="font-serif text-lg font-medium text-roman-text-main">A fila, sozinha</h2>
                <p className="text-xs text-roman-text-sub mt-1 mb-5">
                  A mesma faixa dourada do gráfico acima, medida a partir do zero. Lá ela é a
                  espessura entre duas curvas que sobem; aqui é altura — sobe quando entra mais do
                  que sai. Não segue o filtro de etapa, pelo mesmo motivo do gráfico acima.
                </p>
                <div className="h-64 min-w-0 min-h-[16rem]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <ComposedChart data={fluxoDemandas} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={paleta.grade} />
                      <XAxis dataKey="rotulo" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: paleta.eixo }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: paleta.eixo }} allowDecimals={false} />
                      <Tooltip
                        cursor={{ stroke: paleta.serieC, strokeWidth: 1 }}
                        contentStyle={{ backgroundColor: paleta.superficie, border: `1px solid ${paleta.borda}`, borderRadius: '2px', fontSize: '12px' }}
                        itemStyle={{ color: paleta.textoDica }}
                        formatter={(valor: number) => [`${valor} OS`, 'Na fila']}
                      />
                      <Area
                        type="monotone"
                        dataKey="pendencias"
                        name="Na fila"
                        stroke={paleta.destaque}
                        strokeWidth={2}
                        fill={paleta.destaque}
                        fillOpacity={0.2}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0">
                <h2 className="font-serif text-lg font-medium text-roman-text-main">
                  Ganhou ou perdeu {granularidadeFluxo === 'semana' ? 'a semana' : 'o mês'}
                </h2>
                <p className="text-xs text-roman-text-sub mt-1 mb-5">
                  Quanto entrou menos quanto saiu, período a período. Barra{' '}
                  <strong className="font-medium">para baixo</strong> é{' '}
                  {granularidadeFluxo === 'semana' ? 'semana' : 'mês'} em que a fila encolheu; para
                  cima, cresceu. Cancelada conta como saída — a soma destas barras é exatamente a
                  variação da linha ao lado.
                </p>
                <div className="h-64 min-w-0 min-h-[16rem]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={fluxoDemandas} margin={{ top: 20, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={paleta.grade} />
                      <XAxis dataKey="rotulo" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: paleta.eixo }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: paleta.eixo }} allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: paleta.cursor }}
                        contentStyle={{ backgroundColor: paleta.superficie, border: `1px solid ${paleta.borda}`, borderRadius: '2px', fontSize: '12px' }}
                        itemStyle={{ color: paleta.textoDica }}
                        labelFormatter={(rotulo: string) => {
                          const ponto = fluxoDemandas.find(item => item.rotulo === rotulo);
                          return ponto ? `${rotulo} · ${ponto.abertas} abertas, ${ponto.saidas} saíram` : rotulo;
                        }}
                        formatter={(valor: number) => [
                          valor === 0 ? 'empate' : valor > 0 ? `${valor} a mais na fila` : `${Math.abs(valor)} a menos`,
                          'Saldo',
                        ]}
                      />
                      {/* A linha do zero é o eixo da leitura: sem ela, "para cima" e
                          "para baixo" viram julgamento de posição, não de sinal. */}
                      <ReferenceLine y={0} stroke={paleta.eixo} strokeWidth={1} />
                      <Bar dataKey="saldo" name="Saldo" radius={[2, 2, 0, 0]} barSize={22}>
                        {fluxoDemandas.map(ponto => (
                          <Cell
                            key={ponto.chave}
                            fill={ponto.saldo > 0 ? paleta.destaque : paleta.serieA}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0">
                <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">Envelhecimento do backlog</h2>
                <div className="h-72 min-w-0 min-h-[18rem]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={agingBuckets} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={paleta.grade} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: paleta.eixo }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: paleta.eixo }} allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: paleta.cursor }}
                        contentStyle={{ backgroundColor: paleta.superficie, border: `1px solid ${paleta.borda}`, borderRadius: '2px', fontSize: '12px' }}
                        itemStyle={{ color: paleta.textoDica }}
                        formatter={(value: number) => [`${value}`, 'OS em aberto']}
                      />
                      <Bar dataKey="total" fill={paleta.serieB} radius={[2, 2, 0, 0]} barSize={28}>
                        <LabelList dataKey="total" position="top" formatter={compactChartValue} style={CHART_LABEL_STYLE} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0">
                <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">Backlog por equipe</h2>
                <div className="h-72 min-w-0 min-h-[18rem]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={backlogPorEquipe.itens} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={paleta.grade} />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: paleta.eixo }} allowDecimals={false} />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: paleta.eixo }} width={120} />
                      <Tooltip
                        cursor={{ fill: paleta.cursor }}
                        contentStyle={{ backgroundColor: paleta.superficie, border: `1px solid ${paleta.borda}`, borderRadius: '2px', fontSize: '12px' }}
                        itemStyle={{ color: paleta.textoDica }}
                        formatter={(value: number) => [`${value}`, 'OS em aberto']}
                      />
                      <Bar dataKey="total" fill={paleta.serieB} radius={[0, 2, 2, 0]} barSize={20}>
                        <LabelList dataKey="total" position="right" formatter={compactChartValue} style={CHART_LABEL_STYLE} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm min-w-0">
                <h2 className="font-serif text-lg font-medium text-roman-text-main mb-6">Distribuição por urgência</h2>
                <div className="h-72 min-w-0 min-h-[18rem]">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={distribuicaoUrgencia} margin={{ top: 20, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={paleta.grade} />
                      <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: paleta.eixo }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: paleta.eixo }} allowDecimals={false} />
                      <Tooltip
                        cursor={{ fill: paleta.cursor }}
                        contentStyle={{ backgroundColor: paleta.superficie, border: `1px solid ${paleta.borda}`, borderRadius: '2px', fontSize: '12px' }}
                        itemStyle={{ color: paleta.textoDica }}
                        formatter={(value: number) => [`${value}`, 'OS']}
                      />
                      <Bar dataKey="total" fill={paleta.serieA} radius={[2, 2, 0, 0]} barSize={28}>
                        <LabelList dataKey="total" position="top" formatter={compactChartValue} style={CHART_LABEL_STYLE} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4 mb-6">
                  <h2 className="font-serif text-lg font-medium text-roman-text-main">Alertas operacionais</h2>
                  <div className="text-xs text-roman-text-sub">Leitura rápida para acompanhamento gerencial</div>
                </div>
                <div className="space-y-3">
                  <div className="border border-roman-border rounded-sm bg-roman-bg px-4 py-3">
                    <div className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-1">OS mais antiga em aberto</div>
                    {esperaAberta ? (
                      <>
                        <div className="text-sm font-medium text-roman-text-main">{esperaAberta.id} · {esperaAberta.subject}</div>
                        <div className="text-xs text-roman-text-sub">{esperaAberta.dias} dia(s) em aberto</div>
                      </>
                    ) : (
                      <div className="text-sm text-roman-text-sub">Nenhuma OS aberta no recorte atual.</div>
                    )}
                  </div>
                  <div className="border border-roman-border rounded-sm bg-roman-bg px-4 py-3">
                    <div className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-1">Triagem e orçamento</div>
                    <div className="text-sm font-medium text-roman-text-main">
                      {filteredTickets.filter(ticket =>
                        ticket.status === TICKET_STATUS.NEW ||
                        ticket.status === TICKET_STATUS.WAITING_TECH_OPINION ||
                        ticket.status === TICKET_STATUS.WAITING_BUDGET ||
                        ticket.status === TICKET_STATUS.WAITING_BUDGET_APPROVAL
                      ).length} OS aguardando decisão operacional
                    </div>
                  </div>
                  <div className="border border-roman-border rounded-sm bg-roman-bg px-4 py-3">
                    <div className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-1">Pagamento e garantia</div>
                    <div className="text-sm font-medium text-roman-text-main">
                      {pendingPaymentsCount} OS aguardando pagamento · {ticketsInGuaranteeCount} em garantia
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-roman-surface border border-roman-border rounded-sm p-6 shadow-sm">
                <div className="flex items-center justify-between gap-4 mb-6">
                  <h2 className="font-serif text-lg font-medium text-roman-text-main">Resumo operacional por foco</h2>
                  <div className="text-xs text-roman-text-sub">Onde concentrar a gestão agora</div>
                </div>
                <div className="space-y-3">
                  <div className="border border-roman-border rounded-sm bg-roman-bg px-4 py-3">
                    <div className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-1">Validação do solicitante</div>
                    <div className="text-sm font-medium text-roman-text-main">{waitingValidationCount} OS aguardando retorno final</div>
                  </div>
                  <div className="border border-roman-border rounded-sm bg-roman-bg px-4 py-3">
                    <div className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-1">Pressão de urgência</div>
                    <div className="text-sm font-medium text-roman-text-main">{urgentOpenCount} OS com prioridade alta ou urgente em aberto</div>
                  </div>
                  <div className="border border-roman-border rounded-sm bg-roman-bg px-4 py-3">
                    <div className="text-xs font-serif uppercase tracking-widest text-roman-text-sub mb-1">Capacidade por equipe</div>
                    <div className="text-sm font-medium text-roman-text-main">
                      {backlogPorEquipe[0] ? `${backlogPorEquipe[0].name} concentra ${backlogPorEquipe[0].total} OS` : 'Nenhuma equipe com fila ativa'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>

      </div>
    </div>
  );
}



