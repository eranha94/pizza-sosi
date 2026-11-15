import { memo, useMemo } from 'react';

/*
 * A live, top-down pizza that shows the chosen toppings where they go
 * (whole pizza, right half or left half). Everything is vector – no photos – so it stays
 * sharp and light. Each topping is drawn to look like the real thing and "dropped" onto the
 * pizza like a chef scattering it. Dough thickness and cheese choice change the pizza itself.
 * "Right"/"left" are as the customer looks at the screen (SVG is not mirrored by RTL).
 */

export type Placement = 'whole' | 'right' | 'left';
export interface PreviewTopping {
  id: string;
  name: string;
  placement: Placement;
}
export type Dough = 'thin' | 'standard' | 'thick';

const C = 100; // centre

// ---------- deterministic randomness (same pizza every render) ----------
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rng(seed: string) {
  let t = hash(seed);
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** A hand-made looking circle: radius wobbles a little. */
function wobblyCircle(r: number, seed: string, amount: number, points = 28) {
  const rand = rng(seed);
  const pts = Array.from({ length: points }, (_, i) => {
    const a = (i / points) * Math.PI * 2;
    const rr = r + (rand() - 0.5) * amount;
    return [C + Math.cos(a) * rr, C + Math.sin(a) * rr] as const;
  });
  const mid = (p: readonly [number, number], q: readonly [number, number]) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  let d = `M${mid(pts[points - 1]!, pts[0]!).map((n) => n.toFixed(1)).join(' ')}`;
  for (let i = 0; i < points; i++) {
    const p = pts[i]!;
    const m = mid(p, pts[(i + 1) % points]!);
    d += ` Q${p[0].toFixed(1)} ${p[1].toFixed(1)} ${m[0]!.toFixed(1)} ${m[1]!.toFixed(1)}`;
  }
  return d + 'Z';
}

/** Spread pieces evenly but naturally over the area, avoiding piles. */
function scatter(seed: string, placement: Placement, count: number, radius: number, minGap: number) {
  const rand = rng(seed);
  const span = placement === 'whole' ? [0, 360] : placement === 'right' ? [-82, 82] : [98, 262];
  const pts: { x: number; y: number; rot: number; dx: number; spin: number }[] = [];
  let tries = 0;
  while (pts.length < count && tries < count * 40) {
    tries++;
    const a = ((span[0]! + rand() * (span[1]! - span[0]!)) * Math.PI) / 180;
    const r = 6 + Math.sqrt(rand()) * (radius - 6);
    const x = C + Math.cos(a) * r;
    const y = C + Math.sin(a) * r;
    if (placement !== 'whole' && Math.abs(x - C) < 4) continue; // keep the halves clean
    if (pts.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < minGap * minGap)) continue;
    pts.push({ x, y, rot: rand() * 360, dx: (rand() - 0.5) * 40, spin: (rand() - 0.5) * 120 });
  }
  return pts;
}

// ---------- toppings, drawn around (0,0) ----------
type Kind =
  | 'blackOlive' | 'greenOlive' | 'kalamata' | 'corn' | 'mushroom' | 'redOnion' | 'bellPepper' | 'shipka'
  | 'hotPepper' | 'tomato' | 'driedTomato' | 'tuna' | 'anchovy' | 'pepperoni' | 'kabanos' | 'beef'
  | 'bulgarian' | 'cheddar' | 'extraCheese' | 'eggplant' | 'sweetPotato' | 'artichoke' | 'pineapple' | 'garlic' | 'generic';

