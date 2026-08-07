import { describe, expect, it } from 'vitest';
import { canUserAccessTicket } from '../../api/_lib/ticketAccess.js';

/**
 * ESCOPO TERRITORIAL DOS COMPROMISSOS.
 *
 * A rota de compromissos (`/api/tickets?route=commitments`) nasceu SEM o filtro de
 * território que todo o resto do sistema aplica. Um Gestor de uma região lia — e
 * confirmava — visitas de outra: nome do fornecedor, data, sede, de OS que ele nem
 * consegue abrir.
 *
 * Este teste cobre a decisão que o filtro usa. A regra "basta UMA OS acessível" é
 * deliberada: uma visita atende várias OS, e esconder a visita inteira porque uma
 * delas é de outro território esconderia trabalho que é dele.
 */
const REGIOES = [
  { id: 'r-sul', name: 'Sul' },
  { id: 'r-norte', name: 'Norte' },
];
const SEDES = [
  { id: 's-pql1', code: 'PQL1', regionId: 'r-sul' },
  { id: 's-dt2', code: 'DT2', regionId: 'r-norte' },
];

const os = (id: string, siteId: string, regionId: string) => ({
  id,
  siteId,
  regionId,
  status: 'Em andamento',
});

const gestorDoSul = { role: 'Gestor', email: 'sul@px.com.br', regionIds: ['r-sul'], siteIds: [] };
const admin = { role: 'Admin', email: 'admin@px.com.br' };

/** A mesma decisão que `podeVerCompromisso` toma, isolada do Firestore. */
function podeVer(user: Record<string, unknown>, tickets: Array<ReturnType<typeof os>>) {
  return tickets.some(ticket => canUserAccessTicket(user, ticket, REGIOES, SEDES));
}

describe('quem enxerga um compromisso', () => {
  const noSul = os('OS-0230', 's-pql1', 'r-sul');
  const noNorte = os('OS-0264', 's-dt2', 'r-norte');

  it('Admin enxerga tudo', () => {
    expect(podeVer(admin, [noNorte])).toBe(true);
  });

  it('🔒 Gestor do Sul NÃO enxerga visita de OS do Norte', () => {
    expect(podeVer(gestorDoSul, [noNorte])).toBe(false);
  });

  it('Gestor do Sul enxerga visita da sua região', () => {
    expect(podeVer(gestorDoSul, [noSul])).toBe(true);
  });

  it('visita que atende as DUAS regiões aparece para os dois', () => {
    // Basta uma OS acessível: esconder a visita inteira esconderia trabalho dele.
    expect(podeVer(gestorDoSul, [noNorte, noSul])).toBe(true);
  });

  it('sem OS nenhuma, ninguém que não seja Admin enxerga', () => {
    expect(podeVer(gestorDoSul, [])).toBe(false);
  });

  it('usuário sem escopo vinculado falha fechado', () => {
    const semEscopo = { role: 'Gestor', email: 'x@px.com.br', regionIds: [], siteIds: [] };
    expect(podeVer(semEscopo, [noSul])).toBe(false);
  });
});
