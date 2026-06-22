import { initializeApp, getApp, getApps } from 'firebase/app';
import { browserLocalPersistence, connectAuthEmulator, getAuth, setPersistence } from 'firebase/auth';

function readConfig() {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
  const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
  const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
  const appId = import.meta.env.VITE_FIREBASE_APP_ID;

  if (!apiKey || !authDomain || !projectId || !appId) {
    return null;
  }

  return {
    apiKey,
    authDomain,
    projectId,
    storageBucket,
    messagingSenderId,
    appId,
  };
}

export function isFirebaseAuthConfigured() {
  return readConfig() !== null;
}

export function getFirebaseClientApp() {
  const config = readConfig();
  if (!config) return null;
  return getApps().length > 0 ? getApp() : initializeApp(config);
}

export async function getFirebaseClientAuth() {
  const app = getFirebaseClientApp();
  if (!app) return null;
  const auth = getAuth(app);
  // Dev local: conecta no Auth emulador quando VITE_USE_FIREBASE_EMULATOR=true.
  if (import.meta.env.VITE_USE_FIREBASE_EMULATOR === 'true' && !(auth as { emulatorConfig?: unknown }).emulatorConfig) {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  }
  await setPersistence(auth, browserLocalPersistence).catch(() => undefined);
  return auth;
}
