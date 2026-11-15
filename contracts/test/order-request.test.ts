import { describe, it, expect } from 'vitest';
import { CreateOrderRequest } from '../src/index.js';

const base = {
  idempotencyKey: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  lines: [{ itemId: 'abc', quantity: 1, addOns: [{ id: 'd0144c78f71a38f2', coverage: 'whole' }], note: '' }],
  fulfillment: 'pickup',
  paymentMethod: 'on_site',
  customer: { name: 'ערן', phone: '052-587 6207', email: 'Someone@Example.com' },
  note: 'תן בראש',
  when: 'asap',
};

/** What the Firebase callable SDK actually sends: JSON, with `undefined` turned into `null`. */
const overTheWire = (x: unknown) => JSON.parse(JSON.stringify(x, (_k, v) => (v === undefined ? null : v)));

describe('CreateOrderRequest', () => {
  it('accepts a pickup order after a round trip through the callable encoding', () => {
    const parsed = CreateOrderRequest.parse({ ...base, address: undefined });
    const r = CreateOrderRequest.safeParse(overTheWire(parsed));
    expect(r.success, JSON.stringify(r.error?.issues)).toBe(true);
  });
  it('still requires an address for delivery', () => {
    expect(CreateOrderRequest.safeParse({ ...base, fulfillment: 'delivery', address: null }).success).toBe(false);
  });
});
