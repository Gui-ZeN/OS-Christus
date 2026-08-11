import { describe, expect, it } from 'vitest';
import { bloqueioParaAvancar, motivoQueImpedeEtapa } from '../../src/utils/statusChangeGuard';
import { TICKET_STATUS } from '../../src/constants/ticketStatus';
import type { Ticket } from '../../src/types';

const os = (over: Partial<Ticket> = {}): Ticket =>
  ({
    id: 'OS-0184',
    subject: 'Troca de disjuntor',
    status: TICKET_STATUS.WAITING_TECH_OPINION,
    ...over,
  }) as Ticket;

describe('bloqueioParaAvancar — por que esta OS não anda, sem perguntar para onde', () => {
  // 88 das 158 OS em Parecer Técnico estão neste estado, e ninguém sabia: a trava
  // só se manifestava para quem TENTAVA avançar.
  it('acusa a classificação faltando', () => {
    expect(bloqueioParaAvancar(os())).toEqual({
      motivo: 'Falta classificar o serviço',
      campo: 'classificacao',
    });
  });

  it('macroserviço sozinho não basta — os dois campos travam', () => {
    expect(bloqueioParaAvancar(os({ macroServiceId: 'm1' }))?.campo).toBe('classificacao');
    expect(bloqueioParaAvancar(os({ serviceCatalogId: 's1' }))?.campo).toBe('classificacao');
  });

  it('classificada não tem bloqueio', () => {
    expect(bloqueioParaAvancar(os({ macroServiceId: 'm1', serviceCatalogId: 's1' }))).toBeNull();
  });

  // A trava é de SAÍDA do Parecer Técnico. Em outra etapa não há o que acusar.
  it('só vale na etapa que tem a trava', () => {
    expect(bloqueioParaAvancar(os({ status: TICKET_STATUS.IN_PROGRESS }))).toBeNull();
    expect(bloqueioParaAvancar(os({ status: TICKET_STATUS.NEW }))).toBeNull();
  });
});

describe('motivoQueImpedeEtapa — o bloqueio para UM destino', () => {
  it('impede avançar sem classificação', () => {
    expect(motivoQueImpedeEtapa(os(), TICKET_STATUS.WAITING_BUDGET)).toMatch(/Classifique/i);
  });

  // OS que não vai acontecer não precisa ser classificada para morrer.
  it('cancelar continua livre', () => {
    expect(motivoQueImpedeEtapa(os(), TICKET_STATUS.CANCELED)).toBeNull();
  });

  it('classificada avança', () => {
    expect(
      motivoQueImpedeEtapa(
        os({ macroServiceId: 'm1', serviceCatalogId: 's1' }),
        TICKET_STATUS.WAITING_BUDGET
      )
    ).toBeNull();
  });

  it('ficar na mesma etapa não é avançar', () => {
    expect(motivoQueImpedeEtapa(os(), TICKET_STATUS.WAITING_TECH_OPINION)).toBeNull();
  });
});
