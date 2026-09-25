import { test, expect, type Page } from '@playwright/test';
import { E2E_EMAIL, createGraphic, createGraphicInEditor, haveCreds, settleSync, shot, signIn, wipeMyGraphics, wipeMySubmissions } from './_helpers';
import { openProductionWithCurrent, skipOldEditor } from '../_create';

// The signed-in UX walk. The 2026-07 review could only read these surfaces from source — the
// editor's account features render NOTHING offline, so the whole offline suite is blind to them.
// This spec drives them for real against the configured backend and pins the properties the
// review checked everywhere else: the topbar stays one row at laptop widths (signed in it grows
// three more controls — sync, community, the avatar), and the account-facing wording is the
// product's, not the database's.
//
// It also drops a screenshot of each surface into test-results/signed-in/ for eyeballing.

/** The topbar is ONE row when every control shares one vertical band and the last of them still
 *  ends inside the bar. Rows are counted by CENTRE, not by top: the bar centres its children, so
 *  the 34px avatar and a 26px button legitimately have different tops on the same row.
 *
 *  `widestNamePx` re-measures the overflow with the account name forced past its 12ch cap, which
 *  is the only honest way to ask whether the bar survives a long display name: the cap's unused
 *  slack cannot simply be ADDED to the overflow, because the bar carries a flex spacer that
 *  absorbs growth while it still has width of its own. Doing that arithmetic instead reported an
 *  overflow at 1600px where there was none. It is measured in the same evaluate as everything
 *  else so the widened name never survives into a screenshot or a later assertion. */
async function topbarRows(page: Page): Promise<{ rows: number; overflowPx: number; height: number; widestNamePx: number }> {
  return page.locator('.topbar').evaluate((bar) => {
    const barBox = () => bar.getBoundingClientRect();
    const overflow = () => {
      const boxes = [...bar.children].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0);
      return Math.round(Math.max(...boxes.map((r) => r.right)) - barBox().right);
    };
    const kids = [...bar.children].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0);
    const bands = new Set(kids.map((r) => Math.round((r.top + r.bottom) / 12)));

    const name = bar.querySelector('.auth-status .auth-state') as HTMLElement | null;
    let widestNamePx = overflow();
    if (name && getComputedStyle(name).display !== 'none') {
      const original = name.textContent;
      name.textContent = 'Wolfensberger';   // past 12ch in any face the topbar can use
      void bar.offsetWidth;                 // force layout before reading
      widestNamePx = overflow();
      name.textContent = original;
      void bar.offsetWidth;
    }
    return { rows: bands.size, overflowPx: overflow(), height: Math.round(barBox().height), widestNamePx };
  });
}

