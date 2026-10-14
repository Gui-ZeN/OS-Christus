import { describe, expect, it } from 'vitest';
import { remetenteDonoDaOs, remetenteReconhecido } from '../../api/_lib/remetenteDaOs.js';

/**
 * O número da OS no assunto deixou de ser credencial (auditoria de 14/10/2026):
 * "OS-0331" + um CC próprio bastava para entrar na conversa e receber as
 * atualizações. Quem cita uma OS precisa já fazer parte dela.
 */

const ticket = {
  requesterEmail: 'Solicitante <maria@gmail.com>',
  requesterCcEmails: ['coord@escola.org'],
  ccEmail: 'vice@escola.org, secretaria@escola.org',
  directorEmails: ['diretor@outro.com'],
};

const reconhece = (fromEmail: string | null, extra: Partial<Parameters<typeof remetenteReconhecido>[0]> = {}) =>
  remetenteReconhecido({ fromEmail, ticket, threads: [], emailsDaEquipe: [], ...extra });

describe('quem cita uma OS precisa fazer parte dela', () => {
  it('um estranho NÃO é reconhecido — é o ataque da auditoria', () => {
    expect(reconhece('atacante@evil.com')).toBe(false);
  });

  it('o solicitante é reconhecido, sem ligar para caixa nem nome de exibição', () => {
    expect(reconhece('MARIA@gmail.com')).toBe(true);
    expect(reconhece('"Maria" <maria@gmail.com>')).toBe(true);
  });

  it('quem já está em cópia na OS é reconhecido', () => {
    expect(reconhece('coord@escola.org')).toBe(true);
    expect(reconhece('secretaria@escola.org')).toBe(true);
    expect(reconhece('diretor@outro.com')).toBe(true);
  });

  it('quem participa de qualquer conversa da OS é reconhecido', () => {
    const threads = [
      { participants: ['outro@x.com'] },
      // Remetente aprovado pela equipe ao vincular uma mensagem da fila.
      { participants: ['fornecedor.novo@obras.com'], ccEmail: 'eng@obras.com' },
    ];
    expect(reconhece('fornecedor.novo@obras.com', { threads })).toBe(true);
    expect(reconhece('eng@obras.com', { threads })).toBe(true);
  });

  it('a equipe do Serv3 e o domínio da casa falam em qualquer OS', () => {
    expect(reconhece('gestora@gmail.com', { emailsDaEquipe: ['Gestora@Gmail.com'] })).toBe(true);
    expect(reconhece('qualquer.um@christus.com.br')).toBe(true);
  });

  it('domínio parecido com o da casa NÃO passa', () => {
    expect(reconhece('x@christus.com.br.evil.com')).toBe(false);
    expect(reconhece('x@falsochristus.com.br')).toBe(false);
  });

  it('OS que não existe: só a casa é reconhecida', () => {
    expect(remetenteReconhecido({ fromEmail: 'maria@gmail.com', ticket: null })).toBe(false);
    expect(remetenteReconhecido({ fromEmail: 'a@christus.com.br', ticket: null })).toBe(true);
  });

  it('e-mail no NOME DE EXIBIÇÃO não se passa pelo remetente — achado do revisor de segurança', () => {
    // O ataque: mandar do próprio domínio (SPF/DKIM válidos) com um nome que imita.
    expect(reconhece('"qualquer@christus.com.br" <atacante@evil.com>')).toBe(false);
    expect(reconhece('"maria@gmail.com" <atacante@evil.com>')).toBe(false);
    expect(reconhece('qualquer@christus.com.br <atacante@evil.com>')).toBe(false);
    expect(reconhece('"<maria@gmail.com>" <atacante@evil.com>')).toBe(false);
    expect(reconhece('atacante@evil.com (maria@gmail.com)')).toBe(false);
  });

  it('sem remetente legível, não é reconhecido', () => {
    expect(reconhece(null)).toBe(false);
    expect(reconhece('sem-arroba')).toBe(false);
  });
});

describe('quem TROCA a cópia é mais estreito que quem é reconhecido', () => {
  it('solicitante, cópias da OS e diretores são donos', () => {
    expect(remetenteDonoDaOs({ fromEmail: 'maria@gmail.com', ticket })).toBe(true);
    expect(remetenteDonoDaOs({ fromEmail: 'vice@escola.org', ticket })).toBe(true);
    expect(remetenteDonoDaOs({ fromEmail: 'diretor@outro.com', ticket })).toBe(true);
  });

  it('domínio da casa, equipe e participante aprovado são reconhecidos mas NÃO donos', () => {
    // Funcionário do Colégio numa OS da Universidade: fala, mas não redireciona a OS.
    expect(remetenteDonoDaOs({ fromEmail: 'qualquer@christus.com.br', ticket })).toBe(false);
    expect(reconhece('qualquer@christus.com.br')).toBe(true);
    expect(remetenteDonoDaOs({ fromEmail: '"maria@gmail.com" <atk@evil.com>', ticket })).toBe(false);
  });
});
