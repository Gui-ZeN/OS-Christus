import { describe, expect, it } from 'vitest';
import { HttpError } from '../../api/_lib/http.js';
import {
  calculateMeasurementProgress,
  normalizeFinanceRecipients,
  resolvePaymentClosure,
} from '../../api/_lib/financeCommands.js';
import { TICKET_STATUS } from '../../api/_lib/statusFlow.js';

describe('finance commands', () => {
  it('normaliza e remove destinatários duplicados', () => {
    expect(normalizeFinanceRecipients([
      ' Financeiro@Empresa.com.br ',
      'financeiro@empresa.com.br',
      'outro@empresa.com.br',
      'inválido',
    ])).toEqual([
      'financeiro@empresa.com.br',
      'outro@empresa.com.br',
    ]);
  });

  it('exige ao menos um destinatário válido', () => {
    expect(() => normalizeFinanceRecipients(['', 'sem-email'])).toThrow(HttpError);
  });

  it('calcula andamento com o acumulado atual da transação', () => {
    expect(calculateMeasurementProgress({
      baselineValue: 100_000,
      currentPercent: 20,
      measuredGross: 30_000,
      newGross: 10_000,
    })).toEqual({
      accumulatedGross: 40_000,
      progressPercent: 40,
      releasePercent: 20,
    });
  });

  it('não encerra fora da etapa financeira final', () => {
    const result = resolvePaymentClosure({
      status: TICKET_STATUS.IN_PROGRESS,
      closureChecklist: null,
      guarantee: null,
    }, true, {});

    expect(result.canClose).toBe(false);
    expect(result.nextStatus).toBe(TICKET_STATUS.IN_PROGRESS);
  });

  it('encerra com checklist completo e inicia a garantia', () => {
    const now = new Date('2026-07-23T12:00:00.000Z');
    const result = resolvePaymentClosure({
      status: TICKET_STATUS.WAITING_PAYMENT,
      closureChecklist: {
        requesterApproved: true,
        documents: [],
      },
    }, true, {
      infrastructureApprovalPrimary: true,
      infrastructureApprovalSecondary: true,
      serviceStartedAt: '2026-07-01T12:00:00.000Z',
      serviceCompletedAt: '2026-07-20T12:00:00.000Z',
      guaranteeMonths: '12',
      closureNotes: 'Concluído.',
    }, now);

    expect(result.canClose).toBe(true);
    expect(result.nextStatus).toBe(TICKET_STATUS.CLOSED);
    expect(result.closureChecklist?.requesterApproved).toBe(true);
    expect(result.guarantee?.months).toBe(12);
    expect(result.guarantee?.status).toBe('active');
  });

  it('bloqueia o último pagamento quando o checklist está incompleto', () => {
    expect(() => resolvePaymentClosure({
      status: TICKET_STATUS.WAITING_PAYMENT,
    }, true, {
      infrastructureApprovalPrimary: false,
      infrastructureApprovalSecondary: true,
      serviceStartedAt: '',
      serviceCompletedAt: '',
      guaranteeMonths: '0',
    })).toThrow(HttpError);
  });
});
