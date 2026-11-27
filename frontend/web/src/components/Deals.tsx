import { useCallback, useState } from 'react';
import type { MenuItem } from '@pizza-sosi/contracts';
import { formatAgorot } from '@pizza-sosi/contracts/constants';
import { imageUrl, thumbSrcSet } from '../lib/firebase';
import { useBucket } from '../lib/menu';
import { useCart } from '../store/cart';
import { announce, notifyAdded } from '../lib/a11y';
import type { LiveDeal } from '../lib/promos';

/** Can go straight to the cart: no required choice, and not a pizza (pizzas get their toppings picked). */
const quickAddable = (m: MenuItem) =>
  m.category !== 'pizzas' && !m.addOnGroups.some((g) => g.selection === 'single' && !g.defaultOptionId && g.options.some((o) => o.active));

const cartUnits = () => useCart.getState().lines.reduce((n, l) => n + l.quantity, 0);

/**
 * Adding a deal: simple items go straight in; items with choices (pizzas) open their dialog one after another.
 * The deal price itself is applied by the cart rule (applyDeals), so nothing special is stored.
 * Closing a dialog without adding stops the rest.
 */
export function useAddDeal() {
  const [queue, setQueue] = useState<{ title: string; items: MenuItem[]; units: number } | null>(null);
  const add = useCart((s) => s.add);

  const start = useCallback(
    (d: LiveDeal) => {
      const needDialog: MenuItem[] = [];
      for (const { item, quantity } of d.items) {
        if (quickAddable(item)) {
          const defaults = item.addOnGroups.filter((g) => g.selection === 'single' && g.defaultOptionId).map((g) => ({ id: g.defaultOptionId!, coverage: 'whole' as const }));
          add(item, defaults, quantity, '');
        } else for (let i = 0; i < quantity; i++) needDialog.push(item);
      }
      if (needDialog.length === 0) {
        notifyAdded(d.deal.title);
        return;
      }
      setQueue({ title: d.deal.title, items: needDialog, units: cartUnits() });
    },
    [add],
  );

  /** Pass to ItemDialog's onClose while a deal is being added. */
  const onDialogClose = useCallback(() => {
    setQueue((q) => {
      if (!q) return null;
      const added = cartUnits() > q.units;
      if (!added) {
        announce(`המבצע "${q.title}" לא הושלם – חסר עוד פריט כדי לקבל את מחיר המבצע`);
        return null;
      }
      const rest = q.items.slice(1);
      if (rest.length === 0) {
        notifyAdded(q.title);
        return null;
      }
      return { ...q, items: rest, units: cartUnits() };
    });
  }, []);

  return { start, current: queue?.items[0] ?? null, step: queue ? { title: queue.title, left: queue.items.length } : null, onDialogClose };
}

/** The deals row at the top of the menu. Rendered only when there is a deal on today. */
export function DealsSection({ deals, onAdd }: { deals: LiveDeal[]; onAdd: (d: LiveDeal) => void }) {
  const bucket = useBucket().data ?? '';
  if (deals.length === 0) return null;
  return (
    <section id="cat-deals" className="menu__category deals" aria-labelledby="h-deals">
      <h2 id="h-deals">מבצעים</h2>
      <ul className="deals__list">
        {deals.map((d) => (
          <li key={d.deal.id}>
            <DealCard d={d} bucket={bucket} onAdd={() => onAdd(d)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DealCard({ d, bucket, onAdd }: { d: LiveDeal; bucket: string; onAdd: () => void }) {
  const { deal, items, regularAgorot } = d;
  const shown = items.slice(0, 4);
  const what = items.map(({ item, quantity }) => (quantity > 1 ? `${quantity} × ${item.name}` : item.name)).join(' + ');
  return (
    <article className={`deal deal--${deal.theme}`} aria-labelledby={`deal-${deal.id}`}>
      <div className={`deal__art deal__art--n${shown.length}`} aria-hidden="true">
        {shown.map(({ item, quantity }, i) => {
          const src = imageUrl(bucket, item.imagePath);
          const srcSet = thumbSrcSet(bucket, item.imagePath);
          return (
            <span key={item.id + i} className={`deal__photo deal__photo--${i}`}>
              {src ? (
                <img src={srcSet ? srcSet.split(' ')[0] : src} srcSet={srcSet ?? undefined} sizes={i === 0 ? '220px' : '120px'} alt="" loading="lazy" decoding="async" />
              ) : (
                <span className="deal__photo-empty">{item.name.slice(0, 1)}</span>
              )}
              {quantity > 1 && <b className="deal__qty">×{quantity}</b>}
            </span>
          );
        })}
        <span className="deal__sticker">
          <small>רק</small>
          <strong>{deal.priceAgorot % 100 === 0 ? deal.priceAgorot / 100 : (deal.priceAgorot / 100).toFixed(2)}</strong>
          <small>₪</small>
        </span>
      </div>
      <div className="deal__body">
        <h3 id={`deal-${deal.id}`} className="deal__title">{deal.title}</h3>
        <p className="deal__items">{what}</p>
        {deal.description && <p className="deal__desc">{deal.description}</p>}
        <p className="deal__price">
          <strong>{formatAgorot(deal.priceAgorot)}</strong>
          <span>
            במקום <s>{formatAgorot(regularAgorot)}</s>
          </span>
        </p>
        <button type="button" className="deal__add" onClick={onAdd}>
          להוספת המבצע לסל<span className="sr-only">: {deal.title}</span>
        </button>
      </div>
    </article>
  );
}
