import { test, expect } from '@playwright/test';
import { dropSvg, intoProduction, QUIZ_SVG } from '../_svg-import';
import { haveCreds, signIn, wipeMyGraphics } from './_helpers';

// THE IMPORTED QUIZ ON THE REAL HOSTED WIRE (docs/GRAPHIC_BEHAVIOUR_PLAN.md §10).
//
// `e2e/import-svg-behaviour.spec.ts` proves the same board twice offline — once against the
// production page's local monitors, once as an exported folder opened from disk. Both leave one
// question open, and it is the one that matters for the class: does artwork somebody DREW behave
// when it is published and rendered by the /output page over the hosted command log?
//
// Two things only this run can answer:
//
//  1. **The drawn states cross the wire.** Everything the offline walk asserts happens in a
//     document this page built. Here the renderer is a separate page that has never seen the
//     wizard, following a log written to Supabase.
//  2. **BOOT RECOVERY repaints them.** This is the real risk, and it is specific to the pilot.
//     A snap replays states with callbacks SUPPRESSED (animRuntime), so the paint that a state's
//     timeline would have fired never runs — the drawn layers are put back only because
//     `paintQuizState()` reads the machine's state on the trailing `update()`. A renderer reboot
//     mid-lock is exactly the sequence that finds out whether that hook is right, and the
//     catalog quiz's own version of this defect (its first take airing a graphic and taking it
//     straight back off) is why the spec beside this one exists.
//
// Screenshots land in test-results/signed-in/ like every other configured surface, so the run
// leaves frames a person can read rather than only a green tick.

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

test('an imported quiz board publishes, runs on the real output renderer, and repaints its drawn states after a reboot', async ({ page, context }) => {
  test.setTimeout(240_000);
  await signIn(page);

  // A prior FAILED run can leave a published production behind, and the account SYNCS shows — a
  // stale record with an outputSlug would shadow this run's. Clean slate first (the catalog
  // quiz walk's opening, for the same reason).
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

  // Draw it, import it, bind it — the student's own path, not a catalog pick.
  await page.goto('/app');
  await dropSvg(page, QUIZ_SVG);
  await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('quiz');
  const showName = `Imported Quiz ${Date.now()}`;
  await intoProduction(page, 'Olympics quiz', showName);

  // Publish for real.
  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', { timeout: 30_000 });
  // Publishing opens the links popover; its own toggle closes it (quiz-output.spec.ts says why
  // that rather than Escape, and why not a backdrop).
  const links = page.getByTestId('production-links');
  await expect(links).toBeVisible();
  await page.getByTestId('production-links-toggle').click();
  await expect(links).toBeHidden();

  const outputSlug = await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((s) => s.name === name)?.outputSlug ?? null;
  }, showName);
  expect(outputSlug).toBeTruthy();

  // THE REAL RENDERER — the page a CasparCG or OBS browser source loads. `debug=1` overlays its
  // own status readout, so a failure screenshot says what it applied.
  const output = await context.newPage();
  output.on('console', (m) => console.log('[output]', m.type(), m.text()));
  output.on('pageerror', (e) => console.log('[output pageerror]', e.message));
  await output.goto(`/output?production=${encodeURIComponent(outputSlug!)}&debug=1`);
  const graphic = output.frameLocator('iframe');
  // THE DRAWN LAYERS ARE ADDRESSED BY THEIR ROLE STAMP, never by an id. The behaviour
  // compiler (templates/importedDesign/behaviour.ts) marks every bound layer with a
  // `data-noacg-role` token and one class pair, and deliberately claims no id namespace of
  // its own - so the `#q-sel-2` this walk used to look for is a layer nothing stamps any
  // more, not a layer that failed to light. `e2e/import-svg-behaviour.spec.ts` walks the same
  // board offline through these same selectors, which is what keeps the two runs honest.
  const drawn = (role: string) => graphic.locator(`[data-noacg-role~="${role}"]`);
  const ON = /imported-design-on/;
  const lit = graphic.locator('.imported-design-look.imported-design-on');

  const shotBoth = async (name: string) => {
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `test-results/signed-in/${name}-dashboard.png` });
    await output.screenshot({ path: `test-results/signed-in/${name}-output.png` });
  };

  // The answer key and the pick, then air. Both are segmented pickers, not selects — few enough
  // options that the control model draws them that way.
  await page.getByTestId('cue-field-f5-opt-C').click();
  await page.getByTestId('cue-field-f6-opt-B').click();
  await page.getByTestId('verb-take').click();

  // The opacity poll is the WIRE proof: the artwork's own text sits in the markup either way, and
  // the state chip feeds off the LOCAL monitor — neither would catch a dead wire.
  await expect
    .poll(
      async () => graphic.locator('.imported-design').evaluate((el) => Number(getComputedStyle(el).opacity)),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0.9);
  await expect(page.getByTestId('machine-state-chip')).toHaveText('Question', { timeout: 20_000 });
  // Nothing drawn is showing yet — the entrance is not a verdict.
  await expect(lit).toHaveCount(0);
  await shotBoth('imported-quiz-1-question');

  // Select: the designer's own "B selected" layer, on the renderer.
  await page.getByTestId('cue-action-select').click();
  await expect(drawn('answer.selected/B')).toHaveClass(ON, { timeout: 20_000 });
  await shotBoth('imported-quiz-2-selected');

  // Lock: the board-level badge, with the pick still up.
  await page.getByTestId('cue-action-lock').click();
  await expect(page.getByTestId('machine-state-chip')).toHaveText('Locked in', { timeout: 20_000 });
  await expect(drawn('locked')).toHaveClass(ON, { timeout: 20_000 });
  await expect(drawn('answer.selected/B')).toHaveClass(ON);
  await shotBoth('imported-quiz-3-locked');

  // ── RENDERER REBOOT MID-LOCK. The pilot's real risk: a snap replays states with callbacks
  // suppressed, so the drawn layers come back only if paintQuizState() repaints from the machine
  // on the trailing update(). Reload the output page and check the board is still locked with
  // the pick showing — the wire-level truth no local monitor can prove. ──
  await output.reload();
  await expect(drawn('locked')).toHaveClass(ON, { timeout: 30_000 });
  await expect(drawn('answer.selected/B')).toHaveClass(ON);
  await expect(graphic.locator('#f0')).toContainText('2032 Olympics');
  await shotBoth('imported-quiz-4-rebooted-still-locked');

  // The verdict: C lights, the other three take the wrong treatment.
  await page.getByTestId('cue-action-judge').click();
  await expect(drawn('answer.correct/C')).toHaveClass(ON, { timeout: 20_000 });
  for (const row of ['A', 'B', 'D']) {
    await expect(drawn(`answer.wrong/${row}`)).toHaveClass(ON);
  }
  await expect(drawn('answer.correct/A')).not.toHaveClass(ON);
  await shotBoth('imported-quiz-5-revealed');

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
