import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import { FUNCTIONS_REGION } from '@pizza-sosi/contracts';
import { db } from '../firebase.js';
import { loadLoyaltySettings, loyaltyRef, rewardLabel } from '../domain/promos.js';
import { loadWhatsappConfig, sendTemplate, toWhatsappNumber, LOYALTY_PROGRESS_TEMPLATE, LOYALTY_REWARD_TEMPLATE } from '../notify/whatsapp.js';

/** Pure part (tested): add one stamp; a full card turns into a reward. */
export function addStamp(stamps: number, required: number): { stamps: number; earned: boolean } {
  const next = stamps + 1;
  return next >= required ? { stamps: next - required, earned: true } : { stamps: next, earned: false };
}

/**
 * Loyalty card, keyed by phone:
 *  - order completed → one stamp (if the order reached the minimum); a full card becomes a reward,
 *    and the customer gets a WhatsApp (if they opted in and the owner turned it on)
 *  - order cancelled after using a reward → the reward goes back on the card
 * Each order is counted at most once (flags on the order, set in the same transaction).
 */
export const onOrderLoyalty = onDocumentUpdated(
  { document: 'orders/{orderId}', region: FUNCTIONS_REGION, retry: false, maxInstances: 5 },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || before.status === after.status) return;
    const ref = event.data!.after.ref;
    const phone = String(after.contact?.phone ?? '').replace(/\D/g, '');
    if (!phone) return;

    if (after.status === 'cancelled' && after.loyalty?.redeemed && !after.loyalty?.restored) {
      await db.runTransaction(async (tx) => {
        const o = await tx.get(ref);
        if (o.get('loyalty.restored')) return;
        tx.set(loyaltyRef(phone), { rewards: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        tx.update(ref, { 'loyalty.restored': true });
      });
      logger.info('loyalty reward restored', { orderId: ref.id });
      return;
    }

    if (after.status !== 'completed' || after.loyalty?.stamped) return;
    const settings = await loadLoyaltySettings();
    if (!settings.enabled) return;
    const paid = Number(after.subtotalAgorot ?? 0) - Number(after.discountAgorot ?? 0);
    if (paid < settings.minOrderAgorot) return;

    const result = await db.runTransaction(async (tx) => {
      const [o, card] = await Promise.all([tx.get(ref), tx.get(loyaltyRef(phone))]);
      if (o.get('loyalty.stamped')) return null;
      const r = addStamp(Number(card.data()?.stamps ?? 0), settings.ordersRequired);
      tx.set(
        loyaltyRef(phone),
        { stamps: r.stamps, rewards: FieldValue.increment(r.earned ? 1 : 0), updatedAt: FieldValue.serverTimestamp() },
        { merge: true },
      );
      tx.update(ref, { 'loyalty.stamped': true, 'loyalty.stampsAfter': r.stamps, 'loyalty.earned': r.earned });
      return r;
    });
    if (!result) return;
    logger.info('loyalty stamp', { orderId: ref.id, earned: result.earned });

    if (!settings.notifyWhatsapp || after.notify?.whatsapp !== true) return;
    const [cfg, to] = [await loadWhatsappConfig(), toWhatsappNumber(phone)];
    if (!cfg || !to) return;
    const firstName = String(after.customerName ?? '').trim().split(/\s+/)[0] || 'לקוח יקר';
    const label = rewardLabel(settings);
    try {
      await sendTemplate(cfg, {
        to,
        template: result.earned ? LOYALTY_REWARD_TEMPLATE : LOYALTY_PROGRESS_TEMPLATE,
        language: cfg.language,
        bodyParams: result.earned
          ? [firstName, label]
          : [firstName, String(result.stamps), String(settings.ordersRequired), String(settings.ordersRequired - result.stamps), label],
        buttonParam: ref.id,
      });
      await ref.update({ 'notifications.whatsapp_loyalty': { state: 'sent', at: FieldValue.serverTimestamp() } });
    } catch (e) {
      logger.error('loyalty whatsapp failed', { orderId: ref.id, error: (e as Error).message });
      await ref.update({ 'notifications.whatsapp_loyalty': { state: 'failed', at: FieldValue.serverTimestamp() } });
    }
  },
);
