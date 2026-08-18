import { ESTADO, estadoDaOs } from '../../api/_lib/estadoDaOs.js';
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
  /**
   * O grupo do TOPO no desenho do PDF: a sede confirmou que o fornecedor não veio,
   * e há prazo correndo. Não existia — a falta confirmada ficava diluída em
   * "Vencidas", junto de coisa que não tem nada a ver, e o primeiro grupo que a
   * gestora via ao entrar não era o que exige ação dela agora.
   */
  COBRAR: 'cobrar-agora',
  OVERDUE: 'vencidas',
  TODAY: 'hoje',
  WAITING_SITE: 'aguardando-sede',
  /**
   * Trabalho que NÃO depende de fornecedor: analisar orçamento, mandar contrato.
   * Separado de propósito — misturado com visita, ele some atrás de coisa que
   * depende de terceiro, e é justamente o que a própria equipe consegue destravar.
   */
  INTERNAL: 'trabalho-interno',
  UPCOMING: 'proximos-7-dias',
  // Os dois estados declarados do plano, no lugar do grupo único "Suspensas".
  // Não é campo novo: a suspensão sempre gravou MOTIVO em lista fechada, e é o
  // motivo que separa "estamos esperando" de "um terceiro travou".
  WAITING: 'esperando',
  BLOCKED: 'impedidas',
  NO_ACTION: 'sem-proxima-acao',
} as const;

export type AgendaGroup = (typeof AGENDA_GROUP)[keyof typeof AGENDA_GROUP];

export const AGENDA_GROUP_LABEL: Record<AgendaGroup, string> = {
  'cobrar-agora': 'Cobrar agora',
  vencidas: 'Vencidas',
  hoje: 'Hoje',
  'aguardando-sede': 'Aguardando a sede confirmar',
  'trabalho-interno': 'Trabalho interno',
  'proximos-7-dias': 'Próximos 7 dias',
  esperando: 'Esperando',
  impedidas: 'Impedidas',
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
/**
 * `olharCompromisso` entra por parâmetro porque a agenda recebe OS, não visitas —
 * e "Cobrar agora" depende do ESTADO da visita, não da data da ação. Sem ele o
 * grupo do topo do PDF não teria como existir.
 */
export function agendaGroupOf(
  ticket: Ticket,
  now: Date,
  olharCompromisso?: (id: string) => { state?: string } | null | undefined
): AgendaGroup | null {
  if (!isAgendaEligible(ticket)) return null;

  // COBRAR vem antes de tudo, inclusive de parada declarada: falta confirmada tem
  // prazo correndo, e prazo correndo ganha de qualquer outra leitura da OS.
  const acaoParaCobranca = resolvedAttentionOf(ticket);
  if (acaoParaCobranca?.commitmentId && olharCompromisso) {
    const visita = olharCompromisso(acaoParaCobranca.commitmentId);
    if (String(visita?.state || '') === 'faltou') return AGENDA_GROUP.COBRAR;
  }

  // A suspensão vem PRIMEIRO: é a única resposta legítima para "esta OS não tem
  // próxima ação". Ela só vale enquanto tiver motivo e revisão no futuro — vencida,
  // cai adiante e a OS reaparece cobrando decisão.
  // A parada DECLARADA decide, vencida ou não — e o que separa os dois grupos é o
  // prazo, não o motivo (auditoria, consulta 12):
  //
  //   prazo no futuro  -> Esperando  (ninguém tem ação útil hoje)
  //   prazo vencido    -> Impedidas  (alguém precisa remover o bloqueio)
  //
  // ⚠️ Revisão vencida NÃO cai mais em "sem próxima ação". A intenção antiga — não
  // deixar a parada virar gaveta — continua valendo, e Impedidas cumpre ela melhor:
  // fica no topo da tela, exige ação e continua contando o tempo parado. O que muda
  // é a acusação. "Sem próxima ação" diz que a gestora não definiu nada; "impedida
  // há 12 dias" diz que um terceiro furou o prazo. Misturar os dois destrói a única
  // informação que separa negligência de bloqueio externo.
  const estado = estadoDaOs(ticket, now);
  if (estado === ESTADO.IMPEDIDA) return AGENDA_GROUP.BLOCKED;
  if (estado === ESTADO.ESPERANDO) return AGENDA_GROUP.WAITING;

  const action = resolvedAttentionOf(ticket);
  if (!action) return AGENDA_GROUP.NO_ACTION;

  const due = action.dueAt;

  // Trabalho interno: sem `commitmentId` não há fornecedor para esperar, e a bola
  // é da própria equipe. Só o que já venceu ou vence hoje — o resto continua em
  // "Próximos 7 dias", que é para se preparar, não para agir.
  if (!action.commitmentId && due.getTime() <= now.getTime()) return AGENDA_GROUP.INTERNAL;
  if (!action.commitmentId && isSameDay(due, now)) return AGENDA_GROUP.INTERNAL;

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
export function buildAgenda(
  tickets: Ticket[],
  now: Date,
  olharCompromisso?: (id: string) => { state?: string } | null | undefined
): AgendaBuckets {
  const groups = {
    [AGENDA_GROUP.COBRAR]: [] as Ticket[],
    [AGENDA_GROUP.INTERNAL]: [] as Ticket[],
    [AGENDA_GROUP.OVERDUE]: [] as Ticket[],
    [AGENDA_GROUP.TODAY]: [] as Ticket[],
    [AGENDA_GROUP.WAITING_SITE]: [] as Ticket[],
    [AGENDA_GROUP.UPCOMING]: [] as Ticket[],
    [AGENDA_GROUP.WAITING]: [] as Ticket[],
    [AGENDA_GROUP.BLOCKED]: [] as Ticket[],
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
    const group = agendaGroupOf(ticket, now, olharCompromisso);
    if (group) groups[group].push(ticket);
  }

  const porData = (a: Ticket, b: Ticket) =>
    (resolvedAttentionOf(a)?.dueAt.getTime() ?? 0) - (resolvedAttentionOf(b)?.dueAt.getTime() ?? 0);
  for (const key of Object.keys(groups) as AgendaGroup[]) {
    // "Sem próxima ação" ordena pelo TEMPO PARADO, não por data (não tem data):
    // a mais esquecida aparece primeiro, que é o oposto de esconder o passivo.
    if (key === AGENDA_GROUP.NO_ACTION) {
      groups[key].sort((a, b) => idleDays(b, now) - idleDays(a, now));
    } else if (key === AGENDA_GROUP.WAITING || key === AGENDA_GROUP.BLOCKED) {
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
    // Inclui cobrança e trabalho interno: são ações de HOJE tanto quanto visita
    // marcada, e sem elas o contador do topo diria menos do que a tela mostra.
    needingActionToday:
      groups[AGENDA_GROUP.COBRAR].length +
      groups[AGENDA_GROUP.TODAY].length +
      groups[AGENDA_GROUP.OVERDUE].length +
      groups[AGENDA_GROUP.INTERNAL].length,
    semResponsavel: { total: semResponsavel.length, agrupado },
  };
}
