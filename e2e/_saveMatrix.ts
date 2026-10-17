// THE SAVE-TRANSACTION MATRIX: its fault injector and its doors, shared by the five
// save-transaction*.spec.ts files (Phase 2, repairs 6 and 7). Five independent checks each failed
// on a new ordering of a Save's separate durable writes, so the matrix crosses every write the
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
// repair-6/README.md beside the case list; repair-7/README.md adds the LEAVE (Home, hash, Back,
// Open, New) started while a transaction is still writing (#1392, #1383).
//
// WHY FIVE FILES AND NOT ONE. The 107 cases measured 26.7 minutes on one runner (run 39048521384,
// the retry job that ran them after shard 7 died at the 20-minute cap), and CI assigns whole spec
// files to shards (scripts/e2e-affected.mjs packShards), so one file could never fit a shard
// whatever the shard count. The rows are split by operation; every case keeps its title and
// assertions, and this module keeps the helpers in one place so the files cannot drift apart:
//
//   save-transaction.spec.ts              refuse+retry, refuse+reload, the double refusal (R and K)
//   save-transaction-holds.spec.ts        hold+edit, the reservation kept, replace, double, in-flight
//   save-transaction-wizard.spec.ts       the wizard's Finish doors
//   save-transaction-leave.spec.ts        the leave replay and the in-flight leave, non-modal doors
//   save-transaction-leave-modal.spec.ts  the in-flight leave under the modal doors
import { expect, type Page } from '@playwright/test';
import { pickDesign } from './_browse';
import { settleDurableWrites } from './_durable';
import { open, draw } from './_layerProperty';

export type Write = 'R' | 'L' | 'K' | 'F' | 'I' | 'D';
export type Action = 'hold' | 'refuse' | 'late';
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

export async function install(page: Page) {
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
export const arm = (page: Page, w: Write, action: Action) => page.evaluate(([w, action]) => { window.matrix.rules.push({ w: w as Write, action: action as Action }); }, [w, action]);
export const acted = (page: Page) => page.evaluate(() => window.matrix.acted.map(a => `${a.action} ${a.w}`));
/** Unclaimed refusals the app announced (`spx-storage-error`); none after a reload drops the probe. */
export const errors = (page: Page) => page.evaluate(() => window.matrix?.errors ?? 0);
export const releasable = (page: Page) => expect.poll(() => page.evaluate(() => window.matrix.releases.filter(Boolean).length)).toBe(1);
export const release = (page: Page) => page.evaluate(() => window.matrix.releases[0]());

export const library = (page: Page) => page.evaluate(async () => (await import('/src/model/library.ts')).loadGraphics());
export const link = (page: Page) => page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().saved);
export const flush = (page: Page) => page.evaluate(async () => (await import('/src/store/templateStore.ts')).flushPendingProject());
/** The source a record should hold, compared without its name (a save names it). */
export const body = (t: { name?: string }) => ({ ...t, name: '' });

