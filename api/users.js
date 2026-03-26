import { requireAdminUser } from './_lib/authz.js';
import { requireAuthenticatedUser } from './_lib/authz.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { getAuth } from 'firebase-admin/auth';
import { readActorFromHeaders, readJsonBody, sendError, sendJson } from './_lib/http.js';
import { readDirectory } from './_lib/directory.js';
import { writeAuditLog } from './_lib/auditLogs.js';
import { generatePasswordResetUrl, sendPasswordAccessEmail } from './_lib/passwordAccess.js';

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
  if (normalized === 'Diretor') return 'gestor';
  return 'user';
}

function generateTemporaryPassword() {
  const base = Math.random().toString(36).slice(2, 10);
  const suffix = Date.now().toString(36).slice(-4);
  return `Tmp#${base}${suffix}`;
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
    const initialPassword = password && String(password).length >= 6 ? password : generateTemporaryPassword();
    record = await auth.createUser({ ...payload, password: initialPassword });
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

async function deleteAuthUser(existingAuthUid, email) {
  const auth = getAuth();

  if (existingAuthUid) {
    try {
      await auth.deleteUser(existingAuthUid);
      return;
    } catch (error) {
      if (error?.code !== 'auth/user-not-found') throw error;
    }
  }

  if (!email) return;

  try {
    const record = await auth.getUserByEmail(email);
    await auth.deleteUser(record.uid);
  } catch (error) {
    if (error?.code !== 'auth/user-not-found') throw error;
  }
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
      return sendJson(res, 200, { ok: true, users });
    }

    if (req.method === 'POST') {
      const admin = await requireAdminUser(req);
      const actor = readActorFromHeaders(req) || admin.email || admin.name || 'painel';
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
      let passwordEmailSent = false;
      let passwordEmailError = null;
      if (user.role === 'Usuario' && user.status === 'Ativo' && user.active !== false) {
        try {
          const resetUrl = await generatePasswordResetUrl(user.email, req);
          await sendPasswordAccessEmail({
            email: user.email,
            name: user.name,
            mode: 'invite',
            resetUrl,
          });
          passwordEmailSent = true;
        } catch (error) {
          passwordEmailError = error instanceof Error ? error.message : 'Falha ao enviar e-mail de acesso.';
        }
      }

      return sendJson(res, 200, { ok: true, id, authUid, passwordEmailSent, passwordEmailError });
    }

    if (req.method === 'PATCH') {
      const admin = await requireAdminUser(req);
      const actor = readActorFromHeaders(req) || admin.email || admin.name || 'painel';
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
      const authUid = await upsertAuthUserByExistingRecord(user, password, before?.authUid || null);
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

    if (req.method === 'DELETE') {
      const admin = await requireAdminUser(req);
      const actor = readActorFromHeaders(req) || admin.email || admin.name || 'painel';
      const body = await readJsonBody(req);
      const id = String(body?.id || '').trim();
      if (!id) {
        return sendJson(res, 400, { ok: false, error: 'id é obrigatório.' });
      }

      const docRef = db.collection('users').doc(id);
      const beforeSnap = await docRef.get();
      if (!beforeSnap.exists) {
        return sendJson(res, 404, { ok: false, error: 'Usuário não encontrado.' });
      }

      const before = { id: beforeSnap.id, ...beforeSnap.data() };
      await deleteAuthUser(before.authUid || null, before.email || null);
      await docRef.delete();

      await writeAuditLog({
        actor,
        action: 'users.delete',
        entity: 'user',
        entityId: id,
        before,
        after: null,
      });

      return sendJson(res, 200, {
        ok: true,
        id,
        deleted: {
          firestoreUser: true,
          firebaseAuth: Boolean(before.authUid || before.email),
        },
      });
    }

    res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
    return sendJson(res, 405, { ok: false, error: 'Método não permitido.' });
  } catch (error) {
    return sendError(res, error, 'Falha no endpoint de usuários.');
  }
}


