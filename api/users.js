import { getAdminDb } from './_lib/firebaseAdmin.js';
import { readJsonBody, sendJson } from './_lib/http.js';
import { readDirectory, seedDirectoryDefaults } from './_lib/directory.js';

function normalizeUser(input) {
  return {
    name: String(input?.name || '').trim(),
    role: String(input?.role || '').trim(),
    email: String(input?.email || '').trim().toLowerCase(),
    status: String(input?.status || 'Ativo').trim() || 'Ativo',
    active: input?.active !== false,
  };
}

export default async function handler(req, res) {
  try {
    const db = getAdminDb();

    if (req.method === 'GET') {
      let directory = await readDirectory(db);
      if (directory.users.length === 0) {
        await seedDirectoryDefaults(db);
        directory = await readDirectory(db);
      }
      return sendJson(res, 200, { ok: true, users: directory.users });
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const user = normalizeUser(body?.user);
      if (!user.name || !user.email) {
        return sendJson(res, 400, { ok: false, error: 'name e email sao obrigatorios.' });
      }
      const id =
        body?.user?.id ||
        user.email
          .split('@')[0]
          .replace(/[^a-z0-9]+/gi, '-')
          .replace(/(^-|-$)/g, '')
          .toLowerCase();

      await db.collection('users').doc(id).set(
        {
          id,
          ...user,
          updatedAt: new Date(),
          createdAt: new Date(),
        },
        { merge: true }
      );

      return sendJson(res, 200, { ok: true, id });
    }

    if (req.method === 'PATCH') {
      const body = await readJsonBody(req);
      const id = String(body?.id || '').trim();
      const user = normalizeUser(body?.updates);
      if (!id) {
        return sendJson(res, 400, { ok: false, error: 'id e obrigatorio.' });
      }
      await db.collection('users').doc(id).set({ ...user, id, updatedAt: new Date() }, { merge: true });
      return sendJson(res, 200, { ok: true, id });
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    return sendJson(res, 405, { ok: false, error: 'Metodo nao permitido.' });
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha no endpoint de usuarios.' });
  }
}
