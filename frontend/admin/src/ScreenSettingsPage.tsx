import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { API, CATEGORY_IDS, CATEGORY_LABELS, DEFAULT_SCREEN, ScreenSettings, formatAgorot, type MenuItem, type ScreenPromo } from '@pizza-sosi/contracts';
import { db, callAdmin } from './firebase';

/** Where the customer site lives, seen from the admin site (admin.X → X, name-admin.web.app → name.web.app). */
function siteOrigin(): string {
  const { protocol, hostname, port } = location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') return `${protocol}//${hostname}:${port === '5174' ? '5173' : port}`;
  if (hostname.startsWith('admin.')) return `${protocol}//${hostname.slice('admin.'.length)}`;
  // Production admin on its Firebase address: the customer site lives on the real domain.
  if (hostname.startsWith('pizza-sosi-admin.')) return 'https://pizza-sosi.co.il';
  return `${protocol}//${hostname.replace(/-admin(\.web\.app|\.firebaseapp\.com)$/, '$1')}`;
}

const SLIDE_TIMES = [6, 9, 12, 15, 20, 30];
const newPromoId = () => `promo-${Math.random().toString(36).slice(2, 8)}`;

export function ScreenSettingsPage() {
  const [saved, setSaved] = useState<ScreenSettings | null>(null);
  const [items, setItems] = useState<MenuItem[]>([]);
  useEffect(
    () =>
      onSnapshot(doc(db, 'settings', 'store'), (s) => {
        const parsed = ScreenSettings.safeParse({ ...DEFAULT_SCREEN, ...(s.get('screen') ?? {}) });
        setSaved(parsed.success ? parsed.data : DEFAULT_SCREEN);
      }),
    [],
  );
  useEffect(
    () =>
      onSnapshot(collection(db, 'menuItems'), (snap) =>
        setItems(
          snap.docs
            .map((d) => ({ ...(d.data() as MenuItem), id: d.id }))
            .filter((m) => m.active)
            .sort((a, b) => a.order - b.order),
        ),
      ),
    [],
  );
  if (!saved) return <p className="muted">טוען…</p>;
  return <ScreenForm key={JSON.stringify(saved)} saved={saved} items={items} />;
}

