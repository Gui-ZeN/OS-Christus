import type { ContractRecord, PaymentRecord, Ticket } from '../../types';
import { TICKET_STATUS } from '../../constants/ticketStatus';
import { isTicketOpen } from '../../constants/ticketLifecycle';
// `parseCurrencyOrNull` mora no módulo compartilhado com o servidor. `src/utils/
// currency.ts` só reexporta a versão que já converte ausência em zero — que é
// exatamente o atalho que este arquivo não pode tomar.
import { parseCurrencyOrNull } from '../../../api/_lib/currency.js';
import { repairMojibake } from '../../utils/text';
import { coerceDate } from '../../utils/date';
import { ETAPA, ORDEM_DAS_ETAPAS, etapaDe } from '../../../api/_lib/etapas.js';

/**
 * AS CONTAS DA TELA DE INDICADORES — puras, fora do React, testáveis.
 *
 * ⚠️ POR QUE ESTE ARQUIVO EXISTE. Os ~25 cálculos do painel viviam como `useMemo`
 * no meio de 1700 linhas de JSX, sem um teste sequer. Uma auditoria de 31/08 achou
 * 38 defeitos, e a correlação foi perfeita: os três módulos do painel que JÁ tinham
 * teste (`fluxoDemandas`, `metricasDeCobranca`, `currency`) passaram limpos, e todo
 * achado grave estava aqui dentro. Não era falta de cuidado — era falta de lugar
 * onde o cuidado pudesse ser verificado.
 *
 * As funções recebem listas e devolvem dados. Nenhuma lê contexto, nenhuma formata
 * para a tela: quem desenha decide como mostrar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AS QUATRO DECISÕES QUE ATRAVESSAM O ARQUIVO INTEIRO
 *
 * 1. FILA E FLUXO SÃO BASES DIFERENTES, e confundir as duas foi a origem de metade
 *    dos defeitos. "Quantas OS abriram em março" é fluxo — recorta por data. "Quantas
 *    estão paradas agora" é fila — NÃO recorta, porque a OS de janeiro ainda parada
 *    é justamente a que importa. O gráfico de fluxo já tinha resolvido isso e
 *    documentado o porquê; aqui a mesma regra vale para todos.
 *
 * 2. "NÃO SEI" NÃO É ZERO. Média de lista vazia é `null`, não `0`; maior obra sem
 *    contrato é `null`, não `R$ 0`; espera sem OS aberta é `null`, não `0 dia`. Quem
 *    desenha traduz `null` para "—". O painel de cobrança já fazia assim e foi o
 *    único bloco que passou na auditoria sem achado.
 *
 * 3. UMA FÓRMULA POR PERGUNTA. "Quanto vale esta OS" tinha três respostas diferentes
 *    em cards vizinhos. Agora tem uma (`valorDaOs`), e ela prefere os lançamentos ao
 *    contrato porque é o lançamento que acompanha aditivo.
 *
 * 4. LISTA CORTADA DIZ QUANTO CORTOU. Top-8 é decisão de desenho; contar `.length`
 *    de uma lista já cortada e chamar de "quantas equipes têm fila" é outra coisa.
 */

/** Quantas entradas o gráfico mostra antes de virar ruído. */
export const TETO_DO_RANKING = 8;

export type Fatia = { name: string; total: number };
export type ListaComTeto<T> = { itens: T[]; total: number; ocultos: number };

/**
 * Corta para o gráfico E devolve quantos ficaram de fora.
 *
 * ⚠️ O `.length` DA LISTA CORTADA NÃO É A CONTAGEM. O card "Concentração de fila"
 * mostrava `backlogPorEquipe.length` depois de um `.slice(0, 8)` — com 15 equipes
 * em fila, ele afirmava "8". O número da tela e o do gráfico têm que sair da mesma
 * função, e quem corta é quem sabe quanto sobrou.
 */
export function comTeto<T>(itens: T[], teto = TETO_DO_RANKING): ListaComTeto<T> {
  return { itens: itens.slice(0, teto), total: itens.length, ocultos: Math.max(0, itens.length - teto) };
}

/** Média que devolve `null` quando não há amostra — ver decisão 2 no topo. */
export function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((soma, valor) => soma + valor, 0) / valores.length;
}

export function diasEntre(inicio: Date, fim: Date) {
  return Math.max(0, (fim.getTime() - inicio.getTime()) / 86_400_000);
}

/** Equipe normalizada. Sem isto, "Manutenção" e "ManutenÃ§Ã£o" viram duas barras. */
export function equipeDoTicket(ticket: Ticket) {
  return repairMojibake(ticket.assignedTeam || '') || 'Não atribuído';
}

