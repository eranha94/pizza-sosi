import { test, expect } from '@playwright/test';
import { db } from '../admin';

/**
 * The full customer journey against the real backend (Functions + Firestore emulators):
 * menu → toppings on half → cart (edit, extra drink) → checkout → order page,
 * server-side price check, live status updates from the "kitchen", and cancelling.
 */
test('customer orders a pizza with half toppings and follows it live', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /פיצה בדיקה/ }).first().click();

  const sheet = page.locator('dialog.sheet[open]');
  await expect(sheet.getByRole('heading', { name: 'פיצה בדיקה' })).toBeVisible();
  // Thick dough (+5), olives on the right half (+6).
  await sheet.getByRole('radio', { name: /עבה/ }).check();
  await sheet.getByRole('checkbox', { name: 'זיתים' }).check();
  await sheet.getByRole('radio', { name: /ימין/ }).check();
  await sheet.getByRole('button', { name: /הוספה לסל · 70/ }).click();

  // Sticky cart bar on the menu.
  await expect(page.locator('.cart-bar')).toContainText('70');
  await page.locator('.cart-bar').click();

  // Cart: line shows the choices; add a suggested drink.
  await expect(page.getByText('זיתים (חצי ימין)')).toBeVisible();
  await page.getByRole('button', { name: /הוספת קולה בדיקה לסל/ }).click();
  await expect(page.locator('.summary strong')).toHaveText(/78/);

  // Edit the pizza: tuna on the whole pizza too (+13).
  await page.getByRole('button', { name: 'עריכת פיצה בדיקה' }).click();
  const edit = page.locator('dialog.sheet[open]');
  await edit.getByRole('checkbox', { name: 'טונה' }).check();
  await edit.getByRole('button', { name: /עדכון · 83/ }).click();
  await expect(page.locator('.summary strong')).toHaveText(/91/);

  await page.getByRole('link', { name: 'להמשך הזמנה' }).click();
  await page.getByLabel('שם', { exact: true }).fill('בדיקה אוטומטית');
  await page.getByLabel('טלפון', { exact: true }).fill('0521234567');
  await page.getByLabel(/מייל/).fill('e2e@example.com');
  await page.getByRole('checkbox', { name: /קראתי ואני מסכים/ }).check();
  await page.getByRole('button', { name: /שליחת ההזמנה/ }).click();

  await expect(page).toHaveURL(/\/order\/[A-Za-z0-9]+/);
  await expect(page.locator('.status')).toHaveText('הזמנה חדשה');
  const orderId = page.url().split('/order/')[1]!;

  // The server priced it itself: 59 + 5 (thick) + 6 (olives half) + 13 (tuna) + 8 (cola) = 91 ₪.
  const ref = db().doc(`orders/${orderId}`);
  const order = (await ref.get()).data()!;
  expect(order.totalAgorot).toBe(9100);
  expect(order.status).toBe('placed');
  expect(order.contact.phone).toBe('0521234567');

  // "Kitchen" moves the order – the customer's page follows live.
  await ref.update({ status: 'accepted' });
  await expect(page.locator('.status')).toHaveText('התקבלה');
  await expect(page.locator('.order-steps li.is-current')).toContainText('התקבלה');

  // Customer may still cancel at this stage.
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('button', { name: 'ביטול ההזמנה' }).click();
  await expect(page.locator('.status')).toHaveText('בוטלה');
  expect((await ref.get()).data()!.status).toBe('cancelled');

  // Next visit: details are remembered and "my orders" lists it.
  await page.goto('/my-orders');
  await expect(page.locator('.my-orders li')).toHaveCount(1);
});
