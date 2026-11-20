// guards: src/backend/teamProductions.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as history from '../src/model/rundownHistory.ts';
import * as teamMerge from '../src/model/teamShowMerge.ts';
import { rolldown } from 'rolldown';
import * as pacing from '../src/backend/pacing.ts';
import * as copySettle from '../src/model/copySettle.ts';
import * as unitPatch from '../src/backend/unitPatch.ts';

const bundle = await rolldown({ input: 'src/backend/assets.ts', platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
await bundle.close();
const assets = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);

const source = readFileSync(new URL('../src/backend/teamProductions.ts', import.meta.url), 'utf8');
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};

/** Execute the real save controller with a delayed disk and RPC, without an account/server. */
function harness(pending = true, graphics = [], storage = undefined, settle = { settleGraphics: (graphics) => ({ graphics, changed: false }) }, retainFails = { left: 0 }, cues = undefined, extra = {}) {
  const disk = deferred();
  const request = deferred();
  const requests = [];
  const names = [];
  const answers = [];
  let local = { id: 'show', teamId: 'team', version: 2, name: 'First edit', graphics, ...(cues ? { cues } : {}), ...extra };
  let retained = { local };
  const stubs = {
    './supabase': { getSupabase: async () => ({ storage, rpc: async (name, args) => { requests.push(args); names.push(name); return answers.length ? answers.shift() : request.promise; } }) },
    './teams': {},
    './assets': assets,
    './pacing': pacing,
    // Saves in parts (live-publishing G4) are off here: the whole save these tests pin.
    './partialWrites': { partialWritesOn: async () => false, unitPace: async () => {}, noteWritten: () => {} },
    './unitPatch': unitPatch,
    '../model/shows': { separateMergedScenes: show => show },
    '../model/teamShows': { loadTeamShows: () => [local], applyServerTeamShow: doc => { local = doc; }, clearTeamShows: () => {} },
    '../model/rundownHistory': history,
    '../model/teamShowMerge': teamMerge,
    // The send-time settle (live-publishing W2) is copy-settle.test.mjs's; nothing here differs in design.
    '../model/copySettle': settle,
    '../model/durableStore': { canAuthorAccount: () => true, libraryInUse: () => 'owner', commitDurableWrites: () => disk.promise },
    '../model/teamOutbox': {
      retainTeamEdit: (_owner, _id, edit) => {
        if (retainFails.left > 0) { retainFails.left -= 1; throw new Error('Browser storage is full.'); }
        retained = edit;
      },
      pendingTeamEdits: () => retained ? { show: retained } : {},
      acknowledgeTeamEdit: (_owner, _id, sent) => { if (JSON.stringify(retained?.local) === JSON.stringify(sent)) retained = null; },
    },
  };
  // Only seed the controller's existing revision and announce real edits. No save implementation
  // is duplicated here: flushTeamProduction/pushSave are the production module's own functions.
  const setup = `
    export function seedForTest(doc: Show, pending: boolean) {
      running = { userId: 'owner', stop: () => {} };
      server.set(doc.id, { token: 'base', doc, teamId: 'team', updatedBy: 'owner' });
      if (pending) { dirty.add(doc.id); setSaving(doc.id, 'pending'); }
    }
    export function editForTest(id: string, draft?: TeamCueDraftText, previous?: Show) { scheduleSave(id, draft, previous); }
    export function pushForTest(id: string) { return pushSave(id); }
    export function seedBaseForTest(doc: Show) { server.set(doc.id, { token: 'base', doc, teamId: 'team', updatedBy: 'owner' }); }
    export function pacingForTest() { return { readFailures, readsResumeAt, saveFailures, savesResumeAt }; }
    export function noteReadForTest(failed: boolean) { noteRead(failed); }
    export function noteSaveForTest(failed: boolean) { noteSave(failed); }
  `;
  const compiled = ts.transpileModule(source + setup, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => {
    assert.ok(name in stubs, `unexpected dependency: ${name}`);
    return stubs[name];
  }, setTimeout: () => 1, clearTimeout: () => {} });
  exports.seedForTest(local, pending);
  return {
    controller: exports, disk, request, requests, names, answers,
    local: () => local,
    edit(name) { local = { ...local, name }; exports.editForTest(local.id); },
    connectWords(recipe) {
      const previous = local;
      local = { ...local, collections: [recipe] };
      exports.editForTest(local.id, undefined, previous);
    },
    typeCue(cueId, label, values) {
      const previous = local;
      local = { ...local, cues: local.cues.map(cue => cue.id === cueId ? { ...cue, label, values: values ?? cue.values } : cue) };
      exports.editForTest(local.id, {
        cueId, before: history.cueTextKey(previous, cueId), after: history.cueTextKey(local, cueId),
      }, previous);
    },
    retained: () => retained?.local ?? null,
  };
}

test('team flush includes an edit made while its browser-storage commit was pending', async () => {
  const h = harness();
  const saving = h.controller.flushTeamProduction('show');
  h.edit('Newest edit');
  h.disk.resolve(null);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].p_doc.name, 'Newest edit');
  h.request.resolve({ data: { saved: true, updated_at: 'confirmed', updated_by: 'owner' }, error: null });
  assert.equal(await saving, null);
  assert.equal(h.retained(), null);
  assert.equal(h.controller.getTeamState().saving.show, undefined);
});

test('two CAS refusals retire the observed prefix of a still-checked cue draft', async () => {
  const cue = { id: 'cue', sourceId: 'g', label: 'A', values: {} };
  const h = harness(false, [], undefined, undefined, undefined, [cue]);
  const base = h.local();
  h.typeCue(cue.id, 'B');
  h.disk.resolve(null);
  const pushed = h.controller.pushForTest(base.id);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.requests[0]?.p_doc.cues[0]?.label, 'B');
  h.typeCue(cue.id, 'C');
  const advanced = { ...base, cues: [{ ...cue, label: 'B', accentColor: '#9900CC' }] };
  const remote = { ...base, cues: [{ ...cue, accentColor: '#6600CC' }] };
  h.answers.push(
    { data: { saved: false, updated_at: 'second-head', doc: remote }, error: null },
    { data: { saved: true, updated_at: 'accepted' }, error: null },
  );
  h.request.resolve({ data: { saved: false, updated_at: 'first-head', doc: advanced }, error: null });
  await pushed;
  assert.deepEqual(h.requests.map(request => request.p_doc.cues[0]?.label), ['B', 'C', 'A']);
  assert.equal(h.requests[2].p_doc.cues[0].accentColor, '#6600CC');
});

