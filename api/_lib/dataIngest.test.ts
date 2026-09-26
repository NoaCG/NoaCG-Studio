import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mapLabelsToFields,
  normalizeLabel,
  parseDataPatch,
  parseDataUpdate,
  resolveTargetGraphic,
  type PanelGraphicLike,
} from './dataIngest.js';

// The house scorebug's contract (src/templates/scoreboards/scorebugShared.ts) - the shape a
// broadcaster demo drives, so the mapping is proven against the real field list.
const SCOREBUG: PanelGraphicLike = {
  name: 'House Scorebug',
  fields: [
    { field: 'f0', ftype: 'textfield', title: 'Team A' },
    { field: 'f1', ftype: 'number', title: 'Score A' },
    { field: 'f2', ftype: 'textfield', title: 'Team B' },
    { field: 'f3', ftype: 'number', title: 'Score B' },
    { field: 'f4', ftype: 'textfield', title: 'Period' },
    { field: 'f5', ftype: 'textfield', title: 'Clock' },
    { field: 'f6', ftype: 'color', title: 'Team A colour' },
    { field: 'f7', ftype: 'color', title: 'Team B colour' },
  ],
};

const TICKER: PanelGraphicLike = {
  name: 'Ticker',
  fields: [{ field: 'f0', ftype: 'textarea', title: 'Items' }],
};

// ── parseDataUpdate ──────────────────────────────────────────────────────────────────────────

test('a plain values body parses, with numbers and booleans stringified', () => {
  const r = parseDataUpdate({ values: { 'Score A': 2, Clock: '43:12', Live: true } });
  assert.ok(r.ok);
  assert.deepEqual(r.req.values, { 'Score A': '2', Clock: '43:12', Live: 'true' });
});

test('non-scalar values, empty values, and graphic+cue together are refused', () => {
  assert.equal(parseDataUpdate({ values: { a: { nested: 1 } } }).ok, false);
  assert.equal(parseDataUpdate({ values: {} }).ok, false);
  assert.equal(parseDataUpdate({ graphic: 'A', cue: 'B', values: { x: '1' } }).ok, false);
  assert.equal(parseDataUpdate([]).ok, false);
  assert.equal(parseDataUpdate(null).ok, false);
  assert.equal(parseDataUpdate({ graphic: '  ', values: { x: '1' } }).ok, false);
});

// ── resolveTargetGraphic ─────────────────────────────────────────────────────────────────────

test('a single-graphic production needs no target - the scorebug case', () => {
  const r = resolveTargetGraphic([SCOREBUG], [], {});
  assert.ok(r.ok);
  assert.equal(r.graphic.name, 'House Scorebug');
});

test('a multi-graphic production without a target is refused, naming the graphics', () => {
  const r = resolveTargetGraphic([SCOREBUG, TICKER], [], {});
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /"House Scorebug", "Ticker"/);
});

test('graphic names match normalized, like the dataset binding', () => {
  const r = resolveTargetGraphic([SCOREBUG, TICKER], [], { graphic: '  house scorebug ' });
  assert.ok(r.ok);
  assert.equal(r.graphic.name, 'House Scorebug');
});

test('an unknown graphic is refused with the available names', () => {
  const r = resolveTargetGraphic([SCOREBUG], [], { graphic: 'Lower third' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /No graphic named "Lower third"/);
});

test('a cue label resolves to the graphic its cues drive', () => {
  const cues = [
    { graphic: 'Ticker', label: 'Headlines' },
    { graphic: 'House Scorebug', label: 'Match' },
  ];
  const r = resolveTargetGraphic([SCOREBUG, TICKER], cues, { cue: 'match' });
  assert.ok(r.ok);
  assert.equal(r.graphic.name, 'House Scorebug');
});

test('two same-graphic cues sharing a label are fine; two cross-graphic ones are ambiguous', () => {
  const same = [
    { graphic: 'Ticker', label: 'Loop' },
    { graphic: 'Ticker', label: 'Loop' },
  ];
  assert.ok(resolveTargetGraphic([SCOREBUG, TICKER], same, { cue: 'Loop' }).ok);
  const cross = [
    { graphic: 'Ticker', label: 'Open' },
    { graphic: 'House Scorebug', label: 'Open' },
  ];
  const r = resolveTargetGraphic([SCOREBUG, TICKER], cross, { cue: 'Open' });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /ambiguous/);
});

// ── mapLabelsToFields ────────────────────────────────────────────────────────────────────────

test('labels map to fN ids case-insensitively; extras are reported, never dropped silently', () => {
  const m = mapLabelsToFields(SCOREBUG.fields!, {
    'score a': '2',
    'SCORE B': '1',
    ' Clock ': '43:12',
    Referee: 'n/a',
  });
  assert.deepEqual(m.data, { f1: '2', f3: '1', f5: '43:12' });
  assert.deepEqual(m.ignored, ['Referee']);
  assert.deepEqual(m.ambiguous, []);
});

