// covers: src/components/home/{ProductionPage,CueRundown,FolderRow,FolderEditor,ServerCueEditor,PlayoutMonitors}.tsx
// covers: src/model/{shows,showFolders,rundownRows}.ts
// covers: src/control/{folderAir,serverPlayout,serverState,cuePlayback,playoutLink}.ts
// covers: src/components/playoutKeys.ts, src/styles/playout-dashboard.css
// focus
//
// A RUNDOWN'S FOLDERS (docs/CLIP_PLAYBACK_PLAN.md §6.2, §6.5, §6.6 and §7, phase 4). The rundown half:
// a shift-click range and New folder, a header row with its cues under it on one line each, collapse,
// the ⋯ menus, a drag in and out of a folder by the thirds of a row with one write per drag, a refused
// drop said and nothing moved, the arrow keys over the rows as drawn, and a folder write that did not
// land said as such. The air half: One by one takes nothing by itself, Play through sends one
// sequence on the folder's slot (round again with Loop the folder, on a Bridge that can), and All
// together starts every cue in it and says which it could not. NoaCG Bridge is faked at the network
// layer (e2e/_fakeBridge.ts); its runner is tested against a stateful fake CasparCG in cli/test.

import { test, expect, type Locator, type Page } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from './_create';
import { settleDurableWrites } from './_durable';
import { evaluateInPage } from './_evaluate';
import { fakeBridge, seedSettings } from './_fakeBridge';
import { holdKeyRepeats, parkFocusOffControls } from './_keys';
import { armStorageFailure, fillStorage, freeStorage } from './_storage';

/** What a spec lays out through the record's own writers before the page loads: more graphics
 *  (each a copy of Hairline under its own name, with its own cue), cue settings by label, and folders
 *  by their cues' labels. */
interface Seed {
  graphics?: { name: string; layer?: number }[];
  playback?: Record<string, Record<string, unknown>>;
  folders?: { labels: string[]; name?: string; mode?: 'manual' | 'through' | 'together'; end?: 'loop'; layer?: number; collapsed?: boolean }[];
}

/** A production: the Hairline graphic's cue first, then the given server media, each on its own
 *  item, then what `seed` lays out. */
async function production(page: Page, media: Record<string, unknown>[] = [], seed: Seed = {}): Promise<string> {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  const showId = await openProductionWithCurrent(page, 'Evening News');
  if (media.length || seed.graphics || seed.playback || seed.folders) {
    await evaluateInPage(
      page,
      async ({ list, seed }) => {
        const m = await import('/src/model/shows.ts');
        const { useTemplateStore } = await import('/src/store/templateStore.ts');
        const id = m.loadShows().find((s) => s.name === 'Evening News')!.id;
        for (const g of seed.graphics ?? []) {
          m.addGraphicToShow(id, { ...useTemplateStore.getState().template, name: g.name });
          const pooled = m.loadShows().find((s) => s.id === id)!.graphics.find((x) => x.name === g.name)!;
          if (g.layer) m.setShowGraphicLayer(id, pooled.id, g.layer);
        }
        for (const x of list) m.addPlayoutItem(id, { adapter: 'casparcg', kind: 'media', channel: 2, ...x } as never);
        const idOf = (label: string) => m.loadShows().find((s) => s.id === id)!.cues!.find((c) => c.label === label)!.id;
        for (const [label, playback] of Object.entries(seed.playback ?? {})) m.setCuePlayback(id, idOf(label), playback as never);
        for (const f of seed.folders ?? []) {
          const { folderId } = m.addFolderFromSelection(id, f.labels.map(idOf), f.name);
          if (f.mode) m.setFolderMode(id, folderId!, f.mode);
          if (f.end || f.layer) m.setFolderPlayback(id, folderId!, { ...(f.end ? { end: f.end } : {}), ...(f.layer ? { layer: f.layer } : {}) });
          if (f.collapsed) m.setFolderCollapsed(id, folderId!, true);
        }
      },
      { list: media, seed },
    );
    await settleDurableWrites(page);
    await page.reload();
  }
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('cue-list').locator('.pd-cue, .pd-folder').first()).toBeVisible();
  return showId;
}

/** What the fake Bridge was sent, one line each: `take 2-10 ALPHA`, `out 2-5`, `sequence 2-10 A,B`. */
function sent(fake: { actions: { verb: string; slot: { channel: number; layer: number }; [k: string]: unknown }[] }): string[] {
  return fake.actions.map((a) => {
    const at = `${a.verb} ${a.slot.channel}-${a.slot.layer}`;
    if (a.verb === 'sequence') return `${at} ${(a.entries as { item: { name: string } }[]).map((e) => e.item.name).join(',')}${a.loop ? ' loop' : ''}`;
    if (a.verb === 'take') return `${at} ${(a.item as { name: string }).name}${a.loop ? ' loop' : ''}`;
    return at;
  });
}

async function holdFolder(page: Page, name: string): Promise<void> {
  await folder(page, name).getByTestId('select-folder').click();
  await expect(page.getByTestId('folder-editor')).toBeVisible();
  await parkFocusOffControls(page);
}

const CLIPS = [
  { name: 'ALPHA', mediaKind: 'movie', frames: 250, fps: 25 },
  { name: 'BRAVO', mediaKind: 'movie', frames: 250, fps: 25 },
  { name: 'CHARLIE', mediaKind: 'movie', frames: 250, fps: 25 },
];

const list = (page: Page) => page.getByTestId('cue-list');
const cue = (page: Page, text: string) => list(page).locator('.pd-cue', { hasText: text });
const folder = (page: Page, name: string) => list(page).locator('.pd-folder', { hasText: name });
/** The rows as drawn: a cue by its name, a header as `[name]`, a cue in a folder indented as `  name`. */
async function drawn(page: Page): Promise<string[]> {
  return list(page)
    .locator('.pd-cue, .pd-folder')
    .evaluateAll((rows) =>
      rows.map((r) => {
        const name = (r.querySelector('.pd-cue-label strong') as HTMLElement).innerText;
        if (r.classList.contains('pd-folder')) return `[${name}]`;
        return r.classList.contains('in-folder') ? `  ${name}` : name;
      }),
    );
}

async function selectCue(page: Page, text: string, shift = false): Promise<void> {
  await cue(page, text).getByTestId('select-cue').click({ modifiers: shift ? ['Shift'] : [] });
}

/** Select `from`, shift-click `to`, and make a folder of the range. */
async function folderOf(page: Page, from: string, to: string): Promise<void> {
  await selectCue(page, from);
  await selectCue(page, to, true);
  await page.getByTestId('new-folder').click();
  await expect(page.getByTestId('rundown-range')).toHaveCount(0);
}

/** Count the library's writes from here on: every saved change of the record announces one. */
async function countWrites(page: Page): Promise<() => Promise<number>> {
  await page.evaluate(() => {
    const w = window as unknown as { __writes: number };
    w.__writes = 0;
    window.addEventListener('spx-data-changed', () => (w.__writes += 1));
  });
  return () => page.evaluate(() => (window as unknown as { __writes: number }).__writes);
}

/** Pick a row up by its grip and hold it: the first move starts the drag. */
async function pickUp(page: Page, row: Locator): Promise<void> {
  const box = (await row.locator('.pd-grip').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 4, { steps: 2 });
}

/** Move the held row over a third of another, so the list is told where it aims. Chromium fires
 *  `dragover` only on a move that stays over the element the last one reached (a move onto a new one
 *  is a `dragenter`), so the pointer settles there with two more small moves. */
