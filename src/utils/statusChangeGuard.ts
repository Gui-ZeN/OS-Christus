import { TICKET_STATUS } from '../constants/ticketStatus';
import type { Ticket } from '../types';

/**
 * Regras que dependem do CONTEÚDO da OS, não do papel de quem mexe.
 *
 * `canTransitionStatus` responde "esta pessoa pode ir daqui para ali". Isto responde
 * outra coisa: "esta OS está pronta para ir". A diferença importa porque a segunda
 * pergunta vale para qualquer tela — e até agora a resposta morava dentro do
 * `handleSend` do InboxView, 210 linhas abaixo de onde alguém iria procurar.
 *
 * Enquanto ela ficasse lá, qualquer tela nova que trocasse etapa nasceria como
 * atalho para burlar a regra — sem ninguém perceber, porque o InboxView continuaria
 * cobrando certo.
 *
 * Devolve o motivo do bloqueio em português (a frase vai direto para a tela) ou
 * `null` quando não há impedimento.
 */
export function motivoQueImpedeEtapa(ticket: Ticket, proximaEtapa: string): string | null {
  const atual = String(ticket.status || '');

  // Sair do Parecer Técnico exige o serviço classificado. A classificação pode ser
  // adiada na triagem — o que não pode é ser esquecida, e este é o momento em que
  // ela deixa de ser adiável.
  const avancoDoParecer =
    atual === TICKET_STATUS.WAITING_TECH_OPINION &&
    proximaEtapa !== TICKET_STATUS.CANCELED &&
    proximaEtapa !== atual;
  if (avancoDoParecer && (!ticket.macroServiceId || !ticket.serviceCatalogId)) {
    return 'Classifique o serviço (macroserviço + serviço) antes de avançar. Abra a OS completa para classificar.';
  }

  return null;
}
