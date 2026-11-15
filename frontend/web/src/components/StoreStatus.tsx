import { useId, useState } from 'react';
import { storeStatus, formatTime, localParts, hoursFor, zonedToEpoch, WEEKDAY_NAMES, type StoreStatus as Status } from '@pizza-sosi/contracts/constants';
import type { StoreSettings } from '@pizza-sosi/contracts';
import { useStoreSettings, useNow } from '../lib/menu';

/*
 * The pizzeria's "oven": lit with moving flames while open, glowing embers while closed.
 * Tells the customer at a glance whether they can order now, until when, and how long it takes.
 */

export function useStoreStatus(): { status: Status | null; prepMinutes: number } {
  const store = useStoreSettings();
  const now = useNow();
  // Unknown (still loading or offline): show nothing and let the server decide.
  if (!store.data) return { status: null, prepMinutes: 25 };
  return { status: storeStatus(store.data, now), prepMinutes: store.data.prepMinutes };
}

function dayWord(ms: number) {
  const now = localParts(new Date());
  const d = localParts(new Date(ms));
  if (d.date === now.date) return 'היום';
  const tomorrow = localParts(new Date(Date.now() + 86400000));
  if (d.date === tomorrow.date) return 'מחר';
  return `ביום ${['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][d.weekday]}`;
}

export function StoreStatusCard() {
  const { status, prepMinutes } = useStoreStatus();
  const store = useStoreSettings();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  if (!status || !store.data) return null;

  const isOpen = status.state === 'open';
  const closingSoon = isOpen && status.minutesLeft <= 45;
  let title: string;
  let line: string;
  if (status.state === 'open') {
    title = closingSoon ? `נסגרים בעוד ${status.minutesLeft} דק׳` : 'פתוח עכשיו';
    line = `מקבלים הזמנות עד ${formatTime(status.closesAt)} · מוכן תוך כ-${prepMinutes} דק׳`;
  } else if (status.state === 'paused') {
    title = 'לא מקבלים הזמנות כרגע';
    line = 'אפשר להתקשר אלינו: 054-8880909';
  } else {
    title = 'סגור כרגע';
    line = status.opensAt ? `נפתח ${dayWord(status.opensAt)} ב-${formatTime(status.opensAt)}${status.opensToday ? ' · אפשר כבר להזמין מראש' : ''}` : 'נעדכן שעות בקרוב';
  }

  return (
    <section className={`oven-card ${isOpen ? 'is-open' : 'is-closed'} ${closingSoon ? 'is-soon' : ''} ${open ? 'is-expanded' : ''}`}>
      <button type="button" className="oven-card__head" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
        <Oven lit={isOpen} />
        <span className="oven-card__text" role="status" aria-live="polite">
          <strong>{title}</strong>
          <span>{line}</span>
          {closingSoon && status.state === 'open' && (
            <span className="oven-card__bar" aria-hidden="true">
              <span style={{ transform: `scaleX(${Math.max(0.04, status.minutesLeft / 45)})` }} />
            </span>
          )}
        </span>
        <span className="oven-card__more">
          שעות
          <svg className="oven-card__chev" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      </button>
      <div id={panelId} className="oven-card__panel" role="region" aria-label="ימים ושעות פעילות">
        <div className="oven-card__panel-inner">
          <WeekHours schedule={store.data} />
        </div>
      </div>
    </section>
  );
}

/** Small dot for the header: green pulse when open. */
export function StoreDot() {
  const { status } = useStoreStatus();
  if (!status) return null;
  const open = status.state === 'open';
  return <span className={`store-dot ${open ? 'is-open' : ''}`} title={open ? 'פתוח עכשיו' : 'סגור כרגע'} aria-label={open ? 'פתוח עכשיו' : 'סגור כרגע'} role="img" />;
}

function Oven({ lit }: { lit: boolean }) {
  return (
    <svg className="oven" viewBox="0 0 64 56" width="64" height="56" aria-hidden="true">
      <defs>
        <radialGradient id="oven-glow" cx="50%" cy="80%" r="60%">
          <stop offset="0%" stopColor="#ffd36b" />
          <stop offset="55%" stopColor="#ff7a1a" />
          <stop offset="100%" stopColor="#7a1d00" />
        </radialGradient>
        <linearGradient id="oven-brick" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#b5562e" />
          <stop offset="100%" stopColor="#7d3417" />
        </linearGradient>
      </defs>
      {/* dome */}
      <path d="M4 52 V30 A28 26 0 0 1 60 30 V52 Z" fill="url(#oven-brick)" />
      <path d="M10 22 h8 M24 12 h8 M40 13 h8 M48 24 h7 M6 36 h6 M53 38 h6" stroke="#5e2410" strokeWidth="1.4" strokeLinecap="round" opacity=".55" />
      {/* mouth */}
      <path d="M17 52 V40 A15 13 0 0 1 47 40 V52 Z" fill={lit ? 'url(#oven-glow)' : '#2a1610'} className="oven__mouth" />
      {lit ? (
        <g className="oven__flames">
          <path className="flame f1" d="M25 52 C22 47 26 44 25 39 C29 42 31 47 29 52 Z" fill="#ffb02e" />
          <path className="flame f2" d="M31 52 C28 45 33 41 32 34 C37 39 38 46 35 52 Z" fill="#ffd45e" />
          <path className="flame f3" d="M37 52 C35 47 39 44 39 40 C42 43 43 48 41 52 Z" fill="#ff8a1f" />
        </g>
      ) : (
        <g className="oven__embers">
          <circle cx="26" cy="50" r="1.6" fill="#ff6a1a" />
          <circle cx="32" cy="50.5" r="1.3" fill="#ff8a2a" />
          <circle cx="38" cy="50" r="1.5" fill="#ff5a14" />
        </g>
      )}
      <rect x="2" y="51" width="60" height="4" rx="2" fill="#4a1e0c" />
    </svg>
  );
}

/** Sunday → Saturday for the coming week, with today highlighted and one-day changes shown. */
function WeekHours({ schedule }: { schedule: StoreSettings }) {
  const today = localParts(new Date());
  const rows = Array.from({ length: 7 }, (_, i) => {
    // the date of weekday i within the next 7 days (today included)
    const ahead = (i - today.weekday + 7) % 7;
    const date = localParts(new Date(zonedToEpoch(today.date, 12 * 60) + ahead * 86400000)).date;
    const h = hoursFor(schedule, date);
    const regular = schedule.weeklyHours[i] ?? null;
    const changed = schedule.overrides?.some((o) => o.date === date) ?? false;
    return { i, h, regular, changed, isToday: ahead === 0 };
  });
  return (
    <ul className="week">
      {rows.map(({ i, h, changed, isToday }) => (
        <li key={i} className={`${isToday ? 'is-today' : ''} ${h ? '' : 'is-off'}`}>
          <span className="week__day">
            {WEEKDAY_NAMES[i]}
            {isToday && <span className="week__badge">היום</span>}
          </span>
          <span className="week__dots" aria-hidden="true" />
          <span className="week__hours" dir="ltr">
            {h ? `${h.open} – ${h.close}` : 'סגור'}
          </span>
          {changed && <span className="week__note">שינוי השבוע</span>}
        </li>
      ))}
    </ul>
  );
}
