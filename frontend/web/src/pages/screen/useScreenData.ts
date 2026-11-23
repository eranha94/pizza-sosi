import { useEffect, useMemo, useState } from 'react';
import type { MenuItem, ScreenBoard, ScreenSettings, StoreSettings } from '@pizza-sosi/contracts';
import { DEFAULT_SCHEDULE, ITEM_TAG_LABELS } from '@pizza-sosi/contracts/constants';

/*
 * Data for the in-store TV screen, read with plain HTTPS requests (Firestore REST API) instead of the
 * Firebase SDK. TV browsers are often years old (the first screen runs Chrome 66, from 2018) and the
 * Firestore SDK doesn't even load there. Everything read here is public (see firestore.rules).
 */

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
  /** False until the order numbers have been read once (so nothing flashes as "new" on start-up). */
  boardLoaded: boolean;
  bucket: string;
  online: boolean;
}

/** How often each part is refreshed. Order numbers matter most; prices rarely change. */
const BOARD_MS = 8_000;
const STORE_MS = 30_000;
const MENU_MS = 90_000;

type FsValue = {
  nullValue?: null;
  booleanValue?: boolean;
  integerValue?: string;
  doubleValue?: number;
  stringValue?: string;
  timestampValue?: string;
  arrayValue?: { values?: FsValue[] };
  mapValue?: { fields?: Record<string, FsValue> };
};

/** Firestore REST values → plain JSON. */
function decode(v: FsValue | undefined): unknown {
  if (!v) return undefined;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue?.values ?? []).map(decode);
  if ('mapValue' in v) return decodeFields(v.mapValue?.fields);
  return null;
}
function decodeFields(fields: Record<string, FsValue> | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(fields ?? {})) out[k] = decode(fields![k]);
  return out;
}

interface Endpoint {
  base: string;
  bucket: string;
}

async function loadEndpoint(): Promise<Endpoint> {
  const env = import.meta.env;
  let projectId = env.VITE_PUBLIC_FIREBASE_PROJECT_ID as string | undefined;
  let bucket = (env.VITE_PUBLIC_FIREBASE_STORAGE_BUCKET as string | undefined) ?? '';
  if (!projectId) {
    const res = await fetch('/__/firebase/init.json', { cache: 'no-cache' });
    const cfg = (await res.json()) as { projectId: string; storageBucket?: string };
    projectId = cfg.projectId;
    bucket = cfg.storageBucket ?? '';
  }
  const host = env.VITE_PUBLIC_USE_EMULATORS === 'true' ? 'http://localhost:8080' : 'https://firestore.googleapis.com';
  return { base: `${host}/v1/projects/${projectId}/databases/(default)/documents`, bucket };
}

async function getDoc(ep: Endpoint, path: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${ep.base}/${path}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return decodeFields(((await res.json()) as { fields?: Record<string, FsValue> }).fields);
}

async function listMenu(ep: Endpoint): Promise<MenuItem[]> {
  const items: MenuItem[] = [];
  let pageToken = '';
  for (let page = 0; page < 5; page++) {
    const res = await fetch(`${ep.base}/menuItems?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json()) as { documents?: { name: string; fields?: Record<string, FsValue> }[]; nextPageToken?: string };
    for (const d of body.documents ?? []) {
      const item = toItem(d.name.slice(d.name.lastIndexOf('/') + 1), decodeFields(d.fields));
      if (item && item.active) items.push(item);
    }
    if (!body.nextPageToken) break;
    pageToken = body.nextPageToken;
  }
  return items.sort((a, b) => a.order - b.order);
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
    tags: Array.isArray(d.tags) ? (d.tags.filter((t) => typeof t === 'string' && t in ITEM_TAG_LABELS) as MenuItem['tags']) : [],
  };
}

const nums = (v: unknown) => (Array.isArray(v) ? v.filter((n): n is number => typeof n === 'number') : []);

/** Run `fn` now and every `ms` (paused while the page is hidden); `onError` marks the screen offline. */
function poll(fn: () => Promise<void>, ms: number, onError: () => void) {
  let stopped = false;
  let timer = 0;
  const tick = async () => {
    if (stopped) return;
    if (document.visibilityState !== 'hidden') {
      try {
        await fn();
      } catch {
        onError();
      }
    }
    if (!stopped) timer = window.setTimeout(() => void tick(), ms);
  };
  void tick();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}

export function useScreenData(): ScreenData | null {
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [store, setStore] = useState<StoreSettings | null>(null);
  const [board, setBoard] = useState<ScreenBoard>({ preparing: [], ready: [] });
  const [boardLoaded, setBoardLoaded] = useState(false);
  const [bucket, setBucket] = useState('');
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let stops: (() => void)[] = [];
    let cancelled = false;
    let retry = 0;
    const offline = () => setOnline(false);
    const start = async () => {
      let ep: Endpoint;
      try {
        ep = await loadEndpoint();
      } catch {
        offline();
        retry = window.setTimeout(() => void start(), 15_000);
        return;
      }
      if (cancelled) return;
      setBucket(ep.bucket);
      stops = [
        poll(
          async () => {
            const items = await listMenu(ep);
            // Keep the same array when nothing changed, so the slideshow doesn't restart.
            setMenu((prev) => (prev && JSON.stringify(prev) === JSON.stringify(items) ? prev : items));
            setOnline(true);
          },
          MENU_MS,
          offline,
        ),
        poll(
          async () => {
            const d = (await getDoc(ep, 'settings/store')) ?? {};
            const next = { ...DEFAULT_SCHEDULE, overrides: [], deliveryEnabled: false, deliveryFeeAgorot: 0, minOrderAgorot: 0, whatsappStatuses: [], deliveryZones: [], ...d } as StoreSettings;
            setStore((prev) => (prev && JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
          },
          STORE_MS,
          offline,
        ),
        poll(
          async () => {
            const d = await getDoc(ep, 'screen/board');
            const next = { preparing: nums(d?.preparing), ready: nums(d?.ready) };
            setBoard((prev) => (prev.preparing.join() === next.preparing.join() && prev.ready.join() === next.ready.join() ? prev : next));
            setBoardLoaded(true);
          },
          BOARD_MS,
          () => {},
        ),
      ];
    };
    void start();
    return () => {
      cancelled = true;
      window.clearTimeout(retry);
      stops.forEach((s) => s());
    };
  }, []);

  const screenJson = JSON.stringify(store?.screen ?? {});
  const screen = useMemo<ScreenSettings>(() => ({ ...SCREEN_DEFAULTS, ...(JSON.parse(screenJson) as Partial<ScreenSettings>) }), [screenJson]);
  return useMemo(() => (menu ? { menu, store, screen, board, boardLoaded, bucket, online } : null), [menu, store, screen, board, boardLoaded, bucket, online]);
}
