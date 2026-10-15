// guards: src/components/wizard/template/useKit.ts
//
// THE KIT'S MOVES (docs/work-specs/wizard-structure/spec.md D6, phase S6). Where Back and Next go
// on a kit's walk, what a move to a step does to the kit (records the open graphic when it leaves
// the editing steps, builds the set when it leaves the Kit step forward, ends the kit for one
// graphic), what building the set keeps, and what the footer's buttons say. Each is a pure
// function of template/useKit.ts; the hook dispatches what it answers, so each case below runs
// the answer through the walk's own reducer. Also: a brand chosen while a kit graphic is open
// on an editing step keeps that graphic's edit (the gap the S5 check carried).
//
// Loaded through scripts/wizard-load.mjs (rolldown, the wizard's `import` index resolved to
// `import/draft.ts`).
//
//   node --test scripts/wizard-kit-moves.test.mjs
import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWizardModule as load } from './wizard-load.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const wizard = (file) => path.join(projectRoot, 'src/components/wizard', file);
const { kitStepTarget, kitMove, kitBuilt, kitLabels } = await load(wizard('template/useKit.ts'));
const W = await load(wizard('shell/walkState.ts'));
const { walkOf, stepIndex } = await load(wizard('shell/walks.ts'));
const { initialDraft, mergeDraft, brandPatch } = await load(wizard('draft.ts'));
const { buildKit } = await load(wizard('template/kitPlan.ts'));
const { PALETTES } = await load(path.join(projectRoot, 'src/model/wizard.ts'));

const test = (name, fn) => nodeTest(name, { timeout: 5000 }, fn);

// ── Fixtures (wizard-walk-state.test.mjs's: a design whose code is the first line it was built with)

function design(id) {
  return {
    id,
    name: `Design ${id}`,
    category: 'lower-third',
    styleTag: 'minimal',
    description: '',
    maxLines: 2,
    suggestedLines: [{ key: 'name', label: 'Name', sample: `Sample ${id}` }],
    logo: 'none',
    animationPresets: ['fade'],
    create(options) {
      return {
        name: `Design ${id}`,
        type: 'lower-third',
        resolution: options.resolution,
        fps: options.fps,
        html: `<div>${options.lines?.[0]?.sample ?? ''}</div>`,
        css: `:root { --accent: ${options.palette?.accent ?? 'default'}; }`,
        js: '',
        fields: [],
        settings: {},
        assets: [],
        layers: [],
      };
    },
  };
}
const ITEM = { a: { key: 'a', variant: design('a'), typeId: null }, b: { key: 'b', variant: design('b'), typeId: null }, c: { key: 'c', variant: design('c'), typeId: null } };
const pack = (id) => ({ id, name: `Kit ${id}`, description: '', family: 'minimal', paletteId: PALETTES[3].id, starter: ['a', 'b'], types: [], formats: [] });
const PACK = pack('kit');
const brand = { styleTag: 'minimal', palette: PALETTES[1], fontId: null, customFont: null };

const KIT_WALK = walkOf('template', true);
const HUB = KIT_WALK.finishStep;
const ANIMATION = KIT_WALK.animStep;
const FIELDS = stepIndex(KIT_WALK, 'fields');

/** A built two-graphic kit on `step`, with graphic 0 open and its draft in hand. */
function inKit(step, over = {}) {
  const kit = buildKit(PACK, [ITEM.a, ITEM.b], initialDraft(), null);
  return { ...W.emptyWalk(), mode: 'template', buildMode: 'kit', kitPack: PACK, kitSelected: ['a', 'b'], kit, draft: kit.drafts[0], step, ...over };
}
const edit = (draft, sample) => mergeDraft(draft, { lines: [{ key: 'name', label: 'Name', sample }] });

// ── Back and Next ─────────────────────────────────────────────────────────────────────────────

test('Next from the Kit step builds the set, whatever is built already', () => {
  const picking = { ...W.emptyWalk(), mode: 'template', buildMode: 'kit', kitPack: PACK, kitSelected: ['a'], step: 1 };
  assert.equal(kitStepTarget(picking, KIT_WALK, 1), 'build');
  assert.equal(kitStepTarget(inKit(1), KIT_WALK, 1), 'build');
  assert.equal(kitStepTarget(picking, KIT_WALK, -1), 0, 'Back from it is Entry');
});

test('a built kit: Back from its first editing step and Next from its last go to the hub, Back from the hub to the Kit step', () => {
  assert.equal(kitStepTarget(inKit(FIELDS), KIT_WALK, -1), HUB);
  assert.equal(kitStepTarget(inKit(ANIMATION), KIT_WALK, 1), HUB);
  assert.equal(kitStepTarget(inKit(HUB), KIT_WALK, -1), 1);
  // In between, the ordinary steps of the open graphic.
  assert.equal(kitStepTarget(inKit(FIELDS), KIT_WALK, 1), FIELDS + 1);
  assert.equal(kitStepTarget(inKit(FIELDS + 1), KIT_WALK, -1), FIELDS);
});

test('without a kit, Back and Next are the walk\'s own', () => {
  const template = walkOf('template', false);
  const one = { ...W.emptyWalk(), mode: 'template', step: 2 };
  assert.equal(kitStepTarget(one, template, -1), 1);
  assert.equal(kitStepTarget(one, template, 1), 3);
  assert.equal(kitStepTarget({ ...one, step: 1 }, template, 1), 2, 'Browse for one graphic does not build');
});

// ── A move to a step ──────────────────────────────────────────────────────────────────────────

