import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, orderBy, query, where, Timestamp } from 'firebase/firestore';
import { formatAgorot, localParts, zonedToEpoch, WEEKDAY_NAMES, COVERAGE_LABELS } from '@pizza-sosi/contracts';
import { db } from './firebase';
import type { AdminOrder } from './orders';

/*
 * Reports for the owner: any period (today, yesterday, 7 / 30 days, this month, or a custom range),
 * compared with the period just before it. Sales, payment / pickup split, delivery zones,
 * best-selling dishes and toppings, busy hours, weekdays, sales per day, and a CSV export.
 */

type Preset = 'today' | 'yesterday' | 'week' | 'month30' | 'thisMonth' | 'custom';
const PRESETS: { id: Preset; label: string }[] = [
  { id: 'today', label: 'היום' },
  { id: 'yesterday', label: 'אתמול' },
  { id: 'week', label: '7 ימים' },
  { id: 'month30', label: '30 ימים' },
  { id: 'thisMonth', label: 'החודש' },
  { id: 'custom', label: 'טווח…' },
];
const DAY = 86_400_000;
const MAX_DAYS = 92;

/** yyyy-mm-dd of the day `n` days from `date` (Israel time). */
function addDays(date: string, n: number) {
  return localParts(new Date(zonedToEpoch(date, 12 * 60) + n * DAY)).date;
}
function daysBetween(from: string, to: string) {
  return Math.round((zonedToEpoch(to, 12 * 60) - zonedToEpoch(from, 12 * 60)) / DAY) + 1;
}
function rangeFor(p: Preset, today: string, custom: { from: string; to: string }) {
  switch (p) {
    case 'today': return { from: today, to: today };
    case 'yesterday': return { from: addDays(today, -1), to: addDays(today, -1) };
    case 'week': return { from: addDays(today, -6), to: today };
    case 'month30': return { from: addDays(today, -29), to: today };
    case 'thisMonth': return { from: `${today.slice(0, 8)}01`, to: today };
    case 'custom': return custom;
  }
}
const shortDate = (date: string) => `${Number(date.slice(8))}.${Number(date.slice(5, 7))}`;

async function loadOrders(from: string, to: string): Promise<AdminOrder[]> {
  const snap = await getDocs(
    query(
      collection(db, 'orders'),
      where('createdAt', '>=', Timestamp.fromMillis(zonedToEpoch(from, 0))),
      where('createdAt', '<', Timestamp.fromMillis(zonedToEpoch(addDays(to, 1), 0))),
      orderBy('createdAt'),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AdminOrder, 'id'>) }));
}

function stats(orders: AdminOrder[], from: string, to: string) {
  const real = orders.filter((o) => o.status !== 'pending_payment');
  const done = real.filter((o) => o.status !== 'cancelled');
  const sum = (list: AdminOrder[]) => list.reduce((n, o) => n + o.totalAgorot, 0);
  const items = new Map<string, { q: number; agorot: number }>();
  const toppings = new Map<string, number>();
  const zones = new Map<string, { n: number; agorot: number }>();
  const hours = new Array<number>(24).fill(0);
  const weekdays = new Array<number>(7).fill(0);
  const days = new Map<string, number>();
  for (let d = from; d <= to; d = addDays(d, 1)) days.set(d, 0);
  for (const o of done) {
    for (const l of o.lines) {
      const it = items.get(l.name) ?? { q: 0, agorot: 0 };
      it.q += l.quantity;
      items.set(l.name, it);
      for (const a of l.addOns) if (a.coverage !== undefined && a.coverage !== null) toppings.set(a.name, (toppings.get(a.name) ?? 0) + l.quantity * (a.coverage === 'whole' ? 1 : 0.5));
    }
    // Order total spread over its dishes by quantity – good enough to rank dishes by money too.
    const qty = o.lines.reduce((n, l) => n + l.quantity, 0) || 1;
    for (const l of o.lines) items.get(l.name)!.agorot += Math.round((o.totalAgorot * l.quantity) / qty);
    if (o.fulfillment === 'delivery') {
      const z = o.address?.zoneName || 'ללא אזור';
      const cur = zones.get(z) ?? { n: 0, agorot: 0 };
      zones.set(z, { n: cur.n + 1, agorot: cur.agorot + o.totalAgorot });
    }
    const ms = o.createdAt?.toMillis?.();
    if (ms) {
      const p = localParts(new Date(ms));
      hours[Math.floor(p.minutes / 60)]!++;
      weekdays[p.weekday]!++;
      days.set(p.date, (days.get(p.date) ?? 0) + o.totalAgorot);
    }
  }
  const revenue = sum(done);
  return {
    count: done.length,
    cancelled: real.length - done.length,
    revenue,
    avg: done.length ? Math.round(revenue / done.length) : 0,
    card: sum(done.filter((o) => o.paymentMethod === 'card')),
    onSite: sum(done.filter((o) => o.paymentMethod === 'on_site')),
    pickup: done.filter((o) => o.fulfillment === 'pickup').length,
    delivery: done.filter((o) => o.fulfillment === 'delivery').length,
    top: [...items].sort((a, b) => b[1].q - a[1].q).slice(0, 10),
    toppings: [...toppings].sort((a, b) => b[1] - a[1]).slice(0, 8),
    zones: [...zones].sort((a, b) => b[1].agorot - a[1].agorot),
    hours,
    weekdays,
    days: [...days],
    done,
  };
}

