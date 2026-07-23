import { describe, expect, it } from 'vitest';
import { parseCurrency, formatCurrency, normalizeCurrencyInput } from '../../src/utils/currency';

describe('parseCurrency (pt-BR / BRL)', () => {
  it('lê o formato pt-BR completo "R$ 1.234,56"', () => {
    expect(parseCurrency('R$ 1.234,56')).toBe(1234.56);
  });

  it('lê milhar com ponto sem decimais "1.234"', () => {
    expect(parseCurrency('1.234')).toBe(1234);
  });

  it('lê milhões "1.234.567,89"', () => {
    expect(parseCurrency('1.234.567,89')).toBe(1234567.89);
  });

  it('NÃO multiplica por 100 um decimal com ponto "1234.56" (regressão do 100×)', () => {
    // Antes: .replace(/\./g,'') virava 123456. Agora o ponto só some quando é milhar.
    expect(parseCurrency('1234.56')).toBe(1234.56);
    expect(parseCurrency('12500.50')).toBe(12500.5);
  });

  it('trata vazio/inválido como 0', () => {
    expect(parseCurrency('')).toBe(0);
    expect(parseCurrency(null)).toBe(0);
    expect(parseCurrency(undefined)).toBe(0);
    expect(parseCurrency('abc')).toBe(0);
  });

  it('faz round-trip com formatCurrency', () => {
    expect(parseCurrency(formatCurrency(1234.56))).toBe(1234.56);
    expect(parseCurrency(formatCurrency(1000000))).toBe(1000000);
  });

  it('normalizeCurrencyInput devolve "" para zero/negativo e formata o resto', () => {
    expect(normalizeCurrencyInput('0')).toBe('');
    expect(normalizeCurrencyInput('1234.56')).toBe(formatCurrency(1234.56));
  });
});