for (const scenario of ['two refusals', 'typing during the first save', 'only the hidden word', 'competing text', 'connected after first merge']) {
  test('a team draft follows the stored words after hidden-word cleanup: ' + scenario, async () => {
    const words = f2 => ({ f0: 'YOUR WORDS', f1: 'One word?', f2 });
    const connected = scenario === 'connected after first merge';
    const recipe = { id: 'r-words', v: 1, fields: {} };
    const cue = {
      id: 'c-word', sourceId: 'g-cloud', label: 'Words: One word?', values: words('keep | 1'),
      ...(connected ? { selection: { v: 1, recipe: recipe.id, key: ['words'] } } : {}),
    };
    const fields = ['Label', 'Question', 'Words'].map((title, index) => ({ field: 'f' + index, title, ftype: 'textfield' }));
    const graphic = { id: 'g-cloud', name: 'House Word Cloud', type: 'x', savedAt: '', template: { name: 'House Word Cloud', fields } };
    const question = { id: 'q-word', type: 'word', text: 'One word?' };
    const h = harness(false, [graphic], undefined, undefined, undefined, [cue], {
      questions: [question], resultCues: { 'q-word': cue.id }, ...(connected ? { collections: [recipe] } : {}),
    });
    const base = h.local(), receipt = h.controller.beginTeamRundownEdit(base.id);
    const onlyHidden = scenario === 'only the hidden word';
    const initial = onlyHidden ? 'keep | 1\napple | 1' : 'keep | 1\napple | 1\nnew | 1';
    h.typeCue(cue.id, cue.label, words(initial));
    const submitted = history.cueTextKey(h.local(), cue.id);
    h.controller.bindTeamCueDraft(receipt, cue.id, submitted);
    h.disk.resolve(null);
    const pushed = h.controller.pushForTest(base.id);
    await new Promise(resolve => setImmediate(resolve));
    if (scenario === 'typing during the first save') h.typeCue(cue.id, cue.label, words(initial + '\nnewer | 1'));
    if (connected) h.connectWords({ ...recipe, fields: { f2: { from: 'words' } } });
    const first = {
      ...base,
      questions: [{ ...question, hidden: ['apple'] }],
      cues: scenario === 'competing text' ? [{ ...cue, values: words('changed elsewhere | 3') }] : [cue],
    };
    const second = { ...first, cues: [{ ...first.cues[0], accentColor: '#6600CC' }] };
    h.answers.push(
      { data: { saved: false, updated_at: '2026-11-15T12:02:00.000Z', doc: second }, error: null },
      { data: { saved: true, updated_at: '2026-11-15T12:03:00.000Z' }, error: null },
    );
    h.request.resolve({ data: { saved: false, updated_at: '2026-11-15T12:01:00.000Z', doc: first }, error: null });
    await pushed;
    let expected = 'keep | 1\nnew | 1';
    if (scenario === 'typing during the first save') expected += '\nnewer | 1';
    if (onlyHidden || connected) expected = 'keep | 1';
    if (scenario === 'competing text') expected = 'changed elsewhere | 3';
    assert.deepEqual(h.requests.map(request => request.p_doc.cues[0].values.f2), [initial, expected, expected]);
    assert.equal(h.requests.at(-1).p_doc.cues[0].accentColor, '#6600CC');
    const confirmed = h.controller.confirmedTeamCueText(receipt, cue.id, submitted);
    const accepted = history.cueTextKey(h.requests.at(-1).p_doc, cue.id);
    assert.equal(confirmed, scenario === 'two refusals' || onlyHidden ? accepted : null);
    assert.equal(h.controller.confirmedTeamCueText({ ...receipt, draftLineage: Symbol() }, cue.id, submitted), null);
  });
}