const KINDS: [RegExp, Kind, number /* pieces on whole */][] = [
  [/זיתים שחורים/, 'blackOlive', 14],
  [/זיתים ירוקים/, 'greenOlive', 13],
  [/קלמטה/, 'kalamata', 12],
  [/תירס/, 'corn', 22],
  [/פטריות/, 'mushroom', 11],
  [/בצל/, 'redOnion', 9],
  [/שיפקה/, 'shipka', 12],
  [/חריף|חלפיניו/, 'hotPepper', 14],
  [/גמבה|פלפל/, 'bellPepper', 11],
  [/מיובשות/, 'driedTomato', 10],
  [/עגבני/, 'tomato', 8],
  [/טונה/, 'tuna', 12],
  [/אנשובי/, 'anchovy', 9],
  [/קבנוס/, 'kabanos', 13],
  [/פפרוני|סלמי|סלאמי|סלאמה/, 'pepperoni', 10],
  [/בקר/, 'beef', 12],
  [/בולגרית/, 'bulgarian', 14],
  [/צ'דר/, 'cheddar', 18],
  [/אקסטרה גבינה/, 'extraCheese', 9],
  [/חציל/, 'eggplant', 9],
  [/בטטה/, 'sweetPotato', 14],
  [/ארטישוק/, 'artichoke', 10],
  [/אננס/, 'pineapple', 12],
  [/שום/, 'garlic', 12],
];

function kindOf(name: string): { kind: Kind; count: number } {
  for (const [re, kind, count] of KINDS) if (re.test(name)) return { kind, count };
  return { kind: 'generic', count: 12 };
}

function ToppingShape({ kind, seed, hue }: { kind: Kind; seed: string; hue: number }) {
  const r = rng(seed);
  switch (kind) {
    case 'blackOlive':
    case 'kalamata': {
      const id = kind === 'blackOlive' ? 'g-olive-black' : 'g-olive-kal';
      return (
        <g>
          <circle r="5" fill={`url(#${id})`} />
          <ellipse rx="2" ry="1.7" fill="#e9b75b" />
          <path d="M-3.2 -2.6 A4.3 4.3 0 0 1 1.5 -4" stroke="#fff" strokeOpacity=".45" strokeWidth=".8" fill="none" strokeLinecap="round" />
        </g>
      );
    }
    case 'greenOlive':
      return (
        <g>
          <circle r="5.2" fill="url(#g-olive-green)" />
          <circle r="2.1" fill="#c44a2c" />
          <path d="M-3.4 -2.4 A4.4 4.4 0 0 1 1 -4.2" stroke="#fff" strokeOpacity=".4" strokeWidth=".8" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'corn':
      return (
        <g>
          {[[0, 0], [3.2, 0.6], [1.4, 2.9]].slice(0, 1 + Math.floor(r() * 3)).map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <rect x="-1.6" y="-1.9" width="3.2" height="3.8" rx="1.3" fill="url(#g-corn)" />
              <ellipse cx="-0.5" cy="-0.8" rx=".6" ry=".9" fill="#fff8d0" opacity=".7" />
            </g>
          ))}
        </g>
      );
    case 'mushroom':
      return (
        <g>
          <path d="M-6.5 0.6 Q-6.8 -6.2 0 -6.4 Q6.8 -6.2 6.5 0.6 Q4 1.3 2.4 0.9 L2.6 5.4 Q0 6.6 -2.6 5.4 L-2.4 0.9 Q-4 1.3 -6.5 0.6Z" fill="url(#g-mushroom)" stroke="#a98b62" strokeWidth=".6" />
          <path d="M-4.5 -0.6 Q0 -2.6 4.5 -0.6" stroke="#b79a73" strokeWidth=".5" fill="none" />
          <path d="M-5.6 -2.4 Q0 -5.8 5.6 -2.4" stroke="#fff" strokeOpacity=".35" strokeWidth=".7" fill="none" />
        </g>
      );
    case 'redOnion': {
      const sweep = 150 + r() * 200; // many onion pieces are partial rings
      const arc = (rad: number) => {
        const a = (sweep * Math.PI) / 180;
        return `M${rad} 0 A${rad} ${rad} 0 ${sweep > 180 ? 1 : 0} 1 ${(Math.cos(a) * rad).toFixed(2)} ${(Math.sin(a) * rad).toFixed(2)}`;
      };
      return (
        <g fill="none" strokeLinecap="round">
          <path d={arc(8)} stroke="#7e2f78" strokeWidth="1.9" />
          <path d={arc(8)} stroke="#e7c3e2" strokeWidth=".6" strokeOpacity=".8" />
          <path d={arc(6.1)} stroke="#a14e9b" strokeWidth="1.1" strokeOpacity=".85" />
        </g>
      );
    }
    case 'bellPepper':
      return (
        <g strokeLinecap="round" fill="none">
          <path d="M-7.5 2 Q-1 -5 7.5 1.5" stroke="#b81e14" strokeWidth="3.4" />
          <path d="M-7.5 2 Q-1 -5 7.5 1.5" stroke="url(#g-pepper)" strokeWidth="2.6" />
          <path d="M-5.5 -0.2 Q-1 -4 4.5 -1.4" stroke="#ffb3a6" strokeWidth=".6" strokeOpacity=".8" />
        </g>
      );
    case 'shipka':
      return (
        <g fill="none">
          <circle r="4.4" stroke="#a7bd3e" strokeWidth="1.9" />
          <circle r="4.4" stroke="#e5f09a" strokeWidth=".5" strokeOpacity=".8" />
          <circle cx="0.8" cy="0.6" r=".55" fill="#f5efc4" />
          <circle cx="-1" cy="0.2" r=".55" fill="#f5efc4" />
        </g>
      );
    case 'hotPepper':
      return (
        <g>
          <circle r="3.6" fill="#2f7a2a" />
          <circle r="2.5" fill="#cfe2a6" />
          {[[0.7, 0.4], [-0.8, 0.6], [0, -0.9]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r=".42" fill="#fff6c9" />)}
        </g>
      );
    case 'tomato':
      return (
        <g>
          <circle r="7" fill="#d4321f" />
          <circle r="5.9" fill="url(#g-tomato)" />
          {[0, 90, 180, 270].map((a) => (
            <ellipse key={a} rx="1.2" ry="2" transform={`rotate(${a + 45}) translate(0 -3.1)`} fill="#ffb27a" opacity=".75" />
          ))}
          <circle r="1.2" fill="#f28a6b" />
        </g>
      );
    case 'driedTomato':
      return (
        <g>
          <path d="M-5 -1.5 Q-3 -5 1 -4 Q5.5 -3.5 5 0.5 Q4.5 4 0 4 Q-5.5 3.5 -5 -1.5Z" fill="#7a1d14" />
          <path d="M-3 -1 Q0 -2.5 3 -0.5 M-2.5 1.5 Q0.5 0.5 3 2" stroke="#4d0f0a" strokeWidth=".7" fill="none" />
        </g>
      );
    case 'tuna':
      return (
        <g>
          <path d="M-4 -2 Q-1 -4.2 2.5 -2.6 Q5 -1 3.6 1.6 Q1 3.8 -2.2 2.8 Q-5 1.2 -4 -2Z" fill="#d7ad8b" />
          <path d="M-2.6 -1.4 L2.4 -0.4 M-2.4 0.8 L2 1.4" stroke="#a97f5f" strokeWidth=".5" />
        </g>
      );
    case 'anchovy':
      return (
        <g>
          <path d="M-8 0 Q-4 -1.8 0 -1.4 Q5 -1.2 8 0 Q5 1.3 0 1.4 Q-4 1.6 -8 0Z" fill="url(#g-anchovy)" />
          <path d="M-6.5 -0.2 L6.5 -0.2" stroke="#e9e3dc" strokeWidth=".35" />
        </g>
      );
    case 'pepperoni':
      return (
        <g>
          <circle r="7.2" fill="url(#g-pepperoni)" />
          <circle r="7.2" fill="none" stroke="#6e1a14" strokeWidth=".9" strokeOpacity=".7" />
          {Array.from({ length: 6 }, (_, i) => (
            <circle key={i} cx={((r() - 0.5) * 9).toFixed(1)} cy={((r() - 0.5) * 9).toFixed(1)} r={(0.4 + r() * 0.5).toFixed(2)} fill="#f2b7a3" opacity=".85" />
          ))}
          <ellipse cx="-2.6" cy="-2.8" rx="2.4" ry="1.2" fill="#fff" opacity=".18" transform="rotate(-30)" />
        </g>
      );
    case 'kabanos':
      return (
        <g>
          <circle r="4" fill="#8c2a1f" />
          <circle r="3.1" fill="#b4473a" />
          {[[0.8, 0.4], [-0.9, -0.5], [0.2, -1.2]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r=".45" fill="#f0c0aa" />)}
        </g>
      );
    case 'beef':
      return (
        <g fill="none" strokeLinecap="round">
          <path d="M-6 1 Q-3 -2 0 0 Q3 2 6 -1" stroke="#5e3220" strokeWidth="2.2" />
          <path d="M-5 0.4 Q-2.5 -1.8 0 -0.3" stroke="#8c5236" strokeWidth=".8" />
        </g>
      );
    case 'bulgarian':
      return (
        <path d="M-3 -2.6 L1.6 -3.2 L3.4 -0.4 L2.4 2.8 L-1.8 3 L-3.6 0.4Z" fill="#fbfaf5" stroke="#e2ddcc" strokeWidth=".5" />
      );
    case 'cheddar':
      return (
        <g strokeLinecap="round">
          <path d="M-4 0.5 Q0 -1.5 4 0" stroke="#e8861f" strokeWidth="1.6" fill="none" />
          <path d="M-3 0 Q0 -1.4 3 -0.4" stroke="#ffc173" strokeWidth=".5" fill="none" />
        </g>
      );
    case 'extraCheese':
      return <path d={`M-8 0 Q-7 -6 0 -6.5 Q7 -6 8 -0.5 Q7 6 0 6.2 Q-7.5 6 -8 0Z`} fill="#fff4c9" opacity=".92" />;
    case 'eggplant':
      return (
        <g>
          <circle r="6.6" fill="#3f1f4d" />
          <circle r="5.5" fill="url(#g-eggplant)" />
          {[[1.5, 1], [-1.6, 0.8], [0.2, -1.8], [-0.4, 2.2]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r=".45" fill="#8a6a3c" />)}
        </g>
      );
    case 'sweetPotato':
      return <rect x="-2.4" y="-2.4" width="4.8" height="4.8" rx="1" fill="url(#g-sweetpotato)" stroke="#b9601c" strokeWidth=".5" />;
    case 'artichoke':
      return (
        <g>
          <path d="M0 -6 Q5 -2 3.6 4.5 Q0 6 -3.6 4.5 Q-5 -2 0 -6Z" fill="#9db27a" stroke="#6e8350" strokeWidth=".6" />
          <path d="M0 -4.6 L0 4.4 M-2 -1.5 Q0 0 2 -1.5 M-2.4 1.6 Q0 3 2.4 1.6" stroke="#6e8350" strokeWidth=".5" fill="none" />
        </g>
      );
    case 'pineapple':
      return (
        <g>
          <path d="M-4.5 3 L0 -4.5 L4.5 3Z" fill="#f6cf3e" stroke="#d9a91c" strokeWidth=".7" strokeLinejoin="round" />
          <path d="M-2 1.6 L0 -1.8 L2 1.6" stroke="#fff3a6" strokeWidth=".5" fill="none" />
        </g>
      );
    case 'garlic':
      return (
        <g>
          <path d="M0 -3.6 Q3 -1.5 2.4 1.6 Q1.4 3.4 0 3.5 Q-1.4 3.4 -2.4 1.6 Q-3 -1.5 0 -3.6Z" fill="#f2dfae" stroke="#c8a052" strokeWidth=".6" />
          <path d="M-1 -1.4 Q0 -2.2 1 -1.4" stroke="#fff" strokeOpacity=".6" strokeWidth=".5" fill="none" />
        </g>
      );
    default:
      return <circle r="3" fill={`hsl(${hue} 50% 45%)`} />;
  }
}

