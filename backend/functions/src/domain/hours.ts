import type { StoreSettings } from '@pizza-sosi/contracts';

const TZ = 'Asia/Jerusalem';

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** Minutes since local midnight in Israel for the given instant. */
export function localMinutes(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value);
  const m = Number(parts.find((p) => p.type === 'minute')?.value);
  return h * 60 + m;
}

/**
 * Whether the store accepts orders now. Handles closing after midnight
 * (e.g. opens 11:00, closes 00:00 or 01:30).
 */
export function isOpen(settings: Pick<StoreSettings, 'opensAt' | 'closesAt' | 'acceptingOrders'>, now: Date): boolean {
  if (!settings.acceptingOrders) return false;
  const t = localMinutes(now);
  const open = minutesOf(settings.opensAt);
  const close = minutesOf(settings.closesAt);
  if (open === close) return true; // open 24h
  return open < close ? t >= open && t < close : t >= open || t < close;
}
