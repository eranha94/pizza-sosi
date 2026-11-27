import { photoUrl } from './image';
import { bucket } from './firebase';

/**
 * Deal picture drawn on a canvas: the dishes on a round tray, a tilted price sticker, the title and
 * "instead of" price. Same look as the deal card on the site, for downloading (Instagram, WhatsApp
 * status, the screen in the pizzeria). Square 1080×1080 or story 1080×1920.
 */

export type DealTheme = 'red' | 'yellow' | 'green' | 'dark';
export interface DealArtInput {
  title: string;
  itemsText: string;
  description: string;
  priceAgorot: number;
  regularAgorot: number;
  theme: DealTheme;
  photos: { path: string | null; quantity: number; name: string }[];
}

const THEMES: Record<DealTheme, { bg: string; ink: string; soft: string; stickerBg: string; stickerInk: string; tray: string }> = {
  red: { bg: '#c8102e', ink: '#ffffff', soft: 'rgba(255,255,255,.85)', stickerBg: '#feb800', stickerInk: '#1e1a1b', tray: 'rgba(255,255,255,.14)' },
  yellow: { bg: '#feb800', ink: '#1e1a1b', soft: 'rgba(30,26,27,.78)', stickerBg: '#1e1a1b', stickerInk: '#feb800', tray: 'rgba(255,255,255,.38)' },
  green: { bg: '#1f7a3f', ink: '#ffffff', soft: 'rgba(255,255,255,.85)', stickerBg: '#feb800', stickerInk: '#1e1a1b', tray: 'rgba(255,255,255,.14)' },
  dark: { bg: '#1e1a1b', ink: '#ffffff', soft: 'rgba(255,255,255,.8)', stickerBg: '#feb800', stickerInk: '#1e1a1b', tray: 'rgba(255,255,255,.1)' },
};

/** Circles for 1–4 dishes, in tray units (0..1): [cx, cy, r]. Mirrors the site's placements. */
const PLACES: [number, number, number][][] = [
  [[0.5, 0.5, 0.38]],
  [[0.6, 0.42, 0.34], [0.29, 0.71, 0.23]],
  [[0.57, 0.37, 0.31], [0.23, 0.73, 0.19], [0.53, 0.81, 0.17]],
  [[0.6, 0.32, 0.28], [0.2, 0.48, 0.18], [0.7, 0.82, 0.16], [0.4, 0.8, 0.14]],
];

const cache = new Map<string, Promise<ImageBitmap | null>>();
/** Photos are fetched as blobs (not <img>), so the canvas stays exportable. */
function loadPhoto(path: string | null): Promise<ImageBitmap | null> {
  if (!path) return Promise.resolve(null);
  if (!cache.has(path)) {
    const url = photoUrl(bucket, path, 640)!;
    const p = fetch(url)
      .then((r) => (r.ok ? r.blob() : fetch(photoUrl(bucket, path)!).then((r2) => r2.blob())))
      .then((b) => createImageBitmap(b))
      .catch(() => null);
    cache.set(path, p);
  }
  return cache.get(path)!;
}

