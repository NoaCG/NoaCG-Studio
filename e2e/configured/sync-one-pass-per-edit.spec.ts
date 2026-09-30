// covers: src/backend/syncController.ts
import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { haveCreds, settleSync, signIn } from './_helpers';

// ONE EDIT, ONE LIBRARY SYNC PASS, however many tabs are open (docs/PLAYOUT_ISOLATION_RESEARCH.md
// section 16 item 7). On 2026-09-29 the production database stopped answering after library sync
// lists hit statement timeouts, and every Take in that window failed with it. Part of that load
// was that one edit ran a full pass in EVERY open tab: the tab that wrote it, and each other tab
// when it adopted the write from IndexedDB. The tab that made the change now owns its pass.
//
// A pass lists every kind once, so the summary list of ONE kind counts passes exactly. Requests
// are counted across the whole context, then attributed to the tab that sent them.
//
// The second test is the case the old behaviour covered by accident: the tab that made the
// change closes before its pass runs. It hands the pass on, and with two tabs still open only
// one of them takes it. That a write from a tab WITHOUT sync is still pushed by a tab that
// adopts it is pinned offline, in e2e/cross-tab.spec.ts.

const LIST_KIND = 'look';

function countPasses(context: BrowserContext): { perPage: Map<Page, number>; total: () => number; reset: () => void; last: () => number } {
  const perPage = new Map<Page, number>();
  let lastAt = Date.now();
  context.on('request', (req) => {
    if (req.method() !== 'GET') return;
    const url = decodeURIComponent(req.url());
    if (!url.includes('/rest/v1/documents') || !url.includes('select=id,deleted') || !url.includes(`kind=eq.${LIST_KIND}`)) return;
    const page = req.frame().page();
    perPage.set(page, (perPage.get(page) ?? 0) + 1);
    lastAt = Date.now();
  });
  return {
    perPage,
    total: () => [...perPage.values()].reduce((a, b) => a + b, 0),
    reset: () => perPage.clear(),
    last: () => lastAt,
  };
}

/** Wait until no pass has started for `quietMs` - longer than the 2.5 s debounce plus a pass. */
async function untilQuiet(page: Page, passes: ReturnType<typeof countPasses>, quietMs = 6000): Promise<void> {
  await expect.poll(() => Date.now() - passes.last(), { timeout: 60_000, intervals: [500] }).toBeGreaterThan(quietMs);
}

/** Make one library edit in `page` and wait until it is in IndexedDB (so the other tab adopts it). */
async function addLook(page: Page, name: string): Promise<string> {
  return page.evaluate(async (lookName) => {
    const { createLook } = await import('/src/model/packets.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const look = createLook(lookName, {
      styleTag: 'minimal',
      palette: { id: 'captured', name: 'Captured', styleTags: ['minimal'], accent: '#22aa66', text: '#ffffff', textDim: 'rgba(255,255,255,0.7)', panel: 'rgba(12,14,18,0.92)' },
      fontId: null,
      customFont: null,
    });
    await commitDurableWrites();
    return look.id;
  }, name);
}

async function removeLook(page: Page, id: string): Promise<void> {
  await page.evaluate(async (lookId) => {
    const { deleteLook } = await import('/src/model/packets.ts');
    const { syncNow } = await import('/src/backend/syncController.ts');
    deleteLook(lookId);
    await syncNow();
  }, id);
}

async function signedInTabs(context: BrowserContext, passes: ReturnType<typeof countPasses>, count: number): Promise<Page[]> {
  const first = await context.newPage();
  await signIn(first);
  await settleSync(first);
  const tabs = [first];
  // The other tabs share the first one's session (one browser), so they boot signed in.
  while (tabs.length < count) {
    const tab = await context.newPage();
    await tab.goto('/app');
    await settleSync(tab);
    tabs.push(tab);
  }
  await untilQuiet(first, passes);
  passes.reset();
  return tabs;
}

test('two tabs, one edit: exactly one library sync pass, run by the tab that made it', async ({ browser }) => {
  test.skip(!haveCreds, 'needs E2E_EMAIL / E2E_PASSWORD');
  test.setTimeout(150_000);
  const context = await browser.newContext();
  const passes = countPasses(context);
  const [a, b] = await signedInTabs(context, passes, 2);

  const id = await addLook(a, `One pass ${Date.now()}`);
  try {
    await expect.poll(() => passes.total(), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
    await untilQuiet(a, passes);

    expect(passes.perPage.get(a) ?? 0, 'the tab that made the edit syncs it once').toBe(1);
    // Before 2026-09-30 this was 1: the adopting tab ran a full pass of its own.
    expect(passes.perPage.get(b) ?? 0, 'the tab that only adopted the edit runs no pass').toBe(0);
  } finally {
    await removeLook(a, id);
    await context.close();
  }
});

test('a tab that closes before its pass hands the pass to ONE of the tabs still open', async ({ browser }) => {
  test.skip(!haveCreds, 'needs E2E_EMAIL / E2E_PASSWORD');
  test.setTimeout(180_000);
  const context = await browser.newContext();
  const passes = countPasses(context);
  const [a, b, c] = await signedInTabs(context, passes, 3);

  const id = await addLook(a, `Handed over ${Date.now()}`);
  try {
    // Inside the 2.5 s debounce: the closing tab never runs the pass it owed.
    await a.close();
    await expect.poll(() => passes.total(), { timeout: 20_000 }).toBeGreaterThanOrEqual(1);
    await untilQuiet(b, passes);
    expect(passes.perPage.get(a) ?? 0, 'the closed tab ran nothing').toBe(0);
    expect((passes.perPage.get(b) ?? 0) + (passes.perPage.get(c) ?? 0), 'one open tab took the pass, not each').toBe(1);

    // The edit really reached the cloud, not only the open tabs' IndexedDB.
    const pushed = await b.evaluate(async (lookId) => {
      const { SupabaseProvider } = await import('/src/backend/supabaseProvider.ts');
      const rows = await new SupabaseProvider().list('look');
      return rows.some((r) => r.id === lookId && !r.deleted);
    }, id);
    expect(pushed, 'the closed tab’s edit was pushed by the tab that stayed open').toBe(true);
  } finally {
    await removeLook(b, id);
    await context.close();
  }
});
