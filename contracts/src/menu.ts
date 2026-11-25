import { z } from 'zod';

import { CATEGORY_IDS, NOTIFY_STATUSES, ITEM_TAGS } from './constants.js';

export const CategoryId = z.enum(CATEGORY_IDS);
export type CategoryId = z.infer<typeof CategoryId>;

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

const price = z.number().int().min(0).max(100_000);

/**
 * One topping the customer can pick, e.g. "טונה".
 * `halfAgorot` set → the customer chooses "כל הפיצה" (wholeAgorot) or "חצי פיצה" (halfAgorot).
 * `halfAgorot` null → one price only (personal pizza, toast, burger extras).
 */
export const AddOnOption = z.object({
  id,
  name: z.string().min(1).max(80),
  wholeAgorot: price,
  halfAgorot: price.nullable(),
  active: z.boolean(),
});
export type AddOnOption = z.infer<typeof AddOnOption>;

/**
 * A heading that groups choices.
 *  - "multi": optional toppings, any number (e.g. "מיוחדות")
 *  - "single": exactly one must be chosen (e.g. "עובי בצק": עבה/סטנדרט/דק). `defaultOptionId` is pre-selected.
 */
export const AddOnGroup = z.object({
  id,
  name: z.string().min(1).max(60),
  order: z.number().int(),
  selection: z.enum(['multi', 'single']).default('multi'),
  defaultOptionId: id.nullable().default(null),
  options: z.array(AddOnOption).max(40),
});
export type AddOnGroup = z.infer<typeof AddOnGroup>;

/** Public shape of a menu item, as stored in `menuItems/{id}` and readable by anyone. */
export const MenuItem = z.object({
  id,
  name: z.string().min(1).max(120),
  description: z.string().max(1000).default(''),
  category: CategoryId,
  priceAgorot: z.number().int().min(0).max(1_000_000),
  imagePath: z.string().max(300).nullable(),
  order: z.number().int(),
  active: z.boolean(),
  addOnGroups: z.array(AddOnGroup).max(10).default([]),
  tags: z.array(z.enum(ITEM_TAGS)).max(ITEM_TAGS.length).default([]),
});
export type MenuItem = z.infer<typeof MenuItem>;

export const DeliveryZone = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,30}$/),
  name: z.string().trim().min(1).max(40),
  feeAgorot: z.number().int().min(0).max(100_000),
  minOrderAgorot: z.number().int().min(0).max(100_000),
});
export type DeliveryZone = z.infer<typeof DeliveryZone>;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const DayHours = z.object({ open: hhmm, close: hhmm }).nullable();

/** A promotion slide on the in-store screen. */
export const ScreenPromo = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,30}$/),
  title: z.string().trim().min(1).max(50),
  text: z.string().trim().max(120).default(''),
  emoji: z.string().max(8).default(''),
  active: z.boolean().default(true),
});
export type ScreenPromo = z.infer<typeof ScreenPromo>;

/** The TV menu board in the pizzeria (pizza-sosi.co.il/screen). Stored inside settings/store. */
export const ScreenSettings = z.object({
  /** Seconds each slide stays up. */
  slideSeconds: z.number().int().min(5).max(30).default(9),
  /** Dishes to feature with a big photo. Empty = automatic (recommended/new dishes that have a photo). */
  featuredItemIds: z.array(id).max(15).default([]),
  promos: z.array(ScreenPromo).max(8).default([]),
  /** Which categories get a full-screen price list. */
  menuCategories: z.array(CategoryId).max(CATEGORY_IDS.length).default([...CATEGORY_IDS]),
  /** Order numbers being prepared / ready for pickup, along the side. */
  showReady: z.boolean().default(true),
  /** "Order online" QR code. */
  showQr: z.boolean().default(true),
});
export type ScreenSettings = z.infer<typeof ScreenSettings>;

export const DEFAULT_SCREEN: ScreenSettings = {
  slideSeconds: 9,
  featuredItemIds: [],
  promos: [{ id: 'free-topping', title: 'התוספת הראשונה עלינו', text: 'על כל פיצה – תוספת רגילה ראשונה בחינם', emoji: '🎁', active: true }],
  menuCategories: [...CATEGORY_IDS],
  showReady: true,
  showQr: true,
};

/** Public doc screen/board: pickup order numbers for the screen. Numbers only, no names. */
export interface ScreenBoard {
  preparing: number[];
  ready: number[];
}

/** `settings/store` – public opening state, read by everyone, written only by the admin functions. */
export const StoreSettings = z.object({
  /** 0 = Sunday … 6 = Saturday; null = closed that day. close <= open means after midnight. */
  weeklyHours: z.tuple([DayHours, DayHours, DayHours, DayHours, DayHours, DayHours, DayHours]),
  /** One-day changes, e.g. close early tonight. */
  overrides: z
    .array(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), closed: z.boolean().optional(), open: hhmm.optional(), close: hhmm.optional() }))
    .max(60)
    .default([]),
  /** Manual switch: when false, no orders are accepted regardless of hours. */
  acceptingOrders: z.boolean(),
  /** Typical minutes from order to ready (shown to customers, minimum for scheduled orders). */
  prepMinutes: z.number().int().min(5).max(180),
  deliveryEnabled: z.boolean(),
  deliveryFeeAgorot: z.number().int().min(0).max(10_000),
  minOrderAgorot: z.number().int().min(0).max(100_000),
  /** Delivery areas with their own fee and minimum. Empty = one fee/minimum for everywhere (fields above). */
  deliveryZones: z.array(DeliveryZone).max(30).default([]),
  /** Which status changes send the customer a WhatsApp message (when they opted in). */
  whatsappStatuses: z.array(z.enum(NOTIFY_STATUSES)).max(NOTIFY_STATUSES.length).default([...NOTIFY_STATUSES]),
  /** The in-store TV screen. Missing = defaults. */
  screen: ScreenSettings.optional(),
  /** Card payments on the site: off, test (only the owner's test phone, with ?paytest=1) or live. */
  cardPayments: z.enum(['off', 'test', 'live']).default('off'),
  /** Busy mode (see BusyMode in hours.ts). null = off. */
  busy: z
    .object({ until: z.number().int().positive(), extraMinutes: z.number().int().min(5).max(120), pauseDelivery: z.boolean() })
    .nullable()
    .default(null),
});
export type StoreSettings = z.infer<typeof StoreSettings>;
