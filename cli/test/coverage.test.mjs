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
//   - the forced look (review.ts, docs/work-specs/harness-ladder/spec.md D1): `record --review`
//     hands in only a review with a verdict for every frame of the current coverage, none open and
//     none stale. A gate that let one frame through unseen would make the frames-opened count the
//     only check left.
//
// Run `npm run build` first - these import the built `dist/`.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { canonicalJson, sourceDigest } from '../dist/digest.js';
import { coveragePlan, fixtureLogo, frameFile, LATER_MS, LONG_LABEL_MIN, longer, mapStress, settlesOwnState, sidesOf, STRIP_MS } from '../dist/coverage.js';
import { zipPathFor } from '../dist/commands/record.js';
import { REVIEW_FORMAT, reviewFor, reviewProblems, reviewSummary, verdictState } from '../dist/review.js';

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
  // A zip carries the thumbnail `validate --screenshots` wrote as an asset; its folder is read
  // without it. Both are one version: the frame is an output, not a source (found in H3, where a
  // container's record.zip read as another version than the folder it was recorded from).
  const withThumbnail = template({ assets: [...template().assets, { path: 'thumbnail.png', data: 'data:image/png;base64,AAAA' }] });
  assert.equal(sourceDigest(withThumbnail), a, 'a thumbnail is never a new version');
});

