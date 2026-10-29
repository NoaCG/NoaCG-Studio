// guards: src/control/contentFormats.ts
//
// THE FORMAT ADAPTERS (docs/work-specs/data-sources/spec.md, "Formats", phase C1a; data AC-2
// adapter half, AC-4, AC-13 starter and scalar half), run in Node against the real module.
//
// What is pinned: each adapter writes the text its graphic's own parser reads (the fixtures the
// spec's "Formats" section names, one test each); the header rule; a valid empty read writes ""
// and never an array; starter rows carry the field's current content and fill back to it; and
// the custom graphic's `Field ID,Label,Value` template is keyed by id, survives quoting, Unicode,
// leading zeros and formula-looking text, and diagnoses duplicate, unknown, incompatible and
// missing rows rather than redirecting them.

import assert from 'node:assert/strict';
import test from 'node:test';
import './lib/tsResolve.mjs';

const {
  fillList,
  listFormatFor,
  parseScalarCsv,
  pastedCells,
  scalarFields,
  scalarTemplateCsv,
  starterCsv,
  starterRows,
  tableRows,
} = await import('../src/control/contentFormats.ts');
const { parseDelimited } = await import('../src/model/csv.ts');

const LINES = { adapter: 'lines', main: 'f0' };
const SCHEDULE = { adapter: 'schedule', main: 'f0' };
const STANDINGS = { adapter: 'standings', main: 'f2', headers: 'f3' };
const CREDITS = { adapter: 'credits', main: 'f0' };

/** Cells as a spreadsheet selection pastes them. */
const tsv = (rows) => rows.map((r) => r.join('\t')).join('\n');

test('a graphic field takes the adapter of what the graphic is, never of its title', () => {
  const g = (type, js = '') => ({ type, template: { js } });
  assert.deepEqual(listFormatFor(g('ticker'), 'f0'), LINES);
  assert.equal(listFormatFor(g('ticker'), 'f1'), null);
  assert.deepEqual(listFormatFor(g('end-credits'), 'f0'), CREDITS);
  assert.deepEqual(listFormatFor(g('infographic', "'<span class=\"infographic-time\">'"), 'f0'), SCHEDULE);
  assert.equal(listFormatFor(g('infographic', 'bar rows'), 'f0'), null, 'a bar chart is not a schedule');
  assert.deepEqual(listFormatFor(g('results-board', "'<span class=\"results-board-row-cells\">'"), 'f2'), STANDINGS);
  assert.deepEqual(listFormatFor(g('results-board', "'<span class=\"results-board-row-cells\">'"), 'f3'), STANDINGS);
  assert.equal(listFormatFor(g('results-board', 'roster'), 'f2'), null, 'a roster is not a standings board');
  assert.equal(listFormatFor(g('lower-third'), 'f0'), null);
});

test('pasted cells: a spreadsheet selection splits at tabs, a document gives one cell per line', () => {
  assert.deepEqual(pastedCells('a\tb\r\nc\td\n'), [['a', 'b'], ['c', 'd']]);
  assert.deepEqual(pastedCells('one\ntwo | three'), [['one'], ['two | three']]);
  // One copied column: no tabs, but a cell with a line break still comes quoted.
  assert.deepEqual(pastedCells('"Line one\nline two"\nNext'), [['Line one\nline two'], ['Next']]);
  // A document line that is merely in quotes keeps them.
  assert.deepEqual(pastedCells('"Quoted headline"\nNext'), [['"Quoted headline"'], ['Next']]);
  // A cell holding a line break comes quoted from a spreadsheet, and stays one cell.
  assert.deepEqual(pastedCells('"two\nlines"\tx'), [['two\nlines', 'x']]);
  assert.deepEqual(pastedCells('"say ""hi"""\tx'), [['say "hi"', 'x']]);
  // A cell that merely OPENS with a quotation is not quoted: it stays as typed, and no row is lost.
  assert.deepEqual(pastedCells('"Unbelievable" says coach\tSPORT'), [['"Unbelievable" says coach', 'SPORT']]);
  assert.deepEqual(pastedCells('SPORT\t"Quote of the day\nNext\tY'), [['SPORT', '"Quote of the day'], ['Next', 'Y']]);
});

