import { requireAdminUser, requireAuthenticatedUser } from './_lib/authz.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { readJsonBody, sendJson } from './_lib/http.js';
import { readDirectory, seedDirectoryDefaults } from './_lib/directory.js';

export default async function handler(req, res) {
  try {
    const db = getAdminDb();

    if (req.method === 'GET') {
      const currentUser = await requireAuthenticatedUser(req);
      const directory = await readDirectory(db);
      const users =
        currentUser.role === 'Admin' || currentUser.role === 'Diretor'
          ? directory.users
          : directory.users.filter(user => String(user.email || '').toLowerCase() === String(currentUser.email || '').toLowerCase());
      return sendJson(res, 200, {
        ok: true,
        users,
        teams: directory.teams,
        vendors: directory.vendors,
      });
    }

    if (req.method === 'POST') {
      await requireAdminUser(req);
      const body = await readJsonBody(req);
      if (body?.seedDefaults !== true) {
        return sendJson(res, 400, { ok: false, error: 'Envie { seedDefaults: true } para popular o diretório.' });
      }
      await seedDirectoryDefaults(db);
      const directory = await readDirectory(db);
      return sendJson(res, 200, { ok: true, seeded: true, ...directory });
    }

    res.setHeader('Allow', 'GET, POST');
    return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha no diretorio.' });
  }
}
