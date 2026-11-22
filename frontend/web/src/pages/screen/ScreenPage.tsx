import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import qrcode from 'qrcode-generator';
import type { MenuItem, ScreenBoard, StoreSettings } from '@pizza-sosi/contracts';
import { CATEGORY_LABELS, ITEM_TAG_LABELS, storeStatus, formatTime } from '@pizza-sosi/contracts/constants';
import { imageUrl } from '../../lib/firebase';
import { PizzaPreview, toppingsFromText } from '../../components/PizzaPreview';
import { useScreenData, type ScreenData } from './useScreenData';
import { buildSlides, type Slide } from './slides';
import './screen.css';

/*
 * The menu board for the TV in the pizzeria: pizza-sosi.co.il/screen
 * Drawn on a fixed 1920×1080 canvas and scaled to whatever screen it's on, so it looks the same on every TV.
 * Everything is live: prices, sold-out dishes, promotions and the pickup numbers update by themselves.
 */

const W = 1920;
const H = 1080;
const SITE = 'pizza-sosi.co.il';
const CATEGORY_EMOJI: Record<string, string> = { pizzas: '🍕', specials: '⭐', toasts: '🥪', burgers: '🍔', salads: '🥗', drinks: '🥤' };

export default function ScreenPage() {
  return <ScreenView data={useScreenData()} />;
}

/** The screen itself, given its data (separate so it can be previewed with sample data). */
export function ScreenView({ data, startAt = 0 }: { data: ScreenData | null; startAt?: number }) {
  const scale = useCanvasScale();
  useKioskMode();

  const menu = data?.menu;
  const screen = data?.screen;
  const slides = useMemo(() => (menu && screen ? buildSlides(menu, screen) : []), [menu, screen]);
  const { current, next, leaving, progressKey } = useCarousel(slides, (data?.screen.slideSeconds ?? 9) * 1000, startAt);

  // Load the next dish photo in advance so it never appears half-drawn.
  const nextSrc = data && next?.kind === 'featured' ? imageUrl(data.bucket, next.item.imagePath) : null;
  useEffect(() => {
    if (nextSrc) new Image().src = nextSrc;
  }, [nextSrc]);

  return (
    <div className="tv-viewport">
      <div className="tv" style={{ width: W, height: H, transform: `translate(-50%, -50%) scale(${scale})` }} dir="rtl">
        <main className="tv-stage" aria-live="off">
          {!data && <div className="tv-loading">🍕</div>}
          {data && slides.length === 0 && <EmptyStage />}
          {data && leaving && <SlideView key={`out-${leaving.key}`} slide={leaving} bucket={data.bucket} state="out" />}
          {data && current && <SlideView key={current.key} slide={current} bucket={data.bucket} state="in" />}
          {data && current && (
            <div className="tv-progress" aria-hidden="true">
              <i key={progressKey} style={{ animationDuration: `${data.screen.slideSeconds}s` }} />
            </div>
          )}
        </main>
        <Rail store={data?.store ?? null} board={data?.board ?? { preparing: [], ready: [] }} showReady={data?.screen.showReady ?? true} showQr={data?.screen.showQr ?? true} online={data?.online ?? true} />
      </div>
    </div>
  );
}

/* ---------------- slides ---------------- */