async function aimAt(page: Page, row: Locator, band: 'top' | 'middle' | 'bottom'): Promise<void> {
  const box = (await row.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + (band === 'top' ? 3 : band === 'bottom' ? box.height - 3 : box.height / 2);
  await page.mouse.move(x, y, { steps: 4 });
  await page.mouse.move(x + 1, y);
  await page.mouse.move(x, y);
}

/** Drag a row onto another by the third of it the pointer lands in, and let go there. */
async function drag(page: Page, from: Locator, to: Locator, band: 'top' | 'middle' | 'bottom'): Promise<void> {
  await pickUp(page, from);
  await aimAt(page, to, band);
  await page.mouse.up();
}

test('shift-click selects over the rows as drawn, New folder makes a One by one folder of them, each row one line', async ({ page }) => {
  await production(page, CLIPS);
  await selectCue(page, 'ALPHA');
  await selectCue(page, 'CHARLIE', true);
  // The range: its count and its verb, and nothing else moved - the cursor, PREVIEW, what SPACE takes.
  await expect(page.getByTestId('range-count')).toHaveText('3 selected');
  await expect(cue(page, 'ALPHA').getByTestId('select-cue')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('preview-what')).toHaveText('ALPHA');
  await expect(list(page).locator('.pd-cue.in-range')).toHaveCount(3);

  const writes = await countWrites(page);
  await page.getByTestId('new-folder').click();
  await expect(folder(page, 'Folder 1')).toBeVisible();
  await expect.poll(() => drawn(page)).toEqual(['Hairline', '[Folder 1]', '  ALPHA', '  BRAVO', '  CHARLIE']);
  expect(await writes()).toBe(1);
  // A new folder plays one by one and says so, and the cursor stayed on the cue it was on.
  await expect(folder(page, 'Folder 1').getByTestId('folder-kind')).toHaveAttribute('aria-label', 'Folder · One by one · 3 cues');
  await expect(folder(page, 'Folder 1').getByTestId('folder-count')).toHaveText('3');
  await expect(cue(page, 'ALPHA').getByTestId('select-cue')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('rundown-range')).toHaveCount(0);

  // ONE LINE A ROW, header and cues alike, at both widths the dashboard is built for.
  for (const width of [1920, 1366]) {
    await page.setViewportSize({ width, height: 900 });
    const heights = await list(page).locator('.pd-cue, .pd-folder').evaluateAll((rows) => rows.map((r) => r.getBoundingClientRect().height));
    expect(heights, `row heights at ${width}`).toEqual(heights.map(() => 34));
    // A cue in a folder sits in from the rail by one step, under its header.
    const inset = await list(page).evaluate((l) => {
      const header = l.querySelector('.pd-folder')!.getBoundingClientRect().left;
      const member = l.querySelector('.pd-cue.in-folder')!.getBoundingClientRect().left;
      return member - header;
    });
    expect(inset).toBe(12);
  }

  // It survives a reload, as the record's.
  await settleDurableWrites(page);
  await page.reload();
  await expect.poll(() => drawn(page)).toEqual(['Hairline', '[Folder 1]', '  ALPHA', '  BRAVO', '  CHARLIE']);
});

test('the arrow keys walk the rows as drawn: a header is a stop, a collapsed folder hides its cues, and collapse is kept', async ({ page }) => {
  await production(page, CLIPS);
  await folderOf(page, 'ALPHA', 'BRAVO');
  await selectCue(page, 'Hairline');
  await parkFocusOffControls(page);

  await page.keyboard.press('ArrowDown');
  await expect(folder(page, 'Folder 1')).toHaveClass(/selected/);
  await expect(page.getByTestId('folder-editor')).toBeVisible();
  // PREVIEW shows the cue its first press takes (docs/CLIP_PLAYBACK_PLAN.md §20.1).
  await expect(page.getByTestId('preview-what')).toHaveText('ALPHA · next in Folder 1');
  // A held header is not a cue: no cue's editor stands beside the folder's panel.
  await expect(page.getByTestId('playout-cue-where')).toHaveCount(0);
  await page.keyboard.press('ArrowDown');
  await expect(cue(page, 'ALPHA').getByTestId('select-cue')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('folder-editor')).toHaveCount(0);
  await page.keyboard.press('ArrowUp');
  await expect(folder(page, 'Folder 1')).toHaveClass(/selected/);

  // Collapsed: its cues are gone from the list and from the walk, and the header carries the count.
  await folder(page, 'Folder 1').getByTestId('folder-toggle').click();
  await expect.poll(() => drawn(page)).toEqual(['Hairline', '[Folder 1]', 'CHARLIE']);
  await parkFocusOffControls(page);
  await page.keyboard.press('ArrowDown');
  await expect(cue(page, 'CHARLIE').getByTestId('select-cue')).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(folder(page, 'Folder 1')).toHaveClass(/selected/);
  await expect(folder(page, 'Folder 1').getByTestId('folder-count')).toHaveText('2');

  // Collapse is the record's: it survives a reload, and nothing opens it by itself.
  await settleDurableWrites(page);
  await page.reload();
  await expect.poll(() => drawn(page)).toEqual(['Hairline', '[Folder 1]', 'CHARLIE']);
});

test('the menus: a folder from one cue, a cue moved into and out of one, a duplicate after its original, and Remove folder keeps the cues', async ({ page }) => {
  await production(page, CLIPS);
  await cue(page, 'BRAVO').getByTestId('cue-menu').click();
  await page.getByTestId('cue-new-folder').click();
  await expect.poll(() => drawn(page)).toEqual(['Hairline', 'ALPHA', '[Folder 1]', '  BRAVO', 'CHARLIE']);

  await cue(page, 'CHARLIE').getByTestId('cue-menu').click();
  await page.getByTestId('cue-into-folder').click();
  await expect.poll(() => drawn(page)).toEqual(['Hairline', 'ALPHA', '[Folder 1]', '  BRAVO', '  CHARLIE']);

  // A duplicate goes right after its original, in its folder, and carries its playback.
  await selectCue(page, 'BRAVO');
  await page.getByTestId('clip-end-loop').click();
  await cue(page, 'BRAVO').getByTestId('cue-menu').click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect.poll(() => drawn(page)).toEqual(['Hairline', 'ALPHA', '[Folder 1]', '  BRAVO', '  BRAVO copy', '  CHARLIE']);
  await expect(cue(page, 'BRAVO copy').getByTestId('cue-loop')).toBeVisible();
  await expect(cue(page, 'BRAVO copy').getByTestId('select-cue')).toHaveAttribute('aria-current', 'true');

  await cue(page, 'BRAVO copy').getByTestId('cue-menu').click();
  await page.getByTestId('delete-cue').click();
  await cue(page, 'BRAVO').first().getByTestId('cue-menu').click();
  await page.getByTestId('cue-out-of-folder').click();
  await expect.poll(() => drawn(page)).toEqual(['Hairline', 'ALPHA', '[Folder 1]', '  CHARLIE', 'BRAVO']);

  // The last cue out takes the folder with it.
  await cue(page, 'CHARLIE').getByTestId('cue-menu').click();
  await page.getByTestId('cue-out-of-folder').click();
  await expect.poll(() => drawn(page)).toEqual(['Hairline', 'ALPHA', 'CHARLIE', 'BRAVO']);

  await folderOf(page, 'ALPHA', 'BRAVO');
  await folder(page, 'Folder 1').getByTestId('folder-menu').click();
  await expect(page.getByTestId('remove-folder')).toHaveText('Remove folder (keeps its 3 cues)');
  await page.getByTestId('remove-folder').click();
  await expect.poll(() => drawn(page)).toEqual(['Hairline', 'ALPHA', 'CHARLIE', 'BRAVO']);
});

test('a drag lands by the third of a row: into a folder, out of it, a folder as a whole - one write each', async ({ page }) => {
  await production(page, CLIPS);
  await folderOf(page, 'ALPHA', 'BRAVO');
  const writes = await countWrites(page);

  // CHARLIE onto BRAVO's bottom third: last in the folder.
  await drag(page, cue(page, 'CHARLIE'), cue(page, 'BRAVO'), 'bottom');
  await expect.poll(() => drawn(page)).toEqual(['Hairline', '[Folder 1]', '  ALPHA', '  BRAVO', '  CHARLIE']);
  expect(await writes()).toBe(1);

  // Hairline onto the header's top third: above the folder, still outside it - nothing to do.
  // Onto ALPHA's middle third, moving down: after ALPHA, in the folder, as the old drag did.
  await drag(page, cue(page, 'Hairline'), cue(page, 'ALPHA'), 'middle');
  await expect.poll(() => drawn(page)).toEqual(['[Folder 1]', '  ALPHA', '  Hairline', '  BRAVO', '  CHARLIE']);
  expect(await writes()).toBe(2);

  // Hairline out of the folder by the end strip.
  await pickUp(page, cue(page, 'Hairline'));
  await aimAt(page, folder(page, 'Folder 1'), 'middle');
  await aimAt(page, page.getByTestId('rundown-drop-end'), 'middle');
  await expect(page.getByTestId('rundown-drop-end')).toHaveAttribute('data-drop', 'into');
  await page.mouse.up();
  await expect.poll(() => drawn(page)).toEqual(['[Folder 1]', '  ALPHA', '  BRAVO', '  CHARLIE', 'Hairline']);
  expect(await writes()).toBe(3);

  // The folder as a whole, by its header, below Hairline.
  await drag(page, folder(page, 'Folder 1'), cue(page, 'Hairline'), 'bottom');
  await expect.poll(() => drawn(page)).toEqual(['Hairline', '[Folder 1]', '  ALPHA', '  BRAVO', '  CHARLIE']);
  expect(await writes()).toBe(4);

  // Onto a collapsed header: last in it.
  await drag(page, folder(page, 'Folder 1'), cue(page, 'Hairline'), 'top');
  await folder(page, 'Folder 1').getByTestId('folder-toggle').click();
  const before = await writes();
  await drag(page, cue(page, 'Hairline'), folder(page, 'Folder 1'), 'middle');
  await expect(folder(page, 'Folder 1').getByTestId('folder-count')).toHaveText('4');
  expect(await writes()).toBe(before + 1);
});

// ── Editing the rundown (docs/CLIP_PLAYBACK_PLAN.md §20.2) ─────────────────────────────────────

test('a selection drags as one block, in its order: onto a folder header it lands last in it, the folder lit; a row outside it moves alone', async ({ page }) => {
  await production(page, CLIPS);
  await folderOf(page, 'BRAVO', 'CHARLIE');
  await selectCue(page, 'Hairline');
  await selectCue(page, 'ALPHA', true);
  await expect(page.getByTestId('range-count')).toHaveText('2 selected');
  const writes = await countWrites(page);
  await pickUp(page, cue(page, 'ALPHA'));
  await aimAt(page, folder(page, 'Folder 1'), 'middle');
  await expect(folder(page, 'Folder 1')).toHaveAttribute('data-drop', 'into');
  await expect(cue(page, 'BRAVO')).toHaveAttribute('data-drop-target', '');
  await page.mouse.up();
  await expect.poll(() => drawn(page)).toEqual(['[Folder 1]', '  BRAVO', '  CHARLIE', '  Hairline', '  ALPHA']);
  expect(await writes()).toBe(1);
  // The selection stands after the move.
  await expect(page.getByTestId('range-count')).toHaveText('2 selected');
  // A row outside it moves alone.
  await drag(page, cue(page, 'BRAVO'), cue(page, 'ALPHA'), 'bottom');
  await expect.poll(() => drawn(page)).toEqual(['[Folder 1]', '  CHARLIE', '  Hairline', '  ALPHA', '  BRAVO']);
});

test('the menu of a selected row acts on the whole selection: move into, take out, duplicate, and remove asks first', async ({ page }) => {
  await production(page, CLIPS);
  await cue(page, 'CHARLIE').getByTestId('cue-menu').click();
  await page.getByTestId('cue-new-folder').click();
  await expect.poll(() => drawn(page)).toEqual(['Hairline', 'ALPHA', 'BRAVO', '[Folder 1]', '  CHARLIE']);
  await selectCue(page, 'ALPHA');
  await selectCue(page, 'BRAVO', true);

  await cue(page, 'BRAVO').getByTestId('cue-menu').click();
  await expect(page.getByTestId('cue-into-folder')).toHaveText('Move the 2 selected into ▤ Folder 1');
  await page.getByTestId('cue-into-folder').click();
  await expect.poll(() => drawn(page)).toEqual(['Hairline', '[Folder 1]', '  CHARLIE', '  ALPHA', '  BRAVO']);

  await cue(page, 'ALPHA').getByTestId('cue-menu').click();
  await page.getByTestId('cue-out-of-folder').click();
  await expect.poll(() => drawn(page)).toEqual(['Hairline', '[Folder 1]', '  CHARLIE', 'ALPHA', 'BRAVO']);

  await cue(page, 'ALPHA').getByTestId('cue-menu').click();
  await page.getByRole('menuitem', { name: 'Duplicate the 2 selected cues' }).click();
  await expect.poll(() => drawn(page)).toEqual(['Hairline', '[Folder 1]', '  CHARLIE', 'ALPHA', 'BRAVO', 'ALPHA copy', 'BRAVO copy']);
  // The copies are the selection now; the cursor stayed on ALPHA.
  await expect(list(page).locator('.pd-cue.in-range')).toHaveCount(2);
  await expect(cue(page, 'ALPHA copy')).toHaveClass(/in-range/);
  await expect(cue(page, 'ALPHA').first().getByTestId('select-cue')).toHaveAttribute('aria-current', 'true');

  await cue(page, 'BRAVO copy').getByTestId('cue-menu').click();
  await page.getByTestId('delete-cue').click();
  await expect(page.getByTestId('delete-cue')).toHaveText('Remove the 2 selected cues. Confirm?');
  await expect.poll(() => drawn(page)).toEqual(['Hairline', '[Folder 1]', '  CHARLIE', 'ALPHA', 'BRAVO', 'ALPHA copy', 'BRAVO copy']);
  await page.getByTestId('delete-cue').click();
  await expect.poll(() => drawn(page)).toEqual(['Hairline', '[Folder 1]', '  CHARLIE', 'ALPHA', 'BRAVO']);
});

test('Ctrl+C and Ctrl+V make new cues that stand on their own; Ctrl+X and Ctrl+V move a cue with its id, still on air', async ({ page }) => {
  await production(page, [], { graphics: [{ name: 'Strap A' }, { name: 'Strap B' }] });
  const rows = list(page).locator('.pd-cue');
  await selectCue(page, 'Strap A');
  await parkFocusOffControls(page);
  await page.keyboard.press('ControlOrMeta+c');
  await expect(page.getByTestId('production-note')).toHaveText('✓ 1 cue copied. Ctrl+V pastes after the selected row.');
  await selectCue(page, 'Strap B');
  await parkFocusOffControls(page);
  await page.keyboard.press('ControlOrMeta+v');
  await expect.poll(() => drawn(page)).toEqual(['Hairline', 'Strap A', 'Strap B', 'Strap A']);
  // A new cue with its own id; the pasted row is the selection and the cursor stayed.
  const ids = await rows.evaluateAll((r) => r.map((row) => row.getAttribute('data-row')));
  expect(new Set(ids).size).toBe(4);
  await expect(rows.nth(3)).toHaveClass(/in-range/);
  await expect(cue(page, 'Strap B').getByTestId('select-cue')).toHaveAttribute('aria-current', 'true');

  // The original, on air, cut and pasted at the end: the same row, still on air.
  const original = rows.nth(1);
  const originalId = (await original.getAttribute('data-row'))!;
  await original.getByTestId('select-cue').click();
  await parkFocusOffControls(page);
  await page.keyboard.press(' ');
  await expect(original.getByTestId('cue-up-here')).toBeVisible();
  await page.keyboard.press('ControlOrMeta+x');
  await expect(list(page).locator(`[data-row="${originalId}"]`)).toHaveClass(/cut/);
  await rows.last().getByTestId('select-cue').click();
  await parkFocusOffControls(page);
  await page.keyboard.press('ControlOrMeta+v');
  await expect(rows.last()).toHaveAttribute('data-row', originalId);
  await expect(rows.last().getByTestId('cue-up-here')).toBeVisible();
  await expect(list(page).locator('.pd-cue.cut')).toHaveCount(0);
  await expect.poll(() => drawn(page)).toEqual(['Hairline', 'Strap B', 'Strap A', 'Strap A']);
});

test('Ctrl-click adds and drops a row, Shift+Down extends from the cursor, Escape clears, and a right-click opens the row menu', async ({ page }) => {
  await production(page, CLIPS);
  await selectCue(page, 'Hairline');
  await cue(page, 'BRAVO').getByTestId('select-cue').click({ modifiers: ['ControlOrMeta'] });
  await expect(page.getByTestId('range-count')).toHaveText('2 selected');
  await expect(list(page).locator('.pd-cue.in-range')).toHaveCount(2);
  await cue(page, 'BRAVO').getByTestId('select-cue').click({ modifiers: ['ControlOrMeta'] });
  await expect(page.getByTestId('range-count')).toHaveText('1 selected');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('rundown-range')).toHaveCount(0);

  await parkFocusOffControls(page);
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(page.getByTestId('range-count')).toHaveText('3 selected');
  // The cursor, and so PREVIEW, stayed where it was.
  await expect(cue(page, 'Hairline').getByTestId('select-cue')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('preview-what')).toHaveText('Hairline');

  await cue(page, 'ALPHA').click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Duplicate the 3 selected cues' })).toBeVisible();
  // Escape closes the menu first, and the selection stands.
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Duplicate the 3 selected cues' })).toHaveCount(0);
  await expect(page.getByTestId('range-count')).toHaveText('3 selected');
});