// ── lines (tickers) ─────────────────────────────────────────────────────────

test('lines: twelve rows are twelve lines in order, and | is plain text', () => {
  const rows = Array.from({ length: 12 }, (_, i) => [`Story ${i + 1}`]);
  rows[4] = ['Markets | Börsen'];
  const fill = fillList(LINES, rows);
  const lines = fill.values.f0.split('\n');
  assert.equal(lines.length, 12);
  assert.equal(lines[0], 'Story 1');
  assert.equal(lines[4], 'Markets | Börsen', 'a ticker never splits at |: tk17 reads it as a language break');
  assert.equal(fill.rows.filter((r) => r.problem).length, 0);
});

test('lines: a second cell joins with a tab, with and without a header row (lines have none)', () => {
  const body = [['SPORT', 'United win 3-0'], ['', 'Polls close at 20:00'], ['Weather: storm warning']];
  const without = fillList(LINES, pastedCells(tsv(body)));
  assert.equal(without.values.f0, 'SPORT\tUnited win 3-0\nPolls close at 20:00\nWeather: storm warning');
  // The colon kicker stays the ticker's own rule: the adapter leaves the text alone.
  const withHeader = fillList(LINES, pastedCells(tsv([['Kicker', 'Story'], ...body])));
  assert.equal(withHeader.values.f0.split('\n')[0], 'Kicker\tStory', 'a header row is content: the lines starter has none');
  assert.equal(withHeader.values.f0.split('\n').length, 4);
});

test('lines: an interior blank row is kept (it closes an open kicker), the ends are trimmed', () => {
  const fill = fillList(LINES, pastedCells('\nSPORT:\nUnited win\n\nNews\n\n'));
  assert.equal(fill.values.f0, 'SPORT:\nUnited win\n\nNews');
});

test('lines: a third cell is flagged, not silently joined', () => {
  const fill = fillList(LINES, [['A', 'B', 'C']]);
  assert.equal(fill.values.f0, 'A\tB');
  assert.match(fill.rows[0].problem, /first two cells/);
});

// ── schedule ────────────────────────────────────────────────────────────────

test('schedule: Time and Programme join with " | ", and a programme may contain |', () => {
  const fill = fillList(SCHEDULE, pastedCells(tsv([['20:00', 'News at Eight'], ['21:00', 'Q | A live']])));
  assert.equal(fill.values.f0, '20:00 | News at Eight\n21:00 | Q | A live');
  assert.equal(fill.rows.filter((r) => r.problem).length, 0);
});

test('schedule: the starter header is skipped, any other first row is content', () => {
  assert.equal(fillList(SCHEDULE, [['time', 'programme'], ['20:00', 'News']]).values.f0, '20:00 | News');
  assert.equal(fillList(SCHEDULE, [['Start', 'Show'], ['20:00', 'News']]).values.f0, 'Start | Show\n20:00 | News');
});

test('schedule: a row missing either half is flagged and written as the board will drop it', () => {
  const fill = fillList(SCHEDULE, [['20:00', ''], ['', 'Late Edition'], ['21:00', 'Debate']]);
  assert.deepEqual(fill.rows.map((r) => Boolean(r.problem)), [true, true, false]);
  assert.equal(fill.values.f0, '20:00 |\n| Late Edition\n21:00 | Debate');
});

test('schedule: document lines already in the field format split at the first pipe', () => {
  const fill = fillList(SCHEDULE, pastedCells('20:00 | News\n21:00 | Q | A'));
  assert.equal(fill.values.f0, '20:00 | News\n21:00 | Q | A');
  // The starter header written as one document line is the header too.
  assert.equal(fillList(SCHEDULE, pastedCells('Time | Programme\n20:00 | News')).values.f0, '20:00 | News');
  assert.equal(fillList(CREDITS, pastedCells('Role | Name\nHost | Ann')).values.f0, 'Host | Ann');
});

