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
//                                  --budget-cents <n> --model <id> [--overshoot-cents 50] [--out <dir>]
//                                                    PAID. Real sessions: managed-agents on the bench
//                                                    key's credit (scripts/bench-env.mjs --profile=harness),
//                                                    claude-code on the owner's subscription. Refused
//                                                    when the ledger already holds that phase as
//                                                    completed, and per session when what is left
//                                                    cannot cover its budget and the overshoot margin.
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
import { claudeCodeArm, fakeAgentWork, fakeArm, isLibraryBrief, managedAgentsArm, packCli } from '../benchmarks/harness/lib/arms.mjs';
import { makeCli, CLI_ENTRY } from '../benchmarks/harness/lib/cli.mjs';
import { buildGallery } from '../benchmarks/harness/lib/gallery.mjs';
import { coverageFrames, judgePair, judgeSingle, loadJudge } from '../benchmarks/harness/lib/judge.mjs';
import { admit, appendEntry, DEFAULT_OVERSHOOT_CENTS, dollars, phaseCompleted, phaseSpentCents, readLedger, summary, writeLedger } from '../benchmarks/harness/lib/ledger.mjs';
import { packagesEnvironment, PROOFS } from '../benchmarks/harness/lib/feasibility.mjs';
import { runCell } from '../benchmarks/harness/lib/pipeline.mjs';
import { checkSubscriptionAuth, claudeExecutable, pauseMs, subscriptionEnv } from '../benchmarks/harness/lib/subscription.mjs';
import { readAgentDefinition, readEnvironmentDefinition } from '../benchmarks/harness/lib/agent-def.mjs';
import { AGENT_DIR, keyFor, lockPath, skillBundle, syncPlan } from './harness-agent-sync.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HARNESS = path.join(ROOT, 'benchmarks', 'harness');
export const LEDGER_FILE = path.join(HARNESS, 'ledger.json');
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

/** `--build` may create sessions only for a phase the ledger does not already hold as completed. */
export function refuseCompletedPhase(ledger, phase) {
  if (!/^H\d+$/.test(phase ?? '')) return `--build needs a phase like H3, got "${phase}"`;
  if (phaseCompleted(ledger, phase)) return `the ledger already holds ${phase} as completed; a completed phase never spends again`;
  return null;
}

/** The cells of a `--build` the ledger does not already hold for that phase. A cell that ran
 *  (delivered, not ready or failed) is never paid twice; a refused or paused one runs again. */
export function pendingCells(ledger, phase, cells) {
  const ran = (c) => ledger.entries.some((e) => e.kind === 'session' && e.phase === phase && e.brief === c.brief.id && e.arm === c.arm.id && !['refused', 'paused'].includes(e.outcome));
  return cells.filter((c) => !ran(c));
}

