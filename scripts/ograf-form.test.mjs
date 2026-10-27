// guards: src/control/ografForm.ts, src/control/ografContract.ts, src/control/typedSend.ts, src/control/panelActions.ts, src/model/ografTyped.ts, src/model/shows.ts, scripts/fixtures/ograf-typed/**
//
// TYPED OGRAF FORMS AND ARGUMENTS (docs/work-specs/playout-ograf-controls/spec.md, E2.1), the pure
// half. The browser half is e2e/ograf-controls.spec.ts.
//   - AC-1: a form edit writes the typed value it means (an enum keeps its declared value's type and
//     identity, a number stays a number), by path, copied along the path only; drafts that do not fit
//     are marked where they are and refused only by the action that sends them; defaults apply when
//     a value is made, never on reopen; unsupported nodes are notes at their path, their value kept;
//     a URI stays text and only an image path draws a picture; `hidden` only leaves a value out of
//     the display name; action arguments are kept per action version and sent in E1's envelope.
//   - AC-4: the declared actions are ordinary arrangeable buttons whose `typed` mark reaches no
//     native panel capability (E6.1's foreign descriptors are unchanged).
//   - Outside input stays linear: a hostile `minItems`, a deep value and a long list are bounded.

import './lib/tsResolve.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stranger = JSON.parse(readFileSync(path.join(root, 'scripts/fixtures/ograf-typed/stranger.ograf.json'), 'utf8'));

const form = await import('../src/control/ografForm.ts');
const typed = await import('../src/model/ografTyped.ts');
const contract = await import('../src/control/ografContract.ts');
const { typedActionSendFor } = await import('../src/control/typedSend.ts');
const { graphicCapabilities, foreignCapabilities } = await import('../src/control/panelActions.ts');

const { describeOgraf, readOgrafDeclared, typedSeed, typedWithDefaults, typedActionFor, actionArgsOf, actionSchemaOf, readTypedArgs, readTypedWire, typedOutputGate, migrateToTyped, OGRAF_STANDARD, TYPED_MAX_VALUE_NODES, TYPED_MAX_SEND_BYTES, TYPED_ACTIONS_READER } = typed;
const declared = readOgrafDeclared({ v: 1, manifest: stranger });
const fields = declared.fields;
const node = (key) => fields.properties.find((p) => p.key === key).node;
const action = (id) => declared.description.actions.find((a) => a.id === id);

test('paths read and write the value they name, copied along the path only, any key name kept', () => {
  const value = { teams: [{ name: 'Home', score: 0 }], title: 'T' };
  const next = form.setAt(value, ['teams', 0, 'score'], 3);
  assert.deepEqual(next, { teams: [{ name: 'Home', score: 3 }], title: 'T' });
  assert.deepEqual(value.teams[0].score, 0, 'the draft it came from is untouched');
  assert.equal(form.getAt(next, ['teams', 0, 'score']), 3);
  assert.equal(form.getAt(next, ['teams', 5, 'score']), undefined);
  // Removing an item closes the list; removing a key removes only that key.
  assert.deepEqual(form.setAt(next, ['teams', 0], undefined), { teams: [], title: 'T' });
  assert.deepEqual(form.setAt(next, ['title'], undefined), { teams: [{ name: 'Home', score: 3 }] });
  // A container missing on the way is made of the step's kind.
  assert.deepEqual(form.setAt({}, ['meta', 'revision'], 1), { meta: { revision: 1 } });
  assert.deepEqual(form.setAt({}, ['teams', 0], { name: 'A' }), { teams: [{ name: 'A' }] });
  // `__proto__` is a key like any other: kept as data, never the prototype.
  const odd = form.setAt({}, ['__proto__'], 'x');
  assert.deepEqual(Object.keys(odd), ['__proto__']);
  assert.equal(Object.getPrototypeOf(odd), Object.prototype);
  assert.equal(form.pathKey(['teams', 1, 'name']), 'teams[1].name');
  assert.equal(form.pathKey([]), '');
});

