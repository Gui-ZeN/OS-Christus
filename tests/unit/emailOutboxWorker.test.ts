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

/**
 * Mock que PAGINA de verdade (respeita limit + startAfter), diferente do
 * createDb acima que devolve tudo numa leitura só. Sem isto, um teste de
 * starvation passaria mesmo com o scan de página única.
 */
function createPaginatedDb(rows: Array<{ id: string; data: Record<string, unknown> }>) {
  const all = rows.map(row => ({ id: row.id, ref: { id: row.id }, data: () => row.data }));
  const reads: number[] = [];

  function buildQuery(pageLimit: number, afterId: string | null) {
    return {
      where: () => buildQuery(pageLimit, afterId),
      limit: (value: number) => buildQuery(value, afterId),
      startAfter: (doc: { id: string }) => buildQuery(pageLimit, doc.id),
      get: async () => {
        const start = afterId ? all.findIndex(doc => doc.id === afterId) + 1 : 0;
        const docs = all.slice(start, start + pageLimit);
        reads.push(docs.length);
        return { docs, empty: docs.length === 0, size: docs.length };
      },
    };
  }

  const db = {
    collection: (name: string) =>
      name === 'emailOutbox'
        ? buildQuery(all.length, null)
        : { doc: (id: string) => ({ id: `${name}/${id}` }) },
    batch: () => ({ set: () => undefined, commit: async () => undefined }),
  };
  return { db, reads };
}

describe('starvation da fila (regressão da 4ª auditoria)', () => {
  const now = new Date('2026-07-24T12:00:00.000Z');
  const futuro = new Date('2026-07-24T13:00:00.000Z');

  // 120 em backoff seguidos de 30 prontos. Como a query não tinha `orderBy`, o
  // Firestore devolvia por documentId — SEMPRE os mesmos 100 primeiros. Com todos
  // eles em backoff, os prontos atrás nunca eram processados.
  const fila = [
    ...Array.from({ length: 120 }, (_, i) => ({
      id: `a-backoff-${String(i).padStart(3, '0')}`,
      data: {
        ticketId: `OS-B${i}`,
        commandKey: `cmd_backoff_${i}`,
        status: 'failed',
        attempts: 1,
        nextAttemptAt: futuro,
      },
    })),
    ...Array.from({ length: 30 }, (_, i) => ({
      id: `z-pronto-${String(i).padStart(3, '0')}`,
      data: { ticketId: `OS-P${i}`, commandKey: `cmd_pronto_${i}`, status: 'pending' },
    })),
  ];

  it('encontra os itens prontos que estão ATRÁS de 120 em backoff', async () => {
    const { db } = createPaginatedDb(fila);
    const result = await selectEligibleEmailOutbox(db, { now, batchSize: 8 });
    expect(result.eligible).toHaveLength(8);
    expect(result.eligible.every(item => item.outboxKey.startsWith('cmd_pronto_'))).toBe(true);
  });

  it('varre mais de uma página para chegar lá', async () => {
    const { db, reads } = createPaginatedDb(fila);
    const result = await selectEligibleEmailOutbox(db, { now, batchSize: 8 });
    expect(reads.length).toBeGreaterThan(1);
    expect(result.scanned).toBeGreaterThan(100);
  });

  it('não abre página além da que completou o lote', async () => {
    // `scanned` conta a página INTEIRA lida (é o custo real de leitura), então
    // completar o lote no meio da 2ª página ainda soma os 100 documentos dela. O
    // que se garante aqui é que não houve uma 3ª ida ao banco.
    const filaLonga = [...fila, ...Array.from({ length: 200 }, (_, i) => ({
      id: `zz-extra-${String(i).padStart(3, '0')}`,
      data: { ticketId: `OS-X${i}`, commandKey: `cmd_extra_${i}`, status: 'pending' },
    }))];
    const { db, reads } = createPaginatedDb(filaLonga);
    const result = await selectEligibleEmailOutbox(db, { now, batchSize: 8 });
    expect(reads.length).toBe(2);
    expect(result.scanned).toBe(200);
    expect(result.eligible).toHaveLength(8);
  });

  it('fila inteira em backoff: devolve vazio sem varrer além do teto', async () => {
    const soBackoff = fila.slice(0, 120);
    const { db } = createPaginatedDb(soBackoff);
    const result = await selectEligibleEmailOutbox(db, { now, batchSize: 8 });
    expect(result.eligible).toHaveLength(0);
    expect(result.scanned).toBeLessThanOrEqual(1000);
  });

  it('fila vazia não quebra', async () => {
    const { db } = createPaginatedDb([]);
    const result = await selectEligibleEmailOutbox(db, { now, batchSize: 8 });
    expect(result.eligible).toHaveLength(0);
    expect(result.scanned).toBe(0);
  });
});
