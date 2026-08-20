import { describe, expect, it } from 'vitest';
import {
  buildBudgetHistorySummary,
  formatBudgetHistoryValue,
} from '../../src/utils/budgetHistory';
import type { Quote, Ticket } from '../../src/types';

/**
 * O HISTÓRICO DE ORÇAMENTO — teste de CARACTERIZAÇÃO.
 *
 * 441 linhas, zero testes, consumido por 6 telas do Inbox. É o que responde
 * "quanto costuma custar isso?" quando a gestora está avaliando uma cotação —
 * ou seja, um número que influencia decisão de compra.
 *
 * Caracterização, e não especificação: estes testes fixam o que o código FAZ HOJE,
 * para que qualquer mudança futura passe a ser deliberada, com o diff mostrando o
 * que mudou.
 *
 * Escrever isto achou um defeito de verdade, corrigido no mesmo commit e travado no
 * último bloco: nome vazio casava com nome vazio, e OS sem relação nenhuma tiravam
 * nota máxima de semelhança. Onde o comportamento é discutível mas é decisão de
 * produto, está marcado com ⚠️ e fixado como está, não alterado por conta própria.
 */

const AGORA = new Date();
const mesesAtras = (meses: number) => {
  const data = new Date(AGORA);
  data.setMonth(data.getMonth() - meses);
  return data;
};

const os = (extra: Record<string, unknown> = {}) =>
  ({
    id: 'OS-1',
    subject: 'Reparo',
    time: mesesAtras(1),
    region: 'Aldeota',
    sede: 'DL',
    ...extra,
  }) as unknown as Ticket;

const cotacao = (extra: Record<string, unknown> = {}) =>
  ({ id: 'q1', vendor: 'Fornecedor A', value: 'R$ 1.000,00', ...extra }) as unknown as Quote;

describe('sem OS em foco', () => {
  it('devolve um resumo vazio, não null', () => {
    // As telas leem `resumo.similarCases` direto; um null aqui viraria tela branca.
    const resumo = buildBudgetHistorySummary(null, [], {});
    expect(resumo.similarCases).toEqual([]);
    expect(resumo.comparableTicketCount).toBe(0);
    expect(resumo.averageQuoteValue).toBeNull();
    expect(resumo.preferredVendor).toBeNull();
    expect(resumo.itemReferences).toEqual([]);
  });
});

describe('o que entra na comparação', () => {
  const atual = os({ id: 'OS-atual', serviceCatalogId: 'svc-1', macroServiceId: 'macro-1' });

  it('a própria OS nunca se compara consigo mesma', () => {
    const resumo = buildBudgetHistorySummary(atual, [atual], { 'OS-atual': [cotacao()] });
    expect(resumo.similarCases).toEqual([]);
  });

  it('OS sem cotação nenhuma fica de fora', () => {
    // Sem cotação não há valor a comparar.
    const irma = os({ id: 'OS-2', serviceCatalogId: 'svc-1', macroServiceId: 'macro-1' });
    const resumo = buildBudgetHistorySummary(atual, [irma], {});
    expect(resumo.similarCases).toEqual([]);
  });

  it('OS com mais de 24 meses fica de fora', () => {
    // Preço de dois anos atrás não serve de referência.
    const velha = os({
      id: 'OS-velha',
      serviceCatalogId: 'svc-1',
      macroServiceId: 'macro-1',
      time: mesesAtras(25),
    });
    const recente = os({
      id: 'OS-recente',
      serviceCatalogId: 'svc-1',
      macroServiceId: 'macro-1',
      time: mesesAtras(23),
    });
    const resumo = buildBudgetHistorySummary(atual, [velha, recente], {
      'OS-velha': [cotacao()],
      'OS-recente': [cotacao()],
    });
    expect(resumo.similarCases.map(c => c.ticketId)).toEqual(['OS-recente']);
  });

  it('OS sem data válida fica de fora', () => {
    const semData = os({ id: 'OS-3', serviceCatalogId: 'svc-1', time: undefined });
    const resumo = buildBudgetHistorySummary(atual, [semData], { 'OS-3': [cotacao()] });
    expect(resumo.similarCases).toEqual([]);
  });
});

