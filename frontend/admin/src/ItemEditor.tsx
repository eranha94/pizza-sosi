import { useEffect, useRef, useState, type FormEvent } from 'react';
import { API, CATEGORY_IDS, CATEGORY_LABELS, type CategoryId, type MenuItem } from '@pizza-sosi/contracts';
import { callAdmin, bucket } from './firebase';
import { uploadMenuPhoto, photoUrl } from './image';
import { toRequest, type AdminMenuItem } from './MenuEditor';

/* Draft model: prices as text (₪) while typing; converted to agorot on save. */
interface DOpt { id: string; name: string; whole: string; half: string; active: boolean }
interface DGroup { id: string; name: string; selection: 'multi' | 'single'; defaultOptionId: string | null; options: DOpt[] }

const newId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 20);
const shek = (agorot: number | null | undefined) => (agorot === null || agorot === undefined ? '' : String(agorot / 100));
const ag = (s: string) => Math.round(Number(s || 0) * 100);
const validPrice = (s: string) => s.trim() !== '' && Number.isFinite(Number(s)) && Number(s) >= 0 && Number(s) <= 10_000;

const toDraft = (groups: MenuItem['addOnGroups']): DGroup[] =>
  [...groups]
    .sort((a, b) => a.order - b.order)
    .map((g) => ({
      id: g.id,
      name: g.name,
      selection: g.selection ?? 'multi',
      defaultOptionId: g.defaultOptionId ?? null,
      options: g.options.map((o) => ({ id: o.id, name: o.name, whole: shek(o.wholeAgorot), half: shek(o.halfAgorot), active: o.active })),
    }));

