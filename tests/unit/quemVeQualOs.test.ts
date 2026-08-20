import { describe, expect, it } from 'vitest';
import {
  canUserAccessTicket,
  resolveTicketRegionIds,
  resolveTicketSiteIds,
} from '../../api/_lib/ticketAccess.js';

/**
 * QUEM VÊ QUAL OS — o escopo territorial.
 *
 * O teste de mutação apontou este módulo: 20,4% de score, 76 mutantes vivos. O
 * arquivo tem 281 linhas e o único teste unitário existente importava UMA função
 * (`isDirectorAssignedToTicket`). `canUserAccessTicket` — 47 linhas que decidem se
 * uma pessoa enxerga uma OS — não tinha nenhum.
 *
 * É a regra que separa as ~16 sedes do Grupo Christus. Frouxa demais, a gestora de
 * uma sede lê a OS de outra; apertada demais, ela não vê a própria.
 *
 * Todo caminho de negativa aqui é FAIL-CLOSED: na dúvida sobre o escopo, não vê.
 */

const SEDES = [
  { id: 'sede-dl', code: 'DL', name: 'Dom Luís', regionId: 'reg-aldeota' },
  { id: 'sede-ald', code: 'ALD', name: 'Aldeota', regionId: 'reg-aldeota' },
  { id: 'sede-eq', code: 'EQ', name: 'Edson Queiroz', regionId: 'reg-universidade' },
];

const REGIOES = [
  { id: 'reg-aldeota', code: 'ALD', name: 'Aldeota' },
  { id: 'reg-universidade', code: 'UNI', name: 'Universidade' },
];

const pode = (user: unknown, ticket: unknown) =>
  canUserAccessTicket(user, ticket, REGIOES, SEDES);

describe('Admin', () => {
  it('vê tudo, sem território', () => {
    expect(pode({ role: 'Admin' }, { siteId: 'sede-eq' })).toBe(true);
  });

  it('vê até OS sem sede nenhuma', () => {
    // OS recém-chegada por e-mail, antes de alguém classificar a sede.
    expect(pode({ role: 'Admin' }, {})).toBe(true);
  });
});

describe('sem usuário não há acesso', () => {
  it('null e undefined são recusados', () => {
    // Fail-closed: se a resolução do usuário falhou, o padrão é não ver.
    expect(pode(null, { siteId: 'sede-dl' })).toBe(false);
    expect(pode(undefined, { siteId: 'sede-dl' })).toBe(false);
  });
});

describe('escopo por sede', () => {
  const gestora = { role: 'Gestor', siteIds: ['sede-dl'], regionIds: [] };

  it('vê a OS da sede dela', () => {
    expect(pode(gestora, { siteId: 'sede-dl' })).toBe(true);
  });

  it('NÃO vê a OS da sede vizinha, mesmo na mesma região', () => {
    // `sede-ald` está na mesma região que `sede-dl`. Sede vinculada é a regra mais
    // apertada: quem tem sede explícita não herda a região inteira.
    expect(pode(gestora, { siteId: 'sede-ald' })).toBe(false);
  });

  it('a sede da OS é reconhecida por sigla e por nome, não só por id', () => {
    // O assunto do e-mail traz "DL" ou "Dom Luís"; o id só existe no cadastro.
    expect(pode(gestora, { sede: 'DL' })).toBe(true);
    expect(pode(gestora, { sede: 'Dom Luís' })).toBe(true);
  });

  it('a sede do usuário também pode estar cadastrada por sigla', () => {
    expect(pode({ role: 'Gestor', siteIds: ['DL'] }, { siteId: 'sede-dl' })).toBe(true);
  });
});

describe('escopo por região', () => {
  const regional = { role: 'Gestor', siteIds: [], regionIds: ['reg-aldeota'] };

  it('vê as OS de qualquer sede da região', () => {
    expect(pode(regional, { siteId: 'sede-dl' })).toBe(true);
    expect(pode(regional, { siteId: 'sede-ald' })).toBe(true);
  });

  it('NÃO vê as OS de outra região', () => {
    expect(pode(regional, { siteId: 'sede-eq' })).toBe(false);
  });

  it('a região da OS é herdada da sede quando não vem escrita', () => {
    // A OS guarda a sede; a região sai do cadastro dela.
    expect(pode(regional, { sede: 'ALD' })).toBe(true);
  });
});

