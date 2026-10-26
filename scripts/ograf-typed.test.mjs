// guards: src/model/ografTyped.ts, src/model/shows.ts, src/model/rundownHistory.ts, src/model/productionData.ts, src/control/selectionAir.ts, src/control/cueAuto.ts, src/control/liveControls.ts, src/output/main.ts, src/export/targets/ografSchema.ts, scripts/ograf-schema-baseline.json, scripts/fixtures/ograf-typed/**
//
// TYPED OGRAF DATA, THE READING SIDE (docs/work-specs/playout-ograf-contract/spec.md, E1.1), in Node:
//   - AC-1: the pinned standard is the one authority (its schema hashes are the bytes the export
//     gate was transcribed from), and the descriptors, values, defaults, required and null/missing,
//     enums and typed action arguments of the fixtures validate as declared; unsupported features
//     are notes at exact paths; the exact field and action descriptors of each fixture are pinned
//     by hash;
//   - AC-3, model and read gate: a native record, message, legacy /update and /patch body is
//     unchanged byte for byte; an envelope this build cannot read is read-only at both write doors
//     and refused by the output's reader, and no reader takes it for ordinary fields; L1's pinned
//     block and L2.1's `appearance` member stay native;
//   - AC-4, model: migration round trips of the saved and imported fixtures, a deterministic
//     receipt, and typed editing disabled without losing a value.
// The output reader's half in the BUILT es2017 bundle is scripts/check-output-reader.mjs (after-build).

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import './lib/tsResolve.mjs';