// ── standings ───────────────────────────────────────────────────────────────

test('standings: the header row fills the headers field, the body the rows, in one edit', () => {
  const fill = fillList(STANDINGS, pastedCells(tsv([
    ['Team', 'P', 'W', 'D', 'L', 'PTS'],
    ['Liquid', '5', '4', '1', '0', '13'],
    ['NAVI', '5', '3', '1', '1', '10', '+6'],
  ])));
  assert.deepEqual(Object.keys(fill.values).sort(), ['f2', 'f3']);
  assert.equal(fill.values.f3, 'P | W | D | L | PTS');
  assert.equal(fill.values.f2, 'Liquid | 5 | 4 | 1 | 0 | 13\nNAVI | 5 | 3 | 1 | 1 | 10 | +6');
  // Five stat columns, a body row with six values: flagged, kept as written.
  assert.equal(fill.rows[1].problem, undefined);
  assert.match(fill.rows[2].problem, /6 values for 5 columns/);
});

test('standings: the header row is content by definition, and a nameless row is flagged', () => {
  const fill = fillList(STANDINGS, [['Name', 'PTS'], ['', '9']]);
  assert.equal(fill.values.f3, 'PTS');
  assert.equal(fill.rows[0].problem, undefined);
  assert.match(fill.rows[1].problem, /name/);
  // Rows pasted without their header: the first team would become the columns, so it is flagged.
  const headless = fillList(STANDINGS, pastedCells('Liquid | 5 | +4 | 12\nNAVI | 5 | 3 | 9'));
  assert.match(headless.rows[0].problem, /first row names the columns/);
});

test('credits: a role alone longer than the credits label limit is flagged', () => {
  const role = 'Executive Producer for International Co-Productions';
  const fill = fillList(CREDITS, [[role, ''], ['', 'Ann']]);
  assert.equal(fill.values.f0, `${role}:\nAnn`);
  assert.match(fill.rows[0].problem, /at most 48 characters/);
  assert.equal(fillList(CREDITS, [['x'.repeat(48), ''], ['', 'Ann']]).rows[0].problem, undefined);
});

// ── credits ─────────────────────────────────────────────────────────────────

test('credits: a heading keeps no trailing empty cell, a role alone becomes "Role:", a blank row is a section break', () => {
  const fill = fillList(CREDITS, pastedCells(tsv([
    ['Role', 'Name'],
    ['# PRODUCTION', ''],
    ['Director', 'Ann Lee'],
    ['Camera', ''],
    ['', 'Bo Chen'],
    ['', 'Cy Dahl'],
    ['', ''],
    ['# THANKS', ''],
    ['Catering', 'Dot & Co'],
    ['', ''],
    ['', ''],
  ])));
  assert.equal(
    fill.values.f0,
    '# PRODUCTION\nDirector | Ann Lee\nCamera:\nBo Chen\nCy Dahl\n\n# THANKS\nCatering | Dot & Co',
  );
});

test('credits: lines from a document pass through in the credits grammar', () => {
  const fill = fillList(CREDITS, pastedCells('# CAST\nHost: Ann\nCamera Operators:\nBo\nCy'));
  assert.equal(fill.values.f0, '# CAST\nHost: Ann\nCamera Operators:\nBo\nCy');
});

// ── empty ───────────────────────────────────────────────────────────────────

test('an empty tab writes "" to every field the adapter owns, never an array', () => {
  for (const format of [LINES, SCHEDULE, CREDITS]) {
    assert.deepEqual(fillList(format, []).values, { f0: '' });
    assert.deepEqual(fillList(format, [[''], ['', '']]).values, { f0: '' });
  }
  assert.deepEqual(fillList(STANDINGS, []).values, { f2: '', f3: '' });
  assert.deepEqual(fillList(SCHEDULE, [['Time', 'Programme']]).values, { f0: '' }, 'a starter header alone is an empty list');
});

