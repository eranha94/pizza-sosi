#!/usr/bin/env node
// Sets the add-on groups of a burger (as in the old ordering app).
//   node setup-burger-addons.mjs --project pizza-sosi --item "בורגר סוסי"         → shows what will be set
//   node setup-burger-addons.mjs --project pizza-sosi --item "בורגר סוסי" --yes   → saves
// Replaces only that item's add-on groups. Name, price, picture and everything else stay.
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const { values } = parseArgs({ options: { project: { type: 'string' }, item: { type: 'string' }, yes: { type: 'boolean', default: false } } });
if (!values.project || !values.item) {
  console.error('✗ usage: --project pizza-sosi --item "בורגר סוסי" [--yes]');
  process.exit(1);
}
const db = getFirestore(initializeApp({ credential: applicationDefault(), projectId: values.project }));

const id = () => randomUUID().replace(/-/g, '').slice(0, 20);
const opt = (name, shekels = 0) => ({ id: id(), name, wholeAgorot: Math.round(shekels * 100), halfAgorot: null, active: true });
const multi = (name, max, options) => ({ id: id(), name, selection: 'multi', defaultOptionId: null, maxSelect: max, options });

const TOPPINGS = ['רוטב מוקרם + גבינה', "גבינת מק אנד צ'יז", 'גבינת גאודה', 'חלפיניו', 'פטריות', 'בצל', 'ריבת בצל אדום', 'דובדבנים שחורים'];
const PAID = [
  ['רוטב מוקרם + גבינה', 12], ["גבינת מק אנד צ'יז", 6], ['גבינת גאודה', 6], ["גבינת צ'דר", 6],
  ['חלפיניו', 5], ['פטריות', 5], ['בצל', 5], ['ריבת בצל אדום', 6], ['דובדבנים שחורים', 6],
];
const DRINKS = ['קולה', 'קולה זירו', 'ספרייט', 'XL', 'XL TEN', 'ענבים', 'פנטה', 'תפוזים', 'פנטה זירו'];
const upgrade = (side) => multi(`${side} ושתייה לשדרוג`, 1, DRINKS.map((d) => opt(`${side} + ${d}`, 20)));

const salad = { id: id(), name: 'סלט ירקות בצד', selection: 'single', defaultOptionId: null, maxSelect: null, options: [opt('להוסיף'), opt('לא להוסיף')] };
salad.defaultOptionId = salad.options[0].id;

const groups = [
  salad,
  multi('שתי תוספות בחינם', 2, TOPPINGS.map((n) => opt(n))),
  multi('תוספות בתשלום', 5, PAID.map(([n, p]) => opt(n, p))),
  upgrade("צ'יפס"),
  upgrade('פוטטו'),
  upgrade('טבעות בצל'),
].map((g, i) => ({ ...g, order: i + 1 }));

const snap = await db.collection('menuItems').where('name', '==', values.item).get();
const live = snap.docs.filter((d) => !d.data().deletedAt);
if (live.length !== 1) {
  console.error(`✗ found ${live.length} items named "${values.item}" – need exactly one`);
  process.exit(1);
}
const doc = live[0];
console.log(`${values.item} (${doc.id}), ₪${doc.data().priceAgorot / 100}`);
console.log(`  now: ${(doc.data().addOnGroups ?? []).length} groups`);
for (const g of groups)
  console.log(`  → ${g.name} – ${g.selection === 'single' ? 'בחירת חובה' : `עד ${g.maxSelect}`}: ${g.options.map((o) => o.name + (o.wholeAgorot ? ` +₪${o.wholeAgorot / 100}` : '')).join(' · ')}`);
if (!values.yes) {
  console.log('\nNothing saved. Run again with --yes to save.');
  process.exit(0);
}
await doc.ref.update({ addOnGroups: groups, updatedAt: FieldValue.serverTimestamp() });
console.log('\n✓ saved – refresh the site to see it.');
