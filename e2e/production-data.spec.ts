// covers: src/components/{home,save}/**
// focus
//
// Loading a DATASET row into a cue: the matcher is shared by the in-app page (live) and the publish
// path (the hosted page's rows), so the production-data specs that drive the gesture have to run
// alongside the control ones the covers line beside it selects.
// covers: src/control/cueData.ts
// covers: src/control/playoutSession.ts, src/control/productionDataSession.ts
// covers: src/control/contentFormats.ts
// covers: src/control/sheetSource.ts
// covers: src/control/feedSource.ts

import { test, expect, type Page } from '@playwright/test';
import { addCatalogGraphic, bootstrapGraphic, openProductionWithCurrent } from './_create';
import { openWorkspace } from './_workspace';
import { awaitDurableReady, settleDurableWrites } from './_durable';
import { parkFocusOffControls } from './_keys';
import { PRODUCTION_DATA_KEY } from '../src/model/productionState';
import { armStorageFailure, fillStorage, freeStorage } from './_storage';

// The production DATA workspace (docs/INTERACTIVE_PLAYOUT_PLAN.md D3/D6): the show's own
// tables, edited on the Data tab, loaded into CUES on the Playout tab by deliberate operator
// action. The load fills a DRAFT — nothing reaches air except through Take.

async function productionFor(page: Page, name: string): Promise<string> {
  return openProductionWithCurrent(page, name);
}

test('a quiz bank authored on the Data tab loads into the cue, airs only on Take, and survives a reload', async ({ page }) => {
  await bootstrapGraphic(page, { name: 'Arena Quiz' });
  await productionFor(page, 'Quiz Night');

  // ── The Data workspace: create a quiz table (preset columns spell the quiz field titles). ──
  const data = await openWorkspace(page, 'data');
  await expect(data.getByTestId('data-empty')).toBeVisible();
  await data.getByTestId('add-dataset').click();
  const dataset = data.locator('.pd-dataset');
  await expect(dataset).toHaveCount(1);
  await expect(dataset.getByTestId('dataset-name')).toHaveValue('Quiz questions');
  // The preset ships its starter row; fill it, then add a second question.
  const fill = async (rowIndex: number, cells: string[]) => {
    const row = dataset.locator('tbody tr').nth(rowIndex);
    for (let i = 0; i < cells.length; i++) {
      await row.locator('td input').nth(i).fill(cells[i]);
    }
  };
  await fill(0, ['Which planet is known as the Red Planet?', 'Venus', 'Mars', 'Pluto', 'Titan', 'B']);
  await data.getByTestId('add-row').click();
  await expect(dataset.locator('tbody tr')).toHaveCount(2);
  await fill(1, ['Which ocean is the largest?', 'Atlantic', 'Indian', 'Pacific', 'Arctic', 'C']);
  await expect(dataset).toContainText('2 rows');

  // ── Back on Playout, the cue offers the rows — labelled by their question. ──
  await settleDurableWrites(data);
  const load = page.getByTestId('cue-load-row');
  await expect(load).toBeVisible();
  await expect(load.locator('option')).toHaveCount(3); // the placeholder + two rows
  await load.selectOption({ label: 'Quiz questions: Which ocean is the largest?' });

  // The load fills the DRAFT: fields update, the local preview settles, air stays untouched.
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Which ocean is the largest?');
  await expect(page.getByTestId('cue-field-f3')).toHaveValue('Pacific');
  await expect(page.getByTestId('cue-field-f5-opt-C')).toHaveClass(/on/);
  const preview = page.frameLocator('iframe[title="Cue preview"]');
  await expect(preview.locator('#f0')).toHaveText('Which ocean is the largest?');
  // The preview must come back SCALED after the Data-tab round trip: the measure effect used
  // to key on the unchanged document, so the remounted frame was never measured and a 1920px
  // document rendered unscaled — DOM text present, picture showing its empty corner.
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const iframe = document.querySelector('iframe[title="Cue preview"]')?.getBoundingClientRect();
        const frame = document.querySelector('[data-testid="production-preview"]')?.getBoundingClientRect();
        return iframe && frame ? iframe.width <= frame.width + 1 : false;
      }),
    )
    .toBe(true);
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');

  // Take airs it — the one door to Program.
  await page.getByTestId('verb-take').click();
  await expect(program.locator('#f0')).toHaveText('Which ocean is the largest?');

  // ── The table is on the Show record: reload, reopen the Data tab, everything is there. ──
  await data.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(data.locator('.pd-dataset tbody tr')).toHaveCount(2);
  await expect(data.locator('.pd-dataset tbody tr').nth(1).locator('td input').first()).toHaveValue(
    'Which ocean is the largest?',
  );

  // The deep link works too: #/production/<id>/data is a real route with real history.
  expect(data.url()).toContain('/data');

  // ── Row and table removal: every one of them asks twice. ──
  const rows = data.locator('.pd-dataset tbody tr');
  const rowDelete = rows.nth(0).locator('[data-testid^="row-delete-"]');
  // One click ARMS and takes nothing. Asserting the count alone would pass a button that
  // deleted on the first press, since the second press would finish the job either way.
  await rowDelete.click();
  await expect(rows).toHaveCount(2);
  await expect(rowDelete).toHaveText('✓');
  await rowDelete.click();
  await expect(rows).toHaveCount(1);
  await data.getByTestId('dataset-delete').click();
  await expect(data.getByTestId('dataset-delete')).toHaveText('Delete table?');
  await data.getByTestId('dataset-delete').click();
  await expect(data.getByTestId('data-empty')).toBeVisible();

  // Back on Playout the load control disappears with the table — no dead select.
  await settleDurableWrites(data);
  await expect(page.getByTestId('cue-load-row')).toBeHidden();
});

test('a table whose columns match nothing offers no load control, and columns can be added and renamed', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Plain News');

  const data = await openWorkspace(page, 'data');
  await data.getByTestId('new-dataset-kind').selectOption('generic');
  await data.getByTestId('add-dataset').click();
  const dataset = data.locator('.pd-dataset');

  // Generic columns match no lower-third field — the Playout tab offers nothing.
  await settleDurableWrites(data);
  await expect(page.getByTestId('cue-load-row')).toBeHidden();

  // Rename a column to the field's TITLE and the binding appears — the words are the wiring.
  await dataset.getByTestId('col-c0').fill('Name');
  await dataset.locator('tbody tr td input').first().fill('Alexandra Riva');
  await data.getByTestId('new-column-name').fill('Title');
  await data.getByTestId('add-column').click();
  await dataset.locator('tbody tr td input').nth(3).fill('Chief Correspondent');

  await settleDurableWrites(data);
  const load = page.getByTestId('cue-load-row');
  await expect(load).toBeVisible();
  await load.selectOption({ label: 'Data table: Alexandra Riva' });
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Alexandra Riva');
  await expect(page.getByTestId('cue-field-f1')).toHaveValue('Chief Correspondent');

  // ── A column asks twice too: it takes every value under it and there is no undo. ──
  const colDelete = dataset.getByTestId('col-delete-c1');
  await colDelete.click();
  await expect(dataset.locator('thead th')).toHaveCount(5); // 4 columns + the actions column
  await expect(colDelete).toHaveText('✓');
  await colDelete.click();
  await expect(dataset.locator('thead th')).toHaveCount(4);
  await expect(dataset.getByTestId('col-c1')).toBeHidden();
});

test('a teams table loads one team into the side the operator picked, and leaves the other alone', async ({ page }) => {
  test.setTimeout(120_000);
  // ONE ROW IS ONE TEAM. A two-team board titles its fields "Team A" / "Score A" / "Team B" /
  // …, so a teams row matches none of them literally and the preset used to bind nothing at
  // all. The side picker is what closes that: the operator says which half of the board the
  // next row fills, and the field titles are matched with their side token dropped.
  await bootstrapGraphic(page, { name: 'House Match Board' });
  await productionFor(page, 'Cup Final');

  const data = await openWorkspace(page, 'data');
  await data.getByTestId('new-dataset-kind').selectOption('teams');
  await data.getByTestId('add-dataset').click();
  const dataset = data.locator('.pd-dataset');
  await expect(dataset.getByTestId('dataset-name')).toHaveValue('Teams');
  const fill = async (rowIndex: number, cells: string[]) => {
    const row = dataset.locator('tbody tr').nth(rowIndex);
    for (let i = 0; i < cells.length; i++) await row.locator('td input').nth(i).fill(cells[i]);
  };
  // Columns: Team · Score · Team colour · Team logo — every one the sideless half of a real
  // field title, which is what makes them bindable at all.
  await fill(0, ['Ashton United', '2', '#ff0000', '']);
  await data.getByTestId('add-row').click();
  await fill(1, ['Marske Town', '1', '#0000ff', '']);

  await settleDurableWrites(data);
  const side = page.getByTestId('cue-load-side');
  await expect(side).toBeVisible();          // a sided board, so the picker is offered

  // Load the first team into side A. B must not move.
  await page.getByTestId('cue-load-side-A').click();
  await page.getByTestId('cue-load-row').selectOption({ label: 'Teams: Ashton United' });
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Ashton United');
  await expect(page.getByTestId('cue-field-f1')).toHaveValue('2');
  // Side B still holds the design's own starting values — this board ships a sample score.
  await expect(page.getByTestId('cue-field-f2')).toHaveValue('AWAY');
  await expect(page.getByTestId('cue-field-f3')).toHaveValue('84');

  // Now the second team into side B. A must survive it — this is the assertion that proves the
  // other side's fields are excluded rather than merely unmatched.
  await page.getByTestId('cue-load-side-B').click();
  await page.getByTestId('cue-load-row').selectOption({ label: 'Teams: Marske Town' });
  await expect(page.getByTestId('cue-field-f2')).toHaveValue('Marske Town');
  await expect(page.getByTestId('cue-field-f3')).toHaveValue('1');
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Ashton United');
  await expect(page.getByTestId('cue-field-f1')).toHaveValue('2');

  // Loading is a DRAFT action: nothing reached air without a Take.
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
});

test('a graphic with no sides never grows a side picker, and the quiz binding is untouched', async ({ page }) => {
  // The guard on the gesture: the picker is offered only where A/B fields exist, so a quiz
  // board (whose titles carry "Answer A"… but no standalone side on the fields a row fills)
  // must keep binding exactly as it did before the side rule existed.
  await bootstrapGraphic(page, { name: 'Arena Quiz' });
  await productionFor(page, 'Quiz Night 2');

  const data = await openWorkspace(page, 'data');
  await data.getByTestId('add-dataset').click();
  const dataset = data.locator('.pd-dataset');
  const row = dataset.locator('tbody tr').nth(0);
  const cells = ['Which planet is red?', 'Venus', 'Mars', 'Pluto', 'Titan', 'B'];
  for (let i = 0; i < cells.length; i++) await row.locator('td input').nth(i).fill(cells[i]);

  await settleDurableWrites(data);
  await page.getByTestId('cue-load-row').selectOption({ index: 1 });
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Which planet is red?');
  await expect(page.getByTestId('cue-field-f2')).toHaveValue('Mars');
});

test('a graphic on air survives a Data-workspace round trip', async ({ page }) => {
  // THE DEFECT (acceptance pass, 2026-08-06): "go to the Data tab while something is in
  // program, come back to Playout, and the graphic is gone from the dashboard — it's still
  // live on CasparCG." The workspace switch unmounts the monitors, and the rebuilt PROGRAM
  // stage is a blank renderer nobody had told what was on air.
  //
  // The same shape as the Phase 2 defect on this exact round trip (the preview came back
  // unscaled), which is why this asserts the RENDERED PICTURE inside the program iframe rather
  // than the ON AIR chip beside it: the chip was right the whole time the monitor was empty.
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Round Trip');

  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  // A value the DESIGN does not ship. Taking the cue as-is proves nothing: a rebuilt stage
  // renders the template's own default text, so an assertion against it passes on a monitor
  // that was never told anything (this spec did exactly that in its first version).
  const AIRED = 'Round Trip Sentinel';
  await page.getByTestId('cue-field-f0').fill(AIRED);
  await page.getByTestId('verb-take').click();
  await expect(program.locator('#f0')).toHaveText(AIRED);
  await expect(page.getByTestId('live-cue-chip')).not.toContainText('nothing on air');

  const data = await openWorkspace(page, 'data');
  await settleDurableWrites(data);

  // Back on Playout: the rundown still says ON AIR, and now so does the picture.
  await expect(page.getByTestId('live-cue-chip')).not.toContainText('nothing on air');
  await expect(program.locator('#f0')).toHaveText(AIRED);
  // Not merely present in the markup — the entrance ran, so it is actually visible.
  await expect
    .poll(async () =>
      program.locator('#f0').evaluate((el) => {
        const box = el.closest('[class$="-box"]') ?? el;
        return Number(getComputedStyle(box as Element).opacity);
      }),
    )
    .toBeGreaterThan(0.9);
});

test('a quiz bank imported from CSV loads into a cue and airs — the Phase 2 walk from a file', async ({ page }) => {
  // Phase 7. The parser's own edge cases (quoted commas, quoted newlines, doubled quotes,
  // separators, JSON shapes) are unit-tested in scripts/csv.test.mjs; what is pinned HERE is
  // the walk a user actually does — a file becomes a table, a row becomes a cue, the cue airs.
  // The fixture carries a quoted comma on purpose, so a `split(',')` regression cannot pass.
  await bootstrapGraphic(page, { name: 'Arena Quiz' });
  await productionFor(page, 'Import Night');

  const data = await openWorkspace(page, 'data');
  await data.getByTestId('import-dataset').setInputFiles({
    name: 'Quiz bank.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'Question,Answer A,Answer B,Answer C,Answer D,Correct answer\n' +
        '"Which of these, exactly, is a planet?",Ganymede,Mars,Europa,Titan,B\n' +
        'Which ocean is the largest?,Atlantic,Indian,Pacific,Arctic,C\n',
    ),
  });

  // It reports what BOUND, not merely what arrived: a table that matches no field imports
  // perfectly and does nothing.
  const note = data.getByTestId('import-note');
  await expect(note).toContainText('Imported 2 rows');
  await expect(note).toContainText('Question');
  await expect(note).toContainText('Correct answer');

  // A real table, named after the file, editable like any other.
  const dataset = data.locator('.pd-dataset');
  await expect(dataset).toHaveCount(1);
  await expect(dataset.getByTestId('dataset-name')).toHaveValue('Quiz bank');
  await expect(dataset.locator('tbody tr')).toHaveCount(2);
  // The quoted comma survived — one cell, not two columns.
  await expect(dataset.locator('tbody tr').first().locator('td input').first()).toHaveValue(
    'Which of these, exactly, is a planet?',
  );

  // ── Load a row into the cue and air it. ──
  await settleDurableWrites(data);
  await page.getByTestId('cue-load-next').click();
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Which of these, exactly, is a planet?');
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await page.getByTestId('verb-take').click();
  await expect(program.locator('#f0')).toHaveText('Which of these, exactly, is a planet?');
  await expect(program.locator('#f2')).toHaveText('Mars');
});

