// guards: src/model/controlCue.ts
//
// CONTROL CUES, RELEASE 1 (docs/work-specs/osc-control-cues/spec.md D3, D4, AC-10), run in Node.
// A cue is a graphic, a server cue or a control cue, read only through `cueKind`. This build reads
// and keeps an OSC cue - through a copy, a paste, an undo snapshot and a team merge, byte for byte -
// and never treats it as a graphic or a server file: its Take and any folder holding it are refused
// with a reason before anything is sent. A raw `cue.source` comparison anywhere in src/ fails here.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const { cueKind, readControl, controlReadOnly, isControlCue, isGraphicCue, isServerCue, OSC_NOT_YET } = await import('../src/model/controlCue.ts');
const { copyClip, pasteCopies } = await import('../src/model/cueClipboard.ts');
const { rundownRefusal } = await import('../src/model/rundownHistory.ts');
const { throughMisfit } = await import('../src/model/showFolders.ts');
const { mergeTeamShow } = await import('../src/model/teamShowMerge.ts');
const { togetherPlan } = await import('../src/control/serverPlayout.ts');
const { folderAir, cueOnAir } = await import('../src/control/folderAir.ts');
const { NO_OWNERSHIP } = await import('../src/control/serverState.ts');

const control = (extra = {}) => ({ v: 1, kind: 'osc', destinationId: 'desk', address: '/zeros/cue/go', args: [{ type: 's', value: '0' }, { type: 's', value: '5' }], ...extra });
const osc = (id, extra = {}) => ({ id, sourceId: '', source: 'control', label: id, values: {}, control: control(), ...extra });
const graphic = (id, extra = {}) => ({ id, sourceId: `g-${id}`, label: id, values: { f0: id }, ...extra });
const desk = { id: 'desk', name: 'Lighting desk', host: '192.168.1.40', port: 8830 };

test('cueKind: absent source is a graphic, playout a server cue, anything else a control cue', () => {
  assert.equal(cueKind({}), 'graphic');
  assert.equal(cueKind({ source: 'playout' }), 'server');
  assert.equal(cueKind({ source: 'control' }), 'control');
  // A source from a later build is neither a graphic nor a server file, so nothing airs it as one.
  assert.equal(cueKind({ source: 'http' }), 'control');
  assert.equal(isGraphicCue(null), false);
  assert.equal(isServerCue(undefined), false);
  assert.equal(isControlCue(osc('L')), true);
  assert.equal(isGraphicCue(osc('L')), false);
});

test('readControl reads version 1 OSC records only; an unreadable control cue is read-only', () => {
  assert.deepEqual(readControl(control()), control());
  assert.equal(readControl(control({ v: 2 })), null);
  assert.equal(readControl(control({ kind: 'midi' })), null);
  assert.equal(readControl(control({ args: [{ type: 'T', value: '' }] })), null, 'true/false waits for a later version');
  assert.equal(controlReadOnly(osc('L')), false);
  assert.equal(controlReadOnly(osc('L', { control: { v: 2, kind: 'osc' } })), true);
  assert.equal(controlReadOnly(graphic('A')), false, 'a graphic cue is never read-only for this reason');
});

test('copy, paste and duplicate keep an OSC cue byte for byte, and it pastes where its desk is missing', () => {
  const later = { v: 2, kind: 'osc', somethingNew: [1, 2] };
  const rec = { id: 'show', cues: [graphic('A'), osc('L'), osc('X', { control: later })], folders: [], graphics: [{ id: 'g-A' }], playoutItems: [] };
  const copied = copyClip(rec, ['L', 'X']);
  let n = 0;
  const out = pasteCopies({ ...rec, oscDestinations: [] }, copied, { after: 'A' }, () => `n${++n}`);
  assert.ok(!('refused' in out), 'a control cue references no graphic, so a paste is not refused');
  const pasted = out.cues.filter((c) => out.added.includes(c.id));
  assert.deepEqual(pasted.map((c) => [c.source, c.sourceId, c.control]), [['control', '', control()], ['control', '', later]]);
});

test('an undo snapshot holding an OSC cue is not refused as a missing source', () => {
  const slice = { cues: [graphic('A'), osc('L')], folders: [], graphics: [{ id: 'g-A' }], playoutItems: [] };
  assert.equal(rundownRefusal(slice), null);
  assert.equal(rundownRefusal({ ...slice, graphics: [] }), 'The saved rundown references a missing source.', 'a graphic cue is still checked');
});

test('team merge keeps an OSC cue untouched and merges destinations item by item', () => {
  const AT = '2026-11-20T00:00:00.000Z';
  const show = (extra) => ({ id: 'show', name: 'Show', graphics: [], updatedAt: AT, ...extra });
  const base = show({ cues: [osc('L', { control: { v: 9, future: 'kept' } })], oscDestinations: [desk] });
  const ours = show({ cues: base.cues, oscDestinations: [desk, { id: 'lx2', name: 'Second desk', host: '10.0.0.2', port: 9000 }] });
  const theirs = show({ cues: [...base.cues, graphic('A')], oscDestinations: [{ ...desk, port: 8831 }] });
  const { doc, lost } = mergeTeamShow(base, ours, theirs, AT);
  assert.deepEqual(lost, []);
  assert.deepEqual(doc.cues[0].control, { v: 9, future: 'kept' });
  assert.deepEqual(doc.oscDestinations.map((d) => `${d.id}:${d.port}`), ['desk:8831', 'lx2:9000']);
});

test('a Play-through folder names an OSC cue; a together folder holding one is refused before anything is sent', () => {
  assert.equal(throughMisfit(osc('L'), []), 'an OSC cue');
  const r = { items: [], addressOf: () => '1-10', graphicOf: (c) => ({ name: c.sourceId, layer: 20 }), ability: null, blockerOf: () => null };
  const plan = togetherPlan([graphic('A'), osc('Lights')], r);
  assert.deepEqual(plan, { ok: false, reason: OSC_NOT_YET('Lights') });
});

test('an OSC cue is never on air and never holds a together folder at partial', () => {
  const folders = [{ id: 'W', name: 'Winner', mode: 'together' }];
  const cues = [graphic('A', { folderId: 'W' }), osc('L', { folderId: 'W' })];
  const input = { folders, cues, items: [], ownership: NO_OWNERSHIP, liveCue: { 'g-A': 'A', '': 'L' }, graphicName: (c) => c.sourceId };
  assert.equal(cueOnAir(cues[1], input), false, 'not even when a stray live entry names it');
  const air = folderAir(input).W;
  assert.deepEqual([air.lit, air.onAir], ['on', ['A']]);
});

test('no file in src/ compares a cue source by hand: every reader goes through cueKind', () => {
  const root = new URL('../src/', import.meta.url).pathname;
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(ts|tsx)$/.test(name)) files.push(path);
    }
  };
  walk(root);
  const raw = /\.source\s*[!=]==\s*'(playout|control)'|'(playout|control)'\s*[!=]==\s*[\w.?]+\.source\b/;
  const offenders = files
    .filter((f) => !f.endsWith(join('model', 'controlCue.ts')))
    .flatMap((f) => readFileSync(f, 'utf8').split('\n').map((line, i) => (raw.test(line) ? `${relative(root, f)}:${i + 1}` : null)).filter(Boolean));
  assert.deepEqual(offenders, [], 'use cueKind / isGraphicCue / isServerCue / isControlCue from src/model/controlCue.ts');
});
