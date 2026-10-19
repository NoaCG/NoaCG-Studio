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
