/**
 * Zod-free part of the contracts: plain constants and helpers.
 * The browser's first page load imports only this file (no validation library).
 */
export * from './money.js';
export * from './hours.js';

/** Order of the categories on the site. מיוחדים last. */
export const CATEGORY_IDS = ['pizzas', 'toasts', 'burgers', 'salads', 'drinks', 'specials'] as const;
type Category = (typeof CATEGORY_IDS)[number];
export const CATEGORY_LABELS: Record<Category, string> = {
  pizzas: 'פיצות',
  specials: 'מיוחדים',
  toasts: 'טוסטים',
  burgers: 'המבורגרים',
  salads: 'סלטים',
  drinks: 'שתייה',
};
/** One item of the category, e.g. for "פיצה חינם". */
export const CATEGORY_SINGULAR: Record<Category, string> = {
  pizzas: 'פיצה',
  specials: 'מנה מיוחדת',
  toasts: 'טוסט',
  burgers: 'המבורגר',
  salads: 'סלט',
  drinks: 'שתייה',
};

/**
 * Order flow (the owner moves it forward from the admin page):
 *   placed → accepted → preparing → almost_ready → ready (pickup)            → completed
 *                                               ↘ out_for_delivery (delivery) → completed
 * Card orders start as pending_payment and become "placed" when the payment is approved.
 */
export const ORDER_STATUSES = [
  'pending_payment',
  'placed',
  'accepted',
  'preparing',
  'almost_ready',
  'ready',
  'out_for_delivery',
  'completed',
  'cancelled',
] as const;
type Status = (typeof ORDER_STATUSES)[number];
export const ORDER_STATUS_LABELS: Record<Status, string> = {
  pending_payment: 'ממתינה לתשלום',
  placed: 'הזמנה חדשה',
  accepted: 'התקבלה',
  preparing: 'בהכנה',
  almost_ready: 'כמעט מוכנה',
  ready: 'מוכנה לאיסוף',
  out_for_delivery: 'בדרך אליך',
  completed: 'הושלמה',
  cancelled: 'בוטלה',
};

/** Labels the owner can put on a menu item (shown as badges, usable as menu filters). */
export const ITEM_TAGS = ['recommended', 'new', 'spicy', 'vegetarian', 'vegan'] as const;
export type ItemTag = (typeof ITEM_TAGS)[number];
export const ITEM_TAG_LABELS: Record<ItemTag, { label: string; icon: string }> = {
  recommended: { label: 'מומלץ', icon: '⭐' },
  new: { label: 'חדש', icon: '✨' },
  spicy: { label: 'חריף', icon: '🌶️' },
  vegetarian: { label: 'צמחוני', icon: '🌱' },
  vegan: { label: 'טבעוני', icon: '🥦' },
};

/** Statuses that can trigger a WhatsApp update to the customer (the owner picks which in the admin). */
export const NOTIFY_STATUSES = ['accepted', 'preparing', 'almost_ready', 'ready', 'out_for_delivery', 'cancelled'] as const;
export type NotifyStatus = (typeof NOTIFY_STATUSES)[number];

/** How a status reads in the "pressed by mistake" apology to the customer ("ההזמנה שלך כרגע: …"). */
export const CORRECTION_STATUS_TEXT: Partial<Record<Status, string>> = {
  placed: 'התקבלה ומחכה לאישור',
  accepted: 'אושרה',
  preparing: 'בהכנה',
  almost_ready: 'כמעט מוכנה',
  ready: 'מוכנה לאיסוף',
  out_for_delivery: 'בדרך אליך',
};

/** The steps a customer sees, by fulfillment. */
export const ORDER_STEPS: Record<'pickup' | 'delivery', readonly Status[]> = {
  pickup: ['placed', 'accepted', 'preparing', 'almost_ready', 'ready'],
  delivery: ['placed', 'accepted', 'preparing', 'almost_ready', 'out_for_delivery'],
};

/** Names of the callable functions – the API surface. */
export const API = {
  createOrder: 'createOrder',
  cancelOrder: 'cancelOrder',
  getOrderStatus: 'getOrderStatus',
  adminSetOrderStatus: 'adminSetOrderStatus',
  adminCorrectOrderStatus: 'adminCorrectOrderStatus',
  adminUpsertDeal: 'adminUpsertDeal',
  adminDeleteDeal: 'adminDeleteDeal',
  adminUpsertCoupon: 'adminUpsertCoupon',
  adminDeleteCoupon: 'adminDeleteCoupon',
  adminUpdateLoyalty: 'adminUpdateLoyalty',
  checkCoupon: 'checkCoupon',
  getLoyalty: 'getLoyalty',
  adminUpdateStoreSettings: 'adminUpdateStoreSettings',
  adminUpsertMenuItem: 'adminUpsertMenuItem',
  adminDeleteMenuItem: 'adminDeleteMenuItem',
  adminBulkUpdateOption: 'adminBulkUpdateOption',
  requestPasswordReset: 'requestPasswordReset',
  adminSetAvailability: 'adminSetAvailability',
} as const;

export const FUNCTIONS_REGION = 'europe-west1';

/** Where a topping goes. "right"/"left" are the halves as the customer looks at the pizza; both cost the half price. */
export const COVERAGES = ['whole', 'right', 'left'] as const;
export const COVERAGE_LABELS: Record<(typeof COVERAGES)[number], string> = {
  whole: 'כל הפיצה',
  right: 'חצי ימין',
  left: 'חצי שמאל',
};
