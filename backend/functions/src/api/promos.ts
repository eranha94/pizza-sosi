import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import {
  UpsertDealRequest,
  DeleteDealRequest,
  UpsertCouponRequest,
  DeleteCouponRequest,
  CheckCouponRequest,
  LoyaltySettings,
  GetLoyaltyRequest,
  couponLabel,
  localParts,
  type CheckCouponResponse,
  type LoyaltyCardView,
} from '@pizza-sosi/contracts';
import { db, COL } from '../firebase.js';
import { secureCall } from '../security/callable.js';
import { requireStaff, requireAuth } from '../security/auth.js';
import { validate } from '../security/errors.js';
import { audit } from '../security/audit.js';
import { rateLimit } from '../security/rateLimit.js';
import { loyaltyView } from '../domain/promos.js';

/* ---------- Deals ---------- */

export const adminUpsertDeal = secureCall<{ id: string }>(async (req) => {
  const { uid } = requireStaff(req, ['owner']);
  const input = validate(UpsertDealRequest, req.data);
  // Every item of the deal must exist on the menu.
  const refs = input.components.map((c) => db.collection(COL.menuItems).doc(c.itemId));
  const snaps = await db.getAll(...refs);
  const missing = snaps.filter((s) => !s.exists).map((s) => s.id);
  if (missing.length) throw new HttpsError('invalid-argument', 'פריט במבצע לא נמצא בתפריט');
  if (input.validFrom && input.validTo && input.validTo < input.validFrom) throw new HttpsError('invalid-argument', 'תאריך הסיום לפני תאריך ההתחלה');
  const ref = input.id ? db.collection(COL.deals).doc(input.id) : db.collection(COL.deals).doc();
  const { id: _ignored, ...rest } = input;
  await ref.set({ ...rest, updatedAt: FieldValue.serverTimestamp() });
  await audit(uid, input.id ? 'deal.update' : 'deal.create', ref.id, { title: input.title, priceAgorot: input.priceAgorot });
  return { id: ref.id };
});

export const adminDeleteDeal = secureCall<{ ok: true }>(async (req) => {
  const { uid } = requireStaff(req, ['owner']);
  const { id } = validate(DeleteDealRequest, req.data);
  await db.collection(COL.deals).doc(id).delete();
  await audit(uid, 'deal.delete', id);
  return { ok: true };
});

/* ---------- Coupons ---------- */

export const adminUpsertCoupon = secureCall<{ code: string }>(async (req) => {
  const { uid } = requireStaff(req, ['owner']);
  const c = validate(UpsertCouponRequest, req.data);
  if (c.validFrom && c.validTo && c.validTo < c.validFrom) throw new HttpsError('invalid-argument', 'תאריך הסיום לפני תאריך ההתחלה');
  // Keep the usage counter when editing an existing coupon.
  await db.collection(COL.coupons).doc(c.code).set({ ...c, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await audit(uid, 'coupon.upsert', c.code, { type: c.type, value: c.value });
  return { code: c.code };
});

export const adminDeleteCoupon = secureCall<{ ok: true }>(async (req) => {
  const { uid } = requireStaff(req, ['owner']);
  const { code } = validate(DeleteCouponRequest, req.data);
  // Soft delete: past orders keep pointing at it, and the code can't be reused by accident.
  await db.collection(COL.coupons).doc(code).set({ active: false, deletedAt: FieldValue.serverTimestamp() }, { merge: true });
  await audit(uid, 'coupon.delete', code);
  return { ok: true };
});

/** Why this coupon can't be used now, or null when it can. Shared by checkCoupon and createOrder. */
export function couponProblem(c: FirebaseFirestore.DocumentData | undefined, now: Date, usedByPhone: boolean): string | null {
  if (!c || c.active !== true || c.deletedAt) return 'קוד הקופון לא קיים';
  const today = localParts(now).date;
  if (c.validFrom && today < c.validFrom) return 'הקופון עוד לא בתוקף';
  if (c.validTo && today > c.validTo) return 'תוקף הקופון הסתיים';
  if (c.maxUses != null && Number(c.usedCount ?? 0) >= c.maxUses) return 'הקופון כבר נוצל עד הסוף';
  if (usedByPhone) return 'כבר השתמשת בקופון הזה';
  return null;
}

export const couponUseRef = (code: string, phone: string) => db.collection(COL.coupons).doc(code).collection('uses').doc(phone.replace(/\D/g, ''));

export const checkCoupon = secureCall<CheckCouponResponse>(async (req) => {
  const uid = requireAuth(req);
  const { code, phone } = validate(CheckCouponRequest, req.data);
  await rateLimit(`coupon:uid:${uid}`, 15, 10 * 60); // no guessing codes
  const snap = await db.collection(COL.coupons).doc(code).get();
  const c = snap.data();
  const used = Boolean(phone && c?.oncePerPhone && (await couponUseRef(code, phone).get()).exists);
  const problem = couponProblem(c, new Date(), used);
  if (problem) throw new HttpsError('failed-precondition', problem);
  return { code, type: c!.type, value: c!.value, minOrderAgorot: Number(c!.minOrderAgorot ?? 0), label: couponLabel({ code, type: c!.type, value: c!.value }) };
});

/* ---------- Loyalty ---------- */

export const adminUpdateLoyalty = secureCall<{ ok: true }>(async (req) => {
  const { uid } = requireStaff(req, ['owner']);
  const s = validate(LoyaltySettings, req.data);
  await db.collection(COL.settings).doc('loyalty').set({ ...s, updatedAt: FieldValue.serverTimestamp() });
  await audit(uid, 'loyalty.settings', 'loyalty', s);
  return { ok: true };
});

/** The customer's card at checkout (by the phone they typed). Only counts – no names or orders. */
export const getLoyalty = secureCall<LoyaltyCardView | null>(async (req) => {
  const uid = requireAuth(req);
  const { phone } = validate(GetLoyaltyRequest, req.data);
  await rateLimit(`loyalty:uid:${uid}`, 30, 10 * 60);
  return loyaltyView(phone);
});
