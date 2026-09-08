// guards: src/model/designRules.ts
//
// Self-tests for the canonical design-rules module (src/model/designRules.ts) - the pure math
// only, no DOM: the owner size table's composition (floor x mode x profile), the warning band,
// exemptions, the weight/contrast/safe-area helpers, and that the prompt block is GENERATED
// from the same constants (one module, zero drift). Zero model calls, zero network.

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildApiRuntime } from './api-runtime-build.mjs';

const runtime = await buildApiRuntime(['src/model/designRules.ts']);
// A single dependency-free entry emits at the output root (tsc collapses rootDir); a future
// import inside the module would restore the src/model/ shape, so accept either.
const emitted = ['designRules.js', 'src/model/designRules.js']
  .map((p) => path.join(runtime.outputDir, p))
  .find((p) => existsSync(p));
const rules = await import(pathToFileURL(emitted).href);
after(async () => { await runtime.cleanup(); });

const TV = { profile: 'tv' };
const HD = { width: 1920, height: 1080 };

test('reference size is the short side, whatever the orientation', () => {
  assert.equal(rules.referenceSize(1920, 1080), 1080);
  assert.equal(rules.referenceSize(1080, 1920), 1080);
  assert.equal(rules.referenceSize(1080, 1080), 1080);
});

test('standard mode floors at 1080p match the ratified table (~28px unnamed primary, ~20px secondary)', () => {
  // The primary row became TYPE-AWARE on 2026-09-08 (owner ruling). An unnamed graphic takes the
  // CARD band - the middle of three - because absent must never mean exempt.
  const primary = rules.sizeFloorPx('primary', 'standard', TV, HD.width, HD.height);
  assert.ok(Math.abs(primary.hardPx - 27.97) < 0.05, `unnamed primary floor was ${primary.hardPx}`);
  assert.equal(primary.warnPx, null);
  const secondary = rules.sizeFloorPx('secondary', 'standard', TV, HD.width, HD.height);
  assert.ok(Math.abs(secondary.hardPx - 19.98) < 0.01);
  assert.ok(Math.abs(secondary.warnPx - 23.76) < 0.01);
});

test('the standard secondary floor sits under the catalog smallest shipped line (lt27 at 20px)', () => {
  // 20px chosen over 22 because shipped, owner-passed designs sit at exactly 20px.
  const { hardPx } = rules.sizeFloorPx('secondary', 'standard', TV, HD.width, HD.height);
  assert.ok(hardPx <= 20, `floor ${hardPx} would fail lt27's shipped 20px supporting line`);
});

test('safe mode floors are hard, banded off the owner three-floor table', () => {
  const primary = rules.sizeFloorPx('primary', 'safe', TV, HD.width, HD.height);
  const secondary = rules.sizeFloorPx('secondary', 'safe', TV, HD.width, HD.height);
  const fine = rules.sizeFloorPx('fine', 'safe', TV, HD.width, HD.height);
  assert.ok(Math.abs(primary.hardPx - 64.8) < 0.01);   // 6%
  assert.ok(Math.abs(secondary.hardPx - 54) < 0.01);   // 5%
  assert.ok(Math.abs(fine.hardPx - 43.2) < 0.01);      // 4%
  assert.equal(primary.warnPx, null);
  assert.equal(secondary.warnPx, null);
  assert.equal(fine.warnPx, null);
});

test('viewing profile multiplies the floor; venue and custom are tv stubs', () => {
  const tv = rules.sizeFloorPx('secondary', 'standard', TV, HD.width, HD.height);
  const mobile = rules.sizeFloorPx('secondary', 'standard', { profile: 'mobile' }, HD.width, HD.height);
  const streaming = rules.sizeFloorPx('secondary', 'standard', { profile: 'streaming' }, HD.width, HD.height);
  assert.ok(Math.abs(mobile.hardPx - tv.hardPx * 1.25) < 0.001);
  assert.ok(Math.abs(streaming.hardPx - tv.hardPx * 1.1) < 0.001);
  for (const profile of ['venue', 'custom']) {
    const p = rules.sizeFloorPx('secondary', 'standard', { profile }, HD.width, HD.height);
    assert.equal(p.hardPx, tv.hardPx);
  }
});

