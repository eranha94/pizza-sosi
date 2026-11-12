import { z } from 'zod';

import { CATEGORY_IDS } from './constants.js';

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

/** A heading that groups toppings with the same price, e.g. "מיוחדות". */
export const AddOnGroup = z.object({
  id,
  name: z.string().min(1).max(60),
  order: z.number().int(),
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

/** `settings/store` – public opening state. */
export const StoreSettings = z.object({
  /** Local time "HH:MM" in Asia/Jerusalem. */
  opensAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  /** Local time "HH:MM"; "00:00" means midnight. Admin can change it for today. */
  closesAt: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  /** Manual switch: when false, no orders are accepted regardless of hours. */
  acceptingOrders: z.boolean(),
  deliveryEnabled: z.boolean(),
  deliveryFeeAgorot: z.number().int().min(0).max(10_000),
  minOrderAgorot: z.number().int().min(0).max(100_000),
});
export type StoreSettings = z.infer<typeof StoreSettings>;
