import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { openWorkspace } from '../_workspace';
import { haveCreds, signIn } from './_helpers';

// THE DATA KEY IS REACHABLE FROM THE PRODUCT (docs/DATA_API.md, "Authentication").
//
// The Production Data API was documented, deployed and unusable by a hosted operator: the key is
// minted at publish into `control_shows.data_key`, `productionDataKey()` had no caller that put
// it on a screen, and the guide's answer was "read the row in the database". So the whole guide
// described something only a self-hoster could do.
//
// This lives in the configured suite because the key does not exist offline: no backend, no
// publish, no row, nothing to reveal. And the claim is not "a string appears" - it is that the
// string the panel shows AUTHENTICATES, which is why the walk ends by writing the production's
// data tree with it and reading it back. The dev server mounts the real handler
// (scripts/dataDevPlugin.mjs), so that round trip is the deployed one.

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset - configured-mode spec');

/** Leave no published production behind: the account is shared by the whole live suite. */
async function clearShows(page: Page): Promise<void> {
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
}

test('a published production shows its data key, and that key writes the production data', async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page);
  await page.keyboard.press('Escape'); // the wizard signIn leaves open - not this walk
  await clearShows(page);
  await bootstrapGraphic(page);

  const consent = page.getByTestId('analytics-consent');
  if (await consent.isVisible().catch(() => false)) {
    await consent.getByRole('button', { name: 'No thanks' }).click();
  }

  const showName = `Data Key ${Date.now()}`;
  await openProductionWithCurrent(page, showName);

  // ── Unpublished there is no key and therefore no button: a permanently dead control would be
  //    worse than none (the same rule the offline spec pins from the other side). ──
  const before = await openWorkspace(page, 'data');
  await expect(before.getByTestId('data-key-toggle')).toHaveCount(0);
  await before.close();

  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', { timeout: 30_000 });
  // Publishing opens the links popover; Escape closes it (quiz-output.spec.ts says why there
  // is nothing to click).
  await page.keyboard.press('Escape');

  const data = await openWorkspace(page, 'data');
  const toggle = data.getByTestId('data-key-toggle');
  await expect(toggle).toBeVisible();
  await toggle.click();

  // Hidden until asked for: this screen is regularly in front of a room.
  const value = data.getByTestId('data-key-value');
  await expect(value).toHaveText(/^•+$/);
  await data.getByTestId('data-key-reveal').click();
  const key = ((await value.textContent()) ?? '').trim();
  expect(key.length).toBeGreaterThan(10);
  expect(key).not.toMatch(/•/);

  // ── THE ROUND TRIP. Write a path into this production's tree with the revealed key, then read
  //    the tree back with the same key. Both endpoints are the integrator's own. ──
  const patch = await data.request.patch('/api/data/patch', {
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    data: { e2e: { dataKey: 'reached' } },
  });
  expect(patch.status(), await patch.text()).toBe(200);

  const state = await data.request.get('/api/data/state', {
    headers: { authorization: `Bearer ${key}` },
  });
  expect(state.status()).toBe(200);
  const body = (await state.json()) as { data?: { e2e?: { dataKey?: string } } };
  expect(body.data?.e2e?.dataKey).toBe('reached');

  await data.close();
  await clearShows(page);
});
