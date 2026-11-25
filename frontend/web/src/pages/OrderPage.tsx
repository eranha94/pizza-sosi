import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { CORRECTION_STATUS_TEXT, OrderView, ORDER_STATUS_LABELS, ORDER_STEPS, formatAgorot, formatTime, type OrderView as Order } from '@pizza-sosi/contracts';
import { useNow, useMenu } from '../lib/menu';
import { useCart } from '../store/cart';
import { services, ensureSignedIn } from '../lib/firebase';
import { cancelOrder, getOrderStatus, getLoyalty, errorMessage } from '../lib/api';
import { LoyaltyCard } from '../components/Loyalty';
import { payingOrder } from '../config/payments';
import { useLoyaltyRules } from '../lib/promos';
import type { LoyaltyCardView } from '@pizza-sosi/contracts';
import { usePageTitle } from '../lib/a11y';
import { Oven } from '../components/StoreStatus';

export default function OrderPage() {
  const { orderId = '' } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  /** false when the page was opened on another device (tracking only). */
  const [mine, setMine] = useState(true);
  /** Loyalty card: from the tracking call, or looked up by the order's phone on the ordering device. */
  const [card, setCard] = useState<LoyaltyCardView | null>(null);
  const [phone, setPhone] = useState('');

  useEffect(() => {
    let unsub = () => {};
    let timer = 0;
    let stopped = false;
    // Another device (e.g. the link from WhatsApp): read-only tracking through the server, refreshed every 15 s.
    const track = async () => {
      try {
        const o = await getOrderStatus(orderId);
        if (stopped) return;
        setOrder(o);
        setMine(o.mine);
        setCard(o.loyalty ?? null);
        setState('ready');
        if (!['completed', 'cancelled'].includes(o.status)) timer = window.setTimeout(track, 15_000);
      } catch {
        if (!stopped) setState('missing');
      }
    };
    (async () => {
      await ensureSignedIn();
      const { db } = await services();
      unsub = onSnapshot(
        doc(db, 'orders', orderId),
        (snap) => {
          const parsed = OrderView.safeParse({ id: snap.id, ...snap.data() });
          if (parsed.success) {
            setOrder(parsed.data);
            setPhone(String(snap.data()?.contact?.phone ?? ''));
            setMine(true);
            setState('ready');
          } else void track();
        },
        () => void track(),
      );
    })();
    return () => {
      stopped = true;
      unsub();
      window.clearTimeout(timer);
    };
  }, [orderId]);

  // Paid by card on this device: empty the cart once the payment is through.
  const clearCart = useCart((s) => s.clear);
  const paidNow = order && order.status !== 'pending_payment' && order.status !== 'cancelled' && payingOrder.get() === order.id;
  useEffect(() => {
    if (!paidNow) return;
    clearCart();
    payingOrder.clear();
  }, [paidNow, clearCart]);

  // Own order: fetch the card by phone; again a few seconds after "completed" (that's when the stamp is added).
  const rules = useLoyaltyRules().data;
  const completed = order?.status === 'completed';
  useEffect(() => {
    if (!rules || !phone) return;
    let live = true;
    const t = window.setTimeout(() => getLoyalty(phone).then((c) => live && setCard(c)).catch(() => {}), completed ? 5000 : 0);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [rules, phone, completed]);

  usePageTitle(state === 'loading' ? null : order ? `הזמנה #${order.number}` : 'ההזמנה לא נמצאה');

  if (state === 'loading') return <p className="page-loading">טוען את ההזמנה…</p>;
  if (state === 'missing' || !order)
    return (
      <section className="page">
        <h1>ההזמנה לא נמצאה</h1>
        <p>בדקו שהקישור מלא, או התקשרו אלינו.</p>
        <Link to="/" className="button">לדף הבית</Link>
      </section>
    );

  const canCancel = mine && ['pending_payment', 'placed', 'accepted'].includes(order.status);
  const active = ['pending_payment', 'placed', 'accepted', 'preparing', 'almost_ready'].includes(order.status);

  return (
    <section className="page">
      <h1>הזמנה #{order.number}</h1>
      <p className={`status status--${order.status}`} role="status" aria-live="polite">{ORDER_STATUS_LABELS[order.status]}</p>
      <CorrectionNote order={order} />
      <OrderScene status={order.status} />
      {order.readyAt && active && <ReadyTimer order={order} readyAt={order.readyAt} />}
      <OrderSteps order={order} />
      <ul className="cart-list">
        {order.lines.map((l, i) => (
          <li key={i} className="cart-line">
            <div className="cart-line__info">
              <strong>{l.quantity} × {l.name}</strong>
              {l.addOns.length > 0 && <span className="muted">{l.addOns.map((a) => (a.coverage === 'right' ? `${a.name} (חצי ימין)` : a.coverage === 'left' ? `${a.name} (חצי שמאל)` : a.name)).join(', ')}</span>}
            </div>
            <span className="cart-line__price">{formatAgorot(l.lineTotalAgorot)}</span>
          </li>
        ))}
      </ul>
      {order.discounts.map((d) => (
        <div key={d.kind + d.label} className="summary summary--discount"><span>{d.kind === 'deal' ? '🔥 ' : d.kind === 'loyalty' ? '🎁 ' : '🏷️ '}{d.label}</span><span dir="ltr">−{formatAgorot(d.amountAgorot)}</span></div>
      ))}
      {order.deliveryFeeAgorot > 0 && <div className="summary"><span>משלוח</span><span>{formatAgorot(order.deliveryFeeAgorot)}</span></div>}
      <div className="summary"><span>סה״כ</span><strong>{formatAgorot(order.totalAgorot)}</strong></div>
      <p className="muted">{order.paymentMethod === 'on_site' ? 'התשלום במקום' : 'תשלום באשראי'} · {order.fulfillment === 'pickup' ? 'איסוף עצמי' : 'משלוח'}</p>
      {error && <p className="notice notice--error" role="alert">{error}</p>}
      {canCancel && (
        <button
          type="button"
          className="button button--ghost"
          disabled={cancelling}
          onClick={async () => {
            if (!window.confirm('לבטל את ההזמנה?')) return;
            setCancelling(true);
            setError(null);
            try {
              await cancelOrder({ orderId });
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setCancelling(false);
            }
          }}
        >
          {cancelling ? 'מבטל…' : 'ביטול ההזמנה'}
        </button>
      )}
      {card && order.status !== 'cancelled' && <LoyaltyCard card={card} />}
      <Reorder order={order} />
    </section>
  );
}

/** "Order the same again": puts this order's items back in the cart with today's menu and prices. */
function Reorder({ order }: { order: Order }) {
  const { data: menu = [] } = useMenu();
  const add = useCart((s) => s.add);
  const navigate = useNavigate();
  const [missing, setMissing] = useState<string[]>([]);
  if (!['completed', 'ready', 'out_for_delivery', 'cancelled'].includes(order.status) || menu.length === 0) return null;
  const byId = new Map(menu.map((m) => [m.id, m]));

  function reorder() {
    const gone: string[] = [];
    for (const l of order.lines) {
      const item = byId.get(l.itemId);
      if (!item) {
        gone.push(l.name);
        continue;
      }
      const valid = new Set(item.addOnGroups.flatMap((g) => g.options.filter((o) => o.active).map((o) => o.id)));
      const addOns = l.addOns.filter((a) => valid.has(a.id)).map((a) => ({ id: a.id, coverage: a.coverage ?? ('whole' as const) }));
      add(item, addOns, l.quantity, l.note);
    }
    if (gone.length) setMissing(gone);
    else navigate('/cart');
  }

  return (
    <div className="reorder">
      <button type="button" className="button button--primary button--block" onClick={reorder}>
        🔁 להזמין שוב את אותו הדבר
      </button>
      {missing.length > 0 && (
        <p className="notice" role="status">
          נוסף לסל, חוץ מ: {missing.join(', ')} (כרגע לא בתפריט). <Link to="/cart">לסל</Link>
        </p>
      )}
    </div>
  );
}

/** After the pizzeria pressed a status by mistake and put the order back: say so, for a few hours. */
function CorrectionNote({ order }: { order: Order }) {
  const c = order.correction;
  const now = useNow(60_000).getTime();
  if (!c || c.to !== order.status || now - Date.parse(c.at) > 3 * 60 * 60_000) return null;
  const where = CORRECTION_STATUS_TEXT[order.status];
  return (
    <p className="notice correction-note" role="note">
      עמכם הסליחה – סטטוס ההזמנה עודכן אצלנו בטעות.
      {where && <> ההזמנה שלך כרגע: <strong>{where}</strong>.</>} אנחנו עושים את המיטב שהיא לא תתעכב.
    </p>
  );
}

const STEP_LABELS: Partial<Record<Order['status'], string>> = {
  placed: 'נשלחה',
  accepted: 'התקבלה',
  preparing: 'בהכנה',
  almost_ready: 'כמעט מוכנה',
  ready: 'מוכנה לאיסוף',
  out_for_delivery: 'בדרך אליך',
};

/** Live progress: each step lights up as the pizzeria moves the order forward. */
function OrderSteps({ order }: { order: Order }) {
  if (order.status === 'cancelled' || order.status === 'pending_payment') return null;
  const steps = ORDER_STEPS[order.fulfillment];
  const at = order.status === 'completed' ? steps.length : steps.indexOf(order.status);
  // When each step was reached (the last time, if it moved back and forth).
  const when = new Map<string, number>();
  for (const h of order.statusHistory) {
    const t = Date.parse(h.at);
    if (!Number.isNaN(t)) when.set(h.status, t);
  }
  return (
    <ol className="order-steps" aria-label="מצב ההזמנה">
      {steps.map((s, i) => {
        const t = i <= at ? when.get(s) : undefined;
        return (
          <li key={s} className={i < at ? 'is-done' : i === at ? 'is-current' : ''} aria-current={i === at ? 'step' : undefined}>
            <span className="order-steps__dot" aria-hidden="true">{i < at ? '✓' : i + 1}</span>
            <span className="order-steps__label">{STEP_LABELS[s]}</span>
            {t !== undefined && <time className="order-steps__time" dateTime={new Date(t).toISOString()}>{formatTime(t)}</time>}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Countdown to the estimated time: minutes:seconds in a ring that fills up from the moment the order
 * came in, and the clock time it should be ready (pickup) or leave the pizzeria (delivery).
 */
function ReadyTimer({ order, readyAt }: { order: Order; readyAt: number }) {
  const now = useNow(1_000).getTime();
  const placed = order.statusHistory.map((h) => Date.parse(h.at)).find((t) => !Number.isNaN(t)) ?? readyAt - 30 * 60_000;
  const leftMs = Math.max(0, readyAt - now);
  const leftMin = leftMs / 60_000;
  const far = leftMin > 90; // e.g. ordered in the morning for the evening: a countdown would just be noise
  const span = Math.max(60_000, readyAt - placed);
  const progress = far ? 0.03 : Math.min(1, Math.max(0.03, 1 - leftMs / span));
  const mm = Math.floor(leftMs / 60_000);
  const ss = Math.floor((leftMs % 60_000) / 1000);
  const label = order.fulfillment === 'delivery' ? 'ההזמנה יוצאת אליכם בערך ב' : order.scheduled ? 'מוכן לאיסוף בשעה שבחרתם' : 'השעה המשוערת לאיסוף';
  const C = 2 * Math.PI * 44;
  return (
    <div className="ready-timer">
      <svg viewBox="0 0 100 100" width="150" height="150" aria-hidden="true">
        <circle cx="50" cy="50" r="44" fill="none" stroke="var(--line)" strokeWidth="7" />
        <circle cx="50" cy="50" r="44" fill="none" stroke="var(--ok)" strokeWidth="7" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - progress)} transform="rotate(-90 50 50)" className="ready-timer__ring" />
      </svg>
      <div className="ready-timer__text" aria-hidden="true">
        {leftMs === 0 ? (
          <strong className="ready-timer__soon">כמעט מוכן</strong>
        ) : far ? (
          <>
            <span>מוכן ב</span>
            <strong>{formatTime(readyAt)}</strong>
          </>
        ) : (
          <>
            <span>נותרו</span>
            <strong dir="ltr">{String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}</strong>
            <span>דקות</span>
          </>
        )}
      </div>
      <p className="ready-timer__eta">
        <span>{order.fulfillment === 'delivery' ? 'ההזמנה יוצאת אליכם בערך' : label}</span>
        <strong>{formatTime(readyAt)}</strong>
      </p>
      {/* One calm sentence for screen readers instead of a ticking number. */}
      <p className="sr-only">{leftMs === 0 ? 'ההזמנה כמעט מוכנה' : `${label} ${formatTime(readyAt)}, בעוד כ-${Math.max(1, Math.round(leftMin))} דקות`}</p>
    </div>
  );
}

/**
 * A small live picture of where the order is: a note being read, the oven burning, steam when it's
 * almost ready, a box with confetti when it's ready, a scooter on the road on its way.
 * Decoration only (the status text above says the same thing in words).
 */
function OrderScene({ status }: { status: Order['status'] }) {
  const scene =
    status === 'preparing' || status === 'almost_ready' ? 'oven'
    : status === 'ready' ? 'box'
    : status === 'out_for_delivery' ? 'road'
    : status === 'completed' ? 'done'
    : status === 'cancelled' ? null
    : 'note';
  if (!scene) return null;
  return (
    <div className={`order-scene order-scene--${scene}`} aria-hidden="true">
      {scene === 'note' && (
        <div className="scene-note">
          <span className="scene-note__paper">🧾</span>
          <span className="scene-note__dots"><i /><i /><i /></span>
        </div>
      )}
      {scene === 'oven' && (
        <div className="scene-oven">
          <Oven lit />
          {status === 'almost_ready' && (
            <span className="scene-steam"><i /><i /><i /></span>
          )}
        </div>
      )}
      {scene === 'box' && (
        <>
          <span className="scene-box">🍕</span>
          <Confetti />
        </>
      )}
      {scene === 'road' && (
        <>
          <div className="scene-road">
            <span className="scene-road__scooter">🛵</span>
            <span className="scene-road__line" />
          </div>
          <Confetti />
        </>
      )}
      {scene === 'done' && <span className="scene-done">✓</span>}
    </div>
  );
}

const CONFETTI_COLORS = ['#feb800', '#e4572e', '#2e7d32', '#1e88e5', '#ff8fab', '#ffffff'];
/** A short burst of confetti – plays once when the scene appears. */
function Confetti() {
  return (
    <span className="confetti">
      {Array.from({ length: 22 }, (_, i) => {
        const left = (i * 37) % 100;
        const style = {
          left: `${left}%`,
          background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          animationDelay: `${(i % 7) * 70}ms`,
          '--drift': `${((i * 53) % 60) - 30}px`,
          '--turn': `${((i * 97) % 720) - 360}deg`,
        } as React.CSSProperties;
        return <i key={i} style={style} />;
      })}
    </span>
  );
}
