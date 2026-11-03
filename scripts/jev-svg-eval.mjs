// THE JEV SVG COMPARISON AND METERING HARNESS (docs/work-specs/jev-svg-import/spec.md, row 32;
// AC-6 and AC-7; rules in docs/work-specs/jev-svg-import/evidence/phase-32.md).
//
// It compares, over the same designs and the same ground truth, what today's deterministic import
// proposes with what each declared model configuration proposes, and it meters every paid call
// against the evaluation's $5 ceiling. Rows 33 and 34 run it, paid, ONLY from the main-only
// workflow .github/workflows/jev-svg-eval.yml in the protected `jev-svg-evaluation` environment.
// This row runs it as a dry run with mocks: no paid call.
//
// Trust boundary. This file, the adapter and the workflow come from main. A dispatch names a
// configuration branch; `fetch-config` resolves it ONCE to an immutable commit and reads only
// docs/work-specs/jev-svg-import/evaluation/prompts.json at that commit, through git plumbing, as
// bytes. `validateConfiguration` then holds it to a closed schema: fixed keys, allowlisted model
// routes with audited prices, plain-text instructions with no URL, markup or template syntax, and
// the pre-registered primary candidate. Nothing from the branch is checked out, imported or run.
//
// Metering is a chain of receipts in one JSON ledger, carried from run to run as an Actions
// artifact and copied into row evidence: the original balance baseline (never reset), then one
// receipt per batch with the balance before and after, the priced maximum, attempts and the
// settled cost. No reservation service, database or scheduler: `admitBatch` reads the ledger and
// a fresh `/v1/credits` reading and says yes or why not.
//
//   node scripts/jev-svg-eval.mjs config --file <prompts.json>
//   node scripts/jev-svg-eval.mjs fetch-config --ref <branch or sha> --out <file>
//   node scripts/jev-svg-eval.mjs freeze
//   node scripts/jev-svg-eval.mjs run --mode dry-run|development|holdout --config <file> --config-sha <sha> ...
//   node scripts/jev-svg-eval.mjs chain --runs <runs.json> --mode <mode> --receipts-run-id <id> ...
//   node scripts/jev-svg-eval.mjs reconcile --ledger <in> --ledger-out <out> --reason <words>
//        [--accept-manifest] [--freeze --config <file> --config-sha <sha>]
//        [--lost-runs <ids> --lost-partition <p> --lost-attempts <n>]
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const root = (rel) => path.join(ROOT, rel);

export const CONFIG_PATH = 'docs/work-specs/jev-svg-import/evaluation/prompts.json';
export const CONFIG_MAX_BYTES = 16_384;
export const CONFIG_SCHEMA = 'jev-svg-eval-config/1';
export const LEDGER_SCHEMA = 'jev-svg-eval-ledger/1';
export const SCORING_VERSION = 'jev-svg-score/1';
export const ENVIRONMENT = 'jev-svg-evaluation';

/** The spec's ceiling ("AI route and data policy", Ceiling). */
export const CAP = Object.freeze({
  totalUsd: 5,
  partitionUsd: Object.freeze({ development: 2, holdout: 3 }),
  attempts: 500,
  attemptsPerRequest: 2,
});

/** The pre-registered primary: structured Jev 1.14, no pixels. A configuration cannot move it. */
export const PRIMARY = Object.freeze({ id: 'jev-structured', kind: 'decision', model: 'typesafe-ai/jev-1.14.0' });

/**
 * The admitted routes, with prices per million tokens from the free, unauthenticated gateway
 * listing (GET https://ai-gateway.vercel.sh/v1/models) read on 2026-11-03. A dated snapshot, not
 * measured performance: recheck before the first paid batch (row 33). A route not listed here is
 * refused, so an unpriced route can never be admitted. `image` is the per-image input-token bound
 * a vision call is priced at; it is generous on purpose, and a vision batch is one request so the
 * receipt settles each one. `providers` is the `only` allowlist sent with every call: with
 * zero data retention and no prompt training pinned on, the gateway refuses rather than routing
 * anywhere else.
 */
export const ROUTES = Object.freeze({
  'typesafe-ai/jev-1.14.0': { kind: 'decision', input: 0.042, output: 0, context: 32_000, providers: ['typesafe-ai'] },
  'baseten/elephant-1': { kind: 'decision', input: 0.035, output: 0, context: 16_384, providers: ['baseten'] },
  'anthropic/claude-haiku-5.5': { kind: 'chat', input: 0.1, output: 0.5, context: 1_000_000, providers: ['anthropic'] },
  'openai/gpt-6-luna': { kind: 'chat', input: 0.1, output: 0.5, context: 1_050_000, providers: ['openai'] },
  'google/gemini-2.5-flash-lite': { kind: 'vision', input: 0.1, output: 0.4, context: 1_048_576, image: 8_000, providers: ['google', 'vertex'] },
});

/** Established baselines, by what they are rather than by name: today's deterministic import and
 *  the existing image task's route. Reported, never chosen, not counted as challengers. */
export const VISION_BASELINE_MODEL = 'google/gemini-2.5-flash-lite';
export const isBaseline = (c) => c.kind === 'deterministic' || (c.kind === 'vision' && c.model === VISION_BASELINE_MODEL);
/** At most this many reporting-only challengers go into the holdout beside primary and baselines. */
export const HOLDOUT_CHALLENGERS = 2;

/** The image input of `/v1/evaluate` is not qualified (phase-32 notes): Jev with pixels is
 *  reported as unqualified and never sent until a reviewed change on main qualifies it. */
export const DECISION_PREVIEW_QUALIFIED = false;

const OUTPUT_TOKENS = 4_000;
const FRAMING_TOKENS = 512;
const EPS = 1e-9;

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const isRecord = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const SHA = /^[0-9a-f]{40}$/;

// ---- Configuration: data from an immutable branch commit ----

