import { timingSafeEqual } from 'node:crypto';
import { logger } from 'firebase-functions';
import { readSecret } from '../security/secrets.js';
import type { PaymentProvider } from './provider.js';

/**
 * Grow (Meshulam) "Light API". Hosted payment page: card data never reaches us.
 *  1. createPaymentProcess → a URL on Grow's site + processId/processToken (stored on the order)
 *  2. Grow POSTs the result to notifyUrl (our paymentWebhook). The post is matched to the order by
 *     processId + processToken (only Grow and we know the token), then confirmed with getPaymentProcessInfo
 *  3. approveTransaction acknowledges the notification (Grow keeps resending until it gets it)
 * Requests are form-data, server to server only. Credentials come from Secret Manager:
 * GROW_USER_ID, GROW_PAGE_CODE (card page). Production only – Grow has no test account for us.
 */
const BASE = process.env.GROW_BASE_URL ?? 'https://secure.meshulam.co.il/api/light/server/1.0';

interface Creds {
  userId: string;
  pageCode: string;
}

let credsCache: Promise<Creds | null> | null = null;
async function creds(): Promise<Creds | null> {
  credsCache ??= Promise.all([readSecret('GROW_USER_ID'), readSecret('GROW_PAGE_CODE')])
    .then(([userId, pageCode]) => (userId && pageCode ? { userId, pageCode } : null))
    .catch((e: Error) => {
      logger.warn('grow: credentials missing', { error: e.message });
      credsCache = null; // try again next time
      return null;
    });
  return credsCache;
}

type GrowResponse = { status?: number | string; err?: unknown; data?: Record<string, unknown> };

async function post(method: string, fields: Record<string, string>): Promise<Record<string, unknown>> {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(`${BASE}/${method}`, { method: 'POST', body: form, signal: AbortSignal.timeout(15_000) });
  const text = await res.text();
  let body: GrowResponse;
  try {
    body = JSON.parse(text) as GrowResponse;
  } catch {
    throw new Error(`grow ${method} ${res.status}: not json`);
  }
  if (!res.ok || String(body.status) !== '1') {
    const msg = typeof body.err === 'object' && body.err ? JSON.stringify(body.err) : String(body.err ?? '');
    throw new Error(`grow ${method} ${res.status}: ${msg.slice(0, 200)}`);
  }
  return body.data ?? {};
}

/** Shekels with two decimals, as Grow expects ("149.90"). */
export const growSum = (agorot: number) => (agorot / 100).toFixed(2);
export const agorotOf = (sum: unknown) => Math.round(Number(String(sum ?? '').replace(/,/g, '')) * 100);

/** Grow asks for a full name (two words). A single first name gets a neutral second word. */
export const growFullName = (name: string) => {
  const n = name.trim().replace(/\s+/g, ' ');
  return n.includes(' ') ? n : `${n} לקוח`;
};

/** Grow's callback arrives as form fields ("data[processId]") or JSON; read either into flat keys. */
export function flattenCallback(input: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (input && typeof input === 'object') {
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      const key = prefix ? `${prefix}[${k}]` : k;
      if (v && typeof v === 'object') Object.assign(out, flattenCallback(v, key));
      else out[key] = String(v ?? '');
    }
  }
  return out;
}
/** A field by its plain name, wherever Grow nested it: "processId", "data[processId]", "data[customFields][cField1]". */
export function field(f: Record<string, string>, name: string): string {
  if (f[name] !== undefined) return f[name]!;
  const hit = Object.keys(f).find((k) => k.endsWith(`[${name}]`));
  return hit ? f[hit]! : '';
}

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
};

export class GrowProvider implements PaymentProvider {
  readonly name = 'grow';

  async isConfigured() {
    return (await creds()) !== null;
  }

  async createPaymentPage(input: Parameters<PaymentProvider['createPaymentPage']>[0]) {
    const c = await creds();
    if (!c) throw new Error('grow not configured');
    const data = await post('createPaymentProcess', {
      userId: c.userId,
      pageCode: c.pageCode,
      sum: growSum(input.amountAgorot),
      paymentNum: '1',
      description: input.description,
      successUrl: input.successUrl,
      cancelUrl: input.cancelUrl,
      notifyUrl: input.notifyUrl,
      'pageField[fullName]': growFullName(input.customer.name),
      'pageField[phone]': input.customer.phone.replace(/\D/g, ''),
      ...(input.customer.email ? { 'pageField[email]': input.customer.email } : {}),
      cField1: input.orderId,
    });
    const url = String(data.url ?? '');
    const processId = String(data.processId ?? '');
    const processToken = String(data.processToken ?? '');
    // Only ever send the customer to Grow's own secure pages.
    if (!/^https:\/\/([a-z0-9-]+\.)*(meshulam\.co\.il|grow\.business|grow\.link)\//i.test(url) || !processId)
      throw new Error('grow createPaymentProcess: unexpected response');
    return { url, providerRef: processId, providerToken: processToken };
  }

  /**
   * The callback is trusted only if its processId + processToken match the ones stored on the order
   * (the caller passes the order's stored values). Returns the parsed fields, or null.
   */
  async verifyWebhook(fields: Record<string, string>, stored: { providerRef: string | null; providerToken: string | null }) {
    const processId = field(fields, 'processId');
    const processToken = field(fields, 'processToken');
    if (!stored.providerRef || !stored.providerToken) return null;
    if (!same(processId, stored.providerRef) || !same(processToken, stored.providerToken)) return null;
    return {
      providerRef: processId,
      status: field(fields, 'statusCode') === '2' ? ('approved' as const) : ('pending' as const),
      amountAgorot: agorotOf(field(fields, 'sum')),
      transactionId: field(fields, 'transactionId'),
      transactionToken: field(fields, 'transactionToken'),
      asmachta: field(fields, 'asmachta'),
      cardSuffix: field(fields, 'cardSuffix'),
    };
  }

  /** Ask Grow directly. Unknown answers come back as "unknown" so the caller can decide. */
  async getTransaction(processId: string, processToken: string) {
    const c = await creds();
    if (!c) throw new Error('grow not configured');
    try {
      const data = flattenCallback(await post('getPaymentProcessInfo', { pageCode: c.pageCode, processId, processToken }));
      const code = field(data, 'statusCode');
      return {
        status: code === '2' ? ('approved' as const) : code ? ('pending' as const) : ('unknown' as const),
        amountAgorot: agorotOf(field(data, 'sum')),
      };
    } catch (e) {
      logger.warn('grow getPaymentProcessInfo failed', { error: (e as Error).message });
      return { status: 'unknown' as const, amountAgorot: 0 };
    }
  }

  async approve(transactionId: string, transactionToken: string) {
    const c = await creds();
    if (!c) return;
    await post('approveTransaction', { pageCode: c.pageCode, transactionId, transactionToken });
  }

  async refund(t: { transactionId: string; transactionToken: string }, amountAgorot: number) {
    const c = await creds();
    if (!c) throw new Error('grow not configured');
    await post('refundTransaction', {
      userId: c.userId,
      pageCode: c.pageCode,
      transactionId: t.transactionId,
      transactionToken: t.transactionToken,
      refundSum: growSum(amountAgorot),
      stopDirectDebit: '0',
    });
  }
}
