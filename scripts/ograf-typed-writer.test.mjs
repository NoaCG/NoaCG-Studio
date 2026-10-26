// guards: src/model/ografTyped.ts, src/control/typedSend.ts, src/control/airState.ts, src/control/playoutSession.ts, src/model/shows.ts, src/model/importTemplate.ts, src/model/rundownHistory.ts, src/control/cueItems.ts, src/control/livePath.ts, src/control/hostedControl.ts, src/output/main.ts, src/output/stage.ts, src/components/home/ProductionPage.tsx, scripts/fixtures/ograf-typed/**
//
// TYPED OGRAF DATA, THE WRITING SIDE (docs/work-specs/playout-ograf-contract/spec.md, E1.2a), in
// Node. The reading side is scripts/ograf-typed.test.mjs; the route's half of the typed target
// adapter is scripts/source-mapping.test.mjs and scripts/connector-sample.test.mjs; the verbs are
// scripts/graphic-verbs.test.mjs; the browser walk is e2e/configured/ograf-typed-data.spec.ts.
//   - AC-2, persistence, binding and command payload: a stranger's manifest is kept on its graphic;
//     the writer turns a cue's typed data on and off through both write doors with a deterministic
//     receipt; save and reload keep it byte for byte; a Take or an Update carries the cue's values
//     with its bound fields' typed values over them, validated whole, and invalid data fails before
//     dispatch with the stored data untouched;
//   - AC-3, wire: a native cue's command is unchanged byte for byte; an output reads only what it
//     can, and a data road's native text never replaces typed values on air;
//   - AC-4, runtime: Off gives every value back as text and leaves the package untouched; a cue of
//     a later version is never written;
//   - the outputs' capability: an output that does not say it reads typed data is sent none, and the
//     page says so in one line;
//   - bounded and linear on hostile input.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';
import JSZip from 'jszip';
import { rawSuffix } from './rolldown-raw.mjs';
import './lib/tsResolve.mjs';

const typed = await import('../src/model/ografTyped.ts');
const {
  OGRAF_STANDARD, TYPED_VERSION, TYPED_READER, TYPED_MAX_SEND_BYTES, TYPED_KEPT, describeOgraf, readOgrafDeclared, typedValuesFault,
  typedForSend, typedTargetValue, typedOutputsRefusal, typedOutputGate, typedPublishedFields, typedKeep, typedFrozen, nativeOf,
} = typed;
const { takeCueItems } = await import('../src/control/cueItems.ts');
const { readLiveEntry } = await import('../src/control/livePath.ts');
const { typedSendFor, createTypedSendMemo } = await import('../src/control/typedSend.ts');
const { rememberAired, restoreItems, typedAfter } = await import('../src/control/airState.ts');
const { NO_AIR } = await import('../src/control/playoutSession.ts');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stranger = JSON.parse(readFileSync(path.join(root, 'scripts/fixtures/ograf-typed/stranger.ograf.json'), 'utf8'));
const declared = { v: 1, manifest: stranger };
const schema = describeOgraf(stranger).schema;
const values = { title: 'Results', teams: [{ name: 'Home', score: 2 }], round: 2 };
const envelope = (v = values) => ({ v: TYPED_VERSION, kind: 'values', standard: OGRAF_STANDARD.commit, schema, values: v });

// ── The declaration ──────────────────────────────────────────────────────────────────────────

test('a graphic\'s declaration: absent, read, a later version, malformed; its data schema or none', () => {
  assert.deepEqual(readOgrafDeclared(undefined), { status: 'absent' });
  const ok = readOgrafDeclared(declared);
  assert.equal(ok.status, 'ok');
  assert.equal(ok.description.schema, schema);
  assert.deepEqual(ok.fields.properties.map((p) => p.key), ['title', 'round', 'ratio', 'live', 'accent', 'logo', 'opacity', 'teams', 'meta']);
  assert.equal(readOgrafDeclared(declared), ok, 'described once per declaration');
  assert.deepEqual(readOgrafDeclared({ v: 2, manifest: {} }), { status: 'read-only', reason: 'was saved by a later version of NoaCG' });
  for (const bad of [null, 'x', { v: 1 }, { v: 1, manifest: [] }, { v: 1, manifest: {}, extra: 1 }, { v: '1', manifest: {} }]) {
    assert.equal(readOgrafDeclared(bad).status, 'read-only', JSON.stringify(bad));
  }
  // A manifest without a data schema takes no typed data.
  assert.equal(readOgrafDeclared({ v: 1, manifest: { id: 'x' } }).fields, null);
});