test('an unrelated follow-up acknowledgement preserves the exact normalized team receipt', async () => {
  const words = f2 => ({ f0: 'YOUR WORDS', f1: 'One word?', f2 });
  const cue = { id: 'c-word', sourceId: 'g-cloud', label: 'Words', values: words('keep | 1') };
  const other = { id: 'c-other', sourceId: 'g-cloud', label: 'Other', values: words('other | 1') };
  const fields = ['Label', 'Question', 'Words'].map((title, index) => ({ field: 'f' + index, title, ftype: 'textfield' }));
  const graphic = { id: 'g-cloud', name: 'House Word Cloud', type: 'x', savedAt: '', template: { name: 'House Word Cloud', fields } };
  const question = { id: 'q-word', type: 'word', text: 'One word?' };
  const h = harness(false, [graphic], undefined, undefined, undefined, [cue, other], {
    questions: [question], resultCues: { 'q-word': cue.id },
  });
  const base = h.local(), receipt = h.controller.beginTeamRundownEdit(base.id);
  h.typeCue(cue.id, cue.label, words('keep | 1\napple | 1\nnew | 1'));
  const submitted = history.cueTextKey(h.local(), cue.id);
  h.controller.bindTeamCueDraft(receipt, cue.id, submitted);
  const saved = h.controller.commitTeamRundownEdit(receipt, history.rundownSlice(h.local()));
  h.disk.resolve(null);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.requests.length, 1);
  const retryResponse = deferred();
  h.answers.push(retryResponse.promise);
  const them = { ...base, questions: [{ ...question, hidden: ['apple'] }] };
  h.request.resolve({ data: { saved: false, updated_at: '2026-11-15T12:01:00Z', doc: them }, error: null });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].p_doc.cues[0].values.f2, 'keep | 1\nnew | 1');
  const accepted = history.cueTextKey(h.requests[1].p_doc, cue.id);
  h.edit('Unrelated production edit');
  retryResponse.resolve({ data: { saved: true, updated_at: '2026-11-15T12:02:00Z' }, error: null });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.controller.confirmedTeamCueText(receipt, cue.id, submitted), accepted, 'owned retry initially acknowledged');
  h.answers.push({ data: { saved: true, updated_at: '2026-11-15T12:03:00Z' }, error: null });
  await h.controller.pushForTest(base.id);
  assert.equal(await saved, history.RUNDOWN_CHANGED);
  assert.equal(h.requests.length, 3);
  assert.equal(h.requests[2].p_doc.name, 'Unrelated production edit');
  assert.equal(history.cueTextKey(h.requests[2].p_doc, cue.id), accepted, 'follow-up kept normalized cue bytes');
  assert.equal(h.controller.confirmedTeamCueText(receipt, cue.id, submitted), accepted, 'original flush should still have its exact normalization receipt');
  assert.equal(h.controller.confirmedTeamCueText({ ...receipt, draftLineage: Symbol() }, cue.id, submitted), null);

  // An observed conflicting cue revokes the acknowledgement even if the next revision has
  // the exact old text again. This proof never gets into a write or authorizes a retry.
  const confirmed = h.requests[2].p_doc;
  const foreignCue = { ...confirmed.cues[0], label: 'Edited elsewhere' };
  h.edit('Second unrelated production edit');
  h.answers.push(
    { data: { saved: false, updated_at: '2026-11-15T12:04:00Z', doc: { ...confirmed, cues: [foreignCue, other] } }, error: null },
    { data: { saved: true, updated_at: '2026-11-15T12:05:00Z' }, error: null },
  );
  await h.controller.pushForTest(base.id);
  assert.equal(h.controller.confirmedTeamCueText(receipt, cue.id, submitted), null);
  h.edit('Third unrelated production edit');
  h.answers.push(
    { data: { saved: false, updated_at: '2026-11-15T12:06:00Z', doc: confirmed }, error: null },
    { data: { saved: true, updated_at: '2026-11-15T12:07:00Z' }, error: null },
  );
  await h.controller.pushForTest(base.id);
  assert.equal(history.cueTextKey(h.requests.at(-1).p_doc, cue.id), accepted);
  assert.equal(h.controller.confirmedTeamCueText(receipt, cue.id, submitted), null);
});

test('per-edit receipt requires an advanced revision and the exact intended rundown', async () => {
  const h = harness();
  const receipt = h.controller.beginTeamRundownEdit('show');
  const intended = history.rundownSlice(h.local());
  const saved = h.controller.commitTeamRundownEdit(receipt, intended);
  h.disk.resolve(null);
  await new Promise(resolve => setImmediate(resolve));
  h.request.resolve({ data: { saved: true, updated_at: 'confirmed' }, error: null });
  assert.equal(await saved, null);
  const wrong = { ...intended, graphics: [{ id: 'other' }] };
  assert.equal(await h.controller.commitTeamRundownEdit(receipt, wrong), history.RUNDOWN_CHANGED);
  assert.match(await h.controller.commitTeamRundownEdit(h.controller.beginTeamRundownEdit('show'), intended), /not been confirmed/);
});

test('strict inverse adopts a conflicting teammate rundown without merging or overwriting it', async () => {
  const h = harness(false), expected = history.rundownSlice(h.local());
  const theirs = { ...h.local(), graphics: [{ id: 'new', name: 'Teammate graphic' }] };
  h.answers.push({ data: { saved: false, updated_at: 'teammate', doc: theirs }, error: null });
  const result = await h.controller.restoreTeamRundown('show', expected, expected, () => true);
  assert.equal(result.status, 'refused'); assert.equal(result.error, history.RUNDOWN_CHANGED);
  assert.equal(h.requests.length, 1); assert.deepEqual(h.local().graphics, theirs.graphics);
});

test('strict inverse retries metadata-only conflict once and preserves newer metadata', async () => {
  const h = harness(false), expected = history.rundownSlice(h.local());
  h.answers.push(
    { data: { saved: false, updated_at: 'metadata', doc: { ...h.local(), name: 'Teammate renamed', data: { score: 9 } } }, error: null },
    { data: { saved: true, updated_at: 'inverse' }, error: null },
  );
  const result = await h.controller.restoreTeamRundown('show', expected, expected, () => true);
  assert.equal(result.status, 'saved'); assert.equal(h.requests.length, 2);
  assert.equal(h.requests[1].p_expected, 'metadata'); assert.equal(h.local().name, 'Teammate renamed'); assert.deepEqual(h.local().data, { score: 9 });
});

test('network/permission failure leaves the expected data and allows a checked retry', async () => {
  const h = harness(false), expected = history.rundownSlice(h.local());
  h.answers.push({ data: null, error: { message: 'permission denied' } });
  const result = await h.controller.restoreTeamRundown('show', expected, expected, () => true);
  assert.equal(result.status, 'failed'); assert.equal(result.error, 'permission denied');
  assert.equal(history.sameRundown(history.rundownSlice(h.local()), expected), true);
  h.answers.push({ data: { saved: true, updated_at: 'retry' }, error: null });
  assert.equal((await h.controller.restoreTeamRundown('show', expected, expected, () => true)).status, 'saved');
});

test('inverse refuses pending writes and never adopts over a newer local edit during RPC', async () => {
  const waiting = harness(), expected = history.rundownSlice(waiting.local());
  assert.equal((await waiting.controller.restoreTeamRundown('show', expected, expected, () => true)).status, 'refused');
  assert.equal(waiting.requests.length, 0);
  const h = harness(false), saving = h.controller.restoreTeamRundown('show', expected, expected, () => true);
  await new Promise(resolve => setImmediate(resolve)); h.edit('Newer local edit');
  h.request.resolve({ data: { saved: true, updated_at: 'inverse' }, error: null });
  assert.equal((await saving).status, 'refused'); assert.equal(h.local().name, 'Newer local edit'); assert.equal(h.retained().name, 'Newer local edit');
  assert.equal(h.controller.beginTeamRundownEdit('show').token, 'base', 'newer work must still conflict and merge against its original base');
});

