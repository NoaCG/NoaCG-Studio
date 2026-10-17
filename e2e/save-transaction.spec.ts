// covers: src/store/saveActions.ts, src/model/durableStore.ts, src/model/project.ts, src/store/templateStore.ts
// covers: src/components/save/SaveDialogs.tsx, src/components/save/SaveControls.tsx, src/app/router.ts
// covers: src/components/wizard/shell/walkState.ts, src/components/wizard/shell/doors.ts
//
// THE SAVE TRANSACTION, AS A MATRIX (Phase 2, repair 6). Five independent checks each failed on a
// new ordering of a Save's separate durable writes, so this file crosses every write the
// transaction makes or settles with every way storage can treat it, across every door that runs
// it. Each case fault-injects ONE write, picked out by the stack of its IndexedDB put, so another
// write cannot stand in for it (e2e/AGENTS.md: a race is fault-injected, never repeated harder):
//
//   R  the record id reserved in the working slot before a first Save / Save As mints (#1383)
//   L  the library record
//   K  the draft's link in the working slot
//   F  the source's trailing autosave the transaction flushes after K (an edit's timer, or the
//      one its own name adoption scheduled) (#1382)
//   I  a working-slot autosave already in flight when the Save starts
//   D  Discard's replacement of the working slot
//
// Operations: refuse once then retry; refuse then reload; hold and edit meanwhile; replace the
// document meanwhile; double submission. Doors: topbar Save (linked), the leave's Save & continue
// (linked), the first Save named / under the kept name, Save As, the wizard's Finish doors. The
// combinations that cannot occur, and why, are in docs/work-specs/editor-leave-reliability/
// repair-6/README.md beside this file's case list. Repair 7 adds a LEAVE (Home, hash, Back, Open,
// New) started while a transaction is still writing, and the reservation and link writes both
// refused (#1392, #1383; repair-7/README.md).
import { test, expect, type Page } from '@playwright/test';
import { pickDesign } from './_browse';
import { settleDurableWrites } from './_durable';
import { open, draw, source, ready } from './_layerProperty';

type Write = 'R' | 'L' | 'K' | 'F' | 'I' | 'D';
type Action = 'hold' | 'refuse' | 'late';
const LIB = 'spx-gfx-graphics', SLOT = 'spx-gfx-project';
/** How each write is recognised: its key, and frames its put's stack must (not) carry. */
const WRITES: Record<Write, { key: string; has: string[]; not: string[] }> = {
  R: { key: SLOT, has: ['mintGraphic', 'persistLink'], not: ['commitLink'] },
  L: { key: LIB, has: [], not: [] },
  K: { key: SLOT, has: ['commitLink', 'persistLink'], not: [] },
  F: { key: SLOT, has: ['settleTrailingAutosave'], not: [] },
  I: { key: SLOT, has: [], not: ['saveActions.ts'] },
  D: { key: SLOT, has: ['discardDraft'], not: ['persistLink'] },
};
type Probe = { rules: { w: Write; action: Action; used?: boolean }[]; acted: { w: Write; action: Action }[]; releases: (() => void)[]; errors: number };
declare global { interface Window { matrix: Probe } }

async function install(page: Page) {
  await page.evaluate((writes) => {
    if (window.matrix) return;
    const p: Probe = { rules: [], acted: [], releases: [], errors: 0 };
    window.matrix = p;
    window.addEventListener('spx-storage-error', () => { p.errors++; });
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      const limit = Error.stackTraceLimit; Error.stackTraceLimit = 60;
      const stack = String(new Error().stack);
      Error.stackTraceLimit = limit;
      const rule = p.rules.find(r => !r.used && writes[r.w].key === String(key) &&
        writes[r.w].has.every(f => stack.includes(f)) && !writes[r.w].not.some(f => stack.includes(f)));
      if (rule) { rule.used = true; p.acted.push({ w: rule.w, action: rule.action }); }
      if (rule?.action === 'refuse') throw new DOMException('Matrix refusal', 'QuotaExceededError');
      const request = original.call(this, value, key);
      const tx = this.transaction;
      if (rule?.action === 'hold') {
        const index = p.releases.push(undefined as unknown as () => void) - 1;
        Object.defineProperty(tx, 'oncomplete', { configurable: true, set(handler: (event: Event) => void) {
          tx.addEventListener('complete', event => { p.releases[index] = () => handler.call(tx, event); }, { once: true });
        } });
      }
      if (rule?.action === 'late') {
        let done = false;
        const keep = () => { if (!done) this.get('__matrix_keepalive').onsuccess = keep; };
        keep();
        p.releases.push(() => { done = true; tx.abort(); });
      }
      return request;
    };
  }, WRITES);
}
const arm = (page: Page, w: Write, action: Action) => page.evaluate(([w, action]) => { window.matrix.rules.push({ w: w as Write, action: action as Action }); }, [w, action]);
const acted = (page: Page) => page.evaluate(() => window.matrix.acted.map(a => `${a.action} ${a.w}`));
/** Unclaimed refusals the app announced (`spx-storage-error`); none after a reload drops the probe. */
const errors = (page: Page) => page.evaluate(() => window.matrix?.errors ?? 0);
const releasable = (page: Page) => expect.poll(() => page.evaluate(() => window.matrix.releases.filter(Boolean).length)).toBe(1);
const release = (page: Page) => page.evaluate(() => window.matrix.releases[0]());