// ── rows (tables) ───────────────────────────────────────────────────────────

test('rows: one row is one table row, by column position, never joined', () => {
  const columns = [{ key: 'name', label: 'Name' }, { key: 'role', label: 'Role' }];
  const { rows, problems } = tableRows(columns, [['Name', 'Role'], ['Ann', 'Host | Anchor'], ['Bo', 'Guest', 'extra']]);
  assert.deepEqual(rows, [{ name: 'Ann', role: 'Host | Anchor' }, { name: 'Bo', role: 'Guest' }]);
  assert.deepEqual(problems, [{ row: 3, message: '3 cells for 2 columns' }]);
});

// ── starter rows ────────────────────────────────────────────────────────────

test('starter rows carry the field content and the adapter header, and fill back to the same text', () => {
  const cases = [
    [LINES, { f0: 'SPORT\tUnited win\nMarkets | Börsen\n\nNews' }, null],
    [SCHEDULE, { f0: '20:00 | News at Eight\n21:00 | Q | A live' }, ['Time', 'Programme']],
    [STANDINGS, { f2: 'Liquid | 4 | 12\nNAVI | 3 | 9', f3: 'W | PTS' }, ['Name', 'W', 'PTS']],
    [CREDITS, { f0: '# PRODUCTION\nDirector | Ann\nCamera:\nBo\n\n# THANKS\nEveryone' }, ['Role', 'Name']],
  ];
  for (const [format, values, header] of cases) {
    const rows = starterRows(format, values);
    if (header) assert.deepEqual(rows[0], header, `${format.adapter} starts with its header`);
    // Through a real CSV file and back, as a download opened in a spreadsheet would be.
    const back = fillList(format, parseDelimited(starterCsv(format, values), ','));
    assert.deepEqual(back.values, values, `${format.adapter} round trip`);
  }
});

test('an empty lines field downloads an empty file, a schedule its header', () => {
  assert.equal(starterCsv(LINES, { f0: '' }), '');
  assert.equal(starterCsv(SCHEDULE, { f0: '' }), 'Time,Programme\r\n');
});

// ── the custom graphic's data template ─────────────────────────────────────

const FIELDS = [
  { key: 'f0', label: 'Slot 1 home', kind: 'text', defaultValue: 'TBD' },
  { key: 'f1', label: 'Slot 1 away', kind: 'text', defaultValue: 'TBD' },
  { key: 'f2', label: 'Round', kind: 'number', defaultValue: 1 },
  { key: 'f3', label: 'Live', kind: 'toggle', defaultValue: '0' },
  { key: 'f4', label: 'Stage', kind: 'select', defaultValue: 'semi', options: [{ label: 'Semi', value: 'semi' }, { label: 'Final', value: 'final' }] },
];

test('the data template lists every scalar field by id, label and current value', () => {
  const graphic = { type: 'ticker', template: { js: '' } };
  const kept = scalarFields(graphic, [
    { key: 'f0', label: 'Items', kind: 'lines', defaultValue: '' },
    { key: 'f1', label: 'Label', kind: 'text', defaultValue: 'NEWS' },
    { key: 'f2', label: 'Logo', kind: 'image', defaultValue: '' },
  ]);
  assert.deepEqual(kept.map((d) => d.key), ['f1'], 'the list field has its own starter rows; a picture is not a value');
  const csv = scalarTemplateCsv(FIELDS, { f0: 'Ålesund', f2: '2' });
  assert.equal(csv.split('\r\n')[0], 'Field ID,Label,Value');
  assert.equal(csv.split('\r\n')[1], 'f0,Slot 1 home,Ålesund');
  assert.equal(csv.split('\r\n')[2], 'f1,Slot 1 away,TBD', 'an unset value is the default');
});

