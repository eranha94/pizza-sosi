import { useState } from 'react';
import { Link } from 'react-router';
import { formatAgorot } from '@pizza-sosi/contracts/constants';
import type { MenuItem } from '@pizza-sosi/contracts';
import { useCart, cartTotal, type CartLine } from '../store/cart';
import { useMenu, useBucket } from '../lib/menu';
import { imageUrl, thumbSrcSet } from '../lib/firebase';
import { ItemDialog } from '../components/ItemDialog';
import { announce, notifyAdded, usePageTitle } from '../lib/a11y';

/** Items worth suggesting next to an order: drinks first, then specials, not already in the cart. */
function suggestions(menu: MenuItem[], lines: CartLine[]): MenuItem[] {
  const inCart = new Set(lines.map((l) => l.itemId));
  const rank = (m: MenuItem) => (m.category === 'drinks' ? 0 : m.category === 'specials' ? 1 : 9);
  return menu.filter((m) => !inCart.has(m.id) && rank(m) < 9).toSorted((a, b) => rank(a) - rank(b) || a.order - b.order).slice(0, 6);
}

/** Can go straight to the cart (no required choice to make). */
const quickAddable = (m: MenuItem) => !m.addOnGroups.some((g) => g.selection === 'single' && !g.defaultOptionId && g.options.some((o) => o.active));

export default function CartPage() {
  const { lines, setQuantity, remove, add } = useCart();
  const total = useCart(cartTotal);
  const { data: menu = [] } = useMenu();
  const [open, setOpen] = useState<{ item: MenuItem; editing: CartLine | null } | null>(null);
  const bucket = useBucket().data ?? '';
  const byId = new Map(menu.map((m) => [m.id, m]));
  usePageTitle(lines.length === 0 ? 'הסל ריק' : 'הסל שלך');

  if (lines.length === 0) {
    return (
      <section className="page">
        <h1>הסל ריק</h1>
        <p>בחרו משהו טעים מהתפריט.</p>
        <Link to="/#menu" className="button button--primary">לתפריט</Link>
      </section>
    );
  }

  const extras = suggestions(menu, lines);

  function quickAdd(m: MenuItem) {
    if (!quickAddable(m) || m.category === 'pizzas') {
      setOpen({ item: m, editing: null });
      return;
    }
    const defaults = m.addOnGroups.filter((g) => g.selection === 'single' && g.defaultOptionId).map((g) => ({ id: g.defaultOptionId!, coverage: 'whole' as const }));
    add(m, defaults, 1, '');
    notifyAdded(m.name);
  }

  return (
    <section className="page">
      <h1>הסל שלך</h1>
      <ul className="cart-list">
        {lines.map((l) => {
          const item = byId.get(l.itemId);
          return (
            <li key={l.key} className="cart-line">
              <div className="cart-line__info">
                <strong>{l.name}</strong>
                {l.addOnLabels.length > 0 && <span className="muted">{l.addOnLabels.join(', ')}</span>}
                {l.note && <span className="muted">הערה: {l.note}</span>}
                {item && item.addOnGroups.length > 0 && (
                  <button type="button" className="link-button" onClick={() => setOpen({ item, editing: l })}>
                    <span aria-hidden="true">✎ </span>עריכה<span className="sr-only">: {l.name}</span>
                  </button>
                )}
              </div>
              <div className="stepper" role="group" aria-label={`כמות של ${l.name}`}>
                <button type="button" aria-label={l.quantity === 1 ? `הסרת ${l.name} מהסל` : `הפחתת ${l.name}`} onClick={() => (l.quantity === 1 ? (remove(l.key), announce(`${l.name} הוסר מהסל`)) : setQuantity(l.key, l.quantity - 1))}>
                  {l.quantity === 1 ? <TrashIcon /> : '−'}
                </button>
                <output aria-live="polite">{l.quantity}</output>
                <button type="button" aria-label={`הוספת ${l.name}`} onClick={() => setQuantity(l.key, l.quantity + 1)}>+</button>
              </div>
              <span className="cart-line__price">{formatAgorot(l.unitPriceAgorot * l.quantity)}</span>
            </li>
          );
        })}
      </ul>

      {extras.length > 0 && (
        <section className="upsell" aria-labelledby="upsell-h">
          <h2 id="upsell-h">רוצים להוסיף משהו?</h2>
          <ul className="upsell__list">
            {extras.map((m) => {
              const src = imageUrl(bucket, m.imagePath);
              const srcSet = thumbSrcSet(bucket, m.imagePath);
              return (
                <li key={m.id}>
                  <button type="button" className="upsell__card" onClick={() => quickAdd(m)}>
                    <span className="sr-only">הוספה לסל: </span>
                    {src ? <img src={src} srcSet={srcSet ?? undefined} sizes="64px" alt="" width="64" height="64" loading="lazy" /> : <span className="upsell__img" aria-hidden="true" />}
                    <span className="upsell__name">{m.name}</span>
                    <span className="upsell__price">{formatAgorot(m.priceAgorot)}</span>
                    <span className="upsell__plus" aria-hidden="true">+</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="summary">
        <span>סה״כ</span>
        <strong>{formatAgorot(total)}</strong>
      </div>
      <p className="muted small">הסכום הסופי מאושר בעת ההזמנה.</p>
      <Link to="/checkout" className="button button--primary button--block">להמשך הזמנה</Link>
      <ItemDialog item={open?.item ?? null} editing={open?.editing ?? null} onClose={() => setOpen(null)} />
    </section>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  );
}
