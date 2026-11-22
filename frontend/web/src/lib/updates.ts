/**
 * Picks up a new release without the customer having to do anything.
 * An installed (home-screen) app can stay open in the background for days, so whenever it comes
 * back to the foreground we compare our build with the one the server is serving and reload if
 * it changed. The cart lives in localStorage, so nothing is lost. Never reloads mid-checkout.
 */
const currentBuild = () => document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src') ?? null;

let checking = false;
let lastCheck = 0;

async function check() {
  const mine = currentBuild();
  if (!mine || checking || Date.now() - lastCheck < 60_000) return;
  checking = true;
  lastCheck = Date.now();
  try {
    const html = await (await fetch('/', { cache: 'no-store' })).text();
    const latest = /<script[^>]+type="module"[^>]+src="([^"]*\/assets\/[^"]+)"/.exec(html)?.[1] ?? null;
    const busy = location.pathname.startsWith('/checkout') || document.querySelector('dialog[open]');
    if (latest && latest !== mine && !busy) location.reload();
  } catch {
    /* offline — try again next time */
  } finally {
    checking = false;
  }
}

export function watchForUpdates() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
  window.addEventListener('focus', () => void check());
  setInterval(() => void check(), 30 * 60_000);
}
