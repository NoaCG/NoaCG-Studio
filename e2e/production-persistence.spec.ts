// covers: src/components/{home,save}/**
// focus

import { test, expect, type Page } from '@playwright/test';
import { settleDurableWrites } from './_durable';

// PRODUCTION DEPENDABILITY (docs/GOALS_ARCHIVE.md "Student release" step 6): a production must
// survive everything a class throws at it - closing and reopening, a browser refresh
// mid-edit, republishing - and the operator must always be able to answer "what is
// selected, what am I editing, what is live" from the screen. The wire half (real publish,
// real slugs) is backend-gated and lives on the live checklist; what THIS file pins is
// every promise the record and the page make locally.

/** Seed a production with one pooled catalog graphic + its auto-seeded cue, off the UI. */
async function seedProduction(page: Page, name = 'Class Show'): Promise<string> {
  await page.goto('/app');
  const id = await page.evaluate(async (showName) => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const { createShowNamed, addGraphicToShow } = await import('/src/model/shows.ts');
    const template = variantsFor('lower-third')[0].create({});
    const { doc, error } = createGraphic(template, { name: 'Guest Strap', packageId: null });
    if (error || !doc) throw new Error(error ?? 'seed failed');
    const show = createShowNamed(showName);
    addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
    return show.id;
  }, name);
  // Every caller navigates the moment this returns, and a navigation aborts a write that has
  // not committed yet (e2e/_durable.ts) - the production would open missing its own graphic.
  await settleDurableWrites(page);
  return id;
}

/** The rundown's rows (the cue list's entries - selection, reorder, duplicate live here). */
function cueRows(page: Page) {
  return page.getByTestId('cue-list').locator('.pd-cue');
}

test('the rundown lifecycle persists: rename, duplicate, reorder, values - close, reopen, reload', async ({ page }) => {
  const id = await seedProduction(page);
  await page.goto(`/app#/production/${id}`);
  await expect(page.getByTestId('production-page')).toBeVisible();

  // Rename the seeded cue and give it a value + note.
  await page.getByTestId('cue-label').fill('Anna Andersson');
  await page.getByTestId('cue-note').fill('after the intro');
  await page.getByTestId('cue-field-f0').fill('Anna Andersson');
  // Duplicate it, then rename the copy - two distinct rundown rows.
  await cueRows(page).first().getByTestId('cue-menu').click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(cueRows(page)).toHaveCount(2);
  await cueRows(page).nth(1).getByTestId('select-cue').click();
  await page.getByTestId('cue-label').fill('Ben Berg');
  // Reorder: move Ben above Anna.
  await cueRows(page).nth(1).dragTo(cueRows(page).nth(0));
  await expect(cueRows(page).first()).toContainText('Ben Berg');

  // Close (Home) and reopen: everything held. HOME, not Back: this page was opened by a goto, so
  // Back would return to wherever the goto started (src/app/router.ts, in-app history depth).
  await page.getByTestId('production-home').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await page.getByTestId('home-nav-productions').click();
  await page.getByTestId('open-production').click();
  await expect(cueRows(page)).toHaveCount(2);
  await expect(cueRows(page).first()).toContainText('Ben Berg');

  // A full reload restores the same page with the same rundown (the route carries the id).
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(cueRows(page)).toHaveCount(2);
  // By the row's NAME: the copy still carries Anna's values, and a one-line row shows them.
  await cueRows(page).filter({ has: page.locator('strong', { hasText: 'Anna Andersson' }) }).getByTestId('select-cue').click();
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Anna Andersson');
  await expect(page.getByTestId('cue-note')).toHaveValue('after the intro');
});

test('a refresh mid-edit loses nothing once the draft has settled', async ({ page }) => {
  const id = await seedProduction(page);
  await page.goto(`/app#/production/${id}`);
  await page.getByTestId('cue-field-f0').fill('Typed just before the crash');
  // The cue draft flushes on a 300 ms idle; give it that and refresh like a dropped laptop.
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Typed just before the crash');
});

test('operator clarity: the editor says which cue it edits and where those edits go', async ({ page }) => {
  const id = await seedProduction(page);
  await page.goto(`/app#/production/${id}`);

  // The head answers "what am I editing, and what happens to it" without inference
  // (docs/PLAYOUT_DASHBOARD.md §2). Before a take that is the PREVIEW cue.
  const editor = page.getByTestId('cue-editor');
  await expect(editor).toContainText('EDITING PREVIEW CUE');
  await expect(page.getByTestId('cue-label')).toHaveValue('Guest Strap'); // seeded label
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
  // Update is meaningless until something of this layer is on air, and says so by being dead.
  await expect(page.getByTestId('verb-update')).toBeDisabled();

  // Take: the editor follows the cue onto air and changes what it promises about edits.
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('live-cue-chip')).toContainText('Guest Strap');
  // Not published, so the taken cue is UP, never on air (playout-workflow-simplification D12).
  await expect(editor).toContainText('EDITING UP CUE');
  await expect(editor).not.toContainText(/ON.AIR/);
  await expect(page.getByTestId('verb-update')).toBeEnabled();

  // Out clears the layer; the tally returns to honest silence and the editor to a draft.
  await page.getByTestId('verb-out').click();
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
  await expect(editor).toContainText('EDITING PREVIEW CUE');
});

