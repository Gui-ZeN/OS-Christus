import { describe, expect, it } from 'vitest';
import {
  descricaoDoModal,
  rotuloDoBotaoSalvar,
  tituloDoModal,
} from '../../src/views/configuracoes/modalDeCatalogo';

/**
 * ⚠️ O QUE ESTES TESTES PRENDEM: a tela tem que dizer, sem ambiguidade, se vai CRIAR
 * ou ALTERAR. A versão anterior comunicava isso só pelo texto de um botão abaixo de
 * uma lista rolável, e o resultado foi 83 serviços sobrescritos.
 */

describe('o modal diz em qual modo está', () => {
  it('sem item carregado, o título é de criação', () => {
    expect(tituloDoModal('serviceCatalog', '')).toBe('Novo serviço');
    expect(tituloDoModal('macroServices', '')).toBe('Novo macroserviço');
    expect(tituloDoModal('materials', '')).toBe('Novo material');
  });

  it('com item carregado, o título é de edição', () => {
    expect(tituloDoModal('serviceCatalog', 'Alvenaria')).toBe('Editar serviço');
  });

  it('nome só de espaços conta como vazio', () => {
    // Um nome em branco não pode fazer a tela anunciar edição de um item sem nome.
    expect(tituloDoModal('serviceCatalog', '   ')).toBe('Novo serviço');
  });
});

describe('⚠️ na edição, a descrição nomeia o item', () => {
  it('diz QUAL item está sendo alterado', () => {
    // É a pergunta que a tela antiga não respondia: "estou mexendo em qual?"
    expect(descricaoDoModal('serviceCatalog', 'Alvenaria')).toContain('"Alvenaria"');
  });

  it('na criação, promete não mexer em nada existente', () => {
    const texto = descricaoDoModal('serviceCatalog', '');
    expect(texto).toContain('novo');
    expect(texto).toContain('Nenhum item existente é alterado');
  });
});

describe('o botão de salvar acompanha o modo', () => {
  it('cria quando não há item', () => {
    expect(rotuloDoBotaoSalvar('materials', '')).toBe('Criar material');
  });

  it('salva alterações quando há', () => {
    expect(rotuloDoBotaoSalvar('materials', 'Cimento')).toBe('Salvar alterações');
  });
});