describe('fail-closed: escopo que não resolve não vira acesso', () => {
  it('sem sede e sem região vinculadas, não vê nada', () => {
    // Usuário recém-criado, antes de alguém dar o território.
    expect(pode({ role: 'Gestor', siteIds: [], regionIds: [] }, { siteId: 'sede-dl' })).toBe(false);
    expect(pode({ role: 'Usuario' }, { siteId: 'sede-dl' })).toBe(false);
  });

  it('sede vinculada que NÃO existe no cadastro não vira acesso a nada', () => {
    /**
     * A armadilha: `siteIds: ['sede-que-nao-existe']` resolve para lista vazia. Sem
     * a guarda do escopo explícito, a lista vazia cairia no ramo da região — e um
     * cadastro com sede errada viraria acesso amplo em vez de acesso nenhum.
     */
    const comSedeFantasma = {
      role: 'Gestor',
      siteIds: ['sede-que-nao-existe'],
      regionIds: ['reg-aldeota'],
    };
    expect(pode(comSedeFantasma, { siteId: 'sede-dl' })).toBe(false);
  });

  it('sede vinculada em branco não conta como escopo explícito', () => {
    // `['  ']` não é uma sede; quem tem só isso cai na região, não em lugar nenhum.
    const emBranco = { role: 'Gestor', siteIds: ['  '], regionIds: ['reg-aldeota'] };
    expect(pode(emBranco, { siteId: 'sede-dl' })).toBe(true);
  });
});

describe('Diretor', () => {
  const diretor = { role: 'Diretor', id: 'dir-1', email: 'dir@px.com.br', regionIds: ['reg-aldeota'] };

  it('designado na OS, vê — mesmo fora do território dele', () => {
    // A designação é mais forte que o território: foi pedido a ELE.
    expect(pode(diretor, { siteId: 'sede-eq', directorIds: ['dir-1'] })).toBe(true);
  });

  it('designado por e-mail também vale', () => {
    expect(pode(diretor, { siteId: 'sede-eq', directorEmails: ['dir@px.com.br'] })).toBe(true);
  });

  it('e o e-mail casa sem depender de caixa', () => {
    expect(pode(diretor, { siteId: 'sede-eq', directorEmails: ['DIR@PX.COM.BR'] })).toBe(true);
  });

  it('⚠️ OS COM outro diretor designado é FECHADA — mesmo no território dele', () => {
    /**
     * A regra menos óbvia do módulo, e a mais fácil de quebrar sem perceber: quando
     * a OS tem diretores designados, só eles entram. O `return false` não cai no
     * escopo territorial de propósito.
     *
     * Trocar esse `return false` por um `break` devolveria a OS ao diretor da
     * região — e assuntos de diretoria são endereçados a uma pessoa.
     */
    expect(pode(diretor, { siteId: 'sede-dl', directorIds: ['outro-diretor'] })).toBe(false);
  });

  it('OS SEM diretor designado cai no território, como qualquer um', () => {
    expect(pode(diretor, { siteId: 'sede-dl' })).toBe(true);
    expect(pode(diretor, { siteId: 'sede-eq' })).toBe(false);
  });

  it('lista de diretores só com valores vazios conta como SEM diretor', () => {
    // `['']` não designa ninguém; a OS não pode ficar invisível para todo mundo.
    expect(pode(diretor, { siteId: 'sede-dl', directorIds: [''], directorEmails: ['  '] })).toBe(true);
  });

  it('diretor sem território e sem designação não vê', () => {
    const semEscopo = { role: 'Diretor', id: 'dir-2', regionIds: [], siteIds: [] };
    expect(pode(semEscopo, { siteId: 'sede-dl' })).toBe(false);
  });
});

describe('a sede da OS', () => {
  it('sai por id, sigla ou nome', () => {
    expect(resolveTicketSiteIds({ siteId: 'sede-dl' }, SEDES)).toContain('sede-dl');
    expect(resolveTicketSiteIds({ sede: 'DL' }, SEDES)).toContain('sede-dl');
    expect(resolveTicketSiteIds({ sede: 'dom luís' }, SEDES)).toContain('sede-dl');
  });

  it('id desconhecido é preservado, não descartado', () => {
    // Sede que ainda não está no catálogo não pode sumir do escopo da OS.
    expect(resolveTicketSiteIds({ siteId: 'sede-nova' }, SEDES)).toContain('sede-nova');
  });

  it('OS sem sede devolve lista vazia', () => {
    expect(resolveTicketSiteIds({}, SEDES)).toEqual([]);
  });
});

describe('a região da OS', () => {
  it('vem escrita na OS', () => {
    expect(resolveTicketRegionIds({ regionId: 'reg-aldeota' }, REGIOES, SEDES)).toContain('reg-aldeota');
  });

  it('ou é herdada da sede', () => {
    expect(resolveTicketRegionIds({ siteId: 'sede-eq' }, REGIOES, SEDES)).toContain('reg-universidade');
  });

  it('sem repetir quando as duas apontam para a mesma', () => {
    const ids = resolveTicketRegionIds({ siteId: 'sede-dl', regionId: 'reg-aldeota' }, REGIOES, SEDES);
    expect(ids.filter(id => id === 'reg-aldeota')).toHaveLength(1);
  });
});
