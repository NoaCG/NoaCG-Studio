import { test, expect, type Page } from '@playwright/test';
import { addToProductionFromFinish, enableAdvancedMode } from './_create';
import { pickDesign } from './_browse';
import { settleDurableWrites } from './_durable';

// The wizard's FINISH step and the standalone export window.
//
// What is pinned here is the branch: everything before Finish configures the graphic, and
// Finish asks where it goes. THE PRIMARY DOOR is a production (docs/GOALS_ARCHIVE.md "Student
// release" step 6) — the road to air; Export ships just the files; the editor door is
// Advanced mode's continuation and the default studio does not offer it.

/** Walk Entry → Browse → pick a design, then Next through to the Finish step. */
async function toFinishStep(page: Page, variantName = 'Hairline') {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await pickDesign(page, variantName);
  // Fields → Style → Animation → Finish. The rail is 1:1 with the step index, so walking it
  // with Next is what a user does and what proves the new step is reachable.
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.getByTestId('wz-finish-name')).toBeVisible();
}

test('finish: the production door leads, export follows, and the editor door needs Advanced', async ({ page }) => {
  await toFinishStep(page);

  await expect(page.locator('.wz-dot').last()).toHaveText(/Finish/);
  await expect(page.getByTestId('wz-finish-production-go')).toBeVisible();
  await expect(page.getByTestId('wz-finish-export')).toBeVisible();
  // Default studio: no editor door (advanced-mode.spec.ts pins the toggle restoring it).
  await expect(page.getByTestId('wz-finish-editor')).toHaveCount(0);
  // The footer shortcuts stand down here — the door cards ARE the actions.
  await expect(page.getByTestId('wz-skip-to-finish')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Next →' })).toHaveCount(0);

  // With nothing saved yet the picker offers exactly "new production".
  await expect(page.getByTestId('wz-finish-production')).toHaveValue('new');

  // The read-back names what was actually chosen, so the branch is taken in full view.
  await expect(page.locator('.wz-finish-summary')).toContainText('Hairline');
  await expect(page.locator('.wz-finish-summary')).toContainText('1920×1080');
});

test('finish: the production door saves, pools with a seeded cue, and lands on the production page', async ({ page }) => {
  await toFinishStep(page);
  await page.getByTestId('wz-finish-name').fill('Guest Strap');
  await page.getByTestId('wz-finish-production-name').fill('Friday Show');
  await addToProductionFromFinish(page);

  // The wizard closes onto the PRODUCTION page — the road to air.
  await expect(page.getByTestId('creation-wizard')).toBeHidden();
  await expect(page).toHaveURL(/#\/production\//);
  await expect(page.getByTestId('production-page')).toBeVisible();

  const state = await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    const { loadShows } = await import('/src/model/shows.ts');
    const graphics = loadGraphics();
    const show = loadShows().find((s) => s.name === 'Friday Show');
    return {
      libraryNames: graphics.map((g) => g.name),
      pool: show?.graphics.map((g) => ({ name: g.name, linked: g.graphicId === graphics[0]?.id })) ?? [],
      cues: show?.cues?.map((c) => c.label) ?? [],
      hasLook: Boolean(show?.look?.palette?.accent),
    };
  });
  // Library record FIRST (never lose the work), pool copy with the back-link, one cue
  // auto-seeded from the field defaults, and the look captured onto the new production.
  expect(state.libraryNames).toEqual(['Guest Strap']);
  expect(state.pool).toEqual([{ name: 'Guest Strap', linked: true }]);
  expect(state.cues).toEqual(['Guest Strap']);
  expect(state.hasLook).toBe(true);
});

// ── LEAVING THE WIZARD ON PURPOSE ────────────────────────────────────────────────────────
// Two halves of one bad minute the owner walked into on 2026-09-02; the half still to build is
// scoped in docs/backlog/back-to-the-wizard.md.
// The production door used to hand a graphic to a rundown chosen in a
// dropdown and leave the wizard behind, silently, while the door beside it opened a window and
// asked something — so the quiet one was pressed by mistake, and there was no way back.

