import { logger } from 'firebase-functions';
import {
  Deal,
  LoyaltySettings,
  DEFAULT_LOYALTY,
  CATEGORY_SINGULAR,
  loyaltyRewardLabel,
  type DealRule,
  type LoyaltyCardView,
} from '@pizza-sosi/contracts';
import { db, COL } from '../firebase.js';

/** Deals switched on (date/weekday is checked by the caller with dealIsOn). */
export async function loadActiveDeals(): Promise<DealRule[]> {
  const snap = await db.collection(COL.deals).where('active', '==', true).get();
  const out: DealRule[] = [];
  for (const d of snap.docs) {
    const parsed = Deal.safeParse({ id: d.id, ...d.data() });
    if (parsed.success) out.push(parsed.data);
    else logger.warn('deal skipped: invalid', { id: d.id });
  }
  return out;
}

export async function loadLoyaltySettings(): Promise<LoyaltySettings> {
  const snap = await db.collection(COL.settings).doc('loyalty').get();
  const parsed = LoyaltySettings.safeParse(snap.data());
  return parsed.success ? parsed.data : DEFAULT_LOYALTY;
}

export const categoryLabel = (id: string) => CATEGORY_SINGULAR[id as keyof typeof CATEGORY_SINGULAR] ?? id;
export const rewardLabel = (s: LoyaltySettings) => loyaltyRewardLabel(s.reward, categoryLabel);

/** The loyalty card is keyed by the phone number (digits only, e.g. 0521234567). */
export const loyaltyRef = (phone: string) => db.collection(COL.loyalty).doc(phone.replace(/\D/g, ''));

export async function loyaltyView(phone: string, s?: LoyaltySettings): Promise<LoyaltyCardView | null> {
  const settings = s ?? (await loadLoyaltySettings());
  if (!settings.enabled) return null;
  const card = (await loyaltyRef(phone).get()).data();
  return {
    enabled: true,
    required: settings.ordersRequired,
    stamps: Number(card?.stamps ?? 0),
    rewards: Number(card?.rewards ?? 0),
    rewardLabel: rewardLabel(settings),
    minOrderAgorot: settings.minOrderAgorot,
  };
}
