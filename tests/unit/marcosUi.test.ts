import { describe, expect, it } from 'vitest';
import { MARCOS_DA_OS, contarMarcos, lerMarcos } from '../../src/utils/marcos';

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
