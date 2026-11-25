import { HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import {
  CreateOrderRequest,
  storeStatus,
  isValidScheduledTime,
  effectivePrep,
  deliveryOpen,
  localParts,
  dealIsOn,
  applyDeals,
  loyaltyDiscount,
  couponDiscount,
  couponLabel,
  type CreateOrderResponse,
  type Discount,
} from '@pizza-sosi/contracts';
import { db, COL } from '../firebase.js';
import { secureCall } from '../security/callable.js';
import { requireAuth } from '../security/auth.js';
import { validate } from '../security/errors.js';
import { rateLimit } from '../security/rateLimit.js';
import { priceCart, PricingError } from '../domain/pricing.js';
import { initialStatus } from '../domain/orderState.js';
import { loadMenuItems, loadStoreSettings } from '../domain/store.js';
import { getPaymentProvider } from '../payments/provider.js';
import { loadActiveDeals, loadLoyaltySettings, loyaltyRef, rewardLabel } from '../domain/promos.js';
import { couponProblem, couponUseRef } from './promos.js';
import { paymentWebhookUrl } from './paymentWebhook.js';

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
  const now = new Date();
  // When: "asap" needs the store open now; a scheduled time must be one we could have offered.
  let readyAt: number;
  if (input.when === 'asap') {
    const status = storeStatus(settings, now);
    if (status.state !== 'open') throw new HttpsError('failed-precondition', 'הפיצריה סגורה כרגע. אפשר להזמין מראש לשעה שבה אנחנו פתוחים');
    readyAt = now.getTime() + effectivePrep(settings, now) * 60000;
  } else {
    if (!isValidScheduledTime(settings, now, input.when.at)) throw new HttpsError('failed-precondition', 'השעה שנבחרה כבר לא זמינה. בחרו שעה אחרת');
    readyAt = input.when.at;
  }
  if (input.fulfillment === 'delivery' && !deliveryOpen(settings, now))
    throw new HttpsError('failed-precondition', settings.deliveryEnabled ? 'יש עומס כרגע ומשלוחים מושהים. אפשר להזמין באיסוף עצמי' : 'משלוחים לא זמינים כרגע');

  const provider = getPaymentProvider();
  if (input.paymentMethod === 'card') {
    const mode = settings.cardPayments ?? 'off';
    const notYet = new HttpsError('failed-precondition', 'תשלום באשראי עוד לא זמין. אפשר לשלם במקום');
    if (mode === 'off' || !(await provider.isConfigured())) throw notYet;
    if (mode === 'test') {
      // While testing, only the owner's own phone can pay by card.
      const testPhone = String((await db.collection(COL.settings).doc('payments').get()).data()?.testPhone ?? '');
      if (!testPhone || testPhone !== input.customer.phone.replace(/\D/g, '')) throw notYet;
    }
  }

  // Delivery fee and minimum: per area when the pizzeria defined areas, otherwise one for everywhere.
  let deliveryFee = 0;
  let minOrder = settings.minOrderAgorot;
  let zoneName: string | null = null;
  if (input.fulfillment === 'delivery') {
    deliveryFee = settings.deliveryFeeAgorot;
    if (settings.deliveryZones.length > 0) {
      const zone = settings.deliveryZones.find((z) => z.id === input.address?.zoneId);
      if (!zone) throw new HttpsError('failed-precondition', 'בחרו יישוב / אזור למשלוח');
      deliveryFee = zone.feeAgorot;
      minOrder = zone.minOrderAgorot;
      zoneName = zone.name;
    }
  }

  const menu = await loadMenuItems(input.lines.map((l) => l.itemId));
  let priced;
  try {
    priced = priceCart(input.lines, menu, deliveryFee);
  } catch (e) {
    if (e instanceof PricingError) throw new HttpsError('failed-precondition', e.message, { code: e.code });
    throw e;
  }
  if (priced.subtotalAgorot < minOrder)
    throw new HttpsError('failed-precondition', `מינימום הזמנה${zoneName ? ` ל${zoneName}` : ''}: ${minOrder / 100} ₪`);

  // Discounts, in this order: deals found in the cart → loyalty reward → coupon (each on what is left).
  const today = localParts(now);
  const deals = (await loadActiveDeals()).filter((d) => dealIsOn(d, today.date, today.weekday));
  const discounts: Discount[] = applyDeals(input.lines, deals, (id) => menu.get(id)?.priceAgorot);
  const leftAfter = () => priced.subtotalAgorot - discounts.reduce((s, d) => s + d.amountAgorot, 0);
  const phoneKey = input.customer.phone.replace(/\D/g, '');
  if (input.useLoyaltyReward) {
    const loyalty = await loadLoyaltySettings();
    if (!loyalty.enabled) throw new HttpsError('failed-precondition', 'כרטיסיית הנאמנות לא פעילה כרגע');
    const r = loyaltyDiscount(
      loyalty.reward,
      priced.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, category: menu.get(l.itemId)!.category, basePriceAgorot: menu.get(l.itemId)!.priceAgorot })),
      leftAfter(),
    );
    if ('error' in r) throw new HttpsError('failed-precondition', r.error);
    discounts.push({ kind: 'loyalty', label: `הטבת כרטיסייה: ${rewardLabel(loyalty)}`, amountAgorot: r.amountAgorot });
  }
  const couponRef = input.couponCode ? db.collection(COL.coupons).doc(input.couponCode) : null;
  const useRef = input.couponCode ? couponUseRef(input.couponCode, phoneKey) : null;
  const cardRef = input.useLoyaltyReward ? loyaltyRef(phoneKey) : null;

  const orderRef = db.collection(COL.orders).doc();
  const counterRef = db.collection(COL.counters).doc('orders');
  const status = initialStatus(input.paymentMethod);

  const { number, totals } = await db.runTransaction(async (tx) => {
    // All reads first (Firestore transactions), then checks, then writes.
    const [c, coupon, use, card] = await Promise.all([
      tx.get(counterRef),
      couponRef ? tx.get(couponRef) : null,
      useRef ? tx.get(useRef) : null,
      cardRef ? tx.get(cardRef) : null,
    ]);
    const all = [...discounts];
    if (coupon) {
      const cd = coupon.data();
      const problem = couponProblem(cd, now, Boolean(cd?.oncePerPhone && use?.exists));
      if (problem) throw new HttpsError('failed-precondition', problem);
      const left = priced.subtotalAgorot - all.reduce((s, d) => s + d.amountAgorot, 0);
      const r = couponDiscount({ type: cd!.type, value: cd!.value, minOrderAgorot: Number(cd!.minOrderAgorot ?? 0) }, left);
      if ('error' in r) throw new HttpsError('failed-precondition', r.error);
      all.push({ kind: 'coupon', label: couponLabel({ code: input.couponCode!, type: cd!.type, value: cd!.value }), amountAgorot: r.amountAgorot });
    }
    if (card && !(Number(card.data()?.rewards ?? 0) > 0)) throw new HttpsError('failed-precondition', 'אין כרגע הטבה זמינה בכרטיסייה');
    const discountAgorot = Math.min(priced.subtotalAgorot, all.reduce((s, d) => s + d.amountAgorot, 0));
    const t = { discounts: all, discountAgorot, totalAgorot: priced.subtotalAgorot - discountAgorot + priced.deliveryFeeAgorot };

    const next = ((c.data()?.last as number | undefined) ?? 1000) + 1;
    tx.set(counterRef, { last: next }, { merge: true });
    if (coupon && couponRef && useRef) {
      tx.update(couponRef, { usedCount: FieldValue.increment(1) });
      tx.set(useRef, { orderId: orderRef.id, at: FieldValue.serverTimestamp() });
    }
    if (card && cardRef) tx.update(cardRef, { rewards: FieldValue.increment(-1), updatedAt: FieldValue.serverTimestamp() });
    tx.create(orderRef, {
      uid,
      number: next,
      status,
      fulfillment: input.fulfillment,
      paymentMethod: input.paymentMethod,
      lines: priced.lines,
      subtotalAgorot: priced.subtotalAgorot,
      discounts: t.discounts,
      discountAgorot: t.discountAgorot,
      couponCode: input.couponCode ?? null,
      loyalty: { redeemed: Boolean(card), stamped: false },
      deliveryFeeAgorot: priced.deliveryFeeAgorot,
      totalAgorot: t.totalAgorot,
      customerName: input.customer.name,
      // Contact details: readable only by the customer and staff (see firestore.rules).
      contact: { phone: input.customer.phone, email: input.customer.email },
      address: input.address ? { ...input.address, ...(zoneName && { zoneName }) } : null,
      note: input.note,
      readyAt,
      scheduled: input.when !== 'asap',
      notify: { whatsapp: input.notifyWhatsapp },
      payment: { provider: provider.name, providerRef: null, status: input.paymentMethod === 'card' ? 'pending' : 'on_site' },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      statusHistory: [{ status, at: new Date().toISOString(), by: 'system' }],
    });
    return { number: next, totals: t };
  });

  let paymentUrl: string | null = null;
  if (input.paymentMethod === 'card') {
    // Back to the site the customer came from (only our own sites).
    const o = String(req.rawRequest.headers.origin ?? '');
    const origin = /^https:\/\/(pizza-sosi\.co\.il|www\.pizza-sosi\.co\.il|pizza-sosi[a-z-]*\.web\.app)$/.test(o) || /^http:\/\/localhost:\d+$/.test(o) ? o : 'https://pizza-sosi.co.il';
    try {
      const page = await provider.createPaymentPage({
        orderId: orderRef.id,
        amountAgorot: totals.totalAgorot,
        description: `פיצה סוסי – הזמנה #${number}`,
        customer: input.customer,
        successUrl: `${origin}/order/${orderRef.id}`,
        cancelUrl: `${origin}/checkout?paycancel=${orderRef.id}`,
        notifyUrl: paymentWebhookUrl(),
      });
      paymentUrl = page.url;
      await orderRef.update({ 'payment.providerRef': page.providerRef, 'payment.providerToken': page.providerToken });
    } catch (e) {
      // No payment page: cancel the order right away (gives back a coupon/reward) and tell the customer.
      logger.error('payment page failed', { orderId: orderRef.id, error: (e as Error).message });
      await orderRef.update({
        status: 'cancelled',
        updatedAt: FieldValue.serverTimestamp(),
        statusHistory: FieldValue.arrayUnion({ status: 'cancelled', at: new Date().toISOString(), by: 'system' }),
      });
      throw new HttpsError('unavailable', 'דף התשלום לא נפתח כרגע. אפשר לנסות שוב או לבחור תשלום במקום');
    }
  }

  const response: CreateOrderResponse = { orderId: orderRef.id, number, status, totalAgorot: totals.totalAgorot, paymentUrl };
  await idemRef.set({ response, createdAt: FieldValue.serverTimestamp() });
  logger.info('order created', { orderId: orderRef.id, number, total: totals.totalAgorot, discount: totals.discountAgorot, method: input.paymentMethod });
  return response;
});
