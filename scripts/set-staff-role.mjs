#!/usr/bin/env node
// Assign a staff role (custom claim). Run locally by the owner with Application Default Credentials:
//   gcloud auth application-default login
//   node scripts/set-staff-role.mjs --project pizza-sosi --email someone@example.com --role staff
//   node scripts/set-staff-role.mjs --project pizza-sosi --email someone@example.com --role none   (remove)
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { project: { type: 'string' }, email: { type: 'string' }, role: { type: 'string' } } });
if (!values.project || !values.email || !['owner', 'staff', 'none'].includes(values.role ?? '')) {
  console.error('usage: --project <id> --email <email> --role owner|staff|none');
  process.exit(1);
}
initializeApp({ credential: applicationDefault(), projectId: values.project });
const auth = getAuth();
const user = await auth.getUserByEmail(values.email);
await auth.setCustomUserClaims(user.uid, values.role === 'none' ? {} : { role: values.role });
await auth.revokeRefreshTokens(user.uid); // forces a fresh token with the new role
console.log(`✓ ${values.email}: role = ${values.role}`);
