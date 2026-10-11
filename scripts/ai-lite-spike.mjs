// The Phase 0 SPIKE orchestrator: one candidate route, 6 briefs spanning the supported
// space, 3 runs each = 18 paid generations, through the existing bounded eval runner.
// Answers "do models separate at all?" before any harness investment is trusted.
//
//   npm run bench:spike -- --label=candidate-a               # DRY RUN (default, free)
//   npm run bench:spike -- --label=candidate-a --confirm-spend
//
// SPENDS REAL TOKENS only with --confirm-spend, and only for the CURRENT server-side
// route: the model under test is whatever AI_LITE_PRIMARY_* the API server was started
// with. The flow per candidate: set the route env, restart the dev server, run this with
// a fresh neutral label. Repeat for each candidate, then judge blind:
//   npm run bench:gallery -- lite-bench-out/spike
//   npm run bench:report  -- lite-bench-out/spike
//
// Cost: the runner inherits ai-lite-eval.mjs's own hard stops (40 calls / $1.50) per run,
// and this script stops between runs once the spike ceiling is crossed
// (NOACG_LITE_SPIKE_MAX_COST_USD, default $0.50 - generous: a typical candidate lands
// near $0.01-$0.03 total at ~2.8k tokens a call).

import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { devPort } from './dev-port.mjs';
import { buildRunManifest } from './ai-lite-bench/manifest.mjs';
import { LITE_LOWER_THIRD_FIXTURES } from './ai-lite-lower-third-fixtures.mjs';
import { SKIN_SPIKE_FIXTURE_IDS, SPIKE_FIXTURE_IDS } from './ai-lite-bench/suites.mjs';

const RUNS = 3;

const arg = (name) => process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const LABEL = String(arg('label') ?? 'candidate').replace(/[^a-z0-9_-]+/gi, '-').slice(0, 32);
const CONFIRMED = process.argv.includes('--confirm-spend');
// --suite=core (default) = the Phase 0 chassis-routing spike; --suite=skin = the six
// distinctive-style briefs measuring whether the route can AUTHOR a canvas skin at all.
const SUITE = arg('suite') === 'skin' ? 'skin' : 'core';
const FIXTURE_IDS = SUITE === 'skin' ? SKIN_SPIKE_FIXTURE_IDS : SPIKE_FIXTURE_IDS;
const OUT = path.resolve(arg('out') ?? './lite-bench-out/spike');
const SPIKE_MAX_COST = Math.min(5, Math.max(0.01, Number(process.env.NOACG_LITE_SPIKE_MAX_COST_USD) || 0.5));
const BASE = `http://localhost:${devPort()}`;
const TOKEN = (process.env.NOACG_LITE_EVAL_BEARER_TOKEN ?? '').trim();
const PER_REQUEST_CAP = Math.min(0.1, Math.max(0.0001, Number(process.env.AI_LITE_MAX_COST_USD) || 0.007));

const missing = FIXTURE_IDS.filter((id) => !LITE_LOWER_THIRD_FIXTURES.some(([fid]) => fid === id));
if (missing.length) {
  console.error(`Spike fixtures missing from the fixture bank: ${missing.join(', ')}`);
  process.exit(1);
}

const sessions = FIXTURE_IDS.length * RUNS;
console.log(`${SUITE === 'skin' ? 'Skin' : 'Phase 0'} spike - candidate label "${LABEL}" (suite: ${SUITE})`);
console.log(`  ${FIXTURE_IDS.length} briefs x ${RUNS} runs = ${sessions} paid generations`);
console.log(`  briefs: ${FIXTURE_IDS.join(', ')}`);
console.log(`  worst-case ceiling: ${sessions} x $${PER_REQUEST_CAP} per-request cap = $${(sessions * PER_REQUEST_CAP).toFixed(3)}`);
console.log(`  typical expectation at Lite routes: $0.01-$0.03 for the whole candidate`);
console.log(`  spike stop: $${SPIKE_MAX_COST.toFixed(2)} (NOACG_LITE_SPIKE_MAX_COST_USD)`);
console.log(`  model under test: the server's CURRENT AI_LITE_PRIMARY_* route (this script cannot see or set it)`);

const status = TOKEN
  ? await fetch(`${BASE}/api/ai/lite/status`, { headers: { authorization: `Bearer ${TOKEN}` } })
      .then((response) => response.json()).catch(() => null)
  : null;