const UNPLAIN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
/** No URL, markup, template or code syntax in an instruction; `{layer}` is the one placeholder. */
const FORBIDDEN = /:\/\/|www\.|\$\{|\{\{|\}\}|`|<|>|\\/;
const CANDIDATE_ID = /^[a-z][a-z0-9-]{1,31}$/;
const FAMILIES = ['scoreboard', 'clock', 'quiz', 'credits'];

function keysExactly(value, required, optional = []) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return required.every((k) => keys.includes(k)) && keys.every((k) => required.includes(k) || optional.includes(k));
}

function instruction(value, max, placeholder = false) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || UNPLAIN.test(value)) return false;
  if (FORBIDDEN.test(value)) return false;
  const holes = value.match(/\{[^}]*\}|\{|\}/g) ?? [];
  return placeholder ? holes.length === 1 && holes[0] === '{layer}' : holes.length === 0;
}

/**
 * The configuration, or a refusal naming the rule. Strict: an unknown key anywhere, an unlisted
 * route, a kind that does not match its route, a preview on a non-decision arm, or a primary
 * that is not the pre-registered one, refuses the whole file.
 */
export function validateConfiguration(bytes) {
  const text = Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes), 'utf8');
  if (text.length === 0 || text.length > CONFIG_MAX_BYTES) return { ok: false, reason: 'config-size' };
  let config;
  try {
    config = JSON.parse(text.toString('utf8'));
  } catch {
    return { ok: false, reason: 'config-json' };
  }
  if (!keysExactly(config, ['schema', 'primary', 'threshold', 'questions', 'chatSystem', 'candidates'])) return { ok: false, reason: 'config-keys' };
  if (config.schema !== CONFIG_SCHEMA) return { ok: false, reason: 'config-schema' };
  if (config.primary !== PRIMARY.id) return { ok: false, reason: 'primary-not-preregistered' };
  if (typeof config.threshold !== 'number' || !(config.threshold >= 0.05 && config.threshold <= 0.95)) return { ok: false, reason: 'threshold' };
  const q = config.questions;
  if (!keysExactly(q, ['behaviour', 'field'], ['fieldCriteria'])) return { ok: false, reason: 'questions-keys' };
  if (!keysExactly(q.behaviour, FAMILIES) || !FAMILIES.every((f) => instruction(q.behaviour[f], 400))) return { ok: false, reason: 'questions-behaviour' };
  if (!instruction(q.field, 390, true)) return { ok: false, reason: 'questions-field' };
  if (q.fieldCriteria !== undefined && !(keysExactly(q.fieldCriteria, ['true', 'false'])
    && instruction(q.fieldCriteria.true, 160) && instruction(q.fieldCriteria.false, 160))) return { ok: false, reason: 'questions-criteria' };
  if (!instruction(config.chatSystem, 600)) return { ok: false, reason: 'chat-system' };
  if (!Array.isArray(config.candidates) || config.candidates.length < 2 || config.candidates.length > 8) return { ok: false, reason: 'candidates-count' };
  const ids = new Set();
  for (const c of config.candidates) {
    if (!isRecord(c) || !CANDIDATE_ID.test(c.id) || ids.has(c.id)) return { ok: false, reason: 'candidate-id' };
    ids.add(c.id);
    // The baseline is found by its id: only the deterministic arm may hold it, and it holds no other.
    if ((c.kind === 'deterministic') !== (c.id === 'deterministic')) return { ok: false, reason: 'deterministic-id' };
    if (c.kind === 'deterministic') {
      if (!keysExactly(c, ['id', 'kind'])) return { ok: false, reason: 'candidate-keys' };
      continue;
    }
    if (!['decision', 'chat', 'vision'].includes(c.kind)) return { ok: false, reason: 'candidate-kind' };
    if (!keysExactly(c, ['id', 'kind', 'model'], c.kind === 'decision' ? ['preview'] : [])) return { ok: false, reason: 'candidate-keys' };
    const route = ROUTES[c.model];
    if (!route || route.kind !== c.kind) return { ok: false, reason: 'route-not-admitted' };
    if (c.preview !== undefined && typeof c.preview !== 'boolean') return { ok: false, reason: 'candidate-preview' };
  }
  const primary = config.candidates.find((c) => c.id === PRIMARY.id);
  if (!primary || primary.kind !== PRIMARY.kind || primary.model !== PRIMARY.model || primary.preview === true) {
    return { ok: false, reason: 'primary-not-preregistered' };
  }
  if (!config.candidates.some((c) => c.kind === 'deterministic')) return { ok: false, reason: 'deterministic-missing' };
  return { ok: true, config, sha256: sha256(text) };
}

const REF = /^(?!-)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._/-]{1,200}$/;

/**
 * Resolve a dispatch's configuration ref ONCE to a commit and read the one fixed path at it, as
 * bytes. Git plumbing only: `fetch` into the object store and `cat-file`. The branch is never
 * checked out and no file of it is executed. `git` is injectable for the tests.
 */
export function fetchConfiguration(ref, { git = (args) => execFileSync('git', args, { cwd: ROOT, maxBuffer: 1 << 20, windowsHide: true }), remote = 'origin' } = {}) {
  if (typeof ref !== 'string' || !REF.test(ref)) return { ok: false, reason: 'ref-shape' };
  const source = SHA.test(ref) ? ref : `refs/heads/${ref}`;
  try {
    git(['fetch', '--no-tags', '--depth=1', remote, source]);
    const sha = git(['rev-parse', '--verify', 'FETCH_HEAD^{commit}']).toString().trim();
    if (!SHA.test(sha)) return { ok: false, reason: 'ref-unresolved' };
    if (SHA.test(ref) && sha !== ref) return { ok: false, reason: 'ref-moved' };
    const object = `${sha}:${CONFIG_PATH}`;
    if (git(['cat-file', '-t', object]).toString().trim() !== 'blob') return { ok: false, reason: 'config-not-blob' };
    const size = Number(git(['cat-file', '-s', object]).toString().trim());
    if (!Number.isInteger(size) || size <= 0 || size > CONFIG_MAX_BYTES) return { ok: false, reason: 'config-size' };
    const bytes = git(['cat-file', 'blob', object]);
    const verdict = validateConfiguration(bytes);
    return verdict.ok ? { ...verdict, commit: sha, bytes } : verdict;
  } catch {
    return { ok: false, reason: 'config-unreadable' };
  }
}

// ---- Freeze ----

/** The sources whose bytes decide a result. Their hashes, with the reader's whole import graph
 *  (`readerGraph`), are the frozen manifest: rows 33 and 34 refuse to run when any differs from
 *  the ledger's baseline, so no harness, scorer, adapter, reader or deterministic-proposal change
 *  lands mid-evaluation unnoticed. */
export const FROZEN_SOURCES = Object.freeze([
  'scripts/jev-svg-eval.mjs',
  'scripts/svg-import-passes.test.mjs',
  'scripts/catalog-emit.mjs',
  'scripts/driven-clock.mjs',
  'scripts/ladder-values.mjs',
  'scripts/rolldown-raw.mjs',
  'scripts/api-runtime-build.mjs',
  'package-lock.json',
  'e2e/fixtures/jev-svg/dev.expect.json',
  'e2e/fixtures/jev-svg/regression.manifest.json',
  'src/ai/svgInterpretation/evidence.ts',
  'src/ai/svgInterpretation/questions.ts',
  'src/ai/svgInterpretation/contract.ts',
  'api/_lib/aiDecisionGateway.ts',
  'api/_lib/aiModelCatalog.ts',
  'api/_lib/aiSvgInterpretationProfile.ts',
  'api/_lib/aiGateway.ts',
  'src/ai/importAnalysis/contract.ts',
  '.github/workflows/jev-svg-eval.yml',
]);

/**
 * Every repository file the in-page reader and the wizard's draft load: the modules the 51-file
 * harness page bundles, and the evidence reader, as rolldown resolves them.
 */
export async function readerGraph() {
  const { SPECS } = await import('./svg-import-passes.test.mjs?library');
  const { rolldown } = await import('rolldown');
  const { rawSuffix } = await import('./rolldown-raw.mjs');
  const files = new Set();
  for (const entry of [...SPECS.map((s) => s.entry), root('src/ai/svgInterpretation/evidence.ts')]) {
    const bundle = await rolldown({ input: entry, platform: 'browser', plugins: [rawSuffix], logLevel: 'silent' });
    const { output } = await bundle.generate({ format: 'iife', name: 'GRAPH', codeSplitting: false });
    await bundle.close();
    for (const id of output[0].moduleIds) {
      const rel = path.relative(ROOT, id.split('?')[0]).split(path.sep).join('/');
      if (!rel.startsWith('..') && !rel.startsWith('node_modules/') && existsSync(root(rel))) files.add(rel);
    }
  }
  return [...files].sort();
}

export function freezeManifest(read = (rel) => readFileSync(root(rel)), graph = []) {
  const sources = [...new Set([...FROZEN_SOURCES, ...graph])].sort();
  const files = Object.fromEntries(sources.map((rel) => [rel, sha256(read(rel))]));
  return { scoring: SCORING_VERSION, primary: PRIMARY, files, sha256: sha256(JSON.stringify(files)) };
}

// ---- Metering: the ledger of receipts ----

export function parseCredits(value) {
  if (!isRecord(value)) return null;
  const n = (v) => {
    const x = typeof v === 'string' ? Number(v) : v;
    return typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null;
  };
  const balance = n(value.balance);
  const totalUsed = n(value.total_used ?? value.totalUsed);
  return balance === null || totalUsed === null ? null : { balance, totalUsed };
}

/** One non-billable credits reading. Never follows a redirect, never logs the key. */
export async function readCredits(key, fetchImpl = fetch) {
  const response = await fetchImpl('https://ai-gateway.vercel.sh/v1/credits', {
    headers: { authorization: `Bearer ${key}` },
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`credits HTTP ${response.status}`);
  const credits = parseCredits(await response.json());
  if (!credits) throw new Error('credits response has an unexpected shape');
  return credits;
}

/**
 * A SETTLED reading: the balance must read the same twice in a row and already show at least
 * the spend the provider reported for answered calls (`knownUsd`; a worst-case charge for an
 * unknown bill is spend counted, not spend the balance must show). Usage lands in the balance after the call returns, so a
 * reading taken at once can understate the batch; an unsettled reading is recorded as such and
 * suspends the next batch.
 */
export async function settledCredits(read, { before, knownUsd = 0, tries = 8, intervalMs = 15_000, sleep } = {}) {
  const wait = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  let last = null;
  for (let i = 0; i < tries; i++) {
    const now = await read().catch(() => null);
    if (now && last && Math.abs(now.balance - last.balance) < EPS && Math.abs(now.totalUsed - last.totalUsed) < EPS
      && (!before || before.balance - now.balance >= knownUsd - 1e-6)) {
      return { credits: now, stable: true };
    }
    last = now;
    if (i < tries - 1) await wait(intervalMs);
  }
  return { credits: last, stable: false };
}

export function newLedger({ credits, runId, mainSha, workflowRef = null, manifest, environment = ENVIRONMENT, mock = false, at = new Date().toISOString() }) {
  if (!parseCredits({ balance: credits?.balance, total_used: credits?.totalUsed })) throw new Error('baseline needs a credits reading');
  return {
    schema: LEDGER_SCHEMA,
    mock,
    baseline: { balance: credits.balance, totalUsed: credits.totalUsed, at, runId, mainSha, workflowRef, environment, manifest },
    acknowledgedTopUpUsd: 0,
    batches: [],
    reconciliations: [],
  };
}

/** Spent so far, conservatively: the largest of the balance drop, the lifetime-usage rise and
 *  the settled receipts. Others' spend on the shared balance counts as ours. */
export function ledgerSpent(ledger, credits) {
  const settled = ledger.batches.reduce((s, b) => s + (b.settledUsd ?? b.maxUsd), 0);
  const drop = ledger.baseline.balance + ledger.acknowledgedTopUpUsd - credits.balance;
  const used = credits.totalUsed - ledger.baseline.totalUsed;
  return Math.max(drop, used, settled, 0);
}

/** The freeze row 33 recorded, if any: the newest reconciliation that carries one. */
export const frozenRecord = (ledger) => [...ledger.reconciliations].reverse().find((r) => r.frozen)?.frozen ?? null;

export function partitionSpent(ledger, partition) {
  return ledger.batches.filter((b) => b.partition === partition).reduce((s, b) => s + (b.settledUsd ?? b.maxUsd), 0);
}

const attemptsSpent = (ledger) => ledger.batches.reduce((s, b) => s + (b.attempts ?? b.plannedAttempts), 0);

/**
 * May this batch be sent? `plan.requests` each carry their priced maximum (every attempt
 * included) and attempt bound. Refuses, in order: no baseline; a batch without its closing
 * receipt; an unreconciled suspension; a reading that is not a number; any sign of new money
 * (balance up since the last receipt, lifetime usage down, or balance plus usage above the
 * baseline's sum); a harness that changed since the baseline; an attempt or price bound broken;
 * and a priced maximum past the $5 or the partition's allowance.
 */
export function admitBatch(ledger, credits, plan, { manifest } = {}) {
  const refuse = (reason) => ({ ok: false, reason });
  if (!ledger || ledger.schema !== LEDGER_SCHEMA || !ledger.baseline) return refuse('missing-baseline');
  if (ledger.batches.some((b) => !b.after)) return refuse('missing-receipt');
  const open = ledger.batches.find((b) => b.suspended && !b.reconciled);
  if (open) return refuse(`suspended:${open.suspended}`);
  if (!credits || !Number.isFinite(credits.balance) || !Number.isFinite(credits.totalUsed)) return refuse('credits-unreadable');
  // The newest reading on record: a reconciliation made after the last batch, else that batch.
  const rec = ledger.reconciliations.at(-1);
  const last = rec && rec.afterBatches >= ledger.batches.length ? rec.credits : (ledger.batches.at(-1)?.after ?? ledger.baseline);
  if (credits.balance > last.balance + EPS) return refuse('balance-increase');
  if (credits.totalUsed < last.totalUsed - EPS) return refuse('usage-decrease');
  const sum = ledger.baseline.balance + ledger.baseline.totalUsed + ledger.acknowledgedTopUpUsd;
  if (credits.balance + credits.totalUsed > sum + 1e-6) return refuse('top-up');
  const accepted = [...ledger.reconciliations].reverse().find((r) => r.manifest)?.manifest ?? ledger.baseline.manifest;
  if (manifest && accepted?.sha256 !== manifest.sha256) return refuse('harness-changed');
  if (!['development', 'holdout'].includes(plan.partition)) return refuse('partition');
  if (!Array.isArray(plan.requests) || plan.requests.length === 0) return refuse('empty-batch');
  for (const r of plan.requests) {
    if (!Number.isInteger(r.attempts) || r.attempts < 1 || r.attempts > CAP.attemptsPerRequest) return refuse('attempt-limit');
    if (typeof r.maxUsd !== 'number' || !Number.isFinite(r.maxUsd) || r.maxUsd <= 0) return refuse('unpriced');
  }
  if (plan.requests.some((r) => r.single) && plan.requests.length > 1) return refuse('single-request-required');
  const plannedAttempts = plan.requests.reduce((s, r) => s + r.attempts, 0);
  if (attemptsSpent(ledger) + plannedAttempts > CAP.attempts) return refuse('attempt-cap');
  const maxUsd = plan.requests.reduce((s, r) => s + r.maxUsd, 0);
  const spent = ledgerSpent(ledger, credits);
  if (spent + maxUsd > CAP.totalUsd + EPS) return refuse('total-cap');
  if (partitionSpent(ledger, plan.partition) + maxUsd > CAP.partitionUsd[plan.partition] + EPS) return refuse('partition-cap');
  return {
    ok: true,
    receipt: {
      index: ledger.batches.length,
      runId: plan.runId ?? null,
      partition: plan.partition,
      arm: plan.arm ?? null,
      requests: plan.requests.map((r) => r.id),
      before: { balance: credits.balance, totalUsed: credits.totalUsed },
      spentBefore: spent,
      maxUsd,
      plannedAttempts,
    },
  };
}

/**
 * Close a batch's receipt from a settled reading. The settled cost is the larger of the balance
 * debit and what the provider reported. Suspends the next batch on: an unsettled reading, a
 * balance that rose, a cost past the batch's priced maximum, more attempts than planned, or a
 * charge whose bill is unknown (sent, no answer). A suspension is cleared only by `reconcile`.
 */
export function closeBatch(receipt, { settled, attempts, reportedUsd, unknownCharges }) {
  const after = settled.credits;
  const out = { ...receipt, attempts, reportedUsd, unknownCharges };
  if (!after) return { ...out, after: null, suspended: 'no-reading' };
  out.after = { balance: after.balance, totalUsed: after.totalUsed };
  const debit = receipt.before.balance - after.balance;
  out.debitUsd = debit;
  out.settledUsd = Math.max(debit, reportedUsd, 0);
  if (!settled.stable) out.suspended = 'unsettled';
  else if (debit < -EPS) out.suspended = 'balance-increase';
  else if (out.settledUsd > receipt.maxUsd + EPS) out.suspended = 'over-bound';
  else if (attempts > receipt.plannedAttempts) out.suspended = 'attempt-overrun';
  else if (unknownCharges > 0) out.suspended = 'unknown-charge';
  return out;
}

/**
 * Reconcile a suspended ledger after a person looked: a fresh settled reading becomes the new
 * comparison point, and any money that arrived (balance plus usage above the expected sum) is
 * recorded as acknowledged so the baseline itself never moves. A missing receipt is closed at
 * its priced maximum. The reason is kept. A reviewed fix that landed on main through its owning
 * row changes the harness manifest; passing `manifest` accepts it here, in the record, rather
 * than resetting anything. `frozen` records the end-of-row-33 freeze (configuration and manifest
 * hashes) that the holdout run is held to; `lost` closes runs that left no ledger.
 */
export function reconcileLedger(ledger, credits, { reason, runId, manifest, frozen, lost, at = new Date().toISOString() }) {
  if (typeof reason !== 'string' || reason.trim().length < 8) throw new Error('a reconciliation needs a reason');
  if (lost) {
    // Runs that started paid work and left no ledger: their spend is the whole drop since the
    // newest reading on record, all charged to the partition named, with the attempts a person
    // read from the gateway's own records.
    if (!Array.isArray(lost.runs) || lost.runs.length === 0 || !['development', 'holdout'].includes(lost.partition)
      || !Number.isInteger(lost.attempts) || lost.attempts < 0) throw new Error('a lost run needs its run ids, partition and attempts');
    const rec = ledger.reconciliations.at(-1);
    const last = rec && rec.afterBatches >= ledger.batches.length ? rec.credits : (ledger.batches.at(-1)?.after ?? ledger.baseline);
    const debit = last.balance - credits.balance;
    ledger = {
      ...ledger,
      batches: [...ledger.batches, {
        index: ledger.batches.length, lostRuns: lost.runs, partition: lost.partition,
        before: { balance: last.balance, totalUsed: last.totalUsed }, after: { balance: credits.balance, totalUsed: credits.totalUsed },
        debitUsd: debit, settledUsd: Math.max(debit, 0), maxUsd: Math.max(debit, 0), plannedAttempts: lost.attempts, attempts: lost.attempts,
        suspended: 'lost-run', reconciled: true,
      }],
    };
  }
  const sum = ledger.baseline.balance + ledger.baseline.totalUsed + ledger.acknowledgedTopUpUsd;
  const arrived = Math.max(0, credits.balance + credits.totalUsed - sum);
  const batches = ledger.batches.map((b) => {
    if (!b.after) return { ...b, after: { balance: credits.balance, totalUsed: credits.totalUsed }, settledUsd: b.maxUsd, suspended: 'missing-receipt', reconciled: true };
    return b.suspended && !b.reconciled ? { ...b, reconciled: true } : b;
  });
  return {
    ...ledger,
    batches,
    acknowledgedTopUpUsd: ledger.acknowledgedTopUpUsd + arrived,
    reconciliations: [...ledger.reconciliations, {
      at, runId, afterBatches: batches.length, reason: reason.trim().slice(0, 400), credits, arrivedUsd: arrived,
      ...(manifest ? { manifest } : {}),
      ...(frozen ? { frozen } : {}),
    }],
  };
}

// ---- The chain of runs ----

const MODES = ['dry-run', 'development', 'holdout', 'reconcile'];

/**
 * Is this dispatch allowed to continue the receipt chain? `runs` are this workflow's earlier
 * runs on main, newest first: `{ id, mode, hasLedger, harnessStarted }`. A paid run that started
 * its harness and left no ledger is LOST: its spend and attempts are unknown, so every later paid
 * run is refused until a reconcile names it. Only the very first paid run may set a baseline;
 * every other run continues the newest ledger, so the chain cannot fork or restart.
 */
export function checkChain(runs, { mode, receiptsRunId = '', establish = false, lostRuns = [] }) {
  const refuse = (reason) => ({ ok: false, reason });
  if (!MODES.includes(mode)) return refuse('mode');
  if (mode === 'dry-run') return { ok: true };
  const paidStarted = runs.filter((r) => (r.mode === 'development' || r.mode === 'holdout') && r.harnessStarted);
  const newest = runs.findIndex((r) => r.hasLedger);
  if (establish) {
    if (mode === 'reconcile') return refuse('establish-in-reconcile');
    if (newest >= 0 || paidStarted.length > 0 || receiptsRunId) return refuse('baseline-exists');
    return { ok: true };
  }
  if (newest < 0) return refuse('missing-baseline');
  if (String(receiptsRunId) !== String(runs[newest].id)) return refuse(`not-newest-ledger:${runs[newest].id}`);
  const lost = runs.slice(0, newest).filter((r) => (r.mode === 'development' || r.mode === 'holdout') && r.harnessStarted && !r.hasLedger).map((r) => String(r.id));
  const named = [...new Set(lostRuns.map(String))].sort();
  if (mode === 'reconcile') {
    if (named.join(',') !== [...lost].sort().join(',')) return refuse(`missing-receipt:${lost.join(',') || 'none'}`);
    return { ok: true };
  }
  if (lost.length > 0) return refuse(`missing-receipt:${lost.join(',')}`);
  return { ok: true };
}

// ---- Pricing a request ----

/** The most one attempt can cost, from its serialized bytes (a token is at least one byte). */
export function attemptCeilingUsd(model, { bytes, outputTokens, images = 0 }) {
  const route = ROUTES[model];
  if (!route) return null;
  const input = bytes + FRAMING_TOKENS + images * (route.image ?? 0);
  return (input * route.input + outputTokens * route.output) / 1_000_000;
}

// ---- Scoring (frozen) ----

const FAMILY_OF_COMPONENT = { scoreboard: 'scoreboard', clock: 'clock', quiz: 'quiz', credits: 'credits' };

/** A design's ground truth over the reader's layer ids. `layerAt` maps an element path and tag
 *  to the reader's id, or null when the reader offers no layer there (counted as unmappable:
 *  every arm needs the same correction for it). */
export function expectedFor(label, layerAt) {
  const anchors = (f) => (f.source_anchors ?? [f]).map((a) => layerAt(a.source.element_path, a.source.tag));
  const fieldIds = label.expected.fields.flatMap(anchors);
  const decoyIds = (label.expected.noneditable ?? []).map((n) => layerAt(n.source.element_path, n.source.tag));
  return {
    fields: new Set(fieldIds.filter(Boolean)),
    decoys: new Set(decoyIds.filter(Boolean)),
    unmappable: fieldIds.filter((x) => !x).length,
    families: new Set(label.expected.components.map((c) => FAMILY_OF_COMPONENT[c]).filter(Boolean)),
    decisions: (label.expected.unresolved_intent ?? []).length,
  };
}

/**
 * One arm's proposal against the truth. Corrections are what the user must change: an expected
 * field left off, a decoy left on, a missed or invented behaviour family, an unmappable anchor.
 * Decisions are the undecided intents (no arm decides intent). Consequential errors would put
 * wrong live output on air: a decoy bound as a field, an invented behaviour, a reference to a
 * layer the inventory does not have.
 */
export function scoreDesign(expected, proposal, inventory) {
  const on = new Set(proposal.fieldsOn);
  const families = new Set(proposal.families);
  const missedFields = [...expected.fields].filter((l) => !on.has(l)).length;
  const decoysOn = [...expected.decoys].filter((l) => on.has(l)).length;
  const invalidRefs = [...on].filter((l) => !inventory.has(l)).length;
  const missedFamilies = [...expected.families].filter((f) => !families.has(f)).length;
  const inventedFamilies = [...families].filter((f) => !expected.families.has(f)).length;
  return {
    corrections: missedFields + decoysOn + missedFamilies + inventedFamilies + expected.unmappable,
    decisions: expected.decisions,
    consequential: decoysOn + inventedFamilies + invalidRefs,
    missedFields,
    decoysOn,
    invalidRefs,
    missedFamilies,
    inventedFamilies,
    unmappable: expected.unmappable,
  };
}

/**
 * The pre-registered decision rule (spec, "Corpus and evaluation gate"), primary against
 * deterministic only. No go on any accepted invalid reference, an unusable primary, or a
 * consequential-error increase in any stratum (summed over its designs). Otherwise a family
 * qualifies when at least two of its designs need fewer corrections plus decisions and none of
 * its designs increases consequential errors. A run stopped by metering (cap, suspension,
 * refusal) is no go. Never a full go.
 */
export function decide(rows, primary = PRIMARY.id, stopped = null) {
  // An evaluation that metering stopped is incomplete: its fallback rows cannot qualify anything.
  if (stopped) return { verdict: 'no-go', families: [], reasons: [`evaluation-stopped:${stopped}`] };
  const reasons = [];
  const by = (arm) => rows.filter((r) => r.arm === arm);
  const prim = by(primary);
  const det = new Map(by('deterministic').map((r) => [r.design, r]));
  if (prim.length === 0 || prim.every((r) => r.fellBack)) return { verdict: 'no-go', families: [], reasons: ['primary-unusable'] };
  // A primary answer that never came (not admitted, outage, refusal) leaves the evaluation
  // incomplete: its deterministic stand-in would be scored as the model's.
  const missing = prim.filter((r) => r.fellBack).map((r) => r.design);
  if (missing.length > 0) return { verdict: 'no-go', families: [], reasons: [`primary-incomplete:${missing.join(',')}`] };
  if (prim.some((r) => r.score.invalidRefs > 0)) reasons.push('invalid-reference');
  const strata = [...new Set(prim.map((r) => r.stratum))];
  const families = [];
  for (const s of strata) {
    const pairs = prim.filter((r) => r.stratum === s).map((r) => [r, det.get(r.design)]).filter(([, d]) => d);
    const sum = (i) => pairs.reduce((n, p) => n + p[i].score.consequential, 0);
    if (sum(0) > sum(1)) reasons.push(`consequential-increase:${s}`);
    const harmed = pairs.some(([p, d]) => p.score.consequential > d.score.consequential);
    const better = pairs.filter(([p, d]) => p.score.corrections + p.score.decisions < d.score.corrections + d.score.decisions).length;
    if (!harmed && better >= 2) families.push(s);
  }
  if (reasons.length > 0) return { verdict: 'no-go', families: [], reasons };
  if (families.length === 0) return { verdict: 'no-go', families: [], reasons: ['no-family-qualifies'] };
  return { verdict: 'limited-go', families, reasons: [] };
}

// ---- Arms ----

/** The routing policy of one arm: ZDR and no training pinned on, its own providers only, no
 *  fallback models. */
export function armGateway(model) {
  return { zeroDataRetention: true, disallowPromptTraining: true, only: [...ROUTES[model].providers], tags: ['surface:svg-interpretation-eval'] };
}

/** Decision answers from a chat model's structured object of probabilities. */
const chatSchema = (keys) => ({
  name: 'answer_svg_questions',
  description: 'The probability that each question is answered yes.',
  schema: {
    type: 'object',
    properties: Object.fromEntries(keys.map((k) => [k, { type: 'number', minimum: 0, maximum: 1 }])),
    required: keys,
    additionalProperties: false,
  },
});

/** The image task proposes rectangles: map each text region onto the text layer it overlaps
 *  most (intersection over union of normalized boxes, at least 0.1). Clock, quiz and credits are
 *  not expressible in its categories, so it never proposes them; that is reported, not hidden. */
export function mapRegionsToLayers(analysis, evidence) {
  const { width, height } = evidence.canvas;
  const texts = evidence.layers.filter((l) => l.kind === 'text').map((l) => ({
    id: l.id, x: l.box[0] / width, y: l.box[1] / height, w: l.box[2] / width, h: l.box[3] / height,
  }));
  const iou = (a, b) => {
    const ix = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
    const iy = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const inter = ix * iy;
    const union = a.w * a.h + b.w * b.h - inter;
    return union > 0 ? inter / union : 0;
  };
  const on = new Set();
  let unmatched = 0;
  for (const region of analysis.regions ?? []) {
    if (region.kind !== 'text') continue;
    const best = texts.map((t) => [t, iou(t, region.bbox)]).sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 0.1) on.add(best[0].id);
    else unmatched += 1;
  }
  return {
    families: analysis.graphicType === 'scoreboard' ? ['scoreboard'] : [],
    fieldsOn: [...on],
    mapping: { regions: (analysis.regions ?? []).length, unmatchedTextRegions: unmatched, notExpressible: ['clock', 'quiz', 'credits'] },
  };
}

/** The deterministic proposal, as the wizard's draft makes it: the field rows it turns on and
 *  the behaviour family its proposal names. */
export function deterministicProposal(record) {
  const kind = record.behaviour?.kind ?? null;
  const recipe = record.behaviour?.recipe ?? null;
  const fam = { score: 'scoreboard', quiz: 'quiz', poll: 'quiz', timer: 'clock' }[kind]
    ?? ({ credits: 'credits', clock: 'clock', countdown: 'clock' }[recipe] ?? null);
  const families = new Set(fam ? [fam] : []);
  if (record.fields.some((f) => f.on && (f.clock || f.kind === 'countdown'))) families.add('clock');
  return { families: [...families], fieldsOn: record.fields.filter((f) => f.on).map((f) => f.candidateId) };
}

/**
 * Plan one logical request for an arm: its body bytes and priced maximum. Returns a refusal for
 * a request that cannot be sent (too large, unqualified preview), recorded as a deterministic
 * fallback rather than spent.
 */
export function planRequest(arm, design, config, deps) {
  const route = ROUTES[arm.model];
  if (arm.kind === 'decision') {
    if (arm.preview) return { refused: DECISION_PREVIEW_QUALIFIED ? 'preview-not-built' : 'preview-unqualified' };
    const prepared = deps.prepareDecision({ route: { provider: 'vercel', model: arm.model }, state: design.evidence, questions: design.set.questions }, armGateway(arm.model));
    if (prepared.bytes > deps.decisionRequestBytes(route.context)) return { refused: 'request-too-large' };
    const ceiling = attemptCeilingUsd(arm.model, { bytes: prepared.bytes, outputTokens: 32 * Object.keys(design.set.questions).length });
    return { prepared, maxUsd: CAP.attemptsPerRequest * Math.max(ceiling, prepared.attemptCeilingUsd), attempts: CAP.attemptsPerRequest };
  }
  const images = arm.kind === 'vision' ? 1 : 0;
  if (images && !design.preview) return { refused: 'no-preview' };
  const request = arm.kind === 'chat'
    ? {
        system: config.chatSystem,
        messages: [{ role: 'user', content: JSON.stringify({ state: design.evidence, questions: design.set.questions }) }],
        maxTokens: OUTPUT_TOKENS,
        structuredOutput: chatSchema(Object.keys(design.set.questions)),
        temperature: 0,
      }
    : {
        system: deps.importAnalysisSystemPrompt(deps.IMPORT_ANALYSIS_VERSION),
        messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: design.preview } }] }],
        maxTokens: OUTPUT_TOKENS,
        structuredOutput: deps.IMPORT_ANALYSIS_OUTPUT,
        temperature: 0,
      };
  // Every text byte the request carries (system, messages, the output schema); the picture is
  // priced as image tokens instead of its base64.
  const text = JSON.stringify(request, (k, v) => (k === 'data' && images ? '' : v));
  const ceiling = attemptCeilingUsd(arm.model, { bytes: Buffer.byteLength(text, 'utf8'), outputTokens: OUTPUT_TOKENS, images });
  return { request, maxUsd: CAP.attemptsPerRequest * ceiling, attempts: CAP.attemptsPerRequest, single: images > 0 };
}

/** May this sent attempt have been billed? Yes for an answer (even an unusable one), a timeout,
 *  a server failure or no response; no for a refusal before inference (any other 4xx). */
const maybeBilled = (status) => status === null || status === 408 || status >= 500 || (status >= 200 && status < 300);

/**
 * Send one logical request; at most two attempts, serially. Reports the proposal (or a
 * deterministic fallback), attempts, reported cost and whether a sent attempt's bill is unknown.
 */
export async function callArm(arm, design, config, plan, deps) {
  const fallback = (reason, extra = {}) => ({ proposal: design.deterministic, fellBack: reason, attempts: 0, reportedUsd: 0, unknown: 0, ...extra });
  if (plan.refused) return fallback(plan.refused);
  const started = deps.now();
  if (arm.kind === 'decision') {
    const outcome = await deps.executeDecisionRequest(
      { route: { provider: 'vercel', model: arm.model }, state: design.evidence, questions: design.set.questions },
      { price: { inputPerMillion: ROUTES[arm.model].input, outputPerMillion: ROUTES[arm.model].output }, maxAttempts: Math.min(plan.attempts, CAP.attemptsPerRequest), timeoutMs: 30_000, gateway: armGateway(arm.model) },
      { key: deps.key, fetchImpl: deps.fetchImpl },
      plan.prepared,
    );
    const ms = deps.now() - started;
    // Unknown bill: a failure that was charged its worst case by the adapter.
    const unknown = !outcome.ok && ['timeout', 'unavailable', 'malformed_response'].includes(outcome.reason) ? 1 : 0;
    if (!outcome.ok) return fallback(outcome.reason, { attempts: outcome.attempts, reportedUsd: outcome.costUsd, unknown, ms });
    const proposal = deps.readSvgAnswers(design.set, outcome.answers, config.threshold, design.deterministic.fieldsOn);
    return { proposal, attempts: outcome.attempts, reportedUsd: outcome.costUsd, knownUsd: outcome.attempts === 1 ? outcome.costUsd : 0, unknown: 0, ms, tokens: { input: outcome.inputTokens, output: outcome.outputTokens } };
  }
  const keys = Object.keys(design.set.questions);
  const worstAttempt = plan.maxUsd / CAP.attemptsPerRequest;
  // Each sent attempt's HTTP status, or null when it never answered.
  const sent = [];
  const counting = async (...args) => {
    const at = sent.push(null) - 1;
    const response = await deps.fetchImpl(...args);
    sent[at] = response.status;
    return response;
  };
  try {
    const result = await deps.executeGatewayRequest(
      { route: { provider: 'vercel', model: arm.model }, request: plan.request },
      { keyFor: async () => deps.key, fetchImpl: counting, sleep: async () => {} },
      { maxAttempts: Math.min(plan.attempts, CAP.attemptsPerRequest), retryLimit: 1, timeoutMs: 60_000, gateway: armGateway(arm.model) },
    );
    const ms = deps.now() - started;
    const usage = result.usage;
    const attempts = sent.length;
    const priced = attemptCeilingUsd(arm.model, { bytes: usage.inputTokens - FRAMING_TOKENS, outputTokens: usage.outputTokens });
    // A failed earlier attempt that may have been billed is charged at its worst case.
    const earlier = sent.slice(0, -1).filter(maybeBilled).length * worstAttempt;
    const knownUsd = usage.estimatedCost?.amount ?? priced ?? 0;
    const reportedUsd = (usage.estimatedCost?.amount ?? priced ?? worstAttempt) + earlier;
    if (arm.kind === 'chat') {
      const answers = {};
      for (const k of keys) {
        const p = result.output?.[k];
        if (typeof p !== 'number' || !(p >= 0 && p <= 1)) return fallback('answers_invalid', { attempts, reportedUsd, ms });
        answers[k] = { type: 'boolean', probability: p };
      }
      return { proposal: deps.readSvgAnswers(design.set, answers, config.threshold, design.deterministic.fieldsOn), attempts, reportedUsd, knownUsd, unknown: 0, ms, tokens: { input: usage.inputTokens, output: usage.outputTokens } };
    }
    const mapped = mapRegionsToLayers(result.output, design.evidence);
    return { proposal: { families: mapped.families, fieldsOn: mapped.fieldsOn }, mapping: mapped.mapping, attempts, reportedUsd, knownUsd, unknown: 0, ms, tokens: { input: usage.inputTokens, output: usage.outputTokens } };
  } catch (error) {
    // Every sent attempt that may have been billed has an unknown bill: charged at its worst
    // case, and flagged. A refusal before inference is charged nothing.
    const code = typeof error?.code === 'string' ? error.code : 'unavailable';
    const billed = sent.filter(maybeBilled).length;
    return fallback(code, { attempts: sent.length, reportedUsd: billed * worstAttempt, unknown: billed > 0 ? 1 : 0, ms: deps.now() - started });
  }
}

/** Group requests into bounded batches: one arm, one stratum at a time; one request per batch
 *  for an image arm, where the image price is only a bound. Serial by construction. */
export function batchesOf(arm, designs) {
  if (arm.kind === 'vision') return designs.map((d) => [d]);
  const strata = [...new Set(designs.map((d) => d.stratum))];
  return strata.map((s) => designs.filter((d) => d.stratum === s));
}

/**
 * Run every arm over every design, serially, with metering. Every batch, in the dry run against
 * the mock balance too, is
 * admitted against the ledger and a fresh reading, its receipt is opened in the ledger before
 * the first call (so a crash leaves a receipt with no closing reading, which refuses the next
 * run until reconciled), and closed from a settled reading. Any refusal stops paid work; results
 * so far are kept. `deps.saveLedger` persists after every change.
 */
export async function runArms({ arms, designs, config, partition, ledger, deps }) {
  const rows = [];
  let stopped = null;
  let inFlight = 0;
  const serial = (fn) => async (...args) => {
    inFlight += 1;
    if (inFlight > 1) throw new Error('parallel provider call');
    try {
      return await fn(...args);
    } finally {
      inFlight -= 1;
    }
  };
  const callDeps = { ...deps, fetchImpl: serial(deps.fetchImpl) };
  for (const arm of arms) {
    if (arm.kind === 'deterministic') {
      for (const d of designs) rows.push({ arm: arm.id, design: d.id, stratum: d.stratum, proposal: d.deterministic, attempts: 0, reportedUsd: 0 });
      continue;
    }
    for (const group of batchesOf(arm, designs)) {
      const planned = group.map((d) => ({ d, plan: planRequest(arm, d, config, deps) }));
      const sendable = planned.filter((p) => !p.plan.refused);
      let receipt = null;
      if (sendable.length > 0 && !stopped) {
        const credits = await deps.readCredits().catch(() => null);
        const admission = admitBatch(ledger.current, credits, {
          partition,
          arm: arm.id,
          runId: deps.runId,
          requests: sendable.map((p) => ({ id: `${arm.id}/${p.d.id}`, maxUsd: p.plan.maxUsd, attempts: p.plan.attempts, single: p.plan.single })),
        }, { manifest: deps.manifest });
        if (!admission.ok) stopped = `${arm.id}: ${admission.reason}`;
        else {
          receipt = admission.receipt;
          ledger.current = { ...ledger.current, batches: [...ledger.current.batches, receipt] };
          deps.saveLedger(ledger.current);
        }
      }
      let attempts = 0;
      let reportedUsd = 0;
      let knownUsd = 0;
      let unknown = 0;
      for (const { d, plan } of planned) {
        const result = (stopped || !receipt) && !plan.refused
          ? { proposal: d.deterministic, fellBack: 'not-admitted', attempts: 0, reportedUsd: 0, unknown: 0 }
          : await callArm(arm, d, config, plan, callDeps);
        attempts += result.attempts;
        reportedUsd += result.reportedUsd;
        knownUsd += result.knownUsd ?? 0;
        unknown += result.unknown ?? 0;
        rows.push({ arm: arm.id, design: d.id, stratum: d.stratum, ...result });
      }
      if (receipt) {
        const settled = await deps.settledCredits({ before: receipt.before, knownUsd });
        const closed = closeBatch(receipt, { settled, attempts, reportedUsd, unknownCharges: unknown });
        ledger.current = { ...ledger.current, batches: [...ledger.current.batches.slice(0, -1), closed] };
        deps.saveLedger(ledger.current);
        if (closed.suspended) stopped = `${arm.id}: ${closed.suspended}`;
      }
    }
  }
  return { rows, stopped };
}

// ---- Corpus ----

/** Development designs and labels, verified against the frozen receipt before use. */
export function developmentCorpus() {
  const receipt = JSON.parse(readFileSync(root('docs/work-specs/jev-svg-import/preparation/corpus-receipt.json'), 'utf8'));
  const labelsBytes = readFileSync(root('e2e/fixtures/jev-svg/dev.expect.json'));
  if (sha256(labelsBytes) !== receipt.development_labels_sha256) throw new Error('development labels digest mismatch');
  const labels = JSON.parse(labelsBytes.toString('utf8'));
  return labels.designs.map((label) => {
    const bytes = readFileSync(root(`e2e/fixtures/jev-svg/${label.svg}`));
    if (sha256(bytes) !== label.svg_sha256) throw new Error(`${label.id}: svg digest mismatch`);
    return { id: label.id, stratum: label.stratum, markup: bytes.toString('utf8'), label };
  });
}

/** The 51-file non-blind regression slice, by its pinned manifest; scored only by the number of
 *  text fields its sidecar expects, and reported apart from the 36-design score. */
export function regressionCorpus() {
  const manifest = JSON.parse(readFileSync(root('e2e/fixtures/jev-svg/regression.manifest.json'), 'utf8'));
  return manifest.designs.map((d) => {
    const svg = readFileSync(path.join(root('e2e/fixtures/jev-svg'), d.svg));
    const sidecar = readFileSync(path.join(root('e2e/fixtures/jev-svg'), d.label));
    if (sha256(svg) !== d.svg_sha256 || sha256(sidecar) !== d.label_sha256) throw new Error(`${d.id}: regression digest mismatch`);
    return { id: d.id, stratum: 'regression', markup: svg.toString('utf8'), sidecar: JSON.parse(sidecar.toString('utf8')) };
  });
}

/**
 * Verify and open the sealed holdout. Archive digest against the public receipt; a single
 * SHA256SUMS whose own digest is the receipt's tree hash; every member it lists present with its
 * digest and nothing else present; regular files only; one labels file with the receipt's
 * digest; 18 designs, each SVG matching its labelled digest. Any mismatch refuses: no repair.
 */
export function openHoldout(zipBytes, receipt, { extract }) {
  if (sha256(zipBytes) !== receipt.holdout_zip_sha256) throw new Error('holdout archive digest mismatch');
  const dir = mkdtempSync(path.join(tmpdir(), 'jev-holdout-'));
  try {
    extract(zipBytes, dir);
    const files = [];
    const walk = (at) => {
      for (const name of readdirSync(at)) {
        const full = path.join(at, name);
        const stat = lstatSync(full);
        if (stat.isSymbolicLink()) throw new Error('holdout member is a link');
        if (stat.isDirectory()) walk(full);
        else if (stat.isFile()) files.push(path.relative(dir, full).split(path.sep).join('/'));
        else throw new Error('holdout member is not a regular file');
      }
    };
    walk(dir);
    const sums = files.filter((f) => path.posix.basename(f) === 'SHA256SUMS');
    if (sums.length !== 1) throw new Error('holdout SHA256SUMS missing or repeated');
    const sumsBytes = readFileSync(path.join(dir, sums[0]));
    if (sha256(sumsBytes) !== receipt.holdout_tree_sha256) throw new Error('holdout tree digest mismatch');
    const base = path.posix.dirname(sums[0]);
    const listed = new Map(sumsBytes.toString('utf8').split('\n').filter(Boolean).map((line) => {
      const m = /^([0-9a-f]{64}) [ *]?(.+)$/.exec(line);
      if (!m || m[2].split('/').includes('..') || m[2].startsWith('/')) throw new Error('holdout SHA256SUMS line malformed');
      return [path.posix.normalize(path.posix.join(base, m[2].replace(/^\.\//, ''))), m[1]];
    }));
    for (const f of files) {
      if (f === sums[0]) continue;
      if (!listed.has(f)) throw new Error('holdout has an unlisted member');
      if (sha256(readFileSync(path.join(dir, f))) !== listed.get(f)) throw new Error('holdout member digest mismatch');
    }
    if (listed.size !== files.length - 1) throw new Error('holdout member missing');
    const labelFiles = files.filter((f) => f.endsWith('.json') && sha256(readFileSync(path.join(dir, f))) === receipt.holdout_labels_sha256);
    if (labelFiles.length !== 1) throw new Error('holdout labels not found by digest');
    const labels = JSON.parse(readFileSync(path.join(dir, labelFiles[0]), 'utf8'));
    const designs = labels.designs.filter((d) => d.partition === 'holdout');
    if (designs.length !== receipt.recognition_counts.holdout || designs.length !== labels.designs.length) throw new Error('holdout design count mismatch');
    const labelDir = path.posix.dirname(labelFiles[0]);
    return designs.map((label) => {
      const rel = path.posix.normalize(path.posix.join(labelDir, label.svg));
      if (!files.includes(rel)) throw new Error(`${label.id}: holdout svg missing`);
      const bytes = readFileSync(path.join(dir, rel));
      if (sha256(bytes) !== label.svg_sha256) throw new Error(`${label.id}: holdout svg digest mismatch`);
      return { id: label.id, stratum: label.stratum, markup: bytes.toString('utf8'), label };
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ---- Reading the designs in a browser ----

/**
 * Per design: the deterministic draft (the wizard's own, through the 51-file harness's page),
 * the reader's layers with boxes, the anchors resolved to layer ids, and optionally a PNG of the
 * sanitized artwork for the image arms. Offline: the page answers only bundled fonts.
 */
export async function readDesigns(designs, { previews }) {
  const { recordInPage } = await import('./svg-import-passes.test.mjs?library');
  const { rolldown } = await import('rolldown');
  const bundle = await rolldown({ input: root('src/ai/svgInterpretation/evidence.ts'), platform: 'browser', logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'iife', name: 'NOACG_EVIDENCE', codeSplitting: false });
  await bundle.close();
  const extra = {};
  const raws = await recordInPage(designs.map((d) => ({ name: d.id, markup: d.markup })), {}, async (page, records) => {
    await page.addScriptTag({ content: output[0].code });
    for (const d of designs) {
      const raw = records[d.id];
      if (raw.refused) continue;
      extra[d.id] = await page.evaluate(({ markup, width, height }) => {
        document.querySelectorAll('.jev-eval-stage').forEach((n) => n.remove());
        const scale = Math.min(1, 1920 / Math.max(width, height));
        const stage = document.createElement('div');
        stage.className = 'jev-eval-stage';
        stage.style.cssText = `position:absolute;left:0;top:0;width:${Math.round(width * scale)}px;height:${Math.round(height * scale)}px;background:#000;`;
        stage.innerHTML = markup;
        document.body.appendChild(stage);
        const svg = stage.querySelector('svg');
        svg.setAttribute('width', String(Math.round(width * scale)));
        svg.setAttribute('height', String(Math.round(height * scale)));
        return window.NOACG_EVIDENCE.readSvgLayers(svg);
      }, { markup: raw.markup, width: raw.fieldList.size.width, height: raw.fieldList.size.height });
      if (previews) {
        const shot = await page.locator('.jev-eval-stage').screenshot({ type: 'png' });
        extra[d.id].preview = shot.toString('base64');
      }
    }
  });
  return designs.map((d) => {
    const raw = raws[d.id];
    if (raw.refused) return { ...d, refused: raw.refused };
    const layers = extra[d.id];
    return {
      ...d,
      markup: raw.markup,
      width: raw.fieldList.size.width,
      height: raw.fieldList.size.height,
      layers: [...layers],
      preview: layers.preview ?? null,
      record: { behaviour: raw.proposal?.behaviour ?? null, fields: raw.fieldList.fields },
    };
  });
}