const library = (page: Page) => page.evaluate(async () => (await import('/src/model/library.ts')).loadGraphics());
const link = (page: Page) => page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().saved);
const flush = (page: Page) => page.evaluate(async () => (await import('/src/store/templateStore.ts')).flushPendingProject());
/** The source a record should hold, compared without its name (a save names it). */
const body = (t: { name?: string }) => ({ ...t, name: '' });

async function commandEdit(page: Page, thenClick?: string) {
  await page.evaluate(async thenClick => {
    const { activeEditorCommands } = await import('/src/components/editorFoundation/commandAdapter.ts');
    const c = activeEditorCommands(), i = c.inspect();
    if (!i.ok) throw Error(i.refusal.message);
    const result = c.apply({ expected: i.expected, transactionId: crypto.randomUUID(), commands: [{ id: 'layer.create', args: { geometry: { shape: 'rectangle', x: 640 + Math.round(Math.random() * 200), y: 120, width: 80, height: 80 } } }] });
    if (!result.ok) throw Error(result.refusal.message);
    if (thenClick) (document.querySelector(`[data-testid=${thenClick}]`) as HTMLButtonElement).click();
    await new Promise(r => setTimeout(r));
  }, thenClick ?? '');
}

// ── Doors ────────────────────────────────────────────────────────────────────────────────────

type Door = 'topbar' | 'leave' | 'first-named' | 'first-kept' | 'save-as';
const FIRST: Door[] = ['first-named', 'first-kept'];
const NAME = 'Matrix graphic';

/** A linked graphic edited since its save, or a never-saved edited draft, settled. */
async function prepare(page: Page, door: Door) {
  await open(page); await draw(page, .24);
  if (!FIRST.includes(door)) {
    await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill(NAME);
    await page.getByTestId('save-confirm').click(); await expect(page.getByTestId('save-status')).toHaveText('Saved');
    await draw(page, .52);
  }
  await flush(page); await settleDurableWrites(page);
  await install(page);
  return { before: await library(page) };
}

/** Start the door's save. `edit` makes an edit in the same turn, so its autosave timer is still
 *  pending when the save starts (the F write of a linked save). */
async function press(page: Page, door: Door, edit = false) {
  if (door === 'topbar') {
    if (edit) await commandEdit(page, 'save-graphic'); else await page.getByTestId('save-graphic').click();
  } else if (door === 'leave') {
    await page.getByTestId('open-home').click(); await expect(page.getByTestId('confirm-switch')).toBeVisible();
    if (edit) await commandEdit(page, 'switch-save'); else await page.getByTestId('switch-save').click();
  } else if (door === 'save-as') {
    await page.getByTestId('save-menu').click(); await page.getByTestId('save-as').click();
    await page.getByTestId('save-name').fill(`${NAME} copy`); await page.getByTestId('save-confirm').click();
  } else {
    await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click();
    if (door === 'first-named') await page.getByTestId('save-name').fill(NAME);
    await page.getByTestId('save-confirm').click();
  }
}
/** Press the door again from where a refusal left it. */
async function retry(page: Page, door: Door) {
  if (door === 'topbar') await page.getByTestId('save-graphic').click();
  else if (door === 'leave') await page.getByTestId('switch-save').click();
  else await page.getByTestId('save-confirm').click();
}
/** The door's own answer to a refusal, over the editor. */
async function refusedHere(page: Page, door: Door) {
  if (door === 'topbar') await expect(page.getByTestId('save-status')).toHaveText('Save failed');
  else await expect(page.getByTestId(door === 'leave' ? 'confirm-switch' : 'save-dialog').locator('.status-bad')).toBeVisible();
  await expect(page.getByTestId('home-page')).toHaveCount(0);
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
}
const leaves = (door: Door) => door === 'leave' || FIRST.includes(door);
async function landed(page: Page, door: Door) {
  if (leaves(door)) await expect(page.getByTestId('home-page')).toBeVisible();
  else { await expect(page.getByTestId('save-dialog')).toHaveCount(0); await expect(page.getByTestId('save-status')).toHaveText('Saved'); }
}
async function newAsks(page: Page) {
  if (!(await page.getByTestId('home-page').count())) { await page.getByTestId('open-home').click(); await expect(page.getByTestId('home-page')).toBeVisible(); }
  await page.locator('[data-door="new-graphic"]').click();
  await expect(page.getByTestId('creation-wizard').or(page.getByTestId('confirm-switch')).first()).toBeVisible();
  return page.getByTestId('confirm-switch').count();
}
/** The record the door saved into, and every count around it. */
async function saved(page: Page, door: Door, before: { id: string }[]) {
  const all = await library(page);
  expect(all, 'one record per saved graphic: nothing minted twice').toHaveLength(door === 'save-as' || FIRST.includes(door) ? before.length + 1 : before.length);
  const record = door === 'save-as' ? all.find(g => !before.some(b => b.id === g.id))! : FIRST.includes(door) ? all[0] : all.find(g => g.id === before[0].id)!;
  if (door === 'save-as') expect(JSON.stringify(all.find(g => g.id === before[0].id)), 'Save As left the original byte-equal').toBe(JSON.stringify(before[0]));
  return record;
}
/** Nothing of a landed save is announced afterwards, and nothing asks about it, before or after a reload. */
async function settledClean(page: Page, door: Door, recordId: string) {
  await page.evaluate(() => new Promise(r => setTimeout(r, 1000)));
  expect(await errors(page), 'a write of the saved source was announced by the app').toBe(0);
  await expect(page.getByTestId('storage-alert')).toHaveCount(0);
  expect(await link(page)).toMatchObject({ graphicId: recordId, dirty: false });
  if (leaves(door)) expect(await newAsks(page), 'New asked about the graphic just saved').toBe(0);
  await settleDurableWrites(page); await page.reload();
  await expect(page.getByTestId('editor-foundation').or(page.getByTestId('home-page')).or(page.getByTestId('creation-wizard')).first()).toBeVisible();
  expect(await link(page), 'after a reload the draft is the saved graphic').toMatchObject({ graphicId: recordId, dirty: false });
}

