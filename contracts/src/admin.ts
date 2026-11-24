import { z } from 'zod';
import { CATEGORY_IDS, ITEM_TAGS } from './constants.js';
import { OrderStatus } from './orders.js';
import { CategoryId, StoreSettings, DeliveryZone, ScreenSettings } from './menu.js';

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

export const STAFF_ROLES = ['owner', 'staff'] as const;
export const StaffRole = z.enum(STAFF_ROLES);
export type StaffRole = z.infer<typeof StaffRole>;

export const SetOrderStatusRequest = z.object({ orderId: id, status: OrderStatus }).strict();
export type SetOrderStatusRequest = z.infer<typeof SetOrderStatusRequest>;

/** "Pressed by mistake": put the order back to an earlier step (the customer gets an apology). */
export const CorrectOrderStatusRequest = z.object({ orderId: id, status: OrderStatus }).strict();
export type CorrectOrderStatusRequest = z.infer<typeof CorrectOrderStatusRequest>;

export const UpdateStoreSettingsRequest = z
  .object({
    weeklyHours: StoreSettings.shape.weeklyHours.optional(),
    overrides: StoreSettings.shape.overrides.optional(),
    prepMinutes: StoreSettings.shape.prepMinutes.optional(),
    acceptingOrders: z.boolean().optional(),
    deliveryEnabled: z.boolean().optional(),
    deliveryFeeAgorot: z.number().int().min(0).max(10_000).optional(),
    minOrderAgorot: z.number().int().min(0).max(100_000).optional(),
    whatsappStatuses: StoreSettings.shape.whatsappStatuses.optional(),
    deliveryZones: z.array(DeliveryZone).max(30).optional(),
    screen: ScreenSettings.optional(),
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
    tags: z.array(z.enum(ITEM_TAGS)).max(ITEM_TAGS.length).default([]),
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

/**
 * Change one add-on across the whole menu (e.g. "olives now cost 12 ₪ on every pizza").
 * Matches options by exact name inside "multi" (topping) groups, optionally only in one category.
 */
export const BulkUpdateOptionRequest = z
  .object({
    optionName: z.string().trim().min(1).max(80),
    category: z.enum(CATEGORY_IDS).optional(),
    wholeAgorot: z.number().int().min(0).max(100_000).optional(),
    /** null = no half option any more; undefined = leave as is. */
    halfAgorot: z.number().int().min(0).max(100_000).nullable().optional(),
    active: z.boolean().optional(),
    dryRun: z.boolean().default(false),
  })
  .strict()
  .refine((r) => r.wholeAgorot !== undefined || r.halfAgorot !== undefined || r.active !== undefined, 'אין מה לעדכן');
export type BulkUpdateOptionRequest = z.infer<typeof BulkUpdateOptionRequest>;

/** Admin "forgot password": always answers the same, whether or not the email belongs to a staff account. */
export const RequestPasswordResetRequest = z.object({ email: z.string().trim().toLowerCase().email().max(200) }).strict();
export type RequestPasswordResetRequest = z.infer<typeof RequestPasswordResetRequest>;

/** Mark a dish or a topping (by name, everywhere) as available / sold out. Owner and staff. */
export const SetAvailabilityRequest = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('item'), id, active: z.boolean() }).strict(),
  z.object({ kind: z.literal('option'), name: z.string().trim().min(1).max(80), active: z.boolean() }).strict(),
]);
export type SetAvailabilityRequest = z.infer<typeof SetAvailabilityRequest>;
