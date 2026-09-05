// THE ZERO-TOKEN CONTROL for the Pro Harness (src/ai/pro/harness/, docs/PRO_HARNESS_PLAN.md §9).
//
// Two halves. The PURE half pins the modules the loop's decisions rest on - finding identity and
// diffing, the stop rule, the constrained patch guard, the knowledge selection. The LOOP half
// drives the REAL `ToolLoopAgent` (the AI SDK's) with a scripted mock model and a fake workbench
// whose inspections are scripted per round, and asserts what the harness promises: the tools a
// phase offers, that a clean measurement is the only way to finish, that a stalled repair stops
// the loop, that a regression keeps the best round, that escalation happens once and on evidence,
// and that every budget binds. No browser, no network, no model - which is what makes it runnable
// in the build gate, and what a paid round can trust the loop mechanics on.
//
// The harness is compiled the way the api/ tests compile TypeScript (api-runtime-build.mjs); its
// relative imports carry `.js` suffixes for exactly this reason (the model/types.ts convention).

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readdirSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildApiRuntime } from './api-runtime-build.mjs';
import { MockLanguageModelV3 } from 'ai/test';

const runtime = await buildApiRuntime([
  'src/ai/pro/harness/agent.ts',
  'src/ai/pro/harness/patch.ts',
  'src/ai/pro/harness/knowledge.ts',
]);
after(async () => { await runtime.cleanup(); });

/** tsc collapses rootDir to the common ancestor of the inputs, so the emitted path varies with
 *  what else was compiled - find the module by its tail rather than assuming the shape. */
function emitted(tail) {
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
  const hit = walk(runtime.outputDir).find((p) => p.replaceAll('\\', '/').endsWith(tail));
  if (!hit) throw new Error(`emitted module not found: ${tail}`);
  return import(pathToFileURL(hit).href);
}

const findings = await emitted('harness/findings.js');
const patch = await emitted('harness/patch.js');
const knowledge = await emitted('harness/knowledge.js');
const tools = await emitted('harness/tools.js');
const agent = await emitted('harness/agent.js');

// ── Helpers ──────────────────────────────────────────────────────────────────────────────

const f = (code, severity = 'block', extra = {}) => ({ code, severity, source: 'runtime', message: `${code} happened`, ...extra });
const round = (n, list, extra = {}) => ({ round: n, findings: findings.normalizeFindings(list), model: 'mock', costUsd: 0, changed: true, ...extra });

// ── Findings: identity, diff, stop rule ──────────────────────────────────────────────────

test('a finding\'s identity ignores its message, so a defect re-measured a pixel apart is the same defect', () => {
  const a = findings.fingerprint(f('bench-overflow', 'block', { locus: 'f1', frame: 'long', message: '31px past the edge' }));
  const b = findings.fingerprint(f('bench-overflow', 'block', { locus: 'f1', frame: 'long', message: '33px past the edge' }));
  const c = findings.fingerprint(f('bench-overflow', 'block', { locus: 'f1', frame: 'hold', message: '31px past the edge' }));
  assert.equal(a, b);
  assert.notEqual(a, c, 'the frame is part of the identity: a long-string defect is not the hold\'s');
});

test('normalize dedupes by identity, lists blocking first and caps per severity', () => {
  const many = Array.from({ length: 40 }, (_, i) => f(`advice-${i}`, 'advise'));
  const list = findings.normalizeFindings([f('x', 'advise'), f('y'), f('y'), ...many]);
  assert.equal(list[0].code, 'y');
  assert.equal(list.filter((x) => x.code === 'y').length, 1);
  assert.equal(findings.advisory(list).length, findings.MAX_ADVISORY_PER_ROUND);
});

test('diff names what a repair fixed, left and introduced', () => {
  const before = findings.normalizeFindings([f('a'), f('b')]);
  const afterList = findings.normalizeFindings([f('b'), f('c')]);
  const d = findings.diffFindings(before, afterList);
  assert.deepEqual(d.fixed.map((x) => x.code), ['a']);
  assert.deepEqual(d.remaining.map((x) => x.code), ['b']);
  assert.deepEqual(d.introduced.map((x) => x.code), ['c']);
});

