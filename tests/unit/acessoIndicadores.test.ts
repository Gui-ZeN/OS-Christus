import { describe, expect, it } from 'vitest';
import {
  PAPEIS_COM_INDICADORES_LABEL,
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