console.log(`  dev server: ${status ? `up at ${BASE}` : `NOT reachable at ${BASE} (start with the preview tools / npm run dev)`}`);
console.log(`  bearer token: ${TOKEN ? 'present' : 'MISSING (set NOACG_LITE_EVAL_BEARER_TOKEN)'}`);
console.log(`  Lite availability: ${status ? (status.available ? 'available' : `unavailable (${status.reason ?? 'unknown'})`) : 'unknown'}`);
if (SUITE === 'skin') {
  console.log(`  skin flag: ${status ? (status.skinEnabled ? 'ENABLED' : 'DISABLED (start the server with AI_LITE_SKIN_ENABLED=1)') : 'unknown'}`);
  // Informational, not a precondition: a judged run measures the full production funnel
  // (skin -> bench -> vision judge -> revert), an unjudged one only skin capability.
  console.log(`  vision judge: ${status ? (status.skinJudgeEnabled ? 'ENABLED (2-4x cost path active)' : 'disabled (AI_LITE_JUDGE_ENABLED=1 to score skins)') : 'unknown'}`);
}

if (!CONFIRMED) {
  console.log('\nDRY RUN - no call was made and nothing was spent.');
  console.log('Run again with --confirm-spend to execute. That flag is the explicit spend approval.');
  process.exit(0);
}
if (!TOKEN || !status?.available) {
  console.error('\nPreconditions failed - refusing to start a paid run.');
  process.exit(1);
}
if (SUITE === 'skin' && !status.skinEnabled) {
  // A skin-disabled route compiles every skin brief to a house chassis: 18 paid calls
  // that measure nothing the suite exists to measure. Refuse rather than half-run.
  console.error('\nThe skin suite needs the server started with AI_LITE_SKIN_ENABLED=1 - refusing to spend.');
  process.exit(1);
}

await mkdir(OUT, { recursive: true });
let totalCost = 0;
const runsDone = [];
for (let run = 1; run <= RUNS; run++) {
  if (totalCost >= SPIKE_MAX_COST) {
    console.error(`Spike cost stop reached ($${totalCost.toFixed(4)}) - halting before run ${run}.`);
    break;
  }
  const runDir = path.join(OUT, LABEL, `run${run}`);
  console.log(`\n=== ${LABEL} run ${run}/${RUNS} -> ${runDir}`);
  const code = await new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      ['scripts/ai-lite-eval.mjs', runDir, LABEL],
      {
        stdio: 'inherit',
        env: { ...process.env, NOACG_LITE_EVAL_FIXTURES: FIXTURE_IDS.join(',') },
        windowsHide: true,
      },
    );
    child.once('exit', resolve);
    child.once('error', () => resolve(1));
  });
  if (code !== 0) {
    console.error(`Run ${run} exited with ${code} - stopping the spike.`);
    process.exitCode = 1;
    break;
  }
  const metrics = JSON.parse(await readFile(path.join(runDir, `${LABEL}-metrics.json`), 'utf8'));
  totalCost += metrics.totalCostUsd ?? 0;
  runsDone.push({ run, dir: runDir, costUsd: metrics.totalCostUsd ?? 0, machineUsable: metrics.machineUsable, sessions: metrics.sessions });
  const judgeNote = SUITE === 'skin' && metrics.judgeCalls
    ? `, judge ${metrics.judgePassed}/${metrics.judgeCalls} passed (${metrics.judgeReverted} reverted${metrics.judgeErrors ? `, ${metrics.judgeErrors} errored open` : ''})`
    : '';
  console.log(`Run ${run}: ${metrics.machineUsable}/${metrics.sessions} machine-usable${SUITE === 'skin' ? `, ${metrics.skinApplied ?? 0} skinned` : ''}${judgeNote}, $${(metrics.totalCostUsd ?? 0).toFixed(4)}; spike total $${totalCost.toFixed(4)}.`);
}

const manifest = buildRunManifest({
  mode: 'model-comparison',
  candidate: { label: LABEL, note: 'route defined server-side; see the API server env for this window' },
  extra: { spike: { suite: SUITE, fixtureIds: FIXTURE_IDS, runs: runsDone, totalCostUsd: totalCost } },
});
await writeFile(path.join(OUT, `${LABEL}-spike-manifest.json`), JSON.stringify(manifest, null, 2), 'utf8');
console.log(`\nSpike for "${LABEL}" done: $${totalCost.toFixed(4)} total. Manifest: ${path.join(OUT, `${LABEL}-spike-manifest.json`)}`);
console.log('Next candidate: change AI_LITE_PRIMARY_* server env, restart the server, re-run with a new --label.');
console.log(`Then: npm run bench:gallery -- ${path.relative(process.cwd(), OUT)} && npm run bench:report -- ${path.relative(process.cwd(), OUT)}`);
