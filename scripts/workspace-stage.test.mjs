// guards: src/model/project.ts, src/model/workspaceStage.ts
// Fixed source/state oracle: adopted units, local bundles and operation IDs must survive;
// incompatible ownership is refused, never resolved by an implementation-derived winner.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const clean = value => JSON.parse(JSON.stringify(value));
const same = (actual, expected) => assert.deepEqual(clean(actual), clean(expected));
const compile = file => ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const evaluate = (file, stubs = {}, globals = {}) => {
  const exports = {};
  vm.runInNewContext(compile(file), { exports, require: name => { assert.ok(name in stubs, name); return stubs[name]; }, Date, JSON, Error, structuredClone, ...globals });
  return exports;
};
const codec = evaluate('src/model/authoringDocument.ts');
const rules = evaluate('src/model/workspaceStage.ts', { './authoringDocument': codec });
const template = name => ({ name, html: `<p>${name}</p>`, css: ':root {}', js: '', assets: [], fields: [] });
const document = id => ({ id, template: template(id), baseline: template(id), history: [], future: [], saved: { graphicId: null, dirty: true }, sampleData: {} });
const original = () => ({ v: 1, projects: [{ id: 'p1', name: 'First', documents: ['d1', 'd2'] }], documents: [document('d1'), document('d2')], active: 'd1' });
const journal = id => ({ v: 1, id, target: 'show', before: { id: 'show' }, after: { id: 'show' }, sources: [], status: 'prepared' });
const localEdit = base => ({ ...base, documents: base.documents.map(d => d.id === 'd1' ? { ...d, template: template('Local draft'), baseline: template('Original baseline'), history: [template('Before edit')], future: [template('Redo')], saved: { graphicId: 'master', dirty: true }, reservedGraphicId: 'reserved-local', view: { time: .42, cue: 0, selectedParts: ['#f0'], sampleData: { f0: 'Rehearsal' } }, sampleData: { f0: 'Rehearsal' } } : d) });
const adoptedEdit = base => ({ ...base, projects: [...base.projects, { id: 'p2', name: 'Adopted', documents: ['d3'] }], documents: [...base.documents.map(d => d.id === 'd2' ? { ...d, template: template('Adopted second'), history: [template('Adopted previous')] } : d), document('d3')], installations: [journal('adopted-install')], active: 'd3' });
function harness(base = original()) {
  let owner = null, sequence = 0;
  const mirror = new Map(), disk = new Map(), latest = new Map(), last = new Map(), writes = [];
  const key = () => String(owner), record = workspace => ({ id: 'singleton', name: 'Working', template: template('Working'), baseline: template('Working'), updatedAt: '2026-11-12T15:00:00.000Z', workspace });
  const h = { held: false, writes, record, seed(workspace) { const raw = JSON.stringify(record(workspace)); mirror.set(key(), raw); disk.set(key(), raw); }, adopt(workspace) { h.seed(workspace); }, scope(value) { owner = value; }, raw: () => mirror.get(key()), stored: () => JSON.parse(disk.get(key())), settle: async () => { await Promise.all(writes.map(w => w.receipt.settled)); } };
  const durable = { getItem: () => mirror.get(key()) ?? null, removeItem: () => { mirror.delete(key()); disk.delete(key()); }, setItem(_name, raw) {
    const account = owner, target = key(), seq = ++sequence; mirror.set(target, raw); latest.set(target, seq);
    let finish; const settled = new Promise(resolve => { finish = resolve; });
    const receipt = { sequence: seq, key: 'spx-gfx-project', value: raw, account, settled };
    const write = { receipt, release(error = null) { if (!error) disk.set(target, raw); else if (latest.get(target) === seq) mirror.set(target, disk.get(target)); finish(error); } };
    last.set(target, receipt); writes.push(write); if (!h.held) write.release();
  } };
  const local = new Map();
  h.model = evaluate('src/model/project.ts', { './authoringDocument': codec, './workspaceStage': rules,
    './durableStore': { durable, lastDurableWrite: () => last.get(key()), libraryInUse: () => owner }, './id': { uuid: () => crypto.randomUUID() },
    './library': { graphicIdTaken: () => false }, './deviceIds': { readDeviceIds: () => ({ ids: [], writable: true }), writeDeviceIds: value => JSON.stringify(value) } },
  { localStorage: { getItem: name => local.get(name) ?? null, setItem: (name, value) => local.set(name, value) }, sessionStorage: { getItem: () => null, setItem: () => {} } });
  h.seed(base); return h;
}
test('clean cached adoption preserves new membership, complete documents and journal on a slot save', async () => {
  const h = harness(), p = h.model, base = original(), remote = adoptedEdit(base);
  same(p.authoringWorkspace(), base); h.adopt(remote); same(p.authoringWorkspace(), remote);
  p.saveProject(template('Local slot')); await h.settle(); same(h.stored().workspace, remote);
});
test('nonconflicting pending source/history/view/link bundle survives adopted units without splicing', async () => {
  const base = original(), local = localEdit(base), remote = adoptedEdit(base), h = harness(base), p = h.model;
  p.stageAuthoringWorkspace(local); h.adopt(remote); const result = p.authoringWorkspace();
  same(result.documents.find(d => d.id === 'd1'), local.documents[0]); same(result.documents.find(d => d.id === 'd2'), remote.documents[1]); same(result.documents.find(d => d.id === 'd3'), remote.documents[2]);
  same(result.projects, remote.projects); same(result.installations, remote.installations);
  p.saveProject(template('Local slot')); await h.settle(); same(h.stored().workspace, result);
});
test('incompatible same-document adoption refuses all destructive writers and retains the pending bundle', () => {
  const base = original(), local = localEdit(base), h = harness(base), p = h.model;
  p.stageAuthoringWorkspace(local); h.adopt({ ...base, documents: [document('Remote conflicting d1'), base.documents[1]].map((d, i) => i ? d : { ...d, id: 'd1' }) });
  const raw = h.raw(); assert.match(p.workspaceRefusal(), /changed in another tab/);
  same(p.authoringWorkspace().documents[0], local.documents[0]); p.saveProject(template('Refused slot')); assert.throws(() => p.writeAuthoringWorkspace(local)); p.clearProject();
  assert.equal(h.raw(), raw); assert.equal(p.graphicSuperseded('master'), false); assert.equal(h.raw(), raw);
});
for (const adopted of [{ v: 99, future: 'retain these exact bytes' }, { ...original(), documents: [null] }]) test(`adopted ${adopted.v === 99 ? 'unknown' : 'malformed'} envelope cannot be hidden by populated v1 staging`, () => {
  const h = harness(), p = h.model; p.stageAuthoringWorkspace(localEdit(original())); h.adopt(adopted); const raw = h.raw();
  assert.match(p.workspaceRefusal(), /newer or unreadable/); p.saveProject(template('Must refuse')); assert.throws(() => p.writeAuthoringWorkspace(original())); assert.doesNotThrow(() => p.upsertProject(h.record(original()))); p.clearProject();
  assert.equal(p.graphicSuperseded('master'), false); assert.equal(h.raw(), raw);
});
test('a clean loaded document cannot silently adopt authority for a different revision with the same UUID', () => {
  const h = harness(), p = h.model; p.authoringWorkspace(); const remote = localEdit(original()); h.adopt(remote); const raw = h.raw();
  assert.match(p.workspaceRefusal(), /changed in another tab/); p.saveProject(template('Old live source')); assert.equal(h.raw(), raw);
  const fresh = harness(remote); same(fresh.model.authoringWorkspace(), remote); assert.equal(fresh.model.workspaceRefusal(), null);
});
test('older completion acknowledges its baseline but never reinstalls over later staging', async () => {
  const h = harness(), p = h.model, base = original(), intent = { ...base, installations: [journal('stable-intent')] }; h.held = true;
  p.writeAuthoringWorkspace(intent); const first = h.writes[0];
  const newest = localEdit(p.authoringWorkspace()); p.stageAuthoringWorkspace(newest); const generation = p.workspaceGeneration();
  first.release(); await first.receipt.settled;
  assert.equal(p.workspaceGeneration(), generation); same(p.authoringWorkspace(), newest);
  p.saveProject(template('Newest source')); same(JSON.parse(h.writes[1].receipt.value).workspace, newest);
  h.writes[1].release(); await h.settle(); same(h.stored().workspace, newest); same(p.authoringWorkspace(), newest);
});
test('intent is visible to an overlapping ordinary slot writer before confirmation', async () => {
  const h = harness(), p = h.model, intent = { ...original(), installations: [journal('inverse-once')] }; h.held = true;
  p.writeAuthoringWorkspace(intent); p.saveProject(template('Overlapping autosave'));
  for (const w of h.writes) same(JSON.parse(w.receipt.value).workspace.installations, intent.installations);
  for (const w of h.writes) w.release(); await h.settle(); same(h.stored().workspace.installations, intent.installations);
});
test('refused write retains pending source and immutable intent for the next attempt', async () => {
  const h = harness(), p = h.model, local = { ...localEdit(original()), installations: [journal('keep-id')] }; h.held = true;
  p.writeAuthoringWorkspace(local); h.writes[0].release('storage refused'); await h.writes[0].receipt.settled;
  same(h.stored().workspace, original()); same(p.authoringWorkspace(), local);
  p.saveProject(template('Retry')); h.writes[1].release(); await h.settle(); same(h.stored().workspace, local);
});
test('sync adoption never clears pending work before either a refused or successful put', async () => {
  const base = original(), local = localEdit(base), remote = adoptedEdit(base), h = harness(), p = h.model;
  p.stageAuthoringWorkspace(local); h.held = true; p.upsertProject(h.record(remote));
  same(p.authoringWorkspace().documents[0], local.documents[0]); h.writes[0].release('pull refused'); await h.writes[0].receipt.settled; same(p.authoringWorkspace(), local);
  p.upsertProject(h.record(remote)); h.writes[1].release(); await h.writes[1].receipt.settled;
  same(p.authoringWorkspace().documents[0], local.documents[0]); same(p.authoringWorkspace().documents[2], remote.documents[2]);
  p.saveProject(template('After pull')); h.writes[2].release(); await h.settle(); same(h.stored().workspace.documents[0], local.documents[0]); same(h.stored().workspace.installations, remote.installations);
});
test('loaded-library ownership isolates staged work and old completions from another namespace', async () => {
  const h = harness(), p = h.model, local = localEdit(original()); h.held = true; p.writeAuthoringWorkspace(local);
  const first = h.writes[0]; h.scope('other-account'); const other = { ...original(), projects: [{ id: 'other-project', name: 'Other account', documents: ['d1', 'd2'] }] }; h.seed(other);
  same(p.authoringWorkspace(), other); const generation = p.workspaceGeneration(); first.release(); await first.receipt.settled;
  same(p.authoringWorkspace(), other); assert.equal(p.workspaceGeneration(), generation); same(h.stored().workspace, other);
  h.scope(null); same(p.authoringWorkspace(), local);
});
test('whole-unit deletions are preserved and overlapping membership edits refuse rather than union', () => {
  const base = original(), local = { ...base, projects: [] }, remote = adoptedEdit(base), result = rules.reconcileWorkspace(base, local, remote);
  same(result.projects, [remote.projects[1]]); same(result.documents, remote.documents);
  assert.throws(() => rules.reconcileWorkspace(base, { ...base, projects: [{ ...base.projects[0], name: 'Local rename' }] }, { ...base, projects: [{ ...base.projects[0], documents: ['d2'] }] }), /changed in another tab/);
});
test('only explicitly loading the exact adopted document bundle refreshes its same-UUID authority', async () => {
  const base = original(), h = harness(), p = h.model; p.authoringWorkspace();
  const adopted = localEdit(base); h.adopt(adopted);
  p.bindWorkspaceDocument('d1', base.documents[0]); assert.match(p.workspaceRefusal(), /changed in another tab/);
  p.bindWorkspaceDocument('d1', adopted.documents[0]); assert.equal(p.workspaceRefusal(), null);
  const edited = { ...adopted, documents: [{ ...adopted.documents[0], template: template('Edited after explicit reload') }, adopted.documents[1]] };
  p.stageAuthoringWorkspace(edited); p.saveProject(template('Loaded source')); await h.settle(); same(h.stored().workspace, edited);
});
test('an inverse receipt remains whole beside adopted receipts; incompatible receipt edits refuse', () => {
  const forward = journal('installation'), base = { ...original(), installations: [forward] };
  const inverse = { ...forward, rollback: { id: 'show', updatedAt: '2026-11-12T16:00:00.000Z', graphics: [] }, status: 'rolled-back' };
  const local = { ...base, installations: [inverse] }, remote = { ...base, installations: [forward, journal('other-installation')] };
  same(rules.reconcileWorkspace(base, local, remote).installations, [inverse, remote.installations[1]]);
  assert.throws(() => rules.reconcileWorkspace(base, local, { ...base, installations: [{ ...forward, status: 'conflict', error: 'Newer production edit' }] }), /changed in another tab/);
});
test('unconfirmed external retention never becomes retained ownership after its receipt is refused', async () => {
  const base = original(), h = harness(base), p = h.model, extra = document('unfiled'); h.held = true;
  p.writeAuthoringWorkspace({ ...base, documents: [...base.documents, extra], active: extra.id });
  assert.equal(p.workspaceDocumentRetained(extra.id), false);
  h.writes[0].release('storage refused'); await h.writes[0].receipt.settled;
  assert.equal(p.workspaceDocumentRetained(extra.id), false); same(p.authoringWorkspace().documents.find(d => d.id === extra.id), extra);
  p.writeAuthoringWorkspace(p.authoringWorkspace()); h.writes[1].release(); await h.settle();
  assert.equal(p.workspaceDocumentRetained(extra.id), true); same(h.stored().workspace.documents.find(d => d.id === extra.id), extra);
});
test('a formerly external private owner remains revision-bound after retention is confirmed', async () => {
  const h = harness(), p = h.model, extra = document('external-owner');
  p.bindWorkspaceDocument(extra.id);
  p.writeAuthoringWorkspace({ ...original(), documents: [...original().documents, extra], active: extra.id }); await h.settle();
  const adopted = { ...h.stored().workspace, documents: [...original().documents, { ...extra, template: template('Newer retained external owner') }] };
  h.adopt(adopted); const raw = h.raw(); assert.match(p.workspaceRefusal(), /changed in another tab/);
  p.saveProject(extra.template); assert.equal(h.raw(), raw);
  p.bindWorkspaceDocument(extra.id, extra); assert.match(p.workspaceRefusal(), /changed in another tab/);
  p.bindWorkspaceDocument(extra.id, adopted.documents[2]); assert.equal(p.workspaceRefusal(), null);
});
test('a submitted nonconflicting rebase is visible to the next slot writer before either acknowledgment', async () => {
  const h = harness(), p = h.model, base = original(), local = localEdit(base), adopted = adoptedEdit(base);
  p.stageAuthoringWorkspace(local); h.adopt(adopted); const expected = clean(p.authoringWorkspace()); h.held = true;
  p.saveProject(template('First rebased write')); same(p.authoringWorkspace(), expected);
  p.saveProject(template('Overlapping rebased write'));
  for (const write of h.writes) same(JSON.parse(write.receipt.value).workspace, expected);
  h.writes[0].release(); await h.writes[0].receipt.settled; same(p.authoringWorkspace(), expected);
  h.writes[1].release(); await h.settle(); same(h.stored().workspace, expected);
});

