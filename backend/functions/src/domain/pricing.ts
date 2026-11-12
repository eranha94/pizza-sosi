import type { CartLineInput, MenuItem, PricedLine } from '@pizza-sosi/contracts';

export class PricingError extends Error {
  constructor(
    message: string,
    readonly code: 'item_unavailable' | 'addon_unavailable' | 'empty_cart',
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
    const options = new Map(item.addOnGroups.flatMap((g) => g.options.map((o) => [o.id, o] as const)));
    const seen = new Set<string>();
    const addOns = line.addOns.flatMap((sel) => {
      if (seen.has(sel.id)) return []; // the same topping once per item
      seen.add(sel.id);
      const opt = options.get(sel.id);
      if (!opt || !opt.active) throw new PricingError(`תוספת לא זמינה: ${sel.id}`, 'addon_unavailable');
      const half = sel.coverage === 'half' && opt.halfAgorot !== null;
      return [{
        id: opt.id,
        name: opt.name,
        priceAgorot: half ? opt.halfAgorot! : opt.wholeAgorot,
        coverage: opt.halfAgorot === null ? null : half ? ('half' as const) : ('whole' as const),
      }];
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
