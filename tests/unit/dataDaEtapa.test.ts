import { describe, expect, it } from 'vitest';
import { diaEmFortaleza, resolverDataDaEtapa } from '../../api/_lib/dataDaEtapa.js';

/**
 * A data em que a OS entrou na etapa, informada pela pessoa (16/10/2026). Antes era
 * sempre o clique, e a data real da conclusão ia parar na observação.
 */
const agora = new Date('2026-10-16T14:30:00-03:00');
const abertaEm = new Date('2026-10-01T09:00:00-03:00');
const resolver = (d: string | null | undefined) => resolverDataDaEtapa(d, { agora, abertaEm });

describe('data da etapa', () => {
  it('sem data informada vale o clique — tela antiga não quebra', () => {
    expect(resolver(undefined)).toEqual({ data: agora });
    expect(resolver('')).toEqual({ data: agora });
  });

  it('hoje vale o instante do clique, para a ordem das mudanças do dia continuar certa', () => {
    expect(resolver('2026-10-16')).toEqual({ data: agora });
  });

  it('dia passado vira meio-dia em Fortaleza', () => {
    const r = resolver('2026-10-10') as { data: Date };
    expect(r.data.toISOString()).toBe('2026-10-10T15:00:00.000Z');
    expect(diaEmFortaleza(r.data)).toBe('2026-10-10');
  });

  it('o dia da abertura é aceito; antes dele, não', () => {
    expect('data' in resolver('2026-10-01')).toBe(true);
    expect(resolver('2026-09-30')).toEqual({ erro: 'A data da etapa não pode ser anterior à abertura da OS.' });
  });

  it('futuro é recusado', () => {
    expect(resolver('2026-10-17')).toEqual({ erro: 'A data da etapa não pode ser no futuro.' });
  });

  it('o "hoje" é o de Fortaleza: 22h do dia 16 em Fortaleza já é dia 17 em UTC', () => {
    const noite = new Date('2026-10-16T22:00:00-03:00');
    expect(resolverDataDaEtapa('2026-10-16', { agora: noite })).toEqual({ data: noite });
    expect(resolverDataDaEtapa('2026-10-17', { agora: noite })).toEqual({ erro: 'A data da etapa não pode ser no futuro.' });
  });

  it('formato errado ou data impossível é recusado', () => {
    expect('erro' in resolver('16/10/2026')).toBe(true);
    expect('erro' in resolver('2026-13-01')).toBe(true);
  });
});

describe('trava: não antes da entrada na etapa atual (16/10/2026)', () => {
  const entrouNaAtualEm = new Date('2026-10-12T10:00:00-03:00');
  const r = (d: string) => resolverDataDaEtapa(d, { agora, abertaEm, entrouNaAtualEm });

  it('o dia em que entrou na etapa atual é aceito; depois também', () => {
    expect('data' in r('2026-10-12')).toBe(true);
    expect('data' in r('2026-10-14')).toBe(true);
  });

  it('antes dele, não — o tempo por etapa sairia negativo', () => {
    expect(r('2026-10-11')).toEqual({ erro: 'A data não pode ser anterior à entrada na etapa atual (12/10/2026).' });
  });

  it('a abertura continua valendo quando a etapa atual é mais antiga', () => {
    const antiga = resolverDataDaEtapa('2026-09-30', { agora, abertaEm, entrouNaAtualEm: new Date('2026-09-01T10:00:00-03:00') });
    expect(antiga).toEqual({ erro: 'A data da etapa não pode ser anterior à abertura da OS.' });
  });
});
