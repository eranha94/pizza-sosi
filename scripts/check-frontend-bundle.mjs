#!/usr/bin/env node
// Fails the build if anything server-side or secret ended up in the browser bundles.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIRS = ['frontend/web/dist', 'frontend/admin/dist'];
const FORBIDDEN = [
  [/firebase-admin/i, 'firebase-admin (server SDK)'],
  [/firebase-functions/i, 'firebase-functions (server SDK)'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/"type"\s*:\s*"service_account"/, 'service account JSON'],
  [/\bsk_(live|test)_[0-9a-zA-Z]{10,}/, 'secret API key'],
  [/backend\/functions\/src/, 'backend source path'],
  [/priceCart|PricingError|requireStaff|rateLimit\(/, 'backend business/security logic'],
  [/AKIA[0-9A-Z]{16}/, 'cloud access key'],
];

let failures = 0;
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const name = entry.name;
    const p = join(dir, name);
    if (entry.isDirectory()) walk(p);
    else if (/\.(js|mjs|css|html|json|map|txt)$/.test(name)) {
      const text = readFileSync(p, 'utf8');
      for (const [re, label] of FORBIDDEN) {
        if (re.test(text)) {
          console.error(`✗ ${p}: contains ${label}`);
          failures++;
        }
      }
      if (name.endsWith('.map')) {
        console.error(`✗ ${p}: source maps must not be deployed`);
        failures++;
      }
    }
  }
}
for (const d of DIRS) {
  try {
    walk(d);
  } catch {
    console.error(`✗ ${d} not found – build the frontend first`);
    failures++;
  }
}
if (failures) {
  console.error(`\nFrontend bundle check failed: ${failures} problem(s).`);
  process.exit(1);
}
console.log('✓ Frontend bundles contain no backend code or secrets.');
