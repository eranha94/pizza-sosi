#!/usr/bin/env node
// Adds an option to a required-choice group (e.g. "גבינה") on every menu item that has that group.
// Idempotent; dry run by default. Until the admin menu editor exists, this is how choices are extended.
//   node scripts/add-choice-option.mjs --project pizza-sosi-dev --group גבינה --option "מיקס גבינות קשות 33% שומן" [--price 0] [--write]
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { parseArgs } from 'node:util';
import { stableId } from './lib-addons.mjs';

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    group: { type: 'string' },
    option: { type: 'string' },
    price: { type: 'string', default: '0' },
    write: { type: 'boolean', default: false },
  },
});
if (!values.project || !values.group || !values.option) {
  console.error('usage: --project <id> --group <name> --option <name> [--price <shekels>] [--write]');
  process.exit(1);
}
const db = getFirestore(initializeApp({ credential: applicationDefault(), projectId: values.project }));
const wholeAgorot = Math.round(Number(values.price) * 100);
const option = { id: stableId('opt', values.group, values.option), name: values.option, wholeAgorot, halfAgorot: null, active: true };

const snap = await db.collection('menuItems').get();
const batch = db.batch();
let changed = 0;
for (const doc of snap.docs) {
  const groups = doc.data().addOnGroups ?? [];
  const g = groups.find((x) => x.name === values.group && x.selection === 'single');
  if (!g || g.options.some((o) => o.name === values.option)) continue;
  g.options.push(option);
  batch.update(doc.ref, { addOnGroups: groups });
  changed++;
  console.log(`+ ${doc.data().name}`);
}
if (values.write && changed) await batch.commit();
console.log(`${values.write ? '✓ updated' : '(dry run) would update'} ${changed} items`);
