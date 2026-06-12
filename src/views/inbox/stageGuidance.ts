import type { Ticket } from '../../types';
import { TICKET_STATUS } from '../../constants/ticketStatus';

// Orientação por etapa (o que fazer agora) — extraída do InboxView.

export function getStageGuidance(status: string): { text: string; waiting: boolean } | null {
  switch (status) {
    case TICKET_STATUS.NEW:
      return { text: 'Faça a triagem: defina equipe responsável, urgência e aceite ou cancele a OS.', waiting: false };
    case TICKET_STATUS.WAITING_TECH_OPINION:
      return { text: 'Registre o parecer técnico e envie para aprovação da diretoria.', waiting: false };
    case TICKET_STATUS.WAITING_SOLUTION_APPROVAL:
      return { text: 'Aguardando a diretoria aprovar a solução técnica.', waiting: true };
    case TICKET_STATUS.WAITING_BUDGET:
      return { text: 'Lance as cotações dos fornecedores para esta OS.', waiting: false };
    case TICKET_STATUS.WAITING_BUDGET_APPROVAL:
      return { text: 'Aguardando a diretoria aprovar o orçamento.', waiting: true };
    case TICKET_STATUS.WAITING_CONTRACT_UPLOAD:
      return { text: 'Anexe o contrato assinado do fornecedor.', waiting: false };
    case TICKET_STATUS.WAITING_CONTRACT_APPROVAL:
      return { text: 'Aguardando a diretoria aprovar o contrato.', waiting: true };
    case TICKET_STATUS.WAITING_PRELIM_ACTIONS:
      return { text: 'Confirme materiais, equipe e agenda antes de iniciar a execução.', waiting: false };
    case TICKET_STATUS.IN_PROGRESS:
      return { text: 'Acompanhe a execução e registre o andamento no diário de obra.', waiting: false };
    case TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL:
      return { text: 'Aguardando o solicitante validar a entrega do serviço.', waiting: true };
    case TICKET_STATUS.WAITING_PAYMENT:
      return { text: 'Libere as medições e confirme os pagamentos.', waiting: false };
    case TICKET_STATUS.CLOSED:
      return { text: 'OS encerrada.', waiting: true };
    case TICKET_STATUS.CANCELED:
      return { text: 'OS cancelada.', waiting: true };
    default:
      return null;
  }
}

export function getExecutionNextActionLabel(ticket: Ticket) {
  if (ticket.status === TICKET_STATUS.WAITING_PRELIM_ACTIONS) return 'Concluir ações preliminares e liberar o início da execução.';
  if (ticket.status === TICKET_STATUS.IN_PROGRESS) return 'Atualizar o andamento da obra e liberar os próximos marcos.';
  if (ticket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL) return 'Aguardar validação do solicitante para avançar para o financeiro.';
  if (ticket.status === TICKET_STATUS.WAITING_PAYMENT) return 'Concluir lançamentos pendentes e finalizar o encerramento financeiro.';
  if (ticket.status === TICKET_STATUS.CLOSED) return 'Acompanhar garantia e documentos finais, se necessário.';
  return 'Sem ação operacional pendente nesta etapa.';
}