test('a guest row loads into a lower third and airs on Take; editing or deleting the row afterwards leaves PROGRAM alone (C7)', async ({ page }) => {
  // data-sources AC-16's guest row: one table row fills one cue, never joined, and the cue keeps
  // what it was loaded with.
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Guest Night');
  const data = await openWorkspace(page, 'data');
  await data.getByTestId('import-dataset').setInputFiles({
    name: 'Guests.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Name,Title\nAino Virtanen,Head coach\nLeo Berg,"Referee, FIFA"\n'),
  });
  await expect(data.getByTestId('import-note')).toContainText('Imported 2 rows');
  await settleDurableWrites(data);

  await page.getByTestId('cue-load-row').selectOption({ label: 'Guests: Leo Berg' });
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Leo Berg');
  await expect(page.getByTestId('cue-field-f1')).toHaveValue('Referee, FIFA');
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
  await page.getByTestId('verb-take').click();
  await expect(program.locator('#f0')).toHaveText('Leo Berg');
  await expect(program.locator('#f1')).toHaveText('Referee, FIFA');

  // The source moves: the row is edited, then deleted. What is on air stays as it was taken.
  const rows = data.locator('.pd-dataset tbody tr');
  await rows.nth(1).locator('td input').nth(1).fill('Assistant referee');
  await settleDurableWrites(data);
  await expect(program.locator('#f1')).toHaveText('Referee, FIFA');
  // Removing a row is armed: the first press asks, the second removes.
  const remove = rows.nth(1).locator('[data-testid^="row-delete-"]');
  await remove.click();
  await remove.click();
  await expect(rows).toHaveCount(1);
  await settleDurableWrites(data);
  await expect(program.locator('#f0')).toHaveText('Leo Berg');
  await expect(program.locator('#f1')).toHaveText('Referee, FIFA');
});

test('the downloaded template is a file the importer accepts, with the columns a cue can bind', async ({
  page,
}) => {
  // The other half of import. What is pinned is the ROUND TRIP: the header the download carries
  // is the header the importer reads back, and its columns bind to the quiz board's fields -
  // which is the whole reason a blank template beats guessing at column names.
  await bootstrapGraphic(page, { name: 'Arena Quiz' });
  await productionFor(page, 'Template Night');
  const data = await openWorkspace(page, 'data');

  await data.getByTestId('new-dataset-kind').selectOption('quiz');
  const download = await Promise.all([
    data.waitForEvent('download'),
    data.getByTestId('download-dataset-template').click(),
  ]).then(([d]) => d);
  expect(download.suggestedFilename()).toBe('quiz-questions-template.csv');
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  expect(text.trim()).toBe('Question,Answer A,Answer B,Answer C,Answer D,Correct answer');

  // Hand it straight back, with a row typed in as an operator would.
  await data.getByTestId('import-dataset').setInputFiles({
    name: 'Quiz questions.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`${text}Which planet is red?,Venus,Mars,Pluto,Titan,B\r\n`),
  });
  const note = data.getByTestId('import-note');
  await expect(note).toContainText('Imported 1 row');
  // Every column bound - a template that named a column no field answers to would be the one
  // failure this feature exists to make impossible.
  await expect(note).toContainText('Question, Answer A, Answer B, Answer C, Answer D, Correct answer');
});

test('an imported table whose columns match no field says so rather than looking successful', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'No Match');
  const data = await openWorkspace(page, 'data');
  await data.getByTestId('import-dataset').setInputFiles({
    name: 'sales.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('Region;Revenue\nNorth;12\nSouth;9\n'),
  });
  const note = data.getByTestId('import-note');
  // The semicolon export still parses as two columns — the separator is detected, not assumed.
  await expect(data.getByTestId('col-c0')).toHaveValue('Region');
  await expect(data.getByTestId('col-c1')).toHaveValue('Revenue');
  await expect(note).toContainText('NO column matches');
});

test('a file that is not a table is refused with a reason', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Bad File');
  const data = await openWorkspace(page, 'data');
  await data.getByTestId('import-dataset').setInputFiles({
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"hello":"world"}'),
  });
  await expect(data.getByTestId('import-note')).toContainText('list of rows');
  await expect(data.getByTestId('data-empty')).toBeVisible();
});

test('the empty workspace carries the doors and names the columns that would bind', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Empty Data');
  const data = await openWorkspace(page, 'data');

  // With no tables the three doors live INSIDE the empty state - it used to be one grey
  // sentence over most of the screen with the actions parked in a corner of the header.
  const empty = data.getByTestId('data-empty');
  await expect(empty).toBeVisible();
  await expect(empty.getByTestId('add-dataset')).toBeVisible();
  await expect(empty.getByTestId('download-dataset-template')).toBeVisible();
  await expect(data.locator('.pd-data-head .pd-data-actions')).toHaveCount(0);

  // And it answers the surface's one hard question - what do I call my columns? - with this
  // production's own field titles, which is what an imported header is matched against.
  await expect(empty.getByTestId('bindable-columns')).toContainText('Name');
  await expect(empty.getByTestId('bindable-columns')).toContainText('Title');

  // Create a table and the same cluster moves to the header, flush right and unbroken. Asserted
  // as GEOMETRY: `toBeVisible` is blind to a button that wrapped onto a row of its own, which is
  // exactly what the ⬇ Blank CSV button used to do beside a `.spacer` that pushes nothing.
  await data.getByTestId('add-dataset').click();
  await expect(empty).toHaveCount(0);
  const actions = data.locator('.pd-data-head .pd-data-actions');
  await expect(actions).toBeVisible();
  // ONE ROW is measured as the cluster's own HEIGHT, not by comparing the children's tops:
  // they are centred on the line at slightly different heights (a select is a pixel taller than
  // a button), so rounded tops disagree by one pixel on some platforms and read as two rows on a
  // cluster that never wrapped. A wrapped cluster is two control heights plus the gap - far
  // above any rounding.
  const layout = await data.evaluate(() => {
    const head = document.querySelector('.pd-data-head')!.getBoundingClientRect();
    const box = document.querySelector('.pd-data-head .pd-data-actions')!.getBoundingClientRect();
    return { height: Math.round(box.height), rightGap: Math.round(head.right - box.right) };
  });
  expect(layout.height).toBeLessThan(50);
  expect(layout.rightGap).toBeLessThanOrEqual(1);
});

// ── PRODUCTION DATA: the live tree, the bindings, and the rules that make them safe on air
// (docs/PRODUCTION_DATA_PLAN.md). Everything below is Phase 1: local, manual, no API.

/** The Data view with Advanced open: the tree by its paths, the seed, Raw JSON and the per-field
 *  table sit there, closed by default (sheet-data-flow AC-9). */
async function openData(page: Page): Promise<Page> {
  const data = await openWorkspace(page, 'data');
  await openAdvanced(data);
  return data;
}

/** Open the Data view's Advanced part, unless it is open already. */
async function openAdvanced(data: Page): Promise<void> {
  if (!(await data.getByTestId('data-advanced').evaluate((d) => (d as HTMLDetailsElement).open))) await data.getByTestId('data-advanced-toggle').click();
}

/** Add one value to the production's live tree from the Data tab. */
async function addValue(page: Page, path: string, value: string): Promise<void> {
  await page.getByTestId('data-new-path').fill(path);
  await page.getByTestId('data-new-value').fill(value);
  await page.getByTestId('data-add').click();
  await expect(page.getByTestId(`data-row-${path}`)).toBeVisible();
}

/** The pool graphic's name, as the bindings table prints it. */
async function firstGraphicName(page: Page): Promise<string> {
  const heading = await page.getByTestId('production-bindings').locator('.pd-bind-graphic h4').first().textContent();
  return (heading ?? '').trim();
}

test('a bound field takes the LIVE value on air, and an old cue cannot re-air a stale one', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Match Night');

  // ── The playground: a nested tree, typed by what was written rather than by a schema. ──
  const data = await openData(page);
  await expect(data.getByTestId('production-live-data')).toBeVisible();
  await addValue(data, 'match.home.name', 'Finland');
  await addValue(data, 'match.home.score', '1');
  await expect(data.getByTestId('data-row-match.home.score')).toContainText('number');
  // A clock is TEXT - a value box that parsed 12:31 as a number would air 12.
  await addValue(data, 'match.clock', '12:31');
  await expect(data.getByTestId('data-row-match.clock')).toContainText('string');

  // ── Bind the graphic's first field to the name. ──
  const graphicName = await firstGraphicName(data);
  await data.getByTestId(`bind-${graphicName}-f0`).fill('match.home.name');
  await expect(data.getByTestId(`bind-value-${graphicName}-f0`)).toHaveText('Finland');

  // ── On Playout the bound field READS OUT: it is not a cue value, so there is no box to type
  //    a value into that nothing would ever air. ──
  await settleDurableWrites(data);
  await expect(page.getByTestId('cue-bound-f0')).toBeVisible();
  await expect(page.getByTestId('cue-field-f0')).toHaveCount(0);
  const preview = page.frameLocator('iframe[title="Cue preview"]');
  await expect(preview.locator('#f0')).toHaveText('Finland');

  // The bound row shares its NEIGHBOUR's box. Asserted as geometry because `toBeVisible` is
  // blind to a row that sits 8px taller than the one beside it - which is exactly what a
  // hand-rolled label did here before it was rebuilt on FieldRow's own `.field-row` structure.
  // The cue fields lay out two across, so the mismatch put the two inputs on different lines.
  const rowBox = await page.evaluate(() => {
    const bound = document.querySelector('[data-testid="cue-bound-f0"]')!.getBoundingClientRect();
    const plainEl = document.querySelector('[data-testid="cue-field-f1"]')!;
    const plain = (plainEl.closest('.field-row') ?? plainEl).getBoundingClientRect();
    const boundInput = document.querySelector('[data-testid="cue-bound-f0"] input')!.getBoundingClientRect();
    const plainInput = (plainEl.matches('input,textarea') ? plainEl : plainEl.querySelector('input,textarea')!).getBoundingClientRect();
    return {
      heightDelta: Math.abs(Math.round(bound.height) - Math.round(plain.height)),
      inputTopDelta: Math.abs(Math.round(boundInput.top) - Math.round(plainInput.top)),
      widthDelta: Math.abs(Math.round(bound.width) - Math.round(plain.width)),
    };
  });
  expect(rowBox.heightDelta).toBeLessThanOrEqual(1);
  expect(rowBox.inputTopDelta).toBeLessThanOrEqual(1);
  expect(rowBox.widthDelta).toBeLessThanOrEqual(1);

  // Take it: air shows the live value.
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await page.getByTestId('verb-take').click();
  await expect(program.locator('#f0')).toHaveText('Finland');

  // ── THE RULE THAT MATTERS (plan 2.7): the data moves while this cue sits there prepared,
  //    and taking it AGAIN airs the new value, never the one it was prepared with. ──
  await data.getByTestId('data-value-match.home.name').fill('Sweden');
  await settleDurableWrites(data);
  await expect(program.locator('#f0')).toHaveText('Sweden');
  await page.getByTestId('verb-take').click();
  await expect(program.locator('#f0')).toHaveText('Sweden');

  // ── Reload: the live tree is runtime state and survives, and it is NOT on the show record. ──
  await data.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await openAdvanced(data);
  await expect(data.getByTestId('data-value-match.home.name')).toHaveValue('Sweden');
  // The seed was never written, because saving one is a deliberate act - this is the whole
  // anti-churn rule (plan 2.1): live values must not touch the synced Show record.
  // Read through the durable model: the shows key lives in IndexedDB (model/durableStore.ts),
  // so a localStorage read answers [] whatever was written, and a missing record must fail here
  // rather than read as "nothing on it".
  const onRecord = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    const show = loadShows().find((s) => s.name === 'Match Night');
    if (!show) throw new Error('production not saved');
    return show.data ?? null;
  });
  expect(onRecord).toBe(null);
});

test('the seed is the reset target, and unbinding hands the field back to the cue', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Seed Show');
  const data = await openData(page);
  await addValue(data, 'counter', '5');

  // Save as seed, move the value, reset - the seed is what Reset returns to.
  await data.getByTestId('data-save-seed').click();
  await expect(data.getByTestId('data-note')).toContainText('seed');
  await data.getByTestId('data-up-counter').click();
  await expect(data.getByTestId('data-value-counter')).toHaveValue('6');
  await data.getByTestId('data-reset').click();
  await expect(data.getByTestId('data-value-counter')).toHaveValue('5');

  // Clear empties the tree; Reset brings the seed back, so Clear is never a data loss.
  await data.getByTestId('data-clear').click();
  await expect(data.getByTestId('data-empty-live')).toBeVisible();
  await data.getByTestId('data-reset').click();
  await expect(data.getByTestId('data-value-counter')).toHaveValue('5');

  // ── Bind, then UNBIND: the one override gesture (plan 2.7). The cue's own editable field
  //    comes back, which is what makes "manual override = unbind" a complete answer. ──
  const graphicName = await firstGraphicName(data);
  await data.getByTestId(`bind-${graphicName}-f0`).fill('counter');
  await settleDurableWrites(data);
  await expect(page.getByTestId('cue-bound-f0')).toBeVisible();
  // ARMED: typed-in data on a live surface, so the first click asks and the second acts (the
  // same two-step an entry's delete uses). Unbinding CHANGES WHAT AIRS, which is why it asks.
  const unbind = data.getByTestId(`unbind-${graphicName}-f0`);
  await unbind.click();
  await expect(unbind, 'the first click should only arm the unbind').toHaveText('✓');
  await expect(page.getByTestId('cue-bound-f0'), 'nothing may change on the arming click').toBeVisible();
  await unbind.click();
  await settleDurableWrites(data);
  await expect(page.getByTestId('cue-field-f0')).toBeVisible();
  await expect(page.getByTestId('cue-bound-f0')).toHaveCount(0);
});

test('Another system connects a whole graphic in one confirmation; the card lists its paths and generates the example and the sender file', async ({ page }) => {
  test.setTimeout(90_000);
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  const showId = await productionFor(page, 'Count Night');
  await page.getByTestId('cue-list').locator('.pd-cue').first().locator('.pd-cue-label').click();

  // ── Connect data…, Another system: every field offered its own path, keyed, nothing read. ──
  await page.getByTestId('cue-connect').click();
  let review = page.getByTestId('cue-connect-menu');
  await review.getByTestId('cue-connect-api').click();
  await expect(review.getByTestId('cue-connect-api-note')).toBeVisible();
  await expect(review.getByTestId('cue-connect-row-f0')).toHaveAttribute('data-status', 'key');
  await expect(review.getByTestId('cue-connect-row-f1')).toHaveAttribute('data-status', 'key');
  await expect(review.getByTestId('cue-connect-label')).toHaveCount(0);
  // Cancel writes nothing.
  await review.getByTestId('cue-connect-cancel').click();
  expect(await storedBindings(page, showId)).toEqual({ bindings: {}, sources: [] });

  // ── Repair one field (not connected), then ONE confirmation: bindings only, no source record. ──
  await page.getByTestId('cue-connect').click();
  review = page.getByTestId('cue-connect-menu');
  await review.getByTestId('cue-connect-api').click();
  await review.getByTestId('cue-connect-pick-f1').selectOption({ label: 'Not connected' });
  await expect(review.getByTestId('cue-connect-summary')).toContainText('1 connected');
  await review.getByTestId('cue-connect-confirm').click();
  await expect(review).toBeHidden();
  const stored = await storedBindings(page, showId);
  expect(stored.sources).toEqual([]);
  expect(Object.keys(stored.bindings.Hairline)).toEqual(['f0']);
  const path = stored.bindings.Hairline.f0;
  expect(path).toMatch(/^api\.hairline\.[a-z0-9_]+$/);
  // The connected field names its source and its path, with Disconnect beside it.
  await expect(page.getByTestId('cue-bound-f0')).toContainText('Another system');
  await expect(page.getByTestId('cue-bound-f0').getByTestId('cue-connected-note')).toContainText(path);

  // ── The card: the connected path, the generated example (key from the environment), the file. ──
  const data = await openData(page);
  const card = data.getByTestId('data-api-card');
  await expect(card.getByTestId('data-api-destinations')).toContainText(`${path} fills Hairline`);
  const curl = card.getByTestId('data-api-curl');
  await expect(curl).toContainText('curl -X PATCH');
  await expect(curl).toContainText('/api/data/patch');
  await expect(curl).toContainText('$NOACG_DATA_KEY');
  await expect(curl).toContainText(`"${path.split('.')[2]}"`);
  const file = await downloaded(data, () => card.getByTestId('data-api-download').click());
  expect(file.name).toBe('another-system.json');
  const example = JSON.parse(file.text);
  expect(example.fields).toEqual([{ path, label: expect.any(String), graphic: 'Hairline', field: 'f0' }]);
  expect(example.address).toMatch(/\/api\/data\/patch$/);
  expect(file.text).not.toMatch(/data.?key/i);

  // ── Disconnect hands the field back to the cue; the card has nothing to show. ──
  await data.close();
  await page.getByTestId('cue-bound-f0').getByTestId('cue-disconnect').click();
  await expect(page.getByTestId('cue-bound-f0')).toHaveCount(0);
  const after = await openData(page);
  await expect(after.getByTestId('data-api-none')).toBeVisible();
  await after.close();
});

