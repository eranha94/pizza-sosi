import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, orderBy, query, where, limit, doc, type Timestamp } from 'firebase/firestore';
import type { OrderStatus, StoreSettings } from '@pizza-sosi/contracts';
import { db } from './firebase';

export interface AdminOrder {
  id: string;
  number: number;
  status: OrderStatus;
  customerName: string;
  contact?: { phone: string; email?: string };
  fulfillment: 'pickup' | 'delivery';
  paymentMethod: 'card' | 'on_site';
  payment?: { status?: string; cardSuffix?: string; paidAgorot?: number };
  needsReview?: boolean;
  totalAgorot: number;
  lines: { name: string; quantity: number; addOns: { name: string; coverage?: 'whole' | 'right' | 'left' | null }[]; note: string }[];
  address?: { street: string; houseNumber: string; apartment: string; notes: string; zoneName?: string } | null;
  note?: string;
  readyAt?: number;
  scheduled?: boolean;
  createdAt?: Timestamp | null;
  statusHistory?: { status: OrderStatus; at: string; by?: string }[];
  discounts?: { kind: 'deal' | 'coupon' | 'loyalty'; label: string; amountAgorot: number }[];
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
  // An order taken in busy mode promised a later time (readyAt) – don't call it late before that.
  return created ? Math.max(created + prepMinutes * 60_000, o.readyAt ?? 0) : (o.readyAt ?? null);
}
export const isLate = (o: AdminOrder, prepMinutes: number, now: number) => {
  const due = dueAt(o, prepMinutes);
  return KITCHEN_STATUSES.has(o.status) && due !== null && now >= due;
};

const SOUND_KEY = 'pizza-sosi-admin-sound';

/**
 * "Ka-ching": coins falling, made with Web Audio (no file to load). Each coin is a few short metallic,
 * slightly out-of-tune partials; a cascade of them bounces and settles, then a bright register bell.
 * Pushed through a compressor so it plays at full volume without distorting.
 */
function ring(ctx: AudioContext) {
  const t0 = ctx.currentTime;
  const out = ctx.createDynamicsCompressor();
  out.threshold.value = -12;
  out.ratio.value = 10;
  const master = ctx.createGain();
  master.gain.value = 1;
  out.connect(master).connect(ctx.destination);

  const clink = (at: number, base: number, level: number, decay: number) => {
    for (const [ratio, amp] of [[1, 1], [2.76, 0.6], [5.4, 0.4], [8.93, 0.25]] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = base * ratio;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(level * amp, at + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + decay / ratio ** 0.3);
      osc.connect(gain).connect(out);
      osc.start(at);
      osc.stop(at + decay + 0.05);
    }
  };

  // Register bell first ("ka-ching"), then the coins pouring and bouncing to a stop.
  clink(t0, 2093, 1, 0.9);
  clink(t0 + 0.09, 2637, 0.9, 1.1);
  let at = t0 + 0.25;
  for (let i = 0; i < 14; i++) {
    const base = 2600 + ((i * 7919) % 1700); // varied coin sizes, deterministic
    clink(at, base, 0.95 - i * 0.04, 0.18 + (i % 3) * 0.05);
    at += 0.045 + i * 0.012; // bounces spread out as the pile settles
  }
  navigator.vibrate?.([200, 80, 200, 80, 400]);
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

  // Prep time and busy mode from the store settings, live.
  const [prepMinutes, setPrepMinutes] = useState(25);
  const [store, setStore] = useState<Partial<StoreSettings> | null>(null);
  useEffect(
    () =>
      onSnapshot(doc(db, 'settings', 'store'), (snap) => {
        const d = (snap.data() ?? {}) as Partial<StoreSettings>;
        setStore(d);
        const v = Number(d.prepMinutes);
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

  return { orders, error, late, prepMinutes, store, now, soundOn, audioReady, toggleSound, testSound: () => void enableAudio().then(() => ctxRef.current && ring(ctxRef.current)) };
}

export type ActiveOrders = ReturnType<typeof useActiveOrders>;
