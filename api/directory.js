import { requireAdminUser, requireAuthenticatedUser } from './_lib/authz.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { readJsonBody, sendError, sendJson } from './_lib/http.js';
import { readDirectory, seedDirectoryDefaults } from './_lib/directory.js';

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

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

    if (req.method === 'PATCH') {
      await requireAuthenticatedUser(req);
      const body = await readJsonBody(req);
      const vendor = body?.vendor || {};
      const vendorName = String(vendor.name || '').trim();
      if (!vendorName) {
        return sendJson(res, 400, { ok: false, error: 'Nome do terceiro é obrigatório.' });
      }

      const id = String(vendor.id || slugify(vendorName) || `terceiro-${Date.now()}`);
      const tags = Array.isArray(vendor.tags)
        ? vendor.tags
            .map(tag => String(tag || '').trim())
            .filter(Boolean)
        : [];
      const now = new Date();

      await db.collection('vendors').doc(id).set(
        {
          id,
          name: vendorName,
          email: vendor.email ? String(vendor.email).trim() : '',
          contact: vendor.contact ? String(vendor.contact).trim() : '',
          tags,
          active: vendor.active !== false,
          updatedAt: now,
          createdAt: now,
        },
        { merge: true }
      );

      return sendJson(res, 200, {
        ok: true,
        vendor: {
          id,
          name: vendorName,
          email: vendor.email ? String(vendor.email).trim() : '',
          contact: vendor.contact ? String(vendor.contact).trim() : '',
          tags,
          active: vendor.active !== false,
        },
      });
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (error) {
    return sendError(res, error, 'Falha no diretório.');
  }
}