/** Which writes a door makes: R only when it mints, F only when an autosave of its source is pending. */
const writesOf = (door: Door): Write[] => door === 'first-kept' ? ['R', 'L', 'K'] : door === 'first-named' || door === 'save-as' ? ['R', 'L', 'K', 'F'] : ['L', 'K', 'F'];
/** A linked door's F comes from an edit made in the same turn as the press. */
const editFor = (door: Door, w: Write) => w === 'F' && !['first-named', 'save-as'].includes(door);

// ── Refuse once, then retry ──────────────────────────────────────────────────────────────────

for (const door of ['topbar', 'leave', 'first-named', 'first-kept', 'save-as'] as Door[]) for (const w of writesOf(door)) {
  test(`matrix refuse+retry: ${door} / ${w}`, async ({ page }) => {
    test.setTimeout(120_000);
    const { before } = await prepare(page, door);
    await arm(page, w, 'refuse');
    await press(page, door, editFor(door, w));
    await expect.poll(() => acted(page)).toEqual([`refuse ${w}`]);
    if (w === 'F' || w === 'R') {
      // F carries what K already made durable, and K names the record R reserved: either
      // refusal loses nothing, so the save stands and nothing is announced.
      await landed(page, door);
    } else {
      await refusedHere(page, door);
      expect(await errors(page), 'the refusal was announced by the app as well as the dialog').toBe(0);
      const mid = await library(page);
      expect(mid, w === 'K' ? 'the record landed before its link' : 'nothing landed').toHaveLength(before.length + (w === 'K' && !['topbar', 'leave'].includes(door) ? 1 : 0));
      await retry(page, door);
      await landed(page, door);
    }
    const requested = await source(page);
    const record = await saved(page, door, before);
    expect(body(record.template)).toEqual(body(requested));
    await settledClean(page, door, record.id);
  });
}

// ── Refuse, then reload without retrying ─────────────────────────────────────────────────────

