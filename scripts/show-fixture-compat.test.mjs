// guards: src/model/shows.ts, src/model/productionData.ts, src/control/liveData.ts, src/control/contentFormats.ts, src/control/anotherSystem.ts, src/control/sourceMapping.ts, src/control/externalSource.ts
//
// A PRODUCTION SAVED BY AN EARLIER BUILD STILL LOADS AND PLAYS (docs/work-specs/data-sources/spec.md
// AC-12: "a record saved by today's build loads and plays unchanged after every phase that adds a
// persisted field"). Added in C1a; each later phase that adds a persisted field extends it.
//
// The fixture, scripts/fixtures/show-saved-before-c1a.json, is a record the app itself saved, read
// back raw from its store: a lower third with an embedded Sheet block in its script and a field
// bound to the production's data, a ticker cue, a seed, a table, and no sources. Beside it is the
// live tree it played from and the text PROGRAM showed after Take on each graphic. It was made by
// driving the app with Playwright (the phase notes say how), never written by hand.
//
// "Loads" is the TypeScript compiler's answer: the record, as a literal, still type-checks as a
// `Show`, so a renamed or removed field, or a new required one, fails here. "Plays" is the
// resolution contract: the cue's own values with the live tree's bound values over them are the
// text that went on air. model/shows.ts is not importable in Node (production-page spec §5.2), so
// what the page reads is checked through its types and the pure modules it resolves with.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import './lib/tsResolve.mjs';

const { externalReadOnly, resolveBindings, sourceIdOf, sourcePaths } = await import('../src/model/productionData.ts');
const { projectSource } = await import('../src/control/sourceMapping.ts');
const { readExternalRegistration } = await import('../src/control/externalSource.ts');
const { hasLiveData } = await import('../src/control/liveData.ts');
const { fillList, listFormatFor, starterRows } = await import('../src/control/contentFormats.ts');
const { apiDestinations, apiOffers } = await import('../src/control/anotherSystem.ts');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturePath = path.join(root, 'scripts/fixtures/show-saved-before-c1a.json');
const { show, liveData, onAir } = JSON.parse(readFileSync(fixturePath, 'utf8'));

