import { test, expect } from '@playwright/test';
import { dismissWizard, SUPABASE_URL } from './_helpers';
import { enableAdvancedMode, bootstrapGraphic, openWorkingGraphicInEditor } from '../_create';
import { chooseType, pickDesign } from '../_browse';
import { ACCOUNT_IS_FOR, NO_ACCOUNT_NEEDED } from '../../src/components/auth/accountCopy';

// Era 5.6 — the open editor. With a backend CONFIGURED, an anonymous visitor can still do the whole
// core workflow (create → preview → export) with no account; only the account features (cloud sync,
// community, AI, show chat) prompt for sign-in. Needs the configured dev server but NO credentials,
// so it runs even when E2E_EMAIL/PASSWORD are unset.

test.describe('anonymous visitor (open editor)', () => {
  test.skip(!SUPABASE_URL, 'set VITE_SUPABASE_URL to run the configured-mode suite');

  test('creates a graphic and reaches export with no account', async ({ page }) => {
    // THE STUDENT'S OWN ROUTE, which is what this test is for: wizard → Finish → export, with
    // the editor never opening. It used to walk out through the Finish step's old code-editor
    // door, which is gone for everyone since 2026-09-24 (e2e/no-old-editor.spec.ts). Exporting
    // is not a reward for opening an editor, and neither is proving that it works without an
    // account.
    await page.goto('/app');
    // No wall: the creation wizard opens straight away and no sign-in dialog is up.
    await expect(page.locator('.wz-modal')).toBeVisible();
    await expect(page.locator('.auth-card')).toHaveCount(0);

    await page.locator('[data-entry="template"]').click();
    await chooseType(page, 'Lower thirds');
    await pickDesign(page, 'Hairline');
    await page.getByTestId('wz-skip-to-finish').click();
    await expect(page.locator('.wz-finish-summary')).toContainText('Hairline');
    // The old code-editor door is absent and the export door is not.
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
    // An old-EDITOR subject (the AI panel, the Community button). That editor is closed, so
    // enableAdvancedMode skips this test until it is rewritten
    // (docs/backlog/specs-that-still-open-the-old-editor.md).
    await enableAdvancedMode(page);
    await page.goto('/app');
    await dismissWizard(page); // reach the topbar + panels underneath

    // Topbar offers Sign in (and no signed-in account status).
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await expect(page.locator('.auth-status')).toHaveCount(0);

    // WHAT THE ACCOUNT IS FOR, said at the moment we ask (owner, 2026-09-04: "I don't have a
    // really good reason for people to be logged in"). The reason is ONE sentence
    // (src/components/auth/accountCopy.ts), derived from what a signed-in visitor actually gets,
    // and it is asserted as words as well as as the constant: an emptied constant would still
    // equal itself. From the topbar there is no door, so the sentence is the whole answer and the
    // no-wall line sits under it.
    expect(ACCOUNT_IS_FOR).toMatch(/free account/);
    expect(ACCOUNT_IS_FOR).toMatch(/any computer/);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const card = page.locator('.auth-card');
    await expect(card.getByTestId('auth-reason')).toHaveText(ACCOUNT_IS_FOR);
    await expect(card.getByTestId('auth-account-for')).toHaveText(NO_ACCOUNT_NEEDED);
    await card.locator('.gallery-close').click();
    await expect(card).toHaveCount(0);

    // AI is an account feature in hosted mode: the panel shows the sign-in prompt, not controls,
    // and the prompt carries the same sentence under its own reason.
    await page.getByRole('button', { name: 'AI', exact: true }).click();
    await expect(page.getByTestId('signin-prompt')).toBeVisible();
    await expect(page.getByTestId('signin-prompt').getByTestId('signin-prompt-for')).toHaveText(ACCOUNT_IS_FOR);

    // Community opens the sign-in dialog, not an empty gallery. Through a door the door's own
    // reason leads and the sentence follows it, so a reader who came for the gallery still
    // learns what the account buys beyond the gallery.
    await page.getByRole('button', { name: /Community/ }).click();
    await expect(card).toBeVisible();
    await expect(card.getByTestId('auth-reason')).toContainText('community');
    await expect(card.getByTestId('auth-account-for')).toContainText(ACCOUNT_IS_FOR);
    await expect(card.getByTestId('auth-account-for')).toContainText(NO_ACCOUNT_NEEDED);

    // Esc closes the dialog — signing in is always optional.
    await page.keyboard.press('Escape');
    await expect(card).toHaveCount(0);
  });

  test('a session-expiry reopen says the reason and the no-wall line, not the free-account sentence', async ({ page }) => {
    // docs/backlog/session-expired-reopen-shows-the-free-account-line.md. The dialog this event
    // opens is answering a token refresh, not "why sign in at all" - the reader already has an
    // account, so the sentence written for someone who has never signed in must not appear here,
    // even though the event supplies a reason and every OTHER door with a reason shows it (the
    // Community door above is the contrasting case: same shape, ACCOUNT_IS_FOR present).
    await page.goto('/app');
    // `page.evaluate` runs in the page immediately - it does not wait for anything, unlike a
    // locator action. Dispatched before React has mounted and App.tsx's effect has attached its
    // `spx-session-expired` listener, the event fires into an empty page and is gone; nothing
    // reopens the dialog later; the assertions below then time out waiting for it. Waiting for the
    // wizard first (every other test in this file reaches it through a locator action, which
    // carries its own actionability wait) is what makes the dispatch land on a listening app.
    await expect(page.locator('.wz-modal')).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('spx-session-expired')));
    const card = page.locator('.auth-card');
    await expect(card).toBeVisible();
    await expect(card.getByTestId('auth-reason')).toContainText('Your session expired');
    await expect(card.getByTestId('auth-account-for')).toHaveText(NO_ACCOUNT_NEEDED);
    await expect(card.getByTestId('auth-account-for')).not.toContainText(ACCOUNT_IS_FOR);
    await expect(card.locator('.auth-submit')).toHaveText('Sign in');

    // The other direction: the reader is NOT locked out of signup. If they toggle to "Create a
    // free account" from this same dialog, they are now the someone the free-account sentence is
    // for - the suppression must track what is ON SCREEN (the form mode), not just why the dialog
    // first opened, or a person mid-signup from a resume gate would never see what the account
    // buys them.
    await card.locator('.auth-toggle', { hasText: 'Create a free account' }).click();
    await expect(card.locator('.auth-submit')).toHaveText('Create account');
    await expect(card.getByTestId('auth-account-for')).toContainText(ACCOUNT_IS_FOR);
    await expect(card.getByTestId('auth-account-for')).toContainText(NO_ACCOUNT_NEEDED);
    // And the reason line still names the expired session - toggling modes never loses it.
    await expect(card.getByTestId('auth-reason')).toContainText('Your session expired');
  });

  test('the topbar says which account state it is in, not only what it offers', async ({ page }) => {
    // Owner, 2026-09-04: "there's no difference between being logged in or not". Signed out, the
    // topbar used to carry a small Sign in button and nothing else - SyncStatus renders NOTHING
    // for a configured build with no session, so the bar said nothing at all about state. The
    // word is what a reader can act on: a student who believes they are signed in loses a
    // session of work to a sync that never ran.
    // The EDITOR's bar, which is the heavy one - it carries the panel toggles, Reset and the
    // beta door that Home does not. Measuring the light Home bar would prove nothing about the
    // width claim below. That editor is closed, so enableAdvancedMode skips this test until it
    // is rewritten (docs/backlog/specs-that-still-open-the-old-editor.md).
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

  test('signed out, the save dialog says the graphic stays on this computer', async ({ page }) => {
    // The state, said at the one moment it has a consequence. The topbar's "Not signed in" is
    // the quietest thing on the bar by design, and the student the owner worries about (2026-09-10)
    // is the one who never reads it and loses a lab session's work. A save is the moment they are
    // looking. The signed-in half is signed-in-ux.spec.ts, and the offline suite pins that an
    // offline build says neither (e2e/auth.spec.ts).
    await bootstrapGraphic(page, 'Hairline');
    await openWorkingGraphicInEditor(page);
    await page.getByTestId('save-graphic').click();
    const where = page.getByTestId('save-where');
    await expect(where).toContainText('on this computer only');
    await expect(where).not.toContainText('any computer you sign in on');
  });

  test('signed out, Start production says it needs an account and offers sign-in right there', async ({ page }) => {
    // Owner, production, 2026-09-22: "Start production" did NOTHING while signed out. The page
    // did ask for the sign-in dialog, but the production route never mounted one - the dialog
    // lived inside the Home, editor and video shells only, so the request set a store flag
    // nothing on screen was reading. It is mounted once in App.tsx now, for every route.
    await page.goto('/app');
    await dismissWizard(page);
    // A production of its own, made the way the model makes one, and opened by a hash change
    // rather than a reload so no durable write can be lost in between (e2e/AGENTS.md).
    const id = await page.evaluate(async () => {
      const { createShowNamed } = await import('/src/model/shows.ts');
      return createShowNamed('Logged Out Show').id;
    });
    await page.evaluate((showId) => { window.location.hash = `#/production/${showId}`; }, id);
    await expect(page.getByTestId('production-page')).toBeVisible();

    // The button is live, and its tooltip already says what it needs before anyone presses it.
    const start = page.getByTestId('production-publish');
    await expect(start).toBeEnabled();
    await expect(start).toHaveAttribute('title', /free account/);

    // Pressed: the dialog opens on THIS page, and its first line says why in plain words.
    await start.click();
    const card = page.locator('.auth-card');
    await expect(card).toBeVisible();
    await expect(card.getByTestId('auth-reason')).toContainText('puts it online');
    await expect(card.getByTestId('auth-reason')).toContainText('free account');
    await expect(card.getByTestId('auth-account-for')).toContainText(NO_ACCOUNT_NEEDED);
    await expect(card.locator('.auth-submit')).toHaveText('Sign in');
    await expect(card.locator('.auth-toggle', { hasText: 'Create a free account' })).toBeVisible();

    // Declining leaves the production exactly as it was: still local, still unpublished, and
    // the page still usable - no half-published state, and no wall.
    await card.locator('.gallery-close').click();
    await expect(card).toHaveCount(0);
    await expect(start).toBeVisible();
    await expect(page.getByTestId('production-links-toggle')).toHaveCount(0);
  });

  test('signed out, a control-panel link offers a sign-in that actually opens', async ({ page }) => {
    // The same missing mount, one route over: a control-panel link to a graphic this browser has
    // never synced shows "Sign in to open this panel", and its button used to do nothing.
    await page.goto('/app');
    await dismissWizard(page);
    await page.evaluate(() => { window.location.hash = '#/control/00000000-0000-4000-8000-000000000000'; });
    const lookup = page.getByTestId('control-lookup');
    await expect(lookup).toContainText('Sign in to open this panel');
    await lookup.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('.auth-card')).toBeVisible();
    await expect(page.locator('.auth-card').getByTestId('auth-reason')).toContainText('control panel');
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
