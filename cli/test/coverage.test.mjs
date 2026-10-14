// The hand-in verbs' own logic, offline: no network, no browser, no NoaCG deployment
// (docs/work-specs/noacg-harness/spec.md D3 and section 3.2).
//
//   - the digest (digest.ts): the one number that proves a delivered package is the version last
//     looked at. If it moved with key order or line endings, a Windows host and the container
//     would disagree about the same graphic; if it stayed put when a source changed, a stale
//     record would pass as reviewed.
//   - the coverage plan (coverage.ts): what the matrix holds. A plan that silently dropped the
//     light ground, an event or the long values would hand a reviewer frames that cannot show the
//     defect the matrix exists to show, and nothing downstream would notice.
//   - the refusals that need no browser: `coverage` and `record` without --out.
//
// Run `npm run build` first - these import the built `dist/`.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { canonicalJson, sourceDigest } from '../dist/digest.js';
import { coveragePlan, fixtureLogo, frameFile, LATER_MS, longer, mapStress, sidesOf, STRIP_MS } from '../dist/coverage.js';
import { zipPathFor } from '../dist/commands/record.js';

const exec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '..', 'dist', 'index.js');

function template(overrides = {}) {
  return {
    name: 'Board',
    type: 'scoreboard',
    resolution: { width: 1920, height: 1080 },
    fps: 50,
    html: '<div id="f0"></div>\r\n<div id="f2"></div>',
    css: '.a{}\r\n',
    js: 'function play(){}\n',
    fields: [],
    settings: { a: '1', b: '2' },
    assets: [{ path: 'b.png', data: 'data:,b' }, { path: 'a.png', data: 'data:,a' }],
    layers: [],
    ...overrides,
  };
}

const SCOREBOARD_FIELDS = [
  { field: 'f0', ftype: 'textfield', title: 'Home team', value: 'Lions' },
  { field: 'f1', ftype: 'number', title: 'Home score', value: '2' },
  { field: 'f2', ftype: 'textfield', title: 'Away team', value: 'Tigers' },
  { field: 'f3', ftype: 'number', title: 'Away score', value: '1' },
  { field: 'f4', ftype: 'filelist', title: 'Logo', value: 'images/logo.png' },
];
const defaultsOf = (fields) => Object.fromEntries(fields.map((f) => [f.field, f.value]));

test('the digest is the sources, not their key order, line endings or asset order', () => {
  const a = sourceDigest(template());
  assert.match(a, /^sha256:[0-9a-f]{64}$/);
  const reordered = template({ settings: { b: '2', a: '1' }, assets: [{ path: 'a.png', data: 'data:,a' }, { path: 'b.png', data: 'data:,b' }], html: '<div id="f0"></div>\n<div id="f2"></div>', css: '.a{}\n' });
  assert.equal(sourceDigest(reordered), a, 'the same graphic on a CRLF checkout or from another bridge order');
  for (const changed of [{ js: 'function play(){ }\n' }, { name: 'Board 2' }, { assets: [{ path: 'a.png', data: 'data:,A' }] }, { fields: [{ field: 'f0', ftype: 'textfield', title: 'T', value: 'x' }] }]) {
    assert.notEqual(sourceDigest(template(changed)), a, `a change to ${Object.keys(changed)[0]} is a new version`);
  }
  assert.equal(canonicalJson({ b: 1, a: [2, { d: 3, c: undefined }] }), '{"a":[2,{"d":3}],"b":1}');
});

test('a long value is about 1.7 times its sample and ends on a whole word', () => {
  const v = longer('Senior Correspondent');
  assert.ok(v.length >= Math.ceil('Senior Correspondent'.length * 1.7), v);
  assert.ok(v.startsWith('Senior Correspondent '), v);
  assert.ok(/(Senior|Correspondent)$/.test(v), v);
  assert.equal(longer('one\ntwo').split('\n').length, 2, 'each line of a list grows, the line count stays');
  assert.ok(longer('').length > 10, 'an empty sample still gets a long value');
});

test('stress keys map by id first, then by field order, and say what they could not place', () => {
  assert.deepEqual(mapStress({ f0: 'A', f9: 'Z', logo: 'bright: x', background: 'busy: y' }, ['f0', 'f1']), { values: { f0: 'A' }, unmapped: ['f9'] });
  assert.deepEqual(mapStress({ f0: 'A', f1: 'B' }, ['name', 'title']), { values: { name: 'A', title: 'B' }, unmapped: [] }, 'an authored package names its own fields');
});

test('a two-sided board is found from titles that differ by a side word', () => {
  assert.deepEqual(sidesOf(SCOREBOARD_FIELDS), [['f0', 'f1'], ['f2', 'f3']]);
  assert.equal(sidesOf([{ field: 'f0', ftype: 'textfield', title: 'Name', value: '' }, { field: 'f1', ftype: 'textfield', title: 'Title', value: '' }]), null);
});