test.describe('signed-in UX walk (configured)', () => {
  test.skip(!haveCreds, 'set E2E_EMAIL + E2E_PASSWORD to run the signed-in walk');
  // The share-link buttons only claim "Copied" once the clipboard accepts the write, so the
  // context has to allow it — a headless context refuses by default.
  test.use({ permissions: ['clipboard-write'] });

  test('the topbar holds one row at laptop widths with the account controls in it', async ({ page }) => {
    // The bar this measures is the old code editor's (its Community button and panel toggles),
    // and that editor is closed. It skips until it is rewritten against Home's bar
    // (docs/backlog/specs-that-still-open-the-old-editor.md).
    skipOldEditor();
    await page.setViewportSize({ width: 1366, height: 768 });
    await signIn(page);
    await page.keyboard.press('Escape'); // close the wizard signIn() leaves open

    // Every signed-in-only control is really there — otherwise the fit below proves nothing.
    // The sync chip in particular: signing in is what starts the pass that makes it appear.
    await settleSync(page);
    await expect(page.getByTestId('account-button')).toBeVisible();
    await expect(page.getByRole('button', { name: /Community/ })).toBeVisible();

    // WHICH STATE THE ACCOUNT IS IN, said in a word (owner, 2026-09-04: "there's no difference
    // between being logged in or not"). The signed-OUT half is anonymous.spec.ts; this is the
    // other direction, and it has to be read ABOVE 1480px - under that step auth.css hides the
    // name, because the bar cannot carry it and the resolution line at the same time.
    await page.setViewportSize({ width: 1520, height: 900 });
    const stateWord = page.getByTestId('auth-state');
    await expect(stateWord).toBeVisible();
    // Bound to THIS account rather than merely present. The signed-in half carries the address
    // in its title (AuthStatus.tsx), which is the fact a reader on a shared machine acts on -
    // not "somebody is signed in" but "WHO". A name assertion would have to be conditional on
    // whether the test account carries a full_name; the title is exact either way. Matched
    // case-INSENSITIVELY: GoTrue stores the address lowercased and signIn() sends whatever
    // E2E_EMAIL holds, so an env var with a capital in it would fail here while the product is
    // behaving correctly - a title mismatch that reads like an auth regression.
    await expect
      .poll(async () => (await stateWord.getAttribute('title'))?.toLowerCase())
      .toBe(E2E_EMAIL.toLowerCase());
    await expect(stateWord).not.toHaveText('Not signed in');
    // The existing topbar shot is taken at 1366, where the name is hidden - so the one state
    // this change exists to show appears in no picture the suite leaves behind. This is it.
    await shot(page, 'topbar-signed-in-wide');

    // The ladder gains the widths where the name is DRAWN, which is what nothing had measured:
    // app-shell.css was measured at 1366 and below, before the name existed. 1481 is the
    // tightest viewport that still shows it and 1520 the next step boundary up; below the step
    // the name is display:none and costs nothing, so those rows measure the bar as before.
    //
    // Each row is checked twice - as rendered, and with the name forced to the 12ch the CSS
    // allows. `who` is a first name or an email's local part, so a green run on this account's
    // short one proves nothing about "Charlotte" or "broadcast.ops", and the regression at
    // stake is the account avatar hanging off the right edge.
    for (const width of [1520, 1481, 1440, 1366, 1280, 1100]) {
      await page.setViewportSize({ width, height: width >= 1400 ? 900 : 768 });
      // Settle on the step's own effect rather than on a timeout: this is a retrying assertion,
      // so it also states which side of 1480 each width is on. Reading the bar without it is a
      // race - an unsettled read reported 1440 as fitting by 9px when it was 3px over.
      if (width > 1480) await expect(stateWord).toBeVisible();
      else await expect(stateWord).toBeHidden();
      const bar = await topbarRows(page);
      expect(bar, `topbar at ${width}px`).toMatchObject({ rows: 1 });
      expect(bar.overflowPx, `topbar overflow at ${width}px`).toBeLessThanOrEqual(0);
      expect(bar.widestNamePx, `topbar overflow at ${width}px with a name at the 12ch cap`).toBeLessThanOrEqual(0);
    }

    // The loop leaves the viewport at 1100 and the shots below want a laptop. Hiding the name
    // must not cost the DISTINCTION, which is the trade the 1480 step makes: under it the
    // avatar is what says a session exists, and the signed-out bar has no avatar.
    await page.setViewportSize({ width: 1366, height: 768 });
    await expect(page.getByTestId('account-button')).toBeVisible();

    await shot(page, 'topbar-signed-in');
    await page.getByTestId('account-button').click();
    await expect(page.getByTestId('account-menu')).toBeVisible();
    await shot(page, 'account-menu');

    // Settings borrows the wizard's modal frame, which is a fixed 94vh workspace. A short
    // preferences form must not open as a full-height sheet of empty space.
    await page.getByTestId('account-menu').getByRole('menuitem', { name: /settings/i }).click();
    await expect(page.getByTestId('settings')).toBeVisible();
    await shot(page, 'settings-dialog');
    const settingsBox = (await page.getByTestId('settings').boundingBox())!;
    expect(settingsBox.height).toBeLessThan(768 * 0.85);
  });

  test('a published graphic reports its state in the product’s words, not the database’s', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await signIn(page);
    // The library syncs: start from an empty one so the saved row below is unambiguous by name.
    await settleSync(page);
    await wipeMyGraphics(page);
    await createGraphic(page, 'Lower thirds', 'Hairline');
    await page.getByTestId('save-graphic').click();
    // WHERE THE GRAPHIC GOES, in the signed-in words. The other half of anonymous.spec.ts
    // ("on this computer only"): the two states must read differently at the moment of saving,
    // not only on the topbar (owner, 2026-09-10: "a clear indication when we are logged in and
    // when we are not").
    await expect(page.getByTestId('save-where')).toContainText('any computer you sign in on');
    await expect(page.getByTestId('save-where')).not.toContainText('this computer only');
    await page.getByTestId('save-name').fill('Hairline');
    await page.getByTestId('save-confirm').click();
    await page.getByTestId('open-home').click();
    await page.getByTestId('home-nav-graphics').click();
    const hairlineRow = page.locator('.lib-row', { hasText: 'Hairline' });
    await hairlineRow.getByTestId('row-menu').click();
    await hairlineRow.getByTestId('publish-graphic').click();
    await shot(page, 'publish-sheet');
    await page.getByPlaceholder(/One-line description/).fill('E2E signed-in walk');
    await page.getByRole('button', { name: 'Publish', exact: true }).click();
    await expect(page.getByTestId('publish-sheet')).toHaveCount(0);

    // "My community templates" is an AUTHOR's surface. `approved` / `pending` / `removed` are
    // the moderation table's words; the moderator queue already translates them, and the author
    // must read the same sentence.
    const mine = page.locator('.pk-graphic', { hasText: 'Hairline' }).last();
    await expect(mine).toContainText('live');
    await expect(mine).not.toContainText('approved');
    await shot(page, 'home-my-community-templates');

    // Copying the share link is a clipboard write — invisible unless the button says so. Read
    // the button's TEXT, not its accessible name: the name comes from an aria-label naming the
    // graphic, which deliberately does not change when the label flips to "✓ Copied".
    const copy = mine.getByTitle('Copy a share link');
    await copy.click();
    await expect(copy).toContainText('Copied');

    // The gallery opens from the EDITOR topbar; Home has its own chrome.
    await page.getByTestId('home-continue-editing').click();
    await page.getByRole('button', { name: /Community/ }).click();
    await expect(page.locator('.pk-modal')).toBeVisible();
    await expect(page.locator('.pk-modal .pk-graphic').first()).toBeVisible(); // past "Loading…"
    await shot(page, 'community-gallery');
    // Same frame, same rule as Settings: a gallery holding a handful of rows is not a full-height
    // sheet. This was the shape it loaded in, too — 700px of nothing under one "Loading…" line.
    const galleryBox = (await page.locator('.pk-modal').boundingBox())!;
    expect(galleryBox.height).toBeLessThan(768 * 0.85);
    // The card's one-line metadata stays on one line: the summary claims its OWN line rather than
    // squeezing the row it shares (see .pk-modal .pk-graphic in styles.css).
    const metaHeight = await page
      .locator('.pk-modal .pk-graphic')
      .first()
      .locator('.muted')
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(metaHeight).toBeLessThanOrEqual(24);
    await page.keyboard.press('Escape');

    await wipeMySubmissions(page);
    await wipeMyGraphics(page);
  });

  test('the hosted control page publish surface speaks productions', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page);
    await settleSync(page);
    await wipeMyGraphics(page);
    await createGraphicInEditor(page, 'Lower thirds', 'Hairline');
    await page.getByTestId('save-graphic').click();
    await page.getByTestId('save-name').fill('Hairline');
    await page.getByTestId('save-confirm').click();

    await expect(page.getByTestId('save-dialog')).toBeHidden();
    // Build a one-graphic production so the hosted-publish controls become reachable. Publishing
    // lives on the production's own PAGE (docs/GOALS_ARCHIVE.md "Student release" step 8).
    await openProductionWithCurrent(page, 'Evening bulletin');
    const publish = page.getByTestId('production-publish');
    await expect(publish).toBeEnabled();
    // The cloud-playout wave renamed rundowns to productions in user-facing strings — the
    // surface must speak "production", never "show" or "rundown".
    await expect(publish).toContainText(/production/i);
    // Read the production page itself. `.control-page-main` was the hosted operator page's old
    // shell class; that surface renders the playout dashboard now, and a locator matching
    // nothing makes a "does not contain" assertion pass for the wrong reason.
    await expect(page.getByTestId('production-page')).not.toContainText(/\brundown export\b/i);
    await shot(page, 'production-page-publish');
  });
});