const shekels = (a: number) => (a % 100 === 0 ? String(a / 100) : (a / 100).toFixed(2));
const FONT = '"Rubik Variable", Rubik, system-ui, sans-serif';

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/\s+\S*$/, '')}…`;
    return kept;
  }
  return lines;
}

export async function drawDeal(canvas: HTMLCanvasElement, input: DealArtInput, format: 'square' | 'story' = 'square') {
  const W = 1080;
  const H = format === 'story' ? 1920 : 1080;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const t = THEMES[input.theme];
  await Promise.all([document.fonts?.load(`900 80px ${FONT}`), document.fonts?.load(`600 40px ${FONT}`)].map((p) => p?.catch(() => null)));
  const photos = await Promise.all(input.photos.slice(0, 4).map((p) => loadPhoto(p.path)));

  // background with a soft dark corner
  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(0, H, 0, 0, H, W * 1.1);
  g.addColorStop(0, 'rgba(0,0,0,.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // tray with the dishes
  const tray = format === 'story' ? { x: 90, y: 260, s: 900 } : { x: 10, y: 170, s: 700 };
  ctx.fillStyle = t.tray;
  ctx.beginPath();
  ctx.arc(tray.x + tray.s / 2, tray.y + tray.s / 2, tray.s * 0.44, 0, Math.PI * 2);
  ctx.fill();
  const places = PLACES[Math.max(0, photos.length - 1)] ?? PLACES[0]!;
  photos.forEach((img, i) => {
    const [cx, cy, r] = places[i]!;
    const x = tray.x + cx * tray.s;
    const y = tray.y + cy * tray.s;
    const rad = r * tray.s;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 12;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(x, y, rad + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.clip();
    if (img) {
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, x - rad, y - rad, rad * 2, rad * 2);
    } else {
      ctx.fillStyle = '#fff4d1';
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      ctx.fillStyle = '#1e1a1b';
      ctx.font = `800 ${Math.round(rad * 0.7)}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(input.photos[i]!.name.slice(0, 1), x, y);
    }
    ctx.restore();
    const q = input.photos[i]!.quantity;
    if (q > 1) {
      const bx = x - rad * 0.72;
      const by = y + rad * 0.72;
      ctx.fillStyle = '#1e1a1b';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(bx, by, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `800 38px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`×${q}`, bx, by + 2);
    }
  });

  // price sticker, tilted, on the tray's corner
  const sr = format === 'story' ? 170 : 125;
  const sx = format === 'story' ? 230 : tray.x + 120;
  const sy = format === 'story' ? 300 : tray.y + 100;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate((-12 * Math.PI) / 180);
  ctx.shadowColor = 'rgba(0,0,0,.35)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = t.stickerBg;
  ctx.beginPath();
  ctx.arc(0, 0, sr, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(0, 0, sr - 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = t.stickerInk;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(sr * 0.24)}px ${FONT}`;
  ctx.fillText('רק', 0, -sr * 0.5);
  ctx.font = `900 ${Math.round(sr * (shekels(input.priceAgorot).length > 3 ? 0.62 : 0.78))}px ${FONT}`;
  ctx.fillText(shekels(input.priceAgorot), 0, sr * 0.02);
  ctx.font = `800 ${Math.round(sr * 0.3)}px ${FONT}`;
  ctx.fillText('₪', 0, sr * 0.55);
  ctx.restore();

  // text block (right side for square, bottom for story)
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  const tx = format === 'story' ? W - 90 : W - 56;
  const maxW = format === 'story' ? W - 180 : 370;
  let y = format === 'story' ? 1300 : 360;
  ctx.fillStyle = t.ink;
  ctx.font = `900 ${format === 'story' ? 96 : 66}px ${FONT}`;
  for (const l of wrap(ctx, input.title, maxW, 3)) {
    ctx.fillText(l, tx, y);
    y += format === 'story' ? 104 : 74;
  }
  y += 10;
  ctx.fillStyle = t.soft;
  ctx.font = `600 ${format === 'story' ? 48 : 34}px ${FONT}`;
  for (const l of wrap(ctx, input.itemsText, maxW, 3)) {
    ctx.fillText(l, tx, y);
    y += format === 'story' ? 60 : 44;
  }
  if (input.description) {
    ctx.font = `500 ${format === 'story' ? 42 : 30}px ${FONT}`;
    for (const l of wrap(ctx, input.description, maxW, 2)) {
      ctx.fillText(l, tx, y);
      y += format === 'story' ? 54 : 40;
    }
  }
  y += format === 'story' ? 40 : 26;
  // "instead of" with a strike line
  const was = `במקום ${shekels(input.regularAgorot)} ₪`;
  ctx.font = `600 ${format === 'story' ? 50 : 36}px ${FONT}`;
  ctx.fillStyle = t.soft;
  ctx.fillText(was, tx, y);
  const ww = ctx.measureText(was).width;
  const numW = ctx.measureText(`${shekels(input.regularAgorot)} ₪`).width;
  ctx.strokeStyle = t.soft;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(tx - ww, y - (format === 'story' ? 16 : 12));
  ctx.lineTo(tx - ww + numW, y - (format === 'story' ? 16 : 12));
  ctx.stroke();

  // footer: the pizzeria's name and site
  ctx.fillStyle = t.ink;
  ctx.font = `800 ${format === 'story' ? 52 : 36}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('פיצה סוסי · להזמנה: pizza-sosi.co.il', W / 2, H - (format === 'story' ? 110 : 56));
}

export async function downloadDeal(input: DealArtInput, format: 'square' | 'story') {
  const c = document.createElement('canvas');
  await drawDeal(c, input, format);
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/png'));
  if (!blob) throw new Error('לא הצלחנו ליצור את התמונה');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${input.title.replace(/[^\p{L}\p{N}]+/gu, '-')}-${format}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
