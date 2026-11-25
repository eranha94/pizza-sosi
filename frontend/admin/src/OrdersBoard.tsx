import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where, limit } from 'firebase/firestore';
import { API, ORDER_STATUS_LABELS, ORDER_STEPS, COVERAGE_LABELS, formatAgorot, formatTime, type OrderStatus } from '@pizza-sosi/contracts';
import { db, callAdmin } from './firebase';
import { isNew, isLate, dueAt, type AdminOrder, type ActiveOrders } from './orders';
import { useKitchenMode } from './kitchen';
import { SoldOut } from './SoldOut';
import { BusyMode } from './BusyMode';

/** The main forward step for each status (one big button), plus cancel where allowed. */
function nextStep(o: AdminOrder): { to: OrderStatus; label: string } | null {
  switch (o.status) {
    case 'placed':
      return { to: 'accepted', label: '✓ התקבלה' };
    case 'accepted':
      return { to: 'preparing', label: 'התחלת הכנה' };
    case 'preparing':
      return { to: 'almost_ready', label: 'כמעט מוכנה' };
    case 'almost_ready':
      return o.fulfillment === 'delivery' ? { to: 'out_for_delivery', label: '🛵 נאספה ע״י השליח' } : { to: 'ready', label: 'מוכנה לאיסוף' };
    case 'ready':
      return { to: 'completed', label: 'נאספה ע״י הלקוח' };
    case 'out_for_delivery':
      return { to: 'completed', label: 'נמסרה ללקוח' };
    default:
      return null;
  }
}
/** Skip "almost ready" when it's already done. */
function shortcut(o: AdminOrder): { to: OrderStatus; label: string } | null {
  if (o.status !== 'preparing') return null;
  return o.fulfillment === 'delivery' ? { to: 'out_for_delivery', label: 'ישר לשליח' } : { to: 'ready', label: 'ישר למוכנה' };
}
/**
 * "Pressed by mistake": the earlier steps the order can go back to (the server checks the same rule).
 * Not for orders the customer cancelled themselves, nor older than a day.
 */
function correctionTargets(o: AdminOrder): OrderStatus[] {
  const created = o.createdAt?.toMillis?.() ?? 0;
  if (Date.now() - created > 24 * 60 * 60_000) return [];
  const steps = ORDER_STEPS[o.fulfillment] as readonly OrderStatus[];
  if (o.status === 'cancelled') {
    const byCustomer = (o.statusHistory ?? []).some((h) => h.status === 'cancelled' && h.by === 'customer');
    return byCustomer ? [] : [...steps];
  }
  if (o.status === 'completed') return [...steps];
  const i = steps.indexOf(o.status);
  return i > 0 ? steps.slice(0, i) : [];
}

