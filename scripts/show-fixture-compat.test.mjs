// guards: src/model/shows.ts, src/model/productionData.ts, src/control/liveData.ts, src/control/contentFormats.ts
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

const { resolveBindings } = await import('../src/model/productionData.ts');
const { hasLiveData } = await import('../src/control/liveData.ts');
const { fillList, listFormatFor, starterRows } = await import('../src/control/contentFormats.ts');

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
