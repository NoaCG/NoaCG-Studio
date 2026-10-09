// Run scripts/ai-lite-eval.mjs with this checkout's bench identity, without the token passing
// through a shell command line or the ambient environment.
//
//   npm run eval:round -- <out-dir> <label> <count>
//   node scripts/lite-eval-round.mjs <out-dir> <label> <count>
//
// SPENDS REAL TOKENS. The eval's own ceilings still apply (40 calls, USD 1.50); 30 fixtures on
// the current route measured about USD 0.010 in the 2026-08-09 v13 round.
//
// The out-dir is gitignored and dies with the worktree - archive the round when it is worth
// keeping: `npm run eval:archive -- <out-dir> <label>` (docs/AI_LITE_BENCHMARK.md §6g).

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { benchEnv, benchEnvPath, repoRoot } from './lite-eval-paths.mjs';

const fileEnv = benchEnv();
if (!fileEnv.NOACG_LITE_EVAL_BEARER_TOKEN) {
  console.error(`${benchEnvPath()} carries no NOACG_LITE_EVAL_BEARER_TOKEN.`);
  console.error('Run scripts/bench-env.mjs then scripts/lite-eval-stamp.mjs first.');
  process.exit(1);
}

// The file first, the real environment last - the same precedence scripts/read-dotenv.mjs
// documents, so `NOACG_LITE_EVAL_MAX_COST_USD=… npm run eval:round` still overrides. The one
// value worth naming when they disagree is the identity: a token left exported in the shell
// outlives the stamped one and would otherwise run the round as a stale session, silently.
const shellToken = (process.env.NOACG_LITE_EVAL_BEARER_TOKEN ?? '').trim();
if (shellToken && shellToken !== fileEnv.NOACG_LITE_EVAL_BEARER_TOKEN) {
  console.warn('The shell exports a DIFFERENT NOACG_LITE_EVAL_BEARER_TOKEN than the stamped one;');
  console.warn('the exported value wins. Unset it to use the token in .env.bench.local.');
}
const env = { ...fileEnv, ...process.env };

const child = spawn(process.execPath, [join(repoRoot, 'scripts', 'ai-lite-eval.mjs'), ...process.argv.slice(2)], {
  cwd: repoRoot,
  env,
  stdio: 'inherit',
  windowsHide: true,
});
child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 1));
