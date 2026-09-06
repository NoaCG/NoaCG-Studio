import { test, expect, type Page } from '@playwright/test';
import { createProject } from './_create';
import { showCode } from './_code';
import { settleDurableWrites } from './_durable';

// docs/SAVED_CONTENT_MODEL.md — the graphics LIBRARY, the Save flow, routed Home, brand
// looks, and the per-graphic control panel with its ENTRIES. These are the core-product
// promises: a signed-out user saves, reopens, and operates a graphic without ever touching
// code, and browser Back/Forward walk the surfaces like pages. (Packages are retired -
// docs/GOALS_ARCHIVE.md "Student release" step 3: every save is standalone in the flat library and
// grouping for air is a PRODUCTION, covered by shows/productions specs.)

async function saveAs(page: Page, name: string) {
  await page.getByTestId('save-graphic').click();
  await expect(page.getByTestId('save-dialog')).toBeVisible();
  await page.getByTestId('save-name').fill(name);
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();
}

/** Home → Graphics → the row's ⋯ menu → Control panel. The retired Control-panels SECTION's
 *  job lives on every graphic row now (docs/GOALS_ARCHIVE.md "Student release" step 8). */
async function openControlPanel(page: Page, name: string) {
  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-graphics').click();
  const row = page.locator('.lib-row', { hasText: name });
  await row.getByTestId('row-menu').click();
  await row.getByTestId('open-control').click();
  await expect(page.getByTestId('graphic-control-page')).toBeVisible();
}

test('save names the graphic; the status stays honest through edits and reopen', async ({ page }) => {
  await createProject(page, 'Hairline');
  await expect(page.getByTestId('save-status')).toHaveText('Not saved');

  await saveAs(page, 'Presenter lower third');
  await expect(page.getByTestId('save-status')).toHaveText('Saved');

  // An edit flips the badge; Ctrl+S saves it back without a dialog.
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const s = useTemplateStore.getState();
    s.applyTemplate({ ...s.template, css: s.template.css + '\n/* tweak */\n' });
  });
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes');
  await page.keyboard.press('Control+s');
  await expect(page.getByTestId('save-status')).toHaveText('Saved');

  // A reload keeps the link (the slot carries graphicId + dirty) and lands straight back
  // in the saved graphic — no startup wizard over a returning user's work.
  await page.reload();
  await expect(page.locator('.wz-modal')).toBeHidden();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await expect(page.locator('.tpl-name')).toHaveText('Presenter lower third');
});

test('save dialog: a text-selection drag that ends on the backdrop never closes it', async ({ page }) => {
  // The backdrop closes on an OUTSIDE click — but a drag that STARTS in the name field and
  // releases over the backdrop (selecting text, overshooting the input) routes its `click` to
  // the backdrop (the nearest common ancestor of press and release), which used to shut the
  // dialog and discard everything typed. The pressedOnBackdrop guard requires the PRESS to have
  // begun on the backdrop too.
  await createProject(page, 'Hairline');
  await page.getByTestId('save-graphic').click();
  const dialog = page.getByTestId('save-dialog');
  await expect(dialog).toBeVisible();

  const input = page.getByTestId('save-name');
  await input.fill('Half-typed important name');
  const box = (await input.boundingBox())!;
  // Press inside the field, drag left onto the bare backdrop, release there.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(12, 12, { steps: 8 });
  await page.mouse.up();

  // The dialog stays open and the typed name is intact.
  await expect(dialog).toBeVisible();
  await expect(input).toHaveValue('Half-typed important name');

  // A genuine press-and-release on the backdrop still cancels.
  await page.mouse.click(12, 12);
  await expect(dialog).toBeHidden();
});

test('Home lists the library; Back walks the history; an old package link lands on Home', async ({ page }) => {
  await createProject(page, 'Hairline');
  await saveAs(page, 'Presenter lower third');

  await page.getByTestId('open-home').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  // The DASHBOARD carries a shelf of recent graphics; the library ROWS belong to the Graphics
  // section, which is where the ⋯ menu and the per-row doors live.
  await expect(page.getByTestId('shelf-graphic').filter({ hasText: 'Presenter lower third' })).toBeVisible();

  // Graphics section → the row's ⋯ menu → the control panel → Back returns to Home
  // (history is real). The per-graphic control panel lives one step from every row.
  await page.getByTestId('home-nav-graphics').click();
  const row = page.locator('.lib-row', { hasText: 'Presenter lower third' });
  await row.getByTestId('row-menu').click();
  await row.getByTestId('open-control').click();
  await expect(page.getByTestId('graphic-control-page')).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId('home-page')).toBeVisible();

  // A bookmarked pre-retirement package link degrades to Home, never a dead surface.
  await page.evaluate(() => { window.location.hash = '#/package/00000000-0000-4000-8000-000000000000'; });
  await expect(page.getByTestId('home-page')).toBeVisible();

  // Continue editing returns to the editor with the same document.
  await page.getByTestId('home-continue-editing').click();
  await expect(page.locator('.tpl-name')).toHaveText('Presenter lower third');
});

