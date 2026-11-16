import { useState } from 'react';
import { Link } from 'react-router';
import { formatAgorot } from '@pizza-sosi/contracts/constants';
import type { MenuItem } from '@pizza-sosi/contracts';
import { useCart, cartTotal, type CartLine } from '../store/cart';
import { useMenu, useBucket } from '../lib/menu';
import { imageUrl, thumbSrcSet } from '../lib/firebase';
import { ItemDialog } from '../components/ItemDialog';

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
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const bucket = useBucket().data ?? '';
  const byId = new Map(menu.map((m) => [m.id, m]));

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
    setJustAdded(m.name);
    window.setTimeout(() => setJustAdded(null), 2200);
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
                  <button type="button" className="link-button" onClick={() => setOpen({ item, editing: l })} aria-label={`עריכת ${l.name}`}>
                    ✎ עריכה
                  </button>
                )}
              </div>
              <div className="stepper" role="group" aria-label={`כמות של ${l.name}`}>
                <button type="button" aria-label="הפחתה" onClick={() => (l.quantity === 1 ? remove(l.key) : setQuantity(l.key, l.quantity - 1))}>−</button>
                <output>{l.quantity}</output>
                <button type="button" aria-label="הוספה" onClick={() => setQuantity(l.key, l.quantity + 1)}>+</button>
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
                  <button type="button" className="upsell__card" onClick={() => quickAdd(m)} aria-label={`הוספת ${m.name} לסל, ${formatAgorot(m.priceAgorot)}`}>
                    {src ? <img src={src} srcSet={srcSet ?? undefined} sizes="64px" alt="" width="64" height="64" loading="lazy" /> : <span className="upsell__img" aria-hidden="true" />}
                    <span className="upsell__name">{m.name}</span>
                    <span className="upsell__price">{formatAgorot(m.priceAgorot)}</span>
                    <span className="upsell__plus" aria-hidden="true">+</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="sr-only" role="status" aria-live="polite">{justAdded ? `${justAdded} נוסף לסל` : ''}</p>
          {justAdded && <p className="toast" aria-hidden="true">✓ {justAdded} נוסף לסל</p>}
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
