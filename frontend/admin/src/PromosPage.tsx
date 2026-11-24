import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import {
  API,
  CATEGORY_IDS,
  CATEGORY_LABELS,
  CATEGORY_SINGULAR,
  WEEKDAY_NAMES,
  DEAL_THEMES,
  DEFAULT_LOYALTY,
  formatAgorot,
  loyaltyRewardLabel,
  localParts,
  dealIsOn,
  type MenuItem,
  type Deal,
  type Coupon,
  type LoyaltySettings,
  type UpsertDealRequest,
} from '@pizza-sosi/contracts';
import { db, callAdmin } from './firebase';
import { drawDeal, downloadDeal, type DealArtInput } from './dealArt';

type Section = 'deals' | 'coupons' | 'loyalty';
const shekel = (a: number) => (a % 100 === 0 ? String(a / 100) : (a / 100).toFixed(2));
const toAgorot = (s: string) => Math.round(Number(s.replace(',', '.')) * 100);

function useCollection<T>(name: string) {
  const [list, setList] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(
    () =>
      onSnapshot(
        collection(db, name),
        (snap) => setList(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T)),
        () => setError('לא הצלחנו לטעון'),
      ),
    [name],
  );
  return { list, error };
}

/** Deals, coupons and the loyalty card – owner only. */
export function PromosPage() {
  const [section, setSection] = useState<Section>('deals');
  return (
    <div className="promos">
      <h1>מבצעים ונאמנות</h1>
      <nav className="subtabs" aria-label="סוג">
        {(
          [
            ['deals', '🔥 מבצעים'],
            ['coupons', '🏷️ קופונים'],
            ['loyalty', '🎟️ כרטיסייה'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} className={`chip ${section === id ? 'chip--on' : ''}`} aria-pressed={section === id} onClick={() => setSection(id)}>
            {label}
          </button>
        ))}
      </nav>
      {section === 'deals' && <Deals />}
      {section === 'coupons' && <Coupons />}
      {section === 'loyalty' && <Loyalty />}
    </div>
  );
}

/* ================= Deals ================= */

type DealDoc = Deal & { id: string };
const THEME_LABEL: Record<(typeof DEAL_THEMES)[number], string> = { red: 'אדום', yellow: 'צהוב', green: 'ירוק', dark: 'שחור' };

function artInput(d: Omit<UpsertDealRequest, 'id'>, byId: Map<string, MenuItem>): DealArtInput {
  const comps = d.components.map((c) => ({ item: byId.get(c.itemId), quantity: c.quantity })).filter((c) => c.item);
  return {
    title: d.title || 'שם המבצע',
    description: d.description ?? '',
    itemsText: comps.map((c) => (c.quantity > 1 ? `${c.quantity} × ${c.item!.name}` : c.item!.name)).join(' + '),
    priceAgorot: d.priceAgorot,
    regularAgorot: comps.reduce((s, c) => s + c.item!.priceAgorot * c.quantity, 0),
    theme: d.theme ?? 'red',
    photos: comps.map((c) => ({ path: c.item!.imagePath, quantity: c.quantity, name: c.item!.name })),
  };
}

