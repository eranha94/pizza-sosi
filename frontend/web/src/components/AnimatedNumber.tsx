import { useEffect, useRef, useState } from 'react';
import { reduceMotion } from '../lib/motion';

/** A number that rolls to its new value (e.g. a total going from ₪55 to ₪65) instead of jumping. */
export function AnimatedNumber({ value, format, duration = 450 }: { value: number; format: (n: number) => string; duration?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    if (start === value || reduceMotion()) {
      from.current = value;
      setShown(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      const n = Math.round(start + (value - start) * eased);
      from.current = n;
      setShown(n);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span className="tabular">{format(shown)}</span>;
}
