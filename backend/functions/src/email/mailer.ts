import { logger } from 'firebase-functions';
import { db, COL } from '../firebase.js';
import { readSecret } from '../security/secrets.js';
import type { EmailContent } from './templates.js';

/**
 * Transactional email through Resend (https://resend.com).
 * Config (not secret) in `settings/email` (server-only):
 *   { enabled, from: 'פיצה סוסי <orders@pizza-sosi.co.il>', replyTo, siteUrl, adminUrl }
 * API key in Secret Manager as RESEND_API_KEY. Until both exist, sending is skipped (logged, no personal data).
 */
export interface EmailConfig {
  from: string;
  replyTo: string | null;
  siteUrl: string;
  adminUrl: string;
}

export async function loadEmailConfig(): Promise<EmailConfig | null> {
  const d = (await db.collection(COL.settings).doc('email').get()).data();
  if (!d?.enabled || typeof d.from !== 'string' || typeof d.siteUrl !== 'string') return null;
  return {
    from: d.from,
    replyTo: typeof d.replyTo === 'string' ? d.replyTo : null,
    siteUrl: d.siteUrl.replace(/\/$/, ''),
    adminUrl: typeof d.adminUrl === 'string' ? d.adminUrl.replace(/\/$/, '') : d.siteUrl.replace(/\/$/, ''),
  };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Sends one email. idempotencyKey makes a retried trigger a no-op on Resend's side too. */
export async function sendEmail(cfg: EmailConfig, to: string, content: EmailContent, idempotencyKey: string): Promise<string> {
  if (!EMAIL_RE.test(to)) throw new Error('invalid recipient');
  const key = await readSecret('RESEND_API_KEY');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({
      from: cfg.from,
      to: [to],
      subject: content.subject,
      html: content.html,
      text: content.text,
      ...(cfg.replyTo && { reply_to: cfg.replyTo }),
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
  if (!res.ok || !json.id) {
    logger.warn('email send failed', { status: res.status, error: json.name });
    throw new Error(`email ${res.status} ${json.name ?? ''}`.trim());
  }
  return json.id;
}
