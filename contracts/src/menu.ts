import { z } from 'zod';

import { CATEGORY_IDS } from './constants.js';

export const CategoryId = z.enum(CATEGORY_IDS);
export type CategoryId = z.infer<typeof CategoryId>;

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const AddOn = z.object({
  id,
  name: z.string().min(1).max(300),
  priceAgorot: z.number().int().min(0).max(100_000),
  active: z.boolean(),
  order: z.number().int(),
});
export type AddOn = z.infer<typeof AddOn>;

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
  addOns: z.array(AddOn).max(50).default([]),
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
