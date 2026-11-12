import { describe, it, expect } from 'vitest';
import { CreateOrderRequest, formatAgorot } from '../src/index.js';

const base = {
  idempotencyKey: crypto.randomUUID(),
  lines: [{ itemId: 'p1', quantity: 1 }],
  fulfillment: 'pickup',
  paymentMethod: 'on_site',
  customer: { name: 'ערן', phone: '054-888 0909', email: 'Test@Example.com' },
};

describe('CreateOrderRequest', () => {
  it('normalises phone and email', () => {
    const r = CreateOrderRequest.parse(base);
    expect(r.customer.phone).toBe('0548880909');
    expect(r.customer.email).toBe('test@example.com');
  });
  it('rejects prices or unknown fields sent by the browser', () => {
    expect(() => CreateOrderRequest.parse({ ...base, totalAgorot: 1 })).toThrow();
  });
  it('requires an address for delivery', () => {
    expect(() => CreateOrderRequest.parse({ ...base, fulfillment: 'delivery' })).toThrow();
  });
  it('limits quantities', () => {
    expect(() => CreateOrderRequest.parse({ ...base, lines: [{ itemId: 'p1', quantity: 999 }] })).toThrow();
  });
});

describe('formatAgorot', () => {
  it('formats shekels', () => expect(formatAgorot(5900)).toContain('59'));
});