test('rows say their channel when the rundown plays on two, and a folder hangs its cues from a line', async ({ page }) => {
  // docs/CLIP_PLAYBACK_PLAN.md §20.3.
  await seedSettings(page);
  await fakeBridge(page);
  await production(page, CLIPS, { folders: [{ labels: ['ALPHA', 'BRAVO'], name: 'Block A' }] });
  await expect(page.getByTestId('channel-legend')).toContainText('Inserts');
  await expect(cue(page, 'Hairline').getByTestId('cue-layer')).toHaveAttribute('data-ch', '1');
  await expect(cue(page, 'CHARLIE').getByTestId('cue-layer')).toHaveAttribute('data-ch', '2');
  await expect(cue(page, 'ALPHA').locator('.pd-fold-guide')).toHaveCount(1);
  await expect(cue(page, 'CHARLIE').locator('.pd-fold-guide')).toHaveCount(0);
});

test('a rundown on one channel, or with no playout server, wears no channel tones', async ({ page }) => {
  await production(page, CLIPS);
  await expect(page.getByTestId('channel-legend')).toHaveCount(0);
  await expect(list(page).locator('[data-ch]')).toHaveCount(0);
});

test('a drop that cannot land is said while it hovers and after, and nothing moves', async ({ page }) => {
  await seedSettings(page);
  await fakeBridge(page);
  await production(page, CLIPS);
  await folderOf(page, 'ALPHA', 'CHARLIE');
  await folder(page, 'Folder 1').getByTestId('select-folder').click();
  await expect(page.getByTestId('folder-mode-through')).toBeEnabled();
  await page.getByTestId('folder-mode-through').click();
  const writes = await countWrites(page);

  // A graphic cannot join a Play-through folder: the line under the list says why, as it hovers.
  await pickUp(page, cue(page, 'Hairline'));
  await aimAt(page, cue(page, 'BRAVO'), 'bottom');
  await expect(cue(page, 'BRAVO')).toHaveAttribute('data-drop', 'refused');
  await expect(page.getByTestId('rundown-note')).toContainText('a graphic');
  await page.mouse.up();
  await expect(page.getByTestId('rundown-note')).toContainText('a graphic');
  await expect.poll(() => drawn(page)).toEqual(['Hairline', '[Folder 1]', '  ALPHA', '  BRAVO', '  CHARLIE']);
  expect(await writes()).toBe(0);
});

test('a folder write that does not land is said, and the rundown keeps what was saved', async ({ page }) => {
  await armStorageFailure(page);
  await production(page, CLIPS);
  await fillStorage(page);
  await selectCue(page, 'ALPHA');
  await selectCue(page, 'BRAVO', true);
  await page.getByTestId('new-folder').click();
  await expect(page.getByTestId('rundown-note')).toContainText('The folder was not saved');
  await expect(list(page).locator('.pd-folder')).toHaveCount(0);
  await freeStorage(page);
  await folderOf(page, 'ALPHA', 'BRAVO');
  await expect(page.getByTestId('rundown-note')).toHaveCount(0);
  await expect(folder(page, 'Folder 1')).toBeVisible();
});

test('One by one steps: each SPACE on its header takes the next cue and the graphic before it off, then goes back to the top', async ({ page }) => {
  // docs/CLIP_PLAYBACK_PLAN.md §20.1 (owner, 2026-09-29).
  await production(page, [], { graphics: [{ name: 'Strap A' }, { name: 'Strap B' }], folders: [{ labels: ['Strap A', 'Strap B'], name: 'Straps' }] });
  await holdFolder(page, 'Straps');
  const take = page.getByTestId('verb-take');
  await expect(take).toBeEnabled();
  await expect(take).toHaveAttribute('title', 'Take Strap A. SPACE does the same');
  await expect(page.getByTestId('preview-what')).toHaveText('Strap A · next in Straps');
  await expect(page.getByTestId('folder-mode-hint')).toContainText('one at a time');
  // A production with no server cue cannot choose Play through, and is told why.
  await expect(page.getByTestId('folder-mode-through')).toBeDisabled();
  await expect(page.getByTestId('folder-mode-through')).toHaveAttribute('title', /no server clip/);

  // A held SPACE steps once: a step is several actions, never ten a second.
  await page.keyboard.down(' ');
  await holdKeyRepeats(page, 4);
  await page.keyboard.up(' ');
  await expect(cue(page, 'Strap A').getByTestId('cue-up-here')).toBeVisible();
  await expect(cue(page, 'Strap B').getByTestId('cue-up-here')).toHaveCount(0);
  await expect(folder(page, 'Straps').getByTestId('folder-air')).toHaveText('1 ON AIR');
  await expect(take).toContainText('NEXT');
  await expect(take).toHaveAttribute('title', 'Take Strap B, and Strap A off. SPACE does the same');
  await expect(page.getByTestId('preview-what')).toHaveText('Strap B · next in Straps');

  await page.keyboard.press(' ');
  await expect(cue(page, 'Strap B').getByTestId('cue-up-here')).toBeVisible();
  await expect(cue(page, 'Strap A').getByTestId('cue-up-here')).toHaveCount(0);

  // The end: the last graphic off, and back to the top.
  await expect(take).toContainText('TAKE OFF');
  await page.keyboard.press(' ');
  await expect(cue(page, 'Strap B').getByTestId('cue-up-here')).toHaveCount(0);
  await expect(page.getByTestId('production-note')).toHaveText('✓ Straps: back to its first cue');
  await expect(page.getByTestId('preview-what')).toHaveText('Strap A · next in Straps');
  await page.keyboard.press(' ');
  await expect(cue(page, 'Strap A').getByTestId('cue-up-here')).toBeVisible();

  // With the cursor elsewhere, the rundown still marks the cue the folder takes next.
  await selectCue(page, 'Hairline');
  await expect(cue(page, 'Strap B').getByTestId('cue-step-next')).toBeVisible();

  // All out takes it off and every folder starts again from its first cue.
  await page.getByTestId('verb-out-all').click();
  await expect(cue(page, 'Strap A').getByTestId('cue-up-here')).toHaveCount(0);
  await expect(list(page).getByTestId('cue-step-next')).toHaveCount(0);
  await holdFolder(page, 'Straps');
  await expect(page.getByTestId('preview-what')).toHaveText('Strap A · next in Straps');

  // So does 0 on the header.
  await page.keyboard.press(' ');
  await page.keyboard.press(' ');
  await expect(cue(page, 'Strap B').getByTestId('cue-up-here')).toBeVisible();
  await page.keyboard.press('0');
  await expect(cue(page, 'Strap B').getByTestId('cue-up-here')).toHaveCount(0);
  await expect(page.getByTestId('preview-what')).toHaveText('Strap A · next in Straps');
});

test('One by one never stops a clip: a step past it leaves it playing, a cue taken by hand moves the step, and 0 stops the folder', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await production(page, TOGETHER_MEDIA, {
    graphics: [{ name: 'Strap' }, { name: 'Logo' }],
    folders: [{ labels: ['Strap', 'Logo', 'VT', 'BED'], name: 'Item' }],
  });
  expect(await drawn(page)).toEqual(['Hairline', '[Item]', '  Strap', '  Logo', '  VT', '  BED']);
  await holdFolder(page, 'Item');
  const take = page.getByTestId('verb-take');
  // Unpublished, a graphic taken is UP on the page; a clip plays through the Bridge and is ON AIR.
  const step = async (cueName: string, says: 'UP' | 'ON AIR' = 'UP') => {
    await expect(page.getByTestId('preview-what')).toHaveText(`${cueName} · next in Item`);
    await expect(take).toBeEnabled();
    await page.keyboard.press(' ');
    await expect(cue(page, cueName).locator('.pd-tag.up, .pd-tag.air')).toHaveText(says);
  };
  await step('Strap');
  await step('Logo');
  await expect(cue(page, 'Strap').getByTestId('cue-up-here')).toHaveCount(0);
  // A graphic goes off whatever comes next, a clip included.
  await step('VT', 'ON AIR');
  await expect(cue(page, 'Logo').getByTestId('cue-up-here')).toHaveCount(0);
  // A clip is never stopped by a step: the bed comes in under it.
  await step('BED', 'ON AIR');
  await expect(cue(page, 'VT')).toContainText('ON AIR');
  expect(sent(fake)).toEqual(['take 2-10 VT', 'take 2-5 BED']);

  // Nothing left: back to the top, and the clips play on.
  await expect(take).toContainText('FROM THE TOP');
  await page.keyboard.press(' ');
  await expect(page.getByTestId('production-note')).toHaveText('✓ Item: back to its first cue');
  await expect(cue(page, 'VT')).toContainText('ON AIR');
  await expect(cue(page, 'BED')).toContainText('ON AIR');

  // Logo taken by hand: the step stands on it. What comes after it is on air already, so the next
  // press takes Logo off and goes back to the top - still never touching a clip.
  await selectCue(page, 'Logo');
  await parkFocusOffControls(page);
  await page.keyboard.press(' ');
  await expect(cue(page, 'Logo').getByTestId('cue-up-here')).toBeVisible();
  await holdFolder(page, 'Item');
  await expect(take).toContainText('TAKE OFF');
  await page.keyboard.press(' ');
  await expect(cue(page, 'Logo').getByTestId('cue-up-here')).toHaveCount(0);
  await expect(cue(page, 'VT')).toContainText('ON AIR');
  expect(sent(fake)).toEqual(['take 2-10 VT', 'take 2-5 BED']);

  // 0 on the header stops the folder, its clips included.
  await page.keyboard.press('0');
  await expect(cue(page, 'VT')).not.toContainText('ON AIR');
  await expect(cue(page, 'BED')).not.toContainText('ON AIR');
  expect(sent(fake)).toEqual(['take 2-10 VT', 'take 2-5 BED', 'out 2-10', 'out 2-5']);
});

