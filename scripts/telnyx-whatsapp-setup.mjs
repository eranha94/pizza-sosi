#!/usr/bin/env node
// WhatsApp through Telnyx, from a dedicated sending number (+972537998889, WABA 2236382476942858). Replies to it are not monitored.
// Self-contained on purpose: it can be pasted into Cloud Shell without the repo. Run in two steps:
//
//   read -s TELNYX_API_KEY && export TELNYX_API_KEY
//   1) submit the templates (Meta reviews them, usually minutes–hours):
//      node telnyx-whatsapp-setup.mjs --templates --waba <WABA ID from Telnyx> --site https://pizza-sosi.co.il
//   2) once they're APPROVED, switch the site to Telnyx:
//      node telnyx-whatsapp-setup.mjs --enable --project pizza-sosi --from +9725XXXXXXXX
//
// --status shows the templates' review status. Re-running is safe: existing templates are skipped.
// The API key itself goes to Secret Manager as TELNYX_API_KEY (see docs/GO-LIVE.md); this script only uses it here.
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    templates: { type: 'boolean', default: false },
    status: { type: 'boolean', default: false },
    enable: { type: 'boolean', default: false },
    waba: { type: 'string' },
    site: { type: 'string' },
    project: { type: 'string' },
    from: { type: 'string' },
  },
});
const key = process.env.TELNYX_API_KEY;
const API = 'https://api.telnyx.com/v2';
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

// Same wording as scripts/whatsapp-setup.mjs (keep in sync). {{1}} = first name, {{2}} = order number.
const TEMPLATES = [
  ['pizza_sosi_order_accepted', 'היי {{1}}, ההזמנה שלך #{{2}} התקבלה בפיצה סוסי 🍕\nנעדכן אותך כאן כשהיא נכנסת להכנה.'],
  ['pizza_sosi_order_preparing', 'היי {{1}}, ההזמנה שלך #{{2}} בהכנה עכשיו 👨‍🍳🔥'],
  ['pizza_sosi_order_almost_ready', 'היי {{1}}, ההזמנה שלך #{{2}} כמעט מוכנה ⏳'],
  ['pizza_sosi_order_ready_pickup', 'היי {{1}}, ההזמנה שלך #{{2}} מוכנה לאיסוף ✅\nמחכים לך בפיצה סוסי!'],
  ['pizza_sosi_order_on_the_way', 'היי {{1}}, ההזמנה שלך #{{2}} יצאה אליך עם השליח 🛵'],
  ['pizza_sosi_order_cancelled', 'היי {{1}}, ההזמנה שלך #{{2}} בוטלה.\nלשאלות התקשרו אלינו: 054-888-0909'],
  // After a status was pressed by mistake. {{3}} = where the order really is (e.g. "בהכנה").
  ['pizza_sosi_order_status_corrected', 'היי {{1}}, עמכם הסליחה 🙏\nהסטטוס של הזמנה #{{2}} עודכן אצלנו בטעות.\nההזמנה שלך כרגע: {{3}}.\nאנחנו עושים את המיטב שהיא לא תתעכב.', ['דנה', '1042', 'בהכנה']],
  // Loyalty card (only when the owner turns it on). {{1}} name, {{2}} stamps, {{3}} required, {{4}} to go, {{5}} reward.
  ['pizza_sosi_loyalty_progress', 'היי {{1}}, תודה שהזמנת מפיצה סוסי! 🍕\nבכרטיסייה שלך: {{2}} מתוך {{3}}.\nעוד {{4}} הזמנות ומגיע לך: {{5}} 🎁', ['דנה', '3', '10', '7', 'פיצה חינם'], 'לכרטיסייה שלי'],
  ['pizza_sosi_loyalty_reward', 'היי {{1}}, מילאת את הכרטיסייה בפיצה סוסי! 🎉\nבהזמנה הבאה מגיע לך: {{2}}.\nמסמנים את ההטבה בעמוד התשלום באתר.', ['דנה', 'פיצה חינם'], 'להזמנה באתר'],
];

async function telnyx(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  const err = json.errors?.[0];
  return { ok: res.ok, json, error: err ? `${err.code ?? res.status} ${err.detail ?? err.title ?? ''}`.trim() : `HTTP ${res.status}` };
}

async function listOurs() {
  const r = await telnyx(`/whatsapp/message_templates?filter[search]=pizza_sosi&page[size]=100`);
  if (!r.ok) fail(`could not read templates: ${r.error}`);
  return (r.json.data ?? []).filter((t) => String(t.name).startsWith('pizza_sosi_'));
}

if (values.templates || values.status) {
  if (!key) fail('set TELNYX_API_KEY first (read -s TELNYX_API_KEY && export TELNYX_API_KEY)');
}

if (values.templates) {
  if (!/^\d+$/.test(values.waba ?? '')) fail('--waba <digits> is required (Telnyx portal → WhatsApp → Business Accounts)');
  if (!values.site?.startsWith('https://')) fail('--site https://… is required');
  const site = values.site.replace(/\/$/, '');
  const have = new Set((await listOurs()).map((t) => `${t.name}:${t.language}`));
  for (const [name, text, example, button] of TEMPLATES) {
    if (have.has(`${name}:he`)) {
      console.log(`• ${name}: already exists`);
      continue;
    }
    const r = await telnyx('/whatsapp/message_templates', {
      waba_id: values.waba,
      name,
      category: 'UTILITY',
      language: 'he',
      components: [
        { type: 'BODY', text, example: { body_text: [example ?? ['דנה', '1042']] } },
        { type: 'BUTTONS', buttons: [{ type: 'URL', text: button ?? 'מעקב אחרי ההזמנה', url: `${site}/order/{{1}}`, example: [`${site}/order/abc123`] }] },
      ],
    });
    console.log(r.ok ? `✓ ${name}: submitted (${r.json.data?.status ?? 'PENDING'})` : `✗ ${name}: ${r.error}`);
  }
}

if (values.status) {
  const ours = await listOurs();
  if (ours.length === 0) console.log('no pizza_sosi templates yet');
  for (const t of ours) console.log(`${t.status === 'APPROVED' ? '✓' : '…'} ${t.name} (${t.language}): ${t.status}`);
}

if (values.enable) {
  if (!values.project) fail('--project is required');
  if (!/^\+9725\d{8}$/.test(values.from ?? '')) fail('--from must be the pizzeria number as +9725XXXXXXXX');
  const { initializeApp, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
  const db = getFirestore(initializeApp({ credential: applicationDefault(), projectId: values.project }));
  await db.collection('settings').doc('whatsapp').set(
    { enabled: true, provider: 'telnyx', from: values.from, language: 'he', updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  console.log(`✓ ${values.project}: order updates now go out through Telnyx from ${values.from}`);
}

if (!values.templates && !values.status && !values.enable) fail('nothing to do: use --templates, --status or --enable (see the top of this file)');
