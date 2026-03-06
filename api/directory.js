import { requireAdminUser, requireAuthenticatedUser } from './_lib/authz.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { readJsonBody, sendJson } from './_lib/http.js';
import { readDirectory, seedDirectoryDefaults } from './_lib/directory.js';

export default async function handler(req, res) {
  try {
    const db = getAdminDb();

    if (req.method === 'GET') {
      await requireAuthenticatedUser(req);
      let directory = await readDirectory(db);
      if (directory.users.length === 0 || directory.teams.length === 0 || directory.vendors.length === 0) {
        await seedDirectoryDefaults(db);
        directory = await readDirectory(db);
      }
      return sendJson(res, 200, { ok: true, ...directory });
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
