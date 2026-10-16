/**
 * QUANDO A OS ENTROU NA ETAPA — a data que a pessoa informa, conferida pelo servidor.
 *
 * Até 16/10/2026 a data da etapa era SEMPRE a do clique (`new Date()` no PATCH). Era de
 * propósito — data que depende de a tela mandar é data que uma tela esquece —, mas a
 * operação registra atrasado: a OS foi concluída na sexta e só é encerrada no sistema
 * na segunda, e a data real ia parar na observação, onde nenhum indicador lê.
 *
 * Agora a tela manda `statusDate` (AAAA-MM-DD, padrão hoje) e o servidor confere e
 * carimba. Sem ela, continua valendo o clique — nenhuma tela antiga quebra.
 *
 * ⚠️ É A DATA OFICIAL (decisão do dono): vai para `stageEnteredAt`, `closedAt` e o marco
 * da etapa, e daí para "parada há", tempo de resolução e encerradas do mês.
 */

// Fortaleza é UTC-3 o ano inteiro (sem horário de verão desde 2019).
const FUSO_MS = 3 * 60 * 60 * 1000;
const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

/** AAAA-MM-DD do instante, no calendário de Fortaleza. */
export function diaEmFortaleza(instante) {
  return new Date(instante.getTime() - FUSO_MS).toISOString().slice(0, 10);
}

/**
 * @param {string|null|undefined} statusDate  o que a tela mandou
 * @param {{ agora: Date, abertaEm?: Date|null }} contexto
 * @returns {{ data: Date } | { erro: string }}
 */
export function resolverDataDaEtapa(statusDate, { agora, abertaEm = null }) {
  const informada = String(statusDate || '').trim();
  if (!informada) return { data: agora };
  if (!DATA_VALIDA.test(informada) || Number.isNaN(new Date(`${informada}T12:00:00Z`).getTime())) {
    return { erro: 'Data da etapa inválida: use AAAA-MM-DD.' };
  }

  const hoje = diaEmFortaleza(agora);
  if (informada > hoje) return { erro: 'A data da etapa não pode ser no futuro.' };
  // Hoje vale o instante do clique: a ordem das mudanças do mesmo dia continua certa.
  if (informada === hoje) return { data: agora };

  if (abertaEm && informada < diaEmFortaleza(abertaEm)) {
    return { erro: 'A data da etapa não pode ser anterior à abertura da OS.' };
  }
  // Dia passado: meio-dia em Fortaleza, longe das duas viradas de dia.
  return { data: new Date(`${informada}T12:00:00-03:00`) };
}
