import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { formatAgorot, orderSlots, formatTime, deliveryOpen } from '@pizza-sosi/contracts/constants';
import { useCart, cartTotal } from '../store/cart';
import { useStoreSettings, useNow } from '../lib/menu';
import { useStoreStatus } from '../components/StoreStatus';
import { createOrder, errorMessage, checkCoupon, getLoyalty } from '../lib/api';
import { useCartDeals, useLoyaltyRules } from '../lib/promos';
import { couponDiscount, loyaltyDiscount, type Discount } from '@pizza-sosi/contracts/pricing';
import { useMenu } from '../lib/menu';
import { LoyaltyCard } from '../components/Loyalty';
import type { CheckCouponResponse, LoyaltyCardView } from '@pizza-sosi/contracts';
import { loadProfile, saveProfile, forgetProfile, rememberOrder } from '../lib/profile';
import { usePageTitle } from '../lib/a11y';
import { AnimatedNumber } from '../components/AnimatedNumber';
import { cardPaymentsOn, rememberPayTestFlag, payingOrder } from '../config/payments';
import { cancelOrder } from '../lib/api';

export default function CheckoutPage() {
  const navigate = useNavigate();
  const lines = useCart((s) => s.lines);
  const clear = useCart((s) => s.clear);
  const total = useCart(cartTotal);
  const store = useStoreSettings();
  const zones = store.data?.deliveryZones ?? [];
  // One key per checkout visit: a double click cannot create two orders.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  // Details remembered on this device from the last order (if the customer chose that).
  const [profile, setProfile] = useState(loadProfile);
  const [remember, setRemember] = useState(true);
  const [zoneId, setZoneId] = useState(() => profile?.zoneId ?? '');
  const [fulfillmentChoice, setFulfillment] = useState<'pickup' | 'delivery'>(() => (profile?.fulfillment === 'delivery' ? 'delivery' : 'pickup'));
  const [paymentMethod, setPaymentMethod] = useState<'on_site' | 'card'>('on_site');
  rememberPayTestFlag();
  const cardOn = cardPaymentsOn(store.data);
  // Back from Grow without paying: cancel that order quietly (the cart is still here).
  const [params, setParams] = useSearchParams();
  const payCancel = params.get('paycancel');
  const [payCancelled, setPayCancelled] = useState(false);
  useEffect(() => {
    if (!payCancel) return;
    payingOrder.clear();
    cancelOrder({ orderId: payCancel })
      .catch(() => {})
      .finally(() => {
        setPayCancelled(true);
        setParams({}, { replace: true });
      });
  }, [payCancel, setParams]);
  const now = useNow();
  const { status, prepMinutes, busy } = useStoreStatus();
  const deliveryEnabled = store.data ? deliveryOpen(store.data, now) : false;
  const deliveryPausedForBusy = Boolean(store.data?.deliveryEnabled && busy?.pauseDelivery);
  // Remembered "delivery" falls back to pickup while delivery is off (once the settings are known).
  const fulfillment = fulfillmentChoice === 'delivery' && store.data && !deliveryEnabled ? 'pickup' : fulfillmentChoice;
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

  // Discounts – the same rules the server applies: deals in the cart → loyalty reward → coupon.
  const formRef = useRef<HTMLFormElement>(null);
  const { discounts: dealDiscounts, dealsOff } = useCartDeals();
  const { data: menu = [] } = useMenu();
  const loyaltyRules = useLoyaltyRules().data ?? null;
  const [card, setCard] = useState<LoyaltyCardView | null>(null);
  const [cardPhone, setCardPhone] = useState('');
  const [useReward, setUseReward] = useState(true);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<CheckCouponResponse | null>(null);
  const [couponMsg, setCouponMsg] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const phoneNow = () => String(new FormData(formRef.current ?? undefined).get('phone') ?? '').replace(/[\s-]/g, '');

  const all: Discount[] = [...dealDiscounts];
  let rewardProblem: string | null = null;
  const rewardOn = Boolean(card && card.rewards > 0 && useReward && loyaltyRules);
  if (rewardOn) {
    const byId = new Map(menu.map((m) => [m.id, m]));
    const r = loyaltyDiscount(
      loyaltyRules!.reward,
      lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, category: byId.get(l.itemId)?.category ?? '', basePriceAgorot: byId.get(l.itemId)?.priceAgorot ?? 0 })),
      total - dealsOff,
    );
    if ('error' in r) rewardProblem = r.error;
    else all.push({ kind: 'loyalty', label: `הטבת כרטיסייה: ${card!.rewardLabel}`, amountAgorot: r.amountAgorot });
  }
  let couponProblem: string | null = null;
  if (coupon) {
    const r = couponDiscount(coupon, total - all.reduce((s, d) => s + d.amountAgorot, 0));
    if ('error' in r) couponProblem = r.error;
    else all.push({ kind: 'coupon', label: coupon.label, amountAgorot: r.amountAgorot });
  }
  const discountTotal = Math.min(total, all.reduce((s, d) => s + d.amountAgorot, 0));

  async function lookUpCard() {
    const phone = phoneNow();
    if (!loyaltyRules || !/^0\d{8,9}$/.test(phone) || phone === cardPhone) return;
    setCardPhone(phone);
    try {
      setCard(await getLoyalty(phone));
    } catch {
      setCard(null);
    }
  }

  // A returning customer's phone is already filled in: show their card right away.
  useEffect(() => {
    const phone = phoneNow();
    if (!loyaltyRules || !/^0\d{8,9}$/.test(phone)) return;
    let live = true;
    getLoyalty(phone)
      .then((c) => {
        if (!live) return;
        setCardPhone(phone);
        setCard(c);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [loyaltyRules]);

  async function applyCoupon() {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setCouponBusy(true);
    setCouponMsg(null);
    try {
      const phone = phoneNow();
      setCoupon(await checkCoupon(code, /^0\d{8,9}$/.test(phone) ? phone : undefined));
    } catch (e) {
      setCoupon(null);
      setCouponMsg(errorMessage(e));
    } finally {
      setCouponBusy(false);
    }
  }
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
        couponCode: coupon && !couponProblem ? coupon.code : undefined,
        useLoyaltyReward: rewardOn && !rewardProblem,
      });
      // Card: keep the cart until the payment goes through (the order page empties it then).
      if (res.paymentUrl) payingOrder.set(res.orderId);
      else clear();
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
      {payCancelled && <p className="notice notice--error" role="alert">התשלום לא הושלם, וההזמנה לא נשלחה. הסל שלך עדיין כאן – אפשר לנסות שוב או לבחור תשלום במקום.</p>}
      <form className="form" ref={formRef} key={profile ? "p" : "empty"} onSubmit={onSubmit} noValidate={false}>
        <fieldset className="segmented">
          <legend>איך מקבלים?</legend>
          <label><input type="radio" name="fulfillment" checked={fulfillment === 'pickup'} onChange={() => setFulfillment('pickup')} /> איסוף עצמי</label>
          <label className={deliveryEnabled ? '' : 'is-disabled'}>
            <input type="radio" name="fulfillment" disabled={!deliveryEnabled} checked={fulfillment === 'delivery'} onChange={() => setFulfillment('delivery')} /> משלוח
            {!deliveryEnabled && <span className="muted small"> ({deliveryPausedForBusy ? 'מושהה בגלל עומס' : 'לא זמין כרגע'})</span>}
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
                    {canAsap && <span className="muted small"> · מוכן בערך ב-{formatTime(now.getTime() + prepMinutes * 60000)}{busy ? ' (יש עומס כרגע)' : ''}</span>}
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
        <label className="field"><span>טלפון</span><input name="phone" defaultValue={profile?.phone} type="tel" inputMode="tel" required pattern="0[0-9\- ]{8,11}" title="מספר טלפון ישראלי, לדוגמה 050-1234567" autoComplete="tel" placeholder="050-0000000" onBlur={() => void lookUpCard()} /></label>
        {card && (
          <>
            <LoyaltyCard card={card} compact />
            {card.rewards > 0 && (
              <label className="reward-pick">
                <input type="checkbox" checked={useReward} onChange={(e) => setUseReward(e.target.checked)} />
                <span>לממש עכשיו את ההטבה: {card.rewardLabel}{rewardProblem && <small className="muted"> – {rewardProblem}</small>}</span>
              </label>
            )}
          </>
        )}
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
          {cardOn ? (
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
        <div className="coupon">
          <label className="field">
            <span>קוד קופון (לא חובה)</span>
            <input value={couponInput} onChange={(e) => { setCouponInput(e.target.value); if (coupon) setCoupon(null); }} autoComplete="off" spellCheck={false} maxLength={20} dir="ltr" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void applyCoupon(); } }} />
          </label>
          <button type="button" className="button" disabled={couponBusy || !couponInput.trim()} onClick={() => void applyCoupon()}>
            {couponBusy ? 'בודק…' : 'הפעלה'}
          </button>
        </div>
        {coupon && !couponProblem && <p className="coupon__ok" role="status">✓ {coupon.label} הופעל</p>}
        {(couponMsg || couponProblem) && <p className="notice notice--error" role="alert">{couponMsg ?? couponProblem}</p>}
        {all.map((d) => (
          <div key={d.kind + d.label} className="summary summary--discount"><span>{d.kind === 'deal' ? '🔥 ' : d.kind === 'loyalty' ? '🎁 ' : '🏷️ '}{d.label}</span><span dir="ltr">−{formatAgorot(d.amountAgorot)}</span></div>
        ))}
        {deliveryFee > 0 && <div className="summary"><span>משלוח{zone ? ` (${zone.name})` : ''}</span><span>{formatAgorot(deliveryFee)}</span></div>}
        <div className="summary"><span>סה״כ משוער</span><strong><AnimatedNumber value={total - discountTotal + deliveryFee} format={formatAgorot} /></strong></div>
        {belowMin && <p className="notice" role="status">מינימום הזמנה{zone ? ` ל${zone.name}` : ''}: {formatAgorot(minOrder)}. חסרים עוד {formatAgorot(minOrder - total)}.</p>}
        {error && <p className="notice notice--error" role="alert">{error}</p>}
        <button type="submit" className="button button--primary button--block" disabled={submitting || cannotOrder || belowMin}>
          {submitting ? 'שולח…' : paymentMethod === 'card' ? 'למעבר לתשלום' : 'שליחת ההזמנה'}
        </button>
      </form>
    </section>
  );
}
