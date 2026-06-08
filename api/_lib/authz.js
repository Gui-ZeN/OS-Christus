import { getAuth } from 'firebase-admin/auth';
import { getAdminDb } from './firebaseAdmin.js';
import { HttpError } from './http.js';

function readBearerToken(req) {
  const header = String(req.headers.authorization || '').trim();
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim() || null;
}

async function resolveAuthenticatedUser(req) {
  const token = readBearerToken(req);
  if (!token) {
    throw new HttpError(401, 'Token de autenticação ausente.');
  }

  const db = getAdminDb();
  const decoded = await getAuth().verifyIdToken(token);

  let userDoc = null;
  let userDocId = null;
  if (decoded.uid) {
    const byUid = await db.collection('users').where('authUid', '==', decoded.uid).limit(1).get();
    if (!byUid.empty) {
      userDoc = byUid.docs[0].data();
      userDocId = byUid.docs[0].id;
    }
  }

  if (!userDoc && decoded.email) {
    const byEmail = await db.collection('users').where('email', '==', String(decoded.email).toLowerCase()).limit(1).get();
    if (!byEmail.empty) {
      userDoc = byEmail.docs[0].data();
      userDocId = byEmail.docs[0].id;
    }
  }

  if (!userDoc) {
    throw new HttpError(403, 'Usuário autenticado sem cadastro no diretório.');
  }

  if (userDoc.status !== 'Ativo' || userDoc.active === false) {
    throw new HttpError(403, 'Usuário inativo.');
  }

  return {
    id: userDocId,
    uid: decoded.uid,
    email: decoded.email || null,
    name: userDoc.name || decoded.name || null,
    role: userDoc.role,
    regionIds: Array.isArray(userDoc.regionIds) ? userDoc.regionIds : [],
    siteIds: Array.isArray(userDoc.siteIds) ? userDoc.siteIds : [],
  };
}

export async function requireAuthenticatedUser(req) {
  return resolveAuthenticatedUser(req);
}

export async function requireUserWithRoles(req, allowedRoles) {
  const user = await resolveAuthenticatedUser(req);
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    return user;
  }

  if (!allowedRoles.includes(user.role)) {
    throw new HttpError(403, 'Permissão insuficiente.');
  }

  return user;
}

export async function requireAdminUser(req) {
  return requireUserWithRoles(req, ['Admin']);
}

export async function requireOperationalManager(req) {
  return requireUserWithRoles(req, ['Admin', 'Gestor']);
}

/** Rótulo do ator para audit logs, a partir do usuário autenticado. */
export function resolveActor(user, fallback = 'painel') {
  return user?.name || user?.email || fallback;
}

/** True se o papel do usuário está na lista informada. */
export function hasRole(user, roles) {
  return Array.isArray(roles) && roles.includes(user?.role);
}