test('a step whose next cue cannot be taken sends nothing at all, and says why', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page, { features: ['state'] });
  await production(page, CLIPS, {
    graphics: [{ name: 'Strap' }],
    playback: { ALPHA: { fadeIn: 'short' } },
    folders: [{ labels: ['Strap', 'ALPHA'], name: 'Item' }],
  });
  await holdFolder(page, 'Item');
  await page.keyboard.press(' ');
  await expect(cue(page, 'Strap').getByTestId('cue-up-here')).toBeVisible();
  // ALPHA fades in, which this Bridge cannot do: the step is off, and Strap stays up.
  await expect(page.getByTestId('verb-take')).toBeDisabled();
  await expect(page.getByTestId('folder-take-blocked')).toContainText('Update NoaCG Bridge');
  await page.keyboard.press(' ');
  await expect(page.getByTestId('production-note')).toContainText('Take was not sent');
  await expect(cue(page, 'Strap').getByTestId('cue-up-here')).toBeVisible();
  expect(sent(fake)).toEqual([]);
});

test('Out while a step is still being sent takes what lands back off, and the folder starts again from the top', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await production(page, TOGETHER_MEDIA, { graphics: [{ name: 'Strap' }], folders: [{ labels: ['Strap', 'VT'], name: 'Item' }] });
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  fake.gate = (a) => (a.verb === 'take' && a.slot.layer === 10 ? held : undefined);
  await holdFolder(page, 'Item');
  await page.keyboard.press(' ');
  await expect(cue(page, 'Strap').getByTestId('cue-up-here')).toBeVisible();
  await expect(page.getByTestId('verb-take')).toBeEnabled();
  // VT's take waits on the server; 0 comes before it lands.
  await page.keyboard.press(' ');
  await expect.poll(() => sent(fake)).toEqual(['take 2-10 VT']);
  await page.keyboard.press('0');
  release();
  await expect.poll(() => sent(fake)).toEqual(['take 2-10 VT', 'out 2-10']);
  await expect(cue(page, 'VT')).not.toContainText('ON AIR');
  await expect(cue(page, 'Strap').getByTestId('cue-up-here')).toHaveCount(0);
  await expect(page.getByTestId('preview-what')).toHaveText('Strap · next in Item');
});

test('0 sends a folder under way back to the top even when nothing of it is up any more', async ({ page }) => {
  await production(page, [], {
    graphics: [{ name: 'Strap A' }, { name: 'Strap B' }, { name: 'Strap C' }],
    folders: [{ labels: ['Strap A', 'Strap B', 'Strap C'], name: 'Straps' }],
  });
  await holdFolder(page, 'Straps');
  await page.keyboard.press(' ');
  await page.keyboard.press(' ');
  await expect(cue(page, 'Strap B').getByTestId('cue-up-here')).toBeVisible();
  // Strap B taken off on its own row: nothing of the folder is up, and it still stands after B.
  await selectCue(page, 'Strap B');
  await parkFocusOffControls(page);
  await page.keyboard.press('0');
  await expect(cue(page, 'Strap B').getByTestId('cue-up-here')).toHaveCount(0);
  await holdFolder(page, 'Straps');
  await expect(page.getByTestId('preview-what')).toHaveText('Strap C · next in Straps');
  await expect(page.getByTestId('verb-out')).toBeEnabled();
  await page.keyboard.press('0');
  await expect(page.getByTestId('preview-what')).toHaveText('Strap A · next in Straps');
  await expect(page.getByTestId('verb-out')).toBeDisabled();
});

test('a step whose next cue has lost its graphic takes nothing off, and says why', async ({ page }) => {
  await production(page, [], {
    graphics: [{ name: 'Strap A' }, { name: 'Strap B' }],
    folders: [{ labels: ['Strap A', 'Strap B'], name: 'Straps' }],
  });
  // A teammate's save took Strap B's graphic away and left its cue: a record the page can be handed.
  await evaluateInPage(page, async () => {
    const m = await import('/src/model/shows.ts');
    const show = m.loadShows().find((s) => s.name === 'Evening News')!;
    m.upsertShow({ ...show, graphics: show.graphics.filter((g) => g.name !== 'Strap B'), updatedAt: new Date().toISOString() });
  });
  await settleDurableWrites(page);
  await page.reload();
  await holdFolder(page, 'Straps');
  await page.keyboard.press(' ');
  await expect(cue(page, 'Strap A').getByTestId('cue-up-here')).toBeVisible();
  await expect(page.getByTestId('verb-take')).toBeDisabled();
  await expect(page.getByTestId('verb-take')).toHaveAttribute('title', 'Strap B points at a graphic this production no longer has.');
  await page.keyboard.press(' ');
  await expect(page.getByTestId('production-note')).toHaveText('Take was not sent: Strap B points at a graphic this production no longer has.');
  await expect(cue(page, 'Strap A').getByTestId('cue-up-here')).toBeVisible();
});

test('All out stops what plays on the rundown\'s slots after a Bridge restart, which no cue can name any more', async ({ page }) => {
  // docs/CLIP_PLAYBACK_PLAN.md §20.1: the panic control clears everything on this production's air.
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await production(page, CLIPS);
  await selectCue(page, 'ALPHA');
  await expect(page.getByTestId('playout-cue-status')).toHaveAttribute('data-state', 'ok');
  await page.getByTestId('verb-take').click();
  await expect(cue(page, 'ALPHA')).toContainText('ON AIR');
  fake.restart();
  await expect(page.getByTestId('server-unidentified')).toContainText('Unidentified item on 2-10', { timeout: 10_000 });
  await expect(cue(page, 'ALPHA')).not.toContainText('ON AIR');
  await expect(page.getByTestId('verb-out-all')).toBeEnabled();
  await page.getByTestId('verb-out-all').click();
  await expect(page.getByTestId('server-unidentified')).toHaveCount(0, { timeout: 10_000 });
  expect(sent(fake)).toEqual(['take 2-10 ALPHA', 'out 2-10']);
  await expect(page.getByTestId('verb-out-all')).toBeDisabled();
});

// ── Play through ──────────────────────────────────────────────────────────────────────────────

async function throughFolder(page: Page): Promise<void> {
  await folderOf(page, 'ALPHA', 'CHARLIE');
  await folder(page, 'Folder 1').getByTestId('select-folder').click();
  // Offered once the Bridge has said it can play one file after another.
  await expect(page.getByTestId('folder-mode-through')).toBeEnabled();
  await page.getByTestId('folder-mode-through').click();
  await expect(page.getByTestId('folder-mode-through')).toHaveAttribute('aria-checked', 'true');
}

test('Play through: one Take sends one sequence on the folder slot, ON AIR follows it, and Out stops it', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await production(page, CLIPS);
  await throughFolder(page);
  await expect(page.getByTestId('folder-slot-summary')).toHaveText('2 · Inserts · layer 10, the default for new media');
  await expect(folder(page, 'Folder 1').getByTestId('folder-slot')).toHaveText('2-10');
  // Each clip before the last plays the next by the folder's rule, and says so on its row.
  await expect(cue(page, 'ALPHA').getByRole('img', { name: 'Plays the next, set by the folder' })).toBeVisible();
  await expect(cue(page, 'CHARLIE').getByRole('img', { name: 'Plays the next, set by the folder' })).toHaveCount(0);

  await parkFocusOffControls(page);
  await page.keyboard.press(' ');
  await expect(cue(page, 'ALPHA')).toContainText('ON AIR');
  expect(fake.actions).toHaveLength(1);
  const action = fake.actions[0] as { verb: string; slot: unknown; entries: { item: { name: string } }[]; loop?: unknown };
  expect(action.verb).toBe('sequence');
  expect(action.slot).toEqual({ adapter: 'casparcg', channel: 2, layer: 10 });
  expect(action.entries.map((e) => e.item.name)).toEqual(['ALPHA', 'BRAVO', 'CHARLIE']);
  expect(action.loop).toBeUndefined();
  await expect(folder(page, 'Folder 1').getByTestId('folder-air')).toHaveText('ON AIR');

  // The server moves on by itself; ON AIR follows it down the folder.
  fake.skew += 10_500;
  await expect(cue(page, 'BRAVO')).toContainText('ON AIR', { timeout: 10_000 });
  await expect(cue(page, 'ALPHA')).not.toContainText('ON AIR');

  // Out on the header takes the folder off - its slot, and nothing else.
  await folder(page, 'Folder 1').getByTestId('select-folder').click();
  await page.getByTestId('verb-out').click();
  await expect(cue(page, 'BRAVO')).not.toContainText('ON AIR');
  expect(fake.actions.map((a) => `${a.verb} ${a.slot.channel}-${a.slot.layer}`)).toEqual(['sequence 2-10', 'out 2-10']);
});

test('Play through from a clip in it plays from there to the end, and the clip panel says the folder decides', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await production(page, CLIPS);
  await throughFolder(page);

  await selectCue(page, 'ALPHA');
  await expect(page.getByTestId('clip-end-folder')).toHaveText('→ Plays the next, set by the folder');
  await expect(page.getByTestId('playout-cue-where')).toContainText('the slot of Folder 1');
  // The last clip keeps its own ending, but never Play next: it would leave the folder.
  await selectCue(page, 'CHARLIE');
  await expect(page.getByTestId('clip-end-next')).toHaveCount(0);
  await expect(page.getByTestId('clip-end-hold')).toBeVisible();
  await expect(page.getByTestId('clip-end-loop')).toBeVisible();

  await selectCue(page, 'BRAVO');
  await page.getByTestId('verb-take').click();
  await expect(cue(page, 'BRAVO')).toContainText('ON AIR');
  const action = fake.actions[0] as { verb: string; entries: { item: { name: string } }[] };
  expect(action.verb).toBe('sequence');
  expect(action.entries.map((e) => e.item.name)).toEqual(['BRAVO', 'CHARLIE']);
});

test('Loop the folder is offered only by a Bridge that can loop a sequence, and its Take starts it over after the last clip', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await production(page, CLIPS);
  await throughFolder(page);
  // Bridge 0.5.0 would drop a loop it does not know: the choice is off, and says why.
  await expect(page.getByTestId('folder-end-loop')).toBeDisabled();
  await expect(page.getByTestId('folder-end-loop')).toHaveAttribute('title', /NoaCG Bridge/);

  fake.features = ['state', 'playback', 'sequence', 'sequence-loop'];
  fake.version = '0.6.0';
  await page.reload();
  await folder(page, 'Folder 1').getByTestId('select-folder').click();
  await expect(page.getByTestId('folder-end-loop')).toBeEnabled({ timeout: 10_000 });
  await page.getByTestId('folder-end-loop').click();
  await expect(page.getByTestId('folder-end-hint')).toHaveText('Starts over after CHARLIE, until Out');
  await expect(folder(page, 'Folder 1').getByTestId('folder-loop')).toBeVisible();
  await expect(cue(page, 'CHARLIE').getByRole('img', { name: 'Starts the folder over, set by the folder' })).toBeVisible();

  await parkFocusOffControls(page);
  await page.keyboard.press(' ');
  await expect(cue(page, 'ALPHA')).toContainText('ON AIR');
  const action = fake.actions[0] as { verb: string; entries: { item: { name: string } }[]; loop?: unknown };
  expect(action.verb).toBe('sequence');
  expect(action.loop).toBe(true);
  expect(action.entries.map((e) => e.item.name)).toEqual(['ALPHA', 'BRAVO', 'CHARLIE']);

  // Round again after the last clip.
  fake.skew += 30_500;
  await expect(cue(page, 'ALPHA')).toContainText('ON AIR', { timeout: 10_000 });
  fake.skew += 10_000;
  await expect(cue(page, 'BRAVO')).toContainText('ON AIR', { timeout: 10_000 });
});

