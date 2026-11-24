import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { Link, Outlet, useLocation, useNavigate, useNavigationType } from 'react-router';
import { formatAgorot, CATEGORY_IDS, CATEGORY_LABELS } from '@pizza-sosi/contracts/constants';
import { useCart, cartCount, cartTotal } from '../store/cart';
import { useActiveCategory } from '../store/ui';
import { useMenu } from '../lib/menu';
import { StoreDot } from './StoreStatus';
import { ThemeMenu } from './ThemeMenu';
import { Footer } from './Footer';
import { announce } from '../lib/a11y';
import { AnimatedNumber } from './AnimatedNumber';
import { BottomBar } from './BottomBar';

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
  const headerRef = useRef<HTMLElement>(null);
  // Back/forward decides which way the next page slides in.
  const navType = useNavigationType();
  const [added, setAdded] = useState<{ text: string; n: number } | null>(null);

  // A toast belongs to the page it was shown on – moving to another page hides it.
  const [toastPath, setToastPath] = useState(location.pathname);
  if (toastPath !== location.pathname) {
    setToastPath(location.pathname);
    if (added) setAdded(null);
  }

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

  // One yellow line that slides under the category you're looking at.
  const onMenu = location.pathname === '/';
  const [ink, setInk] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = active && onMenu ? navRef.current?.querySelector<HTMLElement>(`[data-cat="${active}"]`) : null;
      // A pressed-in groove sitting just inside the active link.
      setInk(el ? { x: el.offsetLeft + 1, y: el.offsetTop + 6, w: el.offsetWidth - 2, h: el.offsetHeight - 12 } : null);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active, onMenu, categories]);

  // Phones: tuck the logo row away while scrolling down the menu (the categories stay), bring it back on scroll up.
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const phone = window.matchMedia('(max-width: 640px)');
    let lastY = window.scrollY;
    let tucked = false;
    let frame = 0;
    const set = (on: boolean) => {
      if (on === tucked) return;
      tucked = on;
      header.classList.toggle('is-tucked', on);
    };
    const measure = () => {
      const nav = navRef.current;
      header.style.setProperty('--tuck', nav && phone.matches ? `${nav.offsetTop}px` : '0px');
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const y = window.scrollY;
        if (!phone.matches || y < 160) set(false);
        else if (y > lastY + 6) set(true);
        else if (y < lastY - 6) set(false);
        lastY = y;
      });
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', measure);
      header.classList.remove('is-tucked');
    };
  }, [categories.length]);

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
      <header className="site-header" ref={headerRef}>
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
              <li aria-hidden="true" className={`cat-nav__ink ${ink ? 'is-on' : ''}`} style={ink ? { transform: `translate(${ink.x}px, ${ink.y}px)`, width: ink.w, height: ink.h } : undefined} />
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
                <span className="cart-button__total"><AnimatedNumber value={total} format={formatAgorot} /></span>
              </span>
            ) : (
              <span>הסל<span className="sr-only"> ריק</span></span>
            )}
          </Link>
        </div>
      </header>
      <main id="main" data-nav={navType === 'POP' ? 'back' : 'forward'}>
        <Outlet />
      </main>
      {count > 0 && location.pathname === '/' && (
        <Link to="/cart" className="cart-bar">
          <span className="cart-bar__count">{count}<span className="sr-only"> פריטים</span></span>
          <span className="cart-bar__label">לסל ולהזמנה</span>
          <strong className="cart-bar__total"><AnimatedNumber value={total} format={formatAgorot} /></strong>
        </Link>
      )}
      {added && (
        <p key={added.n} className={`toast ${count > 0 && location.pathname === '/' ? 'toast--above-bar' : ''}`} aria-hidden="true">
          <span className="toast__check">✓</span> {added.text}
        </p>
      )}
      <BottomBar count={count} total={total} bump={added?.n ?? 0} />
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