const SIZE: Partial<Record<Kind, number>> = {
  redOnion: 13, pepperoni: 12, tomato: 12, extraCheese: 13, mushroom: 11, eggplant: 11, bellPepper: 11,
  anchovy: 9, artichoke: 9, beef: 9, blackOlive: 9, greenOlive: 9, kalamata: 9, driedTomato: 9,
};

export type Cheese = 'house' | 'mozzarella' | 'hardMix';
/** Cheese tones: house = golden, mozzarella = milky white, hard-cheese mix = deeper amber, more baked. */
const CHEESE_COLORS: Record<Cheese, [string, string, string]> = {
  house: ['#ffeeb0', '#f6cc69', '#e6a540'],
  mozzarella: ['#fffaf0', '#fbe9bd', '#ecc982'],
  hardMix: ['#ffe39a', '#efb54e', '#d68a2a'],
};

// ---------- the pizza ----------
export const PizzaPreview = memo(function PizzaPreview({
  toppings,
  dough = 'standard',
  cheese = 'house',
}: {
  toppings: PreviewTopping[];
  dough?: Dough;
  cheese?: Cheese;
}) {
  const cheeseColors = CHEESE_COLORS[cheese];
  const crustWidth = dough === 'thin' ? 7 : dough === 'thick' ? 17 : 12;
  const outer = 94;
  const sauceR = outer - crustWidth;
  const cheeseR = sauceR - 3;

  const base = useMemo(
    () => ({
      crust: wobblyCircle(outer, 'crust', 3.2, 36),
      sauce: wobblyCircle(sauceR, `sauce-${dough}`, 3.5, 30),
      cheese: wobblyCircle(cheeseR, `cheese-${dough}`, 9, 22),
      bubbles: Array.from({ length: dough === 'thin' ? 6 : 12 }, (_, i) => {
        const rand = rng(`bubble-${i}-${dough}`);
        const a = rand() * Math.PI * 2;
        const rr = outer - crustWidth / 2 + (rand() - 0.5) * (crustWidth * 0.5);
        return { x: C + Math.cos(a) * rr, y: C + Math.sin(a) * rr, rx: 2 + rand() * (crustWidth / 4), ry: 1.2 + rand() * 1.6, rot: (a * 180) / Math.PI + 90, dark: rand() > 0.55 };
      }),
      // baked look: soft golden patches + a few small dark "leopard" spots, more towards the edge
      browned: Array.from({ length: cheese === 'hardMix' ? 44 : cheese === 'mozzarella' ? 34 : 26 }, (_, i) => {
        const rand = rng(`brown-${i}-${cheese}`);
        const a = rand() * Math.PI * 2;
        const rr = Math.pow(rand(), 0.6) * (cheeseR - 4);
        const leopard = rand() > 0.72;
        return {
          x: C + Math.cos(a) * rr,
          y: C + Math.sin(a) * rr,
          r: leopard ? 0.8 + rand() * 1.6 : 2.5 + rand() * 5,
          o: leopard ? 0.45 + rand() * 0.3 : 0.18 + rand() * 0.3,
          fill: leopard ? '#8a4a14' : '#d79437',
        };
      }),
      // little pools of oil that make it look hot and fresh
      oil: Array.from({ length: 7 }, (_, i) => {
        const rand = rng(`oil-${i}`);
        const a = rand() * Math.PI * 2;
        const rr = Math.sqrt(rand()) * (cheeseR - 14);
        return { x: C + Math.cos(a) * rr, y: C + Math.sin(a) * rr, r: 1.5 + rand() * 2.5 };
      }),
    }),
    [dough, cheese, sauceR, cheeseR, crustWidth],
  );

  const split = toppings.some((t) => t.placement !== 'whole');

  return (
    <figure className="pizza-preview" aria-label={describe(toppings)}>
      <svg viewBox="0 0 200 200" role="img" aria-hidden="true">
        <defs>
          <radialGradient id="g-crust" cx="50%" cy="46%" r="52%">
            <stop offset={`${((outer - crustWidth) / outer) * 100 - 4}%`} stopColor="#f0b866" />
            <stop offset="92%" stopColor="#d48a3c" />
            <stop offset="100%" stopColor="#a7621f" />
          </radialGradient>
          <radialGradient id="g-sauce" cx="50%" cy="50%" r="50%">
            <stop offset="88%" stopColor="#c8341f" />
            <stop offset="100%" stopColor="#9c2412" />
          </radialGradient>
          <radialGradient id="g-cheese" cx="42%" cy="38%" r="65%">
            <stop offset="0%" stopColor={cheeseColors[0]} />
            <stop offset="65%" stopColor={cheeseColors[1]} />
            <stop offset="100%" stopColor={cheeseColors[2]} />
          </radialGradient>
          <radialGradient id="g-olive-black" cx="35%" cy="30%"><stop offset="0%" stopColor="#5a4d48" /><stop offset="100%" stopColor="#141010" /></radialGradient>
          <radialGradient id="g-olive-kal" cx="35%" cy="30%"><stop offset="0%" stopColor="#7d4c64" /><stop offset="100%" stopColor="#2e1424" /></radialGradient>
          <radialGradient id="g-olive-green" cx="35%" cy="30%"><stop offset="0%" stopColor="#b9c45a" /><stop offset="100%" stopColor="#5f6d1c" /></radialGradient>
          <radialGradient id="g-corn" cx="35%" cy="30%"><stop offset="0%" stopColor="#ffe27a" /><stop offset="100%" stopColor="#e7a51c" /></radialGradient>
          <radialGradient id="g-mushroom" cx="40%" cy="30%"><stop offset="0%" stopColor="#f3e5cc" /><stop offset="100%" stopColor="#cdb38c" /></radialGradient>
          <linearGradient id="g-pepper" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ff5a43" /><stop offset="100%" stopColor="#d42b1c" /></linearGradient>
          <radialGradient id="g-tomato" cx="45%" cy="40%"><stop offset="0%" stopColor="#ff7a5c" /><stop offset="100%" stopColor="#e2432c" /></radialGradient>
          <linearGradient id="g-anchovy" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#a9a19a" /><stop offset="60%" stopColor="#6e655e" /><stop offset="100%" stopColor="#4c443e" /></linearGradient>
          <radialGradient id="g-pepperoni" cx="40%" cy="35%"><stop offset="0%" stopColor="#d9503f" /><stop offset="75%" stopColor="#b3362a" /><stop offset="100%" stopColor="#83211a" /></radialGradient>
          <radialGradient id="g-eggplant" cx="45%" cy="40%"><stop offset="0%" stopColor="#f4e7c8" /><stop offset="100%" stopColor="#d9c08e" /></radialGradient>
          <linearGradient id="g-sweetpotato" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#ffab5c" /><stop offset="100%" stopColor="#e2771f" /></linearGradient>
          <filter id="f-grain" x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="7" />
            <feColorMatrix values="0 0 0 0 .45  0 0 0 0 .25  0 0 0 0 .05  0 0 0 .18 0" />
            <feComposite in2="SourceGraphic" operator="in" />
          </filter>
          <filter id="f-shadow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx=".5" dy=".9" stdDeviation=".7" floodColor="#5a2a00" floodOpacity=".35" />
          </filter>
        </defs>

        {/* plate shadow + dough */}
        <ellipse cx={C} cy={C + 4} rx="93" ry="91" fill="#3b2412" opacity=".18" />
        <path d={base.crust} fill="url(#g-crust)" />
        <path d={base.crust} fill="#fff" filter="url(#f-grain)" />
        {base.bubbles.map((b, i) => (
          <ellipse key={i} cx={b.x} cy={b.y} rx={b.rx} ry={b.ry} transform={`rotate(${b.rot.toFixed(0)} ${b.x.toFixed(1)} ${b.y.toFixed(1)})`} fill={b.dark ? '#9a561b' : '#f7cf8a'} opacity={b.dark ? 0.55 : 0.7} />
        ))}
        {/* sauce, then melted cheese with browned spots */}
        <path d={base.sauce} fill="url(#g-sauce)" />
        <path className="pizza-cheese" d={base.cheese} fill="url(#g-cheese)" />
        <path d={base.cheese} fill="#fff" filter="url(#f-grain)" opacity=".7" />
        {base.browned.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill={s.fill} opacity={s.o} />
        ))}
        {base.oil.map((o, i) => (
          <g key={i} opacity=".55">
            <circle cx={o.x} cy={o.y} r={o.r} fill="#f0a23a" opacity=".5" />
            <circle cx={o.x - o.r * 0.3} cy={o.y - o.r * 0.3} r={o.r * 0.35} fill="#fff" opacity=".7" />
          </g>
        ))}
        <ellipse cx={C - 22} cy={C - 26} rx="26" ry="14" fill="#fff" opacity=".12" transform={`rotate(-30 ${C - 22} ${C - 26})`} />

        {/* toppings, "dropped" by the chef */}
        <g filter="url(#f-shadow)">
          {toppings.map((t) => {
            const { kind, count } = kindOf(t.name);
            const n = t.placement === 'whole' ? count : Math.ceil(count * 0.55);
            const gap = SIZE[kind] ?? 7;
            const hue = hash(t.id) % 360;
            return (
              <g key={`${t.id}-${t.placement}`}>
                {scatter(`${t.id}:${t.placement}`, t.placement, n, cheeseR - 6, gap).map((p, i) => (
                  <g key={i} transform={`translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.rot.toFixed(0)})`}>
                    <g
                      className="chef-drop"
                      style={{ animationDelay: `${i * 45}ms`, '--dx': `${p.dx.toFixed(0)}px`, '--spin': `${p.spin.toFixed(0)}deg` } as React.CSSProperties}
                    >
                      <ToppingShape kind={kind} seed={`${t.id}-${i}`} hue={hue} />
                    </g>
                  </g>
                ))}
              </g>
            );
          })}
        </g>

        <line className={`pizza-split ${split ? 'is-on' : ''}`} x1={C} y1="8" x2={C} y2="192" />
      </svg>
      {split && (
        <figcaption className="pizza-preview__sides" aria-hidden="true" dir="ltr">
          <span>שמאל</span>
          <span>ימין</span>
        </figcaption>
      )}
    </figure>
  );
});

function describe(toppings: PreviewTopping[]) {
  if (toppings.length === 0) return 'פיצה בלי תוספות';
  const where = { whole: 'על כל הפיצה', right: 'בחצי הימני', left: 'בחצי השמאלי' };
  return 'תצוגת הפיצה: ' + toppings.map((t) => `${t.name} ${where[t.placement]}`).join(', ');
}
