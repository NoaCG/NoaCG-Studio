// guards: benchmarks/harness/**, agents/noacg-harness/**, api/_lib/harness/**, cli/scripts/build-skill.mjs, scripts/harness-agent-sync.mjs
//
// THE HARNESS BENCH WORKS BEFORE A MODEL IS PAID (docs/work-specs/noacg-harness/spec.md AC-1,
// with AC-2's seal and AC-16's cap). Everything here runs at zero tokens and without a browser:
//
//   - the ledger's wall refuses a session the remainder cannot cover, and the committed ledger
//     reads, holds only phases and sessions it can account for, and says $0 so far;
//   - the exam reserve (AC-5) is 5.2's arithmetic, held from every phase but the exam's, so the
//     wall refuses a tuning session that would eat into it; the committed reserve is H4's;
//   - `--build` refuses a $0 phase, a phase the ledger already holds as completed, and tuning
//     before the exam is reserved;
//   - one brief goes through the fake arm and through the managed-agents arm on the stub that
//     replays the documented Managed Agents events and files: record, the save door's own shape
//     check, capture, the digests, the ledger at $0, and the session and its files deleted after;
//     a session paused at its budget hands in as not ready; a short ledger starts nothing;
//   - the gallery is blind;
//   - a subscription child's environment is built from scratch, carries no key, and nothing
//     starts unless `claude auth status` there says the OAuth token;
//   - the judge is frozen (AC-3): the committed lock pins the prompt, the rubric and a model id,
//     a changed file is refused, the exam's judge runner refuses it before anything starts, a
//     pair is judged in both orders with a flip a tie, and the calibration split is the one its
//     seed draws, scored against the fixed thresholds;
//   - the exam briefs are sealed (format and refusal everywhere, the hash where the private
//     passphrase is on this machine) and the container's system prompt is plumbing in 25 lines;
//   - the Skills API bundle is the skill's own bytes.
//
// The CLI and the bridge are stood in for by a fake `cli` that writes what the real verbs write:
// `node scripts/harness-bench.mjs --control` is the same pipeline on the real CLI and bridge.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createCipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { loadHarnessApi } from '../benchmarks/harness/lib/api-runtime.mjs';
import { agentCreateBody, readAgentDefinition, readEnvironmentDefinition, SYSTEM_PROMPT_MAX_LINES } from '../benchmarks/harness/lib/agent-def.mjs';
import { archivedArm, claudeCodeArm, fakeArm, lastReviewed, managedAgentsArm, scaffoldArgs, sessionThreads } from '../benchmarks/harness/lib/arms.mjs';
import { buildGallery } from '../benchmarks/harness/lib/gallery.mjs';
import { combinePair, judgeInvocation, judgePair, judgeSingle, loadJudge } from '../benchmarks/harness/lib/judge.mjs';
import { makeSplit, membershipSha, pairsOf, score, THRESHOLDS } from '../benchmarks/harness/judge/calibration.mjs';
import { admit, appendEntry, emptyLedger, heldCents, phaseCompleted, phaseSpentCents, readLedger, remainingCents, reservation, spentCents, writeLedger } from '../benchmarks/harness/lib/ledger.mjs';
import { digestCheck, missingActions, runCell, stressFile } from '../benchmarks/harness/lib/pipeline.mjs';
import { openSealed, privatePassphraseFile, readSealed, sealedShape, verifySealed } from '../benchmarks/harness/lib/sealed.mjs';
import { assertNoKeys, checkSubscriptionAuth, subscriptionEnv, usageLimit } from '../benchmarks/harness/lib/subscription.mjs';
import { LIST_PRICES, requestUsd, traceMetrics } from '../benchmarks/harness/lib/trace.mjs';
import { packagesEnvironment, PROOFS, PUBLISHED_CLI } from '../benchmarks/harness/lib/feasibility.mjs';
import { adoptions, agentSessionBudgetCents, CONTROL_BRIEFS, controlVersion, judgeRun, LEDGER_FILE, packagesProofRefusal, pendingCells, recordReserve, refuseBuild, tuningBriefs } from './harness-bench.mjs';
import { readDefinitions, syncPlan } from './harness-agent-sync.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS = path.join(ROOT, 'benchmarks', 'harness');
const made = [];
const tmp = () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'noacg-harness-test-'));
  made.push(dir);
  return dir;
};