test('the stop rule: delivered on a clean round, repair while evidence moves, stalled when it does not', () => {
  const budget = { maxRounds: 4, maxUsd: 1, spentUsd: 0 };
  assert.equal(findings.verdictFor({ ...budget, rounds: [round(1, [])] }).verdict, 'delivered');
  assert.equal(findings.verdictFor({ ...budget, rounds: [round(1, [f('a'), f('b'), f('c')])] }).verdict, 'repair');
  // Round 2 fixed one and left two: evidence moved, another round is warranted.
  assert.equal(findings.verdictFor({ ...budget, rounds: [round(1, [f('a'), f('b'), f('c')]), round(2, [f('b'), f('c')])] }).verdict, 'repair');
  // Round 3 changed nothing measurable: the same two defects twice is a stall, whatever the budget.
  const stalled = findings.verdictFor({ ...budget, rounds: [round(1, [f('a'), f('b'), f('c')]), round(2, [f('b'), f('c')]), round(3, [f('b'), f('c')])] });
  assert.equal(stalled.verdict, 'stalled');
  assert.equal(stalled.bestRound, 2, 'the tie between rounds 2 and 3 keeps the earlier one');
});

test('the stop rule: a nearly clean round answered with a worse one is a regression and the best round ships', () => {
  const v = findings.verdictFor({ maxRounds: 4, maxUsd: 1, spentUsd: 0, rounds: [round(1, [f('a')]), round(2, [f('a'), f('x'), f('y')])] });
  assert.equal(v.verdict, 'regressed');
  assert.equal(v.bestRound, 1);
  // But a round with MORE than the nearly-clean count that gets worse is still exploration.
  const explore = findings.verdictFor({ maxRounds: 4, maxUsd: 1, spentUsd: 0, rounds: [round(1, [f('a'), f('b'), f('c')]), round(2, [f('a'), f('b'), f('c'), f('d')])] });
  assert.equal(explore.verdict, 'repair', 'introduced a new finding = evidence moved');
});

test('the stop rule: rounds and money both refuse, and the best round is the fewest blocking then fewest advisories then earliest', () => {
  assert.equal(findings.verdictFor({ maxRounds: 2, maxUsd: 1, spentUsd: 0, rounds: [round(1, [f('a'), f('b')]), round(2, [f('a')])] }).verdict, 'refused');
  assert.equal(findings.verdictFor({ maxRounds: 9, maxUsd: 0.05, spentUsd: 0.05, rounds: [round(1, [f('a'), f('b')]), round(2, [f('a')])] }).verdict, 'refused');
  const rounds = [round(1, [f('a'), f('z', 'advise')]), round(2, [f('a')]), round(3, [f('a')])];
  assert.equal(findings.bestRoundIndex(rounds), 2);
});

test('the round description carries the diff and the ids a repair must name', () => {
  const prev = findings.normalizeFindings([f('a'), f('b')]);
  const now = findings.normalizeFindings([f('b'), f('q', 'advise')]);
  const text = findings.describeRound(now, prev);
  assert.match(text, /fixed 1, left 1 standing and introduced 0/);
  assert.match(text, /BLOCKING/);
  assert.match(text, /\[runtime:b:-:-\]/);
  assert.match(text, /ADVISORY/);
});

// ── The patch guard ───────────────────────────────────────────────────────────────────────

const SPINE = {
  name: 'Quiz', type: 'blank', resolution: { width: 1920, height: 1080, label: '1080p' }, fps: 25, fields: [], settings: {}, assets: [], layers: [],
  html: '<div class="quiz"><div class="quiz-box"><div class="quiz-mask"><span id="f0" class="quiz-q">Q</span></div><div class="quiz-mask"><span id="f1">A</span></div></div></div>',
  css: ':root { --accent: #f6a623; --scale: 1; }\n.quiz-box { width: fit-content; }',
  js: 'function play(){}\n/* == ANIMATION (generated — the Animation panel rewrites this block) == */\nvar animSpeed = 1;\nfunction buildInTimeline() { var tl = gsap.timeline(); return tl; }\nfunction buildOutTimeline() { var tl = gsap.timeline(); return tl; }\n/* == END ANIMATION == */\nfunction stop(){}',
};

