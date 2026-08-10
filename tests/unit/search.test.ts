import { describe, it, expect } from 'vitest';
import { matchesSearch, normalizeSearchText, searchTokens } from '../../src/utils/search';

// Pares reais de produção (07/08/2026): o que aparece no Gmail × o que ficou gravado
// na OS. O parser de entrada remove o `Re:` e o `[SEDE]` ao criar a OS, e era isso
// que fazia a busca por título colado devolver zero.
const PARES = [
  {
    email: 'Re: [SUL 3]-Solicitação de bancos para as recepções.',
    os: 'Solicitação de bancos para as recepções.',
    sede: 'SUL 3',
  },
  {
    email: '[ PQL 2 ] Letreiro Luminoso com defeito',
    os: 'Letreiro Luminoso com defeito',
    sede: 'PQL 2',
  },
  {
    email: 'Re: [DT] - PELICULAS PARA SALA DE AULA E 9º ANDAR (SALA CONTAS A PAGAR).',
    os: 'PELICULAS PARA SALA DE AULA E 9º ANDAR (SALA CONTAS A PAGAR).',
    sede: 'DT',
  },
];

describe('matchesSearch — colar o título do e-mail acha a OS', () => {
  for (const par of PARES) {
    it(`acha "${par.os.slice(0, 40)}…" colando o título do Gmail`, () => {
      const alvo = `OS-0285 ${par.os} Fulano ${par.sede}`;
      expect(matchesSearch(alvo, par.email)).toBe(true);
      // A busca antiga, para registro do que quebrava:
      expect(alvo.toLowerCase().includes(par.email.toLowerCase())).toBe(false);
    });
  }

  it('acha por palavras soltas, fora de ordem', () => {
    const alvo = 'OS-0285 Solicitação de bancos para as recepções. Fulano SUL 3';
    expect(matchesSearch(alvo, 'bancos recepções')).toBe(true);
    expect(matchesSearch(alvo, 'recepcoes bancos')).toBe(true);
  });

  it('ignora acento nos dois lados', () => {
    expect(matchesSearch('Manutenção do pátio', 'manutencao patio')).toBe(true);
    expect(matchesSearch('Manutencao do patio', 'manutenção pátio')).toBe(true);
  });

  it('exige TODAS as palavras — não é busca por qualquer uma', () => {
    const alvo = 'OS-0285 Solicitação de bancos SUL 3';
    expect(matchesSearch(alvo, 'bancos portão')).toBe(false);
  });

  it('termo vazio não filtra nada', () => {
    expect(matchesSearch('qualquer coisa', '')).toBe(true);
    expect(matchesSearch('qualquer coisa', '   ')).toBe(true);
    expect(matchesSearch('qualquer coisa', null)).toBe(true);
  });

  it('acha pelo id da OS com ou sem o traço', () => {
    const alvo = 'OS-0285 Solicitação de bancos';
    expect(matchesSearch(alvo, 'OS-0285')).toBe(true);
    expect(matchesSearch(alvo, 'os 0285')).toBe(true);
    expect(matchesSearch(alvo, '0285')).toBe(true);
  });
});

describe('searchTokens', () => {
  it('descarta os prefixos de resposta empilhados na thread', () => {
    expect(searchTokens('Re: Fwd: Re: goteira')).toEqual(['goteira']);
    expect(searchTokens('RES: portão')).toEqual(['portao']);
  });

  it('trata colchete e pontuação como separador', () => {
    expect(searchTokens('[SUL 3]-Solicitação')).toEqual(['sul', '3', 'solicitacao']);
  });

  it('preserva o ordinal, que é como as pessoas escrevem andar', () => {
    expect(searchTokens('9º andar')).toEqual(['9º', 'andar']);
  });
});

describe('normalizeSearchText', () => {
  it('tira acento e caixa, aceita vazio', () => {
    expect(normalizeSearchText('Pátio JOÃO')).toBe('patio joao');
    expect(normalizeSearchText(null)).toBe('');
  });
});
