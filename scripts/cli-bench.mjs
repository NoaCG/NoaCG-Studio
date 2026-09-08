// The `noacg` CLI smoke against THIS checkout's dev server (docs/AGENT_CLI.md).
//
// `cli/test/smoke.test.mjs` drives the built CLI - which launches a headless Chromium and opens
// the deployment's /bridge - so it is a BROWSER-DRIVING job by every measure the one-job-per-
// machine guard cares about (`root/enqueue-browser-driving-work-rather-than`). It is named
// `*bench*` on purpose: that puts it inside `SWEEP_SCRIPTS` (scripts/command-match.mjs), so the guard hook
// and the process detector both know about it, and `npm run bench:cli` queues behind a live
// suite instead of running beside one.
//
// Usage: start the dev server for this checkout (`npm run dev`), then `npm run bench:cli`.
// The CLI is built first; the test file skips itself (honestly, with a message) when no bridge
// answers at the checkout's port.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devPort } from './dev-port.mjs';
import { activeRuns, describeRuns, selfAndAncestors } from './e2e-runs.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'cli');
const url = process.env.NOACG_URL || `http://localhost:${devPort()}`;

// Wait for our turn on the machine - the same registry every suite and sweep reads. By PROCESS
// IDENTITY, not by checkout: this script is itself a `*bench*` sweep, so the detector lists it,
// and `e2e-runs.mjs --wait` (which excludes only the CALLER'S CHECKOUT, and cannot attribute an
// `npm run` sweep to one) would queue it behind itself forever. Measured, 2026-08-22.
const mine = selfAndAncestors();
for (let waited = 0, runs = activeRuns({ excludePids: mine }); runs.length > 0; waited += 5, runs = activeRuns({ excludePids: mine })) {
  if (waited === 0) console.log(`[cli-bench] waiting for ${runs.length} browser-driving job(s) to finish:\n${describeRuns(runs)}`);
  else if (waited % 60 === 0) console.log(`[cli-bench] still waiting (${waited / 60} min)...`);
  await new Promise((done) => setTimeout(done, 5_000));
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const build = spawnSync(npm, ['run', 'build'], { cwd: cli, stdio: 'inherit', shell: process.platform === 'win32' });
if (build.status !== 0) process.exit(build.status ?? 1);

console.log(`[cli-bench] NOACG_URL=${url}`);
const test = spawnSync(process.execPath, ['--test', 'test/smoke.test.mjs'], { cwd: cli, stdio: 'inherit', env: { ...process.env, NOACG_URL: url } });
process.exit(test.status ?? 1);
