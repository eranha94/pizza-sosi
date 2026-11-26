import { describe, it, expect } from 'vitest';
import { isUnapprovedTemplate } from '../src/notify/whatsapp.js';
import type { MenuItem } from '@pizza-sosi/contracts';
import { priceCart, PricingError } from '../src/domain/pricing.js';
import { correctionTargets, canTransition, customerCanCancel, initialStatus } from '../src/domain/orderState.js';

const pizza: MenuItem = {
  id: 'p1', name: 'פיצה משפחתית', description: '', category: 'pizzas', priceAgorot: 5900,
  imagePath: null, order: 1, active: true, tags: [],
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
    const r = priceCart([{ itemId: 'p1', quantity: 2, addOns: [{ id: 'tuna', coverage: 'right' }], note: '' }], menu, 1500);
    expect(r.lines[0]!.unitPriceAgorot).toBe(5900 + 1300);
    expect(r.lines[0]!.addOns.find((a) => a.id === 'tuna')!.coverage).toBe('right');
    expect(r.subtotalAgorot).toBe(2 * 7200);
    expect(r.totalAgorot).toBe(2 * 7200 + 1500);
    const whole = priceCart([{ itemId: 'p1', quantity: 1, addOns: [{ id: 'tuna', coverage: 'whole' }], note: '' }], menu, 0);
    expect(whole.lines[0]!.unitPriceAgorot).toBe(5900 + 1800);
  });
  it('left and right halves both cost the half price', () => {
    const r = priceCart([{ itemId: 'p1', quantity: 1, addOns: [{ id: 'tuna', coverage: 'left' }], note: '' }], menu, 0);
    expect(r.lines[0]!.unitPriceAgorot).toBe(5900 + 1300);
    expect(r.lines[0]!.addOns.find((a) => a.id === 'tuna')!.coverage).toBe('left');
  });
  it('ignores halves on toppings with one price, and duplicates', () => {
    const r = priceCart([{ itemId: 'p1', quantity: 1, addOns: [{ id: 'gouda', coverage: 'left' }, { id: 'gouda', coverage: 'whole' }], note: '' }], menu, 0);
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
    expect(canTransition('placed', 'accepted', 'pickup')).toBe(true);
    expect(canTransition('accepted', 'preparing', 'pickup')).toBe(true);
    expect(canTransition('preparing', 'almost_ready', 'delivery')).toBe(true);
    expect(canTransition('completed', 'preparing', 'pickup')).toBe(false);
    expect(canTransition('pending_payment', 'ready', 'pickup')).toBe(false);
    expect(canTransition('placed', 'preparing', 'pickup')).toBe(false);
  });
  it('ready-for-pickup only for pickup, on-the-way only for delivery', () => {
    expect(canTransition('almost_ready', 'ready', 'pickup')).toBe(true);
    expect(canTransition('almost_ready', 'ready', 'delivery')).toBe(false);
    expect(canTransition('almost_ready', 'out_for_delivery', 'delivery')).toBe(true);
    expect(canTransition('almost_ready', 'out_for_delivery', 'pickup')).toBe(false);
  });
  it('customer can cancel only until preparing', () => {
    expect(customerCanCancel('placed')).toBe(true);
    expect(customerCanCancel('accepted')).toBe(true);
    expect(customerCanCancel('preparing')).toBe(false);
  });
  it('pressed by mistake: back only to earlier steps of the same flow', () => {
    expect(correctionTargets('preparing', 'pickup')).toEqual(['placed', 'accepted']);
    expect(correctionTargets('out_for_delivery', 'delivery')).toEqual(['placed', 'accepted', 'preparing', 'almost_ready']);
    expect(correctionTargets('completed', 'pickup')).toEqual(['placed', 'accepted', 'preparing', 'almost_ready', 'ready']);
    expect(correctionTargets('cancelled', 'delivery')).toContain('out_for_delivery');
    expect(correctionTargets('placed', 'pickup')).toEqual([]);
    expect(correctionTargets('pending_payment', 'pickup')).toEqual([]);
  });
  it('pay on site skips payment', () => {
    expect(initialStatus('on_site')).toBe('placed');
    expect(initialStatus('card')).toBe('pending_payment');
  });
});


