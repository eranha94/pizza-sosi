import { useEffect, useState, type FormEvent } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  API,
  DEFAULT_SCHEDULE,
  WEEKDAY_NAMES,
  localParts,
  storeStatus,
  formatTime,
  hoursFor,
  formatAgorot,
  NOTIFY_STATUSES,
  type NotifyStatus,
  type StoreSettings,
} from '@pizza-sosi/contracts';
import { db, callAdmin } from './firebase';

type Day = { open: string; close: string } | null;
type Override = StoreSettings['overrides'][number];

const DEFAULTS: StoreSettings = {
  ...(DEFAULT_SCHEDULE as unknown as Pick<StoreSettings, 'weeklyHours' | 'acceptingOrders' | 'prepMinutes'>),
  overrides: [],
  deliveryEnabled: false,
  deliveryFeeAgorot: 0,
  minOrderAgorot: 0,
  whatsappStatuses: [...NOTIFY_STATUSES],
  deliveryZones: [],
} as StoreSettings;

function useStoreSettings() {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  useEffect(
    () =>
      onSnapshot(doc(db, 'settings', 'store'), (s) => {
        const d = (s.data() ?? {}) as Partial<StoreSettings>;
        setSettings({ ...DEFAULTS, ...d } as StoreSettings);
      }),
    [],
  );
  return settings;
}