test('a malformed or newer-format conflict cannot erase the current team document', async () => {
  for (const doc of [null, { version: 3, graphics: [] }]) {
    const h = harness(false), expected = history.rundownSlice(h.local());
    h.answers.push({ data: { saved: false, updated_at: 'unknown', doc }, error: null });
    assert.equal((await h.controller.restoreTeamRundown('show', expected, expected, () => true)).status, 'failed');
    assert.equal(h.local().name, 'First edit');
  }
});

test('team flush refuses cloud confirmation when the browser-storage commit fails', async () => {
  const h = harness();
  const saving = h.controller.flushTeamProduction('show');
  h.disk.resolve('Browser storage is full.');
  assert.equal(await saving, 'Browser storage is full.');
  assert.equal(h.requests.length, 0);
  assert.equal(h.retained().name, 'First edit');
  assert.equal(h.controller.getTeamState().saving.show, 'failed');
});

test('a reference outside this team\'s folder is never downloaded with the reader\'s rights', async () => {
  const private_ = `${assets.STORAGE_SENTINEL}reader-uid/abcd1234`;
  const graphic = data => [{ id: 'g', template: { assets: [{ path: 'a.png', data }] } }];
  const h = harness(false, [], {
    from: () => ({
      upload: async () => ({ error: null }),
      download: async () => { throw new Error('must not read outside the team folder'); },
    }),
  });
  h.answers.push(
    { data: { saved: false, updated_at: 'teammate', doc: { ...h.local(), graphics: graphic(private_) } }, error: null },
    { data: { saved: true, updated_at: 'inverse' }, error: null },
  );
  const expected = history.rundownSlice(h.local());
  await h.controller.restoreTeamRundown('show', expected, expected, () => true);
  assert.equal(h.local().graphics[0].template.assets[0].data, private_);
});

test('a failed save waits longer each time, and one success returns to the normal rate', async () => {
  const h = harness();
  h.answers.push({ data: null, error: { message: 'canceling statement due to statement timeout' } });
  const failing = h.controller.flushTeamProduction('show');
  h.disk.resolve(null);
  await failing;
  const first = h.controller.pacingForTest();
  assert.equal(first.saveFailures, 1);
  assert.ok(first.savesResumeAt > Date.now(), 'the next save must wait');
  assert.equal(h.controller.getTeamState().saving.show, 'failed');
  h.controller.noteSaveForTest(true);
  assert.equal(h.controller.pacingForTest().saveFailures, 2);
  h.controller.noteSaveForTest(false);
  assert.equal(h.controller.pacingForTest().saveFailures, 0);
  assert.equal(h.controller.pacingForTest().savesResumeAt, 0);
});

test('failed reads push the poll back, and one good read restores it', () => {
  const h = harness(false);
  h.controller.noteReadForTest(true);
  const once = h.controller.pacingForTest().readsResumeAt;
  h.controller.noteReadForTest(true);
  h.controller.noteReadForTest(true);
  assert.ok(h.controller.pacingForTest().readsResumeAt > once + 15_000, 'three failures wait longer than one');
  h.controller.noteReadForTest(false);
  assert.equal(h.controller.pacingForTest().readsResumeAt, 0);
  assert.equal(h.controller.pacingForTest().readFailures, 0);
});

test('a save sends references, and a teammate\'s refused document comes back with its files', async () => {
  const uploads = [];
  const png = 'data:image/png;base64,QUJD';
  const key = assets.sharedAssetKey('team/team', png);
  const reference = assets.STORAGE_SENTINEL + key;
  const graphic = data => [{ id: 'g', template: { assets: [{ path: 'a.png', data }] } }];
  const h = harness(false, graphic(png), {
    from: () => ({
      upload: async (uploaded) => { uploads.push(uploaded); return { error: null }; },
      download: async () => { throw new Error('this tab already holds the file'); },
    }),
  });
  h.answers.push(
    { data: { saved: false, updated_at: 'teammate', doc: { ...h.local(), name: 'Theirs', graphics: graphic(reference) } }, error: null },
    { data: { saved: true, updated_at: 'inverse' }, error: null },
  );
  const expected = history.rundownSlice(h.local());
  assert.equal((await h.controller.restoreTeamRundown('show', expected, expected, () => true)).status, 'saved');
  assert.deepEqual(uploads, [key], 'bytes go up once, whatever the number of saves');
  for (const sent of h.requests) assert.equal(sent.p_doc.graphics[0].template.assets[0].data, reference);
  assert.equal(h.local().graphics[0].template.assets[0].data, png, 'the tab keeps real bytes');
  assert.equal(h.local().name, 'Theirs');
});

// live-publishing W2 (designs/G1.md section 3, R4): the save settles the record against the server's
// copy it started from before it sends, and the tab and its retained edit hold what was sent.
test('a team save drops a design an older page pulled from the library, before the first attempt', async () => {
  const tpl = (html) => ({ name: 'Strap', html, css: '', js: '', assets: [], fields: [] });
  const base = { id: 'g1', name: 'Strap', type: 'lower-third', savedAt: '2026-11-01T00:00:00.000Z', designAt: '2026-11-01T00:00:00.000Z', template: tpl('<p>base</p>'), layer: 20 };
  const pulled = { ...base, template: tpl('<p>pulled</p>'), savedAt: '2026-11-02T00:00:00.000Z', designAt: '2026-11-01T00:00:00.000Z', layer: 31 };
  const h = harness(true, [pulled], undefined, copySettle);
  h.controller.seedBaseForTest({ id: 'show', teamId: 'team', version: 2, name: 'First edit', graphics: [base] });
  const saving = h.controller.flushTeamProduction('show');
  h.disk.resolve(null);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.requests.length, 1);
  const sent = h.requests[0].p_doc.graphics[0];
  assert.equal(sent.template.html, '<p>base</p>', 'the pulled design never goes up');
  assert.equal(sent.layer, 31, 'the placement edit beside it does');
  assert.equal(h.local().graphics[0].template.html, '<p>base</p>', 'the tab shows what was sent');
  assert.equal(h.retained().graphics[0].template.html, '<p>base</p>', 'the retained edit is the settled one');
  h.request.resolve({ data: { saved: true, updated_at: 'confirmed', updated_by: 'owner' }, error: null });
  assert.equal(await saving, null);
  assert.equal(h.retained(), null);
});