test('a first-ever visit is offered creation, not a door to an empty Home', async ({ page }) => {
  // Nothing saved anywhere (a fresh context): "Continue working" would be the loudest card on
  // the screen and would lead to an empty Home, so it stays away until there IS work.
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await expect(page.getByTestId('wz-continue')).toHaveCount(0);
  await expect(page.locator('[data-entry="template"]')).toBeVisible();
});

test('the wizard leads with the Home card once there is saved work, and it lands on Home', async ({ page }) => {
  // The old per-graphic "Recent" chips are gone deliberately: in the default studio they
  // opened the EDITOR (the demoted surface). Saved work continues from Home's rows.
  await createProject(page, 'Hairline');
  await saveAs(page, 'Presenter lower third');
  await page.getByTestId('open-home').click(); // → Home (the logo is the front page now)
  await expect(page.getByTestId('home-page')).toBeVisible();
  await page.getByTestId('home-new-project').click(); // → the wizard route
  await expect(page.getByTestId('wz-continue')).toBeVisible();
  await expect(page.getByTestId('wz-continue')).toContainText('Home');
  await expect(page.locator('.wz-recent-chip')).toHaveCount(0);
  await page.locator('[data-entry="continue"]').click();
  await expect(page.locator('.wz-modal')).toBeHidden();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page.getByTestId('home-search')).toBeVisible();
});

test('the wizard header carries its own Home door', async ({ page }) => {
  // Home is reachable from inside the wizard - it just is not the LOGO's job any more (the
  // logo is the public front page; e2e/wizard-shell.spec.ts pins that pair). ✕ only rewinds
  // to the front page, so without this button a reader three steps in could not get back to
  // their own work.
  await createProject(page, 'Hairline');
  await saveAs(page, 'Presenter lower third');
  await page.getByTestId('open-home').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await page.getByTestId('home-new-project').click();
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.getByTestId('wz-home').click();
  await expect(page.locator('.wz-modal')).toBeHidden();
  await expect(page.getByTestId('home-page')).toBeVisible();
});

test('opening another graphic with unsaved changes asks first; Discard proceeds', async ({ page }) => {
  await createProject(page, 'Hairline');
  await saveAs(page, 'First graphic');
  // Second graphic, saved, then dirtied.
  await createProject(page, { category: 'lower-third', index: 1 });
  await saveAs(page, 'Second graphic');
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const s = useTemplateStore.getState();
    s.applyTemplate({ ...s.template, css: s.template.css + '\n/* dirty */\n' });
  });
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes');

  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-graphics').click(); // the library rows live in the section
  await page.locator('.lib-row', { hasText: 'First graphic' }).getByTestId('open-graphic').click();
  await expect(page.getByTestId('confirm-switch')).toBeVisible();
  await page.getByTestId('switch-discard').click();
  await expect(page.locator('.tpl-name')).toHaveText('First graphic');
});

test('a graphic row opens from its NAME, the same door a production row offers', async ({ page }) => {
  // Acceptance round 2, 2026-08-05: pressing a production's title opens it, so a graphic's
  // title must too — reaching for "Open" on the far right of every row was the papercut.
  await createProject(page, 'Hairline');
  await saveAs(page, 'Named door');
  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-graphics').click();
  const row = page.locator('.lib-row', { hasText: 'Named door' });

  // This bootstrap runs in ADVANCED mode, where Open means the editor — so the name must mean
  // the editor too (one handler behind both doors). The DEFAULT studio's half of the same
  // contract is pinned in advanced-mode.spec.ts, the file that must not opt into Advanced.
  await row.getByTestId('open-graphic-name').click();
  await expect(page.locator('.tpl-name')).toHaveText('Named door');
});

