import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import {
  SetOrderStatusRequest,
  UpdateStoreSettingsRequest,
  UpsertMenuItemRequest,
  DeleteMenuItemRequest,
  BulkUpdateOptionRequest,
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
    if (!canTransition(from, status, snap.data()!.fulfillment)) throw new HttpsError('failed-precondition', `אי אפשר לעבור מ-${from} ל-${status}`);
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
  // Option ids must be unique inside a group, and a default must point to one of the group's options.
  for (const g of input.addOnGroups) {
    const ids = g.options.map((o) => o.id).filter(Boolean);
    if (new Set(ids).size !== ids.length) throw new HttpsError('invalid-argument', `אפשרות כפולה בקבוצה "${g.name}"`);
    if (g.defaultOptionId && !ids.includes(g.defaultOptionId)) throw new HttpsError('invalid-argument', `ברירת מחדל לא תקינה בקבוצה "${g.name}"`);
    if (g.selection === 'single' && g.options.some((o) => o.halfAgorot !== null))
      throw new HttpsError('invalid-argument', `בבחירת חובה אין מחיר חצי ("${g.name}")`);
  }
  if (input.id && !(await db.collection(COL.menuItems).doc(input.id).get()).exists)
    throw new HttpsError('not-found', 'הפריט לא נמצא');
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

/** Update one add-on (by name) on every menu item that has it. dryRun returns what would change. */
export const adminBulkUpdateOption = secureCall<{ items: string[] }>(async (req) => {
  const { uid } = requireStaff(req, ['owner']);
  const input = validate(BulkUpdateOptionRequest, req.data);
  const snap = await db.collection(COL.menuItems).get();
  const batch = db.batch();
  const items: string[] = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.deletedAt || (input.category && d.category !== input.category)) continue;
    let touched = false;
    const groups = (d.addOnGroups ?? []).map((g: { selection?: string; options: Record<string, unknown>[] }) => {
      if ((g.selection ?? 'multi') !== 'multi') return g;
      return {
        ...g,
        options: g.options.map((o) => {
          if (o.name !== input.optionName) return o;
          touched = true;
          return {
            ...o,
            ...(input.wholeAgorot !== undefined && { wholeAgorot: input.wholeAgorot }),
            ...(input.halfAgorot !== undefined && { halfAgorot: input.halfAgorot }),
            ...(input.active !== undefined && { active: input.active }),
          };
        }),
      };
    });
    if (!touched) continue;
    items.push(String(d.name));
    if (!input.dryRun) batch.update(doc.ref, { addOnGroups: groups, updatedAt: FieldValue.serverTimestamp() });
  }
  if (!input.dryRun && items.length) {
    await batch.commit();
    await audit(uid, 'menu.bulkOption', input.optionName, { ...input, count: items.length });
  }
  return { items };
});
