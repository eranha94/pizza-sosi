import { ORDER_STEPS, type OrderStatus } from '@pizza-sosi/contracts';

type Fulfillment = 'pickup' | 'delivery';

/** Allowed status transitions. Anything not listed is rejected by the server. */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ['placed', 'cancelled'],
  placed: ['accepted', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  // "almost ready" may be skipped when things move fast
  preparing: ['almost_ready', 'ready', 'out_for_delivery', 'cancelled'],
  almost_ready: ['ready', 'out_for_delivery', 'cancelled'],
  ready: ['completed'],
  out_for_delivery: ['completed'],
  completed: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus, fulfillment: Fulfillment): boolean {
  if (!TRANSITIONS[from].includes(to)) return false;
  // "Ready for pickup" only for pickup orders, "on the way" only for deliveries.
  if (to === 'ready' && fulfillment !== 'pickup') return false;
  if (to === 'out_for_delivery' && fulfillment !== 'delivery') return false;
  return true;
}

/** A customer may cancel only until the kitchen starts preparing. */
export function customerCanCancel(status: OrderStatus): boolean {
  return status === 'pending_payment' || status === 'placed' || status === 'accepted';
}

/** Status a new order starts in. Pay-on-site orders skip the payment step. */
export function initialStatus(paymentMethod: 'card' | 'on_site'): OrderStatus {
  return paymentMethod === 'card' ? 'pending_payment' : 'placed';
}

/**
 * "Pressed by mistake": the earlier steps an order can be put back to.
 * From completed/cancelled any step of its flow; otherwise only steps before the current one.
 */
export function correctionTargets(from: OrderStatus, fulfillment: Fulfillment): OrderStatus[] {
  const steps = ORDER_STEPS[fulfillment] as readonly OrderStatus[];
  if (from === 'completed' || from === 'cancelled') return [...steps];
  const i = steps.indexOf(from);
  return i > 0 ? steps.slice(0, i) : [];
}
