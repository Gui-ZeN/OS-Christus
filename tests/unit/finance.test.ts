import { describe, expect, it } from 'vitest';
import {
  calculateProgressPercentFromGross,
  getAttachmentPreviewKind,
  getEffectiveDynamicPayments,
  getGuaranteeDaysRemaining,
  isLegacyMilestonePlaceholder,
  isTicketInGuarantee,
  resolveAccumulatedGross,
  resolveExpectedBaselineValue,
  sortPaymentsByInstallment,
  sumPaidValue,
  sumPlannedValue,
  upsertDynamicPayment,
} from '../../src/utils/finance';
import type { ContractRecord, MeasurementRecord, PaymentRecord } from '../../src/types';

function payment(overrides: Partial<PaymentRecord> = {}) {
  return { id: 'p1', status: 'pending', value: '', grossValue: '', ...overrides } as PaymentRecord;
}

function measurement(overrides: Partial<MeasurementRecord> = {}) {
  return { id: 'm1', status: 'approved', grossValue: '', ...overrides } as MeasurementRecord;
}

describe('resolveAccumulatedGross', () => {
  // Regressão do drift de 99,99%: reconstruir de `baseline × percent` com o percent
  // arredondado a 2 casas fazia o erro compor e a obra 100% paga travava em 99,99%.
  it('usa a soma real das medições, sem drift de arredondamento', () => {
    const baseline = 60000;
    const medicoes = [
      measurement({ id: 'm1', grossValue: '30000' }),
      measurement({ id: 'm2', grossValue: '10000' }),
      measurement({ id: 'm3', grossValue: '10000' }),
      measurement({ id: 'm4', grossValue: '10000' }),
    ];
    // percent acumulado como a UI grava (2 casas), já carregando o erro
    const percentComDrift = 99.99;
    expect(resolveAccumulatedGross(medicoes, baseline, percentComDrift)).toBe(60000);
    expect(calculateProgressPercentFromGross(60000, baseline)).toBe(100);
  });

  it('cai na reconstrução quando as medições legadas não têm grossValue', () => {
    const legadas = [measurement({ grossValue: '' })];
    expect(resolveAccumulatedGross(legadas, 50000, 40)).toBe(20000);
  });

  it('nunca devolve menos que a reconstrução (rede para dado legado parcial)', () => {
    const parciais = [measurement({ grossValue: '5000' })];
    expect(resolveAccumulatedGross(parciais, 50000, 40)).toBe(20000);
  });

  it('sem medição e sem baseline devolve zero', () => {
    expect(resolveAccumulatedGross([], 0, 0)).toBe(0);
  });
});

describe('calculateProgressPercentFromGross', () => {
  it('arredonda a 2 casas', () => {
    expect(calculateProgressPercentFromGross(3333, 10000)).toBe(33.33);
  });

  it('protege contra baseline zerado e valores inválidos', () => {
    expect(calculateProgressPercentFromGross(1000, 0)).toBe(0);
    expect(calculateProgressPercentFromGross(-1, 100)).toBe(0);
    expect(calculateProgressPercentFromGross(Number.NaN, 100)).toBe(0);
  });
});

describe('resolveExpectedBaselineValue', () => {
  it('prefere o valor inicial do contrato ao valor atual (que já pode ter aditivo)', () => {
    const contrato = { initialPlannedValue: '50000', value: '65000' } as ContractRecord;
    expect(resolveExpectedBaselineValue(contrato, [])).toBe(50000);
  });

  it('cai para o baseline gravado no lançamento quando o contrato não tem inicial', () => {
    const contrato = { value: '65000' } as ContractRecord;
    expect(resolveExpectedBaselineValue(contrato, [payment({ expectedBaselineValue: '48000' })])).toBe(
      48000
    );
  });

  it('depois cai para o valor do contrato e, por fim, para o do lançamento', () => {
    expect(resolveExpectedBaselineValue({ value: '65000' } as ContractRecord, [])).toBe(65000);
    expect(resolveExpectedBaselineValue(undefined, [payment({ value: '1200' })])).toBe(1200);
    expect(resolveExpectedBaselineValue(undefined, [])).toBe(0);
  });
});

describe('somas de lançamento', () => {
  it('sumPaidValue conta só o que foi pago, preferindo o bruto', () => {
    const lancamentos = [
      payment({ id: 'a', status: 'paid', grossValue: '1000', value: '900' }),
      payment({ id: 'b', status: 'paid', value: '500' }),
      payment({ id: 'c', status: 'pending', grossValue: '9999' }),
    ];
    expect(sumPaidValue(lancamentos)).toBe(1500);
  });

  it('sumPlannedValue soma todos, pagos ou não', () => {
    expect(sumPlannedValue([payment({ value: '100' }), payment({ value: '250' })])).toBe(350);
  });
});

