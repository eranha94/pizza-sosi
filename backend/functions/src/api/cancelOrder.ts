import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { CancelOrderRequest, type OrderStatus } from '@pizza-sosi/contracts';
import { db, COL } from '../firebase.js';
import { secureCall } from '../security/callable.js';
import { requireAuth } from '../security/auth.js';
import { validate } from '../security/errors.js';
import { customerCanCancel } from '../domain/orderState.js';

export const cancelOrder = secureCall<{ status: OrderStatus }>(async (req) => {
  const uid = requireAuth(req);
  const { orderId } = validate(CancelOrderRequest, req.data);
  const ref = db.collection(COL.orders).doc(orderId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    // Same answer for "not found" and "not yours" so order ids cannot be probed.
    if (!snap.exists || snap.data()!.uid !== uid) throw new HttpsError('not-found', 'ההזמנה לא נמצאה');
    const status = snap.data()!.status as OrderStatus;
    if (!customerCanCancel(status)) throw new HttpsError('failed-precondition', 'ההזמנה כבר בהכנה ואי אפשר לבטל אותה באתר. התקשרו אלינו');
    const paidByCard = snap.data()!.payment?.status === 'approved';
    tx.update(ref, {
      status: 'cancelled',
      // Card refunds are done by staff from the admin page (or automatically once the provider is connected).
      refundRequired: paidByCard,
      updatedAt: FieldValue.serverTimestamp(),
      statusHistory: FieldValue.arrayUnion({ status: 'cancelled', at: new Date().toISOString(), by: 'customer' }),
    });
  });
  return { status: 'cancelled' };
});
