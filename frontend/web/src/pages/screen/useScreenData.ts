import { useEffect, useMemo, useState } from 'react';
import type { MenuItem, ScreenBoard, ScreenSettings, StoreSettings } from '@pizza-sosi/contracts';
import { DEFAULT_SCHEDULE, ITEM_TAG_LABELS } from '@pizza-sosi/contracts/constants';
import { firebaseApp } from '../../lib/firebase';

/** Same defaults as contracts DEFAULT_SCREEN (copied so the zod package stays out of the browser). */
export const SCREEN_DEFAULTS: ScreenSettings = {
  slideSeconds: 9,
  featuredItemIds: [],
  promos: [{ id: 'free-topping', title: 'התוספת הראשונה עלינו', text: 'על כל פיצה – תוספת רגילה ראשונה בחינם', emoji: '🎁', active: true }],
  menuCategories: ['pizzas', 'specials', 'toasts', 'burgers', 'salads', 'drinks'],
  showReady: true,
  showQr: true,
};

export interface ScreenData {
  menu: MenuItem[];
  store: StoreSettings | null;
  screen: ScreenSettings;
  board: ScreenBoard;
  bucket: string;
  online: boolean;
}

function toItem(id: string, d: Record<string, unknown>): MenuItem | null {
  if (typeof d.name !== 'string' || typeof d.priceAgorot !== 'number') return null;
  return {
    id,
    name: d.name,
    description: typeof d.description === 'string' ? d.description : '',
    category: d.category as MenuItem['category'],
    priceAgorot: d.priceAgorot,
    imagePath: typeof d.imagePath === 'string' ? d.imagePath : null,
    order: typeof d.order === 'number' ? d.order : 0,
    active: d.active === true,
    addOnGroups: [],
    tags: Array.isArray(d.tags) ? (d.tags.filter((t) => t in ITEM_TAG_LABELS) as MenuItem['tags']) : [],
  };
}

const nums = (v: unknown) => (Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : []);

/**
 * Live data for the in-store screen. Realtime listeners, so a price changed in the admin
 * (or a dish marked sold out) shows up within seconds, and only changes are downloaded.
 */
export function useScreenData(): ScreenData | null {
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [store, setStore] = useState<StoreSettings | null>(null);
  const [board, setBoard] = useState<ScreenBoard>({ preparing: [], ready: [] });
  const [bucket, setBucket] = useState('');
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let stop: (() => void)[] = [];
    let cancelled = false;
    void (async () => {
      const [{ app, bucket: b }, fs] = await Promise.all([firebaseApp(), import('firebase/firestore')]);
      if (cancelled) return;
      setBucket(b);
      const db = fs.getFirestore(app);
      if (import.meta.env.VITE_PUBLIC_USE_EMULATORS === 'true') {
        try {
          fs.connectFirestoreEmulator(db, 'localhost', 8080);
        } catch {
          /* already connected */
        }
      }
      const offline = () => setOnline(false);
      stop = [
        fs.onSnapshot(
          fs.query(fs.collection(db, 'menuItems'), fs.where('active', '==', true)),
          (snap) => {
            setOnline(!snap.metadata.fromCache);
            setMenu(
              snap.docs
                .map((d) => toItem(d.id, d.data()))
                .filter((x): x is MenuItem => x !== null)
                .sort((a, b) => a.order - b.order),
            );
          },
          offline,
        ),
        fs.onSnapshot(
          fs.doc(db, 'settings', 'store'),
          (snap) => {
            const d = (snap.data() ?? {}) as Partial<StoreSettings>;
            setStore({ ...DEFAULT_SCHEDULE, overrides: [], deliveryEnabled: false, deliveryFeeAgorot: 0, minOrderAgorot: 0, whatsappStatuses: [], deliveryZones: [], ...d } as StoreSettings);
          },
          offline,
        ),
        fs.onSnapshot(
          fs.doc(db, 'screen', 'board'),
          (snap) => setBoard({ preparing: nums(snap.get('preparing')), ready: nums(snap.get('ready')) }),
          () => {},
        ),
      ];
    })();
    return () => {
      cancelled = true;
      stop.forEach((s) => s());
    };
  }, []);

  const screenJson = JSON.stringify(store?.screen ?? {});
  const screen = useMemo<ScreenSettings>(() => ({ ...SCREEN_DEFAULTS, ...(JSON.parse(screenJson) as Partial<ScreenSettings>) }), [screenJson]);
  return useMemo(() => (menu ? { menu, store, screen, board, bucket, online } : null), [menu, store, screen, board, bucket, online]);
}
