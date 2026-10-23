// guards: src/control/verbDispatch.ts, src/control/verbView.ts, src/control/serverState.ts
//
// ONE DISPATCHER FOR THE VERBS, in Node (production-page refactor spec §4.2's "Panel and keyboard"
// row, phase 12): what each verb does from a key, the button that wears it or a hardware panel's key,
// decided from the verb bar's view. `u` (update) and `n` (next) are pinned here as well as offline in
// e2e/playout-drills.spec.ts. The keyboard's key-to-verb map is components/playoutKeys.ts.

import test from 'node:test';
import assert from 'node:assert/strict';

const { decideVerb } = await import('../src/control/verbDispatch.ts');
const { verbView } = await import('../src/control/verbView.ts');
const { NO_OWNERSHIP } = await import('../src/control/serverState.ts');

const cue = (id, extra = {}) => ({ id, sourceId: `g-${id}`, label: id.toUpperCase(), values: {}, ...extra });
const c1 = cue('c1');
const c2 = cue('c2', { folderId: 'F' });
const v1 = cue('v1', { source: 'playout', sourceId: 'clip' });
const cues = [c1, c2, v1];
const folderF = { id: 'F', name: 'Opening', collapsed: true };
const rows = [
  { kind: 'cue', id: 'c1', cue: c1, folderId: null },
  { kind: 'folder', id: 'folder-row-F', folder: folderF, runCues: [c2] },
  { kind: 'cue', id: 'v1', cue: v1, folderId: null },
];
const rowOf = new Map([['c1', 'c1'], ['c2', 'folder-row-F'], ['v1', 'v1']]);

/** The dispatcher's view of a render: c1 selected on Strap, nothing up, unless told otherwise. */
function view(extra = {}, more = {}) {
  const v = verbView({
    spaceMode: 'take',
    published: false,
    cues,
    selectedCue: c1,
    selectedGraphic: 'Strap',
    liveCue: {},
    selectedPlayoutLive: false,
    selectedItemKind: null,
    editTarget: 'preview',
    previewCueId: 'c1',
    casparOn: true,
    bridgeDown: false,
    takeBlocked: null,
    advances: true,
    folder: null,
    clearing: false,
    anyUp: false,
    unnamedUp: () => false,
    ...extra,
  });
  return {
    ...v,
    cues,
    items: [{ id: 'clip', kind: 'media' }],
    rows,
    rowOf,
    folderId: extra.folder ? 'F' : null,
    step: extra.folder?.step ?? null,
    onAirNow: () => false,
    stepBlocked: () => null,
    directBlocked: () => null,
    ownership: () => NO_OWNERSHIP,
    timing: () => ({}),
    ...more,
  };
}
const press = (extra = {}) => ({ repeat: false, ...extra });
const live = { liveCue: { Strap: 'c1' } };

test('SPACE takes the selected cue, takes it off when it is the one on air and stages it, or previews it first', () => {
  assert.deepEqual(decideVerb('take', press(), view()), { do: 'take', cue: c1 });
  assert.deepEqual(decideVerb('take', press(), view(live)), { do: 'out-and-stage', cueId: 'c1' });
  assert.deepEqual(decideVerb('take', press(), view({ spaceMode: 'preview-then-take', previewCueId: null })), { do: 'stage', cueId: 'c1' });
  assert.deepEqual(decideVerb('take', press(), view({ spaceMode: 'preview-then-take' })), { do: 'take', cue: c1 });
  // The button IS the key: it presses the same verb with no press at all.
  assert.deepEqual(decideVerb('take', undefined, view()), { do: 'take', cue: c1 });
});

test('SPACE on a server cue waits while the Bridge is down or the server is off; nothing selected does nothing', () => {
  assert.deepEqual(decideVerb('take', press(), view({ selectedCue: v1, selectedGraphic: null, bridgeDown: true })), { do: 'none' });
  assert.deepEqual(decideVerb('take', press(), view({ selectedCue: v1, selectedGraphic: null, casparOn: false })), { do: 'none' });
  assert.deepEqual(decideVerb('take', press(), view({ selectedCue: null, selectedGraphic: null })), { do: 'none' });
  // A refused Take still goes to the verb, which says why (control/serverVerbs.ts).
  assert.deepEqual(decideVerb('take', press(), view({ takeBlocked: 'No room' })), { do: 'take', cue: c1 });
});

test('R re-takes only the cue that is on air', () => {
  assert.deepEqual(decideVerb('retake', press(), view(live)), { do: 'take', cue: c1 });
  assert.deepEqual(decideVerb('retake', press(), view({ liveCue: { Strap: 'c2' } })), { do: 'none' });
  assert.deepEqual(decideVerb('retake', press(), view()), { do: 'none' });
});

test('U updates only while the edited cue is on air', () => {
  assert.deepEqual(decideVerb('update', press(), view(live)), { do: 'update' });
  assert.deepEqual(decideVerb('update', press(), view()), { do: 'none' });
  assert.deepEqual(decideVerb('update', press(), view({ liveCue: { Strap: 'c2' } })), { do: 'none' });
  assert.deepEqual(decideVerb('update', press(), view({ liveCue: { Strap: 'c2' }, editTarget: 'air' })), { do: 'update' });
});