for (const [door, w] of [['leave', 'L'], ['leave', 'K'], ['leave', 'F'], ['first-named', 'R'], ['first-named', 'L'], ['first-named', 'K'], ['first-kept', 'K'], ['save-as', 'K']] as [Door, Write][]) {
  test(`matrix refuse+reload: ${door} / ${w}`, async ({ page }) => {
    test.setTimeout(120_000);
    const { before } = await prepare(page, door);
    await arm(page, w, 'refuse');
    await press(page, door, editFor(door, w));
    await expect.poll(() => acted(page)).toEqual([`refuse ${w}`]);
    const stands = w === 'F' || w === 'R';
    if (stands) await landed(page, door); else await refusedHere(page, door);
    const requested = await source(page);
    await page.evaluate(() => new Promise(r => setTimeout(r, 1000)));
    await settleDurableWrites(page); await page.reload();
    await expect(page.getByTestId('editor-foundation').or(page.getByTestId('home-page')).first()).toBeVisible();
    if (stands) {
      const record = await saved(page, door, before);
      expect(body(record.template)).toEqual(body(requested));
      expect(await link(page)).toMatchObject({ graphicId: record.id, dirty: false });
      expect(await newAsks(page)).toBe(0);
      return;
    }
    // The draft came back as the refusal left it, and the next save writes the record it has.
    const minted = door !== 'leave' && w === 'K' ? (await library(page)).find(g => !before.some(b => b.id === g.id))! : null;
    expect(await link(page), 'after a reload the draft is linked to the record its save minted').toMatchObject({ graphicId: minted?.id ?? (door === 'leave' ? before[0].id : null), dirty: true });
    if (door === 'save-as') {
      await page.getByTestId('save-graphic').click();
      if (!minted) await page.getByTestId('save-confirm').click();
      await landed(page, door);
    } else {
      await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click();
      if (await page.getByTestId('save-dialog').count()) await page.getByTestId('save-confirm').click();
      await expect(page.getByTestId('home-page')).toBeVisible();
    }
    const record = await saved(page, door, before);
    if (minted) expect(record.id).toBe(minted.id);
    expect(body(record.template)).toEqual(body(requested));
    await settledClean(page, door, record.id);
  });
}

// ── Hold a write, edit meanwhile ─────────────────────────────────────────────────────────────

