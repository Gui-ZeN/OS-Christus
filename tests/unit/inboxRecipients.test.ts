import { describe, expect, it } from 'vitest';
import {
  mergeEmails,
  normalizeForMatching,
  parseEmailTokens,
  sugerirInteressados,
} from '../../src/views/inbox/recipients';

describe('parseEmailTokens', () => {
  it('aceita os separadores que as pessoas realmente usam ao colar', () => {
    const r = parseEmailTokens('ana@px.com.br, bruno@px.com.br; carla@px.com.br  davi@px.com.br');
    expect(r.valid).toEqual(['ana@px.com.br', 'bruno@px.com.br', 'carla@px.com.br', 'davi@px.com.br']);
    expect(r.invalid).toEqual([]);
  });

  it('devolve o que não é endereço em vez de engolir', () => {
    // Descartar em silêncio é como um destinatário some sem ninguém perceber.
    const r = parseEmailTokens('ana@px.com.br, sem-arroba, thais@');
    expect(r.valid).toEqual(['ana@px.com.br']);
    expect(r.invalid).toEqual(['sem-arroba', 'thais@']);
  });

  it('normaliza caixa e não repete', () => {
    const r = parseEmailTokens('Ana@PX.com.br ana@px.com.br');
    expect(r.valid).toEqual(['ana@px.com.br']);
  });

  it('campo vazio não vira lista com sujeira', () => {
    expect(parseEmailTokens('   ,, ;  ')).toEqual({ valid: [], invalid: [] });
  });
});

describe('mergeEmails', () => {
  it('junta listas sem repetir e ignorando caixa', () => {
    // Endereço duplicado é e-mail enviado duas vezes — é assim que o sistema passa
    // a impressão de que spamma.
    expect(mergeEmails(['Ana@px.com.br'], ['ana@px.com.br', 'bruno@px.com.br'], undefined)).toEqual([
      'ana@px.com.br',
      'bruno@px.com.br',
    ]);
  });

  it('sobrevive a lista ausente ou com buraco', () => {
    expect(mergeEmails(undefined, ['', '  ', 'ana@px.com.br'])).toEqual(['ana@px.com.br']);
  });
});

describe('normalizeForMatching', () => {
  it('casa texto escrito por gente: acento, caixa e espaço não contam', () => {
    expect(normalizeForMatching('  Refeitório ')).toBe('refeitorio');
    expect(normalizeForMatching('Bloco A')).toBe(normalizeForMatching('bloco a'));
  });

  it('nulo e indefinido viram string vazia, não quebram a comparação', () => {
    expect(normalizeForMatching(null)).toBe('');
    expect(normalizeForMatching(undefined)).toBe('');
  });
});

/**
 * SUGERIR QUEM ENTRA EM CÓPIA.
 *
 * Medido em produção em 04/09/2026: 239 das 244 OS têm interessados e 112 endereços
 * distintos — o hábito existe, e a tela não o lê. O que a medição também disse, e que
 * decide o desenho: só QUATRO endereços passam de 70% das OS (e já entram em tudo),
 * enquanto `diretoria01.pq` está em 76% das OS de PQL1 e 7% do geral. Global não
 * serve; por sede, serve.
 */
