// guards: src/components/wizard/shell/walkState.ts
//
// THE WALK'S LIFETIME (docs/work-specs/wizard-structure/spec.md section 4, phase S5). Every cell
// of section 4's keep/clear table, as S1c decided it, is a case of `transition` below: what
// Continue, Restore, Fresh, Rewind and Close each keep and clear of the walk record, and what
// each does beside it (the walk memory, the walk-back warning, the stretch demo and the kit's
// transient UI, the accepted AI generation, the held-walk flag, the URL). Then: nothing counts as
// work right after a fresh open in any mode; a snapshot restores to the walk it was taken of; the
// reducer's moves (the furthest step, one pick patch for three doors, the brand chooser, the
// kit); and the library save the doors call, with writes that answer late, fail or vanish.
//
// Loaded through scripts/wizard-load.mjs (rolldown, the wizard's `import` index resolved to
// `import/draft.ts`).
//
//   node --test scripts/wizard-walk-state.test.mjs
import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWizardModule as load } from './wizard-load.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const W = await load(path.join(projectRoot, 'src/components/wizard/shell/walkState.ts'));
const { walkOf, stepIndex } = await load(path.join(projectRoot, 'src/components/wizard/shell/walks.ts'));
const { initialDraft, mergeDraft, brandPatch, brandClearPatch } = await load(path.join(projectRoot, 'src/components/wizard/draft.ts'));
const { buildKit } = await load(path.join(projectRoot, 'src/components/wizard/template/kitPlan.ts'));
const { NO_BROWSE_FILTERS } = await load(path.join(projectRoot, 'src/templates/browseFilters.ts'));
const { PALETTES } = await load(path.join(projectRoot, 'src/model/wizard.ts'));

// A save held on a write the test never lets go fails here rather than hanging the run.
const test = (name, fn) => nodeTest(name, { timeout: 5000 }, fn);

// ── Fixtures ─────────────────────────────────────────────────────────────────────────────────

