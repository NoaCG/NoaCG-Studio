// covers: src/components/home/ProductionPage.tsx, src/components/OldControlLink.tsx
// covers: src/control/hostedControl.ts
// covers: src/control/liveCue.ts, src/control/cueItems.ts, src/control/playoutSession.ts, src/control/productionDataSession.ts, src/components/home/useStorePart.ts
// covers: src/components/home/ProductionShell.tsx
// covers: src/components/home/useProductionPublish.ts
// covers: src/control/airState.ts, src/control/sessionWire.ts
// covers: src/control/graphicVerbs.ts, src/control/verbDispatch.ts, src/control/verbView.ts
// covers: src/control/cueDraft.ts

import { publishProduction } from '../_publish';
import { test, expect, type Page, type Route } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, openSecondProductionPage, signIn, wipeMyGraphics } from './_helpers';

// AN OUTAGE IS NOT "UNPUBLISHED" (docs/PLAYOUT_ISOLATION_RESEARCH.md §16 item 2).
//
// On 2026-09-29 the database stopped answering for three minutes, and PostgREST answered every
// resolve with a 503. The hosted control page (since retired) read that failure as "no such
// production" and kept saying so after the database came back. The production page's follow gave up
// on the same failed resolve and said nothing at all. The renderer had already learned this lesson
// (`RpcAnswer`, `untilAnswered`): a failure means ask again, and only an ANSWER decides.
//
// The outage is injected by routing the resolve RPC to the exact answer PostgREST gave that day,
// so the rest of the backend stays healthy and only the question under test goes unanswered. The
// page under test is a second signed-in production page on the published production, opened while
// the server is down. The old `?control=<slug>` link, now a redirect to the production page
// (docs/work-specs/retire-hosted-control/spec.md AC-1, AC-2), is held to the same rule below.
test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

// Both resolves: `control_show_by_slug` on the id road, `control_show_resolve` on the numbered log
// (migration 0071), which a page asks first whenever the server has it.
const RESOLVE = /\/rest\/v1\/rpc\/control_show_(by_slug|resolve)(\?|$)/;

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

test('an operator page waits out a database outage instead of calling the production unpublished', async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await bootstrapGraphic(page, { name: 'House Scorebug' });

  const showName = `Outage Walk ${Date.now()}`;
  const showId = await openProductionWithCurrent(page, showName);
  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  await page.keyboard.press('Escape');
  const slug = await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((x) => x.name === name)?.hostedSlug ?? null;
  }, showName);
  // The follow resolves the production by this slug, so without one there is nothing to wait out.
  expect(slug, 'publishing must mint the production slug the follow resolves by').toBeTruthy();

  // ── A SECOND OPERATOR, a browser of its own, opening the production during the outage. The
  // route and the request count go in before its first resolve. ──
  let deskOutage = { down: true, refused: 0, answered: 0 };
  // The follow's first move after an answered resolve is the history read; counting it proves
  // the follow really started after the outage, not merely that the notice went away.
  let tailsAfterRecovery = 0;
  const desk = await openSecondProductionPage(page, showId, {
    started: false,
    prepare: async (tab) => {
      deskOutage = await resolveOutage(tab);
      tab.on('request', (req) => {
        if (!deskOutage.down && /\/rest\/v1\/rpc\/control_tail(\?|$)/.test(req.url())) tailsAfterRecovery += 1;
      });
    },
  });
  const line = desk.getByTestId('production-follow');
  await expect(line).toBeVisible({ timeout: 30_000 });
  await expect(line).toContainText('server not answering, retrying');
  await expect(line).toHaveAttribute('title', /Retrying/);
  await expect.poll(() => deskOutage.refused, { timeout: 30_000 }).toBeGreaterThanOrEqual(3);
  await expect(line).toContainText('server not answering');
  // Marks THIS document, so the recovery below is proven to happen without a reload.
  await desk.evaluate(() => {
    (window as unknown as { __sameDocument?: boolean }).__sameDocument = true;
  });

  deskOutage.down = false;
  // The notice line also carries "not joined" for a slow channel, which is a different state;
  // only the outage wording has to go.
  await expect(line.filter({ hasText: 'server not answering' })).toHaveCount(0, { timeout: 30_000 });
  expect(deskOutage.answered, 'the follow asked again and the server answered').toBeGreaterThan(0);
  await expect.poll(() => tailsAfterRecovery, { timeout: 30_000 }).toBeGreaterThan(0);
  expect(await desk.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true);
  await desk.unrouteAll({ behavior: 'ignoreErrors' });
  await desk.close();

  // Leave the throwaway account clean.
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});

