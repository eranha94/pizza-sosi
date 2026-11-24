import { useEffect, useState } from 'react';
import type { OrderStatus } from '@pizza-sosi/contracts';
import { loadMyOrders } from './profile';

/**
 * The order this device placed in the last few hours that isn't finished yet, kept fresh for the
 * bottom bar ("הזמנה #42 · בהכנה · עוד 12 דק׳"). Only polls when there is such an order, and stops
 * once it is completed or cancelled, so a normal visit to the menu costs nothing.
 */
export interface ActiveOrder {
  id: string;
  number: number;
  status: OrderStatus;
  readyAt: number | null;
  fulfillment: 'pickup' | 'delivery';
}

const RECENT_MS = 4 * 60 * 60 * 1000;
const POLL_MS = 30_000;
const DONE: OrderStatus[] = ['completed', 'cancelled'];
const FINISHED_KEY = 'sosi.finishedOrders';

function finished(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(FINISHED_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}
function markFinished(id: string) {
  try {
    sessionStorage.setItem(FINISHED_KEY, JSON.stringify([id, ...finished()].slice(0, 20)));
  } catch {
    /* storage blocked – we'll just ask again next time */
  }
}

/** `key` changes when the page changes, so a freshly placed order is picked up right away. */
export function useActiveOrder(key: string): ActiveOrder | null {
  const [order, setOrder] = useState<ActiveOrder | null>(null);
  const latest = loadMyOrders()[0];
  const candidate = latest && Date.now() - latest.at < RECENT_MS && !finished().includes(latest.id) ? latest : null;
  const id = candidate?.id ?? null;

  useEffect(() => {
    if (!id) {
      setOrder(null);
      return;
    }
    let stopped = false;
    let timer = 0;
    const tick = async () => {
      if (document.visibilityState !== 'hidden') {
        try {
          const { getOrderStatus } = await import('./api');
          const o = await getOrderStatus(id);
          if (stopped) return;
          if (DONE.includes(o.status)) {
            markFinished(id);
            setOrder(null);
            return;
          }
          setOrder({ id, number: o.number, status: o.status, readyAt: o.readyAt, fulfillment: o.fulfillment });
        } catch {
          /* offline or not found – keep what we had and try again */
        }
      }
      if (!stopped) timer = window.setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    const onVisible = () => document.visibilityState === 'visible' && (window.clearTimeout(timer), void tick());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [id, key]);

  return order && order.id === id ? order : null;
}
