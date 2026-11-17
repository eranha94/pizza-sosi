import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { API, CATEGORY_IDS, CATEGORY_LABELS, formatAgorot, type MenuItem, type CategoryId, type UpsertMenuItemRequest } from '@pizza-sosi/contracts';
import { db, callAdmin, bucket } from './firebase';
import { photoUrl } from './image';
import { ItemEditor } from './ItemEditor';
import { BulkOption } from './BulkOption';

export type AdminMenuItem = MenuItem & { deletedAt?: unknown };

export function toRequest(item: AdminMenuItem, patch: Partial<MenuItem> = {}): UpsertMenuItemRequest {
  const x = { ...item, ...patch };
  return {
    ...(x.id ? { id: x.id } : {}),
    name: x.name,
    description: x.description ?? '',
    category: x.category,
    priceAgorot: x.priceAgorot,
    imagePath: x.imagePath ?? null,
    order: x.order,
    active: x.active,
    tags: x.tags ?? [],
    addOnGroups: (x.addOnGroups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      order: g.order,
      selection: g.selection ?? 'multi',
      defaultOptionId: g.defaultOptionId ?? null,
      options: g.options.map((o) => ({ id: o.id, name: o.name, wholeAgorot: o.wholeAgorot, halfAgorot: o.halfAgorot, active: o.active })),
    })),
  };
}

function useAllMenuItems() {
  const [items, setItems] = useState<AdminMenuItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(
    () =>
      onSnapshot(
        collection(db, 'menuItems'),
        (snap) => setItems(snap.docs.map((d) => ({ ...(d.data() as MenuItem), id: d.id })).filter((x) => !(x as AdminMenuItem).deletedAt)),
        () => setError('לא הצלחנו לטעון את התפריט'),
      ),
    [],
  );
  return { items, error };
}

type Editing = { item: AdminMenuItem | null; category: CategoryId } | null;

export function MenuEditor() {
  const { items, error } = useAllMenuItems();
  const [editing, setEditing] = useState<Editing>(null);
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const byCat = useMemo(() => {
    const m = new Map<CategoryId, AdminMenuItem[]>(CATEGORY_IDS.map((c) => [c, []]));
    const f = filter.trim();
    for (const it of items ?? []) if (!f || it.name.includes(f)) m.get(it.category)?.push(it);
    for (const list of m.values()) list.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'he'));
    return m;
  }, [items, filter]);

  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg(ok);
    } catch (e) {
      setMsg((e as Error).message || 'הפעולה נכשלה');
    } finally {
      setBusy(null);
    }
  }

  const toggleActive = (it: AdminMenuItem) =>
    run(it.id, () => callAdmin(API.adminUpsertMenuItem, toRequest(it, { active: !it.active })), it.active ? `"${it.name}" הוסתר מהתפריט` : `"${it.name}" מוצג בתפריט`);

  /** Move up/down inside its category; renumbers the category (10, 20, 30…) and saves only what changed. */
  const move = (list: AdminMenuItem[], index: number, dir: -1 | 1) =>
    run(list[index]!.id, async () => {
      const next = [...list];
      const [moved] = next.splice(index, 1);
      next.splice(index + dir, 0, moved!);
      const changed = next.map((it, i) => ({ it, order: (i + 1) * 10 })).filter(({ it, order }) => it.order !== order);
      await Promise.all(changed.map(({ it, order }) => callAdmin(API.adminUpsertMenuItem, toRequest(it, { order }))));
    });

  if (error) return <p className="error">{error}</p>;
  if (!items) return <p className="muted">טוען תפריט…</p>;

  return (
    <div className="menu-page">
      <div className="page-head">
        <h1>
          תפריט <span className="count">{items.length}</span>
        </h1>
        <input className="search" type="search" placeholder="חיפוש פריט…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="חיפוש פריט" />
      </div>
      <nav className="cat-jump" aria-label="קטגוריות">
        {CATEGORY_IDS.map((c) => (
          <a key={c} href={`#cat-${c}`} onClick={(e) => { e.preventDefault(); document.getElementById(`cat-${c}`)?.scrollIntoView({ behavior: 'smooth' }); }}>
            {CATEGORY_LABELS[c]} <span className="count">{byCat.get(c)!.length}</span>
          </a>
        ))}
      </nav>
      {msg && <p className="saved" role="status">{msg}</p>}
      <BulkOption items={items} />

      {CATEGORY_IDS.map((c) => {
        const list = byCat.get(c)!;
        return (
          <section key={c} id={`cat-${c}`} className="menu-cat" aria-labelledby={`cat-h-${c}`}>
            <div className="menu-cat__head">
              <h2 id={`cat-h-${c}`}>{CATEGORY_LABELS[c]}</h2>
              <button className="btn btn--sm" onClick={() => setEditing({ item: null, category: c })}>
                + פריט חדש
              </button>
            </div>
            {list.length === 0 ? (
              <p className="muted">{filter ? 'אין תוצאות' : 'אין פריטים בקטגוריה'}</p>
            ) : (
              <ul className="menu-list">
                {list.map((it, i) => {
                  const thumb = photoUrl(bucket, it.imagePath, 320);
                  const groups = it.addOnGroups ?? [];
                  return (
                    <li key={it.id} className={`menu-row ${it.active ? '' : 'is-hidden'}`}>
                      <button className="menu-row__main" onClick={() => setEditing({ item: it, category: it.category })} aria-label={`עריכת ${it.name}`}>
                        {thumb ? (
                          <img className="menu-row__img" src={thumb} alt="" width="56" height="56" loading="lazy" onError={(e) => (e.currentTarget.src = photoUrl(bucket, it.imagePath)!)} />
                        ) : (
                          <span className="menu-row__img menu-row__img--empty" aria-hidden="true" />
                        )}
                        <span className="menu-row__text">
                          <strong>{it.name}</strong>
                          <span className="muted small">
                            {groups.length > 0 ? groups.map((g) => `${g.name} (${g.options.length})`).join(' · ') : 'בלי תוספות'}
                          </span>
                        </span>
                        <span className="menu-row__price">{formatAgorot(it.priceAgorot)}</span>
                      </button>
                      <div className="menu-row__tools">
                        <button className="icon-btn" disabled={i === 0 || !!busy || !!filter} onClick={() => move(list, i, -1)} aria-label={`הזזת ${it.name} למעלה`}>
                          ↑
                        </button>
                        <button className="icon-btn" disabled={i === list.length - 1 || !!busy || !!filter} onClick={() => move(list, i, 1)} aria-label={`הזזת ${it.name} למטה`}>
                          ↓
                        </button>
                        <label className="switch switch--sm" title={it.active ? 'מוצג באתר' : 'מוסתר מהאתר'}>
                          <input type="checkbox" checked={it.active} disabled={busy === it.id} onChange={() => toggleActive(it)} />
                          <span>{it.active ? 'מוצג' : 'מוסתר'}</span>
                        </label>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {editing && (
        <ItemEditor
          item={editing.item}
          category={editing.category}
          allItems={items}
          nextOrder={((byCat.get(editing.category) ?? []).at(-1)?.order ?? 0) + 10}
          onClose={(text) => {
            setEditing(null);
            if (text) setMsg(text);
          }}
        />
      )}
    </div>
  );
}
