import { FieldValue } from 'firebase-admin/firestore';
import { db, COL } from '../firebase.js';

/** Append-only log of staff actions. No customer personal data. */
export async function audit(actorUid: string, action: string, target: string, details: Record<string, unknown> = {}) {
  await db.collection(COL.auditLog).add({ actorUid, action, target, details, at: FieldValue.serverTimestamp() });
}
