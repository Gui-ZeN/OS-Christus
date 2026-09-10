import { describe, expect, it } from 'vitest';
import {
  estadoDoOrcamento,
  orcamentoParaGravar,
  resumoDoOrcamento,
  variacaoDe,
} from '../../src/views/financeiro/orcamento';

/**
 * A CONTA DO PAINEL FINANCEIRO NOVO.
 *
 * O painel anterior tinha 2.293 linhas e nenhum teste sobre o número que mostrava —
 * e nunca foi usado: zero cotações, zero contratos, zero medições, zero pagamentos
 * em 281 OS de produção. O novo registra duas coisas, e são estas as regras que
 * decidem se ele diz a verdade.
 */

describe('vazio não é zero', () => {
  it('sem os dois lados não há variação — e não é "-100%"', () => {
    /*
     * ⚠️ O ERRO QUE FARIA O PAINEL MENTIR PARA CIMA. Uma OS orçada em R$ 2.000 e
     * ainda não paga, com o vazio virando zero, apareceria como "-100%, economizou
     * tudo" — e entraria na soma de economia do período. Toda OS em andamento faria
     * isso ao mesmo tempo.
     */
    expect(variacaoDe({ previsto: '2000', realizado: null })).toBeNull();
    expect(variacaoDe({ previsto: null, realizado: '1800' })).toBeNull();
    expect(variacaoDe({})).toBeNull();
    expect(variacaoDe(null)).toBeNull();
  });

  it('com os dois, devolve a diferença em reais e em fração', () => {
    const v = variacaoDe({ previsto: 'R$ 2.400,00', realizado: 'R$ 2.180,00' });
    expect(v?.diferenca).toBeCloseTo(-220, 2);
    expect(v?.fracao).toBeCloseTo(-220 / 2400, 6);
  });

  it('zero realizado é uma resposta legítima, não ausência', () => {
    // "custou nada" existe — serviço resolvido pela própria equipe, por exemplo.
    const v = variacaoDe({ previsto: '500', realizado: '0' });
    expect(v?.diferenca).toBe(-500);
    expect(estadoDoOrcamento({ previsto: '500', realizado: '0' })).toBe('completo');
  });

  it('orçado zero não vira "∞%" — a fração some, a diferença fica', () => {
    // Dividir por zero dá Infinity, e o Intl formata isso como "∞%" sem reclamar.
    // Gasto de R$ 500 que ninguém previu: o número que conta é o 500.
    const v = variacaoDe({ previsto: '0', realizado: '500' });
    expect(v?.diferenca).toBe(500);
    expect(v?.fracao).toBeNull();
  });

  it('texto que não é um valor único conta como vazio', () => {
    // "R$ 1.500 a R$ 2.000" é coisa que se digita num orçamento. `parseFloat` daria
    // 1500,002; a regra da casa devolve null, e aqui isso significa "não informado".
    expect(estadoDoOrcamento({ previsto: 'R$ 1.500,00 a R$ 2.000,00' })).toBe('vazio');
    expect(variacaoDe({ previsto: '12,5,7', realizado: '100' })).toBeNull();
  });
});

describe('o estado diz o que falta', () => {
  it('nomeia os quatro casos', () => {
    expect(estadoDoOrcamento(undefined)).toBe('vazio');
    expect(estadoDoOrcamento({ previsto: '100' })).toBe('so-previsto');
    expect(estadoDoOrcamento({ realizado: '100' })).toBe('so-realizado');
    expect(estadoDoOrcamento({ previsto: '100', realizado: '90' })).toBe('completo');
  });
});

describe('o resumo do recorte', () => {
  const os = (previsto?: string | null, realizado?: string | null) => ({
    orcamento: { previsto, realizado },
  });

  it('conta quem tem e quem não tem registro', () => {
    // `semRegistro` é o número que diz se o painel está sendo usado — sem ele, um
    // painel vazio e um painel equilibrado mostram o mesmo total.
    const r = resumoDoOrcamento([os('100', '90'), os('200'), os(), { orcamento: undefined }]);
    expect(r.comRegistro).toBe(2);
    expect(r.semRegistro).toBe(2);
  });

  it('soma cada lado com quem tem aquele lado', () => {
    const r = resumoDoOrcamento([os('100', '90'), os('200', null), os(null, '50')]);
    expect(r.previsto).toBe(300);
    expect(r.realizado).toBe(140);
  });

  it('⚠️ a diferença comparável ignora OS meia-preenchida', () => {
    /*
     * Subtrair `realizado` de `previsto` daria -160 no caso abaixo — mas isso é a
     * diferença entre DUAS AMOSTRAS DIFERENTES, não a economia. Só a primeira OS tem
     * os dois lados, e a economia real dela é -10.
     */
    const r = resumoDoOrcamento([os('100', '90'), os('200', null), os(null, '50')]);
    expect(r.realizado - r.previsto).toBe(-160); // o número enganoso
    expect(r.diferencaComparavel).toBe(-10);     // o número honesto
    expect(r.comparaveis).toBe(1);
  });

  it('sem nada comparável, o contador distingue "bateu certinho" de "não havia o que comparar"', () => {
    const r = resumoDoOrcamento([os('200'), os(null, '50')]);
    expect(r.diferencaComparavel).toBe(0);
    expect(r.comparaveis).toBe(0);
  });
});

describe('o que vai gravado', () => {
  it('⚠️ campo apagado vira null, e não some do objeto', () => {
    /*
     * O merge do Firestore com a chave AUSENTE mantém o valor velho: quem limpasse o
     * realizado veria o número voltar no reload, sem erro nenhum. `null` apaga.
     */
    const gravado = orcamentoParaGravar({ previsto: '100', realizado: '90' }, { realizado: '' }, 'Larissa');
    expect(gravado.realizado).toBeNull();
    expect(gravado.previsto).toBe('100');
  });

  it('campo não mencionado preserva o que estava lá', () => {
    // A tela salva um campo por vez; sem isto, editar o previsto apagaria o realizado.
    const gravado = orcamentoParaGravar({ previsto: '100', realizado: '90' }, { previsto: '120' }, 'Larissa');
    expect(gravado.realizado).toBe('90');
    expect(gravado.previsto).toBe('120');
  });

  it('carimba quem mexeu e quando', () => {
    const agora = new Date('2026-09-10T12:00:00.000Z');
    const gravado = orcamentoParaGravar(undefined, { previsto: '100' }, 'Thais', agora);
    expect(gravado.atualizadoPor).toBe('Thais');
    expect(gravado.atualizadoEm).toBe('2026-09-10T12:00:00.000Z');
  });

  it('guarda o texto como a pessoa digitou', () => {
    // O dado é o que ela escreveu; a conversão para número é da leitura. Reformatar na
    // gravação apagaria a entrada original sem ela ter pedido.
    const gravado = orcamentoParaGravar(undefined, { previsto: 'R$ 2.400,00' }, 'Rafael');
    expect(gravado.previsto).toBe('R$ 2.400,00');
  });
});
