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

describe('⚠️ o marcador entre colchetes não pode ser exigido', () => {
  /**
   * Os PARES acima escondiam uma suposição: em todos, o `[SEDE]` do e-mail é a MESMA
   * sigla que ficou gravada na OS, então exigi-la não custava nada. Produção não
   * respeita isso.
   *
   * OS-0320, lida em 22/09/2026: no Gmail o assunto é
   * "Re: [JV] - Instalação de shafts de aluminio." e a sede gravada é **PJF**. `JV` é
   * outra sede do catálogo (José Vilar, zero OS). Colar o título exigia a palavra
   * `jv`, que não existe em lugar nenhum do registro — resultado zero, e três pessoas
   * concluindo por e-mail que a OS não estava no sistema.
   *
   * Medido: **84 das 275 threads** com `[tag]` no assunto têm tag que não bate com a
   * sede da OS ("PRÉ SUL" para PSUL, "DT1" para DT, "PQL 01" para PQL1…).
   *
   * O marcador não é gravado em campo nenhum, então ele nunca pode distinguir uma OS
   * de outra. Exigi-lo só tem como efeito esconder.
   */
  it('acha a OS-0320 colando o título do Gmail', () => {
    const alvo = 'OS-0320 Instalação de shafts de aluminio. Rafael Oliveira PJF PJF';
    expect(matchesSearch(alvo, 'Re: [JV] - Instalação de shafts de aluminio.')).toBe(true);
  });

  it('o marcador sai dos tokens, junto com o Re:', () => {
    expect(searchTokens('Re: [JV] - Instalação de shafts')).toEqual(['instalacao', 'de', 'shafts']);
    expect(searchTokens('[ PRÉ SUL ] Goteira no pátio')).toEqual(['goteira', 'no', 'patio']);
  });

  it('colchete no MEIO do termo continua valendo', () => {
    // Só o marcador do começo é decoração de thread. No meio, é texto do assunto.
    expect(searchTokens('bancos [reposição]')).toEqual(['bancos', 'reposicao']);
    expect(matchesSearch('OS-1 troca de bancos', 'bancos [reposição]')).toBe(false);
  });

  it('procurar só pela sigla da sede continua funcionando', () => {
    // Quem digita "PQL1" de propósito não está colando título — e a sede está no alvo.
    expect(matchesSearch('OS-0229 Goteira PQL1 PQL1', 'pql1')).toBe(true);
  });
});

describe('searchTokens', () => {
  it('descarta os prefixos de resposta empilhados na thread', () => {
    expect(searchTokens('Re: Fwd: Re: goteira')).toEqual(['goteira']);
    expect(searchTokens('RES: portão')).toEqual(['portao']);
  });

  it('trata colchete e pontuação como separador', () => {
    // ⚠️ ISTO MUDOU EM 22/09/2026, e a mudança é o conserto. Antes o teste esperava
    // `['sul','3','solicitacao']`: o marcador do começo virava palavra EXIGIDA. Como
    // ele não é gravado em campo nenhum da OS, exigi-lo nunca distinguiu uma OS de
    // outra — só escondeu as 84 threads cuja tag não bate com a sede. Agora o
    // marcador do começo sai; o colchete segue sendo separador no resto do termo.
    expect(searchTokens('[SUL 3]-Solicitação')).toEqual(['solicitacao']);
    expect(searchTokens('bancos [SUL 3]')).toEqual(['bancos', 'sul', '3']);
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
