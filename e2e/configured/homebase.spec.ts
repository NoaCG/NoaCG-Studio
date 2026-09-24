import { test, expect } from '@playwright/test';
import { haveCreds, signIn } from './_helpers';

// The signed-in account surface: the topbar avatar opens the account menu — Home (the
// routed dashboard that replaced the homebase modal, docs/SAVED_CONTENT_MODEL.md),
// Settings (AI key + workflow defaults), Sign out. Runs against the configured backend
// with the throwaway account.

test.describe('account menu + Home (configured / signed-in)', () => {
  test.skip(!haveCreds, 'set E2E_EMAIL + E2E_PASSWORD to run the authed suite');

  test('avatar menu routes to Home and opens settings; sign out returns the Sign in button', async ({ page }) => {
    await signIn(page);
    await page.keyboard.press('Escape'); // close the wizard signIn() leaves open

    // The avatar chip replaces the old email+signout pair.
    await page.getByTestId('account-button').click();
    const menu = page.getByTestId('account-menu');
    await expect(menu).toBeVisible();
    await expect(menu).toContainText(process.env.E2E_EMAIL ?? '');

    // Home: the menu ROUTES to the dashboard. This used to go on to press Back and land in the
    // old code editor the menu was opened from; that editor is closed (2026-09-24), sign-in now
    // lands on Home, and Home is the only /app page besides the video workspace that carries this
    // menu, so there is no other page for Back to return to here.
    await menu.getByTestId('menu-home').click();
    await expect(page.getByTestId('home-page')).toBeVisible();
    await expect(page.getByTestId('home-page')).toContainText(/Graphics/);

    // Settings: AI + workflow defaults sections render.
    await page.getByTestId('account-button').click();
    await page.getByTestId('account-menu').getByRole('menuitem', { name: /settings/i }).click();
    const settings = page.getByTestId('settings');
    await expect(settings).toBeVisible();
    await expect(settings).toContainText('AI');
    await expect(settings.locator('#set-export-target')).toBeVisible();
    await page.locator('[data-testid="settings"] .gallery-close').click();

    // Sign out flows back to the anonymous topbar.
    await page.getByTestId('account-button').click();
    await page.getByTestId('account-menu').getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible({ timeout: 10_000 });
  });
});
