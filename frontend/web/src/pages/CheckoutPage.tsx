import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatAgorot, orderSlots, formatTime } from '@pizza-sosi/contracts/constants';
import { useCart, cartTotal } from '../store/cart';
import { useStoreSettings, useNow } from '../lib/menu';
import { useStoreStatus } from '../components/StoreStatus';
import { createOrder, errorMessage } from '../lib/api';
import { loadProfile, saveProfile, forgetProfile, rememberOrder } from '../lib/profile';
import { usePageTitle } from '../lib/a11y';
import { CARD_PAYMENTS_ENABLED } from '../config/payments';

export default function CheckoutPage() {
  const navigate = useNavigate();
  const lines = useCart((s) => s.lines);
  const clear = useCart((s) => s.clear);
  const total = useCart(cartTotal);
  const store = useStoreSettings();
  const deliveryEnabled = store.data?.deliveryEnabled === true;
  const zones = store.data?.deliveryZones ?? [];
  // One key per checkout visit: a double click cannot create two orders.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  // Details remembered on this device from the last order (if the customer chose that).
  const [profile, setProfile] = useState(loadProfile);
  const [remember, setRemember] = useState(true);
  const [zoneId, setZoneId] = useState(() => profile?.zoneId ?? '');
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>(() => (profile?.fulfillment === 'delivery' ? 'delivery' : 'pickup'));
  const [paymentMethod, setPaymentMethod] = useState<'on_site' | 'card'>('on_site');
  const now = useNow();
  const { status, prepMinutes } = useStoreStatus();
  const slots = useMemo(() => (store.data ? orderSlots(store.data, now) : []), [store.data, now]);
  // Status unknown (offline/loading): allow "asap"; the server checks the hours anyway.
  const canAsap = status === null || status.state === 'open';
  const [whenMode, setWhenMode] = useState<'asap' | 'later'>('asap');
  const [slot, setSlot] = useState<number | null>(null);
  const mode = canAsap ? whenMode : 'later';
  const chosenSlot = slot !== null && slots.includes(slot) ? slot : null;
  const cannotOrder = status !== null && !canAsap && slots.length === 0;
  const zone = zones.find((z) => z.id === zoneId) ?? null;
  const deliveryFee = fulfillment === 'delivery' ? (zones.length ? (zone?.feeAgorot ?? 0) : (store.data?.deliveryFeeAgorot ?? 0)) : 0;
  const minOrder = fulfillment === 'delivery' && zones.length ? (zone?.minOrderAgorot ?? 0) : (store.data?.minOrderAgorot ?? 0);
  const belowMin = total < minOrder;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  usePageTitle(lines.length === 0 ? 'אין מה להזמין' : 'פרטי ההזמנה');

  if (lines.length === 0) {
    return (
      <section className="page">
        <h1>אין מה להזמין עדיין</h1>
        <Link to="/#menu" className="button button--primary">לתפריט</Link>
      </section>
    );
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const get = (k: string) => String(f.get(k) ?? '');
    if (mode === 'later' && chosenSlot === null) {
      setError('בחרו שעה להזמנה');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await createOrder({
        idempotencyKey,
        lines: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, addOns: l.addOns, note: l.note })),
        fulfillment,
        paymentMethod,
        customer: { name: get('name'), phone: get('phone'), email: get('email') },
        ...(fulfillment === 'delivery'
          ? { address: { street: get('street'), houseNumber: get('houseNumber'), apartment: get('apartment'), notes: get('addressNotes'), ...(zones.length ? { zoneId } : {}) } }
          : {}),
        note: get('note'),
        notifyWhatsapp: f.get('notifyWhatsapp') === 'on',
        when: mode === 'asap' ? 'asap' : { at: chosenSlot! },
      });
      clear();
      rememberOrder({ id: res.orderId, number: res.number ?? 0, at: Date.now(), totalAgorot: res.totalAgorot });
      if (remember)
        saveProfile({
          name: get('name'), phone: get('phone'), email: get('email'),
          street: get('street'), houseNumber: get('houseNumber'), apartment: get('apartment'), addressNotes: get('addressNotes'),
          fulfillment, notifyWhatsapp: f.get('notifyWhatsapp') === 'on', zoneId,
        });
      else forgetProfile();
      if (res.paymentUrl) window.location.assign(res.paymentUrl);
      else navigate(`/order/${res.orderId}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error && 'issues' in err ? 'בדקו את הפרטים שמילאתם' : errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <section className="page">
      <h1>פרטי ההזמנה</h1>
      {profile?.name && <p className="welcome">שמחים לראות אותך שוב, {profile.name.split(' ')[0]}! 👋 הפרטים מולאו מההזמנה הקודמת.</p>}
      <p className="muted small">כל השדות חובה, אלא אם כתוב &quot;לא חובה&quot;.</p>
      <form className="form" key={profile ? "p" : "empty"} onSubmit={onSubmit} noValidate={false}>
        <fieldset className="segmented">
          <legend>איך מקבלים?</legend>
          <label><input type="radio" name="fulfillment" checked={fulfillment === 'pickup'} onChange={() => setFulfillment('pickup')} /> איסוף עצמי</label>
          <label className={deliveryEnabled ? '' : 'is-disabled'}>
            <input type="radio" name="fulfillment" disabled={!deliveryEnabled} checked={fulfillment === 'delivery'} onChange={() => setFulfillment('delivery')} /> משלוח
            {!deliveryEnabled && <span className="muted small"> (לא זמין כרגע)</span>}
          </label>
        </fieldset>

        <fieldset className="when">
          <legend>מתי?</legend>
          {cannotOrder ? (
            <p className="notice notice--error">אנחנו סגורים כרגע ואין שעות פנויות להזמנה מראש היום.</p>
          ) : (
            <>
              <div className="segmented">
                <label className={canAsap ? '' : 'is-disabled'}>
                  <input type="radio" name="when" disabled={!canAsap} checked={mode === 'asap'} onChange={() => setWhenMode('asap')} />
                  <span>
                    כמה שיותר מהר
                    {canAsap && <span className="muted small"> · מוכן בערך ב-{formatTime(now.getTime() + prepMinutes * 60000)}</span>}
                    {!canAsap && <span className="muted small"> · סגור כרגע</span>}
                  </span>
                </label>
                <label>
                  <input type="radio" name="when" checked={mode === 'later'} onChange={() => setWhenMode('later')} />
                  <span>לשעה מסוימת</span>
                </label>
              </div>
              {mode === 'later' && (
                <div className="slots" role="radiogroup" aria-label="שעה">
                  {slots.map((t) => (
                    <label key={t} className={chosenSlot === t ? 'is-on' : ''}>
                      <input type="radio" name="slot" checked={chosenSlot === t} onChange={() => setSlot(t)} />
                      {formatTime(t)}
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
        </fieldset>

        <label className="field"><span>שם</span><input name="name" defaultValue={profile?.name} required minLength={2} maxLength={60} autoComplete="name" /></label>
        <label className="field"><span>טלפון</span><input name="phone" defaultValue={profile?.phone} type="tel" inputMode="tel" required pattern="0[0-9\- ]{8,11}" title="מספר טלפון ישראלי, לדוגמה 050-1234567" autoComplete="tel" placeholder="050-0000000" /></label>
        <label className="field"><span>מייל (לאישור ההזמנה)</span><input name="email" defaultValue={profile?.email} type="email" required autoComplete="email" spellCheck={false} placeholder="name@example.com" /></label>

        {fulfillment === 'delivery' && (
          <fieldset className="group">
            <legend>כתובת למשלוח</legend>
            {zones.length > 0 && (
              <label className="field">
                <span>יישוב / אזור</span>
                <select name="zoneId" value={zoneId} onChange={(e) => setZoneId(e.target.value)} required>
                  <option value="">בחירה…</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name} · משלוח {formatAgorot(z.feeAgorot)}{z.minOrderAgorot > 0 ? ` · מינימום ${formatAgorot(z.minOrderAgorot)}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field"><span>רחוב</span><input name="street" defaultValue={profile?.street} required autoComplete="address-line1" /></label>
            <div className="row">
              <label className="field"><span>מספר בית (לא חובה)</span><input name="houseNumber" defaultValue={profile?.houseNumber} autoComplete="off" inputMode="numeric" /></label>
              <label className="field"><span>דירה (לא חובה)</span><input name="apartment" defaultValue={profile?.apartment} autoComplete="address-line2" /></label>
            </div>
            <label className="field"><span>הערות לשליח (לא חובה)</span><input name="addressNotes" defaultValue={profile?.addressNotes} autoComplete="off" /></label>
          </fieldset>
        )}

        <label className="field"><span>הערה להזמנה (לא חובה)</span><textarea name="note" maxLength={300} rows={2} /></label>
        <label className="optin">
          <input type="checkbox" name="notifyWhatsapp" defaultChecked={profile?.notifyWhatsapp ?? true} />
          <span className="optin__icon" aria-hidden="true">💬</span>
          <span>
            <strong>עדכונים על ההזמנה בוואטסאפ</strong>
            <small>פיצה סוסי תשלח לך הודעה כשההזמנה מתקבלת, בהכנה ומוכנה. רק על ההזמנה הזאת, בלי פרסומות.</small>
          </span>
        </label>

        <fieldset className="segmented">
          <legend>תשלום</legend>
          <label><input type="radio" name="payment" checked={paymentMethod === 'on_site'} onChange={() => setPaymentMethod('on_site')} /> תשלום במקום</label>
          {CARD_PAYMENTS_ENABLED ? (
            <label><input type="radio" name="payment" checked={paymentMethod === 'card'} onChange={() => setPaymentMethod('card')} /> אשראי אונליין</label>
          ) : (
            <label className="is-disabled">
              <input type="radio" name="payment" disabled aria-describedby="card-soon" /> אשראי אונליין
              <span id="card-soon" className="soon-badge">בקרוב</span>
            </label>
          )}
        </fieldset>
        {paymentMethod === 'card' && <p className="muted small">התשלום מתבצע בדף מאובטח של חברת הסליקה. פרטי הכרטיס לא עוברים דרכנו.</p>}

        <div className="remember">
          <label className="consent">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            <span>לזכור את הפרטים שלי במכשיר הזה להזמנה הבאה</span>
          </label>
          {profile && (
            <button
              type="button"
              className="link-button"
              onClick={() => {
                forgetProfile();
                setProfile(null);
                setRemember(false);
              }}
            >
              שכחו אותי
            </button>
          )}
        </div>
        <label className="consent">
          <input type="checkbox" name="consent" required />
          <span>
            קראתי ואני מסכים/ה ל<Link to="/terms" target="_blank">תקנון<span className="sr-only"> (נפתח בלשונית חדשה)</span></Link> ול<Link to="/privacy" target="_blank">מדיניות הפרטיות<span className="sr-only"> (נפתח בלשונית חדשה)</span></Link>.
            הפרטים ישמשו לטיפול בהזמנה בלבד.
          </span>
        </label>
        {deliveryFee > 0 && <div className="summary"><span>משלוח{zone ? ` (${zone.name})` : ''}</span><span>{formatAgorot(deliveryFee)}</span></div>}
        <div className="summary"><span>סה״כ משוער</span><strong>{formatAgorot(total + deliveryFee)}</strong></div>
        {belowMin && <p className="notice" role="status">מינימום הזמנה{zone ? ` ל${zone.name}` : ''}: {formatAgorot(minOrder)}. חסרים עוד {formatAgorot(minOrder - total)}.</p>}
        {error && <p className="notice notice--error" role="alert">{error}</p>}
        <button type="submit" className="button button--primary button--block" disabled={submitting || cannotOrder || belowMin}>
          {submitting ? 'שולח…' : paymentMethod === 'card' ? 'למעבר לתשלום' : 'שליחת ההזמנה'}
        </button>
      </form>
    </section>
  );
}
