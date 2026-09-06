// gate: factory
// guards: api/_lib/aiLiteProfile.ts, src/ai/lite/**

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildApiRuntime } from './api-runtime-build.mjs';
import { LITE_SEMANTIC_FIXTURES } from './ai-lite-semantic-fixtures.mjs';
import { readFileSync } from 'node:fs';

const runtime = await buildApiRuntime(['api/_lib/aiLiteProfile.ts']);
const contract = await import(pathToFileURL(path.join(runtime.outputDir, 'src/ai/lite/contract.js')).href);
after(async () => { await runtime.cleanup(); });

test('one registry owns the complete lower-third contract', () => {
  assert.equal(contract.CATEGORY_CONTRACTS.length, 1);
  const lowerThird = contract.categoryContract('lower-third');
  assert.deepEqual(lowerThird.visibleFields, { min: 1, max: 4 });
  assert.deepEqual(lowerThird.operatorEvents, ['play', 'update', 'next', 'stop']);
  assert.equal(lowerThird.stateMachine.owner, 'graphic-type');
  assert.equal(lowerThird.compatibleReferenceChassis.length, contract.LITE_CATALOG.length);
});

test('locked semantic briefs retrieve a relevant, small, diverse reference set', () => {
  for (const fixture of LITE_SEMANTIC_FIXTURES) {
    const result = contract.retrieveLiteReferenceSet(fixture.request);
    assert.ok(result.entries.length >= 3 && result.entries.length <= contract.LITE_REFERENCE_LIMIT, fixture.id);
    assert.ok(fixture.expectedReferences.includes(result.entries[0].variantId), `${fixture.id}: ${result.entries[0].variantId}`);
    assert.ok(new Set(result.entries.map((entry) => entry.style)).size >= 2, `${fixture.id}: references collapsed`);
  }
});

test('a mark narrows retrieval to slot-carrying chassis, and only a mark does', () => {
  // Self-guarding: the narrowing below is only provable against a brief that openly reaches a
  // chassis the mark would have to REMOVE. If no fixture does, the loop's assertions would be
  // vacuously green while the filter did nothing (the verify-guards rule), so that state fails
  // the test instead.
  //
  // What "would have to remove" means moved on 2026-08-13, and the guard caught its own drift:
  // every one of the thirteen chassis now carries a measured slot (AI_LITE_BRAND_PLAN §3.6.2),
  // so `!entry.logo` matched nothing and this test failed rather than passing on an empty set.
  // The live discriminator is SHAPE - lt41 and lt49 hold a crest and letterbox a wordmark.
  const refusesShape = (entry) => !entry.logo || !entry.logoSlot?.fits.includes('wordmark');
  const openReach = LITE_SEMANTIC_FIXTURES
    .map((fixture) => ({ fixture, open: contract.retrieveLiteReferenceSet(fixture.request) }))
    .find(({ open }) => open.entries.some(refusesShape));
  assert.ok(openReach, 'no markless fixture reaches a chassis the mark filter would drop - this guard has gone vacuous');
  assert.doesNotMatch(openReach.open.reason, /mark-capable/);

  const marked = structuredClone(openReach.fixture.request);
  marked.hasLogo = true;
  marked.mark = { shape: 'wordmark', backing: 'transparent', ink: 'light' };
  const narrowed = contract.retrieveLiteReferenceSet(marked);
  assert.ok(narrowed.entries.length >= 2, 'a marked request must still see a real choice of chassis');
  for (const entry of narrowed.entries) {
    assert.ok(entry.logo && entry.logoSlot, `${entry.variantId} shown to a marked request without a slot`);
    assert.ok(entry.logoSlot.fits.includes('wordmark'), `${entry.variantId} cannot hold the mark shape`);
  }
  assert.match(narrowed.reason, /mark-capable only \(wordmark\)/);

  // An older client says only hasLogo - the slot's existence still filters, shape does not.
  // Asserted from BOTH sides, because "every entry carries a slot" became trivially true once
  // the whole catalog did: the load-bearing half is that a chassis the SHAPE filter removed is
  // still served here, which is only checkable while the same fixture reaches one.
  const legacy = structuredClone(openReach.fixture.request);
  legacy.hasLogo = true;
  const legacyNarrowed = contract.retrieveLiteReferenceSet(legacy);
  for (const entry of legacyNarrowed.entries) {
    assert.ok(entry.logo, `${entry.variantId} shown to a hasLogo request without a slot`);
  }
  assert.ok(
    legacyNarrowed.entries.some(refusesShape),
    'a shapeless hasLogo request must not be narrowed by shape',
  );
});

