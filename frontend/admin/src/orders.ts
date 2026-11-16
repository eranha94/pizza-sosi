import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where, limit, type Timestamp } from 'firebase/firestore';
import type { OrderStatus } from '@pizza-sosi/contracts';
import { db } from './firebase';

export interface AdminOrder {
  id: string;
  number: number;
  status: OrderStatus;
  customerName: string;
  contact?: { phone: string; email?: string };
  fulfillment: 'pickup' | 'delivery';
  paymentMethod: 'card' | 'on_site';
  totalAgorot: number;
  lines: { name: string; quantity: number; addOns: { name: string; coverage?: 'whole' | 'right' | 'left' | null }[]; note: string }[];
  address?: { street: string; houseNumber: string; apartment: string; notes: string } | null;
  note?: string;
  readyAt?: number;
  scheduled?: boolean;
  createdAt?: Timestamp | null;
}

export const ACTIVE: OrderStatus[] = ['placed', 'accepted', 'preparing', 'almost_ready', 'ready', 'out_for_delivery'];
/** Orders nobody has confirmed yet ("התקבלה" not pressed). */
export const isNew = (o: AdminOrder) => o.status === 'placed';

const SOUND_KEY = 'pizza-sosi-admin-sound';

/** Short two-tone "ding-dong" made with Web Audio (no audio file to load). */
function ring(ctx: AudioContext) {
  const t = ctx.currentTime;
  const loud = document.body.classList.contains('kitchen');
  const notes = loud ? [880, 660, 880, 660, 880, 660, 988, 784] : [880, 660, 880, 660];
  for (const [i, freq] of notes.entries()) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = t + i * 0.28;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(loud ? 0.95 : 0.5, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.26);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.27);
  }
}

/**
 * Live list of open orders + a sound when a new one arrives (and every 45 s while new orders wait to be confirmed).
 * Browsers only allow sound after a click, so the board has a "turn on sound" button.
 */
export function useActiveOrders() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(() => {
    try {
      return localStorage.getItem(SOUND_KEY) !== 'off';
    } catch {
      return true;
    }
  });
  const [audioReady, setAudioReady] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const soundRef = useRef(soundOn);
  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  const play = useCallback(() => {
    const ctx = ctxRef.current;
    if (!soundRef.current || !ctx || ctx.state !== 'running') return;
    ring(ctx);
  }, []);

  /** Must be called from a click. */
  const enableAudio = useCallback(async () => {
    ctxRef.current ??= new AudioContext();
    await ctxRef.current.resume();
    setAudioReady(ctxRef.current.state === 'running');
  }, []);

  // Any first click on the page unlocks audio.
  useEffect(() => {
    const once = () => void enableAudio();
    window.addEventListener('pointerdown', once, { once: true });
    return () => window.removeEventListener('pointerdown', once);
  }, [enableAudio]);

  useEffect(() => {
    let first = true;
    const q = query(collection(db, 'orders'), where('status', 'in', ACTIVE), orderBy('createdAt', 'desc'), limit(100));
    return onSnapshot(
      q,
      (snap) => {
        setError(null);
        setOrders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AdminOrder, 'id'>) })));
        if (!first && snap.docChanges().some((c) => c.type === 'added')) play();
        first = false;
      },
      () => setError('אין גישה להזמנות. נסה להתחבר מחדש.'),
    );
  }, [play]);

  // Keep reminding while new orders wait to be confirmed.
  const waiting = orders.some(isNew);
  useEffect(() => {
    if (!waiting) return;
    const t = window.setInterval(play, 45_000);
    return () => window.clearInterval(t);
  }, [waiting, play]);

  const toggleSound = useCallback(() => {
    setSoundOn((on) => {
      const next = !on;
      try {
        localStorage.setItem(SOUND_KEY, next ? 'on' : 'off');
      } catch {
        /* private mode */
      }
      return next;
    });
    void enableAudio();
  }, [enableAudio]);

  return { orders, error, soundOn, audioReady, toggleSound, testSound: () => void enableAudio().then(() => ctxRef.current && ring(ctxRef.current)) };
}

export type ActiveOrders = ReturnType<typeof useActiveOrders>;
