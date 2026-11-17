import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = 'pizza-sosi-kitchen';

/**
 * Kitchen mode for a tablet next to the oven: full screen, screen never sleeps (Wake Lock),
 * big cards and buttons, louder alerts. Remembered on the device.
 */
export function useKitchenMode() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(KEY) === 'on';
    } catch {
      return false;
    }
  });
  const lock = useRef<WakeLockSentinel | null>(null);

  const acquire = useCallback(async () => {
    try {
      if ('wakeLock' in navigator && document.visibilityState === 'visible') lock.current = await navigator.wakeLock.request('screen');
    } catch {
      /* not supported / battery saver – the rest still works */
    }
  }, []);

  useEffect(() => {
    document.body.classList.toggle('kitchen', on);
    try {
      localStorage.setItem(KEY, on ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    if (!on) {
      void lock.current?.release();
      lock.current = null;
      return;
    }
    void acquire();
    // The browser drops the lock when the tab is hidden; take it again when we're back.
    const onVisible = () => document.visibilityState === 'visible' && void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [on, acquire]);

  const toggle = useCallback(async () => {
    const next = !on;
    setOn(next);
    try {
      if (next && !document.fullscreenElement) await document.documentElement.requestFullscreen();
      if (!next && document.fullscreenElement) await document.exitFullscreen();
    } catch {
      /* fullscreen not allowed (e.g. iPhone) – kitchen styling still applies */
    }
  }, [on]);

  return { on, toggle };
}
