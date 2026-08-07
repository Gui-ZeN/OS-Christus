import { toDateOrNull } from './dates.js';

/**
 * COMPROMISSO — "o terceiro prometeu vir tal dia e não apareceu".
 *
 * É a dor que abriu o rework. Hoje o sistema não sabe que alguém prometeu vir: a
 * promessa vive num e-mail, e descobrir que ela furou custa uma ligação da gestora
 * para a sede.
 *
 * Uma visita pode atender VÁRIAS OS da mesma sede — por isso `ticketIds` é lista
 * desde o começo. Um compromisso por OS obrigaria a marcar "não veio" três vezes
 * para a mesma falta.
 */

export const COMMITMENT_STATE = {
  SCHEDULED: 'agendado',
  /** DERIVADO do relógio, nunca gravado. Ver `effectiveCommitmentState`. */
  UNCONFIRMED: 'sem-confirmacao',
  ARRIVED: 'compareceu',
  MISSED: 'faltou',
  RESCHEDULED: 'remarcado',
  CANCELED: 'cancelado',
};

export const COMMITMENT_OUTCOME = {
  DONE: 'concluiu',
  PARTIAL: 'parcial',
  NOT_EXECUTED: 'nao-executou',
  MISSING_MATERIAL: 'faltou-material',
  NO_ACCESS: 'sem-acesso',
  SOLVED_BY_SITE: 'resolvido-pela-sede',
};

export const RESCHEDULE_REASON = {
  VENDOR_ASKED: 'fornecedor-pediu',
  NO_MATERIAL: 'faltou-material',
  SITE_UNAVAILABLE: 'sede-nao-pode-receber',
  OTHER: 'outro',
};

export const DEFAULT_TOLERANCE_MINUTES = 30;

/** Estados que a confirmação da sede ainda pode mudar. */
const ABERTOS = new Set([COMMITMENT_STATE.SCHEDULED]);
/** Estados finais: registrar de novo por cima apagaria o que aconteceu. */
const FECHADOS = new Set([
  COMMITMENT_STATE.ARRIVED,
  COMMITMENT_STATE.MISSED,
  COMMITMENT_STATE.RESCHEDULED,
  COMMITMENT_STATE.CANCELED,
]);

/**
 * O estado que vale AGORA.
 *
 * `sem-confirmacao` é derivado do relógio e nunca gravado — não existe job varrendo
 * compromissos para "vencer" o horário, e um estado gravado por job é um estado que
 * fica errado quando o job falha. Passou do horário + tolerância e ninguém disse
 * nada: a bola está com a sede.
 *
 * ⚠️ `sem-confirmacao` NÃO é falta. A diferença importa: falta entra no histórico do
 * fornecedor, que decide quem continua atendendo.
 */
export function effectiveCommitmentState(commitment, now = new Date()) {
  const state = String(commitment?.state || COMMITMENT_STATE.SCHEDULED);
  if (!ABERTOS.has(state)) return state;

  const startAt = toDateOrNull(commitment?.startAt);
  if (!startAt) return state;

  const tolerancia = Number.isFinite(Number(commitment?.toleranceMinutes))
    ? Number(commitment.toleranceMinutes)
    : DEFAULT_TOLERANCE_MINUTES;
  const limite = startAt.getTime() + tolerancia * 60_000;
  return now.getTime() > limite ? COMMITMENT_STATE.UNCONFIRMED : state;
}

/** A sede ainda precisa responder por este compromisso? */
export function isAwaitingSiteConfirmation(commitment, now = new Date()) {
  return effectiveCommitmentState(commitment, now) === COMMITMENT_STATE.UNCONFIRMED;
}

export function isCommitmentClosed(commitment) {
  return FECHADOS.has(String(commitment?.state || ''));
}

/**
 * A confirmação é válida?
 *
 * Regras que existem por um motivo cada:
 *  - `compareceu` EXIGE desfecho. Foi o furo mais grave que a auditoria pegou: o
 *    fornecedor chega, olha a pia, diz que faltou material e vai embora; alguém marca
 *    "apareceu", o painel fica verde e nada foi instalado.
 *  - desfecho só faz sentido com `compareceu` — quem não veio não executou nada.
 *  - compromisso já fechado não aceita nova confirmação por cima.
 *
 * @param {{ state?: string }} commitment
 * @param {{ state?: string, outcome?: string | null }} [confirmation]
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateConfirmation(commitment, confirmation = {}) {
  const { state, outcome = null } = confirmation;
  if (isCommitmentClosed(commitment)) {
    return { ok: false, error: 'Este compromisso já foi encerrado.' };
  }
  if (state !== COMMITMENT_STATE.ARRIVED && state !== COMMITMENT_STATE.MISSED) {
    return { ok: false, error: 'Confirmação inválida: use "compareceu" ou "faltou".' };
  }
  if (state === COMMITMENT_STATE.ARRIVED) {
    if (!outcome) {
      return { ok: false, error: 'Diga o que aconteceu depois que a equipe chegou.' };
    }
    if (!Object.values(COMMITMENT_OUTCOME).includes(outcome)) {
      return { ok: false, error: 'Desfecho desconhecido.' };
    }
  }
  if (state === COMMITMENT_STATE.MISSED && outcome) {
    return { ok: false, error: 'Quem não compareceu não tem desfecho de execução.' };
  }
  return { ok: true };
}

export function normalizeCommitmentForStorage(commitment) {
  return {
    ...commitment,
    startAt: toDateOrNull(commitment?.startAt),
    endAt: toDateOrNull(commitment?.endAt),
    confirmedAt: toDateOrNull(commitment?.confirmedAt),
    createdAt: toDateOrNull(commitment?.createdAt) || new Date(),
    updatedAt: toDateOrNull(commitment?.updatedAt),
  };
}

function iso(value) {
  const d = toDateOrNull(value);
  return d ? d.toISOString() : null;
}

export function serializeCommitmentForApi(commitment, now = new Date()) {
  return {
    ...commitment,
    // O front recebe o estado JÁ resolvido: se cada tela derivasse por conta própria,
    // duas telas discordariam sobre a mesma visita.
    effectiveState: effectiveCommitmentState(commitment, now),
    startAt: iso(commitment?.startAt),
    endAt: iso(commitment?.endAt),
    confirmedAt: iso(commitment?.confirmedAt),
    createdAt: iso(commitment?.createdAt),
    updatedAt: iso(commitment?.updatedAt),
  };
}