describe('a nota de semelhança decide quem aparece', () => {
  /**
   * O corte é 4. Os pesos: mesmo serviço 7, mesmo macroserviço 4, terceiro em comum
   * 3 (teto 6), fornecedor cotado em comum 3 (teto 6).
   *
   * Na prática isso significa: só o macroserviço já basta (4), e só um terceiro em
   * comum NÃO basta (3). É a fronteira do módulo.
   */
  const atual = os({ id: 'OS-atual', serviceCatalogId: 'svc-1', macroServiceId: 'macro-1' });

  it('só o macroserviço em comum já entra — nota 4, exatamente no corte', () => {
    const irma = os({ id: 'OS-2', macroServiceId: 'macro-1', serviceCatalogId: 'outro' });
    const resumo = buildBudgetHistorySummary(atual, [irma], { 'OS-2': [cotacao()] });
    expect(resumo.similarCases).toHaveLength(1);
    expect(resumo.similarCases[0].score).toBe(4);
    expect(resumo.similarCases[0].sharedTerms).toContain('macroserviço');
  });

  it('nada em comum não entra', () => {
    const estranha = os({ id: 'OS-3', macroServiceId: 'macro-9', serviceCatalogId: 'svc-9' });
    const resumo = buildBudgetHistorySummary(atual, [estranha], { 'OS-3': [cotacao()] });
    expect(resumo.similarCases).toEqual([]);
  });

  it('serviço + macroserviço somam 11 e vêm antes de quem só tem o macro', () => {
    const forte = os({ id: 'OS-forte', serviceCatalogId: 'svc-1', macroServiceId: 'macro-1' });
    const fraca = os({ id: 'OS-fraca', serviceCatalogId: 'outro', macroServiceId: 'macro-1' });
    const resumo = buildBudgetHistorySummary(atual, [fraca, forte], {
      'OS-forte': [cotacao()],
      'OS-fraca': [cotacao()],
    });
    expect(resumo.similarCases.map(c => c.ticketId)).toEqual(['OS-forte', 'OS-fraca']);
    expect(resumo.similarCases[0].score).toBe(11);
  });

  it('empate na nota é desempatado pela mais recente', () => {
    const antiga = os({ id: 'OS-antiga', macroServiceId: 'macro-1', time: mesesAtras(10) });
    const nova = os({ id: 'OS-nova', macroServiceId: 'macro-1', time: mesesAtras(2) });
    const resumo = buildBudgetHistorySummary(atual, [antiga, nova], {
      'OS-antiga': [cotacao()],
      'OS-nova': [cotacao()],
    });
    expect(resumo.similarCases.map(c => c.ticketId)).toEqual(['OS-nova', 'OS-antiga']);
  });

  it('o nome do serviço vale quando o id não bate', () => {
    // OS antiga guardava o nome, não o id do catálogo.
    const porNome = os({ id: 'OS-4', serviceCatalogName: 'Troca de lâmpada' });
    const atualPorNome = os({ id: 'OS-atual', serviceCatalogName: 'TROCA DE LÂMPADA' });
    const resumo = buildBudgetHistorySummary(atualPorNome, [porNome], { 'OS-4': [cotacao()] });
    expect(resumo.similarCases).toHaveLength(1);
    expect(resumo.similarCases[0].sharedTerms).toContain('serviço');
  });
});

