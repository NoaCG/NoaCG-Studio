// guards: src/components/wizard/shell/walks.ts
//
// THE WIZARD'S WALKS AS DATA (docs/work-specs/wizard-structure/spec.md section 2, phase S3). Two
// halves:
//
// 1. Today's literal walks: every walk's titles, rail subs, URL names, StepIds and the indices
//    the shell reads (Animation, Finish), per (mode, kit walk). A changed title is a changed
//    step URL, so these are pinned word for word.
// 2. The rules the shell used to spell as index comparisons, checked against THOSE EXPRESSIONS,
//    copied below from `CreationWizard.tsx` as they stood before the move (main `29883468f`),
//    over every walk, step and state they read. A difference anywhere is a behaviour change.
//
//   node --test scripts/wizard-walks.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWizardModule as load } from './wizard-load.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const walks = await load(path.join(projectRoot, 'src/components/wizard/shell/walks.ts'));
const {
  walkOf, stepSlug, stepIndex, slugIndex, railIndex, stepAfter, summaryStep,
  previewOn, offersBrand, needsCatalogOn, offersSkip, canProceed, railJump,
} = walks;

const MODES = ['template', 'import', 'design', 'svg', 'file', 'ai', 'video'];

// ── 1. The walks, literally ─────────────────────────────────────────────────────────────────

const LITERAL = {
  template: {
    titles: ['Start', 'Browse', 'Fields', 'Style', 'Animation', 'Finish'],
    subs: ['Choose mode', 'Pick a design', 'Operator inputs', 'Colors & typeface', 'In & out motion', 'Name & save'],
    ids: ['start', 'browse', 'fields', 'style', 'animation', 'finish'],
    animStep: 4, finishStep: 5,
  },
  kit: {
    titles: ['Start', 'Kit', 'Fields', 'Style', 'Animation', 'Finish'],
    subs: ['Choose mode', 'Pick the kit', 'Operator inputs', 'Colors & typeface', 'In & out motion', 'All graphics & save'],
    ids: ['start', 'kit', 'fields', 'style', 'animation', 'finish'],
    animStep: 4, finishStep: 5,
  },
  import: {
    titles: ['Start', 'Images', 'Template', 'Fields', 'Style', 'Animation', 'Finish'],
    subs: ['Choose mode', 'Add pictures', 'Pick a design', 'Operator inputs', 'Colors & typeface', 'In & out motion', 'Name & save'],
    ids: ['start', 'images', 'template', 'fields', 'style', 'animation', 'finish'],
    animStep: 5, finishStep: 6,
  },
  ai: {
    titles: ['Start', 'Create', 'Finish'],
    subs: ['Choose mode', 'Describe it', 'Name & save'],
    ids: ['start', 'create', 'finish'],
    animStep: 4, finishStep: 2,
  },
  video: {
    titles: ['Start', 'Video'],
    subs: ['Choose mode', 'Brief & format'],
    ids: ['start', 'video'],
    animStep: 4, finishStep: 2,
  },
  design: {
    titles: ['Start', 'Design', 'Prepare', 'Text', 'Animation', 'Finish'],
    subs: ['Choose mode', 'Your artwork', 'Erase & scale', 'Place fields', 'In & out motion', 'Name & save'],
    ids: ['start', 'artwork', 'prepare', 'text', 'animation', 'finish'],
    animStep: 4, finishStep: 5,
  },
  svg: {
    titles: ['Start', 'Design', 'Fields', 'Animation', 'Finish'],
    subs: ['Choose mode', 'Your artwork', 'Map text layers', 'In & out motion', 'Name & save'],
    ids: ['start', 'artwork', 'map', 'animation', 'finish'],
    animStep: 3, finishStep: 4,
  },
  file: {
    titles: ['Start', 'Template file', 'Finish'],
    subs: ['Choose mode', 'Your graphic', 'Name & save'],
    ids: ['start', 'file', 'finish'],
    animStep: 4, finishStep: 2,
  },
};

/** Every (mode, kit walk) the shell can ask for, with the literal it must get. */
const CASES = MODES.flatMap((mode) =>
  [false, true].map((kitWalk) => ({
    mode,
    kitWalk,
    expected: LITERAL[mode === 'template' && kitWalk ? 'kit' : mode],
  })),
);

test('every walk has today\'s titles, rail subs and step ids, index for index', () => {
  for (const { mode, kitWalk, expected } of CASES) {
    const walk = walkOf(mode, kitWalk);
    const label = `${mode}${kitWalk ? ' (kit walk)' : ''}`;
    assert.equal(walk.mode, mode, label);
    assert.deepEqual([...walk.titles], expected.titles, label);
    assert.deepEqual(walk.steps.map((s) => s.title), expected.titles, label);
    assert.deepEqual(walk.steps.map((s) => s.sub), expected.subs, label);
    assert.deepEqual(walk.steps.map((s) => s.id), expected.ids, label);
    assert.equal(new Set(expected.ids).size, expected.ids.length, `${label}: an id twice`);
    // Every walk has a first working step after Start: the format read-back's way back.
    assert.ok(walk.steps.length >= 2, label);
  }
});