// ── FILA ─────────────────────────────────────────────────────────────────────

/**
 * Quantas OS em cada etapa, hoje.
 *
 * ⚠️ USA `etapaDe`, e não uma lista de status escrita à mão. A tela agrupava os 13
 * status de QUATRO maneiras diferentes, e duas delas usavam a palavra "Triagem" com
 * significados distintos — dois gráficos lado a lado, o mesmo nome, contas
 * diferentes. `api/_lib/etapas.js` é a fonte única declarada do projeto.
 */
export function backlogPorEtapa(ticketsDaFila: Ticket[]): Fatia[] {
  const contagem = new Map<string, number>();
  for (const ticket of ticketsDaFila) {
    if (!isTicketOpen(ticket.status)) continue;
    const etapa = etapaDe(String(ticket.status)) || 'Sem etapa';
    contagem.set(etapa, (contagem.get(etapa) || 0) + 1);
  }
  // Ordem do fluxo, não do tamanho: quem lê procura onde a OS está, e uma barra que
  // troca de lugar a cada carga impede comparar duas leituras da mesma tela.
  const ordenadas = (ORDEM_DAS_ETAPAS as string[]).filter(etapa => contagem.has(etapa));
  const fora = [...contagem.keys()].filter(etapa => !ordenadas.includes(etapa)).sort();
  return [...ordenadas, ...fora].map(name => ({ name, total: contagem.get(name) || 0 }));
}

export type EsperaNaEtapa = { name: string; dias: number | null; osNaEtapa: number };

/**
 * Há quanto tempo, em média, as OS estão paradas na etapa em que estão AGORA.
 *
 * ⚠️ ISTO NÃO É "DURAÇÃO DA ETAPA", e o gráfico se chamava assim. A conta olha só
 * quem AINDA está na etapa: a OS que passou por orçamento em dois dias e já saiu não
 * entra na média de orçamento. Sobram as lentas — a média é inflada por construção e
 * nunca pode cair, só subir enquanto as paradas envelhecem.
 *
 * ⚠️ E NÃO DÁ PARA CORRIGIR COM `marcos`. A régua da coordenação registra a entrada
 * em cada etapa, mas o próprio projeto mediu que 45% das OS pulam etapa e que 45%
 * das concluídas nunca registraram início de execução. Reconstruir duração real a
 * partir disso seria inventar precisão que o dado não tem.
 *
 * Então a conta ficou, com o nome certo: "espera na etapa atual" é uma medida de
 * fila legítima e é o que sempre foi calculado. `osNaEtapa` acompanha para uma etapa
 * vazia poder dizer "sem OS" em vez de "0 dias" — que se lia como instantâneo.
 */
export function esperaNaEtapaAtual(ticketsDaFila: Ticket[], agora = new Date()): EsperaNaEtapa[] {
  const porEtapa = new Map<string, number[]>();
  for (const ticket of ticketsDaFila) {
    if (!isTicketOpen(ticket.status)) continue;
    const etapa = etapaDe(String(ticket.status)) || 'Sem etapa';
    const dias = diasEntre(coerceDate(ticket.stageEnteredAt, ticket.time), agora);
    porEtapa.set(etapa, [...(porEtapa.get(etapa) || []), dias]);
  }
  const ordenadas = (ORDEM_DAS_ETAPAS as string[]).filter(
    etapa => etapa !== ETAPA.CONCLUIDA && etapa !== ETAPA.CANCELADA
  );
  return ordenadas.map(name => {
    const amostra = porEtapa.get(name) || [];
    const bruta = media(amostra);
    return { name, dias: bruta === null ? null : Number(bruta.toFixed(1)), osNaEtapa: amostra.length };
  });
}

export const FAIXAS_DE_IDADE = [
  { name: '0-7 dias', min: 0, max: 7 },
  { name: '8-15 dias', min: 8, max: 15 },
  { name: '16-30 dias', min: 16, max: 30 },
  { name: '31-60 dias', min: 31, max: 60 },
  { name: '60+ dias', min: 61, max: Number.POSITIVE_INFINITY },
];

/**
 * Há quanto tempo as OS abertas estão abertas.
 *
 * ⚠️ RECEBE A BASE SEM RECORTE DE DATA, e isso é o conserto. Antes a lista já vinha
 * cortada pelo período: no padrão "Últimos 30 dias", toda OS da lista tinha no
 * máximo 29 dias de idade, então as faixas "31-60" e "60+" eram ESTRUTURALMENTE
 * zero. O gráfico provava que nada envelhece porque já tinha jogado fora tudo que
 * envelheceu — uma tautologia do próprio filtro.
 */