describe('sugerirInteressados', () => {
  const os = (sede: string, cc: string[]) => ({ sede, requesterCcEmails: cc });

  const carteira = [
    os('PQL1', ['infra01.pq@px.com.br', 'diretoria01.pq@christus.com.br', 'murilo@px.com.br']),
    os('PQL1', ['infra01.pq@px.com.br', 'diretoria01.pq@christus.com.br']),
    os('PQL1', ['infra01.pq@px.com.br', 'murilo@px.com.br']),
    os('SUL2', ['infra05.su@px.com.br', 'murilo@px.com.br']),
    os('SUL2', ['infra05.su@px.com.br']),
    os('SUL2', ['infra05.su@px.com.br']),
  ];

  it('ordena por frequência DENTRO da sede', () => {
    const s = sugerirInteressados(carteira, { sede: 'PQL1' });
    expect(s.map(x => x.email)).toEqual([
      'infra01.pq@px.com.br',
      'diretoria01.pq@christus.com.br',
      'murilo@px.com.br',
    ]);
    expect(s[0]).toMatchObject({ vezes: 3, de: 3 });
  });

  it('a sede muda a resposta — é o ponto inteiro', () => {
    // `infra05.su` domina SUL2 e não existe em PQL1. Num ranking global ele
    // apareceria nas duas, e estaria errado numa delas.
    expect(sugerirInteressados(carteira, { sede: 'SUL2' })[0].email).toBe('infra05.su@px.com.br');
    expect(sugerirInteressados(carteira, { sede: 'PQL1' }).map(x => x.email)).not.toContain(
      'infra05.su@px.com.br'
    );
  });

  it('quem já está em cópia sai da lista', () => {
    // É isto que apaga os onipresentes sem precisar de regra para eles: eles já estão
    // na OS aberta, então não voltam como sugestão.
    const s = sugerirInteressados(carteira, {
      sede: 'PQL1',
      jaEscolhidos: ['INFRA01.PQ@px.com.br'],
    });
    expect(s.map(x => x.email)).not.toContain('infra01.pq@px.com.br');
    expect(s[0].email).toBe('diretoria01.pq@christus.com.br');
  });

  it('exige piso de amostra: uma OS não vira "100%"', () => {
    const soUma = [os('BN', ['alguem@px.com.br'])];
    expect(sugerirInteressados(soUma, { sede: 'BN' })).toEqual([]);
    // Com o piso baixado explicitamente, aí sim responde.
    expect(sugerirInteressados(soUma, { sede: 'BN', minimoDeOs: 1 })).toHaveLength(1);
  });

  it('sem sede não há o que sugerir — não cai no ranking global', () => {
    expect(sugerirInteressados(carteira, {})).toEqual([]);
    expect(sugerirInteressados(carteira, { sede: '' })).toEqual([]);
    expect(sugerirInteressados(carteira, { sede: null })).toEqual([]);
  });

  it('casa a sede sem acento e sem caixa, e aceita siteId', () => {
    const mistas = [
      { siteId: 'pql1', requesterCcEmails: ['a@px.com.br'] },
      { sede: 'PQL1', requesterCcEmails: ['a@px.com.br'] },
      { sede: ' pql1 ', requesterCcEmails: ['a@px.com.br'] },
    ];
    expect(sugerirInteressados(mistas, { sede: 'PQL1' })[0]).toMatchObject({ vezes: 3, de: 3 });
  });

  it('a mesma pessoa citada duas vezes na mesma OS vale um voto', () => {
    const repetida = [
      os('DT', ['ana@px.com.br', 'ANA@px.com.br']),
      os('DT', ['bruno@px.com.br']),
      os('DT', ['bruno@px.com.br']),
    ];
    const s = sugerirInteressados(repetida, { sede: 'DT' });
    expect(s[0]).toMatchObject({ email: 'bruno@px.com.br', vezes: 2 });
    expect(s[1]).toMatchObject({ email: 'ana@px.com.br', vezes: 1 });
  });

  it('empate é desfeito pelo endereço, para a lista não dançar entre recargas', () => {
    const empate = [
      os('BS', ['zeca@px.com.br', 'ana@px.com.br']),
      os('BS', ['zeca@px.com.br', 'ana@px.com.br']),
      os('BS', ['zeca@px.com.br', 'ana@px.com.br']),
    ];
    expect(sugerirInteressados(empate, { sede: 'BS' }).map(x => x.email)).toEqual([
      'ana@px.com.br',
      'zeca@px.com.br',
    ]);
  });

  it('sobrevive a OS sem o campo e a lista vazia', () => {
    const tortas = [
      { sede: 'DT' },
      { sede: 'DT', requesterCcEmails: [] },
      { sede: 'DT', requesterCcEmails: ['ok@px.com.br'] },
    ];
    expect(sugerirInteressados(tortas, { sede: 'DT' })).toEqual([
      { email: 'ok@px.com.br', vezes: 1, de: 3 },
    ]);
    expect(sugerirInteressados([], { sede: 'DT' })).toEqual([]);
  });
});