test('an unpublished production offers no data key, because it has none', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'No Key Yet');
  const data = await openData(page);

  // The key is minted at PUBLISH into the production's row (docs/DATA_API.md), so offline there
  // is nothing to reveal. A button that could never do anything is worse than no button, and
  // this is the half of that rule the offline suite can prove; the live walk
  // (e2e/configured/production-data-key.spec.ts) proves the other half, including that the
  // revealed key really authenticates.
  await expect(data.getByTestId('data-key')).toHaveCount(0);
  await expect(data.getByTestId('data-key-value')).toHaveCount(0);
  // The Another system card says publishing is the step, with Publish one press away (here an
  // offline build, so the button says why it cannot; data-sources AC-7, local half).
  await expect(data.getByTestId('data-api-local')).toContainText('Publishing gives this production an address and a key');
  await expect(data.getByTestId('data-api-publish')).toBeVisible();
  await expect(data.getByTestId('data-api-pause')).toHaveCount(0);
  // The rest of the panel is untouched by its absence.
  await expect(data.getByTestId('data-raw-toggle')).toBeVisible();
});

test('nested trees, arrays and a missing path each behave as the contract says', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Shapes');
  const data = await openData(page);

  // A whole payload pasted as JSON - the same shape the future ingress API will accept, which
  // is what makes this panel the API's documentation as well as its playground.
  await data.getByTestId('data-raw-toggle').click();
  await data.getByTestId('data-raw-text').fill(
    JSON.stringify({
      poll: { open: true, options: [{ label: 'Yes', votes: 72 }] },
      headlines: ['First story', 'Second story'],
      drivers: [{ name: 'Driver A', gap: 'LEADER' }],
    }),
  );
  await data.getByTestId('data-raw-apply').click();
  // Nested objects, arrays of objects (indexed paths) and a scalar array as ONE leaf.
  await expect(data.getByTestId('data-row-poll.open')).toBeVisible();
  await expect(data.getByTestId('data-row-poll.options.0.votes')).toBeVisible();
  await expect(data.getByTestId('data-row-drivers.0.gap')).toBeVisible();
  await expect(data.getByTestId('data-value-headlines')).toHaveValue('First story\nSecond story');

  // Malformed JSON is refused with its own reason, and the tree is untouched. (A successful
  // apply CLOSES the panel - the edit is done - so this reopens it.)
  await data.getByTestId('data-raw-toggle').click();
  await data.getByTestId('data-raw-text').fill('{not json');
  await data.getByTestId('data-raw-apply').click();
  await expect(data.getByTestId('data-raw-error')).toBeVisible();
  await expect(data.getByTestId('data-row-poll.open')).toBeVisible();

  // ── A binding to a path that is not there writes NOTHING: the field keeps its own value
  //    rather than going blank on air (plan 2.4, "freeze is not-writing"). ──
  const graphicName = await firstGraphicName(data);
  await data.getByTestId(`bind-${graphicName}-f0`).fill('nothing.here');
  await expect(data.getByTestId(`bind-value-${graphicName}-f0`)).toContainText('no value');
  await settleDurableWrites(data);
  const preview = page.frameLocator('iframe[title="Cue preview"]');
  await expect(preview.locator('#f0')).not.toHaveText('');

  // Deleting a value leaves the rest of the tree alone.
  const del = data.getByTestId('data-delete-poll.open');
  await del.click();
  await expect(del, 'the first click should only arm the delete').toHaveText('✓');
  await expect(data.getByTestId('data-row-poll.open'), 'nothing may go on the arming click').toBeVisible();
  await del.click();
  await expect(data.getByTestId('data-row-poll.open')).toHaveCount(0);
  await expect(data.getByTestId('data-row-poll.options.0.votes')).toBeVisible();
});

test('one value moves every graphic bound to it, and only the graphics bound to it', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Two Graphics');
  const data = await openData(page);
  await addValue(data, 'shared.title', 'First');

  // The one binding this pool offers, bound - then the value moves and the preview follows
  // without anything being taken: a data write never plays, stops or takes anything.
  const graphicName = await firstGraphicName(data);
  await data.getByTestId(`bind-${graphicName}-f0`).fill('shared.title');
  await settleDurableWrites(data);
  const preview = page.frameLocator('iframe[title="Cue preview"]');
  await expect(preview.locator('#f0')).toHaveText('First');
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');

  await data.getByTestId('data-value-shared.title').fill('Second');
  await settleDurableWrites(data);
  await expect(preview.locator('#f0')).toHaveText('Second');
  // Still nothing on air: state changed, no graphic was played.
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
});

test('production data is scoped to its production, never shared between two', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Show One');
  const showOneUrl = page.url();
  // EACH PRODUCTION GETS ITS OWN WORKSPACE TAB, because the workspaces open in their own tab
  // now and a tab is opened onto ONE production. Re-using the first production's tab for the
  // second would be asking a question about that tab, not about the scoping.
  const dataOne = await openData(page);
  await addValue(dataOne, 'shared.value', 'one');

  // A second production, from its own project. Same path, its own tree - the store is keyed by
  // production id, so nothing about "shared.value" is global.
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Show Two');
  const dataTwo = await openData(page);
  await expect(dataTwo.getByTestId('production-live-data')).toBeVisible();
  await expect(dataTwo.getByTestId('data-row-shared.value')).toHaveCount(0);
  await addValue(dataTwo, 'shared.value', 'two');

  // The first production's own tab still holds its own value - and it is still 'one' even
  // though the second tab wrote the same PATH a moment ago.
  await dataOne.reload();
  await openAdvanced(dataOne);
  await expect(dataOne.getByTestId('data-value-shared.value')).toHaveValue('one');
  // …and reaching it by its own URL says the same (deterministic - no card hunting).
  await page.goto(showOneUrl);
  await expect(page.getByTestId('production-page')).toBeVisible();
});

test('SPACE on the Data tab cannot put a graphic on air', async ({ page }) => {
  // THE VERB KEYS BELONG TO THE PLAYOUT SURFACE, and only while it is the surface on screen.
  //
  // `usePlayoutVerbKeys` binds in the SHELL, which renders on Data and Audience too - so
  // standing on the Data tab with focus anywhere but an input, SPACE ran Take. No monitors are
  // visible there, so a cue went to air with nothing on screen saying it had. That is the
  // hazard behind the owner's read of the workspaces (2026-08-21): "the buttons that we have
  // and the side pages we have feel a bit dangerous to swap between."
  //
  // THE PROBE IS THE ACTIVITY FEED, and getting here took two wrong ones worth naming, because
  // both are the shape of guard test that cannot fail:
  //   1. Reading `Show.liveCue` - a LOCAL take never writes that field, so the assertion was
  //      green with the guard removed.
  //   2. Pressing every verb key in a row and then asserting nothing aired. `0` is Out, so the
  //      sequence took the cue and took it straight back off. The test cancelled itself.
  // The feed counts what actually reached the wire, one row per command, and it cannot be
  // undone by a later key in the same press sequence.
  await bootstrapGraphic(page, { name: 'Arena Quiz' });
  await productionFor(page, 'Quiz Night');
  const rows = page.getByTestId('action-log-row');
  await expect(rows).toHaveCount(0);

  // The keys are pressed IN THE WORKSPACE'S OWN TAB, which is where an operator would press
  // them: the workspaces open in their own browser tab now (see `openWorkspace`), so this is
  // the ordinary way to be standing on Data. The guard is the same one either way - the shell
  // binds the verb keys only while playout is the surface on screen.
  const data = await openData(page);

  // Space belongs to a focused button by design, so say where focus is rather than inherit it.
  await parkFocusOffControls(data);
  for (const key of ['Space', 'n', 'r', '0', 'u']) {
    await data.keyboard.press(key);
    await data.waitForTimeout(150);
  }
  await expect(rows, 'a verb key pressed on the Data tab reached the wire').toHaveCount(0);

  // …and on Playout the same key works, so this is a scoping rule and not a dead keymap.
  await parkFocusOffControls(page);
  await page.keyboard.press('Space');
  await expect(page.getByTestId('live-cue-chip')).not.toContainText('nothing on air');
  await expect(rows).not.toHaveCount(0);
});

/**
 * THE CUE RUNDOWN DOES NOT FOLLOW YOU ONTO THE DATA TAB.
 *
 * The playout surface stays MOUNTED behind a workspace and is hidden with a class, because
 * unmounting it would destroy the PROGRAM monitor's iframes and reload whatever is on air. The
 * hiding half only ever worked for half the surface: `.pd-offstage` and `.pd-rail` are both
 * one-class selectors, so the later of the two in styles.css won and the rundown stayed on
 * screen beside the Data workspace - a list of cues on a page that has no way to air one
 * (owner, 2026-08-21: "explain to me what the cue rundown is doing here"). `.pd-main` was
 * hidden only by the accident of being declared above it.
 *
 * The workspaces open in their own tab, where the playout column is never built at all - so the
 * leak needs the IN-TAB route, which is what a Back after "Playout" gives you.
 */
test('the playout column stays hidden behind the Data workspace, rundown included', async ({ page }) => {
  await bootstrapGraphic(page, { name: 'Arena Quiz' });
  await productionFor(page, 'Quiz Night');
  const data = await openData(page);

  // Back to Playout IN THIS TAB (the one tab control that is a button, not a link), which is
  // what builds the playout column in the workspace's tab in the first place.
  await data.getByTestId('tab-playout').click();
  await expect(data.getByTestId('production-verbs')).toBeVisible();
  await expect(data.locator('.pd-rail')).toBeVisible();

  // …and back to Data, now with the playout surface mounted behind it.
  await data.goBack();
  await expect(data.getByTestId('production-data')).toBeVisible();
  for (const sel of ['.pd-rail', '.pd-main']) {
    await expect(data.locator(sel), `${sel} is still on screen behind the Data workspace`).toBeHidden();
  }
  // Still MOUNTED, which is the other half of the contract: hidden, never unmounted.
  expect(await data.locator('.pd-rail').count()).toBe(1);
});

// ── AC-7: a stepper on a BOUND field moves the shared value ──────────────────────────────────

/** A second graphic into the production this page already holds, on its own layer. */
/** A second catalog graphic in the production the page is showing, added the way the rundown's "+ Add" adds one. */
async function addSecondGraphic(page: Page, variant: string, showId: string): Promise<void> {
  await addCatalogGraphic(page, showId, variant);
  await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(2);
}

test('a ± press on a bound field moves the shared value, and every graphic bound to it follows', async ({ page }) => {
  // THE BUG THIS CLOSES (docs/PRODUCTION_DATA_PLAN.md §2.9): the ± stepper wrote ONE field on ONE
  // graphic, so on a production where two graphics show the same score the operator moved one of
  // them and the next write of the shared value put it back. Phase 3 makes the press move the
  // VALUE, and both graphics follow through the diff that already existed.
  //
  // A big score strip and a small bug, both showing the home score, is the shape the owner asked
  // for on 2026-09-15: a score entered once shows everywhere. Both scoreboard families call the
  // home score `f1` (src/templates/scoreboards/shared.ts), so one path binds the same slot twice.
  await bootstrapGraphic(page, { name: 'House Score' });
  const showId = await productionFor(page, 'Derby Data');
  await addSecondGraphic(page, 'Club Scorebug', showId);
  const cues = page.getByTestId('cue-list').locator('.pd-cue');
  await expect(cues).toHaveCount(2);

  // ── ONE value, bound on BOTH graphics ──
  const data = await openData(page);
  await addValue(data, 'match.home.score', '0');
  await data.getByTestId('bind-House Score-f1').fill('match.home.score');
  await data.getByTestId('bind-Club Scorebug-f1').fill('match.home.score');
  await expect(data.getByTestId('bind-value-House Score-f1')).toHaveText('0');
  await expect(data.getByTestId('bind-value-Club Scorebug-f1')).toHaveText('0');
  await settleDurableWrites(data);

  // ── Both on air, each on its own layer ──
  await page.getByTestId('verb-take').click();
  await cues.nth(1).locator('.pd-cue-label').click();
  await page.getByTestId('verb-take').click();
  const strip = page.frameLocator('[data-testid="program-stage"] iframe[data-layer="20"]');
  const bug = page.frameLocator('[data-testid="program-stage"] iframe[data-layer="21"]');
  await expect(strip.locator('#f1')).toHaveText('0');
  await expect(bug.locator('#f1')).toHaveText('0');

  // The bound field reads out rather than editing, on the cue whose ± is about to be pressed:
  // there is no box to type a value into that nothing would ever air (§2.7).
  await expect(page.getByTestId('cue-bound-f1')).toBeVisible();
  await expect(page.getByTestId('cue-field-f1')).toHaveCount(0);

  // ── THE PRESS. One ± on the bug, and the STRIP moves too. ──
  await page.getByTestId('live-number-f1-up').click();
  await expect(bug.locator('#f1')).toHaveText('1');
  await expect(strip.locator('#f1')).toHaveText('1');
  // It moved the VALUE, not the field: the tree is what both are reading.
  await expect(data.getByTestId('data-value-match.home.score')).toHaveValue('1');
  // …and it stayed a NUMBER, so a feed writing the same path does not find a string there.
  await expect(data.getByTestId('data-row-match.home.score')).toContainText('number');

  // ── An UNBOUND number field on the same graphic is exactly what it always was: one partial
  //    update to this graphic alone, mirrored into its own cue. ──
  const awayBefore = Number((await bug.locator('#f3').textContent()) ?? 0);
  const stripAway = await strip.locator('#f3').textContent();
  await page.getByTestId('live-number-f3-up').click();
  await expect(bug.locator('#f3')).toHaveText(String(awayBefore + 1));
  await expect(strip.locator('#f3')).toHaveText(stripAway ?? '');
  await expect(page.getByTestId('cue-field-f3')).toHaveValue(String(awayBefore + 1));
  // The shared value did not move for it.
  await expect(data.getByTestId('data-value-match.home.score')).toHaveValue('1');
});

