import { z } from 'zod';

import { CATEGORY_IDS, NOTIFY_STATUSES } from './constants.js';

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
});
export type MenuItem = z.infer<typeof MenuItem>;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const DayHours = z.object({ open: hhmm, close: hhmm }).nullable();

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
  /** Which status changes send the customer a WhatsApp message (when they opted in). */
  whatsappStatuses: z.array(z.enum(NOTIFY_STATUSES)).max(NOTIFY_STATUSES.length).default([...NOTIFY_STATUSES]),
});
export type StoreSettings = z.infer<typeof StoreSettings>;
