import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { formatAgorot } from '@pizza-sosi/contracts/constants';
import { useCart, cartTotal } from '../store/cart';
import { useStoreSettings } from '../lib/menu';
import { createOrder, errorMessage } from '../lib/api';

export default function CheckoutPage() {
  const navigate = useNavigate();
  const lines = useCart((s) => s.lines);
  const clear = useCart((s) => s.clear);
  const total = useCart(cartTotal);
  const store = useStoreSettings();
  const deliveryEnabled = store.data?.deliveryEnabled === true;
  // One key per checkout visit: a double click cannot create two orders.
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const [fulfillment, setFulfillment] = useState<'pickup' | 'delivery'>('pickup');
  const [paymentMethod, setPaymentMethod] = useState<'on_site' | 'card'>('on_site');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setSubmitting(true);
    setError(null);
    try {
      const res = await createOrder({
        idempotencyKey,
        lines: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, addOnIds: l.addOnIds, note: l.note })),
        fulfillment,
        paymentMethod,
        customer: { name: get('name'), phone: get('phone'), email: get('email') },
        address: fulfillment === 'delivery' ? { street: get('street'), houseNumber: get('houseNumber'), apartment: get('apartment'), notes: get('addressNotes') } : undefined,
        note: get('note'),
      });
      clear();
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
      <form className="form" onSubmit={onSubmit} noValidate={false}>
        <fieldset className="segmented">
          <legend>איך מקבלים?</legend>
          <label><input type="radio" name="fulfillment" checked={fulfillment === 'pickup'} onChange={() => setFulfillment('pickup')} /> איסוף עצמי</label>
          <label className={deliveryEnabled ? '' : 'is-disabled'}>
            <input type="radio" name="fulfillment" disabled={!deliveryEnabled} checked={fulfillment === 'delivery'} onChange={() => setFulfillment('delivery')} /> משלוח
            {!deliveryEnabled && <span className="muted small"> (לא זמין כרגע)</span>}
          </label>
        </fieldset>

        <label className="field"><span>שם</span><input name="name" required minLength={2} maxLength={60} autoComplete="name" /></label>
        <label className="field"><span>טלפון</span><input name="phone" type="tel" inputMode="tel" required pattern="0[0-9\- ]{8,11}" autoComplete="tel" placeholder="050-0000000" /></label>
        <label className="field"><span>מייל (לאישור ההזמנה)</span><input name="email" type="email" required autoComplete="email" spellCheck={false} placeholder="name@example.com" /></label>

        {fulfillment === 'delivery' && (
          <fieldset className="group">
            <legend>כתובת למשלוח</legend>
            <label className="field"><span>רחוב</span><input name="street" required autoComplete="address-line1" /></label>
            <div className="row">
              <label className="field"><span>מספר בית</span><input name="houseNumber" autoComplete="off" inputMode="numeric" /></label>
              <label className="field"><span>דירה</span><input name="apartment" autoComplete="address-line2" /></label>
            </div>
            <label className="field"><span>הערות לשליח</span><input name="addressNotes" autoComplete="off" /></label>
          </fieldset>
        )}

        <label className="field"><span>הערה להזמנה (לא חובה)</span><textarea name="note" maxLength={300} rows={2} /></label>

        <fieldset className="segmented">
          <legend>תשלום</legend>
          <label><input type="radio" name="payment" checked={paymentMethod === 'on_site'} onChange={() => setPaymentMethod('on_site')} /> תשלום במקום</label>
          <label><input type="radio" name="payment" checked={paymentMethod === 'card'} onChange={() => setPaymentMethod('card')} /> אשראי אונליין</label>
        </fieldset>
        {paymentMethod === 'card' && <p className="muted small">התשלום מתבצע בדף מאובטח של חברת הסליקה. פרטי הכרטיס לא עוברים דרכנו.</p>}

        <div className="summary"><span>סה״כ משוער</span><strong>{formatAgorot(total)}</strong></div>
        {error && <p className="notice notice--error" role="alert">{error}</p>}
        <button type="submit" className="button button--primary button--block" disabled={submitting}>
          {submitting ? 'שולח…' : paymentMethod === 'card' ? 'למעבר לתשלום' : 'שליחת ההזמנה'}
        </button>
      </form>
    </section>
  );
}