test('the record survives republish-shaped edits: slugs stay, the unpublished-changes hint tells the truth', async ({ page }) => {
  const id = await seedProduction(page);
  // Simulate a published production (the RPC half is backend-gated; the RECORD contract -
  // slugs survive edits, publishedAt vs updatedAt drives the hint - is local and pinned here).
  await page.evaluate(async (showId) => {
    const { setShowHostedSlug, setShowOutputSlug } = await import('/src/model/shows.ts');
    // Output LAST: it stamps publishedAt, so the record starts CLEAN (published == updated).
    setShowHostedSlug(showId, 'test-hosted-slug');
    setShowOutputSlug(showId, 'test-output-slug');
  }, id);
  // A freshly published record must read EXACTLY clean: publishing stamps `publishedAt` and
  // `updatedAt` from one instant, so the page's `updatedAt > publishedAt` test is false. They
  // used to be two separate `nowIso()` calls one statement apart, and a clock tick between them
  // made a just-published production announce "changed after the last publish" — telling the
  // operator to publish again, about a change nobody made. Asserted on the RECORD because the
  // UI version of this only fails on the millisecond boundary that produced it.
  // REPEATED on purpose. The broken version stamps the two fields from two `nowIso()` calls
  // one statement apart, so it only diverges when the clock happens to tick between them —
  // a single publish passes it almost every time. Publishing a few hundred times spans enough
  // milliseconds that the boundary is crossed, which is what makes this assertion able to fail
  // at all (verified by putting the second `nowIso()` back and watching it go red).
  const stamps = await page.evaluate(async (showId) => {
    const { loadShows, setShowOutputSlug } = await import('/src/model/shows.ts');
    let divergent = 0;
    for (let i = 0; i < 400; i++) {
      setShowOutputSlug(showId, `slug-${i}`);
      const s = loadShows().find((x) => x.id === showId);
      if (s?.updatedAt !== s?.publishedAt) divergent++;
    }
    setShowOutputSlug(showId, 'test-output-slug'); // restore the slug the rest of the test uses
    const s = loadShows().find((x) => x.id === showId);
    return { divergent, publishedAt: s?.publishedAt ?? null, updatedAt: s?.updatedAt ?? null };
  }, id);
  expect(stamps.publishedAt).not.toBeNull();
  expect(stamps.updatedAt).toBe(stamps.publishedAt);
  expect(stamps.divergent).toBe(0);

  await page.goto(`/app#/production/${id}`);

  // Both capability links render from the stored slugs: the output in the Playout panel, the
  // control page under Setup › Links… (playout-workflow-simplification AC-3, AC-8). A freshly
  // published record offers no Publish changes, in the header's action slot or in the panel.
  await page.getByTestId('production-status').click();
  const panel = page.getByTestId('production-status-panel');
  await expect(panel.getByTestId('output-url')).toContainText('/output?production=test-output-slug');
  await expect(panel.getByTestId('panel-publish-changes')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('playout-action-slot').getByTestId('production-publish-changes')).toHaveCount(0);
  await page.getByTestId('production-setup').click();
  await page.getByTestId('setup-links').click();
  await expect(page.getByTestId('production-links').getByTestId('control-url')).toContainText('?control=test-hosted-slug');
  await page.getByTestId('production-links-close').click();

  // An edit AFTER publish: the outputs run an older snapshot, so Publish changes appears. It is an
  // action, never a status word (AC-5, D1, D2), and the panel lists it too.
  await page.getByTestId('cue-label').fill('Edited after publish');
  await page.waitForTimeout(600); // the draft flush stamps updatedAt past publishedAt
  await expect(page.getByTestId('playout-action-slot').getByTestId('production-publish-changes')).toHaveText('Publish changes');
  await expect(page.getByTestId('production-status')).not.toContainText('Unpublished changes');
  await page.getByTestId('production-status').click();
  await expect(panel.getByTestId('panel-publish-changes')).toBeVisible();

  // ...and the slugs survive the edit (URLs are persistent by contract).
  const after = await page.evaluate(async (showId) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const s = loadShows().find((x) => x.id === showId);
    return { hosted: s?.hostedSlug, output: s?.outputSlug };
  }, id);
  expect(after).toEqual({ hosted: 'test-hosted-slug', output: 'test-output-slug' });
});