test('rules scale off the short side: a 9:16 vertical frame keeps the 1080-referenced floors', () => {
  const landscape = rules.sizeFloorPx('primary', 'standard', TV, 1920, 1080);
  const portrait = rules.sizeFloorPx('primary', 'standard', TV, 1080, 1920);
  assert.equal(landscape.hardPx, portrait.hardPx);
});

test('checkTextSize: fail under hard, warn inside the band, pass above; decorative exempt', () => {
  const at = (px) => rules.checkTextSize(px, 'secondary', 'standard', TV, HD.width, HD.height).status;
  assert.equal(at(18), 'fail');    // under 19.98
  assert.equal(at(21), 'warn');    // inside 19.98-23.76
  assert.equal(at(26), 'pass');
  assert.equal(
    rules.checkTextSize(8, 'decorative', 'standard', TV, HD.width, HD.height).status,
    'exempt',
  );
});

test('weight floor: 500 for small text or over unprotected video, else 400', () => {
  assert.equal(rules.weightFloor(40, HD.width, HD.height, false), 400);
  assert.equal(rules.weightFloor(20, HD.width, HD.height, false), 500); // under ~24px
  assert.equal(rules.weightFloor(40, HD.width, HD.height, true), 500);  // over video
});

test('safe area inset is 5% per axis (96/54 at 1080p) and stroke floor ~3px', () => {
  const inset = rules.safeAreaInset(HD.width, HD.height);
  assert.equal(inset.x, 96);
  assert.equal(inset.y, 54);
  assert.ok(Math.abs(rules.strokeFloorPx(HD.width, HD.height) - 3.024) < 0.01);
});

test('contrast floor relaxes to 3:1 only for large (or large-bold) text', () => {
  assert.equal(rules.contrastFloor(20, 400, HD.width, HD.height), 4.5);
  assert.equal(rules.contrastFloor(24, 400, HD.width, HD.height), 3);
  assert.equal(rules.contrastFloor(19, 700, HD.width, HD.height), 3);   // bold cut ~18.7px
  assert.equal(rules.contrastFloor(18, 700, HD.width, HD.height), 4.5);
});

test('the prompt block is generated from the table, not hand-written', () => {
  const block = rules.designRulesPromptBlock(TV, 'standard', HD);
  assert.match(block, /28px or larger/);                 // primary floor, computed
  assert.match(block, /20px or larger/);                 // secondary floor, computed
  assert.match(block, /96px from the left\/right/);      // safe area, computed
  assert.match(block, /collision is never acceptable/i); // the owner ruling rides every prompt
  assert.match(block, /full-bleed or carries EQUAL side margins/);
  assert.doesNotMatch(block, /GUARANTEED-READABLE/);

  const safe = rules.designRulesPromptBlock(TV, 'safe', HD);
  assert.match(safe, /GUARANTEED-READABLE MODE/);
  assert.match(safe, /65px or larger/);                  // 6% of 1080
  assert.match(safe, /54px or larger/);                  // 5% of 1080

  const custom = rules.designRulesPromptBlock(
    { profile: 'custom', note: 'stadium concourse screens' }, 'standard', HD,
  );
  assert.match(custom, /stadium concourse screens/);
});

test('a mobile-profile prompt block carries the multiplied floors', () => {
  const block = rules.designRulesPromptBlock({ profile: 'mobile' }, 'standard', HD);
  assert.match(block, /35px or larger/); // 49.68 * 1.25 = 62.1
  assert.match(block, /25px or larger/); // 19.98 * 1.25 = 24.975
});

// ── R4: the per-project settings (ProjectLegibility) ────────────────────────────────────

