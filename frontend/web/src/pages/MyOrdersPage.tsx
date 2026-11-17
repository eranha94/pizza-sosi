import { useState } from 'react';
import { Link } from 'react-router';
import { formatAgorot } from '@pizza-sosi/contracts/constants';
import { loadMyOrders, forgetMyOrders } from '../lib/profile';
import { usePageTitle } from '../lib/a11y';

const dateFmt = new Intl.DateTimeFormat('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Orders made from this device (kept locally, newest first). Each opens its live tracking page. */
export default function MyOrdersPage() {
  const [orders, setOrders] = useState(loadMyOrders);
  usePageTitle('ההזמנות שלי');
  return (
    <section className="page">
      <h1>ההזמנות שלי</h1>
      {orders.length === 0 ? (
        <>
          <p className="muted">עוד לא הזמנת מהמכשיר הזה.</p>
          <Link to="/#menu" className="button button--primary">לתפריט</Link>
        </>
      ) : (
        <>
          <ul className="my-orders">
            {orders.map((o) => (
              <li key={o.id}>
                <Link to={`/order/${o.id}`} className="my-orders__row">
                  <strong>{o.number ? `#${o.number}` : 'הזמנה'}</strong>
                  <span className="muted">{dateFmt.format(o.at)}</span>
                  <span className="my-orders__total">{formatAgorot(o.totalAgorot)}</span>
                  <span className="sr-only">, לצפייה בהזמנה</span>
                  <span aria-hidden="true">‹</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="muted small">הרשימה נשמרת רק במכשיר הזה. בכל הזמנה אפשר ללחוץ "להזמין שוב".</p>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              forgetMyOrders();
              setOrders([]);
            }}
          >
            ניקוי הרשימה מהמכשיר
          </button>
        </>
      )}
    </section>
  );
}