describe('qual cotação representa a OS', () => {
  const atual = os({ id: 'OS-atual', macroServiceId: 'macro-1' });
  const irma = os({ id: 'OS-2', macroServiceId: 'macro-1' });

  const resumoCom = (quotes: Quote[]) =>
    buildBudgetHistorySummary(atual, [irma], { 'OS-2': quotes });

  it('a aprovada ganha, mesmo sendo a mais cara', () => {
    // A aprovada é o que de fato foi pago — é ela que serve de referência.
    const resumo = resumoCom([
      cotacao({ id: 'a', vendor: 'Barato', value: 'R$ 100,00' }),
      cotacao({ id: 'b', vendor: 'Aprovado', value: 'R$ 900,00', status: 'approved' }),
    ]);
    expect(resumo.similarCases[0].vendor).toBe('Aprovado');
    expect(resumo.similarCases[0].value).toBe(900);
  });

  it('sem aprovada, a recomendada', () => {
    const resumo = resumoCom([
      cotacao({ id: 'a', vendor: 'Barato', value: 'R$ 100,00' }),
      cotacao({ id: 'b', vendor: 'Recomendado', value: 'R$ 500,00', recommended: true }),
    ]);
    expect(resumo.similarCases[0].vendor).toBe('Recomendado');
  });

  it('sem aprovada e sem recomendada, a mais barata', () => {
    const resumo = resumoCom([
      cotacao({ id: 'a', vendor: 'Caro', value: 'R$ 900,00' }),
      cotacao({ id: 'b', vendor: 'Barato', value: 'R$ 100,00' }),
    ]);
    expect(resumo.similarCases[0].vendor).toBe('Barato');
  });

  it('cotação com valor ilegível não vira zero — a OS inteira fica de fora', () => {
    // Zero silencioso puxaria a média para baixo e a gestora veria um preço médio
    // que nunca existiu.
    const resumo = resumoCom([cotacao({ value: 'combinar' })]);
    expect(resumo.similarCases).toEqual([]);
  });

  it('rodada inicial tem preferência sobre as demais', () => {
    // Aditivo e recotação não são o preço de referência do serviço.
    const resumo = resumoCom([
      cotacao({ id: 'a', vendor: 'Aditivo', value: 'R$ 50,00', category: 'additive' }),
      cotacao({ id: 'b', vendor: 'Inicial', value: 'R$ 700,00', category: 'initial' }),
    ]);
    expect(resumo.similarCases[0].vendor).toBe('Inicial');
  });
});

describe('os números que a tela mostra', () => {
  const atual = os({ id: 'OS-atual', macroServiceId: 'macro-1' });

  const seisIrmas = Array.from({ length: 6 }, (_, i) =>
    os({ id: `OS-${i}`, macroServiceId: 'macro-1', time: mesesAtras(i + 1) })
  );
  const cotacoes = Object.fromEntries(
    seisIrmas.map((irma, i) => [irma.id, [cotacao({ value: `R$ ${(i + 1) * 100},00` })]])
  );

  it('média, mínimo e máximo saem dos casos exibidos', () => {
    const resumo = buildBudgetHistorySummary(atual, seisIrmas, cotacoes);
    const valores = resumo.similarCases.map(c => c.value);
    expect(resumo.minQuoteValue).toBe(Math.min(...valores));
    expect(resumo.maxQuoteValue).toBe(Math.max(...valores));
    expect(resumo.averageQuoteValue).toBe(valores.reduce((s, v) => s + v, 0) / valores.length);
  });

  it('⚠️ o teto é 5 casos — e a CONTAGEM também para em 5', () => {
    /**
     * CARACTERIZAÇÃO de um comportamento discutível, fixado e RELATADO.
     *
     * São 6 OS comparáveis aqui, mas `comparableTicketCount` devolve 5, porque é
     * `similarCases.length` depois do corte. A tela diz "5 casos comparáveis" tendo
     * 30 na base, e a média é a média dos 5 — não da amostra real.
     *
     * A contagem é coerente com a média (as duas olham os mesmos 5), o que é bom.
     * O que se perde é a noção de amostra: 5 de 5 e 5 de 30 aparecem igual, e a
     * segunda merece bem mais confiança. Mudar isso é decisão de produto.
     */
    const resumo = buildBudgetHistorySummary(atual, seisIrmas, cotacoes);
    expect(resumo.similarCases).toHaveLength(5);
    expect(resumo.comparableTicketCount).toBe(5);
    expect(resumo.comparableQuoteCount).toBe(5);
  });

  it('o comparável mais recente é destacado à parte', () => {
    const resumo = buildBudgetHistorySummary(atual, seisIrmas, cotacoes);
    expect(resumo.latestComparableDate).not.toBeNull();
    const maisRecente = [...resumo.similarCases].sort(
      (a, b) => b.date.getTime() - a.date.getTime()
    )[0];
    expect(resumo.latestComparableValue).toBe(maisRecente.value);
    expect(resumo.latestComparableVendor).toBe(maisRecente.vendor);
  });

  it('sem nenhum comparável, os números vêm nulos e não zerados', () => {
    // Zero é um preço; ausência de dado não é. A tela precisa distinguir.
    const resumo = buildBudgetHistorySummary(atual, [], {});
    expect(resumo.averageQuoteValue).toBeNull();
    expect(resumo.minQuoteValue).toBeNull();
    expect(resumo.maxQuoteValue).toBeNull();
    expect(resumo.latestComparableValue).toBeNull();
  });
});

