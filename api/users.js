import { getAdminDb } from './_lib/firebaseAdmin.js';
import { getAuth } from 'firebase-admin/auth';
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

function mapRoleToClaim(role) {
  const normalized = String(role || '').trim();
  if (normalized === 'Admin') return 'admin';
  if (normalized === 'Diretor' || normalized === 'Supervisor') return 'gestor';
  return 'user';
}

async function upsertAuthUser(user, password) {
  const auth = getAuth();
  let record = null;

  try {
    record = await auth.getUserByEmail(user.email);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }

  const payload = {
    email: user.email,
    displayName: user.name,
    disabled: user.status !== 'Ativo',
  };

  if (record) {
    const updatePayload = password ? { ...payload, password } : payload;
    await auth.updateUser(record.uid, updatePayload);
  } else {
    if (!password || String(password).length < 6) {
      throw new Error('Senha inicial obrigatoria com ao menos 6 caracteres.');
    }
    record = await auth.createUser({ ...payload, password });
  }

  const finalRecord = record || (await auth.getUserByEmail(user.email));
  await auth.setCustomUserClaims(finalRecord.uid, {
    role: mapRoleToClaim(user.role),
    appRole: user.role,
  });

  return finalRecord.uid;
}

async function upsertAuthUserByExistingRecord(user, password, existingAuthUid) {
  const auth = getAuth();

  if (existingAuthUid) {
    try {
      const existingRecord = await auth.getUser(existingAuthUid);
      const payload = {
        email: user.email,
        displayName: user.name,
        disabled: user.status !== 'Ativo',
      };
      const updatePayload = password ? { ...payload, password } : payload;
      await auth.updateUser(existingRecord.uid, updatePayload);
      await auth.setCustomUserClaims(existingRecord.uid, {
        role: mapRoleToClaim(user.role),
        appRole: user.role,
      });
      return existingRecord.uid;
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error;
    }
  }

  return upsertAuthUser(user, password);
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
      const password = String(body?.password || '').trim();
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

      const authUid = await upsertAuthUserByExistingRecord(user, password, before?.authUid || null);
      await docRef.set(
        {
          id,
          ...user,
          authUid,
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
        after: { id, ...user, authUid },
      });

      return sendJson(res, 200, { ok: true, id, authUid });
    }

    if (req.method === 'PATCH') {
      const actor = readActorFromHeaders(req);
      const body = await readJsonBody(req);
      const id = String(body?.id || '').trim();
      const user = normalizeUser(body?.updates);
      const password = String(body?.password || '').trim();
      if (!id) {
        return sendJson(res, 400, { ok: false, error: 'id e obrigatorio.' });
      }
      if (!user.name || !user.email || !user.role) {
        return sendJson(res, 400, { ok: false, error: 'name, role e email sao obrigatorios.' });
      }
      const docRef = db.collection('users').doc(id);
      const beforeSnap = await docRef.get();
      const before = beforeSnap.exists ? beforeSnap.data() : null;
      const authUid = await upsertAuthUser(user, password);
      await docRef.set({ ...user, id, authUid, updatedAt: new Date() }, { merge: true });
      await writeAuditLog({
        actor,
        action: 'users.update',
        entity: 'user',
        entityId: id,
        before,
        after: { ...user, id, authUid },
      });
      return sendJson(res, 200, { ok: true, id, authUid });
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    return sendJson(res, 405, { ok: false, error: 'Metodo nao permitido.' });
  } catch (error) {
    return sendJson(res, 400, { ok: false, error: error.message || 'Falha no endpoint de usuarios.' });
  }
}
