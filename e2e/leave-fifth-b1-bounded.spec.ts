// covers: none - disposable sixth check: the fifth checker with ONLY B1's unbounded storage-alert textContent() bounded; never land
//
// Adversarial challenges written by the fifth checker. Every failure so far was one more ordering
// of a Save's separate durable writes: the library record (L), the draft's link in the working
// slot (K), and working-slot autosaves (A: a pending edit's timer; N: the timer a Save's own name
// adoption schedules). Each case below forces ONE ordering on ONE write by this file's own probe
// and records which code made the write (its stack), so another write cannot stand in for it:
//   hold     - the completion notice is deferred until released (the write itself lands);
//   refuse   - the put throws QuotaExceededError once;
//   late     - the transaction is kept open, then aborted on release (a refusal that arrives late).
// Operations: hold and edit meanwhile; refuse once; refuse and retry; refuse and reload; replace
// the document during the wait; across Save, Save As, first-Save naming, Discard and the wizard's
// Finish doors.
import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { open, draw, source, ready } from './_layerProperty';
import { settleDurableWrites } from './_durable';
import { pickDesign } from './_browse';

type Action = 'hold' | 'refuse' | 'late';
type Rule = { key: string; action: Action; after?: string; afterMin: number; skip: number; used?: boolean };
type Put = { key: string; n: number; action: Action | 'pass'; stack: string };
type Probe = { puts: Record<string, number>; log: Put[]; rules: Rule[]; releases: ((refuse?: boolean) => void)[]; errors: unknown[] };
declare global { interface Window { fifth: Probe } }

/** One wrapper around IndexedDB puts for the whole page. */
async function install(page: Page) {
  await page.evaluate(() => {
    if (window.fifth) return;
    const p: Probe = { puts: {}, log: [], rules: [], releases: [], errors: [] };
    window.fifth = p;
    window.addEventListener('spx-storage-error', e => p.errors.push((e as CustomEvent).detail));
    const original = IDBObjectStore.prototype.put;
    const short = (stack: string) => stack.split('\n').slice(2, 12).map(l => l.trim().replace(/\?[^:)]*/g, '').replace(/https?:\/\/[^/]+/g, '')).join(' < ');
    IDBObjectStore.prototype.put = function(value, key) {
      const k = String(key);
      p.puts[k] = (p.puts[k] ?? 0) + 1;
      const rule = p.rules.find(r => !r.used && r.key === k && (!r.after || (p.puts[r.after] ?? 0) >= r.afterMin) && (r.skip-- <= 0));
      const entry: Put = { key: k, n: p.puts[k], action: rule?.action ?? 'pass', stack: short(String(new Error().stack)) };
      p.log.push(entry);
      if (rule) rule.used = true;
      if (rule?.action === 'refuse') throw new DOMException('Fifth checker refusal', 'QuotaExceededError');
      const request = original.call(this, value, key);
      if (rule?.action === 'hold') {
        const tx = this.transaction, index = p.releases.length;
        p.releases.push(undefined as unknown as () => void);
        Object.defineProperty(tx, 'oncomplete', { configurable: true, set(handler: (event: Event) => void) {
          tx.addEventListener('complete', event => { p.releases[index] = () => handler.call(tx, event); }, { once: true });
        } });
      }
      if (rule?.action === 'late') {
        // Keep the transaction alive with reads until released, then abort it: the value never
        // lands and the refusal arrives after whatever happened meanwhile.
        const store = this, tx = this.transaction;
        let done = false;
        const keep = () => { if (!done) store.get('__fifth_keepalive').onsuccess = keep; };
        keep();
        p.releases.push(() => { done = true; tx.abort(); });
      }
      return request;
    };
  });
}
/** Add a rule: the next put on `key` (after `after` has had `afterDelta` more puts), skipping `skip`. */
const rule = (page: Page, key: string, action: Action, opts: { after?: string; afterDelta?: number; skip?: number } = {}) =>
  page.evaluate(([key, action, after, afterDelta, skip]) => {
    const p = window.fifth;
    p.rules.push({ key, action: action as Action, after: after || undefined, afterMin: after ? (p.puts[after] ?? 0) + Number(afterDelta) : 0, skip: Number(skip) });
  }, [key, action, opts.after ?? '', opts.afterDelta ?? 1, opts.skip ?? 0] as const);
