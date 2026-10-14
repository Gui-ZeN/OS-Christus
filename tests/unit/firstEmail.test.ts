import { describe, expect, it } from 'vitest';
import { firstEmail, parseEmailList } from '../../api/_lib/email.js';

/**
 * O endereço é o que está entre `<>`, não o primeiro texto com arroba. Pegar o
 * primeiro deixava o nome de exibição decidir quem mandou (e para quem a cópia ia).
 */
describe('firstEmail', () => {
  it.each([
    ['maria@gmail.com', 'maria@gmail.com'],
    ['Maria <MARIA@gmail.com>', 'maria@gmail.com'],
    ['"Silva, Maria" <maria@gmail.com>', 'maria@gmail.com'],
    ['"maria@gmail.com"', 'maria@gmail.com'],
    ['maria@gmail.com (Maria)', 'maria@gmail.com'],
    ['"chefe@christus.com.br" <atacante@evil.com>', 'atacante@evil.com'],
    ['chefe@christus.com.br <atacante@evil.com>', 'atacante@evil.com'],
    ['"<chefe@christus.com.br>" <atacante@evil.com>', 'atacante@evil.com'],
    ['atacante@evil.com (chefe@christus.com.br)', 'atacante@evil.com'],
  ])('%s → %s', (cabecalho, esperado) => {
    expect(firstEmail(cabecalho)).toBe(esperado);
  });

  it('sem endereço, null', () => {
    expect(firstEmail('')).toBeNull();
    expect(firstEmail('Fulano')).toBeNull();
    expect(firstEmail('"chefe@christus.com.br" <sem-arroba>')).toBeNull();
  });

  it('lista de cópia manda para o endereço real, não para o do nome', () => {
    expect(parseEmailList('"chefe@christus.com.br" <a@x.com>, B <b@y.com>')).toEqual(['a@x.com', 'b@y.com']);
  });
});
