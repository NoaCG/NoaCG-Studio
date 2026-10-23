// covers: src/components/home/ProductionPage.tsx, src/components/home/useRundownHistory.ts
// covers: src/components/home/CueEditor.tsx
// covers: src/components/playoutKeys.ts, src/model/durableStore.ts
// covers: src/control/playoutSession.ts, src/control/productionDataSession.ts, src/components/home/useStorePart.ts
// covers: src/components/home/CueActions.tsx
// covers: src/control/takeBlockers.ts, src/control/serverVerbs.ts
// covers: src/control/bridgeWatch.ts
// covers: src/control/folderPlayout.ts
// covers: src/control/airState.ts, src/control/sessionWire.ts
// covers: src/control/graphicVerbs.ts, src/control/verbDispatch.ts, src/control/verbView.ts
// covers: src/control/cueDraft.ts
//
// THE PRODUCTION PAGE'S AIR CONTRACT, pinned before the page is split (production-page refactor,
// phase 1; docs/work-specs/production-page-refactor/spec.md §5.3 and §1.3). Each test presses
// what an operator presses and reads only what exists today: PROGRAM's `#f0`, the stage's
// `data-plays`, the live chip, `cue-unsent`, and the fake Bridge's action log. Later phases move
// the code underneath; these assertions do not change (D9).
//
// The save wait is what most of these walk through. A typed value is a DRAFT for up to 300 ms and
// then a durable write that IndexedDB confirms a moment later (model/durableStore.ts); every verb
// waits for both before it reads (spec §4.1 R2). To walk INSIDE that wait the durable writes are
// held open on purpose (`holdWrites`): a slow disk, which is all the fault injection there is.

import { test, expect, type Page } from '@playwright/test';
import { addCatalogGraphic, bootstrapGraphic, openProductionWithCurrent } from './_create';
import { settleDurableWrites } from './_durable';
import { evaluateInPage } from './_evaluate';
import { fakeBridge, seedSettings } from './_fakeBridge';
import { parkFocusOffControls } from './_keys';

/**
 * Hold every IndexedDB write open while `window.__noacgHoldWrites` is set: the transaction is kept
 * busy with reads, so it completes - and the write is confirmed - only once the flag drops. An init
 * script, installed before the first page load; guarded because it also runs in the sandboxed
 * preview iframes.
 */
async function installWriteHold(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      if (typeof IDBObjectStore === 'undefined') return;
      const realPut = IDBObjectStore.prototype.put;
      const w = window as unknown as { __noacgHoldWrites?: boolean };
      // A read issued from the last one's success keeps the transaction from committing.
      const holdOpen = (store: IDBObjectStore) => {
        if (w.__noacgHoldWrites) store.get('__noacg_hold__').onsuccess = () => holdOpen(store);
      };
      IDBObjectStore.prototype.put = function put(this: IDBObjectStore, ...args: unknown[]) {
        const request = (realPut as (...a: unknown[]) => IDBRequest).apply(this, args);
        holdOpen(this);
        return request;
      } as typeof IDBObjectStore.prototype.put;
    } catch {
      /* nothing to install here */
    }
  });
}
const holdWrites = (page: Page, held: boolean) =>
  page.evaluate((held) => {
    (window as unknown as { __noacgHoldWrites?: boolean }).__noacgHoldWrites = held;
  }, held);

const list = (page: Page) => page.getByTestId('cue-list');
const cue = (page: Page, text: string) => list(page).locator('.pd-cue', { hasText: text });
const folder = (page: Page, name: string) => list(page).locator('.pd-folder', { hasText: name });
/** What PROGRAM's layers show at `selector`, one entry per layer frame. */
const programTexts = async (page: Page, selector: string): Promise<string[]> => {
  const frames = page.locator('[data-testid="program-stage"] iframe');
  const texts: string[] = [];
  for (let i = 0; i < (await frames.count()); i++) {
    const node = frames.nth(i).contentFrame().locator(selector);
    if ((await node.count()) > 0) texts.push((await node.first().textContent()) ?? '');
  }
  return texts;
};
/** Wait until one of PROGRAM's layers shows `text` at `selector`. */
const onProgram = (page: Page, selector: string, text: string) =>
  expect.poll(() => programTexts(page, selector), { message: `PROGRAM shows "${text}" at ${selector}` }).toContain(text);
const plays = (page: Page) => page.getByTestId('program-stage').getAttribute('data-plays').then(Number);

/** A field nobody types into: a checkbox keeps the keyboard's verbs (components/playoutKeys.ts
 *  `typingInto`), so SPACE takes while its edit is still a draft. */
