/**
 * All money is integer agorot (1 ₪ = 100 agorot). Never floats.
 */
export type Agorot = number;

const formatter = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 });

export function formatAgorot(value: Agorot): string {
  return formatter.format(value / 100);
}
