import { setGlobalOptions } from 'firebase-functions/v2';
import { FUNCTIONS_REGION } from '@pizza-sosi/contracts';

setGlobalOptions({ region: FUNCTIONS_REGION, maxInstances: 10 });

export { createOrder } from './api/createOrder.js';
export { cancelOrder } from './api/cancelOrder.js';
export {
  adminSetOrderStatus,
  adminUpdateStoreSettings,
  adminUpsertMenuItem,
  adminDeleteMenuItem,
} from './api/admin.js';
export { paymentWebhook } from './api/paymentWebhook.js';
export { onOrderConfirmed } from './api/orderEmails.js';