test('each leaf is the control its declared type means, and an edit gives back the typed value', () => {
  // A typed enum: options are the declared values' indices, labelled as declared; identity kept.
  const round = form.typedLeaf(node('round'), 'round');
  assert.equal(round.descriptor.kind, 'select');
  assert.deepEqual(round.descriptor.options, [{ value: '0', label: 'Round one' }, { value: '1', label: 'Round two' }, { value: '2', label: 'Final' }]);
  assert.equal(round.read('2'), 3);
  assert.equal(typeof round.read('2'), 'number');
  assert.equal(round.show(3), '2');
  assert.equal(round.show('3'), 'other', 'a string "3" is not the integer 3');
  const ratio = form.typedLeaf(node('ratio'), 'ratio');
  assert.equal(ratio.read('0'), 0.5);
  assert.equal(form.typedLeaf(node('live'), 'live').read('0'), true, 'a boolean enum keeps its boolean');
  const flags = { path: 'x', type: 'string', enum: ['1', 'true'] };
  assert.equal(form.typedLeaf(flags, 'x').read('1'), 'true', 'a string enum stays strings');
  // Numbers stay numbers with their declared bounds and step.
  const opacity = form.typedLeaf(node('opacity'), 'opacity');
  assert.deepEqual([opacity.descriptor.kind, opacity.descriptor.min, opacity.descriptor.max, opacity.descriptor.step], ['number', 0, 1, 0.1]);
  assert.equal(opacity.read(0.3), 0.3);
  assert.equal(form.typedLeaf({ path: 'n', type: 'integer' }, 'n').descriptor.step, 1);
  // A colour with no alpha is the colour control; with alpha it is a text line.
  assert.equal(form.typedLeaf(node('accent'), 'accent').descriptor.kind, 'color');
  assert.equal(form.typedLeaf(action('highlight').args.properties.find((p) => p.key === 'colour').node, 'colour').descriptor.kind, 'text');
  // An image path draws the picture picker; any other file path is a URI, a text line.
  assert.equal(form.typedLeaf(node('logo'), 'logo').descriptor.kind, 'image');
  const video = describeOgraf({ schema: { type: 'object', properties: { clip: { type: 'string', gddType: 'file-path/video-path' }, any: { type: 'string', gddType: 'file-path' } } } }).fields;
  for (const p of video.properties) assert.equal(form.typedLeaf(p.node, p.key).descriptor.kind, 'text', p.key);
  // A container has no leaf.
  assert.equal(form.typedLeaf(node('teams'), 'teams'), null);
});

test('drafts that do not fit are marked at their paths, kept, and refused only by what sends them', () => {
  const values = { title: 'R', teams: [{ name: '', score: -1 }], round: 9 };
  const errors = form.typedErrorsByPath(fields, values);
  assert.deepEqual([...errors.keys()].sort(), ['round', 'teams[0].name', 'teams[0].score']);
  assert.match(errors.get('teams[0].name')[0], /shorter than 1/);
  // Take refuses the whole, with the first path; the stored draft is untouched.
  const cue = { typed: { v: 1, kind: 'values', standard: OGRAF_STANDARD.commit, schema: declared.description.schema, values } };
  const bytes = JSON.stringify(cue);
  assert.equal(typed.typedForSend(cue, declared).status, 'refused');
  assert.equal(JSON.stringify(cue), bytes);
});