test('finish: the production door names the rundown before it leaves the wizard', async ({ page }) => {
  await toFinishStep(page);
  await page.getByTestId('wz-finish-name').fill('Guest Strap');
  await page.getByTestId('wz-finish-production-name').fill('Friday Show');
  await page.getByTestId('wz-finish-production-go').click();

  // The whole value is PRINTING the destination the dropdown let the reader walk past — a bare
  // "are you sure" would have stopped the wrong press without ever saying what was wrong.
  const ask = page.getByTestId('wz-finish-production-confirm');
  await expect(ask).toBeVisible();
  await expect(ask.getByTestId('wz-finish-production-confirm-dest')).toContainText('Friday Show');
  await expect(ask).toContainText('Guest Strap');

  // Cancel is a real answer: nothing is saved, nothing is created, and the step is still there
  // with the picker to change.
  await ask.getByTestId('wz-finish-production-confirm-cancel').click();
  await expect(ask).toBeHidden();
  await expect(page.getByTestId('wz-finish-name')).toBeVisible();
  expect(
    await page.evaluate(async () => {
      const { loadGraphics } = await import('/src/model/library.ts');
      const { loadShows } = await import('/src/model/shows.ts');
      return loadGraphics().length + loadShows().length;
    }),
  ).toBe(0);

  // And the door still works when the answer is yes.
  await addToProductionFromFinish(page);
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
});

test('back after creating returns to the wizard, warns, and replaces rather than duplicates', async ({ page }) => {
  await page.goto('/app');
  // AN OLDER PRODUCTION EXISTS. The picker falls back to the FIRST saved production when
  // nothing points it anywhere, so a walk-back that forgot where it had been would default to
  // this one and append a second copy of the graphic to a show the reader never named.
  await page.evaluate(async () => {
    const { createShowNamed } = await import('/src/model/shows.ts');
    createShowNamed('Old Show');
  });
  await settleDurableWrites(page); // it has to survive toFinishStep's own reload
  await toFinishStep(page);
  await page.getByTestId('wz-finish-name').fill('Guest Strap');
  await page.getByTestId('wz-finish-production-pick').locator('select').selectOption('new');
  await page.getByTestId('wz-finish-production-name').fill('Friday Show');
  await addToProductionFromFinish(page);
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });

  // The walk pushed a history entry per step, so Back off the production page is the way back
  // in — and it lands on the step the walk ENDED on, not the one the entry happens to name.
  await page.goBack();
  const warn = page.getByTestId('wz-resume-confirm');
  await expect(warn).toBeVisible();
  // It NAMES what re-entering costs: the graphic is rebuilt, and the rundown copy is replaced.
  await expect(warn).toContainText('Guest Strap');
  await expect(warn).toContainText('rebuilds the graphic');
  await expect(warn).toContainText('Friday Show');
  // THE PICKER AGREES WITH THE WARNING ON THE FIRST PRESS. Finish's step reads the walk's
  // production once, when it mounts, and the wizard sets that value in the effect that re-opens
  // it — so the two have to be in the right order, and this is the press that measures it. The
  // same assertion after the SECOND press cannot: by then the first press has already left the
  // value in place, and a step that adopted it a render too late would read as correct.
  await expect(page.getByTestId('wz-finish-production').locator('option:checked')).toContainText(
    'Friday Show',
  );

  // "Leave it as it is" puts the reader back where the door had landed them — not on Home.
  await warn.getByTestId('wz-resume-confirm-cancel').click();
  await expect(warn).toBeHidden();
  await expect(page.getByTestId('production-page')).toBeVisible();

  await page.goBack();
  await expect(warn).toBeVisible();
  await warn.getByTestId('wz-resume-confirm-go').click();
  await expect(warn).toBeHidden();
  // The whole walk came back, not just the last screen: the rail is complete and the answers
  // are the ones that made the graphic.
  await expect(page.getByTestId('wz-finish-name')).toBeVisible();
  await expect(page.locator('.wz-finish-summary')).toContainText('Hairline');
  // And it still points at the production it went into, not at the oldest one — the warning
  // promised that copy would be replaced, so the picker has to agree with it.
  await expect(page.getByTestId('wz-finish-production').locator('option:checked')).toContainText('Friday Show');

  // Change the one thing the reader came back for, then finish again.
  await page.locator('.wz-dot', { hasText: 'Animation' }).click();
  await page.locator('.wz-anim', { hasText: 'Fade' }).first().click();
  await page.locator('.wz-dot', { hasText: 'Finish' }).click();
  await page.getByTestId('wz-finish-production-go').click();
  // The confirmation tells the truth about a second pass: this REPLACES, it does not add.
  const again = page.getByTestId('wz-finish-production-confirm');
  await expect(again).toContainText('takes its place');
  await again.getByTestId('wz-finish-production-confirm-go').click();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });

  // ONE library record and ONE pool entry, with the seeded cue still pointing at it. A walk
  // back that minted a second "Guest Strap" every time would make re-entry worse than no
  // re-entry at all.
  const state = await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    const { loadShows } = await import('/src/model/shows.ts');
    const graphics = loadGraphics();
    const shows = loadShows();
    const show = shows.find((s) => s.name === 'Friday Show')!;
    return {
      names: graphics.map((g) => g.name),
      pool: show.graphics.map((g) => ({ name: g.name, linked: g.graphicId === graphics[0]?.id })),
      cues: (show.cues ?? []).length,
      // The older production must be untouched: the second pass went where the first one did.
      otherPool: shows.find((s) => s.name === 'Old Show')?.graphics.length ?? -1,
    };
  });
  expect(state.names).toEqual(['Guest Strap']);
  expect(state.pool).toEqual([{ name: 'Guest Strap', linked: true }]);
  expect(state.cues).toBe(1);
  expect(state.otherPool).toBe(0);
});

