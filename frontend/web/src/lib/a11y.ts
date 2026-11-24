import { useEffect } from 'react';
import { useLocation } from 'react-router';

const SITE = 'פיצה סוסי';
const HOME_TITLE = 'פיצה סוסי – רק הטעם ידבר';
let lastPath = typeof location === 'undefined' ? '' : location.pathname;

/**
 * Every page: its own tab title, and after moving between pages the focus goes to the page heading,
 * so a screen reader announces the new page (a SPA doesn't reload, so nothing else would).
 * Pass null while the page is still loading.
 */
export function usePageTitle(title: string | null, { focus = true } = {}) {
  const { pathname } = useLocation();
  useEffect(() => {
    if (title === null) return;
    document.title = title ? `${title} – ${SITE}` : HOME_TITLE;
    if (pathname === lastPath) return; // first load, or the same page re-rendering
    lastPath = pathname;
    if (!focus) return;
    const h1 = document.querySelector<HTMLElement>('main h1');
    if (h1) {
      h1.tabIndex = -1;
      h1.focus();
    }
  }, [title, pathname, focus]);
}

/** Read a short message aloud to screen readers (the region lives in the Layout). */
export function announce(message: string) {
  const el = document.getElementById('a11y-announcer');
  if (!el) return;
  // Clear first so the same message twice is still read.
  el.textContent = '';
  window.setTimeout(() => (el.textContent = message), 60);
}

/** Something was added to the cart: the Layout shows a toast, bumps the cart button and announces it. */
export function notifyAdded(name: string, quantity = 1) {
  // A tiny tap of feedback on phones that allow it (Android); silently nothing elsewhere.
  try {
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) navigator.vibrate?.(14);
  } catch {
    /* not allowed */
  }
  window.dispatchEvent(new CustomEvent('cart:added', { detail: { name, quantity } }));
}
