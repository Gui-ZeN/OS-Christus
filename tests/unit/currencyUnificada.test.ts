import { describe, expect, it } from 'vitest';
import { getItemUnitPrice, parseCurrency, parseCurrencyOrNull } from '../../api/_lib/currency.js';

/**
 * DINHEIRO EM TEXTO → NÚMERO, agora numa implementação só.
 *
 * Eram quatro cópias com três comportamentos, e a divergência não era acadêmica: a
 * mesma entrada virava um número no servidor e outro na tela. Estes testes fixam a
 * regra escolhida e, principalmente, os casos em que ela se RECUSA a adivinhar.
 */

describe('o que se lê sem ambiguidade', () => {
  it('o formato brasileiro, com e sem símbolo', () => {
    expect(parseCurrencyOrNull('R$ 1.234,56')).toBe(1234.56);
    expect(parseCurrencyOrNull('1.234,56')).toBe(1234.56);
    expect(parseCurrencyOrNull('1234,56')).toBe(1234.56);
    expect(parseCurrencyOrNull('890')).toBe(890);
  });

  it('o ponto só some quando é separador de MILHAR', () => {
    // "1234.56" colado de planilha americana. Um `.replace(/\./g,'')` faria virar
    // 123456 — cem vezes maior, indo para aprovação da diretoria inflado.
    expect(parseCurrencyOrNull('1234.56')).toBe(1234.56);
    expect(parseCurrencyOrNull('1.234.567')).toBe(1234567);
    expect(parseCurrencyOrNull('12.34')).toBe(12.34);
  });

  it('texto em volta do número não atrapalha', () => {
    expect(parseCurrencyOrNull('R$ 900,00 (com desconto)')).toBe(900);
    expect(parseCurrencyOrNull('total: 1.500,00 reais')).toBe(1500);
  });

  it('valor negativo é lido como negativo', () => {
    expect(parseCurrencyOrNull('-250,00')).toBe(-250);
  });
});

describe('quando ele SE RECUSA a adivinhar — o motivo de existir', () => {
  /**
   * Estes eram os casos que divergiam. Com `parseFloat`, o servidor devolvia um
   * número plausível e a tela devolvia zero; agora os dois dizem "não sei".
   *
   * "R$ 1.500,00 a R$ 2.000,00" virava 1500.002 no servidor — um valor que não é
   * nenhum dos dois que a pessoa escreveu, e que seguia para pagamento.
   */
  const ambiguos = [
    'R$ 1.500,00 a R$ 2.000,00',
    '1.500,00-2.000,00',
    '12,5,7',
    '1.2.3',
    '10-20',
  ];

  for (const entrada of ambiguos) {
    it(`"${entrada}" não vira número inventado`, () => {
      expect(parseCurrencyOrNull(entrada)).toBeNull();
    });
  }

  it('vazio é null, e null NÃO é zero', () => {
    // "orçamento não informado" e "orçamento de R$ 0,00" levam a decisões opostas.
    expect(parseCurrencyOrNull('')).toBeNull();
    expect(parseCurrencyOrNull(null)).toBeNull();
    expect(parseCurrencyOrNull(undefined)).toBeNull();
    expect(parseCurrencyOrNull('R$')).toBeNull();
    expect(parseCurrencyOrNull('sem valor')).toBeNull();
  });

  it('mas zero de verdade é zero', () => {
    expect(parseCurrencyOrNull('0')).toBe(0);
    expect(parseCurrencyOrNull('R$ 0,00')).toBe(0);
  });
});

describe('quem trata ausência como zero pede isso explicitamente', () => {
  it('parseCurrency devolve 0 onde o outro devolve null', () => {
    expect(parseCurrency('')).toBe(0);
    expect(parseCurrency('R$ 1.500,00 a R$ 2.000,00')).toBe(0);
    expect(parseCurrency('R$ 1.234,56')).toBe(1234.56);
  });
});

describe('preço unitário', () => {
  it('usa o explícito quando existe', () => {
    expect(getItemUnitPrice({ unitPrice: 'R$ 25,00', totalPrice: 'R$ 999,00', quantity: 3 })).toBe(25);
  });

  it('deduz do total quando não há unitário', () => {
    expect(getItemUnitPrice({ totalPrice: 'R$ 300,00', quantity: 4 })).toBe(75);
  });

  it('quantidade zero NÃO vira Infinity', () => {
    // `Infinity` passa em `Number.isFinite`? Não — mas chegaria como número a quem
    // não checasse, e apareceria na tela como preço.
    expect(getItemUnitPrice({ totalPrice: 'R$ 300,00', quantity: 0 })).toBeNull();
    expect(getItemUnitPrice({ totalPrice: 'R$ 300,00' })).toBeNull();
  });

  it('zero explícito é preço, não ausência', () => {
    expect(getItemUnitPrice({ unitPrice: 'R$ 0,00', totalPrice: 'R$ 300,00', quantity: 3 })).toBe(0);
  });

  it('item vazio não quebra', () => {
    expect(getItemUnitPrice({})).toBeNull();
    expect(getItemUnitPrice(null)).toBeNull();
  });
});
