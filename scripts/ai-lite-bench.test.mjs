// guards: src/ai/lite/**
//
// Self-tests for the NoaCG Lite benchmark (run in the build gate):
//  - production-vs-benchmark pipeline EQUIVALENCE pins (one compile path, no drift)
//  - gold / floor / repair suite validity against the real server-side semantic validator
//  - suite integrity, versioning, manifest determinism, failure-taxonomy shape
//  - production-bundle exclusion (src never imports benchmark code)
// Zero model calls, zero network.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildApiRuntime, projectRoot } from './api-runtime-build.mjs';
import { CORE_SUITE, GOLD_SPECS, REPAIR_SUITE, SKIN_SPIKE_FIXTURE_IDS, SPIKE_FIXTURE_IDS, floorDecision, seededRandom, LITE_BENCH_SUITE_ID } from './ai-lite-bench/suites.mjs';
import { HOLDOUT_SUITE } from './ai-lite-bench/holdout.mjs';
import { CHALLENGE_SUITE } from './ai-lite-bench/challenge.mjs';
import { FAILURE_CODES, classifyFailure } from './ai-lite-bench/taxonomy.mjs';
import { buildRunManifest, pipelineIdentityMatches } from './ai-lite-bench/manifest.mjs';
import { nearestReference, pairwiseSummary, vectorDistance } from './ai-lite-bench/sameness.mjs';
import { LITE_LOWER_THIRD_FIXTURES } from './ai-lite-lower-third-fixtures.mjs';

const read = (relative) => readFileSync(path.join(projectRoot, relative), 'utf8');

const runtime = await buildApiRuntime(['api/_lib/aiLiteProfile.ts']);
const contract = await import(pathToFileURL(path.join(runtime.outputDir, 'src/ai/lite/contract.js')).href);
after(async () => { await runtime.cleanup(); });

const request = (prompt) => ({ prompt, resolution: { width: 1920, height: 1080 }, fps: 50 });

// ── Pipeline equivalence pins ────────────────────────────────────────────────

