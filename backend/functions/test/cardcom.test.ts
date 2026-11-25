import { describe, it, expect } from 'vitest';
import { CardcomProvider, readLpResult, pick, shekels, toAgorot } from '../src/payments/cardcom.js';

describe('Cardcom', () => {
  it('converts amounts', () => {
    expect(shekels(8450)).toBe(84.5);
    expect(toAgorot(84.5)).toBe(8450);
    expect(toAgorot('10.99')).toBe(1099);
  });
  it('finds fields regardless of case', () => {
    expect(pick({ lowprofileid: 'a' }, 'LowProfileId')).toBe('a');
    expect(pick({ ReturnValue: '' }, 'ReturnValue')).toBeUndefined();
  });
  it('reads a paid GetLpResult', () => {
    const r = readLpResult({
      ResponseCode: 0,
      ReturnValue: 'order123',
      TranzactionId: 219282004,
      TranzactionInfo: { ResponseCode: 0, Amount: 84.5, Last4CardDigitsString: '0001', ApprovalNumber: '0123456' },
    });
    expect(r).toEqual({ status: 'approved', amountAgorot: 8450, orderId: 'order123', transactionId: '219282004', cardSuffix: '0001', approvalNumber: '0123456' });
  });
  it('a page that was opened but not paid is not approved', () => {
    expect(readLpResult({ ResponseCode: 0, ReturnValue: 'o', TranzactionId: 0 }).status).toBe('pending');
    expect(readLpResult({ ResponseCode: 700, ReturnValue: 'o' }).status).toBe('declined');
    expect(readLpResult({ ResponseCode: 0, TranzactionId: 5, TranzactionInfo: { ResponseCode: 33, Amount: 10 } }).status).toBe('pending');
  });
  it('takes only the payment id and order id from a notification', () => {
    const p = new CardcomProvider();
    expect(p.refFromNotification({ LowProfileId: 'lp-1', ReturnValue: 'order123', ResponseCode: 0, Amount: 1 })).toEqual({ providerRef: 'lp-1', orderId: 'order123' });
    expect(p.refFromNotification({ ResponseCode: 0 })).toBeNull();
  });
});
