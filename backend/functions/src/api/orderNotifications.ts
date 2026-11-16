import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { FieldValue } from 'firebase-admin/firestore';
import { FUNCTIONS_REGION, NOTIFY_STATUSES, type NotifyStatus } from '@pizza-sosi/contracts';
import { db } from '../firebase.js';
import { loadStoreSettings } from '../domain/store.js';
import { loadWhatsappConfig, sendTemplate, toWhatsappNumber, TEMPLATE_BY_STATUS } from '../notify/whatsapp.js';

const isNotifyStatus = (s: unknown): s is NotifyStatus => (NOTIFY_STATUSES as readonly unknown[]).includes(s);

/**
 * When the owner moves an order to a new status, tell the customer on WhatsApp
 * (only if they opted in, the owner enabled that status, and WhatsApp is configured).
 * Each status is sent at most once per order, even if the trigger runs twice.
 */
export const onOrderStatusNotify = onDocumentUpdated(
  { document: 'orders/{orderId}', region: FUNCTIONS_REGION, retry: false, maxInstances: 5 },
  async (event) => {
    const before = event.data?.before.data();
    const after = event.data?.after.data();
    if (!before || !after || before.status === after.status) return;
    const status = after.status;
    if (!isNotifyStatus(status)) return;
    const orderId = event.params.orderId;
    if (after.notify?.whatsapp !== true) {
      logger.info('whatsapp skipped: customer did not opt in', { orderId, status });
      return;
    }

    const [settings, cfg] = await Promise.all([loadStoreSettings(), loadWhatsappConfig()]);
    if (!cfg) {
      logger.warn('whatsapp skipped: settings/whatsapp missing or disabled', { orderId, status });
      return;
    }
    if (!settings.whatsappStatuses.includes(status)) {
      logger.info('whatsapp skipped: status turned off in store settings', { orderId, status });
      return;
    }
    const to = toWhatsappNumber(String(after.contact?.phone ?? ''));
    if (!to) {
      logger.info('whatsapp skipped: not a mobile number', { orderId, status });
      return;
    }

    // Claim this (order, status) once – a transaction makes a duplicate trigger a no-op.
    const ref = event.data!.after.ref;
    const field = `notifications.whatsapp.${status}`;
    const claimed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.get(field)) return false;
      tx.update(ref, { [field]: { state: 'sending', at: FieldValue.serverTimestamp() } });
      return true;
    });
    if (!claimed) return;

    const firstName = String(after.customerName ?? '').trim().split(/\s+/)[0] || 'לקוח יקר';
    try {
      const id = await sendTemplate(cfg, {
        to,
        template: TEMPLATE_BY_STATUS[status],
        language: cfg.language,
        bodyParams: [firstName, String(after.number)],
        buttonParam: ref.id,
      });
      await ref.update({ [field]: { state: 'sent', id, at: FieldValue.serverTimestamp() } });
      logger.info('whatsapp sent', { orderId, status });
    } catch (e) {
      logger.error('whatsapp notify failed', { orderId: ref.id, status, error: (e as Error).message });
      // Keep Meta's error code on the order, so the reason is visible without digging in the logs.
      const code = /^whatsapp \d+ (\d+)/.exec((e as Error).message)?.[1] ?? null;
      await ref.update({ [field]: { state: 'failed', code, at: FieldValue.serverTimestamp() } });
    }
  },
);
