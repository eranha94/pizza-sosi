import { useEffect, useMemo, useState } from 'react';
import { CATEGORY_IDS, CATEGORY_LABELS, ITEM_TAGS, ITEM_TAG_LABELS, formatAgorot, type ItemTag } from '@pizza-sosi/contracts/constants';
import type { CategoryId, MenuItem } from '@pizza-sosi/contracts';
import { useMenu, useBucket } from '../lib/menu';
import { imageUrl, thumbSrcSet, prefetchOrdering } from '../lib/firebase';
import { ItemDialog } from '../components/ItemDialog';
import { OpeningHoursSchema } from '../components/OpeningHoursSchema';
import { StoreStatusCard } from '../components/StoreStatus';
import { useActiveCategory } from '../store/ui';
import { scrollToCategory } from '../components/Layout';
import { useLocation } from 'react-router';
import { usePageTitle } from '../lib/a11y';

export function HomePage() {
  const menu = useMenu();
  const bucket = useBucket();
  const [selected, setSelected] = useState<MenuItem | null>(null);
  // Home: title only – the page keeps its scroll position / category jump.
  usePageTitle('', { focus: false });
  const [search, setSearch] = useState('');
  const [tag, setTag] = useState<ItemTag | null>(null);
  const q = search.trim();
  const filtering = q !== '' || tag !== null;
  // Tags that actually appear on the menu (no empty filters).
  const tagsInMenu = useMemo(() => ITEM_TAGS.filter((t) => (menu.data ?? []).some((m) => m.tags.includes(t))), [menu.data]);

  // Load the ordering code in idle time so checkout opens instantly.
  useEffect(() => prefetchOrdering(), []);



  const byCategory = useMemo(() => {
    const map = new Map<CategoryId, MenuItem[]>();
    const match = (m: MenuItem) =>
      (!tag || m.tags.includes(tag)) &&
      (!q || m.name.includes(q) || m.description.includes(q) || m.addOnGroups.some((g) => g.options.some((o) => o.active && o.name.includes(q))));
    for (const item of menu.data ?? []) if (match(item)) map.set(item.category, [...(map.get(item.category) ?? []), item]);
    return CATEGORY_IDS.filter((c) => map.has(c)).map((c) => ({ id: c, items: map.get(c)! }));
  }, [menu.data, q, tag]);
  const found = byCategory.reduce((n, c) => n + c.items.length, 0);

  // Header underline follows the category on screen.
  const setActive = useActiveCategory((s) => s.set);
  const location = useLocation();
  const ids = byCategory.map((c) => c.id).join(',');
  useEffect(() => {
    const sections = ids ? ids.split(',').map((id) => document.getElementById(`cat-${id}`)).filter((el): el is HTMLElement => el !== null) : [];
    if (sections.length === 0) return;
    // Active = the last category whose heading has passed just under the header.
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 112) + 60;
      let current: string | null = null;
      for (const s of sections) if (s.getBoundingClientRect().top <= line) current = s.id.slice(4);
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      setActive(null);
    };
  }, [ids, setActive]);

  // Arriving with #cat-… (from another page): scroll there once the menu is on screen.
  useEffect(() => {
    const m = /^#cat-(\w+)$/.exec(location.hash);
    if (m && ids.includes(m[1]!)) requestAnimationFrame(() => scrollToCategory(m[1]!));
  }, [location.hash, ids]);

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <picture>
          <source media="(min-width: 768px)" srcSet="/brand/hero-desktop.webp" />
          <img className="hero__photo" src="/brand/hero-mobile-sm.webp" srcSet="/brand/hero-mobile-sm.webp 540w, /brand/hero-mobile.webp 1080w" sizes="100vw" alt="פיצה עם ירקות טריים, זיתים וגבינה" width="1080" height="1350" fetchPriority="high" />
        </picture>
        <div className="hero__badge">
          <h1 id="hero-title" className="visually-hidden">פיצה סוסי – רק הטעם ידבר</h1>
          <img src="/brand/pizza-sosi-badge.svg" alt="" width="470" height="300" />
        </div>
        <a className="button button--primary hero__cta" href="#menu">לתפריט ולהזמנה</a>
      </section>

      <StoreStatusCard />

      <section id="menu" className="menu" aria-label="התפריט">
        {(menu.data?.length ?? 0) > 0 && (
          <div className="menu-tools" role="search">
            <label className="menu-search">
              <span className="sr-only">חיפוש בתפריט</span>
              <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש: טונה, פטריות, טוסט…" enterKeyHint="search" />
            </label>
            {tagsInMenu.length > 0 && (
              <div className="tag-filter" role="group" aria-label="סינון לפי תגית">
                {tagsInMenu.map((t) => (
                  <button key={t} type="button" className={`tag-chip ${tag === t ? 'is-on' : ''}`} aria-pressed={tag === t} onClick={() => setTag(tag === t ? null : t)}>
                    {ITEM_TAG_LABELS[t].icon} {ITEM_TAG_LABELS[t].label}
                  </button>
                ))}
              </div>
            )}
            {filtering && (
              <p className="menu-tools__result" role="status" aria-live="polite">
                {found === 0 ? 'לא מצאנו מנה מתאימה' : found === 1 ? 'מנה אחת' : `${found} מנות`} ·{' '}
                <button type="button" className="link-button" onClick={() => { setSearch(''); setTag(null); }}>ניקוי</button>
              </p>
            )}
          </div>
        )}
        {menu.isPending && <MenuSkeleton />}
        {menu.isError && !menu.data?.length && <p className="notice notice--error">לא הצלחנו לטעון את התפריט. רעננו את הדף.</p>}
        {byCategory.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} className="menu__category" aria-labelledby={`h-${c.id}`}>
            <h2 id={`h-${c.id}`}>{CATEGORY_LABELS[c.id]}</h2>
            <ul className="menu__grid">
              {c.items.map((item) => {
                const src = imageUrl(bucket.data ?? '', item.imagePath);
                const srcSet = thumbSrcSet(bucket.data ?? '', item.imagePath);
                return (
                  <li key={item.id}>
                    <button type="button" className="item-card" onClick={() => setSelected(item)}>
                      {src ? (
                        <MenuImage src={src} srcSet={srcSet} />
                      ) : (
                        <span className="item-card__img item-card__img--empty" aria-hidden="true" />
                      )}
                      <span className="item-card__body">
                        <span className="item-card__name">{item.name}</span>
                        {item.tags.length > 0 && (
                          <span className="item-card__tags">
                            {item.tags.map((t) => (
                              <span key={t} className={`badge badge--${t}`}>{ITEM_TAG_LABELS[t].icon} {ITEM_TAG_LABELS[t].label}</span>
                            ))}
                          </span>
                        )}
                        {item.description && <span className="item-card__desc">{item.description}</span>}
                        <span className="item-card__price">{formatAgorot(item.priceAgorot)}</span>
                      </span>
                      <span className="item-card__add" aria-hidden="true">+</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </section>
      <ItemDialog item={selected} onClose={() => setSelected(null)} />
      <OpeningHoursSchema />
    </>
  );
}

/** Small WebP thumbnail (112px shown → 320/640 for retina); falls back to the original if missing. */
function MenuImage({ src, srcSet }: { src: string; srcSet: string | null }) {
  const [useOriginal, setUseOriginal] = useState(!srcSet);
  return (
    <img
      className="item-card__img"
      src={useOriginal ? src : srcSet!.split(' ')[0]}
      srcSet={useOriginal ? undefined : srcSet!}
      sizes="112px"
      alt=""
      width="112"
      height="112"
      loading="lazy"
      decoding="async"
      onError={() => setUseOriginal(true)}
    />
  );
}

/** Placeholder cards while the menu loads (shapes only; the text is for screen readers). */
function MenuSkeleton() {
  return (
    <div role="status">
      <span className="sr-only">טוען את התפריט…</span>
      <ul className="skeleton-grid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <li key={i} className="skeleton-card">
            <span />
            <div><i /><i /><i /></div>
          </li>
        ))}
      </ul>
    </div>
  );
}
