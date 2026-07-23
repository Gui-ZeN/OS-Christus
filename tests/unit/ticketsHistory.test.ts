import { describe, it, expect } from 'vitest';
import {
  sanitizeClientHistoryEntry,
  actorHistoryLabel,
  ALLOWED_TICKET_PATCH_FIELDS,
  HISTORY_ENTRY_TYPES,
} from '../../api/tickets.js';
import { mergeTicketHistory, normalizeTicketForStorage } from '../../api/_lib/tickets.js';

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
});
