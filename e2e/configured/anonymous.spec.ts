import { test, expect } from '@playwright/test';
import { dismissWizard, SUPABASE_URL } from './_helpers';
import { enableAdvancedMode } from '../_create';
import { chooseType, pickDesign } from '../_browse';

// Era 5.6 — the open editor. With a backend CONFIGURED, an anonymous visitor can still do the whole
// core workflow (create → preview → export) with no account; only the account features (cloud sync,
// community, AI, show chat) prompt for sign-in. Needs the configured dev server but NO credentials,
// so it runs even when E2E_EMAIL/PASSWORD are unset.

test.describe('anonymous visitor (open editor)', () => {
  test.skip(!SUPABASE_URL, 'set VITE_SUPABASE_URL to run the configured-mode suite');

  test('creates a graphic and reaches export with no account', async ({ page }) => {
    // THE STUDENT'S OWN ROUTE, which is what this test is for: wizard → Finish → export, with
    // the editor never opening. It used to walk out through the Finish step's EDITOR door, which
    // the student release put behind Advanced mode (docs/GOALS_ARCHIVE.md "Student release"
    // step 4) - so signed out, with no Advanced mode to enable it, the door this waited for
    // cannot exist. Exporting is not a reward for opening the editor, and neither is proving
    // that it works without an account.
    await page.goto('/app');
    // No wall: the creation wizard opens straight away and no sign-in dialog is up.
    await expect(page.locator('.wz-modal')).toBeVisible();
    await expect(page.locator('.auth-card')).toHaveCount(0);

    await page.locator('[data-entry="template"]').click();
    await chooseType(page, 'Lower thirds');
    await pickDesign(page, 'Hairline');
    await page.getByTestId('wz-skip-to-finish').click();
    await expect(page.locator('.wz-finish-summary')).toContainText('Hairline');
    // Signed out, the editor door is absent and the export door is not.
    await expect(page.getByTestId('wz-finish-editor')).toHaveCount(0);
    await page.getByTestId('wz-finish-export').click();

    // Export works signed out: validation and the targets are core, not account features.
    await expect(page.getByTestId('export-window')).toBeVisible();
    await expect(page.getByTestId('export-window')).toContainText(/SPX/);
    await expect(page.getByTestId('signin-prompt')).toHaveCount(0);
  });

  test('the AI door offers a free account, not just a sign-in', async ({ page }) => {
    // Anonymous Lite stays OFF by decision, so this gate is the product's whole answer to a
    // student who has no account: it must name the free account and offer making one. A lone
    // "Sign in" told them to do something they cannot do.
    await page.goto('/app');
    // The entry card has no edition or pricing language in configured mode either.
    await expect(page.locator('[data-entry="ai"] .hint')).not.toContainText(/NoaCG Lite|Free with|included/);
    await page.locator('[data-entry="ai"]').click();

    const prompt = page.getByTestId('signin-prompt');
    await expect(prompt).toBeVisible();
    await expect(prompt).toContainText(/free NoaCG account/);

    // Create-account leads, sign-in stays beside it, and the dialog opens ON the signup half.
    await prompt.getByTestId('signin-prompt-signup').click();
    await expect(page.locator('.auth-card')).toBeVisible();
    await expect(page.locator('.auth-submit')).toHaveText('Create account');
    const legal = page.locator('.auth-legal');
    await expect(legal).toHaveText(
      'By creating an account, you agree to the Terms and acknowledge the Privacy Policy.',
    );
    await expect(legal.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
    await expect(legal.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
    // Closed with the dialog's OWN ✕, not Escape: Escape reaches the wizard behind it too, and
    // a closed wizard takes the gate under test off the page.
    await page.locator('.auth-card .gallery-close').click();
    await expect(page.locator('.auth-card')).toHaveCount(0);

    await prompt.getByTestId('signin-prompt-signin').click();
    await expect(page.locator('.auth-submit')).toHaveText('Sign in');
    await page.locator('.auth-card .gallery-close').click();

    // The IMPORT half stays outside the gate — its "Open as code (no AI)" door only appears
    // once a file is dropped, so what is assertable here is that the drop zone is still live.
    await expect(page.locator('.wz-drop')).toBeVisible();
  });

  test('account features prompt for sign-in instead of walling the app', async ({ page }) => {
    // An EDITOR subject (the AI panel, the Community button), so it needs the editor - which is
    // Advanced mode now. Signing in is what turns that on for the other specs here; signed out,
    // this has to ask for it itself.
    await enableAdvancedMode(page);
    await page.goto('/app');
    await dismissWizard(page); // reach the topbar + panels underneath

    // Topbar offers Sign in (and no signed-in account status).
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.locator('.auth-status')).toHaveCount(0);

    // AI is an account feature in hosted mode: the panel shows the sign-in prompt, not controls.
    await page.getByRole('button', { name: 'AI', exact: true }).click();
    await expect(page.getByTestId('signin-prompt')).toBeVisible();

    // Community opens the sign-in dialog, not an empty gallery.
    await page.getByRole('button', { name: /Community/ }).click();
    await expect(page.locator('.auth-card')).toBeVisible();
    await expect(page.locator('.auth-card')).toContainText('community');

    // Esc closes the dialog — signing in is always optional.
    await page.keyboard.press('Escape');
    await expect(page.locator('.auth-card')).toHaveCount(0);
  });

  test('the topbar says which account state it is in, not only what it offers', async ({ page }) => {
    // Owner, 2026-09-04: "there's no difference between being logged in or not". Signed out, the
    // topbar used to carry a small Sign in button and nothing else - SyncStatus renders NOTHING
    // for a configured build with no session, so the bar said nothing at all about state. The
    // word is what a reader can act on: a student who believes they are signed in loses a
    // session of work to a sync that never ran.
    // The EDITOR's bar, which is the heavy one - it carries the panel toggles, Reset and the
    // beta door that Home does not. Measuring the light Home bar would prove nothing about the
    // width claim below. Advanced mode is what opens the editor to a signed-out visitor.
    await enableAdvancedMode(page);
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/app');
    await dismissWizard(page);
    await expect(page.getByTestId('auth-state')).toHaveText('Not signed in');
    // The offer is unchanged and still recognisable - four specs and _helpers.ts find the
    // signed-out topbar by this exact accessible name.
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();

    // AND THE WORD IS NOT FREE. app-shell.css records that the SIGNED-IN bar was 24px over at
    // 1366 before its 1400px step hid the resolution line, so auth.css hides the account NAME
    // at that same step. Signed out the bar carries neither the sync chip nor the avatar, and
    // this is the state the complaint was about, so the word survives to 1240 instead -
    // measured on 2026-09-04 at each of these widths, not assumed. The signed-in half is
    // e2e/configured/signed-in-ux.spec.ts, which reads its word at 1520. The two halves do NOT
    // share a step: the signed-in bar also carries the sync chip and the avatar, and measuring
    // it on 2026-09-05 put the name's step at 1480, not the 1400 it was first given.
    for (const width of [1366, 1280, 1250]) {
      await page.setViewportSize({ width, height: 768 });
      await expect(page.getByTestId('auth-state')).toBeVisible();
      const bar = await page.locator('.topbar').evaluate((el) => {
        const kids = [...el.children].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0);
        const bands = new Set(kids.map((r) => Math.round((r.top + r.bottom) / 12)));
        return { rows: bands.size, overflowPx: Math.round(Math.max(...kids.map((r) => r.right)) - el.getBoundingClientRect().right) };
      });
      expect(bar.rows, `signed-out topbar rows at ${width}px`).toBe(1);
      expect(bar.overflowPx, `signed-out topbar overflow at ${width}px`).toBeLessThanOrEqual(0);
    }
  });

  test('a dead reset link says so, and offers a new one', async ({ page }) => {
    // docs/backlog/password-reset-link-lands-nowhere.md. Supabase hands a rejected link back in
    // the FRAGMENT (measured 2026-09-04 against the hosted project:
    // `?recovery=1#error=access_denied&error_code=otp_expired&error_description=...`), and until
    // this route existed both an expired link and a wrong destination were the same blank page.
    // No credentials needed: nothing here reaches an account.
    await page.goto('/app?recovery=1#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    await expect(page.getByTestId('recovery-expired')).toBeVisible();
    // The provider's own words, not a shrug.
    await expect(page.getByTestId('recovery-expired')).toContainText('Email link is invalid or has expired');
    // A way forward, and a way out - a full-screen surface must never strand the reader.
    await expect(page.getByTestId('recovery-resend')).toBeVisible();
    await expect(page.getByTestId('recovery-to-studio')).toBeVisible();
    await page.getByTestId('recovery-to-studio').click();
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.getByTestId('password-recovery-page')).toHaveCount(0);
  });

  test('a reset link that predates the route still opens the recovery page', async ({ page }) => {
    // Every mail already in somebody's inbox points at bare `/app`. Supabase marks it in the
    // fragment it appends, so `type=recovery` is the key that cannot be lost - see the branch in
    // App.tsx. The token here is nonsense, so no session forms and the page must say the link
    // cannot be used rather than dropping the reader into the studio with no explanation.
    await page.goto('/app#access_token=not-a-real-token&expires_in=3600&token_type=bearer&type=recovery');
    await expect(page.getByTestId('password-recovery-page')).toBeVisible();
    await expect(page.getByTestId('recovery-expired')).toBeVisible();
  });
});
