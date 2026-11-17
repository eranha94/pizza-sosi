#!/usr/bin/env node
// Assign a staff role (custom claim). Run by the owner with Application Default Credentials (e.g. Cloud Shell):
//   node scripts/set-staff-role.mjs --project pizza-sosi-dev --email someone@example.com --role owner
//   node scripts/set-staff-role.mjs --project pizza-sosi-dev --email someone@example.com --role none   (remove)
// If the account doesn't exist yet it is created without a usable password, and a one-time link is printed
// for setting the password. Passwords never go through this script or the chat.
// After the first sign-in the admin site asks to set up two-step verification (authenticator app).
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { project: { type: 'string' }, email: { type: 'string' }, role: { type: 'string' } } });
if (!values.project || !values.email || !['owner', 'staff', 'none'].includes(values.role ?? '')) {
  console.error('usage: --project <id> --email <email> --role owner|staff|none');
  process.exit(1);
}
initializeApp({ credential: applicationDefault(), projectId: values.project });
const auth = getAuth();
const email = values.email.trim().toLowerCase();

let user;
let created = false;
try {
  user = await auth.getUserByEmail(email);
} catch (e) {
  if (e?.code !== 'auth/user-not-found' || values.role === 'none') throw e;
  // Random throwaway password nobody knows; the owner sets a real one through the link below.
  user = await auth.createUser({ email, emailVerified: true, password: randomBytes(32).toString('base64url') });
  created = true;
}

await auth.setCustomUserClaims(user.uid, values.role === 'none' ? {} : { role: values.role });
await auth.revokeRefreshTokens(user.uid); // forces a fresh token with the new role
console.log(`✓ ${email}: role = ${values.role}`);

if (created) {
  const link = await auth.generatePasswordResetLink(email);
  console.log('\nNew account. Open this one-time link (only you) to choose a password:\n');
  console.log(link);
  console.log('\nThen sign in to the admin site and set up the authenticator app.');
}