test('a saved graphic\'s control panel: entries create, play with the active entry, persist', async ({ page }) => {
  await createProject(page, 'Hairline');
  await saveAs(page, 'Presenter lower third');
  await openControlPanel(page, 'Presenter lower third');

  // Three entries — the operator's rundown rows.
  await page.getByTestId('add-entry').click();
  await page.getByTestId('add-entry').click();
  await page.getByTestId('add-entry').click();
  await expect(page.locator('.control-entry')).toHaveCount(3);

  // Fill the active entry; its first field becomes the label; ▶ Play carries it to the graphic.
  await page.getByTestId('entry-field-f0').fill('Anna Andersson');
  await page.getByTestId('entry-field-f1').fill('Presenter');
  await expect(page.locator('.control-entry.active')).toContainText('Anna Andersson');
  await page.getByTestId('control-play').click();
  const frame = page.locator('.control-page-preview iframe');
  await expect(frame.contentFrame().locator('#f0')).toHaveText('Anna Andersson');
  await expect(frame.contentFrame().locator('#f1')).toHaveText('Presenter');

  // Switch to another entry and play the same graphic again with ITS data.
  await page.locator('.control-entry').nth(0).getByTestId('select-entry').click();
  await page.getByTestId('entry-field-f0').fill('Michael Smith');
  await page.getByTestId('play-entry').nth(0).click();
  await expect(frame.contentFrame().locator('#f0')).toHaveText('Michael Smith');

  // Entries persist on the saved graphic across a reload.
  await page.reload();
  await expect(page.getByTestId('graphic-control-page')).toBeVisible();
  await expect(page.locator('.control-entry')).toHaveCount(3);
  await expect(page.locator('.control-entry', { hasText: 'Anna Andersson' })).toBeVisible();

  // Back returns to Home's graphics section (history is real).
  await page.goBack();
  await expect(page.getByTestId('home-page')).toBeVisible();
});

test('the control panel says what an ENTRY is, and pools the graphic into a production from there', async ({ page }) => {
  // Owner walk 2026-08-23, two findings on one surface: he had to guess what an entry was, and
  // after test-playing a graphic here he looked for "+ Production" and found only a trip back
  // to Home. Both are answered where the question is asked.
  await createProject(page, 'Hairline');
  await saveAs(page, 'Cup Final Strap');
  await openControlPanel(page, 'Cup Final Strap');

  // The DEFINITION, in place — not a description of the surface, which the line under it does.
  await expect(page.getByTestId('entries-explainer')).toContainText('one saved set of field values');

  // "+ Production" mints one and lands on its page with the graphic pooled.
  await page.getByTestId('control-add-production').click();
  await expect(page.getByTestId('control-production-menu')).toBeVisible();
  await page.getByTestId('control-new-production-name').fill('Cup Final');
  await page.getByTestId('control-new-production').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(1);

  // Back on the panel, the SAME picker now offers that production and marks the graphic as
  // already in it — the door is the shared component, not a second implementation.
  await page.goBack();
  await expect(page.getByTestId('graphic-control-page')).toBeVisible();
  await page.getByTestId('control-add-production').click();
  await expect(page.getByTestId('control-production-menu')).toContainText('Cup Final');
  await expect(page.getByTestId('control-production-menu')).toContainText('in it');
});

test('switching entries re-settles the SAME preview document instead of reloading it', async ({ page }) => {
  // An operator steps a rundown by switching entries, and the preview used to be KEYED on the
  // active entry — so every switch tore the document down and rebuilt it: GSAP re-parsed, fonts
  // re-fetched, the graphic re-composed, for a change of a few strings. The entry's data must
  // still land without a take; only the reload goes away.
  await createProject(page, 'Hairline');
  await saveAs(page, 'Rundown graphic');
  await openControlPanel(page, 'Rundown graphic');

  await page.getByTestId('add-entry').click();
  await page.getByTestId('entry-field-f0').fill('Michael Smith');
  await page.getByTestId('add-entry').click();
  await page.getByTestId('entry-field-f0').fill('Anna Andersson');
  await expect(page.locator('.control-entry')).toHaveCount(2);

  // Typing does not reach the preview (that is ⟳ Update's job) — SELECTING an entry does.
  const frame = page.locator('.control-page-preview iframe');
  await page.locator('.control-entry').nth(0).getByTestId('select-entry').click();
  await expect(frame.contentFrame().locator('#f0')).toHaveText('Michael Smith');

  // Mark THIS document. A reload mints a new window, so the mark is how the spec can tell a
  // re-settle from a rebuild — the DOM text alone looks identical either way.
  await frame.contentFrame().locator('body').evaluate(() => {
    (window as unknown as { __probe?: string }).__probe = 'alive';
  });

  await page.locator('.control-entry').nth(1).getByTestId('select-entry').click();

  // The switch still shows the selected entry's data at rest, with no take.
  await expect(frame.contentFrame().locator('#f0')).toHaveText('Anna Andersson');

  // …and it is the same document that was carrying the previous entry.
  const probe = await frame.contentFrame().locator('body').evaluate(
    () => (window as unknown as { __probe?: string }).__probe ?? null,
  );
  expect(probe).toBe('alive');
});

