#!/usr/bin/env node
// Creates small WebP versions of every menu image for fast loading:
//   menu_images/<name>.<ext>  →  menu_thumbs/<name>_320.webp, menu_thumbs/<name>_640.webp
// Thumbnails get a one-year immutable cache header. Originals are not modified.
//   node scripts/make-thumbnails.mjs --bucket pizza-sosi-dev.firebasestorage.app            (dry run)
//   node scripts/make-thumbnails.mjs --bucket pizza-sosi-dev.firebasestorage.app --write
//   add --force to regenerate thumbnails that already exist
import { Storage } from '@google-cloud/storage';
import sharp from 'sharp';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: { bucket: { type: 'string' }, write: { type: 'boolean', default: false }, force: { type: 'boolean', default: false } },
});
if (!values.bucket) {
  console.error('usage: --bucket <name> [--write] [--force]');
  process.exit(1);
}
const WIDTHS = [320, 640];
const bucket = new Storage().bucket(values.bucket);
const [files] = await bucket.getFiles({ prefix: 'menu_images/' });
let made = 0;
let savedBytes = 0;

for (const file of files) {
  if (file.name.endsWith('/')) continue;
  const base = file.name.replace(/^menu_images\//, '').replace(/\.[^.]+$/, '');
  const targets = WIDTHS.map((w) => ({ w, name: `menu_thumbs/${base}_${w}.webp` }));
  if (!values.force) {
    const exists = await Promise.all(targets.map((t) => bucket.file(t.name).exists().then(([e]) => e)));
    if (exists.every(Boolean)) continue;
  }
  const [original] = await file.download();
  for (const t of targets) {
    const out = await sharp(original).rotate().resize({ width: t.w, height: t.w, fit: 'cover' }).webp({ quality: 74 }).toBuffer();
    savedBytes += original.length - out.length;
    console.log(`${file.name} (${Math.round(original.length / 1024)} KB) → ${t.name} (${Math.round(out.length / 1024)} KB)`);
    if (values.write) {
      await bucket.file(t.name).save(out, {
        resumable: false,
        metadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' },
      });
    }
    made++;
  }
}
console.log(`${values.write ? '✓ created' : '(dry run) would create'} ${made} thumbnails, ~${Math.round(savedBytes / 1024 / 1024)} MB lighter`);
