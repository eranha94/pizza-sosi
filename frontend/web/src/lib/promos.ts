import { useQuery } from '@tanstack/react-query';
import type { MenuItem } from '@pizza-sosi/contracts';
import { localParts, CATEGORY_SINGULAR } from '@pizza-sosi/contracts/constants';
import { applyDeals, dealIsOn, dealRegularPrice, loyaltyRewardLabel, type DealRule, type Discount, type LoyaltyReward } from '@pizza-sosi/contracts/pricing';
import { menuDb } from './firebase';
import { useMenu } from './menu';
import { useCart } from '../store/cart';

export interface SiteDeal extends DealRule {
  description: string;
  order: number;
  theme: 'red' | 'yellow' | 'green' | 'dark';
}

/** Deals switched on in the admin (public, read-only). */
export function useDeals() {
  return useQuery({
    queryKey: ['deals'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<SiteDeal[]> => {
      const [db, { collection, getDocs, query, where }] = await Promise.all([menuDb(), import('firebase/firestore/lite')]);
      const snap = await getDocs(query(collection(db, 'deals'), where('active', '==', true)));
      return snap.docs
        .map((d) => {
          const x = d.data();
          return {
            id: d.id,
            title: String(x.title ?? ''),
            description: String(x.description ?? ''),
            components: Array.isArray(x.components) ? x.components : [],
            priceAgorot: Number(x.priceAgorot ?? 0),
            active: x.active === true,
            weekdays: Array.isArray(x.weekdays) ? x.weekdays : [],
            validFrom: x.validFrom ?? null,
            validTo: x.validTo ?? null,
            order: Number(x.order ?? 0),
            theme: (['red', 'yellow', 'green', 'dark'].includes(x.theme) ? x.theme : 'red') as SiteDeal['theme'],
          };
        })
        .filter((d) => d.title && d.components.length > 0 && d.priceAgorot > 0)
        .toSorted((a, b) => a.order - b.order);
    },
  });
}

export interface LiveDeal {
  deal: SiteDeal;
  items: { item: MenuItem; quantity: number }[];
  regularAgorot: number;
}

/** Deals that are on today and whose items are all on the menu now, with the items and the "instead of" price. */
export function useLiveDeals(): LiveDeal[] {
  const { data: deals = [] } = useDeals();
  const { data: menu = [] } = useMenu();
  const byId = new Map(menu.map((m) => [m.id, m]));
  const today = localParts(new Date());
  const out: LiveDeal[] = [];
  for (const deal of deals) {
    if (!dealIsOn(deal, today.date, today.weekday)) continue;
    const items = deal.components.map((c) => ({ item: byId.get(c.itemId)!, quantity: c.quantity }));
    if (items.some((x) => !x.item)) continue;
    const regularAgorot = dealRegularPrice(deal, (id) => byId.get(id)?.priceAgorot) ?? 0;
    if (regularAgorot <= deal.priceAgorot) continue;
    out.push({ deal, items, regularAgorot });
  }
  return out;
}

/** Deals the cart already qualifies for (same rule as the server), and the total after them. */
export function useCartDeals(): { discounts: Discount[]; dealsOff: number } {
  const lines = useCart((s) => s.lines);
  const live = useLiveDeals();
  const { data: menu = [] } = useMenu();
  const byId = new Map(menu.map((m) => [m.id, m]));
  const discounts = applyDeals(lines, live.map((l) => l.deal), (id) => byId.get(id)?.priceAgorot);
  return { discounts, dealsOff: discounts.reduce((s, d) => s + d.amountAgorot, 0) };
}

export interface LoyaltyRules {
  enabled: boolean;
  ordersRequired: number;
  minOrderAgorot: number;
  reward: LoyaltyReward;
}

/** The loyalty card's rules (public). null when the owner hasn't turned it on. */
export function useLoyaltyRules() {
  return useQuery({
    queryKey: ['loyalty-rules'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<LoyaltyRules | null> => {
      const [db, { doc, getDoc }] = await Promise.all([menuDb(), import('firebase/firestore/lite')]);
      const d = (await getDoc(doc(db, 'settings', 'loyalty'))).data();
      return d?.enabled ? (d as LoyaltyRules) : null;
    },
  });
}

export const rewardText = (r: LoyaltyReward) => loyaltyRewardLabel(r, (id) => CATEGORY_SINGULAR[id as keyof typeof CATEGORY_SINGULAR] ?? id);