test('the plan covers every value set on both grounds, every event, step, update and Out', () => {
  const buttons = [{ event: 'goalHome', label: 'Goal home' }, { event: 'final', label: 'Final' }];
  const plan = coveragePlan({
    fields: SCOREBOARD_FIELDS,
    defaults: defaultsOf(SCOREBOARD_FIELDS),
    buttons,
    stepCount: 3,
    stress: { f0: 'Helsingin Koulujen Urheiluseura', f4: 'dark: a navy crest', background: 'busy: a crowd' },
  });
  assert.deepEqual(plan.grounds, ['video', 'light', 'busy'], 'a busy background brief adds the busy plate');
  assert.deepEqual(Object.keys(plan.valueSets), ['sample', 'long', 'empty', 'long-side-1', 'long-side-2']);
  const { long, empty } = plan.valueSets;
  assert.equal(long.f0, 'Helsingin Koulujen Urheiluseura', 'the brief\'s long value wins');
  assert.ok(long.f2.length >= Math.ceil('Tigers'.length * 1.7), 'a text the brief does not name grows 1.7x');
  assert.equal(long.f4, fixtureLogo('dark'), 'a dark: picture becomes the dark test logo');
  assert.equal(empty.f0, 'Lions', 'the first text keeps its value');
  assert.equal(empty.f2, '', 'every other text is empty');
  assert.equal(empty.f4, '', 'an image is empty too');
  assert.equal(plan.valueSets['long-side-1'].f0, long.f0);
  assert.equal(plan.valueSets['long-side-1'].f2, 'Tigers', 'one side at a time');
  const names = plan.renders.map((r) => r.name);
  for (const set of Object.keys(plan.valueSets)) for (const g of plan.grounds) assert.ok(names.includes(`${set}-${g}`), `${set} on ${g}`);
  assert.deepEqual(names.slice(15), ['take', 'event-goalhome', 'event-final', 'next-2', 'next-3', 'update', 'out']);
  const take = plan.renders.find((r) => r.name === 'take');
  assert.deepEqual(take.offsets, [...STRIP_MS, LATER_MS], 'the entrance strip, settled, and a frame after time has passed');
  assert.deepEqual(plan.renders.find((r) => r.name === 'event-final').ops, [{ kind: 'event', event: 'final' }]);
  assert.deepEqual(plan.renders.find((r) => r.name === 'update').ops, [{ kind: 'set', key: 'f0', value: long.f0 }]);
  assert.deepEqual(plan.renders.find((r) => r.name === 'long-video').crops, ['f0', 'f2', 'f4'], 'every text and image field is cropped once');
  assert.equal(frameFile(take, 20, 'jpg'), 'take-00020ms.jpg');
  assert.equal(frameFile(plan.renders[0], 1500, 'jpg'), 'sample-video.jpg');
});

test('the brief logo goes into the first image field it gave no picture of, or is said not drawn', () => {
  const fields = [{ field: 'f0', ftype: 'textfield', title: 'Title', value: 'Mass' }, { field: 'f1', ftype: 'filelist', title: 'Emblem', value: 'images/e.png' }];
  const drawn = coveragePlan({ fields, defaults: defaultsOf(fields), buttons: [], stepCount: 1, stress: { logo: 'bright: a white star' } });
  assert.equal(drawn.valueSets.long.f1, fixtureLogo('bright'));
  assert.deepEqual(drawn.notes, []);
  const text = [fields[0]];
  const none = coveragePlan({ fields: text, defaults: defaultsOf(text), buttons: [], stepCount: 1, stress: { logo: 'dark: a crest' } });
  assert.match(none.notes.join(' '), /not drawn: this package has no image field/);
});

test('a graphic with no events, no steps and no busy brief still gets both grounds and every lifecycle strip', () => {
  const fields = [{ field: 'f0', ftype: 'textfield', title: 'Name', value: 'Anna' }];
  const plan = coveragePlan({ fields, defaults: defaultsOf(fields), buttons: [], stepCount: 1 });
  assert.deepEqual(plan.grounds, ['video', 'light']);
  assert.deepEqual(plan.renders.map((r) => r.name), ['sample-video', 'sample-light', 'long-video', 'long-light', 'empty-video', 'empty-light', 'take', 'update', 'out']);
  assert.deepEqual(coveragePlan({ fields, defaults: defaultsOf(fields), buttons: [], stepCount: -1 }).renders.filter((r) => r.name.startsWith('next-')).length, 2, 'dynamic steps walk two Nexts');
});

test('record names its zip beside the record file', () => {
  assert.equal(zipPathFor('/out/record.json'), '/out/record.zip');
  assert.equal(zipPathFor('C:\\out\\Interim.JSON'), 'C:\\out\\Interim.zip');
});

test('coverage and record refuse without --out, before any browser starts', async () => {
  for (const verb of ['coverage', 'record']) {
    const r = await exec(process.execPath, [cli, verb, '.', '--json'], { env: { ...process.env, NOACG_URL: 'http://127.0.0.1:1' } }).then(() => ({ code: 0 }), (e) => ({ code: e.code, stdout: e.stdout }));
    assert.equal(r.code, 2, `${verb} without --out is a usage error`);
    assert.match(JSON.parse(r.stdout).error, /--out/);
  }
});
