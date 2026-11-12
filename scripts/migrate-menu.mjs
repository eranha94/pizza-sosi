#!/usr/bin/env node
// Copies the menu from the old site's structure (settings/admin/menu_items + add_ons, prices in shekels)
// to the new `menuItems` collection (prices in agorot). Read-only on the old data. Dry run by default.
//   node scripts/migrate-menu.mjs --project pizza-sosi-dev            (dry run, prints what it would write)
//   node scripts/migrate-menu.mjs --project pizza-sosi-dev --write
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { project: { type: 'string' }, write: { type: 'boolean', default: false } } });
if (!values.project) {
  console.error('usage: --project <id> [--write]');
  process.exit(1);
}
initializeApp({ credential: applicationDefault(), projectId: values.project });
const db = getFirestore();
const toAgorot = (shekels) => Math.round(Number(shekels) * 100);

const itemsSnap = await db.collection('settings/admin/menu_items').get();
const addOnsSnap = await db.collection('settings/admin/add_ons').get();
const globalAddOns = addOnsSnap.docs.map((d) => ({
  id: d.id,
  name: String(d.data().name ?? ''),
  priceAgorot: toAgorot(d.data().price ?? 0),
  active: d.data().active !== false,
  order: Number(d.data().order ?? 0),
}));

const batch = db.batch();
for (const d of itemsSnap.docs) {
  const x = d.data();
  const category = String(x.category ?? 'pizzas');
  const item = {
    name: String(x.name ?? '').trim(),
    description: String(x.desc ?? '').trim(),
    category,
    priceAgorot: toAgorot(x.price ?? 0),
    imagePath: x.imagePath ?? null,
    order: Number(x.order ?? 0),
    active: true,
    // On the old site the add-ons applied to pizzas; keep that until the owner edits them per item.
    addOns: category === 'pizzas' ? globalAddOns : [],
    migratedFrom: `settings/admin/menu_items/${d.id}`,
  };
  console.log(`${d.id}: ${item.name} – ${item.priceAgorot / 100} ₪ – ${item.addOns.length} add-ons`);
  batch.set(db.collection('menuItems').doc(d.id), item);
}
if (values.write) {
  await batch.commit();
  console.log(`✓ wrote ${itemsSnap.size} items to menuItems`);
} else {
  console.log(`(dry run – ${itemsSnap.size} items. add --write to apply)`);
}