test('an old control link opens its production, waits out an outage, and says so only when the link is dead', async ({ page, browser }) => {
  test.setTimeout(240_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await bootstrapGraphic(page, { name: 'House Scorebug' });
  const showName = `Old Link ${Date.now()}`;
  const showId = await openProductionWithCurrent(page, showName);
  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  await page.keyboard.press('Escape');
  const slug = await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((x) => x.name === name)?.hostedSlug ?? null;
  }, showName);
  expect(slug, 'publishing must mint the slug an old control link carries').toBeTruthy();
  const DEAD = 'This link no longer works';

  // AC-2: a slug nobody published says so, with a way home, and never waits for the server.
  const stranger = await page.context().newPage();
  await stranger.goto(`/app?control=${encodeURIComponent(`no-such-production-${Date.now()}`)}`);
  const strangerCard = stranger.getByTestId('old-control-link');
  await expect(strangerCard).toHaveAttribute('data-state', 'gone', { timeout: 30_000 });
  await expect(strangerCard).toContainText(DEAD);
  await expect(strangerCard.getByRole('link', { name: 'Go to NoaCG Studio' })).toBeVisible();
  await stranger.close();

  // AC-2: during an outage the link keeps asking and never calls itself dead, not even briefly.
  const member = await page.context().newPage();
  await member.addInitScript((dead) => {
    const w = window as unknown as { __saidDead?: boolean };
    new MutationObserver(() => {
      if (document.body?.textContent?.includes(dead)) w.__saidDead = true;
    }).observe(document, { childList: true, subtree: true, characterData: true });
  }, DEAD);
  const outage = await resolveOutage(member);
  await member.goto(`/app?control=${encodeURIComponent(slug as string)}`);
  const card = member.getByTestId('old-control-link');
  await expect(card).toHaveAttribute('data-state', 'waiting', { timeout: 30_000 });
  await expect(card).toContainText('keeps trying');
  await expect.poll(() => outage.refused, { timeout: 60_000 }).toBeGreaterThanOrEqual(3);
  await expect(card).toHaveAttribute('data-state', 'waiting');
  expect(await member.evaluate(() => (window as unknown as { __saidDead?: boolean }).__saidDead ?? false)).toBe(false);

  // AC-1: once the server answers, a signed-in member lands on the production's own page.
  outage.down = false;
  await expect.poll(() => member.evaluate(() => location.hash), { timeout: 60_000 }).toBe(`#/production/${showId}`);
  expect(await member.evaluate(() => location.search), 'the old query is gone from the address').toBe('');
  await expect(member.getByTestId('production-page')).toBeVisible({ timeout: 60_000 });
  await expect(member.locator('.pd-name')).toHaveText(showName, { timeout: 60_000 });
  expect(outage.answered, 'the link asked again and the server answered').toBeGreaterThan(0);
  await member.unrouteAll({ behavior: 'ignoreErrors' });
  await member.close();

  // AC-1: a signed-out visitor lands on the production page's own sign-in state.
  const anonContext = await browser.newContext();
  const visitor = await anonContext.newPage();
  await visitor.goto(`/app?control=${encodeURIComponent(slug as string)}`);
  await expect.poll(() => visitor.evaluate(() => location.hash), { timeout: 60_000 }).toBe(`#/production/${showId}`);
  await expect(visitor.getByTestId('production-page').getByTestId('signin-prompt')).toContainText('Sign in to open this production', { timeout: 30_000 });
  await anonContext.close();

  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});
