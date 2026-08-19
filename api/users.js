import { requireAdminUser, requireAuthenticatedUser, requireOperationalManager, resolveActor , hasRole } from './_lib/authz.js';
import { getAdminDb } from './_lib/firebaseAdmin.js';
import { getAuth } from 'firebase-admin/auth';
import { readJsonBody, sendError, sendJson } from './_lib/http.js';
// A rota /api/directory vive AQUI (mesmo domínio: pessoas; o directoryApi do front
// já consumia as duas). O plano Hobby da Vercel limita 12 funções e cada api/*.js
// vira uma; o vercel.json reescreve /api/directory -> /api/users?route=directory.
import { readDirectory, seedDirectoryDefaults } from './_lib/directory.js';
import { slugify } from './_lib/text.js';
import { writeAuditLog } from './_lib/auditLogs.js';
import { generatePasswordResetUrl, sendPasswordAccessEmail } from './_lib/passwordAccess.js';
import { isValidEmail as isDeliverableEmail } from './_lib/email.js';

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
    // `=== true` e não `!== false`: quem não marcou não recebe. O padrão de um
    // aviso que chega de madrugada tem que ser o silêncio.
    avisoDeChuva: input?.avisoDeChuva === true,
  };
}

function describePasswordEmailError(error) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').trim();
  if (code === 'auth/invalid-email' || /invalid.*email/i.test(message)) {
    return 'E-mail inválido para envio de convite. Use um endereço completo, por exemplo nome@empresa.com.br.';
  }
  if (/\b4\d\d\b/.test(message) && /recipient|destinat|address/i.test(message)) {
    return 'O provedor recusou o destinatário. Verifique se o e-mail existe e possui domínio completo.';
  }
  return message || 'Falha ao enviar e-mail de acesso.';
}

const VALID_ROLES = ['Admin', 'Gestor', 'Diretor', 'Usuario'];

function mapRoleToClaim(role) {
  const normalized = String(role || '').trim();
  if (normalized === 'Admin') return 'admin';
  if (normalized === 'Gestor') return 'gestor';
  if (normalized === 'Diretor') return 'diretor';
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

async function handleDirectory(req, res) {
  try {
    const db = getAdminDb();

    if (req.method === 'GET') {
      const currentUser = await requireAuthenticatedUser(req);
      const directory = await readDirectory(db);
      const users =
        hasRole(currentUser, ['Admin', 'Gestor', 'Diretor'])
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
      await requireOperationalManager(req);
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

export default async function handler(req, res) {
  const route = String(req.query?.route || '').trim().toLowerCase();
  if (route === 'directory') return handleDirectory(req, res);

  try {
    const db = getAdminDb();

    if (req.method === 'GET') {
      const currentUser = await requireAuthenticatedUser(req);
      const directory = await readDirectory(db);
      const users =
        hasRole(currentUser, ['Admin', 'Gestor', 'Diretor'])
          ? directory.users
          : directory.users.filter(user => String(user.email || '').toLowerCase() === String(currentUser.email || '').toLowerCase());
      return sendJson(res, 200, { ok: true, users });
    }

    if (req.method === 'POST') {
      const admin = await requireAdminUser(req);
      const actor = resolveActor(admin);
      const body = await readJsonBody(req);
      const user = normalizeUser(body?.user);
      const password = String(body?.password || '').trim();
      if (!user.name || !user.email || !user.role) {
        return sendJson(res, 400, { ok: false, error: 'name, role e email sao obrigatorios.' });
      }
      if (!VALID_ROLES.includes(user.role)) {
        return sendJson(res, 400, { ok: false, error: `Perfil inválido. Use um de: ${VALID_ROLES.join(', ')}.` });
      }
      if (!isDeliverableEmail(user.email)) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Informe um e-mail completo, com domínio válido, por exemplo nome@empresa.com.br. E-mails internos como usuario@px não recebem convite de senha.',
        });
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
      if (user.status === 'Ativo' && user.active !== false) {
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
          passwordEmailError = describePasswordEmailError(error);
        }
      }

      return sendJson(res, 200, { ok: true, id, authUid, passwordEmailSent, passwordEmailError });
    }

    if (req.method === 'PATCH') {
      const admin = await requireAdminUser(req);
      const actor = resolveActor(admin);
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
      if (!VALID_ROLES.includes(user.role)) {
        return sendJson(res, 400, { ok: false, error: `Perfil inválido. Use um de: ${VALID_ROLES.join(', ')}.` });
      }
      if (!isDeliverableEmail(user.email)) {
        return sendJson(res, 400, {
          ok: false,
          error: 'Informe um e-mail completo, com domínio válido, por exemplo nome@empresa.com.br. E-mails internos como usuario@px não recebem convite de senha.',
        });
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
      const actor = resolveActor(admin);
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