test('N moves the live layer on only while it can advance; 0 takes the layer off while it is up', () => {
  assert.deepEqual(decideVerb('next', press(), view(live)), { do: 'next' });
  assert.deepEqual(decideVerb('next', press(), view({ ...live, advances: false })), { do: 'none' });
  assert.deepEqual(decideVerb('next', press(), view()), { do: 'none' });
  assert.deepEqual(decideVerb('out', press(), view({ liveCue: { Strap: 'c2' } })), { do: 'out' });
  assert.deepEqual(decideVerb('out', press(), view()), { do: 'none' });
});

test("the cue verbs answer the dispatcher's view, never a second rule: each is on exactly when its button is", () => {
  for (const extra of [{}, live, { liveCue: { Strap: 'c2' } }, { ...live, advances: false }, { liveCue: { Strap: 'c2' }, editTarget: 'air' }]) {
    const v = view(extra);
    assert.equal(decideVerb('retake', press(), v).do !== 'none', !v.disabled.retake);
    assert.equal(decideVerb('update', press(), v).do !== 'none', !v.disabled.update);
    assert.equal(decideVerb('next', press(), v).do !== 'none', !v.disabled.next);
    assert.equal(decideVerb('out', press(), v).do !== 'none', !v.disabled.out);
  }
});

const folder = (extra = {}) => ({ name: 'Opening', up: false, stepped: false, step: null, stepBlocked: null, takeBlocked: null, serverMembers: false, labelOf: (id) => id, ...extra });
const heldView = (f, extra = {}, more = {}) => view({ selectedCue: null, selectedGraphic: null, folder: f, ...extra }, more);

test('a held folder row: SPACE steps, takes, takes off or says why; 0 takes it off once up or started; the cue verbs act on nothing', () => {
  assert.deepEqual(decideVerb('take', press(), heldView(folder())), { do: 'folder-take', folderId: 'F' });
  assert.deepEqual(decideVerb('take', press(), heldView(folder({ up: true }))), { do: 'folder-out', folderId: 'F' });
  assert.deepEqual(decideVerb('take', press(), heldView(folder({ step: { kind: 'take', cueId: 'c2', off: [] } }))), { do: 'folder-step', folderId: 'F' });
  // A step goes even when its next cue is refused: the step itself says why (control/folderPlayout.ts).
  assert.deepEqual(decideVerb('take', press(), heldView(folder({ step: { kind: 'none' } }))), { do: 'folder-step', folderId: 'F' });
  assert.deepEqual(decideVerb('take', press(), heldView(folder({ takeBlocked: 'No slot' }))), { do: 'note', text: 'Take was not sent: No slot' });
  // Waiting on the Bridge is silent.
  assert.deepEqual(decideVerb('take', press(), heldView(folder({ serverMembers: true, takeBlocked: 'x' }), { bridgeDown: true })), { do: 'none' });
  assert.deepEqual(decideVerb('out', press(), heldView(folder())), { do: 'none' });
  assert.deepEqual(decideVerb('out', press(), heldView(folder({ up: true }))), { do: 'folder-out', folderId: 'F' });
  assert.deepEqual(decideVerb('out', press(), heldView(folder({ stepped: true }))), { do: 'folder-out', folderId: 'F' });
  for (const key of ['retake', 'update', 'next', 'pause', 'resume']) assert.deepEqual(decideVerb(key, press(), heldView(folder({ up: true }))), { do: 'none' }, key);
  // A held key fires once.
  assert.deepEqual(decideVerb('take', press({ repeat: true }), heldView(folder())), { do: 'none' });
});

test('H, All out and a trigger fire once per press, never on a held key', () => {
  assert.deepEqual(decideVerb('hold', press(), view()), { do: 'hold' });
  assert.deepEqual(decideVerb('hold', press({ repeat: true }), view()), { do: 'none' });
  assert.deepEqual(decideVerb('all-out', press(), view()), { do: 'all-out' });
  assert.deepEqual(decideVerb('all-out', press({ repeat: true }), view()), { do: 'none' });
  assert.deepEqual(decideVerb('trigger-cue', press({ repeat: true, cue: 'c1' }), view()), { do: 'none' });
});

test('a trigger takes its cue direct, out of its folder; a refusal or a down Bridge is said, never sent', () => {
  const d = decideVerb('trigger-cue', press({ cue: 'c2' }), view());
  assert.equal(d.do, 'trigger');
  assert.equal(d.label, 'Trigger C2');
  assert.equal(d.refused, null);
  assert.equal(d.cue.folderId, undefined);
  assert.equal(decideVerb('trigger-cue', press({ cue: 'c1' }), view({}, { directBlocked: () => 'Not on this server' })).refused, 'Trigger C1 was not sent: Not on this server');
  assert.equal(decideVerb('trigger-cue', press({ cue: 'v1' }), view({ bridgeDown: true })).refused, 'Trigger V1 was not sent: NoaCG Bridge is not connected.');
  assert.equal(decideVerb('trigger-cue', press({ cue: 'c1' }), view({ bridgeDown: true })).refused, null);
  assert.deepEqual(decideVerb('trigger-cue', press({ cue: 'gone' }), view()), { do: 'none' });
});

