import { memo } from 'react';

/*
 * A live, top-down pizza that shows the chosen toppings where they go:
 * whole pizza, right half or left half. Pure SVG, no images, ~3 KB.
 * "Right"/"left" are as the customer looks at the screen (SVG is not mirrored by RTL).
 */

export type Placement = 'whole' | 'right' | 'left';
export interface PreviewTopping {
  id: string;
  name: string;
  placement: Placement;
}

type Look = { kind: 'ring' | 'dot' | 'slice' | 'cube' | 'strip' | 'leaf'; fill: string; stroke?: string; size: number };

// What each topping looks like. First match wins.
const LOOKS: [RegExp, Look][] = [
  [/זיתים שחורים/, { kind: 'ring', fill: 'none', stroke: '#2a2220', size: 5 }],
  [/זיתים ירוקים/, { kind: 'ring', fill: 'none', stroke: '#7c8a2c', size: 5 }],
  [/קלמטה/, { kind: 'ring', fill: 'none', stroke: '#4b2a3a', size: 5 }],
  [/זית/, { kind: 'ring', fill: 'none', stroke: '#3b3a2a', size: 5 }],
  [/תירס/, { kind: 'dot', fill: '#f2c230', size: 2.6 }],
  [/פטריות/, { kind: 'slice', fill: '#d8c2a2', stroke: '#a88b66', size: 6 }],
  [/בצל/, { kind: 'ring', fill: 'none', stroke: '#9a4d93', size: 7 }],
  [/שיפקה/, { kind: 'slice', fill: '#b8cc4e', size: 5 }],
  [/חריף|חלפיניו/, { kind: 'ring', fill: 'none', stroke: '#3f8a35', size: 4 }],
  [/גמבה|פלפל/, { kind: 'slice', fill: '#da3b2b', size: 6 }],
  [/מיובשות/, { kind: 'slice', fill: '#8e2a22', size: 5 }],
  [/עגבני/, { kind: 'dot', fill: '#e2503c', size: 5 }],
  [/טונה/, { kind: 'cube', fill: '#c9a27c', size: 4 }],
  [/אנשובי/, { kind: 'strip', fill: '#6d6560', size: 7 }],
  [/פפרוני|סלמי|סלאמי|סלאמה|קבנוס/, { kind: 'dot', fill: '#b5372f', size: 6 }],
  [/בקר/, { kind: 'strip', fill: '#7a4a33', size: 8 }],
  [/בולגרית/, { kind: 'cube', fill: '#fbfaf3', size: 4 }],
  [/צ'דר/, { kind: 'cube', fill: '#f29a2e', size: 4 }],
  [/אקסטרה גבינה/, { kind: 'dot', fill: '#fff1b8', size: 6 }],
  [/חציל/, { kind: 'slice', fill: '#5d3a6b', size: 6 }],
  [/בטטה/, { kind: 'cube', fill: '#ef8a3a', size: 4 }],
  [/ארטישוק/, { kind: 'leaf', fill: '#8fa36a', size: 5 }],
  [/אננס/, { kind: 'cube', fill: '#f7d348', size: 4 }],
  [/שום/, { kind: 'dot', fill: '#f4ecd8', size: 3 }],
];

function lookFor(name: string, id: string): Look {
  for (const [re, look] of LOOKS) if (re.test(name)) return look;
  const hue = hash(id) % 360;
  return { kind: 'dot', fill: `hsl(${hue} 55% 45%)`, size: 4 };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Same topping → same scatter every time (no jumping on re-render). */
function scatter(seed: string, placement: Placement, count: number) {
  let t = hash(seed);
  const rand = () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  const pts: { x: number; y: number; rot: number }[] = [];
  for (let i = 0; i < count; i++) {
    // angle range for the half (0° = right). Keep pieces off the split line.
    const span = placement === 'whole' ? [0, 360] : placement === 'right' ? [-80, 80] : [100, 260];
    const a = ((span[0]! + rand() * (span[1]! - span[0]!)) * Math.PI) / 180;
    const r = 10 + Math.sqrt(rand()) * 56;
    pts.push({ x: 100 + Math.cos(a) * r, y: 100 + Math.sin(a) * r, rot: rand() * 360 });
  }
  return pts;
}

function Piece({ look, x, y, rot, delay }: { look: Look; x: number; y: number; rot: number; delay: number }) {
  const s = look.size * 1.5;
  const style = { animationDelay: `${delay}ms` } as React.CSSProperties;
  const t = `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(0)})`;
  switch (look.kind) {
    case 'ring':
      return <g className="piece" style={style} transform={t}><circle r={s} fill="none" stroke={look.stroke} strokeWidth={s > 5 ? 1.6 : 2.4} /></g>;
    case 'slice':
      return <g className="piece" style={style} transform={t}><path d={`M${-s} 0 A${s} ${s} 0 0 1 ${s} 0 Z`} fill={look.fill} stroke={look.stroke} strokeWidth="0.8" /></g>;
    case 'cube':
      return <g className="piece" style={style} transform={t}><rect x={-s / 2} y={-s / 2} width={s} height={s} rx="1" fill={look.fill} stroke="rgb(0 0 0 / .12)" strokeWidth="0.5" /></g>;
    case 'strip':
      return <g className="piece" style={style} transform={t}><rect x={-s / 2} y={-1.3} width={s} height={2.6} rx="1.3" fill={look.fill} /></g>;
    case 'leaf':
      return <g className="piece" style={style} transform={t}><ellipse rx={s} ry={s / 2.2} fill={look.fill} /></g>;
    default:
      return <g className="piece" style={style} transform={t}><circle r={s / 2} fill={look.fill} /></g>;
  }
}

export const PizzaPreview = memo(function PizzaPreview({ toppings }: { toppings: PreviewTopping[] }) {
  const split = toppings.some((t) => t.placement !== 'whole');
  return (
    <figure className="pizza-preview" aria-label={describe(toppings)}>
      <svg viewBox="0 0 200 200" role="img" aria-hidden="true">
        <defs>
          <radialGradient id="crust" cx="50%" cy="45%" r="55%">
            <stop offset="80%" stopColor="#e7a85b" />
            <stop offset="100%" stopColor="#b8732f" />
          </radialGradient>
          <radialGradient id="cheese" cx="45%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#fff2c2" />
            <stop offset="100%" stopColor="#f5cf73" />
          </radialGradient>
        </defs>
        <circle cx="100" cy="100" r="92" fill="url(#crust)" />
        <circle cx="100" cy="100" r="78" fill="#d9472f" />
        <circle cx="100" cy="100" r="74" fill="url(#cheese)" />
        {/* a few browned cheese spots for texture */}
        {[[70, 64, 5], [128, 80, 4], [92, 132, 6], [136, 128, 4], [62, 110, 4]].map(([x, y, r], i) => (
          <circle key={i} cx={x} cy={y} r={r} fill="#eab35a" opacity=".55" />
        ))}
        {toppings.map((t) => {
          const look = lookFor(t.name, t.id);
          const n = t.placement === 'whole' ? 12 : 7;
          return (
            <g key={`${t.id}-${t.placement}`}>
              {scatter(`${t.id}:${t.placement}`, t.placement, n).map((p, i) => (
                <Piece key={i} look={look} {...p} delay={i * 35} />
              ))}
            </g>
          );
        })}
        <line className={`pizza-split ${split ? 'is-on' : ''}`} x1="100" y1="10" x2="100" y2="190" />
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
