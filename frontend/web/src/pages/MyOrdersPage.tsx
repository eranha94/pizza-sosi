import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { formatAgorot } from '@pizza-sosi/contracts/constants';
import { loadMyOrders, forgetMyOrders, dropMyOrders } from '../lib/profile';
import { getOrderStatus } from '../lib/api';
import { usePageTitle } from '../lib/a11y';

const dateFmt = new Intl.DateTimeFormat('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Orders made from this device (kept locally, newest first). Each opens its live tracking page. */
export default function MyOrdersPage() {
  const [orders, setOrders] = useState(loadMyOrders);
  usePageTitle('ההזמנות שלי');
  // Orders the shop deleted (e.g. test orders) disappear from the list too.
  useEffect(() => {
    // Once per visit, and only the latest few: every check costs a security token.
    const KEY = 'pizza-sosi-orders-checked';
    try {
      if (sessionStorage.getItem(KEY)) return;
      sessionStorage.setItem(KEY, '1');
    } catch {
      /* storage blocked: check anyway */
    }
    const ids = loadMyOrders().slice(0, 8).map((o) => o.id);
    if (!ids.length) return;
    let alive = true;
    Promise.all(
      ids.map((id) =>
        getOrderStatus(id).then(
          () => null,
          (e: unknown) => ((e as { code?: string })?.code === 'functions/not-found' ? id : null),
        ),
      ),
    ).then((gone) => {
      const missing = gone.filter((x): x is string => x !== null);
      if (!alive || !missing.length) return;
      dropMyOrders(missing);
      setOrders(loadMyOrders());
    });
    return () => {
      alive = false;
    };
  }, []);
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
