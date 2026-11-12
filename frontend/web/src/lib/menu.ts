import { useQuery } from '@tanstack/react-query';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { MenuItem, StoreSettings } from '@pizza-sosi/contracts';
import { services } from './firebase';

export function useMenu() {
  return useQuery({
    queryKey: ['menu'],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { db } = await services();
      const snap = await getDocs(query(collection(db, 'menuItems'), where('active', '==', true)));
      const items: MenuItem[] = [];
      for (const d of snap.docs) {
        const parsed = MenuItem.safeParse({ id: d.id, ...d.data() });
        if (parsed.success) items.push(parsed.data);
      }
      return items.toSorted((a, b) => a.order - b.order);
    },
  });
}

export function useStoreSettings() {
  return useQuery({
    queryKey: ['store'],
    staleTime: 60_000,
    queryFn: async () => {
      const { db } = await services();
      const snap = await getDoc(doc(db, 'settings', 'store'));
      const parsed = StoreSettings.partial().safeParse(snap.data() ?? {});
      return parsed.success ? parsed.data : {};
    },
  });
}

export function useBucket() {
  return useQuery({ queryKey: ['bucket'], staleTime: Infinity, queryFn: async () => (await services()).bucket });
}
