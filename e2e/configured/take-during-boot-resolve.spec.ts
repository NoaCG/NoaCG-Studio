import { test, expect } from '@playwright/test';
import { createProject } from '../_create';
import { haveCreds, signIn, wipeMyGraphics } from './_helpers';

// A TAKE PRESSED WHILE THE PRODUCTION PAGE IS STILL RESOLVING MUST SURVIVE THE ANSWER.
//
// Opening a published production reads it over the wire (`control_show_by_slug`) and SEEDS the
// live-cue map with what comes back. That read is a round trip, and a Take pressed while it is
// in flight moves the map first. The answer then lands carrying the picture from BEFORE the
// press and replaced it wholesale, so the dashboard said nothing was on air about a graphic that
// was - and Out, Update and Next were all greyed, because every one of them is gated on that
// map. The operator could not even take it off again.
//
// NOTHING RECOVERED IT, which is what makes this worth a spec rather than a shrug. The take's
// own rows come back through `applyCommand`, which claims each message once and already claimed
// these at send time, so the row that would restore the marker is dropped as a duplicate -
// correctly, for its own purpose. The page stayed wrong until somebody reloaded it.
//
// WHY IT IS FORCED HERE rather than waited for. The window is the round trip: about a
// millisecond against a local stack and ~170 ms from a runner to hosted staging, which is why
// only the hosted tier ever saw it - `relay-cold-boot` hung for its whole 300 s budget on a
// disabled Out button on 2026-09-20, and the page snapshot at that moment read "PROGRAM - ON AIR
// nothing on air" while the server's `live_cue` held the take the spec had just asserted.
// Holding the response open makes the same window deterministic on both tiers.
//
// THE HOLD GOES UP AFTER PUBLISHING, NOT BEFORE. Publishing is what mints the slug, and the
// publish path resolves the show itself - gating that call would hang the publish rather than
// the boot, and the spec would fail somewhere that teaches nothing. Reloading onto an already
// published production runs the same seed, and is the ordinary operator case anyway: open a
// production that is already up, and take a cue straight away.
test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

test('a take pressed while the production is still resolving is not undone by the answer', async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await createProject(page, { name: 'House Scorebug' });

  await page.getByTestId('dock-tab-control').click();
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  const showName = `Take During Boot ${Date.now()}`;
  await section.getByPlaceholder('New production name').fill(showName);
  await section.getByRole('button', { name: 'Create', exact: true }).click();
  await section.getByRole('button', { name: '+ Add current' }).click();
  await section.getByTestId('open-production-page').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', { timeout: 30_000 });

  // ── Reopen the published production with its resolve held open. ──
  let release: (() => void) | null = null;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let heldOnce = false;
  await page.route('**/rest/v1/rpc/control_show_by_slug', async (route) => {
    if (heldOnce) return route.continue();
    heldOnce = true;
    await held;
    return route.continue();
  });

  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();

  // TAKE, with the answer still in flight. Take is the one verb a cold page enables, so if it
  // never enables the case under test was never reached and the failure says so here.
  const take = page.getByTestId('verb-take');
  await expect(take).toBeEnabled({ timeout: 30_000 });
  await take.click();

  // The press has moved the map: Out is the proof, because it is gated on exactly the entry the
  // answer is about to overwrite.
  await expect(page.getByTestId('verb-out')).toBeEnabled({ timeout: 30_000 });

  // NOW let the stale answer land, and give it room to do damage.
  release!();
  await page.waitForTimeout(2_000);

  // The whole point. Before the guard this read "not on air" and Out stayed disabled for good.
  await expect(page.getByTestId('verb-out')).toBeEnabled();
  await expect(page.getByTestId('machine-state-chip')).not.toHaveText('not on air');

  // Leave the throwaway account clean.
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.getByTestId('verb-out').click();
  await page.getByTestId('production-links-toggle').click();
  await page.getByRole('button', { name: /Unpublish/ }).click();
  await expect(page.getByTestId('production-mode')).toContainText('NOT PUBLISHED', { timeout: 20_000 });
  await page.evaluate(async () => {
    const { loadShows, deleteShow } = await import('/src/model/shows.ts');
    for (const s of loadShows()) deleteShow(s.id);
  });
  await wipeMyGraphics(page);
});
