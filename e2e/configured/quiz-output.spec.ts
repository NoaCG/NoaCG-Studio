import { test, expect } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { haveCreds, signIn, wipeMyGraphics } from './_helpers';

// THE PUBLISHED QUIZ PATH (docs/INTERACTIVE_PLAYOUT_PLAN.md Phase 3): the hidden-pick
// sequence driven from the production dashboard, rendered by the REAL /output page over the
// REAL hosted log — including the renderer reboot mid-sequence, which is the recovery story
// (data → snap → data) that only the live wire can prove. Screenshots land in
// test-results/signed-in/ like the other configured surfaces.

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

test('a published quiz runs the sealed sequence on the real output renderer, and survives a renderer reboot mid-lock', async ({ page, context }) => {
  test.setTimeout(240_000);
  await signIn(page);
  await page.keyboard.press('Escape'); // the wizard startNewProject left open — not this walk
  // A prior FAILED run can leave its published production behind, and the account SYNCS shows —
  // a stale record with an outputSlug then shadows this run's. Clean slate first.
  await page.evaluate(async () => {
    const { loadShows, deleteShow } = await import('/src/model/shows.ts');
    const { unpublishControlShow } = await import('/src/control/hostedControl.ts');
    for (const s of loadShows()) {
      if (s.hostedSlug || s.outputSlug) await unpublishControlShow(s.id).catch(() => {});
      deleteShow(s.id);
    }
    const { syncNow } = await import('/src/backend/syncController.ts');
    await syncNow();
  });
  await bootstrapGraphic(page, { name: 'Arena Quiz' });

  // A throwaway production, published for real.
  const showName = `Live Quiz ${Date.now()}`;
  await openProductionWithCurrent(page, showName);
  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', { timeout: 30_000 });
  // Publishing opens the links popover (the URLs are the point). Close it through its OWN
  // toggle: the shell has no backdrop element to click any more (a covering div ate the press
  // meant for whatever the operator clicked next — home/LibMenu), and Escape is a race here.
  // LibMenu registers the key handler when it OPENS, so a press landing in the gap between the
  // publish answering and the popover mounting is simply lost, and the popover then sits over
  // the page for the rest of the walk. That is what took scorebug-output red on 2026-08-25 —
  // ten seconds of `toBeHidden` watching a popover that had never seen the key. A toggle click
  // is a state flip and cannot miss.
  const links = page.getByTestId('production-links');
  await expect(links).toBeVisible();
  await page.getByTestId('production-links-toggle').click();
  await expect(links).toBeHidden();

  const outputSlug = await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((s) => s.name === name)?.outputSlug ?? null;
  }, showName);
  expect(outputSlug).toBeTruthy();

  // The REAL renderer — the page a CasparCG/OBS browser source loads. debug=1 overlays the
  // renderer's own status readout, so a failure screenshot says what it applied.
  const output = await context.newPage();
  output.on('console', (m) => console.log('[output]', m.type(), m.text()));
  output.on('pageerror', (e) => console.log('[output pageerror]', e.message));
  await output.goto(`/output?production=${encodeURIComponent(outputSlug!)}&debug=1`);
  const graphic = output.frameLocator('iframe');

  const shotBoth = async (name: string) => {
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `test-results/signed-in/${name}-dashboard.png` });
    await output.screenshot({ path: `test-results/signed-in/${name}-output.png` });
  };

  // Take. The renderer follows the log and PLAYS the board — the opacity poll is the wire
  // proof (the default question text sits in the markup either way, and the state chip feeds
  // off the local monitor; neither would catch a dead wire).
  await page.getByTestId('verb-take').click();
  await expect
    .poll(
      async () => graphic.locator('.quiz').evaluate((el) => Number(getComputedStyle(el).opacity)),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0.9);
  await expect(page.getByTestId('machine-state-chip')).toHaveText('Question', { timeout: 20_000 });
  await shotBoth('quiz-live-1-question');

  // The hidden pick: B as data (segmented + live Update), sealed without showing it.
  await page.getByTestId('cue-field-f6-opt-B').click();
  await page.getByTestId('verb-update').click();
  await expect(graphic.locator('#f6')).toHaveText('B', { timeout: 20_000 });
  await expect(graphic.locator('.quiz-option.quiz-sel')).toHaveCount(0);
  await page.getByTestId('cue-action-lock').click();
  await expect(page.getByTestId('machine-state-chip')).toHaveText('Locked, choice hidden', { timeout: 20_000 });
  await expect(graphic.locator('.quiz')).toHaveClass(/quiz-locked/, { timeout: 20_000 });
  await expect(graphic.locator('.quiz-option.quiz-sel')).toHaveCount(0);
  await shotBoth('quiz-live-2-sealed');

  // ── RENDERER REBOOT mid-sequence: reload /output. Boot recovery must rebuild the sealed
  // board — data, snap to the reported state, data again — with the lock showing and the
  // pick still hidden. This is the wire-level truth no local monitor can prove. ──
  await output.reload();
  await expect(graphic.locator('.quiz')).toHaveClass(/quiz-locked/, { timeout: 30_000 });
  await expect(graphic.locator('#f0')).toContainText('Red Planet');
  await expect(graphic.locator('.quiz-option.quiz-sel')).toHaveCount(0);
  await shotBoth('quiz-live-3-rebooted-still-sealed');

  // Reveal the choice, then the verdict, then the audience result.
  await page.getByTestId('cue-action-revealChoice').click();
  await expect(graphic.locator('.quiz-option').nth(1)).toHaveClass(/quiz-sel/, { timeout: 20_000 });
  await page.getByTestId('cue-action-judge').click();
  await expect(graphic.locator('.quiz-option').nth(1)).toHaveClass(/quiz-correct/, { timeout: 20_000 });
  await page.getByTestId('cue-field-f7').fill('12 | 61 | 18 | 9');
  await page.getByTestId('cue-action-audience').click();
  await expect(graphic.locator('.quiz-aud')).toHaveCount(4, { timeout: 20_000 });
  await expect(graphic.locator('.quiz-aud').nth(1)).toHaveText('61%');
  await shotBoth('quiz-live-4-audience-result');

  // Out, unpublish, and leave the throwaway account clean.
  await page.getByTestId('verb-out').click();
  await page.getByTestId('production-links-toggle').click();
  await page.getByRole('button', { name: /Unpublish/ }).click();
  await expect(page.getByTestId('production-mode')).toContainText('NOT PUBLISHED', { timeout: 20_000 });
  await page.evaluate(async () => {
    const { loadShows, deleteShow } = await import('/src/model/shows.ts');
    for (const s of loadShows()) deleteShow(s.id);
  });
  await wipeMyGraphics(page);
  await output.close();
});