test('leaving the editing steps records the open graphic; moving between them does not', () => {
  const open = inKit(FIELDS);
  const edited = { ...open, draft: edit(open.draft, 'Edited') };
  const atHub = W.reduce(edited, kitMove(edited, HUB));
  assert.equal(atHub.step, HUB);
  assert.equal(atHub.kit.drafts[0], edited.draft, 'the hub sees the graphic as it was left');
  assert.equal(atHub.kit.edited, true);
  assert.match(atHub.kit.built[0].html, /Edited/, 'and its code is rebuilt from it');
  const within = W.reduce(edited, kitMove(edited, FIELDS + 1));
  assert.equal(within.kit, open.kit, 'not recorded while still on its steps');
  assert.equal(within.step, FIELDS + 1);
});

test('leaving the Kit step forward builds the set, or ends the kit for one graphic', () => {
  assert.equal(kitMove(inKit(1), HUB), 'build');
  const one = W.reduce(inKit(1, { buildMode: 'one' }), kitMove(inKit(1, { buildMode: 'one' }), 2));
  assert.equal(one.kit, null);
  assert.equal(one.step, 2);
  // Back from the Kit step is an ordinary move and keeps the kit.
  const onKitStep = inKit(1);
  const back = W.reduce(onKitStep, kitMove(onKitStep, 0));
  assert.equal(back.step, 0);
  assert.equal(back.kit, onKitStep.kit);
});

// ── Building the set ──────────────────────────────────────────────────────────────────────────

test('the same kit re-shaped keeps every graphic as edited; another kit starts over', () => {
  const open = inKit(FIELDS);
  const editing = { ...open, draft: edit(open.draft, 'Kept') };
  const edited = W.reduce(editing, kitMove(editing, 1));
  const same = kitBuilt(edited, PACK, [ITEM.a, ITEM.c], null, HUB);
  assert.equal(same.fresh, false);
  const reshaped = W.reduce(edited, same.action);
  assert.deepEqual(reshaped.kit.items.map((i) => i.key), ['a', 'c']);
  assert.equal(reshaped.kit.drafts[0].lines[0].sample, 'Kept');
  assert.equal(reshaped.step, HUB);
  assert.equal(reshaped.draft, reshaped.kit.drafts[reshaped.kit.current], 'the draft in hand is the open graphic\'s');
  const other = kitBuilt(edited, pack('other'), [ITEM.a, ITEM.b], null, HUB);
  assert.equal(other.fresh, true);
  assert.equal(W.reduce(edited, other.action).kit.drafts[0].lines[0].sample, 'Sample a');
});

test('a set built under a brand carries it into every graphic', () => {
  const picking = { ...W.emptyWalk(), mode: 'template', buildMode: 'kit', kitPack: PACK, kitSelected: ['a', 'b'], step: 1 };
  const built = W.reduce(picking, kitBuilt(picking, PACK, [ITEM.a, ITEM.b], brandPatch(brand), HUB).action);
  assert.ok(built.kit.drafts.every((d) => d.paletteId === PALETTES[1].id));
});

// ── The footer's words ────────────────────────────────────────────────────────────────────────

test('the footer says where a kit\'s buttons go', () => {
  const picking = { ...W.emptyWalk(), mode: 'template', buildMode: 'kit', kitPack: PACK, kitSelected: ['a', 'b'], step: 1 };
  assert.deepEqual(kitLabels(picking, KIT_WALK), { back: null, next: 'Build 2 graphics →' });
  assert.equal(kitLabels({ ...picking, kitSelected: ['a'] }, KIT_WALK).next, 'Build 1 graphic →');
  assert.equal(kitLabels(inKit(1), KIT_WALK).next, 'Back to the kit →');
  assert.deepEqual(kitLabels(inKit(FIELDS), KIT_WALK), { back: '← All graphics', next: null });
  assert.equal(kitLabels(inKit(ANIMATION), KIT_WALK).next, 'Done →');
  assert.deepEqual(kitLabels({ ...W.emptyWalk(), mode: 'template', step: 2 }, walkOf('template', false)), { back: null, next: null });
});

// ── The brand over an open kit graphic ────────────────────────────────────────────────────────

test('a brand chosen on an editing step keeps the open graphic\'s edit and reaches every graphic', () => {
  const choices = [{ id: 'look', name: 'Look', brand }];
  const on = inKit(FIELDS, { brandChoices: choices });
  const edited = { ...on, draft: edit(on.draft, 'Mid-edit') };
  const branded = W.reduce(edited, { type: 'chooseBrand', id: 'look' });
  assert.equal(branded.draft.lines[0].sample, 'Mid-edit', 'the edit in hand survives the rebrand');
  assert.equal(branded.kit.drafts[0].lines[0].sample, 'Mid-edit', 'and is recorded in the kit');
  assert.ok(branded.kit.drafts.every((d) => d.paletteId === PALETTES[1].id));
  assert.equal(branded.draft, branded.kit.drafts[branded.kit.current]);
});

// ── A kit another walk holds ──────────────────────────────────────────────────────────────────

test('a kit held by another walk gives that walk\'s buttons no other meaning', () => {
  const design = walkOf('design', false);
  const held = { ...inKit(2), mode: 'design' };
  assert.equal(kitStepTarget(held, design, -1), 1, 'Back from its step 2 is its step 1, not a hub');
  assert.equal(kitStepTarget({ ...held, step: design.animStep }, design, 1), design.finishStep);
  assert.equal(kitStepTarget({ ...held, step: design.finishStep }, design, -1), design.finishStep - 1);
  assert.equal(kitStepTarget({ ...held, step: 1 }, design, 1), 2, 'its first step does not build a kit');
  assert.deepEqual(kitLabels(held, design), { back: null, next: null });
});