test('an explicit caller updates its complete bundle while a different active candidate owns the outer projection', async () => {
  const h = harness(), p = h.model, base = original(); h.held = true;
  p.writeAuthoringWorkspace({ ...base, active: 'd2' });
  const owner = { ...localEdit(base).documents[0], reservedGraphicId: 'minted-by-d1', mintingReserved: true };
  p.saveProject(owner.template, owner.baseline, owner.saved, owner.aiSpec, owner.aiThread, owner.legibility, owner);
  const written = JSON.parse(h.writes[1].receipt.value);
  same(written.workspace.documents[0], owner); same(written.workspace.documents[1], base.documents[1]);
  assert.equal(written.workspace.active, 'd2'); same(written.template, base.documents[1].template);
  assert.equal(written.graphicId, null); assert.equal(written.reservedGraphicId, undefined); assert.equal(written.mintingReserved, undefined);
  for (const w of h.writes) w.release(); await h.settle(); same(h.stored().workspace.documents[0], owner);
});
test('sync strips pulled nested mint authority before projection and projects an effective preserved local workspace', async () => {
  const h = harness(), p = h.model, base = original();
  const pulled = { ...base, active: 'd2', documents: [base.documents[0], { ...base.documents[1], reservedGraphicId: 'pulled-b', mintingReserved: true }] };
  p.upsertProject(h.record(pulled)); await h.settle();
  const raw = h.stored(); assert.equal(raw.mintingReserved, undefined); assert.equal(raw.workspace.documents[1].mintingReserved, undefined);
  assert.equal(raw.reservedGraphicId, 'pulled-b'); same(raw.template, base.documents[1].template);
  const preserved = harness({ ...base, documents: [{ ...base.documents[0], reservedGraphicId: 'own-a', mintingReserved: true }, base.documents[1]] });
  const legacy = preserved.record(undefined); delete legacy.workspace;
  preserved.model.upsertProject(legacy); await preserved.settle();
  assert.equal(preserved.stored().reservedGraphicId, 'own-a'); assert.equal(preserved.stored().mintingReserved, true);
  same(preserved.stored().template, base.documents[0].template);
});
test('a refused complete replacement restores only its unchanged owner and keeps later journals', async () => {
  const h = harness(), p = h.model, base = localEdit(original()), previous = base.documents[0]; h.seed(base);
  const replacement = { ...document('d1'), template: template('Saved master'), baseline: template('Saved baseline') };
  h.held = true;
  p.saveProject(replacement.template, replacement.baseline, replacement.saved, null, null, null, replacement, true);
  h.writes[0].release('discard refused'); await h.settle();
  const latest = { ...p.authoringWorkspace(), installations: [journal('newer-journal')] }; p.stageAuthoringWorkspace(latest);
  p.restoreRefusedDocument(replacement, previous, 'd1');
  same(p.authoringWorkspace().documents[0], previous); same(p.authoringWorkspace().installations, latest.installations);
  assert.equal(p.authoringWorkspace().active, 'd1');
  const newer = { ...previous, template: template('Later live edit') };
  p.stageAuthoringWorkspace({ ...p.authoringWorkspace(), documents: [newer, base.documents[1]] });
  p.restoreRefusedDocument(replacement, previous, 'd1'); same(p.authoringWorkspace().documents[0], newer);
  p.stageAuthoringWorkspace({ v: 1, projects: [{ id: 'p1', name: 'First', documents: ['d1'] }], documents: [replacement], active: null, installations: latest.installations });
  p.restoreRefusedDocument(replacement, previous, 'd2');
  assert.equal(p.authoringWorkspace().active, null, 'a removed former selection must stay removed');
  assert.equal(codec.readableWorkspace(p.authoringWorkspace()), true);
});
