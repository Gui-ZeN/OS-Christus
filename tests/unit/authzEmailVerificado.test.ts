import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O login pelo E-MAIL (cadastro antigo sem `authUid`) aceitava qualquer token com
 * aquele endereço. Auditoria de 14/10/2026: quem criasse uma conta no Firebase com o
 * e-mail de um funcionário herdaria o papel dele — só a configuração do projeto
 * segurava. Agora: e-mail verificado e cadastro sem outro dono.
 */

let tokenDecodificado: Record<string, unknown> = {};
let cadastros: Array<Record<string, unknown>> = [];

vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: async () => tokenDecodificado }),
}));

vi.mock('../../api/_lib/firebaseAdmin.js', () => ({
  getAdminDb: () => ({
    collection: () => ({
      where: (campo: string, _op: string, valor: unknown) => ({
        limit: () => ({
          get: async () => {
            const achados = cadastros.filter(c => c[campo] === valor);
            return { empty: achados.length === 0, docs: achados.map(c => ({ id: String(c.id), data: () => c })) };
          },
        }),
      }),
    }),
  }),
}));

const { requireAuthenticatedUser } = await import('../../api/_lib/authz.js');
const req = { headers: { authorization: 'Bearer qualquer' } };

beforeEach(() => {
  cadastros = [{ id: 'u1', email: 'gestora@christus.com.br', role: 'Gestor', status: 'Ativo' }];
});

describe('login pelo e-mail', () => {
  it('e-mail NÃO verificado não herda o cadastro — é o ataque da auditoria', async () => {
    tokenDecodificado = { uid: 'conta-nova', email: 'gestora@christus.com.br', email_verified: false };
    await expect(requireAuthenticatedUser(req)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('e-mail verificado, cadastro sem dono: entra (login Google de cadastro antigo)', async () => {
    tokenDecodificado = { uid: 'google-1', email: 'gestora@christus.com.br', email_verified: true };
    await expect(requireAuthenticatedUser(req)).resolves.toMatchObject({ id: 'u1', role: 'Gestor' });
  });

  it('cadastro que já pertence a OUTRA conta não é herdado, nem com e-mail verificado', async () => {
    cadastros[0].authUid = 'dona-original';
    tokenDecodificado = { uid: 'outra-conta', email: 'gestora@christus.com.br', email_verified: true };
    await expect(requireAuthenticatedUser(req)).rejects.toMatchObject({ statusCode: 403 });
  });

  it('pelo uid continua entrando sem olhar a verificação (conta de senha criada pelo painel)', async () => {
    cadastros[0].authUid = 'uid-do-painel';
    tokenDecodificado = { uid: 'uid-do-painel', email: 'gestora@christus.com.br', email_verified: false };
    await expect(requireAuthenticatedUser(req)).resolves.toMatchObject({ id: 'u1' });
  });
});