test('the control panel reports the state and greys an event the machine would drop', async ({ page }) => {
  // Parity with the editor's Rehearse panel, the event strip and the hosted page: all three
  // poll the runtime's pointers and grey an illegal event. This surface shipped with neither,
  // so a live operator had no on-air indication and every button looked pressable.
  await createProject(page, { category: 'quiz' });
  await saveAs(page, 'Quiz board');
  await openControlPanel(page, 'Quiz board');

  // The chip names where the preview is, and it is what the greying is judged against. It
  // says the state's NAME, never its id (controlModel.ts formatMachineState).
  await expect(page.getByTestId('control-state')).toContainText('Question');
  await expect(page.getByTestId('control-event-revealChoice')).toBeDisabled(); // only sealed offers it
  await expect(page.getByTestId('control-event-lock')).toBeEnabled(); // the hidden-pick flow seals from here
  await expect(page.getByTestId('control-event-select')).toBeEnabled();

  await page.getByTestId('control-event-select').click();
  await expect(page.getByTestId('control-state')).toContainText('Answer selected');
  await expect(page.getByTestId('control-event-lock')).toBeEnabled(); // legal from Selected
  await expect(page.getByTestId('control-event-judge')).toBeDisabled();

  // An entry's ✕ is ARMED, like Home's graphic delete — one stray click cost the whole row.
  await page.getByTestId('add-entry').click();
  await expect(page.locator('.control-entry')).toHaveCount(1);
  await page.getByTestId('delete-entry').click();
  await expect(page.getByTestId('delete-entry')).toHaveText('Delete?');
  await expect(page.locator('.control-entry')).toHaveCount(1); // still there
  await page.getByTestId('delete-entry').click();
  await expect(page.locator('.control-entry')).toHaveCount(0);
});