test('a quiz revealed beside a running clock: bound values update both, the clock keeps counting and the quiz stays revealed (C7)', async ({ page }) => {
  // data-sources AC-16: independent behaviour stays independent. A data write changes values
  // only: it never restarts another graphic's clock, re-takes a graphic or moves a machine.
  test.setTimeout(90_000);
  await bootstrapGraphic(page, { name: 'Arena Quiz' });
  const showId = await productionFor(page, 'Quiz Clock Night');
  await addSecondGraphic(page, 'Club Scorebug', showId);
  const cues = page.getByTestId('cue-list').locator('.pd-cue');
  const chip = page.getByTestId('machine-state-chip');

  const data = await openData(page);
  await addValue(data, 'quiz.question', 'Which planet is largest?');
  await addValue(data, 'match.home.score', '0');
  await data.getByTestId('bind-Arena Quiz-f0').fill('quiz.question');
  await data.getByTestId('bind-Club Scorebug-f1').fill('match.home.score');
  await expect(data.getByTestId('bind-value-Club Scorebug-f1')).toHaveText('0');
  await settleDurableWrites(data);

  const quiz = page.frameLocator('[data-testid="program-stage"] iframe[data-layer="20"]');
  const bug = page.frameLocator('[data-testid="program-stage"] iframe[data-layer="21"]');
  await cues.nth(1).locator('.pd-cue-label').click();
  await page.getByTestId('verb-take').click();
  await page.getByTestId('cue-action-clockStart').click();
  await expect(chip).toContainText(/running/i);
  const clock = bug.locator('.scoreboard-clock');
  const seconds = async (): Promise<number> => {
    const [m, s] = ((await clock.textContent()) ?? '').trim().split(':').map(Number);
    return m * 60 + s;
  };
  const start = await seconds();

  await cues.nth(0).locator('.pd-cue-label').click();
  await page.getByTestId('verb-take').click();
  await expect(quiz.locator('#f0')).toHaveText('Which planet is largest?');
  await page.getByTestId('cue-field-f6-opt-B').click();
  await page.getByTestId('cue-action-select').click();
  await page.getByTestId('cue-action-lock').click();
  await page.getByTestId('cue-action-judge').click();
  await expect(chip).toHaveText('Reveal');
  await expect(quiz.locator('.quiz-correct')).toHaveCount(1);
  const board = () => quiz.locator('.quiz, .quiz-option').evaluateAll((els) => els.map((el) => el.className));
  const revealed = await board();

  // The clock has run a few seconds while the quiz was played.
  await expect.poll(async () => Math.abs((await seconds()) - start), { timeout: 15_000 }).toBeGreaterThanOrEqual(4);
  const runBefore = Math.abs((await seconds()) - start);

  // The data moves: both graphics take the new values on air, nothing else changes.
  await data.getByTestId('data-value-quiz.question').fill('Which planet has the most moons?');
  await data.getByTestId('data-value-match.home.score').fill('2');
  await settleDurableWrites(data);
  await expect(quiz.locator('#f0')).toHaveText('Which planet has the most moons?');
  await expect(bug.locator('#f1')).toHaveText('2');

  // The quiz did not advance or go back: still revealed, the same answer marked.
  await expect(chip).toHaveText('Reveal');
  expect(await board(), 'the board is exactly as revealed').toEqual(revealed);
  // The clock was not reset: it ran on from where it stood, and it still runs.
  await expect.poll(async () => Math.abs((await seconds()) - start), { timeout: 10_000 }).toBeGreaterThanOrEqual(runBefore + 2);
  await cues.nth(1).locator('.pd-cue-label').click();
  await expect(chip).toContainText(/running/i);
});

test('an adjust on a bound field patches the tree, and the event still fires', async ({ page }) => {
  // The second half of AC-7. A scoreboard's GOAL carries `adjust: { f1: 1 }`, so the press used to
  // ride the new figure as the event's payload and mirror it into the cue. With f1 bound, the
  // figure is not this graphic's to carry: the event fires on its own and the score arrives as the
  // tree's own update row, on every graphic bound to the path.
  await bootstrapGraphic(page, { name: 'House Score' });
  const showId = await productionFor(page, 'Goal Data');
  await addSecondGraphic(page, 'Club Scorebug', showId);
  const cues = page.getByTestId('cue-list').locator('.pd-cue');

  const data = await openData(page);
  await addValue(data, 'match.home.score', '2');
  await data.getByTestId('bind-House Score-f1').fill('match.home.score');
  await data.getByTestId('bind-Club Scorebug-f1').fill('match.home.score');
  await settleDurableWrites(data);

  await page.getByTestId('verb-take').click();
  await cues.nth(1).locator('.pd-cue-label').click();
  await page.getByTestId('verb-take').click();
  await cues.nth(0).locator('.pd-cue-label').click();
  const strip = page.frameLocator('[data-testid="program-stage"] iframe[data-layer="20"]');
  const bug = page.frameLocator('[data-testid="program-stage"] iframe[data-layer="21"]');
  await expect(strip.locator('#f1')).toHaveText('2');
  await expect(bug.locator('#f1')).toHaveText('2');

  // GOAL: the flag plays on the strip AND the shared figure moves on both.
  await page.getByTestId('cue-action-goalA').click();
  await expect(page.getByTestId('machine-state-chip')).toContainText('Flag');
  await expect(strip.locator('#f1')).toHaveText('3');
  await expect(bug.locator('#f1')).toHaveText('3');
  await expect(data.getByTestId('data-value-match.home.score')).toHaveValue('3');

  // The cue did NOT take the figure: a bound field is never a cue value, so taking this cue again
  // airs the tree rather than re-airing whatever the press happened to leave behind.
  // Read through the durable model (the shows key lives in IndexedDB, so localStorage answers
  // nothing), and from both cues, so an empty read cannot pass as "no cue took it".
  const stored = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    const show = loadShows().find((s) => s.name === 'Goal Data');
    if (!show) throw new Error('production not saved');
    return (show.cues ?? []).map((c) => c.values?.f1 ?? null);
  });
  expect(stored).toHaveLength(2);
  expect(stored).not.toContain('3');
  await page.getByTestId('verb-take').click();
  await expect(strip.locator('#f1')).toHaveText('3');
});

// ── AC-8: "Bind all by title" accepts every unambiguous suggestion in one press ──────────────

test('Bind all by title binds every unambiguous title in one press, and leaves the ambiguous one bound-empty with a reason', async ({ page }) => {
  // Two graphics sharing a scoreboard family (both title f1 "Score A" and f0 "Team A" -
  // src/templates/scoreboards/shared.ts), so their matching titles are meant to bind in one
  // press rather than one field at a time.
  await bootstrapGraphic(page, { name: 'House Score' });
  const showId = await productionFor(page, 'Derby Bindings');
  await addSecondGraphic(page, 'Club Scorebug', showId);

  const data = await openData(page);
  // The tab explains itself before anything is pressed: a closed drawer for the three blocks,
  // and the button's rule on the line under the heading it sits beside. Both are copy a student
  // reads once, so the spec pins that they are there and what they claim, not their wording.
  const explain = data.getByTestId('data-explain');
  await expect(explain).toBeVisible();
  await expect(explain).not.toHaveAttribute('open');
  await expect(explain.locator('a')).toHaveAttribute('href', '/docs#data-example');
  await expect(data.getByTestId('bind-all-rule')).toContainText('exactly one path');
  await addValue(data, 'match.scoreA', '10');
  // Two leaves end in "teamA" - an ambiguous title, on purpose - so the button must leave it
  // unbound rather than guess.
  await addValue(data, 'match.teamA', 'Home');
  await addValue(data, 'results.teamA', 'Away');

  // ── The per-graphic button: House Score's Score A binds, its Team A stays unbound and says
  //    why, and the fields with no matching leaf at all (Team B, Score B) carry no note. ──
  await data.getByTestId('bind-all-House Score').click();
  await expect(data.getByTestId('bind-all-note-House Score')).toContainText('1 field bound');
  await expect(data.getByTestId('bind-House Score-f1')).toHaveValue('match.scoreA');
  await expect(data.getByTestId('bind-House Score-f0')).toHaveValue('');
  const ambiguous = data.getByTestId('bind-ambiguous-House Score-f0');
  await expect(ambiguous).toContainText('match.teamA');
  await expect(ambiguous).toContainText('results.teamA');
  await expect(data.getByTestId('bind-ambiguous-House Score-f2')).toHaveCount(0);
  await expect(data.getByTestId('bind-ambiguous-House Score-f3')).toHaveCount(0);
  // The second graphic is untouched by the first graphic's button.
  await expect(data.getByTestId('bind-Club Scorebug-f1')).toHaveValue('');

  // ── The whole-production button reaches every graphic at once, including the one whose
  //    button was never pressed. ──
  await data.getByTestId('bind-all-production').click();
  await expect(data.getByTestId('bind-all-note-production')).toContainText('1 field bound');
  await expect(data.getByTestId('bind-Club Scorebug-f1')).toHaveValue('match.scoreA');
  await expect(data.getByTestId('bind-ambiguous-Club Scorebug-f0')).toContainText('match.teamA');

  // A second press finds nothing left unbound and unambiguous: an already-bound field is never
  // re-suggested, so the button is idempotent rather than something to press exactly once.
  await data.getByTestId('bind-all-production').click();
  await expect(data.getByTestId('bind-all-note-production')).toContainText('Nothing left to bind');

  // ── ONE GRID. The rows on this tab are each their own grid, and until 2026-09-16 their tracks
  //    depended on the row's own content, so on a wide screen the path box started at a
  //    different x on a row with a Suggest button, a row with an ambiguity note and a plain row.
  //    Measured as geometry over the mixed shape this test has just built: value rows above
  //    (text and number leaves, so with and without steppers), binding rows below (bound,
  //    ambiguous and empty). Every box shares one left edge across BOTH blocks, and every
  //    delete button one right edge. ──
  await data.setViewportSize({ width: 1440, height: 900 });
  const edges = await data.evaluate(() => {
    const lefts = (selector: string) =>
      Array.from(document.querySelectorAll(selector)).map((el) => Math.round(el.getBoundingClientRect().left));
    const rights = (selector: string) =>
      Array.from(document.querySelectorAll(selector)).map((el) => Math.round(el.getBoundingClientRect().right));
    return {
      boxLefts: [...lefts('.pd-live-row > input'), ...lefts('.pd-bind-row > input')],
      deleteRights: [...rights('.pd-live-row > .pd-live-del'), ...rights('.pd-bind-row > .pd-live-del')],
    };
  });
  expect(edges.boxLefts.length).toBeGreaterThan(6);
  expect(new Set(edges.boxLefts).size, `path boxes start at ${edges.boxLefts.join(', ')}`).toBe(1);
  expect(edges.deleteRights.length).toBeGreaterThan(3);
  expect(new Set(edges.deleteRights).size, `delete buttons end at ${edges.deleteRights.join(', ')}`).toBe(1);
  await expect(data.getByTestId('bind-House Score-f1')).toHaveValue('match.scoreA');
});

// ── ONE EDIT, ONE WRITE ─────────────────────────────────────────────────────────────────────
//
// THE COUNT IS THE CLAIM. A value box used to call the tree writer on every `input` event, so a
// twelve-character team name was twelve persists and twelve wire updates. Published, that is
// twelve HTTP PATCHes against an ingest budget of 25 per 5 s: the run 429s, and the failure
// handler answers by pulling the server's OLDER tree back in - which lands in the box the
// operator is still typing into. Unpublished it is twelve read-modify-writes of every
// production's tree, plus an update row per bound graphic each time.
//
// PERSISTS ARE THE ONE NUMBER WORTH COUNTING, because everything downstream hangs off them: the
// wire update fires from `resolved`, which only moves when the tree moves, and on a published
// production the persist IS the PATCH. Offline a persist is a `localStorage` write, so the probe
// wraps `setItem` and counts the writes to the production-data key.

/** Count every write to the production data key, in every page opened after this call. */
async function countPersists(page: Page): Promise<void> {
  await page.context().addInitScript((key: string) => {
    // GUARDED WHOLE, the way e2e/_storage.ts explains: an init script runs inside the sandboxed
    // preview iframes too, where touching a storage API can throw, and an uncaught error there
    // lands in the page-error listeners other specs assert empty.
    try {
      const w = window as unknown as { __dataPersists?: number };
      w.__dataPersists = 0;
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (this: Storage, k: string, value: string) {
        if (k === key) w.__dataPersists = (w.__dataPersists ?? 0) + 1;
        return setItem.call(this, k, value);
      };
    } catch {
      /* no storage to wrap here */
    }
  }, PRODUCTION_DATA_KEY);
}

/** Zero it, so the count is the gesture under test and not the setup that preceded it. */
async function resetPersists(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __dataPersists?: number }).__dataPersists = 0;
  });
}

/**
 * The panel commits an edit after this long without a keystroke (`EDIT_SETTLE_MS` in
 * src/components/home/useDeferredEdits.ts). The tests need it for one reason only: to say what a
 * SLOW machine is allowed to cost. See `expectOneEditOneWrite`.
 */
const SETTLE_MS = 500;

/**
 * Assert what ONE edit cost, without pinning how fast the machine running the test is.
 *
 * The claim is one write per edit rather than one per character, and on any healthy run `allowed`
 * is 1, which is that claim exactly. A runner that stalls mid-word genuinely made two edits - the
 * settle timer fired between two keystrokes, exactly as an operator pausing would make it - so
 * the budget grows by one per settle window the typing actually spanned, and never comes anywhere
 * near the one-per-character count these tests exist to refuse (twelve, and five, before this).
 */
async function expectOneEditOneWrite(page: Page, typedMs: number): Promise<void> {
  const count = await page.evaluate(() => (window as unknown as { __dataPersists?: number }).__dataPersists ?? 0);
  const allowed = 1 + Math.floor(typedMs / SETTLE_MS);
  expect(
    count,
    `one edit must cost one write; typing took ${typedMs}ms, so at most ${allowed} settle${allowed === 1 ? '' : 's'} could have fired`,
  ).toBeLessThanOrEqual(allowed);
}

/** Type into a focused box and say how long it took, so the count above can be judged. */
async function typeAndTime(type: () => Promise<void>): Promise<number> {
  const started = Date.now();
  await type();
  return Date.now() - started;
}

/** The value the persisted tree holds at `path`, or null - read from storage, not from the box,
 *  so the assertion is about what LANDED rather than about what is on screen. */
async function persistedValue(page: Page, path: string): Promise<unknown> {
  return await page.evaluate(([key, p]: [string, string]) => {
    const store = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, unknown>;
    const tree = Object.values(store)[0];
    let node: unknown = tree;
    for (const step of p.split('.')) {
      if (!node || typeof node !== 'object') return null;
      node = (node as Record<string, unknown>)[step];
    }
    return node ?? null;
  }, [PRODUCTION_DATA_KEY, path] as [string, string]);
}