/** The compiler's errors for `show` read as a `Show` (and the live tree as JSON). */
function showTypeErrors(record) {
  const file = path.join(root, 'src/__show_fixture_check__.ts');
  const source = [
    "import type { Show } from './model/shows';",
    "import type { JsonObject } from './model/productionData';",
    `export const show: Show = ${JSON.stringify(record)};`,
    `export const live: JsonObject = ${JSON.stringify(liveData)};`,
  ].join('\n');
  const config = ts.getParsedCommandLineOfConfigFile(path.join(root, 'tsconfig.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} });
  const options = { ...config.options, noEmit: true, skipLibCheck: true, noUnusedLocals: false };
  const host = ts.createCompilerHost(options);
  const read = host.readFile.bind(host);
  const exists = host.fileExists.bind(host);
  const sourceFile = host.getSourceFile.bind(host);
  host.readFile = (name) => (path.resolve(name) === file ? source : read(name));
  host.fileExists = (name) => path.resolve(name) === file || exists(name);
  host.getSourceFile = (name, lang, ...rest) =>
    path.resolve(name) === file ? ts.createSourceFile(name, source, lang) : sourceFile(name, lang, ...rest);
  const program = ts.createProgram([file], options, host);
  return ts
    .getPreEmitDiagnostics(program, program.getSourceFile(file))
    .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

test('the saved record still type-checks as a Show, with no field it does not know', () => {
  assert.deepEqual(showTypeErrors(show), [], 'a production saved by the earlier build no longer reads as a Show');
});

// C3 adds message sources to `Show.sources`: a Sheet tab with `inbox`, and YouTube comments or live
// chat. The earlier record, with these added, still reads; a YouTube source holds no key.
const withMessageSources = {
  ...show,
  sources: [
    { id: 'm1', kind: 'sheet', label: 'Messages', config: { sheetId: '1NoaCGStubSheet0000000000', gid: null, shape: 'lines' }, inbox: true },
    { id: 'y1', kind: 'youtube', label: 'jNQXAC9IVRw', config: { videoId: 'jNQXAC9IVRw', mode: 'comments' }, inbox: true },
    { id: 'y2', kind: 'youtube', label: '4xDzrJKXOOY', config: { videoId: '4xDzrJKXOOY', mode: 'chat' }, inbox: true, paused: true },
  ],
};

test('with a message Sheet and both YouTube modes it still reads as a Show, and plays the same (C3)', () => {
  assert.deepEqual(showTypeErrors(withMessageSources), []);
  const resolved = resolveBindings(liveData, withMessageSources.bindings);
  assert.deepEqual(resolved, resolveBindings(liveData, show.bindings), 'a message source changes no field');
});

test('a YouTube source with a key, or a mode it does not know, does not read as a Show (C3)', () => {
  const keyed = structuredClone(withMessageSources);
  keyed.sources[1].config.apiKey = 'AIza-not-a-real-key';
  assert.notDeepEqual(showTypeErrors(keyed), []);
  const odd = structuredClone(withMessageSources);
  odd.sources[2].config.mode = 'superchat';
  assert.notDeepEqual(showTypeErrors(odd), []);
});

// C4 adds news feeds to `Show.sources`: an address, read through NoaCG's feed route, whose
// headlines fill a ticker at `feed.<id>.lines`. The earlier record with a feed added still reads,
// and its other fields play the same.
const withFeed = {
  ...show,
  sources: [{ id: 'f1', kind: 'feed', label: 'Yle', config: { url: 'https://yle.fi/rss/uutiset/paauutiset' } }],
  bindings: { ...show.bindings, 'News Strip': { f0: 'feed.f1.lines' } },
};

test('with a news feed connected to its ticker it still reads as a Show, and every other field plays the same (C4)', () => {
  assert.deepEqual(showTypeErrors(withFeed), []);
  const live = { ...liveData, feed: { f1: { lines: 'First\nSecond' } } };
  const resolved = resolveBindings(live, withFeed.bindings);
  assert.deepEqual(resolved.Hairline, resolveBindings(liveData, show.bindings).Hairline);
  assert.equal(resolved['News Strip'].f0, 'First\nSecond');
});

test('a feed source carrying anything but its address, or a kind it does not know, does not read as a Show (C4)', () => {
  const keyed = structuredClone(withFeed);
  keyed.sources[0].config.password = 'x';
  assert.notDeepEqual(showTypeErrors(keyed), []);
  const odd = structuredClone(withFeed);
  odd.sources[0].kind = 'rss';
  assert.notDeepEqual(showTypeErrors(odd), []);
});

// C5 adds no persisted field: a graphic connected to Another system is ordinary bindings to `api.`
// paths, with no source record. The earlier record with one still reads, its other fields play the
// same, and the card's example names exactly that graphic's connected fields.
const strip = () => show.graphics.find((g) => g.name !== 'Hairline') ?? show.graphics[0];
const withApi = () => {
  const graphic = strip();
  const offers = apiOffers(show.bindings, graphic.name, [{ key: 'f0', label: 'Headline' }, { key: 'f1', label: 'Detail' }], {});
  return { ...show, bindings: { ...show.bindings, [graphic.name]: Object.fromEntries(offers.map((o) => [o.key, o.path])) } };
};

test('with a graphic connected to Another system it still reads as a Show, adds no source, and plays the same (C5)', () => {
  const record = withApi();
  assert.deepEqual(showTypeErrors(record), []);
  assert.equal(record.sources, undefined, 'Another system is the data key, not a source record');
  const graphic = strip();
  const paths = Object.values(record.bindings[graphic.name]);
  assert.ok(paths.every((p) => p.startsWith('api.')), paths.join(', '));
  const live = { ...liveData, api: { [paths[0].split('.')[1]]: { headline: 'Polls close', detail: '20:00' } } };
  const resolved = resolveBindings(live, record.bindings);
  if (graphic.name !== 'Hairline') assert.deepEqual(resolved.Hairline, resolveBindings(liveData, show.bindings).Hairline);
  assert.equal(resolved[graphic.name].f0, 'Polls close');
  const dests = apiDestinations(record.bindings, [{ name: graphic.name, fields: [{ key: 'f0', label: 'Headline' }, { key: 'f1', label: 'Detail' }], values: {} }]);
  assert.deepEqual(dests.map((d) => d.fieldId).sort(), ['f0', 'f1']);
});

test('it plays unchanged: each cue with the live tree over its bound fields is what PROGRAM showed', () => {
  const resolved = resolveBindings(liveData, show.bindings);
  for (const [name, fields] of Object.entries(onAir)) {
    const graphic = show.graphics.find((g) => g.name === name);
    const cue = show.cues.find((c) => c.sourceId === graphic.id);
    const airs = { ...cue.values, ...resolved[name] };
    for (const [field, text] of Object.entries(fields)) assert.equal(airs[field], text, `${name} ${field}`);
  }
  // The bound field aired the tree's value, not the cue's own stale one.
  assert.notEqual(show.cues[0].values.f0, onAir.Hairline.f0);
});

test('its embedded Sheet block, its table and its binding are all still there; it has no sources', () => {
  assert.ok(hasLiveData(show.graphics.find((g) => g.name === 'Hairline').template.js), 'the embedded Sheet block');
  assert.deepEqual(show.bindings, { Hairline: { f0: 'guest.name' } });
  assert.equal(show.datasets[0].rows[0].values.c0, 'Bo Chen');
  assert.equal('sources' in show, false);
});

test('the format adapters leave its saved list exactly as it is (C1a)', () => {
  for (const graphic of show.graphics) {
    for (const cue of show.cues.filter((c) => c.sourceId === graphic.id)) {
      for (const field of Object.keys(cue.values)) {
        const format = listFormatFor(graphic, field);
        if (!format || format.main !== field) continue;
        assert.deepEqual(fillList(format, starterRows(format, cue.values)).values[field], cue.values[field], `${graphic.name} ${field}`);
      }
    }
  }
  assert.ok(listFormatFor(show.graphics.find((g) => g.name === 'News Strip'), 'f0'), 'the ticker field is recognised');
});

// E4.2 adds connector sources (`kind: 'external'`, paths `external.<id>.<leaf>`, a `config.v`).
// A production as the pre-E4 build saved it, with every C0-C7 kind at once (the record above, a
// connected Sheet, a message Sheet, both YouTube modes, a feed on the ticker and a graphic on
// Another system; composed from the shapes those phases pinned above), loads and plays unchanged:
// no source of it is a connector, nothing of it is read-only, and the evaluator moves none of its
// paths. A record carrying a connector of a LATER version (v 2, with fields this build does not
// know) still loads, keeps its last values on air, and is held read-only.
const preE4 = () => {
  const api = withApi();
  return {
    ...api,
    sources: [
      { id: 's1', kind: 'sheet', label: 'Guests', config: { sheetId: '1NoaCGStubSheet0000000001', gid: '0', shape: 'values' } },
      ...withMessageSources.sources,
      ...withFeed.sources,
    ],
    bindings: { ...api.bindings, 'News Strip': { f0: 'feed.f1.lines' }, Hairline: { f0: 'sheet.s1.values.name' } },
  };
};

test('a production saved by the pre-E4 build, every C0-C7 kind at once, loads and plays unchanged (E4.2)', () => {
  const record = preE4();
  assert.deepEqual(showTypeErrors(record), []);
  assert.deepEqual(record.sources.map((s) => externalReadOnly(s)), record.sources.map(() => false));
  const live = { ...liveData, sheet: { s1: { values: { name: 'Bo Chen' } } }, feed: { f1: { lines: 'First' } } };
  const before = resolveBindings(live, record.bindings);
  // The evaluator writes only `external.` paths: an older production has none for it to move.
  for (const source of record.sources) {
    const projected = projectSource({ sourceId: source.id, payload: { name: 'X', lines: ['Y'] }, bindings: record.bindings, fieldsOf: () => null, lists: { lines: 'lines' } });
    assert.deepEqual(projected.writes, {}, source.id);
  }
  assert.deepEqual(resolveBindings(live, record.bindings), before);
  assert.equal(before.Hairline.f0, 'Bo Chen');
  // Every connected path still names its own source, so Disconnect and pruning keep working.
  assert.deepEqual(sourcePaths(record.bindings, 'f1').map((p) => p.path), ['feed.f1.lines']);
  assert.equal(sourceIdOf('sheet.s1.values.name'), 's1');
});

const withConnector = (config) => ({
  ...show,
  sources: [{ id: 'e1', kind: 'external', label: 'Results', config }],
  bindings: { ...show.bindings, 'News Strip': { f0: 'external.e1.parties' } },
});

test('a v 1 connector source reads as a Show and is usable; its fields follow `external.<id>.` paths (E4.2)', () => {
  const record = withConnector({ v: 1, configRevision: 1, endpoint: 'https://results.example/r', lists: { parties: 'lines' } });
  assert.deepEqual(showTypeErrors(record), []);
  assert.equal(externalReadOnly(record.sources[0]), false);
  assert.equal(readExternalRegistration(record.sources[0]).ok, true);
  assert.deepEqual(sourcePaths(record.bindings, 'e1').map((p) => p.path), ['external.e1.parties']);
});

test('a connector source of a later version (v 2) loads, keeps its last values on air and is held read-only (E4.2)', () => {
  const record = withConnector({ v: 2, configRevision: 4, endpoint: 'https://results.example/r', recipe: { keyed: 'candidate_id' } });
  assert.deepEqual(showTypeErrors(record), [], 'a later version must still load');
  assert.equal(externalReadOnly(record.sources[0]), true);
  // A malformed record (no version) is not a later version: it stays editable, and the route refuses it.
  assert.equal(externalReadOnly({ kind: 'external', config: { configRevision: 1 } }), false);
  const read = readExternalRegistration(record.sources[0]);
  assert.deepEqual([read.ok, read.readOnly], [false, true]);
  const live = { ...liveData, external: { e1: { parties: 'KOK\t225000' } } };
  assert.equal(resolveBindings(live, record.bindings)['News Strip'].f0, 'KOK\t225000', 'the last value stays on air');
  assert.deepEqual(resolveBindings(live, record.bindings).Hairline, resolveBindings(liveData, show.bindings).Hairline);
});

// E5.1 adds a recipe to a connector's registration (`config.mapping`, additive optional, no
// migration). A production saved before it (a v 1 connector with no mapping) projects exactly as
// it did; a v 1 recipe is read; a recipe of a LATER version (v 2) still loads, keeps the last
// values on air, makes the source read-only and evaluates nothing.
test('a production saved before recipes projects as before; a v 1 recipe is read (E5.1)', () => {
  const config = { v: 1, configRevision: 1, endpoint: 'https://results.example/r', lists: { parties: 'lines' } };
  const preE5 = withConnector(config);
  assert.deepEqual(showTypeErrors(preE5), []);
  const payload = { parties: [{ id: 'KOK', votes: 225000 }, { id: 'SDP', votes: 215000 }] };
  const project = (record) => {
    const { registration } = readExternalRegistration(record.sources[0]);
    return projectSource({ sourceId: 'e1', payload, bindings: record.bindings, fieldsOf: () => null, lists: registration.lists, mapping: registration.mapping, configRevision: registration.configRevision });
  };
  assert.deepEqual(project(preE5).writes, { 'external.e1.parties': 'KOK\t225000\nSDP\t215000' });
  const mapped = withConnector({ ...config, mapping: { v: 1, sourceId: 'e1', configRevision: 1, outputs: { parties: { from: 'parties', id: 'id', sort: { by: 'votes', order: 'asc' }, columns: [{ from: 'id' }] } } } });
  assert.deepEqual(showTypeErrors(mapped), []);
  assert.equal(externalReadOnly(mapped.sources[0]), false);
  assert.deepEqual(project(mapped).writes, { 'external.e1.parties': 'SDP\nKOK' });
});

test('a recipe of a later version (v 2) loads, keeps its last values on air, and evaluates nothing (E5.1)', () => {
  const later = { v: 2, sourceId: 'e1', configRevision: 1, outputs: { parties: { from: 'parties', keyed: 'candidate_id' } } };
  const record = withConnector({ v: 1, configRevision: 1, endpoint: 'https://results.example/r', lists: { parties: 'lines' }, mapping: later });
  assert.deepEqual(showTypeErrors(record), [], 'a later recipe must still load');
  assert.equal(externalReadOnly(record.sources[0]), true, 'its source is not edited, so the recipe is kept as it is');
  const { registration } = readExternalRegistration(record.sources[0]);
  assert.deepEqual(registration.mapping, later, 'kept byte for byte');
  const projected = projectSource({ sourceId: 'e1', payload: { parties: ['x'] }, bindings: record.bindings, fieldsOf: () => null, lists: registration.lists, mapping: registration.mapping, configRevision: 1 });
  assert.deepEqual([projected.writes, projected.held.readOnly], [{}, true]);
  const live = { ...liveData, external: { e1: { parties: 'KOK\t225000' } } };
  assert.equal(resolveBindings(live, record.bindings)['News Strip'].f0, 'KOK\t225000', 'the last value stays on air');
});
