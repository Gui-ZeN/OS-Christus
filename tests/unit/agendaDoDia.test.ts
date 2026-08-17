import { describe, expect, it } from 'vitest';
import { diaEmFortaleza, ehCoordenadorDaSede, montarAgendaDoDia } from '../../api/_lib/agendaDoDia.js';

const pablo = { email: 'pablo.sul@px.com.br', name: 'Pablo Ferreira', status: 'Ativo', siteIds: ['SUL3'] };

function visita(extra: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    state: 'agendado',
    siteId: 'SUL3',
    sede: 'SUL3',
    vendorName: 'Vidraçaria Norte',
    startAt: new Date('2026-08-17T11:00:00Z'), // 08h00 em Fortaleza
    ticketIds: ['OS-0151'],
    ...extra,
  };
}

const agora = new Date('2026-08-17T10:00:00Z'); // 07h00 em Fortaleza

describe('o dia é o de Fortaleza, não o do servidor', () => {
  it('23h em Fortaleza ainda é o mesmo dia, mesmo já sendo o dia seguinte em UTC', () => {
    // 18/08 02h UTC = 17/08 23h em Fortaleza. Sem isto, a agenda da noite pularia
    // para o dia seguinte e a sede receberia a lista errada.
    expect(diaEmFortaleza(new Date('2026-08-18T02:00:00Z'))).toBe('2026-08-17');
  });
});

describe('só recebe quem tem a sede no escopo', () => {
  it('coordenador da sede recebe', () => {
    expect(ehCoordenadorDaSede(pablo, 'SUL3')).toBe(true);
  });

  it('quem tem escopo por região não recebe a agenda de cada sede', () => {
    // Essa pessoa enxerga várias sedes e já tem o resumo da operação; mandar uma
    // agenda por sede devolveria o excesso que o desenho existe para evitar.
    const gestora = { email: 'larissa@px.com.br', status: 'Ativo', regionIds: ['Fortaleza'], siteIds: [] };
    expect(ehCoordenadorDaSede(gestora, 'SUL3')).toBe(false);
  });

  it('inativo e sem e-mail não recebem', () => {
    expect(ehCoordenadorDaSede({ ...pablo, status: 'Inativo' }, 'SUL3')).toBe(false);
    expect(ehCoordenadorDaSede({ ...pablo, email: '' }, 'SUL3')).toBe(false);
  });

  it('coordenador de outra sede não recebe', () => {
    expect(ehCoordenadorDaSede(pablo, 'ALD')).toBe(false);
  });
});

describe('sede sem nada marcado hoje não recebe nada', () => {
  it('sem compromisso, nenhuma sede entra', () => {
    expect(montarAgendaDoDia({ commitments: [], users: [pablo], now: agora }).sedes).toEqual([]);
  });

  it('compromisso de outro dia não entra', () => {
    const amanha = visita({ startAt: new Date('2026-08-18T11:00:00Z') });
    expect(montarAgendaDoDia({ commitments: [amanha], users: [pablo], now: agora }).sedes).toEqual([]);
  });

  it('visita já respondida não entra — a pergunta já foi feita', () => {
    for (const state of ['compareceu', 'faltou', 'cancelado', 'remarcado']) {
      const r = montarAgendaDoDia({ commitments: [visita({ state })], users: [pablo], now: agora });
      expect(r.sedes, state).toEqual([]);
    }
  });

  it('"sem-confirmacao" ainda entra: a sede não respondeu', () => {
    const r = montarAgendaDoDia({ commitments: [visita({ state: 'sem-confirmacao' })], users: [pablo], now: agora });
    expect(r.sedes).toHaveLength(1);
  });
});

describe('a agenda que a sede recebe', () => {
  it('traz hora, fornecedor e as OS, em ordem de horário', () => {
    const tarde = visita({ id: 'c2', startAt: new Date('2026-08-17T17:00:00Z'), vendorName: 'Hidro Sul' });
    const r = montarAgendaDoDia({ commitments: [tarde, visita()], users: [pablo], now: agora });

    expect(r.sedes).toHaveLength(1);
    expect(r.sedes[0].visitas.map((v: { hora: string }) => v.hora)).toEqual(['08:00', '14:00']);
    expect(r.sedes[0].visitas[0].fornecedor).toBe('Vidraçaria Norte');
    expect(r.sedes[0].destinatarios).toHaveLength(1);
  });

  it('uma visita que atende três OS é UM item, não três', () => {
    // É este corte que segura o volume de e-mail — e evita três alertas
    // possivelmente contraditórios sobre o mesmo fornecedor no mesmo dia.
    const r = montarAgendaDoDia({
      commitments: [visita({ ticketIds: ['OS-1', 'OS-2', 'OS-3'] })],
      users: [pablo],
      now: agora,
    });
    expect(r.sedes[0].visitas).toHaveLength(1);
    expect(r.sedes[0].visitas[0].ordens).toEqual(['OS-1', 'OS-2', 'OS-3']);
  });

  it('cada sede recebe só a agenda dela', () => {
    const outra = visita({ id: 'c9', siteId: 'ALD', sede: 'ALD' });
    const ana = { email: 'ana@px.com.br', status: 'Ativo', siteIds: ['ALD'] };
    const r = montarAgendaDoDia({ commitments: [visita(), outra], users: [pablo, ana], now: agora });

    const sul = r.sedes.find((s: { siteId: string }) => s.siteId === 'SUL3');
    const ald = r.sedes.find((s: { siteId: string }) => s.siteId === 'ALD');
    expect(sul.destinatarios.map((d: { email: string }) => d.email)).toEqual(['pablo.sul@px.com.br']);
    expect(ald.destinatarios.map((d: { email: string }) => d.email)).toEqual(['ana@px.com.br']);
  });
});

describe('sede com visita e sem coordenador não some em silêncio', () => {
  it('vira falha de cadastro visível, não e-mail perdido', () => {
    const r = montarAgendaDoDia({ commitments: [visita()], users: [], now: agora });
    expect(r.sedes).toEqual([]);
    expect(r.semDestinatario).toEqual([{ siteId: 'SUL3', sede: 'SUL3', visitas: 1 }]);
  });
});
