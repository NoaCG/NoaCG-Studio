import { test, expect } from '@playwright/test';
import { awaitPreviewAfterReload, awaitPreviewRebuild } from './_preview';
import { showCode } from './_code';
import { finishIntoEditor, enableAdvancedMode } from './_create';
import { durableValue } from './_storage';
import { chooseType, pickDesign } from './_browse';
import { settleDurableWrites } from './_durable';
import * as rules from '../scripts/rules.mjs';

// Era 5.2b: the working graphic autosaves locally and survives a reload. Startup follows
// from it: only a first-ever visit (no autosaved project) opens the wizard, and a returning
// user lands on Home. The reload test below edited the old code editor, which is closed, so it
// skips until it is rewritten (docs/backlog/specs-that-still-open-the-old-editor.md).

test('project autosave: the working graphic survives a reload', async ({ page }) => {
  await enableAdvancedMode(page);
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, 'Lower thirds');
  await pickDesign(page, 'Hairline');
  await awaitPreviewRebuild(page, async () => {
    await finishIntoEditor(page);
  });

  // A distinctive edit into the code (the pane ships closed — open it as a user would).
  await showCode(page);
  await page.locator('.editor-host .monaco-editor').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('<!-- autosave-marker-42 -->');
  await page.waitForTimeout(1200); // let the 800ms autosave debounce fire

  // It persisted to the durable store (IndexedDB), and the test that follows is a RELOAD - so
  // what has to be true is that the DATABASE holds it, not that the app's mirror does
  // (e2e/_storage.ts durableValue).
  await expect
    .poll(async () => (await durableValue(page, 'spx-gfx-project'))?.includes('autosave-marker-42') ?? false)
    .toBe(true);

  // Reload → the working template is restored, and the user lands STRAIGHT in it: no wizard
  // over a returning user's work (the wizard auto-opens only when there is no project).
  await page.reload();
  await awaitPreviewAfterReload(page);
  await expect(page.locator('.wz-modal')).toBeHidden();
  const restored = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.html;
  });
  expect(restored).toContain('autosave-marker-42');

  // The wizard stays one step away: the routed #/new opens it, and leaving the route (the
  // in-app ✕) rewinds cleanly back to the editor.
  await page.goto('/app#/new');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('.gallery-close').click();
  await expect(page.locator('.wz-modal')).toBeHidden();
  await expect(page).toHaveURL(/\/app$/);
});