// ── All together ──────────────────────────────────────────────────────────────────────────────

test('All together: one Take starts every cue in it, a refused one is NOT TAKEN with why, and Out takes all of it off', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await production(page, [
    { name: 'OPENER', mediaKind: 'movie', frames: 250, fps: 25 },
    { name: 'STING', mediaKind: 'audio', frames: 250, fps: 25 },
  ]);
  await folderOf(page, 'Hairline', 'STING');
  await folder(page, 'Folder 1').getByTestId('select-folder').click();
  await page.getByTestId('folder-mode-together').click();
  await expect(page.getByTestId('preview-what')).toContainText('first in Folder 1');

  await parkFocusOffControls(page);
  await page.keyboard.press(' ');
  await expect(cue(page, 'Hairline').getByTestId('cue-up-here')).toBeVisible();
  await expect(cue(page, 'OPENER')).toContainText('ON AIR');
  await expect(cue(page, 'STING')).toContainText('ON AIR');
  await expect(folder(page, 'Folder 1').getByTestId('folder-air')).toHaveText('ON AIR');
  // The server cues first, in rundown order, then the graphics.
  expect(fake.actions.map((a) => `${a.verb} ${a.slot.channel}-${a.slot.layer}`)).toEqual(['take 2-10', 'take 2-5']);

  // Out on the header: all of it, each with its own fade out, and nothing outside it.
  await page.getByTestId('verb-out').click();
  await expect(cue(page, 'Hairline').getByTestId('cue-up-here')).toHaveCount(0);
  await expect(cue(page, 'OPENER')).not.toContainText('ON AIR');
  await expect(cue(page, 'STING')).not.toContainText('ON AIR');
  expect(fake.actions.slice(2).map((a) => `${a.verb} ${a.slot.channel}-${a.slot.layer}`)).toEqual(['out 2-10', 'out 2-5']);

  // The server refuses the sting: the rest goes up, and the sting says why on its own row.
  fake.refuse = (a) => (a.verb === 'take' && a.slot.layer === 5 ? 'File not found' : null);
  await parkFocusOffControls(page);
  await page.keyboard.press(' ');
  await expect(cue(page, 'OPENER')).toContainText('ON AIR');
  await expect(cue(page, 'STING').getByTestId('cue-take-miss')).toHaveText('NOT TAKEN');
  await expect(folder(page, 'Folder 1').getByTestId('folder-air')).toHaveText('2 OF 3 ON AIR');
  await expect(page.getByTestId('production-note')).toContainText('STING');
});

// ── The rundown, seeded ───────────────────────────────────────────────────────────────────────

test('a range over a collapsed header takes the whole folder, and a folder made from a member lands after its old one', async ({ page }) => {
  await production(page, CLIPS, { folders: [{ labels: ['ALPHA', 'BRAVO'], collapsed: true }] });
  await expect.poll(() => drawn(page)).toEqual(['Hairline', '[Folder 1]', 'CHARLIE']);
  await selectCue(page, 'Hairline');
  await selectCue(page, 'CHARLIE', true);
  // The collapsed header stands for its hidden cues: 4 in the range, and the new folder takes them,
  // so the old one is gone and its name is free again.
  await expect(page.getByTestId('range-count')).toHaveText('4 selected');
  await page.getByTestId('new-folder').click();
  await expect.poll(() => drawn(page)).toEqual(['[Folder 1]', '  Hairline', '  ALPHA', '  BRAVO', '  CHARLIE']);

  // A folder from a member: it leaves its folder and lands right after it, one past the highest name.
  await cue(page, 'ALPHA').getByTestId('cue-menu').click();
  await page.getByTestId('cue-new-folder').click();
  await expect.poll(() => drawn(page)).toEqual(['[Folder 1]', '  Hairline', '  BRAVO', '  CHARLIE', '[Folder 2]', '  ALPHA']);
});

test('a pointer in the gap between rows keeps its aim, and a folder dragged onto another folder lands beside it', async ({ page }) => {
  await production(page, CLIPS, { folders: [{ labels: ['Hairline', 'ALPHA'] }, { labels: ['BRAVO', 'CHARLIE'] }] });
  await expect.poll(() => drawn(page)).toEqual(['[Folder 1]', '  Hairline', '  ALPHA', '[Folder 2]', '  BRAVO', '  CHARLIE']);
  const writes = await countWrites(page);

  // Folder 1 down onto a member of Folder 2: after Folder 2, never inside it - and the line is drawn
  // there, under Folder 2's last cue, not on the row under the pointer.
  await pickUp(page, folder(page, 'Folder 1'));
  await aimAt(page, cue(page, 'BRAVO'), 'middle');
  await expect(cue(page, 'CHARLIE')).toHaveAttribute('data-drop', 'after');
  await expect(cue(page, 'CHARLIE')).toHaveAttribute('data-drop-inside', 'false');
  await expect(cue(page, 'BRAVO')).not.toHaveAttribute('data-drop');
  await page.mouse.up();
  await expect.poll(() => drawn(page)).toEqual(['[Folder 2]', '  BRAVO', '  CHARLIE', '[Folder 1]', '  Hairline', '  ALPHA']);
  // And onto Folder 2's header, top third: before it.
  await drag(page, folder(page, 'Folder 1'), folder(page, 'Folder 2'), 'top');
  await expect.poll(() => drawn(page)).toEqual(['[Folder 1]', '  Hairline', '  ALPHA', '[Folder 2]', '  BRAVO', '  CHARLIE']);
  expect(await writes()).toBe(2);

  // Aimed at BRAVO, then resting in the 3px gap under it: the aim stays on BRAVO, the end strip is
  // never the aim, and letting go there lands after BRAVO, not at the end.
  await pickUp(page, cue(page, 'Hairline'));
  await aimAt(page, cue(page, 'BRAVO'), 'bottom');
  await expect(cue(page, 'BRAVO')).toHaveAttribute('data-drop', 'after');
  const bravo = (await cue(page, 'BRAVO').boundingBox())!;
  await page.mouse.move(bravo.x + bravo.width / 2, bravo.y + bravo.height + 1.5, { steps: 2 });
  await page.mouse.move(bravo.x + bravo.width / 2 + 1, bravo.y + bravo.height + 1.5);
  await expect(page.getByTestId('rundown-drop-end')).not.toHaveAttribute('data-drop');
  await page.mouse.up();
  await expect.poll(() => drawn(page)).toEqual(['[Folder 1]', '  ALPHA', '[Folder 2]', '  BRAVO', '  Hairline', '  CHARLIE']);
  expect(await writes()).toBe(3);
});

test('a graphic cannot be moved into a Play-through folder from its menu either; a clip can', async ({ page }) => {
  await seedSettings(page);
  await fakeBridge(page);
  await production(page, CLIPS, { folders: [{ labels: ['ALPHA', 'BRAVO'], mode: 'through' }] });
  await cue(page, 'Hairline').getByTestId('cue-menu').click();
  const into = page.getByTestId('cue-into-folder');
  await expect(into).toBeDisabled();
  await expect(into).toHaveAttribute('title', /Hairline is a graphic/);
  await page.keyboard.press('Escape');
  await cue(page, 'CHARLIE').getByTestId('cue-menu').click();
  await expect(page.getByTestId('cue-into-folder')).toBeEnabled();
  await page.getByTestId('cue-into-folder').click();
  await expect.poll(() => drawn(page)).toEqual(['Hairline', '[Folder 1]', '  ALPHA', '  BRAVO', '  CHARLIE']);
});

test('the cursor in a folder that collapses: the header holds it, SPACE takes the cue, the next arrow leaves the folder', async ({ page }) => {
  await production(page, CLIPS, { folders: [{ labels: ['Hairline', 'ALPHA'] }] });
  await selectCue(page, 'Hairline');
  await folder(page, 'Folder 1').getByTestId('folder-toggle').click();
  await expect(folder(page, 'Folder 1')).toHaveClass(/holds-cursor/);
  await expect(folder(page, 'Folder 1')).not.toHaveClass(/selected/);
  await parkFocusOffControls(page);
  await page.keyboard.press(' ');
  // The hidden cue went up, and the collapsed header carries its tally.
  await expect(folder(page, 'Folder 1')).toHaveClass(/on-air/);
  await expect(folder(page, 'Folder 1').getByTestId('folder-air')).toHaveText('1 ON AIR');
  await page.keyboard.press('ArrowDown');
  await expect(cue(page, 'BRAVO').getByTestId('select-cue')).toHaveAttribute('aria-current', 'true');
});

test('Remove folder while its header is held: the cues keep their order and lose their indent, the cursor goes to its first cue, nothing airs', async ({ page }) => {
  await production(page, CLIPS, { folders: [{ labels: ['ALPHA', 'BRAVO'] }] });
  await holdFolder(page, 'Folder 1');
  await folder(page, 'Folder 1').getByTestId('folder-menu').click();
  await page.getByTestId('remove-folder').click();
  await expect.poll(() => drawn(page)).toEqual(['Hairline', 'ALPHA', 'BRAVO', 'CHARLIE']);
  await expect(cue(page, 'ALPHA').getByTestId('select-cue')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('folder-editor')).toHaveCount(0);
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
});

test('§18 cases 20 and 21: an orphan folderId and an empty folder draw no header; a split folder shows (continued) and the next drag gathers it', async ({ page }) => {
  await production(page, CLIPS);
  // A record as an older build or a merge could leave it: A(F) B C(F), a folder no cue names, and a
  // cue naming a folder that does not exist.
  await evaluateInPage(page, async () => {
    const m = await import('/src/model/shows.ts');
    const show = structuredClone(m.loadShows().find((s) => s.name === 'Evening News')!);
    const [h, a, b, c] = show.cues!;
    show.folders = [
      { id: 'F', name: 'Block A', mode: 'manual' },
      { id: 'EMPTY', name: 'Nobody', mode: 'manual' },
    ];
    show.cues = [{ ...h, folderId: 'GONE' }, { ...a, folderId: 'F' }, b, { ...c, folderId: 'F' }];
    m.upsertShow(show);
  });
  await settleDurableWrites(page);
  await page.reload();
  await expect.poll(() => drawn(page)).toEqual(['Hairline', '[Block A]', '  ALPHA', 'BRAVO', '[Block A]', '  CHARLIE']);
  await expect(list(page).locator('.pd-folder-cont')).toHaveCount(1);
  await expect(folder(page, 'Block A').nth(1)).toContainText('(continued)');
  await expect(list(page).locator('.pd-folder', { hasText: 'Nobody' })).toHaveCount(0);

  // The (continued) header is a stop for the keys and can be held.
  await selectCue(page, 'BRAVO');
  await parkFocusOffControls(page);
  await page.keyboard.press('ArrowDown');
  await expect(folder(page, 'Block A').nth(1)).toHaveClass(/selected/);

  // The next move gathers it, in one write.
  const writes = await countWrites(page);
  await drag(page, cue(page, 'Hairline'), cue(page, 'BRAVO'), 'bottom');
  await expect.poll(() => drawn(page)).toEqual(['[Block A]', '  ALPHA', '  CHARLIE', 'BRAVO', 'Hairline']);
  expect(await writes()).toBe(1);
});

