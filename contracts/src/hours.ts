/**
 * Opening hours math, in Israel time. Pure functions, no dependencies.
 * The server uses them to ENFORCE (orders only while open / for valid times);
 * the site uses the same functions only to DISPLAY status and offer times.
 */

export const STORE_TZ = 'Asia/Jerusalem';

/** "HH:MM" open and close. close <= open means it closes after midnight (e.g. 11:00–00:00, 18:00–02:00). */
export interface DayHours {
  open: string;
  close: string;
}
/** Index 0 = Sunday … 6 = Saturday. null = closed that day. */
export type WeeklyHours = [DayHours | null, DayHours | null, DayHours | null, DayHours | null, DayHours | null, DayHours | null, DayHours | null];

/** A change for one date only (e.g. close early tonight). */
export interface HoursOverride {
  date: string; // YYYY-MM-DD in Israel
  closed?: boolean;
  open?: string;
  close?: string;
}

export interface Schedule {
  weeklyHours: WeeklyHours;
  overrides?: HoursOverride[];
  /** Manual switch from the admin page. false = no orders at all right now. */
  acceptingOrders: boolean;
  /** Typical minutes from order to ready. */
  prepMinutes: number;
}

export const DEFAULT_SCHEDULE: Schedule = {
  weeklyHours: Array.from({ length: 7 }, () => ({ open: '11:00', close: '00:00' })) as WeeklyHours,
  overrides: [],
  acceptingOrders: true,
  prepMinutes: 25,
};

export const WEEKDAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isHHMM = (s: unknown): s is string => typeof s === 'string' && HHMM.test(s);
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: STORE_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23', hour12: false,
});
// hour12:false is for older browsers that ignore hourCycle; some of those print midnight as "24", hence the % 24 below.
const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** Israel calendar date, weekday and minutes since midnight for an instant. */
export function localParts(at: Date) {
  const p = Object.fromEntries(partsFmt.formatToParts(at).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, weekday: WD[p.weekday as string]!, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

/** Epoch ms for an Israel local date + minutes (DST-safe). */
export function zonedToEpoch(date: string, minutes: number): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const guess = Date.UTC(y, m - 1, d, 0, minutes);
  const offsetAt = (ms: number) => {
    const lp = localParts(new Date(ms));
    const [ly, lm, ld] = lp.date.split('-').map(Number) as [number, number, number];
    return Date.UTC(ly, lm - 1, ld, 0, lp.minutes) - Math.floor(ms / 60000) * 60000;
  };
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t); // second pass fixes the hour around DST changes
  return t;
}

function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Hours that apply to one Israel date, after overrides. */
export function hoursFor(schedule: Schedule, date: string): DayHours | null {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  let h = schedule.weeklyHours[weekday] ?? null;
  const o = schedule.overrides?.find((x) => x.date === date);
  if (o) {
    if (o.closed) return null;
    const open = o.open ?? h?.open;
    const close = o.close ?? h?.close;
    h = open && close ? { open, close } : null;
  }
  return h && isHHMM(h.open) && isHHMM(h.close) ? h : null;
}

export interface OpenWindow {
  start: number; // epoch ms
  end: number;
  date: string; // the business day it belongs to
}

/** Open windows from yesterday to `days` ahead (yesterday matters for after-midnight closing). */
export function openWindows(schedule: Schedule, now: Date, days = 7): OpenWindow[] {
  const today = localParts(now).date;
  const out: OpenWindow[] = [];
  for (let i = -1; i <= days; i++) {
    const date = addDays(today, i);
    const h = hoursFor(schedule, date);
    if (!h) continue;
    const open = toMin(h.open);
    const close = toMin(h.close);
    const start = zonedToEpoch(date, open);
    const end = close <= open ? zonedToEpoch(addDays(date, 1), close) : zonedToEpoch(date, close);
    out.push({ start, end, date });
  }
  return out;
}

export type StoreStatus =
  | { state: 'open'; closesAt: number; minutesLeft: number }
  | { state: 'paused' } // manual switch off
  | { state: 'closed'; opensAt: number | null; opensToday: boolean };

/** Is the store taking orders right now, and until when / from when. */
export function storeStatus(schedule: Schedule, now: Date): StoreStatus {
  if (!schedule.acceptingOrders) return { state: 'paused' };
  const t = now.getTime();
  const windows = openWindows(schedule, now);
  const current = windows.find((w) => t >= w.start && t < w.end);
  if (current) return { state: 'open', closesAt: current.end, minutesLeft: Math.floor((current.end - t) / 60000) };
  const next = windows.find((w) => w.start > t) ?? null;
  return { state: 'closed', opensAt: next?.start ?? null, opensToday: next ? localParts(new Date(next.start)).date === localParts(now).date : false };
}

/**
 * Times a customer can pick for a scheduled order: every `step` minutes, from now + prep time,
 * inside open windows, within the next `horizonHours`.
 */
export function orderSlots(schedule: Schedule, now: Date, step = 15, horizonHours = 12): number[] {
  if (!schedule.acceptingOrders) return [];
  const t = now.getTime();
  const earliest = t + schedule.prepMinutes * 60000;
  const latest = t + horizonHours * 3600000;
  const slots: number[] = [];
  for (const w of openWindows(schedule, now, 1)) {
    const from = Math.max(w.start + schedule.prepMinutes * 60000, earliest);
    const first = Math.ceil(from / (step * 60000)) * step * 60000;
    for (let s = first; s <= Math.min(w.end, latest); s += step * 60000) slots.push(s);
  }
  return slots;
}

/** Server check for a scheduled time: on a 5-minute mark, inside a window, after prep time. */
export function isValidScheduledTime(schedule: Schedule, now: Date, at: number): boolean {
  if (!schedule.acceptingOrders) return false;
  const t = now.getTime();
  if (at < t + (schedule.prepMinutes - 1) * 60000 || at > t + 12 * 3600000) return false;
  return openWindows(schedule, now, 1).some((w) => at >= w.start + schedule.prepMinutes * 60000 - 60000 && at <= w.end);
}

const timeFmt = new Intl.DateTimeFormat('he-IL', { timeZone: STORE_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23', hour12: false });
/** "20:35" in Israel time. */
export const formatTime = (ms: number) => timeFmt.format(new Date(ms)).replace(/^24/, '00');