test('defaults apply when a value is made, never when a form reopens', () => {
  // On: declared defaults fill only what is missing, and say which.
  const filled = typedWithDefaults(fields, { title: 'Mine', teams: [] });
  assert.deepEqual(filled.filled, ['accent', 'live', 'opacity', 'ratio', 'round']);
  assert.equal(filled.values.title, 'Mine');
  assert.deepEqual(filled.values.teams, [], 'a value the operator emptied stays empty');
  assert.equal('logo' in filled.values, false, 'no default, not required: stays missing');
  assert.equal('meta' in filled.values, false);
  // A new list item takes its declared shape: required properties, nothing optional without a default.
  assert.deepEqual(typedSeed(node('teams').items), { name: '', score: 0 });
  assert.deepEqual(typedSeed(node('meta')), { revision: 0 });
  assert.deepEqual(typedSeed(node('teams')), [{ name: 'Home', score: 0 }], 'a declared default wins');
  // The default's object is copied, never shared with the descriptor.
  const seeded = typedSeed(node('teams'));
  seeded[0].name = 'Changed';
  assert.equal(node('teams').default[0].name, 'Home');
  // The migration takes the same rule when asked, and still refuses a lossy string.
  const on = migrateToTyped(declared.description, { title: 'X' }, { defaults: true, draft: true });
  assert.deepEqual(on.receipt.defaulted, ['accent', 'live', 'opacity', 'ratio', 'round', 'teams']);
  assert.deepEqual(on.envelope.values.teams, [{ name: 'Home', score: 0 }]);
  assert.equal(migrateToTyped(declared.description, { round: '01' }, { defaults: true, draft: true }).envelope, null);
  // A converted whole that does not fit is kept as a draft (the form marks it), and refused without.
  const long = 'x'.repeat(41);
  assert.equal(migrateToTyped(declared.description, { title: long }, { defaults: true, draft: true }).envelope.values.title, long);
  assert.equal(migrateToTyped(declared.description, { title: long }, { defaults: true }).envelope, null);
  // Without the option E1's migration is unchanged: whole or nothing.
  assert.equal(migrateToTyped(declared.description, { title: 'X' }).envelope, null);
});

test('a hostile minItems seeds a bounded list and a hostile value is refused, both in linear time', () => {
  const hostile = describeOgraf({ schema: { type: 'object', properties: { many: { type: 'array', minItems: 1e9, items: { type: 'object', required: ['a'], properties: { a: { type: 'string' } } } } } } }).fields;
  const started = process.hrtime.bigint();
  const seeded = typedSeed(hostile.properties[0].node);
  assert.ok(Number(process.hrtime.bigint() - started) / 1e6 < 1000, 'seeding stopped at its budget');
  assert.ok(seeded.length > 0 && seeded.length <= TYPED_MAX_VALUE_NODES);
  assert.match(form.typedErrorsByPath(hostile, { many: seeded }).get('many')[0], /fewer than/);
  // A draft too deep to keep is refused by the action writer before anything is stored.
  let deep = 'x';
  for (let i = 0; i < 100; i += 1) deep = [deep];
  assert.equal(typedActionFor(declared, 'highlight', { v: 1, actions: { highlight: { schema: actionSchemaOf(action('highlight')), args: { team: 0, pulse: deep } } } }).status, 'refused');
  // A list longer than the form draws is drawn to its cap.
  assert.equal(form.TYPED_FORM_ITEMS_SHOWN, 50);
});

test('unsupported nodes are notes at their exact schema path; their values are kept, never edited', () => {
  const notes = declared.description.notes.map((n) => n.at);
  assert.ok(notes.includes('schema.properties.teams.items.properties.tie.oneOf'));
  assert.ok(notes.includes('schema.properties.meta.properties.source.pattern'));
  const tie = node('teams').items.properties.find((p) => p.key === 'tie').node;
  assert.equal(tie.type, 'unsupported');
  assert.equal(form.typedLeaf(tie, 'tie'), null);
  assert.deepEqual(form.typedErrorsByPath(fields, { title: 'T', teams: [{ name: 'A', score: 1, tie: { any: 'thing' } }] }).size, 0, 'kept as it is');
  assert.equal(typed.typedUnsupportedAt(node('teams')), 'teams[].tie');
  assert.equal(typed.typedUnsupportedAt(node('round')), null);
});

test('`hidden` leaves a value out of the display name only; the form and the contract still offer it', () => {
  assert.equal(node('meta').hidden, true);
  assert.equal(form.typedSummary(fields, { meta: { revision: 1 }, title: 'Results', round: 3, ratio: 1 }), 'Results · Final');
  const words = describeOgraf({ schema: { type: 'object', properties: { secret: { type: 'string', hidden: true }, name: { type: 'string' }, line: { type: 'string' } } } }).fields;
  assert.equal(form.typedSummary(words, { secret: 'Do not show', name: 'Anna\nRiva', line: 'Host' }), 'Anna · Host');
  assert.equal(form.typedSummary(words, { secret: 'x' }), '');
  // The flat contract (bench, bridge) offers a hidden property as a control too.
  const c = contract.ografContract({ schema: { type: 'object', properties: { secret: { type: 'string', title: 'Secret', hidden: true } } } });
  assert.deepEqual(c.descriptors.map((d) => d.key), ['secret']);
});