test('resolveLegibility fills every default: tv, standard, floors binding', () => {
  for (const settings of [undefined, null, {}]) {
    const r = rules.resolveLegibility(settings);
    assert.equal(r.target.profile, 'tv');
    assert.equal(r.mode, 'standard');
    assert.equal(r.floorsBlocking, true);
  }
  const relaxed = rules.resolveLegibility({ floors: 'relaxed' });
  assert.equal(relaxed.mode, 'standard');
  assert.equal(relaxed.floorsBlocking, false);
  const safe = rules.resolveLegibility({ floors: 'safe' });
  assert.equal(safe.mode, 'safe');
  assert.equal(safe.floorsBlocking, true);
  const custom = rules.resolveLegibility({ viewing: { profile: 'custom', note: 'lecture hall' } });
  assert.equal(custom.target.profile, 'custom');
  assert.equal(custom.target.note, 'lecture hall');
});

test('normalizeLegibility: the DEFAULT state serializes to nothing', () => {
  assert.equal(rules.normalizeLegibility(undefined), undefined);
  assert.equal(rules.normalizeLegibility(null), undefined);
  assert.equal(rules.normalizeLegibility({}), undefined);
  assert.equal(rules.normalizeLegibility({ viewing: { profile: 'tv' } }), undefined);
  // A note on a non-custom profile means nothing and is dropped.
  assert.deepEqual(rules.normalizeLegibility({ viewing: { profile: 'streaming', note: 'x' } }), {
    viewing: { profile: 'streaming' },
  });
  assert.deepEqual(rules.normalizeLegibility({ floors: 'relaxed' }), { floors: 'relaxed' });
  assert.deepEqual(
    rules.normalizeLegibility({ viewing: { profile: 'custom', note: ' lecture hall ' }, floors: 'safe' }),
    { viewing: { profile: 'custom', note: 'lecture hall' }, floors: 'safe' },
  );
});

test('legibilityPromptBlock: relaxed keeps the rules as guidance and states the customer chose it', () => {
  const standard = rules.legibilityPromptBlock(rules.resolveLegibility({}), HD);
  assert.equal(standard, rules.designRulesPromptBlock(TV, 'standard', HD));
  const relaxed = rules.legibilityPromptBlock(rules.resolveLegibility({ floors: 'relaxed' }), HD);
  assert.match(relaxed, /SIZE FLOORS RELAXED BY THE CUSTOMER/);
  assert.match(relaxed, /keep it as legible as you can at their scale/);
  assert.match(relaxed, /28px or larger/); // the guidance numbers still ride along
  const safe = rules.legibilityPromptBlock(rules.resolveLegibility({ floors: 'safe' }), HD);
  assert.match(safe, /GUARANTEED-READABLE MODE/);
  assert.doesNotMatch(safe, /RELAXED/);
});

// ── The type-aware primary floor (owner ruling 2026-09-08) ───────────────────────────────
//
// The universal 4.6% row was measured on 2026-09-08 refusing 322 of 503 shipped designs - the
// 64th percentile of our own catalog, including 52 of 101 lower thirds and ALL 37 corner bugs,
// whose 16px this repo had already ratified in the same breath. These tests pin the three bands
// and, more importantly, the two properties that make them safe.

test('a persistent graphic answers to its own legibility floor and no prominence floor on top', () => {
  // The contradiction the ruling resolves: typeFloor says a corner bug may render at 16px
  // because it is "read over minutes rather than in four seconds"; the old primary row demanded
  // 49.68px of the same element.
  const bug = rules.sizeFloorPx('primary', 'standard', TV, HD.width, HD.height, 'corner-bug');
  assert.ok(Math.abs(bug.hardPx - 16) < 0.01, `corner-bug primary floor was ${bug.hardPx}`);
  assert.equal(bug.hardPx, rules.typeFloorFor('corner-bug'), 'must BE the ratified number, not a copy of it');
  const ticker = rules.sizeFloorPx('primary', 'standard', TV, HD.width, HD.height, 'ticker');
  assert.ok(Math.abs(ticker.hardPx - 20) < 0.01, `ticker primary floor was ${ticker.hardPx}`);
});