test('claudeProvider compiles grounded specs only through lite/pipeline', () => {
  const source = read('src/ai/claudeProvider.ts');
  assert.match(source, /from '\.\/lite\/pipeline'/);
  assert.match(source, /assembleGroundedTemplate\(/);
  assert.match(source, /normalizeLiteSpec\(/);
  // No second copy of the assembly sequence may exist in the provider.
  assert.doesNotMatch(source, /specToTemplate\(/);
  assert.doesNotMatch(source, /applyDesignAdjustments\(/);
});

test('the prompt version has ONE source: the profile literal, never a value in .env.example', () => {
  // `.env.example` used to ship `AI_LITE_PROMPT_VERSION=lite-lower-third-vN`, which made every
  // bump a two-file edit and made copying the example - the documented setup path - PIN a
  // deployment to whatever version was current that day. The next bump then moved the code and
  // left the label behind: new prompt text ledgered under an old version, with nobody having
  // made a mistake. A partial bump had already run v5 text under a v4 label once.
  //
  // Unset now resolves to the literal in aiLiteProfile.ts, so the version travels with the
  // prompt it names. The override survives only for holding a benchmark to an older prompt.
  const example = read('.env.example');
  const live = example
    .split(/\r?\n/)
    .filter((line) => /^\s*AI_LITE_PROMPT_VERSION\s*=\s*\S/.test(line));
  assert.deepEqual(
    live,
    [],
    'a concrete AI_LITE_PROMPT_VERSION in .env.example pins every deployment copied from it - '
      + 'keep the line commented out so unset means the code\'s own version',
  );
  assert.match(
    example,
    /#\s*AI_LITE_PROMPT_VERSION=/,
    'keep the commented-out line and its reasoning, so the variable stays discoverable',
  );
  // And the fallback the whole scheme rests on must still exist.
  assert.match(
    read('api/_lib/aiLiteProfile.ts'),
    /process\.env\.AI_LITE_PROMPT_VERSION \?\? '(lite-[a-z0-9-]+)'/,
    'the profile must carry a concrete default, or unset resolves to nothing',
  );
});

test('lite/pipeline holds the exact production assembly order', () => {
  const source = read('src/ai/lite/pipeline.ts');
  assert.match(source, /applySpecOutPreset\(\s*ensureSpecFonts\(applyDesignAdjustments\(/);
  assert.match(source, /withSafetyChecks\(/);
  assert.match(source, /demoteSpecFields\(/);
});

test('the app injects the shared production validator', () => {
  const source = read('src/components/wizard/steps/AiStep.tsx');
  assert.match(source, /productionSpxValidator\(/);
  assert.doesNotMatch(source, /withSafetyChecks\(/);
});

test('the benchmark runners compile through the shared pipeline, never inline', () => {
  for (const file of ['scripts/ai-lite-eval.mjs', 'scripts/ai-lite-bench/compileRunner.mjs']) {
    const source = read(file);
    assert.match(source, /compileLiteDecision/, `${file} must use lite/pipeline`);
    assert.doesNotMatch(source, /specToTemplate\(/, `${file} must not re-inline the assembly`);
  }
});

test('the blind gallery serves only neutral review asset filenames', () => {
  const source = read('scripts/ai-lite-gallery.mjs');
  assert.match(source, /review-assets/);
  assert.match(source, /copyFile\(path\.join\(OUT, screenshot\)/);
  assert.match(source, /copyFile\(path\.join\(OUT, motion\)/);
  assert.match(source, /screenshot: `review-assets\/\$\{screenshotName\}`/);
  assert.match(source, /motion: motionUrl/);
});

test('every contract symbol the browser-side runners reference exists', () => {
  // The runners import the contract inside page.evaluate, where a renamed export only
  // fails at run time with a dev server up - this pin moves that break into the build
  // gate (LITE_DECISION_OUTPUT -> LITE_READY_OUTPUT broke the compile arms this way).
  const referenced = new Set();
  for (const file of ['scripts/ai-lite-bench/compileRunner.mjs', 'scripts/ai-lite-calibrate.mjs', 'scripts/ai-lite-regress.mjs']) {
    // The lookbehind excludes a PATH ending in the module's own name - a comment naming
    // `src/ai/lite/contract.ts` used to be read as a reference to an export called `ts`.
    for (const match of read(file).matchAll(/(?<![\w/])contract\.([A-Za-z_$][\w$]*)/g)) {
      referenced.add(match[1]);
    }
  }
  for (const name of ['liteSystemPrompt', 'liteCatalogDigest', 'LITE_READY_OUTPUT', 'LITE_CATALOG']) referenced.add(name);
  for (const name of referenced) {
    assert.ok(name in contract, `lite/contract no longer exports "${name}" (referenced by a runner)`);
  }
});

test('mark shapes: the aspect cuts, and no shape servable by only one chassis', async () => {
  const types = await import(pathToFileURL(path.join(runtime.outputDir, 'src/ai/lite/types.js')).href);
  // The boundaries, at and either side of each cut - a mark's shape decides which slots can
  // hold it, so an off-by-one here silently routes a wordmark into a crest well.
  assert.equal(types.markShapeFromAspect(180 / 260), 'portrait');
  assert.equal(types.markShapeFromAspect(0.84), 'portrait');
  assert.equal(types.markShapeFromAspect(0.85), 'square');
  assert.equal(types.markShapeFromAspect(1), 'square');
  assert.equal(types.markShapeFromAspect(1.4), 'square');
  assert.equal(types.markShapeFromAspect(1.41), 'wordmark');
  assert.equal(types.markShapeFromAspect(4), 'wordmark');
  assert.equal(types.markShapeFromAspect(4.5), 'wordmark');
  assert.equal(types.markShapeFromAspect(4.51), 'rail');
  assert.equal(types.markShapeFromAspect(10), 'rail');
  // A degenerate reading is not a refusal: a probe that could not size the image must not turn
  // into a shape nothing serves.
  for (const bad of [0, -1, NaN, Infinity]) assert.equal(types.markShapeFromAspect(bad), 'square');

  // The same structural rule the intent kinds are under (api/_lib/aiLite.test.ts): a mark shape
  // with a single home is a brief that can only be answered by one design, whatever that design
  // looks like - and this profile has already shipped that failure twice.
  const homes = new Map();
  for (const entry of contract.LITE_CATALOG) {
    for (const shape of entry.logoSlot?.fits ?? []) homes.set(shape, (homes.get(shape) ?? 0) + 1);
  }
  for (const shape of ['portrait', 'square', 'wordmark', 'rail']) {
    assert.ok((homes.get(shape) ?? 0) >= 2, `mark shape "${shape}" is servable by ${homes.get(shape) ?? 0} chassis`);
  }
});

test('the catalog digest states each chassis logo slot in shapes and surface', () => {
  const digest = contract.liteCatalogDigest();
  for (const entry of contract.LITE_CATALOG) {
    if (!entry.logoSlot) continue;
    // Measured metadata that never reaches the prompt is a dead knob, and this one exists
    // precisely so the model can avoid a slot that would crush the user's mark.
    assert.ok(
      digest.includes(`logo:holds ${entry.logoSlot.fits.join(',')} marks, surface:${entry.logoSlot.surface}`),
      `${entry.variantId}'s logo slot is not in the digest`,
    );
  }
});

test('production src never imports benchmark code (bundle exclusion)', () => {
  const walk = (dir) => readdirSync(path.join(projectRoot, dir), { withFileTypes: true })
    .flatMap((entry) => {
      const rel = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(rel);
      return /\.(ts|tsx)$/.test(entry.name) ? [rel] : [];
    });
  for (const file of walk('src')) {
    assert.doesNotMatch(
      readFileSync(path.join(projectRoot, file), 'utf8'),
      /from ['"][^'"]*scripts\//,
      `${file} imports from scripts/ - benchmark code must never enter the bundle`,
    );
  }
});

// ── The skin contract (server-flagged; default behavior must stay byte-stable) ─

test('the default contract carries no skin; the skin contract adds it optionally', () => {
  const base = contract.LITE_READY_OUTPUT.schema;
  assert.equal(base.properties.skin, undefined);
  assert.deepEqual(base.required, ['status', 'aiCategory', 'spec']);
  const skinful = contract.LITE_READY_OUTPUT_SKIN.schema;
  assert.ok(skinful.properties.skin, 'skin contract must offer the skin property');
  assert.deepEqual(skinful.required, ['status', 'aiCategory', 'spec'], 'skin stays OPTIONAL');
  assert.equal(contract.LITE_READY_OUTPUT_SKIN.name, contract.LITE_READY_OUTPUT.name);
});

test('the system prompt teaches the skin only when the profile enables it', () => {
  assert.doesNotMatch(contract.liteSystemPrompt('v'), /Skin Canvas/);
  assert.match(contract.liteSystemPrompt('v', [], { skin: true }), /Skin Canvas/);
});

test('the judge tolerates the scene-scale motifs the frozen briefs actually ask for', () => {
  // The skin briefs name things no lower third can hold. Scored as a checklist, briefFit
  // demanded them: 7 of 12 neon rows were marked down for a missing "eighties horizon" and
  // all 12 landed at 1-3, while the generation prompt was ordering the model to stay a
  // strap (docs/AI_LITE_BENCHMARK.md §6e). The briefs are drift-pinned fixtures, so the
  // JUDGE is the side that has to give - this pins both halves so neither drifts alone.
  const briefs = read('scripts/ai-lite-lower-third-fixtures.mjs');
  assert.match(briefs, /eighties horizon/, 'the neon brief still names a scene element');
  assert.match(briefs, /vast negative space/, 'the luxury brief names one too');
  const judge = contract.liteJudgeSystemPrompt('v');
  assert.match(judge, /STRAP SCALE/);
  assert.match(judge, /never mark a graphic down for lacking a scene element/);
});

const GOLD_SKIN = {
  summary: 'A brutalist concrete slab with stencil type.',
  css: '.lower-third-box { background: var(--panel-bg); border: calc(3px * var(--scale)) solid var(--accent); }',
};

test('liteSkinPatchErrors: a legal patch passes, every forbidden construct is named', () => {
  assert.deepEqual(contract.liteSkinPatchErrors(GOLD_SKIN), []);
  const errorsFor = (patch) => contract.liteSkinPatchErrors({ ...GOLD_SKIN, ...patch });
  assert.ok(errorsFor({ css: ':root { --accent: red; }' }).includes('skin_css_forbidden'));
  assert.ok(errorsFor({ css: '@font-face { font-family: x; }' }).includes('skin_css_forbidden'));
  assert.ok(errorsFor({ css: '@import "x.css";' }).includes('skin_css_forbidden'));
  assert.ok(errorsFor({ css: '.a { background: url(https://cdn.example/x.png); }' })
    .includes('skin_css_external_reference'));
  assert.ok(errorsFor({ css: '<style>.a{}</style>' }).includes('skin_css_forbidden'));
  assert.ok(errorsFor({ css: `.a { /* ${'x'.repeat(7000)} */ }` }).includes('skin_css_too_long'));
  assert.ok(errorsFor({ css: '' }).includes('skin_css_missing'));
  assert.ok(errorsFor({ summary: '' }).includes('skin_summary_invalid'));
  assert.ok(errorsFor({ html: '<script>alert(1)</script>' }).includes('skin_html_script'));
  assert.ok(errorsFor({ html: '<img src="https://cdn.example/x.png">' })
    .includes('skin_html_external_reference'));
  // clip-path clips PAINT while every deterministic check we own measures LAYOUT, so a
  // sliced letter passes the bench silently (docs/AI_LITE_BENCHMARK.md §6d).
  assert.ok(errorsFor({ css: '.lower-third-box { clip-path: polygon(0 0, 100% 0, 96% 100%, 0 100%); }' })
    .includes('skin_css_clip_path'));
  assert.ok(errorsFor({ css: '.lower-third-box { -webkit-clip-path: inset(0 4% 0 0); }' })
    .includes('skin_css_clip_path'));
  assert.ok(errorsFor({ html: '<div style="clip-path:inset(0 10% 0 0)"></div>' })
    .includes('skin_html_clip_path'));
  // The check must not swallow background-clip, which is how gradient text is done.
  assert.deepEqual(
    errorsFor({ css: '.lower-third-name { -webkit-background-clip: text; background-clip: text; }' }),
    [],
  );
  assert.deepEqual(contract.liteSkinPatchErrors('nope'), ['skin_shape_invalid']);
});

test('validateLiteDecision strips a skin by default and validates it when enabled', () => {
  const gold = GOLD_SPECS[0];
  const brief = CORE_SUITE.find((b) => b.id === gold.briefId);
  const withSkin = { ...gold.decision, skin: GOLD_SKIN };
  // Default (skin disabled): the decision is valid and the skin never reaches the browser.
  const stripped = contract.validateLiteDecision(withSkin, request(brief.brief));
  assert.deepEqual(stripped.errors, []);
  assert.equal(stripped.decision.skin, undefined);
  // Enabled: the same decision carries the normalized skin through.
  const carried = contract.validateLiteDecision(withSkin, request(brief.brief), 8, { skin: true });
  assert.deepEqual(carried.errors, []);
  assert.deepEqual(carried.decision.skin, GOLD_SKIN);
  // Enabled with an illegal skin: a semantic failure that earns the repair round.
  const illegal = contract.validateLiteDecision(
    { ...gold.decision, skin: { ...GOLD_SKIN, css: ':root { color: red; }' } },
    request(brief.brief),
    8,
    { skin: true },
  );
  assert.ok(illegal.errors.includes('skin_css_forbidden'));
  assert.equal(illegal.decision, undefined);
});

// ── Suite integrity ──────────────────────────────────────────────────────────

test('core suite: 8 briefs, unique ids, fixture texts in step with the fixture bank', () => {
  assert.equal(CORE_SUITE.length, 8);
  assert.equal(new Set(CORE_SUITE.map((b) => b.id)).size, 8);
  const fixtures = new Map(LITE_LOWER_THIRD_FIXTURES);
  for (const brief of CORE_SUITE.filter((b) => b.fixtureId)) {
    assert.equal(brief.brief, fixtures.get(brief.fixtureId), `${brief.id} drifted from fixture ${brief.fixtureId}`);
  }
  for (const brief of CORE_SUITE) {
    assert.ok(['ready', 'unsupported'].includes(brief.expect.decision), brief.id);
    if (brief.expect.decision === 'ready') assert.ok(brief.fields?.primary, `${brief.id} needs labelled fields`);
  }
});

test('hidden holdout stays disjoint from the core suite', () => {
  const coreIds = new Set(CORE_SUITE.map((b) => b.id));
  const coreBriefs = new Set(CORE_SUITE.map((b) => b.brief));
  for (const brief of HOLDOUT_SUITE) {
    assert.ok(!coreIds.has(brief.id));
    assert.ok(!coreBriefs.has(brief.brief));
  }
});

test('semantic categories reach inference while explicit unsupported categories refuse', () => {
  // Category words are evidence for model inference, not brittle zero-cost refusals. Ambiguous
  // reads return choices after inference; destructive and non-graphic requests still screen.
  for (const brief of CORE_SUITE.filter((b) => b.expect.unsupportedCode === 'unsupported-category')) {
    assert.equal(contract.deterministicUnsupportedDecision(request(brief.brief)), null, brief.id);
  }
  // A requested off-catalog category refuses deterministically even with a neutral prompt.
  const categoryScreened = contract.deterministicUnsupportedDecision({
    ...request('A clean graphic for tonight.'),
    generationSpec: { version: 1, category: 'scoreboard', fields: [] },
  });
  assert.equal(categoryScreened?.code, 'unsupported-category');
});

// ── Gold, floor, repair against the real semantic validator ──────────────────

test('every gold spec passes the server semantic validation for its brief', () => {
  for (const gold of GOLD_SPECS) {
    const brief = CORE_SUITE.find((b) => b.id === gold.briefId);
    assert.ok(brief, gold.briefId);
    const result = contract.validateLiteDecision(gold.decision, request(brief.brief));
    assert.deepEqual(result.errors, [], `${gold.briefId}: ${result.errors.join(', ')}`);
    assert.equal(result.decision?.status, 'ready');
  }
});

test('the floor is deterministic and semantically valid for every ready core brief', () => {
  for (const brief of CORE_SUITE.filter((b) => b.expect.decision === 'ready')) {
    const a = floorDecision(brief, contract.LITE_CATALOG, 42);
    const b = floorDecision(brief, contract.LITE_CATALOG, 42);
    assert.deepEqual(a, b, `${brief.id} floor must be seed-deterministic`);
    const result = contract.validateLiteDecision(a, request(brief.brief));
    assert.deepEqual(result.errors, [], `${brief.id} floor: ${result.errors.join(', ')}`);
  }
});

test('the repair suite expectations match validateLiteDecision exactly', () => {
  for (const item of REPAIR_SUITE) {
    const result = contract.validateLiteDecision(item.decision, item.request);
    assert.deepEqual([...result.errors].sort(), [...item.expectErrors].sort(), item.id);
  }
});

test('every rule the repair suite can trigger carries an actionable instruction', () => {
  // The repair round is only worth its call if the model is told what to CHANGE - handed
  // bare codes it re-emits the same decision (measured). This pins coverage against REAL
  // failing decisions, so a new rule code cannot ship without guidance behind it.
  const codes = new Set(REPAIR_SUITE.flatMap((item) =>
    contract.validateLiteDecision(item.decision, item.request).errors));
  assert.ok(codes.size > 0, 'the repair suite must still produce failures to cover');
  for (const code of codes) {
    const [instruction] = contract.liteRepairInstructions([code]);
    assert.ok(instruction, `${code} has an instruction`);
    // The generic fallback echoes the code; a real instruction never does.
    assert.doesNotMatch(
      instruction,
      new RegExp(code.split(':')[0]),
      `${code} still falls back to echoing itself - add guidance to REPAIR_GUIDANCE`,
    );
  }
});

test('spike selections: 6 briefs each, all from the frozen fixture bank, disjoint', () => {
  const bank = new Set(LITE_LOWER_THIRD_FIXTURES.map(([id]) => id));
  for (const suite of [SPIKE_FIXTURE_IDS, SKIN_SPIKE_FIXTURE_IDS]) {
    assert.equal(suite.length, 6);
    assert.equal(new Set(suite).size, 6);
    for (const id of suite) assert.ok(bank.has(id), `${id} missing from the fixture bank`);
  }
  // The skin suite is the styles no house chassis carries - it shares no brief with core.
  for (const id of SKIN_SPIKE_FIXTURE_IDS) {
    assert.ok(id.startsWith('skin-'), `${id} must be a skin-* brief`);
    assert.ok(!SPIKE_FIXTURE_IDS.includes(id));
  }
});

test('challenge suite: unique ids, disjoint from core and holdout, valid floors', () => {
  const ids = CHALLENGE_SUITE.map((b) => b.id);
  assert.equal(new Set(ids).size, ids.length);
  const taken = new Set([...CORE_SUITE, ...HOLDOUT_SUITE].map((b) => b.id));
  for (const id of ids) assert.ok(!taken.has(id));
  for (const brief of CHALLENGE_SUITE.filter((b) => b.expect.decision === 'ready')) {
    const floor = floorDecision(brief, contract.LITE_CATALOG, 7);
    assert.deepEqual(floor, floorDecision(brief, contract.LITE_CATALOG, 7), brief.id);
    const result = contract.validateLiteDecision(floor, request(brief.brief));
    assert.deepEqual(result.errors, [], `${brief.id}: ${result.errors.join(', ')}`);
  }
});

// ── Taxonomy and manifest ────────────────────────────────────────────────────

test('failure taxonomy codes are unique and classification is stage-ordered', () => {
  assert.equal(new Set(FAILURE_CODES).size, FAILURE_CODES.length);
  assert.equal(classifyFailure({ providerErrorCode: 'rate_limited' }), 'RATE_LIMITED');
  assert.equal(classifyFailure({ truncated: true }), 'OUTPUT_TRUNCATED');
  assert.equal(
    classifyFailure({ expect: { decision: 'unsupported' }, decision: { status: 'ready' } }),
    'UNSUPPORTED_FORCED',
  );
  assert.equal(
    classifyFailure({ expect: { decision: 'ready' }, decision: { status: 'unsupported' } }),
    'CATEGORY_WRONG',
  );
  assert.equal(classifyFailure({ semanticErrors: ['variant_not_allowed'] }), 'VARIANT_INVALID');
  assert.equal(classifyFailure({ validationRuleCodes: ['bench-overlap'] }), 'REFLOW_FAILED');
  assert.equal(classifyFailure({ decision: { status: 'ready' }, expect: { decision: 'ready' } }), null);
  for (const row of [
    { providerErrorCode: 'rate_limited' },
    { truncated: true },
    { semanticErrors: ['anything'] },
    { validationRuleCodes: ['bench-overlap'] },
  ]) {
    assert.ok(FAILURE_CODES.includes(classifyFailure(row)));
  }
});

test('run manifests are deterministic and compare pipeline identity', () => {
  const a = buildRunManifest({ mode: 'regression' });
  const b = buildRunManifest({ mode: 'model-comparison' });
  assert.deepEqual(a.hashes, b.hashes);
  assert.equal(a.suiteId, LITE_BENCH_SUITE_ID);
  assert.ok(pipelineIdentityMatches(a, b));
  assert.ok(!pipelineIdentityMatches(a, { ...b, hashes: { ...b.hashes, catalog: 'drifted' } }));
});

test('sameness math: distances, the min-pair tripwire, and nearest reference', () => {
  assert.equal(vectorDistance([0, 0.5, 1], [0, 0.5, 1]), 0);
  assert.equal(vectorDistance([0, 0], [1, 1]), 1);
  assert.throws(() => vectorDistance([1], [1, 2]));
  const items = [
    { id: 'a', vector: [0, 0] },
    { id: 'b', vector: [0.1, 0.1] },   // nearest to a - the tripwire pair
    { id: 'c', vector: [1, 1] },
  ];
  const summary = pairwiseSummary(items);
  assert.equal(summary.pairs, 3);
  assert.deepEqual(summary.minPair, ['a', 'b']);
  assert.ok(Math.abs(summary.min - 0.1) < 1e-9);
  assert.equal(pairwiseSummary(items.slice(0, 1)), null); // one item: no fake zero
  const nearest = nearestReference([0.2, 0.2], [
    { id: 'house-far', vector: [1, 1] },
    { id: 'house-near', vector: [0.25, 0.25] },
  ]);
  assert.equal(nearest.id, 'house-near');
  assert.ok(Math.abs(nearest.distance - 0.05) < 1e-9);
});

test('seeded PRNG is stable across runs', () => {
  const r = seededRandom(7);
  assert.deepEqual([r(), r(), r()], (() => { const s = seededRandom(7); return [s(), s(), s()]; })());
});
