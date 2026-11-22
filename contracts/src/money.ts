/**
 * All money is integer agorot (1 ₪ = 100 agorot). Never floats.
 */
export type Agorot = number;

// minimumFractionDigits must be set too: older browsers (e.g. 2018 TV WebViews) throw a RangeError when only the maximum is lowered.
const whole = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "18 ₪", or "7.50 ₪" when there are agorot. */
export function formatAgorot(value: Agorot): string {
  return (value % 100 === 0 ? whole : cents).format(value / 100);
}