function printLedger(ledger) {
  const s = summary(ledger);
  console.log(`Ledger ${path.relative(ROOT, LEDGER_FILE)}: ${dollars(s.spentCents)} of ${dollars(ledger.runBudgetCents)} credit spent, ${dollars(s.remainingCents)} left.`);
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
  const refusal = refuseCompletedPhase(ledger, phase);
  if (refusal) fail(refusal);
  const proofIds = list('proof');
  const arms = proofIds.length && !list('arms').length ? ['managed-agents'] : list('arms');
  const ids = list('briefs');
  const budgetCents = Number(value('budget-cents', ''));
  const model = value('model', '');
  const effort = value('effort', '');
  const ceilingCents = value('ceiling-cents') === undefined ? null : Number(value('ceiling-cents'));
  if (!arms.length || !(ids.length || proofIds.length)) fail('--build needs --arms and --briefs (or --proof): a paid run names exactly what it spends on');
  if (ids.length && arms.includes('managed-agents') && !(Number.isInteger(budgetCents) && budgetCents > 0)) fail('--build with managed-agents needs --budget-cents <n>, the per-session cap');
  if (arms.includes('claude-code') && !model) fail('--build with claude-code needs --model, the exact model id the reference session runs');
  if (ceilingCents !== null && !(Number.isInteger(ceilingCents) && ceilingCents > 0)) fail('--ceiling-cents is the phase ceiling in whole cents');
  for (const a of arms) if (!['managed-agents', 'claude-code'].includes(a)) fail(`unknown arm ${a}`);
  if (proofIds.length && (phase !== 'H3' || arms.join() !== 'managed-agents')) fail('--proof is H3\'s, on the managed-agents arm alone');
  for (const id of proofIds) if (!PROOFS[id]) fail(`no H3 proof ${id} (${Object.keys(PROOFS).join(', ')})`);
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
    if (arms.includes('managed-agents')) {
      const lockFile = lockPath('bench');
      if (!existsSync(lockFile)) fail(`no ${path.relative(ROOT, lockFile)}: sync the agent first (node scripts/harness-agent-sync.mjs --workspace bench --apply)`);
      const lock = JSON.parse(readFileSync(lockFile, 'utf8'));
      // The sessions run the agent as it was synced: a definition changed since the sync would be
      // measured as something it is not. Another model runs as a per-session override of the
      // synced version (`agent_with_overrides`), never as a silent edit of the agent.
      const agentDef = readAgentDefinition(AGENT_DIR);
      const environmentDef = readEnvironmentDefinition(AGENT_DIR);
      const bundleDir = path.join(runDir, 'skill');
      const drift = syncPlan({ lock, environment: environmentDef, agent: agentDef, bundle: skillBundle(bundleDir) }).filter((step) => step.action !== 'keep');
      if (drift.length) fail(`agents/noacg-harness changed since the last sync (${drift.map((d) => `${d.resource} ${d.action}`).join(', ')}): run node scripts/harness-agent-sync.mjs --workspace bench --apply first`);
      const agentModel = agentDef.config.model?.id ?? agentDef.config.model;
      const override = (id) => (id && id !== agentModel ? { id, ...(effort ? { effort } : {}) } : null);
      const key = keyFor('bench');
      if (!key) fail('no ANTHROPIC_BENCH_API_KEY in .env.bench.local: run `node scripts/bench-env.mjs --profile=harness`');
      const { default: Anthropic, toFile } = await import('@anthropic-ai/sdk');
      sdk = new Anthropic({ apiKey: key });
      const upload = async (file) => (await sdk.files.upload({ file: await toFile(readFileSync(file), path.basename(file), { type: 'application/gzip' }) })).id;
      const tarball = packCli(path.join(runDir, 'cli'));
      uploaded = { id: await upload(tarball) };
      const arm = (cellBudget, modelOverride) => managedAgentsArm({ api: sdk, client: api.client, agent: { id: lock.agent.id, version: lock.agent.version }, environmentId: lock.environment.id, budgetCents: cellBudget, model: agentModel, modelOverride, funding: 'credit', files: [{ fileId: uploaded.id, mountPath: '/noacg-cli.tgz' }], upload, downloadAll: true });
      for (const brief of briefs) all.push({ id: `${brief.id}.managed-agents`, brief, arm: arm(budgetCents, override(model)), entry: { budgetCents } });
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
    if (arms.includes('claude-code')) {
      const token = mainEnv().CLAUDE_CODE_OAUTH_TOKEN;
      const reference = claudeCodeArm({ claude: claudeExecutable(), token, model, url });
      for (const brief of briefs) all.push({ id: `${brief.id}.claude-code`, brief, arm: reference });
    }
    const runId = `${phase}-${stamp()}`;
    const entry = { phase, stage: value('stage', 'build'), budgetCents: budgetCents || 1, overshootCents: Number(value('overshoot-cents', String(DEFAULT_OVERSHOOT_CENTS))), ceilingCents };
    // A resumed run skips what the ledger already holds for this phase: a cell that ran (delivered,
    // not ready or failed) is never paid twice; only a refused or paused one runs again.
    const cells = pendingCells(ledger, phase, all);
    if (cells.length < all.length) console.log(`  ${all.length - cells.length} cell(s) already in the ledger for ${phase}, not run again: ${all.filter((c) => !cells.includes(c)).map((c) => c.id).join(', ')}`);
    console.log(`BUILD ${phase}: ${cells.length} cell(s), ${dollars(summary(ledger).remainingCents)} left on the ledger${ceilingCents ? `, ${dollars(ceilingCents - phaseSpentCents(ledger, phase))} under ${phase}'s ceiling` : ''} -> ${runDir}`);
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
    if (uploaded && sdk) await sdk.files.delete(uploaded.id).catch(() => undefined);
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
  else if (has('close')) {
    const phase = value('close', '');
    if (!/^H\d+$/.test(phase)) fail('--close needs a phase like H3');
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
    const r = await judgeRun({ runDir, phase: /^H\d+$/.test(phase ?? '') ? phase : null, claude, env }).catch((e) => fail(e instanceof Error ? e.message : String(e)));
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
