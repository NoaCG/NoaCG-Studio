import { test, expect, type Page } from '@playwright/test';
import { enableAdvancedMode } from './_create';

// ADVANCED MODE (docs/GOALS_ARCHIVE.md "Student release" step 4). The DEFAULT studio shows no editor
// doors: the wizard is the full-screen creation surface, a close lands on Home, and a saved
// graphic opens onto its CONTROL page. The Settings toggle restores every door, and a direct
// #/graphic link opens the editor in either mode. Editor-walking specs opt into Advanced via
// the e2e/_create.ts bootstrap; THIS file is the one that must not, because its subject is
// the default experience.

/** Seed one saved library graphic without touching any UI (the control page needs a record). */
async function seedGraphic(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const template = variantsFor('lower-third')[0].create({});
    const { doc, error } = createGraphic(template, { name: 'Seeded lower third', packageId: null });
    if (error || !doc) throw new Error(error ?? 'seed failed');
    return doc.id;
  });
}

test('default studio: fresh visit = full-screen wizard; closing it lands on Home, never the editor', async ({ page }) => {
  await page.goto('/app');
  const wizard = page.getByTestId('creation-wizard');
  await expect(wizard).toBeVisible();
  await expect(page).toHaveURL(/#\/new/);

  // FULL-SCREEN is the contract, not a big modal: the surface fills the viewport.
  const box = (await wizard.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(box.width).toBeGreaterThanOrEqual(viewport.width - 2);
  expect(box.height).toBeGreaterThanOrEqual(viewport.height - 2);

  // The Blank card's only outcome is the code editor, so default mode does not offer it.
  await expect(page.locator('[data-entry="template"]')).toBeVisible();
  await expect(page.locator('[data-entry="blank"]')).toHaveCount(0);

  // ✕ close: Home, with no editor door in its topbar.
  await wizard.locator('.gallery-close').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page.getByTestId('home-continue-editing')).toHaveCount(0);
});

test('default studio: a saved graphic opens onto its control page, not the editor', async ({ page }) => {
  await page.goto('/app');
  await seedGraphic(page);
  await page.getByTestId('creation-wizard').locator('.gallery-close').click();
  await expect(page.getByTestId('home-page')).toBeVisible();

  await page.getByTestId('home-nav-graphics').click();
  await page.locator('.lib-row', { hasText: 'Seeded lower third' }).getByTestId('open-graphic').click();
  await expect(page.getByTestId('graphic-control-page')).toBeVisible();

  // The row's NAME is the same door (acceptance round 2, 2026-08-05: a production's title
  // opens it, so a graphic's title must too — one handler behind both).
  await page.getByTestId('control-home').click();
  await page.getByTestId('home-nav-graphics').click();
  await page.locator('.lib-row', { hasText: 'Seeded lower third' }).getByTestId('open-graphic-name').click();
  await expect(page.getByTestId('graphic-control-page')).toBeVisible();
});

test('the Settings toggle restores the editor doors without a reload', async ({ page }) => {
  await page.goto('/app');
  await page.getByTestId('creation-wizard').locator('.gallery-close').click();
  await expect(page.getByTestId('home-page')).toBeVisible();

  // Settings is reachable from Home WITHOUT an account (the gear is not auth UI).
  await page.getByTestId('home-settings').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await page.getByTestId('advanced-mode-toggle').check();
  await page.getByTestId('settings').locator('.gallery-close').click();

  // The doors return live: Continue editing in the topbar, Blank in the wizard.
  await expect(page.getByTestId('home-continue-editing')).toBeVisible();
  await page.getByTestId('home-new-project').click();
  await expect(page.locator('[data-entry="blank"]')).toBeVisible();
});

test('default studio: Home shelf -> control page -> Edit graphic opens the NEW editor on that graphic', async ({ page }) => {
  // Owner, 2026-09-21: no door to the old editor in the default studio. Every saved graphic
  // opens onto its control page, so this button was the old editor's most-used door.
  await page.goto('/app');
  await seedGraphic(page);
  await page.getByTestId('creation-wizard').locator('.gallery-close').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await page.getByTestId('shelf-graphic').filter({ hasText: 'Seeded lower third' }).click();
  await expect(page.getByTestId('graphic-control-page')).toBeVisible();

  await page.getByTestId('control-open-editor').click();
  const guard = page.getByTestId('confirm-switch');
  const editor = page.getByTestId('editor-foundation');
  await expect(guard.or(editor)).toBeVisible();
  if (await guard.isVisible()) await guard.getByTestId('switch-discard').click();
  await expect(editor).toBeVisible();
  await expect(page).toHaveURL(/editor=foundation#\/editor-foundation$/);
  // Holding THIS graphic, still linked to its library record, so a save lands on it.
  await expect(editor.locator('.ef-current-graphic')).toHaveText('Seeded lower third');
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await expect(page.getByTestId('preview-stage')).toHaveCount(0);
});

test('advanced mode: control page -> Edit graphic opens the code editor with the graphic ON its stage', async ({ page }) => {
  await enableAdvancedMode(page);
  // THE ROUTE A PERSON TAKES, end to end. The owner reported an empty editor stage on
  // 2026-08-27 and the session that chased it could only reach the editor by deep link, where
  // the graphic was visibly fine (docs/handoffs/2026-08-27-editor-stage-blank.md, route 5) - so
  // the one route he actually walks was the one nothing covered.
  // (The default studio walks the Home shelf to this page in the test above; Advanced mode
  // boots into the editor rather than Home, so this one arrives by the control page's address.)
  await page.goto('/app');
  const id = await seedGraphic(page);
  await page.goto(`/app#/control/${id}`);
  await expect(page.getByTestId('graphic-control-page')).toBeVisible();

  await page.getByTestId('control-open-editor').click();
  // Switching the working document asks first when the current one is dirty; a spec whose
  // subject is the destination discards, exactly as _create.ts's startNewProject does.
  const guard = page.getByTestId('confirm-switch');
  const stage = page.getByTestId('preview-stage');
  await expect(guard.or(stage)).toBeVisible();
  if (await guard.isVisible()) await guard.getByTestId('switch-discard').click();
  await expect(stage).toBeVisible();

  // THE ASSERTION THE REPORT IS ABOUT: the stage settles the graphic after every rebuild, so
  // opening one must never show an empty canvas. Polled, because the settle rides the iframe's
  // own load - and read as geometry + paint, since "present in the DOM" is exactly the state
  // that would still look blank on his screen.
  const root = page.frameLocator('iframe.preview-frame').locator('body > div').first();
  await expect(root).toBeVisible();
  await expect
    .poll(
      () =>
        root.evaluate((el) => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return Math.min(r.width, r.height) > 8 && cs.visibility === 'visible' && Number(cs.opacity) > 0.9;
        }),
      { timeout: 6000 },
    )
    .toBe(true);
});

test('a direct #/graphic link opens the editor in the default mode too', async ({ page }) => {
  await page.goto('/app');
  const id = await seedGraphic(page);
  await page.goto(`/app#/graphic/${id}`);
  // The editor shell, holding the linked record: the save status reads Saved.
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await expect(page.locator('.tpl-name')).toHaveText('Seeded lower third');
});
