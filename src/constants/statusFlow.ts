import { TICKET_STATUS, type TicketStatus } from './ticketStatus';

export type AppActorRole = 'Admin' | 'Gestor' | 'Diretor' | 'Usuario';
export type FlowScreen = 'inbox' | 'finance' | 'tracking';

type TransitionMap = Partial<Record<TicketStatus, TicketStatus[]>>;
const ALL_TICKET_STATUSES = Object.values(TICKET_STATUS) as TicketStatus[];

/**
 * A ETAPA DE APROVAÇÃO DA DIRETORIA SAIU.
 *
 * Não havia diretor: zero cadastrados, e `directorEmails` preenchido em 1 das 270 OS
 * — com um endereço de teste. A aprovação real acontece por e-mail, de quem está em
 * cópia, e agora é capturada de lá (ver `api/_lib/authorization.js`).
 *
 * As três etapas continuam EXISTINDO como valor, e continuam tendo SAÍDA: duas OS
 * estão paradas em "Aguardando Aprovação da Solução" e precisam poder sair. O que
 * sumiu foi a ENTRADA — ninguém mais cai nelas.
 */
const ADMIN_INBOX_TRANSITIONS: TransitionMap = {
  [TICKET_STATUS.NEW]: [TICKET_STATUS.WAITING_TECH_OPINION, TICKET_STATUS.CANCELED],
  [TICKET_STATUS.WAITING_TECH_OPINION]: [TICKET_STATUS.WAITING_BUDGET, TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELED],
  [TICKET_STATUS.WAITING_BUDGET]: [TICKET_STATUS.WAITING_PRELIM_ACTIONS, TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.CANCELED],
  [TICKET_STATUS.WAITING_PRELIM_ACTIONS]: [TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.CANCELED],
  [TICKET_STATUS.IN_PROGRESS]: [TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL, TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELED],
  [TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL]: [TICKET_STATUS.WAITING_PAYMENT, TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELED],
  [TICKET_STATUS.WAITING_PAYMENT]: [TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELED],
  [TICKET_STATUS.CLOSED]: [TICKET_STATUS.IN_PROGRESS],
  [TICKET_STATUS.CANCELED]: [TICKET_STATUS.NEW],

  // Saídas de legado: sem entrada, mas quem já está preso sai.
  [TICKET_STATUS.WAITING_SOLUTION_APPROVAL]: [TICKET_STATUS.WAITING_BUDGET, TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELED],
  [TICKET_STATUS.WAITING_BUDGET_APPROVAL]: [TICKET_STATUS.WAITING_PRELIM_ACTIONS, TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.CANCELED],
  [TICKET_STATUS.WAITING_CONTRACT_UPLOAD]: [TICKET_STATUS.WAITING_PRELIM_ACTIONS, TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.CANCELED],
  [TICKET_STATUS.WAITING_CONTRACT_APPROVAL]: [TICKET_STATUS.WAITING_PRELIM_ACTIONS, TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.CANCELED],
};

const FINANCE_TRANSITIONS: TransitionMap = {
  [TICKET_STATUS.WAITING_PAYMENT]: [TICKET_STATUS.CLOSED],
};

const TRACKING_TRANSITIONS: TransitionMap = {
  [TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL]: [TICKET_STATUS.WAITING_PAYMENT, TICKET_STATUS.IN_PROGRESS],
};

const FLOW_TRANSITIONS: Record<AppActorRole, Partial<Record<FlowScreen, TransitionMap>>> = {
  Admin: {
    inbox: ADMIN_INBOX_TRANSITIONS,
    finance: FINANCE_TRANSITIONS,
    tracking: TRACKING_TRANSITIONS,
  },
  Gestor: {
    inbox: ADMIN_INBOX_TRANSITIONS,
    finance: FINANCE_TRANSITIONS,
    tracking: TRACKING_TRANSITIONS,
  },
  // `Diretor` continua no tipo porque o backend valida papel por string e ninguém
  // está cadastrado assim — tirar do union só criaria ruído. Sem telas, sem fluxo.
  Diretor: {},
  Usuario: {},
};

/**
 * Etapas que ninguém mais escolhe.
 *
 * Continuam existindo como valor — duas OS estão paradas em "Aguardando Aprovação da
 * Solução" e precisam ser exibidas e poder sair. O que acabou foi a entrada: com a
 * diretoria fora da esteira, não há mais para onde aprovar.
 */
const APOSENTADAS = new Set<TicketStatus>([
  TICKET_STATUS.WAITING_SOLUTION_APPROVAL,
  TICKET_STATUS.WAITING_BUDGET_APPROVAL,
  TICKET_STATUS.WAITING_CONTRACT_APPROVAL,
]);

export const SELECTABLE_TICKET_STATUSES = ALL_TICKET_STATUSES.filter(
  status => !APOSENTADAS.has(status)
);

export function isRetiredStatus(status: TicketStatus | string): boolean {
  return APOSENTADAS.has(status as TicketStatus);
}

export function getAllowedNextStatuses(role: AppActorRole, screen: FlowScreen, currentStatus: TicketStatus) {
  if ((role === 'Admin' || role === 'Gestor') && screen === 'inbox') {
    return SELECTABLE_TICKET_STATUSES.filter(status => status !== currentStatus);
  }
  const transitions = FLOW_TRANSITIONS[role]?.[screen];
  if (!transitions) return [] as TicketStatus[];
  return transitions[currentStatus] || [];
}

export function canTransitionStatus(
  role: AppActorRole,
  screen: FlowScreen,
  currentStatus: TicketStatus,
  nextStatus: TicketStatus
) {
  if (currentStatus === nextStatus) return true;
  if ((role === 'Admin' || role === 'Gestor') && screen === 'inbox') return true;
  return getAllowedNextStatuses(role, screen, currentStatus).includes(nextStatus);
}
