import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';
import { db, COL } from '../firebase.js';

/**
 * Fixed-window counter in Firestore. The key is hashed so phone numbers are not stored in clear.
 * Throws resource-exhausted when the limit is reached.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const id = createHash('sha256').update(key).digest('hex').slice(0, 40);
  const ref = db.collection(COL.rateLimits).doc(id);
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as { windowStart: Timestamp; count: number } | undefined;
    const start = data?.windowStart.toMillis() ?? 0;
    if (!data || now - start > windowSeconds * 1000) {
      tx.set(ref, {
        windowStart: Timestamp.fromMillis(now),
        count: 1,
        // TTL policy on this field cleans old docs automatically.
        expireAt: Timestamp.fromMillis(now + windowSeconds * 1000 * 2),
      });
      return;
    }
    if (data.count >= limit) throw new HttpsError('resource-exhausted', 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות');
    tx.update(ref, { count: FieldValue.increment(1) });
  });
}
