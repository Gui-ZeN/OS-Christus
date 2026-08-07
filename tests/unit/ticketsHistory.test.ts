import { describe, it, expect } from 'vitest';
import {
  sanitizeClientHistoryEntry,
  actorHistoryLabel,
  HISTORY_ENTRY_TYPES,
} from '../../api/tickets.js';
// A allow-list mudou de casa: agora vive na matriz por papel (ticketPatchScope).
import { ALLOWED_TICKET_PATCH_FIELDS } from '../../api/_lib/ticketPatchScope.js';
import {
  mergeTicketHistory,
  normalizeTicketForStorage,
  serializeTicketForApi,
  ticketHistoryEntryDocumentId,
  writeTicketHistoryEntries,
} from '../../api/_lib/tickets.js';

describe('actorHistoryLabel', () => {
  it('formato "Nome (Papel)" — casa o displayActorLabel do front', () => {
    expect(actorHistoryLabel({ name: 'Guilherme', role: 'Gestor' })).toBe('Guilherme (Gestor)');
    expect(actorHistoryLabel({ name: 'Ana', role: 'Diretor' })).toBe('Ana (Diretor)');
  });
  it('sem papel usa só o nome; sem nome usa o fallback', () => {
    expect(actorHistoryLabel({ name: 'Ana' })).toBe('Ana');
    expect(actorHistoryLabel({}, 'painel')).toBe('painel');
  });
});

describe('sanitizeClientHistoryEntry (anti-forja)', () => {
  const SENDER = 'Guilherme (Gestor)';

  it('força o sender ao ator (bloqueia forjar Diretoria/Sistema)', () => {
    const out = sanitizeClientHistoryEntry({ id: 'x', type: 'system', sender: 'Diretoria', text: 'FALSO' }, SENDER);
    expect(out.sender).toBe(SENDER);
  });

  it('coage type inválido para internal; mantém type válido', () => {
    expect(sanitizeClientHistoryEntry({ id: 'x', type: 'HACK' }, SENDER).type).toBe('internal');
    expect(sanitizeClientHistoryEntry({ id: 'x', type: 'system' }, SENDER).type).toBe('system');
    expect(sanitizeClientHistoryEntry({ id: 'x', type: 'tech' }, SENDER).type).toBe('tech');
  });

  it('NÃO toca em visibility ausente (preserva marcos públicos por marcador)', () => {
    const out = sanitizeClientHistoryEntry({ id: 'x', type: 'system', text: 'Triagem concluída' }, SENDER);
    expect(out.visibility).toBeUndefined();
  });

  it('preserva visibility public/internal; coage inválida presente', () => {
    expect(sanitizeClientHistoryEntry({ id: 'x', visibility: 'public' }, SENDER).visibility).toBe('public');
    expect(sanitizeClientHistoryEntry({ id: 'x', visibility: 'internal' }, SENDER).visibility).toBe('internal');
    expect(sanitizeClientHistoryEntry({ id: 'x', visibility: 'weird' }, SENDER).visibility).toBe('internal');
  });

  it('preserva o texto (conteúdo livre — atribuído ao ator real)', () => {
    expect(sanitizeClientHistoryEntry({ id: 'x', text: 'olá' }, SENDER).text).toBe('olá');
  });

  it('não persiste URL permanente quando o anexo possui path protegido', () => {
    const out = sanitizeClientHistoryEntry({
      id: 'x',
      attachments: [{
        path: 'attachments/tickets/messages/OS-0100/public/foto.jpg',
        url: 'https://storage.example/token-permanente',
      }],
    }, SENDER);
    expect(out.attachments[0].url).toBe('');
  });
});

describe('ALLOWED_TICKET_PATCH_FIELDS', () => {
  it('permite campos que o painel edita', () => {
    for (const f of ['status', 'priority', 'history', 'requesterCcEmails', 'attachments', 'closureChecklist']) {
      expect(ALLOWED_TICKET_PATCH_FIELDS.has(f)).toBe(true);
    }
  });
  it('BLOQUEIA identidade e campos sensíveis', () => {
    for (const f of ['id', 'trackingToken', 'createdAt', 'updatedAt', 'requesterEmail', 'requester', 'subject']) {
      expect(ALLOWED_TICKET_PATCH_FIELDS.has(f)).toBe(false);
    }
  });
  it('HISTORY_ENTRY_TYPES espelha o tipo do front', () => {
    expect([...HISTORY_ENTRY_TYPES].sort()).toEqual(['customer', 'field_change', 'internal', 'system', 'tech']);
  });
});

