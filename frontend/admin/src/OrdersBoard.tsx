import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where, limit } from 'firebase/firestore';
import { API, ORDER_STATUS_LABELS, COVERAGE_LABELS, formatAgorot, formatTime, type OrderStatus } from '@pizza-sosi/contracts';
import { db, callAdmin } from './firebase';
import { isNew, type AdminOrder, type ActiveOrders } from './orders';

/** The main forward step for each status (one big button), plus cancel where allowed. */
function nextStep(o: AdminOrder): { to: OrderStatus; label: string } | null {
  switch (o.status) {
    case 'paid':
      return { to: 'accepted', label: 'אישור הזמנה' };
    case 'accepted':
      return { to: 'preparing', label: 'התחלת הכנה' };
    case 'preparing':
      return { to: 'ready', label: 'ההזמנה מוכנה' };
    case 'ready':
      return o.fulfillment === 'delivery' ? { to: 'out_for_delivery', label: 'יצאה למשלוח' } : { to: 'completed', label: 'נמסרה ללקוח' };
    case 'out_for_delivery':
      return { to: 'completed', label: 'נמסרה ללקוח' };
    default:
      return null;
  }
}
const canCancel = (s: OrderStatus) => s === 'paid' || s === 'accepted' || s === 'preparing';

const COLUMNS: { id: string; title: string; match: (o: AdminOrder) => boolean }[] = [
  { id: 'new', title: 'חדשות', match: isNew },
  { id: 'preparing', title: 'בהכנה', match: (o) => o.status === 'preparing' },
  { id: 'ready', title: 'מוכנות / במשלוח', match: (o) => o.status === 'ready' || o.status === 'out_for_delivery' },
];

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