export function ScreenForm({ saved, items }: { saved: ScreenSettings; items: MenuItem[] }) {
  const [s, setS] = useState<ScreenSettings>(saved);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const dirty = JSON.stringify(s) !== JSON.stringify(saved);
  const url = `${siteOrigin()}/screen`;
  const set = <K extends keyof ScreenSettings>(k: K, v: ScreenSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const byCat = useMemo(() => CATEGORY_IDS.map((c) => ({ c, list: items.filter((m) => m.category === c) })).filter((g) => g.list.length), [items]);

  function toggleFeatured(id: string) {
    const has = s.featuredItemIds.includes(id);
    if (!has && s.featuredItemIds.length >= 15) return;
    set('featuredItemIds', has ? s.featuredItemIds.filter((x) => x !== id) : [...s.featuredItemIds, id]);
  }
  const setPromo = (id: string, patch: Partial<ScreenPromo>) => set('promos', s.promos.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  async function save() {
    const parsed = ScreenSettings.safeParse(s);
    if (!parsed.success) {
      setMsg({ text: 'יש מבצע בלי כותרת – צריך למלא כותרת או למחוק אותו', ok: false });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await callAdmin(API.adminUpdateStoreSettings, { screen: parsed.data });
      setMsg({ text: 'נשמר ✓ המסך מתעדכן תוך כמה שניות', ok: true });
    } catch (e) {
      setMsg({ text: (e as Error).message || 'השמירה נכשלה', ok: false });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="store-page screen-admin">
      <h1>מסך בפיצרייה</h1>
      <div className="store-grid">
        <section className="card card--today" aria-labelledby="scr-open">
          <h2 id="scr-open">פתיחת המסך</h2>
          <p>
            פותחים את הקישור בדפדפן של הטלוויזיה ולוחצים <strong>״מסך מלא״</strong>. המחירים, המנות שנגמרו והמבצעים מתעדכנים לבד.
          </p>
          <div className="row">
            <a className="btn" href={url} target="_blank" rel="noreferrer">
              פתיחת המסך
            </a>
            <button className="btn btn--ghost" type="button" onClick={() => void navigator.clipboard?.writeText(url).then(() => setMsg({ text: 'הקישור הועתק', ok: true }))}>
              העתקת קישור
            </button>
          </div>
          <p className="muted small" dir="ltr">
            {url}
          </p>
        </section>

        <section className="card" aria-labelledby="scr-show">
          <h2 id="scr-show">מה מוצג</h2>
          <label className="field">
            <span>זמן לכל שקופית</span>
            <select value={s.slideSeconds} onChange={(e) => set('slideSeconds', Number(e.target.value))}>
              {SLIDE_TIMES.map((t) => (
                <option key={t} value={t}>
                  {t} שניות
                </option>
              ))}
            </select>
          </label>
          <label className="switch">
            <input type="checkbox" checked={s.showReady} onChange={(e) => set('showReady', e.target.checked)} />
            מספרי הזמנות בהכנה / מוכנות לאיסוף
          </label>
          <label className="switch">
            <input type="checkbox" checked={s.showQr} onChange={(e) => set('showQr', e.target.checked)} />
            קוד QR להזמנה מהטלפון
          </label>
          <fieldset className="screen-admin__cats">
            <legend>מחירונים לפי קטגוריה</legend>
            {CATEGORY_IDS.map((c) => (
              <label key={c} className="switch switch--sm">
                <input
                  type="checkbox"
                  checked={s.menuCategories.includes(c)}
                  onChange={(e) => set('menuCategories', e.target.checked ? CATEGORY_IDS.filter((x) => x === c || s.menuCategories.includes(x)) : s.menuCategories.filter((x) => x !== c))}
                />
                {CATEGORY_LABELS[c]}
              </label>
            ))}
          </fieldset>
        </section>

        <section className="card card--wide" aria-labelledby="scr-promos">
          <h2 id="scr-promos">מבצעים</h2>
          <p className="muted small">כל מבצע מקבל שקופית אדומה גדולה. אימוג׳י אחד, כותרת קצרה ומשפט הסבר.</p>
          <ul className="screen-admin__promos">
            {s.promos.map((p) => (
              <li key={p.id} className={p.active ? '' : 'is-off'}>
                <label className="field screen-admin__emoji">
                  <span>אימוג׳י</span>
                  <input value={p.emoji} maxLength={8} onChange={(e) => setPromo(p.id, { emoji: e.target.value })} />
                </label>
                <label className="field">
                  <span>כותרת</span>
                  <input value={p.title} maxLength={50} required onChange={(e) => setPromo(p.id, { title: e.target.value })} placeholder="למשל: שתייה חינם" />
                </label>
                <label className="field screen-admin__text">
                  <span>הסבר</span>
                  <input value={p.text} maxLength={120} onChange={(e) => setPromo(p.id, { text: e.target.value })} placeholder="למשל: בכל הזמנה מעל 100 ₪" />
                </label>
                <label className="switch switch--sm">
                  <input type="checkbox" checked={p.active} onChange={(e) => setPromo(p.id, { active: e.target.checked })} />
                  מוצג
                </label>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => set('promos', s.promos.filter((x) => x.id !== p.id))}>
                  מחיקה
                </button>
              </li>
            ))}
          </ul>
          {s.promos.length < 8 && (
            <button type="button" className="btn btn--ghost" onClick={() => set('promos', [...s.promos, { id: newPromoId(), title: '', text: '', emoji: '🔥', active: true }])}>
              + מבצע חדש
            </button>
          )}
        </section>

        <section className="card card--wide" aria-labelledby="scr-feat">
          <h2 id="scr-feat">מנות בתמונה גדולה ({s.featuredItemIds.length}/15)</h2>
          <p className="muted small">
            בלי בחירה המסך בוחר לבד: מנות שסומנו ״מומלץ״ או ״חדש״ ויש להן תמונה. מנה בלי תמונה מוצגת כפיצה מצוירת.
          </p>
          {byCat.map(({ c, list }) => (
            <fieldset key={c} className="screen-admin__feat">
              <legend>{CATEGORY_LABELS[c]}</legend>
              {list.map((m) => (
                <label key={m.id} className={`chip ${s.featuredItemIds.includes(m.id) ? 'chip--on' : ''}`}>
                  <input type="checkbox" className="sr-only" checked={s.featuredItemIds.includes(m.id)} onChange={() => toggleFeatured(m.id)} />
                  {m.imagePath ? '📷 ' : ''}
                  {m.name} · {formatAgorot(m.priceAgorot)}
                </label>
              ))}
            </fieldset>
          ))}
        </section>
      </div>

      <div className={`screen-admin__save ${dirty ? 'is-dirty' : ''}`}>
        {msg && (
          <p className={msg.ok ? 'saved' : 'error'} role={msg.ok ? 'status' : 'alert'}>
            {msg.text}
          </p>
        )}
        <button className="btn btn--big" disabled={busy || !dirty} onClick={() => void save()}>
          {busy ? 'שומר…' : dirty ? 'שמירת המסך' : 'אין שינויים'}
        </button>
      </div>
    </div>
  );
}
