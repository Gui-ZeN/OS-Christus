import { describe, expect, it } from 'vitest';
import {
  COMMITMENT_OUTCOME,
  COMMITMENT_STATE,
  effectiveCommitmentState,
  isAwaitingSiteConfirmation,
  serializeCommitmentForApi,
  validateConfirmation,
} from '../../api/_lib/commitments.js';

/** Quarta, 5 de agosto de 2026, 09h00 em Fortaleza (12h UTC). */
const AGORA = new Date('2026-08-05T12:00:00Z');
const hoje = (h: number, m = 0) => new Date(Date.UTC(2026, 7, 5, h + 3, m));

const visita = (over: Record<string, unknown> = {}) => ({
  id: 'c1',
  kind: 'visita-fornecedor',
  ticketIds: ['OS-0271'],
  vendorName: 'Refrimax',
  startAt: hoje(8),
  state: COMMITMENT_STATE.SCHEDULED,
  createdAt: hoje(7),
  ...over,
});

describe('effectiveCommitmentState', () => {
  it('antes da hora, segue agendado', () => {
    expect(effectiveCommitmentState(visita({ startAt: hoje(14) }), AGORA)).toBe(
      COMMITMENT_STATE.SCHEDULED
    );
  });

  it('dentro da tolerância ainda é agendado', () => {
    // 08h40 com 30 min de tolerância: o relógio da cobrança começa no FIM da folga.
    expect(effectiveCommitmentState(visita({ startAt: hoje(8, 40) }), AGORA)).toBe(
      COMMITMENT_STATE.SCHEDULED
    );
  });

  it('⏱️ passou o horário + tolerância → "sem confirmação", que NÃO é falta', () => {
    // A diferença importa: falta entra no histórico do fornecedor, que decide quem
    // continua atendendo. "Ninguém respondeu ainda" não pode virar acusação.
    expect(effectiveCommitmentState(visita(), AGORA)).toBe(COMMITMENT_STATE.UNCONFIRMED);
    expect(isAwaitingSiteConfirmation(visita(), AGORA)).toBe(true);
  });

  it('respeita tolerância própria', () => {
    expect(effectiveCommitmentState(visita({ startAt: hoje(8, 50), toleranceMinutes: 5 }), AGORA)).toBe(
      COMMITMENT_STATE.UNCONFIRMED
    );
  });

  it('estado já confirmado não é recalculado pelo relógio', () => {
    for (const state of [COMMITMENT_STATE.ARRIVED, COMMITMENT_STATE.MISSED, COMMITMENT_STATE.CANCELED]) {
      expect(effectiveCommitmentState(visita({ state }), AGORA)).toBe(state);
      expect(isAwaitingSiteConfirmation(visita({ state }), AGORA)).toBe(false);
    }
  });

  it('sem data não inventa estado', () => {
    expect(effectiveCommitmentState(visita({ startAt: null }), AGORA)).toBe(COMMITMENT_STATE.SCHEDULED);
  });
});

describe('validateConfirmation', () => {
  it('🎯 "compareceu" EXIGE desfecho — chegar não é resolver', () => {
    // O furo fatal: o fornecedor chega, diz que faltou material e vai embora; alguém
    // marca "apareceu", o painel fica verde e nada foi instalado.
    expect(validateConfirmation(visita(), { state: COMMITMENT_STATE.ARRIVED }).ok).toBe(false);
    expect(
      validateConfirmation(visita(), {
        state: COMMITMENT_STATE.ARRIVED,
        outcome: COMMITMENT_OUTCOME.MISSING_MATERIAL,
      }).ok
    ).toBe(true);
  });

  it('quem não veio não tem desfecho de execução', () => {
    expect(validateConfirmation(visita(), { state: COMMITMENT_STATE.MISSED }).ok).toBe(true);
    expect(
      validateConfirmation(visita(), {
        state: COMMITMENT_STATE.MISSED,
        outcome: COMMITMENT_OUTCOME.DONE,
      }).ok
    ).toBe(false);
  });

  it('desfecho inventado não passa', () => {
    expect(
      validateConfirmation(visita(), { state: COMMITMENT_STATE.ARRIVED, outcome: 'inventado' }).ok
    ).toBe(false);
  });

  it('compromisso já encerrado não aceita confirmação por cima', () => {
    const r = validateConfirmation(visita({ state: COMMITMENT_STATE.MISSED }), {
      state: COMMITMENT_STATE.ARRIVED,
      outcome: COMMITMENT_OUTCOME.DONE,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toContain('encerrado');
  });

  it('só aceita compareceu/faltou como confirmação', () => {
    expect(validateConfirmation(visita(), { state: COMMITMENT_STATE.SCHEDULED }).ok).toBe(false);
  });
});

describe('serializeCommitmentForApi', () => {
  it('entrega o estado JÁ resolvido — duas telas não podem discordar da mesma visita', () => {
    const out = serializeCommitmentForApi(visita(), AGORA);
    expect(out.effectiveState).toBe(COMMITMENT_STATE.UNCONFIRMED);
    expect(out.state).toBe(COMMITMENT_STATE.SCHEDULED);
    expect(out.startAt).toBe(hoje(8).toISOString());
  });

  it('datas ausentes viram null, não Date inválida', () => {
    const out = serializeCommitmentForApi(visita({ endAt: undefined, confirmedAt: null }), AGORA);
    expect(out.endAt).toBeNull();
    expect(out.confirmedAt).toBeNull();
  });
});
