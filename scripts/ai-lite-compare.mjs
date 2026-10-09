// Stage 4 of the NoaCG Lite model DISCOVERY FUNNEL (docs/AI_PLATFORM_PLAN.md §8): run the
// SAME frozen suite against each qualified candidate and produce per-candidate scorecards.
//
//   npm run bench:compare -- <out-dir> <model,model,...> [--confirm-spend] [--count=N]
//
// SPENDS REAL TOKENS with --confirm-spend; without it this is a dry run that prints the
// plan and the worst-case cost and exits. Hard caps below.
//
// WHY THIS ORCHESTRATES A SERVER RESTART. scripts/ai-lite-eval.mjs deliberately never
// receives a model id: it calls the trusted managed endpoint and the candidate route is
// SERVER configuration, so the runner never sees a key, a route, or a provider body. That
// posture is worth keeping, so this script varies the route the only legitimate way - by
// starting a dev server per candidate with the route INJECTED into its environment.
// vite.config.ts fills process.env from .env only for keys that are not already set
// (`if (!(key in process.env))`), so an injected route always wins while .env still
// supplies the secrets. Nothing here edits .env.
//
// TRUST BOUNDARY, stated plainly: /api/ai/lite/status does not expose the model id (by
// design), so this script cannot ask the server to confirm which candidate it is serving.
// The env it sets IS the evidence, and it is recorded in compare.json beside each run. A
// crashed or stale server is caught by the readiness probe, not by identity confirmation.

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { projectRoot } from './api-runtime-build.mjs';
import { devPort } from './dev-port.mjs';
import { readCheckoutEnv } from './read-dotenv.mjs';

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const positional = args.filter((a) => !a.startsWith('--'));
const OUT = path.resolve(positional[0] || './lite-bench-out');
const REQUESTED = (positional[1] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const CONFIRMED = flags.has('--confirm-spend');
const COUNT = Number([...flags].find((f) => f.startsWith('--count='))?.slice(8)) || 0;

// Hard caps. A comparison is a bounded experiment, not an open tap.
const MAX_CANDIDATES = 8;
const MAX_TOTAL_COST_USD = 3.0;
const BASE = `http://localhost:${devPort()}`;

// Access tokens live about an hour and a full comparison outruns that, so a token minted
// once at the start dies partway through and takes the remaining candidates with it -
// paying for generations whose results are then unusable. Mint a fresh one PER CANDIDATE
// from the same dedicated test account the configured e2e suite already uses
// (e2e/configured/_helpers.ts). Falls back to NOACG_LITE_EVAL_BEARER_TOKEN when the
// credentials are absent, so an operator can still supply one by hand.
// Parsing lives in scripts/read-dotenv.mjs - one definition, shared with the other runners and
// the freshness checks. Resolved against the project root rather than the cwd, so a run started
// from a subdirectory finds the same file instead of silently finding none - and against the
// MAIN checkout when this one is a worktree, which never has a `.env` of its own.
const fileEnv = readCheckoutEnv(projectRoot);
const credentials = {
  url: process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL || '',
  anon: process.env.VITE_SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY || '',
  email: process.env.E2E_EMAIL || fileEnv.E2E_EMAIL || '',
  password: process.env.E2E_PASSWORD || fileEnv.E2E_PASSWORD || '',
};
const canMint = Object.values(credentials).every(Boolean);

async function freshToken() {
  if (!canMint) return (process.env.NOACG_LITE_EVAL_BEARER_TOKEN ?? '').trim();
  const response = await fetch(`${credentials.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: credentials.anon, 'content-type': 'application/json' },
    body: JSON.stringify({ email: credentials.email, password: credentials.password }),
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json();
  if (!body.access_token) throw new Error('could not mint an eval token for this candidate');
  return body.access_token;
}

const TOKEN = canMint ? 'mint-per-candidate' : (process.env.NOACG_LITE_EVAL_BEARER_TOKEN ?? '').trim();

const qualify = JSON.parse(await readFile(path.join(OUT, 'qualify.json'), 'utf8'));
const byModel = new Map(qualify.items.map((item) => [item.route.model, item]));

if (!REQUESTED.length) {
  console.log('Name the candidates explicitly, comma-separated. Qualified options:\n');
  for (const item of qualify.items.filter((i) => i.qualified)) {
    console.log(`  ${item.route.model}  ($${item.pinned.estimatedCallUsd.toFixed(5)}/call, ${item.pinned.provider})`);
  }
  console.log('\nPick deliberately - a qualified list still contains models with no chance');
  console.log('on a constrained design task (the gates are POLICY gates).');
  process.exit(1);
}

const missing = REQUESTED.filter((m) => !byModel.has(m));
if (missing.length) {
  console.error(`Not in qualify.json: ${missing.join(', ')}`);
  console.error('Run bench:discover then bench:qualify first, or widen the qualify cap.');
  process.exit(1);
}
if (REQUESTED.length > MAX_CANDIDATES) {
  console.error(`${REQUESTED.length} candidates exceeds the ${MAX_CANDIDATES}-candidate cap.`);
  process.exit(1);
}

// The incumbent is always the baseline: a comparison with nothing to beat is not a
// comparison. It is added unless the caller already named it.
const INCUMBENT = 'google/gemini-2.5-flash-lite';
const plan = [...REQUESTED];
if (!plan.includes(INCUMBENT)) plan.push(INCUMBENT);

const fixtures = COUNT || 24;
const estimate = plan.reduce((sum, model) => {
  const item = byModel.get(model);
  // The incumbent may not be in the shortlist (it is proprietary and ranks last on the
  // open-weight preference), so fall back to its audited catalog price.
  const perCall = item?.pinned?.estimatedCallUsd ?? (0.10 * 2000 + 0.40 * 1200) / 1_000_000;
  return sum + perCall * fixtures;
}, 0);
// The vision judge, when enabled, costs more than the generations it judges.
const judgePerCall = (0.30 * 1200 + 2.50 * 500) / 1_000_000;
const judgeEstimate = judgePerCall * plan.length * fixtures;

console.log(`Plan: ${plan.length} candidate(s) x ${fixtures} fixtures\n`);
for (const model of plan) {
  const item = byModel.get(model);
  console.log(`  ${model}${model === INCUMBENT ? '  [incumbent baseline]' : ''}`
    + (item?.pinned ? `  pinned: ${item.pinned.provider} (${item.pinned.quantization ?? 'n/a'})` : ''));
}
console.log(`\nEstimated generation cost: $${estimate.toFixed(3)}`);
console.log(`Estimated judge cost if enabled: $${judgeEstimate.toFixed(3)}`);
console.log(`Estimated TOTAL: $${(estimate + judgeEstimate).toFixed(2)} (hard cap $${MAX_TOTAL_COST_USD})`);
if (estimate + judgeEstimate > MAX_TOTAL_COST_USD) {
  console.error('\nEstimate exceeds the hard cap. Reduce candidates or --count.');
  process.exit(1);
}
// Reported BEFORE the dry-run exit: whether an identity exists, and whether it can be
// refreshed, is exactly what you want to know before committing to spend.
if (!TOKEN) {
  console.error('\nNo eval identity available. Either put VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY,');
  console.error('E2E_EMAIL and E2E_PASSWORD in .env so a token can be minted per candidate, or set');
  console.error('NOACG_LITE_EVAL_BEARER_TOKEN by hand (it will expire after about an hour).');
  process.exit(1);
}
console.log(canMint
  ? '\nToken: minted fresh per candidate from the .env test account.'
  : '\nToken: supplied by hand - a long run may outlive it.');
if (!CONFIRMED) {
  console.log('\nDRY RUN - nothing spent, nothing started. Re-run with --confirm-spend to execute.');
  process.exit(0);
}

// Vercel AI Gateway reports `provider_name` AS the slug, so the name-to-slug listing call
// this used to make is gone along with the failure it existed to prevent (OpenRouter reported
// "Google" for a provider whose slug was `google-vertex`, and slugifying the label produced an
// allowlist matching nothing). A route with no allowlist is not configured at all
// (taskConfigured), so this still has to be right before anything is spent.

// The incumbent is not in the shortlist (it is proprietary, so the open-weight preference
// ranks it last), and its Google route serves from two gateway providers.
const INCUMBENT_PROVIDERS = 'google,vertex';

function allowlistFor(item) {
  if (!item?.pinned?.provider) return INCUMBENT_PROVIDERS;
  const slug = item.pinned.provider;
  if (!slug) {
    console.error('A pinned endpoint with no provider slug - refusing to guess.');
    process.exit(1);
  }
  return slug;
}

async function waitForReady(token, budgetMs = 90_000) {
  const deadline = Date.now() + budgetMs;
  let lastReason = 'no response';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${BASE}/api/ai/lite/status`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) {
        const status = await response.json();
        if (status.available) return status;
        lastReason = status.reason ?? 'unavailable';
      }
    } catch { /* server still booting */ }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`dev server never became available (${lastReason})`);
}

