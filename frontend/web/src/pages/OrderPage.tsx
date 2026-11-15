import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { OrderView, ORDER_STATUS_LABELS, ORDER_STEPS, formatAgorot, formatTime, type OrderView as Order } from '@pizza-sosi/contracts';
import { useNow } from '../lib/menu';
import { services, ensureSignedIn } from '../lib/firebase';
import { cancelOrder, errorMessage } from '../lib/api';

export default function OrderPage() {
  const { orderId = '' } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    let unsub = () => {};
    (async () => {
      await ensureSignedIn();
      const { db } = await services();
      unsub = onSnapshot(
        doc(db, 'orders', orderId),
        (snap) => {
          const parsed = OrderView.safeParse({ id: snap.id, ...snap.data() });
          if (parsed.success) {
            setOrder(parsed.data);
            setState('ready');
          } else setState('missing');
        },
        () => setState('missing'),
      );
    })();
    return () => unsub();
  }, [orderId]);

  if (state === 'loading') return <p className="page-loading">טוען את ההזמנה…</p>;
  if (state === 'missing' || !order)
    return (
      <section className="page">
        <h1>ההזמנה לא נמצאה</h1>
        <p>אפשר לראות הזמנה רק מהמכשיר שממנו היא נשלחה.</p>
        <Link to="/" className="button">לדף הבית</Link>
      </section>
    );

  const canCancel = ['pending_payment', 'placed', 'accepted'].includes(order.status);
  const active = ['pending_payment', 'placed', 'accepted', 'preparing', 'almost_ready'].includes(order.status);

  return (
    <section className="page">
      <h1>הזמנה #{order.number}</h1>
      <p className={`status status--${order.status}`} role="status" aria-live="polite">{ORDER_STATUS_LABELS[order.status]}</p>
      <OrderSteps order={order} />
      {order.readyAt && active && <ReadyTimer readyAt={order.readyAt} scheduled={order.scheduled} />}
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
    </section>
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
  return (
    <ol className="order-steps" aria-label="מצב ההזמנה">
      {steps.map((s, i) => (
        <li key={s} className={i < at ? 'is-done' : i === at ? 'is-current' : ''} aria-current={i === at ? 'step' : undefined}>
          <span className="order-steps__dot" aria-hidden="true">{i < at ? '✓' : i + 1}</span>
          <span className="order-steps__label">{STEP_LABELS[s]}</span>
        </li>
      ))}
    </ol>
  );
}

/** Ring that fills up as the ready time gets closer. */
function ReadyTimer({ readyAt, scheduled }: { readyAt: number; scheduled: boolean }) {
  const now = useNow(15_000).getTime();
  const left = Math.max(0, Math.round((readyAt - now) / 60000));
  const total = scheduled ? Math.max(left, 1) : 30;
  const progress = scheduled && left > 60 ? 0.04 : Math.min(1, Math.max(0.04, 1 - left / total));
  const C = 2 * Math.PI * 44;
  return (
    <div className="ready-timer">
      <svg viewBox="0 0 100 100" width="120" height="120" aria-hidden="true">
        <circle cx="50" cy="50" r="44" fill="none" stroke="var(--line)" strokeWidth="8" />
        <circle cx="50" cy="50" r="44" fill="none" stroke="var(--yellow)" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={C * (1 - progress)} transform="rotate(-90 50 50)" className="ready-timer__ring" />
      </svg>
      <div className="ready-timer__text">
        {left > 0 ? (
          <>
            <strong>{left > 90 ? formatTime(readyAt) : `${left}`}</strong>
            <span>{left > 90 ? (scheduled ? 'השעה שבחרתם' : 'מוכן בערך') : 'דקות'}</span>
          </>
        ) : (
          <>
            <strong>כמעט</strong>
            <span>מוכן</span>
          </>
        )}
      </div>
      <p className="muted small">{scheduled ? 'הזמנה מראש' : 'מוכן בערך'} ב-{formatTime(readyAt)}</p>
    </div>
  );
}
