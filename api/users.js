import { getAdminDb } from './_lib/firebaseAdmin.js';
import { readActorFromHeaders, readJsonBody, sendJson } from './_lib/http.js';
import { readDirectory, seedDirectoryDefaults } from './_lib/directory.js';
import { writeAuditLog } from './_lib/auditLogs.js';

function normalizeUser(input) {
  const regionIds = Array.isArray(input?.regionIds)
    ? input.regionIds.map(value => String(value || '').trim()).filter(Boolean)
    : [];
  const siteIds = Array.isArray(input?.siteIds)
    ? input.siteIds.map(value => String(value || '').trim()).filter(Boolean)
    : [];

  return {
    name: String(input?.name || '').trim(),
    role: String(input?.role || '').trim(),
    email: String(input?.email || '').trim().toLowerCase(),
    status: String(input?.status || 'Ativo').trim() || 'Ativo',
    regionIds,
    siteIds,
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
      const actor = readActorFromHeaders(req);
      const body = await readJsonBody(req);
      const user = normalizeUser(body?.user);
      if (!user.name || !user.email || !user.role) {
        return sendJson(res, 400, { ok: false, error: 'name, role e email sao obrigatorios.' });
      }
      const id =
        body?.user?.id ||
        user.email
          .split('@')[0]
          .replace(/[^a-z0-9]+/gi, '-')
          .replace(/(^-|-$)/g, '')
          .toLowerCase();
      const docRef = db.collection('users').doc(id);
      const beforeSnap = await docRef.get();
      const before = beforeSnap.exists ? beforeSnap.data() : null;

      await docRef.set(
        {
          id,
          ...user,
          updatedAt: new Date(),
          createdAt: new Date(),
        },
        { merge: true }
      );
      await writeAuditLog({
        actor,
        action: 'users.create',
        entity: 'user',
        entityId: id,
        before,
        after: { id, ...user },
      });

      return sendJson(res, 200, { ok: true, id });
    }

    if (req.method === 'PATCH') {
      const actor = readActorFromHeaders(req);
      const body = await readJsonBody(req);
      const id = String(body?.id || '').trim();
      const user = normalizeUser(body?.updates);
      if (!id) {
        return sendJson(res, 400, { ok: false, error: 'id e obrigatorio.' });
      }
      if (!user.name || !user.email || !user.role) {
        return sendJson(res, 400, { ok: false, error: 'name, role e email sao obrigatorios.' });
      }
      const docRef = db.collection('users').doc(id);
      const beforeSnap = await docRef.get();
      const before = beforeSnap.exists ? beforeSnap.data() : null;
      await docRef.set({ ...user, id, updatedAt: new Date() }, { merge: true });
      await writeAuditLog({
        actor,
        action: 'users.update',
        entity: 'user',
        entityId: id,
        before,
        after: { ...user, id },
      });
      return sendJson(res, 200, { ok: true, id });
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    return sendJson(res, 405, { ok: false, error: 'Metodo nao permitido.' });
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha no endpoint de usuarios.' });
  }
}