test('the wizard door is on every /app surface, beside Home', async ({ page }) => {
  // Owner, 2026-08-27: "I don't get there fast enough from other views." The bar's model is
  // logo = the public front page, Home = your work, + New graphic = make something - and it
  // only held on Home and in the editor. The production DASHBOARD, the surface a show is run
  // from, had no door at all, and the video shell's opened the wizard through the store flag
  // rather than the ROUTE, so Back could not close it. One component now (components/
  // NewGraphicButton.tsx), so the surfaces cannot drift apart again. The old code editor was
  // a fifth surface until 2026-09-24; no route renders it any more (no-old-editor.spec.ts).
  await page.goto('/app');
  const ids = await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const { createShowNamed, addGraphicToShow } = await import('/src/model/shows.ts');
    const template = variantsFor('lower-third')[0].create({});
    const { doc, error } = createGraphic(template, { name: 'Door test', packageId: null });
    if (error || !doc) throw new Error(error ?? 'seed failed');
    const show = createShowNamed('Door test show');
    addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
    return { graphicId: doc.id, showId: show.id };
  });
  await settleDurableWrites(page);

  /** Walk the door on one surface: it is visible, it routes to #/new, and Back returns. */
  const walkDoor = async (hash: string, door: string) => {
    await page.goto(`/app${hash}`);
    const button = page.locator(door);
    await expect(button).toBeVisible();
    await button.click();
    // Creating REPLACES the working document, so every door routes through the
    // unsaved-changes guard (store/saveActions.ts). Discard, the choice e2e/_create.ts
    // makes for the same reason: the guard's own behaviour is library.spec.ts's subject.
    const guard = page.getByTestId('confirm-switch');
    if (await guard.isVisible()) await guard.getByTestId('switch-discard').click();
    await expect(page).toHaveURL(/#\/new/);
    await expect(page.getByTestId('creation-wizard')).toBeVisible();
    // ROUTED, not a store flag: Back closes it and lands on the surface it was opened from.
    await page.goBack();
    await expect(page.getByTestId('creation-wizard')).toBeHidden();
  };

  await walkDoor('#/home', '[data-testid="home-new-project"]');
  await walkDoor(`#/control/${ids.graphicId}`, '[data-testid="control-new-project"]');
  await walkDoor(`#/production/${ids.showId}`, '.pd-header [data-testid="new-graphic"]');
  await walkDoor('#/video', '.topbar [data-testid="new-graphic"]');

  // BESIDE HOME, in the SHARED ORDER (owner walk, 2026-08-28): logo -> Home -> + New graphic.
  // Home leads the pair, so the door is the control immediately AFTER the Home control.
  //
  // And on the LEFT of the bar, every time (owner walk, 2026-08-29): he found it right-clustered
  // on the production dashboard and on Home, so the control he reaches for most often was in a
  // different place on three surfaces out of five. Every header splits at a `.spacer`, which is
  // what "left" means here and is the half of this assertion the previous version was missing -
  // adjacency alone was satisfied by the pair sitting together at the far right.
  //
  // WHICH control is Home differs by surface and that is not drift: on Home the crumb beside
  // the logo says so, and elsewhere a labelled Home button does. The logo itself is never Home -
  // it is the site root on every surface.
  const orderOnEverySurface = [
    { hash: '#/home', door: 'home-new-project', afterSelector: '.tpl-name' },
    { hash: `#/control/${ids.graphicId}`, door: 'control-new-project', afterSelector: '[data-testid="control-home"]' },
    { hash: `#/production/${ids.showId}`, door: 'new-graphic', afterSelector: '[data-testid="production-home"]' },
    { hash: '#/video', door: 'new-graphic', afterSelector: '[data-testid="open-home"]' },
  ];
  for (const surface of orderOnEverySurface) {
    await page.goto(`/app${surface.hash}`);
    const door = page.locator(`header [data-testid="${surface.door}"]`);
    await expect(door).toBeVisible();
    // The logo is the SITE ROOT on every one of these surfaces - a link to the public front
    // page, never a second Home door (on Home that door did nothing at all).
    await expect(door.locator('xpath=ancestor::header').locator('.brand-home')).toHaveAttribute('href', '/');
    const placement = await page.evaluate(
      ([doorId, after]) => {
        const el = document.querySelector(`header [data-testid="${doorId}"]`)!;
        const header = el.closest('header')!;
        const spacer = header.querySelector('.spacer');
        const home = header.querySelector(after);
        return {
          // `home &&` is not redundant: without it, a header that lost its Home control would
          // match `previousElementSibling === null` and pass with nothing beside the door.
          followsHome: !!home && el.previousElementSibling === home,
          // Node.DOCUMENT_POSITION_FOLLOWING === 4: the spacer comes after the door.
          beforeTheSpacer: !!spacer && !!(el.compareDocumentPosition(spacer) & 4),
          // The owner's other ruling on the same walk: "I like the blue one, it doesn't need
          // to be yellow." Amber is the on-air accent, so the door must not wear it anywhere.
          amber: el.classList.contains('primary'),
        };
      },
      [surface.door, surface.afterSelector] as const,
    );
    expect(placement, `+ New graphic placement on ${surface.hash}. ${rules.text('components/link-logo-every-header-public-front')}`).toEqual({
      followsHome: true,
      beforeTheSpacer: true,
      amber: false,
    });
  }
});

test('the wizard mounts the same door: a guarded start-over mid-walk, a no-op on Entry', async ({ page }) => {
  // Owner walk, 2026-08-28: inside the wizard "the only way to get back to the starting
  // Wizard page is by pressing the X" - and ✕ discards the draft. The header now carries the
  // shared NewGraphicButton, in the shared order (logo -> Home -> + New graphic).
  await page.goto('/app#/new');
  const door = page.getByTestId('wz-new-graphic');
  await expect(door).toBeVisible();
  const beforeDoor = await page.evaluate(
    () =>
      document
        .querySelector('[data-testid="wz-new-graphic"]')
        ?.previousElementSibling?.getAttribute('data-testid') ?? null,
  );
  expect(beforeDoor).toBe('wz-home');

  // On the front page the door is a NO-OP, not a reset - and even with a DIRTY working
  // document the unsaved-changes guard must not appear, because proceeding changes nothing.
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    useTemplateStore.setState((s) => ({ saved: { ...s.saved, dirty: true } }));
  });
  await door.click();
  await expect(page.getByTestId('confirm-switch')).toBeHidden();
  await expect(page).toHaveURL(/#\/new$/);
  await expect(page.locator('[data-entry="template"]')).toBeVisible();

  // Mid-walk it is a GUARDED start-over. The guard must paint OVER the full-screen wizard
  // (SaveDialogs mounts after it in App.tsx; clicking the dialog proves the z-order - a
  // covered button fails Playwright's actionability check).
  await page.locator('[data-entry="template"]').click();
  await expect(page).toHaveURL(/#\/new\/step\//);
  await door.click();
  const guard = page.getByTestId('confirm-switch');
  await expect(guard).toBeVisible();
  await guard.getByTestId('switch-discard').click();
  await expect(page).toHaveURL(/#\/new$/);
  await expect(page.locator('[data-entry="template"]')).toBeVisible();

  // The start-over is a NAVIGATION, not a wipe: browser Back returns to the step, so
  // mid-wizard progress is never silently lost.
  await page.goBack();
  await expect(page).toHaveURL(/#\/new\/step\//);
  await expect(page.getByTestId('wz-stepcount')).toBeVisible();
});
