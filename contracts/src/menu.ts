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
});
export type StoreSettings = z.infer<typeof StoreSettings>;

/**
 * Free toppings: the first regular topping ("רגילות") on each item is on the house.
 * Returns how many toppings in the group are free.
 */
export const freeInGroup = (g: Pick<AddOnGroup, 'name' | 'selection'>): number => (g.selection === 'multi' && /^\s*רגיל/.test(g.name) ? 1 : 0);

/**
 * Which chosen toppings are free. In each group that gives some away, the most expensive picks are the free ones
 * (so the customer always gets the better deal). Shared by the site and the server so both show the same price.
 */
export function freeAddOnIds(groups: readonly AddOnGroup[], picks: readonly { id: string; priceAgorot: number }[]): Set<string> {
  const free = new Set<string>();
  for (const g of groups) {
    const n = freeInGroup(g);
    if (n === 0) continue;
    const inGroup = new Set(g.options.map((o) => o.id));
    picks
      .filter((p) => inGroup.has(p.id))
      .sort((a, b) => b.priceAgorot - a.priceAgorot || a.id.localeCompare(b.id))
      .slice(0, n)
      .forEach((p) => free.add(p.id));
  }
  return free;
}
