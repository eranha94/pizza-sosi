import { logger } from 'firebase-functions';
import type { NotifyStatus } from '@pizza-sosi/contracts';
import { db, COL } from '../firebase.js';
import { readSecret } from '../security/secrets.js';

/**
 * WhatsApp Business Platform (Cloud API) – order status updates to customers who opted in.
 *
 * Two ways to send, chosen in `settings/whatsapp` (server-only, closed in firestore.rules):
 *   - provider 'meta' (default): Meta Cloud API directly – { enabled, phoneNumberId, language },
 *     token in Secret Manager as WHATSAPP_TOKEN. Templates: scripts/whatsapp-setup.mjs.
 *   - provider 'telnyx': through Telnyx, which lets the pizzeria's existing WhatsApp Business app number
 *     send API messages too ("coexistence") – { enabled, provider: 'telnyx', from: '+9725…', language },
 *     API key in Secret Manager as TELNYX_API_KEY. Templates: scripts/telnyx-whatsapp-setup.mjs.
 * Secrets are read at runtime, so they never touch the repo, the browser or Firestore.
 */
export const TEMPLATE_BY_STATUS: Record<NotifyStatus, string> = {
  accepted: 'pizza_sosi_order_accepted',
  preparing: 'pizza_sosi_order_preparing',
  almost_ready: 'pizza_sosi_order_almost_ready',
  ready: 'pizza_sosi_order_ready_pickup',
  out_for_delivery: 'pizza_sosi_order_on_the_way',
  cancelled: 'pizza_sosi_order_cancelled',
};

/** Apology after a status was pressed by mistake. {{1}} first name, {{2}} order number, {{3}} where the order really is. */
export const CORRECTION_TEMPLATE = 'pizza_sosi_order_status_corrected';
/** Loyalty card after a completed order. {{1}} name, {{2}} stamps, {{3}} required, {{4}} to go, {{5}} reward. */
export const LOYALTY_PROGRESS_TEMPLATE = 'pizza_sosi_loyalty_progress';
/** Card full. {{1}} name, {{2}} reward. */
export const LOYALTY_REWARD_TEMPLATE = 'pizza_sosi_loyalty_reward';

const GRAPH = 'https://graph.facebook.com/v25.0';
const TELNYX = 'https://api.telnyx.com/v2';

export type WhatsappConfig =
  | { provider: 'meta'; phoneNumberId: string; language: string }
  | { provider: 'telnyx'; from: string; language: string };

/** Pure part (tested): which way to send, or null when WhatsApp isn't set up. */
export function parseWhatsappConfig(d: Record<string, unknown> | undefined): WhatsappConfig | null {
  if (!d?.enabled) return null;
  const language = typeof d.language === 'string' ? d.language : 'he';
  if (d.provider === 'telnyx') {
    return typeof d.from === 'string' && /^\+9725\d{8}$/.test(d.from) ? { provider: 'telnyx', from: d.from, language } : null;
  }
  return typeof d.phoneNumberId === 'string' && /^\d+$/.test(d.phoneNumberId) ? { provider: 'meta', phoneNumberId: d.phoneNumberId, language } : null;
}

export async function loadWhatsappConfig(): Promise<WhatsappConfig | null> {
  return parseWhatsappConfig((await db.collection(COL.settings).doc('whatsapp').get()).data());
}

/** Israeli number as WhatsApp wants it: 0521234567 → 972521234567. */
export function toWhatsappNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (/^05\d{8}$/.test(digits)) return `972${digits.slice(1)}`;
  if (/^9725\d{8}$/.test(digits)) return digits;
  return null; // landlines can't receive WhatsApp
}

export interface TemplateMessage {
  to: string;
  template: string;
  language: string;
  bodyParams: string[];
  /** Dynamic part of the URL button (the order id). */
  buttonParam: string;
}

/** The template part of the request – identical for Meta and Telnyx (Telnyx passes it through to Meta). */
export function templatePayload(m: TemplateMessage) {
  return {
    name: m.template,
    language: { policy: 'deterministic', code: m.language },
    components: [
      { type: 'body', parameters: m.bodyParams.map((text) => ({ type: 'text', text })) },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: m.buttonParam }] },
    ],
  };
}

/** Sends one approved template message. Returns the message id. Errors read "whatsapp <http status> <provider code> …". */
export async function sendTemplate(cfg: WhatsappConfig, m: TemplateMessage): Promise<string> {
  return cfg.provider === 'telnyx' ? sendViaTelnyx(cfg, m) : sendViaMeta(cfg, m);
}

async function sendViaMeta(cfg: Extract<WhatsappConfig, { provider: 'meta' }>, m: TemplateMessage): Promise<string> {
  const token = await readSecret('WHATSAPP_TOKEN');
  const res = await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: m.to, type: 'template', template: templatePayload(m) }),
  });
  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
  if (!res.ok || !json.messages?.[0]?.id) {
    logger.warn('whatsapp send failed', { provider: 'meta', status: res.status, code: json.error?.code, template: m.template });
    throw new Error(`whatsapp ${res.status} ${json.error?.code ?? ''} ${json.error?.message ?? ''}`.trim());
  }
  return json.messages[0].id;
}

async function sendViaTelnyx(cfg: Extract<WhatsappConfig, { provider: 'telnyx' }>, m: TemplateMessage): Promise<string> {
  const key = await readSecret('TELNYX_API_KEY');
  const res = await fetch(`${TELNYX}/messages/whatsapp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: cfg.from, to: `+${m.to}`, whatsapp_message: { type: 'template', template: templatePayload(m) } }),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: { id?: string }; errors?: { code?: string | number; title?: string; detail?: string }[] };
  const err = json.errors?.[0];
  if (!res.ok || !json.data?.id) {
    logger.warn('whatsapp send failed', { provider: 'telnyx', status: res.status, code: err?.code, template: m.template });
    throw new Error(`whatsapp ${res.status} ${err?.code ?? ''} ${err?.detail ?? err?.title ?? ''}`.trim());
  }
  return json.data.id;
}
