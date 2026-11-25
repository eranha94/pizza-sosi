import { setGlobalOptions } from 'firebase-functions/v2';
import { FUNCTIONS_REGION } from '@pizza-sosi/contracts';

setGlobalOptions({ region: FUNCTIONS_REGION, maxInstances: 10 });

export { createOrder } from './api/createOrder.js';
export { cancelOrder } from './api/cancelOrder.js';
export { getOrderStatus } from './api/getOrderStatus.js';
export { requestPasswordReset } from './api/passwordReset.js';
export {
  adminSetOrderStatus,
  adminCorrectOrderStatus,
  adminUpdateStoreSettings,
  adminUpsertMenuItem,
  adminDeleteMenuItem,
  adminBulkUpdateOption,
  adminSetAvailability,
} from './api/admin.js';
export { paymentWebhook } from './api/paymentWebhook.js';
export { onOrderConfirmed } from './api/orderEmails.js';
export { onOrderStatusNotify } from './api/orderNotifications.js';
export {
  adminUpsertDeal,
  adminDeleteDeal,
  adminUpsertCoupon,
  adminDeleteCoupon,
  adminUpdateLoyalty,
  checkCoupon,
  getLoyalty,
} from './api/promos.js';
export { onOrderLoyalty } from './api/loyalty.js';
export { adminUpdatePayments, adminRefundOrder } from './api/payments.js';
