import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import { FUNCTIONS_REGION } from '@pizza-sosi/contracts';
import { db, COL } from '../firebase.js';
import { getPaymentProvider } from '../payments/provider.js';

/** Our public URL for the provider's server-to-server notifications. */
export const paymentWebhookUrl = () => {
  const project = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
  return `https://${FUNCTIONS_REGION}-${project}.cloudfunctions.net/paymentWebhook`;
};

/** JSON, form or query string → plain fields. */
async function readFields(req: { rawBody: Buffer; headers: Record<string, unknown>; body: unknown; query: unknown }): Promise<Record<string, unknown>> {
  const ct = String(req.headers['content-type'] ?? '');
  if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
    const form = await new Response(new Uint8Array(req.rawBody), { headers: { 'content-type': ct } }).formData();
    const out: Record<string, unknown> = {};
    for (const [k, v] of form.entries()) if (typeof v === 'string') out[k] = v;
    return out;
  }
  const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
  return { ...(req.query as Record<string, unknown>), ...body };
}

/**
 * Called by the card provider (server to server) when a payment ends. The post itself is never trusted:
 * it only tells us WHICH payment; the result is asked from the provider directly, must belong to this
 * order (same payment id and order id) and the amount must equal the order total.
 * Then the order goes from "waiting for payment" to "placed".
 */
export const paymentWebhook = onRequest({ region: FUNCTIONS_REGION, maxInstances: 5, cors: false }, async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.status(405).end();
    return;
  }
  const provider = getPaymentProvider();
  if (!(await provider.isConfigured())) {
    res.status(501).end();
    return;
  }
  let fields: Record<string, unknown>;
  try {
    fields = await readFields(req as never);
  } catch {
    res.status(400).end();
    return;
  }
  const ref = provider.refFromNotification(fields);
  if (!ref) {
    logger.warn('payment webhook: no payment id', { keys: Object.keys(fields).slice(0, 30) });
    res.status(200).send('ok'); // nothing we can do with it; don't make the provider retry
    return;
  }
  let result;
  try {
    result = await provider.getResult(ref.providerRef);
  } catch (e) {
    logger.error('payment webhook: provider lookup failed', { error: (e as Error).message });
    res.status(503).end(); // the provider will retry
    return;
  }
  const orderId = result.orderId || ref.orderId;
  if (!/^[A-Za-z0-9]{10,40}$/.test(orderId)) {
    res.status(200).send('ok');
    return;
  }
  const orderRef = db.collection(COL.orders).doc(orderId);
  const outcome = await db.runTransaction(async (t) => {
    const snap = await t.get(orderRef);
    const o = snap.data();
    if (!o) return 'no-order';
    if (o.payment?.providerRef !== ref.providerRef) return 'not-this-order';
    if (o.payment?.status === 'approved' || o.payment?.status === 'refunded') return 'duplicate';
    if (result.status === 'declined') {
      t.update(orderRef, { 'payment.status': 'declined', updatedAt: FieldValue.serverTimestamp() });
      return 'declined';
    }
    if (result.status !== 'approved') return 'pending';
    const base = {
      'payment.transactionId': result.transactionId,
      'payment.cardSuffix': result.cardSuffix,
      'payment.approvalNumber': result.approvalNumber,
      'payment.paidAgorot': result.amountAgorot,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (result.amountAgorot === o.totalAgorot && o.status === 'pending_payment') {
      t.update(orderRef, {
        ...base,
        status: 'placed',
        'payment.status': 'approved',
        'payment.paidAt': FieldValue.serverTimestamp(),
        statusHistory: FieldValue.arrayUnion({ status: 'placed', at: new Date().toISOString(), by: 'payment' }),
      });
      return 'paid';
    }
    // Paid, but something doesn't add up (amount, or the order was cancelled meanwhile): a person checks it.
    t.update(orderRef, { ...base, 'payment.status': 'review', needsReview: true });
    return 'review';
  });
  logger.info('payment webhook', { orderId, outcome, status: result.status });
  res.status(200).send('ok');
});
