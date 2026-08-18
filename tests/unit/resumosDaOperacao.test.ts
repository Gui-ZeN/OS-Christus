import { describe, expect, it } from 'vitest';
import {
  resumoDaAgenda,
  resumoDoFimDoDia,
  resumoSemConfirmacao,
} from '../../api/_lib/resumosDaOperacao.js';

// 17/08/2026, 14h em Fortaleza.
const agora = new Date('2026-08-17T17:00:00Z');
const hojeAs = (h: number) => new Date(`2026-08-17T${String(h + 3).padStart(2, '0')}:00:00Z`);
const diasAtras = (n: number) => new Date(agora.getTime() - n * 86_400_000);

const visita = (extra: Record<string, unknown> = {}) => ({
  id: 'c1',
  state: 'agendado',
  startAt: hojeAs(8),
  sede: 'SUL3',
  vendorName: 'Vidraçaria Norte',
  ticketIds: ['OS-0151'],
  toleranceMinutes: 30,
  ...extra,
});

describe('07h — a agenda da operação', () => {
  it('lista as visitas de hoje em ordem de horário', () => {
    const r = resumoDaAgenda({
      commitments: [visita({ id: 'c2', startAt: hojeAs(16) }), visita()],
      now: agora,
    });
    expect(r.visitas.map(v => v.hora)).toEqual(['08:00', '16:00']);
  });

  it('traz junto o que já venceu — agenda sem atraso seria a tela antiga', () => {
    const r = resumoDaAgenda({
      commitments: [],
      tickets: [
        { id: 'OS-9', subject: 'Bomba', status: 'Em Execução', nextAction: { dueAt: diasAtras(3), what: 'Cobrar peça' } },
        { id: 'OS-8', subject: 'Muro', status: 'Em Execução', nextAction: { dueAt: new Date(agora.getTime() + 86_400_000), what: 'Visita' } },
      ],
      now: agora,
    });
    expect(r.vencidas.map(v => v.id)).toEqual(['OS-9']);
  });

  it('OS encerrada não conta como vencida', () => {
    const r = resumoDaAgenda({
      tickets: [{ id: 'OS-7', status: 'Encerrada', nextAction: { dueAt: diasAtras(10), what: 'x' } }],
      now: agora,
    });
    expect(r.vencidas).toEqual([]);
  });

  it('nada marcado e nada vencido não vira e-mail', () => {
    expect(resumoDaAgenda({ commitments: [], tickets: [], now: agora }).vazio).toBe(true);
  });
});

describe('11h30 e 16h30 — sem confirmação, agrupado', () => {
  it('entra o que passou da tolerância e a sede não respondeu', () => {
    // 08h + 30min de tolerância, e agora são 14h.
    const r = resumoSemConfirmacao({ commitments: [visita()], now: agora });
    expect(r.visitas).toHaveLength(1);
    expect(r.visitas[0].fornecedor).toBe('Vidraçaria Norte');
  });

  it('visita ainda dentro da tolerância não entra', () => {
    const r = resumoSemConfirmacao({ commitments: [visita({ startAt: hojeAs(13.9) })], now: agora });
    expect(r.visitas).toEqual([]);
  });

  it('visita já respondida não entra', () => {
    for (const state of ['compareceu', 'faltou', 'cancelado']) {
      expect(resumoSemConfirmacao({ commitments: [visita({ state })], now: agora }).visitas, state).toEqual([]);
    }
  });

  it('tudo confirmado não vira e-mail', () => {
    expect(resumoSemConfirmacao({ commitments: [visita({ state: 'compareceu' })], now: agora }).vazio).toBe(true);
  });

  it('é UM resumo com várias visitas, não um e-mail por visita', () => {
    const r = resumoSemConfirmacao({
      commitments: [visita(), visita({ id: 'c2', sede: 'BN' }), visita({ id: 'c3', sede: 'ALD' })],
      now: agora,
    });
    expect(r.visitas).toHaveLength(3);
  });
});

describe('fim do dia — o que a diretoria vê', () => {
  it('conta as faltas confirmadas HOJE', () => {
    const ontem = new Date(agora.getTime() - 86_400_000);
    const r = resumoDoFimDoDia({
      commitments: [
        visita({ state: 'faltou', confirmedAt: agora }),
        visita({ id: 'c2', state: 'faltou', confirmedAt: ontem }),
      ],
      now: agora,
    });
    expect(r.faltas).toHaveLength(1);
  });

  it('separa sem-confirmação de falta — misturar acusaria fornecedor pelo silêncio', () => {
    const r = resumoDoFimDoDia({ commitments: [visita()], now: agora });
    expect(r.faltas).toEqual([]);
    expect(r.semConfirmacao).toBe(1);
  });

  it('conta as OS sem próxima ação e o tempo da mais antiga', () => {
    const r = resumoDoFimDoDia({
      tickets: [
        { id: 'OS-1', status: 'Em Execução', updatedAt: diasAtras(34) },
        { id: 'OS-2', status: 'Em Execução', updatedAt: diasAtras(12) },
        { id: 'OS-3', status: 'Em Execução', nextAction: { dueAt: agora, what: 'x' } },
        { id: 'OS-4', status: 'Encerrada', updatedAt: diasAtras(99) },
      ],
      now: agora,
    });
    expect(r.semProximaAcao).toBe(2);
    expect(r.diasDaMaisAntiga).toBe(34);
  });

  it('dia limpo não vira e-mail — silêncio é a informação', () => {
    expect(resumoDoFimDoDia({ commitments: [], tickets: [], now: agora }).vazio).toBe(true);
  });
});

describe('cobranças no fim do dia — só o que teve desfecho', () => {
  const visitaFaltou = (cobrancas: unknown[]) => ({
    id: 'c1',
    state: 'faltou',
    startAt: hojeAs(8),
    confirmedAt: agora,
    sede: 'BN',
    vendorName: 'Elétrica Ceará',
    ticketIds: ['OS-0184'],
    cobrancas,
  });

  it('abrir o WhatsApp não é cobrar', () => {
    const r = resumoDoFimDoDia({ commitments: [visitaFaltou([{ em: agora, desfecho: null }])], now: agora });
    expect(r.cobrancas).toBe(0);
    expect(r.pendentesDeDesfecho).toBe(1);
  });

  it('com desfecho, conta', () => {
    const r = resumoDoFimDoDia({
      commitments: [visitaFaltou([{ em: agora, desfecho: 'nao-respondeu', desfechoEm: agora }])],
      now: agora,
    });
    expect(r.cobrancas).toBe(1);
    expect(r.pendentesDeDesfecho).toBe(0);
  });

  it('Timestamp do Firestore não zera o contador em silêncio', () => {
    // O `desfechoEm` mora dentro do array e escapa da conversão da rota. Sem
    // tolerar o Timestamp, a métrica dizia ZERO cobranças num dia em que houve —
    // e ninguém confere um número que parece plausível.
    const timestamp = { seconds: Math.floor(agora.getTime() / 1000), nanoseconds: 0 };
    const r = resumoDoFimDoDia({
      commitments: [visitaFaltou([{ em: agora, desfecho: 'respondeu', desfechoEm: timestamp }])],
      now: agora,
    });
    expect(r.cobrancas).toBe(1);
  });

  it('cobrança de ontem não entra no resumo de hoje', () => {
    const ontem = new Date(agora.getTime() - 86_400_000);
    const r = resumoDoFimDoDia({
      commitments: [visitaFaltou([{ em: ontem, desfecho: 'respondeu', desfechoEm: ontem }])],
      now: agora,
    });
    expect(r.cobrancas).toBe(0);
  });
});
