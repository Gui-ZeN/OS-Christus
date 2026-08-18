/**
 * OS TRÊS ESTADOS DA FILA — ativa · esperando · impedida.
 *
 * A regra única ("toda OS ativa tem próxima ação com data") tirou a priorização,
 * mas não tirou a fila. Sem um jeito de declarar espera, as OS menos importantes
 * ganham data fabricada — "revisar em 30 dias" — e a decisão de prioridade some das
 * vistas: continua sendo tomada, só deixa de ser declarada e auditável.
 *
 * ⚠️ NÃO É CAMPO NOVO E NÃO TEM MIGRAÇÃO. A suspensão sempre gravou motivo em lista
 * fechada e uma data de revisão. Os estados são DERIVADOS disso.
 *
 * ⚠️ O QUE DECIDE O ESTADO É O PRAZO, NÃO O MOTIVO. Esta é a correção da auditoria
 * (consulta 12). A primeira versão classificava pelo motivo — "material" ia para
 * impedida, "aprovação" para esperando — e as duas metades do plano se
 * contradiziam sobre onde "material" caía. Nenhuma das duas estava certa:
 *
 *   "aguardando fabricação até 28/08"  -> ESPERANDO  (prazo futuro e crível)
 *   passou 28/08, ou nunca houve prazo -> IMPEDIDA   (a espera deixou de ser legítima)
 *
 * Classificar tudo que é material como impedida contamina a fila urgente com itens
 * sobre os quais ninguém tem ação útil hoje. Classificar tudo como esperando
 * esconde atraso. O prazo é o que separa os dois, e o motivo vira descrição.
 */

export const ESTADO = {
  /** A organização está gastando capacidade nela agora. */
  ATIVA: 'ativa',
  /** Espera legítima: há prazo futuro e crível. Ninguém tem ação útil hoje. */
  ESPERANDO: 'esperando',
  /** O prazo venceu, ou nunca houve. Alguém precisa remover o bloqueio. */
  IMPEDIDA: 'impedida',
};

function paraData(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  if (typeof valor.toDate === 'function') return valor.toDate();
  if (typeof valor.seconds === 'number') return new Date(valor.seconds * 1000);
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

/** A parada declarada, vencida ou não. Quem decide o estado é a data dela. */
export function paradaDeclarada(ticket) {
  const atencao = ticket?.attention;
  if (!atencao || String(atencao.state || '') !== 'suspensa') return null;
  return atencao;
}

/**
 * ativa · esperando · impedida.
 *
 * ⚠️ Revisão vencida NÃO devolve a OS para "ativa" em silêncio, como antes. Ela
 * vira IMPEDIDA — que é um estado de ação, não de estacionamento. A diferença
 * importa para quem lê a tela: "sem próxima ação" acusa a gestora de não ter
 * definido nada; "impedida há 12 dias" diz que um terceiro travou e o prazo furou.
 */
export function estadoDaOs(ticket, now = new Date()) {
  const parada = paradaDeclarada(ticket);
  if (!parada) return ESTADO.ATIVA;

  const revisao = paraData(parada.reviewAt);
  if (!revisao) return ESTADO.IMPEDIDA;
  return revisao.getTime() > now.getTime() ? ESTADO.ESPERANDO : ESTADO.IMPEDIDA;
}

/**
 * Esta OS pode ficar sem próxima ação sem que isso seja um buraco?
 *
 * Vale para os dois estados parados — os dois foram DECLARADOS, com motivo e data.
 * Contar espera declarada como buraco empurra alguém a inventar "revisar em 30
 * dias" só para tirá-la da lista, e o indicador passa a medir disciplina de
 * preenchimento.
 *
 * Impedida não some por isso: ela é contada à parte, porque exige ação.
 */
export function esperaDeclarada(ticket, now = new Date()) {
  return estadoDaOs(ticket, now) !== ESTADO.ATIVA;
}

/** Precisa de alguém para remover o bloqueio agora. */
export function precisaDestravar(ticket, now = new Date()) {
  return estadoDaOs(ticket, now) === ESTADO.IMPEDIDA;
}

/**
 * Há quantos dias parada.
 *
 * ⚠️ Usa `stalledSince` quando existe, não `updatedAt`. Segunda correção da
 * auditoria: adiar uma revisão É uma alteração e deve mexer em `updatedAt` — o erro
 * era usar `updatedAt` como medida de estagnação, o que fazia qualquer toque
 * administrativo zerar o tempo parado que se quer enxergar.
 */
export function diasParadaNoEstado(ticket, now = new Date()) {
  const base = paraData(ticket?.stalledSince) || paraData(ticket?.updatedAt) || paraData(ticket?.createdAt);
  if (!base) return null;
  return Math.floor((now.getTime() - base.getTime()) / 86_400_000);
}

/**
 * A OS tem próxima ação, vindo de QUALQUER uma das duas fontes?
 *
 * ⚠️ Existe porque a tela e o resumo da diretoria discordavam sobre o mesmo número.
 * A tela resolve `nextAction` OU `operationalAttention` (a proposta do sistema, que
 * cobre 58% do histórico onde ninguém preenche formulário); o resumo contava só
 * `nextAction`. Resultado reproduzido pela auditoria (consulta 13): OS que a tela
 * mostrava com ação chegava à diretoria como "sem próxima ação".
 *
 * "Sem próxima ação" é O número do rework — o único que mostra o buraco. Ele não
 * pode significar coisas diferentes em dois lugares.
 *
 * Atenção marcada como `legacy` fica de fora, igual à tela: são as calculadas com
 * semanas de atraso, e despejá-las seria o painel de culpa.
 */
export function temProximaAcao(ticket) {
  if (ticket?.nextAction?.dueAt) return true;
  const proposta = ticket?.operationalAttention;
  return Boolean(proposta?.dueAt && !proposta.legacy);
}
