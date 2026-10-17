// covers: none - disposable sixth independent leave-editor check (Phase 2, check 6); never land
//
// Adversarial challenges written by the sixth checker against repair-6's ONE save transaction
// (#1391). The probe harness is the fifth checker's, renamed: it wraps IndexedDB puts, records
// each put's stack, and holds, refuses or late-refuses ONE chosen write. These cases look for
// orderings the transaction's write inventory does not own: a leave that starts while a topbar
// Save's own link write is still pending (the leave guard reads only `saved.dirty`), Discard
// queued behind a Save, a reload mid-transaction, browser Back while Save & continue is busy, a
// second tab, and the reservation and link write both refused (repair-6's disclosed limit).
import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { open, draw, source, ready } from './_layerProperty';
import { settleDurableWrites } from './_durable';
import { pickDesign } from './_browse';

type Action = 'hold' | 'refuse' | 'late';
type Rule = { key: string; action: Action; after?: string; afterMin: number; skip: number; used?: boolean };
type Put = { key: string; n: number; action: Action | 'pass'; stack: string };
type Probe = { puts: Record<string, number>; log: Put[]; rules: Rule[]; releases: ((refuse?: boolean) => void)[]; errors: unknown[] };
declare global { interface Window { sixth: Probe } }

/** One wrapper around IndexedDB puts for the whole page. */
async function install(page: Page) {
  await page.evaluate(() => {
    if (window.sixth) return;
    const p: Probe = { puts: {}, log: [], rules: [], releases: [], errors: [] };
    window.sixth = p;
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
      if (rule?.action === 'refuse') throw new DOMException('Sixth checker refusal', 'QuotaExceededError');
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
        const keep = () => { if (!done) store.get('__sixth_keepalive').onsuccess = keep; };
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
    const p = window.sixth;
    p.rules.push({ key, action: action as Action, after: after || undefined, afterMin: after ? (p.puts[after] ?? 0) + Number(afterDelta) : 0, skip: Number(skip) });
  }, [key, action, opts.after ?? '', opts.afterDelta ?? 1, opts.skip ?? 0] as const);
const LIB = 'spx-gfx-graphics', SLOT = 'spx-gfx-project';
const probe = (page: Page) => page.evaluate(() => ({ puts: { ...window.sixth.puts }, log: window.sixth.log.map(l => ({ ...l })),
  ready: window.sixth.releases.map(Boolean), errors: window.sixth.errors.length }));
const release = (page: Page, index = 0) => page.evaluate(i => window.sixth.releases[i](), index);
const releasable = (page: Page, n = 1) => expect.poll(async () => (await probe(page)).ready.filter(Boolean).length).toBe(n);
const acted = (page: Page, action: Action) => page.evaluate(a => window.sixth.log.filter(l => l.action === a), action);

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
      ? c.apply({ expected: i.expected, transactionId: crypto.randomUUID(), commands: [{ id: 'text.set', args: { targetId: target.id!, text: 'Sixth ' + crypto.randomUUID().slice(0, 6) } }] })
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

const homeOrAsk = (page: Page) => expect(page.getByTestId('home-page').or(page.getByTestId('confirm-switch')).first()).toBeVisible();
const alertCount = (page: Page) => page.getByTestId('storage-alert').count();

// ── A leave that starts while a topbar Save's link write is pending ────────────────────────────

for (const door of ['home', 'hash'] as const) {
  for (const action of ['late', 'hold'] as const) {
    test(`sixth S1-${door}-${action}: topbar Save, its link write ${action === 'late' ? 'refused late' : 'held'}, ${door === 'home' ? 'Home pressed' : 'hash changed to #/home'} meanwhile`, async ({ page }) => {
      test.setTimeout(120_000);
      const record = await linked(page, `Sixth S1 ${door} ${action}`);
      const requested = await source(page);
      await install(page);
      await rule(page, SLOT, action, { after: LIB });
      await page.getByTestId('save-graphic').click(); await releasable(page);
      expect((await acted(page, action))[0].stack, 'the acted-on put is the Save\'s own link write').toContain('persistLink');
      const during = await link(page);
      if (door === 'home') await page.getByTestId('open-home').click();
      else await page.evaluate(() => { location.hash = '#/home'; });
      await homeOrAsk(page);
      const facts: Record<string, unknown> = { linkDuringK: during, homeAsked: await page.getByTestId('confirm-switch').count(), homeMountedBeforeAnswer: await page.getByTestId('home-page').count() };
      await shot(page, `s1-${door}-${action}-during.png`);
      await release(page);
      await page.evaluate(() => new Promise(r => setTimeout(r, 400)));
      Object.assign(facts, { link: await link(page), errors: (await probe(page)).errors, alert: await alertCount(page), url: page.url() });
      await shot(page, `s1-${door}-${action}-after-answer.png`);
      const all = await library(page);
      facts.records = all.length;
      facts.recordHasRequested = JSON.stringify(all.find(g => g.id === record.id)!.template) === JSON.stringify(requested);
      if (facts.homeAsked) {
        // The leave waited and asked: answer it so the case still ends at Home.
        await page.getByTestId('switch-save').click();
      }
      if (await alertCount(page)) await page.getByTestId('storage-alert-close').click();
      facts.newAsked = await newAsks(page);
      if (facts.newAsked) { facts.question = await page.getByTestId('confirm-switch').textContent(); await shot(page, `s1-${door}-${action}-new-asks.png`); await page.getByTestId('switch-cancel').click(); }
      await settleDurableWrites(page).catch(e => { facts.settle = String(e); });
      facts.slot = await slot(page);
      await page.goto('/app#/home'); await page.reload();
      facts.newAskedAfterReload = await newAsks(page);
      if (facts.newAskedAfterReload) await page.getByTestId('switch-cancel').click();
      facts.recordsAfterReload = (await library(page)).length;
      out(`s1-${door}-${action}.json`, facts);
      expect(facts.recordHasRequested, 'the saved record holds the exact source the Save was given').toBe(true);
      expect(all, 'one record').toHaveLength(1);
      expect(facts.newAsked, 'New on Home asked about the graphic the user had just saved, after a leave that did not wait for its Save').toBe(0);
      expect(facts.newAskedAfterReload, 'after a reload New on Home still asks about the saved graphic').toBe(0);
    });
  }
}

// ── Discard queued behind a running Save ───────────────────────────────────────────────────────

test('sixth S2: topbar Save with its record write held; Home asks; Discard queues behind it; one record, nothing asks after', async ({ page }) => {
  test.setTimeout(120_000);
  const record = await linked(page, 'Sixth S2');
  const requested = await source(page);
  await install(page);
  await rule(page, LIB, 'hold');
  await page.getByTestId('save-graphic').click(); await releasable(page);
  await page.getByTestId('open-home').click();
  await expect(page.getByTestId('confirm-switch')).toBeVisible();
  await page.getByTestId('switch-discard').click();
  await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
  const facts: Record<string, unknown> = { homeBeforeRelease: await page.getByTestId('home-page').count() };
  await release(page);
  await homeOrAsk(page);
  await page.evaluate(() => new Promise(r => setTimeout(r, 400)));
  const all = await library(page);
  Object.assign(facts, { home: await page.getByTestId('home-page').count(), dialog: await page.getByTestId('confirm-switch').textContent({ timeout: 1000 }).catch(() => null),
    link: await link(page), errors: (await probe(page)).errors, alert: await alertCount(page), records: all.length,
    recordHasRequested: JSON.stringify(all.find(g => g.id === record.id)!.template) === JSON.stringify(requested) });
  await shot(page, 's2-after.png');
  if (!facts.home && await page.getByTestId('confirm-switch').count()) { await page.getByTestId('switch-discard').click(); }
  facts.newAsked = await newAsks(page);
  if (facts.newAsked) await page.getByTestId('switch-cancel').click();
  await settleDurableWrites(page);
  await page.goto('/app#/home'); await page.reload();
  facts.newAskedAfterReload = await newAsks(page);
  out('s2-discard-behind-save.json', facts);
  expect(facts.homeBeforeRelease, 'Discard did not leave before the Save ahead of it answered').toBe(0);
  expect(all).toHaveLength(1);
  expect(facts.alert).toBe(0);
  expect(facts.newAsked).toBe(0);
  expect(facts.newAskedAfterReload).toBe(0);
});

// ── A reload in the middle of a first Save ─────────────────────────────────────────────────────

for (const action of ['hold', 'late'] as const) {
  test(`sixth S3-${action}: leave first Save, record write ${action === 'hold' ? 'held' : 'refused late'}, the page reloaded mid-transaction; the next Save mints one record`, async ({ page }) => {
    test.setTimeout(120_000);
    await fresh(page);
    const requested = await source(page);
    await install(page);
    await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click();
    await page.getByTestId('save-name').fill(`Sixth S3 ${action}`);
    await rule(page, LIB, action);
    await page.getByTestId('save-confirm').click(); await releasable(page);
    const during = await raw(page, SLOT);
    const parsed = during ? JSON.parse(during) : null;
    const facts: Record<string, unknown> = { slotDuring: parsed && { graphicId: parsed.graphicId, reserved: parsed.reservedGraphicId ?? null, dirty: parsed.dirty } };
    await page.reload(); await expect(page.getByTestId('editor-foundation').or(page.getByTestId('home-page')).first()).toBeVisible();
    await ready(page).catch(() => undefined);
    facts.afterReloadLink = await link(page); facts.afterReloadRecords = (await library(page)).map(g => g.id);
    facts.afterReloadSourceKept = JSON.stringify(await source(page)) === JSON.stringify(requested);
    await page.getByTestId('open-home').click();
    facts.homeAsked = await page.getByTestId('confirm-switch').count();
    if (facts.homeAsked) {
      await page.getByTestId('switch-save').click();
      if (await page.getByTestId('save-dialog').count()) { await page.getByTestId('save-name').fill(`Sixth S3 ${action}`); await page.getByTestId('save-confirm').click(); }
    }
    await expect(page.getByTestId('home-page')).toBeVisible();
    await settleDurableWrites(page);
    const all = await library(page);
    facts.records = all.map(g => ({ id: g.id, name: g.name }));
    facts.newAsked = await newAsks(page);
    out(`s3-reload-mid-first-save-${action}.json`, facts);
    expect(facts.afterReloadSourceKept, 'the reload kept the edited source').toBe(true);
    expect(all, 'one record for the work after a reload mid-save').toHaveLength(1);
    expect(facts.newAsked).toBe(0);
  });
}

// ── Browser Back while Save & continue is busy ─────────────────────────────────────────────────

test('sixth S4: Home -> Save & continue with the record write held; browser Back meanwhile; one destination, one record, nothing asks', async ({ page }) => {
  test.setTimeout(120_000);
  const record = await linked(page, 'Sixth S4');
  const requested = await source(page);
  await install(page);
  await page.getByTestId('open-home').click();
  await expect(page.getByTestId('confirm-switch')).toBeVisible();
  await rule(page, LIB, 'hold');
  await page.getByTestId('switch-save').click(); await releasable(page);
  const before = page.url();
  await page.goBack();
  await page.evaluate(() => new Promise(r => setTimeout(r, 400)));
  const facts: Record<string, unknown> = { before, duringBack: page.url(), dialogs: await page.getByTestId('confirm-switch').count(), editor: await page.getByTestId('editor-foundation').count() };
  await release(page);
  await page.evaluate(() => new Promise(r => setTimeout(r, 800)));
  const all = await library(page);
  Object.assign(facts, { url: page.url(), home: await page.getByTestId('home-page').count(), editorAfter: await page.getByTestId('editor-foundation').count(),
    wizard: await page.getByTestId('creation-wizard').count(), dialogsAfter: await page.getByTestId('confirm-switch').count(),
    link: await link(page), errors: (await probe(page)).errors, alert: await alertCount(page), records: all.length,
    recordHasRequested: JSON.stringify(all.find(g => g.id === record.id)!.template) === JSON.stringify(requested) });
  await shot(page, 's4-after.png');
  out('s4-back-during-busy-save.json', facts);
  const hash = new URL(String(facts.url)).hash;
  expect(all).toHaveLength(1);
  expect(facts.recordHasRequested).toBe(true);
  expect(facts.link).toMatchObject({ graphicId: record.id, dirty: false });
  expect(facts.alert).toBe(0);
  expect(facts.dialogsAfter, 'no question is left open after the Save landed').toBe(0);
  // The visible surface and the address agree.
  if (facts.home) expect(hash).toMatch(/^#\/home/);
  if (facts.editorAfter) expect(hash).not.toMatch(/^#\/home/);
});

// ── A second tab on the same working draft ─────────────────────────────────────────────────────

test('sixth S5: a second, idle tab on the same draft writes nothing after tab A saves and leaves; A reloads clean', async ({ page, context }) => {
  test.setTimeout(120_000);
  await fresh(page);
  const b = await context.newPage();
  await b.goto(page.url()); await expect(b.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
  await install(b);
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click();
  await page.getByTestId('save-name').fill('Sixth S5'); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await settleDurableWrites(page);
  await b.waitForTimeout(2500);
  const facts: Record<string, unknown> = { bSlotPutsWhileIdle: (await probe(b)).log.filter(l => l.key === SLOT).length, bLink: await link(b) };
  await page.reload();
  facts.aNewAsked = await newAsks(page);
  if (facts.aNewAsked) await page.getByTestId('switch-cancel').click();
  facts.records = (await library(page)).length;
  // Observation only: tab B still holds its own in-memory copy of the same work.
  await b.getByTestId('open-home').click();
  await b.waitForTimeout(300);
  facts.bAsked = await b.getByTestId('confirm-switch').count();
  facts.bQuestion = facts.bAsked ? await b.getByTestId('confirm-switch').textContent() : null;
  out('s5-second-tab.json', facts);
  expect(facts.bSlotPutsWhileIdle, 'an idle second tab wrote the working slot').toBe(0);
  expect(facts.aNewAsked).toBe(0);
  expect(facts.records).toBe(1);
});

// ── Repair-6's disclosed limit: the reservation AND the link write refused, reload ─────────────

test('sixth S6: first Save under the kept name; reservation and link write both refused; reload; Save again (disclosed limit, measured)', async ({ page }) => {
  test.setTimeout(120_000);
  await fresh(page);
  const requested = await source(page);
  await install(page);
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click();
  await expect(page.getByTestId('save-name')).toHaveValue(requested.name);
  await rule(page, SLOT, 'refuse');
  await rule(page, SLOT, 'refuse', { after: LIB });
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog').locator('.status-bad')).toBeVisible();
  const refused = await acted(page, 'refuse');
  const facts: Record<string, unknown> = { refused: refused.map(r => r.stack.slice(0, 160)), recordsAfterRefusal: (await library(page)).length, errors: (await probe(page)).errors };
  await page.waitForTimeout(1500); await settleDurableWrites(page).catch(e => { facts.settle = String(e); });
  facts.slotBeforeReload = await slot(page);
  await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  facts.afterReloadLink = await link(page);
  await page.getByTestId('open-home').click();
  facts.homeAsked = await page.getByTestId('confirm-switch').count();
  if (facts.homeAsked) { await page.getByTestId('switch-save').click(); if (await page.getByTestId('save-dialog').count()) await page.getByTestId('save-confirm').click(); }
  await expect(page.getByTestId('home-page')).toBeVisible();
  facts.records = (await library(page)).length;
  out('s6-reservation-and-link-refused.json', facts);
  expect(refused).toHaveLength(2);
  expect(facts.records, 'two refused slot writes and a reload let the next Save mint a second record (repair-6 limit)').toBe(1);
});
