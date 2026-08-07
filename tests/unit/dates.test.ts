import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase-admin/firestore';
import { toDateOrNull } from '../../api/_lib/dates.js';

describe('toDateOrNull', () => {
  const esperado = new Date('2026-08-06T12:00:00.000Z');

  it('reconhece as cinco formas que uma data assume no caminho', () => {
    expect(toDateOrNull(esperado)).toEqual(esperado);
    expect(toDateOrNull(Timestamp.fromDate(esperado))).toEqual(esperado);
    expect(toDateOrNull({ toDate: () => esperado })).toEqual(esperado);
    expect(toDateOrNull('2026-08-06T12:00:00.000Z')).toEqual(esperado);
  });

  it('🐛 Timestamp que passou por JSON — o furo da cópia do emailOutbox', () => {
    // `{_seconds}` é o que sobra de um Timestamp serializado. A cópia antiga da fila
    // de e-mail devolvia null aqui: mensagem que não sai e ninguém vê.
    expect(toDateOrNull({ _seconds: 1785974400, _nanoseconds: 0 })).toEqual(
      new Date(1785974400 * 1000)
    );
    expect(toDateOrNull({ seconds: 1785974400 })).toEqual(new Date(1785974400 * 1000));
  });

  it('data sem hora vira MEIO-DIA UTC, para o dia não voltar em Fortaleza', () => {
    // Meia-noite UTC seria 21h do dia 5 no horário local — a tela mostraria o dia errado.
    const d = toDateOrNull('2026-08-06');
    expect(d?.toISOString()).toBe('2026-08-06T12:00:00.000Z');
    const emFortaleza = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Fortaleza' }).format(d!);
    expect(emFortaleza).toBe('2026-08-06');
  });

  it('o que não é data vira null — nunca uma Date inválida circulando', () => {
    expect(toDateOrNull(null)).toBeNull();
    expect(toDateOrNull(undefined)).toBeNull();
    expect(toDateOrNull('')).toBeNull();
    expect(toDateOrNull('nao e data')).toBeNull();
    expect(toDateOrNull({ qualquer: 'coisa' })).toBeNull();
    expect(toDateOrNull(new Date('lixo'))).toBeNull();
  });
});
