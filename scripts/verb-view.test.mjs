// guards: src/control/verbView.ts, src/control/spaceMode.ts, src/control/folderStep.ts
//
// THE VERB BAR'S AND THE PANEL'S FACTS, in Node (production-page refactor spec §2 and §4.2, phase
// 12): which verbs are grey, what the TAKE button says and does, when All out may go, and that a
// hardware panel's `allowed` map is the verb bar's disabled states read backwards, for every state
// the bar can be in. The browser half (that the page draws them) is e2e/productions.spec.ts,
// e2e/playout-drills.spec.ts, e2e/playout-folders.spec.ts and e2e/configured/panel-production-page.spec.ts.

import test from 'node:test';
import assert from 'node:assert/strict';

const { verbView, panelSnapshot } = await import('../src/control/verbView.ts');

const cue = (id, extra = {}) => ({ id, sourceId: `g-${id}`, label: id.toUpperCase(), values: {}, ...extra });
const server = (id) => cue(id, { source: 'playout' });
const c1 = cue('c1');
const c2 = cue('c2');
const v1 = server('v1');

/** A render with cue c1 selected on graphic Strap, nothing on air, 'take' mode. */
const inputs = (extra = {}) => ({
  spaceMode: 'take',
  published: false,
  cues: [c1, c2, v1],
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

test('nothing on air: TAKE takes, and Re-take, Update, Next and Out are grey', () => {
  const v = verbView(inputs());
  assert.deepEqual(v.take, { space: 'take', disabled: false, title: 'Take the previewed cue' });
  assert.deepEqual(v.disabled, { retake: true, update: true, next: true, out: true });
  assert.equal(v.selectedLayerLive, false);
  assert.equal(v.editingIsLive, false);
});

test('the selected cue on air: TAKE takes it off, and every verb on it is live', () => {
  const v = verbView(inputs({ liveCue: { Strap: 'c1' } }));
  assert.deepEqual(v.take, { space: 'take-off', disabled: false, title: 'Take this cue off' });
  assert.deepEqual(v.disabled, { retake: false, update: false, next: false, out: false });
  assert.equal(v.selectedCueIsLive, true);
  assert.equal(v.airCue, c1);
});

test('another cue of the same graphic on air: Out and Next act on the layer, Re-take and Update do not', () => {
  const v = verbView(inputs({ liveCue: { Strap: 'c2' } }));
  assert.equal(v.selectedLayerCueId, 'c2');
  assert.deepEqual(v.disabled, { retake: true, update: true, next: false, out: false });
  // TAKE airs the selected cue over it.
  assert.equal(v.take.space, 'take');
  // The editor can be pointed at what is on air instead: Update then sends that one.
  const air = verbView(inputs({ liveCue: { Strap: 'c2' }, editTarget: 'air' }));
  assert.equal(air.editingCue, c2);
  assert.equal(air.disabled.update, false);
});

test('Next is grey on a graphic that cannot advance, unless a server template is up', () => {
  assert.equal(verbView(inputs({ liveCue: { Strap: 'c1' }, advances: false })).disabled.next, true);
  const template = verbView(inputs({ selectedCue: v1, selectedGraphic: null, selectedPlayoutLive: true, selectedItemKind: 'template', advances: false }));
  assert.equal(template.nextMoves, true);
  assert.equal(template.disabled.next, false);
  const clip = verbView(inputs({ selectedCue: v1, selectedGraphic: null, selectedPlayoutLive: true, selectedItemKind: 'media', advances: false }));
  assert.equal(clip.disabled.next, true);
  assert.equal(clip.selectedClipUp, true);
});

test("'preview-then-take': a cue not on PREVIEW previews first, then takes, and a refusal only holds up the take", () => {
  const fresh = verbView(inputs({ spaceMode: 'preview-then-take', previewCueId: 'c2', takeBlocked: 'No room' }));
  assert.deepEqual(fresh.take, { space: 'preview', disabled: false, title: 'Show the selected cue on PREVIEW. SPACE again takes it' });
  const staged = verbView(inputs({ spaceMode: 'preview-then-take', previewCueId: 'c1', takeBlocked: 'No room' }));
  assert.deepEqual(staged.take, { space: 'take', disabled: true, title: 'No room' });
  // In 'take' mode the selection is always the preview.
  assert.equal(verbView(inputs({ previewCueId: 'c1' })).selectedCueStaged, true);
});

test('a server cue: TAKE waits while the server is off or the Bridge is down; taking it off never does', () => {
  assert.equal(verbView(inputs({ selectedCue: v1, selectedGraphic: null, casparOn: false })).take.disabled, true);
  assert.equal(verbView(inputs({ selectedCue: v1, selectedGraphic: null, bridgeDown: true })).take.disabled, true);
  assert.equal(verbView(inputs({ selectedCue: v1, selectedGraphic: null })).take.disabled, false);
  const up = verbView(inputs({ selectedCue: v1, selectedGraphic: null, selectedPlayoutLive: true, bridgeDown: true }));
  assert.deepEqual([up.take.space, up.take.disabled], ['take-off', false]);
  // A graphic cue never waits on the Bridge.
  assert.equal(verbView(inputs({ bridgeDown: true, casparOn: false })).take.disabled, false);
});

test('nothing selected: TAKE is grey', () => {
  const v = verbView(inputs({ selectedCue: null, selectedGraphic: null }));
  assert.equal(v.take.disabled, true);
  assert.equal(v.canTake, false);
});

const folder = (extra = {}) => ({
  name: 'Opening',
  up: false,
  stepped: false,
  step: null,
  stepBlocked: null,
  takeBlocked: null,
  serverMembers: false,
  labelOf: (id) => id.toUpperCase(),
  ...extra,
});
const held = (f, extra = {}) => inputs({ selectedCue: null, selectedGraphic: null, folder: f, ...extra });

test('a held folder: TAKE takes it, or takes all of it off, whatever the SPACE mode; Out only while it is up', () => {
  assert.deepEqual(verbView(held(folder())).take, { space: 'take', disabled: false, title: 'Take Opening' });
  assert.deepEqual(verbView(held(folder(), { spaceMode: 'preview-then-take' })).take.space, 'take');
  assert.equal(verbView(held(folder())).disabled.out, true);
  const up = verbView(held(folder({ up: true })));
  assert.deepEqual(up.take, { space: 'take-off', disabled: false, title: 'Take all of Opening off' });
  assert.equal(up.disabled.out, false);
  assert.deepEqual(verbView(held(folder({ takeBlocked: 'No slot' }))).take, { space: 'take', disabled: true, title: 'No slot' });
  // A server cue in it waits on the Bridge; taking it off does not.
  assert.equal(verbView(held(folder({ serverMembers: true }), { bridgeDown: true })).take.disabled, true);
  assert.equal(verbView(held(folder({ serverMembers: true, up: true }), { bridgeDown: true })).take.disabled, false);
});

test("a One-by-one folder's TAKE names its step, and Out goes once it was started even with nothing up", () => {
  const first = verbView(held(folder({ step: { kind: 'take', cueId: 'c1', off: [] } })));
  assert.deepEqual(first.take, { space: 'take', disabled: false, title: 'Take C1', step: { text: '⟳ TAKE', title: 'Take C1', tone: 'take' } });
  const next = verbView(held(folder({ stepped: true, step: { kind: 'take', cueId: 'c2', off: ['c1'] } })));
  assert.equal(next.take.step.text, '⟳ NEXT');
  assert.equal(next.take.title, 'Take C2, and C1 off');
  assert.equal(next.disabled.out, false);
  assert.equal(next.heldStarted, true);
  // A step asks the Bridge of the cue it takes (its own refusal), never of the folder's other cues.
  const graphicStep = verbView(held(folder({ serverMembers: true, step: { kind: 'take', cueId: 'c1', off: [] } }), { bridgeDown: true }));
  assert.equal(graphicStep.take.disabled, false);
  assert.equal(graphicStep.folderCanTake, true);
  // Its next cue refused: the button says why and greys.
  const refused = verbView(held(folder({ step: { kind: 'take', cueId: 'c2', off: [] }, stepBlocked: 'Bridge is down', takeBlocked: 'ignored' })));
  assert.deepEqual([refused.take.disabled, refused.take.title, refused.folderBlocked], [true, 'Bridge is down', 'Bridge is down']);
  // The end: off and back to the top, or from the top when nothing is up.
  const top = verbView(held(folder({ stepped: true, up: true, step: { kind: 'top', off: ['c2'] } })));
  assert.deepEqual([top.take.space, top.take.disabled, top.folderBlocked], ['take-off', false, null]);
  const again = verbView(held(folder({ stepped: true, step: { kind: 'top', off: [] } })));
  assert.deepEqual([again.take.space, again.take.step.text], ['preview', '↺ FROM THE TOP']);
  // All of it on air and nothing a press could take off: grey, and it says what 0 does.
  const none = verbView(held(folder({ up: true, step: { kind: 'none' } })));
  assert.deepEqual([none.take.disabled, none.folderBlocked], [true, 'Everything in Opening is on air. 0 takes it off.']);
});

test('All out: grey only while clearing or with nothing to clear; published it always may go', () => {
  assert.equal(verbView(inputs()).allOutEnabled, false);
  assert.equal(verbView(inputs({ anyUp: true })).allOutEnabled, true);
  assert.equal(verbView(inputs({ published: true })).allOutEnabled, true);
  assert.equal(verbView(inputs({ unnamedUp: () => true })).allOutEnabled, true);
  assert.equal(verbView(inputs({ anyUp: true, published: true, clearing: true })).allOutEnabled, false);
  // The unnamed slots are asked only when nothing else answers.
  let asked = 0;
  verbView(inputs({ anyUp: true, unnamedUp: () => (asked += 1) > 0 }));
  assert.equal(asked, 0);
});

const facts = (extra = {}) => ({
  title: 'Show',
  cursorRow: 'folder-row-F',
  cues: [{ id: 'c1' }, { id: 'c2' }, { id: 'v1' }],
  live: new Set(),
  refused: new Set(),
  folderRows: [],
  clip: null,
  configured: true,
  rowCount: 3,
  rows: [],
  ...extra,
});

test("the panel's allowed map is the verb bar's disabled states, for every state the bar can be in", () => {
  const states = [];
  for (const spaceMode of ['take', 'preview-then-take'])
    for (const liveCue of [{}, { Strap: 'c1' }, { Strap: 'c2' }])
      for (const selectedCue of [c1, v1, null])
        for (const selectedPlayoutLive of [false, true])
          for (const bridgeDown of [false, true])
            for (const advances of [false, true])
              for (const takeBlocked of [null, 'No'])
                for (const editTarget of ['preview', 'air'])
                  states.push(inputs({ spaceMode, liveCue, selectedCue, selectedGraphic: selectedCue === c1 ? 'Strap' : null, selectedPlayoutLive: selectedCue === v1 && selectedPlayoutLive, selectedItemKind: selectedCue === v1 ? 'media' : null, bridgeDown, advances, takeBlocked, editTarget }));
  for (const f of [folder(), folder({ up: true }), folder({ stepped: true }), folder({ step: { kind: 'take', cueId: 'c1', off: [] } }), folder({ step: { kind: 'none' } }), folder({ takeBlocked: 'No' })])
    for (const bridgeDown of [false, true]) states.push(held({ ...f, serverMembers: true }, { bridgeDown }));
  let checked = 0;
  for (const state of states) {
    const v = verbView(state);
    const { allowed } = panelSnapshot(v, facts());
    const label = JSON.stringify({ ...state, cues: undefined, unnamedUp: undefined, folder: state.folder && { ...state.folder, labelOf: undefined } });
    assert.equal(allowed.retake, !v.disabled.retake, label);
    assert.equal(allowed.update, !v.disabled.update, label);
    assert.equal(allowed.next, !v.disabled.next, label);
    assert.equal(allowed.out, !v.disabled.out, label);
    // The key's Take also waits on the server the dispatcher waits on.
    assert.equal(allowed.take, !v.take.disabled && (v.folderHeld || v.canTake), label);
    assert.equal(allowed['all-out'], v.allOutEnabled, label);
    assert.equal(allowed.pause, v.selectedClipUp, label);
    assert.equal(allowed.resume, v.selectedClipUp, label);
    checked += 1;
  }
  assert.ok(checked > 500);
});

test('the snapshot names the row the verbs act on, what SPACE does, which own-Take keys are refused, and the Bridge', () => {
  const live = verbView(inputs({ liveCue: { Strap: 'c1' } }));
  const snap = panelSnapshot(live, facts({ live: new Set(['c1']), refused: new Set(['c1', 'v1']), folderRows: ['folder-row-F'], configured: true }));
  assert.equal(snap.title, 'Show');
  assert.equal(snap.selected, 'c1');
  assert.equal(snap.space, 'take-off');
  assert.deepEqual(snap.live, ['c1']);
  // A folder's own key is always refused; a cue on air never is (taking it off always goes).
  assert.deepEqual(snap.blocked, ['folder-row-F', 'v1']);
  assert.equal(snap.bridge, 'ok');
  assert.equal(panelSnapshot(verbView(inputs({ bridgeDown: true })), facts()).bridge, 'down');
  assert.equal(panelSnapshot(verbView(inputs({ bridgeDown: true })), facts({ configured: false })).bridge, 'off');
  // A held folder: its header row, and its SPACE.
  const f = panelSnapshot(verbView(held(folder({ up: true }))), facts());
  assert.deepEqual([f.selected, f.space], ['folder-row-F', 'take-off']);
  // Nothing selected: no row and no SPACE.
  const empty = panelSnapshot(verbView(inputs({ selectedCue: null, selectedGraphic: null })), facts({ rowCount: 0 }));
  assert.deepEqual([empty.selected, empty.space, empty.allowed['select-prev'], empty.allowed['select-next']], [null, null, false, false]);
  // The clip key goes only with a clip to pause.
  assert.equal(panelSnapshot(live, facts()).allowed['pause-toggle'], false);
  assert.equal(panelSnapshot(live, facts({ clip: { cue: 'v1' } })).allowed['pause-toggle'], true);
});