test('the data template round-trips quoting, Unicode, leading zeros and formula-looking text', () => {
  const values = { f0: 'Smith, "The Rock"', f1: '=SUM(A1)', f2: '007', f3: '1', f4: 'final' };
  const back = parseScalarCsv(scalarTemplateCsv(FIELDS, values), FIELDS);
  assert.deepEqual(back.problems, []);
  assert.deepEqual(back.values, values);
  const multi = parseScalarCsv(scalarTemplateCsv([{ key: 'f0', label: 'Body', kind: 'lines', defaultValue: '' }], { f0: 'Hyvää\nиюль 日本' }), [{ key: 'f0', label: 'Body', kind: 'lines', defaultValue: '' }]);
  assert.deepEqual(multi.values, { f0: 'Hyvää\nиюль 日本' });
});

test('rows reordered and labels edited still reach the fields their ids name, and nothing else', () => {
  const text = 'Field ID,Label,Value\nf4,Which stage,final\nf1,Visitors,Sweden\nf0,Hosts,Finland\nf3,On air?,true\nf2,Round no,3\n';
  const { values, problems } = parseScalarCsv(text, FIELDS);
  assert.deepEqual(problems, []);
  assert.deepEqual(values, { f0: 'Finland', f1: 'Sweden', f2: '3', f3: '1', f4: 'final' });
});

test('an empty Value clears; a missing row keeps its value and is reported', () => {
  const { values, problems } = parseScalarCsv('Field ID,Label,Value\nf0,Slot 1 home,\nf2,Round,4\nf3,Live,0\nf4,Stage,semi\n', FIELDS);
  assert.deepEqual(values, { f0: '', f2: '4', f3: '0', f4: 'semi' });
  assert.deepEqual(problems.map((p) => p.field), ['f1']);
  assert.match(problems[0].message, /missing, so it keeps its value/);
});

test('duplicate, unknown and incompatible rows are diagnosed and never redirected', () => {
  const text = [
    'Field ID,Label,Value',
    'f0,Slot 1 home,Finland',
    'f0,Slot 1 home again,Norway',
    'f9,Slot 9,Denmark',
    ',Orphan,Iceland',
    'f2,Round,three',
    'f3,Live,maybe',
    'f4,Stage,quarter',
    'f1,Slot 1 away,Sweden',
  ].join('\n');
  const { values, problems } = parseScalarCsv(text, FIELDS);
  assert.deepEqual(values, { f1: 'Sweden' }, 'only the sound row is applied');
  const said = problems.map((p) => p.message).join('\n');
  assert.match(said, /f0 \(Slot 1 home\) is on rows 2 and 3/);
  assert.match(said, /no field f9/);
  assert.match(said, /Row 5 has no Field ID/);
  assert.match(said, /f2 \(Round\) cannot hold "three"/);
  assert.match(said, /f3 \(Live\) cannot hold "maybe"/);
  assert.match(said, /f4 \(Stage\) cannot hold "quarter"/);
});

test('a blank file is every mapping missing, never a command to clear every field', () => {
  for (const text of ['', '\n\n', ',,\n']) {
    const { values, problems } = parseScalarCsv(text, FIELDS);
    assert.deepEqual(values, {});
    assert.equal(problems.length, FIELDS.length);
  }
  const headerOnly = parseScalarCsv('Field ID,Label,Value\n', FIELDS);
  assert.deepEqual(headerOnly.values, {});
  assert.equal(headerOnly.problems.length, FIELDS.length);
});

test('a file without the template header is refused with a reason', () => {
  const { values, problems } = parseScalarCsv('Name,Score\nFinland,3\n', FIELDS);
  assert.deepEqual(values, {});
  assert.match(problems[0].message, /Field ID, Label and Value/);
});

test('a semicolon export from a European spreadsheet reads the same', () => {
  const { values } = parseScalarCsv('Field ID;Label;Value\nf0;Hosts;Suomi\nf1;Away;Sverige\nf2;Round;2\nf3;Live;1\nf4;Stage;semi\n', FIELDS);
  assert.deepEqual(values, { f0: 'Suomi', f1: 'Sverige', f2: '2', f3: '1', f4: 'semi' });
});
