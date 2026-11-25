import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import { UpdatePaymentsRequest, RefundOrderRequest } from '@pizza-sosi/contracts';
import { db, COL } from '../firebase.js';
import { secureCall } from '../security/callable.js';
import { requireStaff } from '../security/auth.js';
import { validate } from '../security/errors.js';
import { audit } from '../security/audit.js';
import { getPaymentProvider } from '../payments/provider.js';

/** Card payments on/off/test. The test phone stays private (settings/payments, owner-only). */
export const adminUpdatePayments = secureCall<{ ok: true; configured: boolean }>(async (req) => {
  const { uid } = requireStaff(req, ['owner']);
  const { cardPayments, testPhone } = validate(UpdatePaymentsRequest, req.data);
  const configured = await getPaymentProvider().isConfigured();
  if (cardPayments !== 'off' && !configured) throw new HttpsError('failed-precondition', 'פרטי החיבור ל-Grow עוד לא הוגדרו (Secret Manager)');
  if (cardPayments === 'test' && !testPhone) throw new HttpsError('invalid-argument', 'במצב בדיקה צריך טלפון לבדיקה');
  await db.collection(COL.settings).doc('payments').set({ testPhone, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await db.collection(COL.settings).doc('store').set({ cardPayments, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await audit(uid, 'payments.mode', 'payments', { cardPayments });
  return { ok: true, configured };
});

/** Full refund of a card payment (e.g. after a cancel). Once per order. */
export const adminRefundOrder = secureCall<{ ok: true }>(async (req) => {
  const { uid } = requireStaff(req, ['owner']);
  const { orderId } = validate(RefundOrderRequest, req.data);
  const ref = db.collection(COL.orders).doc(orderId);
  // Claim first, so two clicks can't refund twice.
  const claim = await db.runTransaction(async (t) => {
    const o = (await t.get(ref)).data();
    if (!o) throw new HttpsError('not-found', 'ההזמנה לא נמצאה');
    const p = o.payment ?? {};
    if (p.status === 'refunded' || p.status === 'refunding') throw new HttpsError('failed-precondition', 'כבר זוכה');
    if (!['approved', 'review'].includes(p.status) || !p.transactionId) throw new HttpsError('failed-precondition', 'אין תשלום באשראי לזכות');
    t.update(ref, { 'payment.status': 'refunding' });
    return { transactionId: String(p.transactionId), transactionToken: String(p.transactionToken ?? ''), amount: Number(p.paidAgorot ?? o.totalAgorot), prev: String(p.status) };
  });
  try {
    await getPaymentProvider().refund(claim, claim.amount);
  } catch (e) {
    logger.error('refund failed', { orderId, error: (e as Error).message });
    await ref.update({ 'payment.status': claim.prev });
    throw new HttpsError('unavailable', 'הזיכוי נכשל ב-Grow. אפשר לנסות שוב או לזכות מממשק Grow');
  }
  await ref.update({ 'payment.status': 'refunded', 'payment.refundedAt': FieldValue.serverTimestamp(), refundRequired: false, needsReview: false });
  await audit(uid, 'order.refund', orderId, { amount: claim.amount });
  return { ok: true };
});
