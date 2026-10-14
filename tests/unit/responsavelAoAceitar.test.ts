import { describe, expect, it } from 'vitest';
import { responsavelAoAceitar } from '../../src/views/inbox/responsavelAoAceitar';

const agora = new Date('2026-10-14T12:00:00Z');
const gestora = { email: 'thais@christus.com.br', name: 'Thaís' };

describe('quem aceita a OS vira responsável', () => {
  it('OS sem responsável: quem aceita assume, com o relógio zerado', () => {
    expect(responsavelAoAceitar({ responsible: null }, gestora, agora)).toEqual({
      email: 'thais@christus.com.br',
      name: 'Thaís',
      setAt: agora,
    });
  });

  it('OS que já tem responsável NÃO troca de dono', () => {
    const ticket = { responsible: { email: 'cezar@christus.com.br', name: 'Cezar' } };
    expect(responsavelAoAceitar(ticket, gestora, agora)).toBeNull();
  });

  it('sem e-mail de quem aceita, não grava ninguém', () => {
    expect(responsavelAoAceitar({ responsible: null }, null, agora)).toBeNull();
    expect(responsavelAoAceitar({ responsible: null }, { email: '  ' }, agora)).toBeNull();
  });

  it('sem nome, usa o e-mail para a coluna não ficar vazia', () => {
    expect(responsavelAoAceitar({ responsible: null }, { email: 'x@christus.com.br' }, agora)?.name).toBe('x@christus.com.br');
  });
});
