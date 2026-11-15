import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { FUNCTIONS_REGION, OrderView } from '@pizza-sosi/contracts';
import { sendOrderConfirmation } from '../email/mailer.js';

/** Send the confirmation email once, when the order is placed (pay on site) or its card payment is approved. */
export const onOrderConfirmed = onDocumentWritten({ document: 'orders/{orderId}', region: FUNCTIONS_REGION }, async (event) => {
  const after = event.data?.after;
  if (!after) return;
  const data = after.data();
  if (!data) return;
  if (data.confirmationEmailAt || data.status !== 'placed') return;
  const view = OrderView.safeParse({ id: after.id, ...data });
  if (!view.success) return;
  const sent = await sendOrderConfirmation(data.contact?.email, view.data);
  if (sent) await after.ref.update({ confirmationEmailAt: FieldValue.serverTimestamp() });
});
