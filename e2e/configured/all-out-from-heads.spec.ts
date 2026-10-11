// covers: src/control/{allOut,seqSend}.ts, src/components/home/ProductionPage.tsx, src/components/HostedControlPage.tsx
//
// ALL OUT CLEARS WHAT THE SERVER SAYS IS ON (docs/work-specs/playout-workflow-simplification D11,
// AC-13). The production page used to clear only the graphics its own list had a cue marker for,
// and with an empty list it sent nothing at all: a graphic put on air with no marker (an older
// build, a stale client, a marker lost on the way) stayed on every output while the panic control
// did nothing. The server's heads (migration 0069, 0071) know what is on, so All out clears those
// too, reads "Clearing…" until the heads say each is off, and names any that is not. The hosted
// control page follows the same rule (owner, 2026-10-08).
//
// It lives in the configured suite because the heads are the database's: offline there is no head
// to read and no stop for the server to record.

import { publishProduction } from '../_publish';
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { SERVICE_ROLE_KEY, SUPABASE_URL, clearPublishedShows, haveCreds, signIn, unpublishForCleanup, wipeMyGraphics } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

test('All out clears a graphic the server says is on that this page holds no cue for', async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await bootstrapGraphic(page, { name: 'House Scorebug' });
  const showId = await openProductionWithCurrent(page, `All out ${Date.now()}`);
  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  await page.keyboard.press('Escape');
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const headOn = async (graphic: string) => {
    const { data } = await admin.from('control_heads').select('graphics').eq('show_id', showId).single();
    return ((data?.graphics ?? {}) as Record<string, { on?: boolean }>)[graphic]?.on ?? false;
  };

  // Nothing is on, and the panic control is still there to press once published.
  await expect(page.getByTestId('verb-out-all')).toBeEnabled();

  // A graphic goes on air with no cue marker: a bare play, as an older build or a stale client
  // could send it. This page's list never hears of it.
  const playBare = () =>
    page.evaluate(async (id) => {
      const { loadShows } = await import('/src/model/shows.ts');
      const { sendControlVerb } = await import('/src/control/hostedControl.ts');
      const show = loadShows().find((s) => s.id === id)!;
      const name = show.graphics[0].name;
      await sendControlVerb({ slug: show.hostedSlug!, showId: show.id, items: [{ graphic: name, msg: { t: 'play' } }] });
      return { graphic: name, slug: show.hostedSlug! };
    }, showId);
  const { graphic, slug } = await playBare();
  await expect.poll(() => headOn(graphic), { timeout: 20_000 }).toBe(true);
  await expect(page.getByTestId('cue-list').locator('.pd-tag.air')).toHaveCount(0);

  // All out clears it anyway, and says so only once the head agrees.
  await page.getByTestId('verb-out-all').click();
  await expect.poll(() => headOn(graphic), { timeout: 20_000 }).toBe(false);
  await expect(page.getByTestId('verb-out-all')).toHaveText('■ All out', { timeout: 10_000 });
  await expect(page.getByTestId('production-note').filter({ hasText: 'did not clear' })).toHaveCount(0);

  // THE HOSTED CONTROL PAGE: pressable with nothing it knows of up, and the same graphic, put on
  // air bare again, comes off from there too.
  await playBare();
  await expect.poll(() => headOn(graphic), { timeout: 20_000 }).toBe(true);
  const hosted = await page.context().newPage();
  await hosted.goto(`/app?control=${encodeURIComponent(slug)}`);
  await expect(hosted.getByTestId('hosted-control-page')).toBeVisible({ timeout: 60_000 });
  await expect(hosted.getByTestId('hosted-live-chip')).toContainText('nothing on air');
  await expect(hosted.getByTestId('hosted-out-all')).toBeEnabled();
  await hosted.getByTestId('hosted-out-all').click();
  await expect.poll(() => headOn(graphic), { timeout: 20_000 }).toBe(false);
  await expect(hosted.getByTestId('hosted-out-all')).toHaveText('■ All out', { timeout: 10_000 });
  await hosted.close();

  await unpublishForCleanup(page);
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});
