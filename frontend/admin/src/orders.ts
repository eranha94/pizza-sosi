import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where, limit, doc, type Timestamp } from 'firebase/firestore';
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
  address?: { street: string; houseNumber: string; apartment: string; notes: string; zoneName?: string } | null;
  note?: string;
  readyAt?: number;
  scheduled?: boolean;
  createdAt?: Timestamp | null;
}

export const ACTIVE: OrderStatus[] = ['placed', 'accepted', 'preparing', 'almost_ready', 'ready', 'out_for_delivery'];
/** Orders nobody has confirmed yet ("התקבלה" not pressed). */
export const isNew = (o: AdminOrder) => o.status === 'placed';

/** How often the bell repeats while an order hasn't been confirmed. */
const NAG_MS = 5_000;
const KITCHEN_STATUSES = new Set(['placed', 'accepted', 'preparing', 'almost_ready']);

/**
 * When an order should be ready: a scheduled order by its chosen time, otherwise the time it came in
 * plus the prep time currently set on the store page (so changing 25 → 30 minutes applies right away).
 */
export function dueAt(o: AdminOrder, prepMinutes: number): number | null {
  if (o.scheduled && o.readyAt) return o.readyAt;
  const created = o.createdAt?.toMillis?.();
  return created ? created + prepMinutes * 60_000 : (o.readyAt ?? null);
}
export const isLate = (o: AdminOrder, prepMinutes: number, now: number) => {
  const due = dueAt(o, prepMinutes);
  return KITCHEN_STATUSES.has(o.status) && due !== null && now >= due;
};

const SOUND_KEY = 'pizza-sosi-admin-sound';

/**
 * Loud alarm made with Web Audio (no file to load): square waves in the 1–2 kHz range the ear hears best,
 * pushed through a compressor so it plays at full volume without distorting.
 */
function ring(ctx: AudioContext) {
  const t = ctx.currentTime;
  const out = ctx.createDynamicsCompressor();
  out.threshold.value = -10;
  out.ratio.value = 12;
  const master = ctx.createGain();
  master.gain.value = 1;
  out.connect(master).connect(ctx.destination);
  const notes = [1568, 1175, 1568, 1175, 1568, 1175, 1760, 1397];
  for (const [i, freq] of notes.entries()) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = freq;
    const start = t + i * 0.26;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(1, start + 0.01);
    gain.gain.setValueAtTime(1, start + 0.2);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
    osc.connect(gain).connect(out);
    osc.start(start);
    osc.stop(start + 0.25);
  }
  navigator.vibrate?.([300, 120, 300, 120, 300]);
}

/**
 * Live list of open orders + a sound when a new one arrives (and every 5 s while new orders wait to be confirmed).
 * Also flags orders that reached the prep time set on the store page (red banner + one alarm per order).
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
    // iPhone/iPad: treat the alarm as media playback so the silent switch doesn't mute it.
    try {
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'playback';
    } catch {
      /* not supported */
    }
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
    const t = window.setInterval(play, NAG_MS);
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

  // Prep time from the store page, live.
  const [prepMinutes, setPrepMinutes] = useState(25);
  useEffect(
    () =>
      onSnapshot(doc(db, 'settings', 'store'), (snap) => {
        const v = Number(snap.data()?.prepMinutes);
        if (v > 0) setPrepMinutes(v);
      }),
    [],
  );
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, []);
  const late = orders.filter((o) => isLate(o, prepMinutes, now));
  // One alarm when an order first crosses its time.
  const alarmed = useRef(new Set<string>());
  const lateKey = late.map((o) => o.id).join(',');
  useEffect(() => {
    const fresh = lateKey.split(',').filter((id) => id && !alarmed.current.has(id));
    if (fresh.length === 0) return;
    fresh.forEach((id) => alarmed.current.add(id));
    play();
  }, [lateKey, play]);

  return { orders, error, late, prepMinutes, now, soundOn, audioReady, toggleSound, testSound: () => void enableAudio().then(() => ctxRef.current && ring(ctxRef.current)) };
}

export type ActiveOrders = ReturnType<typeof useActiveOrders>;