test('Escape closes the playout panel before the next toggle reopens it', async ({ page }) => {
  const id = await seedProduction(page, 'Links Escape Probe');
  await page.evaluate(async (showId) => {
    const { setShowHostedSlug } = await import('/src/model/shows.ts');
    setShowHostedSlug(showId, 'test-hosted-slug');
  }, id);
  await settleDurableWrites(page);
  await page.goto(`/app#/production/${id}`);
  const panel = page.getByTestId('production-status-panel');
  await page.getByTestId('production-status').click();
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await page.getByTestId('production-status').click();
  await expect(panel.getByTestId('playout-panel-browser')).toBeVisible();
  // No Unpublish in the UI: playout-workflow-simplification AC-8.
  await expect(page.getByTestId('production-unpublish')).toHaveCount(0);
});

test('the audience and presenter links are offered separately, and only once they exist', async ({ page }) => {
  // Three capability URLs with three different audiences, and the one mistake that matters is
  // reading the wrong one out on air. The PRESENTER link had no surface at all: the pointers
  // that drive it shipped with nothing to give a presenter (docs/INTERACTIVE_PLAYOUT_PLAN.md
  // Phase 6), so `presenterPageUrl` was exported and called by nobody.
  const id = await seedProduction(page, 'Link Shapes');
  await page.goto(`/app#/production/${id}`);

  // Before publish there are no links at all: the status reads Not published beside Publish, and
  // there is no audience plane yet - a URL that would not resolve is worse than none. The Playout
  // panel carries no people links at all (AC-3, D7).
  await expect(page.getByTestId('production-publish')).toBeVisible();
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'false');
  await expect(page.getByTestId('production-status')).toHaveText(/Not published/);
  await page.getByTestId('production-status').click();
  await expect(page.getByTestId('production-status-panel')).toBeVisible();
  await expect(page.getByTestId('production-status-panel').getByTestId('presenter-url')).toHaveCount(0);
  await expect(page.getByTestId('production-status-panel').getByTestId('join-url')).toHaveCount(0);
  await page.keyboard.press('Escape');
  // This build cannot publish, so until the record holds links Setup offers no Links… at all.
  await page.getByTestId('production-setup').click();
  await expect(page.getByTestId('production-setup-menu')).toBeVisible();
  await expect(page.getByTestId('setup-links')).toHaveCount(0);
  await page.keyboard.press('Escape');
  const links = page.getByTestId('production-links');

  await page.evaluate(async (showId) => {
    const { setShowHostedSlug, setShowAudienceSlugs } = await import('/src/model/shows.ts');
    setShowHostedSlug(showId, 'test-hosted-slug');
    setShowAudienceSlugs(showId, { joinSlug: 'friday-night-live', presenterSlug: 'pv-test-slug' });
  }, id);
  // Wait for the database, not just the mirror. The reload below restores what is ON DISK, and
  // a navigation fired the instant the write returns tears the document down mid-transaction -
  // which is exactly how this test first failed, showing NOT PUBLISHED against slugs the app
  // had already accepted.
  await settleDurableWrites(page);
  // RELOAD, not goto: the page is already on this exact URL, and a same-URL goto does not
  // re-render, so the surface would still be showing the unpublished record it read on arrival.
  await page.reload();
  await page.getByTestId('production-setup').click();
  await page.getByTestId('setup-links').click();

  // Each renders in its own form: the audience one is the readable vanity path an operator
  // reads out, the presenter one its own query capability.
  await expect(links.getByTestId('join-url')).toContainText('/join/friday-night-live');
  await expect(links.getByTestId('presenter-url')).toContainText('?pv=pv-test-slug');
  await expect(links.getByTestId('copy-presenter-url')).toBeEnabled();
  await expect(links.getByTestId('copy-join-url')).toBeEnabled();

  // And they are marked by WHO THEY ARE FOR, so the public one can never be mistaken for the
  // presenter's - the whole reason they are two rows rather than one. The mark replaces the
  // explanation paragraphs and their ▸ toggles (playout-workflow-simplification AC-8, AC-10).
  await expect(links.getByTestId('join-url')).toContainText('Public');
  await expect(links.getByTestId('presenter-url')).toContainText('Private');
  await expect(links.getByTestId('control-url')).toContainText('Private');
  await expect(page.getByTestId('presenter-url-help-toggle')).toHaveCount(0);
});

