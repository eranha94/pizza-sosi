import { useQuery } from '@tanstack/react-query';
import type { MenuItem, StoreSettings } from '@pizza-sosi/contracts';
import { menuDb, firebaseApp } from './firebase';

/*
 * The menu is public and read-only in the browser. It is cached in localStorage so a returning
 * customer sees it instantly, then refreshed in the background.
 * No validation library here on purpose (smaller first load); the server validates every order.
 */

const CACHE_KEY = 'pizza-sosi-menu-v1';

function readCache<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}
function writeCache(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked – ignore */
  }
}

function toMenuItem(id: string, d: Record<string, unknown>): MenuItem | null {
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
    addOns: Array.isArray(d.addOns) ? (d.addOns as MenuItem['addOns']) : [],
  };
}

export function useMenu() {
  return useQuery({
    queryKey: ['menu'],
    staleTime: 5 * 60_000,
    initialData: () => readCache<MenuItem[]>(CACHE_KEY),
    initialDataUpdatedAt: 0, // treat cached data as stale → refresh in background
    queryFn: async () => {
      const [db, { collection, getDocs, query, where }] = await Promise.all([menuDb(), import('firebase/firestore/lite')]);
      const snap = await getDocs(query(collection(db, 'menuItems'), where('active', '==', true)));
      const items = snap.docs
        .map((d) => toMenuItem(d.id, d.data()))
        .filter((x): x is MenuItem => x !== null)
        .toSorted((a, b) => a.order - b.order);
      writeCache(CACHE_KEY, items);
      return items;
    },
  });
}

export function useStoreSettings() {
  return useQuery({
    queryKey: ['store'],
    staleTime: 60_000,
    queryFn: async (): Promise<Partial<StoreSettings>> => {
      const [db, { doc, getDoc }] = await Promise.all([menuDb(), import('firebase/firestore/lite')]);
      const snap = await getDoc(doc(db, 'settings', 'store'));
      return (snap.data() as Partial<StoreSettings> | undefined) ?? {};
    },
  });
}

export function useBucket() {
  return useQuery({ queryKey: ['bucket'], staleTime: Infinity, queryFn: async () => (await firebaseApp()).bucket });
}