export function ItemEditor({
  item,
  category,
  allItems,
  nextOrder,
  onClose,
}: {
  item: AdminMenuItem | null;
  category: CategoryId;
  allItems: AdminMenuItem[];
  nextOrder: number;
  onClose: (message?: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(item?.name ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [cat, setCat] = useState<CategoryId>(item?.category ?? category);
  const [price, setPrice] = useState(shek(item?.priceAgorot ?? null));
  const [active, setActive] = useState(item?.active ?? true);
  const [imagePath, setImagePath] = useState<string | null>(item?.imagePath ?? null);
  const [groups, setGroups] = useState<DGroup[]>(() => toDraft(item?.addOnGroups ?? []));
  const [photoState, setPhotoState] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const d = dialog.current!;
    d.showModal();
    return () => d.close();
  }, []);

  const touch = <T,>(set: (v: T) => void) => (v: T) => {
    setDirty(true);
    set(v);
  };
  const updateGroup = (gi: number, patch: Partial<DGroup>) => {
    setDirty(true);
    setGroups((gs) => gs.map((g, i) => (i === gi ? { ...g, ...patch } : g)));
  };
  const updateOpt = (gi: number, oi: number, patch: Partial<DOpt>) =>
    updateGroup(gi, { options: groups[gi]!.options.map((o, i) => (i === oi ? { ...o, ...patch } : o)) });
  const moveIn = <T,>(arr: T[], i: number, dir: -1 | 1) => {
    const next = [...arr];
    const [x] = next.splice(i, 1);
    next.splice(i + dir, 0, x!);
    return next;
  };

  function requestClose() {
    if (dirty && !window.confirm('יש שינויים שלא נשמרו. לצאת בלי לשמור?')) return;
    onClose();
  }

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const path = await uploadMenuPhoto(file, setPhotoState);
      setImagePath(path);
      setDirty(true);
      setPhotoState('התמונה הועלתה – לחץ "שמירה" כדי לעדכן את האתר');
    } catch (e) {
      setPhotoState(null);
      setError((e as Error).message);
    }
  }

  function copyGroupsFrom(id: string) {
    const src = allItems.find((x) => x.id === id);
    if (!src) return;
    const existing = new Set(groups.map((g) => g.id));
    const add = toDraft(src.addOnGroups ?? []).filter((g) => !existing.has(g.id));
    if (!add.length) return setError('הקבוצות של הפריט הזה כבר קיימות כאן');
    setDirty(true);
    setGroups((gs) => [...gs, ...add]);
  }

  function validate(): string | null {
    if (!name.trim()) return 'חסר שם פריט';
    if (!validPrice(price)) return 'מחיר לא תקין';
    for (const g of groups) {
      if (!g.name.trim()) return 'לכל קבוצת תוספות צריך שם';
      if (!g.options.length) return `בקבוצה "${g.name}" אין אפשרויות`;
      for (const o of g.options) {
        if (!o.name.trim()) return `בקבוצה "${g.name}" יש אפשרות בלי שם`;
        if (!validPrice(o.whole)) return `מחיר לא תקין ב"${o.name}"`;
        if (o.half.trim() !== '' && !validPrice(o.half)) return `מחיר חצי לא תקין ב"${o.name}"`;
      }
    }
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const problem = validate();
    if (problem) return setError(problem);
    setBusy(true);
    setError(null);
    const base: AdminMenuItem = item ?? ({ id: undefined, order: nextOrder } as unknown as AdminMenuItem);
    const req = toRequest(base, {
      name: name.trim(),
      description: description.trim(),
      category: cat,
      priceAgorot: ag(price),
      active,
      imagePath,
      order: item && item.category === cat ? item.order : cat === category ? nextOrder : Math.max(0, ...allItems.filter((x) => x.category === cat).map((x) => x.order)) + 10,
      addOnGroups: groups.map((g, gi) => ({
        id: g.id,
        name: g.name.trim(),
        order: gi + 1,
        selection: g.selection,
        defaultOptionId: g.selection === 'single' && g.options.some((o) => o.id === g.defaultOptionId) ? g.defaultOptionId : null,
        options: g.options.map((o) => ({
          id: o.id,
          name: o.name.trim(),
          wholeAgorot: ag(o.whole),
          halfAgorot: g.selection === 'multi' && o.half.trim() !== '' ? ag(o.half) : null,
          active: o.active,
        })),
      })),
    });
    try {
      await callAdmin(API.adminUpsertMenuItem, req);
      onClose(item ? `"${name.trim()}" עודכן` : `"${name.trim()}" נוסף לתפריט`);
    } catch (err) {
      setError((err as Error).message || 'השמירה נכשלה');
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!item || !window.confirm(`למחוק את "${item.name}" מהתפריט?`)) return;
    setBusy(true);
    try {
      await callAdmin(API.adminDeleteMenuItem, { id: item.id });
      onClose(`"${item.name}" נמחק`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const preview = photoUrl(bucket, imagePath, 640);
  const isPizza = cat === 'pizzas';

  return (
    <dialog
      ref={dialog}
      className="editor"
      aria-labelledby="editor-h"
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
    >
      <form onSubmit={onSubmit} className="editor__form" noValidate>
        <header className="editor__head">
          <h2 id="editor-h">{item ? `עריכת ${item.name}` : `פריט חדש · ${CATEGORY_LABELS[cat]}`}</h2>
          <button type="button" className="icon-btn" onClick={requestClose} aria-label="סגירה">
            ✕
          </button>
        </header>

        <div className="editor__body">
          <div className="editor__top">
            <div className="photo">
              {preview ? (
                <img src={preview} alt="" width="160" height="160" onError={(e) => (e.currentTarget.src = photoUrl(bucket, imagePath)!)} />
              ) : (
                <span className="photo__empty">אין תמונה</span>
              )}
              <label className="btn btn--sm btn--ghost">
                {imagePath ? 'החלפת תמונה' : 'העלאת תמונה'}
                <input type="file" accept="image/*" hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />
              </label>
              {imagePath && (
                <button type="button" className="link-btn small" onClick={() => touch(setImagePath)(null)}>
                  הסרת תמונה
                </button>
              )}
              {photoState && <p className="small muted" role="status">{photoState}</p>}
            </div>
            <div className="stack stack--grow">
              <label className="field">
                <span>שם</span>
                <input value={name} onChange={(e) => touch(setName)(e.target.value)} maxLength={120} required />
              </label>
              <div className="row">
                <label className="field">
                  <span>מחיר (₪)</span>
                  <input type="number" inputMode="decimal" min={0} step="0.5" value={price} onChange={(e) => touch(setPrice)(e.target.value)} required />
                </label>
                <label className="field">
                  <span>קטגוריה</span>
                  <select value={cat} onChange={(e) => touch(setCat)(e.target.value as CategoryId)}>
                    {CATEGORY_IDS.map((c) => (
                      <option key={c} value={c}>
                        {CATEGORY_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="switch">
                <input type="checkbox" checked={active} onChange={(e) => touch(setActive)(e.target.checked)} />
                <span>{active ? 'מוצג באתר' : 'מוסתר מהאתר'}</span>
              </label>
            </div>
          </div>
          <label className="field">
            <span>תיאור</span>
            <textarea rows={3} value={description} onChange={(e) => touch(setDescription)(e.target.value)} maxLength={1000} />
          </label>

          <section className="groups" aria-labelledby="groups-h">
            <div className="groups__head">
              <h3 id="groups-h">תוספות ובחירות</h3>
              <select className="copy-from" value="" onChange={(e) => copyGroupsFrom(e.target.value)} aria-label="העתקת תוספות מפריט אחר">
                <option value="">העתקת תוספות מפריט אחר…</option>
                {allItems
                  .filter((x) => x.id !== item?.id && (x.addOnGroups ?? []).length > 0)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </select>
            </div>
            <p className="muted small">
              <b>בחירת חובה</b> – הלקוח בוחר בדיוק אחת (בצק, גבינה, רוטב). <b>תוספות</b> – אפשר לבחור כמה.
              {isPizza && ' מחיר חצי = אפשר לשים רק על חצי פיצה (ימין/שמאל). ריק = רק על כל הפיצה.'}
            </p>

            {groups.map((g, gi) => (
              <fieldset key={g.id} className={`group group--${g.selection}`}>
                <legend className="sr-only">{g.name || 'קבוצה'}</legend>
                <div className="group__head">
                  <input className="group__name" value={g.name} placeholder="שם הקבוצה (למשל: גבינה)" onChange={(e) => updateGroup(gi, { name: e.target.value })} aria-label="שם הקבוצה" maxLength={60} />
                  <div className="seg seg--sm" role="radiogroup" aria-label="סוג הקבוצה">
                    <label className={g.selection === 'single' ? 'is-on' : ''}>
                      <input type="radio" checked={g.selection === 'single'} onChange={() => updateGroup(gi, { selection: 'single' })} /> בחירת חובה
                    </label>
                    <label className={g.selection === 'multi' ? 'is-on' : ''}>
                      <input type="radio" checked={g.selection === 'multi'} onChange={() => updateGroup(gi, { selection: 'multi', defaultOptionId: null })} /> תוספות
                    </label>
                  </div>
                  <span className="group__tools">
                    <button type="button" className="icon-btn" disabled={gi === 0} onClick={() => { setDirty(true); setGroups(moveIn(groups, gi, -1)); }} aria-label="הזזת הקבוצה למעלה">↑</button>
                    <button type="button" className="icon-btn" disabled={gi === groups.length - 1} onClick={() => { setDirty(true); setGroups(moveIn(groups, gi, 1)); }} aria-label="הזזת הקבוצה למטה">↓</button>
                    <button type="button" className="icon-btn icon-btn--danger" onClick={() => window.confirm(`למחוק את הקבוצה "${g.name}"?`) && (setDirty(true), setGroups(groups.filter((_, i) => i !== gi)))} aria-label="מחיקת הקבוצה">🗑</button>
                  </span>
                </div>

                <table className="opts">
                  <thead>
                    <tr>
                      <th>אפשרות</th>
                      <th>{g.selection === 'single' ? 'תוספת מחיר ₪' : isPizza ? 'כל הפיצה ₪' : 'מחיר ₪'}</th>
                      {g.selection === 'multi' && isPizza && <th>חצי ₪</th>}
                      {g.selection === 'single' && <th>ברירת מחדל</th>}
                      <th>פעיל</th>
                      <th><span className="sr-only">פעולות</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.options.map((o, oi) => (
                      <tr key={o.id} className={o.active ? '' : 'is-off'}>
                        <td>
                          <input value={o.name} onChange={(e) => updateOpt(gi, oi, { name: e.target.value })} aria-label="שם האפשרות" maxLength={80} />
                        </td>
                        <td>
                          <input className="num" type="number" min={0} step="0.5" value={o.whole} onChange={(e) => updateOpt(gi, oi, { whole: e.target.value })} aria-label={`מחיר ${o.name}`} />
                        </td>
                        {g.selection === 'multi' && isPizza && (
                          <td>
                            <input className="num" type="number" min={0} step="0.5" value={o.half} placeholder="—" onChange={(e) => updateOpt(gi, oi, { half: e.target.value })} aria-label={`מחיר חצי ${o.name}`} />
                          </td>
                        )}
                        {g.selection === 'single' && (
                          <td className="center-cell">
                            <input type="radio" name={`def-${g.id}`} checked={g.defaultOptionId === o.id} onChange={() => updateGroup(gi, { defaultOptionId: o.id })} aria-label={`${o.name} כברירת מחדל`} />
                          </td>
                        )}
                        <td className="center-cell">
                          <input type="checkbox" checked={o.active} onChange={(e) => updateOpt(gi, oi, { active: e.target.checked })} aria-label={`${o.name} פעיל`} />
                        </td>
                        <td className="opts__tools">
                          <button type="button" className="icon-btn" disabled={oi === 0} onClick={() => updateGroup(gi, { options: moveIn(g.options, oi, -1) })} aria-label="למעלה">↑</button>
                          <button type="button" className="icon-btn icon-btn--danger" onClick={() => updateGroup(gi, { options: g.options.filter((_, i) => i !== oi), defaultOptionId: g.defaultOptionId === o.id ? null : g.defaultOptionId })} aria-label={`מחיקת ${o.name}`}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {g.selection === 'single' && (
                  <label className="small muted inline">
                    <input type="radio" name={`def-${g.id}`} checked={!g.defaultOptionId} onChange={() => updateGroup(gi, { defaultOptionId: null })} /> בלי ברירת מחדל (הלקוח חייב לבחור)
                  </label>
                )}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => updateGroup(gi, { options: [...g.options, { id: newId(), name: '', whole: g.options.at(-1)?.whole ?? '0', half: g.options.at(-1)?.half ?? '', active: true }] })}
                >
                  + הוספת אפשרות
                </button>
              </fieldset>
            ))}

            <div className="row">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setDirty(true); setGroups([...groups, { id: newId(), name: '', selection: 'single', defaultOptionId: null, options: [{ id: newId(), name: '', whole: '0', half: '', active: true }] }]); }}>
                + בחירת חובה
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setDirty(true); setGroups([...groups, { id: newId(), name: '', selection: 'multi', defaultOptionId: null, options: [{ id: newId(), name: '', whole: '0', half: '', active: true }] }]); }}>
                + קבוצת תוספות
              </button>
            </div>
          </section>
        </div>

        <footer className="editor__foot">
          {error && <p className="error" role="alert">{error}</p>}
          <div className="row">
            <button className="btn" disabled={busy}>{busy ? 'שומר…' : 'שמירה'}</button>
            <button type="button" className="btn btn--ghost" onClick={requestClose} disabled={busy}>ביטול</button>
            {item && (
              <button type="button" className="btn btn--danger push-end" onClick={onDelete} disabled={busy}>
                מחיקת פריט
              </button>
            )}
          </div>
        </footer>
      </form>
    </dialog>
  );
}
