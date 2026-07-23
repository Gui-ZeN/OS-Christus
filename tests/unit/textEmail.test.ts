import { describe, it, expect } from 'vitest';
import { normalizeKey, slugFilename } from '../../api/_lib/text.js';
import { firstEmail, parseEmailList, isValidEmail } from '../../api/_lib/email.js';

describe('normalizeKey', () => {
  it('remove acentos, baixa a caixa e apara', () => {
    expect(normalizeKey('  José DA Silvá ')).toBe('jose da silva');
    expect(normalizeKey('PRÉ SUL')).toBe('pre sul');
    expect(normalizeKey('')).toBe('');
  });
});

describe('slugFilename', () => {
  it('gera nome de arquivo seguro', () => {
    const out = slugFilename('Relatório Final (v2).pdf');
    expect(out).not.toMatch(/\s/);
    expect(out.toLowerCase()).toContain('relatorio');
  });
});

describe('firstEmail', () => {
  it('extrai o e-mail de "Nome <email>" e de string crua', () => {
    expect(firstEmail('Fulano de Tal <fulano@px.com.br>')).toBe('fulano@px.com.br');
    expect(firstEmail('ciclano@px.com.br')).toBe('ciclano@px.com.br');
  });
  it('normaliza para minúsculas', () => {
    expect(firstEmail('Fulano@PX.COM.BR')).toBe('fulano@px.com.br');
  });
  it('vazio/sem e-mail retorna null', () => {
    expect(firstEmail('')).toBeNull();
    expect(firstEmail('sem email aqui')).toBeNull();
  });
});

describe('isValidEmail', () => {
  it('valida formato básico', () => {
    expect(isValidEmail('a@b.com')).toBe(true);
    expect(isValidEmail('nao-email')).toBe(false);
    expect(isValidEmail('a@b')).toBe(false);
  });
});

describe('parseEmailList', () => {
  it('retorna array de e-mails válidos únicos, descartando o resto', () => {
    const out = parseEmailList('a@b.com, lixo, c@d.com, a@b.com');
    expect(out).toEqual(['a@b.com', 'c@d.com']); // 'lixo' descartado, duplicata removida
  });
  it('aceita array e divide por espaço quando pedido', () => {
    expect(parseEmailList(['x@y.com', 'nao'])).toEqual(['x@y.com']);
    expect(parseEmailList('a@b.com c@d.com', { splitWhitespace: true })).toEqual(['a@b.com', 'c@d.com']);
  });
});
