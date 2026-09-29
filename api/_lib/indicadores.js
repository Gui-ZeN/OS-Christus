/**
 * AS CONTAS DOS INDICADORES QUE O SERVIDOR TAMBÉM FAZ.
 *
 * Moravam só em `src/views/kpi/calculos.ts`, que as reexporta daqui. Vieram para cá
 * quando o Resumo Executivo do Chromos (`api/_lib/resumoExecutivo.js`) passou a
 * precisar dos mesmos números: duas cópias de "quanto tempo levou para resolver"
 * divergem na primeira correção, e aí a tela e o Chromos contam coisas diferentes
 * com o mesmo nome. O porquê de cada regra continua documentado em `calculos.ts`.
 */

import { TICKET_STATUS, isTicketOpen } from './statusFlow.js';

export function diasEntre(inicio, fim) {
  return Math.max(0, (fim.getTime() - inicio.getTime()) / 86_400_000);
}

/** Mediana; `null` sem amostra. Quantidade par: média dos dois centrais. */
export function mediana(valores) {
  if (valores.length === 0) return null;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = ordenados.length / 2;
  return ordenados.length % 2
    ? ordenados[(ordenados.length - 1) / 2]
    : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

/** `closedAt` como `Date`, venha como `Date` ou como texto. */
function dataDeFechamento(ticket) {
  const bruto = ticket.closedAt;
  if (!bruto) return null;
  const data = bruto instanceof Date ? bruto : new Date(bruto);
  return Number.isNaN(data.getTime()) ? null : data;
}

/** Sobre as OS FECHADAS no período (não as abertas nele). */
export function tempoDeResolucao(ticketsFechadosNoPeriodo) {
  const duracoes = ticketsFechadosNoPeriodo
    .map(ticket => {
      const fim = dataDeFechamento(ticket);
      if (!fim || !(ticket.time instanceof Date)) return null;
      return diasEntre(ticket.time, fim);
    })
    .filter(dias => dias !== null);

  const meio = mediana(duracoes);
  return {
    mediana: meio === null ? null : Math.round(meio),
    maisLento: duracoes.length ? Math.round(Math.max(...duracoes)) : null,
    amostra: duracoes.length,
  };
}

/**
 * As OS com `closedAt` dentro de [inicio, fim] — a base do tempo de resolução.
 *
 * ⚠️ Cancelada ENTRA: cancelar também grava `closedAt` (`CLOSED_STATUSES` em
 * `api/tickets.js`). Quem quiser só as concluídas filtra o status por cima.
 */
export function fechadasNoPeriodo(tickets, inicio, fim) {
  const de = inicio.getTime();
  const ate = fim.getTime();
  return tickets.filter(ticket => {
    const data = dataDeFechamento(ticket);
    if (!data) return false;
    const quando = data.getTime();
    return quando >= de && quando <= ate;
  });
}

/** O que aconteceu com as OS ABERTAS no período. */
export function volumeDoPeriodo(ticketsDoPeriodo) {
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

/** O que não anda por bloqueio, agrupado pelo motivo. */
export function filaTravada(ticketsDaFila, bloqueioDe) {
  const contagem = new Map();
  for (const ticket of ticketsDaFila) {
    if (!isTicketOpen(ticket.status)) continue;
    const bloqueio = bloqueioDe(ticket);
    if (!bloqueio) continue;
    contagem.set(bloqueio.motivo, (contagem.get(bloqueio.motivo) || 0) + 1);
  }
  const motivos = [...contagem.entries()]
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'pt-BR'));
  return { travadas: motivos.reduce((soma, m) => soma + m.total, 0), motivos };
}

/**
 * O que impede a OS de avançar, sem perguntar para onde. O porquê está em
 * `src/utils/statusChangeGuard.ts`, que reexporta daqui.
 *
 * @returns {{ motivo: string, campo: 'classificacao' } | null}
 */
export function bloqueioParaAvancar(ticket) {
  if (
    ticket.status === TICKET_STATUS.WAITING_TECH_OPINION &&
    (!ticket.macroServiceId || !ticket.serviceCatalogId)
  ) {
    return { motivo: 'Falta classificar o serviço', campo: 'classificacao' };
  }
  return null;
}
