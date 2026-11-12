import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) initializeApp();

export const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

/** Collection names – one place, so rules and code stay in sync. */
export const COL = {
  menuItems: 'menuItems',
  orders: 'orders',
  settings: 'settings',
  counters: 'counters',
  idempotency: 'idempotency',
  rateLimits: 'rateLimits',
  auditLog: 'auditLog',
} as const;