/** Card refund for a cancelled order paid by card (or a payment that needs review). */
function RefundButton({ order }: { order: AdminOrder }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const st = order.payment?.status;
  if (order.paymentMethod !== 'card') return null;
  if (st === 'refunded') return <span className="tag">↩ זוכה</span>;
  if (!((order.status === 'cancelled' && st === 'approved') || st === 'review')) return null;
  async function refund() {
    if (!window.confirm(`לזכות את הלקוח ב-${formatAgorot(order.payment?.paidAgorot ?? order.totalAgorot)} על הזמנה #${order.number}?`)) return;
    setBusy(true);
    setErr(null);
    try {
      await callAdmin(API.adminRefundOrder, { orderId: order.id });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <span>
      <button className="btn btn--danger btn--sm" disabled={busy} onClick={() => void refund()}>{busy ? 'מזכה…' : '💳 זיכוי'}</button>
      {err && <span className="error small" role="alert"> {err}</span>}
    </span>
  );
}

/** The "pressed by mistake" button: opens the earlier steps, one tap puts the order back there. */
function MistakeButton({ order }: { order: AdminOrder }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const targets = correctionTargets(order);
  if (targets.length === 0) return null;
  async function back(to: OrderStatus) {
    setBusy(true);
    setErr(null);
    try {
      await callAdmin(API.adminCorrectOrderStatus, { orderId: order.id, status: to });
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mistake">
      <button className="btn btn--ghost btn--sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        ↩ נלחץ בטעות
      </button>
      {open && (
        <div className="mistake__menu" role="group" aria-label={`להחזיר את הזמנה #${order.number} ל…`}>
          <p className="small">
            להחזיר את #{order.number} ל:
            <span className="muted"> (הלקוח יקבל הודעת התנצלות)</span>
          </p>
          <div className="mistake__options">
            {targets.map((s) => (
              <button key={s} className="btn btn--sm" disabled={busy} onClick={() => void back(s)}>
                {ORDER_STATUS_LABELS[s]}
              </button>
            ))}
            <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => setOpen(false)}>
              סגירה
            </button>
          </div>
          {err && <p className="error small" role="alert">{err}</p>}
        </div>
      )}
    </div>
  );
}

const canCancel = (s: OrderStatus) => s === 'placed' || s === 'accepted' || s === 'preparing' || s === 'almost_ready';

const COLUMNS: { id: string; title: string; match: (o: AdminOrder) => boolean }[] = [
  { id: 'new', title: 'חדשות', match: isNew },
  { id: 'accepted', title: 'התקבלו', match: (o) => o.status === 'accepted' },
  { id: 'preparing', title: 'בהכנה', match: (o) => o.status === 'preparing' },
  { id: 'almost', title: 'כמעט מוכנות', match: (o) => o.status === 'almost_ready' },
  { id: 'ready', title: 'מוכנות לאיסוף / בדרך', match: (o) => o.status === 'ready' || o.status === 'out_for_delivery' },
];

function useNow(ms = 15_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

export function OrdersBoard({ orders, error, late, prepMinutes, store, soundOn, audioReady, toggleSound, testSound }: ActiveOrders) {
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const now = useNow();
  const kitchen = useKitchenMode();
  const [soldOut, setSoldOut] = useState(false);

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
          {kitchen.on && <span className="clock" aria-label="שעה">{new Date(now).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}</span>}
          <BusyMode store={store} prepMinutes={prepMinutes} />
          <button className="chip" onClick={() => setSoldOut(true)}>🚫 נגמר</button>
          <button className={`chip ${kitchen.on ? 'chip--on' : ''}`} onClick={() => void kitchen.toggle()} aria-pressed={kitchen.on}>
            {kitchen.on ? '✕ יציאה ממצב מטבח' : '🍳 מצב מטבח'}
          </button>
          <button className={`chip ${soundOn ? 'chip--on' : ''}`} onClick={toggleSound} aria-pressed={soundOn}>
            {soundOn ? '🔔 צליל פעיל' : '🔕 צליל כבוי'}
          </button>
          {soundOn && <button className="chip" onClick={testSound}>בדיקת צליל</button>}
        </div>
      </div>
      {soundOn && !audioReady && <p className="notice">לחץ בכל מקום בדף כדי לאפשר צליל להזמנות חדשות.</p>}
      {late.length > 0 && (
        <div className="late-alert" role="alert">
          <strong>⏰ {late.length === 1 ? 'הזמנה עברה את זמן ההכנה' : `${late.length} הזמנות עברו את זמן ההכנה`}</strong>
          <span>
            {late.map((o) => `#${o.number}`).join(' · ')} — מוגדר {prepMinutes} דק׳ בדף ״החנות״
          </span>
        </div>
      )}
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
                  <OrderCard key={o.id} order={o} now={now} prepMinutes={prepMinutes} busy={busy === o.id} onMove={(s) => move(o, s)} />
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
      {soldOut && <SoldOut onClose={() => setSoldOut(false)} />}
    </section>
  );
}

function minutesAgo(o: AdminOrder, now: number) {
  const created = o.createdAt?.toMillis?.();
  return created ? Math.max(0, Math.round((now - created) / 60000)) : null;
}

function OrderCard({ order: o, now, prepMinutes, busy, onMove }: { order: AdminOrder; now: number; prepMinutes: number; busy: boolean; onMove: (s: OrderStatus) => void }) {
  const step = nextStep(o);
  const ago = minutesAgo(o, now);
  const late = isLate(o, prepMinutes, now);
  const due = dueAt(o, prepMinutes);
  const over = late && due !== null ? Math.floor((now - due) / 60000) : 0;
  return (
    <li className={`order order--${o.status} ${late ? 'order--late' : ''}`}>
      <div className="order__head">
        <strong className="order__num">#{o.number}</strong>
        <span className="pill">{ORDER_STATUS_LABELS[o.status]}</span>
        {ago !== null && <span className="muted small">לפני {ago} דק׳</span>}
        {late && <span className="tag tag--late">⏰ {over > 0 ? `באיחור ${over} דק׳` : 'הגיע הזמן'}</span>}
        <strong className="order__total">{formatAgorot(o.totalAgorot)}</strong>
      </div>
      <div className="order__meta">
        <span className={`tag ${o.fulfillment === 'delivery' ? 'tag--delivery' : ''}`}>{o.fulfillment === 'pickup' ? '🛍️ איסוף' : '🛵 משלוח'}</span>
        <span className="tag">{o.paymentMethod === 'on_site' ? '💵 תשלום במקום' : `💳 שולם באשראי${o.payment?.cardSuffix ? ` (${o.payment.cardSuffix})` : ''}`}</span>
        {o.payment?.status === 'review' && <span className="tag tag--warn">⚠️ תשלום לבדיקה</span>}
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
          📍 {o.address.zoneName && <strong>{o.address.zoneName} · </strong>}{o.address.street} {o.address.houseNumber}
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
      {(o.discounts ?? []).length > 0 && (
        <ul className="order__discounts">
          {o.discounts!.map((d) => (
            <li key={d.kind + d.label}>{d.kind === 'loyalty' ? '🎁' : d.kind === 'coupon' ? '🏷️' : '🔥'} {d.label} <span dir="ltr">−{formatAgorot(d.amountAgorot)}</span></li>
          ))}
        </ul>
      )}
      <div className="order__actions">
        {step && (
          <button className="btn btn--grow" disabled={busy} onClick={() => onMove(step.to)}>
            {busy ? '…' : step.label}
          </button>
        )}
        {shortcut(o) && (
          <button className="btn btn--ghost btn--sm" disabled={busy} onClick={() => onMove(shortcut(o)!.to)} title="לדלג על כמעט מוכנה">
            {shortcut(o)!.label}
          </button>
        )}
        {canCancel(o.status) && (
          <button className="btn btn--danger" disabled={busy} onClick={() => onMove('cancelled')}>
            ביטול
          </button>
        )}
      </div>
      <MistakeButton order={o} />
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
          <th></th>
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
            <td><MistakeButton order={o} /> <RefundButton order={o} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
