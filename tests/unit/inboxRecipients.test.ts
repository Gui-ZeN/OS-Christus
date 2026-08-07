import { describe, expect, it } from 'vitest';
import { mergeEmails, normalizeForMatching, parseEmailTokens } from '../../src/views/inbox/recipients';

describe('parseEmailTokens', () => {
  it('aceita os separadores que as pessoas realmente usam ao colar', () => {
    const r = parseEmailTokens('ana@px.com.br, bruno@px.com.br; carla@px.com.br  davi@px.com.br');
    expect(r.valid).toEqual(['ana@px.com.br', 'bruno@px.com.br', 'carla@px.com.br', 'davi@px.com.br']);
    expect(r.invalid).toEqual([]);
  });

  it('devolve o que não é endereço em vez de engolir', () => {
    // Descartar em silêncio é como um destinatário some sem ninguém perceber.
    const r = parseEmailTokens('ana@px.com.br, sem-arroba, thais@');
    expect(r.valid).toEqual(['ana@px.com.br']);
    expect(r.invalid).toEqual(['sem-arroba', 'thais@']);
  });

  it('normaliza caixa e não repete', () => {
    const r = parseEmailTokens('Ana@PX.com.br ana@px.com.br');
    expect(r.valid).toEqual(['ana@px.com.br']);
  });

  it('campo vazio não vira lista com sujeira', () => {
    expect(parseEmailTokens('   ,, ;  ')).toEqual({ valid: [], invalid: [] });
  });
});

describe('mergeEmails', () => {
  it('junta listas sem repetir e ignorando caixa', () => {
    // Endereço duplicado é e-mail enviado duas vezes — é assim que o sistema passa
    // a impressão de que spamma.
    expect(mergeEmails(['Ana@px.com.br'], ['ana@px.com.br', 'bruno@px.com.br'], undefined)).toEqual([
      'ana@px.com.br',
      'bruno@px.com.br',
    ]);
  });

  it('sobrevive a lista ausente ou com buraco', () => {
    expect(mergeEmails(undefined, ['', '  ', 'ana@px.com.br'])).toEqual(['ana@px.com.br']);
  });
});

describe('normalizeForMatching', () => {
  it('casa texto escrito por gente: acento, caixa e espaço não contam', () => {
    expect(normalizeForMatching('  Refeitório ')).toBe('refeitorio');
    expect(normalizeForMatching('Bloco A')).toBe(normalizeForMatching('bloco a'));
  });

  it('nulo e indefinido viram string vazia, não quebram a comparação', () => {
    expect(normalizeForMatching(null)).toBe('');
    expect(normalizeForMatching(undefined)).toBe('');
  });
});
