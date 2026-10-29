// covers: src/store/saveActions.ts
// A separate regression file preserves every pre-existing maintained/carried test byte-for-byte.
// The hold isolates durable-library announcement lag; actual copy writes and conflict relinking run normally.
import { test, expect, type Page } from '@playwright/test';
import { open, draw, source } from './_layerProperty';
import { settleDurableWrites } from './_durable';
import { library, link, flush, body, leave, left, nothingAsks } from './_saveMatrix';

async function delayedLibraryTab(page: Page) {
  const other = await page.context().newPage();
  await other.addInitScript(() => {
    if (window.top !== window) return;
    const w = window as unknown as { check10Hold: boolean; check10Queue: (() => void)[] };
    w.check10Hold = false; w.check10Queue = [];
    const Native = window.BroadcastChannel;
    const descriptor = Object.getOwnPropertyDescriptor(Native.prototype, 'onmessage')!;
    window.BroadcastChannel = class extends Native {
      set onmessage(listener: ((e: MessageEvent) => void) | null) {
        descriptor.set!.call(this, listener && this.name === 'noacg-durable-writes'
          ? (e: MessageEvent) => { if (w.check10Hold) w.check10Queue.push(() => listener.call(this, e)); else listener.call(this, e); }
          : listener);
      }
      get onmessage() { return descriptor.get!.call(this); }
    };
  });
  await other.goto(page.url());
  await expect(other.getByTestId('editor-foundation')).toBeVisible();
  return other;
}

async function conflicted(page: Page) {
  await open(page); await draw(page, .28); await flush(page); await settleDurableWrites(page);
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Tenth gamma');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await settleDurableWrites(page);
  const gamma = (await library(page))[0];
  const other = await delayedLibraryTab(page);
  await other.evaluate(() => { (window as unknown as { check10Hold: boolean }).check10Hold = true; });
  const pass = await page.evaluate(async gamma => {
    const { runSync } = await import('/src/backend/sync.ts');
    const { LocalStorageProvider } = await import('/src/backend/storage.ts');
    localStorage.setItem('spx-gfx-sync', JSON.stringify({ lastSyncedAt: new Date(Date.now() - 60_000).toISOString(), pendingPush: [], pendingConflict: [] }));
    const at = new Date(Date.now() + 1000).toISOString();
    const winner = { ...gamma, name: 'Remote winner', template: { ...gamma.template, name: 'Remote winner', css: gamma.template.css + '\n/* remote winner */' }, updatedAt: at };
    type Row = { kind: string; id: string; updatedAt: string; body: unknown };
    const rows = new Map<string, Row>([[`graphic:${gamma.id}`, { kind: 'graphic', id: gamma.id, updatedAt: at, body: winner }]]);
    const cloud = {
      list: async (kind: string) => [...rows.values()].filter(r => r.kind === kind),
      get: async (kind: string, id: string) => rows.get(`${kind}:${id}`) ?? null,
      put: async (r: Row) => { rows.set(`${r.kind}:${r.id}`, r); },
      remove: async (kind: string, id: string) => { rows.delete(`${kind}:${id}`); },
    };
    const result = await runSync(new LocalStorageProvider(), cloud as never);
    await new Promise(r => setTimeout(r));
    return { conflicts: result.conflicts, failures: result.failures.length };
  }, gamma);
  expect(pass).toEqual({ conflicts: 1, failures: 0 });
  await settleDurableWrites(page);
  const copy = (await library(page)).find(g => g.id !== gamma.id)!;
  await expect.poll(async () => (await link(other)).graphicId).toBe(copy.id);
  expect(await link(other)).toMatchObject({ graphicId: copy.id, dirty: false });
  expect((await library(other)).some(g => g.id === copy.id)).toBe(false);
  return { other, gamma, copy };
}

async function releaseLibrary(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { check10Hold: boolean; check10Queue: (() => void)[] };
    w.check10Hold = false; for (const adopt of w.check10Queue.splice(0)) adopt();
  });
}

