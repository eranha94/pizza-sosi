import { useEffect, useMemo, useState } from 'react';
import { CATEGORY_IDS, CATEGORY_LABELS, formatAgorot } from '@pizza-sosi/contracts/constants';
import type { CategoryId, MenuItem } from '@pizza-sosi/contracts';
import { useMenu, useBucket, useStoreSettings } from '../lib/menu';
import { imageUrl, thumbSrcSet, prefetchOrdering } from '../lib/firebase';
import { ItemDialog } from '../components/ItemDialog';

export function HomePage() {
  const menu = useMenu();
  const store = useStoreSettings();
  const bucket = useBucket();
  const [selected, setSelected] = useState<MenuItem | null>(null);

  // Load the ordering code in idle time so checkout opens instantly.
  useEffect(() => prefetchOrdering(), []);

  const byCategory = useMemo(() => {
    const map = new Map<CategoryId, MenuItem[]>();
    for (const item of menu.data ?? []) map.set(item.category, [...(map.get(item.category) ?? []), item]);
    return CATEGORY_IDS.filter((c) => map.has(c)).map((c) => ({ id: c, items: map.get(c)! }));
  }, [menu.data]);

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

      {store.data?.acceptingOrders === false && (
        <p className="notice" role="status">כרגע לא מקבלים הזמנות באתר. אפשר להתקשר: <a href="tel:0548880909">054-8880909</a></p>
      )}

      <section id="menu" className="menu" aria-label="התפריט">
        {byCategory.length > 1 && (
          <nav className="menu__tabs" aria-label="קטגוריות">
            {byCategory.map((c) => (
              <a key={c.id} href={`#cat-${c.id}`} className="chip">{CATEGORY_LABELS[c.id]}</a>
            ))}
          </nav>
        )}
        {menu.isPending && <p className="page-loading">טוען את התפריט…</p>}
        {menu.isError && <p className="notice notice--error">לא הצלחנו לטעון את התפריט. רעננו את הדף.</p>}
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