describe('whatsapp numbers', async () => {
  const { toWhatsappNumber } = await import('../src/notify/whatsapp.js');
  it('converts Israeli mobiles and rejects landlines', () => {
    expect(toWhatsappNumber('052-587 6207')).toBe('972525876207');
    expect(toWhatsappNumber('972525876207')).toBe('972525876207');
    expect(toWhatsappNumber('04-8391234')).toBeNull();
  });
});

describe('first regular topping free', () => {
  const opt = (id: string, whole: number, half: number | null) => ({ id, name: id, wholeAgorot: whole, halfAgorot: half, active: true });
  const item = {
    id: 'pz', name: 'פיצה', description: '', category: 'pizzas', priceAgorot: 5000, imagePath: null, order: 1, active: true, tags: [],
    addOnGroups: [
      { id: 'reg', name: 'רגילות', order: 1, selection: 'multi', defaultOptionId: null, options: [opt('olive', 1000, 600), opt('corn', 1000, 600), opt('onion', 800, 500)] },
      { id: 'sp', name: 'מיוחדות', order: 2, selection: 'multi', defaultOptionId: null, options: [opt('tuna', 1300, 800)] },
    ],
  } as unknown as MenuItem;
  const m = new Map([[item.id, item]]);
  const price = (addOns: { id: string; coverage: 'whole' | 'right' | 'left' }[]) => priceCart([{ itemId: 'pz', quantity: 2, addOns, note: '' }], m, 0);

  it('one regular topping costs nothing', () => {
    expect(price([{ id: 'olive', coverage: 'whole' }]).lines[0]!.unitPriceAgorot).toBe(5000);
  });
  it('only the first is free; the dearest one is the free one', () => {
    const r = price([{ id: 'onion', coverage: 'whole' }, { id: 'corn', coverage: 'whole' }]);
    expect(r.lines[0]!.unitPriceAgorot).toBe(5800);
    expect(r.lines[0]!.addOns.find((a) => a.id === 'corn')!.priceAgorot).toBe(0);
    expect(r.totalAgorot).toBe(11600);
  });
  it('special toppings are never free', () => {
    expect(price([{ id: 'tuna', coverage: 'whole' }]).lines[0]!.unitPriceAgorot).toBe(6300);
  });
});

describe('screen board', async () => {
  const { boardFrom } = await import('../src/domain/screenBoard.js');
  const now = Date.now();
  it('lists pickup orders only, by status, without stale ones', () => {
    const b = boardFrom(
      [
        { number: 12, status: 'preparing', fulfillment: 'pickup', createdAtMs: now - 60_000 },
        { number: 9, status: 'accepted', fulfillment: 'pickup', createdAtMs: now - 60_000 },
        { number: 10, status: 'ready', fulfillment: 'pickup', createdAtMs: now - 60_000 },
        { number: 11, status: 'preparing', fulfillment: 'delivery', createdAtMs: now - 60_000 },
        { number: 3, status: 'ready', fulfillment: 'pickup', createdAtMs: now - 8 * 3600_000 },
      ],
      now,
    );
    expect(b).toEqual({ preparing: [9, 12], ready: [10] });
  });
});

