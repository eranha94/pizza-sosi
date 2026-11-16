#!/usr/bin/env node
// Copy the curated menu (everything edited in the dev admin: dishes, toppings, choices, tags, photos paths)
// and the store settings (hours, delivery, WhatsApp statuses) from one project to another.
// Never touches orders, users or rate limits. Dry run by default.
//   node copy-menu.mjs --from pizza-sosi-dev --to pizza-sosi            (shows what would be copied)
//   node copy-menu.mjs --from pizza-sosi-dev --to pizza-sosi --write
// Photos are copied separately with gsutil (see docs/GO-LIVE.md), because they live in Storage.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { from: { type: 'string' }, to: { type: 'string' }, write: { type: 'boolean', default: false } } });
if (!values.from || !values.to || values.from === values.to) {
  console.error('usage: --from <project> --to <project> [--write]');
  process.exit(1);
}
const src = getFirestore(initializeApp({ credential: applicationDefault(), projectId: values.from }, 'src'));
const dst = getFirestore(initializeApp({ credential: applicationDefault(), projectId: values.to }, 'dst'));

const items = (await src.collection('menuItems').get()).docs.filter((d) => !d.data().deletedAt);
const store = (await src.doc('settings/store').get()).data();
console.log(`${items.length} menu items, store settings: ${store ? 'yes' : 'no'}`);
for (const d of items) console.log(`  ${d.data().active ? '•' : '◦'} ${d.data().name}`);

if (!values.write) {
  console.log('\n(dry run) add --write to copy');
  process.exit(0);
}
// Replace the menu: delete items that are not in the source, then write all source items with the same ids.
const keep = new Set(items.map((d) => d.id));
const existing = await dst.collection('menuItems').get();
let batch = dst.batch();
let n = 0;
const flush = async () => {
  if (n) await batch.commit();
  batch = dst.batch();
  n = 0;
};
for (const d of existing.docs) {
  if (keep.has(d.id)) continue;
  batch.delete(d.ref);
  n++;
}
for (const d of items) {
  batch.set(dst.collection('menuItems').doc(d.id), { ...d.data(), copiedFrom: values.from, updatedAt: FieldValue.serverTimestamp() });
  if (++n >= 400) await flush();
}
if (store) {
  batch.set(dst.doc('settings/store'), { ...store, updatedAt: FieldValue.serverTimestamp() });
  n++;
}
await flush();
console.log(`✓ copied to ${values.to}`);
