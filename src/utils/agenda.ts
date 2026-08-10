import {
  ATTENTION_STATE,
  DEFAULT_TOLERANCE_MINUTES,
  MAX_SEM_RESPONSAVEL_NA_PAUTA,
  type AttentionState,
} from '../constants/agenda';
import { ATTENTION_KIND } from '../constants/attentionKind';
import { isTicketOpen } from '../constants/ticketLifecycle';
import type { Ticket } from '../types';

/**
 * A LÓGICA DA AGENDA — pura, testável sem React, sem Firestore e sem relógio real
 * (todo cálculo recebe `now`).
 *
 * Responde a pergunta que o sistema atual não responde: *o que precisa acontecer
 * hoje, onde e por quem*.
 */

/**
 * Grupos da tela "Hoje", em ordem de urgência. A ordem é a leitura: de cima para
 * baixo, do que exige ação agora ao que só precisa de decisão.
 */
export const AGENDA_GROUP = {
  OVERDUE: 'vencidas',
  TODAY: 'hoje',
  WAITING_SITE: 'aguardando-sede',
  UPCOMING: 'proximos-7-dias',
  SUSPENDED: 'suspensas',
  NO_ACTION: 'sem-proxima-acao',
} as const;

export type AgendaGroup = (typeof AGENDA_GROUP)[keyof typeof AGENDA_GROUP];

export const AGENDA_GROUP_LABEL: Record<AgendaGroup, string> = {
  vencidas: 'Vencidas',
  hoje: 'Hoje',
  'aguardando-sede': 'Aguardando a sede confirmar',
  'proximos-7-dias': 'Próximos 7 dias',
  suspensas: 'Suspensas',
  'sem-proxima-acao': 'Sem próxima ação',
};

/**
 * A suspensão VIGENTE, ou null.
 *
 * Suspensão com a revisão vencida não vale mais — e essa é a peça que impede a
 * suspensão de virar gaveta: quando a data passa, a OS volta sozinha para o grupo
 * que cobra decisão, sem ninguém precisar lembrar de "dessuspender".
 */
export function activeSuspension(ticket: Pick<Ticket, 'attention'>, now: Date) {
  const attention = ticket.attention;
  if (!attention || attention.state !== ATTENTION_STATE.SUSPENDED) return null;
  if (!attention.reviewAt) return null;
  return attention.reviewAt.getTime() > now.getTime() ? attention : null;
}

/** OS sem suspensão vigente conta como ativa: sem backfill de 268 OS. */
export function attentionStateOf(ticket: Pick<Ticket, 'attention'>, now: Date): AttentionState {
  return activeSuspension(ticket, now) ? ATTENTION_STATE.SUSPENDED : ATTENTION_STATE.ACTIVE;
}

export function isAgendaEligible(ticket: Pick<Ticket, 'status'>): boolean {
  return isTicketOpen(ticket.status);
}

/** Dia civil em Fortaleza — a operação inteira vive num fuso só. */
export function dayKey(date: Date, timeZone = 'America/Fortaleza'): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(date);
}

export function isSameDay(a: Date, b: Date, timeZone?: string): boolean {
  return dayKey(a, timeZone) === dayKey(b, timeZone);
}

/**
 * Passou do horário + tolerância?
 *
 * O relógio começa no FIM da tolerância, não no instante marcado — é isso que faz
 * "cobrada em 10 minutos" significar alguma coisa.
 */
export function isPastTolerance(
  dueAt: Date,
  now: Date,
  toleranceMinutes = DEFAULT_TOLERANCE_MINUTES
): boolean {
  return now.getTime() > dueAt.getTime() + toleranceMinutes * 60_000;
}

/**
 * Em qual grupo da agenda esta OS aparece.
 *
 * Precedência deliberada:
 *  1. **suspensa** (com motivo e revisão no futuro) sai do fluxo de urgência — é a
 *     única ausência de próxima ação que é legítima, e ela expira sozinha;
 *  2. **sem próxima ação** é a exceção da regra única: escondê-la atrás de outro
 *     rótulo derrotaria o propósito da tela;
 *  3. o resto é a data.
 */
export function agendaGroupOf(ticket: Ticket, now: Date): AgendaGroup | null {
  if (!isAgendaEligible(ticket)) return null;

  // A suspensão vem PRIMEIRO: é a única resposta legítima para "esta OS não tem
  // próxima ação". Ela só vale enquanto tiver motivo e revisão no futuro — vencida,
  // cai adiante e a OS reaparece cobrando decisão.
  if (activeSuspension(ticket, now)) return AGENDA_GROUP.SUSPENDED;

  const action = resolvedAttentionOf(ticket);
  if (!action) return AGENDA_GROUP.NO_ACTION;

  const due = action.dueAt;
  if (isSameDay(due, now)) {
    // Passou da hora e é compromisso de fornecedor: quem responde agora é a sede,
    // não a gestora. Separar isto evita a ligação de verificação.
    if (action.commitmentId && isPastTolerance(due, now)) return AGENDA_GROUP.WAITING_SITE;
    return AGENDA_GROUP.TODAY;
  }
  if (due.getTime() < now.getTime()) return AGENDA_GROUP.OVERDUE;

  const seteDias = now.getTime() + 7 * 24 * 60 * 60_000;
  return due.getTime() <= seteDias ? AGENDA_GROUP.UPCOMING : null;
}

