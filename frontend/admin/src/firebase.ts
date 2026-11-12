import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { FUNCTIONS_REGION } from '@pizza-sosi/contracts';

const env = import.meta.env;
const useEmulators = env.VITE_PUBLIC_USE_EMULATORS === 'true';

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
  return (await res.json()) as FirebaseOptions;
}

const config = await loadConfig();
export const app = initializeApp(config);
if (!useEmulators && env.VITE_PUBLIC_RECAPTCHA_ENTERPRISE_KEY) {
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(env.VITE_PUBLIC_RECAPTCHA_ENTERPRISE_KEY), isTokenAutoRefreshEnabled: true });
}
export const auth = getAuth(app);
auth.languageCode = 'he';
export const db = getFirestore(app);
export const functions = getFunctions(app, FUNCTIONS_REGION);
if (useEmulators) {
  connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, 'localhost', 8080);
  connectFunctionsEmulator(functions, 'localhost', 5001);
}

/** Admin actions go only through server functions, which re-check role and MFA. */
export async function callAdmin<Req, Res = unknown>(name: string, data: Req): Promise<Res> {
  const res = await httpsCallable<Req, Res>(functions, name)(data);
  return res.data;
}
