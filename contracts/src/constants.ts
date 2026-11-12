/**
 * Zod-free part of the contracts: plain constants and helpers.
 * The browser's first page load imports only this file (no validation library).
 */
export * from './money.js';

export const CATEGORY_IDS = ['pizzas', 'specials', 'toasts', 'burgers', 'salads', 'drinks'] as const;
type Category = (typeof CATEGORY_IDS)[number];
export const CATEGORY_LABELS: Record<Category, string> = {
  pizzas: 'פיצות',
  specials: 'מבצעים',
  toasts: 'טוסטים',
  burgers: 'המבורגרים',
  salads: 'סלטים',
  drinks: 'שתייה',
};

export const ORDER_STATUSES = [
  'pending_payment',
  'paid',
  'accepted',
  'preparing',
  'ready',
  'out_for_delivery',
  'completed',
  'cancelled',
] as const;
type Status = (typeof ORDER_STATUSES)[number];
export const ORDER_STATUS_LABELS: Record<Status, string> = {
  pending_payment: 'ממתינה לתשלום',
  paid: 'שולמה',
  accepted: 'התקבלה',
  preparing: 'בהכנה',
  ready: 'מוכנה',
  out_for_delivery: 'בדרך אליך',
  completed: 'הושלמה',
  cancelled: 'בוטלה',
};

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

export const COVERAGES = ['whole', 'half'] as const;
export const COVERAGE_LABELS: Record<(typeof COVERAGES)[number], string> = { whole: 'כל הפיצה', half: 'חצי פיצה' };
