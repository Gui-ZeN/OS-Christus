// Máquina de estados do fluxo de OS — validação no backend.
// ESPELHO de src/constants/statusFlow.ts: manter os dois em sincronia.
//
// Por design (igual ao front): Admin/Gestor têm transição livre na Inbox.
// Decisões do Diretor passam exclusivamente pelos comandos transacionais
// de api/approvals.js.

export const TICKET_STATUS = {
  NEW: 'Nova OS',
  WAITING_TECH_OPINION: 'Aguardando Parecer Técnico',
  WAITING_SOLUTION_APPROVAL: 'Aguardando Aprovação da Solução',
  WAITING_BUDGET: 'Aguardando Orçamento',
  WAITING_BUDGET_APPROVAL: 'Aguardando Aprovação do Orçamento',
  WAITING_CONTRACT_UPLOAD: 'Aguardando Anexo de Contrato',
  WAITING_CONTRACT_APPROVAL: 'Aguardando aprovação do contrato',
  WAITING_PRELIM_ACTIONS: 'Aguardando Ações Preliminares',
  IN_PROGRESS: 'Em andamento',
  WAITING_MAINTENANCE_APPROVAL: 'Aguardando aprovação da manutenção',
  WAITING_PAYMENT: 'Aguardando pagamento',
  CLOSED: 'Encerrada',
  CANCELED: 'Cancelada',
};

const VALID_STATUSES = new Set(Object.values(TICKET_STATUS));

export function isValidStatus(status) {
  return VALID_STATUSES.has(String(status || ''));
}

/**
 * True se o papel pode mover a OS de `currentStatus` para `nextStatus`.
 * Admin/Gestor: livre (mesma regra do painel).
 * Outros papéis não atualizam status pelo painel.
 */
export function canTransitionStatus(role, currentStatus, nextStatus) {
  if (currentStatus === nextStatus) return true;
  if (role === 'Admin' || role === 'Gestor') return true;
  return false;
}
