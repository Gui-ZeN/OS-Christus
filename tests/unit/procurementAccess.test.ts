import { describe, expect, it } from 'vitest';
import { HttpError } from '../../api/_lib/http.js';
import {
  assertCanReadFinancials,
  assertProcurementMutationAllowed,
  canUserReadFinancials,
} from '../../api/_lib/procurementAccess.js';

function expectDenied(role: string, action: string, statusCode: number) {
  try {
    assertProcurementMutationAllowed(role, action);
    throw new Error('A ação deveria ter sido bloqueada.');
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).statusCode).toBe(statusCode);
  }
}

describe('procurement RBAC', () => {
  it('edição operacional continua com Admin e Gestor', () => {
    for (const action of ['quotes', 'contract', 'payment', 'measurement']) {
      expect(() => assertProcurementMutationAllowed('Admin', action)).not.toThrow();
      expect(() => assertProcurementMutationAllowed('Gestor', action)).not.toThrow();
      expectDenied('Diretor', action, 403);
    }
  });

  it('as ações de aprovação da Diretoria não existem mais', () => {
    // Saíram junto com a rota e a tela: não havia diretor cadastrado, e a
    // aprovação real acontece por e-mail.
    for (const action of ['approveSolution', 'approveBudget', 'approveContract']) {
      expectDenied('Admin', action, 400);
      expectDenied('Diretor', action, 400);
    }
  });

  it('mantém seed financeiro exclusivo do Admin e bloqueia ações desconhecidas', () => {
    expect(() => assertProcurementMutationAllowed('Admin', 'seedDefaults')).not.toThrow();
    expectDenied('Gestor', 'seedDefaults', 403);
    expectDenied('Usuario', 'quotes', 403);
    expectDenied('Admin', 'unknown', 400);
  });
});

describe('o que o teste de mutacao encontrou na porta de compras', () => {
  /**
   * Sete mutantes sobreviveram aqui. Duas familias, as duas reais:
   *
   * 1. Os `.trim()` -- nenhum teste passava papel com espaco em volta.
   * 2. As mensagens de recusa -- trocadas por string vazia, nenhum teste notou.
   *
   * A segunda importa mais do que parece: a recusa e o que a gestora LE. Um 403 com
   * mensagem em branco vira "algo deu errado" na tela, e a pessoa fica sem saber se
   * o problema e o perfil dela, o dado, ou o sistema.
   */

  it('papel com espaco em volta continua valendo', () => {
    // Cadastro digitado a mao guarda 'Gestor ' com espaco. Sem o `trim`, quem tem
    // permissao leva 403 -- e o motivo e invisivel para quem esta olhando a tela.
    expect(() => assertProcurementMutationAllowed(' Gestor ', 'quotes')).not.toThrow();
    expect(() => assertProcurementMutationAllowed(' Admin', 'seedDefaults')).not.toThrow();
    expect(canUserReadFinancials({ role: ' Diretor ' })).toBe(true);
  });

  it('acao com espaco em volta continua sendo reconhecida', () => {
    expect(() => assertProcurementMutationAllowed('Gestor', ' quotes ')).not.toThrow();
  });

  it('a recusa de edicao DIZ quem pode', () => {
    // Nao basta negar: a mensagem tem que encaminhar. "Apenas Admin ou Gestor"
    // manda a pessoa procurar quem resolve, em vez de tentar de novo.
    expect(() => assertProcurementMutationAllowed('Usuario', 'quotes')).toThrow(
      /Admin ou Gestor/
    );
  });

  it('a recusa de criar dado financeiro padrao DIZ quem pode', () => {
    expect(() => assertProcurementMutationAllowed('Gestor', 'seedDefaults')).toThrow(
      /Apenas Admin/
    );
  });

  it('acao desconhecida e 400 com motivo, nao 403', () => {
    // 403 diria "voce nao pode"; o problema aqui e outro -- a acao nao existe. Trocar
    // um pelo outro manda a pessoa pedir permissao que nao vai resolver nada.
    let capturado: unknown = null;
    try {
      assertProcurementMutationAllowed('Admin', 'inventada');
    } catch (erro) {
      capturado = erro;
    }
    expect((capturado as { statusCode?: number })?.statusCode).toBe(400);
    expect(String((capturado as { message?: string })?.message)).toMatch(/invalida|inválida/);
  });

  it('a recusa de leitura financeira DIZ que o limite e o perfil', () => {
    expect(() => assertCanReadFinancials({ role: 'Usuario' })).toThrow(/perfil/);
  });
});
