import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { API, CATEGORY_LABELS, type MenuItem } from '@pizza-sosi/contracts';
import { db, callAdmin } from './firebase';

type Tab = 'items' | 'options';

/** Quick "sold out" switches for the kitchen: dishes and toppings, with search. Opens from the orders screen. */
export function SoldOut({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [tab, setTab] = useState<Tab>('items');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
    return onSnapshot(collection(db, 'menuItems'), (s) =>
      setItems(s.docs.map((d) => ({ ...(d.data() as MenuItem), id: d.id })).filter((x) => !(x as { deletedAt?: unknown }).deletedAt)),
    );
  }, []);

  // Toppings by name: available if active anywhere.
  const options = useMemo(() => {
    const m = new Map<string, { active: boolean; count: number }>();
    for (const it of items)
      for (const g of it.addOnGroups ?? [])
        for (const o of g.options) {
          const e = m.get(o.name) ?? { active: false, count: 0 };
          m.set(o.name, { active: e.active || o.active, count: e.count + 1 });
        }
    return [...m].sort((a, b) => a[0].localeCompare(b[0], 'he'));
  }, [items]);

  async function set(key: string, data: unknown) {
    setBusy(key);
    setError(null);
    try {
      await callAdmin(API.adminSetAvailability, data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const f = q.trim();
  const shownItems = items.filter((i) => !f || i.name.includes(f)).sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order);
  const shownOptions = options.filter(([n]) => !f || n.includes(f));
  const soldOutCount = items.filter((i) => !i.active).length + options.filter(([, e]) => !e.active).length;

  return (
    <dialog ref={dialog} className="editor soldout" aria-labelledby="so-h" onClose={onClose}>
      <div className="editor__form">
        <header className="editor__head">
          <h2 id="so-h">🚫 מה נגמר? {soldOutCount > 0 && <span className="count">{soldOutCount}</span>}</h2>
          <button type="button" className="icon-btn" onClick={() => dialog.current?.close()} aria-label="סגירה">✕</button>
        </header>
        <div className="editor__body">
          <div className="row">
            <div className="seg" role="tablist">
              <label className={tab === 'items' ? 'is-on' : ''}><input type="radio" checked={tab === 'items'} onChange={() => setTab('items')} /> מנות</label>
              <label className={tab === 'options' ? 'is-on' : ''}><input type="radio" checked={tab === 'options'} onChange={() => setTab('options')} /> תוספות</label>
            </div>
            <input className="search" type="search" placeholder="חיפוש…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="חיפוש" />
          </div>
          <p className="muted small">כבוי = לא מוצג ללקוחות / לא ניתן להזמין. השינוי מיידי באתר.</p>
          {error && <p className="error" role="alert">{error}</p>}
          <ul className="avail">
            {tab === 'items'
              ? shownItems.map((i) => (
                  <li key={i.id} className={i.active ? '' : 'is-out'}>
                    <span>
                      <strong>{i.name}</strong> <span className="muted small">{CATEGORY_LABELS[i.category]}</span>
                    </span>
                    <label className="switch">
                      <input type="checkbox" checked={i.active} disabled={busy === i.id} onChange={(e) => set(i.id, { kind: 'item', id: i.id, active: e.target.checked })} />
                      <span>{i.active ? 'זמין' : 'נגמר'}</span>
                    </label>
                  </li>
                ))
              : shownOptions.map(([name, e]) => (
                  <li key={name} className={e.active ? '' : 'is-out'}>
                    <span>
                      <strong>{name}</strong> <span className="muted small">ב־{e.count} מקומות</span>
                    </span>
                    <label className="switch">
                      <input type="checkbox" checked={e.active} disabled={busy === name} onChange={(ev) => set(name, { kind: 'option', name, active: ev.target.checked })} />
                      <span>{e.active ? 'זמין' : 'נגמר'}</span>
                    </label>
                  </li>
                ))}
          </ul>
        </div>
      </div>
    </dialog>
  );
}