const api = await loadHarnessApi();
after(async () => {
  await api.cleanup();
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

// ── the ledger ─────────────────────────────────────────────────────────────────────────────

test('the wall refuses a session when what is left, less the overshoot margin, cannot cover its budget', () => {
  const ledger = emptyLedger();
  assert.equal(admit(ledger, { budgetCents: 300 }).ok, true);
  appendEntry(ledger, { kind: 'session', phase: 'H3', funding: 'credit', sessionId: 'sesn_a', listCostCents: 9_600, outcome: 'delivered' });
  assert.equal(remainingCents(ledger), 400);
  assert.equal(admit(ledger, { budgetCents: 300, overshootCents: 50 }).ok, true, '$4 left covers $3 + $0.50');
  const short = admit(ledger, { budgetCents: 300, overshootCents: 50, concurrency: 2 });
  assert.equal(short.ok, false, 'two at once need $7');
  assert.match(short.reason, /\$4\.00 left/);
  assert.equal(admit(ledger, { budgetCents: 300, overshootCents: 50, criticCents: 100 }).ok, false, 'the critic\'s worst thread counts too');
  assert.throws(() => admit(ledger, { budgetCents: 0 }), /positive whole number/);
});

test('a phase ceiling is a wall inside the run\'s: H3 stops at its $10 whatever the ledger has left', () => {
  const ledger = emptyLedger();
  appendEntry(ledger, { kind: 'session', phase: 'H3', funding: 'credit', sessionId: 'sesn_a', listCostCents: 650, outcome: 'delivered' });
  appendEntry(ledger, { kind: 'session', phase: 'H2', funding: 'credit', sessionId: 'sesn_b', listCostCents: 2_000, outcome: 'delivered' });
  assert.equal(admit(ledger, { budgetCents: 300, overshootCents: 50, phase: 'H3', ceilingCents: 1_000 }).ok, true, '$3.50 under the ceiling covers $3 + $0.50');
  const over = admit(ledger, { budgetCents: 301, overshootCents: 50, phase: 'H3', ceilingCents: 1_000 });
  assert.equal(over.ok, false);
  assert.match(over.reason, /H3's \$10\.00 ceiling has \$3\.50 left/);
  assert.equal(admit(ledger, { budgetCents: 301, overshootCents: 50 }).ok, true, 'without a ceiling only the run\'s remainder counts');
});

test('a session\'s trace measures its cold start, turns, images and largest request at list prices', () => {
  const at = (s) => new Date(Date.parse('2026-10-15T00:00:00Z') + s * 1000).toISOString();
  const usage = (input, output, read, write) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: read, cache_creation_input_tokens: write });
  const events = [
    { type: 'span.model_request_start', processed_at: at(4) },
    { type: 'span.model_request_end', processed_at: at(6), is_error: false, model_usage: usage(1_000, 500, 0, 10_000) },
    { type: 'agent.tool_use', id: 'u1', name: 'bash', input: { command: 'npm install -g /mnt/session/uploads/noacg-cli.tgz' }, processed_at: at(7) },
    { type: 'agent.tool_result', tool_use_id: 'u1', content: [{ type: 'text', text: 'added 1 package' }], processed_at: at(30) },
    { type: 'agent.tool_use', id: 'u2', name: 'bash', input: { command: 'cd /workspace && noacg validate graphic' }, processed_at: at(31) },
    { type: 'agent.tool_result', tool_use_id: 'u2', content: [{ type: 'text', text: `OK\nDigest:    sha256:${'d'.repeat(64)}` }], processed_at: at(40) },
    { type: 'span.model_request_end', processed_at: at(45), is_error: false, model_usage: usage(2_000, 4_000, 100_000, 0) },
    { type: 'agent.tool_use', id: 'u3', name: 'read', input: { file_path: '/mnt/session/outputs/shots/onair.png' }, processed_at: at(46) },
    { type: 'agent.tool_result', tool_use_id: 'u3', content: [{ type: 'image', source: {} }], processed_at: at(47) },
    { type: 'agent.message', content: [{ type: 'text', text: 'DELIVERED' }], processed_at: at(50) },
  ];
  const m = traceMetrics({ events, createdAt: at(0), model: 'claude-opus-5-5', usage: { active_seconds: 3_600, cache_creation: { ephemeral_5m_input_tokens: 10_000 } } });
  assert.deepEqual(m.coldStart, { firstModelRequest: 4, firstToolCall: 7, firstNoacgCommand: 31, bridgeReady: null }, 'no doctor reached a bridge in this trace');
  assert.deepEqual(m.turns, { modelRequests: 2, toolCalls: 3 });
  assert.equal(m.images, 1, 'only a result that carried an image back counts as a look');
  // 2,000 x $4 + 4,000 x $20 + 100,000 x $0.20 per million: $0.108, more than the first's $0.064.
  assert.equal(m.largestRequest.usd, 0.108);
  assert.equal(m.pricedCents, Math.round((0.064 + 0.108 + 0.08) * 100), 'tokens plus an hour of running time');
  assert.equal(m.steps.find((s) => s.command?.includes('validate')).digest, `sha256:${'d'.repeat(64)}`);
  assert.equal(m.steps.find((s) => s.tool === 'read').images, 1);
  assert.equal(requestUsd(usage(0, 0, 0, 1_000_000), LIST_PRICES['claude-opus-5-5'], 1), 8, 'a one-hour cache write is twice the input price');
});

test('H3\'s proofs: the planted defect validates clean, and the packages environment adds only the published CLI', () => {
  assert.deepEqual(Object.keys(PROOFS), ['h3-plumbing', 'h3-plumbing-2', 'h3-packages-cold', 'h3-packages-warm', 'h3-defect']);
  assert.equal(PROOFS['h3-plumbing'].model.id, 'claude-haiku-5-5', 'plumbing is proved on the cheap model (5.3)');
  assert.equal(PROOFS['h3-defect'].model, null, 'the defect repair runs the synced agent, Opus 5.5');
  assert.doesNotMatch(PROOFS['h3-defect'].prompt, /upside|flip|mirror|transform|defect/i, 'the brief never names the defect');
  const env = readEnvironmentDefinition(path.join(ROOT, 'agents', 'noacg-harness'));
  const withPackages = packagesEnvironment(env);
  assert.deepEqual(withPackages.config.packages, { npm: [PUBLISHED_CLI] });
  assert.deepEqual({ ...withPackages.config, packages: undefined }, { ...env.config, packages: undefined }, 'the same networking');
  assert.notEqual(withPackages.name, env.name);
  // The cached start is measured only after the cold one, in the same run's environment.
  const fresh = emptyLedger();
  assert.equal(packagesProofRefusal(fresh, 'H3', ['h3-defect']), null);
  assert.equal(packagesProofRefusal(fresh, 'H3', ['h3-packages-cold', 'h3-packages-warm']), null);
  for (const ids of [['h3-packages-warm'], ['h3-packages-cold'], ['h3-packages-warm', 'h3-packages-cold']]) assert.match(packagesProofRefusal(fresh, 'H3', ids), /together and in order/, ids.join());
  appendEntry(fresh, { kind: 'session', phase: 'H3', brief: 'h3-packages-cold', arm: 'managed-agents', funding: 'credit', sessionId: 's1', listCostCents: 1, outcome: 'failed' });
  assert.match(packagesProofRefusal(fresh, 'H3', ['h3-packages-cold', 'h3-packages-warm']), /already holds h3-packages-cold/, 'a resume cannot measure the cached start in a new environment');
});

test('an entry the credit did not fund carries no cost, and a credit session names its session', () => {
  const ledger = emptyLedger();
  assert.throws(() => appendEntry(ledger, { kind: 'session', phase: 'H5', funding: 'subscription', listCostCents: 120, outcome: 'delivered' }), /did not fund/);
  assert.throws(() => appendEntry(ledger, { kind: 'session', phase: 'H5', funding: 'credit', listCostCents: 120, outcome: 'delivered' }), /no session id/);
  assert.throws(() => appendEntry(ledger, { kind: 'session', phase: 'five', funding: 'none', outcome: 'delivered' }), /phase/);
  appendEntry(ledger, { kind: 'session', phase: 'H5', funding: 'credit', listCostCents: 0, outcome: 'refused' });
  appendEntry(ledger, { kind: 'phase', phase: 'H5', funding: 'none', outcome: 'completed' });
  assert.equal(phaseCompleted(ledger, 'H5'), true);
  assert.equal(phaseCompleted(ledger, 'H6'), false);
});

test('the committed ledger reads: no credit before H3, H3 within its $10, and H0 completed', () => {
  const ledger = readLedger(LEDGER_FILE);
  assert.equal(ledger.runBudgetCents, 10_000, 'decision 11: $100 across every run of the plan');
  for (const phase of ['H0', 'H1', 'H2']) assert.equal(phaseSpentCents(ledger, phase), 0, `${phase} spent no credit`);
  // H3 is closed: its six sessions are what evidence/phase-3.md reports, inside its $10 (5.1).
  assert.equal(phaseSpentCents(ledger, 'H3'), 266);
  assert.equal(ledger.entries.filter((e) => e.phase === 'H3' && e.kind === 'session').length, 6);
  assert.ok(spentCents(ledger) >= 266);
  assert.equal(phaseCompleted(ledger, 'H0'), true);
});

test('--build refuses a $0 phase, a completed one, tuning before the exam is reserved, and anything not a phase', () => {
  const ledger = readLedger(LEDGER_FILE);
  assert.match(refuseBuild(ledger, 'H0'), /H0 spends nothing/);
  assert.match(refuseBuild(ledger, 'H3'), /already holds H3 as completed/, 'a resumed H3 never spends again');
  assert.match(refuseBuild(emptyLedger(), 'H4'), /H4 spends nothing \(5\.1\): it creates no session/, 'the reservation is $0 whatever the ledger says');
  assert.match(refuseBuild(ledger, 'H5'), /already holds H5 as completed/, 'round 1 is closed and never spends again');
  assert.equal(refuseBuild(ledger, 'H6'), null, 'the committed ledger holds the reserve, so round 2 may spend');
  assert.match(refuseBuild(emptyLedger(), 'H5'), /no exam reserve/);
  assert.equal(refuseBuild(emptyLedger(), 'H3'), null, 'feasibility comes before the reserve');
  assert.match(refuseBuild(ledger, 'H8'), /H8 spends its reserve only on the exam, after tuning: H6, H7 not closed/);
  assert.match(refuseBuild(ledger, 'feasibility'), /phase like H3/);
  assert.match(refuseBuild(ledger, 'H04'), /phase like H3/, 'no alias slips past the $0 and completed refusals');
});

// ── the exam reserve (AC-5, 5.2, 5.3) ──────────────────────────────────────────────────────

test('the exam reserve is 5.2\'s arithmetic, and the wall holds it from every phase but the exam\'s', () => {
  const ledger = emptyLedger();
  appendEntry(ledger, { kind: 'session', phase: 'H3', funding: 'credit', sessionId: 'sesn_h3', listCostCents: 266, outcome: 'delivered' });
  // H4's three candidates for `o` on B = $2.24 (evidence/phase-4.md): only the measured one leaves three $15 rounds.
  const fit = (o) => reservation(ledger, { sessionBudgetCents: 224, overshootCents: o, setBy: 'H4' });
  const row = ({ reserve, tuningCents, rounds }) => [reserve.cents, tuningCents, ...rounds.map((r) => r.rounds)];
  assert.deepEqual([22, 50, 76].map((o) => row(fit(o))), [[4_920, 4_814, 3, 5], [5_480, 4_254, 2, 4], [6_000, 3_734, 2, 4]], 'R, T, rounds at $15, rounds at $9');
  ledger.reserve = fit(22).reserve;
  assert.equal(ledger.reserve.phase, 'H8');
  assert.equal(remainingCents(ledger, 'H5'), 4_814, 'a tuning round sees the budget less the spend and the reserve');
  assert.equal(remainingCents(ledger, 'H8'), 9_734, 'the exam may use its reserve');
  // Tuning spends until $2.45 is left beside the reserve: one more $2.24 session with its $0.22 margin needs $2.46.
  appendEntry(ledger, { kind: 'session', phase: 'H5', funding: 'credit', sessionId: 'sesn_h5', listCostCents: 4_814 - 245, outcome: 'delivered' });
  const tuning = admit(ledger, { budgetCents: 224, overshootCents: 22, phase: 'H6' });
  assert.equal(tuning.ok, false, 'a tuning session that would eat into the reserve is refused');
  assert.match(tuning.reason, /past the \$49\.20 held for H8's exam, \$2\.45 left/);
  assert.equal(admit({ ...ledger, reserve: undefined }, { budgetCents: 224, overshootCents: 22, phase: 'H6' }).ok, true, 'without the reserve the same session would start');
  assert.equal(admit(ledger, { budgetCents: 224, overshootCents: 22, phase: 'H8', ceilingCents: 4_920 }).ok, true, 'the exam starts on its reserve');
  appendEntry(ledger, { kind: 'session', phase: 'H8', funding: 'credit', sessionId: 'sesn_h8', listCostCents: 150, outcome: 'delivered' });
  assert.equal(heldCents(ledger, 'H6'), 4_770, 'what the exam spent is no longer held');
  appendEntry(ledger, { kind: 'phase', phase: 'H8', funding: 'none', outcome: 'completed' });
  assert.equal(heldCents(ledger, 'H9'), 0, 'a closed exam holds nothing back');
  assert.throws(() => reservation(ledger, { sessionBudgetCents: 0, overshootCents: 22, setBy: 'H4' }), /reserve for no session/);
  // A reserve whose figure is not its own arithmetic does not read: the wall never trusts a hand-edited R.
  const file = path.join(tmp(), 'ledger.json');
  writeLedger(file, { ...ledger, reserve: { ...ledger.reserve, cents: 4_000 } });
  assert.throws(() => readLedger(file), /cents 4000 is not 20 x \(224 \+ 22 \+ 0\)/);
});

test('--reserve names every term, records the reserve beside the entries, and writes nothing when the exam no longer fits', () => {
  const file = path.join(tmp(), 'ledger.json');
  const ledger = emptyLedger();
  appendEntry(ledger, { kind: 'session', phase: 'H3', funding: 'credit', sessionId: 'sesn_h3', listCostCents: 266, outcome: 'delivered' });
  writeLedger(file, { ...ledger, kept: 'another key' });
  assert.throws(() => recordReserve(file, { by: 'H4', overshoot: '22' }), /--budget-cents takes a whole number of cents, got ""/, 'a revision never inherits a budget it did not state');
  assert.throws(() => recordReserve(file, { by: 'H4', budget: '224', overshoot: '' }), /--overshoot-cents takes a whole number/, 'an empty value is not zero');
  assert.throws(() => recordReserve(file, { by: 'H04', budget: '224', overshoot: '22' }), /--by <H#>/);
  const set = recordReserve(file, { by: 'H4', budget: '224', overshoot: '22', note: 'n' });
  assert.equal(set.written, true);
  const after = readLedger(file);
  assert.deepEqual({ ...after.reserve, at: undefined }, { phase: 'H8', setBy: 'H4', briefs: 20, sessionBudgetCents: 224, overshootCents: 22, criticCents: 0, cents: 4_920, at: undefined, note: 'n' });
  assert.equal(after.kept, 'another key');
  assert.equal(after.entries.length, 1);
  const tooBig = recordReserve(file, { by: 'H5', budget: '500', overshoot: '22', critic: '22' });
  assert.equal(tooBig.written, false, '20 x $5.44 is more than the $97.34 left');
  assert.equal(readLedger(file).reserve.setBy, 'H4', 'the refused revision wrote nothing');
  // The wall's margin follows the reserve unless the run names another, as H6 does for its critic.
  assert.equal(admit(after, { budgetCents: 224, phase: 'H5' }).marginCents, 22);
  assert.equal(admit(after, { budgetCents: 224, criticCents: 22, phase: 'H5' }).marginCents, 44);
  assert.equal(admit(emptyLedger(), { budgetCents: 224 }).marginCents, 50, 'no reserve yet: 5.2\'s estimate');
});

test('the committed ledger holds the exam reserve the wall reads, and H4 closed at $0 with no session', () => {
  const ledger = readLedger(LEDGER_FILE);
  const r = ledger.reserve;
  assert.deepEqual({ phase: r.phase, briefs: r.briefs }, { phase: 'H8', briefs: 20 });
  assert.ok(r.overshootCents >= 22, 'o never below the largest request H3 measured');
  assert.ok(Number.isInteger(agentSessionBudgetCents()), 'agent.md carries the session budget default');
  if (r.setBy === 'H4') {
    // H4's reserve, while it is the committed one; a revision in H5 to H7 states its own numbers in its evidence.
    const graphic = ledger.entries.find((e) => e.phase === 'H3' && e.stage === 'graphic');
    assert.equal(r.sessionBudgetCents, Math.ceil(1.5 * graphic.listCostCents), 'B = round-up(1.5 m), m the one Opus graphic H3 measured');
    assert.equal(agentSessionBudgetCents(), r.sessionBudgetCents, 'the session budget default in agent.md is the B the reserve holds');
    assert.deepEqual([r.overshootCents, r.criticCents, r.cents], [22, 0, 4_920], 'o as phase-4.md decides, no critic yet');
  }
  assert.equal(phaseCompleted(ledger, 'H4'), true);
  assert.equal(ledger.entries.filter((e) => e.phase === 'H4' && e.kind === 'session').length, 0, 'H4 created no session');
  assert.equal(phaseSpentCents(ledger, 'H4'), 0);
  // The wall on a copy of the committed ledger: spend tuning down to one cent short of a session beside the reserve.
  const copy = structuredClone(ledger);
  appendEntry(copy, { kind: 'session', phase: 'H5', funding: 'credit', sessionId: 'sesn_synthetic', listCostCents: remainingCents(copy, 'H5') - (r.sessionBudgetCents + r.overshootCents) + 1, outcome: 'delivered' });
  assert.equal(admit(copy, { budgetCents: r.sessionBudgetCents, overshootCents: r.overshootCents, phase: 'H6' }).ok, false);
  assert.equal(admit(copy, { budgetCents: r.sessionBudgetCents, overshootCents: r.overshootCents, phase: 'H8', ceilingCents: r.cents }).ok, true);
});

// ── one brief through both arms, on a stand-in CLI ─────────────────────────────────────────

const DIGEST = `sha256:${'d'.repeat(64)}`;

function template() {
  return {
    name: 'Control board',
    type: 'scoreboard',
    resolution: { width: 1920, height: 1080, label: '1920×1080' },
    fps: 50,
    html: '<!doctype html><html><body><script>window.SPXGCTemplateDefinition = { DataFields: [] };</script><div id="f0"></div></body></html>',
    css: '',
    js: 'function play(){} function stop(){} function update(d){} function next(){}',
    fields: [{ field: 'f0', ftype: 'textfield', title: 'Home team', value: 'Home' }],
    settings: { playserver: 'OVERLAY' },
    assets: [],
    layers: [],
  };
}

/** What the CLI's verbs write and print, without a browser. `digest` is the version it reports. */
function fakeCli({ digest = DIGEST, buttons = ['goalA', 'clearFlag', 'final'] } = {}) {
  const calls = [];
  const cli = async (args, { cwd } = {}) => {
    calls.push(args);
    const [verb] = args;
    const out = (flag) => args[args.indexOf(flag) + 1];
    let json = { ok: true };
    if (verb === 'scaffold') mkdirSync(out('--out'), { recursive: true });
    if (verb === 'validate') json = { ok: true, digest, validation: { merged: { errors: [], warnings: [] } } };
    if (verb === 'record') {
      const file = out('--out');
      mkdirSync(path.dirname(file), { recursive: true });
      const zip = file.replace(/\.json$/, '.zip');
      writeFileSync(zip, 'PK-fake');
      writeFileSync(file, JSON.stringify({ format: 'noacg-record-v1', digest, doc: api.graphicDoc.newGraphicDoc(template(), { name: 'Control board', origin: { tool: 'noacg-cli', version: 'test' } }) }));
      json = { ok: true, file, zip, digest };
    }
    if (verb === 'coverage') {
      const dir = out('--out');
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'sample-video.jpg'), 'jpg');
      writeFileSync(path.join(dir, 'take-00020ms.jpg'), 'jpg');
      writeFileSync(path.join(dir, 'coverage.json'), JSON.stringify({ digest, frames: [{ file: 'sample-video.jpg', render: 'sample-video', state: 'on air, settled', values: 'sample', ground: 'video', atMs: 1500 }, { file: 'take-00020ms.jpg', render: 'take', state: 'the Take', values: 'sample', ground: 'video', atMs: 20 }], crops: [] }));
      json = { ok: true, frames: 2, crops: 0, findings: [], failures: [], digest };
    }
    if (verb === 'inspect') json = { ok: true, inspection: { descriptors: [{ key: 'f0' }], buttons: buttons.map((event) => ({ event })) } };
    void cwd;
    return { code: 0, json, stdout: JSON.stringify(json), stderr: '' };
  };
  cli.calls = calls;
  cli.url = 'http://stand-in';
  return cli;
}

const BRIEF = { id: 'test-board', kind: 'noacg', type: 'scoreboard', neutral: true, prompt: 'A scoreboard', stress: { f0: 'A very long team name' }, expect: { fields: 1, actions: ['clearFlag', 'final'] } };
const ENTRY = { phase: 'H1', stage: 'test', budgetCents: 300, overshootCents: 50 };

/** The managed-agents arm on the stub, its agent being the fake arm's work through the stand-in CLI. */
function stubbedArm({ scenario = 'end_turn', funding = 'none', cli, client = api.client }) {
  const briefs = new Map();
  const stub = api.stub.createManagedAgentsStub({
    scenario,
    runningReads: 1,
    agent: async (sessionId, params) => {
      const brief = briefs.get(params.metadata.run_id);
      const dir = tmp();
      await cli([...scaffoldArgs(brief, path.join(dir, 'graphic')), '--json']);
      await cli(['validate', path.join(dir, 'graphic'), '--json']);
      await cli(['record', path.join(dir, 'graphic'), '--out', path.join(dir, 'out', 'record.json'), '--json']);
      return {
        outputs: [{ filename: 'record.json', bytes: readFileSync(path.join(dir, 'out', 'record.json')) }, { filename: 'record.zip', bytes: readFileSync(path.join(dir, 'out', 'record.zip')) }],
        commands: [{ command: 'noacg validate /workspace/graphic --json', output: JSON.stringify({ ok: true, digest: DIGEST }) }, { command: 'noacg record /workspace/graphic --out /mnt/session/outputs/record.json', output: `Digest: ${DIGEST}` }],
      };
    },
  });
  const arm = managedAgentsArm({ api: stub, client, agent: { id: 'agent_t', version: 1 }, environmentId: 'env_t', budgetCents: 300, model: 'stub', funding, pollMs: 0 });
  const run = arm.run;
  return { ...arm, stub, run: (ctx) => { briefs.set(ctx.runId, ctx.brief); return run(ctx); } };
}

test('the fake arm and the stubbed managed-agents arm deliver through record, shape check, capture and ledger at $0', async () => {
  const cli = fakeCli();
  const ledger = emptyLedger();
  const dir = tmp();
  const fake = await runCell({ arm: fakeArm(), brief: BRIEF, cellDir: path.join(dir, 'fake'), cli, ledger, entry: ENTRY, shape: api.shape, runId: 'r1' });
  const ma = stubbedArm({ cli });
  const managed = await runCell({ arm: ma, brief: BRIEF, cellDir: path.join(dir, 'ma'), cli, ledger, entry: ENTRY, shape: api.shape, runId: 'r2' });
  for (const cell of [fake, managed]) {
    assert.equal(cell.outcome, 'delivered');
    assert.deepEqual(cell.shape, { ok: true }, 'the save door\'s own shape check passes the handed-in record');
    assert.equal(cell.validation.ok, true);
    assert.equal(cell.capture.frames, 2);
    assert.deepEqual(cell.digest.problems, [], 'the record, the delivered zip and the last reviewed version are one');
    assert.deepEqual(cell.operator.missing, []);
    assert.equal(cell.functional, true);
  }
  assert.deepEqual(scaffoldArgs(BRIEF, 'g').slice(0, 5), ['scaffold', '--type', 'scoreboard', '--design', 'neutral'], 'a neutral type starts from its neutral spine');
  assert.ok(cli.calls.some((a) => a[0] === 'coverage' && a.includes('--stress')), 'the bench captures with the brief\'s stress values');
  assert.deepEqual(managed.cleanup, { filesDeleted: 2, sessionDeleted: true, sessionGone: true, filesLeft: 0 }, 'the session and its files answer not found after');
  assert.deepEqual(managed.progress, ['Checking the graphic', 'Handing it in']);
  const created = ma.stub.calls.find((c) => c.method === 'sessions.create').args[0];
  assert.deepEqual(created.budget, { type: 'limit', max_list_cost: { amount: '300', currency: 'USD' } });
  assert.equal(created.initial_events[0].content[0].text, 'Brief: A scoreboard\nGraphic type: scoreboard (the user chose it).');
  assert.equal(ledger.entries.length, 2);
  assert.equal(spentCents(ledger), 0, '$0 recorded');
  assert.deepEqual(ledger.entries.map((e) => [e.arm, e.outcome, e.listCostCents]), [['fake', 'delivered', 0], ['managed-agents', 'delivered', 0]]);
});

test('a session paused at its budget hands in its last record as not ready; a refusal hands in nothing', async () => {
  const cli = fakeCli();
  const ledger = emptyLedger();
  const dir = tmp();
  const budget = await runCell({ arm: stubbedArm({ scenario: 'budget_reached', cli }), brief: BRIEF, cellDir: path.join(dir, 'b'), cli, ledger, entry: ENTRY, shape: api.shape, runId: 'r3' });
  assert.equal(budget.outcome, 'not-ready');
  assert.equal(budget.shape.ok, true);
  const refusal = await runCell({ arm: stubbedArm({ scenario: 'refusal', cli }), brief: BRIEF, cellDir: path.join(dir, 'r'), cli, ledger, entry: ENTRY, shape: api.shape, runId: 'r4' });
  assert.equal(refusal.outcome, 'failed');
  assert.equal(refusal.reason, 'refusal');
});

test('a short ledger starts nothing: the session is refused before it is created, and the refusal is recorded', async () => {
  const cli = fakeCli();
  const ledger = emptyLedger();
  appendEntry(ledger, { kind: 'session', phase: 'H3', funding: 'credit', sessionId: 'sesn_spent', listCostCents: 9_900, outcome: 'delivered' });
  const arm = stubbedArm({ cli, funding: 'credit' });
  const cell = await runCell({ arm, brief: BRIEF, cellDir: path.join(tmp(), 'w'), cli, ledger, entry: ENTRY, shape: api.shape, runId: 'r5' });
  assert.match(cell.refused, /\$1\.00 left/);
  assert.equal(arm.stub.sessions.size, 0, 'no session was created');
  assert.equal(cli.calls.length, 0, 'nothing ran');
  assert.deepEqual(ledger.entries.at(-1).outcome, 'refused');
});

test('a session that fails after it was created is still stopped, read, deleted and named in the ledger', async () => {
  const cli = fakeCli();
  const ledger = emptyLedger();
  const broken = { ...api.client, downloadFile: async () => { throw new Error('download failed'); } };
  const arm = stubbedArm({ cli, client: broken });
  const cell = await runCell({ arm, brief: BRIEF, cellDir: path.join(tmp(), 'f'), cli, ledger, entry: ENTRY, shape: api.shape, runId: 'r6' });
  assert.equal(cell.outcome, 'failed');
  assert.match(cell.reason, /download failed/);
  assert.ok(cell.sessionId, 'the cell names the session it paid for');
  assert.equal(cell.cleanup.sessionGone, true, 'and the session is gone');
  assert.equal(ledger.entries.at(-1).sessionId, cell.sessionId);
});

test('a resumed --build runs only what the ledger does not already hold for that phase', () => {
  const ledger = emptyLedger();
  appendEntry(ledger, { kind: 'session', phase: 'H3', brief: 'a', arm: 'managed-agents', funding: 'credit', sessionId: 's1', listCostCents: 120, outcome: 'delivered' });
  appendEntry(ledger, { kind: 'session', phase: 'H3', brief: 'b', arm: 'managed-agents', funding: 'credit', listCostCents: 0, outcome: 'refused' });
  appendEntry(ledger, { kind: 'session', phase: 'H2', brief: 'c', arm: 'managed-agents', funding: 'credit', sessionId: 's2', listCostCents: 90, outcome: 'failed' });
  const arm = { id: 'managed-agents' };
  const cells = ['a', 'b', 'c'].map((id) => ({ id, brief: { id }, arm }));
  assert.deepEqual(pendingCells(ledger, 'H3', cells).map((c) => c.id), ['b', 'c'], 'a paid cell is never paid twice; a refused one, or another phase\'s, runs');
  // A model run as a per-session override is the same arm id: the model tells the cells apart.
  appendEntry(ledger, { kind: 'session', phase: 'H4', brief: 'a', arm: 'managed-agents', model: 'claude-opus-5-5', funding: 'credit', sessionId: 's3', listCostCents: 150, outcome: 'delivered' });
  const onModel = (model) => [{ id: `a.${model}`, brief: { id: 'a' }, arm: { id: 'managed-agents', model } }];
  assert.deepEqual(pendingCells(ledger, 'H4', onModel('claude-opus-5-5')), []);
  assert.equal(pendingCells(ledger, 'H4', onModel('claude-sonnet-5-5')).length, 1, 'Sonnet on the brief Opus ran is another cell');
});

test('a delivered version that is not the one last reviewed, or a missing action, is caught', () => {
  assert.equal(digestCheck({ delivered: 'sha256:a', benchValidated: 'sha256:a', reviewed: 'sha256:b' }).ok, false);
  assert.equal(digestCheck({ delivered: 'sha256:a', benchValidated: 'sha256:c', reviewed: 'sha256:a' }).ok, false);
  assert.equal(digestCheck({ delivered: 'sha256:a', benchValidated: 'sha256:a', reviewed: null }).ok, false, 'no review is never assumed');
  assert.deepEqual(missingActions(BRIEF, [{ event: 'Final' }]), ['clearFlag'], 'case-insensitive, and a missing one named');
  // A brief's words against a package's names (H1's alias trap): the scoreboard type's goal press is
  // the brief's flag, an authored name may hold the action's words, and clearFlag is not a flag.
  const board = { expect: { actions: ['flag', 'clearFlag', 'final'], aliases: { flag: ['goal'] } } };
  assert.deepEqual(missingActions(board, ['goalA', 'goalB', 'clearFlag', 'final']), []);
  assert.deepEqual(missingActions(board, ['flagA', 'flagB', 'clearFlag', 'final']), []);
  assert.deepEqual(missingActions(board, ['clearFlag', 'final']), ['flag'], 'clearFlag offers only itself');
  assert.deepEqual(missingActions({ expect: { actions: ['switch', 'penalty', 'reset'] } }, ['switchSpeaker', 'addPenalty', 'reset-clocks']), []);
  assert.deepEqual(missingActions({ expect: { actions: ['pause', 'resume'] } }, ['paused', 'start']), ['pause', 'resume'], 'whole words only');
});

test('a stress value keyed by what the field is reaches that field in any field order', () => {
  const brief = { id: 'vote', stress: { question: 'Q?', options: 'A | 1\nB | 2', f3: 'by position', logo: 'bright: a crest' } };
  const read = (descriptors) => JSON.parse(readFileSync(stressFile({ brief, descriptors, cellDir: tmp() }), 'utf8')).stress;
  // The registered poll's order, and an authored order with a kicker first (H5's live-vote cells).
  assert.deepEqual(read([{ key: 'f0', label: 'Options (Answer | %)' }, { key: 'f1', label: 'Question' }]), { f1: 'Q?', f0: 'A | 1\nB | 2', f3: 'by position', logo: 'bright: a crest' });
  assert.deepEqual(read([{ key: 'f0', label: 'Kicker' }, { key: 'f1', label: 'Question' }, { key: 'f2', label: 'Options - one per line: Label | 47' }]), { f1: 'Q?', f2: 'A | 1\nB | 2', f3: 'by position', logo: 'bright: a crest' });
  assert.deepEqual(read([{ key: 'f0', label: 'Questionnaire' }]).question, 'Q?', 'a whole word, or the key stays for coverage to name unmapped');
  const debate = { id: 'debate', stress: { 'speaker a': 'Government', 'clock a': '180' } };
  const fields = [{ key: 'f0', label: 'Round label' }, { key: 'f1', label: 'Side A' }, { key: 'f2', label: 'Speaker A' }, { key: 'f5', label: 'Clock A (seconds left)' }];
  assert.deepEqual(JSON.parse(readFileSync(stressFile({ brief: debate, descriptors: fields, cellDir: tmp() }), 'utf8')).stress, { f2: 'Government', f5: '180' }, 'several words, in order');
  assert.equal(lastReviewed([{ args: ['validate'], digest: 'sha256:1' }, { args: ['coverage'], digest: 'sha256:2' }, { args: ['record'], digest: 'sha256:3' }]), 'sha256:2');
});

test('the archived reference arm re-captures an August cell at $0 through the shared half', async () => {
  const cli = fakeCli();
  const cellsDir = tmp();
  mkdirSync(path.join(cellsDir, `${BRIEF.id}.A`, 'graphic'), { recursive: true });
  writeFileSync(path.join(cellsDir, `${BRIEF.id}.A`, 'graphic', 'graphic.html'), '<div></div>');
  const ledger = emptyLedger();
  const dir = tmp();
  const cell = await runCell({ arm: archivedArm({ cellsDir }), brief: BRIEF, cellDir: path.join(dir, 'ref'), cli, ledger, entry: { ...ENTRY, stage: 'reference' }, shape: api.shape, runId: 'ref' });
  assert.equal(cell.outcome, 'delivered');
  assert.equal(cell.arm, 'august-A');
  assert.ok(cell.digest.ok && cell.capture.frames > 0, 'recorded, captured, one version');
  assert.ok(existsSync(path.join(dir, 'ref', 'work', 'graphic', 'graphic.html')), 'the archive is copied, never written');
  assert.equal(ledger.entries.at(-1).funding, 'none');
  assert.equal(ledger.entries.at(-1).listCostCents, 0);
  const missing = await runCell({ arm: archivedArm({ cellsDir, configuration: 'B' }), brief: BRIEF, cellDir: path.join(dir, 'none'), cli, ledger, entry: ENTRY, shape: api.shape, runId: 'none' });
  assert.equal(missing.outcome, 'failed', 'a configuration the round did not run fails, never stands in');
});

test('the gallery shows opaque ids, never an arm, and keeps the key beside it', async () => {
  const cli = fakeCli();
  const ledger = emptyLedger();
  const runDir = tmp();
  const cells = [];
  for (const arm of [fakeArm(), stubbedArm({ cli })]) {
    const id = `${BRIEF.id}.${arm.id}`;
    const dir = path.join(runDir, 'cells', id);
    const cell = await runCell({ arm, brief: BRIEF, cellDir: dir, cli, ledger, entry: ENTRY, shape: api.shape, runId: id });
    cells.push({ id, dir, brief: BRIEF.id, arm: arm.id, model: arm.model, cell });
  }
  const g = buildGallery({ runDir, cells, briefs: [BRIEF] });
  const html = readFileSync(g.review, 'utf8');
  assert.equal(g.ids.length, 2);
  for (const id of g.ids) assert.ok(html.includes(id));
  assert.doesNotMatch(html, /managed-agents|fake|claude-code/, 'no arm name on the page');
  assert.match(html, /take-00020ms\.jpg/, 'the strips are on it');
  const key = JSON.parse(readFileSync(g.key, 'utf8'));
  assert.deepEqual(Object.values(key).map((k) => k.arm).sort(), ['fake', 'managed-agents']);
  assert.ok(existsSync(g.notes));
});

// ── the subscription half (5.4) ────────────────────────────────────────────────────────────

test('a subscription child\'s environment is built from scratch and carries no key', () => {
  const home = tmp();
  const env = subscriptionEnv({ token: 'oauth-token', home, noacgUrl: 'https://noacg.studio', pathDirs: ['/bin/a', '/bin/b'], platform: 'win32', from: { ANTHROPIC_API_KEY: 'k', ANTHROPIC_BENCH_API_KEY: 'b', SystemRoot: 'C:\\Windows', SECRET_THING: 'x', PATH: '/everything' } });
  assert.equal(env.ANTHROPIC_API_KEY, undefined);
  assert.equal(env.ANTHROPIC_BENCH_API_KEY, undefined);
  assert.equal(env.SECRET_THING, undefined, 'nothing is copied but what Windows needs to start a process');
  assert.equal(env.SystemRoot, 'C:\\Windows');
  assert.equal(env.PATH, ['/bin/a', '/bin/b'].join(path.delimiter));
  assert.equal(env.CLAUDE_CODE_OAUTH_TOKEN, 'oauth-token');
  assert.equal(env.CLAUDE_CODE_DISABLE_CLAUDE_MDS, '1', 'HOME alone does not stop the owner\'s CLAUDE.md loading on Windows');
  assert.equal(env.CLAUDE_CODE_DISABLE_AUTO_MEMORY, '1');
  for (const name of ['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'CLAUDE_CONFIG_DIR']) assert.ok(env[name].startsWith(home), `${name} inside the fresh home`);
  assert.equal(env.NOACG_URL, 'https://noacg.studio');
  assert.throws(() => assertNoKeys({ ...env, ANTHROPIC_API_KEY: 'k' }), /ANTHROPIC_API_KEY/);
  assert.throws(() => assertNoKeys({ ...env, ANTHROPIC_AUTH_TOKEN: 't' }), /ANTHROPIC_AUTH_TOKEN/);
  assert.throws(() => subscriptionEnv({ token: '', home, pathDirs: [] }), /CLAUDE_CODE_OAUTH_TOKEN/);
});

test('nothing starts unless claude auth status in that environment reports the OAuth token', () => {
  const answering = (status) => () => ({ status: 0, stdout: JSON.stringify(status), stderr: '' });
  assert.throws(() => checkSubscriptionAuth({ claude: 'claude', env: {}, run: answering({ loggedIn: true, authMethod: 'api_key' }) }), /did not report the OAuth token/);
  assert.throws(() => checkSubscriptionAuth({ claude: 'claude', env: {}, run: answering({ loggedIn: false, authMethod: 'oauth_token' }) }), /did not report/);
  assert.throws(() => checkSubscriptionAuth({ claude: 'claude', env: {}, run: () => ({ status: 1, stdout: '', stderr: 'boom' }) }), /boom/);
  assert.equal(checkSubscriptionAuth({ claude: 'claude', env: {}, run: answering({ loggedIn: true, authMethod: 'oauth_token' }) }).authMethod, 'oauth_token');
  assert.deepEqual(usageLimit({ result: 'Claude AI usage limit reached|1792000000' }), { resetsAt: new Date(1792000000 * 1000).toISOString() });
  assert.equal(usageLimit({ result: 'done' }), null);
  // Claude Code 2.1.296's wording, a wall-clock reset in a named zone (Kyiv is UTC+3 in October).
  assert.deepEqual(usageLimit({ result: "You've hit your session limit · resets 12:20am (Europe/Kyiv)" }, Date.parse('2026-10-14T20:57:00Z')), { resetsAt: '2026-10-14T21:20:00.000Z' });
  assert.deepEqual(usageLimit({ result: "You've hit your session limit · resets 3pm (Europe/Kyiv)" }, Date.parse('2026-10-14T20:57:00Z')), { resetsAt: '2026-10-15T12:00:00.000Z' });
});

test('the reference arm runs claude -p outside the repository, on the subscription, with the plugin and the shimmed CLI', async () => {
  const seen = [];
  const run = (file, args, opts) => {
    seen.push({ args, env: opts.env, cwd: opts.cwd });
    if (args.includes('status')) return { status: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: 'oauth_token' }), stderr: '' };
    mkdirSync(path.join(opts.cwd, 'outputs'), { recursive: true });
    writeFileSync(path.join(opts.cwd, 'outputs', 'record.json'), '{}');
    writeFileSync(path.join(opts.cwd, 'outputs', 'record.zip'), 'PK');
    return { status: 0, stdout: JSON.stringify({ session_id: 'cc-1', num_turns: 12, total_cost_usd: 4.2, is_error: false, result: 'done' }), stderr: '' };
  };
  const arm = claudeCodeArm({ claude: 'claude', token: 'oauth-token', model: 'claude-opus-5-5', url: 'https://noacg.studio', run });
  const result = await arm.run({ brief: BRIEF, cellDir: tmp() });
  assert.equal(result.outcome, 'delivered');
  assert.equal(result.costCents, 0, 'the subscription spends no credit');
  assert.equal(result.notionalUsd, 4.2);
  assert.equal(arm.funding, 'subscription');
  const [auth, session] = seen;
  assert.ok(auth.args.includes('status'), 'auth status first');
  assert.deepEqual(auth.env, session.env, 'checked in the very environment the session gets');
  assert.equal(Object.keys(session.env).filter((k) => /API_KEY|BENCH/.test(k)).length, 0);
  assert.ok(session.args.includes('--plugin-dir') && session.args.includes('--strict-mcp-config'));
  assert.ok(!path.resolve(session.cwd).startsWith(ROOT + path.sep), 'outside the repository');
  assert.ok(session.env.PATH.split(path.delimiter)[0].endsWith('bin'), 'the shimmed noacg comes first on PATH');
  await assert.rejects(() => arm.run({ brief: BRIEF, cellDir: path.join(ROOT, 'benchmarks', 'harness', 'never') }), /outside the repository/);
});

// ── AC-3: the frozen judge ─────────────────────────────────────────────────────────────────

const JUDGE_DIR = path.join(HARNESS, 'judge');

/** A copy of the committed judge, to tamper with. */
function judgeCopy() {
  const dir = tmp();
  for (const name of ['prompt.md', 'rubric.json', 'judge.lock.json']) writeFileSync(path.join(dir, name), readFileSync(path.join(JUDGE_DIR, name)));
  return dir;
}

/** A stand-in `claude -p` judging run: answers `better` (or `airable`) from the model `model`. */
const judging = ({ model, answer, calls = [] }) => (file, args, opts) => {
  calls.push({ args, cwd: opts.cwd, input: opts.input, files: Object.fromEntries(readdirSync(opts.cwd).map((f) => [f, readFileSync(path.join(opts.cwd, f), 'utf8')])) });
  return { status: 0, stdout: JSON.stringify({ session_id: `j-${calls.length}`, num_turns: 3, total_cost_usd: 0.3, is_error: false, result: '', structured_output: typeof answer === 'function' ? answer(opts.input, calls.length) : answer, modelUsage: { [model]: {} } }), stderr: '' };
};

test('the committed judge is frozen on a pinned model id, and a judge whose files changed is refused', () => {
  const judge = loadJudge(JUDGE_DIR);
  assert.equal(judge.frozen, true, 'judge.lock.json holds the prompt and rubric as they are');
  assert.match(judge.lock.model, /^claude-[a-z]+-\d+-\d+$/, 'the exact model id claude -p reported, not an alias');
  for (const task of ['single', 'pairwise']) assert.equal(judge.rubric[task].schema.type, 'object', `the rubric's ${task} schema`);
  for (const [name, change] of [['prompt.md', (s) => `${s}\nBe kinder.\n`], ['rubric.json', (s) => s.replace('"version": 1', '"version": 2')]]) {
    const dir = judgeCopy();
    writeFileSync(path.join(dir, name), change(readFileSync(path.join(dir, name), 'utf8')));
    assert.throws(() => loadJudge(dir), /changed after it was frozen/, `a changed ${name}`);
  }
  // Line endings are not a change: a Windows checkout reads the same judge.
  const crlf = judgeCopy();
  writeFileSync(path.join(crlf, 'prompt.md'), readFileSync(path.join(crlf, 'prompt.md'), 'utf8').replace(/\r?\n/g, '\r\n'));
  assert.equal(loadJudge(crlf).frozen, true);
  assert.equal(loadJudge(tmp()).frozen, false, 'no lock, no judge');
});

test('a judgement is claude -p with the frozen prompt as its system prompt, Read only and the rubric schema', () => {
  const judge = loadJudge(JUDGE_DIR);
  const call = judgeInvocation(judge, { task: 'pairwise', brief: BRIEF.prompt, graphics: [{ label: 'A', frames: [{ file: 'A-1.png', caption: 'on air' }] }, { label: 'B', frames: [{ file: 'B-1.png', caption: 'on air' }] }], operator: { A: ['final'], B: [] }, actions: ['final'] });
  const arg = (name) => call.args[call.args.indexOf(name) + 1];
  assert.equal(arg('--model'), judge.lock.model);
  assert.equal(arg('--tools'), 'Read');
  assert.equal(arg('--system-prompt'), judge.prompt.trim());
  assert.deepEqual(JSON.parse(arg('--json-schema')), judge.rubric.pairwise.schema);
  assert.ok(call.args.includes('--strict-mcp-config') && call.args.includes('--no-session-persistence'));
  assert.match(call.prompt, /- A-1\.png: on air/);
  assert.match(call.prompt, /Operator surface of graphic B \(from noacg inspect\): no buttons/);
  assert.throws(() => judgeInvocation(loadJudge(tmp()), { brief: 'x', graphics: [] }), /no judgement before the judge is frozen/);
});

test('a pair is judged in both orders, and a preference that flips with the order is a tie', async () => {
  const judge = loadJudge(JUDGE_DIR);
  const frames = (name) => {
    const dir = tmp();
    writeFileSync(path.join(dir, `${name}.png`), name);
    return [{ file: path.join(dir, `${name}.png`), caption: 'on air' }];
  };
  const x = { id: 'good', frames: frames('good') };
  const y = { id: 'bad', frames: frames('bad') };
  const pick = (better) => ({ airable: { A: true, B: false }, better, confidence: 'high', problems: { A: [], B: [] }, reasons: '' });
  const calls = [];
  // Good is A in the first order and B in the second: a judge that reads the picture says A, then B.
  const stable = await judgePair(judge, { brief: 'b', x, y, xFirst: true, dir: tmp(), claude: 'claude', env: {}, run: judging({ model: judge.lock.model, calls, answer: (input, n) => pick(n === 1 ? 'A' : 'B') }) });
  assert.equal(calls.length, 2, 'both orders');
  assert.equal(stable.combined, 'good', 'good was A first and B second, and was preferred both times');
  assert.equal(calls[0].files['A-1.png'], 'good');
  assert.equal(calls[1].files['A-1.png'], 'bad', 'the second order swaps them');
  for (const c of calls) {
    assert.match(path.basename(c.cwd), /^nj-/, 'the judge works in a directory whose name says nothing');
    assert.deepEqual(Object.keys(c.files).sort(), ['A-1.png', 'B-1.png'], 'holding only the frames');
    assert.equal(existsSync(c.cwd), false, 'and removed afterwards');
  }
  const flipped = await judgePair(judge, { brief: 'b', x, y, dir: tmp(), claude: 'claude', env: {}, run: judging({ model: judge.lock.model, answer: pick('A') }) });
  assert.equal(flipped.combined, 'tie', 'always "A" is an order effect, not a preference');
  assert.equal(combinePair({ a: 'p', b: 'q', answer: { better: 'B' } }, { a: 'q', b: 'p', answer: { better: 'A' } }), 'q');
  const other = await judgeSingle(judge, { brief: 'b', frames: x.frames, dir: tmp(), claude: 'claude', env: {}, run: judging({ model: 'claude-other-1-0', answer: { airable: true } }) });
  assert.match(other.error, /not served by the pinned model/, 'an answer from another model is not the calibrated judge');
  const helped = (file, args, opts) => ({ status: 0, stdout: JSON.stringify({ is_error: false, structured_output: { airable: true }, modelUsage: { [judge.lock.model]: { outputTokens: 10 }, 'claude-other-1-0': { outputTokens: 900 } } }), stderr: '', cwd: opts.cwd });
  assert.match((await judgeSingle(judge, { brief: 'b', frames: x.frames, dir: tmp(), claude: 'claude', env: {}, run: helped })).error, /not served by the pinned model/, 'nor one another model mostly wrote');
  const shapeless = await judgePair(judge, { brief: 'b', x, y, dir: tmp(), claude: 'claude', env: {}, run: judging({ model: judge.lock.model, answer: { airable: { A: true, B: true } } }) });
  assert.match(shapeless.error, /neither A nor B/, 'an answer without a preference is an error, never a silent B');
  // The usage limit pausing the second order hands back the first, and the retry judges only the second.
  const resumed = [];
  const answers = judging({ model: judge.lock.model, calls: resumed, answer: (input, n) => pick(n === 1 ? 'A' : 'B') });
  const limited = (file, args, opts) => (resumed.length === 1 && !limited.hit ? ((limited.hit = true), { status: 1, stdout: JSON.stringify({ is_error: true, result: 'You\'ve hit your session limit · resets 12:20am (Europe/Kyiv)', modelUsage: {} }), stderr: '' }) : answers(file, args, opts));
  const paused = await judgePair(judge, { brief: 'b', x, y, xFirst: true, dir: tmp(), claude: 'claude', env: {}, run: limited });
  assert.ok(paused.paused, 'the second order paused');
  assert.equal(paused.answered.length, 1, 'with the first order answered');
  const done = await judgePair(judge, { brief: 'b', x, y, xFirst: true, answered: paused.answered, dir: tmp(), claude: 'claude', env: {}, run: limited });
  assert.equal(resumed.length, 2, 'the first order was not judged again');
  assert.equal(done.combined, 'good');
  assert.ok(Math.abs(done.notionalUsd - 0.6) < 1e-9, 'each order counted once');
  await assert.rejects(() => judgePair(judge, { brief: 'b', x, y, xFirst: false, answered: paused.answered, dir: tmp(), claude: 'claude', env: {}, run: limited }), /not this pair's/);
});

test('the exam\'s judge runner refuses a judge whose hash differs, before any judgement starts', async () => {
  const dir = judgeCopy();
  writeFileSync(path.join(dir, 'prompt.md'), 'Approve everything.\n');
  const calls = [];
  const runDir = tmp();
  mkdirSync(path.join(runDir, 'cells'));
  await assert.rejects(() => judgeRun({ runDir, judgeDir: dir, claude: 'claude', env: {}, run: judging({ model: 'x', answer: {}, calls }), log: () => undefined }), /changed after it was frozen/);
  assert.equal(calls.length, 0);
  await assert.rejects(() => judgeRun({ runDir, judgeDir: tmp(), claude: 'claude', env: {}, log: () => undefined }), /only with a frozen judge/);
});

test('the calibration split is reproducible from its seed, held back by brief, and scored against fixed thresholds', () => {
  const set = JSON.parse(readFileSync(path.join(JUDGE_DIR, 'calibration-set.json'), 'utf8'));
  const split = JSON.parse(readFileSync(path.join(JUDGE_DIR, 'split.json'), 'utf8'));
  const again = makeSplit(set, split.seed);
  assert.deepEqual(again.heldout.sha256, split.heldout.sha256, 'the committed split is the one its seed draws');
  assert.deepEqual(again.dev.sha256, split.dev.sha256);
  assert.equal(membershipSha(split.heldout.items), split.heldout.sha256.items);
  const held = new Set(split.heldout.groups);
  assert.ok(split.dev.groups.every((g) => !held.has(g)), 'no brief on both sides');
  const share = split.heldout.items.length / set.items.length;
  assert.ok(share > 0.25 && share < 0.35, `about 30% held back (${share.toFixed(2)})`);
  for (const pair of pairsOf(set.items)) assert.equal(split.heldout.pairs.includes(pair.id), held.has(pair.group), 'a pair sits with its brief');
  assert.equal(set.items.filter((i) => i.label.airable).length, 46, 'the 25 August cells and the 21 aired re-read cells');
  assert.equal(set.items.filter((i) => i.id.startsWith('ts:')).length, 29, 'the type sweep\'s 18 minimax and 11 gemini FAIL and TWEAKS');

  const byId = new Map(set.items.map((i) => [i.id, i]));
  const { items, pairs } = split.heldout;
  const answer = (said) => items.map((id) => ({ task: 'single', id, answer: { airable: said(byId.get(id)) } }));
  const prefer = (pick) => pairs.map((id) => ({ task: 'pairwise', id, combined: pick(id) }));
  const good = (id) => id.slice('pair:'.length).split('|')[0];
  const perfect = score({ items, pairs, byId, results: [...answer((i) => i.label.airable), ...prefer(good)] });
  assert.equal(perfect.pass, true);
  const approves = score({ items, pairs, byId, results: [...answer(() => true), ...prefer(good)] });
  assert.equal(approves.pass, false, 'a judge that approves everything fails');
  assert.ok(approves.single.basicFailsCalledAirable.length > 0);
  const flips = score({ items, pairs, byId, results: [...answer((i) => i.label.airable), ...prefer(() => 'tie')] });
  assert.equal(flips.pass, false, 'order flips count as errors');
  assert.equal(flips.pairwise.flips, pairs.length);
  const silent = score({ items, pairs, byId, results: [] });
  assert.equal(silent.single.agreed, 0, 'an unanswered item is an item the judge did not get right');
  assert.deepEqual(THRESHOLDS, { agreement: 0.85, pairwise: 0.9 });
});

// ── AC-2: the sealed exam ──────────────────────────────────────────────────────────────────

test('the exam briefs are sealed: the committed file has the seal\'s shape, and a wrong passphrase gets nothing', () => {
  const sealed = readSealed(path.join(HARNESS, 'exam', 'briefs.sealed'));
  assert.equal(sealedShape(sealed), null);
  assert.match(readFileSync(path.join(HARNESS, 'exam', 'briefs.sha256'), 'utf8').trim(), /^[0-9a-f]{64}\s+briefs\.json$/);
  assert.throws(() => openSealed(sealed, 'not the passphrase'), /unable to authenticate|Unsupported state/);
  // The refusal is the cipher's, not a format check: a file sealed here opens with its own passphrase only.
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync('right', salt, 32, { N: 16384, r: 8, p: 1 });
  const c = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([c.update('{"briefs":[]}'), c.final()]);
  const mine = { format: 'noacg-sealed-v1', cipher: 'aes-256-gcm', kdf: 'scrypt', N: 16384, r: 8, p: 1, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
  assert.equal(openSealed(mine, 'right').toString(), '{"briefs":[]}');
  assert.throws(() => openSealed(mine, 'wrong'));
  assert.equal(sealedShape({ ...mine, iv: 'AAAA' }), 'iv is not 12 bytes');
});

test('the sealed briefs decrypt to the committed hash, where the private passphrase is on this machine', (t) => {
  const file = privatePassphraseFile(ROOT);
  if (!file) {
    t.skip('no docs/private/harness-exam/passphrase.txt in the main checkout here (CI): the shape and the refusal above are what can be checked');
    return;
  }
  assert.equal(verifySealed({ sealedFile: path.join(HARNESS, 'exam', 'briefs.sealed'), hashFile: path.join(HARNESS, 'exam', 'briefs.sha256'), passphrase: readFileSync(file, 'utf8').trim() }), true);
});

test('no tuning run can reach an exam brief: the runner reads the tuning set only', () => {
  const source = readFileSync(path.join(ROOT, 'scripts', 'harness-bench.mjs'), 'utf8');
  assert.doesNotMatch(source, /briefs\.sealed|harness-exam/, 'the runner never names the sealed set or its private folder');
  assert.deepEqual(tuningBriefs(CONTROL_BRIEFS).map((b) => b.id), CONTROL_BRIEFS);
});

// ── AC-16: the container's system prompt, and the definitions it lives in ──────────────────

test('the container\'s system prompt is plumbing within 25 lines, on an agent with the web off', () => {
  const agent = readAgentDefinition(path.join(ROOT, 'agents', 'noacg-harness'));
  assert.ok(agent.systemLines <= SYSTEM_PROMPT_MAX_LINES, `${agent.systemLines} lines`);
  assert.match(agent.system, /noacg save/, 'it says save is never run');
  assert.match(agent.system, /\/mnt\/session\/outputs\/record\.json/, 'and where the record goes');
  const toolset = agent.config.tools.find((t) => t.type === 'agent_toolset_20260401');
  assert.deepEqual(toolset.configs.filter((c) => c.enabled === false).map((c) => c.name).sort(), ['web_fetch', 'web_search']);
  assert.equal(toolset.default_config.permission_policy.type, 'always_allow');
  assert.deepEqual(agent.config.model, { id: 'claude-opus-5-5', effort: 'high' }, 'D6: quality is established on Opus 5.5 at high');
  const env = readEnvironmentDefinition(path.join(ROOT, 'agents', 'noacg-harness'));
  assert.equal(env.config.networking.type, 'limited');
  assert.deepEqual(env.config.networking.allowed_hosts, ['noacg.studio']);
  const bare = { ...agent, config: { ...agent.config, multiagent: undefined } };
  const steps = syncPlan({ lock: null, environment: env, agent: bare, bundle: { sha256: 'x' } });
  assert.deepEqual(steps.map((s) => s.action), ['create', 'create', 'create']);
  const lock = { environment: { sha256: steps[0].sha256 }, skill: { bundleSha256: 'x' }, agent: { sha256: steps[2].sha256 } };
  assert.deepEqual(syncPlan({ lock, environment: env, agent: bare, bundle: { sha256: 'x' } }).map((s) => s.action), ['keep', 'keep', 'keep'], 'a second sync changes nothing');
  assert.deepEqual(syncPlan({ lock, environment: env, agent: bare, bundle: { sha256: 'y' } }).map((s) => s.action), ['keep', 'version', 'update'], 'a skill change is a new skill version and a new agent version');
  assert.throws(() => syncPlan({ lock, environment: env, agent: { ...agent, systemLines: 26 }, bundle: { sha256: 'x' } }), /25/);
});

test('the critic is the one subagent (D4): no workflows, no inline agents, no advisor, and it cannot edit', () => {
  const dir = path.join(ROOT, 'agents', 'noacg-harness');
  const { environment, agent, subagents } = readDefinitions(dir);
  assert.deepEqual(Object.keys(subagents), ['critic.md']);
  const m = agent.config.multiagent;
  assert.equal(m.type, 'multiagent_20261001');
  assert.deepEqual(m.workflows, { type: 'disabled' }, 'workflows are on by default with this type, so off explicitly (D4, 7.3)');
  assert.deepEqual(m.advisor, { type: 'disabled' });
  assert.deepEqual(m.subagents, { type: 'enabled', inline_agents: { type: 'disabled' }, predefined_agents: ['critic.md'] });
  assert.match(agent.system, /`critic` agent/, 'the author is told the critic exists and when to ask it');
  const critic = subagents['critic.md'];
  assert.ok(critic.systemLines <= SYSTEM_PROMPT_MAX_LINES, `${critic.systemLines} lines`);
  assert.equal(critic.config.name, 'critic');
  assert.equal(critic.config.multiagent, undefined, 'a listed agent may not list agents of its own');
  assert.match(critic.system, /references\/critique\.md/, 'what it checks lives in the skill (AC-16)');
  assert.match(critic.system, /noacg save/, 'it never saves');
  const toolset = critic.config.tools.find((t) => t.type === 'agent_toolset_20260401');
  assert.deepEqual(toolset.configs.filter((c) => c.enabled === false).map((c) => c.name).sort(), ['edit', 'web_fetch', 'web_search', 'write']);
  assert.deepEqual(critic.config.model, agent.config.model, '3.4: the same model as the author in H6');
  // The sync makes the critic first and pins its version on the agent.
  const steps = syncPlan({ lock: null, environment, agent, subagents, bundle: { sha256: 'x' } });
  assert.deepEqual(steps.map((s) => `${s.resource} ${s.action}`), ['environment create', 'skill create', 'critic.md create', 'agent create']);
  const lock = { environment: { sha256: steps[0].sha256 }, skill: { bundleSha256: 'x' }, subagents: { 'critic.md': { id: 'agent_c', version: 1, sha256: steps[2].sha256 } }, agent: { sha256: steps[3].sha256 } };
  assert.deepEqual(syncPlan({ lock, environment, agent, subagents, bundle: { sha256: 'x' } }).map((s) => s.action), ['keep', 'keep', 'keep', 'keep']);
  const edited = { ...critic, system: `${critic.system}\nOne more line.` };
  assert.deepEqual(syncPlan({ lock, environment, agent, subagents: { 'critic.md': edited }, bundle: { sha256: 'x' } }).map((s) => s.action), ['keep', 'keep', 'update', 'update'], 'a new critic version is a new agent version');
  const body = agentCreateBody(agent, { id: 'skill_1', version: 'skver_1' }, lock.subagents);
  assert.deepEqual(body.multiagent.subagents.predefined_agents, [{ type: 'agent', id: 'agent_c', version: 1 }]);
  assert.equal(agent.config.multiagent.subagents.predefined_agents[0], 'critic.md', 'the definition itself is left as written');
  assert.throws(() => agentCreateBody(agent, { id: 'skill_1', version: 'skver_1' }), /not been synced/);
});

test('a critic thread is measured apart: its events kept, its usage and largest request beside the session', async () => {
  const dir = tmp();
  const pages = (items) => ({ async *[Symbol.asyncIterator]() { yield* items; } });
  const usage = { input_tokens: 10, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, list_cost: { amount: '3', currency: 'USD' } };
  const listed = [];
  const api = { beta: { sessions: { threads: {
    list: () => pages([{ id: 'sthr_primary', parent_thread_id: null }, { id: 'sthr_critic', parent_thread_id: 'sthr_primary', agent: { name: 'critic' }, status: 'idle', created_at: '2026-10-15T10:00:00Z', usage, stats: { active_seconds: 40 } }]),
    events: { list: (threadId, params) => {
      listed.push([threadId, params.session_id]);
      return pages([{ type: 'span.model_request_start', processed_at: '2026-10-15T10:00:02Z' }, { type: 'span.model_request_end', processed_at: '2026-10-15T10:00:09Z', model_usage: { input_tokens: 10, output_tokens: 1000 } }]);
    } },
  } } } };
  const threads = await sessionThreads(api, 'sesn_1', { cellDir: dir, model: 'claude-opus-5-5' });
  assert.deepEqual(listed, [['sthr_critic', 'sesn_1']], 'only the child thread, read by its session');
  assert.equal(threads.length, 1);
  assert.equal(threads[0].agent, 'critic');
  assert.equal(threads[0].usage.list_cost.amount, '3');
  assert.equal(threads[0].turns.modelRequests, 1);
  assert.equal(threads[0].largestRequest.usd, 0.02);
  assert.equal(threads[0].steps, undefined, 'the compact trace stays in the events file');
  assert.ok(existsSync(path.join(dir, 'threads', 'sthr_critic.events.jsonl')));
  assert.deepEqual(await sessionThreads({ beta: { sessions: {} } }, 'sesn_1', { cellDir: dir, model: 'claude-opus-5-5' }), [], 'the stub has no threads');
});

test('--agent-version names an earlier synced version, as the round\'s control', () => {
  assert.equal(controlVersion(undefined, 4), null);
  assert.equal(controlVersion('3', 4), 3);
  assert.throws(() => controlVersion('4', 4), /earlier/);
  assert.throws(() => controlVersion('0', 4), /earlier/);
  assert.throws(() => controlVersion('v3', 4), /earlier/);
  assert.deepEqual(adoptions(['live-vote=sesn_01Ab'], ['live-vote', 'debate-clock']), { 'live-vote': 'sesn_01Ab' });
  assert.throws(() => adoptions(['news-lower-third=sesn_01Ab'], ['live-vote']), /this run names/, 'only a brief the run names');
  assert.throws(() => adoptions(['live-vote=agent_01'], ['live-vote']), /session id/);
});

test('the Skills API bundle is the skill\'s own bytes under one top folder', () => {
  const dir = tmp();
  const r = spawnSync(process.execPath, [path.join(ROOT, 'cli', 'scripts', 'build-skill.mjs'), '--skills-api', dir], { encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0, r.stderr);
  const bundle = JSON.parse(readFileSync(path.join(dir, 'bundle.json'), 'utf8'));
  const source = path.join(ROOT, 'cli', 'skill', 'noacg-graphic');
  const walk = (d, base = d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name), base) : [path.relative(base, path.join(d, e.name)).split(path.sep).join('/')]));
  assert.deepEqual(bundle.files.map((f) => f.path).sort(), walk(source).map((f) => `noacg-graphic/${f}`).sort());
  for (const f of bundle.files) {
    const bytes = readFileSync(path.join(dir, ...f.path.split('/')));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), f.sha256);
    assert.equal(bytes.toString('utf8').replace(/\r\n/g, '\n'), readFileSync(path.join(source, ...f.path.split('/').slice(1)), 'utf8').replace(/\r\n/g, '\n'), `${f.path} is the source's bytes`);
  }
});
