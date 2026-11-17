import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export const PROJECT = 'demo-pizza-sosi';
process.env.FIRESTORE_EMULATOR_HOST ??= 'localhost:8080';

export function db() {
  if (!getApps().length) initializeApp({ projectId: PROJECT });
  return getFirestore();
}
