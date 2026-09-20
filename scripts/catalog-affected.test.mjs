// The affected-slice CLASSIFIER, pinned - for the same reason scripts/e2e-affected.test.mjs
// exists. Its worst failure is naming too FEW designs, and that failure is silent by
// construction: the sweeps go green over a slice that never contained the design somebody broke.
//
// So the cases here are realistic changes with an expected verdict for each, and every one of
// them checks the direction the classifier is allowed to be wrong in - toward measuring MORE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { batteryFor, declaringFiles, importerGraph, planFor, quickVerdict } from './catalog-affected.mjs';

/** A small stand-in catalog: two lower thirds in their own files, two frames sharing one. */
const SOURCES = [
  { file: 'src/templates/lowerThirds/lt01.ts', text: "export const lt01 = defineVariant({ id: 'lt01', name: 'Hairline' });" },
  { file: 'src/templates/lowerThirds/lt02.ts', text: "export const lt02 = defineVariant({ id: 'lt02', name: 'Slab' });" },
  { file: 'src/templates/lowerThirds/shared.ts', text: 'export function defineVariant(spec) { return spec; }' },
  { file: 'src/templates/lowerThirds/index.ts', text: "import { lt01 } from './lt01';\nexport const LOWER_THIRDS = [lt01, lt02];" },
  {
    file: 'src/templates/frames/structuralLayouts.ts',
    text: "const rows = [{ id: 'fr05' }, { id: 'fr06' }];",
  },
  // THE REAL SHAPE THAT BROKE THE FIRST VERSION OF THIS: tickers/tk07.ts imports houseWire from
  // tk05.ts and calls it as its entire create body, so editing tk05 changes what tk07 emits.
  {
    file: 'src/templates/tickers/tk05.ts',
    text: "export const tk05 = v({ id: 'tk05' });\nexport function houseWire() {}",
  },
  {
    file: 'src/templates/tickers/tk07.ts',
    text: "import { houseWire } from './tk05';\nexport const tk07 = v({ id: 'tk07', body: houseWire });",
  },
  {
    file: 'src/templates/tickers/index.ts',
    text: "import { tk05 } from './tk05';\nimport { tk07 } from './tk07';\nexport const TICKERS = [tk05, tk07];",
  },
  // …and an aggregator that declares nothing, which the walk must pass THROUGH rather than
  // stopping at: stopping there escalated almost every design file in the catalog.
  {
    file: 'src/templates/types/registry.ts',
    text: "import { TICKERS } from '../tickers/index';\nexport const merged = TICKERS;",
  },
];

const CATALOG_IDS = new Set(['lt01', 'lt02', 'fr05', 'fr06', 'tk05', 'tk07']);
const declaring = declaringFiles(SOURCES);
const importers = importerGraph(SOURCES);

/** Stands in for e2e-affected's per-file catalog verdict without needing a git repo. */
const triggersCatalog = (file) =>
  /^src\/(templates|blocks|assets)\//.test(file) ||
  /^src\/model\/(fonts|themeTokens)\.ts$/.test(file) ||
  /^src\/(model|store|preview|validation|styles)\//.test(file);

const plan = (changed) => planFor(changed, { declaring, catalogIds: CATALOG_IDS, importers, triggersCatalog });

test('the declaration map reads each design off its own file', () => {
  assert.deepEqual(declaring.get('lt01'), ['src/templates/lowerThirds/lt01.ts']);
  assert.deepEqual(declaring.get('fr05'), ['src/templates/frames/structuralLayouts.ts']);
  assert.equal(declaring.get('lt02').length, 1, 'index.ts imports lt02 but does not declare it');
});

test('one design file -> that design only', () => {
  const p = plan(['src/templates/lowerThirds/lt01.ts']);
  assert.equal(p.mode, 'slice');
  assert.deepEqual(p.ids, ['lt01']);
});

test('two design files -> both designs', () => {
  const p = plan(['src/templates/lowerThirds/lt01.ts', 'src/templates/lowerThirds/lt02.ts']);
  assert.deepEqual(p.ids, ['lt01', 'lt02']);
});

test('a multi-design file -> every design it declares, and nothing else', () => {
  const p = plan(['src/templates/frames/structuralLayouts.ts']);
  assert.deepEqual(p.ids, ['fr05', 'fr06']);
});

test("a category's shared machinery escalates to the whole catalog", () => {
  const p = plan(['src/templates/lowerThirds/shared.ts']);
  assert.equal(p.mode, 'full');
  assert.deepEqual(p.escalatedBy, ['src/templates/lowerThirds/shared.ts']);
});

test('a file that declares no design escalates, even inside a category', () => {
  assert.equal(plan(['src/templates/lowerThirds/index.ts']).mode, 'full');
});

test('shared machinery OUTSIDE src/templates escalates', () => {
  for (const file of [
    'src/blocks/presetRegistry.ts',
    'src/model/fonts.ts',
    'src/model/themeTokens.ts',
    'src/assets/gsap.min.js',
    'src/preview/composeDocument.ts',
    'src/styles/index.css',
  ]) {
    assert.equal(plan([file]).mode, 'full', `${file} must escalate`);
  }
});

