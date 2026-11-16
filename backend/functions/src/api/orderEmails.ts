import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { FieldValue, type DocumentReference } from 'firebase-admin/firestore';
import { FUNCTIONS_REGION, OrderView } from '@pizza-sosi/contracts';
import { db } from '../firebase.js';
import { loadEmailConfig, sendEmail } from '../email/mailer.js';
import { orderConfirmationEmail, orderCancelledEmail } from '../email/templates.js';

type Kind = 'confirmation' | 'cancelled';

/** Mark (order, kind) as being sent – a transaction, so a re-run trigger never sends twice. */
async function claim(ref: DocumentReference, kind: Kind): Promise<boolean> {
  const field = `emails.${kind}`;
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.get(field)) return false;
    tx.update(ref, { [field]: { state: 'sending', at: FieldValue.serverTimestamp() } });
    return true;
  });
}

/**
 * Customer emails:
 *  - confirmation when the order is placed (pay on site) or its card payment is approved,
 *  - cancellation notice when an order that was placed gets cancelled (by the customer or the pizzeria).
 */
export const onOrderConfirmed = onDocumentWritten({ document: 'orders/{orderId}', region: FUNCTIONS_REGION, retry: false }, async (event) => {
  const after = event.data?.after;
  const data = after?.data();
  if (!after || !data) return;
  const before = event.data?.before?.data();
  const statusChanged = before?.status !== data.status;
  if (!statusChanged) return;

  let kind: Kind | null = null;
  if (data.status === 'placed') kind = 'confirmation';
  // Only orders the customer actually placed (not abandoned card checkouts).
  else if (data.status === 'cancelled' && before && before.status !== 'pending_payment') kind = 'cancelled';
  if (!kind) return;

  const to = typeof data.contact?.email === 'string' ? data.contact.email : '';
  const view = OrderView.safeParse({ id: after.id, ...data });
  if (!to || !view.success) return;
  const cfg = await loadEmailConfig();
  if (!cfg) {
    logger.info('order email skipped: email not configured', { orderId: after.id, kind });
    return;
  }
  if (!(await claim(after.ref, kind))) return;

  const content = kind === 'confirmation' ? orderConfirmationEmail(view.data, cfg.siteUrl) : orderCancelledEmail(view.data, cfg.siteUrl, data.payment?.status === 'approved');
  try {
    const id = await sendEmail(cfg, to, content, `${after.id}-${kind}`);
    await after.ref.update({ [`emails.${kind}`]: { state: 'sent', id, at: FieldValue.serverTimestamp() } });
  } catch (e) {
    logger.error('order email failed', { orderId: after.id, kind, error: (e as Error).message });
    await after.ref.update({ [`emails.${kind}`]: { state: 'failed', at: FieldValue.serverTimestamp() } });
  }
});
