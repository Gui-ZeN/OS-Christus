import { describe, expect, it } from 'vitest';
import { suspensaVigente } from '../../api/_lib/estadoDaOs.js';

/** Suspensa vigente fica fora dos números dos painéis (decisão do dono, 26/10/2026). */
const agora = new Date('2026-10-26T12:00:00-03:00');
const em = (dias: number) => new Date(agora.getTime() + dias * 86_400_000);
const suspensa = (reviewAt: Date | null, status = 'Em andamento') =>
  ({ status, attention: { state: 'suspensa', reason: 'outro', reviewAt } });

describe('suspensa vigente', () => {
  it('aberta, suspensa e com revisão no futuro: fora dos números', () => {
    expect(suspensaVigente(suspensa(em(3)), agora)).toBe(true);
  });

  it('revisão vencida: VOLTA a contar — suspender não pode sumir com a OS', () => {
    expect(suspensaVigente(suspensa(em(-1)), agora)).toBe(false);
  });

  it('suspensa sem data de revisão é impedida, e conta', () => {
    expect(suspensaVigente(suspensa(null), agora)).toBe(false);
  });

  it('OS fechada nunca é suspensa, mesmo com o campo sobrando', () => {
    expect(suspensaVigente(suspensa(em(3), 'Encerrada'), agora)).toBe(false);
    expect(suspensaVigente(suspensa(em(3), 'Cancelada'), agora)).toBe(false);
  });

  it('sem suspensão: conta normalmente', () => {
    expect(suspensaVigente({ status: 'Em andamento' }, agora)).toBe(false);
  });
});