// ---- Dry-run mocks ----

/** A mock gateway for the dry run: answers `/v1/evaluate` and chat completions with
 *  deterministic pseudo-probabilities and a reported cost, and debits a mock balance. Never the
 *  network. */
export function mockGateway({ balance = 6.936136654, totalUsed = 48.063863346 } = {}) {
  const state = { balance, totalUsed, calls: 0 };
  const p = (s) => (parseInt(sha256(s).slice(0, 8), 16) % 1000) / 1000;
  const charge = (usd) => {
    state.balance -= usd;
    state.totalUsed += usd;
  };
  const fetchImpl = async (url, init) => {
    state.calls += 1;
    const body = JSON.parse(init.body);
    const bytes = Buffer.byteLength(init.body, 'utf8');
    const cost = attemptCeilingUsd(body.model, { bytes, outputTokens: 64 }) / 4;
    charge(cost);
    if (String(url).endsWith('/evaluate')) {
      const answers = Object.fromEntries(Object.keys(body.questions).map((k) => [k, { type: 'boolean', probability: p(k + body.state.sourceRevision) }]));
      return new Response(JSON.stringify({ model: body.model, answers, usage: { inputTokens: bytes, outputTokens: 0 }, providerMetadata: { gateway: { cost: String(cost) } } }), { status: 200 });
    }
    const schema = body.response_format?.json_schema?.schema;
    const content = schema?.properties?.regions
      ? { version: 1, graphicType: 'other', graphicTypeConfidence: 0.5, canvas: { aspect: 1.78 }, regions: [], warnings: [] }
      : Object.fromEntries(Object.keys(schema?.properties ?? {}).map((k) => [k, p(k + bytes)]));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }], usage: { prompt_tokens: bytes, completion_tokens: 64, cost } }), { status: 200 });
  };
  return { state, fetchImpl, readCredits: async () => ({ balance: state.balance, totalUsed: state.totalUsed }) };
}