test('the control panel shows the graphic at rest before any take, and says how to get Home', async ({ page }) => {
  await createProject(page, 'Hairline');
  await saveAs(page, 'Settled at rest');
  await openControlPanel(page, 'Settled at rest');

  // A graphic is hidden until play(), so an unsettled preview is an empty black rectangle.
  // The panel settles it on load: the operator sees what they are about to air, no take needed.
  const frame = page.locator('.control-page-preview iframe');
  await expect(frame.contentFrame().locator('#f0')).toBeVisible();
  await expect
    .poll(async () => frame.contentFrame().locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');

  // The graphic is FITTED to the stage, not stretched: a 1920×1080 template rendered into a
  // ~1060px panel would show a lower third at nearly twice its real share of frame, and an
  // operator preview that lies about composition is worse than none.
  const fit = await page.evaluate(() => {
    const f = document.querySelector('.control-page-preview iframe') as HTMLIFrameElement;
    const stage = document.querySelector('.control-page-stage')!.getBoundingClientRect();
    const box = f.getBoundingClientRect();
    // offsetWidth is the UNTRANSFORMED layout width; getBoundingClientRect is after scale.
    return { fw: f.offsetWidth, boxW: box.width, stageW: stage.width, stageH: stage.height, boxH: box.height };
  });
  expect(fit.fw).toBe(1920); // the iframe carries the template's OWN resolution…
  expect(fit.boxW).toBeLessThanOrEqual(fit.stageW + 1); // …and is scaled to fit the stage
  expect(fit.boxH).toBeLessThanOrEqual(fit.stageH + 1);

  // The frame edge is drawn on the scaled frame: over black, an operator judging headroom
  // against a void cannot tell safe area from off-screen.
  const edge = await page.evaluate(() => {
    const r = document.querySelector('.control-page-frame')!.getBoundingClientRect();
    const f = document.querySelector('.control-page-preview iframe')!.getBoundingClientRect();
    return { dw: Math.abs(r.width - f.width), dh: Math.abs(r.height - f.height) };
  });
  expect(edge.dw).toBeLessThanOrEqual(2);
  expect(edge.dh).toBeLessThanOrEqual(2);

  // The cue row is an operator target, not a rehearsal control: comfortable hit areas, and
  // "Next" reads as a word rather than a bare chevron. Size alone is not enough - a scaled
  // preview once pushed this row clean off the bottom of the window while every button still
  // measured 44px, so assert the operator can actually SEE it.
  const view = page.viewportSize()!;
  for (const id of ['control-play', 'control-update', 'control-next', 'control-stop']) {
    const box = (await page.getByTestId(id).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.y + box.height).toBeLessThanOrEqual(view.height);
  }
  await expect(page.getByTestId('control-next')).toContainText('Next');

  // A leaf surface needs a labelled way back — the wordmark alone was the only route.
  await page.getByTestId('control-home').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
});

test('a Home card shows the real graphic, parked at its settled on-air state', async ({ page }) => {
  await createProject(page, 'Hairline');
  await saveAs(page, 'Presenter lower third');

  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-graphics').click(); // the library rows live in the section
  const row = page.locator('.lib-row', { hasText: 'Presenter lower third' });
  await expect(row.getByTestId('graphic-thumb')).toBeVisible();

  // The card is a LIVE render, not a stored picture — the template's own fields are inside it,
  // carrying the graphic's data. A stale or blank thumbnail fails right here.
  const thumb = row.locator('.gfx-thumb iframe').contentFrame();
  await expect(thumb.locator('#f0')).not.toBeEmpty();

  // And the entrance is parked at its END: an unsettled card would still be at opacity 0
  // (every house entrance reveals the CSS-hidden root as its first beat).
  await expect(async () => {
    const opacity = await thumb.locator('#f0').evaluate((el) => getComputedStyle(el).opacity);
    expect(Number(opacity)).toBeGreaterThan(0.9);
  }).toPass();

  // It follows the graphic rather than a snapshot: renaming (via the row's ⋯ menu) leaves the
  // same live render in place.
  await row.getByTestId('row-menu').click();
  await row.getByTestId('rename-graphic').click();
  await page.getByTestId('rename-input').fill('Anchor lower third');
  await page.getByTestId('rename-input').press('Enter');
  const renamed = page.locator('.lib-row', { hasText: 'Anchor lower third' });
  await expect(renamed.getByTestId('graphic-thumb')).toBeVisible();
  await expect(renamed.locator('.gfx-thumb iframe').contentFrame().locator('#f0')).not.toBeEmpty();
});

test('a Home card frames on the GRAPHIC, at both card sizes, without cropping it', async ({ page }) => {
  // A lower third is a band across a fraction of a 1920×1080 frame: scaled whole-canvas into a
  // 144px card it is an unreadable smear. The card measures the graphic's own box and zooms onto
  // that (preview/frameGraphic.ts). Nothing else in the suite can tell the two apart — a card
  // that quietly went back to the whole-canvas view keeps every other assertion green.
  await createProject(page, 'Hairline');
  await saveAs(page, 'Presenter lower third');
  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-graphics').click(); // the library rows live in the section

  const row = page.locator('.lib-row', { hasText: 'Presenter lower third' });
  const card = row.getByTestId('graphic-thumb');
  await expect(card).toBeVisible();
  // The graphic's own root, found the way the framing code finds it — never a class name, which
  // would tie this to one category's markup.
  const graphic = row.locator('.gfx-thumb iframe').contentFrame().locator('body > div').first();

  /** What the graphic occupies of the card, and how far it spills past its edges. */
  const framing = async () => {
    const box = (await card.boundingBox())!;
    const g = (await graphic.boundingBox())!;
    return {
      cardW: box.width,
      fill: g.width / box.width,
      spill: Math.max(box.x - g.x, g.x + g.width - (box.x + box.width)),
      centred: Math.abs(g.x + g.width / 2 - (box.x + box.width / 2)),
    };
  };

  // Settling and measuring happen after load, so poll rather than race them.
  await expect.poll(async () => (await framing()).fill, { timeout: 5000 }).toBeGreaterThan(0.6);
  const wide = await framing();
  // Zoomed, but never past the card: a framing that cropped the design would read as a
  // different graphic. A small tolerance for the glow/shadow that sits outside the box.
  expect(wide.spill).toBeLessThan(4);
  expect(wide.centred).toBeLessThan(4);

  // The compact card (phone, LIST view) shrinks the box and the framing follows — the same
  // graphic, smaller, still framed rather than cropped or left as a speck.
  //
  // The view toggle is part of the walk now: the library's default is the CARD grid, where a
  // phone gets ONE column and the thumbnail is therefore BIGGER than the dashboard's, not
  // smaller. The list view is where the compact fixed box lives, so that is where the
  // shrink-and-reframe behaviour this test is about can be observed at all.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('home-nav-graphics').click();
  await page.getByTestId('library-view-list').click();
  await expect(card).toBeVisible();
  await expect.poll(async () => (await framing()).cardW).toBeLessThan(wide.cardW);
  // Poll the value actually being asserted, exactly as the wide case above does. Resizing the
  // card and reframing the graphic inside it are two steps, not one: the box shrinks on layout,
  // and preview/frameGraphic.ts re-measures and re-zooms afterwards. Polling only `cardW` and
  // then reading `fill` therefore waits for the first step and asserts on the second, so a fast
  // enough run samples the intermediate frame where the card is already narrow and the graphic
  // is still whole-canvas - measured at fill 0.213 against this 0.6 floor. It survived this long
  // because everything else was slow enough to hide it.
  await expect.poll(async () => (await framing()).fill, { timeout: 5000 }).toBeGreaterThan(0.6);
  const narrow = await framing();
  expect(narrow.spill).toBeLessThan(4);
});

test('phone width: every row action is reachable, the text stays two lines, the nav scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createProject(page, 'Hairline');
  await saveAs(page, 'Presenter lower third with a very long broadcast name');
  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-graphics').click();

  const row = page.locator('.lib-row').first();
  await expect(row).toBeVisible();

  // The row keeps THREE visible controls (step 8's action model: Open, + Production, ⋯) —
  // each a 44px touch target sitting inside the 390px viewport. The old seven-button strip
  // is the thing this redesign removed.
  for (const id of ['open-graphic', 'add-to-production', 'row-menu']) {
    const box = (await row.getByTestId(id).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }

  // The rarer actions live behind ⋯ and open INSIDE the viewport.
  await row.getByTestId('row-menu').click();
  for (const id of ['open-control', 'export-graphic', 'delete-graphic']) {
    const box = (await page.getByTestId(id).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
  }
  // Escape closes it. At this width the open menu covers most of its own row, so there is no
  // stable "harmless outside pixel" to aim at here — that half of the shell's closing contract
  // is pinned where it actually matters, moving between two popovers in one press
  // (library-bulk.spec.ts, productions.spec.ts).
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('export-graphic')).toHaveCount(0);

  // Name and metadata are single ellipsized lines, not a wrapped stack.
  const nameBox = (await row.locator('.lib-info strong').boundingBox())!;
  const metaBox = (await row.locator('.lib-info .muted').boundingBox())!;
  expect(nameBox.height).toBeLessThanOrEqual(24);
  expect(metaBox.height).toBeLessThanOrEqual(24);

  // No page-level horizontal overflow.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // The section nav is ONE chip row (scrollable if it overflows), not a ragged half-screen
  // grid: every chip sits on the same line. (Four sections may or may not overflow 390px, so
  // the one-row fact is asserted directly rather than via scrollWidth.)
  const nav = page.locator('.home-nav');
  expect((await nav.boundingBox())!.height).toBeLessThanOrEqual(80);
  const chipTops = await nav.locator('button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().top));
  expect(new Set(chipTops.map((t) => Math.round(t))).size).toBe(1);
});

test('video and graphics stay separate but connected: #/video, back to graphics, never trapped', async ({ page }) => {
  await createProject(page, 'Hairline');
  await page.evaluate(() => {
    window.location.hash = '#/video';
  });
  await expect(page.getByTestId('video-shell')).toBeVisible();
  await expect(page.locator('.video-workspace-badge')).toContainText('Video');
  await page.getByTestId('back-to-graphics').click();
  await expect(page.locator('.tpl-name')).toHaveText('Hairline');
});

test('looks: capture the current look in Home, apply it to another graphic, survive reload', async ({ page }) => {
  // Moved from the retired packets.spec.ts (packages removed): brand LOOKS are their own
  // store and stay first-class.
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });

  // Tweak the accent through the Style panel, then capture the look in Home.
  await page.getByTestId('dock-tab-style').click();
  await page
    .getByTestId('style-var-accent')
    .first()
    .locator('input.grow')
    .fill('#12e29a');
  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-looks').click();
  await page.getByPlaceholder(/Look name/).fill('Mint look');
  await page.getByRole('button', { name: 'Save current look' }).click();
  await expect(page.locator('.lib-row', { hasText: 'Mint look' })).toBeVisible();

  // The look survives a full reload (localStorage) and applies to a FRESH graphic. A fresh
  // graphic matters for determinism too: whether the autosave (800 ms debounce) caught the
  // accent tweak before the reload decides if the restored project already carries it — and
  // applying a look that is already active changes nothing, so nothing would highlight.
  await page.reload();
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' }); // the wizard opens on load — make the fresh graphic
  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-looks').click();
  await page.locator('.lib-row', { hasText: 'Mint look' }).getByRole('button', { name: 'Apply', exact: true }).click();
  // Apply returns to the editor (the look retints the OPEN graphic).
  const css = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.css;
  });
  expect(css).toContain('--accent: #12e29a');
  // The applied change is highlighted in the CSS tab — for a user who has the code pane open
  // (it ships closed; applying a look works either way, this asserts what they'd then see).
  await showCode(page);
  await expect(page.locator('.tabs .tab.active')).toHaveText('CSS');
  await expect(page.locator('.editor-host .changed-line').first()).toBeVisible();
});

