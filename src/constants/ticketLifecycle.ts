import { TICKET_STATUS, type TicketStatus } from './ticketStatus';

/**
 * CICLO DE VIDA DA OS — o eixo grosso, com quatro valores.
 *
 * A esteira de 13 status descreve *por qual degrau burocrático a OS passou*. Os dados
 * de produção mostram que ela não descreve a realidade: das 270 OS, 163 (60%) estão
 * paradas no segundo degrau e quatro status nunca foram usados uma única vez.
 *
 * O que o código realmente pergunta, em uma dúzia de lugares, é bem mais simples:
 * **esta OS ainda está viva?** — e a resposta estava copiada em cada um deles como
 * `status !== 'Encerrada' && status !== 'Cancelada'`. Uma cópia esquecida é uma tela
 * contando OS morta como trabalho pendente.
 *
 * Isto NÃO substitui `TICKET_STATUS`: o status continua sendo gravado e exibido como
 * sempre. Aqui é só a leitura grossa, que é a que quase todo lugar precisa.
 */
export const LIFECYCLE = {
  /** Entrou e ninguém triou ainda. */
  NEW: 'nova',
  /** Alguém está tocando — qualquer degrau entre a triagem e o encerramento. */
  ACTIVE: 'ativa',
  CLOSED: 'encerrada',
  CANCELED: 'cancelada',
} as const;

export type Lifecycle = (typeof LIFECYCLE)[keyof typeof LIFECYCLE];

export function lifecycleOf(status: TicketStatus | string | undefined | null): Lifecycle {
  if (status === TICKET_STATUS.CLOSED) return LIFECYCLE.CLOSED;
  if (status === TICKET_STATUS.CANCELED) return LIFECYCLE.CANCELED;
  if (status === TICKET_STATUS.NEW) return LIFECYCLE.NEW;
  return LIFECYCLE.ACTIVE;
}

/**
 * A OS ainda exige trabalho?
 *
 * Status desconhecido conta como VIVA de propósito: some de uma tela de trabalho é
 * pior que aparecer a mais — o erro que esconde é o que ninguém descobre.
 */
export function isTicketOpen(status: TicketStatus | string | undefined | null): boolean {
  const life = lifecycleOf(status);
  return life !== LIFECYCLE.CLOSED && life !== LIFECYCLE.CANCELED;
}
