// Runs against the Firestore emulator: `pnpm test:rules` (root).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, getDocs, collection, query, where, updateDoc } from 'firebase/firestore';

let env: RulesTestEnvironment;
const staffClaims = { role: 'staff', firebase: { sign_in_provider: 'password', sign_in_second_factor: 'totp' } };

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-pizza-sosi',
    firestore: { rules: readFileSync(resolve(import.meta.dirname, '../../backend/firebase/firestore.rules'), 'utf8') },
  });
});
afterAll(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'menuItems/p1'), { name: 'פיצה', active: true, priceAgorot: 5900 });
    await setDoc(doc(db, 'orders/o1'), { uid: 'alice', status: 'accepted', totalAgorot: 5900 });
    await setDoc(doc(db, 'settings/admin'), { password: 'legacy' });
    await setDoc(doc(db, 'counters/orders'), { last: 1001 });
  });
});

describe('menu', () => {
  it('anyone can read', () => assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'menuItems/p1'))));
  it('nobody can write from the browser, not even staff', async () => {
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'menuItems/p2'), { name: 'x' }));
    await assertFails(updateDoc(doc(env.authenticatedContext('s', staffClaims).firestore(), 'menuItems/p1'), { priceAgorot: 1 }));
  });
});

describe('orders', () => {
  it('owner of the order can read it', () => assertSucceeds(getDoc(doc(env.authenticatedContext('alice').firestore(), 'orders/o1'))));
  it('another user cannot read it', () => assertFails(getDoc(doc(env.authenticatedContext('bob').firestore(), 'orders/o1'))));
  it('a user can list only their own orders', async () => {
    const db = env.authenticatedContext('bob').firestore();
    await assertSucceeds(getDocs(query(collection(db, 'orders'), where('uid', '==', 'bob'))));
    await assertFails(getDocs(collection(db, 'orders')));
  });
  it('customer cannot create or change orders directly', async () => {
    const db = env.authenticatedContext('alice').firestore();
    await assertFails(setDoc(doc(db, 'orders/o2'), { uid: 'alice', status: 'paid', totalAgorot: 1 }));
    await assertFails(updateDoc(doc(db, 'orders/o1'), { status: 'paid' }));
  });
  it('staff with MFA can read all; staff without MFA cannot', async () => {
    await assertSucceeds(getDocs(collection(env.authenticatedContext('s', staffClaims).firestore(), 'orders')));
    await assertFails(getDocs(collection(env.authenticatedContext('s2', { role: 'staff' }).firestore(), 'orders')));
  });
});

describe('closed collections', () => {
  it('legacy admin settings (old password) are not readable', () =>
    assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'settings/admin'))));
  it('counters are not readable', () => assertFails(getDoc(doc(env.authenticatedContext('alice').firestore(), 'counters/orders'))));
});
