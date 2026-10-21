// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). Only a real backend holds a lease.
//
// THE PANEL LEASE ON TWO PRODUCTION PAGES (docs/work-specs/panel-ownership-lease/spec.md AC-2,
// AC-3, AC-4): the page that answers keeps the panel through a reload of its tab, under the same
// page id and claim; a second production page opened beside it takes nothing and says who has it;
// once the first is closed, its lease lapses and the second takes the panel by itself. The server
// rules are panel-relay.spec.ts; Use here and the hosted page are panel-page.spec.ts and
// panel-production-page.spec.ts. A hidden or covered tab (AC-6) cannot be made here: Playwright
// pages are never hidden. The second test injects the fault that matters instead: while the page
// says it is hidden, every interval tick of its own is skipped and every timeout held until it
// shows again, harsher than Chromium's once a minute, and the lease must hold on the worker's timer
// (removing the worker, so the beat falls back to a page interval, fails it). It then cuts the answering page's network (H0 AC-3 in
// docs/work-specs/playout-companion-qualification/spec.md): only the current owner ever acts.
// covers: src/components/control/PanelControl.tsx, src/control/panelRelay.ts, src/control/workerTicker.ts

import { test, expect, type WebSocketRoute } from '@playwright/test';
import { haveCreds, SUPABASE_URL } from './_helpers';
import { answerPanel, ANON_KEY, openHosted, pairPanel, publishTwoCues, shutStatusPanel } from './_panel';

test.skip(!haveCreds || !SUPABASE_URL || !ANON_KEY, 'E2E_EMAIL / E2E_PASSWORD and the Supabase pair unset - configured-mode spec');

test('a reload keeps the panel, a second production page never takes it, and takes over once the first is gone', async ({ page, context }) => {
  test.setTimeout(300_000);
  await publishTwoCues(page, `Panel Lease ${Date.now()}`);
  const first = page;
  await shutStatusPanel(first);
  const deck = await pairPanel(first);
  await answerPanel(first);
  await first.getByTestId('panel-close').click();
  await deck.hello();
  const before = await deck.state((s) => s.where === 'production');
  const firstPage = before.page;

  // AC-3: a reload of the answering tab keeps the panel, under the same page id; no gap lets
  // another page in.
  await first.reload();
  await expect(first.getByTestId('production-page')).toBeVisible({ timeout: 60_000 });
  await expect(first.getByTestId('panel-header-status')).toHaveText('Panel ✓', { timeout: 15_000 });
  await deck.hello();
  const reloaded = await deck.state((s) => s.where === 'production' && (s.ver as number) !== (before.ver as number), 'the reloaded page');
  expect(reloaded.page).toBe(firstPage);
  expect(reloaded.claim).toBe(before.claim);

  // AC-2: a second production page opened beside it takes nothing, and says who has it.
  const second = await context.newPage();
  await second.goto(first.url());
  await expect(second.getByTestId('production-page')).toBeVisible({ timeout: 60_000 });
  await expect(second.getByTestId('panel-header-use-here')).toHaveAttribute('title', /^Production page answers the Stream Deck panel/, { timeout: 15_000 });
  await second.waitForTimeout(6_000);
  expect((await deck.state()).page, 'the first page still answers').toBe(firstPage);
  await expect(first.getByTestId('panel-header-status')).toHaveText('Panel ✓');

  // AC-4: the first page closes; its lease lapses within 15 s, and the second takes it by itself.
  await first.close();
  await expect(second.getByTestId('panel-header-status')).toHaveText('Panel ✓', { timeout: 30_000 });
  await deck.hello();
  const taken = await deck.state((s) => s.page !== firstPage, 'the second page answering');
  expect(taken.where).toBe('production');
  expect(Number(taken.claim)).toBeGreaterThan(Number(before.claim));
  await deck.close();
});