test('typing a value costs ONE persist for the whole edit, not one per character', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Rate Budget');
  await countPersists(page);
  const data = await openData(page);
  await addValue(data, 'match.home.name', 'Suomi');

  // The gesture: select the whole value and retype it, character by character, the way an
  // operator correcting a team name does. `pressSequentially` is the point - `fill` sets the
  // value in one event and so cannot tell the two behaviours apart.
  const box = data.getByTestId('data-value-match.home.name');
  await resetPersists(data);
  await box.click();
  await box.press('ControlOrMeta+a');
  const typedMs = await typeAndTime(() => box.pressSequentially('Helsinki IFK'));
  await expect(box).toHaveValue('Helsinki IFK');
  await box.blur();

  // Waiting for the tree is what makes the count honest: poll until the edit has LANDED, then
  // ask how many writes it took to get there.
  await expect.poll(() => persistedValue(data, 'match.home.name')).toBe('Helsinki IFK');
  await expectOneEditOneWrite(data, typedMs);
});

test('an operator who types and walks away still has the value persisted', async ({ page }) => {
  // THE TRAP THE DEBOUNCE MUST NOT SPRING. Committing on blur alone would leave a typed value in
  // a box nobody ever leaves - the operator types the new clock and turns back to the desk - so
  // the timer commits it unattended, and what it commits is the LAST keystroke.
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Walk Away');
  await countPersists(page);
  const data = await openData(page);
  await addValue(data, 'match.clock', '12:31');

  const box = data.getByTestId('data-value-match.clock');
  await resetPersists(data);
  await box.click();
  await box.press('ControlOrMeta+a');
  const typedMs = await typeAndTime(() => box.pressSequentially('20:00'));
  await expect(box, 'nothing may move the focus out of the box').toBeFocused();
  await expect.poll(() => persistedValue(data, 'match.clock')).toBe('20:00');
  await expectOneEditOneWrite(data, typedMs);
});

test('a refresh arriving mid-word never overwrites the box under the cursor', async ({ page }) => {
  // THE REVERT HAZARD. The tree moves under a box that is being typed into - a feed tick, a
  // second operator, or this page's own recovery after a refused write - and the box is a
  // CONTROLLED input, so whatever the tree now says lands in it mid-word. THE RULE: a box holding
  // an uncommitted edit shows what was typed and nothing else, until that edit is committed.
  //
  // THE PROBE is the PLAYOUT tab writing the same path. Offline that is the same door a server
  // refresh comes through - ProductionPage's `storage` listener - and it costs one `evaluate`,
  // which neither fronts a tab nor moves the focus, so the box under test keeps its caret.
  //
  // It runs WHILE the word is still being typed, because an uncommitted edit is only
  // uncommitted for as long as the typing keeps it so. Awaiting the write and then typing would
  // be a race against this panel's own settle timer; typing THROUGH the write is not.
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Mid Word');
  const dataOne = await openData(page);
  await addValue(dataOne, 'match.home.name', 'Suomi');

  const box = dataOne.getByTestId('data-value-match.home.name');
  await box.click();
  await box.press('ControlOrMeta+a');
  await box.pressSequentially('Hels');
  await expect(
    box,
    `a box with an uncommitted edit says so - unless the machine stalled past the ${SETTLE_MS}ms settle window between the last keystroke and this assertion`,
  ).toHaveAttribute('data-dirty', 'true');

  await Promise.all([
    page.evaluate((key: string) => {
      const store = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<
        string,
        { match?: { home?: { name?: string } } }
      >;
      const tree = store[Object.keys(store)[0]];
      if (!tree?.match?.home) throw new Error('the production tree is not where this probe expects it');
      tree.match.home.name = 'Norge';
      localStorage.setItem(key, JSON.stringify(store));
    }, PRODUCTION_DATA_KEY),
    box.pressSequentially('inki', { delay: 100 }),
  ]);

  // The word is whole: nothing that arrived while it was being typed reached the box.
  await expect(box, 'the arriving write must not reach a box under the cursor').toHaveValue('Helsinki');
  await box.blur();
  await expect(box).toHaveValue('Helsinki');
  // …and the edit wins its own path when it commits, over the value that arrived meanwhile.
  await expect.poll(() => persistedValue(dataOne, 'match.home.name')).toBe('Helsinki');
});

// ── Data sources C1a: "Fill from… Paste rows" and starter data (data AC-2 adapter half, AC-4, AC-13) ──

/** A download's text, read the way a spreadsheet would open it. */
async function downloaded(page: Page, click: () => Promise<void>): Promise<{ name: string; text: string }> {
  const [download] = await Promise.all([page.waitForEvent('download'), click()]);
  const chunks: Buffer[] = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk as Buffer);
  return { name: download.suggestedFilename(), text: Buffer.concat(chunks).toString('utf8') };
}

/** The stored values of a production's cues, in rundown order. */
async function storedCueValues(page: Page, showId: string): Promise<Record<string, string>[]> {
  return page.evaluate(async (id) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return (loadShows().find((s) => s.id === id)?.cues ?? []).map((c) => c.values);
  }, showId);
}

test('Paste rows fills a ticker, a schedule, standings and credits, flags malformed rows, and the starter rows carry what it filled', async ({ page }) => {
  test.setTimeout(120_000);
  await bootstrapGraphic(page, { name: 'News Strip' });
  const showId = await productionFor(page, 'Paste Night');
  for (const name of ['Schedule Board', 'League Table', 'Classic Roll']) await addCatalogGraphic(page, showId, name);
  const cues = page.getByTestId('cue-list').locator('.pd-cue');
  await expect(cues).toHaveCount(4);
  const preview = page.frameLocator('iframe[title="Cue preview"]');
  const menu = page.getByTestId('cue-rows-menu');

  /** Open the cue's Fill from… menu and paste, as cells from a spreadsheet arrive: tab-separated. */
  const paste = async (cue: number, rows: string[][]) => {
    await cues.nth(cue).locator('.pd-cue-label').click();
    await page.getByTestId('cue-rows-from').click();
    await menu.getByTestId('cue-rows-paste').fill(rows.map((r) => r.join('\t')).join('\n'));
  };
  const starter = () => downloaded(page, async () => {
    await page.getByTestId('cue-rows-from').click();
    await menu.getByTestId('cue-rows-starter').click();
  });

  // ── A ticker: one cell per row, a second cell is the kicker, `|` is plain text. ──
  await paste(0, [['SPORT', 'United win 3-0'], ['Polls close at 20:00'], ['Markets | Börsen']]);
  await expect(menu.getByTestId('cue-rows-row')).toHaveCount(3);
  await expect(menu.getByTestId('cue-rows-flag')).toHaveCount(0);
  // Nothing changes before Fill: the menu previews, the cue keeps its words.
  await expect(page.getByTestId('cue-field-f0')).not.toHaveValue(/United win/);
  await menu.getByTestId('cue-rows-fill').click();
  await expect(menu).toBeHidden();
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('SPORT\tUnited win 3-0\nPolls close at 20:00\nMarkets | Börsen');
  await expect(preview.locator('#ticker-track')).toContainText('United win 3-0');
  await expect(preview.locator('#ticker-track .ticker-kicker').first()).toContainText('SPORT');
  await expect(preview.locator('#ticker-track')).toContainText('Markets | Börsen');
  // A fill prepares; only Take airs.
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
  const tickerRows = await starter();
  expect(tickerRows.name).toBe('news-strip-rows.csv');
  expect(tickerRows.text).toBe('SPORT,United win 3-0\r\nPolls close at 20:00\r\nMarkets | Börsen\r\n');
  await page.keyboard.press('Escape');

  // ── A schedule: Time | Programme; its starter header is skipped, a half row is flagged. ──
  await paste(1, [['Time', 'Programme'], ['20:00', 'News at Eight'], ['21:00', ''], ['22:00', 'Q | A live']]);
  await expect(menu.getByTestId('cue-rows-flag')).toHaveCount(1);
  await expect(menu.getByTestId('cue-rows-flag')).toContainText('21:00');
  await menu.getByTestId('cue-rows-fill').click();
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('20:00 | News at Eight\n21:00 |\n22:00 | Q | A live');
  // The board drops the half row on air, as its own parser always has.
  await expect(preview.locator('.infographic-row')).toHaveCount(2);
  await expect(preview.locator('.infographic-row').nth(1)).toContainText('Q | A live');
  expect((await starter()).text).toBe('Time,Programme\r\n20:00,News at Eight\r\n21:00,\r\n22:00,Q | A live\r\n');
  await page.keyboard.press('Escape');

  // ── Standings: the header row names the columns; both fields change in one edit. ──
  await paste(2, [['Team', 'P', 'W', 'PTS'], ['Liquid', '5', '4', '12'], ['NAVI', '5', '3', '9', '+6']]);
  await expect(menu.getByTestId('cue-rows-flag')).toHaveCount(1);
  await expect(menu.getByTestId('cue-rows-flag')).toContainText('4 values for 3 columns');
  await menu.getByTestId('cue-rows-fill').click();
  await expect(page.getByTestId('cue-field-f3')).toHaveValue('P | W | PTS');
  await expect(page.getByTestId('cue-field-f2')).toHaveValue('Liquid | 5 | 4 | 12\nNAVI | 5 | 3 | 9 | +6');
  await expect(preview.locator('.results-board-col')).toHaveText(['P', 'W', 'PTS']);
  await expect(preview.locator('.results-board-row')).toHaveCount(2);
  expect((await starter()).text).toBe('Name,P,W,PTS\r\nLiquid,5,4,12\r\nNAVI,5,3,9,+6\r\n');
  await page.keyboard.press('Escape');

  // ── Credits: headings, a role waiting for names, a section break. ──
  await paste(3, [['Role', 'Name'], ['# CREW', ''], ['Director', 'Ann Lee'], ['Camera', ''], ['', 'Bo Chen'], ['', ''], ['# THANKS', '']]);
  await expect(menu.getByTestId('cue-rows-flag')).toHaveCount(0);
  await menu.getByTestId('cue-rows-fill').click();
  const credits = '# CREW\nDirector | Ann Lee\nCamera:\nBo Chen\n\n# THANKS';
  await expect(page.getByTestId('cue-field-f0')).toHaveValue(credits);
  await expect(preview.locator('#credits-track')).toContainText('Ann Lee');
  await expect(preview.locator('#credits-track')).toContainText('Bo Chen');
  expect((await starter()).text).toBe('Role,Name\r\n# CREW,\r\nDirector,Ann Lee\r\nCamera,\r\n,Bo Chen\r\n,\r\n# THANKS,\r\n');
  await page.keyboard.press('Escape');

  // ── Saved into the cues, with no source and no account: a reload has them, and Take airs one. ──
  await expect.poll(async () => (await storedCueValues(page, showId))[3]?.f0).toBe(credits);
  const stored = await storedCueValues(page, showId);
  expect(stored[0].f0).toContain('Markets | Börsen');
  expect(stored[2]).toMatchObject({ f3: 'P | W | PTS' });
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await cues.nth(1).locator('.pd-cue-label').click();
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('20:00 | News at Eight\n21:00 |\n22:00 | Q | A live');
  await page.getByTestId('verb-take').click();
  const program = page.frameLocator('[data-testid="program-stage"] iframe[title="Schedule Board"]');
  await expect(program.locator('.infographic-row')).toHaveCount(2);
  await expect(program.locator('.infographic-row').nth(0)).toContainText('News at Eight');
});

test('a graphic downloads its data template: one Field ID, Label and Value row per value, quoted where a spreadsheet needs it', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Template Night');
  await page.getByTestId('cue-field-f0').fill('Smith, "The Rock"');
  await page.getByTestId('cue-field-f1').fill('007');
  await page.getByTestId('cue-advanced-toggle').click();
  const file = await downloaded(page, () => page.getByTestId('cue-data-template').click());
  expect(file.name).toBe('hairline-data-template.csv');
  const rows = file.text.trimEnd().split('\r\n');
  expect(rows[0]).toBe('Field ID,Label,Value');
  expect(rows[1]).toMatch(/^f0,[^,]+,"Smith, ""The Rock"""$/);
  expect(rows[2]).toMatch(/^f1,[^,]+,007$/);
  // Every row names a field of this graphic by its id, once.
  const ids = rows.slice(1).map((r) => r.split(',')[0]);
  expect(new Set(ids).size).toBe(ids.length);
  for (const id of ids) await expect(page.locator(`[data-testid="cue-field-${id}"], [data-testid^="cue-field-${id}-"]`).first()).toBeAttached();
});

// ── CONNECT DATA: a Google Sheet tab drives a graphic (data-sources C1b; sheet-data-flow AC-1,
//    AC-2, AC-6, AC-7, AC-8) ─────────────────────────────────────────────────────────────────
// The Sheet is a stub this spec serves itself at Google's export address: the reader builds that
// address from the stored id and tab, so the route is exactly what a real Sheet would answer.

const SHEET_LINK = 'https://docs.google.com/spreadsheets/d/1NoaCGStubSheet0000000000/edit#gid=0';

/** A stub Sheet tab: the export answers with whatever `tab.csv` holds at the moment of the read. */
async function stubSheet(page: Page, csv: string): Promise<{ csv: string; status: number; reads: number }> {
  const tab = { csv, status: 200, reads: 0 };
  await page.context().route(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[^/]+\/export/, async (route) => {
    tab.reads += 1;
    await route.fulfill({ status: tab.status, contentType: 'text/csv', headers: { 'access-control-allow-origin': '*' }, body: tab.csv });
  });
  return tab;
}

/** Open the edited cue's Connect data… and read the Sheet tab; answers the review. */
async function readSheetTab(page: Page, link = SHEET_LINK) {
  await page.getByTestId('cue-connect').click();
  const review = page.getByTestId('cue-connect-menu');
  await review.getByTestId('cue-connect-link').fill(link);
  await review.getByTestId('cue-connect-read').click();
  await expect(review.getByTestId('cue-connect-map')).toBeVisible();
  return review;
}

/** Reuse the production's one source on the edited cue's graphic; answers the review. */
async function reuseSource(page: Page) {
  await page.getByTestId('cue-connect').click();
  const review = page.getByTestId('cue-connect-menu');
  const reuse = review.getByTestId('cue-connect-reuse');
  await reuse.selectOption({ index: 1 });
  await expect(review.getByTestId('cue-connect-map')).toBeVisible();
  return review;
}

async function storedBindings(page: Page, showId: string) {
  return page.evaluate(async (id) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const show = loadShows().find((s) => s.id === id);
    return { bindings: show?.bindings ?? {}, sources: show?.sources ?? [] };
  }, showId);
}

