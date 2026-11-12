import { StoreSettings, MenuItem } from '@pizza-sosi/contracts';
import { HttpsError } from 'firebase-functions/v2/https';
import { db, COL } from '../firebase.js';

export const DEFAULT_STORE: StoreSettings = {
  opensAt: '11:00',
  closesAt: '00:00',
  acceptingOrders: true,
  deliveryEnabled: false,
  deliveryFeeAgorot: 0,
  minOrderAgorot: 0,
};

export async function loadStoreSettings(): Promise<StoreSettings> {
  const snap = await db.collection(COL.settings).doc('store').get();
  if (!snap.exists) return DEFAULT_STORE;
  const parsed = StoreSettings.safeParse({ ...DEFAULT_STORE, ...snap.data() });
  if (!parsed.success) throw new HttpsError('internal', 'store settings invalid');
  return parsed.data;
}

/** Load only the menu items referenced by the cart. */
export async function loadMenuItems(ids: string[]): Promise<Map<string, MenuItem>> {
  const unique = [...new Set(ids)];
  const refs = unique.map((id) => db.collection(COL.menuItems).doc(id));
  const snaps = refs.length ? await db.getAll(...refs) : [];
  const map = new Map<string, MenuItem>();
  for (const s of snaps) {
    if (!s.exists) continue;
    const parsed = MenuItem.safeParse({ id: s.id, ...s.data() });
    if (parsed.success) map.set(s.id, parsed.data);
  }
  return map;
}
