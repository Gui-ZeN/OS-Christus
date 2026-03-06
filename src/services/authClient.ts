import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth';
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
