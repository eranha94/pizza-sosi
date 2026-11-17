import { useMemo, useState, type FormEvent } from 'react';
import { API, CATEGORY_IDS, CATEGORY_LABELS, formatAgorot, type CategoryId } from '@pizza-sosi/contracts';
import { callAdmin } from './firebase';
import type { AdminMenuItem } from './MenuEditor';

type Active = 'keep' | 'on' | 'off';

/** Change one topping on every item at once: price (whole / half) and on/off. Preview first, then apply. */
export function BulkOption({ items }: { items: AdminMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<CategoryId | ''>('');
  const [whole, setWhole] = useState('');
  const [half, setHalf] = useState('');
  const [active, setActive] = useState<Active>('keep');
  const [preview, setPreview] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Every topping name with its current prices, to pick from.
  const options = useMemo(() => {
    const m = new Map<string, { count: number; prices: Set<string> }>();
    for (const it of items)
      for (const g of it.addOnGroups ?? [])
        if ((g.selection ?? 'multi') === 'multi')
          for (const o of g.options) {
            const e = m.get(o.name) ?? { count: 0, prices: new Set<string>() };
            e.count++;
            e.prices.add(o.halfAgorot === null ? formatAgorot(o.wholeAgorot) : `${formatAgorot(o.wholeAgorot)} / חצי ${formatAgorot(o.halfAgorot)}`);
            m.set(o.name, e);
          }
    return [...m].sort((a, b) => a[0].localeCompare(b[0], 'he'));
  }, [items]);

  function request(dryRun: boolean) {
    return {
      optionName: name,
      ...(category && { category }),
      ...(whole.trim() !== '' && { wholeAgorot: Math.round(Number(whole) * 100) }),
      ...(half.trim() !== '' && { halfAgorot: Math.round(Number(half) * 100) }),
      ...(active !== 'keep' && { active: active === 'on' }),
      dryRun,
    };
  }
  const nothing = whole.trim() === '' && half.trim() === '' && active === 'keep';

  async function check(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = (await callAdmin(API.adminBulkUpdateOption, request(true))) as { items: string[] };
      setPreview(r.items);
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    try {
      const r = (await callAdmin(API.adminBulkUpdateOption, request(false))) as { items: string[] };
      setMsg({ ok: true, text: `"${name}" עודכן ב־${r.items.length} פריטים ✓` });
      setPreview(null);
      setWhole('');
      setHalf('');
      setActive('keep');
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const reset = () => setPreview(null);

  return (
    <section className="card bulk">
      <button type="button" className="bulk__toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span>⚡ שינוי גורף של תוספת</span>
        <span className="muted small">למשל: "זיתים" ב־12 ₪ בכל הפיצות</span>
        <span aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <form className="bulk__form" onSubmit={check}>
          <div className="row">
            <label className="field">
              <span>תוספת</span>
              <select value={name} onChange={(e) => (setName(e.target.value), reset())} required>
                <option value="">בחירה…</option>
                {options.map(([n, e]) => (
                  <option key={n} value={n}>
                    {n} · ב־{e.count} פריטים · {[...e.prices].join(' | ')}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>רק בקטגוריה</span>
              <select value={category} onChange={(e) => (setCategory(e.target.value as CategoryId | ''), reset())}>
                <option value="">כל התפריט</option>
                {CATEGORY_IDS.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="row">
            <label className="field">
              <span>מחיר כל הפיצה ₪ (ריק = בלי שינוי)</span>
              <input type="number" min={0} step="0.5" value={whole} onChange={(e) => (setWhole(e.target.value), reset())} />
            </label>
            <label className="field">
              <span>מחיר חצי ₪ (ריק = בלי שינוי)</span>
              <input type="number" min={0} step="0.5" value={half} onChange={(e) => (setHalf(e.target.value), reset())} />
            </label>
            <label className="field">
              <span>זמינות</span>
              <select value={active} onChange={(e) => (setActive(e.target.value as Active), reset())}>
                <option value="keep">בלי שינוי</option>
                <option value="on">זמינה</option>
                <option value="off">לא זמינה (נגמר)</option>
              </select>
            </label>
          </div>
          {!preview ? (
            <button className="btn" disabled={!name || nothing || busy}>{busy ? 'בודק…' : 'בדיקה – אילו פריטים יתעדכנו?'}</button>
          ) : (
            <div className="bulk__preview">
              {preview.length === 0 ? (
                <p className="muted">לא נמצאו פריטים עם "{name}".</p>
              ) : (
                <>
                  <p>
                    יתעדכנו <strong>{preview.length}</strong> פריטים: <span className="muted">{preview.join(', ')}</span>
                  </p>
                  <div className="row">
                    <button type="button" className="btn" onClick={apply} disabled={busy}>{busy ? 'מעדכן…' : `עדכון ${preview.length} פריטים`}</button>
                    <button type="button" className="btn btn--ghost" onClick={reset} disabled={busy}>ביטול</button>
                  </div>
                </>
              )}
            </div>
          )}
          {msg && <p className={msg.ok ? 'saved' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
        </form>
      )}
    </section>
  );
}
