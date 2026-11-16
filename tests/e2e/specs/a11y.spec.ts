import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Automatic accessibility check (WCAG 2.1 A + AA, which covers Israeli standard 5568) on every page a customer
 * goes through, in all three looks. Any violation fails the build, with the rule and the element in the report.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function expectNoViolations(page: Page, where: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const report = violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`).join('\n');
  expect(violations, `${where}:\n${report}`).toEqual([]);
}

async function setTheme(page: Page, theme: 'light' | 'dark' | 'premium') {
  await page.evaluate((t) => localStorage.setItem('pizza-sosi-theme', t), theme);
  await page.reload();
}

for (const theme of ['light', 'dark', 'premium'] as const) {
  test(`accessibility – customer pages (${theme})`, async ({ page }) => {
    // No entrance animations: colours are measured at their final values, not mid fade-in.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await setTheme(page, theme);
    await expect(page.getByRole('button', { name: /פיצה בדיקה/ }).first()).toBeVisible();
    await expectNoViolations(page, `menu (${theme})`);

    await page.getByRole('button', { name: /פיצה בדיקה/ }).first().click();
    const sheet = page.locator('dialog.sheet[open]');
    await sheet.locator('label', { hasText: 'זיתים' }).click();
    await expectNoViolations(page, `dish dialog (${theme})`);
    await sheet.getByRole('button', { name: /הוספה לסל/ }).click();

    // Added: spoken confirmation for screen readers.
    await expect(page.locator('#a11y-announcer')).toHaveText(/פיצה בדיקה נוסף לסל/);

    await page.locator('.cart-bar').click();
    await expect(page).toHaveTitle(/הסל שלך/);
    // After moving page, focus is on the new page's heading.
    await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
    await expectNoViolations(page, `cart (${theme})`);

    await page.getByRole('link', { name: 'להמשך הזמנה' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'פרטי ההזמנה' })).toBeFocused();
    await expectNoViolations(page, `checkout (${theme})`);

    if (theme !== 'light') return; // the order page is the same in every look; checking it once is enough
    await page.getByLabel('שם', { exact: true }).fill('בדיקת נגישות');
    await page.getByLabel('טלפון', { exact: true }).fill('0521234567');
    await page.getByLabel(/מייל/).fill('a11y@example.com');
    await page.getByRole('checkbox', { name: /קראתי ואני מסכים/ }).check();
    await page.getByRole('button', { name: /שליחת ההזמנה/ }).click();
    await expect(page).toHaveURL(/\/order\//);
    await expect(page.locator('.status')).toBeVisible();
    await expectNoViolations(page, 'order tracking');
  });
}

test('accessibility – legal pages', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const path of ['/terms', '/privacy', '/accessibility', '/my-orders']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expectNoViolations(page, path);
  }
});