describe('mergeTicketHistory (dedup por id)', () => {
  it('anexa só entradas novas; ignora ids já existentes', () => {
    const fresh = [{ id: 'a', text: 'original' }];
    const { merged, appendedCount } = mergeTicketHistory(fresh, [
      { id: 'a', text: 'TENTATIVA DE REESCREVER' },
      { id: 'b', text: 'nova' },
    ]);
    expect(appendedCount).toBe(1);
    expect(merged.find(e => e.id === 'a').text).toBe('original'); // não reescreve
    expect(merged.find(e => e.id === 'b').text).toBe('nova');
  });
  it('sem entradas novas retorna o histórico intacto', () => {
    const fresh = [{ id: 'a' }];
    const { merged, appendedCount } = mergeTicketHistory(fresh, [{ id: 'a' }]);
    expect(appendedCount).toBe(0);
    expect(merged).toBe(fresh);
  });
});

describe('ticketHistoryEntryDocumentId', () => {
  it('gera ID estável, seguro para subcoleção e distinto por OS', () => {
    const first = ticketHistoryEntryDocumentId('OS-0001', 'message/a');
    expect(first).toBe(ticketHistoryEntryDocumentId('OS-0001', 'message/a'));
    expect(first).not.toContain('/');
    expect(first).not.toBe(ticketHistoryEntryDocumentId('OS-0002', 'message/a'));
  });
});

describe('writeTicketHistoryEntries (não perde entrada legada sem id)', () => {
  function mockRefAndTx() {
    const writes: Array<{ docId: string; data: Record<string, unknown> }> = [];
    const ticketRef = {
      id: 'OS-0001',
      collection: () => ({ doc: (docId: string) => ({ docId }) }),
    };
    const tx = { set: (ref: { docId: string }, data: Record<string, unknown>) => writes.push({ docId: ref.docId, data }) };
    return { writes, ticketRef, tx };
  }

  it('gera id determinístico para entrada SEM id (antes era descartada)', () => {
    const { writes, ticketRef, tx } = mockRefAndTx();
    const count = writeTicketHistoryEntries(tx as never, ticketRef as never, [
      { time: '2026-05-20T10:00:00.000Z', type: 'system', sender: 'Sistema', text: 'entrada legada sem id' },
    ]);
    expect(count).toBe(1);
    expect(writes).toHaveLength(1);
    expect(String(writes[0].data.id)).toMatch(/^legacy-/);
  });

  it('id determinístico é idempotente (mesmo conteúdo → mesmo doc, sem duplicar)', () => {
    const entry = { time: '2026-05-20T10:00:00.000Z', type: 'system', sender: 'Sistema', text: 'x' };
    const a = mockRefAndTx();
    writeTicketHistoryEntries(a.tx as never, a.ticketRef as never, [entry]);
    const b = mockRefAndTx();
    writeTicketHistoryEntries(b.tx as never, b.ticketRef as never, [entry, { ...entry }]);
    expect(b.writes).toHaveLength(1); // dedup por id gerado
    expect(b.writes[0].docId).toBe(a.writes[0].docId);
    expect(b.writes[0].data.id).toBe(a.writes[0].data.id);
  });
});

describe('normalizeTicketForStorage', () => {
  it('converte time de string ISO para Date, inclusive nas entradas de histórico', () => {
    const out = normalizeTicketForStorage({
      time: '2026-05-20T10:00:00.000Z',
      history: [{ id: 'a', time: '2026-05-20T11:00:00.000Z', text: 'oi' }],
    });
    expect(out.time).toBeInstanceOf(Date);
    expect(out.history[0].time).toBeInstanceOf(Date);
    expect(out.history[0].time.toISOString()).toBe('2026-05-20T11:00:00.000Z');
  });

  it('remove URL permanente de anexos com path ao normalizar', () => {
    const out = normalizeTicketForStorage({
      attachments: [{
        path: 'attachments/tickets/images/OS-0100/foto.jpg',
        url: 'https://storage.example/token-permanente',
      }],
    });
    expect(out.attachments[0].url).toBe('');
  });
});

