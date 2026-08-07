import type { Ticket } from '../../types';
import { TICKET_STATUS } from '../../constants/ticketStatus';

// A orientação POR ETAPA foi removida: ela traduzia o status num conselho fixo
// ("em Aguardando Orçamento, lance as cotações") e chutava para as 163 OS paradas na
// segunda etapa, onde repetia "registre o parecer técnico" havia meses. Quem responde
// "o que fazer agora" passou a ser a próxima ação, escrita por alguém — ver
// `NextActionStrip`.

export function getExecutionNextActionLabel(ticket: Ticket) {
  if (ticket.status === TICKET_STATUS.WAITING_PRELIM_ACTIONS) return 'Concluir ações preliminares e liberar o início da execução.';
  if (ticket.status === TICKET_STATUS.IN_PROGRESS) return 'Atualizar o andamento da obra e liberar os próximos marcos.';
  if (ticket.status === TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL) return 'Aguardar validação do solicitante para avançar para o financeiro.';
  if (ticket.status === TICKET_STATUS.WAITING_PAYMENT) return 'Concluir lançamentos pendentes e finalizar o encerramento financeiro.';
  if (ticket.status === TICKET_STATUS.CLOSED) return 'Acompanhar garantia e documentos finais, se necessário.';
  return 'Sem ação operacional pendente nesta etapa.';
}