const TOGGLE = { field: 'f9', ftype: 'checkbox', title: 'Highlight', value: 'false' } as const;

/**
 * A production of Hairline's cue, optionally House Quiz's, then a copy of Hairline named "Strap"
 * that also carries a checkbox field, then the given server media; optionally one folder over cues
 * by label.
 */
async function production(
  page: Page,
  name: string,
  opts: { media?: Record<string, unknown>[]; folder?: { labels: string[]; name: string; mode: 'together' | 'manual' }; quiz?: boolean } = {},
): Promise<string> {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  const showId = await openProductionWithCurrent(page, name);
  if (opts.quiz) await addCatalogGraphic(page, showId, 'House Quiz');
  await evaluateInPage(
    page,
    async ({ name, media, folder, TOGGLE }) => {
      const m = await import('/src/model/shows.ts');
      const { addFieldToDefinition } = await import('/src/blocks/edit.ts');
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const id = m.loadShows().find((s) => s.name === name)!.id;
      m.addGraphicToShow(id, { ...addFieldToDefinition(useTemplateStore.getState().template, TOGGLE as never), name: 'Strap' });
      for (const x of media) m.addPlayoutItem(id, { adapter: 'casparcg', kind: 'media', channel: 2, ...x } as never);
      if (folder) {
        const idOf = (label: string) => m.loadShows().find((s) => s.id === id)!.cues!.find((c) => c.label === label)!.id;
        const { folderId } = m.addFolderFromSelection(id, folder.labels.map(idOf), folder.name);
        m.setFolderMode(id, folderId!, folder.mode);
      }
    },
    { name, media: opts.media ?? [], folder: opts.folder ?? null, TOGGLE },
  );
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(list(page).locator('.pd-cue').first()).toBeVisible();
  return showId;
}

/** What the fake Bridge was sent, one line each: `take 2-10 VT`, `out 2-10`. */
function sent(fake: { actions: { verb: string; slot: { channel: number; layer: number }; [k: string]: unknown }[] }): string[] {
  return fake.actions.map((a) => {
    const at = `${a.verb} ${a.slot.channel}-${a.slot.layer}`;
    return a.verb === 'take' ? `${at} ${(a.item as { name: string }).name}` : at;
  });
}

const VT = { name: 'VT', mediaKind: 'movie', frames: 1500, fps: 25 };

/** Two key presses as close together as the browser delivers them: two tasks, nothing between. */
const doublePress = (page: Page, key: string) =>
  page.evaluate((key) => {
    const press = () => window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    press();
    setTimeout(press, 0);
  }, key);

test('S3: two SPACE presses on a held folder take it once, even with a save still landing', async ({ page }) => {
  // spec §1.3 S3, refuted and recorded. A folder's Take checks "already running", waits for the
  // draft and the edit group, and only then registers the run. A second press inside that wait
  // would pass the check too. But holding a folder saves the draft and closes the edit group, and
  // a held folder has no cue editor to start another, so both waits answer at once (microtasks)
  // and the first press has registered before the second key event is handled. Here the disk is
  // slow and an edit was still saving when the folder was held, which is the case the wait would
  // have been real in.
  await installWriteHold(page);
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await production(page, 'Folder twice', { media: [VT], folder: { labels: ['Strap', 'VT'], name: 'Opening', mode: 'together' } });
  // An edit on Strap, still a draft, then the disk slow and the folder held.
  await cue(page, 'Strap').getByTestId('select-cue').click();
  await page.getByTestId('cue-editor').locator('input[type="checkbox"]').last().check();
  await holdWrites(page, true);
  await folder(page, 'Opening').getByTestId('select-folder').click();
  await expect(page.getByTestId('folder-editor')).toBeVisible();
  await expect(page.getByTestId('cue-editor')).toHaveCount(0);
  await parkFocusOffControls(page);
  const before = await plays(page);

  await doublePress(page, ' ');
  await expect.poll(() => sent(fake), { message: 'the folder is taken' }).toContain('take 2-10 VT');
  await page.waitForTimeout(500);
  await holdWrites(page, false);
  await page.waitForTimeout(500);
  expect(sent(fake).filter((line) => line === 'take 2-10 VT'), 'two presses take the folder once').toHaveLength(1);
  expect(await plays(page), 'Strap played once').toBe(before + 1);
});

