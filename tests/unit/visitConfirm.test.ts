import { describe, expect, it } from 'vitest';
import {
  ESCOLHA,
  VALIDADE_DO_LINK_EM_HORAS,
  efeitoDaEscolha,
  montarPergunta,
  tokenExpirou,
  validarEscolhaDaSede,
} from '../../api/_lib/visitConfirm.js';

const agendado = { state: 'agendado', sede: 'SUL3', vendorName: 'Vidraçaria Norte' };

describe('a escolha da sede vira estado do compromisso', () => {
  it('"chegou" grava chegada SEM desfecho', () => {
    // Às 08h30 o coordenador não sabe se a equipe concluiu, se faltou material ou
    // se não teve acesso. Exigir o desfecho aqui produziria desfecho inventado.
    expect(efeitoDaEscolha(ESCOLHA.CHEGOU)).toEqual({ state: 'compareceu', outcome: null });
  });

  it('"não apareceu" é falta, e falta não tem desfecho de execução', () => {
    expect(efeitoDaEscolha(ESCOLHA.NAO_APARECEU)).toEqual({ state: 'faltou', outcome: null });
  });

  it('"resolvido pela sede" cancela a visita e registra por quê', () => {
    // Sem esta opção, a sede que resolveu sozinha continuaria recebendo cobrança e
    // o fornecedor viria para um serviço que já não existe — com deslocamento.
    expect(efeitoDaEscolha(ESCOLHA.RESOLVIDO_PELA_SEDE)).toEqual({
      state: 'cancelado',
      outcome: 'resolvido-pela-sede',
    });
  });

  it('escolha inventada não vira nada', () => {
    expect(efeitoDaEscolha('sei-la')).toBeNull();
    expect(validarEscolhaDaSede(agendado, 'sei-la').ok).toBe(false);
  });
});

describe('o desfazer existe, mas só onde faz sentido', () => {
  it('corrige uma falta quando o fornecedor apareceu depois', () => {
    const r = validarEscolhaDaSede({ state: 'faltou' }, ESCOLHA.APARECEU_DEPOIS);
    expect(r.ok).toBe(true);
    expect(r.efeito).toEqual({ state: 'compareceu', outcome: null });
  });

  it('não ressuscita visita que a sede disse não precisar mais', () => {
    expect(validarEscolhaDaSede({ state: 'cancelado' }, ESCOLHA.APARECEU_DEPOIS).ok).toBe(false);
  });

  it('não "desfaz" o que nunca foi falta', () => {
    expect(validarEscolhaDaSede({ state: 'agendado' }, ESCOLHA.APARECEU_DEPOIS).ok).toBe(false);
    expect(validarEscolhaDaSede({ state: 'compareceu' }, ESCOLHA.APARECEU_DEPOIS).ok).toBe(false);
  });
});

describe('o segundo toque não grava por cima em silêncio', () => {
  it('visita já respondida é recusada, e a página sabe disso', () => {
    for (const state of ['compareceu', 'faltou', 'cancelado']) {
      const r = validarEscolhaDaSede({ state }, ESCOLHA.CHEGOU);
      expect(r.ok, state).toBe(false);
      expect(r.jaRespondido, state).toBe(true);
    }
  });

  it('visita remarcada manda o registro para a data nova', () => {
    const r = validarEscolhaDaSede({ state: 'remarcado' }, ESCOLHA.CHEGOU);
    expect(r.ok).toBe(false);
    expect(r.jaRespondido).toBeUndefined();
  });

  it('quem ainda não respondeu registra normalmente', () => {
    expect(validarEscolhaDaSede(agendado, ESCOLHA.CHEGOU).ok).toBe(true);
    expect(validarEscolhaDaSede({ state: 'sem-confirmacao' }, ESCOLHA.NAO_APARECEU).ok).toBe(true);
  });
});

describe('o link do e-mail não vale para sempre', () => {
  const agora = new Date('2026-08-17T12:00:00Z');

  it('vale dentro da janela', () => {
    const criadoAgora = new Date(agora.getTime() - 1 * 3_600_000);
    expect(tokenExpirou({ createdAt: criadoAgora }, agora)).toBe(false);
  });

  it('expira depois dela', () => {
    const velho = new Date(agora.getTime() - (VALIDADE_DO_LINK_EM_HORAS + 1) * 3_600_000);
    expect(tokenExpirou({ createdAt: velho }, agora)).toBe(true);
  });

  it('token sem data é tratado como expirado, não como eterno', () => {
    expect(tokenExpirou({}, agora)).toBe(true);
    expect(tokenExpirou({ createdAt: 'qualquer coisa' }, agora)).toBe(true);
  });
});

describe('a página mostra só o que a pessoa precisa para reconhecer a visita', () => {
  const commitment = {
    ...agendado,
    startAt: new Date('2026-08-17T11:00:00Z'),
    ticketIds: ['OS-0151'],
  };
  const token = { nome: 'Pablo Ferreira', email: 'pablo.sul@px.com.br' };

  it('não vaza nada além de sede, fornecedor, horário e as OS', () => {
    const p = montarPergunta({
      commitment,
      token,
      ticketsResumo: [{ id: 'OS-0151', assunto: 'Telas de proteção do parquinho' }],
    });
    expect(Object.keys(p).sort()).toEqual([
      'convidado', 'estado', 'fornecedor', 'jaRespondido', 'marcadoPara',
      'ordens', 'podeDesfazer', 'respondidoEm', 'respondidoPor', 'sede',
    ]);
    expect(p.sede).toBe('SUL3');
    expect(p.convidado.nome).toBe('Pablo Ferreira');
  });

  it('só oferece desfazer quando o registro foi falta', () => {
    expect(montarPergunta({ commitment: { ...commitment, state: 'faltou' }, token }).podeDesfazer).toBe(true);
    expect(montarPergunta({ commitment: { ...commitment, state: 'compareceu' }, token }).podeDesfazer).toBe(false);
    expect(montarPergunta({ commitment, token }).podeDesfazer).toBe(false);
  });
});
