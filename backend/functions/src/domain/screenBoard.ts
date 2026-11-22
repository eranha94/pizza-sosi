import { logger } from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import type { ScreenBoard } from '@pizza-sosi/contracts';
import { db, COL } from '../firebase.js';

const IN_KITCHEN = ['accepted', 'preparing', 'almost_ready'];
/** Older orders are leftovers someone forgot to close; keep them off the screen. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

/** Pure part (tested): which pickup order numbers go where. */
export function boardFrom(orders: { number?: unknown; status?: unknown; fulfillment?: unknown; createdAtMs?: number }[], now: number): ScreenBoard {
  const fresh = orders.filter((o) => o.fulfillment === 'pickup' && typeof o.number === 'number' && (o.createdAtMs === undefined || now - o.createdAtMs < MAX_AGE_MS));
  const nums = (pred: (s: unknown) => boolean) => fresh.filter((o) => pred(o.status)).map((o) => o.number as number).sort((a, b) => a - b);
  return { preparing: nums((s) => IN_KITCHEN.includes(s as string)).slice(-12), ready: nums((s) => s === 'ready').slice(-8) };
}

/**
 * Rebuild the public screen/board doc after a status change. Best effort: the screen is a nicety,
 * so a failure here is logged and never blocks the kitchen.
 */
export async function refreshScreenBoard(): Promise<void> {
  try {
    const snap = await db.collection(COL.orders).where('status', 'in', [...IN_KITCHEN, 'ready']).limit(100).get();
    const board = boardFrom(
      snap.docs.map((d) => {
        const x = d.data();
        return { number: x.number, status: x.status, fulfillment: x.fulfillment, createdAtMs: x.createdAt?.toMillis?.() };
      }),
      Date.now(),
    );
    await db.collection(COL.screen).doc('board').set({ ...board, updatedAt: FieldValue.serverTimestamp() });
  } catch (e) {
    logger.warn('screen board refresh failed', { error: (e as Error).message });
  }
}
