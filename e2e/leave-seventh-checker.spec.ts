// covers: none - disposable seventh independent leave-editor check (Phase 2, check 7); never land
//
// Adversarial challenges written by the seventh checker against repair-7 (#1397): the leave
// dialog's three states (Saving / Could not save / is saved), Cancel, Discard and Save & continue
// pressed in each, an edit accepted during the save, browser Back while the dialog is open, a
// reload while it is open, a second tab opened while it is open, and the durable reservation
// across two tabs and a reload. The probe harness is the sixth checker's, renamed.
import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { open, draw, source } from './_layerProperty';
import { settleDurableWrites } from './_durable';
import { pickDesign } from './_browse';

type Action = 'hold' | 'refuse' | 'late';
type Rule = { key: string; action: Action; after?: string; afterMin: number; skip: number; used?: boolean };
type Put = { key: string; n: number; action: Action | 'pass'; stack: string };
type Probe = { puts: Record<string, number>; log: Put[]; rules: Rule[]; releases: ((refuse?: boolean) => void)[]; errors: unknown[] };
declare global { interface Window { seventh: Probe } }

/** One wrapper around IndexedDB puts for the whole page. */
async function install(page: Page) {
  await page.evaluate(() => {
    if (window.seventh) return;
    const p: Probe = { puts: {}, log: [], rules: [], releases: [], errors: [] };
    window.seventh = p;
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
      if (rule?.action === 'refuse') throw new DOMException('Seventh checker refusal', 'QuotaExceededError');
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
        const keep = () => { if (!done) store.get('__seventh_keepalive').onsuccess = keep; };
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
    const p = window.seventh;
    p.rules.push({ key, action: action as Action, after: after || undefined, afterMin: after ? (p.puts[after] ?? 0) + Number(afterDelta) : 0, skip: Number(skip) });
  }, [key, action, opts.after ?? '', opts.afterDelta ?? 1, opts.skip ?? 0] as const);
const LIB = 'spx-gfx-graphics', SLOT = 'spx-gfx-project';
const probe = (page: Page) => page.evaluate(() => ({ puts: { ...window.seventh.puts }, log: window.seventh.log.map(l => ({ ...l })),
  ready: window.seventh.releases.map(Boolean), errors: window.seventh.errors.length }));
const release = (page: Page, index = 0) => page.evaluate(i => window.seventh.releases[i](), index);
const releasable = (page: Page, n = 1) => expect.poll(async () => (await probe(page)).ready.filter(Boolean).length).toBe(n);
const acted = (page: Page, action: Action) => page.evaluate(a => window.seventh.log.filter(l => l.action === a), action);

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
      ? c.apply({ expected: i.expected, transactionId: crypto.randomUUID(), commands: [{ id: 'text.set', args: { targetId: target.id!, text: 'Seventh ' + crypto.randomUUID().slice(0, 6) } }] })
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
async function _toFinish(page: Page) {
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

const dialog = (page: Page) => page.getByTestId('confirm-switch');
const said = async (page: Page) => (await dialog(page).count()) ? (await dialog(page).locator('p').allTextContents()).join(' | ') : null;
const recordOf = async (page: Page, id: string) => (await library(page)).find(g => g.id === id);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const status = (page: Page) => page.getByTestId('save-status').textContent({ timeout: 1000 }).catch(() => null);
/** Home, then New: does anything ask, before and after a reload? Ends on Home. */
async function nothingAsksAfter(page: Page, facts: Record<string, unknown>) {
  if (!(await page.getByTestId('home-page').count())) {
    await page.getByTestId('open-home').click();
    await homeOrAsk(page);
    facts.homeAskedAfter = await dialog(page).count();
    if (facts.homeAskedAfter) { facts.homeQuestionAfter = await said(page); await page.getByTestId('switch-cancel').click(); return; }
  }
  facts.newAsked = await newAsks(page);
  if (facts.newAsked) { facts.newQuestion = await said(page); await page.getByTestId('switch-cancel').click(); }
  await settleDurableWrites(page).catch(e => { facts.settle = String(e); });
  facts.slot = await slot(page);
  await page.goto('/app#/home'); await page.reload();
  facts.newAskedAfterReload = await newAsks(page);
  if (facts.newAskedAfterReload) { facts.newQuestionAfterReload = await said(page); await page.getByTestId('switch-cancel').click(); }
  facts.recordsAfterReload = (await library(page)).length;
}
/** A linked graphic with an edit; a topbar Save whose link write is held or refused late; Home asks. */
async function saveThenHome(page: Page, name: string, action: Action) {
  const record = await linked(page, name);
  const requested = await source(page);
  await install(page);
  await rule(page, SLOT, action, { after: LIB });
  await page.getByTestId('save-graphic').click(); await releasable(page);
  expect((await acted(page, action))[0].stack, 'the acted-on put is the Save\'s own link write').toContain('persistLink');
  await page.getByTestId('open-home').click();
  await expect(dialog(page)).toBeVisible();
  const facts: Record<string, unknown> = { during: await said(page), homeMountedDuring: await page.getByTestId('home-page').count() };
  expect(facts.during, 'the leave dialog says the save is still writing').toContain('Saving');
  expect(facts.homeMountedDuring, 'Home mounted before the save answered').toBe(0);
  return { record, requested, facts };
}

// ── Each answer pressed while the dialog says "Saving" ─────────────────────────────────────────

for (const action of ['late', 'hold'] as const) {
  test(`seventh A-cancel-${action}: Cancel while the dialog says Saving; the link write then ${action === 'late' ? 'refused' : 'lands'}`, async ({ page }) => {
    test.setTimeout(120_000);
    const { record, requested, facts } = await saveThenHome(page, `Seventh A ${action}`, action);
    await page.getByTestId('switch-cancel').click();
    await expect(dialog(page)).toHaveCount(0);
    await expect(page.getByTestId('editor-foundation')).toBeVisible();
    await release(page);
    await page.waitForTimeout(500);
    Object.assign(facts, { link: await link(page), status: await status(page), alert: await alertCount(page), errors: (await probe(page)).errors, editorAfter: await page.getByTestId('editor-foundation').count() });
    await shot(page, `a-${action}-after-answer.png`);
    await page.getByTestId('open-home').click();
    await homeOrAsk(page);
    facts.homeAsked = await dialog(page).count();
    facts.homeQuestion = await said(page);
    if (facts.homeAsked) { await page.getByTestId('switch-save').click(); await expect(page.getByTestId('home-page')).toBeVisible(); }
    facts.recordHasRequested = same((await recordOf(page, record.id))?.template, requested);
    facts.records = (await library(page)).length;
    await nothingAsksAfter(page, facts);
    out(`a-${action}.json`, facts);
    expect(facts.alert, 'an app notice for a refusal the Save owns').toBe(0);
    expect(facts.editorAfter, 'the answer arrived somewhere other than the editor').toBe(1);
    if (action === 'late') expect(facts.homeAsked, 'after the refused save the next Home left without asking').toBe(1);
    else expect(facts.homeAsked, 'Home asked again about a save that landed').toBe(0);
    expect(facts.recordHasRequested).toBe(true);
    expect(facts.records).toBe(1);
    expect(facts.newAsked, 'New asked at Home').toBe(0);
    expect(facts.newAskedAfterReload, 'New asked at Home after a reload').toBe(0);
  });
}

test('seventh B-discard-late: Discard changes while the dialog says Saving; the link write then refused', async ({ page }) => {
  test.setTimeout(120_000);
  const { record, requested, facts } = await saveThenHome(page, 'Seventh B', 'late');
  await page.getByTestId('switch-discard').click();
  await page.waitForTimeout(300);
  facts.homeBeforeRelease = await page.getByTestId('home-page').count();
  await release(page);
  await homeOrAsk(page);
  await page.waitForTimeout(500);
  Object.assign(facts, { afterRelease: await said(page), home: await page.getByTestId('home-page').count(), alert: await alertCount(page), errors: (await probe(page)).errors, link: await link(page) });
  await shot(page, 'b-after-release.png');
  if (facts.afterRelease) { await page.getByTestId('switch-discard').click().catch(() => {}); await page.waitForTimeout(500); }
  facts.recordHasRequested = same((await recordOf(page, record.id))?.template, requested);
  facts.records = (await library(page)).length;
  await nothingAsksAfter(page, facts);
  out('b-discard-late.json', facts);
  expect(facts.homeBeforeRelease, 'Discard left before the running save answered').toBe(0);
  expect(facts.alert).toBe(0);
  expect(facts.recordHasRequested, 'the record holds the source the Save was given').toBe(true);
  expect(facts.records).toBe(1);
  expect(facts.newAsked).toBe(0);
  expect(facts.newAskedAfterReload).toBe(0);
});

test('seventh C-save-late: Save & continue while the dialog says Saving; the link write then refused; the leave saves again', async ({ page }) => {
  test.setTimeout(120_000);
  const { record, requested, facts } = await saveThenHome(page, 'Seventh C', 'late');
  await page.getByTestId('switch-save').click();
  await page.waitForTimeout(300);
  facts.homeBeforeRelease = await page.getByTestId('home-page').count();
  await release(page);
  await homeOrAsk(page);
  await page.waitForTimeout(500);
  Object.assign(facts, { afterRelease: await said(page), home: await page.getByTestId('home-page').count(), alert: await alertCount(page), link: await link(page) });
  facts.recordHasRequested = same((await recordOf(page, record.id))?.template, requested);
  facts.records = (await library(page)).length;
  await nothingAsksAfter(page, facts);
  out('c-save-late.json', facts);
  expect(facts.homeBeforeRelease).toBe(0);
  expect(facts.home, 'Save & continue pressed during the save did not reach Home after the retry').toBe(1);
  expect(facts.alert).toBe(0);
  expect(facts.recordHasRequested).toBe(true);
  expect(facts.records).toBe(1);
  expect(facts.newAsked).toBe(0);
  expect(facts.newAskedAfterReload).toBe(0);
});

// ── An edit accepted while the Save writes: the dialog must not say "is saved" ────────────────

test('seventh D-edit: an edit lands while the topbar Save writes; Home asks; after the save the dialog does not call the newer edit saved', async ({ page }) => {
  test.setTimeout(120_000);
  const record = await linked(page, 'Seventh D');
  await install(page);
  await rule(page, SLOT, 'hold', { after: LIB });
  await page.getByTestId('save-graphic').click(); await releasable(page);
  await commandEdit(page);
  const newest = await source(page);
  await page.getByTestId('open-home').click();
  await expect(dialog(page)).toBeVisible();
  const facts: Record<string, unknown> = { during: await said(page) };
  await release(page);
  await page.waitForTimeout(800);
  facts.afterRelease = await said(page);
  facts.link = await link(page);
  await shot(page, 'd-after-release.png');
  await page.getByTestId('switch-save').click();
  await homeOrAsk(page);
  await page.waitForTimeout(500);
  facts.home = await page.getByTestId('home-page').count();
  facts.stillAsks = await said(page);
  if (!facts.home && facts.stillAsks) { await page.getByTestId('switch-save').click(); await expect(page.getByTestId('home-page')).toBeVisible(); }
  facts.recordHasNewest = same((await recordOf(page, record.id))?.template, newest);
  facts.records = (await library(page)).length;
  await nothingAsksAfter(page, facts);
  out('d-edit.json', facts);
  expect(String(facts.afterRelease), 'the dialog called a graphic with an unsaved newer edit saved').not.toContain('is saved');
  expect(facts.recordHasNewest, 'the leave did not save the edit made during the save').toBe(true);
  expect(facts.records).toBe(1);
  expect(facts.newAsked).toBe(0);
  expect(facts.newAskedAfterReload).toBe(0);
});

// ── Browser Back while the dialog is open ──────────────────────────────────────────────────────

test('seventh E-back: Home asks while the save writes; browser Back meanwhile; the save lands; Continue reaches Home once', async ({ page }) => {
  test.setTimeout(120_000);
  const { record, requested, facts } = await saveThenHome(page, 'Seventh E', 'hold');
  const urlBefore = page.url();
  await page.evaluate(() => { history.back(); });
  await page.waitForTimeout(600);
  Object.assign(facts, { urlAfterBack: page.url(), urlBefore, dialogsAfterBack: await dialog(page).count(), editorAfterBack: await page.getByTestId('editor-foundation').count() });
  await release(page);
  await expect(dialog(page)).toContainText('is saved');
  facts.landed = await said(page);
  await page.getByTestId('switch-save').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await page.waitForTimeout(1500);
  Object.assign(facts, { url: page.url(), home: await page.getByTestId('home-page').count(), editor: await page.getByTestId('editor-foundation').count(), wizard: await page.getByTestId('creation-wizard').count(), dialogAtHome: await dialog(page).count() });
  facts.recordHasRequested = same((await recordOf(page, record.id))?.template, requested);
  facts.records = (await library(page)).length;
  await nothingAsksAfter(page, facts);
  out('e-back.json', facts);
  expect(facts.dialogsAfterBack, 'one dialog, kept through Back').toBe(1);
  expect(facts.editorAfterBack, 'Back during the dialog left the editor').toBe(1);
  expect(facts.home).toBe(1);
  expect(facts.editor).toBe(0);
  expect(facts.wizard).toBe(0);
  expect(String(facts.url)).toMatch(/#\/home$/);
  expect(facts.recordHasRequested).toBe(true);
  expect(facts.records).toBe(1);
  expect(facts.newAsked).toBe(0);
  expect(facts.newAskedAfterReload).toBe(0);
});

// ── A reload while the dialog is open ──────────────────────────────────────────────────────────

for (const when of ['saving', 'saved'] as const) {
  test(`seventh F-reload-${when}: reload while the dialog says ${when === 'saving' ? 'Saving (link write held)' : 'is saved'}`, async ({ page }) => {
    test.setTimeout(120_000);
    const { record, requested, facts } = await saveThenHome(page, `Seventh F ${when}`, 'hold');
    if (when === 'saved') { await release(page); await expect(dialog(page)).toContainText('is saved'); facts.landed = await said(page); }
    await page.reload();
    await expect(page.getByTestId('editor-foundation').or(page.getByTestId('home-page')).first()).toBeVisible({ timeout: 30_000 });
    facts.linkAfterReload = await link(page);
    facts.sourceKept = same(await source(page), requested);
    facts.recordHasRequested = same((await recordOf(page, record.id))?.template, requested);
    facts.records = (await library(page)).length;
    await nothingAsksAfter(page, facts);
    out(`f-reload-${when}.json`, facts);
    expect(facts.sourceKept, 'the reload lost the source').toBe(true);
    expect(facts.recordHasRequested).toBe(true);
    expect(facts.records).toBe(1);
    expect(facts.homeAskedAfter ?? 0, 'Home asked after the reload about a save that landed').toBe(0);
    expect(facts.newAsked).toBe(0);
    expect(facts.newAskedAfterReload).toBe(0);
  });
}

// ── A second tab opened while the dialog is open ───────────────────────────────────────────────

test('seventh G-second-tab: tab B opens while tab A\'s dialog says Saving; A\'s save lands; A continues; A asks nothing after, also after a reload', async ({ page, context }) => {
  test.setTimeout(150_000);
  const { record, requested, facts } = await saveThenHome(page, 'Seventh G', 'hold');
  const b = await context.newPage();
  await b.goto(page.url()); await expect(b.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
  await install(b);
  await release(page);
  await expect(dialog(page)).toContainText('is saved');
  await page.getByTestId('switch-save').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await settleDurableWrites(page);
  await b.waitForTimeout(2500);
  facts.bSlotPutsWhileIdle = (await probe(b)).log.filter(l => l.key === SLOT).length;
  facts.bLink = await link(b);
  facts.recordHasRequested = same((await recordOf(page, record.id))?.template, requested);
  facts.records = (await library(page)).length;
  await nothingAsksAfter(page, facts);
  // Observation only: tab B's own in-memory copy.
  await b.getByTestId('open-home').click(); await b.waitForTimeout(300);
  facts.bAsked = await dialog(b).count(); facts.bQuestion = await said(b);
  out('g-second-tab.json', facts);
  expect(facts.bSlotPutsWhileIdle, 'an idle second tab wrote the working slot').toBe(0);
  expect(facts.recordHasRequested).toBe(true);
  expect(facts.records).toBe(1);
  expect(facts.newAsked).toBe(0);
  expect(facts.newAskedAfterReload).toBe(0);
});

// ── The durable reservation across two tabs and a reload ───────────────────────────────────────

test('seventh H-reservation-two-tabs: tab A first-saves a draft that tab B also has open; B edits and reloads; B\'s Save must not write into A\'s record', async ({ page, context }) => {
  test.setTimeout(150_000);
  await fresh(page);
  const b = await context.newPage();
  await b.goto(page.url()); await expect(b.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
  // A keeps working after B opened, then first-saves under a new name and leaves.
  await draw(page, .62); await flush(page); await settleDurableWrites(page);
  await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click();
  await page.getByTestId('save-name').fill('Seventh H Alpha'); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await settleDurableWrites(page);
  const alpha = (await library(page)).find(g => g.name === 'Seventh H Alpha')!;
  const facts: Record<string, unknown> = { alphaId: alpha.id, slotAfterA: await slot(page) };
  // B, still holding the draft as it was when B opened, makes its own edit; its autosave lands.
  await b.waitForTimeout(1000);
  await draw(b, .40); await flush(b); await settleDurableWrites(b);
  facts.slotAfterB = await slot(b);
  facts.slotReservationAfterB = JSON.parse((await raw(b, SLOT)) ?? 'null')?.reservedGraphicId ?? null;
  await b.reload(); await expect(b.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
  facts.bLinkAfterReload = await link(b);
  facts.bLinkedToAlpha = (facts.bLinkAfterReload as { graphicId: string | null }).graphicId === alpha.id;
  const bSource = await source(b);
  // B presses the topbar Save, as anyone would for a draft they never saved.
  await b.getByTestId('save-graphic').click();
  await b.waitForTimeout(500);
  facts.bNamingAsked = await b.getByTestId('save-name').count();
  if (facts.bNamingAsked) { await b.getByTestId('save-name').fill('Seventh H Beta'); await b.getByTestId('save-confirm').click(); }
  await expect(b.getByTestId('save-status')).toHaveText('Saved');
  await settleDurableWrites(b);
  await shot(b, 'h-b-after-save.png');
  const all = await library(b);
  const alphaNow = all.find(g => g.id === alpha.id)!;
  Object.assign(facts, { records: all.map(g => ({ id: g.id, name: g.name })), alphaUnchanged: same(alphaNow.template, alpha.template), alphaNowHoldsB: same(alphaNow.template, bSource) });
  out('h-reservation-two-tabs.json', facts);
  expect(facts.alphaUnchanged, 'a Save in another tab overwrote the graphic tab A saved, without asking for a name').toBe(true);
});