test('the panel holds the browser source in one row, and Links… holds one row per capability, with no explanations', async ({ page }) => {
  // Owner report 2026-08-18: the panel had grown into a page. Five always-open paragraphs sat
  // between five rows, so the CONTROL PAGE - the link a class actually operates from - was
  // below an explanation of an SPX file most of them never download. The redesign
  // (playout-workflow-simplification AC-3, AC-8, AC-10, D6, D7) goes further: the explanations
  // and their ▸ toggles are gone, the output is one row of the Playout panel with the template
  // file as a quiet button beside Copy, and the people links moved to Setup › Links….
  const id = await seedProduction(page, 'Link Density');
  await page.goto(`/app#/production/${id}`);
  await page.evaluate(async (showId) => {
    const { setShowHostedSlug, setShowOutputSlug } = await import('/src/model/shows.ts');
    setShowOutputSlug(showId, 'test-output-slug');
    setShowHostedSlug(showId, 'test-hosted-slug');
  }, id);
  await settleDurableWrites(page);
  await page.reload();
  await page.getByTestId('production-status').click();
  const panel = page.getByTestId('production-status-panel');

  // The browser source is one row: the URL, Copy and Template file, and no explanation.
  const source = panel.getByTestId('playout-panel-browser');
  await expect(source.getByTestId('output-url')).toContainText('/output?production=test-output-slug');
  await expect(source.getByTestId('copy-output-url')).toBeEnabled();
  await expect(source.getByTestId('download-output-embed')).toHaveText('Template file');
  await expect(page.locator('.prod-link-help, .prod-link-help-toggle')).toHaveCount(0);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    source.getByTestId('download-output-embed').click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.html$/);

  // The panel stays well inside the window it pops out of - the defect that started this: under
  // half its height, with CasparCG off and nothing reporting.
  if (!(await panel.isVisible())) await page.getByTestId('production-status').click();
  const height = await panel.evaluate((el) => el.getBoundingClientRect().height);
  expect(height).toBeLessThan(page.viewportSize()!.height / 2);
  await page.keyboard.press('Escape');

  // Links…: every capability one row, and no explanation in the way.
  await page.getByTestId('production-setup').click();
  await page.getByTestId('setup-links').click();
  const links = page.getByTestId('production-links');
  await expect(links.locator('.dlg-row')).toHaveCount(3);
  await expect(links.getByTestId('output-url')).toHaveCount(0);
  await expect(links.locator('p')).toHaveCount(0);
});

test('the readable audience name: the database decides, and this build says so honestly', async ({ page }) => {
  // The vanity name is the one URL that gets SAID OUT LOUD, so an operator can claim
  // "friday-night-live" instead of spelling out base64 (docs/INTERACTIVE_PLAYOUT_PLAN.md).
  //
  // Every rule lives on the column in migration 0035 - the shape, the reserved-word list, the
  // unique index - and the claim is an ordinary owner UPDATE, so the CLAIM ITSELF is backend
  // work that belongs on the maintainer's live checklist. What is pinned here is the half an
  // offline build owns: the control exists wherever an audience link does, it refuses an empty
  // name without asking anyone, it reports the offline truth instead of pretending, and a
  // verdict never outlives the name it was about.
  const id = await seedProduction(page, 'Readable Name');
  await page.goto(`/app#/production/${id}`);
  await page.evaluate(async (showId) => {
    const { setShowHostedSlug, setShowAudienceSlugs } = await import('/src/model/shows.ts');
    setShowHostedSlug(showId, 'test-hosted-slug');
    setShowAudienceSlugs(showId, { joinSlug: 'aB3xK9zQ', presenterSlug: 'pv-test-slug' });
  }, id);
  await settleDurableWrites(page);
  await page.reload();
  // The audience name lives with the audience link under Setup › Links… (playout-workflow-simplification AC-8).
  await page.getByTestId('production-setup').click();
  await page.getByTestId('setup-links').click();

  const input = page.getByTestId('join-name-input');
  const claim = page.getByTestId('join-name-claim');
  const note = page.getByTestId('join-name-note');
  await expect(input).toBeVisible();

  // Empty is the ONE refusal that needs no server: "Use this name" stays off until a name is typed
  // (a disabled button instead of a sentence, AC-10).
  await expect(claim).toHaveText('Use this name');
  await expect(claim).toBeDisabled();
  await input.fill('   ');
  await expect(claim).toBeDisabled();
  await expect(note).toHaveCount(0);

  // A real name offline says what is actually wrong - it does not claim success, and it does not
  // pretend the name was taken.
  await input.fill('friday-night-live');
  await claim.click();
  await expect(note).toContainText('offline');

  // Typing again clears the verdict: a refusal left standing under a DIFFERENT name is a lie
  // about the name now in the box.
  await input.fill('another-name');
  await expect(note).toHaveCount(0);

  // The audience link is unchanged - nothing was claimed.
  await expect(page.getByTestId('production-links')).toContainText('/join/aB3xK9zQ');
});