const LIB = 'spx-gfx-graphics', SLOT = 'spx-gfx-project';
const probe = (page: Page) => page.evaluate(() => ({ puts: { ...window.fifth.puts }, log: window.fifth.log.map(l => ({ ...l })),
  ready: window.fifth.releases.map(Boolean), errors: window.fifth.errors.length }));
const release = (page: Page, index = 0) => page.evaluate(i => window.fifth.releases[i](), index);
const releasable = (page: Page, n = 1) => expect.poll(async () => (await probe(page)).ready.filter(Boolean).length).toBe(n);
const acted = (page: Page, action: Action) => page.evaluate(a => window.fifth.log.filter(l => l.action === a), action);

const library = (page: Page) => page.evaluate(async () => (await import('/src/model/library.ts')).loadGraphics());
const link = (page: Page) => page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().saved);
const flush = (page: Page) => page.evaluate(async () => (await import('/src/store/templateStore.ts')).flushPendingProject());
const raw = (page: Page, key: string) => page.evaluate(key => new Promise<string | null>((resolve, reject) => {
  const request = indexedDB.open('noacg-studio');
  request.onsuccess = () => {
    const tx = request.result.transaction('kv', 'readonly'), get = tx.objectStore('kv').get(key);
    tx.oncomplete = () => { const v = get.result; request.result.close(); resolve(v === undefined ? null : String(v)); };
    tx.onerror = () => reject(tx.error);
  };
  request.onerror = () => reject(request.error);
}), key);
const slot = async (page: Page) => { const s = JSON.parse((await raw(page, SLOT)) ?? 'null'); return s && { graphicId: s.graphicId, dirty: s.dirty, name: s.template?.name }; };

