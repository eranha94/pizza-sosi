import { useEffect, useRef, useState } from 'react';

/** A square crop in the photo's own pixels. */
export interface Crop {
  sx: number;
  sy: number;
  s: number;
}

const MIN_FRACTION = 0.3; // the square can shrink to 30% of the photo's short side

/**
 * Choose which part of a photo goes into the square pictures (menu cards, the TV screen).
 * Drag the square to move it, use the slider (or the mouse wheel) to zoom, arrow keys also move it.
 */
export function CropDialog({ file, onCancel, onDone }: { file: File; onCancel: () => void; onDone: (crop: Crop) => void }) {
  const [url] = useState(() => URL.createObjectURL(file));
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(0); // displayed width of the photo, in CSS px
  const drag = useRef<{ x: number; y: number; start: Crop } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  // Real pixel size (with phone rotation applied), same as the upload step uses.
  useEffect(() => {
    let alive = true;
    createImageBitmap(file, { imageOrientation: 'from-image' })
      .then((b) => {
        if (!alive) return;
        const s = Math.min(b.width, b.height);
        setSize({ w: b.width, h: b.height });
        setCrop({ sx: (b.width - s) / 2, sy: (b.height - s) / 2, s });
        b.close();
      })
      .catch(() => setError('לא הצלחנו לקרוא את התמונה. נסה JPG או PNG.'));
    return () => {
      alive = false;
    };
  }, [file]);

  useEffect(() => {
    if (crop) frameRef.current?.focus();
    // focus once, when the frame first appears
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crop === null]);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || !size) return;
    const measure = () => setShown(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  if (error)
    return (
      <Shell onCancel={onCancel}>
        <p className="error">{error}</p>
      </Shell>
    );
  if (!size || !crop)
    return (
      <Shell onCancel={onCancel}>
        <p className="muted">טוען תמונה…</p>
      </Shell>
    );

  const short = Math.min(size.w, size.h);
  const k = shown / size.w || 0; // CSS px per photo px
  const clamp = (c: Crop): Crop => {
    const s = Math.max(short * MIN_FRACTION, Math.min(short, c.s));
    return { s, sx: Math.max(0, Math.min(size.w - s, c.sx)), sy: Math.max(0, Math.min(size.h - s, c.sy)) };
  };
  /** Zoom around the square's centre. */
  const zoomTo = (s: number) => setCrop((c) => (c ? clamp({ s, sx: c.sx + (c.s - s) / 2, sy: c.sy + (c.s - s) / 2 }) : c));

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, start: crop };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !k) return;
    setCrop(clamp({ ...d.start, sx: d.start.sx + (e.clientX - d.x) / k, sy: d.start.sy + (e.clientY - d.y) / k }));
  };
  const onKey = (e: React.KeyboardEvent) => {
    const step = short * 0.03;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      setCrop(clamp({ ...crop, sx: crop.sx + m[0], sy: crop.sy + m[1] }));
    } else if (e.key === '+' || e.key === '=') zoomTo(crop.s * 0.92);
    else if (e.key === '-') zoomTo(crop.s / 0.92);
  };
  // Slider: 0 = whole short side, 100 = tightest zoom
  const zoomPct = Math.round(((short - crop.s) / (short * (1 - MIN_FRACTION))) * 100);
  const previewStyle = (px: number): React.CSSProperties => ({
    width: px,
    height: px,
    backgroundImage: `url(${url})`,
    backgroundSize: `${(size.w / crop.s) * px}px ${(size.h / crop.s) * px}px`,
    backgroundPosition: `${(-crop.sx / crop.s) * px}px ${(-crop.sy / crop.s) * px}px`,
  });

  return (
    <Shell onCancel={onCancel}>
      <p className="muted small">גררו את הריבוע אל המנה. כך היא תופיע בתפריט באתר ובמסך בפיצרייה.</p>
      <div className="crop__layout">
        <div
          className="crop__stage"
          ref={stageRef}
          style={{ aspectRatio: `${size.w} / ${size.h}`, width: `min(100%, ${((60 * size.w) / size.h).toFixed(2)}vh)` }}
          onWheel={(e) => zoomTo(crop.s * (e.deltaY > 0 ? 1.06 : 0.94))}
        >
          <img src={url} alt="" draggable={false} />
          {k > 0 && (
            <div
              ref={frameRef}
              className="crop__frame"
              role="slider"
              tabIndex={0}
              aria-label="מיקום החיתוך – חצים להזזה, פלוס ומינוס לזום"
              aria-valuetext={`${Math.round((crop.sx / size.w) * 100)}% משמאל, ${Math.round((crop.sy / size.h) * 100)}% מלמעלה`}
              style={{ left: crop.sx * k, top: crop.sy * k, width: crop.s * k, height: crop.s * k }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onKeyDown={onKey}
            >
              <i className="crop__circle" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="crop__side">
          <span className="small muted">בתפריט</span>
          <div className="crop__preview crop__preview--card" style={previewStyle(112)} aria-hidden="true" />
          <span className="small muted">במסך</span>
          <div className="crop__preview crop__preview--screen" style={previewStyle(112)} aria-hidden="true" />
        </div>
      </div>
      <label className="field crop__zoom">
        <span>זום</span>
        <input type="range" min={0} max={100} value={zoomPct} onChange={(e) => zoomTo(short - (Number(e.target.value) / 100) * short * (1 - MIN_FRACTION))} />
      </label>
      <div className="row crop__actions">
        <button type="button" className="btn" onClick={() => onDone(clamp(crop))}>
          שמירת החיתוך
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          ביטול
        </button>
      </div>
    </Shell>
  );
}

function Shell({ children, onCancel }: { children: React.ReactNode; onCancel: () => void }) {
  return (
    <div className="crop__backdrop" onPointerDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="crop" role="dialog" aria-modal="true" aria-labelledby="crop-title">
        <h2 id="crop-title">חיתוך התמונה</h2>
        {children}
      </div>
    </div>
  );
}