test('a look carries SHAPE, and never grafts a token onto a design that reads none', async ({ page }) => {
  // Colour and typeface alone never made one design read as another's sibling: a glass card
  // and a sport slab can share a palette and still look like two products, because what
  // separates them is radius, blur, edge and accent weight. Driven through the model rather
  // than the UI - the two halves below are properties of capture/apply, and the surface that
  // calls them is already covered by the look test above.
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  const out = await page.evaluate(async () => {
    const { variantById, CATALOG } = await import('/src/templates/catalog.ts');
    const { captureLookFromTemplate, applyLookToTemplate } = await import('/src/model/packets.ts');
    const { getCssVariable } = await import('/src/model/cssVars.ts');

    const source = variantById('lt08').create({}); // Frosted Card - glass: a real radius and blur
    const look = captureLookFromTemplate(source);
    const sourceRadius = getCssVariable(source.css, 'panel-radius');

    // A design that DECLARES the token takes the look's value...
    const taker = (CATALOG['lower-third'] ?? [])
      .filter((v) => v.id !== 'lt08')
      .map((v) => v.create({}))
      .find((t) => {
        const r = getCssVariable(t.css, 'panel-radius');
        return r !== null && r !== sourceRadius;
      });
    // ...and one that declares NONE must not acquire it.
    const abstainer = (CATALOG['lower-third'] ?? [])
      .map((v) => v.create({}))
      .find((t) => getCssVariable(t.css, 'panel-radius') === null);

    return {
      sourceRadius,
      capturedNumeric: 'font-numeric' in (look.tokens ?? {}),
      takerBefore: taker ? getCssVariable(taker.css, 'panel-radius') : null,
      takerAfter: taker ? getCssVariable(applyLookToTemplate(taker, look).css, 'panel-radius') : null,
      abstainerAfter: abstainer ? getCssVariable(applyLookToTemplate(abstainer, look).css, 'panel-radius') : 'NO-ABSTAINER',
    };
  });

  expect(out.sourceRadius).toBeTruthy();
  expect(out.takerBefore).not.toBe(out.sourceRadius); // the fixture is only meaningful if it starts different
  expect(out.takerAfter).toBe(out.sourceRadius);
  // The dead-knob rule: a design consuming no --panel-radius must not gain one from a look.
  expect(out.abstainerAfter).toBeNull();
  // --font-numeric is DERIVED from the typeface in use; carrying a captured one would push the
  // source's numeric face onto a target whose own face needs a different answer.
  expect(out.capturedNumeric).toBe(false);
});

