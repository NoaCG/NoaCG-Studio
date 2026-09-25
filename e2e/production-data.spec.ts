import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent, skipOldEditor } from './_create';
import { openWorkspace } from './_workspace';
import { settleDurableWrites } from './_durable';
import { parkFocusOffControls } from './_keys';
import { PRODUCTION_DATA_KEY } from '../src/model/productionState';

// The production DATA workspace (docs/INTERACTIVE_PLAYOUT_PLAN.md D3/D6): the show's own
// tables, edited on the Data tab, loaded into CUES on the Playout tab by deliberate operator
// action. The load fills a DRAFT — nothing reaches air except through Take.

async function productionFor(page: Page, name: string): Promise<void> {
  await openProductionWithCurrent(page, name);
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
  skipOldEditor();
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
  skipOldEditor();
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

/** Add one value to the production's live tree from the Data tab. */
async function addValue(page: Page, path: string, value: string): Promise<void> {
  await page.getByTestId('data-new-path').fill(path);
  await page.getByTestId('data-new-value').fill(value);
  await page.getByTestId('data-add').click();
  await expect(page.getByTestId(`data-row-${path}`)).toBeVisible();
}

/** The pool graphic's name, as the bindings table prints it. */
async function firstGraphicName(page: Page): Promise<string> {
  const heading = await page.locator('.pd-bind-graphic h4').first().textContent();
  return (heading ?? '').trim();
}

test('a bound field takes the LIVE value on air, and an old cue cannot re-air a stale one', async ({ page }) => {
  skipOldEditor();
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Match Night');

  // ── The playground: a nested tree, typed by what was written rather than by a schema. ──
  const data = await openWorkspace(page, 'data');
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
  await expect(data.getByTestId('data-value-match.home.name')).toHaveValue('Sweden');
  // The seed was never written, because saving one is a deliberate act - this is the whole
  // anti-churn rule (plan 2.1): live values must not touch the synced Show record.
  const onRecord = await page.evaluate(() => {
    const shows = JSON.parse(localStorage.getItem('spx-gfx-shows') ?? '[]') as { name: string; data?: unknown }[];
    return shows.find((s) => s.name === 'Match Night')?.data ?? null;
  });
  expect(onRecord).toBe(null);
});

test('the seed is the reset target, and unbinding hands the field back to the cue', async ({ page }) => {
  skipOldEditor();
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Seed Show');
  const data = await openWorkspace(page, 'data');
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

test('an unpublished production offers no data key, because it has none', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'No Key Yet');
  const data = await openWorkspace(page, 'data');

  // The key is minted at PUBLISH into the production's row (docs/DATA_API.md), so offline there
  // is nothing to reveal. A button that could never do anything is worse than no button, and
  // this is the half of that rule the offline suite can prove; the live walk
  // (e2e/configured/production-data-key.spec.ts) proves the other half, including that the
  // revealed key really authenticates.
  await expect(data.getByTestId('data-key-toggle')).toHaveCount(0);
  await expect(data.getByTestId('data-key')).toHaveCount(0);
  // The rest of the panel is untouched by its absence.
  await expect(data.getByTestId('data-raw-toggle')).toBeVisible();
});

test('nested trees, arrays and a missing path each behave as the contract says', async ({ page }) => {
  skipOldEditor();
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Shapes');
  const data = await openWorkspace(page, 'data');

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
  const data = await openWorkspace(page, 'data');
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
  skipOldEditor();
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Show One');
  const showOneUrl = page.url();
  // EACH PRODUCTION GETS ITS OWN WORKSPACE TAB, because the workspaces open in their own tab
  // now and a tab is opened onto ONE production. Re-using the first production's tab for the
  // second would be asking a question about that tab, not about the scoping.
  const dataOne = await openWorkspace(page, 'data');
  await addValue(dataOne, 'shared.value', 'one');

  // A second production, from its own project. Same path, its own tree - the store is keyed by
  // production id, so nothing about "shared.value" is global.
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Show Two');
  const dataTwo = await openWorkspace(page, 'data');
  await expect(dataTwo.getByTestId('production-live-data')).toBeVisible();
  await expect(dataTwo.getByTestId('data-row-shared.value')).toHaveCount(0);
  await addValue(dataTwo, 'shared.value', 'two');

  // The first production's own tab still holds its own value - and it is still 'one' even
  // though the second tab wrote the same PATH a moment ago.
  await dataOne.reload();
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
  const data = await openWorkspace(page, 'data');

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
  const data = await openWorkspace(page, 'data');

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
async function addSecondGraphic(page: Page, variant: string, production: string): Promise<void> {
  await bootstrapGraphic(page, { name: variant });
  await page.getByTestId('dock-tab-control').click();
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  // A fresh document remounts the panel, so the production has to be re-picked by name.
  const value = await section.locator('select option', { hasText: production }).getAttribute('value');
  await section.locator('select').selectOption(value!);
  await section.getByRole('button', { name: '+ Add current' }).click();
  await expect(section.locator('.status-ok')).toContainText('is in the production');
  await section.getByTestId('open-production-page').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
}

test('a ± press on a bound field moves the shared value, and every graphic bound to it follows', async ({ page }) => {
  skipOldEditor();
  // THE BUG THIS CLOSES (docs/PRODUCTION_DATA_PLAN.md §2.9): the ± stepper wrote ONE field on ONE
  // graphic, so on a production where two graphics show the same score the operator moved one of
  // them and the next write of the shared value put it back. Phase 3 makes the press move the
  // VALUE, and both graphics follow through the diff that already existed.
  //
  // A big score strip and a small bug, both showing the home score, is the shape the owner asked
  // for on 2026-09-15: a score entered once shows everywhere. Both scoreboard families call the
  // home score `f1` (src/templates/scoreboards/shared.ts), so one path binds the same slot twice.
  await bootstrapGraphic(page, { name: 'House Score' });
  await productionFor(page, 'Derby Data');
  await addSecondGraphic(page, 'Club Scorebug', 'Derby Data');
  const cues = page.getByTestId('cue-list').locator('.pd-cue');
  await expect(cues).toHaveCount(2);

  // ── ONE value, bound on BOTH graphics ──
  const data = await openWorkspace(page, 'data');
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

test('an adjust on a bound field patches the tree, and the event still fires', async ({ page }) => {
  skipOldEditor();
  // The second half of AC-7. A scoreboard's GOAL carries `adjust: { f1: 1 }`, so the press used to
  // ride the new figure as the event's payload and mirror it into the cue. With f1 bound, the
  // figure is not this graphic's to carry: the event fires on its own and the score arrives as the
  // tree's own update row, on every graphic bound to the path.
  await bootstrapGraphic(page, { name: 'House Score' });
  await productionFor(page, 'Goal Data');
  await addSecondGraphic(page, 'Club Scorebug', 'Goal Data');
  const cues = page.getByTestId('cue-list').locator('.pd-cue');

  const data = await openWorkspace(page, 'data');
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
  const stored = await page.evaluate(() => {
    const shows = JSON.parse(localStorage.getItem('spx-gfx-shows') ?? '[]') as {
      name: string;
      cues: { values: Record<string, string> }[];
    }[];
    return shows.find((s) => s.name === 'Goal Data')?.cues.map((c) => c.values.f1 ?? null) ?? [];
  });
  expect(stored).not.toContain('3');
  await page.getByTestId('verb-take').click();
  await expect(strip.locator('#f1')).toHaveText('3');
});

// ── AC-8: "Bind all by title" accepts every unambiguous suggestion in one press ──────────────

test('Bind all by title binds every unambiguous title in one press, and leaves the ambiguous one bound-empty with a reason', async ({ page }) => {
  skipOldEditor();
  // Two graphics sharing a scoreboard family (both title f1 "Score A" and f0 "Team A" -
  // src/templates/scoreboards/shared.ts), so their matching titles are meant to bind in one
  // press rather than one field at a time.
  await bootstrapGraphic(page, { name: 'House Score' });
  await productionFor(page, 'Derby Bindings');
  await addSecondGraphic(page, 'Club Scorebug', 'Derby Bindings');

  const data = await openWorkspace(page, 'data');
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
  const data = await openWorkspace(page, 'data');
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
  const data = await openWorkspace(page, 'data');
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
  const dataOne = await openWorkspace(page, 'data');
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