// ---- The server modules, compiled from main ----

export async function loadServer() {
  const { buildApiRuntime } = await import('./api-runtime-build.mjs');
  const sources = ['api/_lib/aiDecisionGateway.ts', 'api/_lib/aiGateway.ts', 'api/_lib/aiSvgInterpretationProfile.ts', 'api/_lib/aiModelCatalog.ts'];
  const runtime = await buildApiRuntime(sources);
  const load = (rel) => import(pathToFileURL(path.join(runtime.outputDir, rel.replace(/\.ts$/, '.js'))).href);
  const [decision, gateway, profile, catalog] = await Promise.all(sources.map(load));
  return { decision, gateway, profile, catalog, cleanup: runtime.cleanup };
}

/** The decision routes' audited server prices must equal the harness snapshot, or nothing runs. */
export function checkServerPrices(catalog) {
  const server = catalog.decisionModelPrices();
  for (const [model, route] of Object.entries(ROUTES)) {
    if (route.kind !== 'decision') continue;
    const price = server[`vercel:${model}`];
    if (!price || Math.abs(price.inputPerMillion - route.input) > 1e-12 || Math.abs(price.outputPerMillion - route.output) > 1e-12) {
      return `price-mismatch:${model}`;
    }
  }
  return null;
}

// ---- The run ----