test('S2: a graphic Take pressed while its edit is still a draft waits for the save, then airs the edit', async ({ page }) => {
  // spec §1.3 S2, characterised and retained: a graphic Take awaits the draft's save and the edit
  // group with no bound (a server cue's Take races them against 250 ms instead). The wait is real
  // when the press does not blur the editor: SPACE from a checkbox in it, or a panel's key.
  await installWriteHold(page);
  await production(page, 'Save wait');
  await cue(page, 'Strap').getByTestId('select-cue').click();
  const before = await plays(page);

  await holdWrites(page, true);
  const toggle = page.getByTestId('cue-editor').locator('input[type="checkbox"]').last();
  await toggle.check();
  await expect(toggle).toBeFocused();
  await page.keyboard.press(' ');
  // The checkbox kept its tick: SPACE was the verb's, not the box's.
  await expect(toggle).toBeChecked();
  await page.waitForTimeout(800);
  expect(await plays(page), 'the Take is still waiting for the save').toBe(before);
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');

  await holdWrites(page, false);
  await expect(page.getByTestId('live-cue-chip')).toContainText('Strap');
  await expect.poll(() => plays(page)).toBe(before + 1);
});

/** The editor's text boxes, by field id. */
const textFields = (page: Page) =>
  page.getByTestId('cue-editor').locator('input[type="text"][data-testid^="cue-field-"]').evaluateAll((boxes) =>
    boxes.map((box) => (box as HTMLElement).dataset.testid!.slice('cue-field-'.length)),
  );

test('typed then taken at once: the typed value airs while its save is still landing, as one entrance', async ({ page }) => {
  // spec §5.3, "type then Take at once": the Take comes inside the 300 ms draft flush. The click
  // blurs the editor, which starts the save; with the disk held the save is still out when the
  // Take reads the cue, so what airs must be the draft, once.
  await installWriteHold(page);
  await production(page, 'Type then take');
  await cue(page, 'Hairline').getByTestId('select-cue').click();
  const before = await plays(page);
  await holdWrites(page, true);
  await page.getByTestId('cue-field-f0').fill('Typed then taken');
  await page.getByTestId('verb-take').click();
  await onProgram(page, '#f0', 'Typed then taken');
  await holdWrites(page, false);
  await expect(page.getByTestId('cue-unsent')).toBeEmpty();
  await page.waitForTimeout(500);
  expect(await plays(page), 'one entrance').toBe(before + 1);
});

test('Update sends every field, and u is the same press', async ({ page }) => {
  // spec §4.2 Update: the full set, bound over the cue's own, read after the wait. `u` was never
  // pressed in any spec (§5.3).
  await production(page, 'Update all');
  await cue(page, 'Hairline').getByTestId('select-cue').click();
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('live-cue-chip')).toContainText('Hairline');
  // The chip can render a frame before the stage counts the entrance.
  await expect.poll(() => plays(page)).toBeGreaterThan(0);
  const before = await plays(page);
  const ids = await textFields(page);
  expect(ids.length, 'Hairline has text fields').toBeGreaterThan(1);
  for (const id of ids) await page.getByTestId(`cue-field-${id}`).fill(`Button ${id}`);
  await expect(page.getByTestId('cue-unsent')).toContainText('not on PROGRAM yet');
  await page.getByTestId('verb-update').click();
  for (const id of ids) await onProgram(page, `#${id}`, `Button ${id}`);
  await expect(page.getByTestId('cue-unsent')).toBeEmpty();

  for (const id of ids) await page.getByTestId(`cue-field-${id}`).fill(`Key ${id}`);
  await parkFocusOffControls(page);
  await page.keyboard.press('u');
  for (const id of ids) await onProgram(page, `#${id}`, `Key ${id}`);
  await expect(page.getByTestId('cue-unsent')).toBeEmpty();
  // An update is data only: no new entrance.
  expect(await plays(page)).toBe(before);
});

test('n moves the live graphic a step, and does nothing where » Next is greyed', async ({ page }) => {
  // `n` was never pressed in any spec (§5.3). The quiz goes Question, then Reveal, by declaration
  // (live-actions-first.spec.ts), and Reveal is its last step.
  await production(page, 'Next key', { quiz: true });
  await cue(page, 'House Quiz').getByTestId('select-cue').click();
  await page.getByTestId('verb-take').click();
  const chip = page.getByTestId('machine-state-chip');
  await expect(chip).toHaveText('Question');
  await expect(page.getByTestId('verb-next')).toBeEnabled();
  await parkFocusOffControls(page);
  await page.keyboard.press('n');
  await expect(chip).toHaveText('Reveal');
  await expect(page.getByTestId('verb-next')).toBeDisabled();

  await page.getByTestId('action-log').locator('summary').click();
  const rows = await page.getByTestId('action-log-row').count();
  await parkFocusOffControls(page);
  await page.keyboard.press('n');
  await page.waitForTimeout(500);
  await expect(page.getByTestId('action-log-row')).toHaveCount(rows);
  await expect(chip).toHaveText('Reveal');
});