// A publish or export stops when its flush failed before settling (storage refused): the record still
// owes the settle, and teamSettleOwed says so. Once settled, or with nothing pulled, nothing is owed.
test('a flush that storage refused leaves the settle owed, so a team publish stops on it', async () => {
  const tpl = (html) => ({ name: 'Strap', html, css: '', js: '', assets: [], fields: [] });
  const base = { id: 'g1', name: 'Strap', type: 'lower-third', savedAt: '2026-11-01T00:00:00.000Z', designAt: '2026-11-01T00:00:00.000Z', template: tpl('<p>base</p>'), layer: 20 };
  const pulled = { ...base, template: tpl('<p>pulled</p>'), savedAt: '2026-11-02T00:00:00.000Z', designAt: '2026-11-01T00:00:00.000Z' };
  const h = harness(true, [pulled], undefined, copySettle);
  h.controller.seedBaseForTest({ id: 'show', teamId: 'team', version: 2, name: 'First edit', graphics: [base] });
  assert.equal(h.controller.teamSettleOwed('show'), true);
  const saving = h.controller.flushTeamProduction('show');
  h.disk.resolve('Browser storage is full.');
  assert.equal(await saving, 'Browser storage is full.');
  assert.equal(h.requests.length, 0);
  assert.equal(h.controller.teamSettleOwed('show'), true, 'the failed flush did not settle');

  const clean = harness(true, [base], undefined, copySettle);
  clean.controller.seedBaseForTest({ id: 'show', teamId: 'team', version: 2, name: 'First edit', graphics: [base] });
  assert.equal(clean.controller.teamSettleOwed('show'), false, 'nothing pulled, nothing owed');
});

// A settle whose retained-edit write throws (browser storage full) is a failed save like any other:
// the edit stays dirty, the save is no longer in flight, and the next flush goes up settled.
test('a settle whose outbox write throws fails the save and never leaves it in flight', async () => {
  const tpl = (html) => ({ name: 'Strap', html, css: '', js: '', assets: [], fields: [] });
  const base = { id: 'g1', name: 'Strap', type: 'lower-third', savedAt: '2026-11-01T00:00:00.000Z', designAt: '2026-11-01T00:00:00.000Z', template: tpl('<p>base</p>'), layer: 20 };
  const pulled = { ...base, template: tpl('<p>pulled</p>'), savedAt: '2026-11-02T00:00:00.000Z', designAt: '2026-11-01T00:00:00.000Z' };
  const fails = { left: 1 };
  const h = harness(true, [pulled], undefined, copySettle, fails);
  h.controller.seedBaseForTest({ id: 'show', teamId: 'team', version: 2, name: 'First edit', graphics: [base] });
  const first = h.controller.flushTeamProduction('show');
  h.disk.resolve(null);
  assert.match(await first, /Browser storage is full\./);
  assert.equal(h.requests.length, 0);
  assert.equal(h.controller.getTeamState().saving.show, 'failed');
  h.edit('Second edit');
  const second = h.controller.flushTeamProduction('show');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.requests.length, 1, 'the next save goes out: nothing is left in flight');
  assert.equal(h.requests[0].p_doc.graphics[0].template.html, '<p>base</p>');
  h.request.resolve({ data: { saved: true, updated_at: 'confirmed', updated_by: 'owner' }, error: null });
  assert.equal(await second, null);
});

