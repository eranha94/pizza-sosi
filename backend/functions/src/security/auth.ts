import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https';
import type { StaffRole } from '@pizza-sosi/contracts';

/** Any signed-in user, including anonymous guests. */
export function requireAuth(req: CallableRequest): string {
  if (!req.auth) throw new HttpsError('unauthenticated', 'נדרשת התחברות');
  return req.auth.uid;
}

/**
 * Staff only: role custom claim set by the owner, signed in with a second factor (MFA).
 * Roles are assigned with scripts/set-staff-role.mjs, never from the browser.
 */
export function requireStaff(req: CallableRequest, allowed: readonly StaffRole[] = ['owner', 'staff']): {
  uid: string;
  role: StaffRole;
} {
  const uid = requireAuth(req);
  const token = req.auth!.token;
  const role = token.role as StaffRole | undefined;
  if (!role || !allowed.includes(role)) throw new HttpsError('permission-denied', 'אין הרשאה');
  const secondFactor = (token.firebase as { sign_in_second_factor?: string } | undefined)?.sign_in_second_factor;
  if (!secondFactor) throw new HttpsError('permission-denied', 'נדרש אימות דו-שלבי');
  return { uid, role };
}