test('Connect data previews the whole graphic, connects it in one confirmation and follows the Sheet; cancel, repair, rename, Pause and Disconnect', async ({ page }) => {
  test.setTimeout(120_000);
  const tab = await stubSheet(page, 'Name,Value\nName,Ann Lee\nRole,Chief Editor\n');
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  const showId = await productionFor(page, 'Sheet Night');
  await addCatalogGraphic(page, showId, 'Underline');
  const cues = page.getByTestId('cue-list').locator('.pd-cue');
  await expect(cues).toHaveCount(2);
  await cues.nth(0).locator('.pd-cue-label').click();
  const preview = page.frameLocator('iframe[title="Cue preview"]');

  // ── The review: every field's proposal, the counts, the cues it affects, on the real graphic. ──
  let review = await readSheetTab(page);
  await expect(review.getByTestId('cue-connect-row-f0')).toHaveAttribute('data-status', 'name');
  await expect(review.getByTestId('cue-connect-row-f1')).toHaveAttribute('data-status', 'unmatched');
  await expect(review.getByTestId('cue-connect-summary')).toContainText('1 connected · 1 needs attention · Used by 1 cue');
  await expect(preview.locator('#f0')).toHaveText('Ann Lee');
  // Cancel writes nothing, and the preview returns to the cue.
  await review.getByTestId('cue-connect-cancel').click();
  await expect(review).toBeHidden();
  await expect(preview.locator('#f0')).not.toHaveText('Ann Lee');
  expect(await storedBindings(page, showId)).toEqual({ bindings: {}, sources: [] });
  await expect(page.getByTestId('cue-bound-f0')).toHaveCount(0);

  // ── Repair the unmatched field by hand, then ONE confirmation. ──
  review = await readSheetTab(page);
  await review.getByTestId('cue-connect-pick-f1').selectOption({ label: 'Role' });
  await expect(review.getByTestId('cue-connect-summary')).toContainText('2 connected');
  await review.getByTestId('cue-connect-label').fill('News desk');
  await review.getByTestId('cue-connect-confirm').click();
  await expect(review).toBeHidden();
  const stored = await storedBindings(page, showId);
  expect(stored.sources).toHaveLength(1);
  const sourceId = stored.sources[0].id;
  expect(stored.bindings).toEqual({ Hairline: { f0: `sheet.${sourceId}.values.Name`, f1: `sheet.${sourceId}.values.Role` } });
  await expect(page.getByTestId('cue-bound-f0')).toContainText('Sheet: News desk');
  await expect(page.getByTestId('cue-bound-f0').locator('input')).toHaveValue('Ann Lee');
  await expect(page.getByTestId('cue-bound-f1').locator('input')).toHaveValue('Chief Editor');
  await expect(page.getByTestId(`source-line-${sourceId}`)).toContainText(/Sheet: News desk · checked \d+ s ago/);

  // ── The equal title on the other graphic stays the cue's own. ──
  await cues.nth(1).locator('.pd-cue-label').click();
  await expect(page.getByTestId('cue-bound-f0')).toHaveCount(0);
  await expect(page.getByTestId('cue-field-f0')).not.toHaveValue('Ann Lee');
  await cues.nth(0).locator('.pd-cue-label').click();

  // ── On air, a cell edit reaches PROGRAM with no Take. ──
  await page.getByTestId('verb-take').click();
  const program = page.frameLocator('[data-testid="program-stage"] iframe[title="Hairline"]');
  await expect(program.locator('#f0')).toHaveText('Ann Lee');
  tab.csv = 'Name,Value\nName,Bo Chen\nRole,Chief Editor\n';
  await expect(program.locator('#f0')).toHaveText('Bo Chen', { timeout: 15_000 });

  // ── A display rename keeps the connection. ──
  review = await reuseSource(page);
  await review.getByTestId('cue-connect-label').fill('Studio guests');
  await review.getByTestId('cue-connect-confirm').click();
  await expect(page.getByTestId('cue-bound-f0')).toContainText('Sheet: Studio guests');
  expect((await storedBindings(page, showId)).bindings.Hairline.f0).toBe(`sheet.${sourceId}.values.Name`);

  // ── Pause holds the values; Resume brings the change. ──
  const line = page.getByTestId(`source-line-${sourceId}`);
  await line.getByTestId('source-pause').click();
  await expect(line).toContainText('paused');
  tab.csv = 'Name,Value\nName,Cy Dale\nRole,Chief Editor\n';
  const reads = tab.reads;
  await page.waitForTimeout(7_000);
  expect(tab.reads, 'paused: nothing is read').toBe(reads);
  await expect(program.locator('#f0')).toHaveText('Bo Chen');
  await line.getByTestId('source-pause').click();
  await expect(program.locator('#f0')).toHaveText('Cy Dale', { timeout: 10_000 });

  // ── A failed read keeps the values and names the fix. ──
  tab.status = 403;
  await expect(line).toContainText('can’t read it (not shared)', { timeout: 10_000 });
  await expect(line.getByTestId('source-fix')).toContainText('Anyone with the link');
  await expect(program.locator('#f0')).toHaveText('Cy Dale');
  tab.status = 200;
  await expect(line).toContainText('checked', { timeout: 10_000 });

  // ── Disconnect returns the field to the cue holding its last value. ──
  await page.getByTestId('cue-bound-f0').getByTestId('cue-disconnect').click();
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Cy Dale');
  await expect(page.getByTestId('cue-bound-f1')).toBeVisible();
  expect((await storedBindings(page, showId)).bindings).toEqual({ Hairline: { f1: `sheet.${sourceId}.values.Role` } });
  await page.getByTestId('cue-bound-f1').getByTestId('cue-disconnect').click();
  await expect(page.getByTestId('cue-field-f1')).toHaveValue('Chief Editor');
  expect(await storedBindings(page, showId), 'the last field gone, the source goes too').toEqual({ bindings: {}, sources: [] });
  await expect(line).toHaveCount(0);
});

test('the Playout sources line stays whichever cue is selected, tells checked from changed, and pauses there', async ({ page }) => {
  test.setTimeout(120_000);
  const tab = await stubSheet(page, 'Name,Value\nName,Ann Lee\n');
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  const showId = await productionFor(page, 'Sheet Status');
  await addCatalogGraphic(page, showId, 'Underline');
  const cues = page.getByTestId('cue-list').locator('.pd-cue');
  await expect(cues).toHaveCount(2);
  await cues.nth(0).locator('.pd-cue-label').click();
  const review = await readSheetTab(page);
  await review.getByTestId('cue-connect-label').fill('Guests');
  await review.getByTestId('cue-connect-confirm').click();
  const { sources } = await storedBindings(page, showId);
  const line = page.getByTestId(`source-line-${sources[0].id}`);
  const status = line.getByTestId('source-status');
  await expect(status).toHaveText(/^Sheet: Guests · checked \d+ s ago · changed \d+ s ago$/);

  // The line is the production's: a graphic that follows no source still shows it.
  await cues.nth(1).locator('.pd-cue-label').click();
  await expect(page.getByTestId('cue-connect')).toBeVisible();
  await expect(line).toBeVisible();

  // Unchanged reads move "checked" and leave "changed" behind, and that is healthy, not stale.
  const ages = async () => {
    const m = /checked (\d+) s ago · changed (\d+) s ago/.exec((await status.textContent()) ?? '');
    return m ? Number(m[2]) - Number(m[1]) : null;
  };
  await expect.poll(ages, { timeout: 15_000 }).toBeGreaterThanOrEqual(5);
  await expect(line).not.toHaveAttribute('data-stale', 'true');
  // A changed cell brings "changed" back to the read that saw it.
  tab.csv = 'Name,Value\nName,Bo Chen\n';
  await expect.poll(ages, { timeout: 12_000 }).toBeLessThanOrEqual(1);

  // Pause and Resume on the line itself.
  await line.getByTestId('source-pause').click();
  await expect(status).toHaveText('Sheet: Guests · paused');
  await expect(line).toHaveAttribute('data-state', 'paused');
  const reads = tab.reads;
  await page.waitForTimeout(6_000);
  expect(tab.reads, 'paused: nothing is read').toBe(reads);
  // A reload keeps the source, its name and its Pause (data-sources C2: the record holds them).
  await settleDurableWrites(page);
  await page.reload();
  await expect(status).toHaveText('Sheet: Guests · paused', { timeout: 20_000 });
  await page.waitForTimeout(6_000);
  expect(tab.reads, 'still paused after the reload: nothing is read').toBe(reads);
  await line.getByTestId('source-pause').click();
  await expect(status).toHaveText(/checked \d+ s ago/, { timeout: 10_000 });
  expect(tab.reads).toBeGreaterThan(reads);
});

test('twelve Sheet rows reach a ticker on air without a new entrance, and an emptied tab clears it', async ({ page }) => {
  test.setTimeout(120_000);
  const twelve = Array.from({ length: 12 }, (_, i) => `Headline ${i + 1}`).join('\n');
  const tab = await stubSheet(page, 'First line\n');
  await bootstrapGraphic(page, { name: 'News Strip' });
  await productionFor(page, 'Ticker Sheet');
  await page.getByTestId('verb-take').click();
  const program = page.frameLocator('[data-testid="program-stage"] iframe[title="News Strip"]');
  await expect(program.locator('#ticker-track')).not.toBeEmpty();
  const stage = page.locator('[data-testid="program-stage"] [data-plays], [data-testid="program-stage"][data-plays]').first();
  const plays = await stage.getAttribute('data-plays');

  const review = await readSheetTab(page);
  await expect(review.getByTestId('cue-connect-row-f0')).toHaveAttribute('data-status', 'key');
  await expect(review.getByTestId('cue-connect-preview')).toContainText('First line');
  await review.getByTestId('cue-connect-confirm').click();
  await expect(program.locator('#f0')).toHaveText('First line', { timeout: 10_000 });
  // A connected list is read-only here and says where to edit it.
  await expect(page.getByTestId('cue-bound-f0')).toContainText('Edit in the Sheet, or Disconnect to edit here');

  tab.csv = `${twelve}\n`;
  await expect.poll(async () => ((await program.locator('#f0').textContent()) ?? '').split('\n').length, { timeout: 12_000 }).toBe(12);
  await expect(program.locator('#ticker-track')).toContainText('Headline 12');
  await expect(program.locator('#f0')).toHaveText(twelve);
  await expect(page.getByTestId('cue-bound-f0').locator('textarea')).toHaveValue(twelve);
  // It updated the running strip: no new entrance was played, nothing was taken.
  expect(await stage.getAttribute('data-plays')).toBe(plays);

  tab.csv = '';
  await expect(program.locator('#f0')).toHaveText('', { timeout: 12_000 });
  await expect(page.getByTestId('sources-line')).toContainText('empty');
  expect(await stage.getAttribute('data-plays')).toBe(plays);
});

test('Sheet tabs fill a schedule, standings and credits on air, and each follows its own tab without a new entrance (C7)', async ({ page }) => {
  // data-sources AC-16: schedule, standings and credits from a Sheet, beside the ticker above.
  test.setTimeout(120_000);
  const tabs: Record<string, string> = {
    '1': 'Time,Programme\n20:00,News at Eight\n22:00,Late show\n',
    '2': 'Name,P,W,PTS\nLiquid,5,4,12\nNAVI,5,3,9\n',
    '3': 'Role,Name\n# CREW,\nDirector,Ann Lee\n',
  };
  await page.context().route(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[^/]+\/export/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/csv',
      headers: { 'access-control-allow-origin': '*' },
      body: tabs[new URL(route.request().url()).searchParams.get('gid') ?? ''] ?? '',
    }),
  );
  await bootstrapGraphic(page, { name: 'Schedule Board' });
  const showId = await productionFor(page, 'Sheet Boards');
  for (const name of ['League Table', 'Classic Roll']) await addCatalogGraphic(page, showId, name);
  const cues = page.getByTestId('cue-list').locator('.pd-cue');
  await expect(cues).toHaveCount(3);
  for (const [i, gid] of ['1', '2', '3'].entries()) {
    await cues.nth(i).locator('.pd-cue-label').click();
    const review = await readSheetTab(page, SHEET_LINK.replace('gid=0', `gid=${gid}`));
    await review.getByTestId('cue-connect-confirm').click();
    await expect(review).toBeHidden();
    await page.getByTestId('verb-take').click();
  }
  const program = (title: string) => page.frameLocator(`[data-testid="program-stage"] iframe[title="${title}"]`);
  const schedule = program('Schedule Board');
  const table = program('League Table');
  const roll = program('Classic Roll');
  await expect(schedule.locator('.infographic-row')).toHaveCount(2, { timeout: 12_000 });
  await expect(schedule.locator('.infographic-row').nth(0)).toContainText('News at Eight');
  await expect(table.locator('.results-board-col')).toHaveText(['P', 'W', 'PTS'], { timeout: 12_000 });
  await expect(table.locator('.results-board-row')).toHaveCount(2);
  await expect(roll.locator('#credits-track')).toContainText('Ann Lee', { timeout: 12_000 });
  const stage = page.locator('[data-testid="program-stage"] [data-plays], [data-testid="program-stage"][data-plays]').first();
  const plays = await stage.getAttribute('data-plays');

  // Each tab changes; each board follows its own, and nothing is taken again.
  tabs['1'] = 'Time,Programme\n20:00,News at Eight\n22:00,Late show\n23:00,Night film\n';
  tabs['2'] = 'Name,P,W,PTS\nNAVI,6,4,12\nLiquid,6,4,12\nG2,6,1,3\n';
  tabs['3'] = 'Role,Name\n# CREW,\nDirector,Ann Lee\nCamera,Bo Chen\n';
  await expect(schedule.locator('.infographic-row')).toHaveCount(3, { timeout: 12_000 });
  await expect(schedule.locator('.infographic-row').nth(2)).toContainText('Night film');
  await expect(table.locator('.results-board-row')).toHaveCount(3, { timeout: 12_000 });
  await expect(table.locator('.results-board-row').nth(0)).toContainText('NAVI');
  await expect(roll.locator('#credits-track')).toContainText('Bo Chen', { timeout: 12_000 });
  expect(await stage.getAttribute('data-plays')).toBe(plays);
});

test('one Sheet score on two boards updates both; a ± press moves the shared value until its cell changes', async ({ page }) => {
  test.setTimeout(120_000);
  const tab = await stubSheet(page, 'Field ID,Label,Value\nf1,Home score,0\n');
  await bootstrapGraphic(page, { name: 'House Score' });
  const showId = await productionFor(page, 'Sheet Derby');
  await addSecondGraphic(page, 'Club Scorebug', showId);
  const cues = page.getByTestId('cue-list').locator('.pd-cue');

  let review = await readSheetTab(page);
  await expect(review.getByTestId('cue-connect-row-f1')).toHaveAttribute('data-status', 'key');
  await review.getByTestId('cue-connect-confirm').click();
  await cues.nth(1).locator('.pd-cue-label').click();
  // Sharing is explicit: the second board reuses the source by choice, and the review counts both.
  review = await reuseSource(page);
  await expect(review.getByTestId('cue-connect-summary')).toContainText('Used by 2 cues');
  await review.getByTestId('cue-connect-confirm').click();
  const { bindings, sources } = await storedBindings(page, showId);
  expect(sources).toHaveLength(1);
  expect(bindings['House Score'].f1).toBe(bindings['Club Scorebug'].f1);

  await cues.nth(0).locator('.pd-cue-label').click();
  await page.getByTestId('verb-take').click();
  await cues.nth(1).locator('.pd-cue-label').click();
  await page.getByTestId('verb-take').click();
  const strip = page.frameLocator('[data-testid="program-stage"] iframe[data-layer="20"]');
  const bug = page.frameLocator('[data-testid="program-stage"] iframe[data-layer="21"]');
  tab.csv = 'Field ID,Label,Value\nf1,Home score,2\n';
  await expect(strip.locator('#f1')).toHaveText('2', { timeout: 12_000 });
  await expect(bug.locator('#f1')).toHaveText('2');

  // The operator wins: one press moves the shared value on both boards, and the unchanged cell
  // does not put it back.
  await page.getByTestId('live-number-f1-up').click();
  await expect(bug.locator('#f1')).toHaveText('3');
  await expect(strip.locator('#f1')).toHaveText('3');
  await page.waitForTimeout(7_000);
  await expect(strip.locator('#f1')).toHaveText('3');
  // The cell changes: the Sheet wins again.
  tab.csv = 'Field ID,Label,Value\nf1,Home score,5\n';
  await expect(strip.locator('#f1')).toHaveText('5', { timeout: 12_000 });
  await expect(bug.locator('#f1')).toHaveText('5');
});

