import { describe, expect, it } from 'vitest';
import { activeSuspension } from '../../src/utils/agenda';
import { isTicketOpen } from '../../src/constants/ticketLifecycle';
import { ATTENTION_STATE, SUSPENSION_REASON } from '../../src/constants/agenda';
import { TICKET_STATUS } from '../../src/constants/ticketStatus';
import type { Ticket } from '../../src/types';

/**
 * A faixa da Inbox é JSX fino sobre estas duas decisões. O que precisa estar certo é
 * a decisão — qual das três frases a OS merece — e é isso que este teste amarra.
 */
const AGORA = new Date('2026-08-05T12:00:00Z');

const os = (over: Partial<Ticket> = {}): Ticket =>
  ({
    id: 'OS-0184',
    trackingToken: 't',
    subject: 'Troca de disjuntor',
    requester: 'Fulano',
    time: new Date('2026-07-01T12:00:00Z'),
    status: TICKET_STATUS.WAITING_TECH_OPINION,
    type: 'Corretiva',
    region: 'Benfica',
    sede: 'BN',
    sector: 'E-mail',
    priority: 'Trivial',
    history: [],
    ...over,
  }) as Ticket;

/** A mesma escolha que a faixa faz, isolada do JSX. */
function frase(ticket: Ticket, now: Date) {
  if (!isTicketOpen(ticket.status)) return 'nada';
  if (activeSuspension(ticket, now)) return 'suspensa';
  return ticket.nextAction?.dueAt ? 'proxima-acao' : 'sem-proxima-acao';
}

describe('o que a Inbox diz no topo da OS', () => {
  it('OS parada há meses na etapa dois diz "sem próxima ação", não um conselho genérico', () => {
    // É o caso de 163 das 270 OS. A faixa antiga repetia "registre o parecer técnico"
    // como se alguém estivesse a caminho de fazer isso.
    expect(frase(os(), AGORA)).toBe('sem-proxima-acao');
  });

  it('com ação definida, é a ação que aparece', () => {
    expect(frase(os({ nextAction: { what: 'Cobrar', dueAt: AGORA } }), AGORA)).toBe('proxima-acao');
  });

  it('suspensão vigente vence a próxima ação', () => {
    const t = os({
      nextAction: { what: 'Cobrar', dueAt: AGORA },
      attention: {
        state: ATTENTION_STATE.SUSPENDED,
        reason: SUSPENSION_REASON.NO_FUNDS,
        reviewAt: new Date('2026-08-20T12:00:00Z'),
      },
    });
    expect(frase(t, AGORA)).toBe('suspensa');
  });

  it('suspensão vencida devolve a OS para a cobrança', () => {
    const t = os({
      attention: {
        state: ATTENTION_STATE.SUSPENDED,
        reason: SUSPENSION_REASON.NO_FUNDS,
        reviewAt: new Date('2026-08-01T12:00:00Z'),
      },
    });
    expect(frase(t, AGORA)).toBe('sem-proxima-acao');
  });

  it('OS encerrada ou cancelada não cobra nada', () => {
    expect(frase(os({ status: TICKET_STATUS.CLOSED }), AGORA)).toBe('nada');
    expect(frase(os({ status: TICKET_STATUS.CANCELED }), AGORA)).toBe('nada');
  });
});
