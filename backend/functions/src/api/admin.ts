import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import {
  SetOrderStatusRequest,
  UpdateStoreSettingsRequest,
  UpsertMenuItemRequest,
  DeleteMenuItemRequest,
  type OrderStatus,
} from '@pizza-sosi/contracts';
import { db, COL } from '../firebase.js';
import { secureCall } from '../security/callable.js';
import { requireStaff } from '../security/auth.js';
import { validate } from '../security/errors.js';
import { audit } from '../security/audit.js';
import { canTransition } from '../domain/orderState.js';

export const adminSetOrderStatus = secureCall<{ status: OrderStatus }>(async (req) => {
  const { uid } = requireStaff(req);
  const { orderId, status } = validate(SetOrderStatusRequest, req.data);
  const ref = db.collection(COL.orders).doc(orderId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'ההזמנה לא נמצאה');
    const from = snap.data()!.status as OrderStatus;
    if (!canTransition(from, status)) throw new HttpsError('failed-precondition', `אי אפשר לעבור מ-${from} ל-${status}`);
    tx.update(ref, {
      status,
      updatedAt: FieldValue.serverTimestamp(),
      statusHistory: FieldValue.arrayUnion({ status, at: new Date().toISOString(), by: uid }),
    });
  });
  await audit(uid, 'order.status', orderId, { status });
  return { status };
});

export const adminUpdateStoreSettings = secureCall<{ ok: true }>(async (req) => {
  const { uid } = requireStaff(req, ['owner', 'staff']);
  const patch = validate(UpdateStoreSettingsRequest, req.data);
  await db.collection(COL.settings).doc('store').set({ ...patch, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await audit(uid, 'store.settings', 'store', patch);
  return { ok: true };
});

export const adminUpsertMenuItem = secureCall<{ id: string }>(async (req) => {
  const { uid } = requireStaff(req, ['owner']);
  const input = validate(UpsertMenuItemRequest, req.data);
  const ref = input.id ? db.collection(COL.menuItems).doc(input.id) : db.collection(COL.menuItems).doc();
  const newId = () => db.collection('_').doc().id;
  const addOnGroups = input.addOnGroups.map((g) => ({
    ...g,
    id: g.id ?? newId(),
    options: g.options.map((o) => ({ ...o, id: o.id ?? newId() })),
  }));
  const { id: _ignored, ...rest } = input;
  await ref.set({ ...rest, addOnGroups, updatedAt: FieldValue.serverTimestamp() }, { merge: false });
  await audit(uid, input.id ? 'menu.update' : 'menu.create', ref.id, { name: input.name, priceAgorot: input.priceAgorot });
  return { id: ref.id };
});

export const adminDeleteMenuItem = secureCall<{ ok: true }>(async (req) => {
  const { uid } = requireStaff(req, ['owner']);
  const { id } = validate(DeleteMenuItemRequest, req.data);
  // Soft delete: keep history for past orders and allow undo.
  await db.collection(COL.menuItems).doc(id).update({ active: false, deletedAt: FieldValue.serverTimestamp() });
  await audit(uid, 'menu.delete', id);
  return { ok: true };
});