export function OrdersBoard({ orders, error, soundOn, audioReady, toggleSound, testSound }: ActiveOrders) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const now = useNow();

  async function move(order: AdminOrder, status: OrderStatus) {
    if (status === 'cancelled' && !window.confirm(`לבטל את הזמנה #${order.number}? הלקוח יראה שההזמנה בוטלה.`)) return;
    setBusy(order.id);
    setActionError(null);
    try {
      await callAdmin(API.adminSetOrderStatus, { orderId: order.id, status });
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="orders-page" aria-labelledby="orders-h">
      <div className="page-head">
        <h1 id="orders-h">הזמנות פעילות <span className="count">{orders.length}</span></h1>
        <div className="page-head__actions">
          <button className={`chip ${soundOn ? 'chip--on' : ''}`} onClick={toggleSound} aria-pressed={soundOn}>
            {soundOn ? '🔔 צליל פעיל' : '🔕 צליל כבוי'}
          </button>
          {soundOn && <button className="chip" onClick={testSound}>בדיקת צליל</button>}
        </div>
      </div>
      {soundOn && !audioReady && <p className="notice">לחץ בכל מקום בדף כדי לאפשר צליל להזמנות חדשות.</p>}
      {(error || actionError) && <p className="error" role="alert">{error ?? actionError}</p>}

      <div className="board">
        {COLUMNS.map((col) => {
          const list = orders.filter(col.match).sort((a, b) => (a.readyAt ?? 0) - (b.readyAt ?? 0));
          return (
            <section key={col.id} className={`board__col board__col--${col.id}`} aria-label={col.title}>
              <h2>
                {col.title} <span className="count">{list.length}</span>
              </h2>
              {list.length === 0 && <p className="muted empty">אין כרגע</p>}
              <ul className="orders">
                {list.map((o) => (
                  <OrderCard key={o.id} order={o} now={now} busy={busy === o.id} onMove={(s) => move(o, s)} />
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      <button className="link-btn" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory}>
        {showHistory ? 'הסתרת הזמנות שהסתיימו' : 'הזמנות שהסתיימו לאחרונה'}
      </button>
      {showHistory && <History />}
    </section>
  );
}

function minutesAgo(o: AdminOrder, now: number) {
  const created = o.createdAt?.toMillis?.();
  return created ? Math.max(0, Math.round((now - created) / 60000)) : null;
}

function OrderCard({ order: o, now, busy, onMove }: { order: AdminOrder; now: number; busy: boolean; onMove: (s: OrderStatus) => void }) {
  const step = nextStep(o);
  const ago = minutesAgo(o, now);
  const late = o.readyAt !== undefined && o.readyAt < now && (o.status === 'accepted' || o.status === 'paid' || o.status === 'preparing');
  return (
    <li className={`order order--${o.status} ${late ? 'order--late' : ''}`}>
      <div className="order__head">
        <strong className="order__num">#{o.number}</strong>
        <span className="pill">{ORDER_STATUS_LABELS[o.status]}</span>
        {ago !== null && <span className="muted small">לפני {ago} דק׳</span>}
        <strong className="order__total">{formatAgorot(o.totalAgorot)}</strong>
      </div>
      <div className="order__meta">
        <span className={`tag ${o.fulfillment === 'delivery' ? 'tag--delivery' : ''}`}>{o.fulfillment === 'pickup' ? '🛍️ איסוף' : '🛵 משלוח'}</span>
        <span className="tag">{o.paymentMethod === 'on_site' ? '💵 תשלום במקום' : '💳 שולם באשראי'}</span>
        {o.readyAt && (
          <span className={`tag ${o.scheduled ? 'tag--scheduled' : ''} ${late ? 'tag--late' : ''}`}>
            {o.scheduled ? '⏰ מתוזמנת ל־' : 'מוכן עד '}
            {formatTime(o.readyAt)}
          </span>
        )}
      </div>
      <p className="order__customer">
        {o.customerName} ·{' '}
        <a href={`tel:${o.contact?.phone ?? ''}`} dir="ltr">
          {o.contact?.phone}
        </a>
      </p>
      {o.address && (
        <p className="order__address">
          📍 {o.address.street} {o.address.houseNumber}
          {o.address.apartment && `, דירה ${o.address.apartment}`}
          {o.address.notes && ` · ${o.address.notes}`}
        </p>
      )}
      <ul className="order__lines">
        {o.lines.map((l, i) => (
          <li key={i}>
            <strong>{l.quantity} ×</strong> {l.name}
            {l.addOns.length > 0 && (
              <ul className="order__addons">
                {l.addOns.map((a, j) => (
                  <li key={j}>
                    {a.name}
                    {a.coverage && a.coverage !== 'whole' && <span className="half"> · {COVERAGE_LABELS[a.coverage]}</span>}
                  </li>
                ))}
              </ul>
            )}
            {l.note && <em className="order__note"> ✎ {l.note}</em>}
          </li>
        ))}
      </ul>
      {o.note && <p className="order__note">הערה להזמנה: {o.note}</p>}
      <div className="order__actions">
        {step && (
          <button className="btn btn--grow" disabled={busy} onClick={() => onMove(step.to)}>
            {busy ? '…' : step.label}
          </button>
        )}
        {canCancel(o.status) && (
          <button className="btn btn--danger" disabled={busy} onClick={() => onMove('cancelled')}>
            ביטול
          </button>
        )}
      </div>
    </li>
  );
}

function History() {
  const [list, setList] = useState<AdminOrder[] | null>(null);
  useEffect(() => {
    const q = query(collection(db, 'orders'), where('status', 'in', ['completed', 'cancelled']), orderBy('createdAt', 'desc'), limit(40));
    return onSnapshot(
      q,
      (snap) => setList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AdminOrder, 'id'>) }))),
      () => setList([]),
    );
  }, []);
  if (!list) return <p className="muted">טוען…</p>;
  if (!list.length) return <p className="muted">אין עדיין הזמנות שהסתיימו.</p>;
  return (
    <table className="history">
      <thead>
        <tr>
          <th>#</th>
          <th>תאריך</th>
          <th>לקוח</th>
          <th>סוג</th>
          <th>סכום</th>
          <th>סטטוס</th>
        </tr>
      </thead>
      <tbody>
        {list.map((o) => (
          <tr key={o.id} className={o.status === 'cancelled' ? 'is-cancelled' : ''}>
            <td>{o.number}</td>
            <td>{o.createdAt ? new Date(o.createdAt.toMillis()).toLocaleString('he-IL', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</td>
            <td>{o.customerName}</td>
            <td>{o.fulfillment === 'pickup' ? 'איסוף' : 'משלוח'}</td>
            <td>{formatAgorot(o.totalAgorot)}</td>
            <td>{ORDER_STATUS_LABELS[o.status]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