test('the flat contract reads a generic URI as text and only declared image semantics as a picture', () => {
  const c = contract.ografContract({
    schema: {
      type: 'object',
      properties: {
        link: { type: 'string', format: 'uri' },
        ref: { type: 'string', format: 'uri-reference' },
        clip: { type: 'string', contentMediaType: 'video/mp4' },
        photo: { type: 'string', contentMediaType: 'image/png' },
        logo: { type: 'string', gddType: 'file-path/image-path' },
        teams: { type: 'array', items: { type: 'string' } },
      },
    },
  });
  assert.deepEqual(Object.fromEntries(c.descriptors.map((d) => [d.key, d.kind])), { link: 'text', ref: 'text', clip: 'text', photo: 'image', logo: 'image' });
  // A shape no single control draws is a note at its path, never a guessed widget.
  assert.ok(c.notes.includes("schema.properties.teams: a array property has no single text control; a cue's typed form edits it."));
});

test('action arguments are kept per action version and sent in E1’s envelope, validated whole', () => {
  const highlight = action('highlight');
  // Nothing kept: the form starts from a new value; the press validates that.
  assert.deepEqual(actionArgsOf(highlight, undefined), { team: 0 });
  const ok = typedActionFor(declared, 'highlight', undefined);
  assert.equal(ok.status, 'ok');
  assert.deepEqual(ok.typed, { v: 1, kind: 'action', standard: OGRAF_STANDARD.commit, schema: actionSchemaOf(highlight), action: 'highlight', args: { team: 0 } });
  // Kept arguments, typed; another version's are not this one's.
  const kept = { v: 1, actions: { highlight: { schema: actionSchemaOf(highlight), args: { team: 2, pulse: { times: 3, fast: true } } } } };
  assert.deepEqual(typedActionFor(declared, 'highlight', kept).typed.args, { team: 2, pulse: { times: 3, fast: true } });
  assert.deepEqual(actionArgsOf(highlight, { v: 1, actions: { highlight: { schema: 'older', args: { team: 3 } } } }), { team: 0 });
  // Arguments that do not fit name their path; nothing kept is touched.
  const bad = { v: 1, actions: { highlight: { schema: actionSchemaOf(highlight), args: { team: 2, colour: '#zz' } } } };
  assert.deepEqual(typedActionFor(declared, 'highlight', bad), { status: 'refused', reason: 'Highlight a team: colour not a #rrggbbaa colour.' });
  assert.deepEqual(typedActionFor(declared, 'highlight', { v: 1, actions: { highlight: { schema: actionSchemaOf(highlight), args: { team: '2' } } } }).reason, 'Highlight a team: team a string is not a whole number.');
  // An action that takes none carries none; an unknown one is refused, never mapped to Next.
  assert.deepEqual(typedActionFor(declared, 'reset', undefined).typed, { v: 1, kind: 'action', standard: OGRAF_STANDARD.commit, schema: actionSchemaOf(action('reset')), action: 'reset' });
  assert.equal(typedActionFor(declared, 'next', undefined).status, 'refused');
  // Kept arguments of a later version are read-only: refused, not overwritten.
  assert.equal(readTypedArgs({ v: 2, actions: {} }).status, 'read-only');
  assert.equal(readTypedArgs({ v: 1, actions: { a: { schema: 's' } } }).status, 'read-only');
  assert.equal(typedActionFor(declared, 'highlight', { v: 2 }).status, 'refused');
  // The size one command takes.
  const huge = { v: 1, actions: { highlight: { schema: actionSchemaOf(highlight), args: { team: 1, colour: '#00000000', pulse: { note: 'x'.repeat(TYPED_MAX_SEND_BYTES) } } } } };
  assert.match(typedActionFor(declared, 'highlight', huge).reason, /larger than one command takes \(64 KiB\)/);
  // An action whose arguments use what E1 does not carry is refused, never sent with a guess.
  const odd = readOgrafDeclared({ v: 1, manifest: { customActions: [{ id: 'x', name: 'X', schema: { type: 'object', properties: { a: { type: 'string', oneOf: [] } } } }] } });
  assert.match(typedActionFor(odd, 'x', undefined).reason, /schema feature this version does not carry/);
});