test('the fN id addresses its field even untitled', () => {
  const m = mapLabelsToFields([{ field: 'f0', ftype: 'textfield' }], { f0: 'hello' });
  assert.deepEqual(m.data, { f0: 'hello' });
});

test('a duplicated title is ambiguous and skipped rather than guessed', () => {
  const twins = [
    { field: 'f0', ftype: 'textfield', title: 'Name' },
    { field: 'f1', ftype: 'textfield', title: 'name' },
  ];
  const m = mapLabelsToFields(twins, { Name: 'Anna', f1: 'Ben' });
  assert.deepEqual(m.data, { f1: 'Ben' });
  assert.deepEqual(m.ambiguous, ['Name']);
});

test('a title shaped like another field\'s fN id never captures that id - the id wins, both panel orders', () => {
  // f0 TITLED "F1" while a real f1 exists: addressing "f1" must reach f1, never f0, and
  // must not be reported ambiguous - in either panel order.
  const shadowFirst = [
    { field: 'f0', ftype: 'textfield', title: 'F1' },
    { field: 'f1', ftype: 'number', title: 'Score' },
  ];
  const shadowSecond = [
    { field: 'f1', ftype: 'number', title: 'Score' },
    { field: 'f0', ftype: 'textfield', title: 'F1' },
  ];
  for (const fields of [shadowFirst, shadowSecond]) {
    const m = mapLabelsToFields(fields, { f1: '5' });
    assert.deepEqual(m.data, { f1: '5' });
    assert.deepEqual(m.ambiguous, []);
    assert.deepEqual(m.ignored, []);
  }
});

test('non-data ftypes (buttons, captions) never take a value; hidden fields do', () => {
  const fields = [
    { field: 'f0', ftype: 'button', title: 'Fire' },
    { field: 'f1', ftype: 'hidden', title: 'Duration' },
  ];
  const m = mapLabelsToFields(fields, { Fire: 'x', Duration: '90' });
  assert.deepEqual(m.data, { f1: '90' });
  assert.deepEqual(m.ignored, ['Fire']);
});

test('normalizeLabel is the dataset binding: trim + case-fold', () => {
  assert.equal(normalizeLabel('  Score A '), 'score a');
});

// ── parseDataPatch: the production-data verb's body rule (0048) ──────────────────────────────
// There is deliberately NO schema - a patch is any JSON object, because production data has no
// declared shape (docs/PRODUCTION_DATA_PLAN.md §2.2). Only the two shapes that are never a
// caller's intent are refused.

test('parseDataPatch takes any JSON object as the tree to merge', () => {
  const r = parseDataPatch({ match: { home: { score: 4 } }, poll: { open: true } });
  assert.ok(r.ok);
  assert.deepEqual(r.patch, { match: { home: { score: 4 } }, poll: { open: true } });
});

test('parseDataPatch refuses the shapes that are never intended', () => {
  for (const body of [null, undefined, 42, 'text', true, [1, 2, 3], []]) {
    const r = parseDataPatch(body);
    assert.equal(r.ok, false, `${JSON.stringify(body)} must be refused`);
  }
});

test('parseDataPatch unwraps a {data: …} envelope, the likeliest caller mistake', () => {
  // Left alone, `{"data": {...}}` would write a literal `data` branch nothing is bound to -
  // the feed would report success and no graphic would move, which is the worst failure this
  // API can have.
  const r = parseDataPatch({ data: { match: { clock: '12:31' } } });
  assert.ok(r.ok);
  assert.deepEqual(r.patch, { match: { clock: '12:31' } });
});

test('parseDataPatch leaves a REAL `data` path alone when it is not the only key', () => {
  // A production genuinely rooted at `data` is legitimate; the envelope rule must not eat it.
  const r = parseDataPatch({ data: { x: 1 }, other: 2 });
  assert.ok(r.ok);
  assert.deepEqual(r.patch, { data: { x: 1 }, other: 2 });
});

test('parseDataPatch does not unwrap a `data` key holding a scalar or an array', () => {
  const scalar = parseDataPatch({ data: 5 });
  assert.ok(scalar.ok);
  assert.deepEqual(scalar.patch, { data: 5 });
  const list = parseDataPatch({ data: [1, 2] });
  assert.ok(list.ok);
  assert.deepEqual(list.patch, { data: [1, 2] });
});

test('an empty patch is valid - it is how a caller asks for the tree without changing it', () => {
  const r = parseDataPatch({});
  assert.ok(r.ok);
  assert.deepEqual(r.patch, {});
});
