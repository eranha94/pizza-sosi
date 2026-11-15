import { logger } from 'firebase-functions';
import type { NotifyStatus } from '@pizza-sosi/contracts';
import { db, COL } from '../firebase.js';

/**
 * WhatsApp Business Platform (Cloud API) – order status updates to customers who opted in.
 *
 * Config (not secret) lives in `settings/whatsapp` (server-only, closed in firestore.rules):
 *   { enabled, phoneNumberId, siteUrl, language }
 * The access token lives in Secret Manager as WHATSAPP_TOKEN and is read at runtime,
 * so it never touches the repo, the browser or Firestore.
 * Templates (one per status) are created by scripts/whatsapp-setup.mjs and approved by Meta.
 */
export const TEMPLATE_BY_STATUS: Record<NotifyStatus, string> = {
  accepted: 'pizza_sosi_order_accepted',
  preparing: 'pizza_sosi_order_preparing',
  almost_ready: 'pizza_sosi_order_almost_ready',
  ready: 'pizza_sosi_order_ready_pickup',
  out_for_delivery: 'pizza_sosi_order_on_the_way',
  cancelled: 'pizza_sosi_order_cancelled',
};

const GRAPH = 'https://graph.facebook.com/v23.0';

interface WhatsappConfig { enabled: boolean; phoneNumberId: string; language: string }

export async function loadWhatsappConfig(): Promise<WhatsappConfig | null> {
  const d = (await db.collection(COL.settings).doc('whatsapp').get()).data();
  if (!d?.enabled || typeof d.phoneNumberId !== 'string' || !/^\d+$/.test(d.phoneNumberId)) return null;
  return { enabled: true, phoneNumberId: d.phoneNumberId, language: typeof d.language === 'string' ? d.language : 'he' };
}

/** Israeli number as WhatsApp wants it: 0521234567 → 972521234567. */
export function toWhatsappNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '');
  if (/^05\d{8}$/.test(digits)) return `972${digits.slice(1)}`;
  if (/^9725\d{8}$/.test(digits)) return digits;
  return null; // landlines can't receive WhatsApp
}

let cachedToken: { value: string; at: number } | null = null;

/** Reads WHATSAPP_TOKEN from Secret Manager with the function's own identity (metadata server). */
async function accessToken(): Promise<string> {
  if (cachedToken && Date.now() - cachedToken.at < 5 * 60_000) return cachedToken.value;
  const project = process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT;
  const meta = await fetch('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token', {
    headers: { 'Metadata-Flavor': 'Google' },
  });
  if (!meta.ok) throw new Error(`metadata token ${meta.status}`);
  const { access_token } = (await meta.json()) as { access_token: string };
  const res = await fetch(`https://secretmanager.googleapis.com/v1/projects/${project}/secrets/WHATSAPP_TOKEN/versions/latest:access`, {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!res.ok) throw new Error(`secret WHATSAPP_TOKEN ${res.status}`);
  const body = (await res.json()) as { payload: { data: string } };
  const value = Buffer.from(body.payload.data, 'base64').toString('utf8').trim();
  cachedToken = { value, at: Date.now() };
  return value;
}

export interface TemplateMessage {
  to: string;
  template: string;
  language: string;
  bodyParams: string[];
  /** Dynamic part of the URL button (the order id). */
  buttonParam: string;
}

/** Sends one approved template message. Returns the WhatsApp message id. */
export async function sendTemplate(cfg: WhatsappConfig, m: TemplateMessage): Promise<string> {
  const token = await accessToken();
  const res = await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: m.to,
      type: 'template',
      template: {
        name: m.template,
        language: { code: m.language },
        components: [
          { type: 'body', parameters: m.bodyParams.map((text) => ({ type: 'text', text })) },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: m.buttonParam }] },
        ],
      },
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string; code?: number } };
  if (!res.ok || !json.messages?.[0]?.id) {
    logger.warn('whatsapp send failed', { status: res.status, code: json.error?.code, template: m.template });
    throw new Error(`whatsapp ${res.status} ${json.error?.code ?? ''} ${json.error?.message ?? ''}`.trim());
  }
  return json.messages[0].id;
}