test('a folder write that does not land - a drag, Remove folder - is said, and the rundown keeps what was saved', async ({ page }) => {
  await armStorageFailure(page);
  await production(page, CLIPS, { folders: [{ labels: ['ALPHA', 'BRAVO'] }] });
  await fillStorage(page);
  await drag(page, cue(page, 'CHARLIE'), cue(page, 'BRAVO'), 'bottom');
  await expect(page.getByTestId('rundown-note')).toContainText('The move was not saved');
  await expect.poll(() => drawn(page)).toEqual(['Hairline', '[Folder 1]', '  ALPHA', '  BRAVO', 'CHARLIE']);
  await folder(page, 'Folder 1').getByTestId('folder-menu').click();
  await page.getByTestId('remove-folder').click();
  await expect(page.getByTestId('rundown-note')).toContainText('The folder was not removed');
  await expect.poll(() => drawn(page)).toEqual(['Hairline', '[Folder 1]', '  ALPHA', '  BRAVO', 'CHARLIE']);
  // The claimed failure is the note's alone: no second, general storage dialog.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await freeStorage(page);
});

test('a duplicate of a cue in no folder goes right after it', async ({ page }) => {
  await production(page, CLIPS);
  await cue(page, 'ALPHA').getByTestId('cue-menu').click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect.poll(() => drawn(page)).toEqual(['Hairline', 'ALPHA', 'ALPHA copy', 'BRAVO', 'CHARLIE']);
});

test('the list follows the air into a collapsed folder: its header comes into view, and it stays collapsed', async ({ page }) => {
  await seedSettings(page);
  await fakeBridge(page);
  const many = Array.from({ length: 24 }, (_, i) => ({ name: `FILLER_${String(i + 1).padStart(2, '0')}`, mediaKind: 'movie', frames: 250, fps: 25 }));
  await production(page, [...many, ...CLIPS], { folders: [{ labels: ['ALPHA', 'BRAVO', 'CHARLIE'], mode: 'through', collapsed: true }] });
  const header = folder(page, 'Folder 1');
  // Hold the header by the keys, then scroll it away without a hand on the list (a wheel would hold
  // the list still for ten seconds).
  await selectCue(page, 'FILLER_24');
  await parkFocusOffControls(page);
  await page.keyboard.press('ArrowDown');
  await expect(header).toHaveClass(/selected/);
  await list(page).evaluate((l) => l.scrollTo({ top: 0 }));
  await expect(header).not.toBeInViewport();
  await page.keyboard.press(' ');
  await expect(header).toHaveClass(/on-air/);
  await expect(header).toBeInViewport();
  await expect(header.getByTestId('folder-toggle')).toHaveAttribute('aria-expanded', 'false');
});

// ── Play through, seeded ─────────────────────────────────────────────────────────────────────

const THROUGH_MEDIA = [
  { name: 'ALPHA', mediaKind: 'audio', frames: 250, fps: 25 },
  { name: 'BRAVO', mediaKind: 'movie', frames: 250, fps: 25 },
  { name: 'CHARLIE', mediaKind: 'movie', frames: 250, fps: 25 },
];

test('Play through: each clip gives up its own ending but the last, the sequence plays on the folder slot, and a new slot takes the next Take', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await production(page, THROUGH_MEDIA, {
    playback: {
      BRAVO: { end: 'clear', fadeOut: 'short', fadeIn: 'long' },
      CHARLIE: { end: 'clear', fadeOut: 'short' },
    },
    folders: [{ labels: ['ALPHA', 'BRAVO', 'CHARLIE'], mode: 'through' }],
  });
  await holdFolder(page, 'Folder 1');
  await expect(page.getByTestId('verb-take')).toBeEnabled();
  await page.keyboard.press(' ');
  await expect(cue(page, 'ALPHA')).toContainText('ON AIR');
  expect(sent(fake)).toEqual(['sequence 2-10 ALPHA,BRAVO,CHARLIE']);
  const entries = fake.actions[0].entries as { playback?: Record<string, unknown> }[];
  // The audio file plays on the folder's slot like the rest; BRAVO keeps only its fade in; CHARLIE,
  // the last, keeps its own ending with its fade out.
  expect(entries[1].playback).toEqual({ fadeIn: 1 });
  expect(entries[2].playback).toMatchObject({ end: 'clear', fadeOut: 0.5 });
  await page.getByTestId('verb-out').click();
  await expect(cue(page, 'ALPHA')).not.toContainText('ON AIR');

  // Layer 12: the next Take plays there; the clip default puts it back.
  await page.getByTestId('folder-layer').fill('12');
  await expect(page.getByTestId('folder-slot-summary')).toContainText('layer 12, set for this folder');
  await parkFocusOffControls(page);
  await page.keyboard.press(' ');
  await expect(cue(page, 'ALPHA')).toContainText('ON AIR');
  await page.getByTestId('verb-out').click();
  await expect(cue(page, 'ALPHA')).not.toContainText('ON AIR');
  await page.getByTestId('folder-slot-default').click();
  await expect(page.getByTestId('folder-slot-summary')).toContainText('layer 10, the default for new media');
  expect(sent(fake)).toEqual(['sequence 2-10 ALPHA,BRAVO,CHARLIE', 'out 2-10', 'sequence 2-12 ALPHA,BRAVO,CHARLIE', 'out 2-12']);
});

test('Play through with Loop the folder from a clip in it: the rotation, and the selection stays', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page, { features: ['state', 'playback', 'sequence', 'sequence-loop'], version: '0.6.0' });
  await production(page, CLIPS, { folders: [{ labels: ['ALPHA', 'BRAVO', 'CHARLIE'], mode: 'through', end: 'loop' }] });
  await selectCue(page, 'BRAVO');
  await expect(page.getByTestId('playout-cue-status')).toHaveAttribute('data-state', 'ok');
  await parkFocusOffControls(page);
  await page.keyboard.press(' ');
  await expect(cue(page, 'BRAVO')).toContainText('ON AIR');
  expect(sent(fake)).toEqual(['sequence 2-10 BRAVO,CHARLIE,ALPHA loop']);
  await expect(cue(page, 'BRAVO').getByTestId('select-cue')).toHaveAttribute('aria-current', 'true');
  // The clock says it never ends by itself.
  await expect(page.getByTestId('clip-clock')).toHaveAttribute('data-phase', 'looping');
  await expect(page.getByTestId('clip-clock-then')).toContainText('loops until Out');
});

test('a one-clip Play-through folder sends a plain take on its slot, with the server loop when it loops, on any Bridge', async ({ page }) => {
  await seedSettings(page);
  // Bridge 0.5.0, which cannot loop a sequence: one clip that loops is a plain looping take, so
  // Loop the folder is offered all the same.
  const fake = await fakeBridge(page);
  await production(page, CLIPS, { folders: [{ labels: ['BRAVO'], mode: 'through', layer: 12 }] });
  await holdFolder(page, 'Folder 1');
  await expect(page.getByTestId('folder-end-loop')).toBeEnabled();
  await page.getByTestId('folder-end-loop').click();
  await parkFocusOffControls(page);
  await expect(page.getByTestId('verb-take')).toBeEnabled();
  await page.keyboard.press(' ');
  await expect(cue(page, 'BRAVO')).toContainText('ON AIR');
  expect(sent(fake)).toEqual(['take 2-12 BRAVO loop']);
});

test("§18 case 12: a folder set to loop on a Bridge that cannot loop a sequence is not taken and says why; the last clip's own ending takes it", async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await production(page, CLIPS, { folders: [{ labels: ['ALPHA', 'BRAVO', 'CHARLIE'], mode: 'through', end: 'loop' }] });
  await holdFolder(page, 'Folder 1');
  await expect(page.getByTestId('folder-take-blocked')).toContainText('starts over after its last clip');
  await expect(page.getByTestId('verb-take')).toBeDisabled();
  await page.keyboard.press(' ');
  await expect(page.getByTestId('production-note')).toContainText('Take was not sent');
  // A member's Take says the same, and sends nothing either.
  await selectCue(page, 'BRAVO');
  await expect(page.getByTestId('playout-take-blocked')).toContainText('starts over after its last clip');
  expect(fake.actions).toEqual([]);

  await holdFolder(page, 'Folder 1');
  await expect(page.getByTestId('folder-end-loop')).toHaveAttribute('title', 'Update NoaCG Bridge to set this.');
  await page.getByTestId('folder-end-last').click();
  await expect(page.getByTestId('verb-take')).toBeEnabled();
  await parkFocusOffControls(page);
  await page.keyboard.press(' ');
  await expect(cue(page, 'ALPHA')).toContainText('ON AIR');
  expect(sent(fake)).toEqual(['sequence 2-10 ALPHA,BRAVO,CHARLIE']);
});

test('a Play-through folder is not taken on a server that cannot play one file after another, nor over a clip too short to queue', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page, { capabilities: ['state', 'end', 'fade', 'trim', 'level'] });
  await production(page, [...CLIPS, { name: 'BLIP', mediaKind: 'movie', frames: 37, fps: 25 }], {
    folders: [
      { labels: ['ALPHA', 'BRAVO'], mode: 'through' },
      { labels: ['CHARLIE', 'BLIP'], mode: 'through' },
    ],
  });
  await holdFolder(page, 'Folder 1');
  await expect(page.getByTestId('folder-take-blocked')).toHaveText(
    'This folder plays its clips one after another, which CasparCG 2.5.0 cannot do. To take it, set How it plays to One by one.',
  );
  await expect(page.getByTestId('verb-take')).toBeDisabled();
  await holdFolder(page, 'Folder 2');
  await expect(page.getByTestId('folder-take-blocked')).toContainText('BLIP');
  expect(fake.actions).toEqual([]);
});

test('one file never plays on two slots: another cue of a file up in a folder is refused, and a folder moved while it runs leaves its old slot first', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await production(page, THROUGH_MEDIA, { folders: [{ labels: ['ALPHA', 'BRAVO', 'CHARLIE'] }] });
  // ALPHA taken on its own in a One by one folder plays on its item's slot, 2-5.
  await selectCue(page, 'ALPHA');
  await expect(page.getByTestId('playout-cue-status')).toHaveAttribute('data-state', 'ok');
  await page.getByTestId('verb-take').click();
  await expect(cue(page, 'ALPHA')).toContainText('ON AIR');
  // Made to play through with ALPHA up, the folder is up: SPACE on it takes ALPHA off, and SPACE again
  // plays the folder on its own slot.
  await holdFolder(page, 'Folder 1');
  await page.getByTestId('folder-mode-through').click();
  await expect(page.getByTestId('verb-take')).toContainText('TAKE OFF');
  await parkFocusOffControls(page);
  await page.keyboard.press(' ');
  await expect(cue(page, 'ALPHA')).not.toContainText('ON AIR');
  await page.keyboard.press(' ');
  await expect(cue(page, 'ALPHA')).toContainText('ON AIR');
  expect(sent(fake)).toEqual(['take 2-5 ALPHA', 'out 2-5', 'sequence 2-10 ALPHA,BRAVO,CHARLIE']);

  // A second cue of the same file, outside the folder, would play it on 2-5 while the folder has it
  // up on 2-10: refused, naming where it is.
  await cue(page, 'ALPHA').getByTestId('cue-menu').click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await cue(page, 'ALPHA copy').getByTestId('cue-menu').click();
  await page.getByTestId('cue-out-of-folder').click();
  await expect.poll(() => drawn(page)).toEqual(['Hairline', '[Folder 1]', '  ALPHA', '  BRAVO', '  CHARLIE', 'ALPHA copy']);
  await selectCue(page, 'ALPHA copy');
  await expect(page.getByTestId('playout-take-blocked')).toHaveText('ALPHA is up on 2-10. Take it off there first.');
  await expect(page.getByTestId('verb-take')).toBeDisabled();

  // Moved to 2-12 while it runs, a re-take from a clip in it clears 2-10 first.
  await holdFolder(page, 'Folder 1');
  await page.getByTestId('folder-layer').fill('12');
  await selectCue(page, 'BRAVO');
  await page.getByTestId('verb-take').click();
  await expect(cue(page, 'BRAVO')).toContainText('ON AIR');
  expect(sent(fake).slice(3)).toEqual(['out 2-10', 'sequence 2-12 BRAVO,CHARLIE']);
});

