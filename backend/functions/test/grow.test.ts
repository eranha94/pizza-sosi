import { describe, it, expect } from 'vitest';
import { GrowProvider, flattenCallback, field, growSum, agorotOf, growFullName } from '../src/payments/grow.js';

describe('Grow helpers', () => {
  it('formats sums both ways', () => {
    expect(growSum(14990)).toBe('149.90');
    expect(growSum(100)).toBe('1.00');
    expect(agorotOf('149.90')).toBe(14990);
    expect(agorotOf('1,234.5')).toBe(123450);
  });
  it('gives a single first name a second word', () => {
    expect(growFullName('דנה')).toBe('דנה לקוח');
    expect(growFullName('  דנה   כהן ')).toBe('דנה כהן');
  });
  it('reads fields from JSON and from form keys alike', () => {
    const json = flattenCallback({ status: '1', data: { processId: '77', customFields: { cField1: 'abc' } } });
    expect(field(json, 'processId')).toBe('77');
    expect(field(json, 'cField1')).toBe('abc');
    const form = { 'data[processId]': '77', 'data[customFields][cField1]': 'abc' };
    expect(field(form, 'processId')).toBe('77');
    expect(field(form, 'cField1')).toBe('abc');
    expect(field(form, 'missing')).toBe('');
  });
  it('parses a urlencoded callback body the way the webhook does', async () => {
    const body = new URLSearchParams({ 'data[processId]': '9', 'data[processToken]': 'tok', 'data[statusCode]': '2', 'data[sum]': '84.00', 'data[customFields][cField1]': 'order123' }).toString();
    const form = await new Response(body, { headers: { 'content-type': 'application/x-www-form-urlencoded' } }).formData();
    const f: Record<string, string> = {};
    for (const [k, v] of form.entries()) if (typeof v === 'string') f[k] = v;
    expect(field(f, 'cField1')).toBe('order123');
    expect(field(f, 'sum')).toBe('84.00');
  });
});

describe('Grow callback check', () => {
  const g = new GrowProvider();
  const fields = { 'data[processId]': '9', 'data[processToken]': 'secret-token', 'data[statusCode]': '2', 'data[sum]': '84.00', 'data[transactionId]': 't1', 'data[transactionToken]': 'tt' };
  it('accepts only the stored process id + token', async () => {
    expect(await g.verifyWebhook(fields, { providerRef: '9', providerToken: 'secret-token' })).toMatchObject({ status: 'approved', amountAgorot: 8400, transactionId: 't1' });
    expect(await g.verifyWebhook(fields, { providerRef: '9', providerToken: 'other' })).toBeNull();
    expect(await g.verifyWebhook(fields, { providerRef: '10', providerToken: 'secret-token' })).toBeNull();
    expect(await g.verifyWebhook(fields, { providerRef: null, providerToken: null })).toBeNull();
  });
  it('a not-paid status is not approved', async () => {
    expect(await g.verifyWebhook({ ...fields, 'data[statusCode]': '1' }, { providerRef: '9', providerToken: 'secret-token' })).toMatchObject({ status: 'pending' });
  });
});
