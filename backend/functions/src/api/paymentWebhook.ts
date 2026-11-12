import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import { FUNCTIONS_REGION } from '@pizza-sosi/contracts';
import { db, COL } from '../firebase.js';
import { getPaymentProvider } from '../payments/provider.js';

/**
 * Called by the payment provider (server to server). Never trusted on its own:
 * 1. signature verified, 2. real state fetched from the provider API, 3. amount compared to the order.
 */
export const paymentWebhook = onRequest({ region: FUNCTIONS_REGION, maxInstances: 5, cors: false }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }
  const provider = getPaymentProvider();
  if (!provider.isConfigured()) {
    res.status(501).end();
    return;
  }
  const verified = await provider.verifyWebhook(req.rawBody, req.headers);
  if (!verified) {
    logger.warn('payment webhook rejected: bad signature');
    res.status(401).end();
    return;
  }
  const tx = await provider.getTransaction(verified.providerRef);
  const ref = db.collection(COL.orders).doc(tx.orderId);
  await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) return;
    const order = snap.data()!;
    if (order.payment?.status === 'approved') return; // already processed (idempotent)
    if (order.payment?.providerRef !== verified.providerRef) {
      logger.error('payment webhook: providerRef mismatch', { orderId: tx.orderId });
      return;
    }
    if (tx.status === 'approved' && tx.amountAgorot === order.totalAgorot && order.status === 'pending_payment') {
      t.update(ref, {
        status: 'paid',
        'payment.status': 'approved',
        updatedAt: FieldValue.serverTimestamp(),
        statusHistory: FieldValue.arrayUnion({ status: 'paid', at: new Date().toISOString(), by: 'payment' }),
      });
    } else if (tx.status === 'approved') {
      logger.error('payment amount/status mismatch', { orderId: tx.orderId });
      t.update(ref, { 'payment.status': 'mismatch', needsReview: true });
    } else if (tx.status === 'declined') {
      t.update(ref, { 'payment.status': 'declined', updatedAt: FieldValue.serverTimestamp() });
    }
  });
  res.status(200).send('ok');
});
