import { useEffect, useState } from 'react';
import { API, activeBusy, storeStatus, formatTime, type StoreSettings } from '@pizza-sosi/contracts';
import { callAdmin } from './firebase';

const EXTRA = [10, 15, 20, 30, 45] as const;
const UNTIL = [
  { id: 'close', label: 'עד הסגירה היום' },
  { id: '1', label: 'לשעה' },
  { id: '2', label: 'לשעתיים' },
  { id: '3', label: 'ל-3 שעות' },
] as const;

function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

/** When "until closing" ends: today's closing time if open, otherwise in 3 hours. */
function closingTime(store: Partial<StoreSettings> | null, now: number): number {
  try {
    if (store?.weeklyHours) {
      const s = storeStatus({ acceptingOrders: true, prepMinutes: 25, overrides: [], ...store } as StoreSettings, new Date(now));
      if (s.state === 'open') return s.closesAt;
    }
  } catch {
    /* fall through */
  }
  return now + 3 * 3600_000;
}

/**
 * "Busy mode" for a rush: adds minutes to the prep time customers see (and to scheduled slots),
 * can pause delivery, and switches itself off at the chosen time. One tap from the orders board.
 */
export function BusyMode({ store, prepMinutes }: { store: Partial<StoreSettings> | null; prepMinutes: number }) {
  const [open, setOpen] = useState(false);
  const [extra, setExtra] = useState<number>(20);
  const [pause, setPause] = useState(false);
  const [until, setUntil] = useState<(typeof UNTIL)[number]['id']>('close');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const now = useNow();
  const on = store ? activeBusy({ busy: store.busy ?? null }, now) : null;

  async function save(value: StoreSettings['busy']) {
    setBusy(true);
    setErr(null);
    try {
      await callAdmin(API.adminUpdateStoreSettings, { busy: value });
      setOpen(false);
    } catch (e) {
      setErr((e as Error).message || 'השמירה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  function start() {
    const t = Date.now();
    const end = until === 'close' ? closingTime(store, t) : t + Number(until) * 3600_000;
    void save({ until: end, extraMinutes: extra, pauseDelivery: pause });
  }

  return (
    <div className="busy">
      <button
        className={`chip ${on ? 'chip--busy' : ''}`}
        onClick={() => {
          if (on) {
            setExtra(on.extraMinutes);
            setPause(on.pauseDelivery);
          }
          setOpen((v) => !v);
        }}
        aria-expanded={open}
      >
        🔥 {on ? `עומס +${on.extraMinutes} דק׳ · עד ${formatTime(on.until)}` : 'מצב עומס'}
      </button>
      {open && (
        <div className="busy__panel" role="dialog" aria-label="מצב עומס">
          <p className="small muted">
            הלקוחות יראו זמן הכנה של {prepMinutes + extra} דק׳ במקום {prepMinutes}, ושעות להזמנה מראש יתחילו מאוחר יותר.
          </p>
          <fieldset className="busy__row">
            <legend>כמה דקות להוסיף?</legend>
            {EXTRA.map((m) => (
              <button key={m} type="button" className={`chip ${extra === m ? 'chip--on' : ''}`} aria-pressed={extra === m} onClick={() => setExtra(m)}>
                +{m}
              </button>
            ))}
          </fieldset>
          <fieldset className="busy__row">
            <legend>עד מתי?</legend>
            {UNTIL.map((u) => (
              <button key={u.id} type="button" className={`chip ${until === u.id ? 'chip--on' : ''}`} aria-pressed={until === u.id} onClick={() => setUntil(u.id)}>
                {u.label}
              </button>
            ))}
          </fieldset>
          <label className="busy__check">
            <input type="checkbox" checked={pause} onChange={(e) => setPause(e.target.checked)} />
            לעצור משלוחים בינתיים (איסוף עצמי בלבד)
          </label>
          <div className="busy__actions">
            <button className="btn" disabled={busy} onClick={start}>
              {on ? 'עדכון' : 'הפעלת מצב עומס'}
            </button>
            {on && (
              <button className="btn btn--ghost" disabled={busy} onClick={() => void save(null)}>
                כיבוי מצב עומס
              </button>
            )}
            <button className="btn btn--ghost btn--sm" onClick={() => setOpen(false)}>
              סגירה
            </button>
          </div>
          {err && <p className="error small" role="alert">{err}</p>}
        </div>
      )}
    </div>
  );
}