describe('serializeTicketForApi', () => {
  it('não expõe URL legada quando existe path protegido', () => {
    const out = serializeTicketForApi({
      id: 'OS-0100',
      attachments: [{
        path: 'attachments/tickets/images/OS-0100/foto.jpg',
        url: 'https://storage.example/token-permanente',
      }],
      history: [],
    });
    expect(out.attachments[0].url).toBe('');
  });
});

describe('nextAction — a ida e a volta da agenda operacional', () => {
  it('grava `dueAt` como Date, nunca como string ISO', () => {
    // O resto do banco usa Timestamp; string aqui faria qualquer ordenacao futura
    // comparar texto com data.
    const out = normalizeTicketForStorage({
      id: 'OS-1',
      time: '2026-08-05T12:00:00.000Z',
      nextAction: { what: 'Cobrar a proposta', dueAt: '2026-08-06T12:00:00.000Z' },
    });
    expect(out.nextAction.dueAt).toBeInstanceOf(Date);
    expect(out.nextAction.what).toBe('Cobrar a proposta');
  });

  it('devolve `dueAt` serializado — o front compara datas, nao Timestamps', () => {
    const out = serializeTicketForApi({
      id: 'OS-1',
      time: new Date('2026-08-05T12:00:00.000Z'),
      nextAction: { what: 'Cobrar', dueAt: new Date('2026-08-06T12:00:00.000Z') },
    });
    expect(out.nextAction.dueAt).toBe('2026-08-06T12:00:00.000Z');
  });

  it('OS sem proxima acao volta como null, e nao quebra', () => {
    expect(serializeTicketForApi({ id: 'OS-1', time: new Date() }).nextAction).toBeNull();
  });
});

describe('suspensão — a ida e a volta', () => {
  it('grava `reviewAt` como Date', () => {
    const out = normalizeTicketForStorage({
      id: 'OS-1',
      time: new Date('2026-08-05T12:00:00.000Z'),
      attention: { state: 'suspensa', reason: 'aguardando-material', reviewAt: '2026-08-12T12:00:00.000Z' },
    });
    expect(out.attention.reviewAt).toBeInstanceOf(Date);
  });

  it('devolve `reviewAt` serializado — senão a suspensão nunca venceria no front', () => {
    const out = serializeTicketForApi({
      id: 'OS-1',
      time: new Date('2026-08-05T12:00:00.000Z'),
      attention: { state: 'suspensa', reason: 'sem-verba', reviewAt: new Date('2026-08-12T12:00:00.000Z') },
    });
    expect(out.attention.reviewAt).toBe('2026-08-12T12:00:00.000Z');
  });

  it('OS sem suspensão volta como null', () => {
    expect(serializeTicketForApi({ id: 'OS-1', time: new Date() }).attention).toBeNull();
  });
});

describe('atenção operacional — a projeção do servidor na ida e na volta', () => {
  it('grava `dueAt` como Date', () => {
    const out = normalizeTicketForStorage({
      id: 'OS-1',
      time: new Date('2026-08-05T12:00:00.000Z'),
      operationalAttention: {
        kind: 'revisar-mensagem',
        dueAt: '2026-08-06T12:00:00.000Z',
        sourceId: 'msg-9',
      },
    });
    expect(out.operationalAttention.dueAt).toBeInstanceOf(Date);
  });

  it('devolve serializado, senão o front compararia texto com data', () => {
    const out = serializeTicketForApi({
      id: 'OS-1',
      time: new Date('2026-08-05T12:00:00.000Z'),
      operationalAttention: {
        kind: 'revisar-mensagem',
        dueAt: new Date('2026-08-06T12:00:00.000Z'),
        sourceId: 'msg-9',
      },
    });
    expect(out.operationalAttention.dueAt).toBe('2026-08-06T12:00:00.000Z');
  });

  it('OS sem atenção volta como null, junto dos carimbos de conversa', () => {
    const out = serializeTicketForApi({ id: 'OS-1', time: new Date() });
    expect(out.operationalAttention).toBeNull();
    expect(out.attentionOverride).toBeNull();
    expect(out.lastInboundAt).toBeNull();
  });
});
