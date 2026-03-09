export const TICKET_STATUS = {
  NEW: 'Nova OS',
  WAITING_TECH_OPINION: 'Aguardando Parecer Técnico',
  WAITING_SOLUTION_APPROVAL: 'Aguardando Aprovação da Solução',
  WAITING_BUDGET: 'Aguardando Orçamento',
  WAITING_BUDGET_APPROVAL: 'Aguardando Aprovação do Orçamento',
  WAITING_CONTRACT_APPROVAL: 'Aguardando aprovação do contrato',
  WAITING_PRELIM_ACTIONS: 'Aguardando Ações Preliminares',
  IN_PROGRESS: 'Em andamento',
  WAITING_MAINTENANCE_APPROVAL: 'Aguardando aprovação da manutenção',
  WAITING_PAYMENT: 'Aguardando pagamento',
  CLOSED: 'Encerrada',
  CANCELED: 'Cancelada',
} as const;

export type TicketStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS];
