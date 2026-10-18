// covers: none - disposable tenth independent acceptance challenge; never land
import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { open, draw, source } from './_layerProperty';
import { settleDurableWrites } from './_durable';
import { library, link, flush, body } from './_saveMatrix';

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

for (const mode of ['without another edit', 'after another edit'] as const) {
  test(`tenth held-copy timeout ${mode}: cancel naming, recover adoption, leave and reload`, async ({ page }) => {
    test.setTimeout(120_000);
    const facts: Record<string, unknown> = { mode };
    try {
      const { other, gamma, copy } = await conflicted(page);
      const winner = JSON.stringify((await library(page)).find(g => g.id === gamma.id));
      if (mode === 'after another edit') { await draw(other, .61); await flush(other); await settleDurableWrites(other); }
      const before = await source(other);
      facts.before = await link(other);
      await other.clock.install();
      await other.getByTestId('save-graphic').click();
      await expect(other.getByTestId('save-status')).toHaveText('Saving…');
      await other.clock.fastForward(10_001);
      await expect(other.getByTestId('save-name')).toBeVisible();
      facts.afterTimeout = await link(other);
      facts.named = await other.getByTestId('save-name').count();
      await other.getByTestId('save-dialog').getByRole('button', { name: 'Cancel', exact: true }).click();
      await other.evaluate(() => {
        const w = window as unknown as { check10Hold: boolean; check10Queue: (() => void)[] };
        w.check10Hold = false; for (const adopt of w.check10Queue.splice(0)) adopt();
      });
      await expect.poll(async () => (await library(other)).some(g => g.id === copy.id)).toBe(true);
      facts.afterAdoption = await link(other);
      facts.sourcePreserved = JSON.stringify(body(await source(other))) === JSON.stringify(body(before));
      await other.getByTestId('open-home').click();
      await expect(other.getByTestId('confirm-switch').or(other.getByTestId('home-page')).first()).toBeVisible();
      facts.homeAsked = await other.getByTestId('confirm-switch').count();
      facts.question = facts.homeAsked ? await other.getByTestId('confirm-switch').innerText() : null;
      facts.winnerUnchanged = JSON.stringify((await library(other)).find(g => g.id === gamma.id)) === winner;
      facts.records = (await library(other)).length;
      await other.screenshot({ path: test.info().outputPath('after-timeout.png') });
      console.log('TENTH FACTS', JSON.stringify(facts));
      expect(facts.sourcePreserved).toBe(true);
      expect(facts.winnerUnchanged).toBe(true);
      expect(facts.records).toBe(2);
      if (mode === 'without another edit') {
        expect(facts.homeAsked, 'a Save timeout manufactured unsaved work although no edit followed the saved conflict').toBe(0);
        expect(facts.afterAdoption).toMatchObject({ graphicId: copy.id, dirty: false });
      } else expect(facts.homeAsked).toBe(1);
    } finally {
      writeFileSync(test.info().outputPath('tenth-timeout.json'), JSON.stringify(facts, null, 2));
    }
  });
}
