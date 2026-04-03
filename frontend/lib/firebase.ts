/**
 * Firebase Client SDK
 *
 * Shares auth with Blanket main app (same Firebase project).
 * Configured via NEXT_PUBLIC_ environment variables.
 *
 * Supports:
 * - Magic link (passwordless email sign-in)
 * - Email/password (fallback)
 */

import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  signInWithEmailAndPassword,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  Auth,
  User,
} from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '',
};

const isConfigured = !!firebaseConfig.apiKey;

let app: FirebaseApp | undefined;
let auth: Auth | undefined;

function getFirebaseApp(): FirebaseApp | undefined {
  if (!isConfigured) return undefined;
  if (!app) {
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return app;
}

function getFirebaseAuth(): Auth | undefined {
  if (!isConfigured) return undefined;
  if (!auth) {
    const firebaseApp = getFirebaseApp();
    if (!firebaseApp) return undefined;
    auth = getAuth(firebaseApp);
  }
  return auth;
}

/** Email/password sign-in (fallback) */
export async function signIn(email: string, password: string) {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase not configured');
  return signInWithEmailAndPassword(firebaseAuth, email, password);
}

/** Send a magic link to the user's email */
export async function sendMagicLink(email: string): Promise<void> {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase not configured');

  const actionCodeSettings = {
    url: typeof window !== 'undefined' ? window.location.origin + '/login' : '',
    handleCodeInApp: true,
  };

  await sendSignInLinkToEmail(firebaseAuth, email, actionCodeSettings);
}

/** Check if the current URL is a magic link callback */
export function isMagicLinkCallback(): boolean {
  if (typeof window === 'undefined') return false;
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) return false;
  return isSignInWithEmailLink(firebaseAuth, window.location.href);
}

/** Complete magic link sign-in */
export async function completeMagicLinkSignIn(email: string) {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) throw new Error('Firebase not configured');
  return signInWithEmailLink(firebaseAuth, email, window.location.href);
}

export async function signOut() {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) return;
  return firebaseSignOut(firebaseAuth);
}

export function onAuthChange(callback: (user: User | null) => void) {
  if (typeof window === 'undefined') {
    callback(null);
    return () => {};
  }
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) {
    callback(null);
    return () => {};
  }
  return onAuthStateChanged(firebaseAuth, callback);
}

export async function getIdToken(): Promise<string | null> {
  const firebaseAuth = getFirebaseAuth();
  if (!firebaseAuth) return null;
  const currentUser = firebaseAuth.currentUser;
  if (!currentUser) return null;
  return currentUser.getIdToken();
}

export { isConfigured };
export type { User };
