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
//   node scripts/harness-bench.mjs --judge <runDir> [--phase <H#>] [--delivered-only] [--concurrency <1-4>] [--briefs id,..]
//                                                    SUBSCRIPTION. The frozen judge on a run's cells.
//   node scripts/harness-bench.mjs --tally <runDir>  FREE. 4.4's numbers and 4.5's verdict for an exam run.
//   node scripts/harness-bench.mjs --recapture <runDir> --rekey <file>
//                                                    FREE. Move a misplaced stress value to its field
//                                                    and capture both arms of that brief again.
//   node scripts/harness-bench.mjs --review <runDir> [--briefs id,..] [--into <dir>]
//                                                    FREE. Rebuild a run's blind gallery.
//
// The briefs are the unsealed tuning set (benchmarks/harness/tuning/briefs.json), except in the
// exam: `--build` of the exam phase, once tuning is closed and until the exam is, runs the sealed
// set (benchmarks/harness/lib/exam.mjs), opened in memory and verified against its committed hash
// before anything else. No other phase can open it.
//
// Named `*bench*` so the one-job-per-machine guard sees it: every cell drives Chromium through the
// CLI. Coverage runs against this checkout's dev server, or the deployment NOACG_URL names.

import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, existsSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devPort } from './dev-port.mjs';
import { mainEnv } from './lite-eval-paths.mjs';
import { loadHarnessApi } from '../benchmarks/harness/lib/api-runtime.mjs';
import { archivedArm, claudeCodeArm, deleteLeftCliUploads, fakeAgentWork, fakeArm, isLibraryBrief, managedAgentsArm, packCli } from '../benchmarks/harness/lib/arms.mjs';
import { makeCli, CLI_ENTRY } from '../benchmarks/harness/lib/cli.mjs';
import { buildGallery } from '../benchmarks/harness/lib/gallery.mjs';
import { examBriefs, labelStress, tallyExam, tallyMarkdown } from '../benchmarks/harness/lib/exam.mjs';
import { coverageFrames, judgePair, judgeSingle, loadJudge } from '../benchmarks/harness/lib/judge.mjs';
import { admit, appendEntry, DEFAULT_OVERSHOOT_CENTS, dollars, examPending, LEDGER_FILE, openTuning, PHASE, phaseCompleted, phaseNumber, phaseSpentCents, readLedger, remainingCents, RESERVING_PHASE, reservation, reserveTerms, summary, writeLedger, ZERO_CREDIT_PHASES } from '../benchmarks/harness/lib/ledger.mjs';
import { packagesEnvironment, PROOFS } from '../benchmarks/harness/lib/feasibility.mjs';
import { runCell } from '../benchmarks/harness/lib/pipeline.mjs';
import { examSkill, pinnedPlugin } from '../benchmarks/harness/lib/skill-pin.mjs';
import { checkSubscriptionAuth, claudeExecutable, pauseMs, subscriptionEnv } from '../benchmarks/harness/lib/subscription.mjs';
import { readAgentDefinition } from '../benchmarks/harness/lib/agent-def.mjs';
import { AGENT_DIR, agentReadBack, lockPath, readDefinitions, skillBundle, syncPlan, workspaceClient } from './harness-agent-sync.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS = path.join(ROOT, 'benchmarks', 'harness');
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

/** The exam's briefs (4.1): the sealed twenty, opened in memory and verified against the committed
 *  hash before anything else, their positional stress named by field label (lib/exam.mjs), or the
 *  ones of them `--briefs` names. Said by id, type, stress key and action; no brief text is printed. */
async function sealedRunBriefs({ cli, ledger, phase, ids }) {
  const sealed = orFail(() => examBriefs({ root: ROOT, ledger, phase }));
  const types = await cli(['types', '--json']);
  if (types.code !== 0 || !Array.isArray(types.json?.types)) fail(`noacg types --json failed, so the exam's stress cannot be named by field: ${types.stderr.slice(-300)}`);
  const briefs = sealed.map((b) => labelStress(b, types.json.types));
  const unknown = ids.filter((id) => !briefs.some((b) => b.id === id));
  if (unknown.length) fail(`no exam brief ${unknown.join(', ')}`);
  const chosen = ids.length ? briefs.filter((b) => ids.includes(b.id)) : briefs;
  console.log(`  briefs: the ${sealed.length} exam briefs, opened and verified against the committed sha256${ids.length ? `; this run takes ${chosen.length}` : ''}`);
  for (const b of chosen) {
    const stress = Object.keys(b.stress).map((k) => (b.stressPositions[k] ? `${b.stressPositions[k]} as "${k}"` : k));
    console.log(`    ${b.id.padEnd(30)} ${(b.type ?? 'typeless').padEnd(18)} stress ${stress.join(', ') || 'none'}; actions ${(b.expect?.actions ?? []).join(', ') || 'none'}`);
  }
  return chosen;
}

