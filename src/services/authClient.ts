import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
import { getFirebaseClientAuth, isFirebaseAuthConfigured } from '../lib/firebaseClient';

export function isAuthEnabled() {
  return isFirebaseAuthConfigured();
}

export async function loginWithEmailPassword(email: string, password: string) {
  const auth = await getFirebaseClientAuth();
  if (!auth) {
    return { email };
  }
  return signInWithEmailAndPassword(auth, email, password);
}

export async function loginWithGoogle() {
  const auth = await getFirebaseClientAuth();
  if (!auth) {
    throw new Error('Login com Google indisponível sem Firebase configurado.');
  }
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, provider);
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
