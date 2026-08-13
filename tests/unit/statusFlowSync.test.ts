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
  it('🚪 a aprovação de CONTRATO continua sem entrada', () => {
    // Único marco dos três que a coordenação não acompanha na planilha — sem
    // evidência de que o passo exista fora do sistema.
    expect(isRetiredStatus(FRONT.WAITING_CONTRACT_APPROVAL)).toBe(true);
    expect(SELECTABLE_TICKET_STATUSES).not.toContain(FRONT.WAITING_CONTRACT_APPROVAL);
  });

  it('mas as OS presas nela continuam podendo SAIR', () => {
    // Fechar a saída junto com a entrada deixaria sem para onde ir quem já está lá.
    const saidas = getAllowedNextStatuses('Admin', 'inbox', FRONT.WAITING_CONTRACT_APPROVAL);
    expect(saidas.length).toBeGreaterThan(0);
    expect(saidas).toContain(FRONT.IN_PROGRESS);
  });

  /**
   * O TESTE QUE TERIA PEGO O PROBLEMA DE 07/08.
   *
   * Aposentei as três etapas de aprovação de uma vez medindo que ninguém aprovava no
   * sistema — verdade sobre o mecanismo, falso sobre o passo. Resultado: o servidor
   * recusava com 409 a casa seguinte à visita técnica, e das 85 saídas medidas de
   * "Aguardando Parecer Técnico" 64 foram direto para Encerrada e só 4 para
   * Orçamento. A planilha da coordenação tem 226 datas de aprovação da solução e 49
   * solicitações paradas nela hoje.
   *
   * Se alguém reaposentar as duas sem trazer evidência nova de que o passo sumiu da
   * operação, cai aqui.
   */
  it('✅ o caminho da operação real está aberto: visita → aprovação → orçamento → aprovação', () => {
    const reabertas = [FRONT.WAITING_SOLUTION_APPROVAL, FRONT.WAITING_BUDGET_APPROVAL];
    for (const etapa of reabertas) {
      expect(isRetiredStatus(etapa)).toBe(false);
      expect(isRetiredBack(etapa)).toBe(false);
      expect(SELECTABLE_TICKET_STATUSES).toContain(etapa);
    }

    // As duas pontes que estavam quebradas, cada uma a partir de quem a antecede.
    expect(getAllowedNextStatuses('Admin', 'inbox', FRONT.WAITING_TECH_OPINION)).toContain(
      FRONT.WAITING_SOLUTION_APPROVAL
    );
    expect(getAllowedNextStatuses('Admin', 'inbox', FRONT.WAITING_BUDGET)).toContain(
      FRONT.WAITING_BUDGET_APPROVAL
    );
  });

  it('a esteira continua PERMISSIVA — pular etapa é o caso comum, não o desvio', () => {
    // 45% das linhas da planilha pulam etapa e 45% das concluídas nunca registraram
    // início de execução. Exigir sequência completa modelaria um processo que a
    // operação não executa.
    const daVisita = getAllowedNextStatuses('Admin', 'inbox', FRONT.WAITING_TECH_OPINION);
    expect(daVisita).toContain(FRONT.WAITING_BUDGET); // pula a aprovação
    expect(daVisita).toContain(FRONT.CLOSED); // encerra direto
    expect(getAllowedNextStatuses('Admin', 'inbox', FRONT.WAITING_SOLUTION_APPROVAL)).toContain(
      FRONT.IN_PROGRESS // pula orçamento e ações preliminares
    );
  });

  it('🔒 front e back concordam sobre o que está aposentado', () => {
    // O front esconde do seletor; o servidor RECUSA a gravação. Se as listas
    // divergirem, um cliente em cache recoloca a OS numa etapa que sumiu da tela —
    // e ninguém descobre, porque a tela não mostra mais aquela etapa.
    for (const status of Object.values(FRONT)) {
      expect(isRetiredBack(status)).toBe(isRetiredStatus(status));
    }
  });

  it('as etapas de aprovação continuam VÁLIDAS como valor', () => {
    // OS antigas estão paradas nelas. Recusar o valor inteiro as deixaria
    // impossíveis de ler — vale tanto para a reaberta quanto para a aposentada.
    for (const s of [FRONT.WAITING_SOLUTION_APPROVAL, FRONT.WAITING_BUDGET_APPROVAL, FRONT.WAITING_CONTRACT_APPROVAL]) {
      expect(isValidStatus(s)).toBe(true);
    }
    expect(isRetiredBack(FRONT.WAITING_CONTRACT_APPROVAL)).toBe(true);
  });
});
