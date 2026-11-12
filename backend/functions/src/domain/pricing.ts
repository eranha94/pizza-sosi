import type { CartLineInput, MenuItem, PricedLine } from '@pizza-sosi/contracts';

export class PricingError extends Error {
  constructor(
    message: string,
    readonly code: 'item_unavailable' | 'addon_unavailable' | 'choice_required' | 'empty_cart',
  ) {
    super(message);
  }
}

export interface PricedCart {
  lines: PricedLine[];
  subtotalAgorot: number;
  deliveryFeeAgorot: number;
  totalAgorot: number;
}

type Chosen = { id: string; coverage: 'whole' | 'half' };

/**
 * Resolve the customer's choices against the item's groups:
 *  - "single" groups: exactly one option (falls back to the group's default, else an error)
 *  - "multi" groups: any number, each topping at most once
 */
function resolveChoices(item: MenuItem, sent: Chosen[]) {
  const sentById = new Map<string, Chosen>();
  for (const c of sent) if (!sentById.has(c.id)) sentById.set(c.id, c);
  const known = new Set(item.addOnGroups.flatMap((g) => g.options.map((o) => o.id)));
  for (const id of sentById.keys()) if (!known.has(id)) throw new PricingError(`תוספת לא זמינה: ${id}`, 'addon_unavailable');

  const picked: { option: MenuItem['addOnGroups'][number]['options'][number]; coverage: Chosen['coverage'] }[] = [];
  for (const g of [...item.addOnGroups].sort((a, b) => a.order - b.order)) {
    const inGroup = g.options.filter((o) => sentById.has(o.id));
    for (const o of inGroup) if (!o.active) throw new PricingError(`תוספת לא זמינה: ${o.name}`, 'addon_unavailable');
    if (g.selection === 'single') {
      if (inGroup.length > 1) throw new PricingError(`אפשר לבחור רק אחד: ${g.name}`, 'choice_required');
      const option = inGroup[0] ?? g.options.find((o) => o.id === g.defaultOptionId && o.active);
      if (!option) throw new PricingError(`צריך לבחור ${g.name}`, 'choice_required');
      picked.push({ option, coverage: 'whole' });
    } else {
      for (const o of inGroup) picked.push({ option: o, coverage: sentById.get(o.id)!.coverage });
    }
  }
  return picked;
}

/**
 * The only place a price is decided. Uses the menu from the database, never values from the browser.
 * Each topping is charged its own price: whole pizza, or half pizza when the topping offers it.
 */
export function priceCart(
  lines: CartLineInput[],
  menu: ReadonlyMap<string, MenuItem>,
  deliveryFeeAgorot: number,
): PricedCart {
  if (lines.length === 0) throw new PricingError('הסל ריק', 'empty_cart');
  const priced: PricedLine[] = lines.map((line) => {
    const item = menu.get(line.itemId);
    if (!item || !item.active) throw new PricingError(`פריט לא זמין: ${line.itemId}`, 'item_unavailable');
    const addOns = resolveChoices(item, line.addOns).map(({ option: o, coverage }) => {
      const half = coverage === 'half' && o.halfAgorot !== null;
      return {
        id: o.id,
        name: o.name,
        priceAgorot: half ? o.halfAgorot! : o.wholeAgorot,
        coverage: o.halfAgorot === null ? null : half ? ('half' as const) : ('whole' as const),
      };
    });
    const unit = item.priceAgorot + addOns.reduce((s, a) => s + a.priceAgorot, 0);
    return {
      itemId: item.id,
      name: item.name,
      quantity: line.quantity,
      unitPriceAgorot: unit,
      addOns,
      note: line.note,
      lineTotalAgorot: unit * line.quantity,
    };
  });
  const subtotalAgorot = priced.reduce((s, l) => s + l.lineTotalAgorot, 0);
  return { lines: priced, subtotalAgorot, deliveryFeeAgorot, totalAgorot: subtotalAgorot + deliveryFeeAgorot };
}
