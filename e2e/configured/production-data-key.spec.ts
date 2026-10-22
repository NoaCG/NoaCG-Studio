// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). The offline suite cannot walk what these paths change.
//
// THE PRODUCTION DATA API and the panel that hands out its key (docs/DATA_API.md). Offline
// there is no publish, no data_key row and no key to reveal, so the only honest proof that the
// revealed string AUTHENTICATES is the configured walk
// (e2e/configured/production-data-key.spec.ts). The offline data-api spec pins the refusal
// shapes, and production-data.spec.ts pins the button's absence; both are different claims.
// covers: src/control/productionDataApi.ts, src/components/home/ProductionDataPanel.tsx
// covers: api/data/**, scripts/dataDevPlugin.mjs
// covers: src/control/productionDataSession.ts
// covers: src/components/home/ProductionDataWorkspace.tsx, src/control/anotherSystem.ts, supabase/migrations/0100_data_api_pause.sql

import { publishProduction } from '../_publish';
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
  await expect(before.getByTestId('data-key')).toHaveCount(0);
  await expect(before.getByTestId('data-api-local')).toBeVisible();
  await before.close();

  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  // Publishing opens the links popover; Escape closes it (quiz-output.spec.ts says why there
  // is nothing to click).
  await page.keyboard.press('Escape');

  // The key is on the Another system card (data-sources C5).
  const data = await openWorkspace(page, 'data');
  await expect(data.getByTestId('data-key')).toBeVisible();

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

// ANOTHER SYSTEM AND ITS PAUSE (data-sources C5, AC-3 and AC-7; docs/DATA_API.md "Pause").
//
// A graphic connected to Another system through Connect data… on a published production; the
// card's key writes it, the receipt shows within 5 s; Pause holds a push, a push with a null and an
// /update (each answer says so, and nothing reaches the log); Resume appends exactly the final
// values once. The cases behind it run in migration 0100's self-check; this is the walk through the
// product and the deployed route.
test('Another system: the card key pushes a connected graphic, Pause holds every write and says so, Resume sends the final values once', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearShows(page);
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  const consent = page.getByTestId('analytics-consent');
  if (await consent.isVisible().catch(() => false)) await consent.getByRole('button', { name: 'No thanks' }).click();
  const showId = await openProductionWithCurrent(page, `Another System ${Date.now()}`);

  // ── Connect data…, Another system, one confirmation, then publish. ──
  await page.getByTestId('cue-list').locator('.pd-cue').first().locator('.pd-cue-label').click();
  await page.getByTestId('cue-connect').click();
  const review = page.getByTestId('cue-connect-menu');
  await review.getByTestId('cue-connect-api').click();
  await review.getByTestId('cue-connect-confirm').click();
  await expect(review).toBeHidden();
  const paths = await page.evaluate(async (id) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((s) => s.id === id)?.bindings?.['Hairline'] ?? {};
  }, showId);
  expect(paths.f0).toMatch(/^api\.hairline\./);
  expect(paths.f1).toMatch(/^api\.hairline\./);
  const leaf = (p: string) => p.split('.')[2];
  const body = (f0: unknown, f1?: unknown) => ({ api: { hairline: { [leaf(paths.f0)]: f0, ...(f1 === undefined ? {} : { [leaf(paths.f1)]: f1 }) } } });

  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  await page.keyboard.press('Escape');
  const slug = await page.evaluate(async (id) => (await import('/src/model/shows.ts')).loadShows().find((s) => s.id === id)?.hostedSlug ?? '', showId);
  const updates = () =>
    page.evaluate(async (slug) => {
      const { hostedControlTail } = await import('/src/control/hostedControl.ts');
      return (await hostedControlTail(slug, 0))
        .filter((row) => (row.msg as { t?: string }).t === 'update')
        .map((row) => ({ id: row.id, src: (row.msg as { src?: string }).src ?? null, data: (row.msg as { data?: Record<string, string> }).data ?? {} }));
    }, slug);

  // ── The card: address, the key behind Reveal, the example, nothing received yet. ──
  const data = await openWorkspace(page, 'data');
  const card = data.getByTestId('data-api-card');
  await expect(card.getByTestId('data-api-address')).toHaveText(/\/api\/data\/patch$/);
  await expect(card.getByTestId('data-api-curl')).toContainText(leaf(paths.f0));
  await expect(card.getByTestId('data-api-received')).toHaveText('Nothing received yet', { timeout: 10_000 });
  await expect(card.getByTestId('data-key-value')).toHaveText(/^•+$/);
  await card.getByTestId('data-key-reveal').click();
  const key = ((await card.getByTestId('data-key-value').textContent()) ?? '').trim();
  const auth = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
  const push = async (payload: unknown) => {
    const res = await data.request.patch('/api/data/patch', { headers: auth, data: payload });
    expect(res.status(), await res.text()).toBe(200);
    return res.json();
  };

  // ── A push moves the connected field once and shows as received within 5 s. ──
  const first = await push(body('Harbour List', '38 %'));
  expect(first.paused).toBeUndefined();
  expect(first.writes).toHaveLength(1);
  await expect(card.getByTestId('data-api-received')).toHaveText(/^Received \d+ s ago$/, { timeout: 5_000 });

  // ── Pause: a push, a push with a null and an /update are held, each answer says so. ──
  await card.getByTestId('data-api-pause').click();
  await expect(card.getByTestId('data-api-received')).toContainText('Paused');
  await expect(card.getByTestId('data-api-pause')).toHaveText('Resume');
  const pausedAt = (await updates()).reduce((max, row) => Math.max(max, row.id), 0);
  const held = await push(body('Second'));
  expect(held).toMatchObject({ ok: true, paused: true, writes: [] });
  expect(held.message).toMatch(/paused Another system/);
  const nulled = await push(body('Second', null));
  expect(nulled).toMatchObject({ ok: true, paused: true, writes: [] });
  const update = await data.request.post('/api/data/update', { headers: auth, data: { graphic: 'Hairline', values: { f0: 'Third' } } });
  expect(update.status(), await update.text()).toBe(200);
  expect(await update.json()).toMatchObject({ ok: true, event: null, paused: true, applied: { f0: 'Third' } });
  expect((await updates()).filter((row) => row.id > pausedAt), 'nothing reached the log while paused').toEqual([]);

  // ── Resume: one row, the final values once. The null sent nothing for f1 (it keeps 38 %), and
  //    the held /update is laid over the patched f0. ──
  await card.getByTestId('data-api-pause').click();
  await expect(card.getByTestId('data-api-note')).toContainText('Sent the latest values to 1 graphic');
  const resumed = (await updates()).filter((row) => row.id > pausedAt);
  expect(resumed).toEqual([{ id: expect.any(Number), src: 'api', data: { f0: 'Third' } }]);
  // A second Resume press is a Pause; the card is back to receiving.
  await expect(card.getByTestId('data-api-pause')).toHaveText('Pause');
  await data.close();
  await clearShows(page);
});