test('a css patch lands under the design marker and a later patch replaces it rather than stacking', () => {
  const one = patch.applyGraphicPatch(SPINE, 'quiz', { css: '.quiz-box { padding: 20px; }' });
  assert.ok(one.ok && one.changed);
  const two = patch.applyGraphicPatch(one.template, 'quiz', { css: '.quiz-box { padding: 24px; }' });
  assert.ok(two.ok);
  assert.equal((two.template.css.match(/PRO HARNESS DESIGN/g) ?? []).length, 1);
  assert.doesNotMatch(two.template.css, /padding: 20px/);
  assert.match(two.template.css, /--accent: #f6a623/, 'the :root contract above the marker is untouched');
  const same = patch.applyGraphicPatch(two.template, 'quiz', { css: '.quiz-box { padding: 24px; }' });
  assert.ok(same.ok && !same.changed, 'a byte-identical patch reports unchanged');
});

test('the patch guard refuses what reaches past the three regions, with a reason per breach', () => {
  const root = patch.applyGraphicPatch(SPINE, 'quiz', { css: ':root { --accent: red; }' });
  assert.ok(!root.ok && root.reasons.some((r) => r.includes(':root')));
  const dropped = patch.applyGraphicPatch(SPINE, 'quiz', { boxHtml: '<span id="f0">only one</span>' });
  assert.ok(!dropped.ok && dropped.reasons.some((r) => r.includes('id="f1"')));
  const twice = patch.applyGraphicPatch(SPINE, 'quiz', { boxHtml: '<span id="f0">a</span><span id="f0">b</span><span id="f1">c</span>' });
  assert.ok(!twice.ok && twice.reasons.some((r) => r.includes('exactly once')));
  const invented = patch.applyGraphicPatch(SPINE, 'quiz', { boxHtml: '<span id="f0">a</span><span id="f1">c</span><span id="f9">x</span>' });
  assert.ok(!invented.ok && invented.reasons.some((r) => r.includes('id="f9"')));
  const inlineHide = patch.applyGraphicPatch(SPINE, 'quiz', { boxHtml: '<span id="f0" style="display:none">a</span><span id="f1">c</span>' });
  assert.ok(!inlineHide.ok && inlineHide.reasons.some((r) => r.includes('inline style')));
  const measured = patch.applyGraphicPatch(SPINE, 'quiz', { animation: 'var animSpeed = 1;\nfunction buildInTimeline(){ var w = document.body.scrollWidth; var tl = gsap.timeline(); return tl; }\nfunction buildOutTimeline(){ var tl = gsap.timeline(); return tl; }' });
  assert.ok(!measured.ok && measured.reasons.some((r) => r.includes('DOM measurement')));
  const es6 = patch.applyGraphicPatch(SPINE, 'quiz', { animation: 'const animSpeed = 1;\nfunction buildInTimeline(){ var tl = gsap.timeline(); return tl; }\nfunction buildOutTimeline(){ var tl = gsap.timeline(); return tl; }' });
  assert.ok(!es6.ok && es6.reasons.some((r) => r.includes('ES5')));
  const empty = patch.applyGraphicPatch(SPINE, 'quiz', {});
  assert.ok(!empty.ok);
});

test('a box patch keeps every field once and the animation patch replaces the marked region only', () => {
  const box = patch.applyGraphicPatch(SPINE, 'quiz', { boxHtml: '<div class="quiz-row"><span id="f1">A</span></div><div class="quiz-mask"><span id="f0">Q</span></div>' });
  assert.ok(box.ok);
  assert.match(box.template.html, /^<div class="quiz"><div class="quiz-box">\n<div class="quiz-row">/);
  assert.match(box.template.html, /<\/div><\/div>$/);
  const anim = patch.applyGraphicPatch(SPINE, 'quiz', { animation: 'var animSpeed = 1;\nvar easeIn = \'power3.out\';\nfunction buildInTimeline(){ var tl = gsap.timeline(); tl.set(\'.quiz\', { opacity: 1 }); return tl; }\nfunction buildOutTimeline(){ var tl = gsap.timeline(); return tl; }' });
  assert.ok(anim.ok);
  assert.match(anim.template.js, /^function play\(\)\{\}\n\/\* == ANIMATION/);
  assert.match(anim.template.js, /END ANIMATION == \*\/\nfunction stop\(\)\{\}$/);
  assert.match(anim.template.js, /power3\.out/);
  assert.doesNotMatch(anim.template.js, /var tl = gsap\.timeline\(\); return tl; }\nfunction buildOutTimeline\(\) \{ var tl = gsap\.timeline\(\); return tl; \}\n\/\* == END ANIMATION == \*\/\nfunction stop/);
});