test('locked decisions satisfy category, slots, capacity, and structured style semantics', () => {
  for (const fixture of LITE_SEMANTIC_FIXTURES) {
    const result = contract.validateLiteDecision(fixture.decision, fixture.request);
    assert.deepEqual(result.errors, [], `${fixture.id}: ${result.errors.join(', ')}`);
    assert.equal(result.decision?.status, 'ready', fixture.id);
  }
});

test('manual category wins and ambiguous auto inference returns choices', () => {
  const fixture = structuredClone(LITE_SEMANTIC_FIXTURES[2]);
  fixture.decision.spec.categoryInference.category = 'title';
  assert.ok(contract.validateLiteDecision(fixture.decision, fixture.request).errors.includes('manual_category_ignored'));

  const ambiguous = structuredClone(LITE_SEMANTIC_FIXTURES[0]);
  ambiguous.decision.spec.categoryInference.confidence = 0.61;
  ambiguous.decision.spec.categoryInference.alternatives = [
    { category: 'title', confidence: 0.56, reason: 'The wording may describe an opening title.' },
  ];
  const result = contract.validateLiteDecision(ambiguous.decision, ambiguous.request);
  assert.equal(result.decision?.status, 'unsupported');
  assert.equal(result.decision?.code, 'category-ambiguous');
  assert.equal(result.decision?.categoryChoices?.length, 2);
});

test('a confident category may honestly have no alternative', () => {
  const confident = structuredClone(LITE_SEMANTIC_FIXTURES[0]);
  confident.decision.spec.categoryInference.alternatives = [];
  const result = contract.validateLiteDecision(confident.decision, confident.request);
  assert.deepEqual(result.errors, []);
  assert.equal(result.decision?.status, 'ready');
});

test('requested editable fields stay separate and unrequested palettes cannot override the chassis', () => {
  const merged = structuredClone(LITE_SEMANTIC_FIXTURES.find((fixture) => fixture.id === 'esports'));
  merged.decision.spec.lines.pop();
  assert.ok(contract.validateLiteDecision(merged.decision, merged.request).errors.includes('requested_field_count_mismatch'));

  const invisible = structuredClone(LITE_SEMANTIC_FIXTURES.find((fixture) => fixture.id === 'esports'));
  invisible.decision.spec.lines[1].sample = '\u200b';
  invisible.decision.spec.lines[2].sample = '\u200b';
  const invisibleErrors = contract.validateLiteDecision(invisible.decision, invisible.request).errors;
  assert.ok(invisibleErrors.includes('line_sample_invisible:2'));
  assert.ok(invisibleErrors.includes('line_sample_invisible:3'));
  assert.ok(invisibleErrors.includes('requested_field_count_mismatch'));

  const recolored = structuredClone(LITE_SEMANTIC_FIXTURES.find((fixture) => fixture.id === 'public-news'));
  recolored.decision.spec.palette = {
    accent: '#ffffff', text: '#000000', textDim: '#333333', panel: '#f2f2f2',
  };
  const result = contract.validateLiteDecision(recolored.decision, recolored.request);
  assert.deepEqual(result.errors, []);
  assert.equal(result.decision?.status, 'ready');
  assert.equal(result.decision?.spec.palette, undefined);
  assert.ok(result.adjustments?.includes('unrequested_palette_dropped'));
});

test('the output schema requires inference and every style-intent axis', () => {
  const spec = contract.LITE_READY_OUTPUT.schema.properties.spec;
  assert.ok(spec.required.includes('categoryInference'));
  assert.ok(spec.required.includes('styleIntent'));
  assert.deepEqual(spec.properties.styleIntent.required.sort(), [
    'energy', 'era', 'material', 'mood', 'motion', 'paletteDirection', 'shapeLanguage',
    'texture', 'typographyCharacter',
  ]);
});

test('the paid gallery runner sends the locked semantic requests through the endpoint', () => {
  const source = readFileSync('scripts/ai-lite-eval.mjs', 'utf8');
  assert.match(source, /BANK === 'semantic'/);
  assert.match(source, /LITE_SEMANTIC_FIXTURES\.map/);
  assert.match(source, /generationSpec: fixture\.request\.generationSpec/);
  assert.match(source, /LITE_SEMANTIC_FIXTURE_VERSION/);
});
