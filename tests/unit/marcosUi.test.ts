import { describe, expect, it } from 'vitest';
import { MARCOS_DA_OS, contarAcontecidos, contarMarcos, lerMarcos } from '../../src/utils/marcos';

/**
 * A RÉGUA DA TELA — seis marcos, e a ausência sendo dado.
 *
 * A régua é a da planilha da coordenação, não uma invenção nossa. E o ponto delicado
 * é o vazio: `coerceDate` cai em "hoje" quando o valor falta, o que desenharia a linha
 * do tempo cheia e mentiria. Foi assim que o gráfico de tendência leu
 * `closureChecklist.closedAt` (vazio em 92 de 92) e mostrou zero por meses sem ninguém
 * notar — zero parece um mês fraco, não um campo vazio.
 */
describe('régua de marcos da OS', () => {
  it('tem os seis marcos que a operação acompanha, nesta ordem', () => {
    expect(MARCOS_DA_OS.map(m => m.rotulo)).toEqual([
      'Visita técnica',
      'Aprovação da solução',
      'Orçamento',
      'Ações preliminares',
      'Início da execução',
      'Conclusão',
    ]);
  });

  it('marco ausente vira null — nunca "hoje"', () => {
    const marcos = lerMarcos({ marcos: {} });
    expect(marcos).toHaveLength(6);
    expect(marcos.every(m => m.data === null)).toBe(true);
    expect(contarMarcos({ marcos: {} })).toBe(0);
  });

  it('OS sem o campo (as 181 anteriores ao carimbo) não quebra a tela', () => {
    expect(contarMarcos({})).toBe(0);
    expect(contarMarcos({ marcos: undefined })).toBe(0);
    expect(lerMarcos({ marcos: null as never })).toHaveLength(6);
  });

  it('lê a data em ISO (como chega da API) e em Date', () => {
    const lidos = lerMarcos({
      marcos: {
        'Aguardando Parecer Técnico': '2026-07-01T12:00:00.000Z',
        'Em andamento': new Date('2026-08-01T12:00:00.000Z'),
      },
    });
    expect(lidos[0].data?.toISOString()).toBe('2026-07-01T12:00:00.000Z');
    expect(lidos[4].data?.toISOString()).toBe('2026-08-01T12:00:00.000Z');
    expect(contarMarcos({ marcos: { 'Em andamento': '2026-08-01T12:00:00.000Z' } })).toBe(1);
  });

  it('data corrompida conta como ausente, em vez de virar Invalid Date na tela', () => {
    expect(contarMarcos({ marcos: { 'Em andamento': 'não é data' } })).toBe(0);
  });

  it('o percurso ESPARSO é lido como tal — pular etapa é o caso comum', () => {
    // 45% das linhas da planilha pulam etapa. Uma OS que teve visita, orçamento e
    // execução, sem aprovação nem ações preliminares, é percurso normal e não erro.
    const conta = contarMarcos({
      marcos: {
        'Aguardando Parecer Técnico': '2026-05-05T12:00:00.000Z',
        'Aguardando Orçamento': '2026-05-20T12:00:00.000Z',
        'Em andamento': '2026-06-15T12:00:00.000Z',
      },
    });
    expect(conta).toBe(3);
  });
});

/**
 * OS TRÊS ESTADOS — e a fronteira entre "não sei quando" e "não sei se".
 *
 * A leitura de duas cores dizia a mesma coisa para dois fatos diferentes: o marco que
 * a OS ultrapassou sem ninguém registrar a data, e o marco onde a OS ainda não chegou.
 * Medido em 03/09/2026: 100 das 220 OS tinham exatamente quatro marcos ultrapassados
 * sem carimbo, e uma OS ENCERRADA aparecia como "2 de 6".
 */
describe('marco que aconteceu sem data', () => {
  const AS = 'Aguardando Aprovação da Solução';
  const OR = 'Aguardando Orçamento';
  const EX = 'Em andamento';

  it('separa os três estados', () => {
    const lidos = lerMarcos({
      marcos: { 'Aguardando Parecer Técnico': '2026-07-01T12:00:00.000Z' },
      marcosSemData: [AS, OR],
    });
    expect(lidos.map(m => m.estado)).toEqual([
      'com-data',
      'sem-data',
      'sem-data',
      'vazio',
      'vazio',
      'vazio',
    ]);
  });

  it('a data manda sobre a lista — lista velha não rebaixa marco conhecido', () => {
    const lidos = lerMarcos({ marcos: { [EX]: '2026-08-01T12:00:00.000Z' }, marcosSemData: [EX] });
    expect(lidos[4].estado).toBe('com-data');
    expect(lidos[4].data).toBeInstanceOf(Date);
  });

  it('as duas contagens respondem perguntas diferentes', () => {
    const os = { marcos: { 'Aguardando Parecer Técnico': '2026-07-01T12:00:00.000Z' }, marcosSemData: [AS, OR] };
    // Quantas DATAS o sistema tem — é o que alimenta a régua dos Indicadores.
    expect(contarMarcos(os)).toBe(1);
    // Quanto a OS ANDOU — é o que a coluna da Gestão mostra.
    expect(contarAcontecidos(os)).toBe(3);
  });

  it('OS sem o campo novo (as 220 de hoje) continua lendo dois estados', () => {
    const lidos = lerMarcos({ marcos: { [EX]: '2026-08-01T12:00:00.000Z' } });
    expect(lidos.filter(m => m.estado === 'sem-data')).toHaveLength(0);
    expect(contarAcontecidos({ marcos: { [EX]: '2026-08-01T12:00:00.000Z' } })).toBe(1);
  });

  it('campo corrompido não quebra a leitura', () => {
    expect(contarAcontecidos({ marcosSemData: null as never })).toBe(0);
    expect(contarAcontecidos({ marcosSemData: 'AS' as never })).toBe(0);
  });
});
