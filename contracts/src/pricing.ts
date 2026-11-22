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
