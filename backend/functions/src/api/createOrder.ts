import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import { CreateOrderRequest, type CreateOrderResponse } from '@pizza-sosi/contracts';
import { db, COL } from '../firebase.js';
import { secureCall } from '../security/callable.js';
import { requireAuth } from '../security/auth.js';
import { validate } from '../security/errors.js';
import { rateLimit } from '../security/rateLimit.js';
import { priceCart, PricingError } from '../domain/pricing.js';
import { initialStatus } from '../domain/orderState.js';
import { isOpen } from '../domain/hours.js';
import { loadMenuItems, loadStoreSettings } from '../domain/store.js';
import { getPaymentProvider } from '../payments/provider.js';

export const createOrder = secureCall<CreateOrderResponse>(async (req) => {
  const uid = requireAuth(req);
  const input = validate(CreateOrderRequest, req.data);

  // Same idempotency key from the same user → return the order already created.
  const idemRef = db.collection(COL.idempotency).doc(`${uid}_${input.idempotencyKey}`);
  const existing = await idemRef.get();
  if (existing.exists) return existing.data()!.response as CreateOrderResponse;

  await rateLimit(`order:uid:${uid}`, 5, 10 * 60);
  await rateLimit(`order:phone:${input.customer.phone}`, 8, 60 * 60);

  const settings = await loadStoreSettings();
  if (!isOpen(settings, new Date())) throw new HttpsError('failed-precondition', 'הפיצריה סגורה כרגע להזמנות');
  if (input.fulfillment === 'delivery' && !settings.deliveryEnabled)
    throw new HttpsError('failed-precondition', 'משלוחים לא זמינים כרגע');

  const provider = getPaymentProvider();
  if (input.paymentMethod === 'card' && !provider.isConfigured())
    throw new HttpsError('failed-precondition', 'תשלום באשראי עוד לא זמין. אפשר לשלם במקום');

  const menu = await loadMenuItems(input.lines.map((l) => l.itemId));
  let priced;
  try {
    priced = priceCart(input.lines, menu, input.fulfillment === 'delivery' ? settings.deliveryFeeAgorot : 0);
  } catch (e) {
    if (e instanceof PricingError) throw new HttpsError('failed-precondition', e.message, { code: e.code });
    throw e;
  }
  if (priced.subtotalAgorot < settings.minOrderAgorot)
    throw new HttpsError('failed-precondition', 'ההזמנה נמוכה מסכום המינימום');

  const orderRef = db.collection(COL.orders).doc();
  const counterRef = db.collection(COL.counters).doc('orders');
  const status = initialStatus(input.paymentMethod);

  const number = await db.runTransaction(async (tx) => {
    const c = await tx.get(counterRef);
    const next = ((c.data()?.last as number | undefined) ?? 1000) + 1;
    tx.set(counterRef, { last: next }, { merge: true });
    tx.create(orderRef, {
      uid,
      number: next,
      status,
      fulfillment: input.fulfillment,
      paymentMethod: input.paymentMethod,
      lines: priced.lines,
      subtotalAgorot: priced.subtotalAgorot,
      deliveryFeeAgorot: priced.deliveryFeeAgorot,
      totalAgorot: priced.totalAgorot,
      customerName: input.customer.name,
      // Contact details: readable only by the customer and staff (see firestore.rules).
      contact: { phone: input.customer.phone, email: input.customer.email },
      address: input.address ?? null,
      note: input.note,
      payment: { provider: provider.name, providerRef: null, status: input.paymentMethod === 'card' ? 'pending' : 'on_site' },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      statusHistory: [{ status, at: new Date().toISOString(), by: 'system' }],
    });
    return next;
  });

  let paymentUrl: string | null = null;
  if (input.paymentMethod === 'card') {
    const origin = String(req.rawRequest.headers.origin ?? '');
    const page = await provider.createPaymentPage({
      orderId: orderRef.id,
      amountAgorot: priced.totalAgorot,
      customer: input.customer,
      successUrl: `${origin}/order/${orderRef.id}`,
      cancelUrl: `${origin}/checkout`,
    });
    paymentUrl = page.url;
    await orderRef.update({ 'payment.providerRef': page.providerRef });
  }

  const response: CreateOrderResponse = { orderId: orderRef.id, status, totalAgorot: priced.totalAgorot, paymentUrl };
  await idemRef.set({ response, createdAt: FieldValue.serverTimestamp() });
  logger.info('order created', { orderId: orderRef.id, number, total: priced.totalAgorot, method: input.paymentMethod });
  return response;
});