/** `--build` may create sessions only for a paid phase the ledger does not already hold as
 *  completed; after H4 only once the exam is reserved (5.2), so tuning never spends the exam; the
 *  exam itself only once every tuning phase before it is closed; and from then until the exam
 *  closes, nothing but the exam, since the bench is frozen for it. */
export function refuseBuild(ledger, phase) {
  if (!PHASE.test(phase ?? '')) return `--build needs a phase like H3, got "${phase}"`;
  if (ZERO_CREDIT_PHASES.includes(phase)) return `${phase} spends nothing (5.1): it creates no session`;
  if (phaseCompleted(ledger, phase)) return `the ledger already holds ${phase} as completed; a completed phase never spends again`;
  if (phaseNumber(phase) > phaseNumber(RESERVING_PHASE) && !ledger.reserve) return `the ledger holds no exam reserve: ${RESERVING_PHASE} reserves the exam before any tuning spends (5.2)`;
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

/**
 * The cells, one at a time; with `lanes`, one lane per arm, the lanes side by side and each one a
 * cell at a time, so the credit arm still runs one session at a time (the wall's concurrency) while
 * the reference works on the subscription. A subscription cell the usage limit paused waits for the
 * reset and runs again, as the judge does; nothing moves to the credit.
 */
export async function runCells({ cells, runDir, cli, ledger, entry, api, runId, onCell, lanes = false, wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), cellRunner = runCell }) {
  const done = [];
  const one = async (c) => {
    const cellDir = path.join(runDir, 'cells', c.id);
    for (;;) {
      rmSync(cellDir, { recursive: true, force: true });
      const t = Date.now();
      const cell = await cellRunner({ arm: c.arm, brief: c.brief, cellDir, cli, ledger, entry: { ...entry, ...(c.entry ?? {}) }, shape: api.shape, runId: `${runId}-${c.id}`, log: (l) => console.log(l) });
      console.log(`  ${c.id.padEnd(40)} ${describe(cell)} [${Math.round((Date.now() - t) / 1000)}s]`);
      if (onCell) onCell(cell);
      if (cell.outcome === 'paused' && c.arm.funding === 'subscription') {
        console.log(`  ${c.id}: paused by the usage limit until ${cell.resetsAt ?? 'an unknown reset'}; this lane waits, then runs it again`);
        await wait(pauseMs({ resetsAt: cell.resetsAt ?? null }));
        continue;
      }
      done.push({ id: c.id, dir: cellDir, brief: c.brief.id, arm: c.arm.id, model: c.arm.model, cell });
      return;
    }
  };
  const groups = lanes ? [...new Set(cells.map((c) => c.arm.id))].map((id) => cells.filter((c) => c.arm.id === id)) : [cells];
  // A lane that stops (a cost that could not be read) stops alone: the other finishes its cell
  // before the run reports the stop, so nothing it started is left without its cleanup.
  const settled = await Promise.allSettled(groups.map(async (group) => {
    for (const c of group) await one(c);
  }));
  const stopped = settled.find((s) => s.status === 'rejected');
  if (stopped) throw stopped.reason;
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
  // The exam names its own briefs, the sealed twenty (4.1); `--briefs` may pick some of them.
  const examPhase = examPending(ledger) === phase;
  // A brief's session runs at agent.md's budget unless the run names another; a proof keeps its own.
  const budgetCents = value('budget-cents') !== undefined ? Number(value('budget-cents')) : ids.length || examPhase ? (agentSessionBudgetCents() ?? 0) : 0;
  // The wall's margin is the reserve's `o` and critic share unless a flag names others (H6 gives
  // its critic a margin before measuring it).
  const margin = orFail(() => ({ overshootCents: flagCents('overshoot-cents'), criticCents: flagCents('critic-cents') }));
  const model = value('model', '');
  const effort = value('effort', '');
  const ceilingCents = value('ceiling-cents') === undefined ? null : Number(value('ceiling-cents'));
  // --dry makes every check that comes before the first session, then stops: nothing uploaded, no
  // session, $0. It needs no briefs; in the exam it opens and verifies the sealed ones, which is
  // the check before the exam's first session. Any spelling of it (`--dry=1`, `--dry-run`) counts,
  // so a typo never turns it into a paid run.
  const dry = argv.some((a) => /^--dry\b/.test(a));
  if (!arms.length || !(dry || ids.length || proofIds.length || examPhase)) fail('--build needs --arms and --briefs (or --proof): a paid run names exactly what it spends on');
  if ((ids.length || examPhase) && arms.includes('managed-agents') && !(Number.isInteger(budgetCents) && budgetCents > 0)) fail('--build with managed-agents needs --budget-cents <n>, the per-session cap');
  if (examPhase) {
    // The exam runs what tuning chose, at the budget its reserve holds and inside that reserve.
    const r = ledger.reserve;
    if (budgetCents !== r.sessionBudgetCents) fail(`the exam's sessions run at the reserve's B, ${r.sessionBudgetCents} cents, not ${budgetCents}: agent.md's budget and the reserve must agree`);
    if (!dry && arms.includes('managed-agents') && ceilingCents > r.cents) fail(`the exam's ceiling is at most its reserve, ${r.cents} cents, not ${ceilingCents}`);
    if (effort || value('agent-version') !== undefined) fail("the exam runs the lock's agent as tuned: no --effort or --agent-version");
  }
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
  const briefs = examPhase ? await sealedRunBriefs({ cli, ledger, phase, ids }) : tuningBriefs(ids);
  const runDir = path.resolve(value('out', path.join(os.tmpdir(), 'noacg-harness', `${phase}-${stamp()}`)));
  if (runDir.startsWith(ROOT + path.sep)) fail(`--out must be outside the repository (${ROOT}): a reference session there would load this repo's instructions`);
  mkdirSync(runDir, { recursive: true });
  const all = [];
  let api = null;
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
      pin = orFail(() => examSkill({ ledger, phase, lock, bundle: skillBundle(path.join(runDir, 'skill')) }));
      if (pin.refusal) fail(pin.refusal);
      console.log(`  skill: ${pin.note}`);
    }
    // In the exam the bench is frozen (harness-agent-sync refuses to change it), so a difference
    // found here is never repaired by a sync.
    const exam = examPending(ledger) === phase;
    const resync = 'run node scripts/harness-agent-sync.mjs --workspace bench --apply first';
    const restoreFiles = exam ? `the exam runs agent v${lock?.agent.version} as tuned and the bench is frozen until it closes, so restore the files to what the lock synced` : resync;
    const decideServer = exam ? "the exam cannot run what tuning chose, and nothing in this checkout restores it. Decide in the spec's phase notes: re-syncing means reverting the freeze and measuring the new version first" : resync;
    let managed = null;
    if (arms.includes('managed-agents')) {
      // The sessions run the agent as it was synced: a definition changed since the sync would be
      // measured as something it is not. Another model runs as a per-session override of the
      // synced version (`agent_with_overrides`), never as a silent edit of the agent. Planned with
      // the lock's skill, so a skill difference is examSkill's to name, above.
      const { environment: environmentDef, agent: agentDef, subagents } = readDefinitions(AGENT_DIR);
      const drift = syncPlan({ lock, environment: environmentDef, agent: agentDef, subagents, bundle: { sha256: lock.skill.bundleSha256 } }).filter((step) => step.action !== 'keep');
      if (drift.length) fail(`agents/noacg-harness changed since the last sync (${drift.map((d) => `${d.resource} ${d.action}`).join(', ')}): ${restoreFiles}`);
      // A round's control runs an earlier version the sync made (immutable on the server), as its
      // own arm so the ledger and the judge keep it apart from the version under test.
      const agentVersion = orFail(() => controlVersion(value('agent-version'), lock.agent.version));
      const adopt = orFail(() => adoptions(list('adopt'), ids));
      const agentModel = agentDef.config.model?.id ?? agentDef.config.model;
      // An override replaces the agent's model object in full, so an effort alone restates the model.
      const override = (id) => ((id && id !== agentModel) || effort ? { id: id || agentModel, ...(effort ? { effort } : {}) } : null);
      // The reference's --model must not become the exam sessions' model: the exam runs v7's own.
      if (exam && override(model)) fail(`the exam's sessions run agent v${lock.agent.version}'s own model, ${agentModel}: --model ${model} would override it (the reference arm takes the same model)`);
      sdk = await workspaceClient('bench');
      if (!sdk) fail('no ANTHROPIC_BENCH_API_KEY in .env.bench.local: run `node scripts/bench-env.mjs --profile=harness`');
      // The lock says what the sync sent; a session runs what the server kept (H6's v5 kept v4's critic).
      const { drift: serverDrift } = await agentReadBack(sdk, lock, agentDef);
      if (serverDrift.length) fail(`the server's agent v${lock.agent.version} differs from agents/noacg-harness in ${serverDrift.join(', ')}: ${decideServer}`);
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
    api = await loadHarnessApi();
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
      // Each arm in its own lane, side by side: the credit arm still one session at a time.
      lanes: true,
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
    await api?.cleanup();
  }
}

