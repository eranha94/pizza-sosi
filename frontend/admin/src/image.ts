import { ref, uploadBytes } from 'firebase/storage';
import { storage } from './firebase';
import type { Crop } from './CropDialog';

/**
 * Menu photo upload, done in the browser so phones' huge photos never hit the site as-is:
 *  - menu_images/<id>.webp            the photo, longest side ≤ 1600 px
 *  - menu_thumbs/<id>_320.webp, _640  square thumbnails for the menu list (same names scripts/make-thumbnails.mjs uses)
 *  - menu_thumbs/<id>_1200.webp        large square for the in-store TV screen
 * The square comes from the crop chosen in CropDialog (the centre if none).
 * Storage rules allow this only for the owner signed in with two-step verification.
 */
const MAX_SIDE = 1600;
const THUMBS = [320, 640, 1200] as const;
const CACHE = 'public, max-age=31536000, immutable'; // names are unique per upload

async function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/webp', quality));
  if (!blob || blob.type !== 'image/webp') throw new Error('הדפדפן לא הצליח לעבד את התמונה');
  return blob;
}

function draw(bitmap: ImageBitmap, w: number, h: number, crop?: { sx: number; sy: number; s: number }) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  if (crop) ctx.drawImage(bitmap, crop.sx, crop.sy, crop.s, crop.s, 0, 0, w, h);
  else ctx.drawImage(bitmap, 0, 0, w, h);
  return canvas;
}

export async function uploadMenuPhoto(file: File, onProgress?: (text: string) => void, chosen?: Crop): Promise<string> {
  if (!/^image\/(jpeg|png|webp|avif|heic|heif)$/.test(file.type)) throw new Error('צריך לבחור קובץ תמונה (JPG / PNG / WEBP)');
  if (file.size > 25 * 1024 * 1024) throw new Error('התמונה גדולה מדי (עד 25MB)');
  onProgress?.('מעבד תמונה…');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error('לא הצלחנו לקרוא את התמונה. נסה JPG או PNG.');
  });
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const main = await toBlob(draw(bitmap, Math.round(bitmap.width * scale), Math.round(bitmap.height * scale)), 0.85);
    const short = Math.min(bitmap.width, bitmap.height);
    const crop = chosen ?? { sx: (bitmap.width - short) / 2, sy: (bitmap.height - short) / 2, s: short };
    // Never upscale: a small crop of a small photo stays at its own size (the site falls back to smaller thumbs).
    const thumbs = await Promise.all(
      THUMBS.filter((w) => w <= Math.max(320, Math.round(crop.s))).map(async (w) => ({ w, blob: await toBlob(draw(bitmap, w, w, crop), w >= 1200 ? 0.8 : 0.74) })),
    );

    const id = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    const path = `menu_images/${id}.webp`;
    onProgress?.('מעלה…');
    await Promise.all([
      uploadBytes(ref(storage, path), main, { contentType: 'image/webp', cacheControl: CACHE }),
      ...thumbs.map((t) => uploadBytes(ref(storage, `menu_thumbs/${id}_${t.w}.webp`), t.blob, { contentType: 'image/webp', cacheControl: CACHE })),
    ]);
    return path;
  } finally {
    bitmap.close();
  }
}

/** Download an existing menu photo so it can be cropped again. */
export async function fetchMenuPhoto(bucket: string, path: string): Promise<File> {
  const res = await fetch(photoUrl(bucket, path)!);
  if (!res.ok) throw new Error('לא הצלחנו לטעון את התמונה הקיימת');
  const blob = await res.blob();
  return new File([blob], path.split('/').pop() ?? 'photo.webp', { type: blob.type || 'image/webp' });
}

export function photoUrl(bucket: string, path: string | null, thumb?: 320 | 640 | 1200): string | null {
  if (!path || !bucket) return null;
  const p = thumb ? `menu_thumbs/${path.replace(/^menu_images\//, '').replace(/\.[^.]+$/, '')}_${thumb}.webp` : path;
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(p)}?alt=media`;
}