export function envelhecimentoDaFila(ticketsDaFila: Ticket[], agora = new Date()): Fatia[] {
  return FAIXAS_DE_IDADE.map(faixa => ({
    name: faixa.name,
    total: ticketsDaFila.filter(ticket => {
      if (!isTicketOpen(ticket.status)) return false;
      const idade = Math.floor(diasEntre(ticket.time, agora));
      return idade >= faixa.min && idade <= faixa.max;
    }).length,
  }));
}

/** Fila por equipe. Normaliza o nome (ver `equipeDoTicket`) e diz quanto cortou. */
export function backlogPorEquipe(ticketsDaFila: Ticket[]): ListaComTeto<Fatia> {
  const contagem = new Map<string, number>();
  for (const ticket of ticketsDaFila) {
    if (!isTicketOpen(ticket.status)) continue;
    const equipe = equipeDoTicket(ticket);
    contagem.set(equipe, (contagem.get(equipe) || 0) + 1);
  }
  const lista = [...contagem.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'));
  return comTeto(lista);
}

/**
 * Distribuição por urgência das OS EM ABERTO.
 *
 * ⚠️ ANTES CONTAVA TUDO, inclusive encerradas e canceladas — e ficava ao lado de dois
 * gráficos de fila, com o mesmo formato. "Prioridade dominante" ao lado de "risco em
 * aberto" se lê como "das que estão abertas". Agora é.
 */
export function urgenciaDaFila(ticketsDaFila: Ticket[]): Fatia[] {
  const contagem = new Map<string, number>();
  for (const ticket of ticketsDaFila) {
    if (!isTicketOpen(ticket.status)) continue;
    const prioridade = ticket.priority || 'Não definida';
    contagem.set(prioridade, (contagem.get(prioridade) || 0) + 1);
  }
  return [...contagem.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'));
}

export type EsperaMaisLonga = { id: string; subject: string; dias: number } | null;

/**
 * A OS aberta há mais tempo. `null` quando não há nenhuma aberta.
 *
 * ⚠️ O CARD MOSTRAVA "0 dia" NESSE CASO — e "0 dia" se lê como "nada esperando",
 * quando significa "não há OS aberta no recorte". O PDF gerencial já mandava `null`
 * aqui; a tela e o relatório impresso discordavam sobre o mesmo número.
 */
export function esperaMaisLonga(ticketsDaFila: Ticket[], agora = new Date()): EsperaMaisLonga {
  const abertas = ticketsDaFila.filter(ticket => isTicketOpen(ticket.status));
  const maisAntiga = [...abertas].sort((a, b) => a.time.getTime() - b.time.getTime())[0];
  if (!maisAntiga) return null;
  return {
    id: maisAntiga.id,
    subject: maisAntiga.subject,
    dias: Math.floor(diasEntre(maisAntiga.time, agora)),
  };
}

// ── FLUXO ────────────────────────────────────────────────────────────────────

export type VolumeDoPeriodo = { total: number; concluidas: number; canceladas: number; emCurso: number };

/**
 * O que aconteceu no período. Aqui a data faz sentido: é fluxo, não fila.
 *
 * ⚠️ `canceladas` PASSOU A SER VISÍVEL. O card mostrava total, "em curso" e
 * "concluídas" — a diferença eram as canceladas, sem rótulo. Quem somava as três
 * não fechava e não sabia por quê. O PDF já trazia o campo; a tela, não.
 */
export function volumeDoPeriodo(ticketsDoPeriodo: Ticket[]): VolumeDoPeriodo {
  let concluidas = 0;
  let canceladas = 0;
  let emCurso = 0;
  for (const ticket of ticketsDoPeriodo) {
    if (ticket.status === TICKET_STATUS.CLOSED) concluidas += 1;
    else if (ticket.status === TICKET_STATUS.CANCELED) canceladas += 1;
    else if (isTicketOpen(ticket.status)) emCurso += 1;
  }
  return { total: ticketsDoPeriodo.length, concluidas, canceladas, emCurso };
}

export type VolumePorSede = { name: string; abertas: number; concluidas: number; canceladas: number };

/**
 * Volume por sede.
 *
 * ⚠️ "CONCLUÍDAS" DEIXOU DE INCLUIR CANCELADA. A série somava as duas e a legenda
 * dizia "Concluídas" — obra cancelada aparecia como entrega. Agora são três séries,
 * e o rótulo diz o que a barra é.
 */
export function volumePorSede(
  ticketsDoPeriodo: Ticket[],
  rotuloDaSede: (ticket: Ticket) => string
): VolumePorSede[] {
  const grupos = new Map<string, VolumePorSede>();
  for (const ticket of ticketsDoPeriodo) {
    const name = rotuloDaSede(ticket);
    if (!grupos.has(name)) grupos.set(name, { name, abertas: 0, concluidas: 0, canceladas: 0 });
    const atual = grupos.get(name)!;
    if (isTicketOpen(ticket.status)) atual.abertas += 1;
    else if (ticket.status === TICKET_STATUS.CANCELED) atual.canceladas += 1;
    else atual.concluidas += 1;
  }
  return [...grupos.values()].sort(
    (a, b) => b.abertas + b.concluidas + b.canceladas - (a.abertas + a.concluidas + a.canceladas)
  );
}

// ── DINHEIRO ─────────────────────────────────────────────────────────────────

export type ValorDaOs = {
  ticket: Ticket;
  contratado: number | null;
  previsto: number | null;
  pago: number;
  saldo: number;
};

/**
 * O dinheiro de cada OS — UMA fórmula, usada por todos os cards de dinheiro.
 *
 * ⚠️ HAVIA TRÊS. `value` preferia o contrato e caía para os lançamentos; `previsto`
 * fazia o contrário; o ranking de fornecedor usava só o contrato. Com um aditivo
 * lançado, "Custo total por sede" e "Previsto x pago por sede" mostravam números
 * diferentes para a mesma sede, no mesmo scroll.
 *
 * A escolhida é a dos LANÇAMENTOS primeiro: é o lançamento que acompanha aditivo,
 * medição e parcela. O contrato é o valor de quando se assinou.
 *
 * ⚠️ OS CANCELADA NÃO ENTRA. Uma obra cancelada com contrato assinado somava valor
 * cheio em "Compromisso previsto", "Base contratada" e "Custo por sede" — trabalho
 * que não houve, contado como compromisso.
 *
 * ⚠️ `null` É "NÃO INFORMADO", não zero. `parseCurrencyOrNull` existe exatamente para
 * isso, e a tela inteira usava o atalho que converte ausência em `0`.
 */
export function valorDaOs(
  tickets: Ticket[],
  contratoPorTicket: Record<string, ContractRecord | undefined>,
  pagamentosPorTicket: Record<string, PaymentRecord[] | undefined>
): ValorDaOs[] {
  return tickets
    .filter(ticket => ticket.status !== TICKET_STATUS.CANCELED)
    .map(ticket => {
      const contrato = contratoPorTicket[ticket.id];
      const pagamentos = pagamentosPorTicket[ticket.id] || [];

      const contratado = parseCurrencyOrNull(contrato?.value || '');
      const somaDosLancamentos = pagamentos.reduce<number | null>((soma, pagamento) => {
        const valor = parseCurrencyOrNull(pagamento.value);
        if (valor === null) return soma;
        return (soma || 0) + valor;
      }, null);
      const pago = pagamentos
        .filter(pagamento => pagamento.status === 'paid')
        .reduce((soma, pagamento) => soma + (parseCurrencyOrNull(pagamento.value) || 0), 0);

      const previsto = somaDosLancamentos !== null && somaDosLancamentos > 0 ? somaDosLancamentos : contratado;

      return { ticket, contratado, previsto, pago, saldo: (previsto || 0) - pago };
    });
}

export type ResumoFinanceiro = { contratado: number; previsto: number; pago: number; saldo: number };

/**
 * Os totais do painel financeiro.
 *
 * ⚠️ O `Math.max(0, …)` SAIU, e o motivo não é o que parecia. A suspeita da auditoria
 * era que ele escondia OS paga a maior; ao escrever o teste, não deu para construir
 * esse caso — o pago é subconjunto dos lançamentos, então o saldo já é não-negativo
 * por construção e o clamp nunca disparava.
 *
 * O defeito real era outro e continua consertado: o clamp era aplicado em NÍVEIS
 * diferentes — global no card, por OS no gráfico ao lado — e bastava isso para o
 * card e a soma das barras poderem discordar. Agora as duas somas saem da mesma
 * subtração, e um estorno lançado como valor negativo apareceria em vez de sumir.
 */
export function resumoFinanceiro(valores: ValorDaOs[]): ResumoFinanceiro {
  return valores.reduce(
    (acc, entrada) => {
      acc.contratado += entrada.contratado || 0;
      acc.previsto += entrada.previsto || 0;
      acc.pago += entrada.pago;
      acc.saldo += entrada.saldo;
      return acc;
    },
    { contratado: 0, previsto: 0, pago: 0, saldo: 0 }
  );
}

export type MaiorObra = { id: string; subject: string; valor: number; sede: string } | null;

/**
 * A obra de maior valor do recorte. `null` quando nenhuma tem valor.
 *
 * ⚠️ A TRAVA SÓ OLHAVA LISTA VAZIA. Com 40 OS e nenhuma com contrato ou lançamento,
 * todos os valores empatavam em zero, a primeira do sort vencia, e o card anunciava
 * "R$ 0 — Lâmpada queimada na recepção" com selo vermelho de urgência.
 */
export function maiorObra(
  valores: ValorDaOs[],
  rotuloDaSede: (ticket: Ticket) => string
): MaiorObra {
  const maior = [...valores].sort((a, b) => (b.previsto || 0) - (a.previsto || 0))[0];
  if (!maior || !maior.previsto || maior.previsto <= 0) return null;
  return {
    id: maior.ticket.id,
    subject: maior.ticket.subject,
    valor: maior.previsto,
    sede: rotuloDaSede(maior.ticket),
  };
}

export type Fornecedor = { name: string; contratos: number; previsto: number; pago: number; saldo: number };

/** Agrupa o dinheiro por fornecedor. Uma passada; o ranking decide o corte depois. */
export function porFornecedor(
  valores: ValorDaOs[],
  contratoPorTicket: Record<string, ContractRecord | undefined>
): Fornecedor[] {
  const grupos = new Map<string, Fornecedor>();
  for (const entrada of valores) {
    const contrato = contratoPorTicket[entrada.ticket.id];
    const name = contrato?.vendor || 'Fornecedor não informado';
    if (!grupos.has(name)) grupos.set(name, { name, contratos: 0, previsto: 0, pago: 0, saldo: 0 });
    const atual = grupos.get(name)!;
    if (contrato) atual.contratos += 1;
    atual.previsto += entrada.previsto || 0;
    atual.pago += entrada.pago;
    atual.saldo += entrada.saldo;
  }
  return [...grupos.values()];
}

/**
 * Quem tem saldo em aberto — só quem tem.
 *
 * ⚠️ O CARD "Fornecedores com saldo" CONTAVA FORNECEDOR SEM SALDO, e ainda por cima
 * o `.length` de uma lista cortada em 8. Contava errado duas vezes na mesma linha.
 */
export function fornecedoresComSaldo(fornecedores: Fornecedor[]): ListaComTeto<Fornecedor> {
  const comSaldo = fornecedores
    .filter(fornecedor => fornecedor.saldo > 0)
    .sort((a, b) => b.saldo - a.saldo || a.name.localeCompare(b.name, 'pt-BR'));
  return comTeto(comSaldo);
}

/**
 * O fornecedor mais ACIONADO — por número de contratos.
 *
 * ⚠️ O CARD DIZIA "mais acionado" E ORDENAVA POR VALOR. Um fornecedor com um
 * contrato de R$ 500 mil ganhava de outro com quarenta de R$ 1 mil. São duas
 * perguntas diferentes e o card respondia a que não perguntou.
 */
export function fornecedorMaisAcionado(fornecedores: Fornecedor[]): Fornecedor | null {
  const comContrato = fornecedores.filter(fornecedor => fornecedor.contratos > 0);
  if (comContrato.length === 0) return null;
  return [...comContrato].sort(
    (a, b) => b.contratos - a.contratos || b.previsto - a.previsto || a.name.localeCompare(b.name, 'pt-BR')
  )[0];
}

export type CustoAgrupado = { name: string; custo: number; osComValor: number; osSemValor: number };

/**
 * Custo por chave (sede, serviço…), declarando quantas OS não têm valor lançado.
 *
 * ⚠️ "SEM VALOR" NÃO É "R$ 0". Um agrupamento onde metade das OS não tem lançamento
 * mostra um custo que parece completo e não é. `osSemValor` existe para a tela poder
 * dizer isso em vez de deixar quem lê concluir que a sede é barata.
 */
export function custoPor(
  valores: ValorDaOs[],
  chave: (ticket: Ticket) => string
): CustoAgrupado[] {
  const grupos = new Map<string, CustoAgrupado>();
  for (const entrada of valores) {
    const name = chave(entrada.ticket);
    if (!grupos.has(name)) grupos.set(name, { name, custo: 0, osComValor: 0, osSemValor: 0 });
    const atual = grupos.get(name)!;
    if (entrada.previsto && entrada.previsto > 0) {
      atual.custo += entrada.previsto;
      atual.osComValor += 1;
    } else {
      atual.osSemValor += 1;
    }
  }
  return [...grupos.values()].sort((a, b) => b.custo - a.custo || a.name.localeCompare(b.name, 'pt-BR'));
}
