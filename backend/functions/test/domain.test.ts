import { describe, it, expect } from 'vitest';
import type { MenuItem } from '@pizza-sosi/contracts';
import { priceCart, PricingError } from '../src/domain/pricing.js';
import { canTransition, customerCanCancel, initialStatus } from '../src/domain/orderState.js';
import { isOpen } from '../src/domain/hours.js';

const pizza: MenuItem = {
  id: 'p1', name: 'פיצה משפחתית', description: '', category: 'pizzas', priceAgorot: 5900,
  imagePath: null, order: 1, active: true,
  addOnGroups: [
    {
      id: 'dough', name: 'עובי בצק', order: 0, selection: 'single', defaultOptionId: 'std',
      options: [
        { id: 'std', name: 'סטנדרט', wholeAgorot: 0, halfAgorot: null, active: true },
        { id: 'thin', name: 'דק', wholeAgorot: 0, halfAgorot: null, active: true },
      ],
    },
    {
      id: 'g1', name: 'מיוחדות', order: 1, selection: 'multi', defaultOptionId: null,
      options: [
        { id: 'tuna', name: 'טונה', wholeAgorot: 1800, halfAgorot: 1300, active: true },
        { id: 'pine', name: 'אננס', wholeAgorot: 1800, halfAgorot: 1300, active: false },
      ],
    },
    { id: 'g2', name: 'תוספות', order: 2, selection: 'multi', defaultOptionId: null, options: [{ id: 'gouda', name: 'גאודה', wholeAgorot: 600, halfAgorot: null, active: true }] },
  ],
};
const menu = new Map([[pizza.id, pizza]]);

describe('priceCart', () => {
  it('charges each topping by coverage: whole or half', () => {
    const r = priceCart([{ itemId: 'p1', quantity: 2, addOns: [{ id: 'tuna', coverage: 'half' }], note: '' }], menu, 1500);
    expect(r.lines[0]!.unitPriceAgorot).toBe(5900 + 1300);
    expect(r.lines[0]!.addOns.find((a) => a.id === 'tuna')!.coverage).toBe('half');
    expect(r.subtotalAgorot).toBe(2 * 7200);
    expect(r.totalAgorot).toBe(2 * 7200 + 1500);
    const whole = priceCart([{ itemId: 'p1', quantity: 1, addOns: [{ id: 'tuna', coverage: 'whole' }], note: '' }], menu, 0);
    expect(whole.lines[0]!.unitPriceAgorot).toBe(5900 + 1800);
  });
  it('ignores "half" on toppings with one price, and duplicates', () => {
    const r = priceCart([{ itemId: 'p1', quantity: 1, addOns: [{ id: 'gouda', coverage: 'half' }, { id: 'gouda', coverage: 'whole' }], note: '' }], menu, 0);
    expect(r.lines[0]!.unitPriceAgorot).toBe(5900 + 600);
    const gouda = r.lines[0]!.addOns.filter((a) => a.id === 'gouda');
    expect(gouda).toHaveLength(1);
    expect(gouda[0]!.coverage).toBeNull();
  });
  it('single-choice groups: default when not sent, chosen when sent, never two', () => {
    const d = priceCart([{ itemId: 'p1', quantity: 1, addOns: [], note: '' }], menu, 0);
    expect(d.lines[0]!.addOns.map((a) => a.name)).toEqual(['סטנדרט']);
    const t = priceCart([{ itemId: 'p1', quantity: 1, addOns: [{ id: 'thin', coverage: 'whole' }], note: '' }], menu, 0);
    expect(t.lines[0]!.addOns.map((a) => a.name)).toEqual(['דק']);
    expect(() => priceCart([{ itemId: 'p1', quantity: 1, addOns: [{ id: 'thin', coverage: 'whole' }, { id: 'std', coverage: 'whole' }], note: '' }], menu, 0)).toThrow(PricingError);
  });
  it('rejects unknown items and inactive toppings', () => {
    expect(() => priceCart([{ itemId: 'nope', quantity: 1, addOns: [], note: '' }], menu, 0)).toThrow(PricingError);
    expect(() => priceCart([{ itemId: 'p1', quantity: 1, addOns: [{ id: 'pine', coverage: 'whole' }], note: '' }], menu, 0)).toThrow(PricingError);
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
