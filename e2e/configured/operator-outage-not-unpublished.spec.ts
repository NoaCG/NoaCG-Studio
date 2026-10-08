// covers: src/components/HostedControlPage.tsx, src/components/home/ProductionPage.tsx
// covers: src/control/hostedControl.ts

import { publishProduction } from '../_publish';
import { test, expect, type Page, type Route } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, signIn, wipeMyGraphics } from './_helpers';

// AN OUTAGE IS NOT "UNPUBLISHED" (docs/PLAYOUT_ISOLATION_RESEARCH.md §16 item 2).
//
// On 2026-09-29 the database stopped answering for three minutes, and PostgREST answered every
// resolve with a 503. The hosted control page read that failure as "no such production" and told
// the operator the link was invalid or unpublished, and it kept saying so after the database came
// back, until someone reloaded it by hand. The production page's follow gave up on the same failed
// resolve and said nothing at all. The renderer had already learned this lesson (`RpcAnswer`,
// `untilAnswered`): a failure means ask again, and only an ANSWER decides.
//
// The outage is injected by routing the resolve RPC to the exact answer PostgREST gave that day,
// so the rest of the backend stays healthy and only the question under test goes unanswered.
// A real unknown slug is asserted first: "not found" has to survive for the case it is for.
test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

// Both resolves: `control_show_by_slug` on the id road, `control_show_resolve` on the numbered log
// (migration 0071), which a page asks first whenever the server has it.
const RESOLVE = /\/rest\/v1\/rpc\/control_show_(by_slug|resolve)(\?|$)/;
const NOT_FOUND = 'Control page not found';

/** Route the resolve to the 2026-09-29 answer while `outage.down`, and let it through after.
 *  Counts what reached each side, so "it kept asking" and "it asked again" are both facts. */
async function resolveOutage(page: Page) {
  const outage = { down: true, refused: 0, answered: 0 };
  await page.route(RESOLVE, (route: Route) => {
    if (outage.down) {
      outage.refused += 1;
      return route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'PGRST002',
          details: null,
          hint: null,
          message: 'Could not query the database for the schema cache. Retrying.',
        }),
      });
    }
    outage.answered += 1;
    return route.continue();
  });
  return outage;
}

test('an operator page waits out a database outage instead of calling the production unpublished', async ({ page, context }) => {
  test.setTimeout(240_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await bootstrapGraphic(page, { name: 'House Scorebug' });

  const showName = `Outage Walk ${Date.now()}`;
  await openProductionWithCurrent(page, showName);
  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  await page.keyboard.press('Escape');
  const slug = await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((x) => x.name === name)?.hostedSlug ?? null;
  }, showName);
  expect(slug, 'publishing must mint a hosted control slug').toBeTruthy();

  // ── A REAL UNKNOWN SLUG still says "not found": the server answered, with nothing. ──
  const stranger = await context.newPage();
  await stranger.goto(`/app?control=${encodeURIComponent(`no-such-production-${Date.now()}`)}`);
  await expect(stranger.getByText(NOT_FOUND)).toBeVisible({ timeout: 30_000 });
  await expect(stranger.getByText('This link is invalid or the page was unpublished.')).toBeVisible();
  await expect(stranger.getByTestId('hosted-server-waiting')).toHaveCount(0);
  await stranger.close();

  // ── THE HOSTED PAGE opened during the outage. ──
  const op = await context.newPage();
  // "Never" is watched for the page's whole life, not sampled: the not-found card flashing up
  // between two assertions is exactly the defect, and a sample could miss it.
  await op.addInitScript(() => {
    const w = window as unknown as { __notFoundSeen?: boolean };
    w.__notFoundSeen = false;
    new MutationObserver(() => {
      for (const el of document.querySelectorAll('.sendin-title')) {
        if (el.textContent === 'Control page not found') w.__notFoundSeen = true;
      }
    }).observe(document, { subtree: true, childList: true, characterData: true });
  });
  const hostedOutage = await resolveOutage(op);
  await op.goto(`/app?control=${encodeURIComponent(slug as string)}`);

  const waiting = op.getByTestId('hosted-server-waiting');
  await expect(waiting).toBeVisible({ timeout: 30_000 });
  await expect(waiting).toContainText('not answering');
  await expect(waiting).toContainText('keeps trying');
  // It keeps asking: several refused attempts, and still waiting rather than concluding.
  await expect.poll(() => hostedOutage.refused, { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
  await expect(waiting).toBeVisible();
  await expect(op.getByText(NOT_FOUND)).toHaveCount(0);
  // Marks THIS document, so the recovery below is proven to happen without a reload.
  await op.evaluate(() => {
    (window as unknown as { __sameDocument?: boolean }).__sameDocument = true;
  });

  // The database comes back.
  hostedOutage.down = false;
  await expect(op.getByTestId('hosted-control-page')).toBeVisible({ timeout: 30_000 });
  await expect(waiting).toHaveCount(0);
  expect(hostedOutage.answered, 'the page asked again and the server answered').toBeGreaterThan(0);
  expect(await op.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true);
  expect(
    await op.evaluate(() => (window as unknown as { __notFoundSeen?: boolean }).__notFoundSeen),
    'the not-found card must never have been shown during the outage',
  ).toBe(false);
  await op.close();

  // ── THE PRODUCTION PAGE's follow, opened during the outage. ──
  const desk = await context.newPage();
  const deskOutage = await resolveOutage(desk);
  // The follow's first move after an answered resolve is the history read; counting it proves
  // the follow really started after the outage, not merely that the notice went away.
  let tailsAfterRecovery = 0;
  desk.on('request', (req) => {
    if (!deskOutage.down && /\/rest\/v1\/rpc\/control_tail(\?|$)/.test(req.url())) tailsAfterRecovery += 1;
  });
  await desk.goto(page.url());
  await expect(desk.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
  const line = desk.getByTestId('production-follow');
  await expect(line).toBeVisible({ timeout: 30_000 });
  await expect(line).toContainText('server not answering, retrying');
  await expect(line).toHaveAttribute('title', /Retrying/);
  await expect.poll(() => deskOutage.refused, { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
  await expect(line).toContainText('server not answering');

  deskOutage.down = false;
  // The notice line also carries "not joined" for a slow channel, which is a different state;
  // only the outage wording has to go.
  await expect(line.filter({ hasText: 'server not answering' })).toHaveCount(0, { timeout: 30_000 });
  expect(deskOutage.answered, 'the follow asked again and the server answered').toBeGreaterThan(0);
  await expect.poll(() => tailsAfterRecovery, { timeout: 30_000 }).toBeGreaterThan(0);
  await desk.close();

  // Leave the throwaway account clean.
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});