test('the indices the shell reads: Animation, and Finish (past the end on the video walk)', () => {
  for (const { mode, kitWalk, expected } of CASES) {
    const walk = walkOf(mode, kitWalk);
    assert.equal(walk.animStep, expected.animStep, mode);
    assert.equal(walk.finishStep, expected.finishStep, mode);
    // The kit walk is a template walk; only the template mode has one.
    assert.equal(walk.kit, mode === 'template' && kitWalk, mode);
  }
});

test('a step URL is its title slugged, and every one of them reads back to its step', () => {
  assert.equal(stepSlug('Template file'), 'template-file');
  assert.deepEqual([...walkOf('file', false).slugs], ['start', 'template-file', 'finish']);
  // The SVG walk's mapping step keeps the URL "fields", as the catalog walk's Fields does.
  assert.equal(walkOf('svg', false).slugs[stepIndex(walkOf('svg', false), 'map')], 'fields');
  for (const { mode, kitWalk, expected } of CASES) {
    const walk = walkOf(mode, kitWalk);
    expected.titles.forEach((title, i) => {
      assert.equal(walk.slugs[i], stepSlug(title));
      assert.equal(slugIndex(walk, stepSlug(title)), i, `${mode} ${title}`);
    });
    assert.equal(slugIndex(walk, 'no-such-step'), -1);
    assert.equal(slugIndex(walk, null), -1);
  }
});

test('the steps the shell jumps to by name sit where it used to jump by number', () => {
  // The deep link lands on the template walk's Fields; the AI step's dropped file on file mode's
  // Finish; the images walk's Continue on Template; Text's "back to Prepare" on Prepare.
  assert.equal(stepIndex(walkOf('template', false), 'fields'), 2);
  assert.equal(stepIndex(walkOf('file', false), 'finish'), 2);
  assert.equal(stepIndex(walkOf('import', false), 'template'), 2);
  assert.equal(stepIndex(walkOf('design', false), 'prepare'), 2);
  assert.equal(stepIndex(walkOf('video', false), 'finish'), -1);
});

// ── 2. The rules, against the expressions they replaced ─────────────────────────────────────
//
// Each `old*` below is the shell's expression on main `29883468f`, with its free variables made
// parameters. `animStep` and `finishStep` are the shell's own two lines from that revision.

const oldAnimStep = (mode) => (mode === 'import' ? 5 : mode === 'svg' ? 3 : 4);
const oldFinishStep = (mode) => (mode === 'ai' || mode === 'file' ? 2 : oldAnimStep(mode) + 1);

// `nextDisabled`.
function oldNextDisabled({ mode, step, buildMode, kitBrowseReady, variantId, category, images, importedFile }) {
  return mode === 'template'
    ? step === 1 && (buildMode === 'kit' ? !kitBrowseReady : !variantId)
    : mode === 'file'
    ? step === 1 && !importedFile
    : (step === 1 && (mode === 'import' ? images === 0 || !category : !category)) || (step === 2 && !variantId);
}

// `showPreview`, without the graphic, phone and shelf terms the shell still ANDs on.
function oldPreview({ mode, step, kit }) {
  const finishStep = oldFinishStep(mode);
  return mode === 'ai' ? step === 1 || step === finishStep
    : mode === 'video' ? false
    : mode === 'design' || mode === 'svg' ? step >= 1
    : mode === 'file' ? step >= 1
    : mode === 'template' ? (kit ? step >= 2 && step < finishStep : step >= 1)
    : step >= 2;
}

// The footer brand chooser's condition, without `brandChoices.length > 0` and `!onShelf`.
const BRAND_MODES = ['template', 'import', 'design', 'svg', 'ai'];
const oldBrand = ({ mode, step }) =>
  BRAND_MODES.includes(mode) && (mode === 'import' ? step >= 2 : mode === 'ai' ? step === 1 : step >= 1);

// `listsDesigns`.
const oldCatalog = ({ mode, step }) => (mode === 'template' && step >= 1) || (mode === 'import' && step >= 2);

// "Skip to finish": `importCanFinishEarly` and the button's condition.
function oldSkip({ mode, step, kit, buildMode }) {
  const importCanFinishEarly =
    (mode === 'design' || mode === 'svg' || mode === 'import') && (mode === 'import' ? step >= 2 : step >= 1);
  return ((mode === 'template' && step >= 1 && !kit && buildMode === 'one') || importCanFinishEarly) && step < oldFinishStep(mode);
}

// The rail entry's `disabled`.
function oldRailDisabled({ mode, step, target, onShelf, kit, variantId }) {
  return onShelf && target > step ? true
    : kit ? false
    : target > step ? !(mode === 'template' && !!variantId)
    : target > (mode === 'template' ? 1 : 2) && !variantId;
}

// `editSummaryStep`'s target.
function oldSummaryStep(mode, key) {
  const animStep = oldAnimStep(mode);
  if (mode === 'svg') return { design: 1, format: 1, fields: 2, look: 2, motion: animStep }[key];
  const browse = mode === 'import' ? 2 : 1;
  return { design: browse, format: browse, fields: browse + 1, look: browse + 2, motion: animStep }[key];
}