test('a press asks every output it sees to read typed actions (2); an E1.2a output reads values only', () => {
  const facts = (peers) => ({ declared, published: true, presence: { showId: 's', status: 'joined', peers }, showId: 's' });
  assert.equal(TYPED_ACTIONS_READER, 2);
  assert.equal(typedActionSendFor({}, 'reset', facts([{ kind: 'output', name: 'New', typed: 2 }])).status, 'ok');
  assert.deepEqual(typedActionSendFor({}, 'reset', facts([{ kind: 'output', name: 'Old', typed: 1 }])), { status: 'refused', reason: 'Reload Old: it cannot read typed actions yet.' });
  assert.equal(typedActionSendFor({}, 'reset', { ...facts([]), published: false }).status, 'ok', 'unpublished: no output');
});

test('the wire: an action envelope on its own event reaches the Graphic typed; any other is refused, and a held graphic takes none', () => {
  const env = typedActionFor(declared, 'highlight', undefined).typed;
  assert.deepEqual(readTypedWire({ t: 'event', event: 'highlight', typed: env }), { action: 'highlight', args: { team: 0 } });
  assert.match(readTypedWire({ t: 'event', event: 'other', typed: env }).reason, /cannot show typed data/);
  assert.match(readTypedWire({ t: 'update', data: {}, typed: env }).reason, /cannot show typed data/);
  const state = { held: new Map(), airing: new Set() };
  assert.deepEqual(typedOutputGate(state, 'B', { t: 'event', event: 'highlight', typed: env }), { apply: true, changed: false });
  assert.equal(state.airing.size, 0, 'an action changes no data');
  state.held.set('B', 'refused');
  assert.deepEqual(typedOutputGate(state, 'B', { t: 'event', event: 'highlight', typed: env }), { apply: false, changed: false });
  // The OGraf call: customAction with the arguments as JSON, updateAction with the values.
  assert.deepEqual(contract.ografCallFor({ t: 'event', event: 'highlight', typed: env }), { call: 'custom', args: ['highlight', { team: 0 }] });
  const values = { v: 1, kind: 'values', standard: OGRAF_STANDARD.commit, schema: 's', values: { n: 2, on: true } };
  assert.deepEqual(contract.ografCallFor({ t: 'update', data: { n: 'two' }, typed: values }), { call: 'update', args: [{ n: 2, on: true }] });
  assert.equal(contract.ografCallFor({ t: 'event', event: 'highlight', typed: { v: 9 } }), null, 'never the native payload in its place');
  assert.equal(contract.ografCallFor({ t: 'update', data: { n: 'two' }, typed: { v: 9 } }), null);
  assert.deepEqual(contract.ografCallFor({ t: 'event', event: 'go', payload: { a: 'b' } }), { call: 'custom', args: ['go', { a: 'b' }] });
});

test('declared actions are ordinary arranged buttons; a panel sees them only as E6.1 foreign descriptors', () => {
  const buttons = contract.typedActionButtons({ v: 1, manifest: stranger });
  assert.deepEqual(buttons, [{ event: 'highlight', label: 'Highlight a team', typed: true }, { event: 'reset', label: 'Reset', typed: true }]);
  assert.deepEqual(contract.typedActionButtons(undefined), []);
  assert.deepEqual(contract.typedActionButtons({ v: 2, manifest: stranger }), []);
  const control = (button) => ({ button, label: button.label, named: false });
  const caps = graphicCapabilities({
    graphic: 'Results',
    live: 'c1',
    cue: 'C1',
    arranged: { pinned: [control(buttons[0])], sections: new Map([['Actions', [control({ event: 'goal', label: 'Goal' })]]]), more: [control(buttons[1])] },
    numbers: [],
    legal: () => true,
    stepping: true,
    aired: null,
  });
  assert.deepEqual(caps.map((c) => c.id), ['event:goal']);
  // E6.1's foreign descriptors are unchanged: advertised, never invocable.
  const foreign = foreignCapabilities(stranger);
  assert.deepEqual(foreign.caps.map((c) => [c.id, c.invocable]), [['foreign:highlight', false], ['foreign:reset', false]]);
  assert.deepEqual(foreign.refused, []);
});