/** A design whose code is the first line it was built with (wizard-kit-plan.test.mjs's idea). */
function design(id, category = 'lower-third') {
  return {
    id,
    name: `Design ${id}`,
    category,
    styleTag: 'minimal',
    description: '',
    maxLines: 2,
    suggestedLines: [{ key: 'name', label: 'Name', sample: `Sample ${id}` }],
    logo: 'none',
    animationPresets: ['fade'],
    create(options) {
      return {
        name: `Design ${id}`,
        type: category,
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
const A = design('a');
const B = design('b');

const brandA = { styleTag: 'minimal', palette: PALETTES[1], fontId: null, customFont: null };
const brandB = { styleTag: 'minimal', palette: PALETTES[2], fontId: null, customFont: null };
const LOOKS = [
  { id: 'look-a', name: 'Brand A', brand: brandA },
  { id: 'look-b', name: 'Brand B', brand: brandB },
];
const PACK = { id: 'kit', name: 'Kit', description: '', family: 'minimal', paletteId: PALETTES[3].id, starter: ['a', 'b'], types: [], formats: [] };
const kitPlan = (draft) => buildKit(PACK, [{ key: 'a', variant: A, typeId: null }, { key: 'b', variant: B, typeId: null }], draft, null);

const AI_RESULT = { template: { name: 'AI graphic', fields: [] }, valid: true, generationId: 'gen-1' };
const THREAD = { version: 1, messages: [{ role: 'user', text: 'a strap' }] };
const FILE = { template: { name: 'dropped', fields: [] }, detection: { certain: true, messages: [] } };
const FILTERS = { ...NO_BROWSE_FILTERS, query: 'score' };

/**
 * A walk with something in every field, in `mode`: what a reader leaves behind four steps in.
 * The project format is set, so a rewind has something to keep.
 */
function loaded(mode = 'template') {
  const start = mergeDraft(initialDraft(), { aspectId: '9:16', resolutionId: '1080x1920', fps: 50, formatTouched: true });
  const draft = mergeDraft(start, { name: 'Friday strap', variantId: 'a', category: 'lower-third', ...brandPatch(brandA) });
  return {
    ...W.emptyWalk(),
    draft,
    mode,
    step: 3,
    browseFilters: FILTERS,
    aiResult: AI_RESULT,
    aiThread: THREAD,
    importedFile: FILE,
    importedFileError: 'a failed read',
    contextProductionId: 'show-ctx',
    brandChoices: LOOKS,
    brandId: 'look-a',
    buildMode: 'kit',
    kitPack: PACK,
    kitSelected: ['a', 'b'],
    kit: kitPlan(draft),
    startDraft: start,
    lastStep: 4,
  };
}

const MADE = { name: 'Friday strap', graphicId: 'g-1', production: null, landedOn: null };
const fresh = (over = {}) => ({ kind: 'fresh', routeStep: null, looks: LOOKS, productionId: null, show: undefined, ...over });
const NO_KIT = { buildMode: 'one', kitPack: null, kitSelected: [], kit: null };
const kitOf = (s) => ({ buildMode: s.buildMode, kitPack: s.kitPack, kitSelected: s.kitSelected, kit: s.kit });

// ── Continue ─────────────────────────────────────────────────────────────────────────────────

test('Continue keeps the whole walk and returns to the furthest step it reached', () => {
  const before = loaded('design');
  const out = W.transition(before, { kind: 'continue' });
  assert.deepEqual(out.state, { ...before, step: 4 }, 'every field kept; step = lastStep');
  assert.equal(out.memory, 'keep');
  assert.equal(out.resumeAsk, 'keep', 'no walk-back warning');
  assert.equal(out.resetScreen, false, 'stretch demo, kit asks and kit error kept');
  assert.equal(out.clearAcceptedAi, false);
  assert.equal(out.held, false, 'the held flag is cleared on open');
  assert.equal(out.replaceStep, null);
  assert.equal(out.dropLink, true, 'a pending deep link does not start the continued walk over');
});

// ── Restore ──────────────────────────────────────────────────────────────────────────────────

test('Restore puts the finished walk back, kit reset, error cleared, and raises the warning', () => {
  // Restored over a walk with a kit built and a file error showing, as a closed wizard holds.
  const walk = { ...W.snapshotWalk({ ...loaded('svg'), ...NO_KIT }), step: 3, contextProductionId: 'show-walk', made: MADE };
  const out = W.transition(loaded('template'), { kind: 'restore', walk, live: null });
  const s = out.state;
  for (const k of ['draft', 'mode', 'step', 'browseFilters', 'aiResult', 'aiThread', 'importedFile', 'brandChoices', 'brandId']) {
    assert.deepEqual(s[k], walk[k], `${k} from the snapshot`);
  }
  assert.equal(s.importedFileError, null, 'the file error is cleared');
  assert.equal(s.contextProductionId, 'show-walk', 'no production landed: the snapshot\'s');
  assert.deepEqual(kitOf(s), NO_KIT, 'resetKit');
  assert.deepEqual(out.memory, { finished: walk, made: MADE });
  assert.equal(out.resumeAsk, walk, 'raised over this walk');
  assert.equal(out.resetScreen, true, 'stretch demo and the kit\'s transient UI cleared');
  assert.equal(out.clearAcceptedAi, false, 'the accepted generation is kept');
  assert.equal(out.held, false);
  assert.equal(out.replaceStep, walkOf('svg', false).slugs[3], 'the URL names the step the walk ended on');
  assert.equal(out.dropLink, true, 'the design its step URL carries does not start it over (#1220)');
});

test('Restore points a walk that landed in a production at that production', () => {
  const walk = { ...W.snapshotWalk(loaded()), made: { ...MADE, production: 'Evening', landedOn: { view: 'production', id: 'show-landed' } } };
  const out = W.transition(W.emptyWalk(), { kind: 'restore', walk, live: null });
  assert.equal(out.state.contextProductionId, 'show-landed');
});

test('Restore links an editor-door walk to the record the reader saved it as, by name only', () => {
  const editorMade = { name: 'Friday strap', graphicId: null, production: null, landedOn: { view: 'editor-foundation' } };
  const walk = { ...W.snapshotWalk(loaded()), made: editorMade };
  const same = W.transition(W.emptyWalk(), { kind: 'restore', walk, live: { id: 'g-saved', name: 'Friday strap' } });
  assert.equal(same.memory.made.graphicId, 'g-saved');
  assert.equal(same.memory.finished.made.graphicId, 'g-saved', 'the walk remembers it too');
  assert.equal(same.resumeAsk.made.graphicId, 'g-saved');
  const other = W.transition(W.emptyWalk(), { kind: 'restore', walk, live: { id: 'g-other', name: 'Another' } });
  assert.equal(other.memory.made.graphicId, null, 'another graphic\'s record is not this walk\'s');
  const saved = W.transition(W.emptyWalk(), { kind: 'restore', walk: { ...walk, made: MADE }, live: { id: 'g-saved', name: 'Friday strap' } });
  assert.equal(saved.memory.made.graphicId, 'g-1', 'a walk with its own record keeps it');
});

// ── Fresh ────────────────────────────────────────────────────────────────────────────────────

test('Fresh clears the walk, keeps nothing of the last one, and forgets it', () => {
  const out = W.transition(loaded('ai'), fresh());
  const s = out.state;
  assert.deepEqual(s.draft, initialDraft());
  assert.equal(s.mode, 'template');
  assert.equal(s.step, 0);
  assert.deepEqual(s.browseFilters, NO_BROWSE_FILTERS);
  assert.equal(s.aiResult, null);
  assert.equal(s.aiThread, null);
  assert.equal(s.importedFile, null, 'a dropped file goes with the walk (#1146)');
  assert.equal(s.importedFileError, null);
  assert.equal(s.contextProductionId, null, 'the one-shot production, here none');
  assert.deepEqual(s.brandChoices, LOOKS, 'the saved looks');
  assert.equal(s.brandId, null, 'None: matching is explicit');
  assert.deepEqual(kitOf(s), NO_KIT);
  assert.equal(s.startDraft, s.draft, 'the walk starts from its own draft');
  assert.equal(s.lastStep, 0);
  assert.equal(out.memory, 'forget');
  assert.equal(out.resumeAsk, 'clear');
  assert.equal(out.resetScreen, true);
  assert.equal(out.clearAcceptedAi, true);
  assert.equal(out.held, false);
  assert.equal(out.replaceStep, null);
  assert.equal(out.dropLink, false, 'a deep link starts this walk');
});

test('Fresh starts on the step the URL names, in the template walk only', () => {
  const fields = stepIndex(walkOf('template', false), 'fields');
  const named = W.transition(loaded(), fresh({ routeStep: walkOf('template', false).slugs[fields] }));
  assert.equal(named.state.step, fields);
  assert.equal(named.state.lastStep, fields, 'Continue would come back there');
  assert.equal(W.transition(loaded(), fresh({ routeStep: 'images' })).state.step, 0, 'another walk\'s step: Entry');
  assert.equal(W.transition(loaded(), fresh({ routeStep: 'no-such-step' })).state.step, 0);
});

test('Fresh for a production: its named brand, else its captured look under a synthetic entry', () => {
  const named = W.transition(loaded(), fresh({ productionId: 'show-1', show: { name: 'Evening', brandId: 'look-b', look: brandA } }));
  assert.equal(named.state.contextProductionId, 'show-1');
  assert.equal(named.state.brandId, 'look-b', 'the reference wins over the captured copy');
  assert.deepEqual(named.state.brandChoices, LOOKS);
  assert.deepEqual(named.state.draft, mergeDraft(initialDraft(), brandPatch(brandB)));
  assert.equal(named.state.startDraft, named.state.draft, 'the production\'s brand is not work');

  const look = W.transition(loaded(), fresh({ productionId: 'show-2', show: { name: 'Matchday', look: brandB } }));
  assert.equal(look.state.brandId, W.PRODUCTION_LOOK_ID);
  assert.deepEqual(look.state.brandChoices[0], { id: W.PRODUCTION_LOOK_ID, name: 'Matchday (this production\'s look)', brand: brandB });
  assert.deepEqual(look.state.brandChoices.slice(1), LOOKS);

  const plain = W.transition(loaded(), fresh({ productionId: 'show-3', show: { name: 'Plain' } }));
  assert.equal(plain.state.brandId, null, 'a production with neither: None');
  assert.equal(plain.state.contextProductionId, 'show-3');
  const gone = W.transition(loaded(), fresh({ productionId: 'show-gone', show: undefined }));
  assert.equal(gone.state.contextProductionId, 'show-gone', 'a production no longer saved is still the one asked for');
});

// ── Rewind ───────────────────────────────────────────────────────────────────────────────────

test('Rewind discards the draft but its project format, keeps the destination, and forgets the walk', () => {
  const before = loaded('ai');
  const out = W.transition(before, { kind: 'rewind' });
  const s = out.state;
  const { aspectId, resolutionId, fps, formatTouched } = before.draft;
  assert.deepEqual(s.draft, { ...initialDraft(), aspectId, resolutionId, fps, formatTouched });
  assert.equal(s.mode, 'template');
  assert.equal(s.step, 0);
  assert.deepEqual(s.browseFilters, NO_BROWSE_FILTERS);
  assert.equal(s.aiResult, null);
  assert.equal(s.aiThread, null);
  assert.equal(s.importedFile, null, '#1146');
  assert.equal(s.importedFileError, null);
  assert.equal(s.contextProductionId, 'show-ctx', 'the production is why the wizard opened');
  assert.equal(s.brandChoices, LOOKS, 'choices kept');
  assert.equal(s.brandId, null, 'brand None: the draft that carried it is gone');
  assert.deepEqual(kitOf(s), NO_KIT);
  assert.equal(s.startDraft, null);
  assert.equal(s.lastStep, 0);
  assert.equal(out.memory, 'forget', 'a rewound walk is not one to come back to');
  assert.equal(out.resumeAsk, 'keep');
  assert.equal(out.resetScreen, true);
  assert.equal(out.clearAcceptedAi, false, 'kept (unobservable: its result is cleared)');
  assert.equal(out.held, null, 'n/a');
  assert.equal(W.walkHasWork(s), false, 'the kept format is not work');
});

// ── Close ────────────────────────────────────────────────────────────────────────────────────

test('Close keeps the walk on Entry and holds it only when the reader left work in it', () => {
  const before = loaded('file');
  const out = W.transition(before, { kind: 'close', left: true, made: null });
  assert.deepEqual(out.state, { ...before, step: 0 }, 'everything kept; step 0');
  assert.equal(out.memory, 'keep');
  assert.equal(out.resumeAsk, 'keep');
  assert.equal(out.resetScreen, false);
  assert.equal(out.clearAcceptedAi, false);
  assert.equal(out.replaceStep, null);
  assert.equal(out.held, true, 'left with work: held');
  assert.equal(W.transition(before, { kind: 'close', left: false, made: null }).held, false, 'a close the wizard made itself');
  assert.equal(W.transition(before, { kind: 'close', left: true, made: MADE }).held, false, 'a door already made something of it');
  const empty = W.transition(loaded(), fresh()).state;
  assert.equal(W.transition(empty, { kind: 'close', left: true, made: null }).held, false, 'nothing in it');
});

// ── A generation still out ───────────────────────────────────────────────────────────────────

test('an AI answer still out is dropped by exactly the intents that end its walk (#1165)', () => {
  // The shell aborts the walk's generations in `resetScreen` (CreationWizard.tsx `aiWalk`), so
  // this policy is what decides where a late answer lands.
  const walk = { ...W.snapshotWalk(loaded('ai')), made: null };
  const ends = {
    rewind: { kind: 'rewind' },
    fresh: fresh(),
    restore: { kind: 'restore', walk, live: null },
    continue: { kind: 'continue' },
    'close by Home': { kind: 'close', left: true, made: null },
    'close by a door': { kind: 'close', left: false, made: MADE },
  };
  const dropped = Object.entries(ends).filter(([, intent]) => W.transition(loaded('ai'), intent).resetScreen).map(([name]) => name);
  assert.deepEqual(dropped, ['rewind', 'fresh', 'restore'], 'Home and Continue keep the answer for the held walk');
});

// ── Has work, snapshot ───────────────────────────────────────────────────────────────────────

test('nothing is work right after a fresh open, in every mode, with or without a production brand', () => {
  for (const mode of ['template', 'import', 'design', 'svg', 'file', 'ai', 'video']) {
    assert.equal(W.walkHasWork(loaded(mode)), true, `${mode}: the loaded walk has work`);
    for (const intent of [fresh(), fresh({ productionId: 'p', show: { name: 'P', brandId: 'look-a' } }), fresh({ productionId: 'p', show: { name: 'P', look: brandB } })]) {
      const s = W.transition(loaded(mode), intent).state;
      assert.equal(W.walkHasWork(s), false, `${mode}, fresh ${intent.show ? 'for a production' : ''}`);
      assert.equal(W.walkHasWork(W.reduce(s, { type: 'deepLink', variant: A })), false, `${mode}, fresh then a deep link`);
    }
  }
});

test('walkHasWork: a changed draft, an AI result, a file, a kit pick; never the format alone', () => {
  const s = W.transition(W.emptyWalk(), fresh()).state;
  assert.equal(W.walkHasWork(W.reduce(s, { type: 'patch', patch: { name: 'x' } })), true);
  assert.equal(W.walkHasWork(W.reduce(s, { type: 'ai', result: AI_RESULT })), true);
  assert.equal(W.walkHasWork(W.reduce(s, { type: 'file', file: FILE })), true);
  assert.equal(W.walkHasWork(W.reduce(s, { type: 'kitPick', pack: PACK, selected: [] })), true);
  assert.equal(W.walkHasWork(W.reduce(s, { type: 'patch', patch: { aspectId: '9:16', fps: 50, formatTouched: true } })), false);
  assert.equal(W.walkHasWork(W.reduce(s, { type: 'patch', patch: { name: 'x' } }), MADE), false, 'made');
});

test('a snapshot restores to the walk it was taken of', () => {
  const before = { ...loaded('import'), ...NO_KIT };
  const walk = W.snapshotWalk(before);
  assert.equal(walk.made, null);
  const out = W.transition(W.transition(loaded('ai'), fresh()).state, { kind: 'restore', walk, live: null });
  for (const k of ['draft', 'mode', 'step', 'browseFilters', 'aiResult', 'aiThread', 'importedFile', 'contextProductionId', 'brandChoices', 'brandId', 'buildMode', 'kitPack', 'kitSelected', 'kit']) {
    assert.deepEqual(out.state[k], before[k], k);
  }
  assert.deepEqual(W.snapshotWalk(out.state), walk, 'and snapshots back to the same walk');
});

// ── The reducer's moves ──────────────────────────────────────────────────────────────────────

test('the furthest step: forward counts, back does not, and a new mode starts on the step it changed on', () => {
  let s = W.transition(W.emptyWalk(), fresh()).state;
  s = W.reduce(s, { type: 'walk', mode: 'design', step: 1 });
  assert.equal(s.lastStep, 1);
  s = W.reduce(s, { type: 'go', step: 3 });
  assert.equal(s.lastStep, 3);
  s = W.reduce(s, { type: 'go', step: 1 });
  assert.equal(s.lastStep, 3, 'Back does not lower it');
  s = W.reduce(s, { type: 'walk', mode: 'file' });
  assert.equal(s.step, 1, 'a dropped file does not move the reader');
  assert.equal(s.lastStep, 1, 'the file walk starts where the mode changed (#1149)');
  assert.equal(W.transition(s, { kind: 'continue' }).state.step, 1, 'so Continue keeps the file in sight');
  s = W.reduce(s, { type: 'walk', mode: 'ai', step: 1 });
  assert.equal(s.lastStep, 1);
});

test('a kit is the template walk\'s: another walk holds it untouched, and the template walk has it again', () => {
  const onEntry = { ...loaded('template'), step: 0 };
  assert.equal(W.activeKit(onEntry), onEntry.kit);
  for (const mode of ['import', 'design', 'svg', 'file', 'ai', 'video']) {
    const away = W.reduce(onEntry, { type: 'walk', mode, step: 1 });
    assert.deepEqual(kitOf(away), kitOf(onEntry), `${mode}: held`);
    assert.equal(W.activeKit(away), null, `${mode}: acting on nothing`);
    for (let step = 0; step < 7; step++) assert.equal(W.isKitEditStep(away, step), false, `${mode} ${step}`);
    // Nothing of that walk is recorded into the kit.
    const edited = { ...away, step: 3, draft: mergeDraft(away.draft, { name: 'Another walk' }) };
    assert.equal(W.committedKit(edited, edited.kit), edited.kit, `${mode}: not recorded`);
    const back = W.reduce(W.reduce(away, { type: 'go', step: 0 }), { type: 'walk', mode: 'template', step: 1 });
    assert.equal(W.activeKit(back), onEntry.kit, `${mode}: there again`);
  }
});

test('a brand chosen in another walk reaches the held kit and leaves that walk\'s draft in hand', () => {
  const away = W.reduce({ ...loaded('template'), step: 0 }, { type: 'walk', mode: 'design', step: 1 });
  const branded = W.reduce(away, { type: 'chooseBrand', id: 'look-b' });
  assert.ok(branded.kit.drafts.every((d) => d.paletteId === PALETTES[2].id), 'every graphic of the held kit');
  assert.deepEqual(branded.draft, mergeDraft(away.draft, brandPatch(brandB)), 'the draft in hand stays the design walk\'s');
});

test('one pick patch for Browse, the images walk\'s Template step and a deep link', () => {
  const start = W.reduce(W.transition(W.emptyWalk(), fresh()).state, { type: 'chooseBrand', id: 'look-a' });
  const picked = W.reduce(W.reduce(start, { type: 'patch', patch: { animation: { steps: false } } }), { type: 'pickDesign', variant: A });
  assert.equal(picked.draft.variantId, 'a');
  assert.equal(picked.draft.category, 'lower-third');
  assert.deepEqual(picked.draft.lines, A.suggestedLines);
  assert.notEqual(picked.draft.lines[0], A.suggestedLines[0], 'the lines are copies');
  assert.equal(picked.draft.animation.steps, null, 'the steps answer belongs to the design (#1151)');
  assert.equal(picked.draft.paletteId, PALETTES[1].id, 'the brand in force carries');

  const linked = W.reduce(start, { type: 'deepLink', variant: A });
  assert.deepEqual(linked.draft, W.reduce(start, { type: 'pickDesign', variant: A }).draft, 'the link is the Browse pick (#1154)');
  assert.equal(linked.mode, 'template');
  assert.equal(linked.step, stepIndex(walkOf('template', false), 'fields'));
  assert.equal(linked.startDraft, linked.draft, 'the link chose it, not the reader');
  const bare = W.reduce(W.transition(W.emptyWalk(), fresh()).state, { type: 'deepLink', variant: A });
  assert.equal(bare.draft.paletteId, null, 'no brand in force: cleared');
});

test('every catalog design\'s category is the list it is filed under, so the Template step\'s pick keeps the category', async () => {
  // The images walk's Template step lists `variantsFor(draft.category)` and used to send no
  // category; the one pick patch sends the design's own. That is a no-op only while this holds.
  const { CATALOG } = await load(path.join(projectRoot, 'src/templates/catalog.ts'));
  const filed = Object.entries(CATALOG).flatMap(([key, list]) => list.map((v) => [key, v]));
  assert.ok(filed.length > 100, 'the catalog loaded');
  assert.deepEqual(filed.filter(([key, v]) => v.category !== key).map(([key, v]) => `${v.id} in ${key}`), []);
});

test('the brand chooser writes the brand into the draft, or onto every graphic of a kit', () => {
  const s = W.transition(W.emptyWalk(), fresh()).state;
  const on = W.reduce(s, { type: 'chooseBrand', id: 'look-b' });
  assert.equal(on.brandId, 'look-b');
  assert.deepEqual(on.draft, mergeDraft(s.draft, brandPatch(brandB)));
  assert.equal(W.brandOf(on), brandB);
  const off = W.reduce(on, { type: 'chooseBrand', id: null });
  assert.equal(off.brandId, null);
  assert.deepEqual(off.draft, mergeDraft(on.draft, brandClearPatch()));
  assert.equal(W.reduce(s, { type: 'chooseBrand', id: 'no-such-look' }).brandId, null, 'an id no longer offered is None');

  const kit = kitPlan(s.draft);
  const inKit = { ...s, buildMode: 'kit', kit, draft: kit.drafts[0] };
  const branded = W.reduce(inKit, { type: 'chooseBrand', id: 'look-b' });
  assert.ok(branded.kit.drafts.every((d) => d.paletteId === PALETTES[2].id), 'every graphic of the kit');
  assert.equal(branded.draft, branded.kit.drafts[branded.kit.current], 'the draft in hand is the open graphic\'s');
});

test('filters compose as functional updates; the AI, file and kit moves set only their fields', () => {
  const s = W.emptyWalk();
  const f = W.reduce(W.reduce(s, { type: 'filters', update: (p) => ({ ...p, query: 'a' }) }), { type: 'filters', update: (p) => ({ ...p, query: p.query + 'b' }) });
  assert.equal(f.browseFilters.query, 'ab');
  const ai = W.reduce(W.reduce(s, { type: 'ai', result: AI_RESULT }), { type: 'ai', thread: THREAD });
  assert.equal(ai.aiResult, AI_RESULT);
  assert.equal(ai.aiThread, THREAD);
  const file = W.reduce(W.reduce(s, { type: 'file', error: 'bad' }), { type: 'file', file: FILE });
  assert.equal(file.importedFile, FILE);
  assert.equal(file.importedFileError, 'bad', 'a file move leaves the error unless it names it');
  const pick = W.reduce(W.reduce(s, { type: 'kitPick', pack: PACK, selected: ['a'] }), { type: 'kitPick', selected: ['a', 'b'] });
  assert.equal(pick.kitPack, PACK);
  assert.deepEqual(pick.kitSelected, ['a', 'b']);
  const plan = kitPlan(s.draft);
  const moved = W.reduce(s, { type: 'kit', kit: plan, draft: plan.drafts[1], step: 2 });
  assert.equal(moved.kit, plan);
  assert.equal(moved.draft, plan.drafts[1]);
  assert.equal(moved.step, 2);
  assert.equal(W.reduce(moved, { type: 'kit', kit: null }).step, 2, 'no step named: the reader stays');
  // A setter that changes nothing keeps the record, as a React state setter bails out.
  assert.equal(W.reduce(ai, { type: 'ai', thread: THREAD }), ai);
  assert.equal(W.reduce(file, { type: 'file', file: FILE, error: 'bad' }), file);
  assert.equal(W.reduce(f, { type: 'filters', update: (p) => p }), f);
});

test('committedKit records the open graphic only on its editing steps', () => {
  const draft = mergeDraft(initialDraft(), {});
  const plan = kitPlan(draft);
  const edited = mergeDraft(plan.drafts[0], { lines: [{ key: 'name', label: 'Name', sample: 'Edited' }] });
  const onFields = { ...W.emptyWalk(), buildMode: 'kit', kit: plan, step: 2, draft: edited };
  assert.equal(W.isKitEditStep(onFields, 2), true);
  assert.equal(W.committedKit(onFields, plan).drafts[0], edited);
  assert.equal(W.isKitEditStep(onFields, 1), false);
  assert.equal(W.committedKit({ ...onFields, step: 1 }, plan), plan, 'off the editing steps nothing is recorded');
  // The editing steps are the kit walk's Fields to Animation, in either template walk.
  const kitWalk = walkOf('template', true);
  const editing = [stepIndex(kitWalk, 'fields'), stepIndex(kitWalk, 'style'), stepIndex(kitWalk, 'animation')];
  for (const s of [onFields, { ...onFields, buildMode: 'one' }]) {
    for (let step = 0; step < kitWalk.steps.length; step++) assert.equal(W.isKitEditStep(s, step), editing.includes(step), `${s.buildMode} ${step}`);
  }
});

// ── The walk memory and the library save ─────────────────────────────────────────────────────

test('rememberWalk snapshots the walk; noteMade records what the door made on it and on the memory', () => {
  const memory = { finished: null, made: null };
  W.noteMade(memory, MADE);
  assert.equal(memory.made, MADE, 'no finished walk (the export door after a rewind): the record still counts');
  W.rememberWalk(memory, loaded());
  assert.deepEqual(memory.finished, W.snapshotWalk(loaded()));
  const second = { ...MADE, production: 'Evening' };
  W.noteMade(memory, second);
  assert.equal(memory.finished.made, second);
  assert.equal(memory.made, second);
});

/** A scripted library: `log` records each call; each write answers as the scenario says. */
function library(script = {}) {
  const log = [];
  const lib = {
    index: () => script.index ?? [],
    effect: (index, name, madeId) => {
      log.push(`effect ${name} ${madeId}`);
      return script.effect ?? { kind: madeId ? 'update' : 'new', targetId: madeId };
    },
    linkTo: (id) => log.push(`link ${id}`),
    saveCurrent: (name) => {
      log.push(`saveCurrent ${name}`);
      return Promise.resolve(typeof script.current === 'function' ? script.current() : script.current ?? 'saved');
    },
    saveAs: (name) => {
      log.push(`saveAs ${name}`);
      return Promise.resolve(typeof script.as === 'function' ? script.as() : script.as ?? { ok: true, error: null });
    },
  };
  return { lib, log };
}

test('the save writes over the record this walk made', async () => {
  const { lib, log } = library();
  const memory = { finished: null, made: MADE };
  assert.deepEqual(await W.saveBuiltGraphic(memory, 'Renamed', lib), { ok: true, error: null });
  assert.deepEqual(log, ['effect Renamed g-1', 'link g-1', 'saveCurrent Renamed']);
});

test('the save writes over the record that carries the name, and mints when there is none', async () => {
  const over = library({ effect: { kind: 'over', targetId: 'g-named' } });
  assert.deepEqual(await W.saveBuiltGraphic({ finished: null, made: null }, 'Score', over.lib), { ok: true, error: null });
  assert.deepEqual(over.log, ['effect Score null', 'link g-named', 'saveCurrent Score']);
  const mint = library();
  assert.deepEqual(await W.saveBuiltGraphic({ finished: null, made: null }, 'Score', mint.lib), { ok: true, error: null });
  assert.deepEqual(mint.log, ['effect Score null', 'saveAs Score']);
});

test('a record gone mid-write mints; a failed write returns its reason and never throws', async () => {
  const gone = library({ current: 'needs-name' });
  assert.deepEqual(await W.saveBuiltGraphic({ finished: null, made: MADE }, 'Score', gone.lib), { ok: true, error: null });
  assert.deepEqual(gone.log, ['effect Score g-1', 'link g-1', 'saveCurrent Score', 'saveAs Score']);

  const failedOver = library({ current: 'failed', effect: { kind: 'over', targetId: 'g-named' } });
  assert.deepEqual(await W.saveBuiltGraphic({ finished: null, made: null }, 'Score', failedOver.lib), {
    ok: false,
    error: 'The graphic could not be saved over the “Score” already in your library.',
  });
  const failedOwn = library({ current: 'failed' });
  assert.deepEqual(await W.saveBuiltGraphic({ finished: null, made: MADE }, 'Score', failedOwn.lib), {
    ok: false,
    error: '“Score” could not be saved to your library.',
  });
  const failedMint = library({ as: { ok: false, error: 'Storage is full.' } });
  assert.deepEqual(await W.saveBuiltGraphic({ finished: null, made: null }, 'Score', failedMint.lib), { ok: false, error: 'Storage is full.' });
});

test('a mint whose record landed but whose link was refused is the walk\'s record: a renamed retry writes over it (#1367)', async () => {
  const memory = { finished: null, made: null };
  const refused = library({ as: { ok: false, error: 'Storage is full.', graphicId: 'g-minted' } });
  assert.deepEqual(await W.saveBuiltGraphic(memory, 'Score', refused.lib), { ok: false, error: 'Storage is full.', graphicId: 'g-minted' });
  assert.deepEqual(memory.made, { name: 'Score', graphicId: 'g-minted', production: null, landedOn: null });
  const retry = library();
  assert.deepEqual(await W.saveBuiltGraphic(memory, 'Score v2', retry.lib), { ok: true, error: null });
  assert.deepEqual(retry.log, ['effect Score v2 g-minted', 'link g-minted', 'saveCurrent Score v2'], 'the retry mints nothing');
  // A refusal that minted nothing leaves the walk with no record.
  const nothing = { finished: null, made: null };
  await W.saveBuiltGraphic(nothing, 'Score', library({ as: { ok: false, error: 'Storage is full.' } }).lib);
  assert.equal(nothing.made, null);
});

test('held writes: each save reads the walk\'s record when it starts, and neither waits on the other', async () => {
  let release;
  const hold = new Promise((r) => (release = r));
  const { lib, log } = library({ current: () => hold.then(() => 'saved') });
  const memory = { finished: null, made: MADE };
  const first = W.saveBuiltGraphic(memory, 'Score', lib);
  // The walk was rewound while the first write is held: the record is forgotten.
  memory.made = null;
  const second = W.saveBuiltGraphic(memory, 'Score', lib);
  assert.deepEqual(log, ['effect Score g-1', 'link g-1', 'saveCurrent Score', 'effect Score null', 'saveAs Score']);
  assert.deepEqual(await second, { ok: true, error: null }, 'the second does not wait on the first');
  release();
  assert.deepEqual(await first, { ok: true, error: null }, 'the first lands on the record it started over');
});

test('a write that THROWS rejects the save (today\'s behaviour, recorded: the real writes report, they never throw)', async () => {
  const { lib } = library({ current: () => { throw new Error('boom'); } });
  await assert.rejects(W.saveBuiltGraphic({ finished: null, made: MADE }, 'Score', lib), /boom/);
});

test('a deep link starts a walk: an open that brings one back drops it, and a link ends a kit (#1220)', () => {
  // Browser Back onto `#/new/<id>/step/<name>` after a door closed the walk: the step URL
  // restores the walk, and the design the same URL carries is a pending deep link. The open
  // decides both, so the link never reaches the restored or continued walk.
  const walk = { ...W.snapshotWalk({ ...loaded('template'), ...NO_KIT }), step: 5, made: MADE };
  assert.equal(W.transition(W.emptyWalk(), { kind: 'restore', walk, live: null }).dropLink, true);
  assert.equal(W.transition(loaded('template'), { kind: 'continue' }).dropLink, true);
  for (const intent of [fresh(), { kind: 'rewind' }, { kind: 'close', left: true, made: null }]) {
    assert.equal(W.transition(loaded('template'), intent).dropLink, false, intent.kind);
  }
  // A link that does land (a warm open, the wizard already up) starts the walk, so it takes no
  // kit with it: kept, the tray would wrap the link's design and record it into the kit.
  const linked = W.reduce(loaded('template'), { type: 'deepLink', variant: B });
  assert.deepEqual(kitOf(linked), NO_KIT);
  assert.equal(W.activeKit(linked), null);
  assert.equal(linked.draft.variantId, 'b');
});
