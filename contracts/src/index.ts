/**
 * The only code shared by frontend and backend: request/response shapes and input validation.
 * Rules for this package:
 *   - no business logic that decides money, permissions or order state
 *   - no Firebase / database access
 *   - no secrets, URLs of internal services or environment values
 */
export * from './money.js';
export * from './menu.js';
export * from './orders.js';
export * from './admin.js';

/** Names of the callable functions – the API surface. */
export const API = {
  createOrder: 'createOrder',
  cancelOrder: 'cancelOrder',
  adminSetOrderStatus: 'adminSetOrderStatus',
  adminUpdateStoreSettings: 'adminUpdateStoreSettings',
  adminUpsertMenuItem: 'adminUpsertMenuItem',
  adminDeleteMenuItem: 'adminDeleteMenuItem',
} as const;

export const FUNCTIONS_REGION = 'europe-west1';
