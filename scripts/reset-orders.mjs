#!/usr/bin/env node
// One-off cleanup before opening: deletes ALL orders and what they created.
//   node reset-orders.mjs --project pizza-sosi          → only counts, deletes nothing
//   node reset-orders.mjs --project pizza-sosi --yes    → deletes
// Deletes: orders, loyalty cards, the order-number counter, coupon uses (and resets each coupon's usedCount),
// and the idempotency records that point at orders. Menu, settings, deals and coupons themselves stay.
// Deleting an order fires no customer message or email (the triggers ignore deletes).
import { parseArgs } from 'node:util';
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const { values } = parseArgs({ options: { project: { type: 'string' }, yes: { type: 'boolean', default: false } } });
if (!values.project) {
  console.error('✗ --project is required');
  process.exit(1);
}
const db = getFirestore(initializeApp({ credential: applicationDefault(), projectId: values.project }));

const count = async (q) => (await q.count().get()).data().count;
const coupons = await db.collection('coupons').get();
let uses = 0;
for (const c of coupons.docs) uses += await count(c.ref.collection('uses'));
const counter = await db.collection('counters').doc('orders').get();

console.log(`${values.project}:`);
console.log(`  orders: ${await count(db.collection('orders'))}`);
console.log(`  loyalty cards: ${await count(db.collection('loyalty'))}`);
console.log(`  coupon uses: ${uses} (in ${coupons.size} coupons)`);
console.log(`  idempotency records: ${await count(db.collection('idempotency'))}`);
console.log(`  last order number: ${counter.exists ? counter.data().last : '—'}`);

if (!values.yes) {
  console.log('\nNothing deleted. Run again with --yes to delete all of the above.');
  process.exit(0);
}

await db.recursiveDelete(db.collection('orders'));
await db.recursiveDelete(db.collection('loyalty'));
await db.recursiveDelete(db.collection('idempotency'));
for (const c of coupons.docs) {
  await db.recursiveDelete(c.ref.collection('uses'));
  await c.ref.update({ usedCount: 0 });
}
await db.collection('counters').doc('orders').delete();
console.log('\n✓ deleted. The next order will be #1001.');