function SlideView({ slide, bucket, state }: { slide: Slide; bucket: string; state: 'in' | 'out' }) {
  const cls = `tv-slide tv-slide--${slide.kind} is-${state}`;
  if (slide.kind === 'featured') return <Featured item={slide.item} bucket={bucket} className={cls} />;
  if (slide.kind === 'promo')
    return (
      <section className={cls}>
        {slide.promo.emoji && <div className="promo__emoji">{slide.promo.emoji}</div>}
        <h2 className="promo__title">{slide.promo.title}</h2>
        {slide.promo.text && <p className="promo__text">{slide.promo.text}</p>}
      </section>
    );
  return (
    <section className={cls}>
      <header className="board__head">
        <h2>{CATEGORY_LABELS[slide.category]}</h2>
        {slide.parts > 1 && (
          <span className="board__part">
            {slide.part}/{slide.parts}
          </span>
        )}
      </header>
      <ul
        className={`board__list ${slide.items.length <= 5 ? 'is-short' : ''}`}
        style={{ '--rows': slide.items.length <= 5 ? slide.items.length : Math.ceil(slide.items.length / 2) } as React.CSSProperties}
      >
        {slide.items.map((m, i) => (
          <li key={m.id} style={{ '--i': i } as React.CSSProperties}>
            <div className="board__row">
              <span className="board__name">
                {m.name}
                {m.tags
                  .filter((t) => t !== 'recommended' && t !== 'new')
                  .map((t) => (
                    <span key={t} className="board__tag" title={ITEM_TAG_LABELS[t].label}>
                      {ITEM_TAG_LABELS[t].icon}
                    </span>
                  ))}
                {(m.tags.includes('new') || m.tags.includes('recommended')) && <span className="board__flag">{m.tags.includes('new') ? 'חדש' : 'מומלץ'}</span>}
              </span>
              <span className="board__dots" aria-hidden="true" />
              <Price agorot={m.priceAgorot} className="board__price" />
            </div>
            {m.description && <p className="board__desc">{m.description}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Featured({ item, bucket, className }: { item: MenuItem; bucket: string; className: string }) {
  const src = imageUrl(bucket, item.imagePath);
  const isPizza = item.category === 'pizzas' || item.category === 'specials';
  const flag = item.tags.includes('new') ? ITEM_TAG_LABELS.new : item.tags.includes('recommended') ? ITEM_TAG_LABELS.recommended : null;
  return (
    <section className={className}>
      <div className={`feat__plate ${isPizza && !src ? 'is-spinning' : ''}`} aria-hidden="true">
        {src ? <img src={src} alt="" decoding="async" /> : isPizza ? <PizzaPreview toppings={toppingsFromText(`${item.name} ${item.description}`)} /> : <span className="feat__emoji">{CATEGORY_EMOJI[item.category] ?? '🍽️'}</span>}
      </div>
      <div className="feat__text">
        {flag && (
          <span className="feat__flag">
            {flag.icon} {flag.label}
          </span>
        )}
        <h2 className="feat__name">{item.name}</h2>
        {item.description && <p className="feat__desc">{item.description}</p>}
        <div className="feat__stamp">
          <Price agorot={item.priceAgorot} />
        </div>
      </div>
    </section>
  );
}

function Price({ agorot, className = '' }: { agorot: number; className?: string }) {
  const n = agorot / 100;
  return (
    <span className={`tv-price ${className}`}>
      <span className="tv-price__num">{Number.isInteger(n) ? n : n.toFixed(2)}</span>
      <span className="tv-price__cur">₪</span>
    </span>
  );
}

function EmptyStage() {
  return (
    <section className="tv-slide tv-slide--promo is-in">
      <div className="promo__emoji">🍕</div>
      <h2 className="promo__title">פיצה סוסי</h2>
      <p className="promo__text">כל סוגי הפיצות והטוסטים</p>
    </section>
  );
}

/* ---------------- side rail ---------------- */

function Rail({ store, board, showReady, showQr, online }: { store: StoreSettings | null; board: ScreenBoard; showReady: boolean; showQr: boolean; online: boolean }) {
  const now = useTick(15_000);
  const status = store ? storeStatus(store, now) : null;
  const hasNumbers = showReady && (board.ready.length > 0 || board.preparing.length > 0);
  const fresh = useFreshNumbers(board.ready);
  return (
    <aside className="tv-rail">
      <img className="rail__logo" src="/brand/pizza-sosi-badge.svg" alt="פיצה סוסי" />
      <div className="rail__clock">{now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false })}</div>
      {status && (
        <p className={`rail__status rail__status--${status.state}`}>
          {status.state === 'open' ? `פתוח עד ${formatTime(status.closesAt)}` : status.state === 'paused' ? 'לא מקבלים הזמנות כרגע' : status.opensAt ? `נפתח ב-${formatTime(status.opensAt)}` : 'סגור'}
        </p>
      )}

      {hasNumbers ? (
        <div className="rail__orders">
          {board.ready.length > 0 && (
            <section className="orders orders--ready">
              <h3>מוכן לאיסוף</h3>
              <ul>
                {board.ready.slice(-6).map((n) => (
                  <li key={n} className={fresh.has(n) ? 'is-fresh' : ''}>
                    {n}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {board.preparing.length > 0 && (
            <section className="orders orders--prep">
              <h3>בהכנה</h3>
              <ul>
                {board.preparing.slice(-8).map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : (
        <div className="rail__spacer" />
      )}

      {showQr && (
        <div className={`rail__qr ${hasNumbers ? '' : 'is-large'}`}>
          <QrCode text={`https://${SITE}/?utm_source=screen`} />
          <p>
            <strong>הזמינו מהטלפון</strong>
            <span dir="ltr">{SITE}</span>
          </p>
        </div>
      )}
      {!online && <p className="rail__offline">אין חיבור – מוצגים המחירים האחרונים</p>}
      <FullscreenButton />
    </aside>
  );
}

function QrCode({ text }: { text: string }) {
  const path = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
    return { d, n };
  }, [text]);
  return (
    <svg className="qr" viewBox={`-2 -2 ${path.n + 4} ${path.n + 4}`} role="img" aria-label={`קוד QR לאתר ${SITE}`} shapeRendering="crispEdges">
      <rect x="-2" y="-2" width={path.n + 4} height={path.n + 4} fill="#fff" />
      <path d={path.d} fill="#1e1a1b" />
    </svg>
  );
}

function FullscreenButton() {
  const [full, setFull] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  if (full || !document.fullscreenEnabled) return null;
  return (
    <button className="rail__full" onClick={() => void document.documentElement.requestFullscreen().catch(() => {})}>
      מסך מלא
    </button>
  );
}

/* ---------------- hooks ---------------- */

/** Scale the 1920×1080 canvas to fit the screen (letterboxed). */
function useCanvasScale() {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return scale;
}

/** Rotate through the slides; keep the one going out for the cross-fade. */
function useCarousel(slides: Slide[], ms: number, startAt: number) {
  const [index, setIndex] = useState(startAt);
  const [leaving, setLeaving] = useState<Slide | null>(null);
  const [progressKey, setProgressKey] = useState(0);
  const current = slides.length ? slides[index % slides.length]! : null;

  useEffect(() => {
    if (slides.length < 2) return;
    const t = window.setTimeout(() => {
      setLeaving(slides[index % slides.length] ?? null);
      setIndex((i) => (i + 1) % slides.length);
      setProgressKey((k) => k + 1);
    }, ms);
    return () => window.clearTimeout(t);
  }, [index, slides, ms]);

  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setLeaving(null), 1100);
    return () => window.clearTimeout(t);
  }, [leaving]);

  const next = slides.length > 1 ? slides[(index + 1) % slides.length]! : null;
  return { current, next, leaving: leaving && leaving.key !== current?.key ? leaving : null, progressKey };
}

function useTick(ms: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

/** Numbers that just became ready get a highlight for a minute (nothing is "new" on first load). */
function useFreshNumbers(ready: number[]) {
  const [fresh, setFresh] = useState<Set<number>>(() => new Set());
  const known = useRef<Set<number> | null>(null);
  const key = ready.join(',');
  useEffect(() => {
    const list = key ? key.split(',').map(Number) : [];
    if (known.current === null) {
      known.current = new Set(list);
      return;
    }
    const added = list.filter((n) => !known.current!.has(n));
    known.current = new Set(list);
    if (added.length === 0) return;
    setFresh((f) => new Set([...f, ...added]));
    const t = window.setTimeout(() => setFresh((f) => new Set([...f].filter((n) => !added.includes(n)))), 60_000);
    return () => window.clearTimeout(t);
  }, [key]);
  return fresh;
}

/** Screen never sleeps, cursor hides, search engines stay away, the page has a clear title. */
function useKioskMode() {
  useEffect(() => {
    document.title = 'פיצה סוסי – מסך תפריט';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex';
    document.head.appendChild(robots);
    document.documentElement.classList.add('tv-mode');

    let lock: WakeLockSentinel | null = null;
    const wake = async () => {
      try {
        if (document.visibilityState === 'visible') lock = await navigator.wakeLock?.request('screen');
      } catch {
        /* not allowed – the TV's own settings will have to keep it on */
      }
    };
    void wake();
    document.addEventListener('visibilitychange', wake);

    let idle = 0;
    const show = () => {
      document.documentElement.classList.remove('tv-idle');
      window.clearTimeout(idle);
      idle = window.setTimeout(() => document.documentElement.classList.add('tv-idle'), 3000);
    };
    show();
    window.addEventListener('pointermove', show);

    return () => {
      robots.remove();
      document.documentElement.classList.remove('tv-mode', 'tv-idle');
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('pointermove', show);
      window.clearTimeout(idle);
      void lock?.release();
    };
  }, []);
}