for (const [door, w] of [['leave', 'L'], ['leave', 'K'], ['leave', 'F'], ['first-named', 'R'], ['first-named', 'L'], ['first-named', 'K'], ['first-named', 'F'], ['save-as', 'L'], ['save-as', 'K'], ['topbar', 'K']] as [Door, Write][]) {
  test(`matrix hold+edit: ${door} / ${w}`, async ({ page }) => {
    test.setTimeout(120_000);
    const { before } = await prepare(page, door);
    await arm(page, w, 'hold');
    await press(page, door, editFor(door, w));
    await releasable(page);
    const requested = await source(page);
    await commandEdit(page); await ready(page);
    const newer = await source(page);
    await release(page);
    // The save answered for the source it was asked to write; the newer edit keeps the draft unsaved.
    if (door === 'leave') await expect(page.getByTestId('confirm-switch').locator('.status-bad')).toContainText('changed while saving');
    else if (FIRST.includes(door)) { await expect(page.getByTestId('save-dialog')).toHaveCount(0); await expect(page.getByTestId('confirm-switch')).toBeVisible(); }
    else { await expect(page.getByTestId('save-dialog')).toHaveCount(0); await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes'); }
    await expect(page.getByTestId('home-page')).toHaveCount(0);
    const record = await saved(page, door, before);
    expect(body(record.template), 'the record holds what the save was asked to write').toEqual(body(requested));
    expect(await link(page)).toMatchObject({ graphicId: record.id, dirty: true });
    expect(await errors(page)).toBe(0);
    // The next save writes the newer edit into the same record.
    if (leaves(door)) await page.getByTestId('switch-save').click(); else await page.getByTestId('save-graphic').click();
    await landed(page, leaves(door) ? 'leave' : 'topbar');
    const again = await saved(page, door, before);
    expect(again.id).toBe(record.id); expect(body(again.template)).toEqual(body(newer));
    await settledClean(page, leaves(door) ? 'leave' : 'topbar', record.id);
  });
}

// ── An autosave that fires between the reservation and the link, then K refused and a reload ──

// The kept name: a new name's adoption schedules a later autosave that relinks on its own.
for (const door of ['first-kept'] as Door[]) {
  test(`matrix reservation kept: ${door} / L held, an autosave fires, K refused, reload`, async ({ page }) => {
    test.setTimeout(120_000);
    const { before } = await prepare(page, door);
    await arm(page, 'L', 'hold');
    await arm(page, 'K', 'refuse');
    await press(page, door);
    await releasable(page);
    // An edit while the record waits: its 800 ms autosave fires before the link write is made.
    const slotPuts = () => page.evaluate(() => performance.getEntriesByName('matrix-slot').length);
    await page.evaluate(() => {
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(value, key) { if (key === 'spx-gfx-project') performance.mark('matrix-slot'); return put.call(this, value, key); };
    });
    await commandEdit(page);
    await expect.poll(slotPuts, { timeout: 5000 }).toBeGreaterThan(0);
    await release(page);
    await expect.poll(() => acted(page)).toEqual(['hold L', 'refuse K']);
    await refusedHere(page, door);
    const minted = (await library(page)).find(g => !before.some(b => b.id === g.id))!;
    await page.evaluate(() => new Promise(r => setTimeout(r, 1000)));
    await settleDurableWrites(page); await page.reload();
    await expect(page.getByTestId('editor-foundation')).toBeVisible();
    expect(await link(page), 'the autosave dropped the reservation, so the reload lost the minted record').toMatchObject({ graphicId: minted.id, dirty: true });
    const newer = await source(page);
    await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click();
    await expect(page.getByTestId('home-page')).toBeVisible();
    const all = await library(page);
    expect(all, 'a second record was minted for the same work').toHaveLength(before.length + 1);
    expect(body(all.find(g => g.id === minted.id)!.template)).toEqual(body(newer));
  });
}

// ── Replace the document while a topbar Save waits (the only door that leaves the editor usable) ──
// Since repair 7 the replacement cannot start mid-save: Open asks while the save writes (#1392),
// and the other graphic opens only once the user continues after it landed.

for (const w of ['K', 'F'] as Write[]) {
  test(`matrix replace: topbar / ${w}`, async ({ page }) => {
    test.setTimeout(120_000);
    await open(page); await draw(page, .22);
    await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Matrix other');
    await page.getByTestId('save-confirm').click(); await expect(page.getByTestId('save-status')).toHaveText('Saved');
    const [other] = await library(page);
    await page.getByTestId('save-menu').click(); await page.getByTestId('save-as').click();
    await page.getByTestId('save-name').fill(NAME); await page.getByTestId('save-confirm').click();
    await expect(page.getByTestId('save-status')).toHaveText('Saved');
    await draw(page, .52); await flush(page); await settleDurableWrites(page);
    await install(page);
    await arm(page, w, 'hold');
    await press(page, 'topbar', w === 'F');
    await releasable(page);
    const requested = await source(page), record = (await library(page)).find(g => g.name === NAME)!;
    await page.getByTestId('save-menu').click(); await page.getByRole('menuitem', { name: 'Open saved graphics…', exact: true }).click();
    await expect(page.getByTestId('confirm-switch'), 'Open asked while the save was writing').toContainText('Saving');
    await expect(page.getByTestId('home-page')).toHaveCount(0);
    await release(page);
    await expect(page.getByTestId('confirm-switch')).toContainText('is saved');
    await page.getByTestId('switch-save').click();
    await page.locator('.lib-row', { hasText: 'Matrix other' }).getByTestId('open-graphic').click();
    await page.getByTestId('control-open-editor').click();
    await expect(page.getByTestId('editor-foundation')).toBeVisible();
    await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
    const all = await library(page);
    expect(all).toHaveLength(2);
    expect(body(all.find(g => g.id === record.id)!.template), 'the replaced save still holds its source').toEqual(body(requested));
    expect(await link(page), 'the opened graphic owns the link').toMatchObject({ graphicId: other.id, dirty: false });
    expect(await errors(page)).toBe(0);
    await settleDurableWrites(page); await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible();
    expect(await link(page)).toMatchObject({ graphicId: other.id });
  });
}

// ── Double submission while a write is held ──────────────────────────────────────────────────

for (const [door, w] of [['topbar', 'L'], ['leave', 'L'], ['first-named', 'R'], ['first-named', 'L'], ['save-as', 'L']] as [Door, Write][]) {
  test(`matrix double: ${door} / ${w}`, async ({ page }) => {
    test.setTimeout(120_000);
    const { before } = await prepare(page, door);
    await arm(page, w, 'hold');
    await press(page, door);
    await releasable(page);
    const requested = await source(page);
    // Press again every way the door offers while the first press waits.
    if (door === 'topbar') { await page.getByTestId('save-graphic').click(); await page.keyboard.press('Control+s'); }
    else if (door === 'leave') await page.getByTestId('switch-save').click({ force: true, timeout: 2000 }).catch(() => undefined);
    else {
      await page.getByTestId('save-name').press('Enter', { timeout: 2000 }).catch(() => undefined);
      await page.getByTestId('save-confirm').click({ force: true, timeout: 2000 }).catch(() => undefined);
    }
    await release(page);
    await landed(page, door);
    const record = await saved(page, door, before);
    expect(body(record.template)).toEqual(body(requested));
    await settledClean(page, door, record.id);
  });
}

// ── An autosave already in flight when the Save starts, refused late ─────────────────────────

for (const door of ['leave', 'first-named'] as Door[]) {
  test(`matrix in-flight: ${door} / I`, async ({ page }) => {
    test.setTimeout(120_000);
    const { before } = await prepare(page, door);
    await arm(page, 'I', 'late');
    await commandEdit(page);
    // The edit's own timer fires and its put stays open: in flight when the save starts.
    await releasable(page);
    await press(page, door);
    await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
    await release(page);
    await landed(page, door);
    const requested = await source(page);
    const record = await saved(page, door, before);
    expect(body(record.template)).toEqual(body(requested));
    await settledClean(page, door, record.id);
  });
}

// ── The wizard's Finish doors ────────────────────────────────────────────────────────────────

async function toFinish(page: Page, name: string) {
  await page.goto('/app#/new');
  await expect(page.getByTestId('creation-wizard')).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-entry="template"]').click();
  await pickDesign(page, 'Hairline');
  await page.getByTestId('wz-skip-to-finish').click();
  await page.getByTestId('wz-finish-name').fill(name);
  await install(page);
}

