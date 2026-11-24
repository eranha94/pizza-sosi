import type { AddOnGroup } from './menu.js';

// Zod-free on purpose: imported by the customer site, which must stay small.

/**
 * Free toppings: the first regular topping ("רגילות") on each item is on the house.
 * Returns how many toppings in the group are free.
 */
export const freeInGroup = (g: Pick<AddOnGroup, 'name' | 'selection'>): number => (g.selection === 'multi' && /^\s*רגיל/.test(g.name) ? 1 : 0);

/**
 * Which chosen toppings are free. In each group that gives some away, the most expensive picks are the free ones
 * (so the customer always gets the better deal). Shared by the site and the server so both show the same price.
 */
export function freeAddOnIds(groups: readonly AddOnGroup[], picks: readonly { id: string; priceAgorot: number }[]): Set<string> {
  const free = new Set<string>();
  for (const g of groups) {
    const n = freeInGroup(g);
    if (n === 0) continue;
    const inGroup = new Set(g.options.map((o) => o.id));
    picks
      .filter((p) => inGroup.has(p.id))
      .sort((a, b) => b.priceAgorot - a.priceAgorot || a.id.localeCompare(b.id))
      .slice(0, n)
      .forEach((p) => free.add(p.id));
  }
  return free;
}

/* ------------------------------------------------------------------ */
/* Deals, coupons and the loyalty card. Shared by the site (to show the  */
/* price before ordering) and the server (which decides it).            */
/* ------------------------------------------------------------------ */

export interface DealComponent {
  itemId: string;
  quantity: number;
}

/** A combo: these items together for one price. Toppings and paid choices are charged on top as usual. */
export interface DealRule {
  id: string;
  title: string;
  components: DealComponent[];
  priceAgorot: number;
  active: boolean;
  /** 0 = Sunday … 6 = Saturday. Empty = every day. */
  weekdays: number[];
  /** Israel dates "YYYY-MM-DD", inclusive. null = open-ended. */
  validFrom: string | null;
  validTo: string | null;
}

export interface Discount {
  kind: 'deal' | 'coupon' | 'loyalty';
  label: string;
  amountAgorot: number;
}

/** Is the deal on, on this Israel date / weekday? */
export const dealIsOn = (d: DealRule, date: string, weekday: number): boolean =>
  d.active &&
  (d.weekdays.length === 0 || d.weekdays.includes(weekday)) &&
  (!d.validFrom || date >= d.validFrom) &&
  (!d.validTo || date <= d.validTo);

/** What the deal's items cost separately (base prices), or null when one of them is not on the menu. */
export function dealRegularPrice(d: DealRule, basePrice: (itemId: string) => number | undefined): number | null {
  let sum = 0;
  for (const c of d.components) {
    const p = basePrice(c.itemId);
    if (p === undefined) return null;
    sum += p * c.quantity;
  }
  return sum;
}

/**
 * Deals found in the cart, applied automatically – also when the customer added the items one by one.
 * The deal that saves the most goes first; each deal applies as many times as the cart allows.
 * The saving is on the items' base price only, so toppings stay paid.
 */
export function applyDeals(
  lines: readonly { itemId: string; quantity: number }[],
  deals: readonly DealRule[],
  basePrice: (itemId: string) => number | undefined,
): Discount[] {
  const left = new Map<string, number>();
  for (const l of lines) left.set(l.itemId, (left.get(l.itemId) ?? 0) + l.quantity);
  const candidates = deals
    .map((d) => ({ d, saving: (dealRegularPrice(d, basePrice) ?? 0) - d.priceAgorot }))
    .filter((x) => x.saving > 0)
    .sort((a, b) => b.saving - a.saving || a.d.id.localeCompare(b.d.id));
  const out: Discount[] = [];
  for (const { d, saving } of candidates) {
    const times = Math.min(...d.components.map((c) => Math.floor((left.get(c.itemId) ?? 0) / c.quantity)));
    if (times <= 0) continue;
    for (const c of d.components) left.set(c.itemId, left.get(c.itemId)! - c.quantity * times);
    out.push({ kind: 'deal', label: times > 1 ? `${d.title} ×${times}` : d.title, amountAgorot: saving * times });
  }
  return out;
}

export type CouponKind = 'percent' | 'amount';

/** Coupon discount on the amount after deals, or a Hebrew reason it can't be used. */
export function couponDiscount(
  c: { type: CouponKind; value: number; minOrderAgorot: number },
  amountAgorot: number,
): { amountAgorot: number } | { error: string } {
  if (amountAgorot < c.minOrderAgorot) return { error: `הקופון בתוקף מהזמנה של ${c.minOrderAgorot / 100} ₪` };
  const off = c.type === 'percent' ? Math.round((amountAgorot * c.value) / 100) : c.value;
  return { amountAgorot: Math.min(off, amountAgorot) };
}
export const couponLabel = (c: { code: string; type: CouponKind; value: number }) =>
  `קופון ${c.code} (${c.type === 'percent' ? `${c.value}%` : `${c.value / 100} ₪`})`;

/** What the customer gets when the loyalty card is full. */
export type LoyaltyReward =
  | { type: 'item'; category: string; maxAgorot: number }
  | { type: 'amount'; amountAgorot: number }
  | { type: 'percent'; percent: number };

export function loyaltyRewardLabel(r: LoyaltyReward, categoryLabel: (id: string) => string): string {
  if (r.type === 'amount') return `${r.amountAgorot / 100} ₪ הנחה`;
  if (r.type === 'percent') return `${r.percent}% הנחה`;
  return `${categoryLabel(r.category)} חינם${r.maxAgorot > 0 ? ` (עד ${r.maxAgorot / 100} ₪)` : ''}`;
}

/**
 * Loyalty reward on this cart. "item": the most expensive item of that category is free (base price, capped);
 * the toppings stay paid. Returns an error when the cart has nothing the reward applies to.
 */
export function loyaltyDiscount(
  r: LoyaltyReward,
  lines: readonly { itemId: string; quantity: number; category: string; basePriceAgorot: number }[],
  amountAgorot: number,
): { amountAgorot: number } | { error: string } {
  if (r.type === 'amount') return { amountAgorot: Math.min(r.amountAgorot, amountAgorot) };
  if (r.type === 'percent') return { amountAgorot: Math.min(Math.round((amountAgorot * r.percent) / 100), amountAgorot) };
  const best = Math.max(0, ...lines.filter((l) => l.category === r.category).map((l) => l.basePriceAgorot));
  if (best === 0) return { error: 'ההטבה היא על פריט שאין בסל. הוסיפו אותו כדי לממש' };
  return { amountAgorot: Math.min(r.maxAgorot > 0 ? Math.min(best, r.maxAgorot) : best, amountAgorot) };
}
