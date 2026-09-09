// The human types listing must survive a real terminal's width. Keep these fixtures offline:
// registry growth should never be needed to reproduce wrapping or an incorrect dropped count.
// Run `npm run build` first - like unit.test.mjs, this imports the built dist/.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { typesTable } from '../dist/commands/types.js';

function summary(id, fields, events, designs, neutral = true) {
  return {
    id, name: id, description: '', category: 'test', prefix: 'f', neutral,
    fields: fields.map(([key, kind = 'text', role = 'line']) => ({
      key, kind, role, label: key, value: '', ftype: 'textfield',
    })),
    events: events.map((event) => ({ event, label: event })),
    designs: designs.map((design) => ({ id: design, name: design, description: '', styleTag: '' })),
    capabilities: { maxLines: fields.length, logo: 'none', defaultZone: 'bottom', defaultSteps: false },
  };
}

const fixture = [
  summary('lower-third', [['name'], ['title']], ['show', 'hide'], ['clean', 'boxed']),
  summary('match-scoreboard', [
    ['home'], ['away'], ['homeScore', 'number', 'score'], ['awayScore', 'number', 'score'],
    ['period'], ['clock', 'text', 'clock'], ['venue'], ['competition'], ['homeCoach'],
    ['awayCoach'], ['homeTimeouts', 'number'], ['awayTimeouts', 'number'], ['sponsor'],
    ['headline'], ['subtitle'],
  ], [
    'show', 'hide', 'home-goal', 'away-goal', 'clock-start', 'clock-stop', 'clock-reset',
    'next-period', 'home-timeout', 'away-timeout',
  ], ['classic', 'compact', 'stadium', 'minimal', 'bold', 'glass', 'broadcast', 'tournament']),
  summary('long-item', [['anExtremelyLongFieldThatCannotFitInANarrowColumn', 'text', 'title']],
    ['an-extremely-long-event-that-cannot-fit'], ['an-extremely-long-design-that-cannot-fit'], false),
  summary('empty', [], [], [], false),
];

const headings = ['type', 'fields', 'events', 'designs', 'neutral'];

function cellsOf(rendering) {
  const lines = rendering.split('\n');
  const offsets = headings.map((heading) => lines[0].indexOf(heading));
  const widths = offsets.slice(1).map((offset, i) => offset - offsets[i] - 2);
  return {
    lines, widths,
    rows: lines.slice(1).map((line) => offsets.map((offset, i) => {
      const end = i < 4 ? offset + widths[i] : line.length;
      const cell = line.slice(offset, end);
      // Slicing at header offsets alone would hide a shifted cell. Nonempty cells must start
      // right there, and the two separator positions must contain only spaces on every row.
      if (cell.trim()) assert.notEqual(line[offset], ' ', `cell ${i} starts late: ${line}`);
      if (i < 4) assert.equal(line.slice(end, end + 2), '  ', `separator ${i}: ${line}`);
      return cell.trimEnd();
    })),
  };
}

for (const columns of [80, 100, 160]) {
  test(`types table fits and preserves whole items at ${columns} columns`, () => {
    const before = structuredClone(fixture);
    const { lines, rows, widths } = cellsOf(typesTable(fixture, columns));
    assert.deepEqual(fixture, before, 'rendering must not mutate the bridge result');
    for (const line of lines) assert.ok(line.length <= columns, `${line.length} > ${columns}: ${line}`);
    assert.equal(lines[0].length, columns, 'available width is fully allocated for the oversized fixture');
    let elided = 0;
    rows.forEach((cells, row) => {
      const type = fixture[row];
      assert.equal(cells[0], type.id);
      assert.equal(cells[4], type.neutral ? 'yes' : 'no');
      const expected = [
        type.fields.map((f) => `${f.key}:${f.kind}${f.role === 'line' ? '' : `(${f.role})`}`),
        type.events.length ? type.events.map((e) => e.event) : ['-'],
        type.designs.map((d) => d.id),
      ];
      expected.forEach((items, column) => {
        const cell = cells[column + 1];
        if (cell === items.join(' ')) return;
        elided++;
        assert.match(cell, /(?:^| )\+\d+$/, `missing dropped count: ${cell}`);
        const parts = cell.split(' ');
        const dropped = Number(parts.pop().slice(1));
        assert.equal(dropped, items.length - parts.length);
        assert.ok(dropped > 0);
        assert.deepEqual(parts, items.slice(0, parts.length), 'only complete leading items survive');
        // A count must not displace an item that could still have fit, including when +10
        // becomes +9. Checking the next candidate catches overly conservative suffix budgets.
        const next = items.slice(0, parts.length + 1).join(' ')
          + (dropped > 1 ? ` +${dropped - 1}` : '');
        assert.ok(next.length > widths[column + 1], `another item fits: ${cell}`);
      });
    });
    assert.ok(elided >= 3, 'the oversized row must exercise all three list columns');
    if (columns === 80) assert.equal(rows[2][1], '+1', 'an indivisible long item leaves only its count');
  });
}

test('a narrow table keeps natural widths and all original cell text', () => {
  const narrow = [summary('simple', [['name']], [], ['plain'], false)];
  assert.equal(typesTable(narrow, 160),
    'type    fields     events  designs  neutral\nsimple  name:text  -       plain    no');
  assert.ok(!typesTable(narrow, 160).includes('+'));
});

test('short columns return their unused budget to a long list', () => {
  const short = [summary('brief', fixture[1].fields.map((f) => [f.key, f.kind, f.role]), [], ['plain'])];
  const { lines, widths } = cellsOf(typesTable(short, 80));
  assert.equal(widths[2], 'events'.length);
  assert.equal(widths[3], 'designs'.length);
  assert.equal(widths[1], 47);
  assert.equal(lines[0].length, 80);
});

test('widths clamp at 60 and 200, with a 100-column fallback', () => {
  assert.equal(typesTable(fixture, 40), typesTable(fixture, 60));
  assert.equal(typesTable(fixture, 400), typesTable(fixture, 200));
  for (const missing of [0, undefined, NaN, Infinity]) {
    assert.equal(typesTable(fixture, missing), typesTable(fixture, 100));
  }
  assert.equal(typesTable([], 80), 'type  fields  events  designs  neutral');
});
