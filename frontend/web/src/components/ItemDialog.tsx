import { useEffect, useRef, useState } from 'react';
import { formatAgorot, COVERAGE_LABELS, ITEM_TAG_LABELS } from '@pizza-sosi/contracts/constants';
import { PizzaPreview, type PreviewTopping } from './PizzaPreview';
import type { MenuItem, AddOnOption } from '@pizza-sosi/contracts';
import { useCart, addOnsPrice, type Coverage, type CartLine } from '../store/cart';
import { announce, notifyAdded } from '../lib/a11y';

/** Pick toppings and add to the cart – or, with `editing`, change a line that's already in the cart. */
export function ItemDialog({ item, editing, onClose }: { item: MenuItem | null; editing?: CartLine | null; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (item && !d.open) d.showModal();
    else if (!item && d.open) d.close();
  }, [item]);

  return (
    <dialog ref={ref} className="sheet" onClose={onClose} aria-labelledby="sheet-title">
      {/* keyed by item: every open starts with a fresh form */}
      {item && <ItemForm key={editing?.key ?? item.id} item={item} editing={editing ?? null} onDone={() => ref.current?.close()} />}
    </dialog>
  );
}

function priceLabel(o: AddOnOption) {
  if (o.wholeAgorot === 0 && o.halfAgorot === null) return 'חינם';
  return `+${formatAgorot(o.wholeAgorot)}`;
}

