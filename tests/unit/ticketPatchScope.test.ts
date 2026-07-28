import { describe, expect, it } from 'vitest';
import {
  ALLOWED_TICKET_PATCH_FIELDS,
  DIRECTOR_PATCH_FIELDS,
  TERRITORY_PATCH_FIELDS,
  filterTicketPatchFields,
  patchFieldsForRole,
} from '../../api/_lib/ticketPatchScope.js';

// Campos operacionais sensíveis: é exatamente o que o Diretor gravava antes da
// partição (achado P1 da 4ª auditoria). Cada um é testado individualmente para
// que remover a proteção de UM campo já quebre o teste.
const OPERACIONAIS = [
  'status',
  'priority',
  'sector',
  'location',
  'time',
  'waterIssue',
  'assignedTeam',
  'assignedEmail',
  'macroServiceId',
  'serviceCatalogId',
  'directorIds',
  'directorEmails',
  'requesterCcEmails',
  'attachments',
  'preliminaryActions',
  'closureChecklist',
  'executionProgress',
  'guarantee',
];

const TERRITORIAIS = [...TERRITORY_PATCH_FIELDS];

/** Aplica o filtro tratando todos os campos como realmente enviados pelo cliente. */
function filtrar(role: string, updates: Record<string, unknown>) {
  return filterTicketPatchFields(role, updates, new Set(Object.keys(updates)));
}

describe('matriz de campos por papel', () => {
  it('Admin grava tudo, inclusive território', () => {
    const permitidos = patchFieldsForRole('Admin');
    for (const field of [...OPERACIONAIS, ...TERRITORIAIS]) {
      expect(permitidos.has(field)).toBe(true);
    }
  });

  it('Gestor grava os operacionais, mas NENHUM territorial', () => {
    const permitidos = patchFieldsForRole('Gestor');
    for (const field of OPERACIONAIS) expect(permitidos.has(field)).toBe(true);
    for (const field of TERRITORIAIS) expect(permitidos.has(field)).toBe(false);
  });

  it('Diretor grava apenas viewingBy e history', () => {
    expect([...patchFieldsForRole('Diretor')].sort()).toEqual(['history', 'viewingBy']);
    expect([...DIRECTOR_PATCH_FIELDS].sort()).toEqual(['history', 'viewingBy']);
  });

  it('Usuario e papéis desconhecidos não gravam nada', () => {
    expect(patchFieldsForRole('Usuario').size).toBe(0);
    expect(patchFieldsForRole('').size).toBe(0);
    expect(patchFieldsForRole(undefined).size).toBe(0);
  });
});

describe('Diretor — negativo campo a campo (regressão do P1)', () => {
  // O bug: o Diretor entrava no PATCH e a única barreira por papel era a
  // territorial. Ele reescrevia prioridade, equipe, anexos e o checklist de
  // encerramento de qualquer OS do território dele.
  it.each(OPERACIONAIS)('descarta "%s" enviado por Diretor', field => {
    const resultado = filtrar('Diretor', { [field]: 'valor forjado' });
    expect(resultado).not.toHaveProperty(field);
    expect(Object.keys(resultado)).toHaveLength(0);
  });

  it.each(TERRITORIAIS)('descarta o territorial "%s" enviado por Diretor', field => {
    expect(filtrar('Diretor', { [field]: 'outra-sede' })).not.toHaveProperty(field);
  });

  it('preserva o que o Diretor legitimamente usa (estado de revisão e comentário)', () => {
    const entrada = { viewingBy: { name: 'Ana', at: new Date() }, history: [{ id: 'h1' }] };
    expect(filtrar('Diretor', entrada)).toEqual(entrada);
  });

  it('num payload misto, passa só o permitido', () => {
    const resultado = filtrar('Diretor', {
      viewingBy: { name: 'Ana' },
      status: 'Encerrada',
      priority: 'Alta',
      closureChecklist: { infrastructureApprovalPrimary: true },
      sede: 'ALD',
    });
    expect(Object.keys(resultado)).toEqual(['viewingBy']);
  });
});

describe('Gestor — negativo territorial', () => {
  it.each(TERRITORIAIS)('descarta "%s" (só Admin reclassifica território)', field => {
    expect(filtrar('Gestor', { [field]: 'regiao-alheia' })).not.toHaveProperty(field);
  });

  it('mantém os operacionais no mesmo payload', () => {
    const resultado = filtrar('Gestor', { priority: 'Alta', siteId: 'outra' });
    expect(resultado).toEqual({ priority: 'Alta' });
  });
});

describe('Usuario — negativo total', () => {
  it.each([...OPERACIONAIS, ...TERRITORIAIS])('descarta "%s"', field => {
    expect(filtrar('Usuario', { [field]: 'x' })).toEqual({});
  });

  it('nem viewingBy passa', () => {
    expect(filtrar('Usuario', { viewingBy: { name: 'x' } })).toEqual({});
  });
});

describe('campos fora da allow-list', () => {
  it.each(['id', 'trackingToken', 'createdAt', 'updatedAt', 'requesterEmail', 'requester', 'subject'])(
    'nem o Admin grava "%s" pelo PATCH',
    field => {
      expect(ALLOWED_TICKET_PATCH_FIELDS.has(field)).toBe(false);
      expect(filtrar('Admin', { [field]: 'forjado' })).toEqual({});
    }
  );
});

describe('guarda do campo não enviado', () => {
  // O normalizer injeta `time: agora` quando ausente. Sem checar o que o cliente
  // REALMENTE mandou, todo PATCH parcial (inclusive o heartbeat) sobrescreveria a
  // data de abertura da OS.
  it('ignora campo que o normalizer injetou mas o cliente não enviou', () => {
    const normalizado = { priority: 'Alta', time: new Date('2020-01-01') };
    const enviados = new Set(['priority']);
    const resultado = filterTicketPatchFields('Admin', normalizado, enviados);
    expect(resultado).toEqual({ priority: 'Alta' });
    expect(resultado).not.toHaveProperty('time');
  });

  it('grava o time quando ele foi de fato enviado', () => {
    const quando = new Date('2026-03-10');
    expect(
      filterTicketPatchFields('Admin', { time: quando }, new Set(['time']))
    ).toEqual({ time: quando });
  });
});