test('the save dialog is sized by its content, not by the wizard it borrows styling from', async ({ page }) => {
  // It wears `.wz-modal`, which is sized for the wizard's full-height multi-step surface —
  // so a name field and two buttons used to sit in a 900px-tall box of empty panel.
  await createProject(page, 'Hairline');
  await page.getByTestId('save-graphic').click();
  await expect(page.getByTestId('save-dialog')).toBeVisible();
  const box = (await page.getByTestId('save-dialog').boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.height).toBeLessThan(420);
  expect(box.height).toBeLessThan(viewport.height * 0.6);
});

test('the list view is a real table: headings over their own columns, and the toggle sticks', async ({ page }) => {
  await createProject(page, 'Hairline');
  await saveAs(page, 'Opening Strap');
  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-graphics').click();

  // The card grid is the default and carries no table chrome.
  await expect(page.getByTestId('library-thead')).toHaveCount(0);
  await page.getByTestId('library-view-list').click();
  await expect(page.getByTestId('library-thead')).toBeVisible();

  // Every heading sits over the cell it names (re-design/handoff.md §5c). The heading row and
  // the graphic rows are two separate grids sharing one column template, so this is the thing
  // that can silently drift — and `toBeVisible()` would say nothing about it.
  const row = page.locator('.lib-row--list').first();
  const head = page.getByTestId('library-thead');
  for (const [index, cell] of [[2, 'row-type'], [3, 'row-edited']] as const) {
    const headBox = (await head.locator('span').nth(index).boundingBox())!;
    const cellBox = (await row.getByTestId(cell).boundingBox())!;
    expect(Math.abs(headBox.x - cellBox.x)).toBeLessThan(2);
  }
  await expect(row.getByTestId('row-type')).toHaveText('Lower third');

  // The FOLDER column is OFF at the root, where every row is unfiled by construction
  // (docs/SAVED_CONTENT_MODEL.md §6) — it printed one dash down the whole page. It comes back
  // for a SEARCH, the one level that crosses folders, and the TRACK comes back with it: a cell
  // dropped without its column slides every heading right of the values under it (§5c).
  await expect(head.locator('span')).toHaveCount(6);
  await expect(row.getByTestId('row-folder')).toHaveCount(0);
  await page.getByTestId('home-search').fill('Opening');
  await expect(head.locator('span')).toHaveCount(7);
  const searchRow = page.locator('.lib-row--list').first();
  await expect(searchRow.getByTestId('row-folder')).toHaveText('—');
  const folderHead = (await head.locator('span').nth(4).boundingBox())!;
  const folderCell = (await searchRow.getByTestId('row-folder').boundingBox())!;
  expect(Math.abs(folderHead.x - folderCell.x)).toBeLessThan(2);
  await page.getByTestId('home-search').fill('');
  await expect(page.getByTestId('library-thead').locator('span')).toHaveCount(6);

  // The choice is a device preference, so it survives a reload rather than resetting to cards.
  await page.reload();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page.getByTestId('library-thead')).toBeVisible();

  // Selecting marks the row and floats the bar BELOW the list — a bar above the rows puts the
  // verbs at the other end of a long library from the things being ticked.
  await row.getByTestId('select-graphic').click();
  const bar = (await page.getByTestId('bulk-bar').boundingBox())!;
  const rowBox = (await row.boundingBox())!;
  expect(bar.y).toBeGreaterThan(rowBox.y);
  await expect(row).toHaveClass(/selected/);
});