test('finish: skip-to-finish jumps from Browse once a design is picked', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await pickDesign(page, 'Hairline');
  // One click instead of four Nexts: the remaining steps keep their defaults.
  await page.getByTestId('wz-skip-to-finish').click();
  await expect(page.getByTestId('wz-finish-name')).toBeVisible();
  // The rail's forward dots unlocked too — Back to Style directly is one click.
  await page.locator('.wz-dot', { hasText: 'Style' }).click();
  // The palette grid, not the typeface picker: what this asserts is "the rail landed on
  // Style", and the picker now sits behind the collapsed Typeface row (handoff §2d), so a
  // visibility check on it would be testing the disclosure rather than the jump.
  await expect(page.locator('.wz-palettes')).toBeVisible();
  await page.locator('.wz-dot', { hasText: 'Finish' }).click();
  await expect(page.getByTestId('wz-finish-name')).toBeVisible();
});

test('finish: the editor door (Advanced) creates the project and leaves saving to the user', async ({ page }) => {
  await enableAdvancedMode(page);
  await toFinishStep(page);
  await page.getByTestId('wz-finish-name').fill('Studio Guest Strap');
  await page.getByTestId('wz-finish-editor').click();

  await expect(page.getByTestId('creation-wizard')).toBeHidden();
  // The name reaches the template itself, so the topbar and a later Save agree with it.
  await expect(page.locator('.topbar .tpl-name')).toContainText('Studio Guest Strap');
  // Nothing was written to the library: this door hands over to the editor, where Save is
  // the user's move — exactly as it was before the step existed.
  const saved = await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    return loadGraphics().length;
  });
  expect(saved).toBe(0);
});

