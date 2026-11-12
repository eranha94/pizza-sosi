import { logger } from 'firebase-functions';
import type { OrderView } from '@pizza-sosi/contracts';

/**
 * Order confirmation email. Provider not chosen yet (e.g. a transactional email service);
 * its API key will live in Secret Manager. Until then this only logs (without personal data).
 */
export async function sendOrderConfirmation(_to: string, order: OrderView): Promise<boolean> {
  logger.info('order confirmation email skipped: no email provider configured', { orderId: order.id });
  return false;
}