test('ONE shared file poisons a slice that would otherwise be narrow', () => {
  // The direction that matters: a change carrying both a design edit and a machinery edit runs
  // the whole catalog, never the design half of it.
  const p = plan(['src/templates/lowerThirds/lt01.ts', 'src/blocks/presetRegistry.ts']);
  assert.equal(p.mode, 'full');
  assert.deepEqual(p.ids, []);
});

test('the gates themselves escalate - editing the rule must execute it over everything', () => {
  for (const file of [
    'scripts/type-floor.mjs',
    'scripts/overflow-sweep.mjs',
    'scripts/field-coverage.mjs',
    'scripts/numerals.mjs',
    'scripts/l3-sweep.mjs',
    'scripts/catalog-affected.mjs',
    'scripts/catalog-emit.mjs',
    'scripts/catalog-scope.mjs',
    'scripts/catalog-specs.mjs',
    'scripts/check-catalog-emit.mjs',
    'e2e/_catalogScope.ts',
    'scripts/overflow-baseline.json',
    'e2e/catalog-baseline.json',
    'e2e/catalog-render-baseline.json',
    'e2e/catalog-baseline.spec.ts',
    'e2e/catalog/catalog-bench.spec.ts',
    'playwright.catalog.config.ts',
  ]) {
    assert.equal(plan([file]).mode, 'full', `${file} must escalate`);
  }
});

test('a design another design imports from carries that design into the slice', () => {
  // The one that matters. Attributing tk05.ts to ['tk05'] alone would measure one design and pass
  // while tk07 - whose whole body comes out of tk05 - went unmeasured.
  assert.deepEqual(plan(['src/templates/tickers/tk05.ts']).ids, ['tk05', 'tk07']);
  // …and not the other way round: tk07 imports tk05, not the reverse.
  assert.deepEqual(plan(['src/templates/tickers/tk07.ts']).ids, ['tk07']);
});

test('the walk passes through aggregators that declare nothing', () => {
  // tk05 -> tickers/index.ts -> types/registry.ts. Neither declares a design, and stopping at
  // either would escalate a one-design edit to the whole catalog.
  assert.equal(plan(['src/templates/tickers/tk05.ts']).mode, 'slice');
});

test('the quick verdict answers none and full with no catalog and no browser', () => {
  // The two answers that do not depend on the id list or the import graph are decided before
  // either is built - most changes touch no template at all, and paying a Rolldown bundle plus a
  // Chromium launch to be told "nothing to scope" would be this tool doing what it exists to stop.
  assert.deepEqual(quickVerdict(['docs/VERIFICATION.md'], triggersCatalog), { mode: 'none', escalatedBy: [] });
  assert.equal(quickVerdict(['src/blocks/presetRegistry.ts'], triggersCatalog).mode, 'full');
  assert.equal(quickVerdict(['scripts/catalog-scope.mjs'], triggersCatalog).mode, 'full');
  // …and a change it CANNOT answer that way hands over to the full classifier.
  assert.equal(quickVerdict(['src/templates/lowerThirds/lt01.ts'], triggersCatalog), null);
});

test('a change that cannot move a catalog measurement runs nothing', () => {
  const p = plan(['docs/VERIFICATION.md', 'src/components/AppShell.tsx', 'api/render/start.ts']);
  assert.equal(p.mode, 'none');
  assert.deepEqual(p.ids, []);
});

test('an unknown id declared in a template file is ignored, and the file escalates', () => {
  // A design declared in the source but absent from the built catalog means the two disagree.
  // Attributing the file to nothing and escalating is the safe reading of that.
  const p = planFor(['src/templates/lowerThirds/lt01.ts'], {
    declaring,
    catalogIds: new Set(['lt02']),
    triggersCatalog,
  });
  assert.equal(p.mode, 'full');
});

test('the battery names every gate CI runs on a catalog change, the factory included', () => {
  // The battery is what a session runs BEFORE queueing, so a gate CI runs and this list omits
  // is a refusal waiting at the merge. The factory was that gate until 2026-09-19.
  const scoped = batteryFor(['qz13', 'sb26'], ['quiz', 'scoreboard']);
  const all = [...scoped.cheap, ...scoped.sweeps, ...scoped.specs, ...scoped.factory];
  for (const script of ['check-catalog-emit', 'type-floor', 'overflow-sweep', 'field-coverage', 'numerals', 'catalog-specs', 'factory']) {
    assert.ok(all.some((command) => command.includes(`scripts/${script}.mjs`)), `${script} is missing from the battery`);
  }
  // The factory judges the catalog as a whole and takes no slice; everything else is scoped.
  assert.deepEqual(scoped.factory, ['node scripts/factory.mjs']);
  assert.ok(scoped.sweeps.every((command) => command.endsWith('--only qz13,sb26')));
});