// #2565: refreshOnce reads teammates' documents. An edit made while that read is out, on the
// production being read or any other, keeps its local record and its base; a skipped production is
// read again on a later pass.
function refreshHarness() {
  const docs = [];
  const fetched = [];
  const answers = [];
  const shows = new Map(['show', 'other'].map(id => [id, { id, teamId: 'team', version: 2, name: 'First', graphics: [] }]));
  const head = (id, token) => ({ id, team_id: 'team', updated_at: token, updated_by: 'mate' });
  let heads = [head('show', 'base'), head('other', 'base')];
  // Once the pass under test is reading, a pass started meanwhile (a move asks for one) waits.
  const reads = { held: false, headsHeld: false };
  const outbox = {};
  const headReads = [];
  const sb = {
    from: () => ({
      select: (cols) => cols.includes('doc')
        ? { in: (_col, ids) => { fetched.push(ids); const d = deferred(); docs.push(d); return d.promise; } }
        : { order: () => { if (!reads.headsHeld) return Promise.resolve({ data: heads, error: null }); const d = deferred(); headReads.push(d); return d.promise; } },
      insert: (row) => ({ select: () => ({ single: async () => ({ data: { id: row.id, team_id: row.team_id, updated_at: 'moved', updated_by: 'owner' }, error: null }) }) }),
      delete: () => ({ eq: (_col, id) => ({ select: async () => ({ data: [{ id }], error: null }) }) }),
    }),
    rpc: async () => answers.shift(),
  };
  const teams = () => reads.held ? new Promise(() => {}) : Promise.resolve({ teams: [], members: [], error: null });
  const stubs = {
    './supabase': { getSupabase: async () => sb },
    './teams': { listMyTeams: teams, listMyTeamMembers: teams },
    './assets': assets,
    './pacing': pacing,
    './partialWrites': { partialWritesOn: async () => false, unitPace: async () => {}, noteWritten: () => {} },
    './unitPatch': {},
    '../model/shows': { deleteShow: () => {} },
    '../model/teamShows': {
      loadTeamShows: () => [...shows.values()],
      applyServerTeamShow: doc => { shows.set(doc.id, doc); },
      // As model/teamShows.ts: the list replaces every record; a kept one stays as this tab has it.
      applyServerTeamShows: (list, keep) => {
        const next = new Map(list.map(s => [s.id, keep.has(s.id) && shows.has(s.id) ? shows.get(s.id) : s]));
        shows.clear();
        for (const [id, s] of next) shows.set(id, s);
      },
      removeTeamShow: id => { shows.delete(id); },
      setTeamShowsStatus: () => {},
    },
    '../model/rundownHistory': history,
    '../model/teamShowMerge': teamMerge,
    '../model/copySettle': { settleGraphics: (graphics) => ({ graphics, changed: false }) },
    '../model/durableStore': { canAuthorAccount: () => true, libraryInUse: () => 'owner', commitDurableWrites: async () => null },
    '../model/teamOutbox': { retainTeamEdit: () => {}, acknowledgeTeamEdit: () => {}, pendingTeamEdits: () => outbox },
  };
  const setup = `
    export function seedForTest(doc: Show) {
      running = { userId: 'owner', stop: () => {} };
      server.set(doc.id, { token: 'base', doc, teamId: 'team', updatedBy: 'owner' });
    }
    export function editForTest(id: string) { scheduleSave(id); }
    export function refreshForTest() { return refreshOnce(); }
    export function knownForTest(id: string) { return server.get(id); }
  `;
  const compiled = ts.transpileModule(source + setup, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: name => {
    assert.ok(name in stubs, `unexpected dependency: ${name}`);
    return stubs[name];
  }, setTimeout: () => 1, clearTimeout: () => {} });
  for (const show of shows.values()) exports.seedForTest(show);
  return {
    controller: exports, docs, fetched, answers, reads, headReads, outbox,
    heads: () => heads,
    settle: () => new Promise(resolve => setImmediate(resolve)),
    name: id => shows.get(id)?.name,
    edit(id, name) { shows.set(id, { ...shows.get(id), name }); exports.editForTest(id); },
    /** A teammate saved `show`: its head moves, and this is the row the read answers with. */
    teammateSaved(token, name) {
      heads = [head('show', token), heads[1]];
      return { ...head('show', token), doc: { id: 'show', version: 2, name, graphics: [] } };
    },
  };
}

test('an edit made while teammates\' documents are read keeps its text and base, and is read again later (#2565)', async () => {
  const h = refreshHarness();
  const row = h.teammateSaved('t2', 'Theirs');
  const pass = h.controller.refreshForTest();
  while (h.docs.length === 0) await h.settle();
  assert.deepEqual(h.fetched[0], ['show']);
  h.edit('show', 'Mine'); // typed while the read is out, on the production being read
  h.edit('other', 'Mine too'); // and on one that is not being read
  h.docs[0].resolve({ data: [row], error: null });
  await pass;
  assert.equal(h.name('show'), 'Mine', 'the typed text stays on the page');
  assert.equal(h.name('other'), 'Mine too', 'an edit to a production not being read stays too');
  assert.equal(h.controller.knownForTest('other').token, 'base');
  assert.equal(h.controller.knownForTest('show').token, 'base', 'the save still carries the token its edit started from');
  assert.equal(h.controller.knownForTest('show').doc.name, 'First');

  // The edit is confirmed (here over the teammate's save, as a merge would leave it), then a
  // teammate saves again: the next pass reads the production, so nothing is stuck.
  h.answers.push({ data: { saved: true, updated_at: 't3', updated_by: 'owner' }, error: null });
  assert.equal(await h.controller.flushTeamProduction('show'), null);
  const later = h.teammateSaved('t4', 'Theirs again');
  const next = h.controller.refreshForTest();
  while (h.docs.length === 1) await h.settle();
  assert.deepEqual(h.fetched[1], ['show']);
  h.docs[1].resolve({ data: [later], error: null });
  await next;
  assert.equal(h.name('show'), 'Theirs again');
  assert.equal(h.controller.knownForTest('show').token, 't4');
});

test('a save confirmed while teammates\' documents are read is not undone by the older read (#2565)', async () => {
  const h = refreshHarness();
  const row = h.teammateSaved('t2', 'Theirs');
  const pass = h.controller.refreshForTest();
  while (h.docs.length === 0) await h.settle();
  h.edit('show', 'Mine');
  h.answers.push({ data: { saved: true, updated_at: 't3', updated_by: 'owner' }, error: null });
  assert.equal(await h.controller.flushTeamProduction('show'), null);
  h.docs[0].resolve({ data: [row], error: null });
  await pass;
  assert.equal(h.name('show'), 'Mine');
  assert.equal(h.controller.knownForTest('show').token, 't3');
  assert.equal(h.controller.getTeamState().heads.show.updatedAt, 't3', 'the shown head is the confirmed one (#2566)');
});

test('a production moved in or deleted while teammates\' documents are read stays as this tab left it (#2566)', async () => {
  const h = refreshHarness();
  const row = h.teammateSaved('t2', 'Theirs');
  const pass = h.controller.refreshForTest();
  while (h.docs.length === 0) await h.settle();
  h.reads.held = true;
  const moved = await h.controller.moveProductionToTeam({ id: 'moved', version: 2, name: 'Moved', graphics: [] }, 'team');
  assert.equal(moved.error, null);
  assert.equal((await h.controller.deleteTeamProduction({ id: 'show' })).error, null);
  h.docs[0].resolve({ data: [row], error: null });
  await pass;
  assert.equal(h.name('moved'), 'Moved', 'the moved production stays on the page');
  assert.equal(h.controller.knownForTest('moved').token, 'moved', 'and keeps its revision, so its next edit can save');
  assert.equal(h.controller.getTeamState().heads.moved.updatedAt, 'moved');
  assert.equal(h.name('show'), undefined, 'the deleted production does not come back');
  assert.equal(h.controller.knownForTest('show'), undefined);
  assert.equal(h.controller.getTeamState().heads.show, undefined);
});

