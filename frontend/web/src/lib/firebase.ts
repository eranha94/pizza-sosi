import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Functions } from 'firebase/functions';
import type { Firestore } from 'firebase/firestore';
import { FUNCTIONS_REGION } from '@pizza-sosi/contracts/constants';

/*
 * Speed: the home page needs only the tiny core + Firestore Lite (one read of the menu).
 * Auth, App Check, Functions and realtime Firestore are loaded on demand (checkout / order page).
 */

const env = import.meta.env;
const useEmulators = env.VITE_PUBLIC_USE_EMULATORS === 'true';

/** Public Firebase web config (not a secret). In production Hosting serves it at /__/firebase/init.json. */
async function loadConfig(): Promise<FirebaseOptions> {
  if (env.VITE_PUBLIC_FIREBASE_PROJECT_ID) {
    return {
      apiKey: env.VITE_PUBLIC_FIREBASE_API_KEY,
      authDomain: env.VITE_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_PUBLIC_FIREBASE_STORAGE_BUCKET,
      appId: env.VITE_PUBLIC_FIREBASE_APP_ID,
    };
  }
  const res = await fetch('/__/firebase/init.json');
  if (!res.ok) throw new Error('Firebase config not available');
  return (await res.json()) as FirebaseOptions;
}

let appPromise: Promise<{ app: FirebaseApp; bucket: string }> | null = null;
export function firebaseApp() {
  appPromise ??= loadConfig().then((config) => ({ app: initializeApp(config), bucket: config.storageBucket ?? '' }));
  return appPromise;
}

/** Firestore Lite: one-shot reads, ~5x smaller than the full SDK. Used for the public menu. */
let liteDb: Promise<import('firebase/firestore/lite').Firestore> | null = null;
export function menuDb() {
  liteDb ??= (async () => {
    const [{ app }, lite] = await Promise.all([firebaseApp(), import('firebase/firestore/lite')]);
    const db = lite.getFirestore(app);
    if (useEmulators) lite.connectFirestoreEmulator(db, 'localhost', 8080);
    return db;
  })();
  return liteDb;
}

let appCheckReady: Promise<void> | null = null;
function ensureAppCheck(app: FirebaseApp) {
  appCheckReady ??= (async () => {
    if (useEmulators || !env.VITE_PUBLIC_RECAPTCHA_ENTERPRISE_KEY) return;
    const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import('firebase/app-check');
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(env.VITE_PUBLIC_RECAPTCHA_ENTERPRISE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  })();
  return appCheckReady;
}

export interface Services {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
}

let servicesPromise: Promise<Services> | null = null;
/** Full services for ordering. Loaded lazily the first time they are needed. */
export function services(): Promise<Services> {
  servicesPromise ??= (async () => {
    const { app } = await firebaseApp();
    await ensureAppCheck(app);
    const [authMod, fsMod, fnMod] = await Promise.all([
      import('firebase/auth'),
      import('firebase/firestore'),
      import('firebase/functions'),
    ]);
    const auth = authMod.getAuth(app);
    auth.languageCode = 'he';
    const db = fsMod.getFirestore(app);
    const functions = fnMod.getFunctions(app, FUNCTIONS_REGION);
    if (useEmulators) {
      authMod.connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      fsMod.connectFirestoreEmulator(db, 'localhost', 8080);
      fnMod.connectFunctionsEmulator(functions, 'localhost', 5001);
    }
    return { app, auth, db, functions };
  })();
  return servicesPromise;
}

/** Warm up the ordering code while the customer is still choosing (idle time, no blocking). */
export function prefetchOrdering() {
  const run = () => void services().catch(() => {});
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 4000 });
  else setTimeout(run, 2000);
}

/** Guests get an anonymous identity so their orders are tied to them. */
export async function ensureSignedIn(): Promise<string> {
  const { auth } = await services();
  const { signInAnonymously } = await import('firebase/auth');
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}

const storageUrl = (bucket: string, path: string) =>
  `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;

export function imageUrl(bucket: string, path: string | null): string | null {
  if (!path || !bucket) return null;
  return storageUrl(bucket, path);
}

/** Small WebP versions made by scripts/make-thumbnails.mjs: menu_thumbs/<name>_<width>.webp */
export const THUMB_WIDTHS = [320, 640] as const;
export function thumbSrcSet(bucket: string, path: string | null): string | null {
  if (!path || !bucket) return null;
  const base = path.replace(/^menu_images\//, '').replace(/\.[^.]+$/, '');
  return THUMB_WIDTHS.map((w) => `${storageUrl(bucket, `menu_thumbs/${base}_${w}.webp`)} ${w}w`).join(', ');
}
