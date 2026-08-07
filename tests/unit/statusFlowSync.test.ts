import { describe, it, expect } from 'vitest';
import {
  TICKET_STATUS as BACK,
  isRetiredStatus as isRetiredBack,
  isValidStatus,
} from '../../api/_lib/statusFlow.js';
import { TICKET_STATUS as FRONT } from '../../src/constants/ticketStatus';
import { SELECTABLE_TICKET_STATUSES, getAllowedNextStatuses, isRetiredStatus } from '../../src/constants/statusFlow';

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
    const screens = ['inbox', 'finance', 'tracking'] as const;
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
  it('🚪 as etapas de aprovação da diretoria não podem mais ser ESCOLHIDAS', () => {
    // Não havia diretor: zero cadastrados. A aprovação passou a ser capturada do
    // e-mail de quem está em cópia.
    for (const aposentada of [
      FRONT.WAITING_SOLUTION_APPROVAL,
      FRONT.WAITING_BUDGET_APPROVAL,
      FRONT.WAITING_CONTRACT_APPROVAL,
    ]) {
      expect(isRetiredStatus(aposentada)).toBe(true);
      expect(SELECTABLE_TICKET_STATUSES).not.toContain(aposentada);
      expect(getAllowedNextStatuses('Admin', 'inbox', FRONT.WAITING_TECH_OPINION)).not.toContain(
        aposentada
      );
    }
  });

  it('mas as OS presas nelas continuam podendo SAIR', () => {
    // Duas OS estão paradas em "Aguardando Aprovação da Solução". Fechar a saída
    // junto com a entrada deixaria as duas sem para onde ir.
    const saidas = getAllowedNextStatuses('Admin', 'inbox', FRONT.WAITING_SOLUTION_APPROVAL);
    expect(saidas.length).toBeGreaterThan(0);
    expect(saidas).toContain(FRONT.IN_PROGRESS);
  });

  it('🔒 front e back concordam sobre o que está aposentado', () => {
    // O front esconde do seletor; o servidor RECUSA a gravação. Se as listas
    // divergirem, um cliente em cache recoloca a OS numa etapa que sumiu da tela —
    // e ninguém descobre, porque a tela não mostra mais aquela etapa.
    for (const status of Object.values(FRONT)) {
      expect(isRetiredBack(status)).toBe(isRetiredStatus(status));
    }
  });

  it('as três aposentadas continuam VÁLIDAS como valor', () => {
    // Duas OS estão paradas nelas. Recusar o valor inteiro deixaria as duas
    // impossíveis de ler.
    for (const s of [FRONT.WAITING_SOLUTION_APPROVAL, FRONT.WAITING_BUDGET_APPROVAL, FRONT.WAITING_CONTRACT_APPROVAL]) {
      expect(isValidStatus(s)).toBe(true);
      expect(isRetiredBack(s)).toBe(true);
    }
  });
});
