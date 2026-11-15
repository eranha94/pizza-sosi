import { useEffect, useRef, useState } from 'react';

export type Theme = 'light' | 'dark' | 'premium';
const KEY = 'pizza-sosi-theme';
const META: Record<Theme, string> = { light: '#FEB800', dark: '#1a1513', premium: '#0b0907' };
const OPTIONS: { id: Theme; name: string; hint: string }[] = [
  { id: 'light', name: 'בהיר', hint: 'צהוב ושחור, כמו השלט' },
  { id: 'dark', name: 'כהה', hint: 'נעים לעיניים בערב' },
  { id: 'premium', name: 'פרימיום', hint: 'שחור וזהב' },
];

export function currentTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === 'dark' || t === 'premium' ? t : 'light';
}

export function applyTheme(t: Theme, remember = true) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META[t]);
  if (remember) {
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* private mode – fine for this visit */
    }
  }
}

/** One button in the header that opens three looks: light, dark, premium. */
export function ThemeMenu() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => currentTheme());
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (t: Theme) => {
    applyTheme(t);
    setTheme(t);
  };

  return (
    <div className="theme-pop" ref={wrap}>
      <button ref={btn} type="button" className="theme-btn" aria-label="מראה האתר" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((v) => !v)}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
          <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" />
        </svg>
      </button>
      {open && (
        <div className="theme-panel" role="radiogroup" aria-label="בחירת מראה">
          <p>מראה האתר</p>
          {OPTIONS.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={theme === o.id} className="theme-opt" onClick={() => choose(o.id)}>
              <span className={`swatch swatch--${o.id}`} aria-hidden="true"><i /></span>
              <span>
                {o.name}
                <small>{o.hint}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