test('finish: the export door saves the graphic and opens the export window over the wizard', async ({ page }) => {
  await toFinishStep(page);
  await page.getByTestId('wz-finish-name').fill('Match Day Strap');
  await page.getByTestId('wz-finish-export').click();

  // The editor is never revealed: the export window opens over the wizard.
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  const win = page.getByTestId('export-window');
  await expect(win).toBeVisible();
  await expect(win.locator('h2')).toContainText('Match Day Strap');

  // Every zip target is offered, and the gate is green for a catalog design.
  await expect(win.locator('input[name="export-target"]')).toHaveCount(6);
  await expect(win.locator('.status-ok')).toContainText('valid and ready to export');

  // The graphic survives the session — an export-only creation that vanished would cost the
  // user every wizard choice to get the same package back.
  const names = await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    return loadGraphics().map((g) => g.name);
  });
  expect(names).toEqual(['Match Day Strap']);

  // Closing the window leaves the user in the library, holding what they just made.
  await win.locator('.gallery-close').click();
  await expect(win).toBeHidden();
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.getByTestId('wz-home').click();
  await expect(page.getByTestId('creation-wizard')).toBeHidden();

  await page.locator('.home-nav button', { hasText: 'Graphics' }).click();
  await expect(page.locator('.lib-row')).toContainText('Match Day Strap');
});

/** Export a graphic under `name`, then rewind the wizard with ✕ and start a fresh catalog walk
 *  as far as its Finish step. The export door is what makes this reachable without leaving the
 *  wizard at all: it mints a record and stays open. */
async function exportThenRewind(page: Page, name: string): Promise<void> {
  await toFinishStep(page);
  await page.getByTestId('wz-finish-name').fill(name);
  await page.getByTestId('wz-finish-export').click();
  const win = page.getByTestId('export-window');
  await expect(win).toBeVisible();
  await win.locator('.gallery-close').click();
  await expect(win).toBeHidden();

  await page.locator('[data-testid="creation-wizard"] .gallery-close').click();
  await expect(page.locator('[data-entry="template"]')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await pickDesign(page, 'Hairline');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next →' }).click();
}

async function libraryNames(page: Page): Promise<string[]> {
  return (await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    return loadGraphics().map((g) => g.name);
  })) as string[];
}

test('finish: rewinding with ✕ makes the next graphic its own record', async ({ page }) => {
  // A SECOND PASS AND A SECOND GRAPHIC LOOK ALIKE AT THE SAVE, and only the walk tells them
  // apart. Coming back into one walk to change something writes over the record that walk made;
  // rewinding with ✕ ENDS the walk, so what the reader builds afterwards is its own graphic.
  await exportThenRewind(page, 'Match Day Strap');
  await page.getByTestId('wz-finish-name').fill('Friday Strap');
  await page.getByTestId('wz-finish-production-pick').locator('select').selectOption('new');
  await page.getByTestId('wz-finish-production-name').fill('Friday Show');
  await addToProductionFromFinish(page);
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
  await settleDurableWrites(page);

  expect(await libraryNames(page)).toEqual(['Match Day Strap', 'Friday Strap']);
});

test('finish: a second walk under a name the library holds saves over it, and says so first', async ({
  page,
}) => {
  // SUPERSEDES the old half of the test above, which pinned TWO records under one name here.
  // Its own reason for wanting two was that a write-over would happen "with nothing anywhere
  // having said so" - and since 2026-09-08 two things on this very screen say so, because the
  // twin it preferred was itself the defect: Home showed two rows nobody could tell apart, and
  // a production silently moved its link from one to the other, detaching the graphic its cues
  // were built on (e2e/import-name-collision.spec.ts reproduces that in full). A saved
  // graphic's name is its identity, in the library exactly as it always was in the pool.
  await exportThenRewind(page, 'Match Day Strap');
  await page.getByTestId('wz-finish-name').fill('Match Day Strap');

  // Said on the name field, which every door on this step shares - the export door beside the
  // production one saves and leaves without asking anything.
  await expect(page.getByTestId('wz-finish-name-taken')).toContainText(
    'Your library already has a graphic called Match Day Strap',
  );

  await page.getByTestId('wz-finish-production-pick').locator('select').selectOption('new');
  await page.getByTestId('wz-finish-production-name').fill('Friday Show');
  // ...and again in the confirmation, which is the last thing read before the write.
  await page.getByTestId('wz-finish-production-go').click();
  await expect(page.getByTestId('wz-finish-production-confirm')).toContainText(
    'is saved over the version in your library',
  );
  await page.getByTestId('wz-finish-production-confirm-go').click();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
  await settleDurableWrites(page);

  expect(await libraryNames(page)).toEqual(['Match Day Strap']);
});

