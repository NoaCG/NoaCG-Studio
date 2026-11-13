// guards: src/components/editorFoundation/operations.ts, src/components/editorFoundation/session.ts, src/control/liveData.ts, docs/research/editor-r1-foundation/fixture-catalog.json
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';
async function load(input) {
  const bundle = await rolldown({ input, platform: 'neutral', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false }); await bundle.close();
  return import('data:text/javascript;base64,' + Buffer.from(output[0].code).toString('base64'));
}
const [{ applyOperations }, { EditorSession }, { parseAnimData, spliceAnimData }] = await Promise.all([
  load('src/components/editorFoundation/operations.ts'), load('src/components/editorFoundation/session.ts'), load('src/blocks/animData.ts'),
]);
const fixture = () => JSON.parse(readFileSync('docs/research/editor-r1-foundation/fixture-catalog.json', 'utf8'));
const add = { kind: 'liveData.set', csvUrl: 'https://example.com/sheet.csv', pollSeconds: 2 };

test('Sheet replacement has one block, keeps handwritten code and removes only its own block', () => {
  const original = fixture(); original.js += '\n// keep handwritten source\n';
  const installed = applyOperations(original, [add]);
  assert.deepEqual(installed.diff.map(change => change.file), ['js']);
  assert.equal(installed.template.html, original.html);
  assert.deepEqual(installed.template.fields, original.fields);
  const replaced = applyOperations(installed.template, [{ ...add, csvUrl: 'https://example.com/second.csv' }]).template;
  assert.equal(replaced.js.split('/* == LIVE DATA (').length - 1, 1);
  assert.ok(!replaced.js.includes(add.csvUrl));
  assert.ok(replaced.js.includes('https://example.com/second.csv'));
  const removed = applyOperations(replaced, [{ kind: 'liveData.remove' }]).template;
  assert.equal(removed.js, original.js);
  assert.deepEqual(removed, original);
});

test('invalid Sheet input refuses an entire batch without changing its input', () => {
  const original = fixture(), snapshot = structuredClone(original);
  for (const bad of [{ ...add, csvUrl: 'javascript:alert(1)' }, { ...add, csvUrl: 'not a URL' }, { ...add, pollSeconds: NaN }, { ...add, pollSeconds: 0 }]) {
    assert.throws(() => applyOperations(original, [add, bad]));
    assert.deepEqual(original, snapshot);
  }
});

test('an unknown animation extension refuses insertion before calling the donor builder', () => {
  const original = fixture();
  const changed = original.js.replace(/"version"\s*:\s*2/, '"version": 2, "futureData": true');
  assert.notEqual(changed, original.js);
  original.js = changed;
  const snapshot = structuredClone(original);
  assert.throws(() => applyOperations(original, [{ kind: 'graphic.insert', variant: { create() { assert.fail('Donor build must not run on unsupported host data'); } }, placement: 'start', steps: false }]), /preserved/);
  assert.deepEqual(original, snapshot);
});

test('Sheet edits use the session history and a stale request preserves the newer document', () => {
  let source = fixture(), view = { selectedParts: ['#f0'], time: 0 }, cursor = 0;
  const snapshots = [source];
  const port = { read: () => source, view: () => view, restore: next => { view = next; }, subscribe: () => () => {},
    apply: next => { snapshots.splice(++cursor); snapshots.push(next); source = next; },
    undo: () => { source = snapshots[--cursor]; }, redo: () => { source = snapshots[++cursor]; } };
  const session = new EditorSession('sheet-document', port), original = structuredClone(source), before = session.version();
  const request = operations => ({ documentId: session.documentId, expected: session.version(), transactionId: crypto.randomUUID(), operations });
  session.execute(request([add])); const installed = structuredClone(source);
  assert.throws(() => session.execute({ ...request([{ kind: 'liveData.remove' }]), expected: before }), /changed/);
  assert.deepEqual(source, installed);
  session.execute(request([{ kind: 'liveData.remove' }]));
  assert.deepEqual(source, original);
  session.undo(); assert.deepEqual(source, installed);
  session.undo(); assert.deepEqual(source, original);
  session.redo(); assert.deepEqual(source, installed);
  session.dispose();
});


test('insertion preserves an authored one-step machine rather than extending its graph implicitly', () => {
  const original = fixture(), data = parseAnimData(original.js);
  assert.ok(data);
  data.steps = data.steps.slice(0, 1);
  data.machine = { groups: [{ id: 'main', initial: 'off', defaultPath: ['in'],
    states: [{ id: 'off', name: 'Off' }, { id: 'in', name: 'In' }],
    transitions: [{ from: 'off', to: 'in', trigger: 'lifecycle', event: 'play' }] }] };
  original.js = spliceAnimData(original.js, data);
  assert.ok(parseAnimData(original.js));
  const snapshot = structuredClone(original);
  assert.throws(() => applyOperations(original, [{ kind: 'graphic.insert', variant: { create() { assert.fail('Donor build must not run on an unsupported graph'); } }, placement: 'start', steps: false }]), /separate Out step/);
  assert.deepEqual(original, snapshot);
});