// ── --judge ───────────────────────────────────────────────────────────────────────────────────

/**
 * Judge a run with the FROZEN judge (4.3): every delivered cell alone, and every two arms on one
 * brief as a pair in both orders. Refused before anything starts when the judge's files differ
 * from judge.lock.json: a judge changed after calibration is not the judge that was calibrated.
 * Writes `judgements.jsonl` in the run directory; a usage-limit pause is recorded in the ledger and
 * waited out, never moved to the credit. `deliveredOnly` judges only the cells that delivered (the
 * exam: a graphic not handed in as ready is not one a pair weighs, phase-8.md); `concurrency`
 * judgements run at once.
 */
export async function judgeRun({ runDir, judgeDir = path.join(HARNESS, 'judge'), phase = null, claude, env, run, log = console.log, deliveredOnly = false, concurrency = 1, briefs = null }) {
  const judge = loadJudge(judgeDir);
  if (!judge.frozen) throw new Error(`the exam judges only with a frozen judge: ${judge.reason}`);
  const cellsDir = path.join(runDir, 'cells');
  const cells = readdirSync(cellsDir)
    .filter((d) => existsSync(path.join(cellsDir, d, 'cell.json')) && existsSync(path.join(cellsDir, d, 'frames', 'coverage.json')))
    .map((d) => ({ id: d, dir: path.join(cellsDir, d), cell: JSON.parse(readFileSync(path.join(cellsDir, d, 'cell.json'), 'utf8')), brief: JSON.parse(readFileSync(path.join(cellsDir, d, 'brief.json'), 'utf8')) }))
    .filter((c) => (!deliveredOnly || c.cell.outcome === 'delivered') && (!briefs || briefs.includes(c.cell.brief)));
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
  // Every judgement as a task, singles first, then pairs; `concurrency` of them at once.
  const tasks = cells.map((c) => async () => {
    const r = await once(`single:${c.id}`, () => judgeSingle(judge, { brief: c.brief.prompt, frames: graphic(c).frames, operator: graphic(c).operator, actions: c.brief.expect?.actions ?? [], dir: path.join(runDir, 'judge', 'single', c.id), claude, env, run }));
    if (r) {
      record({ task: 'single', id: c.id, brief: c.cell.brief, ...r });
      log(`  single   ${c.id.padEnd(48)} ${r.error ? `ERROR ${r.error}` : `airable ${r.answer.airable}`}`);
    }
  });
  const byBrief = new Map();
  for (const c of cells) byBrief.set(c.cell.brief, [...(byBrief.get(c.cell.brief) ?? []), c]);
  for (const [brief, list] of byBrief) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (list[i].cell.arm === list[j].cell.arm) continue;
        const [x, y] = [list[i], list[j]];
        const id = `${x.id}|${y.id}`;
        // Which one goes first is decided by the pair's own hash: no arm is always A.
        const xFirst = parseInt(createHash('sha256').update(id).digest('hex').slice(0, 2), 16) % 2 === 0;
        tasks.push(async () => {
          const r = await once(`pairwise:${id}`, (answered) => judgePair(judge, { brief: x.brief.prompt, x: graphic(x), y: graphic(y), xFirst, actions: x.brief.expect?.actions ?? [], answered, dir: path.join(runDir, 'judge', 'pairwise', id.replace('|', '~')), claude, env, run }));
          if (r) {
            record({ task: 'pairwise', id, brief, ...r });
            log(`  pairwise ${id.padEnd(48)} ${r.error ? `ERROR ${r.error}` : `prefers ${r.combined}`}`);
          }
        });
      }
    }
  }
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) await tasks[next++]();
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, tasks.length)) }, worker));
  return { judge: { model: judge.lock.model, fingerprint: judge.fingerprint }, file: out };
}