async function run(args) {
  const mode = args.mode;
  if (!['dry-run', 'development', 'holdout'].includes(mode)) throw new Error('--mode must be dry-run, development or holdout');
  const verdict = validateConfiguration(readFileSync(args.config));
  if (!verdict.ok) throw new Error(`configuration refused: ${verdict.reason}`);
  const { config } = verdict;
  const configSha = args['config-sha'];
  if (!SHA.test(configSha ?? '')) throw new Error('--config-sha must be the resolved 40-character commit');
  const manifest = freezeManifest(undefined, await readerGraph());
  const paid = mode !== 'dry-run';

  // The holdout is evaluated once, with the frozen configuration and harness only.
  if (mode === 'holdout') {
    const challengers = config.candidates.filter((c) => c.id !== PRIMARY.id && !isBaseline(c));
    if (challengers.length > HOLDOUT_CHALLENGERS) throw new Error('more reporting challengers than the holdout admits');
  }

  const ledger = { current: null };
  const saveLedger = (l) => writeFileSync(args['ledger-out'], `${JSON.stringify(l, null, 2)}\n`);
  let key = null;
  let readCreditsNow;
  let fetchImpl;
  let mock = null;
  if (paid) {
    key = process.env.AI_GATEWAY_API_KEY ?? '';
    if (!key) throw new Error('no evaluation key in this step');
    readCreditsNow = () => readCredits(key);
    fetchImpl = fetch;
  } else {
    mock = mockGateway();
    readCreditsNow = mock.readCredits;
    fetchImpl = mock.fetchImpl;
  }
  if (args.ledger) {
    if (args['establish-baseline']) throw new Error('a ledger exists: the baseline is never reset');
    ledger.current = JSON.parse(readFileSync(args.ledger, 'utf8'));
    if (ledger.current.schema !== LEDGER_SCHEMA) throw new Error('not an evaluation ledger');
    if (ledger.current.mock || ledger.current.baseline.runId === 'local') throw new Error('a dry-run or local ledger never continues into a paid run');
    if (mode === 'holdout') {
      if (ledger.current.batches.some((b) => b.partition === 'holdout')) throw new Error('the holdout was already evaluated');
      const frozen = frozenRecord(ledger.current);
      if (!frozen) throw new Error('no freeze is recorded in the ledger: row 33 records it with reconcile --freeze');
      if (frozen.configSha256 !== verdict.sha256) throw new Error('configuration differs from the frozen one');
      if (frozen.manifestSha256 !== manifest.sha256) throw new Error('harness differs from the frozen manifest');
    }
  } else if (args['establish-baseline'] || !paid) {
    const credits = await readCreditsNow();
    ledger.current = newLedger({ credits, runId: process.env.GITHUB_RUN_ID ?? 'local', mainSha: process.env.GITHUB_SHA ?? null, workflowRef: process.env.GITHUB_WORKFLOW_REF ?? null, manifest, mock: !paid });
  } else {
    throw new Error('missing-baseline: pass the previous run\'s ledger, or --establish-baseline for the very first paid run');
  }
  saveLedger(ledger.current);

  const server = await loadServer();
  try {
    const priceFault = checkServerPrices(server.catalog);
    if (priceFault) throw new Error(priceFault);
    const { buildSvgEvidence } = await import('../src/ai/svgInterpretation/evidence.ts');
    const { buildSvgQuestions, readSvgAnswers } = await import('../src/ai/svgInterpretation/questions.ts');
    const analysis = await import('../src/ai/importAnalysis/contract.ts');
    const { svgSourceRevision } = await import('../src/ai/svgInterpretation/contract.ts');

    let corpus;
    if (mode === 'holdout') {
      const receipt = JSON.parse(readFileSync(root('docs/work-specs/jev-svg-import/preparation/corpus-receipt.json'), 'utf8'));
      corpus = openHoldout(readFileSync(args['holdout-zip']), receipt, {
        extract: (bytes, dir) => {
          const zip = path.join(dir, '..', `${path.basename(dir)}.zip`);
          writeFileSync(zip, bytes);
          try {
            execFileSync('unzip', ['-q', '-n', zip, '-d', dir], { windowsHide: true });
          } finally {
            rmSync(zip, { force: true });
          }
        },
      });
    } else {
      corpus = developmentCorpus();
    }
    const regression = args.regression ? regressionCorpus() : [];
    const needsPreview = config.candidates.some((c) => c.kind === 'vision');
    const read = await readDesigns([...corpus, ...regression], { previews: needsPreview });

    const designs = read.filter((d) => !d.refused).map((d) => {
      const reading = { sourceRevision: svgSourceRevision(d.markup), width: d.width, height: d.height, layers: d.layers };
      const evidence = buildSvgEvidence(reading, { includeText: false });
      const refusal = server.profile.svgEvidenceRefusal(evidence, { includeText: false });
      if (refusal) throw new Error(`${d.id}: evidence refused by the server policy: ${refusal}`);
      const set = buildSvgQuestions(evidence, config.questions);
      if (server.decision.decisionQuestionsRefusal(set.questions)) throw new Error(`${d.id}: questions refused by the adapter`);
      const byPath = new Map(d.layers.map((l) => [l.path, l]));
      const layerAt = (p, tag) => {
        const l = byPath.get(p);
        return l && l.kind !== 'group' && (tag !== 'text' || l.kind === 'text') ? l.id : null;
      };
      return { ...d, evidence, set, deterministic: deterministicProposal(d.record), layerAt, inventory: new Set(d.layers.map((l) => l.id)) };
    });

    const deps = {
      key: paid ? key : 'dry-run',
      fetchImpl,
      runId: process.env.GITHUB_RUN_ID ?? 'local',
      manifest,
      now: () => Date.now(),
      readCredits: readCreditsNow,
      settledCredits: (opts) => settledCredits(readCreditsNow, { ...opts, ...(paid ? {} : { intervalMs: 0 }) }),
      saveLedger,
      prepareDecision: (request, gateway) => server.decision.prepareDecision(request, gateway, { inputPerMillion: ROUTES[request.route.model].input, outputPerMillion: ROUTES[request.route.model].output }),
      decisionRequestBytes: server.decision.decisionRequestBytes,
      executeDecisionRequest: server.decision.executeDecisionRequest,
      executeGatewayRequest: server.gateway.executeGatewayRequest,
      readSvgAnswers,
      importAnalysisSystemPrompt: analysis.importAnalysisSystemPrompt,
      IMPORT_ANALYSIS_VERSION: analysis.IMPORT_ANALYSIS_VERSION,
      IMPORT_ANALYSIS_OUTPUT: analysis.IMPORT_ANALYSIS_OUTPUT,
    };
    const partition = mode === 'holdout' ? 'holdout' : 'development';
    const scored = designs.filter((d) => d.label);
    const main = await runArms({ arms: config.candidates, designs: scored, config, partition, ledger, deps });
    const slice = regression.length && !main.stopped
      ? await runArms({ arms: config.candidates.filter((c) => c.kind === 'deterministic' || c.id === PRIMARY.id), designs: designs.filter((d) => d.sidecar), config, partition, ledger, deps })
      : { rows: [], stopped: null };

    const byId = new Map(designs.map((d) => [d.id, d]));
    const rows = main.rows.map((r) => {
      const d = byId.get(r.design);
      return { ...r, languages: d.label.languages ?? [], score: scoreDesign(expectedFor(d.label, d.layerAt), r.proposal, d.inventory) };
    });
    const report = {
      mode,
      mainSha: process.env.GITHUB_SHA ?? null,
      workflowRef: process.env.GITHUB_WORKFLOW_REF ?? null,
      runId: process.env.GITHUB_RUN_ID ?? 'local',
      configCommit: configSha,
      configSha256: verdict.sha256,
      manifest,
      stopped: main.stopped ?? slice.stopped ?? null,
      refusedDesigns: read.filter((d) => d.refused).map((d) => d.id),
      decision: decide(rows, PRIMARY.id, main.stopped ?? slice.stopped ?? null),
      verdictApplies: mode === 'holdout',
      rows: rows.map(({ proposal, ...r }) => ({ ...r, fieldsOn: proposal.fieldsOn.length, families: proposal.families })),
      regression: slice.rows.map((r) => ({ arm: r.arm, design: r.design, fieldsOn: r.proposal.fieldsOn.length, expectedTextFields: byId.get(r.design).sidecar.expect?.textFields ?? null, fellBack: r.fellBack ?? null })),
      spend: {
        spentUsd: ledgerSpent(ledger.current, await readCreditsNow().catch(() => ledger.current.batches.at(-1)?.after ?? ledger.current.baseline)),
        batches: ledger.current.batches.length,
        attempts: ledger.current.batches.reduce((s, b) => s + (b.attempts ?? 0), 0),
        ...(mock ? { mockCalls: mock.state.calls } : {}),
      },
    };
    writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`[jev-svg-eval] ${mode}: ${rows.length} scored rows, ${report.regression.length} regression rows; stopped=${report.stopped ?? 'no'}; ${report.decision.verdict}${report.verdictApplies ? '' : ' (indicative only: not the holdout)'}`);
    if (report.stopped) process.exitCode = 2;
  } finally {
    await server.cleanup();
  }
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) out._.push(a);
    else if (['--establish-baseline', '--regression', '--accept-manifest', '--freeze'].includes(a)) out[a.slice(2)] = true;
    else out[a.slice(2)] = argv[++i];
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const [command] = args._;
  if (command === 'config') {
    const v = validateConfiguration(readFileSync(args.file));
    console.log(JSON.stringify(v.ok ? { ok: true, sha256: v.sha256 } : v));
    if (!v.ok) process.exitCode = 1;
  } else if (command === 'fetch-config') {
    const v = fetchConfiguration(args.ref);
    if (!v.ok) {
      console.log(JSON.stringify(v));
      process.exitCode = 1;
    } else {
      writeFileSync(args.out, v.bytes);
      console.log(JSON.stringify({ ok: true, commit: v.commit, sha256: v.sha256 }));
    }
  } else if (command === 'freeze') {
    const m = freezeManifest(undefined, await readerGraph());
    console.log(JSON.stringify({ ...m, files: Object.keys(m.files).length }, null, 2));
  } else if (command === 'run') {
    await run(args);
  } else if (command === 'chain') {
    const runs = JSON.parse(readFileSync(args.runs, 'utf8'));
    const v = checkChain(runs, {
      mode: args.mode,
      receiptsRunId: args['receipts-run-id'] ?? '',
      establish: args.establish === 'true',
      lostRuns: (args['lost-runs'] ?? '').split(',').map((x) => x.trim()).filter(Boolean),
    });
    console.log(JSON.stringify(v));
    if (!v.ok) process.exitCode = 1;
  } else if (command === 'reconcile') {
    const key = process.env.AI_GATEWAY_API_KEY ?? '';
    if (!key || !args.ledger || !existsSync(args.ledger)) throw new Error('reconcile needs the key and the ledger');
    const ledger = JSON.parse(readFileSync(args.ledger, 'utf8'));
    if (ledger.mock) throw new Error('a dry-run ledger is never reconciled into the chain');
    const settled = await settledCredits(() => readCredits(key));
    if (!settled.stable) throw new Error('the balance has not settled; reconcile later');
    const current = args['accept-manifest'] || args.freeze ? freezeManifest(undefined, await readerGraph()) : null;
    let frozen = null;
    if (args.freeze) {
      const v = validateConfiguration(readFileSync(args.config));
      if (!v.ok) throw new Error(`configuration refused: ${v.reason}`);
      frozen = { configSha256: v.sha256, configCommit: args['config-sha'], manifestSha256: current.sha256 };
    }
    const lostRuns = (args['lost-runs'] ?? '').split(',').map((x) => x.trim()).filter(Boolean);
    const next = reconcileLedger(ledger, settled.credits, {
      reason: args.reason,
      runId: process.env.GITHUB_RUN_ID ?? 'local',
      ...(args['accept-manifest'] ? { manifest: current } : {}),
      ...(frozen ? { frozen } : {}),
      ...(lostRuns.length ? { lost: { runs: lostRuns, partition: args['lost-partition'], attempts: Number(args['lost-attempts']) } } : {}),
    });
    writeFileSync(args['ledger-out'], `${JSON.stringify(next, null, 2)}\n`);
    console.log(`[jev-svg-eval] reconciled; acknowledged new money ${next.acknowledgedTopUpUsd.toFixed(6)} USD`);
  } else {
    console.error('usage: node scripts/jev-svg-eval.mjs config|fetch-config|freeze|chain|run|reconcile ...');
    process.exitCode = 1;
  }
}
