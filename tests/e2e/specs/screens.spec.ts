import { test, expect } from '@playwright/test';

/**
 * Not a test of behaviour: full-page screenshots of the customer journey, kept as a CI artifact ("screens"),
 * so the look on a phone and on a computer can be reviewed without a device.
 */
test('screenshots – customer journey', async ({ page }, info) => {
  const shot = (name: string) => page.screenshot({ path: `screens/${info.project.name}-${name}.png`, fullPage: true, animations: 'disabled' });
  await page.emulateMedia({ reducedMotion: 'reduce' });

  await page.goto('/');
  await expect(page.getByRole('button', { name: /פיצה בדיקה/ }).first()).toBeVisible();
  await shot('1-home');

  await page.getByRole('button', { name: /פיצה בדיקה/ }).first().click();
  const sheet = page.locator('dialog.sheet[open]');
  await sheet.locator('label', { hasText: 'זיתים' }).click();
  await page.screenshot({ path: `screens/${info.project.name}-2-dish.png`, animations: 'disabled' });
  await sheet.getByRole('button', { name: /הוספה לסל/ }).click();
  await shot('3-menu-with-cart');

  await page.locator('.cart-bar').click();
  await expect(page).toHaveURL(/\/cart/);
  await shot('4-cart');

  await page.getByRole('link', { name: 'להמשך הזמנה' }).click();
  await shot('5-checkout');
});
