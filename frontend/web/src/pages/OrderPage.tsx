import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { OrderView, ORDER_STATUS_LABELS, formatAgorot, type OrderView as Order } from '@pizza-sosi/contracts';
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

  const canCancel = ['pending_payment', 'paid', 'accepted'].includes(order.status);

  return (
    <section className="page">
      <h1>הזמנה #{order.number}</h1>
      <p className={`status status--${order.status}`} role="status" aria-live="polite">{ORDER_STATUS_LABELS[order.status]}</p>
      <ul className="cart-list">
        {order.lines.map((l, i) => (
          <li key={i} className="cart-line">
            <div className="cart-line__info">
              <strong>{l.quantity} × {l.name}</strong>
              {l.addOns.length > 0 && <span className="muted">{l.addOns.map((a) => a.name).join(', ')}</span>}
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