test('finish: the name reaches the exported package folder', async ({ page }) => {
  await toFinishStep(page);
  await page.getByTestId('wz-finish-name').fill('Match Day Strap');
  await page.getByTestId('wz-finish-export').click();
  await expect(page.getByTestId('export-window')).toBeVisible();

  // The point of the name field. For SPX and CasparCG the slug is the TEMPLATE FOLDER inside
  // the zip AND the template file's own name — what the operator picks from in the playout
  // server. Without it every package shipped under the design's catalog name ('hairline/…').
  const files = await page.evaluate(async () => {
    const { EXPORT_TARGETS } = await import('/src/export/registry.ts');
    const { loadGraphics } = await import('/src/model/library.ts');
    const spx = EXPORT_TARGETS.find((t) => t.id === 'spx')!;
    const zip = await spx.build(loadGraphics()[0].template, { sampleData: {} });
    return Object.keys(zip.files);
  });
  expect(files).toContain('match_day_strap/match_day_strap.html');
  expect(files.some((f) => f.startsWith('hairline/'))).toBe(false);
  
  await page.getByTestId('export-window').locator('.gallery-close').click();
  await expect(page.getByTestId('export-window')).toBeHidden();

  // The wizard remains open over the home page after closing the export window
  await expect(page.getByTestId('creation-wizard')).toBeVisible();

  // Close the wizard to reveal the home page and library
  await page.getByTestId('wz-home').click();
  await expect(page.getByTestId('creation-wizard')).toBeHidden();

  await page.locator('.home-nav button', { hasText: 'Graphics' }).click();
  await expect(page.locator('.lib-row')).toContainText('Match Day Strap');
});

test('export window: a saved graphic exports from the wizard without opening the editor', async ({ page }) => {
  await toFinishStep(page);
  await page.getByTestId('wz-finish-name').fill('Match Day Strap');
  await page.getByTestId('wz-finish-export').click();
  await page.getByTestId('export-window').locator('.gallery-close').click();
  await expect(page.getByTestId('export-window')).toBeHidden();

  // The user requested that closing the export window should return to the last step of template creation
  // instead of jumping to the home page.
  await expect(page.getByTestId('wz-finish-name')).toBeVisible();

  // Now manually close the wizard to return to the home page and verify the graphic is in the library.
  await page.getByTestId('wz-home').click();
  await expect(page.getByTestId('creation-wizard')).toBeHidden();

  // The home dashboard is a shelf now, not a table; open the Graphics section to see the full row.
  await page.locator('.home-nav button', { hasText: 'Graphics' }).click();

  // Export lives in the row's ⋯ menu (step 8's three-action rows).
  const row = page.locator('.lib-row', { hasText: 'Match Day Strap' });
  await row.getByTestId('row-menu').click();
  await row.getByTestId('export-graphic').click();
  const win = page.getByTestId('export-window');
  await expect(win).toBeVisible();
  await expect(win.locator('h2')).toContainText('Match Day Strap');
  await expect(win.locator('.status-ok')).toContainText('valid and ready to export');
  // Still on Home — this door never routes into the editor.
  await expect(page).toHaveURL(/#\/home/);
});

test('export window: navigating away closes it rather than stranding it over another page', async ({ page }) => {
  await toFinishStep(page);
  await page.getByTestId('wz-finish-export').click();
  await expect(page.getByTestId('export-window')).toBeVisible();

  // The window holds a snapshot of ONE graphic; a route change is how it would otherwise
  // outlive the surface it was opened from. (The export landing now REPLACES history rather
  // than pushing, so within this flow there is no Back entry left to strand it over — any
  // route change must still close it.) The wizard's own create→navigate→open hop happens in
  // a single batched tick and must NOT trip this.
  await page.evaluate(() => {
    window.location.hash = '#/home/productions';
  });
  await expect(page.getByTestId('export-window')).toBeHidden();
});

test('finish: both doors are whole and above the fold on a short laptop', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await toFinishStep(page);

  // The doors are the LAST thing on the step, so every block above them that spends a line
  // pushes the only two controls the step exists for out of sight.
  // The feedback button now adds height, making the container scroll, but the doors must still clear the fold.
  const port = (await page.locator('.wz-step').boundingBox())!;
  for (const id of ['wz-finish-production-go', 'wz-finish-export']) {
    const box = (await page.getByTestId(id).boundingBox())!;
    expect(box.y + box.height, `${id} clears the fold`).toBeLessThanOrEqual(port.y + port.height + 0.5);
    // Whole, not merely started: a door showing its title and nothing else is the shipped bug.
    const hint = (await page.getByTestId(id).locator('.hint').boundingBox())!;
    expect(hint.y + hint.height, `${id}'s copy is not clipped`).toBeLessThanOrEqual(port.y + port.height + 0.5);
  }
});

