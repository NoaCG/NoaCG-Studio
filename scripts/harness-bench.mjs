#!/usr/bin/env node
// THE NOACG HARNESS BENCH (docs/work-specs/noacg-harness/spec.md D5, sections 5.1, 5.3, 5.4).
//
//   node scripts/harness-bench.mjs                    FREE. The ledger: spent, left, per phase.
//   node scripts/harness-bench.mjs --control [--briefs id,..] [--out <dir>]
//                                                    FREE. No model, no credit: the fake arm and the
//                                                    managed-agents arm on a stub that replays the
//                                                    documented Managed Agents events and files push
//                                                    scaffolded graphics through record, shape check,
//                                                    capture, gallery and a ledger copy at $0, and the
//                                                    ledger's wall refuses a session it cannot cover.
//                                                    Run it FIRST and after any change here: a broken
//                                                    bench would be measured as a model.
//   node scripts/harness-bench.mjs --build <H#> --arms managed-agents[,claude-code] --briefs id,..
//                                  --ceiling-cents <n> [--budget-cents <n>] [--model <id>]
//                                  [--overshoot-cents <n>] [--critic-cents <n>] [--out <dir>]
//                                  [--august-config A] [--agent-version <n>] [--adopt <brief>=<session>]
//                                                    PAID. Real sessions: managed-agents on the bench
//                                                    key's credit (scripts/bench-env.mjs --profile=harness),
//                                                    claude-code on the owner's subscription; `august`
//                                                    re-captures the 2026-08-22 round's cells at $0. Refused
//                                                    for a $0 phase, a phase the ledger already holds
//                                                    as completed, tuning before the exam is reserved,
//                                                    and the exam before tuning is closed; per session
//                                                    when what is left, the exam reserve aside, cannot
//                                                    cover its budget and the overshoot margin. The
//                                                    budget defaults to agent.md's, the margin to the
//                                                    reserve's `o` and critic share. --agent-version
//                                                    runs an earlier synced version as the round's
//                                                    control (H6: v3, no critic), as its own arm.
//                                                    --adopt takes over a session a stopped run
//                                                    created, instead of creating that brief's again.
//                                                    Once tuning is closed the exam runs the skill
//                                                    the lock pins, whatever cli/skill now holds,
//                                                    and says so (benchmarks/harness/lib/skill-pin.mjs).
//   node scripts/harness-bench.mjs --build <H#> --dry --arms ... [--model <id>]
//                                                    FREE. Every check before the first session (the
//                                                    ledger, the agent and the skill against the lock,
//                                                    the server's copy of the agent, the reference
//                                                    plugin and its subscription), then stops: no
//                                                    briefs, no upload, $0.
//   node scripts/harness-bench.mjs --reserve --by <H#> --budget-cents <n> --overshoot-cents <n>
//                                  [--critic-cents <n>] [--note "..."]
//                                                    FREE. 5.2's arithmetic: the exam reserve R, what
//                                                    is left for tuning and the rounds that fit, and
//                                                    R recorded in the ledger for the wall to hold.
//   node scripts/harness-bench.mjs --close <H#> [--note "..."]
//                                                    Record a phase as completed in the ledger.
//   node scripts/harness-bench.mjs --review <runDir> FREE. Rebuild a run's blind gallery.
//
// The briefs are the unsealed tuning set (benchmarks/harness/tuning/briefs.json). The exam set is
// sealed (benchmarks/harness/exam/) and this runner never opens it before H8.
//
// Named `*bench*` so the one-job-per-machine guard sees it: every cell drives Chromium through the
// CLI. Coverage runs against this checkout's dev server, or the deployment NOACG_URL names.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, existsSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devPort } from './dev-port.mjs';
import { mainEnv } from './lite-eval-paths.mjs';
import { loadHarnessApi } from '../benchmarks/harness/lib/api-runtime.mjs';
import { archivedArm, claudeCodeArm, deleteLeftCliUploads, fakeAgentWork, fakeArm, isLibraryBrief, managedAgentsArm, packCli } from '../benchmarks/harness/lib/arms.mjs';
import { makeCli, CLI_ENTRY } from '../benchmarks/harness/lib/cli.mjs';
import { buildGallery } from '../benchmarks/harness/lib/gallery.mjs';
import { coverageFrames, judgePair, judgeSingle, loadJudge } from '../benchmarks/harness/lib/judge.mjs';
import { admit, appendEntry, DEFAULT_OVERSHOOT_CENTS, dollars, examPending, LEDGER_FILE, openTuning, PHASE, phaseCompleted, phaseSpentCents, readLedger, remainingCents, RESERVING_PHASE, reservation, reserveTerms, summary, writeLedger, ZERO_CREDIT_PHASES } from '../benchmarks/harness/lib/ledger.mjs';
import { packagesEnvironment, PROOFS } from '../benchmarks/harness/lib/feasibility.mjs';
import { runCell } from '../benchmarks/harness/lib/pipeline.mjs';
import { docTopics, examSkill, findSkill, pinnedPlugin } from '../benchmarks/harness/lib/skill-pin.mjs';
import { checkSubscriptionAuth, claudeExecutable, pauseMs, subscriptionEnv } from '../benchmarks/harness/lib/subscription.mjs';
import { readAgentDefinition } from '../benchmarks/harness/lib/agent-def.mjs';
import { AGENT_DIR, agentReadBack, lockPath, readDefinitions, skillBundle, syncPlan, workspaceClient } from './harness-agent-sync.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS = path.join(ROOT, 'benchmarks', 'harness');
export { LEDGER_FILE };
const TUNING = path.join(HARNESS, 'tuning', 'briefs.json');
/** What `--control` runs by default: a two-sided board with operator actions, and a typeless brief. */
export const CONTROL_BRIEFS = ['school-scoreboard', 'debate-clock'];

