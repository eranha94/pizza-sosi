import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { MenuItem } from '@pizza-sosi/contracts';

export type Coverage = 'whole' | 'right' | 'left';
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
  /** Edit a line in place (toppings, quantity, note). Merges with an identical line if one exists. */
  replace(key: string, item: MenuItem, addOns: ChosenAddOn[], quantity: number, note: string): void;
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
    const half = c.coverage !== 'whole' && o.halfAgorot !== null;
    total += half ? o.halfAgorot! : o.wholeAgorot;
    const where = { whole: 'כל הפיצה', right: 'חצי ימין', left: 'חצי שמאל' }[c.coverage];
    labels.push(o.halfAgorot === null ? o.name : `${o.name} (${half ? where : 'כל הפיצה'})`);
  }
  return { total, labels };
}

const lineKey = (itemId: string, chosen: ChosenAddOn[], note: string) => `${itemId}|${chosen.map((c) => `${c.id}:${c.coverage}`).join(',')}|${note}`;

function withLine(lines: CartLine[], item: MenuItem, addOns: ChosenAddOn[], quantity: number, note: string, at?: number): CartLine[] {
  const chosen = [...addOns].sort((a, b) => a.id.localeCompare(b.id));
  const key = lineKey(item.id, chosen, note);
  if (lines.some((l) => l.key === key)) return lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(20, l.quantity + quantity) } : l));
  const { total, labels } = addOnsPrice(item, chosen);
  const line: CartLine = { key, itemId: item.id, name: item.name, quantity, addOns: chosen, addOnLabels: labels, note, unitPriceAgorot: item.priceAgorot + total };
  const next = [...lines];
  next.splice(at ?? next.length, 0, line);
  return next;
}

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (item, addOns, quantity, note) => set((s) => ({ lines: withLine(s.lines, item, addOns, quantity, note) })),
      replace: (key, item, addOns, quantity, note) =>
        set((s) => {
          const at = s.lines.findIndex((l) => l.key === key);
          const rest = s.lines.filter((l) => l.key !== key);
          return { lines: withLine(rest, item, addOns, 0, note, at < 0 ? undefined : at).map((l) => (l.key === lineKey(item.id, [...addOns].sort((a, b) => a.id.localeCompare(b.id)), note) ? { ...l, quantity: Math.min(20, l.quantity + quantity) } : l)) };
        }),
      setQuantity: (key, quantity) =>
        set((s) => ({ lines: s.lines.map((l) => (l.key === key ? { ...l, quantity: Math.max(1, Math.min(20, quantity)) } : l)) })),
      remove: (key) => set((s) => ({ lines: s.lines.filter((l) => l.key !== key) })),
      clear: () => set({ lines: [] }),
    }),
    // v3: toppings go on the whole pizza, right half or left half; older carts are dropped.
    { name: 'pizza-sosi-cart', version: 3, migrate: () => ({ lines: [] }), storage: createJSONStorage(() => safeStorage) },
  ),
);

export const cartCount = (s: CartState) => s.lines.reduce((n, l) => n + l.quantity, 0);
export const cartTotal = (s: CartState) => s.lines.reduce((n, l) => n + l.unitPriceAgorot * l.quantity, 0);
