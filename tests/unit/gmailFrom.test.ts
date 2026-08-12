import { describe, expect, it } from 'vitest';
import { buildFromHeader } from '../../api/_lib/gmail.js';

/**
 * O `From:` saía como endereço cru — na caixa de quem recebe aparecia
 * `napa01@christus.com.br`, que não diz de onde vem nem ajuda a achar depois.
 */
describe('remetente dos e-mails', () => {
  it('leva o nome do sistema por padrão, sem precisar configurar nada', () => {
    expect(buildFromHeader('napa01@christus.com.br')).toBe('Serv3 <napa01@christus.com.br>');
  });

  it('nome com acento é codificado — senão o cabeçalho sai corrompido', () => {
    expect(buildFromHeader('a@x.com', 'Manutenção')).toBe('=?UTF-8?B?TWFudXRlbsOnw6Nv?= <a@x.com>');
  });

  it('nome com vírgula vai entre aspas — senão vira DOIS destinatários', () => {
    expect(buildFromHeader('a@x.com', 'Serv3, Christus')).toBe('"Serv3, Christus" <a@x.com>');
  });

  it('sem nome, volta a ser só o endereço', () => {
    expect(buildFromHeader('a@x.com', '')).toBe('a@x.com');
  });

  it('o ENDEREÇO nunca muda — é ele que precisa bater com o alias "Enviar como"', () => {
    expect(buildFromHeader('napa01@christus.com.br', 'Qualquer Coisa')).toContain('<napa01@christus.com.br>');
  });
});