/**
 * O que esta OS exige, vindo de QUALQUER uma das duas fontes.
 *
 * Duas fontes de propósito, com precedência clara:
 *  1. `nextAction` — alguém escreveu à mão. Ganha, porque é a pessoa sendo explícita
 *     sobre algo que não coube nos tipos.
 *  2. `operationalAttention` — o sistema propôs a partir de eventos estruturados.
 *     É o caso normal: 58% do histórico é conversa e ninguém preenche formulário.
 *
 * Atenção marcada como `legacy` fica DE FORA: são 82 das 102 OS calculadas hoje, com
 * semanas de atraso. Despejá-las na tela no primeiro dia é o painel de culpa.
 */
export interface ResolvedAttention {
  dueAt: Date;
  /** Texto quando é manual; `kind` quando é proposta do sistema. */
  what: string | null;
  kind: string | null;
  sourceId: string | null;
  commitmentId?: string | null;
  proposta: boolean;
}

export function resolvedAttentionOf(ticket: Ticket): ResolvedAttention | null {
  const manual = ticket.nextAction;
  if (manual?.dueAt) {
    return {
      dueAt: manual.dueAt,
      what: manual.what,
      kind: null,
      sourceId: null,
      commitmentId: manual.commitmentId ?? null,
      proposta: false,
    };
  }

  const proposta = ticket.operationalAttention;
  if (proposta?.dueAt && !proposta.legacy) {
    return {
      dueAt: proposta.dueAt,
      what: null,
      kind: proposta.kind,
      sourceId: proposta.sourceId,
      commitmentId: null,
      proposta: true,
    };
  }

  return null;
}

/** Há quantos dias esta OS está sem próxima ação (idade do vazio). */
export function idleDays(ticket: Ticket, now: Date): number {
  const desde = ticket.updatedAt ? new Date(ticket.updatedAt) : ticket.time;
  const ms = now.getTime() - desde.getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60_000)));
}

export interface AgendaBuckets {
  groups: Record<AgendaGroup, Ticket[]>;
  /** O número que importa: OS viva que ninguém está tocando. */
  withoutNextAction: number;
  /** Quantas exigem ação hoje (hoje + vencidas). */
  needingActionToday: number;
  /**
   * Paradas sem ninguém respondendo por elas.
   *
   * Quando são muitas (`agrupado`), NÃO entram nos grupos: viram uma linha só. Ver
   * `MAX_SEM_RESPONSAVEL_NA_PAUTA` para o porquê — passivo se mostra como número e
   * se resolve em lote; trabalho se mostra item a item.
   */
  semResponsavel: { total: number; agrupado: boolean };
}

/**
 * Monta a agenda a partir da lista de OS que já vive em memória.
 *
 * Sem query nova e sem índice: com ~270 OS o filtro em memória é confortável. Se um
 * dia a lista crescer a ponto de doer, aí é decisão com número na mão — não agora.
 */
export function buildAgenda(tickets: Ticket[], now: Date): AgendaBuckets {
  const groups = {
    [AGENDA_GROUP.OVERDUE]: [] as Ticket[],
    [AGENDA_GROUP.TODAY]: [] as Ticket[],
    [AGENDA_GROUP.WAITING_SITE]: [] as Ticket[],
    [AGENDA_GROUP.UPCOMING]: [] as Ticket[],
    [AGENDA_GROUP.SUSPENDED]: [] as Ticket[],
    [AGENDA_GROUP.NO_ACTION]: [] as Ticket[],
  };

  // Separa antes de agrupar: se forem muitas, não podem entrar na pauta — cairiam
  // quase todas em "Vencidas" (a cobrança nasce com data no passado) e afogariam as
  // atenções que são trabalho de verdade.
  const semResponsavel: Ticket[] = [];
  const demais: Ticket[] = [];
  for (const ticket of tickets) {
    const alvo =
      resolvedAttentionOf(ticket)?.kind === ATTENTION_KIND.SET_OWNER ? semResponsavel : demais;
    alvo.push(ticket);
  }
  const agrupado = semResponsavel.length > MAX_SEM_RESPONSAVEL_NA_PAUTA;

  for (const ticket of agrupado ? demais : [...demais, ...semResponsavel]) {
    const group = agendaGroupOf(ticket, now);
    if (group) groups[group].push(ticket);
  }

  const porData = (a: Ticket, b: Ticket) =>
    (resolvedAttentionOf(a)?.dueAt.getTime() ?? 0) - (resolvedAttentionOf(b)?.dueAt.getTime() ?? 0);
  for (const key of Object.keys(groups) as AgendaGroup[]) {
    // "Sem próxima ação" ordena pelo TEMPO PARADO, não por data (não tem data):
    // a mais esquecida aparece primeiro, que é o oposto de esconder o passivo.
    if (key === AGENDA_GROUP.NO_ACTION) {
      groups[key].sort((a, b) => idleDays(b, now) - idleDays(a, now));
    } else if (key === AGENDA_GROUP.SUSPENDED) {
      // Pela revisão: a que volta primeiro aparece no topo.
      groups[key].sort(
        (a, b) => (a.attention?.reviewAt?.getTime() ?? 0) - (b.attention?.reviewAt?.getTime() ?? 0)
      );
    } else {
      groups[key].sort(porData);
    }
  }

  return {
    groups,
    withoutNextAction: groups[AGENDA_GROUP.NO_ACTION].length,
    needingActionToday: groups[AGENDA_GROUP.TODAY].length + groups[AGENDA_GROUP.OVERDUE].length,
    semResponsavel: { total: semResponsavel.length, agrupado },
  };
}