// ── Knowledge selection ──────────────────────────────────────────────────────────────────

test('the core cards load for every request and the rest load by trigger', () => {
  const plain = knowledge.knowledgeForRequest({ brief: 'A name strap for a documentary.' });
  for (const id of knowledge.CORE_KNOWLEDGE) assert.ok(plain.includes(id), `core card ${id}`);
  assert.ok(plain.includes('motion'), 'motion is always loaded: the animation region is a writable region');
  assert.ok(!plain.includes('live-numbers'));
  assert.ok(!plain.includes('mark-and-imagery'));
  const board = knowledge.knowledgeForRequest({
    brief: 'A football scoreboard with the club crests',
    fields: [{ label: 'Score A', kind: 'number' }, { label: 'Crest', kind: 'image' }],
    packageSize: 3,
  });
  assert.ok(board.includes('live-numbers'));
  assert.ok(board.includes('mark-and-imagery'));
  assert.ok(board.includes('package-consistency'));
  assert.ok(knowledge.knowledgeForRequest({ brief: 'a news ticker' }).includes('safe-area-and-placement'));
  assert.ok(knowledge.knowledgeForRequest({ brief: 'x', hasBrandColours: true }).includes('colour'));
});

test('every card is indexed, renderable by id, and written as inspection rather than prohibition', () => {
  const index = knowledge.knowledgeIndex();
  for (const card of knowledge.KNOWLEDGE_CARDS) {
    assert.match(index, new RegExp(`- ${card.id}:`));
    assert.match(knowledge.renderKnowledge([card.id]), new RegExp(`## ${card.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
    if (card.id !== 'failure-record') {
      assert.match(card.body, /What earns a pass|earns a pass|reads as|is judged/, `${card.id} states what a pass looks like`);
    }
  }
  assert.equal(knowledge.knowledgeCard('nope'), null);
});

// ── The loop, on the real ToolLoopAgent with a scripted model and a fake workbench ────────

/** A model that answers each step from a script: every entry is a tool call the model "decides"
 *  to make, or a function of the call options (to assert on what the harness offered). */
function scriptedModel(id, steps) {
  const calls = [];
  let n = 0;
  const model = new MockLanguageModelV3({
    modelId: id,
    doGenerate: async (options) => {
      calls.push(options);
      const entry = steps[n] ?? steps[steps.length - 1];
      n += 1;
      const call = typeof entry === 'function' ? entry(options) : entry;
      return {
        content: [{ type: 'tool-call', toolCallId: `call-${n}`, toolName: call.toolName, input: JSON.stringify(call.input) }],
        finishReason: { unified: 'tool-calls', raw: 'tool_calls' },
        usage: {
          inputTokens: { total: 1000, noCache: 1000, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 200, text: 200, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
  return { model, calls };
}

/** A workbench whose inspections come from a queue - the measured world, scripted per round. */
function fakeWorkbench(inspections, { withFrames = false } = {}) {
  const log = [];
  const queue = [...inspections];
  return {
    log,
    async listTypes() { log.push('listTypes'); return [{ id: 'quiz-board', name: 'Quiz board', description: 'q + 4', fields: 5, events: 4 }]; },
    async describeType(id) {
      log.push(`describeType:${id}`);
      return id === 'quiz-board' ? { id, name: 'Quiz board', description: 'A question, four answers.', category: 'quiz', prefix: 'quiz', fields: [{ key: 'q', label: 'Question', kind: 'text', role: 'line', sample: 'Q?' }], events: [{ event: 'lock', label: 'Lock' }], steps: 3, defaultZone: 'center', logo: 'none' } : null;
    },
    async scaffold(request) {
      log.push(`scaffold:${request.typeId ?? 'typeless'}`);
      return { template: { ...SPINE, name: request.name }, prefix: 'quiz', fields: [{ id: 'f0', label: 'Question', kind: 'text', sample: 'Q' }, { id: 'f1', label: 'Answer A', kind: 'text', sample: 'A' }], steps: 3, notes: [] };
    },
    async apply(template, prefix, p) { log.push('apply'); return patch.applyGraphicPatch(template, prefix, p); },
    async inspect() {
      log.push('inspect');
      const next = queue.shift() ?? [];
      return {
        findings: findings.normalizeFindings(next),
        frames: withFrames ? [{ kind: 'hold', image: { mediaType: 'image/jpeg', base64: 'AAAA' } }, { kind: 'long', image: { mediaType: 'image/jpeg', base64: 'BBBB' } }] : [],
        costUsd: 0,
      };
    },
    async finish(template) { log.push('finish'); return { template, location: 'library:test' }; },
  };
}

const activeToolNames = (options) => (options.tools ?? []).map((t) => t.name).sort();
const design = (n) => ({ toolName: 'applyDesign', input: { css: `.quiz-box { padding: ${n}px; }`, rationale: `round ${n}` } });

test('the loop: understand, scaffold, design, one evidence-driven repair, finish - and the tools each phase offers', async () => {
  const workbench = fakeWorkbench([[f('bench-overlap', 'block', { locus: 'f1' }), f('text-over-rule', 'block', { locus: '.quiz-q' })], []]);
  const { model, calls } = scriptedModel('mock/cheap', [
    { toolName: 'inspectGraphicType', input: { typeId: 'quiz-board' } },
    { toolName: 'startGraphic', input: { name: 'Pub quiz', typeId: 'quiz-board' } },
    design(20),
    { toolName: 'applyDesign', input: { css: '.quiz-box { padding: 24px; gap: 8px; }', addresses: ['runtime:bench-overlap:-:f1'], rationale: 'more air between rows' } },
    { toolName: 'finishGraphic', input: { summary: 'A calm quiz board.' } },
  ]);
  const result = await agent.runProHarness({
    workbench,
    models: { cheap: model },
    request: { brief: 'A pub quiz board for a Friday show.', typeId: 'quiz-board' },
    prices: { 'mock/cheap': { inputPerMillion: 1, outputPerMillion: 5 } },
  });
  assert.equal(result.status, 'delivered');
  assert.equal(result.rounds.length, 2);
  assert.equal(result.steps, 5);
  assert.deepEqual(workbench.log, ['describeType:quiz-board', 'scaffold:quiz-board', 'apply', 'inspect', 'apply', 'inspect', 'finish']);
  // Phase gating, read off what the model was OFFERED at each step.
  assert.deepEqual(activeToolNames(calls[0]), ['inspectDesignKnowledge', 'inspectGraphicType', 'listGraphicTypes', 'startGraphic']);
  assert.deepEqual(activeToolNames(calls[2]), ['applyDesign', 'inspectDesignKnowledge'], 'design phase: design or read, nothing else');
  assert.deepEqual(activeToolNames(calls[3]), ['applyDesign', 'inspectDesignKnowledge', 'stopGraphic'], 'repair phase');
  assert.deepEqual(activeToolNames(calls[4]), ['finishGraphic'], 'a clean measurement offers exactly one move');
  assert.deepEqual(calls[4].toolChoice, { type: 'tool', toolName: 'finishGraphic' });
  // The first message carries the brief, the rules block and the knowledge cards.
  const first = calls[0].prompt.find((m) => m.role === 'user');
  const text = first.content.map((p) => p.text ?? '').join('\n');
  assert.match(text, /A pub quiz board/);
  assert.match(text, /BROADCAST LEGIBILITY RULES/);
  assert.match(text, /## Hierarchy/);
  // The repair round's tool result told the model what its patch achieved.
  const repairResult = calls[4].prompt.findLast((m) => m.role === 'tool');
  const repairText = JSON.stringify(repairResult.content);
  assert.match(repairText, /fixed 2, left 0 standing and introduced 0/);
  assert.match(repairText, /measures clean/);
  // Cost accounted from the price table: 5 steps x (1000 in x $1/M + 200 out x $5/M).
  assert.ok(Math.abs(result.spentUsd - 5 * (0.001 + 0.001)) < 1e-9, `spent ${result.spentUsd}`);
  assert.deepEqual(result.modelByStep, Array(5).fill('mock/cheap'));
});

test('the loop: a repair that fixes nothing stalls the loop; the best round is kept and reported as not ready', async () => {
  const same = [f('bench-overflow', 'block', { locus: 'f0', frame: 'long' }), f('padding-lopsided', 'block')];
  const workbench = fakeWorkbench([same, same, same]);
  const { model, calls } = scriptedModel('mock/cheap', [
    { toolName: 'startGraphic', input: { name: 'Strap', fields: [{ label: 'Name', kind: 'text' }] } },
    design(20),
    design(21),
    { toolName: 'stopGraphic', input: { reason: 'the overflow does not move' } },
  ]);
  const result = await agent.runProHarness({ workbench, models: { cheap: model }, request: { brief: 'A strap.' }, budget: { maxRounds: 4 } });
  assert.equal(result.status, 'refused');
  assert.equal(result.rounds.length, 2, 'round 3 was never spent: the stall was decided after round 2');
  assert.equal(result.bestRound, 1);
  assert.deepEqual(activeToolNames(calls[3]), ['stopGraphic']);
  assert.match(result.events.join('\n'), /stalled/);
});

test('the loop: a model that ignores a forced tool ends the run as a refusal carrying the best round, never as a throw', async () => {
  const same = [f('bench-overflow', 'block', { locus: 'f0', frame: 'long' })];
  const workbench = fakeWorkbench([same, same]);
  const { model } = scriptedModel('mock/cheap', [
    { toolName: 'startGraphic', input: { name: 'Strap', fields: [{ label: 'Name', kind: 'text' }] } },
    design(20),
    design(21),
    design(22), // the harness forced stopGraphic here; the model disobeys
  ]);
  const result = await agent.runProHarness({ workbench, models: { cheap: model }, request: { brief: 'A strap.' } });
  assert.equal(result.status, 'refused');
  assert.match(result.reason, /aborted/);
  assert.match(result.reason, /ToolChoiceViolationError/);
  assert.equal(result.bestRound, 1);
  assert.match(result.template.css, /padding: 20px/);
});

test('the loop: a nearly clean round answered by a worse one ships the earlier round', async () => {
  const workbench = fakeWorkbench([[f('bench-overlap', 'block', { locus: 'f1' })], [f('bench-overlap', 'block', { locus: 'f1' }), f('text-over-rule', 'block'), f('bench-overflow', 'block')]]);
  const { model } = scriptedModel('mock/cheap', [
    { toolName: 'startGraphic', input: { name: 'Strap', fields: [{ label: 'Name', kind: 'text' }] } },
    design(20),
    design(21),
    { toolName: 'stopGraphic', input: { reason: 'regressed' } },
  ]);
  const result = await agent.runProHarness({ workbench, models: { cheap: model }, request: { brief: 'A strap.' } });
  assert.equal(result.status, 'refused');
  assert.equal(result.bestRound, 1);
  assert.match(result.template.css, /padding: 20px/, 'the kept template is round 1\'s, not the last one');
});

test('the loop: a stall escalates to the strong model exactly once, and the strong round can finish it', async () => {
  const same = [f('bench-overlap', 'block', { locus: 'f1' })];
  const workbench = fakeWorkbench([same, same, []]);
  const cheap = scriptedModel('mock/cheap', [
    { toolName: 'startGraphic', input: { name: 'Strap', fields: [{ label: 'Name', kind: 'text' }] } },
    design(20),
    design(21),
  ]);
  const strong = scriptedModel('mock/strong', [
    design(30),
    { toolName: 'finishGraphic', input: { summary: 'fixed by the strong model' } },
  ]);
  const result = await agent.runProHarness({ workbench, models: { cheap: cheap.model, strong: strong.model }, request: { brief: 'A strap.' }, budget: { maxRounds: 4 } });
  assert.equal(result.status, 'delivered');
  assert.equal(result.escalated, true);
  assert.equal(result.rounds.length, 3);
  assert.equal(result.rounds[2].model, 'mock/strong');
  assert.equal(cheap.calls.length, 3);
  assert.equal(strong.calls.length, 2, 'the strong model designs once and finishes; it is not consulted before the stall');
  assert.deepEqual(strong.calls[0].toolChoice, { type: 'tool', toolName: 'applyDesign' });
});

test('the loop: the round budget refuses even while evidence is still moving', async () => {
  const workbench = fakeWorkbench([[f('a'), f('b'), f('c')], [f('b'), f('c')], [f('c')]]);
  const { model } = scriptedModel('mock/cheap', [
    { toolName: 'startGraphic', input: { name: 'Strap', fields: [{ label: 'Name', kind: 'text' }] } },
    design(20),
    design(21),
    { toolName: 'stopGraphic', input: { reason: 'out of rounds' } },
  ]);
  const result = await agent.runProHarness({ workbench, models: { cheap: model }, request: { brief: 'A strap.' }, budget: { maxRounds: 2 } });
  assert.equal(result.status, 'refused');
  assert.equal(result.rounds.length, 2);
  assert.match(result.reason, /out of rounds/);
  assert.match(result.events.join('\n'), /round budget spent/);
});

test('the loop: the money ceiling stops the agent before another model step', async () => {
  const workbench = fakeWorkbench([[f('a')], [f('a')], [f('a')]]);
  const { model, calls } = scriptedModel('mock/cheap', [
    { toolName: 'startGraphic', input: { name: 'Strap', fields: [{ label: 'Name', kind: 'text' }] } },
    design(20),
    design(21),
    design(22),
  ]);
  const result = await agent.runProHarness({
    workbench,
    models: { cheap: model },
    request: { brief: 'A strap.' },
    budget: { maxUsd: 0.0035, maxRounds: 9 },
    prices: { 'mock/cheap': { inputPerMillion: 1, outputPerMillion: 5 } },
  });
  assert.equal(result.status, 'refused');
  assert.match(result.reason, /cost ceiling/);
  assert.equal(calls.length, 2, 'two steps at $0.002 each cross $0.0035; the third never runs');
});

test('the loop: a refused patch costs no round and a byte-identical patch is refused', async () => {
  const workbench = fakeWorkbench([[f('a')], []]);
  const { model, calls } = scriptedModel('mock/cheap', [
    { toolName: 'startGraphic', input: { name: 'Strap', fields: [{ label: 'Name', kind: 'text' }] } },
    { toolName: 'applyDesign', input: { css: ':root { --accent: red; }', rationale: 'retint' } },
    design(20),
    design(20),
    design(24),
    { toolName: 'finishGraphic', input: { summary: 'done' } },
  ]);
  const result = await agent.runProHarness({ workbench, models: { cheap: model }, request: { brief: 'A strap.' }, budget: { maxSteps: 12 } });
  assert.equal(result.status, 'delivered');
  assert.equal(result.rounds.length, 2, 'the refused patch and the identical patch spent no round');
  const refused = calls[2].prompt.findLast((m) => m.role === 'tool');
  assert.match(JSON.stringify(refused.content), /refused - nothing was applied/);
  const identical = calls[4].prompt.findLast((m) => m.role === 'tool');
  assert.match(JSON.stringify(identical.content), /byte-identical/);
  assert.equal(workbench.log.filter((l) => l === 'inspect').length, 2);
});

test('the loop: a clean gate spends the critique once, its NO becomes one advisory repair, and the next clean round finishes', async () => {
  const workbench = fakeWorkbench([[], []], { withFrames: true });
  const { model } = scriptedModel('mock/cheap', [
    { toolName: 'startGraphic', input: { name: 'Strap', fields: [{ label: 'Name', kind: 'text' }] } },
    design(20),
    design(21),
    { toolName: 'finishGraphic', input: { summary: 'done' } },
  ]);
  let visionCalls = 0;
  const vision = new MockLanguageModelV3({
    modelId: 'mock/vision',
    doGenerate: async () => {
      visionCalls += 1;
      const yes = { answer: 'yes', evidence: 'fine' };
      const answers = { hierarchy: yes, composition: { answer: 'no', evidence: 'the rule sits 20px right of the name' }, restraint: yes, coherence: yes, 'on-air': yes, centred: yes, inside: yes, aligned: yes, grows: yes };
      return {
        content: [{ type: 'text', text: JSON.stringify(answers) }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: { inputTokens: { total: 500, noCache: 500, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 100, text: 100, reasoning: undefined } },
        warnings: [],
      };
    },
  });
  const result = await agent.runProHarness({ workbench, models: { cheap: model, vision }, request: { brief: 'A strap.' }, capture: true });
  assert.equal(result.status, 'delivered');
  assert.equal(visionCalls, 1, 'the critique budget is one');
  assert.equal(result.critiquesUsed, 1);
  assert.equal(result.rounds.length, 2, 'the critic\'s NO bought exactly one repair round');
  assert.ok(result.rounds[0].findings.some((x) => x.source === 'critic' && x.code === 'critic-composition'));
  assert.equal(findings.blocking(result.rounds[0].findings).length, 0, 'a critic finding never blocks');
});

test('the loop: a critique repair that breaks a clean round is discarded and the clean round is delivered', async () => {
  const workbench = fakeWorkbench([[], [f('bench-overlap', 'block', { locus: 'f1' })]], { withFrames: true });
  const { model } = scriptedModel('mock/cheap', [
    { toolName: 'startGraphic', input: { name: 'Strap', fields: [{ label: 'Name', kind: 'text' }] } },
    design(20),
    design(21),
    { toolName: 'finishGraphic', input: { summary: 'the clean one' } },
  ]);
  const vision = new MockLanguageModelV3({
    modelId: 'mock/vision',
    doGenerate: async () => {
      const yes = { answer: 'yes', evidence: 'fine' };
      const answers = { hierarchy: { answer: 'no', evidence: 'the role competes with the name' }, composition: yes, restraint: yes, coherence: yes, 'on-air': yes, centred: yes, inside: yes, aligned: yes, grows: yes };
      return {
        content: [{ type: 'text', text: JSON.stringify(answers) }],
        finishReason: { unified: 'stop', raw: 'stop' },
        usage: { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } },
        warnings: [],
      };
    },
  });
  const result = await agent.runProHarness({ workbench, models: { cheap: model, vision }, request: { brief: 'A strap.' }, capture: true });
  assert.equal(result.status, 'delivered');
  assert.equal(result.bestRound, 1);
  assert.match(result.template.css, /padding: 20px/, 'round 1\'s template ships, not the regressed repair');
  assert.match(result.events.join('\n'), /discarded/);
});

test('toolsForPhase forces the next move once a phase has been dithered in', () => {
  assert.equal(tools.toolsForPhase('understand', 0).force, undefined);
  assert.equal(tools.toolsForPhase('understand', 2).force, 'startGraphic');
  assert.equal(tools.toolsForPhase('design', 1).force, 'applyDesign');
  assert.equal(tools.toolsForPhase('repair', 1).force, 'applyDesign');
  assert.equal(tools.toolsForPhase('finish', 0).force, 'finishGraphic');
  assert.equal(tools.toolsForPhase('refuse', 0).force, 'stopGraphic');
  assert.deepEqual(tools.toolsForPhase('done', 0).active, []);
});