function ItemForm({ item, editing, onDone }: { item: MenuItem; editing: CartLine | null; onDone: () => void }) {
  const add = useCart((s) => s.add);
  const replace = useCart((s) => s.replace);
  // Editing: start from the line's choices. New: single-choice groups (dough, cheese…) start on their default option.
  const [chosen, setChosen] = useState<Map<string, Coverage>>(() =>
    editing
      ? new Map(editing.addOns.map((a) => [a.id, a.coverage]))
      : new Map(item.addOnGroups.filter((g) => g.selection === 'single' && g.defaultOptionId).map((g) => [g.defaultOptionId!, 'whole'])),
  );
  const [quantity, setQuantity] = useState(editing?.quantity ?? 1);
  const [note, setNote] = useState(editing?.note ?? '');

  const groups = item.addOnGroups
    .map((g) => ({ ...g, options: g.options.filter((o) => o.active) }))
    .filter((g) => g.options.length > 0)
    .toSorted((a, b) => a.order - b.order);
  const chosenList = [...chosen].map(([id, coverage]) => ({ id, coverage }));
  const hasHalves = groups.some((g) => g.options.some((o) => o.halfAgorot !== null));
  const showPreview = item.category === 'pizzas';
  const previewToppings: PreviewTopping[] = groups
    .filter((g) => g.selection !== 'single')
    .flatMap((g) => g.options)
    .filter((o) => chosen.has(o.id))
    .map((o) => ({ id: o.id, name: o.name, placement: o.halfAgorot === null ? 'whole' : chosen.get(o.id)! }));
  // The preview follows the dough and cheese choices too.
  const chosenNames = new Set(groups.flatMap((g) => g.options).filter((o) => chosen.has(o.id)).map((o) => o.name));
  const dough = chosenNames.has('עבה') ? 'thick' : chosenNames.has('דק') ? 'thin' : 'standard';
  const cheese = chosenNames.has('גבינת מוצרלה') ? 'mozzarella' : [...chosenNames].some((n) => n.includes('גבינות קשות')) ? 'hardMix' : 'house';
  const missing = groups.filter((g) => g.selection === 'single' && !g.options.some((o) => chosen.has(o.id)));
  const pickOne = (groupOptionIds: string[], id: string) =>
    setChosen((m) => {
      const next = new Map(m);
      for (const other of groupOptionIds) next.delete(other);
      next.set(id, 'whole');
      return next;
    });
  const unit = item.priceAgorot + addOnsPrice(item, chosenList).total;

  const toggle = (id: string) =>
    setChosen((m) => {
      const next = new Map(m);
      if (next.has(id)) next.delete(id);
      else next.set(id, 'whole');
      return next;
    });
  const setCoverage = (id: string, c: Coverage) => setChosen((m) => new Map(m).set(id, c));

  return (
    <form
      method="dialog"
      className="sheet__body"
      onSubmit={() => {
        if (editing) {
          replace(editing.key, item, chosenList, quantity, note.trim());
          announce(`${item.name} עודכן בסל`);
        } else {
          add(item, chosenList, quantity, note.trim());
          notifyAdded(item.name, quantity);
        }
      }}
    >
      <div className="sheet__head">
        <h2 id="sheet-title">{item.name}</h2>
        <button type="button" className="icon-button" aria-label="סגירה" onClick={onDone}>×</button>
      </div>
      {item.tags.length > 0 && (
        <p className="item-card__tags">
          {item.tags.map((t) => <span key={t} className={`badge badge--${t}`}>{ITEM_TAG_LABELS[t].icon} {ITEM_TAG_LABELS[t].label}</span>)}
        </p>
      )}
      {item.description && <p className="sheet__desc">{item.description}</p>}

      {showPreview && <PizzaPreview toppings={previewToppings} dough={dough} cheese={cheese} />}
      {showPreview && hasHalves && <p className="sheet__tip">אפשר לשים כל תוספת על כל הפיצה או רק על חצי ממנה.</p>}

      {groups.map((g) => {
        if (g.selection === 'single') {
          const ids = g.options.map((o) => o.id);
          return (
            <fieldset key={g.id} className="choice">
              <legend>
                {g.name}
                {!g.options.some((o) => chosen.has(o.id)) && <span className="choice__required"> · חובה לבחור</span>}
              </legend>
              <div className="choice__row">
                {g.options.map((o) => (
                  <label key={o.id} className={chosen.has(o.id) ? 'is-on' : ''}>
                    <input type="radio" name={`g-${g.id}`} checked={chosen.has(o.id)} onChange={() => pickOne(ids, o.id)} />
                    {o.name}
                    {o.wholeAgorot > 0 && <span className="price-tag">+{formatAgorot(o.wholeAgorot)}</span>}
                  </label>
                ))}
              </div>
            </fieldset>
          );
        }
        const half = g.options.find((o) => o.halfAgorot !== null);
        return (
          <fieldset key={g.id} className="addons">
            <legend>
              {g.name}
              {half && (
                <span className="addons__hint">
                  {' '}· כל הפיצה {formatAgorot(half.wholeAgorot)} · חצי {formatAgorot(half.halfAgorot!)}
                </span>
              )}
            </legend>
            {g.options.map((o) => {
              const coverage = chosen.get(o.id);
              return (
                <div key={o.id} className={`addon ${coverage ? 'is-on' : ''}`}>
                  <label className="addon__main">
                    <input type="checkbox" checked={coverage !== undefined} onChange={() => toggle(o.id)} />
                    <span className="addon__name">{o.name}</span>
                    {o.halfAgorot === null && <span className="addon__price">{priceLabel(o)}</span>}
                  </label>
                  {coverage && o.halfAgorot !== null && (
                    <div className="coverage" role="radiogroup" aria-label={`${o.name}: איפה לשים?`}>
                      {(['left', 'whole', 'right'] as const).map((c) => (
                        <label key={c} className={coverage === c ? 'is-on' : ''} title={COVERAGE_LABELS[c]}>
                          <input type="radio" name={`cov-${o.id}`} checked={coverage === c} onChange={() => setCoverage(o.id, c)} />
                          <HalfIcon part={c} />
                          <span>{c === 'whole' ? 'הכל' : c === 'right' ? 'ימין' : 'שמאל'}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </fieldset>
        );
      })}

      <label className="field">
        <span>הערה למטבח (לא חובה)</span>
        <input name="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} autoComplete="off" placeholder="לדוגמה: בצק דק…" />
      </label>

      <div className="sheet__foot">
        <div className="stepper" role="group" aria-label="כמות">
          <button type="button" aria-label="הפחתה" onClick={() => setQuantity((q) => Math.max(1, q - 1))}>−</button>
          <output aria-live="polite">{quantity}</output>
          <button type="button" aria-label="הוספה" onClick={() => setQuantity((q) => Math.min(20, q + 1))}>+</button>
        </div>
        <button type="submit" className="button button--primary" disabled={missing.length > 0}>
          {missing.length > 0 ? `בחרו ${missing[0]!.name}` : `${editing ? 'עדכון' : 'הוספה לסל'} · ${formatAgorot(unit * quantity)}`}
        </button>
      </div>
    </form>
  );
}

/** Tiny pizza: the filled part shows where the topping goes. Not mirrored by RTL on purpose. */
function HalfIcon({ part }: { part: 'whole' | 'right' | 'left' }) {
  const d = part === 'whole' ? 'M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20Z' : part === 'right' ? 'M12 2a10 10 0 0 1 0 20Z' : 'M12 2a10 10 0 0 0 0 20Z';
  return (
    <svg className="half-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#fff5d6" stroke="currentColor" strokeWidth="1.5" />
      <path d={d} fill="#e8a93a" />
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {part !== 'whole' && <line x1="12" y1="2" x2="12" y2="22" stroke="currentColor" strokeWidth="1.2" strokeDasharray="2 2" />}
    </svg>
  );
}