test('a Bridge restart mid-loop says the folder stopped, by its name', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page, { features: ['state', 'playback', 'sequence', 'sequence-loop'], version: '0.6.0' });
  await production(page, CLIPS, { folders: [{ labels: ['ALPHA', 'BRAVO', 'CHARLIE'], name: 'Block A', mode: 'through', end: 'loop' }] });
  await holdFolder(page, 'Block A');
  await expect(page.getByTestId('verb-take')).toBeEnabled();
  await page.keyboard.press(' ');
  await expect(cue(page, 'ALPHA')).toContainText('ON AIR');
  fake.restart();
  await expect(page.getByTestId('server-sequence-stopped')).toHaveText('Block A stopped: NoaCG Bridge restarted', { timeout: 10_000 });
});

// ── All together, seeded ─────────────────────────────────────────────────────────────────────

const TOGETHER_MEDIA = [
  { name: 'VT', mediaKind: 'movie', frames: 1500, fps: 25 },
  { name: 'BED', mediaKind: 'audio', frames: 500, fps: 25 },
];
/** Hold BED's take on its way to the server until the returned function is called. */
function holdBed(fake: Awaited<ReturnType<typeof fakeBridge>>): () => void {
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  fake.gate = (a) => (a.verb === 'take' && a.slot.layer === 5 ? held : undefined);
  return () => release();
}

test('All together: server cues first, then the graphics; the clock follows the longest file; the header stays held', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await production(page, TOGETHER_MEDIA, {
    graphics: [{ name: 'Strap' }],
    folders: [{ labels: ['VT', 'BED', 'Strap'], name: 'Opening', mode: 'together' }],
  });
  await holdFolder(page, 'Opening');
  await expect(page.getByTestId('verb-take')).toBeEnabled();
  const release = holdBed(fake);
  await page.keyboard.press(' ');
  await expect(cue(page, 'VT')).toContainText('ON AIR');
  // BED is held on its way: the graphic after it is not up yet, and the folder counts as up.
  await expect(cue(page, 'Strap').getByTestId('cue-up-here')).toHaveCount(0);
  await expect(page.getByTestId('verb-take')).toContainText('TAKE OFF');
  release();
  await expect(cue(page, 'Strap').getByTestId('cue-up-here')).toBeVisible();
  await expect(cue(page, 'BED')).toContainText('ON AIR');
  await expect(folder(page, 'Opening').getByTestId('folder-air')).toHaveText('ON AIR');
  await expect(page.getByTestId('production-note')).toHaveText('✓ Take: Opening, 3 of 3 on air');
  expect(sent(fake)).toEqual(['take 2-10 VT', 'take 2-5 BED']);
  await expect(page.getByTestId('clip-clock')).toHaveAttribute('aria-label', /^VT on 2-10/);
  await expect(folder(page, 'Opening')).toHaveClass(/selected/);
});

test('All together, refused before anything is sent: two cues on one slot, a Play-next member, two cues of one graphic', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await production(page, [...TOGETHER_MEDIA, { name: 'VT2', mediaKind: 'movie', frames: 250, fps: 25 }], {
    playback: { BED: { end: 'next' } },
    folders: [
      { labels: ['VT', 'VT2'], name: 'Two clips', mode: 'together' },
      { labels: ['BED'], name: 'Chained', mode: 'together' },
    ],
  });
  await holdFolder(page, 'Two clips');
  await expect(page.getByTestId('verb-take')).toHaveAttribute(
    'title',
    'VT and VT2 both play on 2-10, which holds one thing at a time. Move one of them to another layer to take this folder.',
  );
  await expect(page.getByTestId('verb-take')).toBeDisabled();
  await page.keyboard.press(' ');
  await expect(page.getByTestId('production-note')).toContainText('Take was not sent: VT and VT2 both play on 2-10');
  await holdFolder(page, 'Chained');
  await expect(page.getByTestId('verb-take')).toHaveAttribute('title', /^BED: /);

  // Two cues of one graphic in one folder: Hairline and its duplicate, right after it.
  await cue(page, 'Hairline').getByTestId('cue-menu').click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await selectCue(page, 'Hairline copy');
  await cue(page, 'Hairline').first().getByTestId('select-cue').click({ modifiers: ['Shift'] });
  await page.getByTestId('new-folder').click();
  await holdFolder(page, 'Folder 1');
  await page.getByTestId('folder-mode-together').click();
  await expect(page.getByTestId('verb-take')).toHaveAttribute('title', /are both cues of Hairline, which shows one cue at a time/);
  expect(fake.actions).toEqual([]);
});

test('All together with no Bridge set up: a folder with a server cue waits with the reason; a graphics-only folder takes', async ({ page }) => {
  await production(page, TOGETHER_MEDIA, {
    graphics: [{ name: 'Strap' }],
    folders: [
      { labels: ['VT', 'Hairline'], name: 'With clip', mode: 'together' },
      { labels: ['Strap'], name: 'Graphics', mode: 'together' },
    ],
  });
  await holdFolder(page, 'With clip');
  await expect(page.getByTestId('verb-take')).toBeDisabled();
  await expect(page.getByTestId('verb-take')).toHaveAttribute('title', 'VT plays on the playout server, and NoaCG Bridge is not connected.');
  await holdFolder(page, 'Graphics');
  await page.keyboard.press(' ');
  await expect(cue(page, 'Strap').getByTestId('cue-up-here')).toBeVisible();
  await expect(page.getByTestId('verb-out-all')).toBeEnabled();
  await page.keyboard.press('0');
  await expect(cue(page, 'Strap').getByTestId('cue-up-here')).toHaveCount(0);
});

test("Out on a folder uses each clip's own fade out; All out cuts, as it always did", async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await production(page, TOGETHER_MEDIA, {
    graphics: [{ name: 'Strap' }],
    playback: { VT: { fadeOut: 'short' } },
    folders: [{ labels: ['VT', 'BED', 'Strap'], name: 'Opening', mode: 'together' }],
  });
  await holdFolder(page, 'Opening');
  await expect(page.getByTestId('verb-take')).toBeEnabled();
  await page.keyboard.press(' ');
  await expect(cue(page, 'Strap').getByTestId('cue-up-here')).toBeVisible();
  await page.keyboard.press('0');
  await expect(cue(page, 'Strap').getByTestId('cue-up-here')).toHaveCount(0);
  await expect(page.getByTestId('verb-out-all')).toBeDisabled();
  const outs = () => fake.actions.filter((a) => a.verb === 'out').map((a) => `${a.slot.layer} ${a.fadeOut ?? 'cut'}`);
  expect(outs()).toEqual(['10 0.5', '5 cut']);

  await page.keyboard.press(' ');
  await expect(cue(page, 'Strap').getByTestId('cue-up-here')).toBeVisible();
  await expect(page.getByTestId('verb-out-all')).toBeEnabled();
  await page.getByTestId('verb-out-all').click();
  await expect(cue(page, 'Strap').getByTestId('cue-up-here')).toHaveCount(0);
  await expect(cue(page, 'VT')).not.toContainText('ON AIR');
  expect(outs()).toEqual(['10 0.5', '5 cut', '10 cut', '5 cut']);
  await expect(page.getByTestId('verb-out-all')).toBeDisabled();
});

test('One by one: a cue in it airs as it would anywhere; Out on the header takes off only its own cues', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await production(page, TOGETHER_MEDIA, {
    graphics: [{ name: 'Strap' }],
    folders: [{ labels: ['VT', 'BED'], name: 'Pair' }],
  });
  await selectCue(page, 'VT');
  await expect(page.getByTestId('playout-cue-status')).toHaveAttribute('data-state', 'ok');
  await page.getByTestId('verb-take').click();
  await expect(cue(page, 'VT')).toContainText('ON AIR');
  await selectCue(page, 'BED');
  await page.getByTestId('verb-take').click();
  await expect(cue(page, 'BED')).toContainText('ON AIR');
  await selectCue(page, 'Strap');
  await page.getByTestId('verb-take').click();
  await expect(cue(page, 'Strap').getByTestId('cue-up-here')).toBeVisible();
  expect(sent(fake)).toEqual(['take 2-10 VT', 'take 2-5 BED']);
  await holdFolder(page, 'Pair');
  await expect(folder(page, 'Pair').getByTestId('folder-air')).toHaveText('2 ON AIR');
  await page.keyboard.press('0');
  await expect(cue(page, 'VT')).not.toContainText('ON AIR');
  await expect(cue(page, 'BED')).not.toContainText('ON AIR');
  await expect(cue(page, 'Strap').getByTestId('cue-up-here')).toBeVisible();
});

test('SPACE on a folder in preview-then-take mode takes it at once; a held SPACE takes each cue once, a held 0 takes each off once', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await production(page, TOGETHER_MEDIA, {
    graphics: [{ name: 'Strap' }],
    folders: [{ labels: ['VT', 'BED', 'Strap'], name: 'Opening', mode: 'together' }],
  });
  await page.getByTestId('space-mode').check();
  await holdFolder(page, 'Opening');
  await expect(page.getByTestId('verb-take')).toBeEnabled();
  const label = await page.getByTestId('preview-what').innerText();
  await expect(page.getByTestId('verb-take')).not.toContainText('PREVIEW');
  await page.keyboard.down(' ');
  await holdKeyRepeats(page, 8);
  await page.keyboard.up(' ');
  await expect(cue(page, 'Strap').getByTestId('cue-up-here')).toBeVisible();
  await expect(page.getByTestId('preview-what')).toHaveText(label);
  expect(sent(fake)).toEqual(['take 2-10 VT', 'take 2-5 BED']);
  await page.keyboard.down('0');
  await holdKeyRepeats(page, 8, 'Digit0', '0');
  await page.keyboard.up('0');
  await expect(cue(page, 'Strap').getByTestId('cue-up-here')).toHaveCount(0);
  expect(sent(fake).slice(2)).toEqual(['out 2-10', 'out 2-5']);
});

test('Out while an All-together Take is still sending stops the rest: what lands after it goes back off, and nothing after that is sent', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await production(page, TOGETHER_MEDIA, {
    graphics: [{ name: 'Strap' }],
    folders: [{ labels: ['VT', 'BED', 'Strap'], name: 'Opening', mode: 'together' }],
  });
  await holdFolder(page, 'Opening');
  await expect(page.getByTestId('verb-take')).toBeEnabled();
  const release = holdBed(fake);
  await page.keyboard.press(' ');
  await expect(cue(page, 'VT')).toContainText('ON AIR');
  await expect(page.getByTestId('verb-out')).toBeEnabled();
  await page.keyboard.press('0');
  await expect(cue(page, 'VT')).not.toContainText('ON AIR');
  release();
  await expect.poll(() => sent(fake)).toEqual(['take 2-10 VT', 'take 2-5 BED', 'out 2-10', 'out 2-5']);
  await page.waitForTimeout(500);
  await expect(cue(page, 'Strap').locator('.pd-tag.up, .pd-tag.air')).toHaveCount(0);
  await expect(cue(page, 'BED')).not.toContainText('ON AIR');
});