test('the Graphics header is one row, and the type chips and sort narrow and reorder it', async ({ page }) => {
  await page.goto('/app#/home/graphics');
  await page.keyboard.press('Escape');
  await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const strap = variantsFor('lower-third')[0].create({});
    const crawl = variantsFor('ticker')[0].create({});
    createGraphic(strap, { name: 'Zulu Strap' });
    createGraphic(strap, { name: 'Alpha Strap' });
    createGraphic(crawl, { name: 'Mike Ticker' });
  });
  // Accepted is not landed, and the reload below tears the page down (e2e/_durable.ts).
  await settleDurableWrites(page);
  // A RELOAD, not a second goto to the hash this page is already on: /app is hash-routed, so a
  // navigation that does not change the hash fires no `hashchange`, the router never runs, and
  // this already-rendered page keeps showing the empty library the seeds were written into. That
  // shape failed three of six runs in library-bulk.spec.ts (measured 2026-08-15, its seed helper
  // carries the full note); here it would read as the chips narrowing nothing.
  await page.reload();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page.getByTestId('select-graphic')).toHaveCount(3);

  // ONE row: the title, the search, the sort and the view toggle share a line. Two bands of
  // chrome before the first graphic is most of a laptop's fold (re-design/handoff.md §5b).
  const tops = await page
    .locator('.lib-viewbar > h2, .lib-viewbar .lib-search, .lib-viewbar .lib-sort, .lib-viewbar .lib-viewtoggle')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
  expect(tops).toHaveLength(4);
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(16);

  // Chips are DERIVED from the library — the count is what is there, not a fixed strip.
  await expect(page.getByTestId('type-chip-all')).toContainText('3');
  await expect(page.getByTestId('type-chip-lower-third')).toContainText('Lower thirds');
  await expect(page.getByTestId('type-chip-lower-third')).toContainText('2');
  await expect(page.getByTestId('type-chip-ticker')).toContainText('Tickers');

  await page.getByTestId('type-chip-lower-third').click();
  await expect(page.locator('.lib-row')).toHaveCount(2);
  // The chip counts keep counting the whole library, so picking one never renumbers the rest.
  await expect(page.getByTestId('type-chip-all')).toContainText('3');
  await page.getByTestId('type-chip-lower-third').click(); // pressing the active chip clears it
  await expect(page.locator('.lib-row')).toHaveCount(3);

  // Sort reorders the SAME rows rather than filtering them.
  const names = () => page.locator('.lib-row .lib-name-link strong').allTextContents();
  await page.getByTestId('library-sort').selectOption('name');
  expect(await names()).toEqual(['Alpha Strap', 'Mike Ticker', 'Zulu Strap']);
  await page.getByTestId('library-sort').selectOption('newest');
  expect((await names())[0]).toBe('Mike Ticker');
});
