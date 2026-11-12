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
    const uniqueAddOnIds = [...new Set(line.addOnIds)];
    const addOns = uniqueAddOnIds.map((addOnId) => {
      const addOn = item.addOns.find((a) => a.id === addOnId);
      if (!addOn || !addOn.active) throw new PricingError(`תוספת לא זמינה: ${addOnId}`, 'addon_unavailable');
      return { id: addOn.id, name: addOn.name, priceAgorot: addOn.priceAgorot };
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
