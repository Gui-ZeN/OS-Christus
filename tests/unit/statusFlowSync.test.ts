import { describe, it, expect } from 'vitest';
import { TICKET_STATUS as BACK, isValidStatus } from '../../api/_lib/statusFlow.js';
import { TICKET_STATUS as FRONT } from '../../src/constants/ticketStatus';
import { getAllowedNextStatuses } from '../../src/constants/statusFlow';

// Guarda de drift: o enum de status vive em DOIS lugares — `src/constants/
// ticketStatus.ts` (front, com `as const` para o tipo-união) e `api/_lib/
// statusFlow.js` (back, JS puro). Como front/back são deploys separados e o front
// precisa dos literais, não dá para um arquivo único sem acoplar os builds. Este
// teste é a fonte única na prática: se alguém mudar um status de um lado só, o CI
// falha antes do merge — um status válido na tela e rejeitado no servidor (ou o
// contrário) nunca chega em produção.
describe('statusFlow — front e back em sincronia', () => {
  it('o enum TICKET_STATUS é idêntico dos dois lados', () => {
    expect(FRONT).toEqual(BACK);
  });

  it('toda transição que o front oferece aponta para um status que o back reconhece', () => {
    const roles = ['Admin', 'Gestor', 'Diretor'] as const;
    const screens = ['inbox', 'approvals', 'finance', 'tracking'] as const;
    const desconhecidos = new Set<string>();
    for (const role of roles) {
      for (const screen of screens) {
        for (const status of Object.values(FRONT)) {
          for (const next of getAllowedNextStatuses(role, screen, status)) {
            if (!isValidStatus(next)) desconhecidos.add(next);
          }
        }
      }
    }
    expect([...desconhecidos]).toEqual([]);
  });
});