test('a row selected while the edit is still saving does not lose it: the first cue airs what was typed', async ({ page }) => {
  // spec §5.3, "selection or draft change while a save or send is pending": selecting a row
  // flushes the draft and drops it from the editor; the Take of the first cue must read the saved
  // value after the wait (§4.1 R2), with the disk slow so the save is still landing.
  await installWriteHold(page);
  await production(page, 'Select during save');
  await cue(page, 'Hairline').getByTestId('select-cue').click();
  await holdWrites(page, true);
  await page.getByTestId('cue-field-f0').fill('Typed before moving on');
  await cue(page, 'Strap').getByTestId('select-cue').click();
  await cue(page, 'Hairline').getByTestId('select-cue').click();
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Typed before moving on');
  await page.getByTestId('verb-take').click();
  await page.waitForTimeout(300);
  await holdWrites(page, false);
  await onProgram(page, '#f0', 'Typed before moving on');
  await expect(page.getByTestId('live-cue-chip')).toContainText('Hairline');
});

test('typing into the on-air cue redraws the editor and not the page, and everything showing the text keeps up', async ({ page }) => {
  // spec §7 "Render counts and freshness" (phase 13b, D12): the draft lives in the session and the
  // editor, the rundown rows and PREVIEW subscribe to it themselves; the page draws only whether
  // anything is unsent. As in playout-clock's render count, every timer on the page is FROZEN
  // (Playwright's clock) while the keys go in, so nothing but typing can render anything - the
  // draft's idle save waits too. Ten keystrokes may render the page once, for the "not sent yet"
  // the first one turns on, and the editor once each. A surface that stopped following the draft
  // cannot pass on the counts alone: the editor's box, the unsent line, the rundown row, Update
  // and PREVIEW must all show what was typed before it is saved. Mutation-tested: the page
  // subscribed to the draft part renders with every keystroke, and a row or PREVIEW reading the
  // record instead of the draft shows the old text; each fails this.
  await page.clock.install();
  await production(page, 'Render counts');
  await cue(page, 'Hairline').getByTestId('select-cue').click();
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('live-cue-chip')).toContainText('Hairline');
  await expect.poll(() => plays(page)).toBeGreaterThan(0);
  const field = page.getByTestId('cue-field-f0');
  await field.click();
  await field.press('End');
  const typed = `${await field.inputValue()}0123456789`;
  const pageRenders = () => page.getByTestId('production-page').evaluate((el) => Number(el.getAttribute('data-renders')));
  const editorRenders = () => page.getByTestId('cue-editor').evaluate((el) => Number(el.getAttribute('data-renders')));

  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await expect.poll(async () => {
    const before = await pageRenders();
    await page.waitForTimeout(300);
    return (await pageRenders()) - before;
  }).toBe(0);
  await expect(page.getByTestId('cue-unsent')).toBeEmpty();
  // The suite's dev server renders under React.StrictMode (src/main.tsx), which calls a component
  // twice for each render, so one render moves a count by 2.
  const RENDER = 2;
  const [p0, e0] = [await pageRenders(), await editorRenders()];
  await field.press('0');
  const [p1, e1] = [await pageRenders(), await editorRenders()];
  await field.pressSequentially('123456789');
  await expect(field).toHaveValue(typed);
  const [p10, e10] = [await pageRenders(), await editorRenders()];
  expect(p1 - p0, 'the first keystroke renders the page at most once: "not sent yet" turns on').toBeLessThanOrEqual(RENDER);
  expect(p10 - p1, 'the nine keystrokes after it do not render the page').toBe(0);
  expect(e1 - e0, 'a keystroke renders the editor').toBeGreaterThan(0);
  expect(e10 - e0, `the editor moved ${e10 - e0} over ten keystrokes`).toBeLessThanOrEqual(10 * RENDER);
  await expect(page.getByTestId('cue-unsent')).toContainText('1 change not on PROGRAM yet');
  await expect(cue(page, 'Hairline')).toContainText(typed);
  await expect(page.getByTestId('verb-update')).toBeEnabled();

  // PREVIEW settles 150 ms after the last change and the draft is saved only at 300 ms, so after
  // 200 ms what PREVIEW shows came from the draft and not from a saved record.
  await page.clock.runFor(200);
  await expect(page.frameLocator('iframe[title="Cue preview"]').locator('#f0')).toHaveText(typed);
  await page.clock.resume();
  await page.getByTestId('verb-update').click();
  await onProgram(page, '#f0', typed);
  await expect(page.getByTestId('cue-unsent')).toBeEmpty();
});
