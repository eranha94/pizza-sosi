import { z } from 'zod';

const id = z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/);

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
export const OrderStatus = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof OrderStatus>;

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: 'ממתינה לתשלום',
  paid: 'שולמה',
  accepted: 'התקבלה',
  preparing: 'בהכנה',
  ready: 'מוכנה',
  out_for_delivery: 'בדרך אליך',
  completed: 'הושלמה',
  cancelled: 'בוטלה',
};

export const Fulfillment = z.enum(['pickup', 'delivery']);
export const PaymentMethod = z.enum(['card', 'on_site']);

/** Israeli mobile/landline, digits only after normalisation. */
const phone = z
  .string()
  .transform((s) => s.replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^0\d{8,9}$/, 'מספר טלפון לא תקין'));

/** What the browser sends for one cart line. Note: no prices – the server prices everything. */
export const CartLineInput = z.object({
  itemId: id,
  quantity: z.number().int().min(1).max(20),
  addOnIds: z.array(id).max(20).default([]),
  note: z.string().trim().max(200).default(''),
});
export type CartLineInput = z.infer<typeof CartLineInput>;

export const Address = z.object({
  street: z.string().trim().min(2).max(100),
  houseNumber: z.string().trim().max(10).default(''),
  apartment: z.string().trim().max(20).default(''),
  notes: z.string().trim().max(200).default(''),
});

export const CreateOrderRequest = z
  .object({
    /** Client-generated UUID so a double submit cannot create two orders. */
    idempotencyKey: z.string().uuid(),
    lines: z.array(CartLineInput).min(1).max(30),
    fulfillment: Fulfillment,
    paymentMethod: PaymentMethod,
    customer: z.object({
      name: z.string().trim().min(2).max(60),
      phone,
      email: z.string().trim().toLowerCase().email().max(120),
    }),
    address: Address.optional(),
    note: z.string().trim().max(300).default(''),
  })
  .strict()
  .refine((o) => o.fulfillment === 'pickup' || o.address !== undefined, {
    message: 'נדרשת כתובת למשלוח',
    path: ['address'],
  });
export type CreateOrderRequest = z.infer<typeof CreateOrderRequest>;
export type CreateOrderInput = z.input<typeof CreateOrderRequest>;

export const CreateOrderResponse = z.object({
  orderId: id,
  status: OrderStatus,
  totalAgorot: z.number().int(),
  /** Hosted payment page of the payment provider, when paymentMethod is "card". */
  paymentUrl: z.string().url().nullable(),
});
export type CreateOrderResponse = z.infer<typeof CreateOrderResponse>;

export const CancelOrderRequest = z.object({ orderId: id }).strict();
export type CancelOrderRequest = z.infer<typeof CancelOrderRequest>;

/** Priced line as stored on the order (snapshot at order time). */
export const PricedLine = z.object({
  itemId: id,
  name: z.string(),
  quantity: z.number().int(),
  unitPriceAgorot: z.number().int(),
  addOns: z.array(z.object({ id, name: z.string(), priceAgorot: z.number().int() })),
  note: z.string(),
  lineTotalAgorot: z.number().int(),
});
export type PricedLine = z.infer<typeof PricedLine>;

/** The fields of `orders/{id}` that the customer may read. */
export const OrderView = z.object({
  id,
  number: z.number().int(),
  status: OrderStatus,
  fulfillment: Fulfillment,
  paymentMethod: PaymentMethod,
  lines: z.array(PricedLine),
  subtotalAgorot: z.number().int(),
  deliveryFeeAgorot: z.number().int(),
  totalAgorot: z.number().int(),
  customerName: z.string(),
});
export type OrderView = z.infer<typeof OrderView>;