describe('whatsapp provider config', async () => {
  const { parseWhatsappConfig, templatePayload } = await import('../src/notify/whatsapp.js');
  it('defaults to Meta with a phone number id', () => {
    expect(parseWhatsappConfig({ enabled: true, phoneNumberId: '123' })).toEqual({ provider: 'meta', phoneNumberId: '123', language: 'he' });
  });
  it('uses Telnyx with an Israeli mobile sender', () => {
    expect(parseWhatsappConfig({ enabled: true, provider: 'telnyx', from: '+972521234567' })).toEqual({ provider: 'telnyx', from: '+972521234567', language: 'he' });
    expect(parseWhatsappConfig({ enabled: true, provider: 'telnyx', from: '0521234567' })).toBeNull();
  });
  it('is off unless enabled', () => {
    expect(parseWhatsappConfig({ enabled: false, provider: 'telnyx', from: '+972521234567' })).toBeNull();
    expect(parseWhatsappConfig(undefined)).toBeNull();
  });
  it('builds the same template for both providers', () => {
    const t = templatePayload({ to: '972521234567', template: 'pizza_sosi_order_ready_pickup', language: 'he', bodyParams: ['דנה', '42'], buttonParam: 'abc' });
    expect(t.language).toEqual({ policy: 'deterministic', code: 'he' });
    expect(t.components[0]).toEqual({ type: 'body', parameters: [{ type: 'text', text: 'דנה' }, { type: 'text', text: '42' }] });
    expect(t.components[1]).toMatchObject({ type: 'button', sub_type: 'url', index: '0' });
  });
});

describe('busy mode', async () => {
  const { effectivePrep, deliveryOpen, activeBusy, UpdateStoreSettingsRequest } = await import('@pizza-sosi/contracts');
  const base = { weeklyHours: Array(7).fill({ open: '11:00', close: '23:00' }), acceptingOrders: true, prepMinutes: 25, deliveryEnabled: true } as never;
  const now = Date.UTC(2026, 10, 25, 12);
  it('adds the extra minutes only until it ends', () => {
    const s = { ...(base as object), busy: { until: now + 3600_000, extraMinutes: 20, pauseDelivery: true } } as never;
    expect(effectivePrep(s, now)).toBe(45);
    expect(effectivePrep(s, now + 2 * 3600_000)).toBe(25);
    expect(activeBusy(s, now + 2 * 3600_000)).toBeNull();
  });
  it('can pause delivery', () => {
    expect(deliveryOpen({ deliveryEnabled: true, busy: { until: now + 1000, extraMinutes: 10, pauseDelivery: true } }, now)).toBe(false);
    expect(deliveryOpen({ deliveryEnabled: true, busy: { until: now + 1000, extraMinutes: 10, pauseDelivery: false } }, now)).toBe(true);
    expect(deliveryOpen({ deliveryEnabled: true, busy: null }, now)).toBe(true);
  });
  it('saving one store setting does not reset the others (regression)', () => {
    expect(Object.keys(UpdateStoreSettingsRequest.parse({ prepMinutes: 30 }))).toEqual(['prepMinutes']);
  });
});

