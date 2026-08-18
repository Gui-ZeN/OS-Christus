/**
 * OS TRÊS ESTADOS DA FILA — ativa · esperando · impedida.
 *
 * A regra única ("toda OS ativa tem próxima ação com data") tirou a priorização,
 * mas não tirou a fila. Sem um jeito de declarar espera, as OS menos importantes
 * ganham data fabricada — "revisar em 30 dias" — e a decisão de prioridade some das
 * vistas: continua sendo tomada, só deixa de ser declarada e auditável.
 *
 * ⚠️ ISTO NÃO É CAMPO NOVO, E NÃO TEM MIGRAÇÃO. A auditoria avisou que este item
 * mexeria em estrutura de dados e por isso deveria vir cedo. Ao abrir o código, a
 * estrutura já estava lá: a suspensão sempre gravou MOTIVO em lista fechada, e o
 * motivo já separa "estamos esperando" de "um terceiro travou". Os dois estados são
 * DERIVADOS do que já está gravado — nenhum backfill nas 268 OS, nenhuma escrita.
 *
 * O que muda é o que a tela declara e o que os resumos contam.
 *
 * Sem eleição manual, sem carteira, sem limite de WIP — nada disso está no plano.
 */

export const ESTADO = {
  /** A organização está gastando capacidade nela agora. */
  ATIVA: 'ativa',
  /** É legítimo esperar: aprovação, verba, período. A espera é da casa. */
  ESPERANDO: 'esperando',
  /** Travada por terceiro, com revisão marcada. O tempo parado continua contando. */
  IMPEDIDA: 'impedida',
};

/**
 * Quais motivos são "terceiro travou".
 *
 * ⚠️ O PDF se contradiz em UM ponto e a escolha aqui é explícita: a tabela dos
 * estados põe "material" em *esperando*, mas a prévia da tela mostra "aguardando
 * fabricação" dentro de *Impedidas* ("esperando peça, fabricação, terceiro").
 * Seguimos a tela, porque é o recorte operacionalmente útil: peça que não chega é
 * exatamente o que alguém precisa ir cobrar. Trocar de lado é mover uma linha
 * daqui — nada mais.
 */
const MOTIVO_DE_TERCEIRO = new Set([
  'aguardando-material',
  'aguardando-terceiro',
  'aguardando-orcamento',
]);

function paraData(valor) {
  if (!valor) return null;
  const data = valor instanceof Date ? valor : new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data;
}

/**
 * A suspensão VIGENTE, ou null. Mesma regra do app: revisão vencida não vale mais,
 * e é essa peça que impede a suspensão de virar gaveta — passada a data, a OS volta
 * sozinha a cobrar decisão, sem ninguém precisar lembrar de "dessuspender".
 */
export function suspensaoVigente(ticket, now = new Date()) {
  const atencao = ticket?.attention;
  if (!atencao || String(atencao.state || '') !== 'suspensa') return null;
  const revisao = paraData(atencao.reviewAt);
  if (!revisao) return null;
  return revisao.getTime() > now.getTime() ? atencao : null;
}

/** ativa · esperando · impedida. OS sem suspensão vigente é ativa. */
export function estadoDaOs(ticket, now = new Date()) {
  const suspensao = suspensaoVigente(ticket, now);
  if (!suspensao) return ESTADO.ATIVA;
  return MOTIVO_DE_TERCEIRO.has(String(suspensao.reason || '')) ? ESTADO.IMPEDIDA : ESTADO.ESPERANDO;
}

/**
 * Esta OS pode ficar sem próxima ação sem que isso seja um buraco?
 *
 * É o furo que `esperando` resolve. Sem isto, uma OS legitimamente parada aparece
 * como "sem próxima ação", alguém marca "revisar em 30 dias" só para tirá-la da
 * lista, e o indicador que existe para mostrar o buraco passa a medir disciplina de
 * preenchimento. Contar espera declarada como buraco é o que ensina a maquiar.
 */
export function esperaDeclarada(ticket, now = new Date()) {
  return estadoDaOs(ticket, now) !== ESTADO.ATIVA;
}

/**
 * Há quantos dias parada. Vale para os três estados de propósito: no plano, OS
 * impedida CONTINUA contando o tempo parado — senão "impedida" viraria o lugar onde
 * o tempo some, que é o defeito que a suspensão já teve uma vez.
 */
export function diasParadaNoEstado(ticket, now = new Date()) {
  const base = paraData(ticket?.updatedAt) || paraData(ticket?.createdAt);
  if (!base) return null;
  return Math.floor((now.getTime() - base.getTime()) / 86_400_000);
}
