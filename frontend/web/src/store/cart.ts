import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { MenuItem } from '@pizza-sosi/contracts';

export type Coverage = 'whole' | 'half';
export interface ChosenAddOn {
  id: string;
  coverage: Coverage;
}

export interface CartLine {
  key: string;
  itemId: string;
  name: string;
  quantity: number;
  addOns: ChosenAddOn[];
  /** For display, e.g. "טונה (חצי)". */
  addOnLabels: string[];
  note: string;
  /** Display only. The server prices the order again from the menu. */
  unitPriceAgorot: number;
}

interface CartState {
  lines: CartLine[];
  add(item: MenuItem, addOns: ChosenAddOn[], quantity: number, note: string): void;
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

/** Price of the chosen toppings for one unit, the same rule the server applies. */
export function addOnsPrice(item: MenuItem, chosen: ChosenAddOn[]): { total: number; labels: string[] } {
  const options = new Map(item.addOnGroups.flatMap((g) => g.options.map((o) => [o.id, o] as const)));
  let total = 0;
  const labels: string[] = [];
  for (const c of chosen) {
    const o = options.get(c.id);
    if (!o) continue;
    const half = c.coverage === 'half' && o.halfAgorot !== null;
    total += half ? o.halfAgorot! : o.wholeAgorot;
    labels.push(o.halfAgorot === null ? o.name : `${o.name} (${half ? 'חצי' : 'כל הפיצה'})`);
  }
  return { total, labels };
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (item, addOns, quantity, note) =>
        set((s) => {
          const chosen = [...addOns].sort((a, b) => a.id.localeCompare(b.id));
          const key = `${item.id}|${chosen.map((c) => `${c.id}:${c.coverage}`).join(',')}|${note}`;
          const existing = s.lines.find((l) => l.key === key);
          if (existing) {
            return { lines: s.lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(20, l.quantity + quantity) } : l)) };
          }
          const { total, labels } = addOnsPrice(item, chosen);
          return {
            lines: [
              ...s.lines,
              {
                key, itemId: item.id, name: item.name, quantity, addOns: chosen, addOnLabels: labels, note,
                unitPriceAgorot: item.priceAgorot + total,
              },
            ],
          };
        }),
      setQuantity: (key, quantity) =>
        set((s) => ({ lines: s.lines.map((l) => (l.key === key ? { ...l, quantity: Math.max(1, Math.min(20, quantity)) } : l)) })),
      remove: (key) => set((s) => ({ lines: s.lines.filter((l) => l.key !== key) })),
      clear: () => set({ lines: [] }),
    }),
    // v2: toppings now have whole/half choices; older carts are dropped.
    { name: 'pizza-sosi-cart', version: 2, migrate: () => ({ lines: [] }), storage: createJSONStorage(() => safeStorage) },
  ),
);

export const cartCount = (s: CartState) => s.lines.reduce((n, l) => n + l.quantity, 0);
export const cartTotal = (s: CartState) => s.lines.reduce((n, l) => n + l.unitPriceAgorot * l.quantity, 0);
