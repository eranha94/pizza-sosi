#!/usr/bin/env node
// One-time WhatsApp setup per project (dev now, prod at go-live). Run in Cloud Shell:
//   read -s WA_TOKEN && export WA_TOKEN
//   node whatsapp-setup.mjs --project pizza-sosi-dev --waba <WhatsApp Business Account ID> \
//        --phone-id <Phone number ID> --site https://pizza-sosi-dev.web.app
// What it does:
//   1. creates the 6 Hebrew "utility" message templates (Meta reviews them, usually minutes–hours)
//   2. writes settings/whatsapp { enabled, phoneNumberId, language } in Firestore (server-only doc)
// The token itself goes to Secret Manager separately (see README); this script only uses it for step 1.
// Re-running is safe: templates that already exist are reported and skipped.
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    waba: { type: 'string' },
    'phone-id': { type: 'string' },
    site: { type: 'string' },
    'skip-templates': { type: 'boolean', default: false },
  },
});
const token = process.env.WA_TOKEN;
if (!values.project || !/^\d+$/.test(values.waba ?? '') || !/^\d+$/.test(values['phone-id'] ?? '') || !values.site?.startsWith('https://') || !token) {
  console.error('usage: WA_TOKEN=… node whatsapp-setup.mjs --project <id> --waba <digits> --phone-id <digits> --site https://…');
  process.exit(1);
}
const site = values.site.replace(/\/$/, '');
const GRAPH = 'https://graph.facebook.com/v25.0';

// {{1}} = customer first name, {{2}} = order number. Button opens the live order page.
const TEMPLATES = [
  ['pizza_sosi_order_accepted', 'היי {{1}}, ההזמנה שלך #{{2}} התקבלה בפיצה סוסי 🍕\nנעדכן אותך כאן כשהיא נכנסת להכנה.'],
  ['pizza_sosi_order_preparing', 'היי {{1}}, ההזמנה שלך #{{2}} בהכנה עכשיו 👨‍🍳🔥'],
  ['pizza_sosi_order_almost_ready', 'היי {{1}}, ההזמנה שלך #{{2}} כמעט מוכנה ⏳'],
  ['pizza_sosi_order_ready_pickup', 'היי {{1}}, ההזמנה שלך #{{2}} מוכנה לאיסוף ✅\nמחכים לך בפיצה סוסי!'],
  ['pizza_sosi_order_on_the_way', 'היי {{1}}, ההזמנה שלך #{{2}} יצאה אליך עם השליח 🛵'],
  ['pizza_sosi_order_cancelled', 'היי {{1}}, ההזמנה שלך #{{2}} בוטלה.\nלשאלות התקשרו אלינו: 054-888-0909'],
];

async function graph(path, body) {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}

if (!values['skip-templates']) {
  const existing = await graph(`${values.waba}/message_templates?fields=name,status,language&limit=200`);
  if (!existing.ok) {
    console.error('✗ could not read templates:', existing.json?.error?.message ?? existing.json);
    process.exit(1);
  }
  const have = new Map(existing.json.data.map((t) => [`${t.name}:${t.language}`, t.status]));
  for (const [name, text] of TEMPLATES) {
    if (have.has(`${name}:he`)) {
      console.log(`• ${name}: already exists (${have.get(`${name}:he`)})`);
      continue;
    }
    const r = await graph(`${values.waba}/message_templates`, {
      name,
      language: 'he',
      category: 'UTILITY',
      components: [
        { type: 'BODY', text, example: { body_text: [['דנה', '1042']] } },
        { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'מעקב אחרי ההזמנה', url: `${site}/order/{{1}}`, example: [`${site}/order/abc123`] }] },
      ],
    });
    console.log(r.ok ? `✓ ${name}: submitted (${r.json.status})` : `✗ ${name}: ${r.json?.error?.error_user_msg ?? r.json?.error?.message}`);
  }
}

const db = getFirestore(initializeApp({ credential: applicationDefault(), projectId: values.project }));
await db.collection('settings').doc('whatsapp').set(
  { enabled: true, phoneNumberId: values['phone-id'], wabaId: values.waba, language: 'he', updatedAt: FieldValue.serverTimestamp() },
  { merge: true },
);
console.log(`✓ settings/whatsapp saved in ${values.project}`);
