import { HttpsError } from 'firebase-functions/v2/https';
import { GetOrderStatusRequest, OrderView } from '@pizza-sosi/contracts';
import { db, COL } from '../firebase.js';
import { secureCall } from '../security/callable.js';
import { requireAuth } from '../security/auth.js';
import { validate } from '../security/errors.js';
import { rateLimit } from '../security/rateLimit.js';
import { loyaltyView } from '../domain/promos.js';
import type { LoyaltyCardView } from '@pizza-sosi/contracts';

/**
 * Order tracking from any device (the link in WhatsApp opens in WhatsApp's own browser, not the one that ordered).
 * The order id is a random 20-character Firestore id, so the link itself is the key.
 * Returns only the public view: no phone, email or address. Cancelling still requires the ordering device.
 */
export const getOrderStatus = secureCall<OrderView & { mine: boolean; loyalty: LoyaltyCardView | null }>(async (req) => {
  const uid = requireAuth(req);
  const { orderId } = validate(GetOrderStatusRequest, req.data);
  await rateLimit(`track:uid:${uid}`, 120, 10 * 60);
  const snap = await db.collection(COL.orders).doc(orderId).get();
  const parsed = snap.exists ? OrderView.safeParse({ id: snap.id, ...snap.data() }) : null;
  if (!parsed?.success) throw new HttpsError('not-found', 'ההזמנה לא נמצאה');
  const firstName = parsed.data.customerName.trim().split(/\s+/)[0] ?? '';
  // The customer's loyalty card (counts only), shown under the order.
  const phone = String(snap.data()!.contact?.phone ?? '');
  const loyalty = phone ? await loyaltyView(phone).catch(() => null) : null;
  return { ...parsed.data, customerName: firstName, mine: snap.data()!.uid === uid, loyalty };
});
