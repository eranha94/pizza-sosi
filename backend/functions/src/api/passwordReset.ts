import { getAuth } from 'firebase-admin/auth';
import { logger } from 'firebase-functions';
import { RequestPasswordResetRequest } from '@pizza-sosi/contracts';
import { secureCall } from '../security/callable.js';
import { validate } from '../security/errors.js';
import { rateLimit } from '../security/rateLimit.js';
import { loadEmailConfig, sendEmail } from '../email/mailer.js';
import { passwordResetEmail } from '../email/templates.js';

/**
 * Staff "forgot password", sent by our own server so the link always opens our Hebrew page
 * (the default Firebase email/link is broken on these projects and its template can't be changed).
 * - Same answer for every email (no way to learn which addresses are staff).
 * - Only accounts with a staff role get an email.
 * - mode "firebase" = our email isn't configured yet → the admin page falls back to Firebase's email.
 */
export const requestPasswordReset = secureCall<{ mode: 'sent' | 'firebase' }>(async (req) => {
  const { email } = validate(RequestPasswordResetRequest, req.data);
  await rateLimit(`reset:email:${email}`, 3, 60 * 60);
  await rateLimit(`reset:ip:${req.rawRequest.ip ?? 'unknown'}`, 10, 60 * 60);
  const cfg = await loadEmailConfig();
  if (!cfg) return { mode: 'firebase' };
  try {
    const user = await getAuth().getUserByEmail(email);
    const role = user.customClaims?.role;
    if (role === 'owner' || role === 'staff') {
      const oobCode = new URL(await getAuth().generatePasswordResetLink(email)).searchParams.get('oobCode');
      if (oobCode) {
        const link = `${cfg.adminUrl}/auth/action?mode=resetPassword&oobCode=${encodeURIComponent(oobCode)}`;
        await sendEmail(cfg, email, passwordResetEmail(link, cfg.siteUrl), `reset-${user.uid}-${Math.floor(Date.now() / 60_000)}`);
      }
    }
  } catch (e) {
    // Unknown email or a send problem: log without the address, answer the same as success.
    if ((e as { code?: string }).code !== 'auth/user-not-found') logger.error('password reset email failed', { error: (e as Error).message });
  }
  return { mode: 'sent' };
});
