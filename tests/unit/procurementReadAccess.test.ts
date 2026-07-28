import { describe, expect, it } from 'vitest';
import {
  assertCanReadFinancials,
  canUserReadFinancials,
} from '../../api/_lib/procurementAccess.js';

/**
 * Decisão de produto (2026-07-28): `Usuario` é solicitante/representante de
 * unidade — vê OS, timeline e indicadores operacionais, mas NÃO recebe contrato,
 * pagamento, medição, fornecedor nem valor.
 */
describe('canUserReadFinancials', () => {
  it('libera quem opera o fluxo de compras', () => {
    for (const role of ['Admin', 'Gestor', 'Diretor']) {
      expect(canUserReadFinancials({ role })).toBe(true);
    }
  });

  it('bloqueia Usuario', () => {
    expect(canUserReadFinancials({ role: 'Usuario' })).toBe(false);
  });

  it('bloqueia papel desconhecido, ausente ou vazio (fail-closed)', () => {
    expect(canUserReadFinancials({ role: 'Estagiario' })).toBe(false);
    expect(canUserReadFinancials({})).toBe(false);
    expect(canUserReadFinancials(null)).toBe(false);
  });

  // O caminho para liberar alguém no futuro é uma permissão EXPLÍCITA no usuário,
  // não ampliar a lista de papéis em silêncio.
  it('permissão explícita canViewFinancials libera sem mexer nos papéis', () => {
    expect(canUserReadFinancials({ role: 'Usuario', canViewFinancials: true })).toBe(true);
  });

  it('a flag só vale quando é exatamente true (string não conta)', () => {
    expect(canUserReadFinancials({ role: 'Usuario', canViewFinancials: 'sim' })).toBe(false);
    expect(canUserReadFinancials({ role: 'Usuario', canViewFinancials: false })).toBe(false);
  });
});

describe('assertCanReadFinancials', () => {
  it('não lança para quem pode', () => {
    expect(() => assertCanReadFinancials({ role: 'Gestor' })).not.toThrow();
  });

  it('lança 403 com mensagem clara para quem não pode', () => {
    try {
      assertCanReadFinancials({ role: 'Usuario' });
      throw new Error('deveria ter lançado');
    } catch (error) {
      expect((error as { statusCode?: number }).statusCode).toBe(403);
      expect((error as Error).message).toMatch(/dados financeiros/i);
    }
  });
});
