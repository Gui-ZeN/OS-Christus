import { getAuth } from 'firebase-admin/auth';
import { getAdminDb } from './firebaseAdmin.js';

function readBearerToken(req) {
  const header = String(req.headers.authorization || '').trim();
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim() || null;
}

async function resolveAuthenticatedUser(req) {
  const token = readBearerToken(req);
  if (!token) {
    throw new Error('Token de autenticação ausente.');
  }

  const db = getAdminDb();
  const decoded = await getAuth().verifyIdToken(token);

  let userDoc = null;
  if (decoded.uid) {
    const byUid = await db.collection('users').where('authUid', '==', decoded.uid).limit(1).get();
    if (!byUid.empty) userDoc = byUid.docs[0].data();
  }

  if (!userDoc && decoded.email) {
    const byEmail = await db.collection('users').where('email', '==', String(decoded.email).toLowerCase()).limit(1).get();
    if (!byEmail.empty) userDoc = byEmail.docs[0].data();
  }

  if (!userDoc) {
    throw new Error('Usuário autenticado sem cadastro no diretório.');
  }

  if (userDoc.status !== 'Ativo' || userDoc.active === false) {
    throw new Error('Usuário inativo.');
  }

  return {
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
    throw new Error('Permissão insuficiente.');
  }

  return user;
}

export async function requireAdminUser(req) {
  return requireUserWithRoles(req, ['Admin']);
}