/** "+12%" / "−5%" next to a number, against the period before. */
function Delta({ now, before, money }: { now: number; before: number; money?: boolean }) {
  if (before === 0 && now === 0) return null;
  if (before === 0) return <span className="delta delta--up">חדש</span>;
  const pct = Math.round(((now - before) / before) * 100);
  const cls = pct > 0 ? 'delta--up' : pct < 0 ? 'delta--down' : '';
  return (
    <span className={`delta ${cls}`} title={`בתקופה הקודמת: ${money ? formatAgorot(before) : before}`}>
      {pct > 0 ? '▲' : pct < 0 ? '▼' : ''} {Math.abs(pct)}%
    </span>
  );
}

/** Plain bar chart (one series, one colour): each bar has its value on hover and a hidden table for screen readers. */
function Bars({ label, data, format = String }: { label: string; data: { key: string; label: string; value: number; title?: string }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const dense = data.length > 16;
  return (
    <>
      <ul className={`bars ${dense ? 'bars--dense' : ''}`} aria-hidden="true">
        {data.map((d) => (
          <li key={d.key} title={`${d.title ?? d.label}: ${format(d.value)}`}>
            <span className="bars__n">{!dense && d.value ? format(d.value) : ''}</span>
            <span className="bars__bar" style={{ blockSize: `${(d.value / max) * 100}%` }} />
            <span className="bars__x">{d.label}</span>
          </li>
        ))}
      </ul>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}><th scope="row">{d.title ?? d.label}</th><td>{format(d.value)}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function downloadCsv(orders: AdminOrder[], from: string, to: string) {
  const cell = (v: unknown) => {
    const s = String(v ?? '');
    // Excel: a cell starting with = + - @ would run as a formula.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const head = ['מספר', 'תאריך', 'שעה', 'סטטוס', 'לקוח', 'טלפון', 'קבלה', 'אזור', 'תשלום', 'סכום (₪)', 'פריטים'];
  const rows = orders.map((o) => {
    const ms = o.createdAt?.toMillis?.() ?? 0;
    const p = localParts(new Date(ms));
    const time = `${String(Math.floor(p.minutes / 60)).padStart(2, '0')}:${String(p.minutes % 60).padStart(2, '0')}`;
    const lines = o.lines
      .map((l) => `${l.quantity}× ${l.name}${l.addOns.length ? ` (${l.addOns.map((a) => (a.coverage && a.coverage !== 'whole' ? `${a.name} ${COVERAGE_LABELS[a.coverage]}` : a.name)).join(', ')})` : ''}`)
      .join(' | ');
    return [o.number, p.date, time, o.status, o.customerName, o.contact?.phone, o.fulfillment === 'delivery' ? 'משלוח' : 'איסוף', o.address?.zoneName, o.paymentMethod === 'card' ? 'אשראי' : 'במקום', (o.totalAgorot / 100).toFixed(2), lines];
  });
  const csv = '﻿' + [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `pizza-sosi-orders-${from}_${to}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SalesSummary() {
  const today = localParts(new Date()).date;
  const [preset, setPreset] = useState<Preset>('today');
  const [custom, setCustom] = useState({ from: addDays(today, -6), to: today });
  const { from, to } = rangeFor(preset, today, custom);
  const days = daysBetween(from, to);
  const valid = from <= to && days <= MAX_DAYS;
  const [data, setData] = useState<{ key: string; now: AdminOrder[]; before: AdminOrder[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = `${from}|${to}`;

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    // The period just before, same length – for the ▲▼ comparison.
    const prevTo = addDays(from, -1);
    const prevFrom = addDays(prevTo, -(days - 1));
    Promise.all([loadOrders(from, to), loadOrders(prevFrom, prevTo)])
      .then(([now, before]) => !cancelled && (setData({ key: `${from}|${to}`, now, before }), setError(null)))
      .catch(() => !cancelled && setError('לא הצלחנו לטעון את ההזמנות'));
    return () => {
      cancelled = true;
    };
  }, [from, to, days, valid]);

  const ready = data?.key === key ? data : null;
  const s = useMemo(() => (ready ? stats(ready.now, from, to) : null), [ready, from, to]);
  const prev = useMemo(() => (ready ? stats(ready.before, addDays(from, -days), addDays(from, -1)) : null), [ready, from, days]);

  const firstHour = s ? s.hours.findIndex((n) => n > 0) : -1;
  const lastHour = s ? 23 - [...s.hours].reverse().findIndex((n) => n > 0) : -1;
  const periodName = days === 1 ? 'אתמול באותו יום' : `${days} הימים הקודמים`;

  return (
    <section className="summary-page" aria-labelledby="sum-h">
      <div className="page-head">
        <h1 id="sum-h">דוחות</h1>
        {s && s.done.length > 0 && (
          <button type="button" className="btn btn--ghost" onClick={() => downloadCsv(ready!.now, from, to)}>⬇️ הורדה לאקסל (CSV)</button>
        )}
      </div>

      <div className="period" role="group" aria-label="תקופה">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className={`chip ${preset === p.id ? 'chip--on' : ''}`} aria-pressed={preset === p.id} onClick={() => setPreset(p.id)}>
            {p.label}
          </button>
        ))}
      </div>
      {preset === 'custom' && (
        <div className="period__custom">
          <label className="field field--inline"><span>מ־</span><input type="date" value={custom.from} max={today} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))} /></label>
          <label className="field field--inline"><span>עד</span><input type="date" value={custom.to} max={today} onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))} /></label>
          {!valid && <p className="error" role="alert">{from > to ? 'תאריך ההתחלה אחרי תאריך הסיום' : `אפשר עד ${MAX_DAYS} ימים בדוח אחד`}</p>}
        </div>
      )}
      <p className="muted small">{days === 1 ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)} · ${days} ימים`} · ההשוואה (▲▼) מול {periodName}</p>

      {error && <p className="error" role="alert">{error}</p>}
      {valid && !s && !error && <p className="muted" role="status">טוען…</p>}
      {s && prev && (
        <>
          <div className="kpis">
            <div className="kpi kpi--main"><span>הכנסות</span><strong>{formatAgorot(s.revenue)}</strong><Delta now={s.revenue} before={prev.revenue} money /></div>
            <div className="kpi"><span>הזמנות</span><strong>{s.count}</strong><Delta now={s.count} before={prev.count} /></div>
            <div className="kpi"><span>ממוצע להזמנה</span><strong>{formatAgorot(s.avg)}</strong><Delta now={s.avg} before={prev.avg} money /></div>
            <div className="kpi"><span>בוטלו</span><strong>{s.cancelled}</strong></div>
          </div>

          {s.count === 0 ? (
            <p className="muted">אין הזמנות בתקופה הזאת.</p>
          ) : (
            <div className="store-grid">
              {days > 1 && (
                <section className="card card--wide">
                  <h2>הכנסות לפי יום</h2>
                  <Bars
                    label="הכנסות לפי יום"
                    data={s.days.map(([d, v]) => ({ key: d, label: shortDate(d), title: `${WEEKDAY_NAMES[localParts(new Date(zonedToEpoch(d, 720))).weekday]} ${shortDate(d)}`, value: v }))}
                    format={formatAgorot}
                  />
                </section>
              )}
              <section className="card">
                <h2>פילוח</h2>
                <ul className="split">
                  <li><span>💳 אשראי</span><strong>{formatAgorot(s.card)}</strong></li>
                  <li><span>💵 תשלום במקום</span><strong>{formatAgorot(s.onSite)}</strong></li>
                  <li><span>🛍️ איסוף</span><strong>{s.pickup}</strong></li>
                  <li><span>🛵 משלוח</span><strong>{s.delivery}</strong></li>
                </ul>
              </section>
              {s.zones.length > 0 && (
                <section className="card">
                  <h2>משלוחים לפי אזור</h2>
                  <ul className="split">
                    {s.zones.map(([z, v]) => (
                      <li key={z}><span>{z} <small className="muted">· {v.n} הזמנות</small></span><strong>{formatAgorot(v.agorot)}</strong></li>
                    ))}
                  </ul>
                </section>
              )}
              <section className="card">
                <h2>המנות הנמכרות ביותר</h2>
                <ol className="top">
                  {s.top.map(([name, v]) => (
                    <li key={name}><span>{name}</span><small className="muted">{formatAgorot(v.agorot)}</small><strong>{v.q}</strong></li>
                  ))}
                </ol>
              </section>
              {s.toppings.length > 0 && (
                <section className="card">
                  <h2>התוספות הפופולריות</h2>
                  <ol className="top">
                    {s.toppings.map(([name, n]) => (
                      <li key={name}><span>{name}</span><strong title="חצי פיצה נספר כחצי">{Number.isInteger(n) ? n : n.toFixed(1)}</strong></li>
                    ))}
                  </ol>
                </section>
              )}
              {firstHour >= 0 && (
                <section className="card">
                  <h2>שעות עומס</h2>
                  <Bars
                    label="הזמנות לפי שעה"
                    data={s.hours.slice(firstHour, lastHour + 1).map((n, i) => ({ key: String(firstHour + i), label: String(firstHour + i), title: `${firstHour + i}:00`, value: n }))}
                  />
                </section>
              )}
              {days >= 7 && (
                <section className="card">
                  <h2>לפי יום בשבוע</h2>
                  <Bars label="הזמנות לפי יום בשבוע" data={s.weekdays.map((n, i) => ({ key: String(i), label: ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'][i]!, title: WEEKDAY_NAMES[i], value: n }))} />
                </section>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
