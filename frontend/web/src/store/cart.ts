import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { MenuItem } from '@pizza-sosi/contracts';

export interface CartLine {
  key: string;
  itemId: string;
  name: string;
  quantity: number;
  addOnIds: string[];
  addOnNames: string[];
  note: string;
  /** Display only. The server prices the order again from the menu. */
  unitPriceAgorot: number;
}

interface CartState {
  lines: CartLine[];
  add(item: MenuItem, addOnIds: string[], quantity: number, note: string): void;
  setQuantity(key: string, quantity: number): void;
  remove(key: string): void;
  clear(): void;
}

// localStorage can throw (private mode, blocked storage) – never let that break the site.
const safeStorage: StateStorage = {
  getItem: (k) => {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  setItem: (k, v) => {
    try { localStorage.setItem(k, v); } catch { /* ignore */ }
  },
  removeItem: (k) => {
    try { localStorage.removeItem(k); } catch { /* ignore */ }
  },
};

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (item, addOnIds, quantity, note) =>
        set((s) => {
          const ids = [...new Set(addOnIds)].sort();
          const key = `${item.id}|${ids.join(',')}|${note}`;
          const existing = s.lines.find((l) => l.key === key);
          if (existing) {
            return { lines: s.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(20, l.quantity + quantity) } : l)) };
          }
          const addOns = item.addOns.filter((a) => ids.includes(a.id));
          return {
            lines: [
              ...s.lines,
              {
                key, itemId: item.id, name: item.name, quantity, addOnIds: ids,
                addOnNames: addOns.map((a) => a.name), note,
                unitPriceAgorot: item.priceAgorot + addOns.reduce((t, a) => t + a.priceAgorot, 0),
              },
            ],
          };
        }),
      setQuantity: (key, quantity) =>
        set((s) => ({ lines: s.lines.map((l) => (l.key === key ? { ...l, quantity: Math.max(1, Math.min(20, quantity)) } : l)) })),
      remove: (key) => set((s) => ({ lines: s.lines.filter((l) => l.key !== key) })),
      clear: () => set({ lines: [] }),
    }),
    { name: 'pizza-sosi-cart', version: 1, storage: createJSONStorage(() => safeStorage) },
  ),
);

export const cartCount = (s: CartState) => s.lines.reduce((n, l) => n + l.quantity, 0);
export const cartTotal = (s: CartState) => s.lines.reduce((n, l) => n + l.unitPriceAgorot * l.quantity, 0);