test('a rundown undo saved while teammates\' documents are read is not undone by the older read (#2565)', async () => {
  const h = refreshHarness();
  const row = h.teammateSaved('t2', 'Theirs');
  const pass = h.controller.refreshForTest();
  while (h.docs.length === 0) await h.settle();
  const expected = history.rundownSlice({ id: 'show', graphics: [] });
  h.answers.push({ data: { saved: true, updated_at: 't3', updated_by: 'owner' }, error: null });
  assert.equal((await h.controller.restoreTeamRundown('show', expected, expected, () => true)).status, 'saved');
  h.docs[0].resolve({ data: [row], error: null });
  await pass;
  assert.equal(h.name('show'), 'First');
  assert.equal(h.controller.knownForTest('show').token, 't3');
});

test('a move or a save made while the heads are read is not undone by that older list (#2565 /so)', async () => {
  const h = refreshHarness();
  h.reads.headsHeld = true;
  const pass = h.controller.refreshForTest();
  while (h.headReads.length === 0) await h.settle();
  const listed = h.heads(); // the list as the server answered before the move and the save
  h.reads.held = true;
  h.reads.headsHeld = false;
  assert.equal((await h.controller.moveProductionToTeam({ id: 'moved', version: 2, name: 'Moved', graphics: [] }, 'team')).error, null);
  h.edit('show', 'Mine');
  h.answers.push({ data: { saved: true, updated_at: 't3', updated_by: 'owner' }, error: null });
  assert.equal(await h.controller.flushTeamProduction('show'), null);
  h.headReads[0].resolve({ data: listed, error: null });
  // The old list makes `show` look stale; the read answers with the row as it was then.
  while (h.docs.length === 0) await h.settle();
  h.docs[0].resolve({ data: [{ ...listed[0], doc: { id: 'show', version: 2, name: 'First', graphics: [] } }], error: null });
  await pass;
  assert.equal(h.name('moved'), 'Moved', 'the moved production stays on the page');
  assert.equal(h.controller.knownForTest('moved').token, 'moved');
  assert.equal(h.name('show'), 'Mine');
  assert.equal(h.controller.getTeamState().heads.show.updatedAt, 't3', 'the shown head is the confirmed one');
});

test('an edit the pass restores from the outbox shows the head the server just listed (#2565 /so delta)', async () => {
  const h = refreshHarness();
  await h.controller.refreshForTest();
  assert.equal(h.controller.getTeamState().heads.show.updatedAt, 'base');
  h.teammateSaved('t2', 'Theirs');
  const first = { id: 'show', teamId: 'team', version: 2, name: 'First', graphics: [] };
  h.outbox.show = { token: 'base', base: first, local: { ...first, name: 'Mine' }, teamId: 'team', updatedBy: 'owner' };
  await h.controller.refreshForTest();
  assert.equal(h.name('show'), 'Mine');
  assert.equal(h.controller.knownForTest('show').token, 'base', 'the restored edit keeps its base, so its save merges');
  assert.equal(h.controller.getTeamState().heads.show.updatedAt, 't2');
});

// #2615 (evidence/fix-2615.md): a refusal from the v2 functions carries the token alone; the page
// reads what changed since the version it last read, applies it to the stored form it kept, merges
// as before and saves again.
const plain = (value) => JSON.parse(JSON.stringify(value));
/** The record as the server stores it: without the tab's `teamId`. */
const storedOf = (show) => { const copy = { ...show }; delete copy.teamId; return copy; };
const refusal = (at) => ({ data: { saved: false, updated_at: at, updated_by: 'mate', rev: 9 }, error: null });
const changes = (at, ops) => ({ data: { updated_at: at, updated_by: 'mate', rev: 9, ops }, error: null });
const everyMember = (doc) => Object.entries(doc).map(([m, v]) => ({ m, set: v, u: `h-${m}` }));

test('a refusal without the document reads what changed, merges and saves; the next read sends the kept map (#2615)', async () => {
  const cue = { id: 'cue', sourceId: 'g', label: 'A', values: {} };
  const h = harness(false, [], undefined, undefined, undefined, [cue]);
  const stored = storedOf(h.local());
  h.typeCue(cue.id, 'B');
  h.disk.resolve(null);
  const theirs = { ...stored, name: 'Theirs' };
  h.answers.push(refusal('t1'), changes('t1', everyMember(theirs)), { data: { saved: true, updated_at: 't2', updated_by: 'owner' }, error: null });
  await h.controller.pushForTest('show');
  assert.deepEqual(h.names, ['team_production_save_v2', 'team_production_changes', 'team_production_save_v2']);
  assert.deepEqual(plain(h.requests[1].p_map), { f: 's1', m: {} }, 'the first read of a session sends an empty map');
  assert.equal(h.requests[2].p_expected, 't1', 'the token read is the token saved against');
  assert.equal(h.requests[2].p_doc.name, 'Theirs', "the teammate's change is kept");
  assert.equal(h.requests[2].p_doc.cues[0].label, 'B', 'and this tab\'s edit is on it');

  // A second refusal: only the changed cue comes back, applied to the kept form.
  h.typeCue(cue.id, 'C');
  const changed = { ...cue, label: 'B', accentColor: '#123456' };
  h.answers.push(refusal('t3'), changes('t3', [{ m: 'cues', by: 'id', put: [{ v: changed, d: 'h-cue2' }], del: [], order: ['cue'], len: 1 }]),
    { data: { saved: true, updated_at: 't4', updated_by: 'owner' }, error: null });
  await h.controller.pushForTest('show');
  assert.deepEqual(h.names.slice(3), ['team_production_save_v2', 'team_production_changes', 'team_production_save_v2']);
  assert.deepEqual(Object.keys(h.requests[4].p_map.m).sort(), Object.keys(theirs).sort(), 'the read sends the map of the version it kept');
  assert.equal(h.requests[4].p_map.m.name, 'h-name');
  const sent = h.requests[5].p_doc;
  assert.equal(sent.cues[0].accentColor, '#123456', "the teammate's change to the cue arrives");
  assert.equal(sent.cues[0].label, 'C', "and this tab's newest text is on it");
  assert.equal(sent.name, 'Theirs', 'members the read left out come from the kept form');
  assert.equal(h.retained(), null);
});