// ── --recapture ───────────────────────────────────────────────────────────────────────────────

/**
 * Before the judge (instruments.md entry 6): a stress value the label rule put on the wrong field
 * is moved by hand to the field it was written for, named in `rekey` as `{ brief: { arm: {
 * stressKey: fieldKey or null for none } } }`, and BOTH arms of that brief are captured again from their delivered
 * zips, so the pair is judged on one capture rule. The first frames stay as `frames.before-rekey`.
 */
export async function recaptureCells({ runDir, rekey, cli, log = console.log }) {
  const out = [];
  for (const [brief, byArm] of Object.entries(rekey)) {
    const dirs = readdirSync(path.join(runDir, 'cells')).filter((d) => d.startsWith(`${brief}.`) && existsSync(path.join(runDir, 'cells', d, 'cell.json')));
    if (!dirs.length) throw new Error(`--recapture: no cell of ${brief} in ${runDir}`);
    for (const d of dirs) {
      const dir = path.join(runDir, 'cells', d);
      const cell = JSON.parse(readFileSync(path.join(dir, 'cell.json'), 'utf8'));
      const zip = [path.join(dir, 'outputs', 'record.zip'), path.join(dir, 'reference', 'work', 'outputs', 'record.zip')].find((f) => existsSync(f));
      if (!zip || !cell.capture) continue;
      const stressPath = path.join(dir, 'stress.json');
      const file = JSON.parse(readFileSync(stressPath, 'utf8'));
      for (const [key, to] of Object.entries(byArm[cell.arm] ?? {})) {
        const was = file.stressMap?.[key];
        if (!was) throw new Error(`--recapture: ${d} has no stress key "${key}"`);
        const valueOf = file.stress[was.to];
        delete file.stress[was.to];
        // `null`: the package has no field this value was written for, so it is shown nowhere.
        if (to !== null) file.stress[to] = valueOf;
        file.stressMap[key] = { to, by: to === null ? 'dropped' : 'rekeyed', from: was.to, label: null };
      }
      writeFileSync(stressPath, `${JSON.stringify(file, null, 2)}\n`);
      const frames = path.join(dir, 'frames');
      const before = path.join(dir, 'frames.before-rekey');
      if (!existsSync(before)) cpSync(frames, before, { recursive: true });
      rmSync(frames, { recursive: true, force: true });
      const coverage = await cli(['coverage', zip, '--out', frames, '--stress', stressPath, '--json'], { cwd: dir });
      cell.capture = { ...cell.capture, exit: coverage.code, frames: coverage.json?.frames ?? 0, crops: coverage.json?.crops ?? 0, findings: coverage.json?.findings ?? [], failures: coverage.json?.failures ?? [coverage.stderr.slice(-300)], digest: coverage.json?.digest ?? null, rekeyed: Object.keys(byArm[cell.arm] ?? {}) };
      writeFileSync(path.join(dir, 'cell.json'), `${JSON.stringify(cell, null, 2)}\n`);
      log(`  ${d.padEnd(48)} re-captured: ${cell.capture.frames} frame(s)${cell.capture.rekeyed.length ? `, re-keyed ${cell.capture.rekeyed.join(', ')}` : ''}`);
      out.push({ cell: d, rekeyed: cell.capture.rekeyed, frames: cell.capture.frames });
    }
  }
  return out;
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
    const concurrency = Number(value('concurrency', '1'));
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4) fail('--concurrency takes 1 to 4 judgements at once');
    const r = await judgeRun({ runDir, phase: PHASE.test(phase ?? '') ? phase : null, claude, env, deliveredOnly: has('delivered-only'), concurrency, briefs: list('briefs').length ? list('briefs') : null }).catch((e) => fail(e instanceof Error ? e.message : String(e)));
    console.log(`Judged with ${r.judge.model} (${r.judge.fingerprint.slice(0, 12)}): ${r.file}`);
  } else if (has('tally')) {
    // 4.4's numbers and 4.5's verdict for an exam run, as phase-8.md fixed the counting.
    const runDir = path.resolve(value('tally', ''));
    const cellsDir = path.join(runDir, 'cells');
    if (!existsSync(cellsDir)) fail('--tally needs a run directory holding cells/');
    const cells = readdirSync(cellsDir).filter((d) => existsSync(path.join(cellsDir, d, 'cell.json'))).map((d) => JSON.parse(readFileSync(path.join(cellsDir, d, 'cell.json'), 'utf8')));
    const file = path.join(runDir, 'judgements.jsonl');
    const judgements = existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    const ledger = readLedger(LEDGER_FILE);
    // The gate's flags read against the operator surface (3.5, phase-8.md), when the run has them.
    const readingsFile = path.resolve(value('readings', path.join(HARNESS, 'exam', 'action-readings.json')));
    const readings = existsSync(readingsFile) ? JSON.parse(readFileSync(readingsFile, 'utf8')).readings : {};
    const args = { briefIds: [...new Set(cells.map((c) => c.brief))].sort(), cells, judgements, budgetCents: ledger.reserve?.sessionBudgetCents ?? null, fingerprint: loadJudge(path.join(HARNESS, 'judge')).fingerprint };
    const tally = tallyExam({ ...args, readings });
    const gateOnly = tallyExam(args);
    writeFileSync(path.join(runDir, 'tally.json'), `${JSON.stringify({ ...tally, gateOnly: { verdict: gateOnly.verdict, lines: gateOnly.lines, harnessUsable: gateOnly.harness.usable, referenceUsable: gateOnly.reference.usable } }, null, 2)}\n`);
    console.log(tallyMarkdown(tally));
    console.log(`\nBy the missing-action gate alone (no readings): ${gateOnly.verdict}; ${gateOnly.lines.map((l) => `${l.holds ? 'holds' : 'FAILS'}: ${l.figure}`).join('; ')}`);
    console.log(`\n${path.join(runDir, 'tally.json')}`);
  } else if (has('recapture')) {
    // FREE. Re-key a stress value the label rule misplaced, and capture both arms of its brief again.
    const runDir = path.resolve(value('recapture', ''));
    if (!existsSync(path.join(runDir, 'cells')) || !value('rekey')) fail('--recapture <runDir> --rekey <file>: { brief: { arm: { stressKey: fieldKey } } }');
    ensureCli();
    const cli = makeCli({ url: process.env.NOACG_URL || 'https://noacg.studio' });
    await ensureBridge(cli);
    await recaptureCells({ runDir, rekey: JSON.parse(readFileSync(path.resolve(value('rekey')), 'utf8')).rekey, cli }).catch((e) => fail(e instanceof Error ? e.message : String(e)));
  } else if (has('review')) {
    const runDir = path.resolve(value('review', ''));
    const cellsDir = path.join(runDir, 'cells');
    if (!existsSync(cellsDir)) fail('--review needs a run directory holding cells/');
    // `--briefs` picks the briefs the page shows (the exam's owner gallery is about ten pairs, 4.6);
    // `--into` builds it elsewhere (benchmarks/harness/exam/gallery/, never committed).
    const only = list('briefs');
    const cells = readdirSync(cellsDir).filter((d) => existsSync(path.join(cellsDir, d, 'cell.json'))).map((d) => {
      const cell = JSON.parse(readFileSync(path.join(cellsDir, d, 'cell.json'), 'utf8'));
      return { id: d, dir: path.join(cellsDir, d), brief: cell.brief, arm: cell.arm, model: cell.model, cell };
    }).filter((c) => !only.length || only.includes(c.brief));
    // Each cell keeps the brief it ran (an exam brief is in no bank here).
    const briefs = cells.map((c) => (existsSync(path.join(c.dir, 'brief.json')) ? JSON.parse(readFileSync(path.join(c.dir, 'brief.json'), 'utf8')) : null)).filter(Boolean);
    const into = value('into') ? path.resolve(value('into')) : runDir;
    mkdirSync(into, { recursive: true });
    console.log(buildGallery({ runDir: into, cells, briefs: [...briefs, ...JSON.parse(readFileSync(TUNING, 'utf8')).briefs], salt: path.basename(runDir) }).review);
  } else printLedger(readLedger(LEDGER_FILE));
}
