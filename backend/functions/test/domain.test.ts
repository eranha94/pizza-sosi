import { describe, it, expect } from 'vitest';
import type { MenuItem } from '@pizza-sosi/contracts';
import { priceCart, PricingError } from '../src/domain/pricing.js';
import { canTransition, customerCanCancel, initialStatus } from '../src/domain/orderState.js';
import { isOpen } from '../src/domain/hours.js';

const pizza: MenuItem = {
  id: 'p1', name: 'פיצה משפחתית', description: '', category: 'pizzas', priceAgorot: 5900,
  imagePath: null, order: 1, active: true,
  addOns: [
    { id: 'a1', name: 'זיתים', priceAgorot: 500, active: true, order: 1 },
    { id: 'a2', name: 'טונה', priceAgorot: 800, active: false, order: 2 },
  ],
};
const menu = new Map([[pizza.id, pizza]]);

describe('priceCart', () => {
  it('prices from the menu and add-ons, ignoring duplicates', () => {
    const r = priceCart([{ itemId: 'p1', quantity: 2, addOnIds: ['a1', 'a1'], note: '' }], menu, 1500);
    expect(r.lines[0]!.unitPriceAgorot).toBe(6400);
    expect(r.subtotalAgorot).toBe(12800);
    expect(r.totalAgorot).toBe(14300);
  });
  it('rejects unknown items and inactive add-ons', () => {
    expect(() => priceCart([{ itemId: 'nope', quantity: 1, addOnIds: [], note: '' }], menu, 0)).toThrow(PricingError);
    expect(() => priceCart([{ itemId: 'p1', quantity: 1, addOnIds: ['a2'], note: '' }], menu, 0)).toThrow(PricingError);
  });
  it('rejects an empty cart', () => {
    expect(() => priceCart([], menu, 0)).toThrow(PricingError);
  });
});

describe('order state', () => {
  it('only allows defined transitions', () => {
    expect(canTransition('accepted', 'preparing')).toBe(true);
    expect(canTransition('completed', 'preparing')).toBe(false);
    expect(canTransition('pending_payment', 'ready')).toBe(false);
  });
  it('customer can cancel only until preparing', () => {
    expect(customerCanCancel('accepted')).toBe(true);
    expect(customerCanCancel('preparing')).toBe(false);
  });
  it('pay on site skips payment', () => {
    expect(initialStatus('on_site')).toBe('accepted');
    expect(initialStatus('card')).toBe('pending_payment');
  });
});

describe('isOpen (Asia/Jerusalem)', () => {
  const s = { opensAt: '11:00', closesAt: '00:00', acceptingOrders: true };
  // 2026-11-12 is winter time, UTC+2
  it('open in the evening', () => expect(isOpen(s, new Date('2026-11-12T20:30:00Z'))).toBe(true)); // 22:30
  it('closed after midnight', () => expect(isOpen(s, new Date('2026-11-12T22:30:00Z'))).toBe(false)); // 00:30
  it('closed in the morning', () => expect(isOpen(s, new Date('2026-11-12T07:00:00Z'))).toBe(false)); // 09:00
  it('handles closing after midnight', () =>
    expect(isOpen({ ...s, closesAt: '01:30' }, new Date('2026-11-12T23:00:00Z'))).toBe(true)); // 01:00
  it('manual switch closes', () => expect(isOpen({ ...s, acceptingOrders: false }, new Date('2026-11-12T18:00:00Z'))).toBe(false));
});
