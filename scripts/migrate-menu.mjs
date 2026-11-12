#!/usr/bin/env node
// Copies the menu from the old site's structure (settings/admin/menu_items + add_ons, prices in shekels)
// to the new `menuItems` collection (prices in agorot). Read-only on the old data. Dry run by default.
//   node scripts/migrate-menu.mjs --from pizza-sosi --to pizza-sosi-dev            (dry run)
//   node scripts/migrate-menu.mjs --from pizza-sosi --to pizza-sosi-dev --write
// --from defaults to --to (migrate inside the same project).
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { parseArgs } from 'node:util';
import { toAddOnGroups } from './lib-addons.mjs';

const { values } = parseArgs({
  options: { from: { type: 'string' }, to: { type: 'string' }, write: { type: 'boolean', default: false } },
});
if (!values.to) {
  console.error('usage: --to <project> [--from <project>] [--write]');
  process.exit(1);
}
const source = getFirestore(initializeApp({ credential: applicationDefault(), projectId: values.from ?? values.to }, 'source'));
const db = getFirestore(initializeApp({ credential: applicationDefault(), projectId: values.to }, 'target'));
const toAgorot = (shekels) => Math.round(Number(shekels) * 100);
// Old docs stored a full download URL; the new model stores the Storage path.
const toImagePath = (x) => {
  if (x.imagePath) return String(x.imagePath);
  const m = /\/o\/([^?]+)/.exec(String(x.imageUrl ?? ''));
  return m ? decodeURIComponent(m[1]) : null;
};

// Read-only on the source.
const itemsSnap = await source.collection('settings/admin/menu_items').get();
const toRow = (d) => ({
  name: String(d.data().name ?? ''),
  priceAgorot: toAgorot(d.data().price ?? 0),
  active: d.data().active !== false,
  order: Number(d.data().order ?? 0),
});
// Old site: add-ons live under each item (menu_items/{id}/add_ons); a global list is a fallback.
const globalRows = (await source.collection('settings/admin/add_ons').get()).docs.map(toRow);

const batch = db.batch();
for (const d of itemsSnap.docs) {
  const x = d.data();
  const category = String(x.category ?? 'pizzas');
  const own = (await d.ref.collection('add_ons').get()).docs.map(toRow).sort((a, b) => a.order - b.order);
  const item = {
    name: String(x.name ?? '').trim(),
    description: String(x.desc ?? '').trim(),
    category,
    priceAgorot: toAgorot(x.price ?? 0),
    imagePath: toImagePath(x),
    order: Number(x.order ?? 0),
    active: true,
    addOnGroups: toAddOnGroups(own.length ? own : category === 'pizzas' ? globalRows : []),
    migratedFrom: `settings/admin/menu_items/${d.id}`,
  };
  console.log(`${d.id}: ${item.name} – ${item.priceAgorot / 100} ₪`);
  for (const g of item.addOnGroups) {
    const p = [...new Set(g.options.map((o) => `${o.wholeAgorot / 100}${o.halfAgorot !== null ? `/half ${o.halfAgorot / 100}` : ''}`))];
    console.log(`    ${g.name} [${p.join(' | ')}]: ${g.options.length} options`);
  }
  batch.set(db.collection('menuItems').doc(d.id), item);
}
if (values.write) {
  await batch.commit();
  console.log(`✓ wrote ${itemsSnap.size} items to ${values.to}/menuItems`);
} else {
  console.log(`(dry run – ${itemsSnap.size} items. add --write to apply)`);
}
