import { useEffect, useState, type FormEvent } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { API, DEFAULT_SCHEDULE, localParts, storeStatus, formatTime, hoursFor, type StoreSettings } from '@pizza-sosi/contracts';
import { db, callAdmin } from './firebase';

/**
 * Quick controls for today: accept orders on/off, tonight's closing time, preparation time.
 * (The full weekly hours editor comes with the admin stage.)
 */
export function StoreControls() {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(
    () =>
      onSnapshot(doc(db, 'settings', 'store'), (s) => {
        const d = (s.data() ?? {}) as Partial<StoreSettings>;
        setSettings({ ...DEFAULT_SCHEDULE, deliveryEnabled: false, deliveryFeeAgorot: 0, minOrderAgorot: 0, overrides: [], ...d } as StoreSettings);
      }),
    [],
  );

  async function save(patch: Record<string, unknown>) {
    setSaved(null);
    try {
      await callAdmin(API.adminUpdateStoreSettings, patch);
      setSaved('נשמר');
    } catch (e) {
      setSaved((e as Error).message);
    }
  }

  if (!settings) return <section className="card">טוען…</section>;
  const today = localParts(new Date()).date;
  const todayHours = hoursFor(settings, today);
  const status = storeStatus(settings, new Date());

  function onToday(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const close = String(new FormData(e.currentTarget).get('close'));
    const others = (settings!.overrides ?? []).filter((o) => o.date >= today && o.date !== today);
    void save({ overrides: [...others, { date: today, close }] });
  }

  return (
    <section className="card" aria-labelledby="store-h">
      <h2 id="store-h">הפיצריה היום</h2>
      <p>
        {status.state === 'open' ? `פתוח עד ${formatTime(status.closesAt)}` : status.state === 'paused' ? 'לא מקבלים הזמנות (מושהה)' : 'סגור כרגע'}
      </p>
      <button className={`btn ${settings.acceptingOrders ? 'btn--danger' : ''}`} onClick={() => save({ acceptingOrders: !settings.acceptingOrders })}>
        {settings.acceptingOrders ? 'השהיית קבלת הזמנות' : 'חידוש קבלת הזמנות'}
      </button>
      <form className="hours" onSubmit={onToday} key={todayHours?.close ?? 'none'}>
        <label className="field">
          <span>שעת סגירה הלילה</span>
          <input name="close" type="time" defaultValue={todayHours?.close ?? '00:00'} required />
        </label>
        <button className="btn">שמירה להיום</button>
      </form>
      <form
        className="hours"
        onSubmit={(e) => {
          e.preventDefault();
          void save({ prepMinutes: Number(new FormData(e.currentTarget).get('prep')) });
        }}
        key={`prep-${settings.prepMinutes}`}
      >
        <label className="field">
          <span>זמן הכנה (דקות)</span>
          <input name="prep" type="number" min={5} max={180} step={5} defaultValue={settings.prepMinutes} required />
        </label>
        <button className="btn">שמירה</button>
      </form>
      <p className="muted" aria-live="polite">{saved}</p>
    </section>
  );
}
