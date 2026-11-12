import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInAnonymously, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { FUNCTIONS_REGION } from '@pizza-sosi/contracts';

const env = import.meta.env;
const useEmulators = env.VITE_PUBLIC_USE_EMULATORS === 'true';

/**
 * Public Firebase web config. Not a secret: access is controlled by security rules,
 * App Check and the server. In production Hosting serves it at /__/firebase/init.json.
 */
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

export interface Services {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
  functions: Functions;
  bucket: string;
}

let servicesPromise: Promise<Services> | null = null;

export function services(): Promise<Services> {
  servicesPromise ??= (async () => {
    const config = await loadConfig();
    const app = initializeApp(config);
    if (!useEmulators && env.VITE_PUBLIC_RECAPTCHA_ENTERPRISE_KEY) {
      initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(env.VITE_PUBLIC_RECAPTCHA_ENTERPRISE_KEY),
        isTokenAutoRefreshEnabled: true,
      });
    }
    const auth = getAuth(app);
    auth.languageCode = 'he';
    const db = getFirestore(app);
    const functions = getFunctions(app, FUNCTIONS_REGION);
    if (useEmulators) {
      connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
      connectFirestoreEmulator(db, 'localhost', 8080);
      connectFunctionsEmulator(functions, 'localhost', 5001);
    }
    return { app, auth, db, functions, bucket: config.storageBucket ?? '' };
  })();
  return servicesPromise;
}

/** Guests get an anonymous identity so their orders are tied to them. */
export async function ensureSignedIn(): Promise<string> {
  const { auth } = await services();
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser.uid;
  const cred = await signInAnonymously(auth);
  return cred.user.uid;
}

export function imageUrl(bucket: string, path: string | null): string | null {
  if (!path || !bucket) return null;
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(path)}?alt=media`;
}