test('a hidden page keeps the panel; a page cut off lets go and, back online, never takes it back', async ({ page, browser }) => {
  test.setTimeout(300_000);
  // The page's own timers, wrapped from its first script so the ones already running can be starved
  // too: while `__starve` is set, an interval skips its ticks and a timeout waits until release,
  // unless it is cleared meanwhile. Only the page itself starves, not its monitors' frames.
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const w = window as unknown as { __starve?: boolean; __release: () => void };
    const held = new Map<number, () => void>();
    w.__release = () => {
      const due = [...held.values()];
      held.clear();
      due.forEach((f) => f());
    };
    const realTimeout = window.setTimeout.bind(window);
    const realClear = window.clearTimeout.bind(window);
    const realInterval = window.setInterval.bind(window);
    window.setTimeout = ((fn: TimerHandler, ms?: number, ...args: unknown[]) => {
      const id: number = realTimeout(() => {
        const run = () => (typeof fn === 'function' ? fn(...args) : undefined);
        if (w.__starve) held.set(id, run);
        else run();
      }, ms);
      return id;
    }) as typeof window.setTimeout;
    window.clearTimeout = ((id?: number) => {
      if (id !== undefined) held.delete(id);
      realClear(id);
    }) as typeof window.clearTimeout;
    window.setInterval = ((fn: TimerHandler, ms?: number, ...args: unknown[]) =>
      realInterval(() => {
        if (!w.__starve && typeof fn === 'function') fn(...args);
      }, ms)) as typeof window.setInterval;
  });
  // A real cut: Playwright's offline mode leaves open WebSockets alone, so the page's Realtime
  // sockets are routed, closed when the cut starts, and refused while it lasts.
  const sockets: WebSocketRoute[] = [];
  let cut = false;
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    if (cut) {
      void ws.close();
      return;
    }
    sockets.push(ws);
    ws.connectToServer();
  });
  await publishTwoCues(page, `Panel Offline ${Date.now()}`);
  const op = page;
  await shutStatusPanel(op);
  const deck = await pairPanel(op);
  await answerPanel(op);
  await op.getByTestId('panel-close').click();
  await deck.hello();
  const before = await deck.state((s) => s.where === 'production');

  // HIDDEN: the page says so and its own timers starve. Past two lease times it still answers,
  // under the same claim, and runs a press.
  await op.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    (window as unknown as { __starve: boolean }).__starve = true;
  });
  await op.waitForTimeout(32_000);
  const hidden = await deck.hello();
  expect(hidden.answering, 'a hidden page keeps the lease').toBe(true);
  expect((await deck.press('select-prev', '', before.ver as number)).outcome).toBe('ran');
  await op.evaluate(() => {
    (window as unknown as { __starve: boolean }).__starve = false;
    (window as unknown as { __release: () => void }).__release();
    delete (document as unknown as Record<string, unknown>).visibilityState;
    delete (document as unknown as Record<string, unknown>).hidden;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  // Shown again, it runs and publishes presses made from now on, under the same claim.
  const [anna, ben] = (await deck.rows()).map((r) => r.id);
  const awake = await deck.state((s) => s.selected === anna, 'Anna selected');
  expect((await deck.press('select-next', '', awake.ver as number)).outcome).toBe('ran');
  const onBen = await deck.state((s) => s.selected === ben, 'the page publishing again');
  expect((await deck.press('select-prev', '', onBen.ver as number)).outcome).toBe('ran');
  const shown = await deck.state((s) => s.selected === anna, 'Anna selected again');
  expect(shown.claim).toBe(before.claim);
  const slug = await op.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((x) => x.hostedSlug)?.hostedSlug ?? '';
  });

  // The phone, in a browser of its own, sees who has the panel and takes nothing.
  const phoneContext = await browser.newContext();
  const phone = await phoneContext.newPage();
  await openHosted(phone, slug);
  await phone.getByTestId('panel-open').click();
  await expect(phone.getByTestId('panel-status')).toHaveText('Production page answers the panel.', { timeout: 15_000 });

  // CUT OFF: the production page's renewals stop, and its lease lapses within 15 s. A press then is
  // refused at the server, and nothing keeps it for later.
  cut = true;
  await op.context().setOffline(true);
  for (const ws of sockets.splice(0)) await ws.close();
  await expect.poll(async () => (await deck.hello()).answering, { timeout: 30_000 }).toBe(false);
  expect((await deck.press('select-next', '', shown.ver as number)).outcome).toBe('refused no-page');
  await expect(op.locator('.pd-cue.selected')).toContainText('Anna');

  // The phone takes it with Use here, under a newer claim.
  await answerPanel(phone);
  await deck.hello();
  const onPhone = await deck.state((s) => s.where === 'control', 'the phone answering');
  expect(Number(onPhone.claim)).toBeGreaterThan(Number(before.claim));

  // BACK ONLINE, the production page says who has the panel and takes nothing back; only the phone
  // runs presses, and the refused press never ran on the production page.
  cut = false;
  await op.context().setOffline(false);
  await expect(op.getByTestId('panel-header-use-here')).toHaveAttribute('title', /^Hosted control page answers the Stream Deck panel/, { timeout: 30_000 });
  // Two lease times later it still holds: the phone answers and the production page still defers.
  await op.waitForTimeout(32_000);
  await expect(phone.getByTestId('panel-status')).toHaveText('This page answers the panel.');
  await expect(op.getByTestId('panel-header-use-here')).toHaveAttribute('title', /^Hosted control page answers the Stream Deck panel/);
  await expect(op.getByTestId('panel-header-status')).toHaveCount(0);
  expect((await deck.hello()).answering).toBe(true);
  expect((await deck.press('select-next', '', onPhone.ver as number)).outcome).toBe('ran');
  const moved = await deck.state((s) => s.where === 'control' && s.selected !== onPhone.selected, 'the phone moving its selection');
  expect(moved.page).toBe(onPhone.page);
  await expect(op.locator('.pd-cue.selected')).toContainText('Anna');
  await phoneContext.close();
  await deck.close();
});
