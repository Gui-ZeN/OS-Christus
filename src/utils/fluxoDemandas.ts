import type { Ticket } from '../types';

/**
 * FLUXO DE DEMANDAS — quantas entraram, quantas saíram, quantas sobraram.
 *
 * Pedido do diretor, na formulação dele: *"na semana passada foram abertas 20 e
 * fechadas 21; tínhamos 200 e agora 199"*. São duas perguntas diferentes na mesma
 * tela, e confundi-las é o erro clássico deste gráfico:
 *
 * - ENTRADAS e SAÍDAS são fluxo — acontecem DENTRO da semana.
 * - PENDÊNCIAS é estoque — é o que existe NO FIM da semana, e carrega tudo o que
 *   veio antes, inclusive de antes do período que está na tela.
 *
 * Por isso o estoque é calculado sobre a base INTEIRA e só depois recortado para a
 * janela exibida. Calcular sobre as OS da janela faria a linha começar em zero toda
 * vez que alguém filtrasse "último mês" — e um gráfico de pendências que começa em
 * zero não está mostrando pendência nenhuma, está mostrando o filtro.
 */

export type Granularidade = 'semana' | 'mes';

export interface PontoDeFluxo {
  /** Chave estável do balde (ordenável): `2026-W33` ou `2026-08`. */
  chave: string;
  /** Rótulo curto para o eixo: `11/08` ou `ago/26`. */
  rotulo: string;
  /** Primeiro instante do balde — o tooltip usa para escrever o intervalo. */
  inicio: Date;
  /** Último instante do balde. */
  fim: Date;
  abertas: number;
  encerradas: number;
  canceladas: number;
  /** Encerradas + canceladas: as duas saem da fila. */
  saidas: number;
  /** Estoque no FIM do balde. */
  pendencias: number;
}

const DIA = 86_400_000;