describe('os termos que explicam a busca', () => {
  it('saem do macroserviço e do serviço da OS em foco', () => {
    // A tela mostra "com base em..." — sem isso o número aparece sem procedência.
    const resumo = buildBudgetHistorySummary(
      os({ macroServiceName: 'Elétrica', serviceCatalogName: 'Troca de lâmpada' }),
      [],
      {}
    );
    expect(resumo.basisTerms).toContain('macroserviço: Elétrica');
    expect(resumo.basisTerms).toContain('serviço: Troca de lâmpada');
  });

  it('no máximo 8, sem repetidos', () => {
    const resumo = buildBudgetHistorySummary(
      os({ macroServiceName: 'Elétrica', serviceCatalogName: 'Elétrica' }),
      [],
      {}
    );
    expect(resumo.basisTerms.length).toBeLessThanOrEqual(8);
  });
});

describe('o valor formatado', () => {
  it('sai em real', () => {
    expect(formatBudgetHistoryValue(1234.5)).toContain('1.234,50');
  });

  it('ausência vira traço, não "R$ 0,00"', () => {
    // "R$ 0,00" seria lido como preço zero; o traço diz "não sabemos".
    expect(formatBudgetHistoryValue(null)).toBe('-');
  });
});

describe('DEFEITO CORRIGIDO: vazio nao casa com vazio', () => {
  /**
   * Achado por este arquivo de caracterizacao, na primeira execucao.
   *
   * A comparacao de desempate era `normalizeText(a || '') === normalizeText(b || '')`.
   * Com as duas OS sem nome de servico preenchido, isso dava `'' === ''` -> verdadeiro,
   * nos DOIS criterios. Resultado: duas OS de macroservico e servico DIFERENTES
   * tiravam 11 de 11 -- a nota maxima -- rotuladas como compartilhando "servico" e
   * "macroservico".
   *
   * E OS sem nome preenchido nao e caso raro: e o estado normal de toda OS que entra
   * por e-mail antes de alguem classificar. Na pratica, o preco de referencia que a
   * gestora ve ao avaliar uma cotacao saia da media de OS sem relacao nenhuma.
   */
  const semNomes = (id: string, extra: Record<string, unknown> = {}) =>
    os({ id, ...extra });

  it('OS diferentes sem nome preenchido NAO se parecem', () => {
    const resumo = buildBudgetHistorySummary(
      semNomes('OS-atual', { macroServiceId: 'macro-1', serviceCatalogId: 'svc-1' }),
      [semNomes('OS-outra', { macroServiceId: 'macro-9', serviceCatalogId: 'svc-9' })],
      { 'OS-outra': [cotacao()] }
    );
    expect(resumo.similarCases).toEqual([]);
  });

  it('e nenhuma das duas entra na media de preco', () => {
    // A consequencia que importa: o numero que a tela mostra.
    const resumo = buildBudgetHistorySummary(
      semNomes('OS-atual', { macroServiceId: 'macro-1' }),
      [semNomes('OS-outra', { macroServiceId: 'macro-9' })],
      { 'OS-outra': [cotacao({ value: 'R$ 99.999,00' })] }
    );
    expect(resumo.averageQuoteValue).toBeNull();
  });

  it('mas nome IGUAL de verdade continua casando', () => {
    // A correcao nao pode fechar o caminho legitimo: OS antiga guarda o nome, nao o id.
    const resumo = buildBudgetHistorySummary(
      os({ id: 'OS-atual', macroServiceName: 'Eletrica' }),
      [os({ id: 'OS-irma', macroServiceName: 'ELETRICA' })],
      { 'OS-irma': [cotacao()] }
    );
    expect(resumo.similarCases).toHaveLength(1);
    expect(resumo.similarCases[0].sharedTerms).toContain('macroservi' + 'ço');
  });
});
