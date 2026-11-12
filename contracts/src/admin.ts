import { z } from 'zod';
import { OrderStatus } from './orders.js';
import { CategoryId } from './menu.js';

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const STAFF_ROLES = ['owner', 'staff'] as const;
export const StaffRole = z.enum(STAFF_ROLES);
export type StaffRole = z.infer<typeof StaffRole>;

export const SetOrderStatusRequest = z.object({ orderId: id, status: OrderStatus }).strict();
export type SetOrderStatusRequest = z.infer<typeof SetOrderStatusRequest>;

export const UpdateStoreSettingsRequest = z
  .object({
    opensAt: hhmm.optional(),
    closesAt: hhmm.optional(),
    acceptingOrders: z.boolean().optional(),
    deliveryEnabled: z.boolean().optional(),
    deliveryFeeAgorot: z.number().int().min(0).max(10_000).optional(),
    minOrderAgorot: z.number().int().min(0).max(100_000).optional(),
  })
  .strict();
export type UpdateStoreSettingsRequest = z.infer<typeof UpdateStoreSettingsRequest>;

export const UpsertMenuItemRequest = z
  .object({
    id: id.optional(),
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).default(''),
    category: CategoryId,
    priceAgorot: z.number().int().min(0).max(1_000_000),
    imagePath: z.string().max(300).regex(/^menu_images\/[^/]+$/).nullable(),
    order: z.number().int().min(0).max(10_000),
    active: z.boolean(),
    addOnGroups: z
      .array(
        z.object({
          id: id.optional(),
          name: z.string().trim().min(1).max(60),
          order: z.number().int().min(0).max(100),
          selection: z.enum(['multi', 'single']).default('multi'),
          defaultOptionId: id.nullable().default(null),
          options: z
            .array(
              z.object({
                id: id.optional(),
                name: z.string().trim().min(1).max(80),
                wholeAgorot: z.number().int().min(0).max(100_000),
                halfAgorot: z.number().int().min(0).max(100_000).nullable(),
                active: z.boolean(),
              }),
            )
            .max(40),
        }),
      )
      .max(10)
      .default([]),
  })
  .strict();
export type UpsertMenuItemRequest = z.infer<typeof UpsertMenuItemRequest>;

export const DeleteMenuItemRequest = z.object({ id }).strict();