test('All out while an All-together Take is still sending cuts what lands after it', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await production(page, TOGETHER_MEDIA, {
    graphics: [{ name: 'Strap' }],
    playback: { BED: { fadeOut: 'long' } },
    folders: [{ labels: ['VT', 'BED', 'Strap'], name: 'Opening', mode: 'together' }],
  });
  await holdFolder(page, 'Opening');
  await expect(page.getByTestId('verb-take')).toBeEnabled();
  const release = holdBed(fake);
  await page.keyboard.press(' ');
  await expect(cue(page, 'VT')).toContainText('ON AIR');
  await page.getByTestId('verb-out-all').click();
  await expect(cue(page, 'VT')).not.toContainText('ON AIR');
  release();
  await expect.poll(() => fake.actions.filter((a) => a.verb === 'out').map((a) => `${a.slot.layer} ${a.fadeOut ?? 'cut'}`)).toEqual(['10 cut', '5 cut']);
  await page.waitForTimeout(500);
  await expect(cue(page, 'Strap').locator('.pd-tag.up, .pd-tag.air')).toHaveCount(0);
});


// ── §18 case 22: every writer of the cue order keeps a folder whole ─────────────────────────────

test('§18 case 22: every writer of the rundown keeps each folder whole, and an append never lands in one', async ({ page }) => {
  await production(page, [...CLIPS, { name: 'DELTA', mediaKind: 'movie', frames: 250, fps: 25 }], {
    graphics: [{ name: 'Strap' }],
    folders: [{ labels: ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA'], name: 'Block' }],
  });
  const steps = await evaluateInPage(page, async () => {
    const m = await import('/src/model/shows.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const id = m.loadShows().find((s) => s.name === 'Evening News')!.id;
    const now = () => m.loadShows().find((s) => s.id === id)!;
    const cueOf = (label: string) => now().cues!.find((c) => c.label === label)!;
    /** The rundown as `Hairline [Block: ALPHA BRAVO]`, marked when the record is not whole: a folder
     *  in two runs, a cue naming no folder entry, or a folder entry no cue names. */
    const read = () => {
      const show = now();
      const names = new Map((show.folders ?? []).map((f) => [f.id, f.name] as const));
      const seen = new Set<string>();
      let text = '';
      let open: string | undefined;
      let whole = true;
      for (const c of show.cues ?? []) {
        if (c.folderId !== open) {
          if (open) text += ']';
          if (c.folderId) {
            if (seen.has(c.folderId) || !names.has(c.folderId)) whole = false;
            seen.add(c.folderId);
            text += ` [${names.get(c.folderId)}:`;
          }
          open = c.folderId;
        }
        text += ` ${c.label}`;
      }
      if (open) text += ']';
      for (const f of names.keys()) if (!seen.has(f)) whole = false;
      return `${text.trim()}${whole ? '' : '  (NOT WHOLE)'}`;
    };
    const out: Record<string, string> = { start: read() };
    // Choosing what a folder already has writes nothing.
    let writes = 0;
    window.addEventListener('spx-data-changed', () => (writes += 1));
    const fid = now().folders![0].id;
    m.setFolderPlayback(id, fid, { end: null, channel: null, layer: null });
    m.setFolderCollapsed(id, fid, false);
    m.renameFolder(id, fid, 'Block');
    m.setFolderMode(id, fid, 'manual');
    out.noop = `${writes} writes`;
    m.removeShowCue(id, cueOf('BRAVO').id);
    out.removeCue = read();
    // One step at the folder's edge steps out of it; one step onto it from outside steps over it.
    m.moveShowCue(id, cueOf('DELTA').id, 1);
    out.stepOut = read();
    m.moveShowCue(id, cueOf('Strap').id, 1);
    out.stepOver = read();
    m.moveShowCue(id, cueOf('DELTA').id, -1);
    m.moveShowCue(id, cueOf('DELTA').id, -1);
    m.moveShowCue(id, cueOf('Strap').id, -1);
    out.folderLast = read();
    // Appends with the folder last in the rundown: a cue, a server item and a graphic, all outside it.
    m.addShowCue(id, cueOf('Hairline').sourceId, { label: 'Hairline two', values: {} });
    m.addPlayoutItem(id, { adapter: 'casparcg', kind: 'media', name: 'ECHO', channel: 2, mediaKind: 'movie', frames: 250, fps: 25 });
    m.addGraphicToShow(id, { ...useTemplateStore.getState().template, name: 'Bug' });
    out.appends = read();
    // The server item under a cue in the folder goes, then the folder's last cue: the folder goes too.
    m.removePlayoutItem(id, cueOf('ALPHA').sourceId);
    out.removeItem = read();
    m.removeShowCue(id, cueOf('CHARLIE').id);
    out.removeLast = read();
    // A graphic whose only cue is a folder's only cue: removing the graphic removes the folder.
    m.addFolderFromSelection(id, [cueOf('Strap').id], 'Straps');
    m.removeShowGraphic(id, cueOf('Strap').sourceId);
    out.removeGraphic = read();
    // The whole rundown replaced, as a pack's ordered write does: no cue names a folder any more.
    m.addFolderFromSelection(id, [cueOf('Hairline two').id, cueOf('ECHO').id], 'Tail');
    const graphicCues = now().cues!.filter((c) => c.source !== 'playout').map((c) => ({ sourceId: c.sourceId, label: c.label, values: c.values }));
    m.setShowCues(id, graphicCues);
    out.replaced = read();
    return out;
  });
  expect(steps).toEqual({
    start: 'Hairline Strap [Block: ALPHA BRAVO CHARLIE DELTA]',
    noop: '0 writes',
    removeCue: 'Hairline Strap [Block: ALPHA CHARLIE DELTA]',
    stepOut: 'Hairline Strap [Block: ALPHA CHARLIE] DELTA',
    stepOver: 'Hairline [Block: ALPHA CHARLIE] Strap DELTA',
    folderLast: 'Hairline DELTA Strap [Block: ALPHA CHARLIE]',
    appends: 'Hairline DELTA Strap [Block: ALPHA CHARLIE] Hairline two ECHO Bug',
    removeItem: 'Hairline DELTA Strap [Block: CHARLIE] Hairline two ECHO Bug',
    removeLast: 'Hairline DELTA Strap Hairline two ECHO Bug',
    removeGraphic: 'Hairline DELTA Hairline two ECHO Bug',
    replaced: 'Hairline Hairline two Bug',
  });
});

// ── What folders never reach (docs/CLIP_PLAYBACK_PLAN.md §8, §18 case 25) ─────────────────────
// covers: src/control/hostedControl.ts, src/export/showExport.ts, src/packs/graphicsPack.ts

test('folders never leave the production page: the published payload, the export package and the pack carry none', async ({ page }) => {
  await seedSettings(page);
  await fakeBridge(page);
  await production(page, CLIPS, {
    playback: { ALPHA: { end: 'loop', fadeIn: 'short' } },
    folders: [
      { labels: ['Hairline', 'ALPHA'], name: 'Zq7 opener', mode: 'together' },
      { labels: ['BRAVO', 'CHARLIE'], name: 'Zq7 block', mode: 'through', end: 'loop', layer: 12 },
    ],
  });
  const carried = await evaluateInPage(page, async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    const { buildOutputPayload } = await import('/src/control/hostedControl.ts');
    const { buildShowZip, buildShowZipFor } = await import('/src/export/showExport.ts');
    const { buildPack } = await import('/src/packs/graphicsPack.ts');
    const show = loadShows().find((s) => s.name === 'Evening News')!;
    const payload = JSON.parse(JSON.stringify(await buildOutputPayload(show)));
    const texts: string[] = [JSON.stringify(payload.cues), JSON.stringify(payload.playoutCues ?? [])];
    for (const zip of [await buildShowZip(show), await buildShowZipFor(show, 'casparcg')]) {
      for (const name of Object.keys(zip.files)) {
        if (!zip.files[name].dir && /\.(html|js|json|md)$/.test(name)) texts.push(await zip.file(name)!.async('string'));
      }
    }
    const pack = await buildPack(show);
    return {
      hasFolders: show.folders!.length === 2,
      leaks: texts.filter((t) => /folderId|"folders"|Zq7/.test(t)).length,
      pack: JSON.stringify({ cues: pack.cues, keys: Object.keys(pack) }),
    };
  });
  expect(carried.hasFolders).toBe(true);
  expect(carried.leaks).toBe(0);
  expect(carried.pack).not.toMatch(/folder|Zq7/);
});

test('with a Play-through and an All-together folder up, the server readings redraw the clock and never the page', async ({ page }) => {
  // Plan §18, case 15, with folders: every state a header lights comes from the ownership part and
  // liveCue, never from the timing part. Every timer on the page is frozen and readings are driven one
  // at a time (a tab coming back into view reads the server at once), so only a reading can render.
  await page.clock.install();
  await seedSettings(page);
  const fake = await fakeBridge(page, { features: ['state', 'playback', 'sequence', 'sequence-loop'], version: '0.6.0' });
  await production(page, [...CLIPS, ...TOGETHER_MEDIA.map((m) => ({ ...m, name: `${m.name}_T` }))], {
    folders: [
      { labels: ['ALPHA', 'BRAVO', 'CHARLIE'], name: 'Loop', mode: 'through', end: 'loop', layer: 12 },
      { labels: ['VT_T', 'BED_T'], name: 'Pair', mode: 'together' },
    ],
  });
  await holdFolder(page, 'Loop');
  await expect(page.getByTestId('verb-take')).toBeEnabled();
  await page.keyboard.press(' ');
  await holdFolder(page, 'Pair');
  await page.keyboard.press(' ');
  await expect(cue(page, 'BED_T')).toContainText('ON AIR');
  await expect(cue(page, 'ALPHA')).toContainText('ON AIR');
  const pageRenders = () => page.getByTestId('production-page').evaluate((el) => Number(el.getAttribute('data-renders')));
  const clockRenders = () => page.getByTestId('clip-clock').evaluate((el) => Number(el.getAttribute('data-renders')));
  const headers = () => list(page).locator('.pd-folder').allInnerTexts();

  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  await expect.poll(async () => {
    const before = await pageRenders();
    await page.waitForTimeout(300);
    return (await pageRenders()) - before;
  }).toBe(0);
  const [p0, h0] = [await pageRenders(), await headers()];
  for (let i = 0; i < 6; i += 1) {
    const [calls, drawn] = [fake.stateCalls, await clockRenders()];
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect.poll(() => fake.stateCalls).toBeGreaterThan(calls);
    await expect.poll(clockRenders, { message: 'the clock redraws with a reading' }).toBeGreaterThan(drawn);
  }
  const moved = (await pageRenders()) - p0;
  expect(moved, `the page rendered ${moved} times over six readings`).toBe(0);
  expect(await headers()).toEqual(h0);
});

test('All out stops a folder Take that has put nothing up yet', async ({ page }) => {
  await seedSettings(page);
  const fake = await fakeBridge(page);
  await production(page, TOGETHER_MEDIA, {
    graphics: [{ name: 'Strap' }],
    folders: [{ labels: ['VT', 'BED', 'Strap'], name: 'Opening', mode: 'together' }],
  });
  await holdFolder(page, 'Opening');
  await expect(page.getByTestId('verb-take')).toBeEnabled();
  // The first take is slow to answer: nothing of the folder is on air yet.
  let release: () => void = () => {};
  const held = new Promise<void>((r) => (release = r));
  fake.gate = (a) => (a.verb === 'take' && a.slot.layer === 10 ? held : undefined);
  await page.keyboard.press(' ');
  await expect.poll(() => fake.actions.length).toBe(1);
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
  // The panic control is there for it, and it stops the rest.
  await expect(page.getByTestId('verb-out-all')).toBeEnabled();
  await page.getByTestId('verb-out-all').click();
  release();
  await expect.poll(() => sent(fake)).toEqual(['take 2-10 VT', 'out 2-10']);
  await page.waitForTimeout(500);
  expect(sent(fake)).toEqual(['take 2-10 VT', 'out 2-10']);
  await expect(cue(page, 'Strap').locator('.pd-tag.up, .pd-tag.air')).toHaveCount(0);
  await expect(cue(page, 'VT')).not.toContainText('ON AIR');
});
