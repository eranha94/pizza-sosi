import type { MenuItem, ScreenPromo, ScreenSettings, CategoryId } from '@pizza-sosi/contracts';

export type Slide =
  | { kind: 'featured'; key: string; item: MenuItem }
  | { kind: 'menu'; key: string; category: CategoryId; items: MenuItem[]; part: number; parts: number }
  | { kind: 'promo'; key: string; promo: ScreenPromo };

/** A menu board holds two columns of this many rows. */
export const ROWS_PER_COLUMN = 7;
const PER_BOARD = ROWS_PER_COLUMN * 2;

/** Featured dishes: the ones picked in the admin, else recommended/new dishes with a photo, else any dish with a photo. */
export function pickFeatured(menu: MenuItem[], screen: ScreenSettings): MenuItem[] {
  const byId = new Map(menu.map((m) => [m.id, m]));
  const chosen = screen.featuredItemIds.map((id) => byId.get(id)).filter((m): m is MenuItem => !!m);
  if (chosen.length) return chosen;
  const withPhoto = menu.filter((m) => m.imagePath);
  const tagged = withPhoto.filter((m) => m.tags.includes('recommended') || m.tags.includes('new'));
  if (tagged.length) return tagged.slice(0, 6);
  if (withPhoto.length) return withPhoto.slice(0, 6);
  // No photos yet: feature the pizzas (drawn), so the screen still has its hero moments.
  return menu.filter((m) => m.category === 'pizzas' || m.category === 'specials').slice(0, 4);
}

/** Split a category into boards, balanced so the last board isn't a lonely row or two. */
function boards(category: CategoryId, items: MenuItem[]): Slide[] {
  if (items.length === 0) return [];
  const parts = Math.ceil(items.length / PER_BOARD);
  const size = Math.ceil(items.length / parts);
  return Array.from({ length: parts }, (_, i) => ({
    kind: 'menu' as const,
    key: `menu-${category}-${i}`,
    category,
    items: items.slice(i * size, (i + 1) * size),
    part: i + 1,
    parts,
  }));
}

/**
 * The running order: a featured dish, then a price list, then the next featured dish…
 * with a promotion after every second pair. Every price list appears once per loop.
 */
export function buildSlides(menu: MenuItem[], screen: ScreenSettings): Slide[] {
  const featured: Slide[] = pickFeatured(menu, screen).map((item) => ({ kind: 'featured', key: `f-${item.id}`, item }));
  const lists: Slide[] = screen.menuCategories.flatMap((c) => boards(c, menu.filter((m) => m.category === c)));
  const promos: Slide[] = screen.promos.filter((p) => p.active).map((promo) => ({ kind: 'promo', key: `p-${promo.id}`, promo }));
  const loop = Math.max(featured.length, lists.length, promos.length ? 1 : 0);
  const out: Slide[] = [];
  for (let k = 0; k < loop; k++) {
    if (featured.length) out.push(featured[k % featured.length]!);
    if (lists.length) out.push(lists[k % lists.length]!);
    if (promos.length && (k % 2 === 1 || loop === 1)) out.push(promos[Math.floor(k / 2) % promos.length]!);
  }
  // Never show the same slide twice in a row (e.g. one featured dish and one list).
  return out.filter((s, i) => i === 0 || s.key !== out[i - 1]!.key);
}
