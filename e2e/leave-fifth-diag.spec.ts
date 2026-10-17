// covers: none - disposable fifth checker diagnosis of the carried fourth-checker case :228; never land
//
// The carried case, with its steps unchanged, plus a log of every history call and navigation event
// and the save/route state after the release. It answers WHY the leave sometimes stays in the editor
// after the retried first Save landed (run 39025101795).
import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { open, draw, source, ready, inspection, selected } from './_layerProperty';
import { settleDurableWrites } from './_durable';

type Rule = { key: string; after?: string; used?: boolean };
type Probe = {
  puts: Record<string, number>; held: { key: string; value: unknown }[]; releases: (() => void)[];
  hold: { key: string; left: number } | null; refuse: Rule[]; refused: string[]; stacks: string[]; errors: unknown[];
};
declare global { interface Window { fourth: Probe } }

/** One wrapper around IndexedDB puts for the whole page: counts puts per key, holds the
 *  completion of the next `hold.left` puts on `hold.key`, and refuses puts by rule. */
async function install(page: Page) {
  await page.evaluate(() => {
    if (window.fourth) return;
    const p: Probe = { puts: {}, held: [], releases: [], hold: null, refuse: [], refused: [], stacks: [], errors: [] };
    window.fourth = p;
    window.addEventListener('spx-storage-error', e => p.errors.push((e as CustomEvent).detail));
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      const k = String(key);
      const rule = p.refuse.find(r => !r.used && r.key === k && (!r.after || (p.puts[r.after] ?? 0) > 0));
      p.puts[k] = (p.puts[k] ?? 0) + 1;
      if (rule) { rule.used = true; p.refused.push(k); p.stacks.push(String(new Error().stack)); throw new DOMException('Fourth checker refusal', 'QuotaExceededError'); }
      const request = original.call(this, value, key);
      if (p.hold && p.hold.key === k && p.hold.left > 0) {
        p.hold.left--;
        const index = p.held.length, tx = this.transaction;
        p.held.push({ key: k, value: JSON.parse(String(value)) });
        Object.defineProperty(tx, 'oncomplete', { configurable: true, set(handler: (event: Event) => void) {
          tx.addEventListener('complete', event => { p.releases[index] = () => handler.call(tx, event); }, { once: true });
        } });
      }
      return request;
    };
  });
}
const hold = (page: Page, key: string, count = 1) => page.evaluate(([key, count]) => { window.fourth.hold = { key, left: count }; }, [key, count] as const);
const refuse = (page: Page, key: string, after?: string) => page.evaluate(([key, after]) => { window.fourth.refuse.push({ key, after: after || undefined }); }, [key, after ?? ''] as const);
const state = (page: Page) => page.evaluate(() => ({ puts: { ...window.fourth.puts }, held: window.fourth.held, released: window.fourth.releases.map(Boolean),
  refused: [...window.fourth.refused], stacks: [...window.fourth.stacks], errors: window.fourth.errors.length }));
const release = (page: Page, index = 0) => page.evaluate(i => window.fourth.releases[i](), index);
const heldReady = (page: Page, n = 1) => expect.poll(async () => (await state(page)).released.filter(Boolean).length).toBe(n);

const library = (page: Page) => page.evaluate(async () => (await import('/src/model/library.ts')).loadGraphics());
const link = (page: Page) => page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().saved);
const raw = (page: Page, key: string) => page.evaluate(key => new Promise<string | null>((resolve, reject) => {
  const request = indexedDB.open('noacg-studio');
  request.onsuccess = () => {
    const tx = request.result.transaction('kv', 'readonly'), get = tx.objectStore('kv').get(key);
    tx.oncomplete = () => { const v = get.result; request.result.close(); resolve(v === undefined ? null : String(v)); };
    tx.onerror = () => reject(tx.error);
  };
  request.onerror = () => reject(request.error);
}), key);

/** An edit through the editor's command surface (the way an agent or the CLI bridge edits). */
async function commandEdit(page: Page, thenClick?: string) {
  await page.evaluate(async thenClick => {
    const { activeEditorCommands } = await import('/src/components/editorFoundation/commandAdapter.ts');
    const c = activeEditorCommands(), i = c.inspect();
    if (!i.ok) throw Error(i.refusal.message);
    const target = i.targets.find(t => t.capabilities['text.set']?.supported);
    const result = target
      ? c.apply({ expected: i.expected, transactionId: crypto.randomUUID(), commands: [{ id: 'text.set', args: { targetId: target.id!, text: 'Fourth ' + crypto.randomUUID().slice(0, 6) } }] })
      : c.apply({ expected: i.expected, transactionId: crypto.randomUUID(), commands: [{ id: 'layer.create', args: { geometry: { shape: 'rectangle', x: 700, y: 120, width: 90, height: 90 } } }] });
    if (!result.ok) throw Error(result.refusal.message);
    if (thenClick) (document.querySelector(`[data-testid=${thenClick}]`) as HTMLButtonElement).click();
    await new Promise(r => setTimeout(r));
  }, thenClick ?? '');
}

