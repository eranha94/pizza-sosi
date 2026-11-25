import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import { FUNCTIONS_REGION } from '@pizza-sosi/contracts';
import { db, COL } from '../firebase.js';
import { getPaymentProvider } from '../payments/provider.js';
import { field, flattenCallback } from '../payments/grow.js';

/** Our public URL for the provider's server-to-server notifications. */
export const paymentWebhookUrl = () => {
  const project = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
  return `https://${FUNCTIONS_REGION}-${project}.cloudfunctions.net/paymentWebhook`;
};

/** Form data (multipart or urlencoded) or JSON → flat fields. */
async function readFields(rawBody: Buffer, contentType: string, parsed: unknown): Promise<Record<string, string>> {
  if (contentType.includes('application/json')) return flattenCallback(parsed);
  if (contentType.includes('multipart/form-data') || contentType.includes('application/x-www-form-urlencoded')) {
    const form = await new Response(new Uint8Array(rawBody), { headers: { 'content-type': contentType } }).formData();
    const out: Record<string, string> = {};
    for (const [k, v] of form.entries()) if (typeof v === 'string') out[k] = v;
    return out;
  }
  return flattenCallback(parsed);
}

/**
 * Called by Grow (server to server) when a payment finishes. Never trusted on its own:
 * 1. matched to the order by processId + processToken (stored when the payment page was made),
 * 2. the real state is asked from Grow directly, 3. the amount must equal the order total.
 * Then the order goes from "waiting for payment" to "placed", and Grow gets approveTransaction.
 */
export const paymentWebhook = onRequest({ region: FUNCTIONS_REGION, maxInstances: 5, cors: false }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).end();
    return;
  }
  const provider = getPaymentProvider();
  if (!(await provider.isConfigured())) {
    res.status(501).end();
    return;
  }
  let fields: Record<string, string>;
  try {
    fields = await readFields(req.rawBody, String(req.headers['content-type'] ?? ''), req.body);
  } catch {
    res.status(400).end();
    return;
  }
  const orderId = field(fields, 'cField1');
  if (!/^[A-Za-z0-9]{10,40}$/.test(orderId)) {
    logger.warn('payment webhook: no order id', { keys: Object.keys(fields).slice(0, 30) });
    res.status(200).send('ok'); // nothing to do; don't make Grow retry forever
    return;
  }
  const ref = db.collection(COL.orders).doc(orderId);
  const snap = await ref.get();
  const order = snap.data();
  if (!order) {
    res.status(200).send('ok');
    return;
  }
  const verified = await provider.verifyWebhook(fields, {
    providerRef: order.payment?.providerRef ?? null,
    providerToken: order.payment?.providerToken ?? null,
  });
  if (!verified) {
    logger.warn('payment webhook rejected: ids do not match the order', { orderId });
    res.status(401).end();
    return;
  }

  if (verified.status === 'approved') {
    // Second opinion straight from Grow. "unknown" (Grow didn't answer clearly) still relies on the matched token.
    const direct = await provider.getTransaction(verified.providerRef, order.payment.providerToken);
    const contradicts = direct.status === 'pending' || (direct.status === 'approved' && direct.amountAgorot !== verified.amountAgorot);
    const outcome = await db.runTransaction(async (t) => {
      const s = await t.get(ref);
      const o = s.data()!;
      if (o.payment?.status === 'approved') return 'duplicate';
      const base = {
        'payment.transactionId': verified.transactionId,
        'payment.transactionToken': verified.transactionToken,
        'payment.asmachta': verified.asmachta,
        'payment.cardSuffix': verified.cardSuffix,
        'payment.paidAgorot': verified.amountAgorot,
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (!contradicts && verified.amountAgorot === o.totalAgorot && o.status === 'pending_payment') {
        t.update(ref, {
          ...base,
          status: 'placed',
          'payment.status': 'approved',
          'payment.paidAt': FieldValue.serverTimestamp(),
          statusHistory: FieldValue.arrayUnion({ status: 'placed', at: new Date().toISOString(), by: 'payment' }),
        });
        return 'paid';
      }
      // Paid, but something doesn't add up (amount, or the order was cancelled meanwhile): keep it for a person.
      t.update(ref, { ...base, 'payment.status': 'review', needsReview: true });
      return 'review';
    });
    logger.info('payment webhook', { orderId, outcome, direct: direct.status });
  } else {
    logger.info('payment webhook: not paid', { orderId, status: field(fields, 'statusCode') });
  }

  if (verified.transactionId) {
    try {
      await provider.approve(verified.transactionId, verified.transactionToken);
    } catch (e) {
      logger.error('grow approveTransaction failed', { orderId, error: (e as Error).message });
    }
  }
  res.status(200).send('ok');
});