export async function commandEdit(page: Page, thenClick?: string) {
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

export type Door = 'topbar' | 'leave' | 'first-named' | 'first-kept' | 'save-as';
export const FIRST: Door[] = ['first-named', 'first-kept'];
export const NAME = 'Matrix graphic';

/** A linked graphic edited since its save, or a never-saved edited draft, settled. */
export async function prepare(page: Page, door: Door) {
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
export async function press(page: Page, door: Door, edit = false) {
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
export async function retry(page: Page, door: Door) {
  if (door === 'topbar') await page.getByTestId('save-graphic').click();
  else if (door === 'leave') await page.getByTestId('switch-save').click();
  else await page.getByTestId('save-confirm').click();
}
/** The door's own answer to a refusal, over the editor. */
export async function refusedHere(page: Page, door: Door) {
  if (door === 'topbar') await expect(page.getByTestId('save-status')).toHaveText('Save failed');
  else await expect(page.getByTestId(door === 'leave' ? 'confirm-switch' : 'save-dialog').locator('.status-bad')).toBeVisible();
  await expect(page.getByTestId('home-page')).toHaveCount(0);
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
}
export const leaves = (door: Door) => door === 'leave' || FIRST.includes(door);
export async function landed(page: Page, door: Door) {
  if (leaves(door)) await expect(page.getByTestId('home-page')).toBeVisible();
  else { await expect(page.getByTestId('save-dialog')).toHaveCount(0); await expect(page.getByTestId('save-status')).toHaveText('Saved'); }
}
export async function newAsks(page: Page) {
  if (!(await page.getByTestId('home-page').count())) { await page.getByTestId('open-home').click(); await expect(page.getByTestId('home-page')).toBeVisible(); }
  await page.locator('[data-door="new-graphic"]').click();
  await expect(page.getByTestId('creation-wizard').or(page.getByTestId('confirm-switch')).first()).toBeVisible();
  return page.getByTestId('confirm-switch').count();
}
/** The record the door saved into, and every count around it. */
export async function saved(page: Page, door: Door, before: { id: string }[]) {
  const all = await library(page);
  expect(all, 'one record per saved graphic: nothing minted twice').toHaveLength(door === 'save-as' || FIRST.includes(door) ? before.length + 1 : before.length);
  const record = door === 'save-as' ? all.find(g => !before.some(b => b.id === g.id))! : FIRST.includes(door) ? all[0] : all.find(g => g.id === before[0].id)!;
  if (door === 'save-as') expect(JSON.stringify(all.find(g => g.id === before[0].id)), 'Save As left the original byte-equal').toBe(JSON.stringify(before[0]));
  return record;
}
/** Nothing of a landed save is announced afterwards, and nothing asks about it, before or after a reload. */
export async function settledClean(page: Page, door: Door, recordId: string) {
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
export const writesOf = (door: Door): Write[] => door === 'first-kept' ? ['R', 'L', 'K'] : door === 'first-named' || door === 'save-as' ? ['R', 'L', 'K', 'F'] : ['L', 'K', 'F'];
/** A linked door's F comes from an edit made in the same turn as the press. */
export const editFor = (door: Door, w: Write) => w === 'F' && !['first-named', 'save-as'].includes(door);

// ── The wizard's Finish doors ────────────────────────────────────────────────────────────────

export async function toFinish(page: Page, name: string) {
  await page.goto('/app#/new');
  await expect(page.getByTestId('creation-wizard')).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-entry="template"]').click();
  await pickDesign(page, 'Hairline');
  await page.getByTestId('wz-skip-to-finish').click();
  await page.getByTestId('wz-finish-name').fill(name);
  await install(page);
}

// ── A leave started while a transaction is still writing (#1392, repair 7) ─────────────────────

export type Leave = 'home' | 'hash' | 'back' | 'open' | 'new';
export type Outcome = 'held' | 'refused' | 'refused+retry';
export const LEAVES: Leave[] = ['home', 'hash', 'back', 'open', 'new'];
export const OUTCOMES: Outcome[] = ['held', 'refused', 'refused+retry'];
/** Start a leave. Back first walks the preview frame's own entries (no route event), so it is
 *  repeated until the guard answers; under a busy modal nothing answers, and the editor stays. */
export async function leave(page: Page, how: Leave) {
  if (how === 'home') await page.getByTestId('open-home').click();
  else if (how === 'hash') await page.evaluate(() => { location.hash = '#/home'; });
  else if (how === 'open') { await page.getByTestId('save-menu').click(); await page.getByRole('menuitem', { name: 'Open saved graphics…', exact: true }).click(); }
  else if (how === 'new') await page.getByTestId('editor-foundation').locator('[data-door="new-graphic"]').click();
  else for (let i = 0; i < 4 && !(await page.getByTestId('confirm-switch').count()); i++) {
    await page.evaluate(() => history.back()); await page.waitForTimeout(300);
  }
}
/** The leave reached its destination and the editor is gone. */
export async function left(page: Page, how: Leave) {
  await expect(page.getByTestId('editor-foundation')).toHaveCount(0);
  if (how === 'new') await expect(page.getByTestId('creation-wizard')).toBeVisible();
  else if (how !== 'back') await expect(page.getByTestId('home-page')).toBeVisible();
  if (how === 'home' || how === 'hash') await expect(page).toHaveURL(/#\/home$/);
}
/** Still in the editor, nothing of the destination mounted. */
export async function stayed(page: Page) {
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  await expect(page.getByTestId('home-page')).toHaveCount(0);
  await expect(page.getByTestId('creation-wizard')).toHaveCount(0);
}
/** After the save landed and the leave went on: nothing announced, and nothing asks about the
 *  saved graphic at Home, before or after a reload. */
export async function nothingAsks(page: Page, recordId: string) {
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