async function saveNamed(page: Page, name: string) {
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill(name);
  await page.getByTestId('save-confirm').click(); await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await settleDurableWrites(page);
}
async function backUntilAsked(page: Page) {
  let backs = 0;
  while (await page.getByTestId('confirm-switch').count() === 0 && backs < 3) { await page.evaluate(() => history.back()); backs++; await page.waitForTimeout(500); }
  await expect(page.getByTestId('confirm-switch')).toBeVisible();
  return backs;
}
const out = (name: string, value: unknown) => writeFileSync(test.info().outputPath(name), JSON.stringify(value, null, 2));

test('diag: hash change -> refused first Save stays with nothing minted; Escape keeps the editor; a double-submitted retry mints one record', async ({ page }) => {
  test.setTimeout(150_000);
  await page.addInitScript(() => {
    if (window.top !== window) return;
    const w = window as unknown as { navlog: unknown[] }; w.navlog = [];
    const rec = (kind: string, extra?: unknown) => w.navlog.push({ t: Math.round(performance.now()), kind, hash: location.hash, state: history.state, len: history.length, extra });
    addEventListener('popstate', () => rec('popstate'), true); addEventListener('hashchange', () => rec('hashchange'), true);
    for (const m of ['go', 'back', 'forward', 'pushState', 'replaceState'] as const) {
      const orig = (history as unknown as Record<string, (...a: unknown[]) => unknown>)[m].bind(history);
      (history as unknown as Record<string, unknown>)[m] = (...a: unknown[]) => { rec(m, m === 'go' ? a[0] : a[2]); return orig(...a); };
    }
  });
  await open(page); await draw(page, .34); await settleDurableWrites(page);
  const edited = await source(page), editorUrl = page.url(), history = (await inspection(page)).history;
  await page.evaluate(() => { location.hash = '#/home'; });
  await expect(page.getByTestId('confirm-switch')).toBeVisible(); await expect(page.getByTestId('home-page')).toHaveCount(0);
  expect(page.url()).toBe(editorUrl);
  await page.getByTestId('switch-save').click(); await page.getByTestId('save-name').fill('Fourth hash');
  await install(page); await refuse(page, 'spx-gfx-graphics');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog').locator('.status-bad')).toBeVisible();
  await expect(page.getByTestId('home-page')).toHaveCount(0); expect(page.url()).toBe(editorUrl);
  expect(await library(page)).toHaveLength(0); expect(await link(page)).toMatchObject({ graphicId: null, dirty: true });
  expect((await state(page)).errors, 'the refusal was announced generically as well as in the dialog').toBe(0);
  await page.screenshot({ path: test.info().outputPath('refused-first-save.png') });
  await page.keyboard.press('Escape'); await expect(page.getByTestId('save-dialog')).toHaveCount(0);
  expect(page.url()).toBe(editorUrl); expect(await source(page)).toEqual(edited); expect((await inspection(page)).history).toEqual(history);
  await page.evaluate(() => { location.hash = '#/home'; }); await expect(page.getByTestId('confirm-switch')).toBeVisible();
  await page.getByTestId('switch-save').click(); await page.getByTestId('save-name').fill('Fourth hash');
  await hold(page, 'spx-gfx-graphics');
  await page.getByTestId('save-name').press('Enter'); await page.getByTestId('save-name').press('Enter', { timeout: 2000 }).catch(() => undefined);
  await page.getByTestId('save-confirm').click({ force: true, timeout: 2000 }).catch(() => undefined);
  await heldReady(page);
  expect((await state(page)).puts['spx-gfx-graphics'], 'double submission reached storage twice').toBe(2);
  const navBefore = await page.evaluate(() => (window as unknown as { navlog: unknown[] }).navlog.length);
  await release(page);
  await page.waitForTimeout(1500);
  const diag = await page.evaluate(async () => ({ log: (window as unknown as { navlog: unknown[] }).navlog, url: location.href, route: (await import('/src/app/router.ts')).useRouter.getState().route,
    ui: (({ saveDialog, confirmSwitch }) => ({ saveDialog: !!saveDialog, confirmSwitch: !!confirmSwitch }))((await import('/src/store/saveActions.ts')).useSaveUi.getState()),
    saved: (await import('/src/store/templateStore.ts')).useTemplateStore.getState().saved }));
  out('diag-228.json', { navBefore, home: await page.getByTestId('home-page').count(), ...diag });
  await expect(page.getByTestId('home-page')).toBeVisible(); await expect(page).toHaveURL(/#\/home$/);
  const kept = await library(page);
  expect(kept).toHaveLength(1); expect(kept[0].template).toEqual({ ...edited, name: 'Fourth hash' });
  await settleDurableWrites(page); await page.reload(); await expect(page.getByTestId('home-page')).toBeVisible();
  expect(await library(page)).toHaveLength(1);
  await page.locator('[data-door="new-graphic"]').click(); await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await expect(page.getByTestId('confirm-switch')).toHaveCount(0);
  out('hash-refused-first-save.json', { refusedStayed: true, nothingMinted: true, escapeKeptEditor: true, doubleSubmitOnePut: true, records: 1 });
});