const typed = await import('../src/model/ografTyped.ts');
const {
  OGRAF_STANDARD, TYPED_VERSION, TYPED_MAX_DEPTH, TYPED_MAX_SCHEMA_NODES, TYPED_MAX_VALUE_NODES, TYPED_KEPT,
  describeOgraf, validateTyped, validateActionArgs, readJson, canonicalJson, readTypedEnvelope, typedReadOnly,
  typedSendRefusal, readTypedWire, typedOutputGate, typedKeep, typedFrozen, migrateToTyped, nativeOf,
} = typed;
const { validateOgrafManifest } = await import('../src/export/targets/ografSchema.ts');
const { preparedCue } = await import('../src/model/productionData.ts');
const { replaceRundown, rundownSlice } = await import('../src/model/rundownHistory.ts');
const { selectionTake } = await import('../src/control/selectionAir.ts');
const { nextGraphicCue } = await import('../src/control/cueAuto.ts');
const { liveSelection } = await import('../src/control/liveControls.ts');
const { parseDataUpdate, parseDataPatch } = await import('../api/_lib/dataIngest.ts');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = path.join(root, 'scripts/fixtures/ograf-typed');
const manifest = (name) => JSON.parse(readFileSync(path.join(fixtureDir, name), 'utf8'));
const sha = (text) => createHash('sha256').update(text).digest('hex');
const stranger = manifest('stranger.ograf.json');
const scoreboard = manifest('ebu-scoreboard.ograf.json');
const facts = { collections: undefined, bindings: undefined, tree: {}, fieldsOf: () => [] };
const deepFreeze = (v) => {
  if (v && typeof v === 'object') {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
};

// ── AC-1: one pinned authority ───────────────────────────────────────────────────────────────

test('the pinned standard is the revision the export gate was transcribed from', () => {
  const baseline = JSON.parse(readFileSync(path.join(root, 'scripts/ograf-schema-baseline.json'), 'utf8'));
  assert.equal(OGRAF_STANDARD.spec, baseline.specVersion);
  assert.match(OGRAF_STANDARD.commit, /^[0-9a-f]{40}$/);
  const published = 'https://ograf.ebu.io/v1/';
  const schemas = Object.entries(OGRAF_STANDARD.files).filter(([file]) => file.startsWith('specification/json-schemas/'));
  assert.equal(schemas.length, Object.keys(baseline.files).length, 'every published schema file is pinned, and nothing more');
  for (const [file, hash] of schemas) {
    const url = published + file;
    assert.equal(baseline.files[url]?.sha256, hash, `${file} is the bytes the transcription records`);
  }
  // Prose and TypeScript of the same commit ride beside them; never a second revision.
  assert.ok(OGRAF_STANDARD.files['specification/docs/Specification.md']);
  assert.ok(OGRAF_STANDARD.files['typescript-definitions/src/apis/graphicsAPI.ts']);
});

test('the fixtures are manifests of that standard: the EBU examples of the commit and a stranger', () => {
  assert.deepEqual(validateOgrafManifest(stranger), []);
  for (const file of readdirSync(fixtureDir).filter((f) => f.startsWith('ebu-'))) {
    // The EBU examples break only the renderer rule ograf.ts adds beyond the schema (the id).
    const errors = validateOgrafManifest(manifest(file)).filter((e) => !e.startsWith('id:'));
    assert.deepEqual(errors, [], file);
  }
});

/** The exact field and action descriptors of every fixture. A change in what is read, carried or
 *  noted moves a hash here: re-read the diff, then re-record. */
const DESCRIPTOR_HASHES = {
  'ebu-bar-chart.ograf.json': '0fc745fe6c17d53729bc940b8bc5703abbca2eaaf9bd1de727e89d7f71ef4489 4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
  'ebu-scoreboard.ograf.json': '4f735d02c2e55a828b7ea75f1622689a8cf0393bcd27aefaf781c1cc791c2841 7baf191679b6af1044f27fa10a5dc4d82b8a4646a1be7e802b9f11309c22a4a1',
  'ebu-weather.ograf.json': '61842ed690327337bbede746f19dfbc7ffa17351afcb05625b8916e823b65844 4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
  'stranger.ograf.json': 'ea2ab3d4c29ff0839419f2ead765119d820f7017bf7da4293f1b6a1aa95b5cf2 1f79a74e7b05e13708ada999654270efe19579c53b52b8bdbad148cdf3654b6d',
};

test('exact field and action descriptor hashes of every fixture', () => {
  const files = readdirSync(fixtureDir).filter((f) => f.endsWith('.ograf.json')).sort();
  assert.deepEqual(files, Object.keys(DESCRIPTOR_HASHES).sort());
  for (const file of files) {
    const d = describeOgraf(manifest(file));
    assert.equal(d.standard, OGRAF_STANDARD.commit);
    const fields = sha(canonicalJson(d.fields));
    const actions = sha(canonicalJson(d.actions));
    assert.equal(`${fields} ${actions}`, DESCRIPTOR_HASHES[file], file);
  }
});

test('descriptors: nested objects and lists, typed enums, defaults, required, assets and colours', () => {
  const d = describeOgraf(stranger);
  const byKey = Object.fromEntries(d.fields.properties.map((p) => [p.key, p]));
  assert.equal(d.fields.type, 'object');
  assert.deepEqual(d.fields.properties.map((p) => p.key), ['title', 'round', 'ratio', 'live', 'accent', 'logo', 'opacity', 'teams', 'meta']);
  assert.equal(byKey.title.required, true);
  assert.equal(byKey.round.required, false);
  assert.deepEqual(byKey.round.node.enum, [1, 2, 3]);
  assert.equal(byKey.round.node.type, 'integer');
  assert.deepEqual(byKey.ratio.node.enum, [0.5, 1]);
  assert.deepEqual(byKey.live.node.enum, [true]);
  assert.equal(byKey.accent.node.colour, 'rrggbb');
  // An asset's identity is its string, not an image widget.
  assert.equal(byKey.logo.node.asset, true);
  assert.equal(byKey.logo.node.type, 'string');
  const teams = byKey.teams.node;
  assert.equal(teams.items.path, 'teams[]');
  assert.equal(teams.items.closed, true);
  assert.deepEqual(teams.default, [{ name: 'Home', score: 0 }]);
  const team = Object.fromEntries(teams.items.properties.map((p) => [p.key, p]));
  assert.equal(team.flags.node.items.path, 'teams[].flags[]');
  // Unsupported: a note at the exact schema path, and a node that keeps its value, never a widget.
  assert.equal(team.tie.node.type, 'unsupported');
  assert.equal(byKey.meta.node.properties[0].node.type, 'unsupported');
  assert.equal(byKey.meta.node.hidden, true);
  assert.deepEqual(d.notes, [
    { at: 'schema.properties.teams.items.properties.tie.oneOf', reason: 'this keyword is not supported' },
    { at: 'schema.properties.meta.properties.source.pattern', reason: 'only the GDD colour patterns are supported' },
  ]);
  // Typed action arguments, and an action that takes none.
  const [highlight, reset] = d.actions;
  assert.equal(highlight.args.properties.find((p) => p.key === 'pulse').node.properties[0].node.type, 'integer');
  assert.equal(reset.args, null);
});

test('descriptors: the standard\'s own annotations are carried; what is not carried is noted, and a default that does not fit too', () => {
  // `label` and `order` are annotations; `additionalProperties: false` closes the scoreboard.
  const d = describeOgraf(scoreboard);
  assert.deepEqual(d.notes, []);
  assert.equal(d.fields.closed, true);
  const notes = (schema) => describeOgraf({ schema }).notes;
  assert.deepEqual(notes({ type: 'object', properties: { a: { type: 'string', $ref: '#/x' } } }), [{ at: 'schema.properties.a.$ref', reason: 'this keyword is not supported' }]);
  assert.deepEqual(notes({ type: 'object', properties: { a: { type: 'integer', minimum: 5, default: 2 } } }), [{ at: 'schema.properties.a.default', reason: 'the default does not fit: below the minimum 5' }]);
  assert.deepEqual(notes({ type: 'object', additionalProperties: { type: 'string' }, properties: {} }), [{ at: 'schema.additionalProperties', reason: 'only true or false is supported' }]);
  assert.deepEqual(notes({ type: 'object', required: ['b'], properties: { a: { type: 'string' } } }), [{ at: 'schema.required', reason: '"b" is not a declared property' }]);
  assert.deepEqual(notes({ type: 'string' }), [{ at: 'schema.type', reason: 'a Graphic’s data schema is an object' }]);
  assert.deepEqual(notes({ type: 'object', properties: { e: { type: 'string', enum: ['a', 1] } } }), [{ at: 'schema.properties.e.enum', reason: 'every value must be a string' }]);
  // No supposed one-level support: a property of a property of a list item is read.
  const deep = describeOgraf({ schema: { type: 'object', properties: { a: { type: 'array', items: { type: 'object', properties: { b: { type: 'object', properties: { c: { type: 'boolean' } } } } } } } } });
  assert.equal(deep.fields.properties[0].node.items.properties[0].node.properties[0].node.path, 'a[].b.c');
});

test('validation: every declared rule, at its value path', () => {
  const fields = describeOgraf(stranger).fields;
  const ok = { title: 'Results', teams: [{ name: 'Home', score: 2, flags: ['x'] }], round: 3, ratio: 0.5, live: true, accent: '#00ff00', logo: 'images/a.png', opacity: 0.3, meta: { revision: 4, source: 'anything' } };
  assert.deepEqual(validateTyped(fields, ok), []);
  const errors = (patch) => validateTyped(fields, { ...ok, ...patch });
  assert.deepEqual(errors({ round: 4 }), [{ at: 'round', reason: '4 is not one of the declared values' }]);
  assert.deepEqual(errors({ round: '3' }), [{ at: 'round', reason: 'a string is not a whole number' }]);
  assert.deepEqual(errors({ ratio: 0.25 }), [{ at: 'ratio', reason: '0.25 is not one of the declared values' }]);
  assert.deepEqual(errors({ live: false }), [{ at: 'live', reason: 'false is not one of the declared values' }]);
  assert.deepEqual(errors({ live: 'true' }), [{ at: 'live', reason: 'a string is not a boolean' }]);
  assert.deepEqual(errors({ accent: '#00FF00' }), [{ at: 'accent', reason: 'not a #rrggbb colour' }]);
  assert.deepEqual(errors({ opacity: 1.2 }), [{ at: 'opacity', reason: 'above the maximum 1' }]);
  assert.deepEqual(errors({ opacity: 0.25 }), [{ at: 'opacity', reason: 'not a multiple of 0.1' }]);
  assert.deepEqual(errors({ opacity: 0.3 }), [], '0.3 is a multiple of 0.1 despite binary rounding');
  // A large quotient never hides a fraction.
  const whole = describeOgraf({ schema: { type: 'object', properties: { n: { type: 'number', multipleOf: 1 } } } }).fields;
  assert.deepEqual(validateTyped(whole, { n: 1000000000.5 }), [{ at: 'n', reason: 'not a multiple of 1' }]);
  assert.deepEqual(validateTyped(whole, { n: 1e15 }), []);
  assert.deepEqual(errors({ title: 'x'.repeat(41) }), [{ at: 'title', reason: 'longer than 40 characters' }]);
  assert.deepEqual(errors({ teams: [] }), [{ at: 'teams', reason: 'fewer than 1 items' }]);
  assert.deepEqual(errors({ teams: [{ name: 'A', score: -1 }] }), [{ at: 'teams[0].score', reason: 'below the minimum 0' }]);
  assert.deepEqual(errors({ teams: [{ name: 'A', score: 1, extra: 1 }] }), [{ at: 'teams[0].extra', reason: 'not a declared property' }]);
  assert.deepEqual(errors({ teams: [{ name: 'A', score: 1, flags: [1] }] }), [{ at: 'teams[0].flags[0]', reason: 'a number is not a string' }]);
  // Required and missing, missing and null: three different answers.
  const without = (key) => Object.fromEntries(Object.entries(ok).filter(([k]) => k !== key));
  assert.deepEqual(validateTyped(fields, without('title')), [{ at: 'title', reason: 'required' }]);
  assert.deepEqual(validateTyped(fields, without('round')), []);
  assert.deepEqual(errors({ round: null }), [{ at: 'round', reason: 'null is not a whole number' }]);
  // An unsupported node keeps whatever it holds; an open object keeps keys it does not declare.
  assert.deepEqual(errors({ teams: [{ name: 'A', score: 1, tie: { any: [1, null] } }] }), []);
  assert.deepEqual(errors({ meta: { revision: 1, unknown: true } }), []);
  // Defaults validate against their own node.
  for (const p of fields.properties) if (p.node.default !== undefined) assert.deepEqual(validateTyped(p.node, p.node.default), [], p.key);
});

test('typed action arguments validate, and an action without a schema takes none', () => {
  const [highlight, reset] = describeOgraf(stranger).actions;
  assert.deepEqual(validateActionArgs(highlight, { team: 2, colour: '#ff000080', pulse: { times: 3, fast: true } }), []);
  assert.deepEqual(validateActionArgs(highlight, { team: 4 }), [{ at: 'team', reason: 'above the maximum 3' }]);
  assert.deepEqual(validateActionArgs(highlight, { pulse: { times: 0 } }), [
    { at: 'team', reason: 'required' },
    { at: 'pulse.times', reason: 'below the minimum 1' },
  ]);
  assert.deepEqual(validateActionArgs(highlight, undefined), [{ at: '', reason: '"highlight" needs its arguments' }]);
  assert.deepEqual(validateActionArgs(reset, undefined), []);
  assert.deepEqual(validateActionArgs(reset, {}), [{ at: '', reason: '"reset" takes no arguments' }]);
});

test('bounded and linear on hostile input', () => {
  // The bounds, each at its edge with its own number: changing one turns this red.
  assert.deepEqual([TYPED_MAX_DEPTH, TYPED_MAX_SCHEMA_NODES, TYPED_MAX_VALUE_NODES], [16, 2000, 10000]);
  const nested = (n) => {
    let v = 0;
    for (let i = 0; i < n; i++) v = [v];
    return v;
  };
  assert.equal(readJson(nested(16)), null);
  assert.equal(readJson(nested(17)), 'nested deeper than 16');
  const props = (n) => ({ type: 'object', properties: Object.fromEntries(Array.from({ length: n }, (_, i) => [`p${i}`, { type: 'string' }])) });
  assert.deepEqual(describeOgraf({ schema: props(1999) }).notes, []);
  assert.equal(describeOgraf({ schema: props(2000) }).notes[0].reason, 'more than 2000 schema nodes');
  // Depth: a value nested far past the bound is refused without walking it all, or the stack.
  let deep = 'x';
  for (let i = 0; i < 200000; i++) deep = [deep];
  assert.equal(readJson(deep), `nested deeper than ${TYPED_MAX_DEPTH}`);
  assert.equal(readJson(Array.from({ length: TYPED_MAX_VALUE_NODES - 1 }, () => 0)), null);
  assert.equal(readJson(Array.from({ length: TYPED_MAX_VALUE_NODES }, () => 0)), `more than ${TYPED_MAX_VALUE_NODES} values`);
  assert.equal(readJson({ a: NaN }), 'a number that is not finite');
  assert.equal(readJson(new Date()), 'not a plain object');
  // A schema of more than the node bound is cut at the bound, with its note.
  const many = { type: 'object', properties: Object.fromEntries(Array.from({ length: TYPED_MAX_SCHEMA_NODES + 5 }, (_, i) => [`p${i}`, { type: 'string' }])) };
  const d = describeOgraf({ schema: many });
  assert.equal(d.notes[0].reason, `more than ${TYPED_MAX_SCHEMA_NODES} schema nodes`);
  // A schema nested past the depth bound.
  let nest = { type: 'string' };
  for (let i = 0; i < TYPED_MAX_DEPTH + 2; i++) nest = { type: 'object', properties: { a: nest } };
  assert.match(describeOgraf({ schema: nest }).notes[0].reason, /^nested deeper than/);
  // A long enum and a long list are checked in linear time: one set, one pass.
  const big = describeOgraf({ schema: { type: 'object', properties: { e: { type: 'array', items: { type: 'integer', enum: Array.from({ length: 1999 }, (_, i) => i) } } } } }).fields;
  const started = process.hrtime.bigint();
  assert.deepEqual(validateTyped(big, { e: Array.from({ length: 9990 }, (_, i) => i % 1999) }), []);
  assert.ok(Number(process.hrtime.bigint() - started) / 1e6 < 500, 'linear');
  // No pattern from a package is ever run, so a catastrophic one costs nothing.
  const redos = describeOgraf({ schema: { type: 'object', properties: { s: { type: 'string', pattern: '^(a+)+$' } } } });
  assert.equal(redos.fields.properties[0].node.type, 'unsupported');
  assert.deepEqual(validateTyped(redos.fields, { s: 'a'.repeat(5000) + '!' }), []);
});

// ── The envelope ─────────────────────────────────────────────────────────────────────────────

const schemaHash = describeOgraf(stranger).schema;
const envelope = (patch = {}) => ({ v: TYPED_VERSION, kind: 'values', standard: OGRAF_STANDARD.commit, schema: schemaHash, values: { title: 'A', teams: [{ name: 'H', score: 1 }] }, ...patch });

test('the envelope: read, later, another revision, malformed', () => {
  assert.deepEqual(readTypedEnvelope(undefined), { status: 'absent' });
  assert.equal(readTypedEnvelope(envelope()).status, 'ok');
  assert.equal(readTypedEnvelope({ v: 1, kind: 'action', standard: OGRAF_STANDARD.commit, schema: schemaHash, action: 'highlight', args: { team: 1 } }).status, 'ok');
  const why = (raw) => readTypedEnvelope(raw).reason;
  assert.equal(why(envelope({ v: 2, kind: 'something new' })), 'was saved by a later version of NoaCG');
  assert.equal(why(envelope({ standard: '164fb10bb361e249bc0cd915b0af3d6ed70083d8' })), 'was made for another OGraf revision');
  for (const bad of [null, 'x', [], envelope({ v: 0 }), envelope({ v: '1' }), envelope({ kind: 'other' }), envelope({ values: [] }), envelope({ values: { a: Infinity } }), envelope({ schema: '' }), envelope({ extra: 1 })]) {
    assert.equal(why(bad), 'cannot be read', JSON.stringify(bad));
  }
  assert.equal(typedReadOnly({ typed: envelope({ v: 3 }) }), true);
  // A cue holds values: an action envelope there is malformed, so the cue is read-only.
  assert.equal(typedReadOnly({ typed: { v: 1, kind: 'action', standard: OGRAF_STANDARD.commit, schema: schemaHash, action: 'reset' } }), true);
  assert.equal(typedReadOnly({ typed: envelope() }), false);
  assert.equal(typedReadOnly({}), false);
});

test('a page never sends typed data it cannot read, nor a live press on typed data, with the reason; a native cue is untouched', () => {
  assert.equal(typedSendRefusal({}), null);
  // E1.2a: a readable envelope airs through Take and Update (`typedForSend`), never a live press.
  assert.equal(typedSendRefusal({ typed: envelope() }), 'Live controls do not reach typed data yet.');
  assert.equal(typedSendRefusal({ typed: envelope({ v: 2 }) }), 'This cue’s typed data was saved by a later version of NoaCG, so it is read-only here.');
  // Take, Update and every Take refusal ask `selectionTake`.
  assert.deepEqual(selectionTake({ typed: envelope({ v: 9 }) }, 'Board', facts), { status: 'refused', reason: typedSendRefusal({ typed: envelope({ v: 9 }) }) });
  assert.deepEqual(selectionTake({ typed: envelope() }, 'Board', facts), { status: 'none' });
  assert.deepEqual(selectionTake({}, 'Board', facts), { status: 'none' });
  // Every road that sends a cue's own strings without resolving it leaves it out: the hosted page,
  // the exported controller, the SPX rundown and a timed end.
  assert.equal(preparedCue({ typed: envelope() }), false);
  assert.equal(preparedCue({}), true);
  const cues = [{ id: 'a' }, { id: 'b', typed: envelope() }, { id: 'c' }];
  assert.equal(nextGraphicCue(cues, 'a'), null);
  assert.equal(nextGraphicCue(cues, 'b'), 'c');
});

test('L1: a pinned block is native: the cue it presses with carries no envelope, or it sends nothing', () => {
  const cues = [{ id: 'n', sourceId: 'g', label: 'Native', values: { f0: 'x' } }, { id: 't', sourceId: 'g', label: 'Typed', values: { f0: 'x' }, typed: envelope() }];
  assert.equal(typedSendRefusal(liveSelection('Board', cues, { Board: 'n' }).airCue), null);
  // The layer airs a typed cue (another screen, a later build): every live press refuses it, which
  // scripts/graphic-verbs.test.mjs drives through the verbs.
  assert.ok(typedSendRefusal(liveSelection('Board', cues, { Board: 't' }).airCue));
  // The pinned block's own record, the profile, holds graphic names only.
  assert.equal(typedSendRefusal({}), null);
});

// ── The output's read gate ───────────────────────────────────────────────────────────────────

test('the output reader: a native message is not read, a values update is read, any other envelope is refused, nothing is stringified', () => {
  const native = deepFreeze([
    { t: 'update', data: { f0: 'Anna', f1: '3' } },
    // L2.1 and L2.2: `appearance`, style inside it, is a native wire member outside the envelope.
    { t: 'update', data: {}, appearance: { v: 1, x: 12, y: -4, scale: 1.1, anchor: 'center', style: { v: 1, vars: { '--accent': '#ff0000' }, font: 'Inter' } } },
    { t: 'play' }, { t: 'stop' }, { t: 'next' }, { t: 'snap', snap: null }, { t: 'event', event: 'goal', payload: { f2: '1' }, at: 5 }, { t: 'hello' },
  ]);
  const before = JSON.stringify(native);
  for (const msg of native) assert.equal(readTypedWire(msg), null, JSON.stringify(msg));
  assert.equal(JSON.stringify(native), before, 'byte for byte');
  assert.equal(readTypedWire({ t: 'update', data: {}, typed: undefined }), null);
  // E1.2a: a values envelope on an update is this output's data; on any other verb, or an action
  // envelope, it is refused.
  assert.deepEqual(readTypedWire({ t: 'update', data: {}, typed: envelope() }), { values: envelope().values });
  assert.deepEqual(readTypedWire({ t: 'play', typed: envelope() }), { reason: 'This output cannot show typed data yet: reload this output.' });
  assert.deepEqual(readTypedWire({ t: 'update', data: {}, typed: { v: 1, kind: 'action', standard: OGRAF_STANDARD.commit, schema: schemaHash, action: 'go' } }), { reason: 'This output cannot show typed data yet: reload this output.' });
  assert.deepEqual(readTypedWire({ t: 'update', data: {}, appearance: { v: 1 }, typed: envelope({ v: 2 }) }), { reason: 'This output cannot read this command’s data (it was saved by a later version of NoaCG): reload this output.' });
  assert.ok(readTypedWire({ t: 'event', event: 'highlight', typed: 'garbage' }).reason.includes('cannot be read'));
  // The output source refuses before it applies anything: the gate sits in front of the stage.
  const main = readFileSync(path.join(root, 'src/output/main.ts'), 'utf8');
  const gate = main.indexOf('const gate = typedOutputGate(typed, graphic, incoming);');
  assert.ok(gate > 0 && gate < main.indexOf("if (verb === 'update' ||", gate) && gate < main.indexOf('stage.apply(row.graphic', gate));
  // A held graphic never reports, so a reboot's recovery replays the refused command and holds
  // again: the report's write and the re-bank both skip it.
  const report = main.indexOf('const scheduleReport = ');
  const held = main.indexOf('if (typedHolds(graphic)) {', report);
  assert.ok(report > 0 && held > report && held < main.indexOf('controlOutputReport(', report), 'the report skips a held graphic before it writes');
  assert.match(main, /if \(seq <= at \|\| typedHolds\(graphic\)\) continue;/);
});

test('the output holds a refused graphic: a Take\'s play after its refused update never airs old values', () => {
  const state = { held: new Map(), airing: new Set() };
  const held = state.held;
  const typedUpdate = { t: 'update', data: { f0: 'stale' }, typed: envelope({ v: 2 }) };
  assert.deepEqual(typedOutputGate(state, 'Board', typedUpdate), { apply: false, changed: true });
  assert.deepEqual(typedOutputGate(state, 'Board', typedUpdate), { apply: false, changed: false });
  assert.equal(held.get('Board'), 'This output cannot read this command’s data (it was saved by a later version of NoaCG): reload this output.');
  for (const msg of [{ t: 'play' }, { t: 'next' }, { t: 'snap', snap: null }, { t: 'event', event: 'go' }]) assert.deepEqual(typedOutputGate(state, 'Board', msg), { apply: false, changed: false }, msg.t);
  // Another graphic is untouched; taking this one off always goes.
  assert.deepEqual(typedOutputGate(state, 'Other', { t: 'play' }), { apply: true, changed: false });
  assert.deepEqual(typedOutputGate(state, 'Board', { t: 'stop' }), { apply: true, changed: false });
  // A native update gives it its data again and lifts the hold.
  assert.deepEqual(typedOutputGate(state, 'Board', { t: 'update', data: { f0: 'fresh' } }), { apply: true, changed: true });
  assert.equal(held.size, 0);
  assert.deepEqual(typedOutputGate(state, 'Board', { t: 'play' }), { apply: true, changed: false });
  // So does a readable envelope (E1.2a), which airs as typed.
  typedOutputGate(state, 'Board', typedUpdate);
  assert.deepEqual(typedOutputGate(state, 'Board', { t: 'update', data: {}, typed: envelope() }), { apply: true, changed: true, values: envelope().values });
  assert.equal(held.size, 0);
  assert.ok(state.airing.has('Board'));
});

test('AC-3: legacy /update and /patch bodies are read exactly as before; an envelope is never flattened into a field', () => {
  const update = { graphic: 'Board', values: { Title: 'A', Score: 3, Live: true } };
  assert.equal(sha(JSON.stringify(parseDataUpdate(update))), sha(JSON.stringify({ ok: true, req: { graphic: 'Board', cue: undefined, values: { Title: 'A', Score: '3', Live: 'true' } } })));
  // An envelope in a value is a nested object: refused by name, never stringified into the field.
  assert.deepEqual(parseDataUpdate({ values: { Title: envelope() } }), { ok: false, error: 'The value for "Title" must be a string, number or boolean.' });
  const patch = { match: { home: { score: 2 } } };
  assert.deepEqual(parseDataPatch(patch), { ok: true, patch });
  assert.deepEqual(parseDataPatch({ data: patch }), { ok: true, patch });
});

// ── The write doors ──────────────────────────────────────────────────────────────────────────

const showWith = (cues) => ({ id: 's', name: 'S', updatedAt: '', graphics: [{ id: 'g', name: 'Board' }], cues, folders: [], playoutItems: [] });

test('both write doors: an envelope is kept byte for byte, a read-only cue in every byte, and none is gained', () => {
  const ok = { id: 'a', sourceId: 'g', label: 'A', values: {}, typed: envelope() };
  const later = { id: 'b', sourceId: 'g', label: 'B', values: { f0: 'x' }, typed: envelope({ v: 2, more: [1] }) };
  const native = { id: 'c', sourceId: 'g', label: 'C', values: {} };
  const show = showWith([ok, later, native]);
  const kept = typedKeep(show);
  const after = (cues) => typedFrozen(kept, { cues });
  assert.equal(after([ok, later, native]), null);
  assert.equal(after([{ ...ok, label: 'renamed' }, later, native]), null, 'a native member of a readable cue may change');
  assert.equal(after([{ ...ok, typed: { ...ok.typed, values: { title: 'B' } } }, later, native]), TYPED_KEPT);
  assert.equal(after([{ ...ok, typed: undefined }, later, native]), TYPED_KEPT, 'never dropped');
  assert.equal(after([ok, { ...later, label: 'x' }, native]), TYPED_KEPT, 'a read-only cue keeps every byte');
  assert.equal(after([ok, native]), TYPED_KEPT, 'and is never removed');
  assert.equal(after([later, native]), null, 'a readable cue may be removed');
  assert.equal(after([ok, later, { ...native, typed: envelope() }]), TYPED_KEPT, 'none is gained but through the writer');
  // E1.2a: a copy carries an envelope the record already held, byte for byte; never another, and
  // never a read-only one.
  assert.equal(after([ok, later, native, { ...ok, id: 'copy' }]), null, 'a copy carries it');
  assert.equal(after([ok, later, native, { ...ok, id: 'copy', typed: envelope({ values: { title: 'B' } }) }]), TYPED_KEPT);
  assert.equal(after([ok, later, native, { ...later, id: 'copy' }]), TYPED_KEPT, 'a read-only copy is not carried'); 
  // A record without typed cues has nothing to keep and passes every write.
  assert.equal(typedKeep(showWith([native])), null);
  assert.equal(typedFrozen(null, { cues: [native] }), null);
  // A record with no typed cue gains none either, but an undo may bring one back.
  assert.equal(typedFrozen(null, { cues: [native, ok] }), TYPED_KEPT);
  assert.equal(typedFrozen(null, { cues: [native, ok] }, new Set(['a'])), null);
  // The second door: an undo brings back a deleted cue with its own bytes, and is refused when it
  // would change a read-only cue.
  const without = showWith([later, native]);
  const restored = replaceRundown(without, rundownSlice(without), rundownSlice(show));
  assert.equal(restored.refused, null);
  assert.deepEqual(restored.show.cues.find((c) => c.id === 'a').typed, ok.typed);
  const edited = showWith([ok, { ...later, label: 'edited elsewhere' }, native]);
  assert.equal(replaceRundown(show, rundownSlice(show), rundownSlice(edited)).refused, TYPED_KEPT);
});

test('the door is asked by both writes of patchShowChecked and by the undo', () => {
  const shows = readFileSync(path.join(root, 'src/model/shows.ts'), 'utf8');
  assert.match(shows, /const typed = typedKeep\(show\);\n {2}const result = mutate\(show, at\);/);
  assert.match(shows, /selectionFrozen\(kept, show, undefined, write\) \?\? typedFrozen\(typed, show, undefined, typedWrite\)/);
  assert.match(shows, /const typedFresh = typedKeep\(fresh\);\n {4}const again = mutate\(fresh, at\);/);
  assert.match(shows, /typedFrozen\(typedFresh, fresh, undefined, typedWrite\)/);
});

// ── AC-4: migration ──────────────────────────────────────────────────────────────────────────

/** Every declared default of a description as the native strings a cue would hold. */
const nativeDefaults = (d) => Object.fromEntries(d.fields.properties.filter((p) => p.node.default !== undefined).map((p) => [p.key, typeof p.node.default === 'string' ? p.node.default : JSON.stringify(p.node.default)]));

test('migration round trips the imported fixtures: native strings to typed and back, byte for byte', () => {
  for (const file of readdirSync(fixtureDir)) {
    const d = describeOgraf(manifest(file));
    const native = nativeDefaults(d);
    const { envelope: env, receipt } = migrateToTyped(d, native);
    assert.deepEqual(receipt.refused, [], file);
    assert.equal(readTypedEnvelope(env).status, 'ok', file);
    assert.deepEqual(nativeOf(env), Object.fromEntries(Object.keys(native).sort().map((k) => [k, native[k]])), file);
    // And typed to native to typed.
    assert.deepEqual(migrateToTyped(d, nativeOf(env)).envelope, env, file);
  }
  const d = describeOgraf(scoreboard);
  const { envelope: env } = migrateToTyped(d, { homeScore: '2', awayScore: '0', homeShort: 'FCZ', minute: '45' });
  assert.deepEqual(env.values, { awayScore: 0, homeScore: 2, homeShort: 'FCZ', minute: 45 });
});

test('migration reads by the declared type only, losslessly or not at all', () => {
  const d = describeOgraf(stranger);
  const base = { title: 'A', teams: '[{"name":"H","score":1}]' };
  const refused = (patch) => migrateToTyped(d, { ...base, ...patch });
  // A string that only looks like a number stays a string where the schema says string.
  assert.equal(migrateToTyped(d, { ...base, title: '42' }).envelope.values.title, '42');
  assert.deepEqual(refused({ round: '01' }).receipt.refused, [{ at: 'round', reason: '"01" is not a whole number written plainly' }]);
  assert.deepEqual(refused({ ratio: '1.0' }).receipt.refused, [{ at: 'ratio', reason: '"1.0" is not a number written plainly' }]);
  assert.deepEqual(refused({ live: 'yes' }).receipt.refused, [{ at: 'live', reason: '"yes" is neither true nor false' }]);
  assert.deepEqual(refused({ teams: '[{"name": "H","score":1}]' }).receipt.refused, [{ at: 'teams', reason: 'not JSON written compactly' }]);
  assert.deepEqual(refused({ round: '7' }).receipt.refused, [{ at: 'round', reason: '7 is not one of the declared values' }]);
  for (const patch of [{ round: '01' }, { round: '7' }]) assert.equal(refused(patch).envelope, null);
  // Fields that each fit can still overrun the envelope together: refused, never written unreadable.
  const lists = describeOgraf({ schema: { type: 'object', properties: { a: { type: 'array', items: { type: 'number' } }, b: { type: 'array', items: { type: 'number' } } } } });
  const half = JSON.stringify(Array.from({ length: 6000 }, () => 1));
  const over = migrateToTyped(lists, { a: half, b: half });
  assert.equal(over.envelope, null);
  assert.deepEqual(over.receipt.refused, [{ at: '', reason: 'more than 10000 values' }]);
  // A graphic without a data schema, or a native one, is never migrated.
  assert.equal(migrateToTyped(describeOgraf({}), base).envelope, null);
});

test('a property named __proto__ survives the migration both ways', () => {
  const d = describeOgraf(stranger);
  const native = JSON.parse('{"__proto__":"keep me","title":"Title","teams":"[{\\"name\\":\\"H\\",\\"score\\":1}]"}');
  const { envelope: env, receipt } = migrateToTyped(d, native);
  assert.deepEqual(receipt.refused, []);
  assert.deepEqual(receipt.kept, ['__proto__']);
  assert.ok(Object.prototype.hasOwnProperty.call(env.values, '__proto__'));
  assert.equal(Object.getPrototypeOf(env.values), Object.prototype);
  const back = nativeOf(env);
  assert.deepEqual(Object.keys(back), ['__proto__', 'teams', 'title']);
  assert.equal(JSON.stringify(back), JSON.stringify(Object.fromEntries(Object.keys(native).sort().map((k) => [k, native[k]]))));
});

test('the receipt is deterministic: the same input in any order gives the same envelope and receipt', () => {
  const d = describeOgraf(stranger);
  const a = migrateToTyped(d, { title: 'A', teams: '[{"name":"H","score":1}]', round: '2', extra: 'kept' });
  const b = migrateToTyped(describeOgraf(JSON.parse(JSON.stringify(stranger))), { extra: 'kept', round: '2', teams: '[{"name":"H","score":1}]', title: 'A' });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.deepEqual(a.receipt.converted, ['round', 'teams', 'title']);
  assert.deepEqual(a.receipt.kept, ['extra']);
  assert.equal(a.receipt.standard, OGRAF_STANDARD.commit);
  assert.equal(a.receipt.schema, d.schema);
  assert.equal(sha(canonicalJson(a.receipt)), '4e7b7ae540ebcdc72e30b27a0561fad5f9290099d1009e41e284ee12ccd5e821');
});

test('typed editing disabled keeps the package and every value', () => {
  // An unsupported node: its native string is kept as it is and comes back unchanged.
  const d = describeOgraf(stranger);
  const value = { title: 'A', teams: '[{"name":"H","score":1,"tie":"x"}]', meta: '{"source":"Not-Lower"}' };
  const { envelope: env, receipt } = migrateToTyped(d, value);
  assert.deepEqual(receipt.refused, []);
  assert.deepEqual(nativeOf(env), Object.fromEntries(Object.keys(value).sort().map((k) => [k, value[k]])));
  // Reading never touches the manifest it describes, so the package's bytes stay its own.
  const frozen = deepFreeze(JSON.parse(JSON.stringify(stranger)));
  const bytes = JSON.stringify(frozen);
  describeOgraf(frozen);
  assert.equal(JSON.stringify(frozen), bytes);
  // This build edits no envelope: a cue holding one keeps its values through every write.
  const cue = { id: 'a', sourceId: 'g', label: 'A', values: {}, typed: env };
  assert.equal(typedFrozen(typedKeep(showWith([cue])), { cues: [{ ...cue, values: { f0: 'typed over' } }] }), null);
  assert.equal(typedFrozen(typedKeep(showWith([cue])), { cues: [{ ...cue, typed: { ...env, values: {} } }] }), TYPED_KEPT);
});

test('the saved fixture (a production saved before any typed data) migrates to itself', () => {
  const { show } = JSON.parse(readFileSync(path.join(root, 'scripts/fixtures/show-saved-before-c1a.json'), 'utf8'));
  const bytes = JSON.stringify(show);
  // Its graphics are native: no schema, so no cue has typed data and every door passes.
  assert.equal(typedKeep(show), null);
  assert.equal(typedFrozen(null, show), null);
  for (const cue of show.cues ?? []) {
    assert.equal(typedSendRefusal(cue), null);
    assert.equal(preparedCue(cue), true);
    assert.equal(migrateToTyped(describeOgraf({}), cue.values).envelope, null);
  }
  assert.equal(JSON.stringify(show), bytes);
});