test('a connected field the graphic lacks is flagged, a removed graphic is named, and a graphic that reads a Sheet itself is refused', async ({ page }) => {
  test.setTimeout(120_000);
  await stubSheet(page, 'Name,Value\nName,Ann Lee\n');
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  const showId = await productionFor(page, 'Sheet Repairs');
  await addCatalogGraphic(page, showId, 'Underline');
  const cues = page.getByTestId('cue-list').locator('.pd-cue');
  await expect(cues).toHaveCount(2);
  await cues.nth(0).locator('.pd-cue-label').click();
  let review = await readSheetTab(page);
  await review.getByTestId('cue-connect-confirm').click();
  await cues.nth(1).locator('.pd-cue-label').click();
  review = await reuseSource(page);
  await review.getByTestId('cue-connect-confirm').click();
  await expect(page.getByTestId('cue-bound-f0')).toBeVisible();

  // A connection to a field Hairline does not have (its template changed under it).
  const { sources } = await storedBindings(page, showId);
  await page.evaluate(
    async ({ showId, path }) => {
      const { setFieldBindings } = await import('/src/model/shows.ts');
      setFieldBindings(showId, [{ graphic: 'Hairline', fieldId: 'f9', path }]);
    },
    { showId, path: `sheet.${sources[0].id}.values.Name` },
  );
  await cues.nth(0).locator('.pd-cue-label').click();
  const missing = page.getByTestId('cue-source-missing');
  await expect(missing).toContainText('F9 is connected to Sheet: Hairline, but this graphic has no F9');
  await missing.getByTestId('cue-disconnect-f9').click();
  await expect(missing).toHaveCount(0);

  // Underline leaves the production: the review names it instead of redirecting its connection.
  await page.evaluate(async (showId) => {
    const { loadShows, removeShowGraphic } = await import('/src/model/shows.ts');
    const g = loadShows().find((s) => s.id === showId)?.graphics.find((x) => x.name === 'Underline');
    if (g) removeShowGraphic(showId, g.id);
  }, showId);
  await expect(cues).toHaveCount(1);
  review = await reuseSource(page);
  await expect(review.getByTestId('cue-connect-removed')).toContainText('Underline no longer in this production');
  await review.getByTestId('cue-connect-cancel').click();

  // A graphic whose own code reads a Sheet is refused until that code moves here.
  await page.evaluate(async (showId) => {
    const { loadShows, addGraphicToShow } = await import('/src/model/shows.ts');
    const { liveDataBlock } = await import('/src/control/liveData.ts');
    const template = loadShows().find((s) => s.id === showId)!.graphics[0].template;
    const js = `${template.js}\n${liveDataBlock({ csvUrl: 'https://docs.google.com/spreadsheets/d/e/x/pub?output=csv', pollSeconds: 5, fields: template.fields })}`;
    addGraphicToShow(showId, { ...template, name: 'Legacy Card', js });
  }, showId);
  await expect(cues).toHaveCount(2);
  await cues.nth(1).locator('.pd-cue-label').click();
  await page.getByTestId('cue-connect').click();
  await expect(page.getByTestId('cue-connect-legacy')).toContainText('reads a Sheet in its own code');
  await expect(page.getByTestId('cue-connect-link')).toHaveCount(0);
});

test('one way to connect a Sheet: a graphic with its own reader still updates on air, is listed without Pause, and moves here only through Stop its own reader (C6)', async ({ page }) => {
  test.setTimeout(100_000);
  // The graphic's own block reads this address every second, as a saved graphic's would.
  const own = { csv: 'Name,Title\nLive Ada,From The Sheet\n' };
  await page.context().route('http://sheet-test.local/legacy.csv', (route) =>
    route.fulfill({ status: 200, contentType: 'text/csv', headers: { 'access-control-allow-origin': '*' }, body: own.csv }),
  );
  await stubSheet(page, 'Name,Value\nName,Bo Chen\n');
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  const showId = await productionFor(page, 'Legacy Sheet');
  await page.evaluate(async (showId) => {
    const { loadShows, addGraphicToShow } = await import('/src/model/shows.ts');
    const { liveDataBlock } = await import('/src/control/liveData.ts');
    const template = loadShows().find((s) => s.id === showId)!.graphics[0].template;
    const js = `${template.js}\n${liveDataBlock({ csvUrl: 'http://sheet-test.local/legacy.csv', pollSeconds: 1, fields: template.fields })}`;
    addGraphicToShow(showId, { ...template, name: 'Legacy Card', js });
  }, showId);
  const cues = page.getByTestId('cue-list').locator('.pd-cue');
  await expect(cues).toHaveCount(2);

  // ── Retained: listed beside the sources, honestly without a Pause it could not keep. ──
  const ownLine = page.getByTestId('own-reader-line');
  await expect(ownLine).toContainText('Sheet in Legacy Card’s own code');
  await expect(ownLine).toContainText('Pause does not stop it');
  await expect(ownLine.getByRole('button')).toHaveCount(0);
  // The Data view lists it as a source too, and its Advanced bindings refuse a second writer,
  // as the binding write itself does whatever the door.
  const data = await openData(page);
  await expect(data.getByTestId('own-reader-line')).toContainText('Pause does not stop it');
  await expect(data.getByTestId('bind-own-reader-Legacy Card-f0')).toContainText('reads a Sheet in its own code');
  await data.close();
  const boundAnyway = await page.evaluate(async (showId) => {
    const { setFieldBinding, loadShows } = await import('/src/model/shows.ts');
    setFieldBinding(showId, 'Legacy Card', 'f0', 'guest.name');
    return loadShows().find((s) => s.id === showId)!.bindings?.['Legacy Card'] ?? null;
  }, showId);
  expect(boundAnyway).toBeNull();

  // ── Retained: its block still drives the graphic on air. ──
  await cues.nth(1).locator('.pd-cue-label').click();
  await page.getByTestId('verb-take').click();
  const program = page.frameLocator('[data-testid="program-stage"] iframe[title="Legacy Card"]');
  await expect(program.locator('#f0')).toHaveText('Live Ada', { timeout: 10_000 });
  own.csv = 'Name,Title\nLive Grace,Second row\n';
  await expect(program.locator('#f0')).toHaveText('Live Grace', { timeout: 10_000 });

  // ── The explicit migration: Connect data… offers it first, Keep it changes nothing. ──
  await page.getByTestId('cue-connect').click();
  const menu = page.getByTestId('cue-connect-menu');
  await expect(menu.getByTestId('cue-connect-legacy')).toContainText('Legacy Card reads a Sheet in its own code (http://sheet-test.local/legacy.csv)');
  await expect(menu.getByTestId('cue-connect-link')).toHaveCount(0);
  await menu.getByTestId('cue-connect-keep').click();
  await expect(menu).toBeHidden();
  await page.getByTestId('cue-connect').click();
  await menu.getByTestId('cue-connect-retire').click();
  // The reader is gone from the production's copy, the line with it, and the review is here.
  await expect(menu.getByTestId('cue-connect-link')).toBeVisible();
  await expect(ownLine).toHaveCount(0);
  const legacyJs = await page.evaluate(async (showId) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((s) => s.id === showId)!.graphics.find((g) => g.name === 'Legacy Card')!.template.js;
  }, showId);
  expect(legacyJs).not.toContain('== LIVE DATA');
  await menu.getByTestId('cue-connect-link').fill(SHEET_LINK);
  await menu.getByTestId('cue-connect-read').click();
  await expect(menu.getByTestId('cue-connect-map')).toBeVisible();
  await menu.getByTestId('cue-connect-confirm').click();
  await expect(menu).toBeHidden();
  const stored = await storedBindings(page, showId);
  expect(stored.bindings['Legacy Card']).toEqual({ f0: `sheet.${stored.sources[0].id}.values.Name` });

  // ── One writer: the production's Sheet moves the field, and the old address no longer can. ──
  await page.getByTestId('verb-take').click();
  await expect(program.locator('#f0')).toHaveText('Bo Chen', { timeout: 15_000 });
  own.csv = 'Name,Title\nLive Zed,Old reader\n';
  // Three of the old block's one-second polls, had it survived the rebuild.
  await page.waitForTimeout(3_500);
  await expect(program.locator('#f0')).toHaveText('Bo Chen');
});

/**
 * A PUBLISHED PRODUCTION FOR THE OWN-READER MIGRATION (C6), with no remote project: the backend is
 * stood in on the network (as production-controls.spec.ts does), its resolve answers `wire.fixture`,
 * and its Realtime socket plays one output's Presence entry, `wire.output` (null: none joined), so
 * the page's positive evidence (presence joined, the outputs' versions, what is on air) is driven
 * here. `silent` leaves the Presence join unanswered; `resolveDelayMs` holds the resolve back so
 * Presence answers first; `resolved` and `presenceSent` count what was answered. Every other
 * request answers empty.
 */
interface LegacyWire {
  fixture: Record<string, unknown> | null;
  output: { ver: { n: number; h: string }; waiting?: string[] } | null;
  silent?: boolean;
  resolveDelayMs?: number;
  resolved?: number;
  presenceSent?: number;
}

async function standInBackend(page: Page, wire: LegacyWire): Promise<void> {
  const backend = 'https://legacy.supabase.test';
  await page.route('**/src/backend/config.ts*', (route) => route.fulfill({ contentType: 'text/javascript', body: `
    export function loadBackendConfig() { return { url: '${backend}', anonKey: 'anon-test-key' }; }
    export function isBackendConfigured(cfg = loadBackendConfig()) { return Boolean(cfg.url && cfg.anonKey); }
  ` }));
  await page.route(`${backend}/**`, (route) => {
    const headers = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS', 'content-type': 'application/json' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const path = new URL(route.request().url()).pathname;
    if (!path.endsWith('/rpc/control_show_resolve')) return route.fulfill({ status: 200, headers, body: '[]' });
    const body = JSON.stringify(wire.fixture);
    return new Promise<void>((done) => setTimeout(done, wire.resolveDelayMs ?? 0))
      .then(() => route.fulfill({ status: 200, headers, body }))
      .then(() => {
        wire.resolved = (wire.resolved ?? 0) + 1;
      })
      .catch(() => {});
  });
  // Realtime, protocol 2.0.0 (JSON arrays): every push is answered ok, and a join of a `live-`
  // topic is answered with the output's Presence entry.
  await page.routeWebSocket(/legacy\.supabase\.test\/realtime\/v1\/websocket/, (ws) => {
    ws.onMessage((message) => {
      if (typeof message !== 'string') return;
      const [joinRef, ref, topic, event, payload] = JSON.parse(message) as [string | null, string | null, string, string, Record<string, unknown>];
      if (ref === null) return;
      if (event === 'phx_join' && topic.startsWith('realtime:live-') && wire.silent) return;
      const changes = event === 'phx_join' ? ((payload.config as { postgres_changes?: object[] } | undefined)?.postgres_changes ?? []) : [];
      const response = event === 'phx_join' ? { postgres_changes: changes.map((c, i) => ({ ...c, id: i + 1 })) } : {};
      ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response }]));
      if (event !== 'phx_join' || !topic.startsWith('realtime:live-') || !wire.output) return;
      const { ver, waiting } = wire.output;
      const entry = {
        kind: 'output', id: 'legacyout01', engine: 'OBS · Chromium 127', build: 'test', proto: 1, surface: 'output', log: true, cmd: true, at: Date.now(),
        ready: { n: 1, of: 1, v: ver, is: [], ...(waiting ? { chg: { s: 'waiting', v: ver, of: 1, n: 0, air: waiting.length, w: waiting } } : {}) },
      };
      ws.send(JSON.stringify([joinRef, null, topic, 'presence_state', { legacyout01: { metas: [{ phx_ref: 'legacy-ref-1', ...entry }] } }]));
      wire.presenceSent = (wire.presenceSent ?? 0) + 1;
    });
  });
}

/** Seed a library graphic whose code reads a Sheet, used by a published production ("Live Night")
 *  and one other, with the resolve answering what it published. */
async function seedPublishedLegacy(page: Page, wire: LegacyWire): Promise<{ docId: string; showId: string; cueId: string }> {
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
  await awaitDurableReady(page);
  const seeded = await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const { liveDataBlock } = await import('/src/control/liveData.ts');
    const { createShowNamed, addGraphicToShow, setShowHostedSlug, setShowOutputSlug, loadShows } = await import('/src/model/shows.ts');
    const { buildOutputPayload } = await import('/src/control/hostedControl.ts');
    const { stampPayload } = await import('/src/control/payloadVersion.ts');
    const template = variantsFor('lower-third')[0].create({});
    const js = `${template.js}\n${liveDataBlock({ csvUrl: 'http://sheet-test.local/library.csv', pollSeconds: 60, fields: template.fields })}`;
    const { doc, error } = createGraphic({ ...template, js }, { name: 'Library Card' });
    if (error || !doc) throw new Error(error ?? 'seed failed');
    const live = createShowNamed('Live Night');
    addGraphicToShow(live.id, doc.template, { graphicId: doc.id });
    setShowHostedSlug(live.id, 'legacy-slug');
    setShowOutputSlug(live.id, 'legacy-output');
    const other = createShowNamed('Other Night');
    addGraphicToShow(other.id, doc.template, { graphicId: doc.id });
    const show = loadShows().find((s) => s.id === live.id)!;
    const output = await buildOutputPayload(show);
    output.ver = await stampPayload(output, null);
    const cueId = show.cues!.find((c) => c.sourceId === show.graphics[0].id)!.id;
    return { docId: doc.id, cueId, fixture: { id: live.id, title: live.name, output, live: {}, staged: {}, last_event_id: 0 } };
  });
  wire.fixture = seeded.fixture;
  await settleDurableWrites(page);
  return { docId: seeded.docId, showId: seeded.fixture.id, cueId: seeded.cueId };
}

/** What Publish does after Stop (refresh the copy from the design through the app's own
 *  `refreshGraphicCopies`, which records the stop, then publish a payload without the reader, a
 *  new version), with the graphic still on air: the output keeps its old frame. */
async function publishWithoutReader(page: Page, wire: LegacyWire, ids: { showId: string; cueId: string }): Promise<{ n: number; h: string }> {
  const fixture = wire.fixture as { output: { ver: unknown } };
  const published = await page.evaluate(async ({ showId, previous }) => {
    const { loadShows, refreshGraphicCopies } = await import('/src/model/shows.ts');
    const { loadGraphics, resolveSavedGraphicDoc } = await import('/src/model/library.ts');
    const { buildOutputPayload } = await import('/src/control/hostedControl.ts');
    const { stampPayload } = await import('/src/control/payloadVersion.ts');
    const library = loadGraphics();
    refreshGraphicCopies(showId, (g) => {
      const doc = resolveSavedGraphicDoc(g, library);
      return doc ? { template: doc.template, updatedAt: doc.updatedAt } : undefined;
    });
    const output = await buildOutputPayload(loadShows().find((s) => s.id === showId)!);
    output.ver = await stampPayload(output, previous as never);
    return output;
  }, { showId: ids.showId, previous: fixture.output.ver });
  await settleDurableWrites(page);
  wire.fixture = { ...wire.fixture, output: published, live_cue: { v: 2, layers: { 'Library Card': { cue: ids.cueId } } } };
  const ver = (published as { ver: { n: number; h: string } }).ver;
  return { n: ver.n, h: ver.h };
}