test("a panel's select key moves the cursor to the drawn row: a folder header holds the folder, a hidden cue is still the cue", () => {
  assert.deepEqual(decideVerb('select-cue', press({ cue: 'c1' }), view()), { do: 'select-cue', cueId: 'c1', reveal: 'cue-c1' });
  assert.deepEqual(decideVerb('select-cue', press({ cue: 'folder-row-F' }), view()), { do: 'select-folder', folderId: 'F', rowId: 'folder-row-F', reveal: 'folder-row-F' });
  assert.deepEqual(decideVerb('select-cue', press({ cue: 'c2' }), view()), { do: 'select-cue', cueId: 'c2', reveal: 'folder-row-F' });
  assert.deepEqual(decideVerb('select-cue', press({ cue: 'gone' }), view()), { do: 'none' });
  assert.deepEqual(decideVerb('select-cue', press(), view()), { do: 'none' });
});

test("a panel's Take key airs its cue whatever the mode, takes it off when it is on air now, and stays quiet when refused", () => {
  assert.deepEqual(decideVerb('take-cue', press({ cue: 'c2' }), view({ spaceMode: 'preview-then-take' })), { do: 'take', cue: c2 });
  let asked = 0;
  const onAir = view({}, { onAirNow: (c) => (asked += 1) > 0 && c.id === 'c2' });
  assert.deepEqual(decideVerb('take-cue', press({ cue: 'c2' }), onAir), { do: 'take-off', cue: c2 });
  // Asked at the press, from the store as it stands.
  assert.equal(asked, 1);
  assert.deepEqual(decideVerb('take-cue', press({ cue: 'c1' }), view({}, { stepBlocked: () => 'No' })), { do: 'none' });
  // On air and refused: taking it off is never refused.
  assert.deepEqual(decideVerb('take-cue', press({ cue: 'c1' }), view({}, { onAirNow: () => true, stepBlocked: () => 'No' })), { do: 'take-off', cue: c1 });
  assert.deepEqual(decideVerb('take-cue', press({ cue: 'c1', repeat: true }), view()), { do: 'none' });
});

test("the rundown's editing keys go to the editor and air nothing", () => {
  for (const key of ['copy', 'cut', 'paste', 'select-clear', 'extend-prev', 'extend-next', 'folder-new', 'folder-toggle']) {
    assert.deepEqual(decideVerb(key, press(), view(live)), { do: 'edit' }, key);
    assert.deepEqual(decideVerb(key, press(), heldView(folder({ up: true }))), { do: 'edit' }, key);
  }
});

test('the arrows walk the rundown one row; an unknown verb does nothing', () => {
  assert.deepEqual(decideVerb('select-next', press(), view()), { do: 'walk', step: 1 });
  assert.deepEqual(decideVerb('select-prev', press(), view()), { do: 'walk', step: -1 });
  assert.deepEqual(decideVerb('nothing-of-the-kind', press(), view()), { do: 'none' });
});

test("Pause and Resume reach only the clip this page has up; P pauses or resumes the clip the store says, at the press", () => {
  const clipUp = view({ selectedCue: v1, selectedGraphic: null, selectedPlayoutLive: true, selectedItemKind: 'media' });
  assert.deepEqual(decideVerb('pause', press(), clipUp), { do: 'server', cue: v1, verb: 'pause', label: 'Pause' });
  assert.deepEqual(decideVerb('resume', press(), clipUp), { do: 'server', cue: v1, verb: 'resume', label: 'Resume' });
  assert.deepEqual(decideVerb('pause', press(), view(live)), { do: 'none' });
  const slot = { adapter: 'casparcg', channel: 2, layer: 10 };
  const ownership = { ...NO_OWNERSHIP, onAir: { clip: { cueId: 'v1', slot } } };
  let reads = 0;
  const reading = (paused) => view({ selectedCue: v1, selectedGraphic: null }, { ownership: () => (reads += 1, ownership), timing: () => ({ '2-10': { paused } }) });
  // P names no clip and goes by the selection; a panel's key names the clip its clock follows.
  assert.deepEqual(decideVerb('pause-toggle', press(), reading(false)), { do: 'server', cue: v1, verb: 'pause', label: 'Pause' });
  assert.deepEqual(decideVerb('pause-toggle', press({ cue: 'v1' }), { ...reading(true), selectedCue: c1 }), { do: 'server', cue: v1, verb: 'resume', label: 'Resume' });
  assert.equal(reads, 2);
  assert.deepEqual(decideVerb('pause-toggle', press(), view()), { do: 'none' });
});
