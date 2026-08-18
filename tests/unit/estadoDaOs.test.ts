import { describe, expect, it } from 'vitest';
import {
  ESTADO,
  diasParadaNoEstado,
  esperaDeclarada,
  estadoDaOs,
  precisaDestravar,
} from '../../api/_lib/estadoDaOs.js';

const AGORA = new Date('2026-08-17T12:00:00Z');
const futuro = new Date('2026-08-30T12:00:00Z');
const passado = new Date('2026-08-01T12:00:00Z');

const parada = (reason: string, reviewAt: Date | null = futuro) => ({
  id: 'OS-1',
  attention: { state: 'suspensa', reason, reviewAt },
});

describe('o que decide o estado é o PRAZO, não o motivo', () => {
  it('OS sem parada declarada é ativa — não exige backfill de 268 OS', () => {
    expect(estadoDaOs({ id: 'OS-1' }, AGORA)).toBe(ESTADO.ATIVA);
    expect(estadoDaOs({ id: 'OS-1', attention: null }, AGORA)).toBe(ESTADO.ATIVA);
  });

  it('prazo futuro é ESPERANDO, qualquer que seja o motivo', () => {
    // "aguardando fabricação até 28/08" é espera legítima: ninguém tem ação útil
    // hoje, e jogá-la na fila urgente contamina a fila.
    for (const motivo of ['aguardando-material', 'aguardando-aprovacao', 'aguardando-terceiro', 'sem-verba']) {
      expect(estadoDaOs(parada(motivo), AGORA), motivo).toBe(ESTADO.ESPERANDO);
    }
  });

  it('prazo vencido é IMPEDIDA, qualquer que seja o motivo', () => {
    // Passou a data prometida: a espera deixou de ser legítima e alguém precisa
    // remover o bloqueio. É aqui que "cobrar o fornecedor" vira ação de hoje.
    for (const motivo of ['aguardando-material', 'aguardando-aprovacao']) {
      expect(estadoDaOs(parada(motivo, passado), AGORA), motivo).toBe(ESTADO.IMPEDIDA);
    }
  });

  it('parada SEM prazo nenhum é impedida — não é espera, é bloqueio sem data', () => {
    expect(estadoDaOs(parada('aguardando-terceiro', null), AGORA)).toBe(ESTADO.IMPEDIDA);
  });

  it('o motivo virou descrição: não muda mais o estado', () => {
    // Antes, "material" ia para impedida e "aprovação" para esperando. As duas
    // metades do plano se contradiziam, e nenhuma das duas estava certa.
    expect(estadoDaOs(parada('aguardando-material'), AGORA)).toBe(
      estadoDaOs(parada('aguardando-aprovacao'), AGORA)
    );
  });
});

describe('prazo vencido não devolve a OS para "ativa" em silêncio', () => {
  it('vira impedida, que é estado de AÇÃO', () => {
    // Antes a revisão vencida sumia e a OS reaparecia como "sem próxima ação",
    // acusando a gestora de não ter definido nada — quando o que houve foi um
    // terceiro furando o prazo.
    const vencida = parada('aguardando-terceiro', passado);
    expect(estadoDaOs(vencida, AGORA)).toBe(ESTADO.IMPEDIDA);
    expect(precisaDestravar(vencida, AGORA)).toBe(true);
  });

  it('espera vigente não precisa de ninguém hoje', () => {
    expect(precisaDestravar(parada('aguardando-material'), AGORA)).toBe(false);
  });
});

describe('espera declarada não é buraco', () => {
  it('esperando e impedida foram DECLARADAS — não contam como "sem próxima ação"', () => {
    expect(esperaDeclarada(parada('aguardando-aprovacao'), AGORA)).toBe(true);
    expect(esperaDeclarada(parada('aguardando-terceiro', passado), AGORA)).toBe(true);
  });

  it('OS ativa sem próxima ação continua sendo buraco', () => {
    expect(esperaDeclarada({ id: 'OS-1' }, AGORA)).toBe(false);
  });
});

describe('o tempo parado vem de stalledSince, não da última escrita', () => {
  it('usa stalledSince quando existe', () => {
    // Adiar uma revisão mexe em `updatedAt`, e usar `updatedAt` como medida de
    // estagnação faria qualquer toque administrativo zerar o número.
    const t = {
      stalledSince: new Date(AGORA.getTime() - 40 * 86_400_000),
      updatedAt: AGORA,
    };
    expect(diasParadaNoEstado(t, AGORA)).toBe(40);
  });

  it('cai para updatedAt e depois para createdAt', () => {
    expect(diasParadaNoEstado({ updatedAt: new Date(AGORA.getTime() - 5 * 86_400_000) }, AGORA)).toBe(5);
    expect(diasParadaNoEstado({ createdAt: new Date(AGORA.getTime() - 9 * 86_400_000) }, AGORA)).toBe(9);
    expect(diasParadaNoEstado({}, AGORA)).toBeNull();
  });

  it('aceita Timestamp do Firestore', () => {
    const ts = { seconds: Math.floor((AGORA.getTime() - 3 * 86_400_000) / 1000) };
    expect(diasParadaNoEstado({ stalledSince: ts }, AGORA)).toBe(3);
  });
});
