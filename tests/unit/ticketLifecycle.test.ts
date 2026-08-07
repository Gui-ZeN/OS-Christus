import { describe, expect, it } from 'vitest';
import { LIFECYCLE, isTicketOpen, lifecycleOf } from '../../src/constants/ticketLifecycle';
import { TICKET_STATUS } from '../../src/constants/ticketStatus';
import { isTicketOpen as isTicketOpenBackend } from '../../api/_lib/statusFlow.js';

describe('lifecycleOf', () => {
  it('colapsa os 13 status nos 4 que a operação realmente distingue', () => {
    expect(lifecycleOf(TICKET_STATUS.NEW)).toBe(LIFECYCLE.NEW);
    expect(lifecycleOf(TICKET_STATUS.CLOSED)).toBe(LIFECYCLE.CLOSED);
    expect(lifecycleOf(TICKET_STATUS.CANCELED)).toBe(LIFECYCLE.CANCELED);

    // Os nove degraus do meio são a MESMA coisa para quem opera: tem gente mexendo.
    for (const status of [
      TICKET_STATUS.WAITING_TECH_OPINION,
      TICKET_STATUS.WAITING_SOLUTION_APPROVAL,
      TICKET_STATUS.WAITING_BUDGET,
      TICKET_STATUS.WAITING_BUDGET_APPROVAL,
      TICKET_STATUS.WAITING_CONTRACT_UPLOAD,
      TICKET_STATUS.WAITING_CONTRACT_APPROVAL,
      TICKET_STATUS.WAITING_PRELIM_ACTIONS,
      TICKET_STATUS.IN_PROGRESS,
      TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL,
      TICKET_STATUS.WAITING_PAYMENT,
    ]) {
      expect(lifecycleOf(status)).toBe(LIFECYCLE.ACTIVE);
    }
  });
});

describe('isTicketOpen', () => {
  it('só Encerrada e Cancelada saem do trabalho', () => {
    expect(isTicketOpen(TICKET_STATUS.IN_PROGRESS)).toBe(true);
    expect(isTicketOpen(TICKET_STATUS.CLOSED)).toBe(false);
    expect(isTicketOpen(TICKET_STATUS.CANCELED)).toBe(false);
  });

  it('status desconhecido ou vazio conta como VIVA', () => {
    // Sumir de uma tela de trabalho é pior que aparecer a mais: o erro que esconde
    // é o que ninguém descobre.
    expect(isTicketOpen('Status Que Nao Existe')).toBe(true);
    expect(isTicketOpen(undefined)).toBe(true);
    expect(isTicketOpen('')).toBe(true);
  });

  it('🔗 front e back respondem igual — são duas cópias que precisam concordar', () => {
    for (const status of [...Object.values(TICKET_STATUS), 'Inventado', '', undefined]) {
      expect(isTicketOpenBackend(status)).toBe(isTicketOpen(status));
    }
  });
});
