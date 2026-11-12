import type { OrderStatus } from '@pizza-sosi/contracts';

/** Allowed status transitions. Anything not listed is rejected by the server. */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_payment: ['paid', 'cancelled'],
  paid: ['accepted', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'completed'],
  out_for_delivery: ['completed'],
  completed: [],
  cancelled: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** A customer may cancel only until the kitchen starts preparing. */
export function customerCanCancel(status: OrderStatus): boolean {
  return status === 'pending_payment' || status === 'paid' || status === 'accepted';
}

/** Status a new order starts in. Pay-on-site orders skip the payment step. */
export function initialStatus(paymentMethod: 'card' | 'on_site'): OrderStatus {
  return paymentMethod === 'card' ? 'pending_payment' : 'accepted';
}
