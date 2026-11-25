import { logger } from 'firebase-functions';
import { readSecret } from '../security/secrets.js';
import type { PaymentProvider, PaymentResult } from './provider.js';

/**
 * Cardcom REST API v11, "Low Profile" hosted payment page: card data never reaches us.
 *  1. LowProfile/Create → a page on Cardcom's site + LowProfileId (stored on the order)
 *  2. Cardcom POSTs to our WebHookUrl when the payment ends. Nothing in that post is trusted:
 *     we only take the LowProfileId from it and ask Cardcom (LowProfile/GetLpResult) for the result
 *  3. Refunds: Transactions/RefundByTransactionId (needs the API password)
 * The receipt (Document) is issued and emailed by Cardcom with the payment.
 * JSON over HTTPS. Credentials only from Secret Manager: CARDCOM_TERMINAL, CARDCOM_API_NAME,
 * CARDCOM_API_PASSWORD (refunds only). Cardcom's test terminal (1000) works on the same URL.
 */
const BASE = 'https://secure.cardcom.solutions/api/v11';

interface Creds {
  terminal: number;
  apiName: string;
}
let credsCache: Promise<Creds | null> | null = null;
async function creds(): Promise<Creds | null> {
  credsCache ??= Promise.all([readSecret('CARDCOM_TERMINAL'), readSecret('CARDCOM_API_NAME')])
    .then(([t, apiName]) => (Number(t) > 0 && apiName ? { terminal: Number(t), apiName } : null))
    .catch((e: Error) => {
      logger.warn('cardcom: credentials missing', { error: e.message });
      credsCache = null;
      return null;
    });
  return credsCache;
}

async function post(path: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`cardcom ${path} ${res.status}: not json`);
  }
  if (!res.ok) throw new Error(`cardcom ${path} ${res.status}: ${String(data.Description ?? '').slice(0, 200)}`);
  return data;
}

/** Case-insensitive field lookup, also one level down (e.g. TranzactionInfo.Amount). */
export function pick(obj: unknown, ...names: string[]): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  const entries = Object.entries(obj as Record<string, unknown>);
  for (const n of names) {
    const hit = entries.find(([k]) => k.toLowerCase() === n.toLowerCase());
    if (hit && hit[1] !== undefined && hit[1] !== null && hit[1] !== '') return hit[1];
  }
  return undefined;
}

export const shekels = (agorot: number) => Math.round(agorot) / 100;
export const toAgorot = (v: unknown) => Math.round(Number(v ?? NaN) * 100);

/** A GetLpResult answer → our result. Exported for tests. */
export function readLpResult(d: Record<string, unknown>): PaymentResult {
  const info = pick(d, 'TranzactionInfo', 'TransactionInfo') as Record<string, unknown> | undefined;
  const code = Number(pick(d, 'ResponseCode'));
  const tranId = String(pick(d, 'TranzactionId', 'TransactionId') ?? pick(info, 'TranzactionId', 'TransactionId') ?? '');
  const infoCode = info ? Number(pick(info, 'ResponseCode') ?? 0) : 0;
  const approved = code === 0 && infoCode === 0 && Number(tranId) > 0;
  const last4 = String(pick(info, 'Last4CardDigitsString', 'Last4CardDigits', 'Last4Digits') ?? '').replace(/\D/g, '').slice(-4).padStart(4, '0');
  return {
    status: approved ? 'approved' : code === 0 ? 'pending' : 'declined',
    amountAgorot: toAgorot(pick(info, 'Amount') ?? pick(d, 'Amount')),
    orderId: String(pick(d, 'ReturnValue') ?? ''),
    transactionId: tranId,
    cardSuffix: last4 === '0000' ? '' : last4,
    approvalNumber: String(pick(info, 'ApprovalNumber') ?? ''),
  };
}

export class CardcomProvider implements PaymentProvider {
  readonly name = 'cardcom';

  async isConfigured() {
    return (await creds()) !== null;
  }

  async createPaymentPage(input: Parameters<PaymentProvider['createPaymentPage']>[0]) {
    const c = await creds();
    if (!c) throw new Error('cardcom not configured');
    const d = await post('LowProfile/Create', {
      TerminalNumber: c.terminal,
      ApiName: c.apiName,
      Operation: 'ChargeOnly',
      ReturnValue: input.orderId,
      Amount: shekels(input.amountAgorot),
      ISOCoinId: 1,
      Language: 'he',
      ProductName: input.description.slice(0, 50),
      SuccessRedirectUrl: input.successUrl,
      FailedRedirectUrl: input.cancelUrl,
      WebHookUrl: input.notifyUrl,
      // חשבונית מס/קבלה (the pizzeria is a licensed dealer), issued by Cardcom when the payment
      // succeeds and emailed to the customer. Prices include VAT, as on the menu.
      Document: {
        DocumentTypeToCreate: 'TaxInvoiceAndReceipt',
        Name: input.customer.name,
        ...(input.customer.email ? { Email: input.customer.email, IsSendByEmail: true } : { IsSendByEmail: false }),
        Products: input.receiptLines.map((l) => ({ Description: l.description.slice(0, 250), Quantity: l.quantity, UnitCost: shekels(l.unitAgorot) })),
      },
      UIDefinition: {
        CardOwnerNameValue: input.customer.name,
        CardOwnerPhoneValue: input.customer.phone.replace(/\D/g, ''),
        ...(input.customer.email ? { CardOwnerEmailValue: input.customer.email } : {}),
        IsHideCardOwnerPhone: false,
      },
    });
    const url = String(pick(d, 'Url') ?? '');
    const lowProfileId = String(pick(d, 'LowProfileId', 'LowProfileCode') ?? '');
    if (Number(pick(d, 'ResponseCode')) !== 0) throw new Error(`cardcom create: ${String(pick(d, 'Description') ?? '').slice(0, 200)}`);
    // Only ever send the customer to Cardcom's own secure pages.
    if (!/^https:\/\/([a-z0-9-]+\.)*cardcom\.(solutions|co\.il)\//i.test(url) || !lowProfileId) throw new Error('cardcom create: unexpected response');
    return { url, providerRef: lowProfileId };
  }

  /** Which payment the notification is about. Nothing else in it is used. */
  refFromNotification(fields: Record<string, unknown>) {
    const ref = String(pick(fields, 'LowProfileId', 'LowProfileCode', 'lowprofilecode') ?? '');
    const orderId = String(pick(fields, 'ReturnValue', 'returnvalue') ?? '');
    return ref ? { providerRef: ref, orderId } : null;
  }

  async getResult(providerRef: string): Promise<PaymentResult> {
    const c = await creds();
    if (!c) throw new Error('cardcom not configured');
    return readLpResult(await post('LowProfile/GetLpResult', { TerminalNumber: c.terminal, ApiName: c.apiName, LowProfileId: providerRef }));
  }

  async refund(r: { transactionId: string }, amountAgorot: number, full: boolean) {
    const c = await creds();
    if (!c) throw new Error('cardcom not configured');
    const password = await readSecret('CARDCOM_API_PASSWORD');
    const d = await post('Transactions/RefundByTransactionId', {
      ApiName: c.apiName,
      ApiPassword: password,
      TransactionId: Number(r.transactionId),
      ...(full ? {} : { PartialSum: shekels(amountAgorot) }),
    });
    if (Number(pick(d, 'ResponseCode')) !== 0) throw new Error(`cardcom refund: ${String(pick(d, 'Description') ?? '').slice(0, 200)}`);
  }
}