// `railPos` and `goToStep`'s ordinary target.
function oldRail(titles, step, delta) {
  const stepIndexes = titles.map((_, i) => i);
  const railPos = stepIndexes.indexOf(step);
  return { railPos, target: stepIndexes[railPos + delta] ?? step };
}

const BUILD_MODES = ['one', 'kit', 'community'];

/** Every state the rules read, for a walk: the kit walk exists in template mode when a kit is
 *  built or being picked, and a built kit can be carried into the other walks. */
function* states() {
  for (const mode of MODES) {
    for (const buildMode of BUILD_MODES) {
      for (const kit of [false, true]) {
        const kitWalk = kit || buildMode === 'kit';
        const walk = walkOf(mode, kitWalk);
        for (let step = 0; step < walk.steps.length; step++) yield { mode, buildMode, kit, walk, step };
      }
    }
  }
}

test('Next is enabled exactly where it was, on every walk that shows it', () => {
  let checked = 0;
  for (const { mode, buildMode, kit, walk, step } of states()) {
    // The general Next is not rendered on the AI and video walks (the AI step has its own).
    if (mode === 'ai' || mode === 'video') continue;
    for (const kitBrowseReady of [false, true])
      for (const variantId of [null, 'lt01'])
        for (const category of [null, 'lower-third'])
          for (const images of [0, 2])
            for (const importedFile of [null, {}]) {
              const was = oldNextDisabled({ mode, step, buildMode, kitBrowseReady, variantId, category, images, importedFile });
              const is = !canProceed(walk, step, {
                buildMode, kitBrowseReady, designPicked: !!variantId, category: !!category, images, file: !!importedFile,
              });
              assert.equal(is, was, JSON.stringify({ mode, step, buildMode, kit, kitBrowseReady, variantId, category, images, importedFile }));
              checked++;
            }
  }
  assert.ok(checked > 1000, `only ${checked} states checked`);
});

test('the preview, the brand chooser, the catalog and Skip to finish show where they did', () => {
  for (const { mode, buildMode, kit, walk, step } of states()) {
    const at = JSON.stringify({ mode, step, buildMode, kit });
    assert.equal(previewOn(walk, step, kit), oldPreview({ mode, step, kit }), `preview ${at}`);
    assert.equal(offersBrand(walk, step), oldBrand({ mode, step }), `brand ${at}`);
    assert.equal(needsCatalogOn(walk, step), oldCatalog({ mode, step }), `catalog ${at}`);
    assert.equal(offersSkip(walk, step, buildMode), oldSkip({ mode, step, kit, buildMode }), `skip ${at}`);
  }
});

test('the rail jumps exactly where it did', () => {
  for (const { mode, buildMode, kit, walk, step } of states()) {
    for (let target = 0; target < walk.steps.length; target++)
      for (const onShelf of [false, true])
        for (const variantId of [null, 'lt01']) {
          const was = oldRailDisabled({ mode, step, target, onShelf, kit, variantId });
          const is = !railJump(walk, step, target, { onShelf, kitBuilt: kit, designPicked: !!variantId });
          assert.equal(is, was, JSON.stringify({ mode, step, target, buildMode, kit, onShelf, variantId }));
        }
  }
});

test('Back, Next and the step counter move as they did, even from past a walk\'s end', () => {
  for (const { mode, kitWalk } of CASES) {
    const walk = walkOf(mode, kitWalk);
    for (let step = 0; step < walk.steps.length + 2; step++)
      for (const delta of [-1, 1]) {
        const was = oldRail([...walk.titles], step, delta);
        assert.equal(railIndex(walk, step), was.railPos, `${mode} ${step}`);
        assert.equal(stepAfter(walk, step, delta), was.target, `${mode} ${step} ${delta}`);
      }
  }
});

test('each Finish read-back row goes back to the step it went to', () => {
  // Only the catalog-shaped Finish (template, kit walk, import, design, svg) has the rows.
  for (const { mode, kitWalk } of CASES) {
    const walk = walkOf(mode, kitWalk);
    for (const key of ['design', 'format', 'fields', 'look', 'motion']) {
      if (mode === 'ai' || mode === 'file' || mode === 'video') {
        assert.equal(summaryStep(walk, key), null, `${mode} ${key}`);
        continue;
      }
      assert.equal(summaryStep(walk, key), oldSummaryStep(mode, key), `${mode} ${kitWalk} ${key}`);
    }
  }
});

test('the indices are the ones the shell computed, on every walk', () => {
  for (const { mode, kitWalk } of CASES) {
    const walk = walkOf(mode, kitWalk);
    assert.equal(walk.animStep, oldAnimStep(mode), mode);
    // The video walk has no Finish: the old number (5) and the new (2) are both past its last
    // step, so `step === finishStep` never holds and `step < finishStep` always does.
    if (mode === 'video') {
      assert.ok(walk.finishStep >= walk.steps.length && oldFinishStep(mode) >= walk.steps.length);
    } else {
      assert.equal(walk.finishStep, oldFinishStep(mode), mode);
    }
  }
});