test('a kept form that will not take the answer is read again whole (#2615)', async () => {
  const cue = { id: 'cue', sourceId: 'g', label: 'A', values: {} };
  const h = harness(false, [], undefined, undefined, undefined, [cue]);
  const stored = storedOf(h.local());
  h.typeCue(cue.id, 'B');
  h.disk.resolve(null);
  h.answers.push(refusal('t1'), changes('t1', everyMember(stored)), { data: { saved: true, updated_at: 't2' }, error: null });
  await h.controller.pushForTest('show');
  h.typeCue(cue.id, 'C');
  const theirs = { ...stored, name: 'Theirs', cues: [{ ...cue, label: 'B' }] };
  h.answers.push(refusal('t3'),
    // A keyed answer for a member the kept form holds as plain: applyPatch refuses it.
    changes('t3', [{ m: 'name', by: 'id', put: [], del: [], order: [], len: 0 }]),
    changes('t3', everyMember(theirs)),
    { data: { saved: true, updated_at: 't4' }, error: null });
  await h.controller.pushForTest('show');
  assert.deepEqual(h.names.slice(3), ['team_production_save_v2', 'team_production_changes', 'team_production_changes', 'team_production_save_v2']);
  assert.notDeepEqual(plain(h.requests[4].p_map.m), {});
  assert.deepEqual(plain(h.requests[5].p_map), { f: 's1', m: {} });
  assert.equal(h.requests[6].p_doc.name, 'Theirs');
  assert.equal(h.requests[6].p_doc.cues[0].label, 'C');
});

test('a read that fails fails the save attempt and keeps the edit on screen and owed (#2615)', async () => {
  const h = harness(false);
  h.edit('Mine');
  h.disk.resolve(null);
  h.answers.push(refusal('t1'), { data: null, error: { message: 'canceling statement due to statement timeout' } });
  await h.controller.pushForTest('show');
  assert.deepEqual(h.names, ['team_production_save_v2', 'team_production_changes']);
  assert.equal(h.local().name, 'Mine');
  assert.equal(h.retained().name, 'Mine', 'the edit stays in the outbox');
  assert.equal(h.controller.getTeamState().saving.show, 'failed');
  assert.match(h.controller.getTeamState().notes.show, /statement timeout/);
  assert.equal(h.controller.teamEditOwed('show'), true);
});

test('an older database: the old functions for the rest of the session, their refusal document used (#2615)', async () => {
  const h = harness(false);
  h.edit('Mine');
  h.disk.resolve(null);
  const stored = storedOf(h.local());
  h.answers.push({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } },
    { data: { saved: false, updated_at: 't1', updated_by: 'mate', doc: { ...stored, name: 'First edit', graphics: [], extra: 'theirs' } }, error: null },
    { data: { saved: true, updated_at: 't2' }, error: null });
  await h.controller.pushForTest('show');
  assert.deepEqual(h.names, ['team_production_save_v2', 'team_production_save', 'team_production_save']);
  assert.equal(h.requests[2].p_doc.extra, 'theirs');
  assert.equal(h.requests[2].p_doc.name, 'Mine');
  h.edit('Again');
  h.answers.push({ data: { saved: true, updated_at: 't3' }, error: null });
  await h.controller.pushForTest('show');
  assert.deepEqual(h.names.slice(3), ['team_production_save'], 'no second try of the v2 function');
});

test('undo reads a refusal the same way, and a failed read leaves the rundown as it was (#2615)', async () => {
  const h = harness(false), expected = history.rundownSlice(h.local());
  const stored = storedOf(h.local());
  h.answers.push(refusal('t1'), { data: null, error: { message: 'read failed' } });
  const result = await h.controller.restoreTeamRundown('show', expected, expected, () => true);
  assert.deepEqual(plain(result), { status: 'failed', error: 'read failed' });
  assert.equal(history.sameRundown(history.rundownSlice(h.local()), expected), true);
  h.answers.push(refusal('t1'), changes('t1', everyMember({ ...stored, name: 'Theirs' })), { data: { saved: true, updated_at: 't2' }, error: null });
  assert.equal((await h.controller.restoreTeamRundown('show', expected, expected, () => true)).status, 'saved');
  assert.equal(h.local().name, 'Theirs');
  assert.deepEqual(h.names.slice(2), ['team_production_save_v2', 'team_production_changes', 'team_production_save_v2']);
});

test('a database with the v2 saves but no read: the old saves for the rest of the session (#2615)', async () => {
  const h = harness(false);
  h.edit('Mine');
  h.disk.resolve(null);
  h.answers.push(refusal('t1'), { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } });
  await h.controller.pushForTest('show');
  assert.equal(h.controller.getTeamState().saving.show, 'failed');
  assert.equal(h.retained().name, 'Mine');
  h.answers.push({ data: { saved: true, updated_at: 't2' }, error: null });
  await h.controller.pushForTest('show');
  assert.deepEqual(h.names, ['team_production_save_v2', 'team_production_changes', 'team_production_save']);
});

test('a read answered after the session ended is dropped, and the next session reads whole (#2615)', async () => {
  const h = harness(false);
  h.edit('Mine');
  h.disk.resolve(null);
  const stored = storedOf(h.local());
  h.answers.push(refusal('t1'));
  const pushed = h.controller.pushForTest('show');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.names, ['team_production_save_v2', 'team_production_changes'], 'the read is out');
  h.controller.stopTeamSync();
  h.request.resolve(changes('t1', everyMember(stored)));
  await pushed;
  // A new session: its first read must not find a kept form the old session's answer left.
  h.controller.seedForTest(h.local(), true);
  h.answers.push(refusal('t2'), changes('t2', everyMember(stored)), { data: { saved: true, updated_at: 't3' }, error: null });
  await h.controller.pushForTest('show');
  assert.deepEqual(plain(h.requests[3].p_map), { f: 's1', m: {} });
});
