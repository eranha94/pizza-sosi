import { useEffect, useState, type FormEvent } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { API, type StoreSettings } from '@pizza-sosi/contracts';
import { db, callAdmin } from './firebase';

/** Opening hours and the "accepting orders" switch. Closing time can be changed for today. */
export function StoreControls() {
  const [settings, setSettings] = useState<Partial<StoreSettings>>({});
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => onSnapshot(doc(db, 'settings', 'store'), (s) => setSettings((s.data() as Partial<StoreSettings>) ?? {})), []);

  async function save(patch: Partial<StoreSettings>) {
    setSaved(null);
    try {
      await callAdmin(API.adminUpdateStoreSettings, patch);
      setSaved('נשמר');
    } catch (e) {
      setSaved((e as Error).message);
    }
  }

  function onHours(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void save({ opensAt: String(f.get('opensAt')), closesAt: String(f.get('closesAt')) });
  }

  const accepting = settings.acceptingOrders !== false;
  return (
    <section className="card" aria-labelledby="store-h">
      <h2 id="store-h">הפיצריה</h2>
      <button className={`btn ${accepting ? 'btn--danger' : ''}`} onClick={() => save({ acceptingOrders: !accepting })}>
        {accepting ? 'הפסקת קבלת הזמנות' : 'פתיחה לקבלת הזמנות'}
      </button>
      <form className="hours" onSubmit={onHours} key={`${settings.opensAt}-${settings.closesAt}`}>
        <label className="field"><span>פתיחה</span><input name="opensAt" type="time" defaultValue={settings.opensAt ?? '11:00'} required /></label>
        <label className="field"><span>סגירה</span><input name="closesAt" type="time" defaultValue={settings.closesAt ?? '00:00'} required /></label>
        <button className="btn">שמירת שעות</button>
      </form>
      <p className="muted" aria-live="polite">{saved}</p>
    </section>
  );
}
