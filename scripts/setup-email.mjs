#!/usr/bin/env node
// Turn on customer emails (order confirmation, cancellation, admin password reset) for one project.
// Prerequisites: domain verified in Resend, and the API key saved in Secret Manager as RESEND_API_KEY
// with the functions' service account allowed to read it (see docs/GO-LIVE.md).
//   node setup-email.mjs --project pizza-sosi-dev --site https://pizza-sosi-dev.web.app --admin https://pizza-sosi-dev-admin.web.app \
//        --from "פיצה סוסי <orders@pizza-sosi.co.il>" --reply-to support@pizza-sosi.co.il
//   add --off to turn emails off again.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    site: { type: 'string' },
    admin: { type: 'string' },
    from: { type: 'string' },
    'reply-to': { type: 'string' },
    off: { type: 'boolean', default: false },
  },
});
if (!values.project || (!values.off && (!values.site?.startsWith('https://') || !values.admin?.startsWith('https://') || !values.from))) {
  console.error('usage: --project <id> --site https://… --admin https://… --from "Name <addr>" [--reply-to addr] [--off]');
  process.exit(1);
}
const db = getFirestore(initializeApp({ credential: applicationDefault(), projectId: values.project }));
await db.collection('settings').doc('email').set(
  values.off
    ? { enabled: false, updatedAt: FieldValue.serverTimestamp() }
    : { enabled: true, from: values.from, replyTo: values['reply-to'] ?? null, siteUrl: values.site, adminUrl: values.admin, updatedAt: FieldValue.serverTimestamp() },
  { merge: true },
);
console.log(values.off ? '✓ emails turned off' : `✓ emails on for ${values.project} (from ${values.from})`);
