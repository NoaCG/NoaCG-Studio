import { test, expect, type Page } from '@playwright/test';
import {
  createGraphicInEditor,
  dismissWizard,
  E2E_PASSWORD,
  haveCreds,
  settleSync,
  signIn,
  wipeMyGraphics,
} from './_helpers';

// Account essentials (docs/GOALS_ARCHIVE.md "Student release" step 9), against the real backend:
// the Settings Account section (email + password change + sign out), the forgot-password
// door, and explicit session recovery: lost sessions must SAY so and never cost local
// work. The offline halves (zero auth UI) are pinned in e2e/auth.spec.ts.

test.describe('account essentials', () => {
  test.skip(!haveCreds, 'needs E2E_EMAIL/E2E_PASSWORD');

  async function openAccountSection(page: Page) {
    await page.keyboard.press('Escape'); // close the wizard if it is covering the topbar
    await page.getByTestId('account-button').click();
    await page.getByTestId('account-menu').getByRole('menuitem', { name: /Settings/ }).click();
    await expect(page.getByTestId('settings')).toBeVisible();
    await expect(page.getByTestId('settings-account')).toBeVisible();
  }

  test('Settings shows the account: email, password change round-trip, sign out', async ({ page }) => {
    await signIn(page);
    await openAccountSection(page);
    await expect(page.getByTestId('account-email')).toContainText('@');

    // Mismatched confirmation never reaches the server.
    await page.getByTestId('account-password').fill('new-password-1');
    await page.getByTestId('account-password-confirm').fill('different');
    await page.getByTestId('account-password-save').click();
    await expect(page.getByTestId('account-note')).toContainText('do not match');

    // The real round-trip: change it, then change it BACK so the shared test account keeps
    // its env credentials. The restore runs in finally — a mid-test failure must not strand
    // the account on the temporary password.
    const temp = `${E2E_PASSWORD}-tmp1`;
    try {
      await page.getByTestId('account-password').fill(temp);
      await page.getByTestId('account-password-confirm').fill(temp);
      await page.getByTestId('account-password-save').click();
      await expect(page.getByTestId('account-note')).toContainText('✓ Password changed', { timeout: 15_000 });
    } finally {
      await page.evaluate(async (original) => {
        const { updatePassword } = await import('/src/backend/auth.ts');
        await updatePassword(original);
      }, E2E_PASSWORD);
    }

    // Sign out from the same section closes Settings and drops the session.
    await page.getByTestId('account-sign-out').click();
    await expect(page.getByTestId('settings')).toHaveCount(0);
    // Home and the paused account notice can both offer Sign in during library release.
    // The assertion is about Home; the two-second release fault is recorded in the repair receipt.
    await expect(page.getByTestId('home-page').getByRole('button', { name: 'Sign in', exact: true })).toBeVisible({ timeout: 15_000 });
    // A deliberate sign-out is NOT an expired session — no prompt with the expiry reason.
    await expect(page.locator('.auth-card')).toHaveCount(0);
  });

  test('the sign-in dialog offers the forgot-password path', async ({ page }) => {
    await page.goto('/app');
    await dismissWizard(page);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    // INTERCEPT THE RESET CALL. This used to fire a real reset email at the test account on every
    // run, and Supabase's built-in SMTP allows a couple an hour - so the more the suite was run,
    // the more reliably it failed, with the dialog honestly reporting "email rate limit exceeded"
    // and the spec reading it as a missing confirmation. What belongs to this product is the
    // email-only form and what it says afterwards; whether Supabase agrees to send is theirs.
    await page.route('**/auth/v1/recover*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    );
    await page.getByTestId('forgot-password').click();
    // Email-only form; sending reports the next step (Supabase answers success either way —
    // no user enumeration — so this fires a real, harmless reset email at the test account).
    await expect(page.locator('#auth-pass')).toHaveCount(0);
    await page.locator('#auth-email').fill(process.env.E2E_EMAIL ?? '');
    await page.locator('.auth-card').getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.locator('.auth-note')).toContainText('Check your email', { timeout: 15_000 });
  });

  test('a lost session offers explicit recovery; local work survives and sync resumes', async ({ page }) => {
    await signIn(page);
    await settleSync(page);
    await wipeMyGraphics(page);
    await createGraphicInEditor(page, 'Lower thirds', 'Hairline');
    await page.getByTestId('save-graphic').click();
    await page.getByTestId('save-name').fill('Survives expiry');
    await page.getByTestId('save-confirm').click();
    await expect(page.getByTestId('save-dialog')).toBeHidden();
    await expect(page.getByTestId('save-status')).toHaveText('Saved');

    // Simulate the session DYING (not the user's Sign out): drop it through the Supabase
    // client directly, bypassing backend/auth.signOut and its deliberate-sign-out flag —
    // exactly what a revoked/expired refresh token looks like to the app.
    await page.evaluate(async () => {
      const { getSupabase } = await import('/src/backend/supabase.ts');
      const sb = await getSupabase();
      await sb!.auth.signOut({ scope: 'local' });
    });

    // Account loss raises an actionable notice, never an unsolicited modal.
    const notice = page.getByTestId('account-save-notice');
    await expect(notice).toContainText('Account editing paused', { timeout: 15_000 });
    await expect(notice).toContainText('Sign in again');
    await expect(notice).toContainText('Pending work is preserved');
    await expect(page.locator('.auth-card')).toHaveCount(0);

    // Local work is untouched while signed out.
    const names = await page.evaluate(async () => {
      const { loadGraphics } = await import('/src/model/library.ts');
      return loadGraphics().map((g) => g.name);
    });
    expect(names).toContain('Survives expiry');

    // The user's explicit recovery choice resumes sync without losing anything.
    await notice.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('.auth-card')).toBeVisible();
    await expect(page.getByTestId('auth-reason')).toContainText('resume account editing');
    await page.locator('#auth-email').fill(process.env.E2E_EMAIL ?? '');
    await page.locator('#auth-pass').fill(E2E_PASSWORD);
    await page.locator('.auth-card').getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('.auth-card')).toBeHidden({ timeout: 20_000 });
    await expect(notice).toHaveCount(0);
    await page.getByTestId('open-home').click();
    await expect(page.getByTestId('home-page')).toBeVisible();
    await settleSync(page);
    await page.getByTestId('home-nav-graphics').click();
    await expect(page.locator('.lib-row', { hasText: 'Survives expiry' })).toBeVisible();
    const after = await page.evaluate(async () => {
      const { loadGraphics } = await import('/src/model/library.ts');
      return loadGraphics().map((g) => g.name);
    });
    expect(after).toContain('Survives expiry');
    await wipeMyGraphics(page);
  });
});
