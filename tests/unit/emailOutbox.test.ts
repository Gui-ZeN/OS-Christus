import { describe, expect, it } from 'vitest';
import { HttpError } from '../../api/_lib/http.js';
import {
  describeEmailOutboxType,
  EMAIL_OUTBOX_TYPES,
  getEmailOutboxRetryDelayMs,
  isEmailOutboxEligible,
  isEmailOutboxLeaseActive,
  isKnownEmailOutboxType,
  MAX_EMAIL_OUTBOX_ATTEMPTS,
  normalizeOutboxKey,
} from '../../api/_lib/emailOutbox.js';

describe('tipos da outbox (fila generalizada)', () => {
  it('reconhece os tipos suportados e rejeita desconhecido (falha fechada)', () => {
    expect(isKnownEmailOutboxType(EMAIL_OUTBOX_TYPES.FINANCE_PAYMENT)).toBe(true);
    expect(isKnownEmailOutboxType(EMAIL_OUTBOX_TYPES.MANAGER_NEW_TICKET)).toBe(true);
    expect(isKnownEmailOutboxType('qualquer.coisa')).toBe(false);
    expect(isKnownEmailOutboxType(undefined)).toBe(false);
  });

  it('descreve o tipo no alerta de dead-letter (não diz mais "financeiro" para tudo)', () => {
    expect(describeEmailOutboxType(EMAIL_OUTBOX_TYPES.FINANCE_PAYMENT)).toMatch(/financeiro/i);
    expect(describeEmailOutboxType(EMAIL_OUTBOX_TYPES.MANAGER_NEW_TICKET)).toMatch(/gestor/i);
    expect(describeEmailOutboxType('desconhecido')).toMatch(/fila/i);
  });
});

describe('email outbox', () => {
  it('aceita a mesma forma segura das chaves de comando', () => {
    expect(normalizeOutboxKey('550e8400-e29b-41d4-a716-446655440000'))
      .toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('rejeita caminhos e chaves curtas', () => {
    for (const value of ['', 'curta', '../outro-doc', 'com espaço']) {
      expect(() => normalizeOutboxKey(value)).toThrow(HttpError);
    }
  });

  it('libera novamente uma entrega quando a lease vence', () => {
    const now = new Date('2026-07-23T12:05:00.000Z');
    expect(isEmailOutboxLeaseActive({
      status: 'processing',
      leaseAt: new Date('2026-07-23T12:04:00.000Z'),
    }, now)).toBe(true);
    expect(isEmailOutboxLeaseActive({
      status: 'processing',
      leaseAt: new Date('2026-07-23T12:00:00.000Z'),
    }, now)).toBe(false);
  });

  it('respeita o backoff e recupera falha elegível', () => {
    const now = new Date('2026-07-23T12:05:00.000Z');
    expect(isEmailOutboxEligible({
      status: 'failed',
      attempts: 2,
      nextAttemptAt: new Date('2026-07-23T12:06:00.000Z'),
    }, now)).toBe(false);
    expect(isEmailOutboxEligible({
      status: 'failed',
      attempts: 2,
      nextAttemptAt: new Date('2026-07-23T12:04:00.000Z'),
    }, now)).toBe(true);
  });

  it('interrompe novas tentativas no limite e limita o crescimento do backoff', () => {
    expect(isEmailOutboxEligible({
      status: 'failed',
      attempts: MAX_EMAIL_OUTBOX_ATTEMPTS,
    })).toBe(false);
    expect(getEmailOutboxRetryDelayMs(1)).toBe(60_000);
    expect(getEmailOutboxRetryDelayMs(99)).toBe(4 * 60 * 60 * 1000);
  });
});
