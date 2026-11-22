/* Small, dependency-free motion helpers. Everything here does nothing for people who asked their
 * device to reduce motion – the action still happens, only the decoration is skipped. */

export const reduceMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Where the cart is on screen right now: the bottom bar on the menu, otherwise the header button. */
function cartTarget(): HTMLElement | null {
  for (const sel of ['.cart-bar', '.cart-button']) {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.bottom > 0 && r.top < innerHeight) return el;
  }
  return null;
}

/**
 * A little picture of the dish flies in an arc from `from` into the cart.
 * `visual` is what flies: a picture of the dish, a copy of the pizza drawing, or a pizza emoji.
 * Resolves when it lands (immediately when motion is reduced or there is nowhere to fly).
 */
export function flyToCart(from: DOMRect, visual?: HTMLElement | null): Promise<void> {
  const target = cartTarget();
  if (reduceMotion() || !target || typeof document.body.animate !== 'function') return Promise.resolve();
  const to = target.getBoundingClientRect();
  const size = 64;
  const x0 = from.left + from.width / 2 - size / 2;
  const y0 = from.top + from.height / 2 - size / 2;
  const dx = to.left + to.width / 2 - size / 2 - x0;
  const dy = to.top + to.height / 2 - size / 2 - y0;

  // Two nested boxes: the outer moves sideways steadily, the inner up-then-down – together an arc.
  const outer = document.createElement('div');
  outer.className = 'fly-ghost';
  outer.setAttribute('aria-hidden', 'true');
  outer.style.cssText = `left:${x0}px;top:${y0}px;width:${size}px;height:${size}px`;
  const inner = document.createElement('div');
  inner.className = 'fly-ghost__inner';
  if (visual) inner.append(visual);
  else inner.textContent = '🍕';
  outer.append(inner);
  document.body.append(outer);

  const duration = 1200;
  const lift = Math.min(160, Math.max(70, Math.abs(dy) * 0.35));
  outer.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${dx}px)` }], { duration, easing: 'cubic-bezier(.45,.05,.55,.95)', fill: 'forwards' });
  const flight = inner.animate(
    [
      { transform: 'translateY(0) scale(1) rotate(0deg)', opacity: 1, offset: 0 },
      { transform: `translateY(${Math.min(0, dy) - lift}px) scale(.85) rotate(-25deg)`, opacity: 1, offset: 0.4 },
      { transform: `translateY(${dy}px) scale(.28) rotate(20deg)`, opacity: 0.9, offset: 1 },
    ],
    { duration, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'forwards' },
  );
  return flight.finished.then(
    () => outer.remove(),
    () => outer.remove(),
  );
}

/** A picture to fly: an <img> copied from the page, or a copy of the pizza drawing. */
export function flyVisual(from: Element | null): HTMLElement | null {
  if (!from) return null;
  if (from instanceof HTMLImageElement && from.currentSrc) {
    const img = document.createElement('img');
    img.src = from.currentSrc;
    img.alt = '';
    return img;
  }
  if (from instanceof SVGSVGElement) {
    const svg = from.cloneNode(true) as SVGSVGElement;
    // The copy keeps its gradient ids: the original drawing closes with the dialog, so these take over.
    svg.querySelectorAll('.chef-drop').forEach((n) => n.classList.remove('chef-drop'));
    return svg as unknown as HTMLElement;
  }
  return null;
}