async function commandEdit(page: Page, thenClick?: string) {
  await page.evaluate(async thenClick => {
    const { activeEditorCommands } = await import('/src/components/editorFoundation/commandAdapter.ts');
    const c = activeEditorCommands(), i = c.inspect();
    if (!i.ok) throw Error(i.refusal.message);
    const target = i.targets.find(t => t.capabilities['text.set']?.supported);
    const result = target
      ? c.apply({ expected: i.expected, transactionId: crypto.randomUUID(), commands: [{ id: 'text.set', args: { targetId: target.id!, text: 'Fifth ' + crypto.randomUUID().slice(0, 6) } }] })
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
/** A never-saved edited draft (wizard import -> editor), settled. */
async function fresh(page: Page) { await open(page); await draw(page, .26); await flush(page); await settleDurableWrites(page); }
/** A saved graphic edited since its save, settled. */
async function linked(page: Page, name: string) {
  await open(page); await draw(page, .22); await saveNamed(page, name);
  await draw(page, .52); await flush(page); await settleDurableWrites(page);
  return (await library(page)).find(g => g.name === name)!;
}
async function newAsks(page: Page) {
  await expect(page.getByTestId('home-page')).toBeVisible();
  await page.locator('[data-door="new-graphic"]').click();
  await expect(page.getByTestId('creation-wizard').or(page.getByTestId('confirm-switch')).first()).toBeVisible();
  return page.getByTestId('confirm-switch').count();
}
async function toFinish(page: Page) {
  await page.goto('/app#/new');
  await expect(page.getByTestId('creation-wizard')).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-entry="template"]').click();
  await pickDesign(page, 'Hairline');
  await page.getByTestId('wz-skip-to-finish').click();
  await expect(page.getByTestId('wz-finish-name')).toBeVisible();
}
const out = (name: string, value: unknown) => writeFileSync(test.info().outputPath(name), JSON.stringify(value, null, 2));
const shot = (page: Page, name: string) => page.screenshot({ path: test.info().outputPath(name) });

// ── K refused, then a reload with no retry ─────────────────────────────────────────────────────

test('fifth A1: first Save under the template name, link write refused, reload, Save again: one record', async ({ page }) => {
  test.setTimeout(120_000);
  await fresh(page);
  const requested = await source(page), editorUrl = page.url();
  await install(page);
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click();
  await rule(page, SLOT, 'refuse', { after: LIB });
  // The dialog offers the template's own name; the user just presses Save.
  await expect(page.getByTestId('save-name')).toHaveValue(requested.name);
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog').locator('.status-bad')).toBeVisible();
  const refused = await acted(page, 'refuse');
  expect(refused.map(r => r.key)).toEqual([SLOT]);
  expect(refused[0].stack, 'the refused put is the Save\'s own link write').toContain('persistLink');
  await expect(page.getByTestId('home-page')).toHaveCount(0); expect(page.url()).toBe(editorUrl);
  const minted = await library(page); expect(minted).toHaveLength(1);
  await shot(page, 'a1-refused.png');
  await page.waitForTimeout(1500); await settleDurableWrites(page);
  const facts: Record<string, unknown> = { liveLink: await link(page), slotBeforeReload: await slot(page), slotPutsAfterRefusal: (await probe(page)).log.filter(l => l.key === SLOT).length };
  await page.reload(); await expect(page.getByTestId('editor-foundation').or(page.getByTestId('home-page')).first()).toBeVisible();
  await ready(page).catch(() => undefined);
  facts.afterReloadLink = await link(page); facts.afterReloadRecords = (await library(page)).length;
  await page.getByTestId('open-home').click();
  facts.homeAsked = await page.getByTestId('confirm-switch').count();
  if (facts.homeAsked) {
    facts.saveButton = await page.getByTestId('switch-save').textContent();
    await page.getByTestId('switch-save').click();
    if (await page.getByTestId('save-dialog').count()) await page.getByTestId('save-confirm').click();
  }
  await expect(page.getByTestId('home-page')).toBeVisible();
  const after = await library(page);
  facts.recordsAfterSecondSave = after.length; facts.names = after.map(g => g.name);
  await shot(page, 'a1-home-after.png');
  out('a1-refuse-reload-first-same-name.json', facts);
  expect(facts.afterReloadLink, 'after a reload the draft is no longer linked to the record its save minted').toMatchObject({ graphicId: minted[0].id });
  expect(after, 'a refused link write followed by a reload let the next Save mint a second record for the same work').toHaveLength(1);
});

test('fifth A2: first Save under a new name, link write refused, reload after the name autosave: one record', async ({ page }) => {
  test.setTimeout(120_000);
  await fresh(page);
  await install(page);
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click();
  await page.getByTestId('save-name').fill('Fifth A2');
  await rule(page, SLOT, 'refuse', { after: LIB });
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog').locator('.status-bad')).toBeVisible();
  const [minted] = await library(page);
  await expect.poll(async () => (await probe(page)).log.filter(l => l.key === SLOT && l.action === 'pass').length).toBeGreaterThan(0);
  await settleDurableWrites(page);
  const facts: Record<string, unknown> = { slotBeforeReload: await slot(page), slotPuts: (await probe(page)).log.filter(l => l.key === SLOT) };
  await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  facts.afterReloadLink = await link(page);
  await page.getByTestId('open-home').click(); await expect(page.getByTestId('confirm-switch')).toBeVisible();
  await page.getByTestId('switch-save').click();
  if (await page.getByTestId('save-dialog').count()) await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  const after = await library(page); facts.records = after.length;
  out('a2-refuse-reload-first-new-name.json', facts);
  expect(after).toHaveLength(1); expect(after[0].id).toBe(minted.id);
});

test('fifth A3: linked Save, link write refused, reload, Save & continue: one record with the source', async ({ page }) => {
  test.setTimeout(120_000);
  const record = await linked(page, 'Fifth A3');
  const requested = await source(page);
  await install(page);
  await page.getByTestId('open-home').click();
  await rule(page, SLOT, 'refuse', { after: LIB });
  await page.getByTestId('switch-save').click();
  await expect(page.getByTestId('confirm-switch').locator('.status-bad')).toBeVisible();
  expect((await acted(page, 'refuse'))[0].stack).toContain('persistLink');
  await page.waitForTimeout(1200); await settleDurableWrites(page);
  await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  expect(await link(page)).toMatchObject({ graphicId: record.id, dirty: true });
  await page.getByTestId('open-home').click(); await expect(page.getByTestId('confirm-switch')).toBeVisible();
  await page.getByTestId('switch-save').click(); await expect(page.getByTestId('home-page')).toBeVisible();
  const after = await library(page);
  expect(after).toHaveLength(1); expect(after[0].template).toEqual(requested);
  expect(await newAsks(page)).toBe(0);
  out('a3-refuse-reload-linked.json', { records: 1, newAsked: 0 });
});

test('fifth A4: Save As, link write refused, reload: the copy stays the draft and the original is byte-equal', async ({ page }) => {
  test.setTimeout(120_000);
  const original = await linked(page, 'Fifth A4'), originalJson = JSON.stringify(original);
  await install(page);
  await page.getByTestId('save-menu').click(); await page.getByTestId('save-as').click();
  await page.getByTestId('save-name').fill('Fifth A4 copy');
  await rule(page, SLOT, 'refuse', { after: LIB });
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog').locator('.status-bad')).toBeVisible();
  const copy = (await library(page)).find(g => g.name === 'Fifth A4 copy')!;
  await page.waitForTimeout(1500); await settleDurableWrites(page);
  const facts: Record<string, unknown> = { slotBeforeReload: await slot(page) };
  await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  facts.afterReloadLink = await link(page);
  await page.getByTestId('save-graphic').click();
  if (await page.getByTestId('save-dialog').count()) await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  const after = await library(page); facts.records = after.map(g => g.name);
  out('a4-refuse-reload-save-as.json', facts);
  expect(after).toHaveLength(2);
  expect(JSON.stringify(after.find(g => g.id === original.id))).toBe(originalJson);
  expect(facts.afterReloadLink).toMatchObject({ graphicId: copy.id });
});

// ── N: the autosave a first Save's name adoption schedules, refused after the leave ────────────

test('fifth B1: first Save under a new name leaves to Home; the name autosave refused there; nothing asks about the saved graphic', async ({ page }) => {
  test.setTimeout(120_000);
  await fresh(page);
  await install(page);
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click();
  await page.getByTestId('save-name').fill('Fifth B1');
  // Skip the Save's own link write (K); refuse the next working-slot put.
  await rule(page, SLOT, 'refuse', { after: LIB, skip: 1 });
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  const leftAt = Date.now();
  await expect.poll(async () => (await acted(page, 'refuse')).length, { timeout: 5000 }).toBe(1);
  await page.evaluate(() => new Promise(r => setTimeout(r, 150)));
  const [refused] = await acted(page, 'refuse');
  const facts: Record<string, unknown> = {
    refusedAfterHomeMs: Date.now() - leftAt, refusedStack: refused.stack, slotPuts: (await probe(page)).log.filter(l => l.key === SLOT).map(l => ({ action: l.action, stack: l.stack.slice(0, 160) })),
    alert: await page.getByTestId('storage-alert').count(), alertText: await page.getByTestId('storage-alert').textContent({ timeout: 1000 }).catch(() => null),
    link: await link(page), records: (await library(page)).length,
  };
  await shot(page, 'b1-home-after-name-autosave.png');
  if (await page.getByTestId('storage-alert').count()) await page.getByTestId('storage-alert-close').click();
  facts.newAsked = await newAsks(page);
  if (facts.newAsked) { facts.question = await page.getByTestId('confirm-switch').textContent(); await shot(page, 'b1-new-asks.png'); await page.getByTestId('switch-cancel').click(); }
  await settleDurableWrites(page).catch(e => { facts.settle = String(e); });
  facts.slot = await slot(page);
  await page.goto('/app#/home'); await page.reload();
  facts.newAskedAfterReload = await newAsks(page);
  out('b1-name-autosave-refused-at-home.json', facts);
  expect(refused.stack, 'the refused put is the timer autosave, not the link write').not.toContain('persistLink');
  expect(facts.alert, 'a refusal of the name autosave was announced over Home as unsaved work').toBe(0);
  expect(facts.newAsked, 'New on Home asked about the graphic that was just saved').toBe(0);
});

test('fifth B2: Save As; its name autosave refused; the copy is not reported unsaved', async ({ page }) => {
  test.setTimeout(120_000);
  await linked(page, 'Fifth B2');
  await install(page);
  await page.getByTestId('save-menu').click(); await page.getByTestId('save-as').click();
  await page.getByTestId('save-name').fill('Fifth B2 copy');
  await rule(page, SLOT, 'refuse', { after: LIB, skip: 1 });
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toHaveCount(0);
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await expect.poll(async () => (await acted(page, 'refuse')).length, { timeout: 5000 }).toBe(1);
  await page.evaluate(() => new Promise(r => setTimeout(r, 150)));
  const facts = { refusedStack: (await acted(page, 'refuse'))[0].stack, alert: await page.getByTestId('storage-alert').count(),
    status: await page.getByTestId('save-status').textContent(), link: await link(page) };
  await shot(page, 'b2-save-as-name-autosave.png');
  out('b2-save-as-name-autosave-refused.json', facts);
  expect(facts.status, 'the copy reads unsaved although both its writes landed').toBe('Saved');
});

// ── A: an edit's pending autosave, still on its timer when Save & continue answers ────────────

test('fifth C1: an edit then Save & continue at once; its pending autosave refused at Home; nothing asks about the saved graphic', async ({ page }) => {
  test.setTimeout(120_000);
  const record = await linked(page, 'Fifth C1');
  await install(page);
  await rule(page, SLOT, 'refuse', { after: LIB, skip: 1 });
  // The edit and the Home press in one turn, then Save & continue: the edit's autosave timer is
  // still pending when the Save answers.
  await commandEdit(page, 'open-home');
  await page.getByTestId('switch-save').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  const requested = await source(page);
  expect((await library(page)).find(g => g.id === record.id)!.template).toEqual(requested);
  await expect.poll(async () => (await acted(page, 'refuse')).length, { timeout: 5000 }).toBe(1);
  await page.evaluate(() => new Promise(r => setTimeout(r, 150)));
  const facts: Record<string, unknown> = { refusedStack: (await acted(page, 'refuse'))[0].stack,
    slotPuts: (await probe(page)).log.filter(l => l.key === SLOT).map(l => ({ action: l.action, stack: l.stack.slice(0, 160) })),
    alert: await page.getByTestId('storage-alert').count(), link: await link(page) };
  await shot(page, 'c1-home-after-autosave.png');
  if (await page.getByTestId('storage-alert').count()) await page.getByTestId('storage-alert-close').click();
  facts.newAsked = await newAsks(page);
  if (facts.newAsked) await page.getByTestId('switch-cancel').click();
  await settleDurableWrites(page).catch(e => { facts.settle = String(e); });
  facts.slot = await slot(page);
  await page.goto('/app#/home'); await page.reload();
  facts.newAskedAfterReload = await newAsks(page);
  out('c1-pending-autosave-refused-at-home.json', facts);
  expect(facts.alert, 'a pending autosave of the saved source was announced over Home as unsaved work').toBe(0);
  expect(facts.newAsked, 'New on Home asked about the graphic that was just saved').toBe(0);
});

// ── K held, and an edit made meanwhile ─────────────────────────────────────────────────────────

test('fifth D1: first Save, link write held, an edit meanwhile: asks again over the editor; Save & continue writes it', async ({ page }) => {
  test.setTimeout(120_000);
  await fresh(page);
  const requested = await source(page), editorUrl = page.url();
  await install(page);
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click();
  await page.getByTestId('save-name').fill('Fifth D1');
  await rule(page, SLOT, 'hold', { after: LIB });
  await page.getByTestId('save-confirm').click(); await releasable(page);
  expect((await acted(page, 'hold'))[0].stack).toContain('persistLink');
  const [minted] = await library(page); expect(minted.template).toEqual({ ...requested, name: 'Fifth D1' });
  await commandEdit(page); await ready(page);
  const newer = await source(page);
  await release(page);
  await expect(page.getByTestId('save-dialog')).toHaveCount(0); await expect(page.getByTestId('confirm-switch')).toBeVisible();
  await expect(page.getByTestId('home-page')).toHaveCount(0); expect(page.url()).toBe(editorUrl);
  expect(await link(page)).toMatchObject({ graphicId: minted.id, dirty: true });
  await page.getByTestId('switch-save').click(); await expect(page.getByTestId('home-page')).toBeVisible();
  const kept = await library(page);
  expect(kept).toHaveLength(1); expect(kept[0].template).toEqual(newer);
  out('d1-held-link-first.json', { askedAgain: true, records: 1 });
});

test('fifth D2: linked leave Save, link write held, an edit meanwhile: refuses as changed; retry writes the newer source', async ({ page }) => {
  test.setTimeout(120_000);
  const record = await linked(page, 'Fifth D2');
  const requested = await source(page);
  await install(page);
  await page.getByTestId('open-home').click();
  await rule(page, SLOT, 'hold', { after: LIB });
  await page.getByTestId('switch-save').click(); await releasable(page);
  expect((await acted(page, 'hold'))[0].stack).toContain('persistLink');
  expect((await library(page))[0].template).toEqual(requested);
  await commandEdit(page); await ready(page);
  const newer = await source(page);
  await release(page);
  await expect(page.getByTestId('confirm-switch').locator('.status-bad')).toContainText('changed while saving');
  await expect(page.getByTestId('home-page')).toHaveCount(0);
  expect(await link(page)).toMatchObject({ graphicId: record.id, dirty: true });
  await page.getByTestId('switch-save').click(); await expect(page.getByTestId('home-page')).toBeVisible();
  const kept = await library(page); expect(kept).toHaveLength(1); expect(kept[0].template).toEqual(newer);
  out('d2-held-link-linked.json', { refusedAsChanged: true, retryWroteNewer: true });
});

test('fifth D3: Save As, link write held, an edit meanwhile: the copy stays unsaved and the original is byte-equal', async ({ page }) => {
  test.setTimeout(120_000);
  const original = await linked(page, 'Fifth D3'), originalJson = JSON.stringify(original);
  await install(page);
  await page.getByTestId('save-menu').click(); await page.getByTestId('save-as').click();
  await page.getByTestId('save-name').fill('Fifth D3 copy');
  await rule(page, SLOT, 'hold', { after: LIB });
  await page.getByTestId('save-confirm').click(); await releasable(page);
  await commandEdit(page); await ready(page);
  await release(page);
  await expect(page.getByTestId('save-dialog')).toHaveCount(0);
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes');
  const all = await library(page), copy = all.find(g => g.name === 'Fifth D3 copy')!;
  expect(all).toHaveLength(2); expect(JSON.stringify(all.find(g => g.id === original.id))).toBe(originalJson);
  expect(await link(page)).toMatchObject({ graphicId: copy.id, dirty: true });
  out('d3-held-link-save-as.json', { originalByteEqual: true, copyDirty: true });
});

// ── K refused, then retried (twice), or the dialog dismissed and the leave asked again ────────

test('fifth E1: first Save, link write refused twice: two retries, one record, one leave, nothing announced', async ({ page }) => {
  test.setTimeout(120_000);
  await fresh(page);
  const requested = await source(page);
  await install(page);
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click();
  await page.getByTestId('save-name').fill('Fifth E1');
  await rule(page, SLOT, 'refuse', { after: LIB, afterDelta: 1 });
  await rule(page, SLOT, 'refuse', { after: LIB, afterDelta: 2 });
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog').locator('.status-bad')).toBeVisible();
  await page.getByTestId('save-confirm').click();
  await expect.poll(async () => (await acted(page, 'refuse')).length).toBe(2);
  await expect(page.getByTestId('save-dialog').locator('.status-bad')).toBeVisible();
  await expect(page.getByTestId('home-page')).toHaveCount(0);
  expect(await library(page)).toHaveLength(1);
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  const kept = await library(page);
  expect(kept).toHaveLength(1); expect(kept[0].template).toEqual({ ...requested, name: 'Fifth E1' });
  expect((await probe(page)).errors).toBe(0); await expect(page.getByTestId('storage-alert')).toHaveCount(0);
  expect(await link(page)).toMatchObject({ graphicId: kept[0].id, dirty: false });
  await page.waitForTimeout(1200);
  expect(await newAsks(page)).toBe(0);
  out('e1-refused-twice-first.json', { records: 1, errors: 0 });
});

test('fifth E2: first Save, link write refused, Escape, then Home asks and Save & continue writes the same record', async ({ page }) => {
  test.setTimeout(120_000);
  await fresh(page);
  const edited = await source(page);
  await install(page);
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click();
  await page.getByTestId('save-name').fill('Fifth E2');
  await rule(page, SLOT, 'refuse', { after: LIB });
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog').locator('.status-bad')).toBeVisible();
  await page.keyboard.press('Escape'); await expect(page.getByTestId('save-dialog')).toHaveCount(0);
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  expect(await source(page), 'Escape after the refusal changed the draft').toEqual({ ...edited, name: 'Fifth E2' });
  const [minted] = await library(page);
  await page.getByTestId('open-home').click(); await expect(page.getByTestId('confirm-switch')).toBeVisible();
  await expect(page.getByTestId('switch-save')).toHaveText('Save & continue');
  await page.getByTestId('switch-save').click(); await expect(page.getByTestId('home-page')).toBeVisible();
  const kept = await library(page); expect(kept).toHaveLength(1); expect(kept[0].id).toBe(minted.id);
  out('e2-refused-escape-leave.json', { records: 1 });
});

// ── The document replaced while K waits ────────────────────────────────────────────────────────

for (const action of ['hold', 'late'] as const) {
  test(`fifth F-${action}: topbar Save with its link write ${action === 'hold' ? 'held' : 'refused late'}; another graphic opened meanwhile`, async ({ page }) => {
    test.setTimeout(150_000);
    await open(page); await draw(page, .22); await saveNamed(page, 'Fifth F other');
    const other = (await library(page))[0];
    await page.getByTestId('save-menu').click(); await page.getByTestId('save-as').click();
    await page.getByTestId('save-name').fill('Fifth F'); await page.getByTestId('save-confirm').click();
    await expect(page.getByTestId('save-status')).toHaveText('Saved'); await settleDurableWrites(page);
    await draw(page, .52); await flush(page); await settleDurableWrites(page);
    const requested = await source(page), record = (await library(page)).find(g => g.name === 'Fifth F')!;
    await install(page);
    await rule(page, SLOT, action, { after: LIB });
    await page.getByTestId('save-graphic').click(); await releasable(page);
    expect((await acted(page, action))[0].stack).toContain('persistLink');
    // Replace the document meanwhile: Open saved graphics -> the other graphic -> its editor.
    await page.getByTestId('save-menu').click(); await page.getByRole('menuitem', { name: 'Open saved graphics…', exact: true }).click();
    const askedOnOpen = await page.getByTestId('confirm-switch').count();
    if (askedOnOpen) await page.getByTestId('switch-cancel').click();
    await page.locator('.lib-row', { hasText: 'Fifth F other' }).getByTestId('open-graphic').click();
    await page.getByTestId('control-open-editor').click();
    await expect(page.getByTestId('editor-foundation')).toBeVisible();
    await release(page);
    await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
    const facts: Record<string, unknown> = { askedOnOpen, link: await link(page), errors: (await probe(page)).errors, alert: await page.getByTestId('storage-alert').count(),
      status: await page.getByTestId('save-status').textContent() };
    await settleDurableWrites(page).catch(e => { facts.settle = String(e); });
    facts.slot = await slot(page);
    const all = await library(page);
    facts.recordHasRequested = JSON.stringify(all.find(g => g.id === record.id)!.template) === JSON.stringify(requested);
    await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible();
    facts.afterReload = await link(page);
    out(`f-${action}-replace-during-link.json`, facts);
    expect(facts.recordHasRequested).toBe(true);
    expect(facts.link).toMatchObject({ graphicId: other.id, dirty: false });
    expect(facts.afterReload).toMatchObject({ graphicId: other.id });
    expect(all).toHaveLength(2);
  });
}

// ── L refused late, with an edit meanwhile ─────────────────────────────────────────────────────

test('fifth R1: linked leave Save, library write refused late, an edit meanwhile: stays, keeps the newer edit, retry writes it', async ({ page }) => {
  test.setTimeout(120_000);
  const record = await linked(page, 'Fifth R1');
  await install(page);
  await page.getByTestId('open-home').click();
  await rule(page, LIB, 'late');
  await page.getByTestId('switch-save').click(); await releasable(page);
  await commandEdit(page); await ready(page);
  const newer = await source(page);
  await release(page);
  await expect(page.getByTestId('confirm-switch').locator('.status-bad')).toBeVisible();
  await page.evaluate(() => new Promise(r => setTimeout(r, 150)));
  expect((await probe(page)).errors, 'the refusal was also announced by the app').toBe(0);
  await expect(page.getByTestId('home-page')).toHaveCount(0);
  expect(await source(page)).toEqual(newer);
  expect((await library(page))[0].template).toEqual(record.template);
  expect(await link(page)).toMatchObject({ graphicId: record.id, dirty: true, status: 'failed' });
  await page.getByTestId('switch-save').click(); await expect(page.getByTestId('home-page')).toBeVisible();
  expect((await library(page))[0].template).toEqual(newer);
  out('r1-late-refused-library-linked.json', { stayed: true, newerKept: true, retryWroteNewer: true });
});

// ── Discard's slot write refused, then a reload ────────────────────────────────────────────────

test('fifth G1: Discard refused, reload: the draft is what the refusal said; Discard again; record byte-equal; nothing asks after', async ({ page }) => {
  test.setTimeout(120_000);
  const record = await linked(page, 'Fifth G1'), recordJson = JSON.stringify(record);
  const edited = await source(page);
  await install(page);
  await page.getByTestId('open-home').click();
  await rule(page, SLOT, 'refuse');
  await page.getByTestId('switch-discard').click();
  await expect(page.getByTestId('confirm-switch').locator('.status-bad')).toBeVisible();
  await settleDurableWrites(page);
  await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  expect(await source(page)).toEqual(edited);
  await page.getByTestId('open-home').click(); await expect(page.getByTestId('confirm-switch')).toBeVisible();
  await page.getByTestId('switch-discard').click(); await expect(page.getByTestId('home-page')).toBeVisible();
  expect(JSON.stringify((await library(page))[0])).toBe(recordJson);
  await settleDurableWrites(page); await page.reload();
  expect(await newAsks(page)).toBe(0);
  out('g1-discard-refused-reload.json', { draftAsRefusalSaid: true, recordByteEqual: true });
});

// ── The wizard's Finish doors ──────────────────────────────────────────────────────────────────

for (const variant of ['again', 'renamed'] as const) {
  test(`fifth H1-${variant}: export door, mint held, the door pressed ${variant === 'again' ? 'again' : 'again under a new name'} meanwhile: one record`, async ({ page }) => {
    test.setTimeout(120_000);
    await toFinish(page);
    await page.getByTestId('wz-finish-name').fill('Fifth H1');
    await install(page);
    await rule(page, LIB, 'hold');
    await page.getByTestId('wz-finish-export').click(); await releasable(page);
    if (variant === 'renamed') await page.getByTestId('wz-finish-name').fill('Fifth H1 renamed');
    await page.getByTestId('wz-finish-export').click();
    await page.evaluate(() => new Promise(r => setTimeout(r, 600)));
    const during = (await probe(page)).puts[LIB];
    await release(page);
    await expect(page.getByTestId('export-window')).toBeVisible();
    await page.evaluate(() => new Promise(r => setTimeout(r, 1200)));
    const all = await library(page);
    const facts = { libraryPutsDuringWait: during, records: all.map(g => ({ id: g.id, name: g.name })), alert: await page.getByTestId('storage-alert').count(), link: await link(page) };
    await shot(page, `h1-${variant}-export-door.png`);
    out(`h1-${variant}-export-door-held.json`, facts);
    expect(all, 'the export door minted more than one record for one walk').toHaveLength(1);
  });
}

test('fifth H2: export door, mint held, Home pressed meanwhile: one record and the draft is not lost', async ({ page }) => {
  test.setTimeout(120_000);
  await toFinish(page);
  await page.getByTestId('wz-finish-name').fill('Fifth H2');
  await install(page);
  await rule(page, LIB, 'hold');
  await page.getByTestId('wz-finish-export').click(); await releasable(page);
  await page.getByTestId('wz-home').click();
  await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
  const atHome = { home: await page.getByTestId('home-page').count(), wizard: await page.getByTestId('creation-wizard').isVisible(), url: page.url() };
  await release(page);
  await page.evaluate(() => new Promise(r => setTimeout(r, 1200)));
  const facts = { atHome, after: { url: page.url(), exportWindow: await page.getByTestId('export-window').count(), home: await page.getByTestId('home-page').count(),
    wizard: await page.getByTestId('creation-wizard').isVisible(), alert: await page.getByTestId('storage-alert').count() },
    records: (await library(page)).map(g => g.name), link: await link(page) };
  await shot(page, 'h2-export-door-home.png');
  out('h2-export-door-held-home.json', facts);
  expect(facts.records).toEqual(['Fifth H2']);
});

test('fifth H3: production door, link write refused: alert, one record; pressing again lands one graphic in the production', async ({ page }) => {
  test.setTimeout(150_000);
  await toFinish(page);
  await page.getByTestId('wz-finish-name').fill('Fifth H3');
  await install(page);
  await rule(page, SLOT, 'refuse', { after: LIB });
  await page.getByTestId('wz-finish-production-go').click();
  await page.getByTestId('wz-finish-production-confirm-go').click();
  await expect(page.getByTestId('storage-alert')).toBeVisible();
  const first = { alert: await page.getByTestId('storage-alert').textContent(), records: (await library(page)).length, refusedStack: (await acted(page, 'refuse'))[0]?.stack };
  await shot(page, 'h3-production-refused.png');
  await page.getByTestId('storage-alert-close').click();
  await page.getByTestId('wz-finish-production-go').click();
  await page.getByTestId('wz-finish-production-confirm-go').click();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
  await settleDurableWrites(page);
  const shows = await page.evaluate(async () => (await import('/src/model/shows.ts')).loadShows().map(s => ({ name: s.name, pool: (s as unknown as { pool?: unknown[] }).pool?.length ?? null })));
  const all = await library(page);
  out('h3-production-door-link-refused.json', { first, records: all.map(g => g.name), shows });
  expect(first.records).toBe(1);
  expect(all).toHaveLength(1);
  expect(shows).toHaveLength(1);
});
