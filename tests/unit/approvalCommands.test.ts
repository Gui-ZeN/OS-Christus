import { describe, expect, it } from 'vitest';
import { HttpError } from '../../api/_lib/http.js';
import {
  normalizeIdempotencyKey,
  quoteRoundMatches,
  resolveAdditiveReturnStatus,
} from '../../api/_lib/approvalCommands.js';
import { TICKET_STATUS } from '../../api/_lib/statusFlow.js';

describe('approval commands', () => {
  it('aceita somente chaves de idempotência seguras para caminho do Firestore', () => {
    expect(normalizeIdempotencyKey('550e8400-e29b-41d4-a716-446655440000'))
      .toBe('550e8400-e29b-41d4-a716-446655440000');

    for (const invalid of ['', 'curta', 'com espaço', '../outro-doc', 'a'.repeat(101)]) {
      expect(() => normalizeIdempotencyKey(invalid)).toThrow(HttpError);
    }
  });

  it('devolve aditivo para execução quando a obra já começou', () => {
    expect(resolveAdditiveReturnStatus({
      executionProgress: { currentPercent: 10 },
    })).toBe(TICKET_STATUS.IN_PROGRESS);
    expect(resolveAdditiveReturnStatus({
      preliminaryActions: { actualStartAt: new Date() },
    })).toBe(TICKET_STATUS.IN_PROGRESS);
  });

  it('devolve aditivo para ações preliminares quando a execução ainda não começou', () => {
    expect(resolveAdditiveReturnStatus({
      executionProgress: { currentPercent: 0, startedAt: null },
      preliminaryActions: { actualStartAt: null },
    })).toBe(TICKET_STATUS.WAITING_PRELIM_ACTIONS);
  });

  it('isola cotações por rodada inicial e por aditivo', () => {
    expect(quoteRoundMatches(
      { category: 'initial', initialRoundIndex: 2 },
      'initial',
      2,
      null
    )).toBe(true);
    expect(quoteRoundMatches(
      { category: 'initial', initialRoundIndex: 1 },
      'initial',
      2,
      null
    )).toBe(false);
    expect(quoteRoundMatches(
      { category: 'additive', additiveIndex: 3 },
      'additive',
      null,
      3
    )).toBe(true);
  });
});
