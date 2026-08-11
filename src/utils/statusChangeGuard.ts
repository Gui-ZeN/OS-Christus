import { TICKET_STATUS } from '../constants/ticketStatus';
import type { Ticket } from '../types';

/**
 * Regras que dependem do CONTEÚDO da OS, não do papel de quem mexe.
 *
 * `canTransitionStatus` responde "esta pessoa pode ir daqui para ali". Isto responde
 * outra coisa: "esta OS está pronta para ir". A diferença importa porque a segunda
 * pergunta vale para qualquer tela — e até pouco tempo atrás a resposta morava dentro
 * do `handleSend` do InboxView, 210 linhas abaixo de onde alguém iria procurar.
 *
 * Enquanto ela ficasse lá, qualquer tela nova que trocasse etapa nasceria como
 * atalho para burlar a regra — sem ninguém perceber, porque o InboxView continuaria
 * cobrando certo.
 */

/**
 * O que impede esta OS de avançar, sem perguntar para onde.
 *
 * Existe porque a trava só se manifestava quando alguém TENTAVA avançar — e como
 * quase ninguém tenta, 88 das 158 OS em Parecer Técnico estão paradas por um motivo
 * que ninguém sabe que existe. A pessoa não vê "falta classificar"; vê uma OS parada.
 *
 * `campo` diz o que precisa ser preenchido, para a tela oferecer o preenchimento ali
 * mesmo em vez de mandar a pessoa para outro lugar. Bloqueio que vira só um aviso
 * cria uma segunda fila — mais honesta e igualmente parada.
 *
 * A lista tende a crescer: a classificação provavelmente não é a única trava
 * silenciosa, e é por isso que isto responde "por que não anda" em vez de
 * "está classificada?".
 */
export function bloqueioParaAvancar(
  ticket: Ticket
): { motivo: string; campo: 'classificacao' } | null {
  if (
    ticket.status === TICKET_STATUS.WAITING_TECH_OPINION &&
    (!ticket.macroServiceId || !ticket.serviceCatalogId)
  ) {
    return { motivo: 'Falta classificar o serviço', campo: 'classificacao' };
  }
  return null;
}

/**
 * O motivo do bloqueio para UM destino, em português (a frase vai direto para a
 * tela), ou `null` quando não há impedimento.
 */
export function motivoQueImpedeEtapa(ticket: Ticket, proximaEtapa: string): string | null {
  const atual = String(ticket.status || '');

  // Sair do Parecer Técnico exige o serviço classificado. A classificação pode ser
  // adiada na triagem — o que não pode é ser esquecida, e este é o momento em que
  // ela deixa de ser adiável. Cancelar continua livre: OS que não vai acontecer não
  // precisa ser classificada para morrer.
  const avancoDoParecer =
    atual === TICKET_STATUS.WAITING_TECH_OPINION &&
    proximaEtapa !== TICKET_STATUS.CANCELED &&
    proximaEtapa !== atual;
  if (avancoDoParecer && (!ticket.macroServiceId || !ticket.serviceCatalogId)) {
    return 'Classifique o serviço para avançar.';
  }

  return null;
}
