import { describe, expect, it } from 'vitest';
import {
  PAPEIS_COM_INDICADORES_LABEL,
  podeVerFinanceiro,
  podeVerIndicadores,
} from '../../src/constants/acessoIndicadores';

/**
 * A regra vivia escrita à mão em dois lugares — `App.tsx`, que acende o ícone, e
 * `KpiView.tsx`, que desenha a tela — e o `Gestor` ficou fora das duas por
 * descuido. Estes testes existem para que uma próxima mexida não repita nem uma
 * coisa nem outra.
 */
describe('quem vê o painel de indicadores', () => {
  it('o Gestor vê — ele administra a fila e é quem mais encerra OS', () => {
    expect(podeVerIndicadores('Gestor')).toBe(true);
  });

  it('Admin, Diretor e Usuario continuam vendo', () => {
    expect(podeVerIndicadores('Admin')).toBe(true);
    expect(podeVerIndicadores('Diretor')).toBe(true);
    expect(podeVerIndicadores('Usuario')).toBe(true);
  });

  it('sem papel não vê — antes de carregar o usuário a tela não pode vazar', () => {
    expect(podeVerIndicadores(null)).toBe(false);
    expect(podeVerIndicadores(undefined)).toBe(false);
  });

  it('papel desconhecido não vê — errar para o lado seguro', () => {
    expect(podeVerIndicadores('Fornecedor')).toBe(false);
    expect(podeVerIndicadores('gestor')).toBe(false);
  });

  it('o aviso de acesso negado lista os mesmos papéis da regra', () => {
    for (const papel of ['Admin', 'Diretor', 'Gestor', 'Usuario'] as const) {
      expect(PAPEIS_COM_INDICADORES_LABEL).toContain(papel);
    }
  });
});

/**
 * A regra do dinheiro é OUTRA, e o front estava mais restrito que o servidor:
 * `FINANCIAL_READER_ROLES` em `api/_lib/procurementAccess.js` já tinha o Gestor.
 * Tela mais fechada que a API não protege nada — só esconde da pessoa o que a
 * API entrega a ela.
 */
describe('quem vê dinheiro dentro do painel', () => {
  it('Gestor vê — o backend já entregava e o front escondia', () => {
    expect(podeVerFinanceiro('Gestor')).toBe(true);
  });

  it('Admin e Diretor veem', () => {
    expect(podeVerFinanceiro('Admin')).toBe(true);
    expect(podeVerFinanceiro('Diretor')).toBe(true);
  });

  it('Usuario NÃO vê — acompanha a estrutura, não a compra', () => {
    expect(podeVerFinanceiro('Usuario')).toBe(false);
    expect(podeVerIndicadores('Usuario')).toBe(true);
  });

  it('sem papel ou papel desconhecido não vê', () => {
    expect(podeVerFinanceiro(null)).toBe(false);
    expect(podeVerFinanceiro('Fornecedor')).toBe(false);
  });
});
