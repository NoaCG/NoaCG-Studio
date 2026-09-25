import { test, expect } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { haveCreds, signIn, wipeMyGraphics } from './_helpers';

// THE COLD BOOT (docs/CLOUD_PLAYOUT.md §3): the cue is taken BEFORE any renderer exists, and the
// browser source is opened afterwards. That is the ordinary order in a control room — the
// operator has the production up long before somebody adds the URL to CasparCG or OBS — and it
// is also the shape of the race that made the two /output walks next door flaky on CI: the take
// only had to beat the renderer's own resolve, which on a cold page is a second or more away.
//
// The renderer used to start at the log HEAD when nothing had ever been reported for the
// production, which counts every command in that log as already on air. Nothing had rendered
// anything, so the take was dropped for good: no snapshot to recover from, no row left to
// replay, a dark layer until an operator happened to send another command. The rule now says
// the log's START (control/outputRecovery.ts), and this is the walk that proves it end to end —
// on the real hosted log, through the real renderer.
//
// The sibling walks (quiz-output, scorebug-output, imported-quiz-output) all open the renderer
// first and command it afterwards, so none of them can see this. Keep it that way here: this
// spec's whole subject is what the log holds BEFORE the page loads.

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

test('a cue taken before the renderer exists is on air when the browser source boots', async ({ page, context }) => {
  test.setTimeout(240_000);
  await signIn(page);
  await page.keyboard.press('Escape');
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
  await bootstrapGraphic(page, { name: 'House Scorebug' });

  const showName = `Cold Boot ${Date.now()}`;
  await openProductionWithCurrent(page, showName);
  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', { timeout: 30_000 });
  // Publishing opens the links popover; its own toggle closes it (quiz-output.spec.ts says why
  // that rather than Escape, and why not a backdrop).
  const links = page.getByTestId('production-links');
  await expect(links).toBeVisible();
  await page.getByTestId('production-links-toggle').click();
  await expect(links).toBeHidden();

  const slugs = await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const show = loadShows().find((s) => s.name === name);
    return { output: show?.outputSlug ?? null, control: show?.hostedSlug ?? null };
  }, showName);
  expect(slugs.output).toBeTruthy();
  expect(slugs.control).toBeTruthy();

  // ── TAKE, with no renderer anywhere. ──
  await page.getByTestId('verb-take').click();
  // Wait for the SERVER to hold it, not for the button to look pressed: `live_cue` is mirrored
  // onto the production row by the send RPC itself (migration 0031), so a non-empty map is
  // proof the take's rows are in the log — which is the precondition this whole spec is about.
  await expect
    .poll(
      async () =>
        page.evaluate(async (slug) => {
          const { controlShowBySlug } = await import('/src/control/hostedControl.ts');
          const show = await controlShowBySlug(slug!);
          return Object.keys(show?.liveCue ?? {}).length;
        }, slugs.control),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);

  // ── Only NOW does the browser source open. Everything it must show is history. ──
  const output = await context.newPage();
  output.on('console', (m) => console.log('[output]', m.type(), m.text()));
  output.on('pageerror', (e) => console.log('[output pageerror]', e.message));
  output.on('response', (r) => {
    if (r.status() >= 400) console.log('[output http]', r.status(), r.request().method(), r.url());
  });
  await output.goto(`/output?production=${encodeURIComponent(slugs.output!)}&debug=1`);
  const graphic = output.frameLocator('iframe');

  // The opacity poll is the wire proof: the team names sit in the markup either way, so
  // asserting on text would pass over a board that never played.
  await expect
    .poll(
      async () => graphic.locator('.scoreboard').evaluate((el) => Number(getComputedStyle(el).opacity)),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0.9);

  // …and the STAGE is back on air. A catch-up that animates runs with the renderer's own
  // surface hidden so the replay settles off screen (docs/CLOUD_PLAYOUT.md §3) — a boot that
  // never reveals it again would leave a graphic that is playing perfectly and invisible, which
  // is exactly the failure this replay path could introduce.
  await expect
    .poll(
      async () =>
        output.evaluate(() => {
          const stage = document.querySelector('iframe')?.parentElement;
          return stage ? Number(getComputedStyle(stage).opacity) : 0;
        }),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0.9);
  await output.screenshot({ path: 'test-results/signed-in/cold-boot-take-before-renderer.png' });

  // A live Update still reaches it: the renderer that recovered from the log is following it
  // too, not merely replaying it once.
  await page.getByTestId('cue-field-f1').fill('2');
  await page.getByTestId('verb-update').click();
  await expect(graphic.locator('#f1')).toHaveText('2', { timeout: 20_000 });

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
