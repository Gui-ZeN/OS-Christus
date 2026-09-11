import { describe, expect, it } from 'vitest';
import { opcoesComOAtual, resolverClassificacao } from '../../src/views/inbox/classificacao';

/**
 * A CLASSIFICAÇÃO NÃO PODE SUMIR PORQUE O CATÁLOGO MUDOU.
 *
 * Medido em produção em 11/09/2026: 16 dos 20 macroserviços e 23 dos 27 serviços não
 * podem ser EXCLUÍDOS — estão vinculados a OS ou têm serviços filhos. Desativar é o
 * único caminho de limpeza que sobra, e era ele que disparava a perda: o resolvedor
 * fazia `catalogo.find(...)?.id || ''`, então item fora do catálogo virava vazio no
 * próximo salvamento do painel, em silêncio.
 */

const CATALOGO = {
  macroServices: [
    { id: 'eletrica', name: 'Elétrica' },
    { id: 'civil', name: 'Estrutura Civil' },
  ],
  servicos: [
    { id: 'lampada', name: 'Troca de lâmpada', macroServiceId: 'eletrica' },
    { id: 'alvenaria', name: 'Alvenaria', macroServiceId: 'civil' },
  ],
};

describe('o catálogo manda enquanto conhece o item', () => {
  it('escolha normal resolve id e nome pelo catálogo', () => {
    const r = resolverClassificacao(
      { macroServiceId: 'eletrica', serviceCatalogId: 'lampada' },
      CATALOGO,
      {}
    );
    expect(r).toEqual({
      macroServiceId: 'eletrica',
      macroServiceName: 'Elétrica',
      serviceCatalogId: 'lampada',
      serviceCatalogName: 'Troca de lâmpada',
    });
  });

  it('serviço de outro macroserviço não cola', () => {
    // Trocar o macro e deixar o serviço antigo daria uma OS com classificação
    // incoerente — "Elétrica / Alvenaria".
    const r = resolverClassificacao(
      { macroServiceId: 'eletrica', serviceCatalogId: 'alvenaria' },
      CATALOGO,
      {}
    );
    expect(r.serviceCatalogId).toBe('');
  });

  it('limpar de propósito continua limpando', () => {
    // "Definir na triagem" é uma escolha; o resgate não pode desfazê-la.
    const r = resolverClassificacao(
      { macroServiceId: '', serviceCatalogId: '' },
      CATALOGO,
      { macroServiceId: 'eletrica', macroServiceName: 'Elétrica' }
    );
    expect(r.macroServiceId).toBe('');
    expect(r.macroServiceName).toBe('');
  });
});

describe('⚠️ item desativado não apaga a classificação da OS', () => {
  const semEletrica = { macroServices: [{ id: 'civil', name: 'Estrutura Civil' }], servicos: [] };

  it('o macroserviço fora do catálogo sobrevive com o nome que a OS guardou', () => {
    const r = resolverClassificacao(
      { macroServiceId: 'eletrica', serviceCatalogId: 'lampada' },
      semEletrica,
      { macroServiceId: 'eletrica', macroServiceName: 'Elétrica', serviceCatalogId: 'lampada', serviceCatalogName: 'Troca de lâmpada' }
    );
    expect(r.macroServiceId).toBe('eletrica');
    expect(r.macroServiceName).toBe('Elétrica');
    expect(r.serviceCatalogId).toBe('lampada');
    expect(r.serviceCatalogName).toBe('Troca de lâmpada');
  });

  it('⚠️ o nome só sobrevive JUNTO COM O ID', () => {
    /*
     * Se a tela escolheu um id novo e a OS tinha outro, o nome antigo não pode viajar
     * junto: daria uma OS dizendo "Elétrica" e apontando para outro macroserviço —
     * pior que perder a classificação, porque parece certo.
     */
    const r = resolverClassificacao(
      { macroServiceId: 'desconhecido', serviceCatalogId: '' },
      semEletrica,
      { macroServiceId: 'eletrica', macroServiceName: 'Elétrica' }
    );
    expect(r.macroServiceId).toBe('');
    expect(r.macroServiceName).toBe('');
  });

  it('serviço não sobrevive sozinho quando o macroserviço caiu', () => {
    // Classificação pela metade é pior para somar por categoria do que nenhuma.
    const r = resolverClassificacao(
      { macroServiceId: '', serviceCatalogId: 'lampada' },
      semEletrica,
      { serviceCatalogId: 'lampada', serviceCatalogName: 'Troca de lâmpada' }
    );
    expect(r.serviceCatalogId).toBe('');
  });
});

describe('o seletor mostra o que a OS tem, mesmo fora do catálogo', () => {
  it('acrescenta o item atual e o marca', () => {
    // Sem isto o campo aparece em branco numa OS classificada, e quem olha conclui
    // que ela nunca foi classificada.
    const opcoes = opcoesComOAtual(CATALOGO.macroServices, { id: 'bombas', name: 'Bombas' });
    expect(opcoes).toHaveLength(3);
    expect(opcoes[2]).toEqual({ id: 'bombas', name: 'Bombas (fora do catálogo)' });
  });

  it('não duplica o que já está na lista', () => {
    expect(opcoesComOAtual(CATALOGO.macroServices, { id: 'eletrica', name: 'Elétrica' })).toHaveLength(2);
  });

  it('OS sem classificação não ganha opção nenhuma', () => {
    expect(opcoesComOAtual(CATALOGO.macroServices, { id: '', name: '' })).toHaveLength(2);
  });
});
