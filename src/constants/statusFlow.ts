import { TICKET_STATUS, type TicketStatus } from './ticketStatus';

export type AppActorRole = 'Admin' | 'Gestor' | 'Diretor' | 'Usuario';
export type FlowScreen = 'inbox' | 'finance' | 'tracking';

type TransitionMap = Partial<Record<TicketStatus, TicketStatus[]>>;
const ALL_TICKET_STATUSES = Object.values(TICKET_STATUS) as TicketStatus[];

/**
 * O MECANISMO DA DIRETORIA SAIU; OS MARCOS DE APROVAÇÃO VOLTARAM (13/08/2026).
 *
 * Em 07/08 tirei as três etapas de aprovação porque não havia diretor: zero
 * cadastrados, `directorEmails` em 1 das 270 OS, com endereço de teste. Isso provou
 * que o MECANISMO (diretor cadastrado clicando "aprovar") não era usado — e eu
 * concluí demais, tirando junto os ESTADOS. A aprovação continua sendo capturada do
 * e-mail de quem está em cópia (`api/_lib/authorization.js`); o que voltou é a OS
 * poder DIZER que está esperando por ela.
 *
 * A evidência: a planilha da coordenação registra 226 datas de aprovação da solução
 * e tem 49 solicitações paradas nesse marco hoje. Enquanto o Serv3 recusava a etapa,
 * das 85 saídas de "Aguardando Parecer Técnico" 64 foram direto para Encerrada.
 *
 * Aprovação de CONTRATO segue sem entrada: a planilha não acompanha esse marco.
 *
 * A esteira é permissiva de propósito — 45% das linhas da planilha PULAM etapa, e
 * 45% das concluídas nunca registraram início de execução. Quem exigir sequência
 * completa aqui vai estar modelando um processo que a operação não executa.
 */
const ADMIN_INBOX_TRANSITIONS: TransitionMap = {
  [TICKET_STATUS.NEW]: [TICKET_STATUS.WAITING_TECH_OPINION, TICKET_STATUS.CANCELED],
  [TICKET_STATUS.WAITING_TECH_OPINION]: [TICKET_STATUS.WAITING_SOLUTION_APPROVAL, TICKET_STATUS.WAITING_BUDGET, TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELED],
  [TICKET_STATUS.WAITING_SOLUTION_APPROVAL]: [TICKET_STATUS.WAITING_BUDGET, TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELED],
  [TICKET_STATUS.WAITING_BUDGET]: [TICKET_STATUS.WAITING_BUDGET_APPROVAL, TICKET_STATUS.WAITING_PRELIM_ACTIONS, TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.CANCELED],
  [TICKET_STATUS.WAITING_BUDGET_APPROVAL]: [TICKET_STATUS.WAITING_PRELIM_ACTIONS, TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELED],
  [TICKET_STATUS.WAITING_PRELIM_ACTIONS]: [TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.CANCELED],
  [TICKET_STATUS.IN_PROGRESS]: [TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL, TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELED],
  [TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL]: [TICKET_STATUS.WAITING_PAYMENT, TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELED],
  [TICKET_STATUS.WAITING_PAYMENT]: [TICKET_STATUS.CLOSED, TICKET_STATUS.CANCELED],
  [TICKET_STATUS.CLOSED]: [TICKET_STATUS.IN_PROGRESS],
  [TICKET_STATUS.CANCELED]: [TICKET_STATUS.NEW],

  // Saídas de legado: sem entrada, mas quem já está preso sai. (As duas etapas de
  // aprovação saíram deste bloco em 13/08 — voltaram a ter entrada e estão acima.)
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
 * Etapas que ninguém mais escolhe. Espelho de `api/_lib/statusFlow.js` — a razão
 * completa da volta das duas aprovações está lá.
 *
 * Sobrou a aprovação de CONTRATO: a coordenação não acompanha esse marco na planilha,
 * então não há evidência de que o passo exista fora do sistema. Continua válida como
 * valor, e continua tendo saída, para as OS que ficaram presas nela.
 */
const APOSENTADAS = new Set<TicketStatus>([TICKET_STATUS.WAITING_CONTRACT_APPROVAL]);

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
