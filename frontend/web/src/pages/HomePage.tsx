import { useEffect, useMemo, useState } from 'react';
import { CATEGORY_IDS, CATEGORY_LABELS, formatAgorot } from '@pizza-sosi/contracts/constants';
import type { CategoryId, MenuItem } from '@pizza-sosi/contracts';
import { useMenu, useBucket } from '../lib/menu';
import { imageUrl, thumbSrcSet, prefetchOrdering } from '../lib/firebase';
import { ItemDialog } from '../components/ItemDialog';
import { OpeningHoursSchema } from '../components/OpeningHoursSchema';
import { StoreStatusCard } from '../components/StoreStatus';
import { useActiveCategory } from '../store/ui';
import { scrollToCategory } from '../components/Layout';
import { useLocation } from 'react-router';

export function HomePage() {
  const menu = useMenu();
  const bucket = useBucket();
  const [selected, setSelected] = useState<MenuItem | null>(null);

  // Load the ordering code in idle time so checkout opens instantly.
  useEffect(() => prefetchOrdering(), []);



  const byCategory = useMemo(() => {
    const map = new Map<CategoryId, MenuItem[]>();
    for (const item of menu.data ?? []) map.set(item.category, [...(map.get(item.category) ?? []), item]);
    return CATEGORY_IDS.filter((c) => map.has(c)).map((c) => ({ id: c, items: map.get(c)! }));
  }, [menu.data]);

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
        {menu.isPending && <p className="page-loading">טוען את התפריט…</p>}
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
