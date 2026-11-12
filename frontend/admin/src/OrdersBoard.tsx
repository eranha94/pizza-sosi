import { useEffect, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where, limit } from 'firebase/firestore';
import { API, ORDER_STATUS_LABELS, formatAgorot, type OrderStatus } from '@pizza-sosi/contracts';
import { db, callAdmin } from './firebase';

interface AdminOrder {
  id: string;
  number: number;
  status: OrderStatus;
  customerName: string;
  contact?: { phone: string };
  fulfillment: 'pickup' | 'delivery';
  paymentMethod: 'card' | 'on_site';
  totalAgorot: number;
  lines: { name: string; quantity: number; addOns: { name: string; coverage?: 'whole' | 'half' | null }[]; note: string }[];
  address?: { street: string; houseNumber: string; apartment: string; notes: string } | null;
  note?: string;
  refundRequired?: boolean;
}

const ACTIVE: OrderStatus[] = ['paid', 'accepted', 'preparing', 'ready', 'out_for_delivery'];
const NEXT: Partial<Record<OrderStatus, OrderStatus[]>> = {
  paid: ['accepted', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'completed'],
  out_for_delivery: ['completed'],
};

export function OrdersBoard() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'orders'), where('status', 'in', ACTIVE), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(
      q,
      (snap) => setOrders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AdminOrder, 'id'>) }))),
      () => setError('אין גישה להזמנות'),
    );
  }, []);

  async function move(order: AdminOrder, status: OrderStatus) {
    if (status === 'cancelled' && !window.confirm(`לבטל את הזמנה #${order.number}?`)) return;
    try {
      await callAdmin(API.adminSetOrderStatus, { orderId: order.id, status });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section aria-labelledby="orders-h">
      <h2 id="orders-h">הזמנות פעילות ({orders.length})</h2>
      {error && <p className="error" role="alert">{error}</p>}
      {orders.length === 0 && <p className="muted">אין הזמנות פתוחות כרגע.</p>}
      <ul className="orders">
        {orders.map((o) => (
          <li key={o.id} className={`order order--${o.status}`}>
            <div className="order__head">
              <strong>#{o.number}</strong>
              <span className="pill">{ORDER_STATUS_LABELS[o.status]}</span>
              <span>{o.fulfillment === 'pickup' ? 'איסוף' : 'משלוח'} · {o.paymentMethod === 'on_site' ? 'תשלום במקום' : 'שולם באשראי'}</span>
              <strong className="order__total">{formatAgorot(o.totalAgorot)}</strong>
            </div>
            <p>{o.customerName} · <a href={`tel:${o.contact?.phone ?? ''}`} dir="ltr">{o.contact?.phone}</a></p>
            {o.address && <p>{o.address.street} {o.address.houseNumber} {o.address.apartment && `דירה ${o.address.apartment}`} {o.address.notes}</p>}
            <ul className="order__lines">
              {o.lines.map((l, i) => (
                <li key={i}>
                  {l.quantity} × {l.name}
                  {l.addOns.length > 0 && <span className="muted"> ({l.addOns.map((a) => (a.coverage === 'half' ? `${a.name} – חצי` : a.coverage === 'whole' ? `${a.name} – כל הפיצה` : a.name)).join(', ')})</span>}
                  {l.note && <em> – {l.note}</em>}
                </li>
              ))}
            </ul>
            {o.note && <p><em>הערה: {o.note}</em></p>}
            <div className="order__actions">
              {(NEXT[o.status] ?? []).map((s) => (
                <button key={s} className={`btn ${s === 'cancelled' ? 'btn--danger' : ''}`} onClick={() => move(o, s)}>
                  {ORDER_STATUS_LABELS[s]}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
