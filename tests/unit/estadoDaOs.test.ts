import { describe, expect, it } from 'vitest';
import { ESTADO, esperaDeclarada, estadoDaOs, suspensaoVigente } from '../../api/_lib/estadoDaOs.js';

const AGORA = new Date('2026-08-17T12:00:00Z');
const futuro = new Date('2026-08-30T12:00:00Z');
const passado = new Date('2026-08-01T12:00:00Z');

const parada = (reason: string, reviewAt: Date = futuro) => ({
  id: 'OS-1',
  attention: { state: 'suspensa', reason, reviewAt },
});

describe('os três estados saem do que já estava gravado', () => {
  it('OS sem o campo é ativa — não exige backfill de 268 OS', () => {
    expect(estadoDaOs({ id: 'OS-1' }, AGORA)).toBe(ESTADO.ATIVA);
    expect(estadoDaOs({ id: 'OS-1', attention: null }, AGORA)).toBe(ESTADO.ATIVA);
  });

  it('espera da casa é "esperando"', () => {
    expect(estadoDaOs(parada('aguardando-aprovacao'), AGORA)).toBe(ESTADO.ESPERANDO);
    expect(estadoDaOs(parada('sem-verba'), AGORA)).toBe(ESTADO.ESPERANDO);
    expect(estadoDaOs(parada('depende-de-periodo'), AGORA)).toBe(ESTADO.ESPERANDO);
  });

  it('terceiro travando é "impedida"', () => {
    expect(estadoDaOs(parada('aguardando-terceiro'), AGORA)).toBe(ESTADO.IMPEDIDA);
    expect(estadoDaOs(parada('aguardando-material'), AGORA)).toBe(ESTADO.IMPEDIDA);
    expect(estadoDaOs(parada('aguardando-orcamento'), AGORA)).toBe(ESTADO.IMPEDIDA);
  });

  it('motivo desconhecido não vira impedida — não se afirma bloqueio sem saber', () => {
    expect(estadoDaOs(parada('outro'), AGORA)).toBe(ESTADO.ESPERANDO);
    expect(estadoDaOs(parada('motivo-que-nao-existe'), AGORA)).toBe(ESTADO.ESPERANDO);
  });
});

describe('a parada expira sozinha — é o que impede virar gaveta', () => {
  it('revisão vencida devolve a OS para ativa, sem ninguém "dessuspender"', () => {
    expect(suspensaoVigente(parada('aguardando-terceiro', passado), AGORA)).toBeNull();
    expect(estadoDaOs(parada('aguardando-terceiro', passado), AGORA)).toBe(ESTADO.ATIVA);
  });

  it('parada sem data de revisão não vale', () => {
    expect(estadoDaOs({ attention: { state: 'suspensa', reason: 'aguardando-terceiro' } }, AGORA)).toBe(ESTADO.ATIVA);
  });
});

describe('espera declarada não é buraco', () => {
  it('esperando e impedida contam como espera declarada', () => {
    // É o furo que o estado resolve: sem isso, uma OS legitimamente parada aparece
    // como "sem próxima ação" e alguém marca "revisar em 30 dias" só para tirá-la da
    // lista — o indicador passa a medir disciplina de preenchimento.
    expect(esperaDeclarada(parada('aguardando-aprovacao'), AGORA)).toBe(true);
    expect(esperaDeclarada(parada('aguardando-terceiro'), AGORA)).toBe(true);
  });

  it('OS ativa sem próxima ação continua sendo buraco', () => {
    expect(esperaDeclarada({ id: 'OS-1' }, AGORA)).toBe(false);
    // Revisão vencida: volta a cobrar decisão.
    expect(esperaDeclarada(parada('aguardando-terceiro', passado), AGORA)).toBe(false);
  });
});