test('style step: size and position collapse behind a disclosure', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await page.locator('.wz-variant').first().click();
  await page.getByRole('button', { name: 'Next →' }).click(); // Fields
  await page.getByRole('button', { name: 'Next →' }).click(); // Style

  const more = page.getByTestId('wz-size-position');
  await expect(more).toBeVisible();
  // A closed <details> is defeated by ANY author rule setting `display` on its children, and
  // both wizard disclosures wrap flex rows — so assert the CONTENT is really collapsed rather
  // than trusting the open attribute. `toBeVisible` cannot see this; the box can.
  const zones = page.locator('.wz-zones');
  expect(await zones.evaluate((el) => el.getBoundingClientRect().height)).toBe(0);

  await more.locator('summary').click();
  expect(await zones.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(0);

  // Choices made in there are named on the collapsed summary, so nothing set is ever hidden
  // without a trace.
  await page.locator('.wz-zone').first().click();
  await expect(more.locator('summary')).toContainText('top left');
});

test('browse step: the filter disclosure actually collapses', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.locator('[data-entry="template"]').click();

  // ONE disclosure now, at every width — the specialist facets used to sit in a `More filters`
  // <details> nested inside a phone-only drawer, so a desktop reader met five rows of facets
  // before the first design. This still measures the same regression it always did: the rows
  // are `display: flex`, and any author rule setting `display` on a disclosure's children
  // beats the UA rule that hides them — which is how "collapsed" once rendered in full.
  const rows = page.locator('.wz-browse-more .wz-filter-row');
  // Measured HEIGHT, not toBeVisible(): visibility is blind to a collapsed ancestor.
  expect(await rows.first().evaluate((el) => el.getBoundingClientRect().height)).toBe(0);
  await page.locator('.wz-browse-drawer-btn').click();
  expect(await rows.first().evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThan(0);
});

test('browse step: canvas format stays reachable with the mobile filter drawer shut', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.locator('[data-entry="template"]').click();

  // Aspect/Resolution/FPS narrow NOTHING (browseTemplates never reads them), so they must not
  // sit behind a control labelled "Filters" — a phone user going vertical would have to open
  // a filter drawer to make a decision that filters nothing.
  await expect(page.locator('.wz-browse-drawer-btn')).toBeVisible();
  await expect(page.locator('.wz-browse-filters')).toBeHidden();
  const format = page.locator('.wz-browse-format');
  await expect(format).toBeVisible();
  await expect(format.locator('select').first()).toBeVisible();
  await format.locator('select').first().selectOption('9:16');
  await expect(format.locator('select').nth(1)).toContainText('Vertical');
});
