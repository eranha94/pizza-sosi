import { useEffect, useRef, useState } from 'react';
import { formatAgorot } from '@pizza-sosi/contracts/constants';
import type { MenuItem } from '@pizza-sosi/contracts';
import { useCart } from '../store/cart';

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

function ItemForm({ item, onDone }: { item: MenuItem; onDone: () => void }) {
  const add = useCart((s) => s.add);
  const [addOnIds, setAddOnIds] = useState<string[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState('');

  const addOns = item.addOns.filter((a) => a.active).toSorted((a, b) => a.order - b.order);
  const unit = item.priceAgorot + addOns.filter((a) => addOnIds.includes(a.id)).reduce((s, a) => s + a.priceAgorot, 0);
  const toggle = (id: string) => setAddOnIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  return (
      <form
        method="dialog"
        className="sheet__body"
        onSubmit={() => {
          add(item, addOnIds, quantity, note.trim());
        }}
      >
        <div className="sheet__head">
          <h2 id="sheet-title">{item.name}</h2>
          <button type="button" className="icon-button" aria-label="סגירה" onClick={onDone}>×</button>
        </div>
        {item.description && <p className="sheet__desc">{item.description}</p>}

        {addOns.length > 0 && (
          <fieldset className="addons">
            <legend>תוספות</legend>
            {addOns.map((a) => (
              <label key={a.id} className="addon">
                <input type="checkbox" checked={addOnIds.includes(a.id)} onChange={() => toggle(a.id)} />
                <span className="addon__name">{a.name}</span>
                <span className="addon__price">{a.priceAgorot ? `+${formatAgorot(a.priceAgorot)}` : 'חינם'}</span>
              </label>
            ))}
          </fieldset>
        )}

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
