// covers: src/components/home/ProductionPage.tsx, src/control/hostedControl.ts
// covers: src/control/liveCue.ts, src/control/cueItems.ts, src/control/playoutSession.ts, src/control/productionDataSession.ts, src/components/home/useStorePart.ts
// covers: src/components/home/useProductionPublish.ts
// covers: src/control/airState.ts, src/control/sessionWire.ts
// covers: src/control/graphicVerbs.ts, src/control/verbDispatch.ts, src/control/verbView.ts
//
// A TAKE PRESSED WHILE THE PAGE'S FIRST RESOLVE IS STILL OUT STAYS ON THIS PAGE (production-page
// refactor, phase 1; docs/work-specs/production-page-refactor/spec.md §5.3, "the initial resolve
// after a newer Take").
//
// A published production opened cold asks the server what is live (`controlShowBySlug`, through
// `control_show_resolve` or `control_show_by_slug`) and seeds its live map from the answer. An
// answer that left before the operator's Take is older than the screen: seeding from it would mark
// the graphic off while it is on air, and grey Out (the hosted-tier hang in ProductionPage's
// `setLiveCue` comment). The guard (control/airState.ts `seedFromResolve`) skips the seed when the
// live map moved while the read was out.
// The hold is in the browser, on the answer: the read reaches the server before the Take.

import { publishProduction } from '../_publish';
import { test, expect } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, signIn, wipeMyGraphics } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset - configured-mode spec');

// Cleanup runs whatever the walk's outcome: the account is shared by the whole configured suite.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await clearPublishedShows(page).catch(() => {});
  await wipeMyGraphics(page).catch(() => {});
});

test('a Take pressed while the first resolve is out stays on air here, as one entrance', async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await bootstrapGraphic(page, { name: 'House Scorebug' });
  await openProductionWithCurrent(page, `Resolve race ${Date.now()}`);
  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });

  // THE HOLD: the resolve the reloaded page sends first is answered by the server at once, and the
  // page hears that answer only after the Take: an answer older than the screen.
  let held = 0;
  let fulfilled = 0;
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route(/\/rest\/v1\/rpc\/control_show_(resolve|by_slug)(\?|$)/, async (route) => {
    held += 1;
    const response = await route.fetch();
    await released;
    await route.fulfill({ response }).catch(() => {});
    fulfilled += 1;
  });
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => held, { message: 'the page asked what is live' }).toBeGreaterThan(0);
  const links = page.getByTestId('production-status-panel');
  if (await links.isVisible()) await page.keyboard.press('Escape');

  const chip = page.getByTestId('live-cue-chip');
  const stage = page.getByTestId('program-stage');
  await expect(stage).toHaveAttribute('data-plays', '0');
  await page.getByTestId('verb-take').click();
  await expect(chip).toContainText('on air:');
  const taken = (await chip.textContent()) ?? '';
  expect(fulfilled, 'the resolve is still out when the Take is pressed').toBe(0);

  // The answer arrives, older than the Take: nothing on air, as far as it knows.
  const answered = page.waitForResponse(/\/rest\/v1\/rpc\/control_show_(resolve|by_slug)(\?|$)/);
  release();
  await answered;
  await page.waitForTimeout(1_500);
  await expect(chip).toHaveText(taken);
  await expect(page.getByTestId('verb-out')).toBeEnabled();
  await expect(stage, 'one entrance, and no replay over it').toHaveAttribute('data-plays', '1');

});
