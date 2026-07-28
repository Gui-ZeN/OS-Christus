import { describe, expect, it } from 'vitest';
import {
  buildClosureExportHtml,
  createClosureFormState,
  escapeHtml,
  getFinalInstallmentBlockingReasons,
  type ClosureFormState,
} from '../../src/utils/financeClosure';
import { TICKET_STATUS } from '../../src/constants/ticketStatus';
import type { ContractRecord, MeasurementRecord, PaymentRecord, Ticket } from '../../src/types';

function ticket(overrides: Partial<Ticket> = {}) {
  return {
    id: 'OS-0100',
    subject: 'Troca de bomba',
    status: TICKET_STATUS.WAITING_PAYMENT,
    ...overrides,
  } as Ticket;
}

function draftCompleto(overrides: Partial<ClosureFormState> = {}): ClosureFormState {
  return {
    infrastructureApprovalPrimary: true,
    infrastructureApprovalSecondary: true,
    serviceStartedAt: '2026-01-05',
    serviceCompletedAt: '2026-02-10',
    guaranteeMonths: '12',
    closureNotes: '',
    ...overrides,
  };
}

describe('getFinalInstallmentBlockingReasons', () => {
  it('checklist completo em WAITING_PAYMENT libera o lançamento final', () => {
    expect(getFinalInstallmentBlockingReasons(ticket(), draftCompleto())).toEqual([]);
  });

  it('acumula todos os pendentes de uma vez (não para no primeiro)', () => {
    const vazio = draftCompleto({
      infrastructureApprovalPrimary: false,
      infrastructureApprovalSecondary: false,
      serviceStartedAt: '',
      serviceCompletedAt: '',
      guaranteeMonths: '0',
    });
    expect(getFinalInstallmentBlockingReasons(ticket(), vazio)).toEqual([
      'Aprovação técnica 1 pendente',
      'Aprovação técnica 2 pendente',
      'Início do serviço não informado',
      'Término do serviço não informado',
      'Garantia inválida',
    ]);
  });

  it('garantia precisa ser número positivo', () => {
    const razoes = (guaranteeMonths: string) =>
      getFinalInstallmentBlockingReasons(ticket(), draftCompleto({ guaranteeMonths }));
    expect(razoes('abc')).toContain('Garantia inválida');
    expect(razoes('-3')).toContain('Garantia inválida');
    expect(razoes('6')).toEqual([]);
  });

  it('antes da etapa de pagamento, bloqueia com o motivo do estágio', () => {
    expect(
      getFinalInstallmentBlockingReasons(
        ticket({ status: TICKET_STATUS.WAITING_MAINTENANCE_APPROVAL }),
        draftCompleto()
      )
    ).toEqual(['Validação do solicitante pendente']);

    expect(
      getFinalInstallmentBlockingReasons(
        ticket({ status: TICKET_STATUS.WAITING_PRELIM_ACTIONS }),
        draftCompleto()
      )
    ).toEqual(['A OS ainda não entrou na etapa final de pagamento']);
  });

  it('OS encerrada continua avaliando o checklist', () => {
    const semAprovacao = draftCompleto({ infrastructureApprovalPrimary: false });
    expect(
      getFinalInstallmentBlockingReasons(ticket({ status: TICKET_STATUS.CLOSED }), semAprovacao)
    ).toEqual(['Aprovação técnica 1 pendente']);
  });

  // ATENÇÃO — comportamento atual, não endosso: em IN_PROGRESS a função devolve
  // lista vazia (= nada bloqueia), mesmo com o checklist inteiro por preencher.
  // É o item P2 do backlog ("último lançamento quitável em IN_PROGRESS sem
  // validação"). O teste existe para que mudar isso seja uma decisão consciente.
  it('IN_PROGRESS não bloqueia nada, mesmo sem checklist (P2 conhecido)', () => {
    const vazio = draftCompleto({
      infrastructureApprovalPrimary: false,
      infrastructureApprovalSecondary: false,
      serviceStartedAt: '',
      serviceCompletedAt: '',
      guaranteeMonths: '0',
    });
    expect(
      getFinalInstallmentBlockingReasons(ticket({ status: TICKET_STATUS.IN_PROGRESS }), vazio)
    ).toEqual([]);
  });
});

describe('createClosureFormState', () => {
  it('sem checklist, parte de tudo pendente e 12 meses de garantia', () => {
    expect(createClosureFormState()).toEqual({
      infrastructureApprovalPrimary: false,
      infrastructureApprovalSecondary: false,
      serviceStartedAt: '',
      serviceCompletedAt: '',
      guaranteeMonths: '12',
      closureNotes: '',
    });
  });

  it('hidrata do checklist salvo, com datas no formato do input', () => {
    const estado = createClosureFormState(
      {
        infrastructureApprovalPrimary: true,
        serviceStartedAt: new Date('2026-01-05T12:00:00Z'),
        closureNotes: 'obra ok',
      } as never,
      { months: 24 } as never
    );
    expect(estado.infrastructureApprovalPrimary).toBe(true);
    expect(estado.serviceStartedAt).toBe('2026-01-05');
    expect(estado.guaranteeMonths).toBe('24');
    expect(estado.closureNotes).toBe('obra ok');
  });

  it('garantia zerada cai no padrão de 12 meses', () => {
    expect(createClosureFormState(undefined, { months: 0 } as never).guaranteeMonths).toBe('12');
  });
});

describe('escapeHtml', () => {
  it('neutraliza o que quebraria a marcação do relatório', () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;'
    );
  });
});

describe('buildClosureExportHtml', () => {
  const contrato = { value: '10000', items: [] } as unknown as ContractRecord;

  it('lista medições e lançamentos e informa quando não há nenhum', () => {
    const html = buildClosureExportHtml(ticket(), contrato, [], [], 10000, 4000, [], []);
    expect(html).toContain('Nenhuma medição registrada.');
    expect(html).toContain('Nenhum lançamento registrado.');
    expect(html).toContain('Escopo contratado não informado.');
    expect(html).toContain('OS-0100');
  });

  it('escapa dados vindos do usuário (assunto e rótulos não injetam HTML)', () => {
    const medicoes = [
      { id: 'm1', label: '<script>alert(1)</script>', progressPercent: 50, releasePercent: 50 },
    ] as unknown as MeasurementRecord[];
    const html = buildClosureExportHtml(
      ticket({ subject: '<b>xss</b>' }),
      contrato,
      medicoes,
      [],
      1,
      1,
      [],
      []
    );
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;b&gt;xss&lt;/b&gt;');
  });

  it('traduz o status do lançamento para o rótulo do relatório', () => {
    const lancamentos = [
      { id: 'p1', label: 'Parcela 1', value: '500', status: 'paid', releasedPercent: 50 },
    ] as unknown as PaymentRecord[];
    const html = buildClosureExportHtml(ticket(), contrato, [], lancamentos, 1000, 500, [], []);
    expect(html).toContain('Parcela 1');
    expect(html).toContain('Pago');
  });
});