function paraData(valor: Date | string | null | undefined): Date | null {
  if (!valor) return null;
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

/** Segunda-feira 00:00 da semana de `data`. Semana começa na segunda (pt-BR). */
export function inicioDaSemana(data: Date): Date {
  const inicio = new Date(data.getFullYear(), data.getMonth(), data.getDate());
  const diaDaSemana = (inicio.getDay() + 6) % 7; // domingo (0) vira 6
  inicio.setDate(inicio.getDate() - diaDaSemana);
  return inicio;
}

function inicioDoMes(data: Date): Date {
  return new Date(data.getFullYear(), data.getMonth(), 1);
}

function proximoBalde(inicio: Date, granularidade: Granularidade): Date {
  if (granularidade === 'semana') return new Date(inicio.getTime() + 7 * DIA);
  return new Date(inicio.getFullYear(), inicio.getMonth() + 1, 1);
}

function chaveDoBalde(inicio: Date, granularidade: Granularidade): string {
  if (granularidade === 'mes') {
    return `${inicio.getFullYear()}-${String(inicio.getMonth() + 1).padStart(2, '0')}`;
  }
  // Semana ISO só para ter chave estável; o rótulo mostrado é a data, que é o que
  // uma pessoa reconhece — ninguém pensa "semana 33".
  const quinta = new Date(inicio.getTime() + 3 * DIA);
  const primeiroDia = new Date(quinta.getFullYear(), 0, 1);
  const semana = Math.ceil(((quinta.getTime() - primeiroDia.getTime()) / DIA + 1) / 7);
  return `${quinta.getFullYear()}-W${String(semana).padStart(2, '0')}`;
}

function rotuloDoBalde(inicio: Date, granularidade: Granularidade): string {
  if (granularidade === 'mes') {
    return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' })
      .format(inicio)
      .replace('.', '');
  }
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(inicio);
}

/**
 * Escolhe o balde pelo tamanho da janela. Semana é o que o diretor usou como
 * exemplo e é o que a operação sente; acima de uns quatro meses ela vira serrilha
 * ilegível e o mês passa a dizer mais.
 */
export function granularidadeSugerida(inicio: Date, fim: Date): Granularidade {
  const dias = (fim.getTime() - inicio.getTime()) / DIA;
  return dias > 130 ? 'mes' : 'semana';
}

export function serieDeFluxo(
  entrada: Ticket[],
  opcoes: { inicio: Date; fim: Date; granularidade?: Granularidade }
): PontoDeFluxo[] {
  // OS de teste sai INTEIRA da conta — abertura junto com a saída. Ela nunca foi
  // trabalho; contá-la na fila e depois tirá-la desenharia um pico e uma queda que
  // não aconteceram. A regra mora aqui, e não em quem chama, para que a tela e o PDF
  // não possam divergir sobre o que conta.
  const tickets = entrada.filter(ticket => !ticket.excludedFromMetrics);
  const granularidade = opcoes.granularidade || granularidadeSugerida(opcoes.inicio, opcoes.fim);
  const alinhar = granularidade === 'semana' ? inicioDaSemana : inicioDoMes;

  const baldes: PontoDeFluxo[] = [];
  let cursor = alinhar(opcoes.inicio);
  const limite = opcoes.fim.getTime();

  // Teto de segurança: uma janela absurda (data digitada errada no filtro
  // personalizado) não pode travar a aba montando milhares de baldes.
  while (cursor.getTime() <= limite && baldes.length < 400) {
    const proximo = proximoBalde(cursor, granularidade);
    baldes.push({
      chave: chaveDoBalde(cursor, granularidade),
      rotulo: rotuloDoBalde(cursor, granularidade),
      inicio: cursor,
      fim: new Date(proximo.getTime() - 1),
      abertas: 0,
      encerradas: 0,
      canceladas: 0,
      saidas: 0,
      pendencias: 0,
    });
    cursor = proximo;
  }

  if (!baldes.length) return [];

  const indicePorChave = new Map(baldes.map((balde, indice) => [balde.chave, indice]));
  const acharBalde = (data: Date) => indicePorChave.get(chaveDoBalde(alinhar(data), granularidade));

  // Fluxo: só conta o que caiu DENTRO da janela.
  for (const ticket of tickets) {
    const aberta = paraData(ticket.time);
    if (aberta) {
      const indice = acharBalde(aberta);
      if (indice !== undefined) baldes[indice].abertas += 1;
    }

    const fechada = paraData(ticket.closedAt);
    if (fechada) {
      const indice = acharBalde(fechada);
      if (indice !== undefined) {
        if (ticket.status === 'Cancelada') baldes[indice].canceladas += 1;
        else baldes[indice].encerradas += 1;
        baldes[indice].saidas += 1;
      }
    }
  }

  // Estoque: conta sobre a base INTEIRA, contra o fim de cada balde. É a diferença
  // entre "o que aconteceu nesta semana" e "o que existe no fim dela".
  for (const balde of baldes) {
    const corte = balde.fim.getTime();
    let vivas = 0;
    for (const ticket of tickets) {
      const aberta = paraData(ticket.time);
      if (!aberta || aberta.getTime() > corte) continue;
      const fechada = paraData(ticket.closedAt);
      if (fechada && fechada.getTime() <= corte) continue;
      vivas += 1;
    }
    balde.pendencias = vivas;
  }

  return baldes;
}

/**
 * O quanto a fila cresceu ou encolheu na janela. É a frase que o diretor quer ler
 * sem precisar interpretar o gráfico: *"tínhamos 200, agora 199"*.
 */
export function resumoDoFluxo(serie: PontoDeFluxo[]) {
  if (!serie.length) {
    return { abertas: 0, saidas: 0, saldo: 0, pendenciasInicio: 0, pendenciasFim: 0 };
  }
  const abertas = serie.reduce((soma, ponto) => soma + ponto.abertas, 0);
  const saidas = serie.reduce((soma, ponto) => soma + ponto.saidas, 0);
  // O estoque de partida é o do fim do primeiro balde MENOS o que se moveu nele —
  // senão o "antes" já viria com a primeira semana embutida.
  const primeiro = serie[0];
  const pendenciasInicio = primeiro.pendencias - primeiro.abertas + primeiro.saidas;
  const pendenciasFim = serie[serie.length - 1].pendencias;
  return { abertas, saidas, saldo: abertas - saidas, pendenciasInicio, pendenciasFim };
}