function startServer(model, providerAllowlist) {
  // Fallback is disabled for the whole comparison: docs/AI_LITE_PROMOTION.md requires it,
  // and for good reason - a candidate silently rescued by another model would be credited
  // with results it did not produce.
  const env = {
    ...process.env,
    AI_LITE_ENABLED: '1',
    AI_LITE_PRIMARY_PROVIDER: 'vercel',
    AI_LITE_PRIMARY_MODEL: model,
    AI_LITE_FALLBACK_PROVIDER: '',
    AI_LITE_FALLBACK_MODEL: '',
    AI_LITE_GATEWAY_PROVIDERS: providerAllowlist,
  };
  const child = spawn('npm', ['run', 'dev'], { env, shell: true, stdio: 'ignore', windowsHide: true });
  return child;
}

/** `npm run dev` is a WRAPPER around Vite, so killing the returned child kills the wrapper
 *  and orphans the server that actually holds the port - across six candidates that leaks
 *  six servers, and the next one fails on strictPort. Kill the whole tree. */
function killTree(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  }
}

const runs = [];
await mkdir(OUT, { recursive: true });

for (const model of plan) {
  const item = byModel.get(model);
  const label = model.replace(/[^a-z0-9]+/gi, '-').slice(0, 40);
  const runDir = path.join(OUT, label);
  const pinnedProvider = allowlistFor(item);
  console.log(`\n=== ${model} -> ${runDir}`);
  console.log(`  provider allowlist: ${pinnedProvider}`);
  const server = startServer(model, pinnedProvider);
  try {
    // Minted after the server is up, so the token is at its freshest when the long
    // fixture loop starts rather than having aged through the previous candidate.
    const token = await freshToken();
    const status = await waitForReady(token);
    console.log(`  server ready (skin ${status.skinEnabled ? 'on' : 'off'}, judge ${status.skinJudgeEnabled ? 'on' : 'off'})`);
    await new Promise((resolve, reject) => {
      const evaluation = spawn(
        process.execPath,
        ['scripts/ai-lite-eval.mjs', runDir, label, String(fixtures)],
        { env: { ...process.env, NOACG_LITE_EVAL_BEARER_TOKEN: token }, stdio: 'inherit', windowsHide: true },
      );
      evaluation.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`eval exited ${code}`))));
      evaluation.on('error', reject);
    });
    runs.push({ model, label, runDir, pinnedProvider, skinEnabled: status.skinEnabled, judgeEnabled: status.skinJudgeEnabled, ok: true });
  } catch (error) {
    console.error(`  FAILED: ${error.message}`);
    runs.push({ model, label, runDir, pinnedProvider, ok: false, error: String(error.message ?? error) });
  } finally {
    killTree(server);
    // Vite spawns through a shell; give the port time to release before the next candidate
    // binds it (strictPort means a late release is a hard failure, not a silent reassign).
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

// Pipeline identity must match across every run or the comparison is void - the promotion
// doc is explicit that a mixed-mode comparison cannot be read as a model difference.
const manifests = [];
for (const run of runs.filter((r) => r.ok)) {
  try {
    const files = (await readdir(run.runDir)).filter((f) => f.endsWith('-metrics.json'));
    for (const file of files) {
      const parsed = JSON.parse(await readFile(path.join(run.runDir, file), 'utf8'));
      if (parsed.manifest) manifests.push({ label: run.label, manifest: parsed.manifest });
    }
  } catch { /* a failed run has no metrics */ }
}
const identityHashes = new Set(manifests.map((m) => JSON.stringify({
  suite: m.manifest.suiteId, commit: m.manifest.commit,
  contract: m.manifest.contractHash, pipeline: m.manifest.pipelineHash,
  catalog: m.manifest.catalogHash, validators: m.manifest.validatorsHash,
})));
const identityMatches = identityHashes.size <= 1;

const summary = {
  type: 'compare-summary', stage: 'compare', at: new Date().toISOString(),
  fixtures, incumbent: INCUMBENT, runs,
  pipelineIdentityMatches: identityMatches,
  routes: Object.fromEntries(plan.map((model) => [model, {
    pinned: byModel.get(model)?.pinned ?? null,
    openWeights: byModel.get(model)?.openWeights ?? false,
  }])),
};
await writeFile(path.join(OUT, 'compare.json'), JSON.stringify(summary, null, 2), 'utf8');

console.log(`\n${runs.filter((r) => r.ok).length}/${runs.length} runs completed.`);
if (!identityMatches) {
  console.log('\nPIPELINE IDENTITY DIFFERS ACROSS RUNS - this comparison is VOID as a model');
  console.log('comparison (docs/AI_LITE_BENCHMARK.md §3). Something changed mid-run.');
}
console.log(`Wrote ${path.join(OUT, 'compare.json')}`);
console.log(`\nNext: npm run bench:gallery -- ${OUT}   (blind review - the judge is not a substitute)`);
console.log(`Then: npm run bench:report -- ${OUT}`);
console.log('\nNo promotion recommendation follows from this run on its own: the gates in');
console.log('docs/AI_LITE_PROMOTION.md are owner-set TODOs, and a gate with an unset');
console.log('threshold counts as NOT met.');