for (const w of ['R', 'L', 'K', 'F'] as Write[]) {
  test(`matrix wizard production door refuse+retry: ${w}`, async ({ page }) => {
    test.setTimeout(120_000);
    await toFinish(page, 'Matrix wizard');
    await arm(page, w, 'refuse');
    const go = async () => { await page.getByTestId('wz-finish-production-go').click(); await page.getByTestId('wz-finish-production-confirm-go').click(); };
    await go();
    await expect.poll(() => acted(page)).toEqual([`refuse ${w}`]);
    if (w !== 'F' && w !== 'R') {
      await expect(page.getByTestId('storage-alert')).toBeVisible();
      expect(await library(page)).toHaveLength(w === 'K' ? 1 : 0);
      await page.getByTestId('storage-alert-close').click();
      await go();
    }
    await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
    expect(await errors(page)).toBe(0);
    const all = await library(page);
    expect(all.map(g => g.name)).toEqual(['Matrix wizard']);
    await settleDurableWrites(page);
    const shows = await page.evaluate(async () => (await import('/src/model/shows.ts')).loadShows().length);
    expect(shows).toBe(1);
  });
}

for (const renamed of [false, true]) {
  test(`matrix wizard export door double, ${renamed ? 'renamed' : 'same name'}: L`, async ({ page }) => {
    test.setTimeout(120_000);
    await toFinish(page, 'Matrix export');
    await arm(page, 'L', 'hold');
    await page.getByTestId('wz-finish-export').click(); await releasable(page);
    if (renamed) await page.getByTestId('wz-finish-name').fill('Matrix export renamed');
    await page.getByTestId('wz-finish-export').click();
    await page.evaluate(() => new Promise(r => setTimeout(r, 300)));
    await release(page);
    await expect(page.getByTestId('export-window')).toBeVisible();
    await expect.poll(async () => (await library(page)).map(g => g.name)).toEqual([renamed ? 'Matrix export renamed' : 'Matrix export']);
    await page.evaluate(() => new Promise(r => setTimeout(r, 800)));
    expect(await library(page), 'the door minted a second record for one walk').toHaveLength(1);
    expect(await errors(page)).toBe(0);
  });
}

// ── The leave continues once the save lands, however it was asked for (#1386) ──────────────

