import { describe, it, expect } from 'vitest';
import { TICKET_STATUS, isValidStatus, canTransitionStatus } from '../../api/_lib/statusFlow.js';

describe('isValidStatus', () => {
  it('aceita todos os status do enum', () => {
    for (const status of Object.values(TICKET_STATUS)) {
      expect(isValidStatus(status)).toBe(true);
    }
  });
  it('rejeita status inexistente / vazio', () => {
    expect(isValidStatus('Status Inventado')).toBe(false);
    expect(isValidStatus('')).toBe(false);
    expect(isValidStatus(null)).toBe(false);
  });
});

describe('canTransitionStatus', () => {
  it('Admin e Gestor têm transição livre entre status válidos', () => {
    expect(canTransitionStatus('Admin', TICKET_STATUS.NEW, TICKET_STATUS.IN_PROGRESS)).toBe(true);
    expect(canTransitionStatus('Gestor', TICKET_STATUS.NEW, TICKET_STATUS.CLOSED)).toBe(true);
    expect(canTransitionStatus('Gestor', TICKET_STATUS.IN_PROGRESS, TICKET_STATUS.CANCELED)).toBe(true);
  });

  it('mesma origem e destino é sempre permitido', () => {
    expect(canTransitionStatus('Diretor', TICKET_STATUS.NEW, TICKET_STATUS.NEW)).toBe(true);
    expect(canTransitionStatus('Usuario', TICKET_STATUS.NEW, TICKET_STATUS.NEW)).toBe(true);
  });

  it('Diretor só aciona as transições do fluxo dele', () => {
    // aprovação da solução → orçamento (permitido)
    expect(canTransitionStatus('Diretor', TICKET_STATUS.WAITING_SOLUTION_APPROVAL, TICKET_STATUS.WAITING_BUDGET)).toBe(true);
    // aprovação do orçamento → anexo de contrato (permitido)
    expect(canTransitionStatus('Diretor', TICKET_STATUS.WAITING_BUDGET_APPROVAL, TICKET_STATUS.WAITING_CONTRACT_UPLOAD)).toBe(true);
    // qualquer papel de aprovação pode cancelar
    expect(canTransitionStatus('Diretor', TICKET_STATUS.WAITING_SOLUTION_APPROVAL, TICKET_STATUS.CANCELED)).toBe(true);
    // transição fora do fluxo do Diretor (bloqueada)
    expect(canTransitionStatus('Diretor', TICKET_STATUS.NEW, TICKET_STATUS.IN_PROGRESS)).toBe(false);
    expect(canTransitionStatus('Diretor', TICKET_STATUS.NEW, TICKET_STATUS.CLOSED)).toBe(false);
  });

  it('papéis sem gestão não transicionam pelo painel', () => {
    expect(canTransitionStatus('Usuario', TICKET_STATUS.NEW, TICKET_STATUS.IN_PROGRESS)).toBe(false);
    expect(canTransitionStatus(undefined, TICKET_STATUS.NEW, TICKET_STATUS.IN_PROGRESS)).toBe(false);
  });
});
