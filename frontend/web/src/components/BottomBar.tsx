import { Link, useLocation } from 'react-router';
import { formatAgorot } from '@pizza-sosi/contracts/constants';
import { useActiveOrder, type ActiveOrder } from '../lib/activeOrder';
import { useNow } from '../lib/menu';
import { AnimatedNumber } from './AnimatedNumber';

/**
 * Phone navigation in thumb reach: menu · cart (a raised button in the middle) · my orders.
 * Above it, a live pill for an order in progress. Hidden on wider screens (CSS) and during checkout.
 */
const STATUS_SHORT: Partial<Record<ActiveOrder['status'], string>> = {
  pending_payment: 'ממתינה לתשלום',
  placed: 'נשלחה',
  accepted: 'התקבלה',
  preparing: 'בהכנה',
  almost_ready: 'כמעט מוכנה',
  ready: 'מוכנה לאיסוף',
  out_for_delivery: 'בדרך אליך',
};

export function BottomBar({ count, total, bump }: { count: number; total: number; bump: number }) {
  const { pathname } = useLocation();
  const order = useActiveOrder(pathname);
  if (pathname === '/checkout') return null;
  const here = (p: string) => (pathname === p ? 'page' : undefined);
  const onThisOrder = order && pathname === `/order/${order.id}`;

  return (
    <div className="tabbar-wrap">
      {order && !onThisOrder && <OrderPill order={order} />}
      <nav className="tabbar" aria-label="ניווט מהיר">
        <Link to="/" className="tabbar__tab" aria-current={here('/')}>
          <MenuIcon />
          <span>תפריט</span>
        </Link>
        <Link to="/cart" key={bump} className={`tabbar__cart ${bump ? 'is-bump' : ''}`} aria-current={here('/cart')}>
          <span className="tabbar__cart-btn" aria-hidden="true">
            <CartIcon />
            {count > 0 && <span className="tabbar__badge">{count}</span>}
          </span>
          <span className="tabbar__cart-label">
            {count > 0 ? (
              <>
                <span className="sr-only">הסל: {count} פריטים, </span>
                <AnimatedNumber value={total} format={formatAgorot} />
              </>
            ) : (
              <>
                הסל<span className="sr-only"> ריק</span>
              </>
            )}
          </span>
        </Link>
        <Link to={order ? `/order/${order.id}` : '/my-orders'} className="tabbar__tab" aria-current={here('/my-orders') ?? (onThisOrder ? 'page' : undefined)}>
          <span className="tabbar__icon-wrap">
            <ScooterIcon />
            {order && <i className="tabbar__live" aria-hidden="true" />}
          </span>
          <span>{order ? 'ההזמנה שלי' : 'ההזמנות שלי'}</span>
        </Link>
      </nav>
    </div>
  );
}

function OrderPill({ order }: { order: ActiveOrder }) {
  const now = useNow(30_000).getTime();
  const left = order.readyAt ? Math.round((order.readyAt - now) / 60_000) : null;
  const inKitchen = ['placed', 'accepted', 'preparing', 'almost_ready'].includes(order.status);
  return (
    <Link to={`/order/${order.id}`} className={`order-pill order-pill--${order.status}`}>
      <span className="order-pill__dot" aria-hidden="true" />
      <strong>הזמנה #{order.number}</strong>
      <span>{STATUS_SHORT[order.status] ?? ''}</span>
      {inKitchen && left !== null && left > 0 && left <= 120 && <span className="order-pill__eta">עוד {left} דק׳</span>}
      <span className="order-pill__go" aria-hidden="true">‹</span>
    </Link>
  );
}

function MenuIcon() {
  return (
    <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.5 3 20.5c5.6 2 12.4 2 18 0L12 2.5Z" />
      <path d="M5.6 15.4c4.2 1.4 8.6 1.4 12.8 0" />
      <circle cx="10" cy="11" r="1.2" fill="currentColor" />
      <circle cx="14" cy="14.6" r="1.2" fill="currentColor" />
      <circle cx="11.2" cy="17.6" r="1.1" fill="currentColor" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      <path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6" />
    </svg>
  );
}

function ScooterIcon() {
  return (
    <svg aria-hidden="true" width="26" height="24" viewBox="0 0 26 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="5.5" cy="18" r="2.8" />
      <circle cx="20.5" cy="18" r="2.8" />
      <path d="M8.3 18h7.4l3.3-8.5H23" />
      <path d="M19 9.5 17.5 5h-2.5" />
      <path d="M3 11h8l2 4" />
      <rect x="3" y="5.5" width="7" height="5.5" rx="1" />
    </svg>
  );
}