const argv = process.argv.slice(2);
const has = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const i = argv.findIndex((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (i < 0) return fallback;
  const eq = argv[i].indexOf('=');
  if (eq >= 0) return argv[i].slice(eq + 1);
  return argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const list = (name) => (value(name, '') || '').split(',').map((s) => s.trim()).filter(Boolean);
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

function fail(message) {
  console.error(`harness-bench: ${message}`);
  process.exit(2);
}

/** The tuning briefs a run may use, by id; the OGraf brief is not a library graphic and stays out. */
export function tuningBriefs(ids) {
  const bank = JSON.parse(readFileSync(TUNING, 'utf8')).briefs;
  const chosen = ids.map((id) => bank.find((b) => b.id === id) ?? fail(`no tuning brief ${id}`));
  for (const b of chosen) if (!isLibraryBrief(b)) fail(`${b.id} is not a library graphic brief (4.2)`);
  return chosen;
}

const phaseNumber = (phase) => Number(phase.slice(1));

/** `--build` may create sessions only for a paid phase the ledger does not already hold as
 *  completed; after H4 only once the exam is reserved (5.2), so tuning never spends the exam; the
 *  exam itself only once every tuning phase before it is closed; and from then until the exam
 *  closes, nothing but the exam, since the bench is frozen for it. */
export function refuseBuild(ledger, phase) {
  if (!PHASE.test(phase ?? '')) return `--build needs a phase like H3, got "${phase}"`;
  if (ZERO_CREDIT_PHASES.includes(phase)) return `${phase} spends nothing (5.1): it creates no session`;
  if (phaseCompleted(ledger, phase)) return `the ledger already holds ${phase} as completed; a completed phase never spends again`;
  if (phaseNumber(phase) > phaseNumber(RESERVING_PHASE) && !ledger.reserve) return 'the ledger holds no exam reserve: H4 reserves the exam before any tuning spends (5.2)';
  if (phase === ledger.reserve?.phase) {
    const open = openTuning(ledger, phase);
    if (open.length) return `${phase} spends its reserve only on the exam, after tuning: ${open.join(', ')} not closed`;
  }
  const exam = examPending(ledger);
  if (exam && phase !== exam) return `tuning is closed and ${exam}'s exam is pending: the bench is frozen for it until it closes`;
  return null;
}

/** The per-graphic session budget default (5.2's `B`), which agents/noacg-harness/agent.md carries. */
export function agentSessionBudgetCents(def = readAgentDefinition(AGENT_DIR)) {
  const cents = Number(def.config.metadata?.session_budget_cents);
  return Number.isInteger(cents) && cents > 0 ? cents : null;
}

/** A flag that takes cents takes a whole number of them: an empty value is not zero. */
function parseCents(raw, name) {
  if (!/^\d+$/.test(String(raw ?? ''))) throw new Error(`--${name} takes a whole number of cents, got "${raw ?? ''}"`);
  return Number(raw);
}

/** A cents flag's value, or undefined when the run does not name it. */
const flagCents = (name) => (value(name) === undefined ? undefined : parseCents(value(name), name));

/** What a library step throws ends the run with its message. */
function orFail(step) {
  try {
    return step();
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

/**
 * `--reserve`: 5.2's arithmetic on the ledger as it stands, written as the ledger's reserve. Every
 * term is named, `B` included: a revision never inherits a budget it did not state. When R no
 * longer fits in what is left, nothing is written (`written: false`) and the run stops for the owner.
 */
export function recordReserve(file, { by, budget, overshoot, critic = '0', note } = {}) {
  if (!PHASE.test(by ?? '')) throw new Error(`--reserve needs --by <H#>, the phase that sets or revises it, got "${by ?? ''}"`);
  const ledger = readLedger(file);
  const fit = reservation(ledger, { sessionBudgetCents: parseCents(budget, 'budget-cents'), overshootCents: parseCents(overshoot, 'overshoot-cents'), criticCents: parseCents(critic, 'critic-cents'), setBy: by });
  if (fit.tuningCents < 0) return { fit, written: false };
  const { entries, ...head } = ledger;
  writeLedger(file, { ...head, reserve: { ...fit.reserve, at: new Date().toISOString(), ...(note ? { note } : {}) }, entries });
  return { fit, written: true };
}

/** `--agent-version`: an earlier version than the lock's, or nothing (the lock's own). */
export function controlVersion(raw, current) {
  if (raw === undefined) return null;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n >= current) throw new Error(`--agent-version ${raw}: an earlier synced version, 1 to ${current - 1} (the lock's is ${current})`);
  return n;
}

/** `--adopt brief=sesn_...`: the sessions a stopped run left running, by the brief they belong to. */
export function adoptions(pairs, briefIds) {
  const out = {};
  for (const pair of pairs) {
    const m = /^([a-z0-9-]+)=(sesn_[A-Za-z0-9]+)$/.exec(pair);
    if (!m || !briefIds.includes(m[1])) throw new Error(`--adopt ${pair}: <brief>=<session id>, for a brief this run names`);
    out[m[1]] = m[2];
  }
  return out;
}

/** The cells of a `--build` the ledger does not already hold for that phase. A cell that ran
 *  (delivered, not ready or failed) on the same model is never paid twice; a refused or paused one
 *  runs again, and another model on the same brief is another cell. */
export function pendingCells(ledger, phase, cells) {
  const ran = (c) => ledger.entries.some((e) => e.kind === 'session' && e.phase === phase && e.brief === c.brief.id && e.arm === c.arm.id && (e.model ?? null) === (c.arm.model ?? null) && !['refused', 'paused'].includes(e.outcome));
  return cells.filter((c) => !ran(c));
}

/** The packages proofs are one measurement: a cold start in a fresh environment, then a cached one
 *  in the same environment. Their environment lives for one run, so both run in one invocation,
 *  cold first, and neither may already be in the ledger; anything else would record a cold start
 *  as the cached one. */
export function packagesProofRefusal(ledger, phase, proofIds) {
  const pair = Object.keys(PROOFS).filter((id) => PROOFS[id].environment === 'packages');
  const asked = proofIds.filter((id) => pair.includes(id));
  if (!asked.length) return null;
  if (asked.join() !== pair.join()) return `the packages proofs run together and in order: --proof ${pair.join(',')}`;
  const ran = pair.filter((id) => ledger.entries.some((e) => e.kind === 'session' && e.phase === phase && e.brief === id && !['refused', 'paused'].includes(e.outcome)));
  if (ran.length) return `the ledger already holds ${ran.join(' and ')} for ${phase}: a cached start cannot be measured again in a new environment`;
  return null;
}

function printLedger(ledger) {
  const s = summary(ledger);
  const reserve = ledger.reserve;
  const held = reserve ? `, ${dollars(s.heldCents)} held for ${reserve.phase}'s exam (${reserveTerms(reserve)}, set by ${reserve.setBy})` : '';
  console.log(`Ledger ${path.relative(ROOT, LEDGER_FILE)}: ${dollars(s.spentCents)} of ${dollars(ledger.runBudgetCents)} credit spent${held}, ${dollars(s.remainingCents)} left${reserve ? ' for everything else' : ''}.`);
  for (const r of s.rows) console.log(`  ${r.phase} ${r.stage ?? '-'} ${r.model ?? '-'} (${r.funding}): ${r.sessions} session(s), ${dollars(r.listCostCents)}`);
  for (const e of ledger.entries.filter((x) => x.kind === 'phase')) console.log(`  ${e.phase} ${e.outcome}${e.note ? ` - ${e.note}` : ''}`);
}

function ensureCli() {
  if (!existsSync(CLI_ENTRY) || !existsSync(path.join(ROOT, 'cli', 'dist', 'commands', 'coverage.js'))) fail('the CLI in cli/dist is missing or predates `coverage` and `record`: run `npm run build` in cli/');
}

async function ensureBridge(cli) {
  const r = await cli(['doctor', '--json']);
  if (r.code !== 0) fail(`no NoaCG bridge at ${cli.url}: start this checkout's dev server (npm run dev) or set NOACG_URL\n${r.stderr.slice(-400)}`);
}

async function runCells({ cells, runDir, cli, ledger, entry, api, runId, onCell }) {
  const done = [];
  for (const c of cells) {
    const cellDir = path.join(runDir, 'cells', c.id);
    rmSync(cellDir, { recursive: true, force: true });
    const t = Date.now();
    const cell = await runCell({ arm: c.arm, brief: c.brief, cellDir, cli, ledger, entry: { ...entry, ...(c.entry ?? {}) }, shape: api.shape, runId: `${runId}-${c.id}`, log: (l) => console.log(l) });
    done.push({ id: c.id, dir: cellDir, brief: c.brief.id, arm: c.arm.id, model: c.arm.model, cell });
    console.log(`  ${c.id.padEnd(40)} ${describe(cell)} [${Math.round((Date.now() - t) / 1000)}s]`);
    if (onCell) onCell(cell);
  }
  return done;
}

function describe(cell) {
  if (cell.refused) return `REFUSED - ${cell.refused}`;
  if (!cell.validation) return `${cell.outcome}${cell.reason ? ` - ${cell.reason}` : ''}`;
  const parts = [
    cell.outcome,
    `shape ${cell.shape.ok ? 'ok' : `REFUSED (${cell.shape.reason})`}`,
    `validator ${cell.validation.ok ? 'clean' : 'ERRORS'}`,
    `${cell.capture.frames} frame(s), ${cell.capture.crops} crop(s)`,
    `digests ${cell.digest.ok ? 'one version' : cell.digest.problems.join('; ')}`,
    cell.operator.missing.length ? `MISSING ${cell.operator.missing.join('/')}` : 'actions ok',
    dollars(cell.costCents ?? 0),
  ];
  if (cell.cleanup) parts.push(`cleanup ${cell.cleanup.sessionGone && cell.cleanup.filesLeft === 0 ? 'gone' : 'LEFT SOMETHING'}`);
  return parts.join(', ');
}

// ── --control ─────────────────────────────────────────────────────────────────────────────────

async function control() {
  ensureCli();
  const url = process.env.NOACG_URL || `http://localhost:${devPort()}`;
  const cli = makeCli({ url });
  await ensureBridge(cli);
  const briefs = tuningBriefs(list('briefs').length ? list('briefs') : CONTROL_BRIEFS);
  const runDir = path.resolve(value('out', path.join(os.tmpdir(), 'noacg-harness', `control-${stamp()}`)));
  mkdirSync(runDir, { recursive: true });
  // The control writes a COPY of the ledger: a dry run is not spend, and the committed ledger
  // holds what the plan spent, nothing else.
  const ledgerCopy = path.join(runDir, 'ledger.json');
  copyFileSync(LEDGER_FILE, ledgerCopy);
  const ledger = readLedger(ledgerCopy);
  const api = await loadHarnessApi();
  try {
    console.log(`CONTROL against ${url}: ${briefs.length} brief(s) -> ${runDir}`);
    const byRun = new Map();
    const stubAgent = async (sessionId, params) => {
      const brief = byRun.get(params.metadata?.run_id);
      if (!brief) throw new Error(`the stub was asked for a run it does not know: ${params.metadata?.run_id}`);
      const scratch = path.join(runDir, 'stub-sessions', sessionId);
      const work = await fakeAgentWork({ brief, workDir: path.join(scratch, 'work'), outputsDir: path.join(scratch, 'outputs'), cli }).catch((e) => {
        // The stub ends a session whose agent failed as the scenario says, with nothing handed in;
        // the cause is said here, or the cell would read as the arm's failure alone.
        console.error(`  stub session ${sessionId}: the fake agent failed - ${e instanceof Error ? e.message : String(e)}`);
        throw e;
      });
      return {
        outputs: [
          { filename: 'record.json', bytes: readFileSync(work.recordFile), mimeType: 'application/json' },
          { filename: 'record.zip', bytes: readFileSync(work.zipFile), mimeType: 'application/zip' },
        ],
        commands: work.commands.map(({ command, output }) => ({ command, output })),
      };
    };
    const stubArm = (scenario) => {
      const stub = api.stub.createManagedAgentsStub({ scenario, costCents: 0, runningReads: 1, agent: stubAgent });
      const arm = managedAgentsArm({ api: stub, client: api.client, agent: { id: 'agent_stub', version: 1 }, environmentId: 'env_stub', budgetCents: 300, model: 'stub', funding: 'none', files: [{ fileId: 'file_stub_cli', mountPath: '/noacg-cli.tgz' }], pollMs: 500 });
      const run = arm.run;
      return { ...arm, stub, run: (ctx) => { byRun.set(ctx.runId, ctx.brief); return run(ctx); } };
    };
    const runId = `control-${stamp()}`;
    const cells = [];
    for (const brief of briefs) {
      cells.push({ id: `${brief.id}.fake`, brief, arm: fakeArm() });
      cells.push({ id: `${brief.id}.managed-agents-stub`, brief, arm: stubArm('end_turn') });
    }
    // The not-ready path: a session paused at its budget hands in its last record as not ready.
    cells.push({ id: `${briefs[0].id}.managed-agents-stub-budget`, brief: briefs[0], arm: stubArm('budget_reached') });
    const entry = { phase: 'H1', stage: 'control', budgetCents: 300, overshootCents: DEFAULT_OVERSHOOT_CENTS };
    const done = await runCells({ cells, runDir, cli, ledger, entry, api, runId });

    // The wall: a ledger with $1 left refuses a $3 session before anything is created.
    const short = { ...ledger, entries: [...ledger.entries, { at: new Date().toISOString(), kind: 'session', phase: 'H1', stage: 'control-wall', arm: 'synthetic', funding: 'credit', sessionId: 'sesn_synthetic', listCostCents: ledger.runBudgetCents - 100, outcome: 'delivered', note: 'a synthetic spend, in this copy only' }] };
    const wallArm = { ...stubArm('end_turn'), funding: 'credit' };
    const refused = await runCell({ arm: wallArm, brief: briefs[0], cellDir: path.join(runDir, 'cells', 'wall'), cli, ledger: short, entry, shape: api.shape, runId: `${runId}-wall` });
    const wall = { refused: Boolean(refused.refused), reason: refused.refused ?? null, sessionsCreated: wallArm.stub.sessions.size, admission: admit(short, { budgetCents: 300 }) };
    console.log(`  ${'the wall ($1 left, a $3 session)'.padEnd(40)} ${wall.refused && wall.sessionsCreated === 0 ? 'REFUSED before any session was created' : 'NOT REFUSED - the wall is broken'}`);

    writeLedger(ledgerCopy, ledger);
    const judge = loadJudge(path.join(HARNESS, 'judge'));
    const gallery = buildGallery({ runDir, cells: done, briefs });
    const s = summary(ledger);
    const report = {
      runDir,
      noacgUrl: url,
      spentCents: s.spentCents - summary(readLedger(LEDGER_FILE)).spentCents,
      cells: done.map((d) => ({ id: d.id, ...d.cell, trace: undefined })),
      wall,
      judge: judge.frozen ? { frozen: true, model: judge.lock.model } : { frozen: false, reason: judge.reason },
      gallery,
    };
    writeFileSync(path.join(runDir, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
    const live = done.filter((d) => d.cell.validation);
    const ok = live.length === done.length && live.every((d) => d.cell.shape.ok && d.cell.validation.ok && d.cell.digest.ok && d.cell.capture.frames > 0) && done.filter((d) => d.cell.cleanup).every((d) => d.cell.cleanup.sessionGone && d.cell.cleanup.filesLeft === 0) && wall.refused && wall.sessionsCreated === 0 && report.spentCents === 0;
    console.log(`\nSpend recorded by this run: ${dollars(report.spentCents)} (ledger copy ${ledgerCopy}).`);
    console.log(`Judge: ${judge.frozen ? `frozen on ${judge.lock.model}` : `not frozen yet - ${judge.reason}`}.`);
    console.log(`Gallery: ${gallery.review}\nKey (open after notes.md): ${gallery.key}\nSummary: ${path.join(runDir, 'summary.json')}`);
    console.log(ok ? 'CONTROL PASSED' : 'CONTROL FAILED - read the cells above');
    process.exitCode = ok ? 0 : 1;
  } finally {
    await api.cleanup();
  }
}

// ── --build ───────────────────────────────────────────────────────────────────────────────────

async function build(phase) {
  const ledger = readLedger(LEDGER_FILE);
  const refusal = refuseBuild(ledger, phase);
  if (refusal) fail(refusal);
  const proofIds = list('proof');
  const arms = proofIds.length && !list('arms').length ? ['managed-agents'] : list('arms');
  const ids = list('briefs');
  // A brief's session runs at agent.md's budget unless the run names another; a proof keeps its own.
  const budgetCents = value('budget-cents') !== undefined ? Number(value('budget-cents')) : ids.length ? (agentSessionBudgetCents() ?? 0) : 0;
  // The wall's margin is the reserve's `o` and critic share unless a flag names others (H6 gives
  // its critic a margin before measuring it).
  const margin = orFail(() => ({ overshootCents: flagCents('overshoot-cents'), criticCents: flagCents('critic-cents') }));
  const model = value('model', '');
  const effort = value('effort', '');
  const ceilingCents = value('ceiling-cents') === undefined ? null : Number(value('ceiling-cents'));
  // --dry makes every check that comes before the first session, then stops: nothing uploaded, no
  // session, $0. It needs no briefs, so the exam can be checked before its briefs are opened. Any
  // spelling of it (`--dry=1`, `--dry-run`) counts, so a typo never turns it into a paid run.
  const dry = argv.some((a) => /^--dry\b/.test(a));
  if (!arms.length || !(dry || ids.length || proofIds.length)) fail('--build needs --arms and --briefs (or --proof): a paid run names exactly what it spends on');
  if (ids.length && arms.includes('managed-agents') && !(Number.isInteger(budgetCents) && budgetCents > 0)) fail('--build with managed-agents needs --budget-cents <n>, the per-session cap');
  if (arms.includes('claude-code') && !model) fail('--build with claude-code needs --model, the exact model id the reference session runs');
  // Every paid phase has its own ceiling (5.1): a run that does not name it is refused, never
  // admitted against the whole run budget.
  if (!dry && arms.includes('managed-agents') && !(Number.isInteger(ceilingCents) && ceilingCents > 0)) fail("--build with managed-agents needs --ceiling-cents <n>, the phase's ceiling (5.1: H3 $10, a tuning round $15 or $9)");
  if (effort && !['low', 'medium', 'high', 'xhigh', 'max'].includes(effort)) fail(`--effort ${effort}: low, medium, high, xhigh or max`);
  for (const a of arms) if (!['managed-agents', 'claude-code', 'august'].includes(a)) fail(`unknown arm ${a}`);
  if (proofIds.length && (phase !== 'H3' || arms.join() !== 'managed-agents')) fail('--proof is H3\'s, on the managed-agents arm alone');
  for (const id of proofIds) if (!PROOFS[id]) fail(`no H3 proof ${id} (${Object.keys(PROOFS).join(', ')})`);
  const pairRefusal = packagesProofRefusal(ledger, phase, proofIds);
  if (pairRefusal) fail(pairRefusal);
  ensureCli();
  const url = process.env.NOACG_URL || 'https://noacg.studio';
  const cli = makeCli({ url });
  await ensureBridge(cli);
  const briefs = tuningBriefs(ids);
  const runDir = path.resolve(value('out', path.join(os.tmpdir(), 'noacg-harness', `${phase}-${stamp()}`)));
  if (runDir.startsWith(ROOT + path.sep)) fail(`--out must be outside the repository (${ROOT}): a reference session there would load this repo's instructions`);
  mkdirSync(runDir, { recursive: true });
  const api = await loadHarnessApi();
  const all = [];
  let uploaded = null;
  let sdk = null;
  let packagesEnv = null;
  try {
    // What the sessions run (AC-7, AC-16): the agent as the lock synced it, and the skill the lock
    // pins, which the checkout's cli/skill, the product's, may have moved past (examSkill).
    let lock = null;
    let pin = { pinned: false };
    if (arms.includes('managed-agents') || arms.includes('claude-code')) {
      const lockFile = lockPath('bench');
      if (!existsSync(lockFile)) fail(`no ${path.relative(ROOT, lockFile)}: sync the agent first (node scripts/harness-agent-sync.mjs --workspace bench --apply)`);
      lock = JSON.parse(readFileSync(lockFile, 'utf8'));
      const bundle = skillBundle(path.join(runDir, 'skill'));
      const tuned = bundle.sha256 === lock.skill.bundleSha256 ? null : findSkill(ROOT, lock.skill.bundleSha256);
      pin = examSkill({ ledger, phase, lock, bundle, tuned, topics: orFail(() => docTopics()) });
      if (pin.refusal) fail(pin.refusal);
      console.log(`  skill: ${pin.note ?? `cli/skill/noacg-graphic is the bundle agent v${lock.agent.version} pins (${lock.skill.bundleSha256.slice(0, 12)})`}`);
    }
    // In the exam the bench is frozen (harness-agent-sync refuses to change it), so a difference
    // found here is never repaired by a sync.
    const exam = examPending(ledger) === phase;
    const resync = 'run node scripts/harness-agent-sync.mjs --workspace bench --apply first';
    let managed = null;
    if (arms.includes('managed-agents')) {
      // The sessions run the agent as it was synced: a definition changed since the sync would be
      // measured as something it is not. Another model runs as a per-session override of the
      // synced version (`agent_with_overrides`), never as a silent edit of the agent. Planned with
      // the lock's skill, so a skill difference is examSkill's to name, above.
      const { environment: environmentDef, agent: agentDef, subagents } = readDefinitions(AGENT_DIR);
      const drift = syncPlan({ lock, environment: environmentDef, agent: agentDef, subagents, bundle: { sha256: lock.skill.bundleSha256 } }).filter((step) => step.action !== 'keep');
      if (drift.length) fail(`agents/noacg-harness changed since the last sync (${drift.map((d) => `${d.resource} ${d.action}`).join(', ')}): ${exam ? `the exam runs agent v${lock.agent.version} as tuned and the bench is frozen until it closes, so restore the files to what the lock synced` : resync}`);
      // A round's control runs an earlier version the sync made (immutable on the server), as its
      // own arm so the ledger and the judge keep it apart from the version under test.
      const agentVersion = orFail(() => controlVersion(value('agent-version'), lock.agent.version));
      const adopt = orFail(() => adoptions(list('adopt'), ids));
      const agentModel = agentDef.config.model?.id ?? agentDef.config.model;
      // An override replaces the agent's model object in full, so an effort alone restates the model.
      const override = (id) => ((id && id !== agentModel) || effort ? { id: id || agentModel, ...(effort ? { effort } : {}) } : null);
      sdk = await workspaceClient('bench');
      if (!sdk) fail('no ANTHROPIC_BENCH_API_KEY in .env.bench.local: run `node scripts/bench-env.mjs --profile=harness`');
      // The lock says what the sync sent; a session runs what the server kept (H6's v5 kept v4's critic).
      const { drift: serverDrift } = await agentReadBack(sdk, lock, agentDef);
      if (serverDrift.length) fail(`the server's agent v${lock.agent.version} differs from agents/noacg-harness in ${serverDrift.join(', ')}: ${exam ? 'the exam cannot run what tuning chose, and nothing in this checkout restores it. Decide in the spec\'s phase notes: re-syncing means reverting the freeze and measuring the new version first' : resync}`);
      console.log(`  agent: ${lock.agent.id} v${lock.agent.version} read back from the server as agents/noacg-harness defines it, skill ${lock.skill.version}${agentVersion ? `; this run's arm is v${agentVersion}, not checked` : ''}${override(model) ? `; sessions override the model with ${JSON.stringify(override(model))}` : ''}`);
      managed = { environmentDef, agentVersion, adopt, agentModel, override };
    }
    // The reference arm loads the published plugin with the skill the run measures, and its
    // subscription is checked now: found out after the credit arm, it would leave an exam unpaired.
    let reference = null;
    if (arms.includes('claude-code')) {
      const pluginDir = pin.pinned ? pinnedPlugin(path.join(runDir, 'plugin'), pin.files) : undefined;
      reference = orFail(() => claudeCodeArm({ claude: claudeExecutable(), token: mainEnv().CLAUDE_CODE_OAUTH_TOKEN, model, url, pluginDir }));
      const auth = orFail(() => reference.preflight(path.join(runDir, 'preflight')));
      console.log(`  reference: claude-code on ${model}, the subscription's ${auth.authMethod}${pluginDir ? `, plugin cli/plugin with the lock's skill in ${pluginDir}` : ''}`);
    }
    if (dry) {
      console.log(`DRY ${phase}: every check before the first session passed. Nothing uploaded, no session created, $0.`);
      return;
    }
    if (managed) {
      const { environmentDef, agentVersion, adopt, agentModel, override } = managed;
      const { toFile } = await import('@anthropic-ai/sdk');
      await deleteLeftCliUploads(sdk);
      const upload = async (file) => (await sdk.files.upload({ file: await toFile(readFileSync(file), path.basename(file), { type: 'application/gzip' }) })).id;
      const tarball = packCli(path.join(runDir, 'cli'));
      uploaded = { id: await upload(tarball) };
      const arm = (cellBudget, modelOverride) => managedAgentsArm({ id: agentVersion ? `managed-agents-v${agentVersion}` : 'managed-agents', api: sdk, client: api.client, agent: { id: lock.agent.id, version: agentVersion ?? lock.agent.version }, environmentId: lock.environment.id, budgetCents: cellBudget, model: agentModel, modelOverride, funding: 'credit', files: [{ fileId: uploaded.id, mountPath: '/noacg-cli.tgz' }], upload, downloadAll: true, adopt });
      for (const brief of briefs) {
        const a = arm(budgetCents, override(model));
        all.push({ id: `${brief.id}.${a.id}`, brief, arm: a, entry: { budgetCents } });
      }
      for (const id of proofIds) {
        const proof = PROOFS[id];
        const cellBudget = Number.isInteger(budgetCents) && budgetCents > 0 ? budgetCents : proof.budgetCents;
        const prepared = proof.prepare ? await proof.prepare({ cli, dir: path.join(runDir, 'prepare', id) }) : {};
        if (proof.environment === 'packages' && !packagesEnv) {
          // The packages proof's own environment, made for this run and deleted after it.
          packagesEnv = await sdk.beta.environments.create(packagesEnvironment(environmentDef));
          console.log(`  environment ${packagesEnv.id} with packages ${JSON.stringify(packagesEnv.config?.packages ?? null)}`);
        }
        const brief = { id, kind: 'noacg', type: null, prompt: proof.prompt, ...prepared, ...(proof.environment === 'packages' ? { environmentId: packagesEnv.id } : {}), ...(proof.withoutCli ? { withoutCli: true } : {}) };
        all.push({ id: `${id}.managed-agents`, brief, arm: arm(cellBudget, proof.model ? override(proof.model.id) : override(model)), entry: { budgetCents: cellBudget } });
      }
    }
    if (reference) for (const brief of briefs) all.push({ id: `${brief.id}.claude-code`, brief, arm: reference });
    if (arms.includes('august')) {
      // The v1 briefs' reference (4.2): the August round's Claude Code cells, re-captured at $0.
      const reference = archivedArm({ configuration: value('august-config', 'A') });
      for (const brief of briefs) all.push({ id: `${brief.id}.${reference.id}`, brief, arm: reference, entry: { stage: 'reference' } });
    }
    const runId = `${phase}-${stamp()}`;
    const entry = { phase, stage: value('stage', 'build'), budgetCents: budgetCents || 1, ...margin, ceilingCents };
    // A resumed run skips what the ledger already holds for this phase: a cell that ran (delivered,
    // not ready or failed) is never paid twice; only a refused or paused one runs again.
    const cells = pendingCells(ledger, phase, all);
    if (cells.length < all.length) console.log(`  ${all.length - cells.length} cell(s) already in the ledger for ${phase}, not run again: ${all.filter((c) => !cells.includes(c)).map((c) => c.id).join(', ')}`);
    console.log(`BUILD ${phase}: ${cells.length} cell(s), ${dollars(remainingCents(ledger, phase))} left on the ledger for ${phase}${ceilingCents ? `, ${dollars(ceilingCents - phaseSpentCents(ledger, phase))} under ${phase}'s ceiling` : ''} -> ${runDir}`);
    // Each cell's entry is written to the committed ledger as soon as it is known: a crash
    // part way never loses spend, and a resumed run never spends it twice.
    const done = await runCells({
      cells,
      runDir,
      cli,
      ledger,
      entry,
      api,
      runId,
      onCell: (cell) => {
        writeLedger(LEDGER_FILE, ledger);
        // Thrown, not exited: the finally below still deletes the uploaded CLI and the build dir.
        if (cell.costUnread) throw new Error(`${cell.brief}.${cell.arm}: the session's cost could not be read; reconcile it in the Console and record it before another session spends`);
      },
    });
    const gallery = buildGallery({ runDir, cells: done, briefs: [...briefs, ...all.map((c) => c.brief).filter((b) => PROOFS[b.id])] });
    writeFileSync(path.join(runDir, 'summary.json'), `${JSON.stringify({ phase, runDir, cells: done.map((d) => ({ id: d.id, ...d.cell })), gallery }, null, 2)}\n`);
    printLedger(ledger);
    console.log(`Gallery: ${gallery.review}`);
  } finally {
    if (uploaded && sdk) await sdk.files.delete(uploaded.id).catch((e) => console.error(`  CLI upload ${uploaded.id} NOT deleted (the next run deletes it): ${e instanceof Error ? e.message : String(e)}`));
    if (packagesEnv && sdk) await sdk.beta.environments.delete(packagesEnv.id).then(() => console.log(`  environment ${packagesEnv.id} deleted`), (e) => console.error(`  environment ${packagesEnv.id} NOT deleted: ${e instanceof Error ? e.message : String(e)}`));
    await api.cleanup();
  }
}

// ── --judge ───────────────────────────────────────────────────────────────────────────────────

/**
 * Judge a run with the FROZEN judge (4.3): every delivered cell alone, and every two arms on one
 * brief as a pair in both orders. Refused before anything starts when the judge's files differ
 * from judge.lock.json: a judge changed after calibration is not the judge that was calibrated.
 * Writes `judgements.jsonl` in the run directory; a usage-limit pause is recorded in the ledger and
 * waited out, never moved to the credit.
 */
export async function judgeRun({ runDir, judgeDir = path.join(HARNESS, 'judge'), phase = null, claude, env, run, log = console.log }) {
  const judge = loadJudge(judgeDir);
  if (!judge.frozen) throw new Error(`the exam judges only with a frozen judge: ${judge.reason}`);
  const cellsDir = path.join(runDir, 'cells');
  const cells = readdirSync(cellsDir)
    .filter((d) => existsSync(path.join(cellsDir, d, 'cell.json')) && existsSync(path.join(cellsDir, d, 'frames', 'coverage.json')))
    .map((d) => ({ id: d, dir: path.join(cellsDir, d), cell: JSON.parse(readFileSync(path.join(cellsDir, d, 'cell.json'), 'utf8')), brief: JSON.parse(readFileSync(path.join(cellsDir, d, 'brief.json'), 'utf8')) }));
  const out = path.join(runDir, 'judgements.jsonl');
  const seen = new Set((existsSync(out) ? readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []).filter((r) => r.judge === judge.fingerprint && !r.error).map((r) => `${r.task}:${r.id}`));
  const record = (r) => writeFileSync(out, `${JSON.stringify({ judge: judge.fingerprint, at: new Date().toISOString(), ...r })}\n`, { flag: 'a' });
  const once = async (key, go) => {
    if (seen.has(key)) return;
    // A paused pair hands back the order it already answered, and the retry judges only the other.
    for (let answered; ;) {
      const r = await go(answered);
      if (!r.paused) return r;
      answered = r.answered;
      if (phase) {
        const ledger = readLedger(LEDGER_FILE);
        appendEntry(ledger, { kind: 'session', phase, stage: 'judge', arm: 'judge', model: judge.lock.model, funding: 'subscription', outcome: 'paused', note: `the subscription's usage limit; paused until ${r.paused.resetsAt ?? 'an unknown reset'}; nothing moved to the credit` });
        writeLedger(LEDGER_FILE, ledger);
      }
      log(`  paused by the usage limit until ${r.paused.resetsAt ?? 'an unknown reset'}`);
      await new Promise((resolve) => setTimeout(resolve, pauseMs(r.paused)));
    }
  };
  const graphic = (c) => ({ id: c.id, frames: coverageFrames(path.join(c.dir, 'frames')), operator: c.cell.operator?.buttons ?? [] });
  for (const c of cells) {
    const r = await once(`single:${c.id}`, () => judgeSingle(judge, { brief: c.brief.prompt, frames: graphic(c).frames, operator: graphic(c).operator, actions: c.brief.expect?.actions ?? [], dir: path.join(runDir, 'judge', 'single', c.id), claude, env, run }));
    if (r) {
      record({ task: 'single', id: c.id, brief: c.cell.brief, ...r });
      log(`  single   ${c.id.padEnd(48)} ${r.error ? `ERROR ${r.error}` : `airable ${r.answer.airable}`}`);
    }
  }
  const byBrief = new Map();
  for (const c of cells) byBrief.set(c.cell.brief, [...(byBrief.get(c.cell.brief) ?? []), c]);
  for (const [brief, list] of byBrief) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (list[i].cell.arm === list[j].cell.arm) continue;
        const id = `${list[i].id}|${list[j].id}`;
        // Which one goes first is decided by the pair's own hash: no arm is always A.
        const xFirst = parseInt(createHash('sha256').update(id).digest('hex').slice(0, 2), 16) % 2 === 0;
        const r = await once(`pairwise:${id}`, (answered) => judgePair(judge, { brief: list[i].brief.prompt, x: graphic(list[i]), y: graphic(list[j]), xFirst, actions: list[i].brief.expect?.actions ?? [], answered, dir: path.join(runDir, 'judge', 'pairwise', id.replace('|', '~')), claude, env, run }));
        if (r) {
          record({ task: 'pairwise', id, brief, ...r });
          log(`  pairwise ${id.padEnd(48)} ${r.error ? `ERROR ${r.error}` : `prefers ${r.combined}`}`);
        }
      }
    }
  }
  return { judge: { model: judge.lock.model, fingerprint: judge.fingerprint }, file: out };
}

// ── main ──────────────────────────────────────────────────────────────────────────────────────

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (has('control')) await control();
  else if (has('build')) await build(value('build', ''));
  else if (has('reserve')) {
    // 5.2: R = 20 (B + o + critic), each term named by the phase that sets or revises it.
    const result = orFail(() => recordReserve(LEDGER_FILE, { by: value('by'), budget: value('budget-cents'), overshoot: value('overshoot-cents'), critic: value('critic-cents', '0'), note: value('note') }));
    const { reserve: r, runBudgetCents: budget, spentCents: spent, tuningCents, rounds } = result.fit;
    console.log(`R = ${reserveTerms(r)} = ${dollars(r.cents)} for ${r.phase}'s exam.`);
    console.log(`T = ${dollars(budget)} - ${dollars(spent)} spent - ${dollars(r.cents)} = ${dollars(tuningCents)} for tuning: ${rounds.map((x) => `${x.rounds} round(s) at ${dollars(x.ceilingCents)}`).join(', ')}.`);
    if (!result.written) fail(`the exam no longer fits in what is left (${dollars(budget - spent)}): the reserve is not recorded, and the run stops for the owner (5.2)`);
    if (rounds.every((x) => x.rounds === 0)) console.log('No tuning round fits even at the smallest ceiling: the run stops with needs: decision (5.2, 5.5).');
    printLedger(readLedger(LEDGER_FILE));
  } else if (has('close')) {
    const phase = value('close', '');
    if (!PHASE.test(phase)) fail('--close needs a phase like H3');
    const ledger = readLedger(LEDGER_FILE);
    if (phaseCompleted(ledger, phase)) fail(`${phase} is already completed in the ledger`);
    appendEntry(ledger, { kind: 'phase', phase, stage: 'close', funding: 'none', listCostCents: 0, outcome: 'completed', ...(value('note') ? { note: value('note') } : {}) });
    writeLedger(LEDGER_FILE, ledger);
    printLedger(ledger);
  } else if (has('judge')) {
    const runDir = path.resolve(value('judge', ''));
    if (!existsSync(path.join(runDir, 'cells'))) fail('--judge needs a run directory holding cells/');
    const claude = claudeExecutable();
    const system = process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32') : '/usr/bin';
    const env = subscriptionEnv({ token: mainEnv().CLAUDE_CODE_OAUTH_TOKEN, home: path.join(runDir, 'judge', 'home'), pathDirs: [path.dirname(process.execPath), path.dirname(claude), system] });
    checkSubscriptionAuth({ claude, env });
    const phase = value('phase', null);
    const r = await judgeRun({ runDir, phase: PHASE.test(phase ?? '') ? phase : null, claude, env }).catch((e) => fail(e instanceof Error ? e.message : String(e)));
    console.log(`Judged with ${r.judge.model} (${r.judge.fingerprint.slice(0, 12)}): ${r.file}`);
  } else if (has('review')) {
    const runDir = path.resolve(value('review', ''));
    const cellsDir = path.join(runDir, 'cells');
    if (!existsSync(cellsDir)) fail('--review needs a run directory holding cells/');
    const cells = readdirSync(cellsDir).filter((d) => existsSync(path.join(cellsDir, d, 'cell.json'))).map((d) => {
      const cell = JSON.parse(readFileSync(path.join(cellsDir, d, 'cell.json'), 'utf8'));
      return { id: d, dir: path.join(cellsDir, d), brief: cell.brief, arm: cell.arm, model: cell.model, cell };
    });
    const bank = JSON.parse(readFileSync(TUNING, 'utf8')).briefs;
    console.log(buildGallery({ runDir, cells, briefs: bank }).review);
  } else printLedger(readLedger(LEDGER_FILE));
}
