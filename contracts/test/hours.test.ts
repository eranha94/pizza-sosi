import { describe, it, expect } from 'vitest';
import { DEFAULT_SCHEDULE, storeStatus, orderSlots, isValidScheduledTime, zonedToEpoch, localParts, formatTime, type Schedule } from '../src/hours.js';

// 2026-11-15 is a Sunday, Israel winter time (UTC+2)
const at = (iso: string) => new Date(iso);
const s: Schedule = { ...DEFAULT_SCHEDULE }; // every day 11:00–00:00, prep 25

describe('zoned time', () => {
  it('converts Israel local time to an instant, incl. summer time', () => {
    expect(new Date(zonedToEpoch('2026-11-15', 11 * 60)).toISOString()).toBe('2026-11-15T09:00:00.000Z');
    expect(new Date(zonedToEpoch('2026-07-01', 11 * 60)).toISOString()).toBe('2026-07-01T08:00:00.000Z');
    expect(localParts(at('2026-11-15T22:30:00Z'))).toEqual({ date: '2026-11-16', weekday: 1, minutes: 30 });
  });
});

describe('storeStatus', () => {
  it('open in the evening, closes at midnight', () => {
    const st = storeStatus(s, at('2026-11-15T20:30:00Z')); // 22:30
    expect(st.state).toBe('open');
    if (st.state === 'open') {
      expect(formatTime(st.closesAt)).toBe('00:00');
      expect(st.minutesLeft).toBe(90);
    }
  });
  it('closed in the morning, opens today at 11:00', () => {
    const st = storeStatus(s, at('2026-11-15T07:00:00Z')); // 09:00
    expect(st).toMatchObject({ state: 'closed', opensToday: true });
    if (st.state === 'closed') expect(formatTime(st.opensAt!)).toBe('11:00');
  });
  it('after midnight belongs to yesterday when closing late', () => {
    const late: Schedule = { ...s, weeklyHours: s.weeklyHours.map(() => ({ open: '18:00', close: '02:00' })) as Schedule['weeklyHours'] };
    expect(storeStatus(late, at('2026-11-15T23:30:00Z')).state).toBe('open'); // 01:30 Monday, Sunday's window
    expect(storeStatus(late, at('2026-11-16T00:30:00Z')).state).toBe('closed'); // 02:30
  });
  it('closed days and one-day overrides', () => {
    const satClosed: Schedule = { ...s, weeklyHours: [...s.weeklyHours.slice(0, 6), null] as Schedule['weeklyHours'] };
    expect(storeStatus(satClosed, at('2026-11-14T12:00:00Z')).state).toBe('closed'); // Saturday 14:00
    const early: Schedule = { ...s, overrides: [{ date: '2026-11-15', close: '21:00' }] };
    expect(storeStatus(early, at('2026-11-15T19:30:00Z')).state).toBe('closed'); // 21:30
    const shut: Schedule = { ...s, overrides: [{ date: '2026-11-15', closed: true }] };
    expect(storeStatus(shut, at('2026-11-15T12:00:00Z')).state).toBe('closed');
  });
  it('manual pause wins', () => expect(storeStatus({ ...s, acceptingOrders: false }, at('2026-11-15T12:00:00Z')).state).toBe('paused'));
});

describe('scheduled orders', () => {
  it('offers 15-minute slots from now + prep until closing', () => {
    const slots = orderSlots(s, at('2026-11-15T19:52:00Z')); // 21:52 → first 22:30 (21:52+25=22:17 → 22:30)
    expect(formatTime(slots[0]!)).toBe('22:30');
    expect(formatTime(slots.at(-1)!)).toBe('00:00');
  });
  it('before opening: slots start at opening + prep', () => {
    const slots = orderSlots(s, at('2026-11-15T07:00:00Z')); // 09:00
    expect(formatTime(slots[0]!)).toBe('11:30');
  });
  it('server accepts offered slots, rejects too early / closed times', () => {
    const now = at('2026-11-15T19:52:00Z');
    for (const slot of orderSlots(s, now)) expect(isValidScheduledTime(s, now, slot)).toBe(true);
    expect(isValidScheduledTime(s, now, now.getTime() + 5 * 60000)).toBe(false);
    expect(isValidScheduledTime(s, now, zonedToEpoch('2026-11-16', 9 * 60))).toBe(false); // 09:00 tomorrow, closed
  });
});