function DealPreview({ input, width = 300 }: { input: DealArtInput; width?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const key = JSON.stringify(input);
  useEffect(() => {
    if (ref.current) void drawDeal(ref.current, input, 'square');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return <canvas ref={ref} className="deal-canvas" style={{ width, height: width }} aria-label={`תצוגה של המבצע ${input.title}`} role="img" />;
}

function Deals() {
  const { list: deals, error } = useCollection<DealDoc>('deals');
  const { list: menu } = useCollection<MenuItem & { deletedAt?: unknown }>('menuItems');
  const [editing, setEditing] = useState<DealDoc | 'new' | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const items = useMemo(() => (menu ?? []).filter((m) => !m.deletedAt).sort((a, b) => a.category.localeCompare(b.category) || a.order - b.order), [menu]);
  const byId = useMemo(() => new Map(items.map((m) => [m.id, m])), [items]);
  const today = localParts(new Date());

  async function toggle(d: DealDoc) {
    setMsg(null);
    try {
      const { id, ...rest } = d;
      await callAdmin(API.adminUpsertDeal, { id, ...pickDeal(rest), active: !d.active });
    } catch (e) {
      setMsg((e as Error).message);
    }
  }
  async function remove(d: DealDoc) {
    if (!window.confirm(`למחוק את המבצע "${d.title}"?`)) return;
    try {
      await callAdmin(API.adminDeleteDeal, { id: d.id });
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  if (editing) return <DealEditor deal={editing === 'new' ? null : editing} items={items} byId={byId} onDone={() => setEditing(null)} />;
  return (
    <section className="card">
      <div className="page-head">
        <h2>מבצעים</h2>
        <button className="btn" onClick={() => setEditing('new')}>+ מבצע חדש</button>
      </div>
      <p className="muted small">
        מבצע = כמה פריטים יחד במחיר אחד. באתר המחיר מופעל אוטומטית כשהפריטים בסל, ואזור המבצעים מוצג רק כשיש מבצע פעיל היום.
      </p>
      {error && <p className="error">{error}</p>}
      {msg && <p className="error" role="alert">{msg}</p>}
      {deals?.length === 0 && <p className="muted">אין עדיין מבצעים.</p>}
      <ul className="deal-rows">
        {(deals ?? []).sort((a, b) => a.order - b.order).map((d) => {
          const on = dealIsOn({ ...d, weekdays: d.weekdays ?? [], validFrom: d.validFrom ?? null, validTo: d.validTo ?? null }, today.date, today.weekday);
          return (
            <li key={d.id} className="deal-row">
              <DealPreview input={artInput(d, byId)} width={120} />
              <div className="deal-row__info">
                <strong>{d.title}</strong>
                <span>{formatAgorot(d.priceAgorot)}</span>
                <span className={`tag ${on ? 'tag--on' : ''}`}>{!d.active ? 'כבוי' : on ? 'פעיל היום' : 'לא היום'}</span>
                {d.weekdays?.length > 0 && <span className="muted small">ימים: {d.weekdays.map((w) => WEEKDAY_NAMES[w]).join(', ')}</span>}
                {(d.validFrom || d.validTo) && <span className="muted small">{d.validFrom ?? '…'} עד {d.validTo ?? '…'}</span>}
              </div>
              <div className="deal-row__actions">
                <button className="btn btn--sm" onClick={() => setEditing(d)}>עריכה</button>
                <button className="btn btn--ghost btn--sm" onClick={() => void toggle(d)}>{d.active ? 'כיבוי' : 'הפעלה'}</button>
                <button className="btn btn--danger btn--sm" onClick={() => void remove(d)}>מחיקה</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function pickDeal(d: Omit<DealDoc, 'id'>): Omit<UpsertDealRequest, 'id'> {
  return {
    title: d.title,
    description: d.description ?? '',
    components: d.components.map((c) => ({ itemId: c.itemId, quantity: c.quantity })),
    priceAgorot: d.priceAgorot,
    active: d.active,
    weekdays: d.weekdays ?? [],
    validFrom: d.validFrom ?? null,
    validTo: d.validTo ?? null,
    order: d.order ?? 0,
    theme: d.theme ?? 'red',
  };
}

function DealEditor({ deal, items, byId, onDone }: { deal: DealDoc | null; items: MenuItem[]; byId: Map<string, MenuItem>; onDone: () => void }) {
  const [d, setD] = useState<Omit<UpsertDealRequest, 'id'>>(() =>
    deal ? pickDeal(deal) : { title: '', description: '', components: [], priceAgorot: 0, active: true, weekdays: [], validFrom: null, validTo: null, order: 0, theme: 'red' },
  );
  const [price, setPrice] = useState(deal ? shekel(deal.priceAgorot) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pick, setPick] = useState('');
  const art = artInput({ ...d, priceAgorot: toAgorot(price || '0') }, byId);
  const set = (patch: Partial<typeof d>) => setD((x) => ({ ...x, ...patch }));

  async function save() {
    setErr(null);
    const priceAgorot = toAgorot(price);
    if (!d.title.trim()) return setErr('חסר שם למבצע');
    if (d.components.length === 0) return setErr('בחרו לפחות פריט אחד');
    if (!(priceAgorot > 0)) return setErr('חסר מחיר');
    if (priceAgorot >= art.regularAgorot) return setErr(`מחיר המבצע צריך להיות נמוך מהמחיר הרגיל (${formatAgorot(art.regularAgorot)})`);
    setBusy(true);
    try {
      await callAdmin(API.adminUpsertDeal, { ...(deal ? { id: deal.id } : {}), ...d, title: d.title.trim(), priceAgorot });
      onDone();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card deal-editor">
      <div className="page-head">
        <h2>{deal ? 'עריכת מבצע' : 'מבצע חדש'}</h2>
        <button className="btn btn--ghost btn--sm" onClick={onDone}>חזרה</button>
      </div>
      <div className="deal-editor__grid">
        <div className="deal-editor__form">
          <label className="field">
            <span>שם המבצע</span>
            <input value={d.title} maxLength={50} onChange={(e) => set({ title: e.target.value })} placeholder="למשל: ארוחה משפחתית" />
          </label>
          <fieldset className="group">
            <legend>מה במבצע?</legend>
            {d.components.map((c, i) => (
              <div key={c.itemId} className="deal-comp">
                <span>{byId.get(c.itemId)?.name ?? 'פריט שנמחק'}</span>
                <span className="muted small">{byId.get(c.itemId) && formatAgorot(byId.get(c.itemId)!.priceAgorot)}</span>
                <label className="deal-comp__qty">
                  כמות
                  <input type="number" min={1} max={6} value={c.quantity} onChange={(e) => set({ components: d.components.map((x, j) => (j === i ? { ...x, quantity: Math.min(6, Math.max(1, Number(e.target.value) || 1)) } : x)) })} />
                </label>
                <button className="btn btn--ghost btn--sm" aria-label={`הסרת ${byId.get(c.itemId)?.name ?? ''}`} onClick={() => set({ components: d.components.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            {d.components.length < 6 && (
              <div className="deal-comp deal-comp--add">
                <select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="פריט להוספה">
                  <option value="">בחירת פריט מהתפריט…</option>
                  {CATEGORY_IDS.map((cat) => (
                    <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
                      {items.filter((m) => m.category === cat && !d.components.some((c) => c.itemId === m.id)).map((m) => (
                        <option key={m.id} value={m.id}>{m.name} · {formatAgorot(m.priceAgorot)}{m.active ? '' : ' (לא פעיל)'}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button className="btn btn--sm" disabled={!pick} onClick={() => { set({ components: [...d.components, { itemId: pick, quantity: 1 }] }); setPick(''); }}>הוספה</button>
              </div>
            )}
            <p className="muted small">תוספות על פיצה נגבות בנפרד, כרגיל. מחיר רגיל של הפריטים: <strong>{formatAgorot(art.regularAgorot)}</strong></p>
          </fieldset>
          <div className="row">
            <label className="field">
              <span>מחיר המבצע (₪)</span>
              <input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="79" />
            </label>
            {art.regularAgorot > 0 && toAgorot(price || '0') > 0 && toAgorot(price) < art.regularAgorot && (
              <p className="saved">חיסכון ללקוח: {formatAgorot(art.regularAgorot - toAgorot(price))}</p>
            )}
          </div>
          <label className="field">
            <span>שורה קטנה (לא חובה)</span>
            <input value={d.description ?? ''} maxLength={140} onChange={(e) => set({ description: e.target.value })} placeholder="למשל: רק בימי חמישי" />
          </label>
          <fieldset className="group">
            <legend>מתי?</legend>
            <div className="chips">
              {WEEKDAY_NAMES.map((n, w) => {
                const on = d.weekdays?.includes(w) ?? false;
                return (
                  <button key={n} type="button" className={`chip ${on ? 'chip--on' : ''}`} aria-pressed={on} onClick={() => set({ weekdays: on ? d.weekdays!.filter((x) => x !== w) : [...(d.weekdays ?? []), w].sort() })}>
                    {n}
                  </button>
                );
              })}
            </div>
            <p className="muted small">{d.weekdays?.length ? 'רק בימים המסומנים' : 'בלי סימון = כל יום'}</p>
            <div className="row">
              <label className="field"><span>מתאריך (לא חובה)</span><input type="date" value={d.validFrom ?? ''} onChange={(e) => set({ validFrom: e.target.value || null })} /></label>
              <label className="field"><span>עד תאריך (לא חובה)</span><input type="date" value={d.validTo ?? ''} onChange={(e) => set({ validTo: e.target.value || null })} /></label>
            </div>
          </fieldset>
          <fieldset className="group">
            <legend>צבע הכרטיס</legend>
            <div className="chips">
              {DEAL_THEMES.map((t) => (
                <button key={t} type="button" className={`chip theme-chip theme-chip--${t} ${d.theme === t ? 'chip--on' : ''}`} aria-pressed={d.theme === t} onClick={() => set({ theme: t })}>
                  {THEME_LABEL[t]}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="check"><input type="checkbox" checked={d.active} onChange={(e) => set({ active: e.target.checked })} /> מבצע פעיל</label>
          {err && <p className="error" role="alert">{err}</p>}
          <div className="row">
            <button className="btn" disabled={busy} onClick={() => void save()}>{busy ? 'שומר…' : 'שמירה'}</button>
            <button className="btn btn--ghost" onClick={onDone}>ביטול</button>
          </div>
        </div>
        <div className="deal-editor__preview">
          <DealPreview input={art} width={320} />
          <p className="muted small">התמונה נבנית לבד מהתמונות והמחירים, ומתעדכנת כשמשנים משהו.</p>
          <div className="row">
            <button className="btn btn--ghost btn--sm" disabled={!d.components.length} onClick={() => void downloadDeal(art, 'square')}>⬇ תמונה ריבועית</button>
            <button className="btn btn--ghost btn--sm" disabled={!d.components.length} onClick={() => void downloadDeal(art, 'story')}>⬇ תמונה לסטורי</button>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ================= Coupons ================= */

type CouponDoc = Coupon & { id: string; usedCount?: number; deletedAt?: unknown };

function Coupons() {
  const { list, error } = useCollection<CouponDoc>('coupons');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<'percent' | 'amount'>('percent');
  const coupons = (list ?? []).filter((c) => !c.deletedAt).sort((a, b) => a.code.localeCompare(b.code));

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const g = (k: string) => String(f.get(k) ?? '').trim();
    setBusy(true);
    setMsg(null);
    try {
      await callAdmin(API.adminUpsertCoupon, {
        code: g('code').toUpperCase(),
        type,
        value: type === 'percent' ? Number(g('value')) : toAgorot(g('value')),
        minOrderAgorot: g('min') ? toAgorot(g('min')) : 0,
        validFrom: g('from') || null,
        validTo: g('to') || null,
        maxUses: g('max') ? Number(g('max')) : null,
        oncePerPhone: f.get('once') === 'on',
        active: true,
      });
      setMsg({ ok: true, text: 'הקופון נשמר ✓' });
      e.currentTarget.reset();
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function setActive(c: CouponDoc, active: boolean) {
    try {
      await callAdmin(API.adminUpsertCoupon, {
        code: c.code, type: c.type, value: c.value, minOrderAgorot: c.minOrderAgorot ?? 0, validFrom: c.validFrom ?? null, validTo: c.validTo ?? null,
        maxUses: c.maxUses ?? null, oncePerPhone: c.oncePerPhone ?? true, active,
      });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  }
  async function remove(c: CouponDoc) {
    if (!window.confirm(`למחוק את הקופון ${c.code}?`)) return;
    try {
      await callAdmin(API.adminDeleteCoupon, { code: c.code });
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message });
    }
  }

  return (
    <div className="store-grid">
      <section className="card">
        <h2>קופון חדש</h2>
        <form className="coupon-form" onSubmit={(e) => void create(e)}>
          <label className="field"><span>קוד (אנגלית / ספרות)</span><input name="code" required pattern="[A-Za-z0-9]{3,20}" maxLength={20} dir="ltr" placeholder="WELCOME10" style={{ textTransform: 'uppercase' }} /></label>
          <div className="chips" role="group" aria-label="סוג הנחה">
            <button type="button" className={`chip ${type === 'percent' ? 'chip--on' : ''}`} aria-pressed={type === 'percent'} onClick={() => setType('percent')}>% אחוזים</button>
            <button type="button" className={`chip ${type === 'amount' ? 'chip--on' : ''}`} aria-pressed={type === 'amount'} onClick={() => setType('amount')}>₪ שקלים</button>
          </div>
          <div className="row">
            <label className="field"><span>{type === 'percent' ? 'אחוז הנחה' : 'הנחה ב-₪'}</span><input name="value" required inputMode="decimal" placeholder={type === 'percent' ? '10' : '20'} /></label>
            <label className="field"><span>מינימום הזמנה ₪ (לא חובה)</span><input name="min" inputMode="decimal" placeholder="0" /></label>
          </div>
          <div className="row">
            <label className="field"><span>מתאריך (לא חובה)</span><input name="from" type="date" /></label>
            <label className="field"><span>עד תאריך (לא חובה)</span><input name="to" type="date" /></label>
          </div>
          <label className="field"><span>כמה פעמים בסך הכול (ריק = ללא הגבלה)</span><input name="max" type="number" min={1} /></label>
          <label className="check"><input type="checkbox" name="once" defaultChecked /> פעם אחת לכל מספר טלפון</label>
          <button className="btn" disabled={busy}>{busy ? 'שומר…' : 'שמירת קופון'}</button>
          {msg && <p className={msg.ok ? 'saved' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
        </form>
      </section>
      <section className="card">
        <h2>קופונים קיימים</h2>
        {error && <p className="error">{error}</p>}
        {coupons.length === 0 && <p className="muted">אין עדיין קופונים.</p>}
        <ul className="coupon-rows">
          {coupons.map((c) => (
            <li key={c.code} className={c.active ? '' : 'is-off'}>
              <code dir="ltr">{c.code}</code>
              <strong>{c.type === 'percent' ? `${c.value}%` : formatAgorot(c.value)}</strong>
              <span className="muted small">
                נוצל {c.usedCount ?? 0}{c.maxUses ? ` מתוך ${c.maxUses}` : ''}
                {c.minOrderAgorot ? ` · מינימום ${formatAgorot(c.minOrderAgorot)}` : ''}
                {c.validTo ? ` · עד ${c.validTo}` : ''}
                {c.oncePerPhone ? ' · פעם לטלפון' : ''}
              </span>
              <span className="coupon-rows__actions">
                <button className="btn btn--ghost btn--sm" onClick={() => void setActive(c, !c.active)}>{c.active ? 'כיבוי' : 'הפעלה'}</button>
                <button className="btn btn--danger btn--sm" onClick={() => void remove(c)}>מחיקה</button>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ================= Loyalty ================= */

function Loyalty() {
  const [s, setS] = useState<LoyaltySettings | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(
    () =>
      onSnapshot(doc(db, 'settings', 'loyalty'), (snap) => {
        setS((cur) => cur ?? ({ ...DEFAULT_LOYALTY, ...(snap.data() as Partial<LoyaltySettings>) } as LoyaltySettings));
      }),
    [],
  );
  if (!s) return <p className="muted">טוען…</p>;
  const set = (patch: Partial<LoyaltySettings>) => setS({ ...s, ...patch });
  const r = s.reward;

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await callAdmin(API.adminUpdateLoyalty, s);
      setMsg({ ok: true, text: 'נשמר ✓' });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="store-grid">
      <section className="card">
        <h2>כרטיסיית נאמנות</h2>
        <label className="check check--big"><input type="checkbox" checked={s.enabled} onChange={(e) => set({ enabled: e.target.checked })} /> הכרטיסייה פעילה</label>
        <p className="muted small">הלקוח מזוהה לפי מספר הטלפון. כל הזמנה שהסתיימה (נאספה / נמסרה) מוסיפה חותמת. בלי הרשמה ובלי סיסמה.</p>
        <div className="row">
          <label className="field"><span>כמה הזמנות למילוי הכרטיסייה</span><input type="number" min={2} max={30} value={s.ordersRequired} onChange={(e) => set({ ordersRequired: Math.max(2, Math.min(30, Number(e.target.value) || 2)) })} /></label>
          <label className="field"><span>הזמנה מינימלית שנחשבת (₪)</span><input inputMode="decimal" value={shekel(s.minOrderAgorot)} onChange={(e) => set({ minOrderAgorot: Math.max(0, toAgorot(e.target.value || '0')) })} /></label>
        </div>
        <fieldset className="group">
          <legend>מה מקבלים כשהכרטיסייה מלאה?</legend>
          <div className="chips" role="group">
            <button type="button" className={`chip ${r.type === 'item' ? 'chip--on' : ''}`} aria-pressed={r.type === 'item'} onClick={() => set({ reward: { type: 'item', category: 'pizzas', maxAgorot: 0 } })}>פריט חינם</button>
            <button type="button" className={`chip ${r.type === 'amount' ? 'chip--on' : ''}`} aria-pressed={r.type === 'amount'} onClick={() => set({ reward: { type: 'amount', amountAgorot: 3000 } })}>הנחה בשקלים</button>
            <button type="button" className={`chip ${r.type === 'percent' ? 'chip--on' : ''}`} aria-pressed={r.type === 'percent'} onClick={() => set({ reward: { type: 'percent', percent: 20 } })}>הנחה באחוזים</button>
          </div>
          {r.type === 'item' && (
            <div className="row">
              <label className="field">
                <span>מאיזו קטגוריה</span>
                <select value={r.category} onChange={(e) => set({ reward: { ...r, category: e.target.value as typeof r.category } })}>
                  {CATEGORY_IDS.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                </select>
              </label>
              <label className="field"><span>עד סכום (₪, ריק = בלי הגבלה)</span><input inputMode="decimal" value={r.maxAgorot ? shekel(r.maxAgorot) : ''} onChange={(e) => set({ reward: { ...r, maxAgorot: Math.max(0, toAgorot(e.target.value || '0')) } })} /></label>
            </div>
          )}
          {r.type === 'amount' && (
            <label className="field"><span>הנחה (₪)</span><input inputMode="decimal" value={shekel(r.amountAgorot)} onChange={(e) => set({ reward: { type: 'amount', amountAgorot: Math.max(100, toAgorot(e.target.value || '1')) } })} /></label>
          )}
          {r.type === 'percent' && (
            <label className="field"><span>אחוז הנחה</span><input type="number" min={1} max={100} value={r.percent} onChange={(e) => set({ reward: { type: 'percent', percent: Math.max(1, Math.min(100, Number(e.target.value) || 1)) } })} /></label>
          )}
          {r.type === 'item' && <p className="muted small">הפריט היקר ביותר מהקטגוריה בסל יוצא חינם (מחיר בסיס). תוספות נגבות כרגיל.</p>}
        </fieldset>
        <label className="check"><input type="checkbox" checked={s.notifyWhatsapp} onChange={(e) => set({ notifyWhatsapp: e.target.checked })} /> הודעת וואטסאפ אחרי כל הזמנה: &quot;עוד X הזמנות ומגיע לך…&quot;</label>
        <p className="muted small">נשלחת רק ללקוחות שאישרו עדכונים בוואטסאפ.</p>
        <button className="btn" disabled={busy} onClick={() => void save()}>{busy ? 'שומר…' : 'שמירה'}</button>
        {msg && <p className={msg.ok ? 'saved' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      </section>
      <section className="card">
        <h2>כך הלקוח יראה את זה</h2>
        <div className="punch-preview" aria-hidden="true">
          <div className="punch-preview__slots">
            {Array.from({ length: s.ordersRequired }, (_, i) => <span key={i} className={i < 3 ? 'is-on' : ''}>{i === s.ordersRequired - 1 ? '🎁' : ''}</span>)}
          </div>
          <p>
            <strong>3 / {s.ordersRequired}</strong> · עוד {s.ordersRequired - 3} הזמנות ומגיע לך:{' '}
            {loyaltyRewardLabel(s.reward, (id) => CATEGORY_SINGULAR[id as keyof typeof CATEGORY_SINGULAR] ?? id)}
          </p>
        </div>
        <p className="muted small">הכרטיסייה מופיעה ללקוח בעמוד התשלום (אחרי שהקליד טלפון) ובעמוד מעקב ההזמנה. כשהיא מלאה, יש לו תיבת סימון &quot;לממש עכשיו&quot;.</p>
        {!s.enabled && <p className="notice">הכרטיסייה כבויה – הלקוחות לא רואים אותה.</p>}
      </section>
    </div>
  );
}
