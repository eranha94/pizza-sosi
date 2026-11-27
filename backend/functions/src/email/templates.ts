import { formatAgorot, formatTime, COVERAGE_LABELS, type OrderView } from '@pizza-sosi/contracts';

/**
 * Hebrew, right-to-left transactional emails. Table layout + inline styles, because email clients
 * (Gmail, Outlook, Apple Mail) ignore most modern CSS. Every customer-provided value is escaped.
 */
export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const YELLOW = '#FEB800';
const INK = '#1E1A1B';
const SOFT = '#6B6466';
const CREAM = '#FFF8E6';

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function button(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0"><tr><td style="border-radius:999px;background:${YELLOW}">
    <a href="${esc(href)}" style="display:inline-block;padding:14px 28px;font-weight:bold;font-size:16px;color:${INK};text-decoration:none;border-radius:999px">${esc(label)}</a>
  </td></tr></table>`;
}

function layout(siteUrl: string, preheader: string, body: string) {
  return `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>פיצה סוסי</title></head>
<body style="margin:0;padding:0;background:${CREAM};font-family:Arial,'Segoe UI',Helvetica,sans-serif;color:${INK}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREAM}"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden" dir="rtl">
    <tr><td align="center" style="background:${YELLOW};padding:18px">
      <img src="${esc(siteUrl)}/icons/apple-touch-icon.png" width="64" height="64" alt="פיצה סוסי" style="display:block;border:0;border-radius:16px">
    </td></tr>
    <tr><td style="padding:24px 24px 8px;font-size:16px;line-height:1.6;text-align:right">${body}</td></tr>
    <tr><td style="padding:16px 24px 24px;font-size:12px;line-height:1.6;color:${SOFT};text-align:right;border-top:1px solid #eee">
      פיצה סוסי · דאלית אל-כרמל · <a href="tel:+972548880909" style="color:${SOFT}">054-8880909</a><br>
      קיבלת את המייל הזה כי ביצעת הזמנה באתר. אין כאן פרסומות.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

function lineRows(order: OrderView) {
  return order.lines
    .map((l) => {
      const extras = l.addOns
        .map((a) => (a.coverage && a.coverage !== 'whole' ? `${esc(a.name)} (${COVERAGE_LABELS[a.coverage]})` : esc(a.name)))
        .join(', ');
      return `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #f0ead8;text-align:right"><strong>${l.quantity} × ${esc(l.name)}</strong>${
          extras ? `<br><span style="color:${SOFT};font-size:14px">${extras}</span>` : ''
        }${l.note ? `<br><span style="color:#8a4b00;font-size:14px">✎ ${esc(l.note)}</span>` : ''}</td>
        <td style="padding:8px 0;border-bottom:1px solid #f0ead8;text-align:left;white-space:nowrap" dir="ltr">${formatAgorot(l.lineTotalAgorot)}</td>
      </tr>`;
    })
    .join('');
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';

export function orderConfirmationEmail(order: OrderView, siteUrl: string): EmailContent {
  const track = `${siteUrl}/order/${order.id}`;
  const when = order.readyAt ? (order.scheduled ? `מתוזמנת לשעה ${formatTime(order.readyAt)}` : `מוכנה בערך ב־${formatTime(order.readyAt)}`) : '';
  const how = order.fulfillment === 'pickup' ? 'איסוף עצמי' : 'משלוח';
  const pay = order.paymentMethod === 'on_site' ? 'תשלום במקום' : 'שולם אונליין';
  const body = `
    <h1 style="margin:0 0 6px;font-size:22px">תודה ${esc(firstName(order.customerName))}! ההזמנה התקבלה 🍕</h1>
    <p style="margin:0 0 16px;color:${SOFT}">הזמנה מס׳ <strong style="color:${INK}">${order.number}</strong> · ${how} · ${pay}${when ? ` · ${when}` : ''}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">${lineRows(order)}
      ${(order.discounts ?? []).map((d) => `<tr><td style="padding:8px 0;text-align:right;color:#15803d">${esc(d.label)}</td><td style="padding:8px 0;text-align:left;color:#15803d" dir="ltr">−${formatAgorot(d.amountAgorot)}</td></tr>`).join('')}
      ${order.deliveryFeeAgorot > 0 ? `<tr><td style="padding:8px 0;text-align:right">משלוח</td><td style="padding:8px 0;text-align:left" dir="ltr">${formatAgorot(order.deliveryFeeAgorot)}</td></tr>` : ''}
      <tr><td style="padding:12px 0 0;text-align:right;font-size:18px"><strong>סה״כ</strong></td><td style="padding:12px 0 0;text-align:left;font-size:18px" dir="ltr"><strong>${formatAgorot(order.totalAgorot)}</strong></td></tr>
    </table>
    ${button(track, 'מעקב אחרי ההזמנה')}
    <p style="margin:0;color:${SOFT};font-size:14px">בדף המעקב רואים בזמן אמת מתי ההזמנה בהכנה ומתי היא מוכנה. אפשר לבטל שם עד שההכנה מתחילה.</p>`;
  const text = [
    `תודה ${firstName(order.customerName)}! ההזמנה התקבלה.`,
    `הזמנה מס' ${order.number} · ${how} · ${pay}${when ? ` · ${when}` : ''}`,
    ...order.lines.map((l) => `${l.quantity} × ${l.name}${l.addOns.length ? ` (${l.addOns.map((a) => a.name).join(', ')})` : ''} – ${formatAgorot(l.lineTotalAgorot)}`),
    `סה"כ: ${formatAgorot(order.totalAgorot)}`,
    `מעקב: ${track}`,
    'פיצה סוסי · 054-8880909',
  ].join('\n');
  return { subject: `ההזמנה שלך #${order.number} התקבלה – פיצה סוסי`, html: layout(siteUrl, `הזמנה #${order.number} התקבלה`, body), text };
}

export function orderCancelledEmail(order: OrderView, siteUrl: string, refund: boolean): EmailContent {
  const body = `
    <h1 style="margin:0 0 6px;font-size:22px">ההזמנה #${order.number} בוטלה</h1>
    <p style="margin:0 0 12px">היי ${esc(firstName(order.customerName))}, ההזמנה שלך בוטלה.</p>
    ${refund ? `<p style="margin:0 0 12px">התשלום (${formatAgorot(order.totalAgorot)}) יוחזר לאמצעי התשלום שבו שילמת. זה יכול לקחת כמה ימי עסקים להופיע.</p>` : ''}
    <p style="margin:0 0 12px">אם לא ביקשת לבטל, או שיש שאלה – התקשרו אלינו: <a href="tel:+972548880909" style="color:${INK}">054-8880909</a>.</p>
    ${button(siteUrl, 'להזמנה חדשה')}`;
  const text = `ההזמנה #${order.number} בוטלה.${refund ? ` התשלום (${formatAgorot(order.totalAgorot)}) יוחזר לאמצעי התשלום.` : ''} לשאלות: 054-8880909`;
  return { subject: `ההזמנה #${order.number} בוטלה – פיצה סוסי`, html: layout(siteUrl, `הזמנה #${order.number} בוטלה`, body), text };
}

export function passwordResetEmail(link: string, siteUrl: string): EmailContent {
  const body = `
    <h1 style="margin:0 0 6px;font-size:22px">בחירת סיסמה לניהול</h1>
    <p style="margin:0 0 12px">התקבלה בקשה לבחור סיסמה חדשה לחשבון הניהול של פיצה סוסי.</p>
    ${button(link, 'לבחירת סיסמה')}
    <p style="margin:0;color:${SOFT};font-size:14px">הקישור חד־פעמי ובתוקף לשעה. אם לא ביקשת – אפשר להתעלם מהמייל, והסיסמה לא תשתנה.</p>`;
  const text = `בחירת סיסמה לניהול פיצה סוסי: ${link}\nהקישור חד-פעמי ובתוקף לשעה. אם לא ביקשת – אפשר להתעלם.`;
  return { subject: 'בחירת סיסמה לניהול פיצה סוסי', html: layout(siteUrl, 'קישור לבחירת סיסמה', body), text };
}
