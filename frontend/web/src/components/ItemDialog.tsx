import { useEffect, useRef, useState } from 'react';
import { formatAgorot, COVERAGE_LABELS } from '@pizza-sosi/contracts/constants';
import type { MenuItem, AddOnOption } from '@pizza-sosi/contracts';
import { useCart, addOnsPrice, type Coverage } from '../store/cart';

export function ItemDialog({ item, onClose }: { item: MenuItem | null; onClose: () => void }) {
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
      {item && <ItemForm key={item.id} item={item} onDone={() => ref.current?.close()} />}
    </dialog>
  );
}

function priceLabel(o: AddOnOption) {
  if (o.wholeAgorot === 0 && o.halfAgorot === null) return 'חינם';
  return `+${formatAgorot(o.wholeAgorot)}`;
}

function ItemForm({ item, onDone }: { item: MenuItem; onDone: () => void }) {
  const add = useCart((s) => s.add);
  const [chosen, setChosen] = useState<Map<string, Coverage>>(new Map());
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');

  const groups = item.addOnGroups
    .map((g) => ({ ...g, options: g.options.filter((o) => o.active) }))
    .filter((g) => g.options.length > 0)
    .toSorted((a, b) => a.order - b.order);
  const chosenList = [...chosen].map(([id, coverage]) => ({ id, coverage }));
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
    <form method="dialog" className="sheet__body" onSubmit={() => add(item, chosenList, quantity, note.trim())}>
      <div className="sheet__head">
        <h2 id="sheet-title">{item.name}</h2>
        <button type="button" className="icon-button" aria-label="סגירה" onClick={onDone}>×</button>
      </div>
      {item.description && <p className="sheet__desc">{item.description}</p>}

      {groups.map((g) => {
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
                    <div className="coverage" role="radiogroup" aria-label={`${o.name}: על איזה חלק?`}>
                      {(['whole', 'half'] as const).map((c) => (
                        <label key={c} className={coverage === c ? 'is-on' : ''}>
                          <input type="radio" name={`cov-${o.id}`} checked={coverage === c} onChange={() => setCoverage(o.id, c)} />
                          {c === 'half' ? 'חצי' : COVERAGE_LABELS[c]}
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
        <button type="submit" className="button button--primary">
          הוספה לסל · {formatAgorot(unit * quantity)}
        </button>
      </div>
    </form>
  );
}