function useSaver() {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(patch: Record<string, unknown>, okText = 'נשמר ✓') {
    setBusy(true);
    setMsg(null);
    try {
      await callAdmin(API.adminUpdateStoreSettings, patch);
      setMsg({ text: okText, ok: true });
      return true;
    } catch (e) {
      setMsg({ text: (e as Error).message || 'השמירה נכשלה', ok: false });
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { save, msg, busy };
}

const Msg = ({ msg }: { msg: { text: string; ok: boolean } | null }) =>
  msg ? (
    <p className={msg.ok ? 'saved' : 'error'} role={msg.ok ? 'status' : 'alert'}>
      {msg.text}
    </p>
  ) : null;

export function StorePage() {
  const settings = useStoreSettings();
  if (!settings) return <p className="muted">טוען…</p>;
  return (
    <div className="store-page">
      <h1>שעות ופתיחה</h1>
      <div className="store-grid">
        <TodayCard settings={settings} />
        <WeeklyHours key={JSON.stringify(settings.weeklyHours)} settings={settings} />
        <Overrides settings={settings} />
        <Delivery key={JSON.stringify(settings.deliveryZones)} settings={settings} />
        <WhatsappNotify key={settings.whatsappStatuses.join()} settings={settings} />
      </div>
    </div>
  );
}

function TodayCard({ settings }: { settings: StoreSettings }) {
  const { save, msg, busy } = useSaver();
  const now = new Date();
  const today = localParts(now).date;
  const todayHours = hoursFor(settings, today);
  const status = storeStatus(settings, now);

  function onTonight(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const close = String(new FormData(e.currentTarget).get('close'));
    const others = settings.overrides.filter((o) => o.date >= today && o.date !== today);
    const current = settings.overrides.find((o) => o.date === today);
    void save({ overrides: [...others, { ...current, date: today, closed: false, close }] }, `נשמר: סוגרים היום ב־${close}`);
  }

  return (
    <section className="card card--today" aria-labelledby="today-h">
      <h2 id="today-h">היום</h2>
      <p className={`status-line status-line--${status.state}`}>
        <span className="dot" aria-hidden="true" />
        {status.state === 'open'
          ? `פתוח · מקבלים הזמנות עד ${formatTime(status.closesAt)}`
          : status.state === 'paused'
            ? 'מושהה · לא מקבלים הזמנות כרגע'
            : todayHours
              ? `סגור כרגע · היום ${todayHours.open}–${todayHours.close}`
              : 'סגור היום'}
      </p>
      <button
        className={`btn btn--big ${settings.acceptingOrders ? 'btn--danger' : ''}`}
        disabled={busy}
        onClick={() => save({ acceptingOrders: !settings.acceptingOrders }, settings.acceptingOrders ? 'קבלת ההזמנות הושהתה' : 'חוזרים לקבל הזמנות')}
      >
        {settings.acceptingOrders ? '⏸ השהיית קבלת הזמנות' : '▶ חידוש קבלת הזמנות'}
      </button>
      <p className="muted small">השהיה עוצרת הזמנות חדשות מיד (למשל בעומס). ההזמנות הפתוחות ממשיכות כרגיל.</p>
      <form className="row" onSubmit={onTonight} key={`close-${todayHours?.close ?? ''}`}>
        <label className="field">
          <span>שעת סגירה היום</span>
          <input name="close" type="time" defaultValue={todayHours?.close ?? '23:00'} required />
        </label>
        <button className="btn" disabled={busy}>שמירה להיום</button>
      </form>
      <form
        className="row"
        key={`prep-${settings.prepMinutes}`}
        onSubmit={(e) => {
          e.preventDefault();
          void save({ prepMinutes: Number(new FormData(e.currentTarget).get('prep')) });
        }}
      >
        <label className="field">
          <span>זמן הכנה (דקות)</span>
          <input name="prep" type="number" min={5} max={180} step={5} defaultValue={settings.prepMinutes} required />
        </label>
        <button className="btn" disabled={busy}>שמירה</button>
      </form>
      <Msg msg={msg} />
    </section>
  );
}

function WeeklyHours({ settings }: { settings: StoreSettings }) {
  const { save, msg, busy } = useSaver();
  const [days, setDays] = useState<Day[]>(() => [...settings.weeklyHours]);
  const saved = JSON.stringify(settings.weeklyHours);
  const dirty = JSON.stringify(days) !== saved;
  const todayDow = new Date(`${localParts(new Date()).date}T12:00:00Z`).getUTCDay();

  const setDay = (i: number, d: Day) => setDays((all) => all.map((x, j) => (j === i ? d : x)));
  const copyToAll = (i: number) => setDays((all) => all.map((x) => (x ? { ...days[i]! } : x)));

  return (
    <section className="card" aria-labelledby="week-h">
      <h2 id="week-h">שעות פתיחה קבועות</h2>
      <p className="muted small">שעת סגירה מוקדמת משעת הפתיחה = סוגרים אחרי חצות (למשל 18:00–01:00).</p>
      <ul className="week">
        {days.map((d, i) => (
          <li key={i} className={`week__day ${d ? '' : 'is-closed'} ${i === todayDow ? 'is-today' : ''}`}>
            <span className="week__name">
              {WEEKDAY_NAMES[i]}
              {i === todayDow && <span className="today-badge">היום</span>}
            </span>
            <label className="switch">
              <input type="checkbox" checked={!!d} onChange={(e) => setDay(i, e.target.checked ? (days.find(Boolean) ?? { open: '11:00', close: '23:00' }) : null)} />
              <span>{d ? 'פתוח' : 'סגור'}</span>
            </label>
            {d ? (
              <span className="week__times">
                <input type="time" aria-label={`פתיחה ביום ${WEEKDAY_NAMES[i]}`} value={d.open} onChange={(e) => setDay(i, { ...d, open: e.target.value })} required />
                <span aria-hidden="true">–</span>
                <input type="time" aria-label={`סגירה ביום ${WEEKDAY_NAMES[i]}`} value={d.close} onChange={(e) => setDay(i, { ...d, close: e.target.value })} required />
                {d.close <= d.open && <span className="tag">אחרי חצות</span>}
                <button type="button" className="link-btn small" onClick={() => copyToAll(i)} title="להעתיק לכל הימים הפתוחים">
                  העתק לכולם
                </button>
              </span>
            ) : (
              <span className="muted">יום סגור</span>
            )}
          </li>
        ))}
      </ul>
      <div className="row">
        <button className="btn" disabled={!dirty || busy || days.some((d) => d && (!d.open || !d.close))} onClick={() => save({ weeklyHours: days })}>
          שמירת השעות
        </button>
        {dirty && (
          <button className="btn btn--ghost" onClick={() => setDays(JSON.parse(saved) as Day[])}>
            ביטול שינויים
          </button>
        )}
      </div>
      <Msg msg={msg} />
    </section>
  );
}

const dateFmt = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const prettyDate = (iso: string) => dateFmt.format(new Date(`${iso}T12:00:00Z`));

function Overrides({ settings }: { settings: StoreSettings }) {
  const { save, msg, busy } = useSaver();
  const today = localParts(new Date()).date;
  const upcoming = settings.overrides.filter((o) => o.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const [closed, setClosed] = useState(true);

  function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const date = String(f.get('date'));
    const entry: Override = closed ? { date, closed: true } : { date, closed: false, open: String(f.get('open')), close: String(f.get('close')) };
    const form = e.currentTarget;
    void save({ overrides: [...upcoming.filter((o) => o.date !== date), entry] }, 'החריג נשמר').then((ok) => ok && form.reset());
  }

  return (
    <section className="card" aria-labelledby="ovr-h">
      <h2 id="ovr-h">חגים ושינויים חד־פעמיים</h2>
      <p className="muted small">יום סגור (חג, חופשה) או שעות מיוחדות לתאריך מסוים. גובר על השעות הקבועות.</p>
      {upcoming.length === 0 ? (
        <p className="muted">אין שינויים מתוכננים.</p>
      ) : (
        <ul className="overrides">
          {upcoming.map((o) => (
            <li key={o.date}>
              <span>
                <strong>{prettyDate(o.date)}</strong>{' '}
                {o.closed ? <span className="tag tag--late">סגור</span> : <span className="tag">{o.open ?? hoursFor({ ...settings, overrides: [] }, o.date)?.open ?? ''}–{o.close ?? ''}</span>}
              </span>
              <button className="link-btn" disabled={busy} onClick={() => save({ overrides: upcoming.filter((x) => x.date !== o.date) }, 'השינוי נמחק')}>
                מחיקה
              </button>
            </li>
          ))}
        </ul>
      )}
      <form className="override-form" onSubmit={onAdd}>
        <label className="field">
          <span>תאריך</span>
          <input name="date" type="date" min={today} required />
        </label>
        <fieldset className="seg">
          <legend className="sr-only">סוג השינוי</legend>
          <label className={closed ? 'is-on' : ''}>
            <input type="radio" name="kind" checked={closed} onChange={() => setClosed(true)} /> סגור כל היום
          </label>
          <label className={!closed ? 'is-on' : ''}>
            <input type="radio" name="kind" checked={!closed} onChange={() => setClosed(false)} /> שעות מיוחדות
          </label>
        </fieldset>
        {!closed && (
          <span className="week__times">
            <input name="open" type="time" aria-label="פתיחה" defaultValue="11:00" required />
            <span aria-hidden="true">–</span>
            <input name="close" type="time" aria-label="סגירה" defaultValue="22:00" required />
          </span>
        )}
        <button className="btn" disabled={busy}>הוספה</button>
      </form>
      <Msg msg={msg} />
    </section>
  );
}

type ZoneDraft = { id: string; name: string; fee: string; min: string };

function Delivery({ settings }: { settings: StoreSettings }) {
  const { save, msg, busy } = useSaver();
  const [zones, setZones] = useState<ZoneDraft[]>(() =>
    settings.deliveryZones.map((z) => ({ id: z.id, name: z.name, fee: String(z.feeAgorot / 100), min: String(z.minOrderAgorot / 100) })),
  );
  const setZone = (i: number, patch: Partial<ZoneDraft>) => setZones((zs) => zs.map((z, j) => (j === i ? { ...z, ...patch } : z)));

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const clean = zones.filter((z) => z.name.trim());
    void save({
      deliveryEnabled: f.get('enabled') === 'on',
      deliveryFeeAgorot: Math.round(Number(f.get('fee')) * 100),
      minOrderAgorot: Math.round(Number(f.get('min')) * 100),
      deliveryZones: clean.map((z) => ({ id: z.id, name: z.name.trim(), feeAgorot: Math.round(Number(z.fee || 0) * 100), minOrderAgorot: Math.round(Number(z.min || 0) * 100) })),
    });
  }
  return (
    <section className="card" aria-labelledby="del-h">
      <h2 id="del-h">משלוחים</h2>
      <form className="stack" onSubmit={onSubmit} key={`${settings.deliveryEnabled}-${settings.deliveryFeeAgorot}-${settings.minOrderAgorot}`}>
        <label className="switch">
          <input name="enabled" type="checkbox" defaultChecked={settings.deliveryEnabled} />
          <span>מציעים משלוחים</span>
        </label>
        <div className="row">
          <label className="field">
            <span>דמי משלוח (₪)</span>
            <input name="fee" type="number" min={0} max={100} step={1} defaultValue={settings.deliveryFeeAgorot / 100} />
          </label>
          <label className="field">
            <span>מינימום הזמנה (₪)</span>
            <input name="min" type="number" min={0} max={1000} step={1} defaultValue={settings.minOrderAgorot / 100} />
          </label>
        </div>

        <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 700 }}>אזורי משלוח (לא חובה)</legend>
          <p className="muted small">אם מוגדרים אזורים – הלקוח בוחר יישוב, ומחיר המשלוח והמינימום נקבעים לפיו (במקום הסכומים שלמעלה). משלוח רק לאזורים ברשימה.</p>
          {zones.length > 0 && (
            <ul className="zones">
              <li className="zones__head"><span>יישוב / אזור</span><span>משלוח ₪</span><span>מינימום ₪</span><span /></li>
              {zones.map((z, i) => (
                <li key={z.id}>
                  <input value={z.name} onChange={(e) => setZone(i, { name: e.target.value })} placeholder="למשל: עוספיא" aria-label="שם האזור" maxLength={40} />
                  <input type="number" min={0} step={1} value={z.fee} onChange={(e) => setZone(i, { fee: e.target.value })} aria-label={`משלוח ל${z.name}`} />
                  <input type="number" min={0} step={1} value={z.min} onChange={(e) => setZone(i, { min: e.target.value })} aria-label={`מינימום ל${z.name}`} />
                  <button type="button" className="icon-btn icon-btn--danger" onClick={() => setZones(zones.filter((_, j) => j !== i))} aria-label={`מחיקת ${z.name}`}>✕</button>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            className="link-btn"
            onClick={() => setZones([...zones, { id: `z-${Math.random().toString(36).slice(2, 8)}`, name: '', fee: zones.at(-1)?.fee ?? '15', min: zones.at(-1)?.min ?? '0' }])}
          >
            + הוספת אזור
          </button>
        </fieldset>

        <p className="muted small">
          כרגע: {!settings.deliveryEnabled ? 'איסוף בלבד' : settings.deliveryZones.length ? `${settings.deliveryZones.length} אזורי משלוח` : `משלוח ${formatAgorot(settings.deliveryFeeAgorot)}`}
          {!settings.deliveryZones.length && settings.minOrderAgorot > 0 && ` · מינימום ${formatAgorot(settings.minOrderAgorot)}`}
        </p>
        <button className="btn" disabled={busy}>שמירה</button>
      </form>
      <Msg msg={msg} />
    </section>
  );
}

const NOTIFY_LABELS: Record<NotifyStatus, string> = {
  accepted: 'ההזמנה התקבלה',
  preparing: 'בהכנה',
  almost_ready: 'כמעט מוכנה',
  ready: 'מוכנה לאיסוף',
  out_for_delivery: 'בדרך (נאספה ע״י השליח)',
  cancelled: 'ההזמנה בוטלה',
};

function WhatsappNotify({ settings }: { settings: StoreSettings }) {
  const { save, msg, busy } = useSaver();
  const [on, setOn] = useState<Set<NotifyStatus>>(() => new Set(settings.whatsappStatuses));
  const dirty = [...on].sort().join() !== [...settings.whatsappStatuses].sort().join();
  return (
    <section className="card" aria-labelledby="wa-h">
      <h2 id="wa-h">💬 הודעות וואטסאפ ללקוח</h2>
      <p className="muted small">בכל מעבר סטטוס שמסומן כאן, הלקוח מקבל הודעה (רק לקוחות שאישרו בהזמנה). כל הודעה עולה כמה אגורות.</p>
      <ul className="notify-list">
        {NOTIFY_STATUSES.map((s) => (
          <li key={s}>
            <label className="switch">
              <input
                type="checkbox"
                checked={on.has(s)}
                onChange={(e) =>
                  setOn((cur) => {
                    const next = new Set(cur);
                    if (e.target.checked) next.add(s);
                    else next.delete(s);
                    return next;
                  })
                }
              />
              <span>{NOTIFY_LABELS[s]}</span>
            </label>
          </li>
        ))}
      </ul>
      <button className="btn" disabled={!dirty || busy} onClick={() => save({ whatsappStatuses: NOTIFY_STATUSES.filter((s) => on.has(s)) })}>
        שמירה
      </button>
      <Msg msg={msg} />
    </section>
  );
}