for (const duringWait of ['unedited', 'edited', 'chained'] as const) {
  test(`clean copy arrival timeout: ${duringWait}, real ten-second wait and retry`, async ({ page }) => {
    const { other, gamma, copy } = await conflicted(page);
    const winner = (await library(page)).find(g => g.id === gamma.id)!;
    let target = copy;
    const before = await source(other), start = Date.now();
    await other.getByTestId('save-graphic').click();
    await expect(other.getByTestId('save-status')).toHaveText('Saving…');
    if (duringWait === 'edited') {
      await draw(other, .61); await flush(other); await settleDurableWrites(other);
      expect(await link(other)).toMatchObject({ graphicId: copy.id, dirty: true });
    }
    if (duringWait === 'chained') {
      target = await page.evaluate(async gamma => {
        const { upsertGraphic } = await import('/src/model/library.ts');
        const { graphicSuperseded } = await import('/src/model/project.ts');
        // Sync renames the record, preserving its saved template byte-for-byte. A first-Save
        // builder would also rename template.name, manufacturing a source difference here.
        const doc = { ...gamma, id: crypto.randomUUID(), name: 'Second (conflicted copy)' };
        upsertGraphic(doc);
        graphicSuperseded(gamma.id, doc);
        await new Promise(r => setTimeout(r));
        return doc;
      }, gamma);
      await settleDurableWrites(page);
      await expect.poll(async () => link(other)).toMatchObject({ graphicId: target.id, dirty: false });
      expect((await library(other)).some(g => g.id === target.id)).toBe(false);
    }
    const requested = await source(other);
    // Real wall time throughout: no clock installation or timer replacement.
    await expect(other.getByTestId('save-status')).toHaveText('Save failed', { timeout: duringWait === 'chained' ? 25_000 : 15_000 });
    const elapsed = Date.now() - start;
    expect(elapsed, 'Save returned before its real ten-second arrival bound').toBeGreaterThanOrEqual(duringWait === 'chained' ? 20_000 : 10_000);
    expect(await link(other)).toMatchObject({ graphicId: target.id, dirty: duringWait === 'edited', status: 'failed' });
    await expect(other.getByTestId('save-name'), 'timeout manufactured a first-Save naming request').toHaveCount(0);
    expect(await source(other)).toEqual(requested);
    expect(body(copy.template), 'the original conflicted copy holds the last saved work').toEqual(body(before));
    await other.screenshot({ path: test.info().outputPath(`timeout-${duringWait}.png`) });
    if (duringWait === 'unedited') {
      const url = other.url();
      await leave(other, 'home'); await left(other, 'home');
      await expect(other.getByTestId('confirm-switch')).toHaveCount(0);
      await other.evaluate(async hash => { location.hash = hash; await new Promise(r => setTimeout(r)); }, new URL(url).hash);
      await expect(other.getByTestId('editor-foundation')).toBeVisible();
      expect(await link(other)).toMatchObject({ graphicId: target.id, dirty: false });
      expect((await library(other)).some(g => g.id === target.id), 'navigation must not silently reload/adopt the held copy').toBe(false);
    } else if (duringWait === 'edited') {
      await other.getByTestId('open-home').click();
      await expect(other.getByTestId('confirm-switch')).toBeVisible();
      await other.getByTestId('switch-cancel').click();
      expect(await source(other)).toEqual(requested);
    }
    await releaseLibrary(other);
    await expect.poll(async () => (await library(other)).some(g => g.id === target.id)).toBe(true);
    expect(await link(other)).toMatchObject({ graphicId: target.id, dirty: duringWait === 'edited' });
    await other.getByTestId('save-graphic').click();
    await expect(other.getByTestId('save-status')).toHaveText('Saved');
    await expect(other.getByTestId('save-name')).toHaveCount(0);
    await settleDurableWrites(other);
    const all = await library(other);
    expect(all, 'no duplicate was minted on timeout or retry').toHaveLength(duringWait === 'chained' ? 3 : 2);
    expect(all.find(g => g.id === gamma.id), 'the losing work overwrote the remote winner').toEqual(winner);
    expect(body(all.find(g => g.id === target.id)!.template)).toEqual(body(requested));
    expect(await link(other)).toMatchObject({ graphicId: target.id, dirty: false });
    await leave(other, 'open'); await left(other, 'open');
    await expect(other.getByTestId('confirm-switch')).toHaveCount(0);
    await nothingAsks(other, target.id);
    console.log('COPY ARRIVAL RETRY', JSON.stringify({ duringWait, elapsed, target: target.id, records: all.length }));
  });
}
