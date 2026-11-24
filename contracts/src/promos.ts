import { z } from 'zod';
import { CATEGORY_IDS } from './constants.js';

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const phone = z
  .string()
  .transform((s) => s.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^0\d{8,9}$/, 'מספר טלפון לא תקין'));

/* ---------- Deals (combos). `deals/{id}`, public read ---------- */

export const DEAL_THEMES = ['red', 'yellow', 'green', 'dark'] as const;

export const Deal = z.object({
  id,
  title: z.string().trim().min(2).max(50),
  description: z.string().trim().max(140).default(''),
  components: z.array(z.object({ itemId: id, quantity: z.number().int().min(1).max(6) }).strict()).min(1).max(6),
  priceAgorot: z.number().int().min(100).max(100_000),
  active: z.boolean().default(true),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  validFrom: date.nullable().default(null),
  validTo: date.nullable().default(null),
  order: z.number().int().default(0),
  /** Background colour of the deal card. */
  theme: z.enum(DEAL_THEMES).default('red'),
});
export type Deal = z.infer<typeof Deal>;

export const UpsertDealRequest = Deal.omit({ id: true }).extend({ id: id.optional() }).strict();
export type UpsertDealRequest = z.input<typeof UpsertDealRequest>;
export const DeleteDealRequest = z.object({ id }).strict();

/* ---------- Coupons. `coupons/{CODE}`, staff only ---------- */

export const couponCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{3,20}$/, 'קוד קופון: 3–20 אותיות באנגלית או ספרות');

export const Coupon = z
  .object({
    code: couponCode,
    type: z.enum(['percent', 'amount']),
    /** Percent (1–100) or agorot off. */
    value: z.number().int().min(1).max(100_000),
    minOrderAgorot: z.number().int().min(0).max(100_000).default(0),
    validFrom: date.nullable().default(null),
    validTo: date.nullable().default(null),
    /** Total uses allowed. null = unlimited. */
    maxUses: z.number().int().min(1).max(100_000).nullable().default(null),
    oncePerPhone: z.boolean().default(true),
    active: z.boolean().default(true),
  })
  .strict()
  .refine((c) => c.type === 'amount' || c.value <= 100, { message: 'אחוז הנחה עד 100', path: ['value'] });
export type Coupon = z.infer<typeof Coupon>;
export const UpsertCouponRequest = Coupon;
export const DeleteCouponRequest = z.object({ code: couponCode }).strict();
export const CheckCouponRequest = z.object({ code: couponCode, phone: phone.optional() }).strict();
export type CheckCouponResponse = { code: string; type: 'percent' | 'amount'; value: number; minOrderAgorot: number; label: string };

/* ---------- Loyalty card. `settings/loyalty` public read; cards in `loyalty/{phone}`, server only ---------- */

export const LoyaltyRewardSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('item'), category: z.enum(CATEGORY_IDS), maxAgorot: z.number().int().min(0).max(100_000) }).strict(),
  z.object({ type: z.literal('amount'), amountAgorot: z.number().int().min(100).max(100_000) }).strict(),
  z.object({ type: z.literal('percent'), percent: z.number().int().min(1).max(100) }).strict(),
]);

export const LoyaltySettings = z
  .object({
    enabled: z.boolean(),
    /** Orders to fill the card; the reward comes with the next order. */
    ordersRequired: z.number().int().min(2).max(30),
    /** Orders below this (after discounts) don't get a stamp. */
    minOrderAgorot: z.number().int().min(0).max(100_000),
    reward: LoyaltyRewardSchema,
    /** WhatsApp after each completed order: "3 of 10 – 7 to go". */
    notifyWhatsapp: z.boolean(),
  })
  .strict();
export type LoyaltySettings = z.infer<typeof LoyaltySettings>;
export const DEFAULT_LOYALTY: LoyaltySettings = {
  enabled: false,
  ordersRequired: 10,
  minOrderAgorot: 0,
  reward: { type: 'item', category: 'pizzas', maxAgorot: 0 },
  notifyWhatsapp: true,
};

export const GetLoyaltyRequest = z.object({ phone }).strict();
export type LoyaltyCardView = {
  enabled: boolean;
  required: number;
  stamps: number;
  rewards: number;
  rewardLabel: string;
  minOrderAgorot: number;
};