/** The importer, bundled as scripts/import-zip-thumbnail.test.mjs bundles it. */
async function loadImporter() {
  const bundle = await rolldown({ input: path.join(root, 'src/model/importTemplate.ts'), platform: 'neutral', external: ['jszip'], plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  const code = output[0].code.replace(/from "jszip"/g, `from ${JSON.stringify(import.meta.resolve('jszip'))}`);
  return import(`data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`);
}

test('the importer keeps a stranger\'s manifest on the graphic, byte for byte, and never ours', async () => {
  const { importZipTemplate } = await loadImporter();
  const zipOf = async (manifest) => {
    const zip = new JSZip();
    zip.file('board/board.html', '<html><head><title>Board</title></head><body></body></html>');
    zip.file('board/board.ograf.json', JSON.stringify(manifest));
    return zip.generateAsync({ type: 'arraybuffer' });
  };
  const theirs = await importZipTemplate('board.zip', await zipOf(stranger));
  assert.deepEqual(theirs.template.ograf, { v: 1, manifest: stranger });
  const ours = await importZipTemplate('board.zip', await zipOf({ ...stranger, v_noacg: { format: 'noacg-graphic', version: 1, type: 'lower-third' } }));
  assert.equal(ours.template.ograf, undefined, 'a NoaCG graphic stays native');
  // A manifest past the reader's bounds is not kept rather than kept unreadable.
  let deep = { type: 'string' };
  for (let i = 0; i < 60; i++) deep = { type: 'object', properties: { a: deep } };
  assert.equal((await importZipTemplate('board.zip', await zipOf({ ...stranger, schema: deep }))).template.ograf, undefined);
});

test('the published panel marks the fields the declaration names, and leaves every other graphic\'s as they are', () => {
  const fields = [{ field: 'title', ftype: 'textfield' }, { field: 'f9', ftype: 'textfield' }];
  assert.deepEqual(typedPublishedFields(fields, declared), [{ field: 'title', ftype: 'textfield', typed: true }, { field: 'f9', ftype: 'textfield' }]);
  assert.equal(typedPublishedFields(fields, undefined), fields, 'a native graphic: the same list');
  assert.equal(typedPublishedFields(fields, { v: 2, manifest: {} }), fields, 'one this build cannot read: nothing marked');
});

// ── The writer, through both write doors ─────────────────────────────────────────────────────

const dir = mkdtempSync(path.join(tmpdir(), 'ograf-typed-writer-'));
after(() => rmSync(dir, { recursive: true, force: true }));

async function loadShowsModule() {
  const bundle = await rolldown({ input: path.join(root, 'src/model/shows.ts'), platform: 'node', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  const file = path.join(dir, 'shows.mjs');
  writeFileSync(file, output[0].code);
  return import(pathToFileURL(file).href);
}

test('AC-2, AC-4: the writer turns typed data on and off through the doors; save and reload keep it; invalid data writes nothing', async () => {
  const stored = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => stored.get(k) ?? null,
    setItem: (k, v) => stored.set(k, String(v)),
    removeItem: (k) => stored.delete(k),
    key: (i) => [...stored.keys()][i] ?? null,
    get length() {
      return stored.size;
    },
  };
  try {
    const shows = await loadShowsModule();
    const fields = ['title', 'round', 'teams'].map((f) => ({ field: f, ftype: 'textfield', title: f, value: '' }));
    const template = { name: 'Board', type: 'blank', resolution: { width: 1920, height: 1080, label: '1080p' }, fps: 50, html: '<div></div>', css: '', js: '', fields, settings: {}, assets: [], layers: [], ograf: declared };
    const show = shows.createShowNamed('Typed');
    shows.addGraphicToShow(show.id, template);
    const read = () => shows.loadShows().find((s) => s.id === show.id);
    const [cue] = read().cues;
    const native = { title: 'Results', round: '2', teams: '[{"name":"Home","score":2}]' };
    assert.equal(shows.updateShowCueChecked(show.id, cue.id, { values: native }).error, null);
    const manifestBytes = JSON.stringify(read().graphics[0].template.ograf);

    // On: the native strings read through the schema, with a deterministic receipt.
    const on = shows.setCueTyped(show.id, cue.id, true);
    assert.equal(on.error, null);
    assert.deepEqual(on.receipt.converted, ['round', 'teams', 'title']);
    const saved = read().cues[0];
    assert.deepEqual(saved.typed, envelope());
    // Save and reload: the record as stored reads back the same bytes.
    const reloaded = JSON.parse(stored.get('spx-gfx-shows')).find((s) => s.id === show.id).cues[0].typed;
    assert.equal(JSON.stringify(reloaded), JSON.stringify(saved.typed));
    // Any other write keeps it byte for byte; none may change it.
    assert.equal(shows.updateShowCueChecked(show.id, cue.id, { label: 'Renamed' }).error, null);
    assert.equal(JSON.stringify(read().cues[0].typed), JSON.stringify(saved.typed));
    // A cue that turns it on with values the schema refuses writes nothing, and says why.
    shows.addShowCue(show.id, read().graphics[0].id);
    const second = read().cues[1];
    shows.updateShowCueChecked(show.id, second.id, { values: { ...native, round: '01' } });
    const refused = shows.setCueTyped(show.id, second.id, true);
    assert.equal(refused.error, 'Typed data was not turned on: round "01" is not a whole number written plainly.');
    assert.equal(read().cues[1].typed, undefined);
    // Off: the values go back as text and nothing is lost; the package is untouched.
    assert.equal(shows.setCueTyped(show.id, cue.id, false).error, null);
    const off = read().cues[0];
    assert.equal(off.typed, undefined);
    assert.deepEqual(off.values, native);
    assert.equal(JSON.stringify(read().graphics[0].template.ograf), manifestBytes);
    // On again from those strings gives the same envelope: the round trip is lossless.
    shows.setCueTyped(show.id, cue.id, true);
    assert.deepEqual(read().cues[0].typed, envelope());
    // A cue of a later version is never written, on or off.
    const all = JSON.parse(stored.get('spx-gfx-shows'));
    all.find((s) => s.id === show.id).cues[0].typed = { v: 2, values: { title: 'Later' } };
    stored.set('spx-gfx-shows', JSON.stringify(all));
    assert.match(shows.setCueTyped(show.id, cue.id, false).error, /read-only/);
    assert.deepEqual(read().cues[0].typed, { v: 2, values: { title: 'Later' } });
    // A graphic that declares no schema takes no typed data.
    const plain = shows.createShowNamed('Plain');
    shows.addGraphicToShow(plain.id, { ...template, name: 'Strap', ograf: undefined });
    const plainCue = shows.loadShows().find((s) => s.id === plain.id).cues[0];
    assert.equal(shows.setCueTyped(plain.id, plainCue.id, true).error, 'This cue’s graphic declares no typed data.');
    // The page hands the writer the declaration it reads (the graphic's library version), which
    // wins over the production's own copy.
    shows.updateShowCueChecked(plain.id, plainCue.id, { values: native });
    assert.equal(shows.setCueTyped(plain.id, plainCue.id, true, declared).error, null);
    assert.deepEqual(shows.loadShows().find((s) => s.id === plain.id).cues[0].typed, envelope());
  } finally {
    globalThis.localStorage = previous;
  }
});

test('the door lets the writer change its own cue to its own bytes only', () => {
  const cue = (id, extra = {}) => ({ id, sourceId: 'g', label: id, values: {}, ...extra });
  const a = cue('a', { typed: envelope() });
  const b = cue('b');
  const before = typedKeep({ cues: [a, b] });
  const bytes = JSON.stringify(envelope({ title: 'B' }));
  const write = (id, value) => new Map([[id, value]]);
  assert.equal(typedFrozen(typedKeep({ cues: [b] }), { cues: [{ ...b, typed: envelope() }] }, undefined, write('b', JSON.stringify(envelope()))), null, 'a cue gains one');
  assert.equal(typedFrozen(before, { cues: [{ ...a, typed: envelope({ title: 'B' }) }, b] }, undefined, write('a', bytes)), null, 'its bytes');
  assert.equal(typedFrozen(before, { cues: [cue('a'), b] }, undefined, write('a', null)), null, 'off');
  assert.equal(typedFrozen(before, { cues: [{ ...a, typed: envelope({ title: 'C' }) }, b] }, undefined, write('a', bytes)), TYPED_KEPT, 'not the bytes it said');
  assert.equal(typedFrozen(before, { cues: [{ ...a, typed: envelope({ title: 'B' }) }, { ...b, typed: envelope() }] }, undefined, write('a', bytes)), TYPED_KEPT, 'another cue in the same write');
  assert.equal(typedFrozen(before, { cues: [b] }, undefined, write('a', null)), TYPED_KEPT, 'a cue that is there');
  const later = cue('l', { typed: { v: 2 } });
  assert.equal(typedFrozen(typedKeep({ cues: [later] }), { cues: [cue('l')] }, undefined, write('l', null)), TYPED_KEPT, 'never a read-only cue');
});

// ── The send ─────────────────────────────────────────────────────────────────────────────────

const ok = readOgrafDeclared(declared);
const node = (key) => ok.fields.properties.find((p) => p.key === key).node;

test('the typed target adapter takes a value as the JSON it is, never from text', () => {
  assert.deepEqual(typedTargetValue(node('round'), 3), { value: 3 });
  assert.deepEqual(typedTargetValue(node('round'), '3'), { reason: 'a string is not a whole number' });
  assert.deepEqual(typedTargetValue(node('round'), 7), { reason: '7 is not one of the declared values' });
  assert.deepEqual(typedTargetValue(node('teams'), [{ name: 'A', score: 1 }]), { value: [{ name: 'A', score: 1 }] });
  assert.deepEqual(typedTargetValue(node('teams'), [{ name: 'A', score: -1 }]), { reason: '[0].score below the minimum 0' });
  assert.equal(typedTargetValue({ path: 'x', type: 'unsupported', unsupported: ['oneOf'] }, 'kept').reason, 'its declared type is not one this version reads');
  assert.equal(typedTargetValue(node('title'), Infinity).reason, 'a number that is not finite');
});

test('AC-2: a Take or an Update carries the cue\'s values with its bound fields over them, validated whole; refused, nothing goes', () => {
  const cue = { typed: envelope() };
  assert.deepEqual(typedForSend({}, ok), { status: 'none' });
  assert.deepEqual(typedForSend(cue, ok), { status: 'ok', typed: envelope() });
  const bound = new Map([['round', { value: 3 }], ['teams', { value: [{ name: 'Away', score: 5 }] }]]);
  const sent = typedForSend(cue, ok, bound);
  assert.deepEqual(sent, { status: 'ok', typed: envelope({ title: 'Results', teams: [{ name: 'Away', score: 5 }], round: 3 }) });
  assert.deepEqual(cue.typed, envelope(), 'the stored data is untouched');
  // A bound value the adapter refused, or a whole that no longer validates, sends nothing.
  assert.deepEqual(typedForSend(cue, ok, new Map([['round', { reason: 'a string is not a whole number' }]])), { status: 'refused', reason: 'round: a string is not a whole number.' });
  assert.deepEqual(typedForSend({ typed: envelope({ title: 'A', round: 2 }) }, ok), { status: 'refused', reason: 'teams: required.' });
  assert.match(typedForSend({ typed: { ...envelope(), v: 2 } }, ok).reason, /later version/);
  assert.equal(typedForSend({ typed: { ...envelope(), schema: 'other' } }, ok).reason, 'This typed data was made for another version of its graphic.');
  assert.equal(typedForSend(cue, { status: 'absent' }).reason, 'This cue’s graphic takes no typed data.');
  assert.equal(typedValuesFault(ok, envelope()), null);
});

test('one command takes at most TYPED_MAX_SEND_BYTES of typed data, measured as UTF-8', () => {
  const room = describeOgraf({ schema: { type: 'object', properties: { t: { type: 'string' } } } });
  const declaredRoom = { status: 'ok', description: room, fields: room.fields };
  const shell = JSON.stringify({ v: TYPED_VERSION, kind: 'values', standard: OGRAF_STANDARD.commit, schema: room.schema, values: { t: '' } }).length;
  const at = (n, ch = 'a') => typedForSend({ typed: { v: TYPED_VERSION, kind: 'values', standard: OGRAF_STANDARD.commit, schema: room.schema, values: { t: ch.repeat(n) } } }, declaredRoom);
  assert.equal(at(TYPED_MAX_SEND_BYTES - shell).status, 'ok');
  assert.equal(at(TYPED_MAX_SEND_BYTES - shell + 1).status, 'refused');
  // Two bytes a character: half as many fit.
  assert.equal(at(Math.floor((TYPED_MAX_SEND_BYTES - shell) / 2), 'é').status, 'ok');
  assert.equal(at(Math.floor((TYPED_MAX_SEND_BYTES - shell) / 2) + 1, 'é').status, 'refused');
  assert.equal(TYPED_MAX_SEND_BYTES, 65536);
});

test('the page\'s decision: bound values from the tree, a tree not read yet, a live candidate, this production\'s outputs', () => {
  const cue = { typed: envelope() };
  const facts = (over = {}) => ({
    declared: ok, bindings: { round: 'match.round', teams: 'match.teams' }, tree: { match: { round: 3 } }, treeRead: true, published: true,
    presence: { showId: 's1', status: 'joined', peers: [{ kind: 'output', name: 'A', typed: TYPED_READER }] }, showId: 's1', ...over,
  });
  // A bound path's JSON over the cue's value; a path that holds nothing keeps the cue's (teams).
  assert.deepEqual(typedSendFor(cue, facts()), { status: 'ok', typed: envelope({ ...values, round: 3 }) });
  // Never read from text: a number field bound to "3" refuses before anything is sent.
  assert.deepEqual(typedSendFor(cue, facts({ tree: { match: { round: '3' } } })), { status: 'refused', reason: 'round: a string is not a whole number.' });
  assert.equal(typedSendFor(cue, facts({ treeRead: false })).reason, 'This production’s shared values are still loading.');
  assert.equal(typedSendFor(cue, facts({ treeRead: false, published: false, presence: { showId: null, status: 'off', peers: [] } })).status, 'ok', 'unpublished: the local tree');
  assert.equal(typedSendFor({ ...cue, selection: { v: 1 } }, facts()).reason, 'A cue with a live candidate takes no typed data.');
  assert.equal(typedSendFor({}, facts()).status, 'none');
  // The outputs are this production's only: a view still on another one sends nothing.
  assert.equal(typedSendFor(cue, facts({ presence: { showId: 'other', status: 'joined', peers: [] } })).reason, 'Typed data waits until this page can see its outputs.');
  assert.equal(typedSendFor(cue, facts({ presence: { showId: 's1', status: 'joined', peers: [{ kind: 'output', name: 'Old' }] } })).reason, 'Reload Old: it cannot read typed data yet.');
  // Remembered per envelope while the facts are the same objects; a new fact asks again.
  const memo = createTypedSendMemo();
  const same = facts();
  const first = memo(cue, same);
  assert.equal(memo(cue, same), first);
  assert.notEqual(memo(cue, { ...same, tree: { match: { round: 1 } } }), first);
  assert.equal(memo(cue, same).status, 'ok');
  assert.equal(memo({ ...cue, selection: { v: 1 } }, same).status, 'refused', 'a selection added since is asked again');
});

// ── The wire ─────────────────────────────────────────────────────────────────────────────────

test('AC-3: a native cue\'s Take is the same bytes as before; a typed one carries the envelope beside empty data', () => {
  const nativeTake = takeCueItems({ id: 'c1', graphic: 'Board', values: { f0: 'Anna' } });
  assert.equal(JSON.stringify(nativeTake), '[{"graphic":"Board","msg":{"t":"update","data":{"f0":"Anna"}}},{"graphic":"Board","msg":{"t":"play"}},{"graphic":"Board","msg":{"t":"cue","cue":"c1"}}]');
  const typedTake = takeCueItems({ id: 'c1', graphic: 'Board', values: {}, typed: envelope() });
  assert.deepEqual(typedTake[0].msg, { t: 'update', data: {}, typed: envelope() });
});

test('the output: typed values air as they are; a data road\'s text never replaces them; a native Take ends them', () => {
  const state = { held: new Map(), airing: new Set() };
  assert.deepEqual(typedOutputGate(state, 'Board', { t: 'update', data: {}, typed: envelope() }), { apply: true, changed: false, values });
  assert.ok(state.airing.has('Board'));
  for (const msg of [{ t: 'play' }, { t: 'stop' }, { t: 'next' }]) assert.deepEqual(typedOutputGate(state, 'Board', msg), { apply: true, changed: false });
  // A bound field resolved to text by the database (`src: 'api'`), or a feed's: only its look.
  assert.deepEqual(typedOutputGate(state, 'Board', { t: 'update', data: { round: '3' }, src: 'api' }), { apply: true, changed: false, dropData: true });
  assert.ok(state.airing.has('Board'));
  // A native cue taken on that layer (an operator page's update) replaces the typed data.
  assert.deepEqual(typedOutputGate(state, 'Board', { t: 'update', data: { f0: 'x' } }), { apply: true, changed: false });
  assert.equal(state.airing.has('Board'), false);
  // Another graphic, native throughout, is untouched.
  assert.deepEqual(typedOutputGate(state, 'Other', { t: 'update', data: { f0: 'x' }, src: 'api' }), { apply: true, changed: false });
  // The output's source applies the values in place of the data, and never banks them.
  const main = readFileSync(path.join(root, 'src/output/main.ts'), 'utf8');
  const gate = main.indexOf('const gate = typedOutputGate(typed, graphic, incoming);');
  const typedApply = main.indexOf('if (gate.values || gate.dropData) {', gate);
  assert.ok(gate > 0 && typedApply > gate && typedApply < main.indexOf('mergedData.set(row.graphic, merged);', gate), 'typed data never reaches mergedData');
  assert.match(main, /typed: TYPED_READER,/);
  // A graphic airing typed data never reports native strings: its bank stays before its first
  // typed row, so a reboot replays the envelopes from the log.
  // A frame that replaces a typed graphic's (a newer body) is given the typed values it airs.
  assert.match(main, /data: \(graphic\) => heldData\(graphic\),/);
  assert.match(main, /typed\.airing\.has\(graphic\) \? \(typedData\.get\(graphic\)/);
  assert.match(main, /if \(gate\.values\) typedData\.set\(graphic, gate\.values\);/);
  assert.match(main, /const typedHolds = \(graphic: string\) => typed\.held\.has\(graphic\) \|\| typed\.airing\.has\(graphic\);/);
  // A data road's update with no look applies nothing (a foreign Graphic would get updateAction({})).
  assert.match(main, /if \(animate && \(gate\.values \|\| msg\.appearance\)\) stage\.apply\(/);
  const stage = readFileSync(path.join(root, 'src/output/stage.ts'), 'utf8');
  assert.match(stage, /post\(graphic, \{ cmd: 'update', data: JSON\.stringify\(typedData \?\? msg\.data \?\? \{\}\) \}\);/);
});

test('PROGRAM is rebuilt with the typed envelope this page aired, by the output\'s own rule', () => {
  const typedUpdate = { t: 'update', data: {}, typed: envelope() };
  let air = rememberAired({ ...NO_AIR, liveCue: { Board: 'c1' } }, [{ graphic: 'Board', msg: typedUpdate }, { graphic: 'Board', msg: { t: 'play' } }]);
  assert.deepEqual(air.typedAired, { Board: envelope() });
  // A data road's text leaves it; the rebuilt monitor gets the envelope, never the empty native data.
  air = rememberAired(air, [{ graphic: 'Board', msg: { t: 'update', data: { round: '3' }, src: 'api' } }]);
  assert.deepEqual(air.typedAired, { Board: envelope() });
  const { items } = restoreItems(air, {}, { clocks: new Map(), pairs: new Map() });
  assert.deepEqual(items, [{ graphic: 'Board', msg: typedUpdate }, { graphic: 'Board', msg: { t: 'play' } }]);
  // An operator's native update replaces it, and an Out ends it.
  assert.deepEqual(typedAfter({ Board: envelope() }, 'Board', { t: 'update', data: { f0: 'x' } }), {});
  assert.deepEqual(typedAfter({ Board: envelope() }, 'Board', { t: 'stop' }), {});
  const native = rememberAired(NO_AIR, [{ graphic: 'Board', msg: { t: 'update', data: { f0: 'x' } } }]);
  assert.equal(native.typedAired, undefined, 'a native page keeps its air part as it was');
  // Every stage, the page's monitors included, applies the same rule as the output's gate.
  const stage = readFileSync(path.join(root, 'src/output/stage.ts'), 'utf8');
  assert.match(stage, /if \(\(msg as \{ src\?: unknown \}\)\.src !== undefined\) dataless = true;/);
  assert.match(stage, /if \(dataless\) break;/);
});

// ── The outputs' capability ──────────────────────────────────────────────────────────────────

test('an output that does not say it reads typed data is sent none, and the page says so in one line', () => {
  const output = (name, extra = {}) => ({ kind: 'output', name, engine: 'OBS · Chromium 127', ...extra });
  assert.equal(typedOutputsRefusal(false, 'off', []), null, 'unpublished: no output');
  assert.equal(typedOutputsRefusal(true, 'joining', []), 'Typed data waits until this page can see its outputs.');
  assert.equal(typedOutputsRefusal(true, 'joined', []), null);
  assert.equal(typedOutputsRefusal(true, 'joined', [output('A', { typed: TYPED_READER }), { kind: 'operator' }]), null);
  assert.equal(typedOutputsRefusal(true, 'joined', [output('A', { typed: TYPED_READER }), output('Caspar 1-20')]), 'Reload Caspar 1-20: it cannot read typed data yet.');
  assert.equal(typedOutputsRefusal(true, 'joined', [output('A', { typed: TYPED_READER - 1 }), output('B', { typed: '1' })]), 'Reload 2 outputs (A, B): they cannot read typed data yet.');
  assert.equal(typedOutputsRefusal(true, 'joined', [{ kind: 'output', engine: 'CasparCG · Chromium 71' }]), 'Reload CasparCG · Chromium 71: it cannot read typed data yet.');
  // The Presence entry keeps the capability only as a positive whole number.
  const entry = (typedValue) => readLiveEntry({ kind: 'output', id: 'o1', typed: typedValue });
  assert.equal(entry(1).typed, 1);
  for (const bad of [0, -1, 1.5, '1', null]) assert.equal('typed' in entry(bad), false, String(bad));
});

// ── Bounded ──────────────────────────────────────────────────────────────────────────────────

test('linear on hostile input: a deep or wide value is refused at its bound, in time proportional to its size', () => {
  let deep = 'x';
  for (let i = 0; i < 100000; i++) deep = [deep];
  const started = performance.now();
  assert.match(typedTargetValue(node('teams'), deep).reason, /nested deeper than 16/);
  const wide = Array.from({ length: 200000 }, () => ({ name: 'A', score: 1 }));
  assert.match(typedTargetValue(node('teams'), wide).reason, /more than 10000 values/);
  assert.ok(performance.now() - started < 1000);
  assert.equal(nativeOf(envelope()).teams, '[{"name":"Home","score":2}]');
});