/** The production's record and this browser's own-reader stores, read through the app. */
async function ownReaderState(page: Page, showId: string) {
  return page.evaluate(async (showId) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const { formerReaders, ownReaderHolds } = await import('/src/model/ownReaderHolds.ts');
    const show = loadShows().find((s) => s.id === showId)!;
    return {
      stops: show.ownReaderStops ?? [],
      copy: show.graphics[0].template.js.includes('== LIVE DATA'),
      former: [...formerReaders(showId)],
      holds: [...ownReaderHolds(showId)],
    };
  }, showId);
}

/** Try the binding write directly, as any door does; answers what it stored. */
async function bindAnyway(page: Page, showId: string) {
  return page.evaluate(async (showId) => {
    const { setFieldBinding, loadShows } = await import('/src/model/shows.ts');
    setFieldBinding(showId, 'Library Card', 'f0', 'guest.name');
    return loadShows().find((s) => s.id === showId)!.bindings?.['Library Card'] ?? null;
  }, showId);
}

/** Open the production, or reload it when it is open (a hash-only goto would not resolve again). */
async function openLegacyConnect(page: Page, showId: string) {
  if (page.url().includes(`#/production/${showId}`)) await page.reload();
  else await page.goto(`/app#/production/${showId}`);
  await expect(page.getByTestId('program-monitor-name')).toHaveText('PROGRAM · ON AIR');
  await page.getByTestId('cue-list').locator('.pd-cue').first().locator('.pd-cue-label').click();
  await page.getByTestId('cue-connect').click();
  return page.getByTestId('cue-connect-menu');
}

test('a library graphic with its own reader on a published production: Stop removes it from the design for every production, Connect waits for Publish, then for the clear, across a reload (C6)', async ({ page }) => {
  test.setTimeout(110_000);
  const wire: LegacyWire = { fixture: null, output: null };
  await standInBackend(page, wire);
  const ids = await seedPublishedLegacy(page, wire);
  let menu = await openLegacyConnect(page, ids.showId);
  // The removal reaches the shared design, and says how far.
  await expect(menu.getByTestId('cue-connect-retire-scope')).toContainText('also in 1 other production using it');
  await menu.getByTestId('cue-connect-retire').click();
  // Published: the output runs the copy, which keeps the reader until Publish.
  await expect(menu.getByTestId('cue-connect-publish-first')).toContainText('Publish changes, then connect here');
  await expect(menu.getByTestId('cue-connect-link')).toHaveCount(0);
  await expect(page.getByTestId('own-reader-line')).toContainText('Sheet in Library Card’s own code');
  const design = await page.evaluate(async (docId) => (await import('/src/model/library.ts')).loadGraphics().find((d) => d.id === docId)!.template.js.includes('== LIVE DATA'), ids.docId);
  expect(design).toBe(false);
  // The copy keeps it (synced, so every browser refuses on it) until Publish.
  await expect.poll(() => ownReaderState(page, ids.showId)).toEqual({ stops: [], copy: true, former: ['Library Card'], holds: ['Library Card'] });

  // ── Published without the reader, still on air: the output keeps the old frame until the clear. ──
  const ver = await publishWithoutReader(page, wire, ids);
  // Publish recorded the stop on the production itself, for every browser.
  expect((await ownReaderState(page, ids.showId)).stops).toEqual(['Library Card']);
  wire.output = { ver, waiting: ['Library Card'] };
  // A reload in the middle: the copy, the design and the payload are clean, and the hold restores.
  menu = await openLegacyConnect(page, ids.showId);
  await expect(menu.getByTestId('cue-connect-clear-first')).toContainText('take it out, then connect here');
  await expect(menu.getByTestId('cue-connect-link')).toHaveCount(0);
  await expect(page.getByTestId('own-reader-line')).toHaveCount(0);
  expect(await bindAnyway(page, ids.showId)).toBeNull();
  await expect.poll(() => ownReaderState(page, ids.showId)).toEqual({ stops: ['Library Card'], copy: false, former: ['Library Card'], holds: ['Library Card'] });

  // ── Anything short of positive evidence keeps it held, whatever else is true. ──
  const stillHeld = async (why: string, answered: () => boolean) => {
    menu = await openLegacyConnect(page, ids.showId);
    await expect.poll(answered, { message: `${why}: the wire answered` }).toBe(true);
    // Settled: a release would have been written by now (it is one effect after the answer).
    await page.waitForTimeout(1_000);
    await expect(menu.getByTestId('cue-connect-clear-first'), why).toBeVisible();
    expect((await ownReaderState(page, ids.showId)).stops, why).toEqual(['Library Card']);
  };
  const answeredAfter = (resolved: number, presence: number) => () => (wire.resolved ?? 0) > resolved && (wire.presenceSent ?? 0) > presence;
  // Off air, but the output still holds the version before (it has not taken the Out's swap).
  wire.fixture = { ...wire.fixture, live_cue: { v: 2, layers: {} } };
  wire.output = { ver: { n: ver.n - 1, h: 'the-version-before' } };
  await stillHeld('an output on another version', answeredAfter(wire.resolved ?? 0, wire.presenceSent ?? 0));
  // Off air, but Presence never joins: no output can be judged.
  wire.output = { ver };
  wire.silent = true;
  await stillHeld('Presence not joined', ((r) => () => (wire.resolved ?? 0) > r)(wire.resolved ?? 0));
  wire.silent = false;
  // On air with no output in Presence (one can drop out and keep its frame), and the page reopened:
  // an on-air map is not evidence until the resolve has answered, however late.
  wire.fixture = { ...wire.fixture, live_cue: { v: 2, layers: { 'Library Card': { cue: ids.cueId } } } };
  wire.output = null;
  wire.resolveDelayMs = 2_500;
  await stillHeld('live state not yet recovered', ((r) => () => (wire.resolved ?? 0) > r)(wire.resolved ?? 0));
  wire.resolveDelayMs = 0;

  // ── Positive evidence: off air, the live state recovered, the output on the published version. ──
  wire.fixture = { ...wire.fixture, live_cue: { v: 2, layers: {} } };
  wire.output = { ver };
  menu = await openLegacyConnect(page, ids.showId);
  await expect(menu.getByTestId('cue-connect-link')).toBeVisible();
  await expect.poll(() => ownReaderState(page, ids.showId)).toEqual({ stops: [], copy: false, former: [], holds: [] });
  expect(await bindAnyway(page, ids.showId)).toEqual({ f0: 'guest.name' });
});

test('a reader stopped in one browser holds the graphic in another that never saw it, until positive evidence releases it (C6)', async ({ page, browser }) => {
  test.setTimeout(110_000);
  const wire: LegacyWire = { fixture: null, output: null };
  await standInBackend(page, wire);
  const ids = await seedPublishedLegacy(page, wire);
  // Browser A stops the reader and publishes while the graphic is on air.
  const menuA = await openLegacyConnect(page, ids.showId);
  await menuA.getByTestId('cue-connect-retire').click();
  await expect(menuA.getByTestId('cue-connect-publish-first')).toBeVisible();
  const ver = await publishWithoutReader(page, wire, ids);
  wire.output = { ver, waiting: ['Library Card'] };
  // What reaches another browser is the synced production record and library design, exactly as
  // A stored them; nothing of A's own device-local history comes with it.
  const synced = await page.evaluate(async () => {
    const { durable } = await import('/src/model/durableStore.ts');
    return { shows: durable.getItem('spx-gfx-shows'), graphics: durable.getItem('spx-gfx-graphics') };
  });
  await page.close();

  const other = await browser.newContext();
  try {
    const b = await other.newPage();
    await standInBackend(b, wire);
    await b.goto('/app#/home');
    await expect(b.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
    await awaitDurableReady(b);
    await b.evaluate(async (synced) => {
      const { durable } = await import('/src/model/durableStore.ts');
      durable.setItem('spx-gfx-graphics', synced.graphics!);
      durable.setItem('spx-gfx-shows', synced.shows!);
      await new Promise((r) => setTimeout(r));
    }, synced);
    await settleDurableWrites(b);
    // It never saw the reader: design, copy and payload are clean, and it has no history of its own.
    expect(await ownReaderState(b, ids.showId)).toEqual({ stops: ['Library Card'], copy: false, former: [], holds: [] });
    // Every binding door refuses, Connect included, while the output may still run the old frame.
    expect(await bindAnyway(b, ids.showId)).toBeNull();
    let menu = await openLegacyConnect(b, ids.showId);
    await expect(menu.getByTestId('cue-connect-clear-first')).toBeVisible();
    await expect(menu.getByTestId('cue-connect-link')).toHaveCount(0);
    await expect.poll(() => ownReaderState(b, ids.showId)).toMatchObject({ stops: ['Library Card'], holds: ['Library Card'] });
    const data = await openData(b);
    await expect(data.getByTestId('bind-own-reader-Library Card-f0')).toContainText('reads a Sheet in its own code');
    await data.close();

    // Taken out and the output on the published version: released, here and on the record.
    wire.fixture = { ...wire.fixture, live_cue: { v: 2, layers: {} } };
    wire.output = { ver };
    menu = await openLegacyConnect(b, ids.showId);
    await expect(menu.getByTestId('cue-connect-link')).toBeVisible();
    await expect.poll(() => ownReaderState(b, ids.showId)).toEqual({ stops: [], copy: false, former: [], holds: [] });
    expect(await bindAnyway(b, ids.showId)).toEqual({ f0: 'guest.name' });
  } finally {
    await other.close();
  }
});

test('a new graphic is offered no graphic-level Sheet panel (C6)', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /^Project [▾▸]$/ }).click();
  await expect(page.getByText(/^Operator fields ·/)).toBeVisible();
  await expect(page.getByRole('region', { name: 'Live data', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Add live data' })).toHaveCount(0);
});

test('Connect closes only once the save landed, and a changed link needs a fresh read', async ({ page }) => {
  test.setTimeout(120_000);
  await armStorageFailure(page);
  await stubSheet(page, 'Name,Value\nName,Ann Lee\n');
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Sheet Saves');

  // Editing the link after a read drops that read: nothing old can be connected.
  let review = await readSheetTab(page);
  await review.getByTestId('cue-connect-link').fill(`${SHEET_LINK}0`);
  await expect(review.getByTestId('cue-connect-map')).toHaveCount(0);
  await expect(review.getByTestId('cue-connect-confirm')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Storage refuses the write: the review stays, says so, and Connect can be pressed again.
  review = await readSheetTab(page);
  await fillStorage(page);
  await review.getByTestId('cue-connect-confirm').click();
  await expect(review.getByTestId('cue-connect-save-error')).toContainText('Not saved');
  await expect(review.getByTestId('cue-connect-map')).toBeVisible();
  await freeStorage(page);
  await review.getByTestId('cue-connect-confirm').click();
  await expect(review).toBeHidden();
  await expect(page.getByTestId('cue-bound-f0')).toContainText('Sheet: Hairline');
});

// ── A NEWS FEED drives a ticker (data-sources C4; AC-5, AC-11) ───────────────────────────────
// The feed is a stub this spec serves at NoaCG's own feed route, which is what the page asks: the
// page never reads a feed itself. The route's guard and cache are the Node test's
// (scripts/feed-fetch.test.mjs) and the configured spec's (e2e/configured/feed-route.spec.ts).

const FEED_ADDRESS = 'https://news.example/rss.xml';

/** A stub of the feed route: it answers whatever `feed` holds at the moment of the read. */
async function stubFeed(page: Page, items: string[]) {
  const feed = { items, failing: false, asked: [] as string[] };
  await page.context().route(/\/api\/data\/feed\?/, async (route) => {
    feed.asked.push(new URL(route.request().url()).searchParams.get('url') ?? '');
    await route.fulfill(
      feed.failing
        ? { status: 502, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'the feed answered 500', fix: 'Reading carries on by itself.', failingSince: null, items: feed.items }) }
        : { status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, items: feed.items, fetchedAt: new Date().toISOString() }) },
    );
  });
  return feed;
}

test('a pasted news feed fills a ticker with its headlines, and a failed fetch keeps the list and says since when', async ({ page }) => {
  test.setTimeout(120_000);
  const feed = await stubFeed(page, ['Storm warning for the coast', 'Markets close higher', 'Local team wins final']);
  await bootstrapGraphic(page, { name: 'News Strip' });
  const showId = await productionFor(page, 'Feed Ticker');
  await page.getByTestId('verb-take').click();
  const program = page.frameLocator('[data-testid="program-stage"] iframe[title="News Strip"]');
  await expect(program.locator('#ticker-track')).not.toBeEmpty();

  // A ticker's Connect data… takes a feed's address in the same box as a Sheet's link.
  await page.getByTestId('cue-connect').click();
  const review = page.getByTestId('cue-connect-menu');
  await review.getByTestId('cue-connect-link').fill(FEED_ADDRESS);
  await review.getByTestId('cue-connect-read').click();
  await expect(review.getByTestId('cue-connect-preview')).toContainText('Storm warning for the coast');
  await expect(review.getByTestId('cue-connect-row-f0')).toHaveAttribute('data-status', 'key');
  expect(feed.asked).toEqual([FEED_ADDRESS]);
  await review.getByTestId('cue-connect-confirm').click();

  const headlines = 'Storm warning for the coast\nMarkets close higher\nLocal team wins final';
  await expect(program.locator('#f0')).toHaveText(headlines, { timeout: 10_000 });
  await expect(page.getByTestId('cue-bound-f0')).toContainText('Connected to News feed');
  await expect(page.getByTestId('cue-connected-mark')).toContainText('News feed: News Strip');
  const stored = await storedBindings(page, showId);
  expect(stored.sources).toEqual([{ id: expect.any(String), kind: 'feed', label: 'News Strip', config: { url: FEED_ADDRESS } }]);
  expect(stored.bindings['News Strip']).toEqual({ f0: `feed.${stored.sources[0].id}.lines` });
  const line = page.getByTestId('sources-line');
  await expect(line).toContainText('News feed: News Strip');
  await expect(line.locator('[data-testid^="source-line-"]')).toHaveAttribute('title', /about every 5 min/);

  // The feed fails: Resume reads at once, nothing is written, the ticker keeps its list, and the
  // line says what failed and since when.
  feed.failing = true;
  feed.items = ['Should not air'];
  await line.getByTestId('source-pause').click();
  await expect(line.getByTestId('source-pause')).toHaveText('Resume');
  await line.getByTestId('source-pause').click();
  await expect(line.getByTestId('source-status')).toContainText(/the feed answered 500 since \d{1,2}[:.]\d{2}/, { timeout: 10_000 });
  await expect(line.getByTestId('source-fix')).toContainText('Reading carries on by itself');
  await expect(program.locator('#f0')).toHaveText(headlines);
  await expect(page.getByTestId('cue-bound-f0').locator('textarea')).toHaveValue(headlines);
});
