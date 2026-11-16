import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, orderBy, query, where, Timestamp } from 'firebase/firestore';
import { formatAgorot, localParts, zonedToEpoch } from '@pizza-sosi/contracts';
import { db } from './firebase';
import type { AdminOrder } from './orders';

/** Sales for one day (Israel time): totals, payment / pickup split, best sellers and busy hours. */
export function SalesSummary() {
  const today = localParts(new Date()).date;
  const [date, setDate] = useState(today);
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const from = Timestamp.fromMillis(zonedToEpoch(date, 0));
    const to = Timestamp.fromMillis(zonedToEpoch(date, 24 * 60));
    (async () => {
      setOrders(null);
      setError(null);
      try {
        const snap = await getDocs(query(collection(db, 'orders'), where('createdAt', '>=', from), where('createdAt', '<', to), orderBy('createdAt')));
        if (!cancelled) setOrders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AdminOrder, 'id'>) })));
      } catch {
        if (!cancelled) setError('לא הצלחנו לטעון את ההזמנות');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [date]);

  const s = useMemo(() => {
    if (!orders) return null;
    const real = orders.filter((o) => o.status !== 'pending_payment');
    const done = real.filter((o) => o.status !== 'cancelled');
    const sum = (list: AdminOrder[]) => list.reduce((n, o) => n + o.totalAgorot, 0);
    const items = new Map<string, number>();
    for (const o of done) for (const l of o.lines) items.set(l.name, (items.get(l.name) ?? 0) + l.quantity);
    const hours = new Array<number>(24).fill(0);
    for (const o of done) {
      const ms = o.createdAt?.toMillis?.();
      if (ms) hours[Math.floor(localParts(new Date(ms)).minutes / 60)]!++;
    }
    return {
      count: done.length,
      cancelled: real.length - done.length,
      revenue: sum(done),
      avg: done.length ? Math.round(sum(done) / done.length) : 0,
      card: sum(done.filter((o) => o.paymentMethod === 'card')),
      onSite: sum(done.filter((o) => o.paymentMethod === 'on_site')),
      pickup: done.filter((o) => o.fulfillment === 'pickup').length,
      delivery: done.filter((o) => o.fulfillment === 'delivery').length,
      top: [...items].sort((a, b) => b[1] - a[1]).slice(0, 8),
      hours,
    };
  }, [orders]);

  const maxHour = s ? Math.max(1, ...s.hours) : 1;
  const firstHour = s ? s.hours.findIndex((n) => n > 0) : -1;
  const lastHour = s ? 23 - [...s.hours].reverse().findIndex((n) => n > 0) : -1;

  return (
    <section className="summary-page" aria-labelledby="sum-h">
      <div className="page-head">
        <h1 id="sum-h">סיכום יומי</h1>
        <label className="field field--inline">
          <span>תאריך</span>
          <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} />
        </label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {!s && !error && <p className="muted">טוען…</p>}
      {s && (
        <>
          <div className="kpis">
            <div className="kpi kpi--main"><span>הכנסות</span><strong>{formatAgorot(s.revenue)}</strong></div>
            <div className="kpi"><span>הזמנות</span><strong>{s.count}</strong></div>
            <div className="kpi"><span>ממוצע להזמנה</span><strong>{formatAgorot(s.avg)}</strong></div>
            <div className="kpi"><span>בוטלו</span><strong>{s.cancelled}</strong></div>
          </div>
          <div className="store-grid">
            <section className="card">
              <h2>פילוח</h2>
              <ul className="split">
                <li><span>💳 אשראי</span><strong>{formatAgorot(s.card)}</strong></li>
                <li><span>💵 תשלום במקום</span><strong>{formatAgorot(s.onSite)}</strong></li>
                <li><span>🛍️ איסוף</span><strong>{s.pickup}</strong></li>
                <li><span>🛵 משלוח</span><strong>{s.delivery}</strong></li>
              </ul>
            </section>
            <section className="card">
              <h2>הנמכרים ביותר</h2>
              {s.top.length === 0 ? <p className="muted">אין הזמנות ביום הזה.</p> : (
                <ol className="top">
                  {s.top.map(([name, q]) => <li key={name}><span>{name}</span><strong>{q}</strong></li>)}
                </ol>
              )}
            </section>
            {firstHour >= 0 && (
              <section className="card">
                <h2>שעות עומס</h2>
                <ul className="hours" aria-label="הזמנות לפי שעה">
                  {s.hours.slice(firstHour, lastHour + 1).map((n, i) => (
                    <li key={i} title={`${firstHour + i}:00 – ${n} הזמנות`}>
                      <span className="hours__bar" style={{ blockSize: `${(n / maxHour) * 100}%` }} />
                      <span className="hours__n">{n || ''}</span>
                      <span className="hours__h">{firstHour + i}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </>
      )}
    </section>
  );
}
