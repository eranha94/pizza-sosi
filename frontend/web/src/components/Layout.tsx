import { Link, Outlet } from 'react-router';
import { formatAgorot } from '@pizza-sosi/contracts/constants';
import { useCart, cartCount, cartTotal } from '../store/cart';

export function Layout() {
  const count = useCart(cartCount);
  const total = useCart(cartTotal);
  return (
    <>
      <a className="skip-link" href="#main">דילוג לתוכן</a>
      <header className="site-header">
        <Link to="/" className="brand" aria-label="פיצה סוסי – דף הבית">
          <img src="/brand/pizza-sosi-header.svg" alt="" width="150" height="63" />
        </Link>
        <Link to="/cart" className="cart-button" aria-label={`סל הקניות, ${count} פריטים`}>
          <CartIcon />
          {count > 0 ? (
            <span className="cart-button__meta">
              <span className="cart-button__count">{count}</span>
              <span className="cart-button__total">{formatAgorot(total)}</span>
            </span>
          ) : (
            <span>הסל</span>
          )}
        </Link>
      </header>
      <main id="main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <p>פיצה סוסי · כל סוגי הפיצות והטוסטים</p>
        <p>
          <a href="tel:0548880909">054-8880909</a>
        </p>
      </footer>
    </>
  );
}

function CartIcon() {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="18" cy="20" r="1.5" />
      <path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L22 7H6" />
    </svg>
  );
}