describe('isLegacyMilestonePlaceholder', () => {
  it('marca o marco vazio herdado do fluxo antigo', () => {
    expect(isLegacyMilestonePlaceholder(payment({ status: 'pending' }))).toBe(true);
  });

  it('qualquer sinal de conteúdo real desqualifica o placeholder', () => {
    expect(isLegacyMilestonePlaceholder(payment({ grossValue: '10' }))).toBe(false);
    expect(isLegacyMilestonePlaceholder(payment({ measurementId: 'm1' }))).toBe(false);
    expect(isLegacyMilestonePlaceholder(payment({ receiptFileName: 'nf.pdf' }))).toBe(false);
    expect(isLegacyMilestonePlaceholder(payment({ attachments: [{ name: 'x' }] as never }))).toBe(false);
  });

  it('lançamento pago nunca é placeholder', () => {
    expect(isLegacyMilestonePlaceholder(payment({ status: 'paid' }))).toBe(false);
  });
});

describe('getEffectiveDynamicPayments', () => {
  it('quando só há placeholders legados, monta os lançamentos a partir das medições', () => {
    const resultado = getEffectiveDynamicPayments(
      [payment({ id: 'legado' })],
      [
        measurement({ id: 'm2', grossValue: '2000', requestedAt: new Date('2026-02-01') }),
        measurement({ id: 'm1', grossValue: '1000', requestedAt: new Date('2026-01-01') }),
      ],
      'Fornecedor X',
      2
    );
    // ordenado por data da medição, numerado na sequência
    expect(resultado.map(p => p.id)).toEqual(['measurement-payment-m1', 'measurement-payment-m2']);
    expect(resultado.map(p => p.installmentNumber)).toEqual([1, 2]);
    expect(resultado[0].vendor).toBe('Fornecedor X');
  });

  it('descarta medição sem valor bruto', () => {
    const resultado = getEffectiveDynamicPayments(
      [],
      [measurement({ id: 'm1', grossValue: '' }), measurement({ id: 'm2', grossValue: '500' })],
      'F',
      1
    );
    expect(resultado.map(p => p.id)).toEqual(['measurement-payment-m2']);
  });

  it('havendo lançamento real, os placeholders legados somem da lista', () => {
    const resultado = getEffectiveDynamicPayments(
      [payment({ id: 'legado' }), payment({ id: 'real', grossValue: '100', installmentNumber: 1 })],
      [measurement({ grossValue: '999' })],
      'F',
      1
    );
    expect(resultado.map(p => p.id)).toEqual(['real']);
  });
});

describe('upsertDynamicPayment', () => {
  it('substitui pelo id em vez de duplicar', () => {
    const existente = payment({ id: 'p1', grossValue: '100', installmentNumber: 1 });
    const atualizado = payment({ id: 'p1', grossValue: '250', installmentNumber: 1 });
    const resultado = upsertDynamicPayment([existente], atualizado);
    expect(resultado).toHaveLength(1);
    expect(resultado[0].grossValue).toBe('250');
  });

  it('insere o novo e mantém a ordem por parcela', () => {
    const resultado = upsertDynamicPayment(
      [payment({ id: 'p2', grossValue: '10', installmentNumber: 2 })],
      payment({ id: 'p1', grossValue: '10', installmentNumber: 1 })
    );
    expect(resultado.map(p => p.id)).toEqual(['p1', 'p2']);
  });

  it('a gravação também limpa os placeholders legados', () => {
    const resultado = upsertDynamicPayment(
      [payment({ id: 'legado' })],
      payment({ id: 'novo', grossValue: '10', installmentNumber: 1 })
    );
    expect(resultado.map(p => p.id)).toEqual(['novo']);
  });
});

describe('sortPaymentsByInstallment', () => {
  it('sem número de parcela, desempata por vencimento e depois por id', () => {
    const lista = [
      payment({ id: 'c', dueAt: new Date('2026-03-01') }),
      payment({ id: 'a', dueAt: new Date('2026-01-01') }),
      payment({ id: 'b', dueAt: new Date('2026-01-01') }),
    ];
    expect([...lista].sort(sortPaymentsByInstallment).map(p => p.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('garantia', () => {
  it('conta os dias restantes ignorando a hora do dia', () => {
    const hoje = new Date();
    const daquiA10 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 10, 23, 59);
    expect(getGuaranteeDaysRemaining({ endAt: daquiA10 } as never)).toBe(10);
  });

  it('o último dia ainda está na garantia; o dia seguinte, não', () => {
    const hoje = new Date();
    const fimHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
    const ontem = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1);
    expect(isTicketInGuarantee({ endAt: fimHoje } as never)).toBe(true);
    expect(isTicketInGuarantee({ endAt: ontem } as never)).toBe(false);
  });

  it('sem data de fim não há garantia apurável', () => {
    expect(getGuaranteeDaysRemaining(null)).toBeNull();
    expect(isTicketInGuarantee(null)).toBe(false);
  });
});

describe('getAttachmentPreviewKind', () => {
  it('classifica por content-type e, na falta dele, pela extensão', () => {
    expect(getAttachmentPreviewKind('image/png', null)).toBe('image');
    expect(getAttachmentPreviewKind(null, 'foto.JPEG')).toBe('image');
    expect(getAttachmentPreviewKind('application/pdf', null)).toBe('pdf');
    expect(getAttachmentPreviewKind(null, 'contrato.pdf')).toBe('pdf');
    expect(getAttachmentPreviewKind(null, 'planilha.xlsx')).toBe('file');
  });
});
