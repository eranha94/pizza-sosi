import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router';
import { formatAgorot, CATEGORY_IDS, CATEGORY_LABELS } from '@pizza-sosi/contracts/constants';
import { useCart, cartCount, cartTotal } from '../store/cart';
import { useActiveCategory } from '../store/ui';
import { useMenu } from '../lib/menu';
import { StoreDot } from './StoreStatus';
import { ThemeMenu } from './ThemeMenu';
import { Footer } from './Footer';
import { announce } from '../lib/a11y';

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function scrollToCategory(id: string) {
  document.getElementById(`cat-${id}`)?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
}

export function Layout() {
  const count = useCart(cartCount);
  const total = useCart(cartTotal);
  const menu = useMenu();
  const active = useActiveCategory((s) => s.active);
  const location = useLocation();
  const navigate = useNavigate();
  const navRef = useRef<HTMLElement>(null);
  const [added, setAdded] = useState<{ text: string; n: number } | null>(null);

  // Added to the cart (from any page): toast, a little bounce on the cart, and a spoken confirmation.
  useEffect(() => {
    let timer = 0;
    const onAdded = (e: Event) => {
      const { name, quantity } = (e as CustomEvent<{ name: string; quantity: number }>).detail;
      const text = quantity > 1 ? `${quantity} × ${name} נוספו לסל` : `${name} נוסף לסל`;
      setAdded((prev) => ({ text, n: (prev?.n ?? 0) + 1 }));
      announce(text);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setAdded(null), 2400);
    };
    window.addEventListener('cart:added', onAdded);
    return () => {
      window.removeEventListener('cart:added', onAdded);
      window.clearTimeout(timer);
    };
  }, []);

  const categories = useMemo(() => {
    const present = new Set((menu.data ?? []).map((i) => i.category));
    return CATEGORY_IDS.filter((c) => present.has(c));
  }, [menu.data]);

  // Keep the active category visible in the scrollable bar (phones).
  useEffect(() => {
    if (!active) return;
    // Scroll only the bar sideways (scrollIntoView would also move the page and stop its scrolling).
    const nav = navRef.current;
    const el = nav?.querySelector<HTMLElement>(`[data-cat="${active}"]`);
    if (!nav || !el) return;
    const r = el.getBoundingClientRect();
    const n = nav.getBoundingClientRect();
    nav.scrollBy({ left: r.left + r.width / 2 - (n.left + n.width / 2), behavior: reduceMotion() ? 'auto' : 'smooth' });
  }, [active]);

  const onCategory = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    if (location.pathname === '/') {
      scrollToCategory(id);
      history.replaceState(null, '', `#cat-${id}`);
    } else {
      navigate({ pathname: '/', hash: `#cat-${id}` });
    }
  };

  return (
    <>
      <a className="skip-link" href="#main">דילוג לתוכן</a>
      <header className="site-header">
        <Link to="/" className="brand" aria-label="פיצה סוסי – דף הבית">
          <img src="/brand/pizza-sosi-header.svg" alt="" width="150" height="63" />
          <StoreDot />
        </Link>
        {categories.length > 0 && (
          <nav className="cat-nav" aria-label="קטגוריות בתפריט" ref={navRef}>
            <ul>
              {categories.map((c) => (
                <li key={c}>
                  <a href={`/#cat-${c}`} data-cat={c} aria-current={active === c && location.pathname === '/' ? 'true' : undefined} onClick={(e) => onCategory(e, c)}>
                    {CATEGORY_LABELS[c]}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <div className="header-actions">
          <ThemeMenu />
          <Link to="/cart" key={added?.n ?? 0} className={`cart-button ${added ? 'is-bump' : ''}`}>
            <CartIcon />
            {count > 0 ? (
              <span className="cart-button__meta">
                <span className="sr-only">הסל: </span>
                <span className="cart-button__count">{count}</span>
                <span className="sr-only"> פריטים, </span>
                <span className="cart-button__total">{formatAgorot(total)}</span>
              </span>
            ) : (
              <span>הסל<span className="sr-only"> ריק</span></span>
            )}
          </Link>
        </div>
      </header>
      <main id="main">
        <Outlet />
      </main>
      {count > 0 && location.pathname === '/' && (
        <Link to="/cart" className="cart-bar">
          <span className="cart-bar__count">{count}<span className="sr-only"> פריטים</span></span>
          <span className="cart-bar__label">לסל ולהזמנה</span>
          <strong className="cart-bar__total">{formatAgorot(total)}</strong>
        </Link>
      )}
      {added && (
        <p key={added.n} className={`toast ${count > 0 && location.pathname === '/' ? 'toast--above-bar' : ''}`} aria-hidden="true">
          <span className="toast__check">✓</span> {added.text}
        </p>
      )}
      <div id="a11y-announcer" className="sr-only" role="status" aria-live="polite" aria-atomic="true" />
      <Footer />
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
