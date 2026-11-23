import { describe, it, expect } from 'vitest';
import type { OrderView } from '@pizza-sosi/contracts';
import { orderConfirmationEmail, orderCancelledEmail, passwordResetEmail } from '../src/email/templates.js';

const order: OrderView = {
  id: 'abc123',
  number: 1042,
  status: 'placed',
  fulfillment: 'delivery',
  paymentMethod: 'card',
  customerName: 'דנה <script>alert(1)</script> כהן',
  lines: [
    {
      itemId: 'p1', name: 'פיצה משפחתית', quantity: 1, unitPriceAgorot: 7000, lineTotalAgorot: 7000, note: 'חתוכה ל-8 "בבקשה"',
      addOns: [{ id: 'o1', name: 'זיתים', priceAgorot: 600, coverage: 'right' }, { id: 'd2', name: 'עבה', priceAgorot: 500, coverage: null }],
    },
  ],
  subtotalAgorot: 7000,
  deliveryFeeAgorot: 1500,
  totalAgorot: 8500,
  readyAt: Date.UTC(2026, 10, 16, 18, 30),
  scheduled: false,
  statusHistory: [],
};

describe('email templates', () => {
  it('confirmation has the essentials and escapes customer text', () => {
    const e = orderConfirmationEmail(order, 'https://pizza-sosi.co.il');
    expect(e.subject).toContain('1042');
    expect(e.html).toContain('https://pizza-sosi.co.il/order/abc123');
    expect(e.html).toContain('זיתים (חצי ימין)');
    expect(e.html).toContain('dir="rtl"');
    expect(e.html).not.toContain('<script>');
    expect(e.html).toContain('&quot;בבקשה&quot;');
    expect(e.text).toContain('85');
  });
  it('cancellation mentions the refund only for card payments', () => {
    expect(orderCancelledEmail(order, 'https://x.test', true).html).toContain('יוחזר לכרטיס');
    expect(orderCancelledEmail(order, 'https://x.test', false).html).not.toContain('יוחזר לכרטיס');
  });
  it('password reset links to our page', () => {
    const e = passwordResetEmail('https://admin.pizza-sosi.co.il/auth/action?mode=resetPassword&oobCode=x', 'https://pizza-sosi.co.il');
    expect(e.html).toContain('https://admin.pizza-sosi.co.il/auth/action?mode=resetPassword&amp;oobCode=x');
  });
});