describe('deals, coupons, loyalty', async () => {
  const { applyDeals, couponDiscount, loyaltyDiscount, dealIsOn } = await import('@pizza-sosi/contracts');
  const { addStamp } = await import('../src/api/loyalty.js');
  const prices: Record<string, number> = { pizza: 6000, cola: 1200, fries: 1500 };
  const base = (id: string) => prices[id];
  const deal = (id: string, comps: [string, number][], price: number) => ({ id, title: id, components: comps.map(([itemId, quantity]) => ({ itemId, quantity })), priceAgorot: price, active: true, weekdays: [], validFrom: null, validTo: null });

  it('applies a combo automatically, as many times as the cart allows', () => {
    const d = deal('meal', [['pizza', 1], ['cola', 2]], 7000); // regular 84 → 70
    expect(applyDeals([{ itemId: 'pizza', quantity: 2 }, { itemId: 'cola', quantity: 4 }], [d], base)).toEqual([{ kind: 'deal', label: 'meal ×2', amountAgorot: 2800 }]);
    expect(applyDeals([{ itemId: 'pizza', quantity: 1 }, { itemId: 'cola', quantity: 1 }], [d], base)).toEqual([]);
  });
  it('picks the deal that saves more first and never uses an item twice', () => {
    const small = deal('small', [['pizza', 1], ['cola', 1]], 6800); // saves 4
    const big = deal('big', [['pizza', 1], ['fries', 1]], 6000); // saves 15
    const out = applyDeals([{ itemId: 'pizza', quantity: 1 }, { itemId: 'cola', quantity: 1 }, { itemId: 'fries', quantity: 1 }], [small, big], base);
    expect(out.map((d) => d.label)).toEqual(['big']);
  });
  it('ignores a "deal" that costs more than the items', () => {
    expect(applyDeals([{ itemId: 'cola', quantity: 1 }], [deal('bad', [['cola', 1]], 2000)], base)).toEqual([]);
  });
  it('respects weekdays and dates', () => {
    const d = { ...deal('thu', [['pizza', 1]], 5000), weekdays: [4], validTo: '2026-12-31' };
    expect(dealIsOn(d, '2026-11-26', 4)).toBe(true);
    expect(dealIsOn(d, '2026-11-25', 3)).toBe(false);
    expect(dealIsOn(d, '2027-01-07', 4)).toBe(false);
  });
  it('coupon: percent, amount, minimum, never below zero', () => {
    expect(couponDiscount({ type: 'percent', value: 10, minOrderAgorot: 0 }, 8450)).toEqual({ amountAgorot: 845 });
    expect(couponDiscount({ type: 'amount', value: 5000, minOrderAgorot: 0 }, 3000)).toEqual({ amountAgorot: 3000 });
    expect(couponDiscount({ type: 'amount', value: 1000, minOrderAgorot: 5000 }, 4000)).toHaveProperty('error');
  });
  it('loyalty: free item is the priciest of the category, capped; needs one in the cart', () => {
    const lines = [
      { itemId: 'p1', quantity: 1, category: 'pizzas', basePriceAgorot: 5500 },
      { itemId: 'p2', quantity: 1, category: 'pizzas', basePriceAgorot: 7000 },
      { itemId: 'c', quantity: 1, category: 'drinks', basePriceAgorot: 1200 },
    ];
    expect(loyaltyDiscount({ type: 'item', category: 'pizzas', maxAgorot: 0 }, lines, 13700)).toEqual({ amountAgorot: 7000 });
    expect(loyaltyDiscount({ type: 'item', category: 'pizzas', maxAgorot: 6000 }, lines, 13700)).toEqual({ amountAgorot: 6000 });
    expect(loyaltyDiscount({ type: 'item', category: 'burgers', maxAgorot: 0 }, lines, 13700)).toHaveProperty('error');
    expect(loyaltyDiscount({ type: 'percent', percent: 20 }, lines, 10000)).toEqual({ amountAgorot: 2000 });
  });
  it('a full card turns into a reward and starts over', () => {
    expect(addStamp(0, 10)).toEqual({ stamps: 1, earned: false });
    expect(addStamp(9, 10)).toEqual({ stamps: 0, earned: true });
  });
});

describe('WhatsApp template payload', async () => {
  const { templatePayload } = await import('../src/notify/whatsapp.js');
  const m = { to: '972521234567', template: 't', language: 'he', bodyParams: ['דנה', '1042'], buttonParam: 'abc' };
  it('button index: string for Meta, number for Telnyx', () => {
    expect((templatePayload(m).components[1] as { index: unknown }).index).toBe('0');
    expect((templatePayload(m, true).components[1] as { index: unknown }).index).toBe(0);
  });
});

describe('WhatsApp template version', async () => {
  const { parseWhatsappConfig } = await import('../src/notify/whatsapp.js');
  it('takes a template suffix like _v2 and ignores anything else', () => {
    const base = { enabled: true, provider: 'telnyx', from: '+972537998889' };
    expect(parseWhatsappConfig({ ...base, templateSuffix: '_v2' })).toMatchObject({ templateSuffix: '_v2' });
    expect(parseWhatsappConfig({ ...base, templateSuffix: 'x; drop' })).not.toHaveProperty('templateSuffix');
  });
});

describe('whatsapp template fallback', () => {
  it('recognises an unapproved template error', () => {
    expect(isUnapprovedTemplate(new Error('whatsapp 400 10015 Bad Request template_id is not approved'))).toBe(true);
    expect(isUnapprovedTemplate(new Error('whatsapp 400 10004 Invalid source number'))).toBe(false);
  });
});