test('a statement graphic keeps a high floor, and a card graphic sits between the two', () => {
  const versus = rules.sizeFloorPx('primary', 'standard', TV, HD.width, HD.height, 'versus');
  const card = rules.sizeFloorPx('primary', 'standard', TV, HD.width, HD.height, 'lower-third');
  const bug = rules.sizeFloorPx('primary', 'standard', TV, HD.width, HD.height, 'corner-bug');
  assert.ok(Math.abs(versus.hardPx - 42) < 0.2, `statement floor was ${versus.hardPx}`);
  assert.ok(Math.abs(card.hardPx - 28) < 0.2, `card floor was ${card.hardPx}`);
  assert.ok(versus.hardPx > card.hardPx && card.hardPx > bug.hardPx, 'the three bands must stay ordered');
});

test('a category that names its own floor governs every informational role, not just the lead line', () => {
  // The second half of the same contradiction: a corner bug's SUPPORTING line at 16px was refused
  // by the universal 19.98px secondary row while TYPE_FLOOR_PX said 16 was right for it. What a
  // bug may go down to is a property of being a bug, not of which line you are looking at.
  for (const role of ['primary', 'secondary', 'fine']) {
    const { hardPx } = rules.sizeFloorPx(role, 'standard', TV, HD.width, HD.height, 'corner-bug');
    assert.ok(Math.abs(hardPx - 16) < 0.01, `corner-bug ${role} floor was ${hardPx}`);
  }
  // A category with no entry of its own is untouched - the table still answers for it.
  const quiz = rules.sizeFloorPx('secondary', 'standard', TV, HD.width, HD.height, 'quiz');
  assert.ok(Math.abs(quiz.hardPx - 19.98) < 0.01, `quiz secondary floor moved to ${quiz.hardPx}`);
});

test('an unknown category is never exempt - it takes the card band', () => {
  // typeFloor.ts's doctrine, applied here: "a new category must be readable before it is special".
  for (const unknown of [null, undefined, '', 'a-type-nobody-has-added-yet']) {
    const floor = rules.sizeFloorPx('primary', 'standard', TV, HD.width, HD.height, unknown);
    assert.ok(floor, `${String(unknown)} returned no floor at all`);
    assert.ok(Math.abs(floor.hardPx - 27.97) < 0.05, `${String(unknown)} got ${floor.hardPx}`);
  }
});

test('no band can fall below the legibility floor that a graphic already answers to', () => {
  // This is what closes the flat-set hole. When every line on a board renders at one size, roleFor
  // calls them ALL primary and none secondary, so the primary floor is the only floor there is.
  // If a band could sit under the secondary floor, that board would have no floor at all.
  const secondary = rules.sizeFloorPx('secondary', 'standard', TV, HD.width, HD.height).hardPx;
  for (const cat of [null, 'corner-bug', 'ticker', 'audience', 'lower-third', 'quiz', 'versus', 'nonesuch']) {
    const primary = rules.sizeFloorPx('primary', 'standard', TV, HD.width, HD.height, cat).hardPx;
    const legibility = rules.typeFloorFor(cat);
    assert.ok(primary >= legibility - 0.01,
      `${String(cat)}: lead line floor ${primary} is under its own legibility floor ${legibility}`);
    assert.ok(primary >= Math.min(secondary, legibility) - 0.01,
      `${String(cat)}: lead line floor ${primary} is under every other floor on the graphic`);
  }
});

test('safe mode keeps the three ratified flat floors, whatever the category', () => {
  // Safe is the deliberately conservative mode: a caller asking for it is asking for one number.
  for (const cat of [null, 'corner-bug', 'versus']) {
    const { hardPx } = rules.sizeFloorPx('primary', 'safe', TV, HD.width, HD.height, cat);
    assert.ok(Math.abs(hardPx - 64.8) < 0.01, `safe primary for ${String(cat)} was ${hardPx}`);
  }
});