function observedSession() {
  let source = fixture(), view = { selectedParts: ['#f0'], time: .75, cue: 0, sampleData: { first: 'A', second: 'B' } };
  let notify = () => {}, session, calls = [];
  const stack = [source]; let cursor = 0;
  const port = { read: () => source, view: () => view,
    subscribe: listener => { notify = listener; return () => { notify = () => {}; }; },
    restore: next => { view = structuredClone(next); notify(); },
    apply: next => { stack.splice(++cursor); stack.push(next); source = next; notify(); },
    undo: () => { source = stack[--cursor]; notify(); }, redo: () => { source = stack[++cursor]; notify(); } };
  session = new EditorSession('view-owner', port, undefined, () => {
    // Reentrant inspection must see a completed bundle, with its fingerprint already observed.
    calls.push({ state: session.commandState(), history: session.historyViews(), view: structuredClone(view) });
  });
  return { session, calls, port, change: next => { view = next; notify(); },
    replace: next => { source = next; notify(); } };
}

test('standalone view publication is synchronous, semantic and reentrant; selection order remains meaningful', () => {
  const h = observedSession(), initial = h.session.commandState();
  assert.equal(h.calls.length, 0); // Construction and inspection are observation, not user work.
  h.change({ selectedParts: ['#f0'], time: .75, cue: 0, sampleData: { second: 'B', first: 'A' } });
  h.session.observeView(); h.session.version();
  assert.equal(h.calls.length, 0); assert.equal(h.session.commandState().contextToken, initial.contextToken);
  h.change({ ...h.port.view(), selectedParts: ['#f0', '#f1'] });
  assert.equal(h.calls.length, 1);
  const selected = h.session.commandState();
  h.change({ ...h.port.view(), selectedParts: ['#f1', '#f0'] });
  assert.equal(h.calls.length, 2); assert.notEqual(h.session.commandState().contextToken, selected.contextToken);
  h.change({ ...h.port.view(), selectedParts: ['#f0'] });
  assert.equal(h.calls.length, 3); assert.notEqual(h.session.commandState().contextToken, initial.contextToken);
  assert.deepEqual(h.calls[2].history, { past: [], future: [] });
  assert.deepEqual(h.calls[2].view, { selectedParts: ['#f0'], time: .75, cue: 0, sampleData: { second: 'B', first: 'A' } });
  h.session.dispose(); assert.throws(() => h.session.observeView(), /closed/);
});

test('execute and travel publish only completed history while external view/source replacement clears old history first', () => {
  const h = observedSession();
  h.session.execute({ documentId: h.session.documentId, expected: h.session.version(), transactionId: crypto.randomUUID(), operations: [add] });
  assert.equal(h.calls.length, 1); assert.deepEqual(h.calls[0].state.history, { undo: 1, redo: 0 });
  assert.equal(h.calls[0].history.past.length, 1);
  h.session.undo(); assert.equal(h.calls.length, 2); assert.deepEqual(h.calls[1].state.history, { undo: 0, redo: 1 });
  h.session.redo(); assert.equal(h.calls.length, 3); assert.deepEqual(h.calls[2].state.history, { undo: 1, redo: 0 });
  // Change the view without notification, then the source in the same external store notification.
  const next = { ...h.port.view(), selectedParts: ['#f1'], time: .9 };
  h.port.view = () => next;
  h.replace({ ...h.session.port.read(), css: h.session.port.read().css + '\n/* External */' });
  assert.equal(h.calls.length, 4); assert.deepEqual(h.calls[3].state.history, { undo: 0, redo: 0 });
  assert.deepEqual(h.calls[3].history, { past: [], future: [] });
  h.session.dispose();
});

test('direct restore and gesture cancellation publish the accepted current view without source history work', () => {
  const h = observedSession();
  h.session.begin(); h.change({ ...h.port.view(), selectedParts: [], time: .9, cue: undefined });
  assert.equal(h.calls.length, 1);
  h.session.cancel(); assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].view.time, .75); assert.equal(h.calls[1].view.cue, 0); assert.deepEqual(h.calls[1].view.selectedParts, ['#f0']);
  assert.deepEqual(h.calls[1].state.history, { undo: 0, redo: 0 });
  h.port.restore(structuredClone(h.port.view())); assert.equal(h.calls.length, 2);
  h.session.dispose();
});