for (const how of ['hash', 'back', 'back without the Navigation API'] as const) {
  test(`matrix leave replay: ${how} -> first Save under a new name -> leaves`, async ({ page }) => {
    test.setTimeout(120_000);
    // Browsers without `window.navigation` replay Back by counting, then check it arrived.
    if (how !== 'hash' && how !== 'back') await page.addInitScript(() => { Object.defineProperty(window, 'navigation', { value: undefined, configurable: true }); });
    await open(page); await draw(page, .3); await settleDurableWrites(page);
    const editorUrl = page.url();
    if (how === 'hash') await page.evaluate(() => { location.hash = '#/home'; });
    // Back first walks the preview frame's own entries (no route event), then reaches the app route.
    else for (let i = 0; i < 6 && !(await page.getByTestId('confirm-switch').count()); i++) {
      await page.evaluate(() => history.back()); await page.waitForTimeout(400);
    }
    await expect(page.getByTestId('confirm-switch')).toBeVisible();
    await page.getByTestId('switch-save').click(); await page.getByTestId('save-name').fill('Matrix replay');
    await install(page);
    // Hold the link write until the name adoption has rebuilt the preview: its frame navigation
    // inserts a history entry while the guard waits, which is what lost the replayed traversal.
    await page.locator('iframe[title="Foundation graphic preview"]').evaluate(f => {
      Object.assign(window, { frameLoads: 0 });
      f.addEventListener('load', () => { (window as unknown as { frameLoads: number }).frameLoads++; });
    });
    await arm(page, 'K', 'hold');
    await page.getByTestId('save-confirm').click(); await releasable(page);
    await expect.poll(() => page.evaluate(() => (window as unknown as { frameLoads: number }).frameLoads)).toBeGreaterThan(0);
    await release(page);
    await expect(page.getByTestId('editor-foundation')).toHaveCount(0);
    expect(page.url()).not.toBe(editorUrl);
    if (how === 'hash') await expect(page).toHaveURL(/#\/home$/);
    expect(await library(page)).toHaveLength(1);
  });
}

// ── A leave started while a transaction is still writing (#1392, repair 7) ─────────────────────

type Leave = 'home' | 'hash' | 'back' | 'open' | 'new';
type Outcome = 'held' | 'refused' | 'refused+retry';
const LEAVES: Leave[] = ['home', 'hash', 'back', 'open', 'new'];
const OUTCOMES: Outcome[] = ['held', 'refused', 'refused+retry'];
/** Start a leave. Back first walks the preview frame's own entries (no route event), so it is
 *  repeated until the guard answers; under a busy modal nothing answers, and the editor stays. */
async function leave(page: Page, how: Leave) {
  if (how === 'home') await page.getByTestId('open-home').click();
  else if (how === 'hash') await page.evaluate(() => { location.hash = '#/home'; });
  else if (how === 'open') { await page.getByTestId('save-menu').click(); await page.getByRole('menuitem', { name: 'Open saved graphics…', exact: true }).click(); }
  else if (how === 'new') await page.getByTestId('editor-foundation').locator('[data-door="new-graphic"]').click();
  else for (let i = 0; i < 4 && !(await page.getByTestId('confirm-switch').count()); i++) {
    await page.evaluate(() => history.back()); await page.waitForTimeout(300);
  }
}
/** The leave reached its destination and the editor is gone. */
async function left(page: Page, how: Leave) {
  await expect(page.getByTestId('editor-foundation')).toHaveCount(0);
  if (how === 'new') await expect(page.getByTestId('creation-wizard')).toBeVisible();
  else if (how !== 'back') await expect(page.getByTestId('home-page')).toBeVisible();
  if (how === 'home' || how === 'hash') await expect(page).toHaveURL(/#\/home$/);
}
/** Still in the editor, nothing of the destination mounted. */
async function stayed(page: Page) {
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  await expect(page.getByTestId('home-page')).toHaveCount(0);
  await expect(page.getByTestId('creation-wizard')).toHaveCount(0);
}
/** After the save landed and the leave went on: nothing announced, and nothing asks about the
 *  saved graphic at Home, before or after a reload. */
async function nothingAsks(page: Page, recordId: string) {
  await page.evaluate(() => new Promise(r => setTimeout(r, 500)));
  expect(await errors(page), 'a write of the saved source was announced by the app').toBe(0);
  await expect(page.getByTestId('storage-alert')).toHaveCount(0);
  expect(await link(page)).toMatchObject({ graphicId: recordId, dirty: false });
  await settleDurableWrites(page);
  await page.goto('/app#/home'); await page.reload();
  await expect(page.getByTestId('home-page')).toBeVisible();
  expect(await newAsks(page), 'New asked about the graphic just saved').toBe(0);
  expect(await link(page), 'after a reload the draft is the saved graphic').toMatchObject({ graphicId: recordId, dirty: false });
}

// The topbar Save and Ctrl+S leave the editor usable while they write: the leave asks over the
// editor, says the save is running, and answers with the save's own answer.
for (const door of ['topbar', 'ctrl+s'] as const) for (const how of LEAVES) for (const outcome of OUTCOMES) {
  test(`matrix in-flight leave: ${door} / K ${outcome}, ${how}`, async ({ page }) => {
    test.setTimeout(120_000);
    const { before } = await prepare(page, 'topbar');
    await arm(page, 'K', outcome === 'held' ? 'hold' : 'late');
    if (door === 'topbar') await page.getByTestId('save-graphic').click();
    else await page.keyboard.press('Control+s');
    await releasable(page);
    const requested = await source(page);
    await leave(page, how);
    const ask = page.getByTestId('confirm-switch');
    await expect(ask, 'the leave asked while the save was writing').toBeVisible();
    await expect(ask).toContainText('Saving');
    await stayed(page);
    await release(page);
    if (outcome === 'held') {
      // Landed: the dialog says so and waits for the user, who continues.
      await expect(ask).toContainText('is saved');
      await stayed(page);
      await page.getByTestId('switch-save').click();
    } else {
      // Refused: the failure is shown where the user is, and nothing left.
      await expect(ask.locator('.status-bad')).toBeVisible();
      await stayed(page);
      expect(await errors(page), 'the refusal was announced by the app as well as the dialog').toBe(0);
      expect(await link(page)).toMatchObject({ graphicId: before[0].id, dirty: true, status: 'failed' });
      if (outcome === 'refused') {
        await page.getByTestId('switch-cancel').click();
        await expect(ask).toHaveCount(0);
        await stayed(page);
        await expect(page.getByTestId('save-status')).toHaveText('Save failed');
        await settleDurableWrites(page); await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible();
        expect(await library(page), 'nothing minted').toHaveLength(1);
        expect(await link(page), 'the reload tells the truth: linked, unsaved').toMatchObject({ graphicId: before[0].id, dirty: true });
        expect(body(await source(page))).toEqual(body(requested));
        return;
      }
      await page.getByTestId('switch-save').click();
    }
    await left(page, how);
    const record = await saved(page, 'topbar', before);
    expect(body(record.template)).toEqual(body(requested));
    await nothingAsks(page, record.id);
  });
}

// Save As, the first Save's naming dialog and Discard are modal while they write: a browser leave
// (a hash change, Back) is absorbed, the address stays on the editor, and only the leave the user
// had chosen before (first Save's and Discard's Home) goes on, once, after the answer.
type ModalDoor = 'save-as' | 'first-named' | 'discard';
for (const door of ['save-as', 'first-named', 'discard'] as ModalDoor[]) for (const how of ['hash', 'back'] as Leave[]) for (const outcome of OUTCOMES) {
  test(`matrix in-flight leave: ${door} / ${door === 'discard' ? 'D' : 'K'} ${outcome}, ${how}`, async ({ page }) => {
    test.setTimeout(120_000);
    const { before } = await prepare(page, door === 'discard' ? 'leave' : door);
    const w: Write = door === 'discard' ? 'D' : 'K';
    if (door === 'discard') {
      await page.getByTestId('open-home').click(); await expect(page.getByTestId('confirm-switch')).toBeVisible();
      await arm(page, w, outcome === 'held' ? 'hold' : 'late');
      await page.getByTestId('switch-discard').click();
    } else {
      await arm(page, w, outcome === 'held' ? 'hold' : 'late');
      await press(page, door);
    }
    await releasable(page);
    const requested = await source(page);
    const editorUrl = page.url();
    await leave(page, how);
    await page.waitForTimeout(300);
    await stayed(page);
    expect(page.url(), 'the address stayed on the editor').toBe(editorUrl);
    await release(page);
    const modal = page.getByTestId(door === 'discard' ? 'confirm-switch' : 'save-dialog');
    if (outcome !== 'held') {
      await expect(modal.locator('.status-bad')).toBeVisible();
      await stayed(page);
      expect(await errors(page)).toBe(0);
      if (outcome === 'refused') {
        await modal.getByRole('button', { name: 'Cancel' }).click();
        await expect(modal).toHaveCount(0);
        await stayed(page);
        expect(await library(page), 'nothing minted twice').toHaveLength(before.length + (door === 'discard' ? 0 : 1));
        return;
      }
      if (door === 'discard') await page.getByTestId('switch-discard').click(); else await page.getByTestId('save-confirm').click();
    }
    if (door === 'save-as') {
      await landed(page, 'save-as');
      await stayed(page);
      const record = await saved(page, 'save-as', before);
      expect(body(record.template)).toEqual(body(requested));
      await settledClean(page, 'save-as', record.id);
      return;
    }
    await left(page, 'home');
    if (door === 'discard') {
      expect(await library(page), 'Discard wrote no library copy').toEqual(before);
      await nothingAsks(page, before[0].id);
      return;
    }
    const record = await saved(page, 'first-named', before);
    expect(body(record.template)).toEqual(body(requested));
    await nothingAsks(page, record.id);
  });
}

// ── The reservation and the link write both refused, then a reload (#1383, sixth check S6) ─────

for (const door of ['first-kept', 'first-named', 'save-as'] as Door[]) {
  test(`matrix double refusal: ${door} / R and K refused, reload, save again`, async ({ page }) => {
    test.setTimeout(120_000);
    const { before } = await prepare(page, door);
    await arm(page, 'R', 'refuse');
    await arm(page, 'K', 'refuse');
    await press(page, door);
    await expect.poll(() => acted(page)).toEqual(['refuse R', 'refuse K']);
    await refusedHere(page, door);
    const minted = (await library(page)).find(g => !before.some(b => b.id === g.id))!;
    expect(minted, 'the record landed before both slot writes were refused').toBeTruthy();
    const requested = await source(page);
    await page.evaluate(() => new Promise(r => setTimeout(r, 1000)));
    await settleDurableWrites(page); await page.reload();
    await expect(page.getByTestId('editor-foundation')).toBeVisible();
    expect(await link(page), 'the reload found the record by the reservation earlier writes carried').toMatchObject({ graphicId: minted.id, dirty: true });
    if (door === 'save-as') { await page.getByTestId('save-graphic').click(); await landed(page, 'save-as'); }
    else { await page.getByTestId('open-home').click(); await page.getByTestId('switch-save').click(); await expect(page.getByTestId('home-page')).toBeVisible(); }
    const all = await library(page);
    expect(all, 'a second record was minted for the same work').toHaveLength(before.length + 1);
    expect(body(all.find(g => g.id === minted.id)!.template)).toEqual(body(requested));
    await settledClean(page, door, minted.id);
  });
}
