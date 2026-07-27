import { describe, expect, it, vi } from 'vitest';
import {
  processEmailOutboxBatch,
  selectEligibleEmailOutbox,
} from '../../api/_lib/emailOutboxWorker.js';

function createDb(rows: Array<{ id: string; data: Record<string, unknown> }>) {
  const writes: Array<{ ref: unknown; value: unknown }> = [];
  const docs = rows.map(row => ({
    id: row.id,
    ref: { id: row.id },
    data: () => row.data,
  }));
  const query = {
    where: vi.fn(() => query),
    limit: vi.fn(() => query),
    get: vi.fn(async () => ({ docs, size: docs.length })),
  };
  const db = {
    collection: vi.fn((name: string) => (
      name === 'emailOutbox'
        ? query
        : { doc: (id: string) => ({ id: `${name}/${id}` }) }
    )),
    batch: vi.fn(() => ({
      set: (ref: unknown, value: unknown) => writes.push({ ref, value }),
      commit: vi.fn(async () => undefined),
    })),
  };
  return { db, writes };
}

describe('email outbox worker', () => {
  it('seleciona pendentes, falhas vencidas e leases expiradas', async () => {
    const now = new Date('2026-07-24T12:00:00.000Z');
    const { db } = createDb([
      { id: 'pending', data: { ticketId: 'OS-1', commandKey: 'command_pending', status: 'pending' } },
      {
        id: 'deferred',
        data: {
          ticketId: 'OS-2',
          commandKey: 'command_deferred',
          status: 'failed',
          attempts: 1,
          nextAttemptAt: new Date('2026-07-24T12:01:00.000Z'),
        },
      },
      {
        id: 'expired',
        data: {
          ticketId: 'OS-3',
          commandKey: 'command_expired',
          status: 'processing',
          attempts: 1,
          leaseAt: new Date('2026-07-24T11:55:00.000Z'),
        },
      },
    ]);

    const result = await selectEligibleEmailOutbox(db, { now, batchSize: 10 });
    expect(result.eligible.map(item => item.id)).toEqual(['pending', 'expired']);
  });

  it('NÃO marca dead-letter enquanto a lease está ativa (envio em voo)', async () => {
    // attempts é incrementado no claim, então o item na última tentativa EM VOO
    // chega aqui com attempts == MAX. Marcá-lo dead-letter zeraria o leaseToken e o
    // markSent do envio em curso estouraria 409 → doc dead-letter apesar de
    // entregue, e o retry manual reenviaria o mesmo e-mail.
    const now = new Date('2026-07-24T12:00:00.000Z');
    const { db, writes } = createDb([
      {
        id: 'in-flight',
        data: {
          ticketId: 'OS-1',
          commandKey: 'command_inflight',
          status: 'processing',
          attempts: 6,
          leaseAt: new Date('2026-07-24T11:59:30.000Z'), // 30s atrás — lease ativa
        },
      },
      {
        id: 'abandoned',
        data: {
          ticketId: 'OS-2',
          commandKey: 'command_abandoned',
          status: 'processing',
          attempts: 6,
          leaseAt: new Date('2026-07-24T11:50:00.000Z'), // 10min atrás — lease expirada
        },
      },
    ]);

    const result = await selectEligibleEmailOutbox(db, { now, batchSize: 10 });
    expect(result.deadLettered).toBe(1); // só o abandonado
    const deadLetterIds = writes
      .map(item => (item.ref as { id?: string })?.id)
      .filter((id): id is string => typeof id === 'string');
    expect(deadLetterIds).toContain('abandoned');
    expect(deadLetterIds).not.toContain('in-flight');
  });

  it('isola falha de uma entrega sem interromper o restante do lote', async () => {
    const { db } = createDb([
      { id: 'one', data: { ticketId: 'OS-1', commandKey: 'command_one', status: 'pending' } },
      { id: 'two', data: { ticketId: 'OS-2', commandKey: 'command_two', status: 'pending' } },
    ]);
    const dispatch = vi.fn(async ({ ticketId }: { ticketId: string }) => {
      if (ticketId === 'OS-2') throw new Error('provider unavailable');
      return { ok: true };
    });

    const result = await processEmailOutboxBatch({ db, dispatch, batchSize: 10 });
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});