test('a long value is about 1.7 times its sample and ends on a whole word', () => {
  const v = longer('Senior Correspondent');
  assert.ok(v.length >= Math.ceil('Senior Correspondent'.length * 1.7), v);
  assert.ok(v.startsWith('Senior Correspondent '), v);
  assert.ok(/(Senior|Correspondent)$/.test(v), v);
  assert.equal(longer('one\ntwo').split('\n').length, 2, 'each line of a list grows, the line count stays');
  assert.ok(longer('').length > 10, 'an empty sample still gets a long value');
  // #1246: a `Label | value` line grows its label, to at least LONG_LABEL_MIN characters, and
  // keeps its value, so a poll's long-value frames show a long option rather than `52 Yes`.
  const [yes, no] = longer('Yes | 52\nNo | 33').split('\n');
  assert.match(yes, /^Yes( Yes)+ \| 52$/);
  assert.ok(yes.length - ' | 52'.length >= LONG_LABEL_MIN, yes);
  assert.match(no, /^No( No)+ \| 33$/, 'every line grows its own label');
  const long = 'A longer answer option the presenter reads in full';
  assert.equal(longer(`${long} | 41`).split(' | ')[1], '41');
  assert.ok(longer(`${long} | 41`).startsWith(`${long} A longer`), 'a label already long still grows 1.7 times');
  assert.match(longer('Home | 2 | 1'), /^Home( Home)+ \| 2 \| 1$/, 'every cell after the label is kept as it is');
  assert.ok(longer('| 15').startsWith('| 15 '), 'a line with no label grows as plain text');
  assert.equal(longer('Senior Correspondent'), longer('Senior Correspondent', 1.7, 0), 'a plain text has no floor');
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
  const ownState = plan.renders.slice(15).filter(settlesOwnState).map((r) => r.name);
  assert.deepEqual(ownState, ['event-goalhome', 'event-final', 'next-2', 'next-3', 'update'], '--strips keeps these settled states as full frames: the Take settles in the sample frame, Out in nothing');
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

const DIGEST = `sha256:${'a'.repeat(64)}`;
const NEWER = `sha256:${'b'.repeat(64)}`;
const COVERAGE = { digest: DIGEST, frames: ['off.png', 'take-sample-video-600ms.png', 'event-goal-1500ms.png'].map((file) => ({ file })) };
const reviewed = (verdicts, digest = DIGEST) => ({ ...reviewFor(digest, COVERAGE.frames), frames: COVERAGE.frames.map((f, i) => ({ file: f.file, verdict: verdicts[i] ?? '' })) });

test('coverage\'s review lists every frame with an empty verdict, and only ok or fixed closes one', () => {
  const fresh = reviewFor(DIGEST, COVERAGE.frames);
  assert.equal(fresh.format, REVIEW_FORMAT);
  assert.equal(fresh.digest, DIGEST);
  assert.deepEqual(fresh.frames, COVERAGE.frames.map((f) => ({ file: f.file, verdict: '' })));
  assert.match(fresh.how, /ok.*fixed: <what>/);
  assert.equal(verdictState('ok'), 'ok');
  assert.equal(verdictState(' OK. '), 'ok');
  assert.equal(verdictState('fixed: the title no longer clips'), 'fixed');
  for (const open of ['', '   ', 'fixed:', 'fixed later', 'title clips', 'okay but tight', null, undefined, 3]) assert.equal(verdictState(open), 'open', JSON.stringify(open));
});

test('record --review accepts a complete review of the current digest and refuses a missing, open, stale or foreign one', () => {
  const complete = reviewed(['ok', 'fixed: the score no longer overlaps the crest', 'ok']);
  assert.deepEqual(reviewProblems({ review: complete, coverage: COVERAGE, digest: DIGEST }), []);
  assert.deepEqual(reviewSummary(complete), { digest: DIGEST, frames: 3, ok: 2, fixed: 1, verdicts: complete.frames.map((f) => ({ file: f.file, verdict: f.verdict })) });

  const missing = { ...complete, frames: complete.frames.slice(0, 2) };
  assert.match(reviewProblems({ review: missing, coverage: COVERAGE, digest: DIGEST }).join('\n'), /no verdict for 1 frame\(s\): event-goal-1500ms\.png/);

  const open = reviewed(['ok', '', 'the title clips']);
  assert.match(reviewProblems({ review: open, coverage: COVERAGE, digest: DIGEST }).join('\n'), /2 frame\(s\) left open: take-sample-video-600ms\.png, event-goal-1500ms\.png/);

  // The graphic changed after its coverage: the verdicts are of frames that no longer stand.
  assert.match(reviewProblems({ review: complete, coverage: COVERAGE, digest: NEWER }).join('\n'), /stale: the review is of aaaaaaaaaaaa, the graphic is now bbbbbbbbbbbb/);
  // A review carried over from an earlier coverage does not pass for the new one.
  assert.match(reviewProblems({ review: reviewed(['ok', 'ok', 'ok'], NEWER), coverage: COVERAGE, digest: NEWER }).join('\n'), /not of the coverage beside it/);
  const foreign = { ...complete, frames: [...complete.frames, { file: 'invented.png', verdict: 'ok' }] };
  assert.match(reviewProblems({ review: foreign, coverage: COVERAGE, digest: DIGEST }).join('\n'), /1 verdict\(s\) for frames the coverage did not make: invented\.png/);
  assert.match(reviewProblems({ review: { format: 'x' }, coverage: COVERAGE }).join('\n'), /not a noacg-review-v1 file/);
  assert.match(reviewProblems({ review: complete, coverage: null }).join('\n'), /no coverage\.json beside the review/);
  // A coverage that could not shoot a render left frames nobody can look at.
  assert.match(reviewProblems({ review: complete, coverage: { ...COVERAGE, failures: ['event-goal: the page crashed'] }, digest: DIGEST }).join('\n'), /could not shoot 1 render\(s\) \(event-goal\)/);
  // A coverage stripped of its frames leaves nothing to look at, so it is no review.
  assert.match(reviewProblems({ review: { ...complete, frames: [] }, coverage: { ...COVERAGE, frames: [] }, digest: DIGEST }).join('\n'), /holds no frame/);
});

test('record --review refuses an incomplete review before any browser starts, and writes nothing', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'noacg-review-'));
  try {
    writeFileSync(path.join(dir, 'coverage.json'), JSON.stringify(COVERAGE));
    writeFileSync(path.join(dir, 'review.json'), JSON.stringify(reviewed(['ok', '', 'ok'])));
    const out = path.join(dir, 'outputs', 'record.json');
    const run = (review) => exec(process.execPath, [cli, 'record', dir, '--out', out, '--review', review, '--json'], { env: { ...process.env, NOACG_URL: 'http://127.0.0.1:1' } }).then((r) => ({ code: 0, stdout: r.stdout }), (e) => ({ code: e.code, stdout: e.stdout }));
    const open = await run(path.join(dir, 'review.json'));
    assert.equal(open.code, 1, 'an open verdict is a finding');
    assert.equal(JSON.parse(open.stdout).reason, 'review');
    assert.match(JSON.parse(open.stdout).problems.join('\n'), /1 frame\(s\) left open: take-sample-video-600ms\.png/);
    assert.equal(existsSync(out), false, 'nothing recorded');
    const none = await run(path.join(dir, 'nothing.json'));
    assert.equal(none.code, 2, 'a review that is not there is a usage error');
    assert.match(JSON.parse(none.stdout).error, /--review: no file/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
