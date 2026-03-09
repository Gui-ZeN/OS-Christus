import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { getFirebaseClientAuth, isFirebaseAuthConfigured } from '../lib/firebaseClient';

export function isAuthEnabled() {
  return isFirebaseAuthConfigured();
}

function mapFirebaseAuthError(error: unknown) {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code || '') : '';

  switch (code) {
    case 'auth/invalid-email':
      return 'O e-mail informado é inválido. Revise o endereço e tente novamente.';
    case 'auth/user-not-found':
      return 'Nenhuma conta foi encontrada com esse e-mail.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'E-mail ou senha incorretos. Tente novamente.';
    case 'auth/too-many-requests':
      return 'Muitas tentativas de acesso em sequência. Aguarde alguns minutos e tente novamente.';
    case 'auth/popup-closed-by-user':
      return 'O login com Google foi cancelado antes da conclusão.';
    case 'auth/popup-blocked':
      return 'O navegador bloqueou a janela de login com Google. Libere pop-ups e tente novamente.';
    case 'auth/cancelled-popup-request':
      return 'Já existe uma tentativa de login com Google em andamento.';
    case 'auth/network-request-failed':
      return 'Não foi possível conectar ao serviço de autenticação. Verifique sua conexão e tente novamente.';
    default:
      return null;
  }
}

export async function loginWithEmailPassword(email: string, password: string) {
  const auth = await getFirebaseClientAuth();
  if (!auth) {
    return { email };
  }
  try {
    return await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    throw new Error(mapFirebaseAuthError(error) || 'Não foi possível concluir o login agora. Tente novamente em instantes.');
  }
}

export async function loginWithGoogle() {
  const auth = await getFirebaseClientAuth();
  if (!auth) {
    throw new Error('Login com Google indisponível neste ambiente. A autenticação Firebase ainda não foi configurada no frontend.');
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    return await signInWithPopup(auth, provider);
  } catch (error) {
    throw new Error(mapFirebaseAuthError(error) || 'Não foi possível concluir o login com Google agora. Tente novamente em instantes.');
  }
}

export async function logoutFirebaseAuth() {
  const auth = await getFirebaseClientAuth();
  if (!auth) return;
  await signOut(auth);
}

export async function subscribeToAuthState(listener: (user: User | null) => void) {
  const auth = await getFirebaseClientAuth();
  if (!auth) {
    listener(null);
    return () => undefined;
  }
  return onAuthStateChanged(auth, listener);
}

export async function getCurrentIdToken() {
  const auth = await getFirebaseClientAuth();
  const user = auth?.currentUser || null;
  if (!user) return null;
  return user.getIdToken();
}
