#!/usr/bin/env node
// E4's real isolated backend proof. Existing endurance.yml supplies the managed stack and
// always retains this directory, even when setup, the test, cleanup or this verdict fails.
import { isLocalStackUrl, localStackEnv } from './configured-target.mjs';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'endurance-output/editor-projects');
const started = Date.now(), cap = 5 * 60_000;
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const summary = { source: null, startedAt: new Date(started).toISOString(), status: 'failed', expectedTests: 1, retries: 0, skips: 0 };
const keep = () => writeFileSync(path.join(out, 'qualification.json'), JSON.stringify(summary, null, 2) + '\n');
keep();
function command(file, args, options = {}) {
  const remaining = cap - (Date.now() - started);
  if (remaining <= 0) throw new Error('The complete qualification exceeded its five-minute cap.');
  return spawnSync(file, args, { cwd: root, encoding: 'utf8', timeout: Math.min(30_000, remaining), ...options, windowsHide: true });
}
try {
  if (process.argv.slice(2).join(' ') !== '--minutes 5') throw new Error('Use --minutes 5; the complete qualification has a fixed five-minute cap.');
  const rev = command('git', ['rev-parse', 'HEAD']);
  if (rev.status !== 0 || !/^[a-f0-9]{40}$/.test(rev.stdout.trim())) throw new Error('Could not establish the exact checked-out source.');
  summary.source = rev.stdout.trim();
  if (!process.env.GITHUB_SHA || process.env.GITHUB_SHA !== summary.source) throw new Error('The Actions candidate SHA must equal the checked-out source.');
  const workdir = process.env.SUPABASE_WORKDIR, project = process.env.NOACG_STACK_PROJECT;
  if (!workdir || !project || !/^noacg-studio-s\d$/.test(project)) throw new Error('The managed isolated stack identity is required.');
  const config = readFileSync(path.join(workdir, 'supabase/config.toml'), 'utf8');
  if (!config.includes(`project_id = "${project}"`)) throw new Error('The managed workdir does not name this isolated stack.');
  const status = command('supabase', ['status', '-o', 'json'], { env: { ...process.env, SUPABASE_WORKDIR: workdir } });
  if (status.status !== 0) throw new Error('Managed isolated Supabase status failed; no hosted fallback is allowed.');
  const stack = JSON.parse(status.stdout.slice(status.stdout.indexOf('{')));
  if (!isLocalStackUrl(stack.API_URL) || !stack.ANON_KEY || !stack.SERVICE_ROLE_KEY) throw new Error('The isolated stack returned no valid loopback identity.');
  const receiptPath = path.join(out, 'persistence.json');
  // Every backend variable through the one helper: this pinned five of the six and left
  // SUPABASE_SECRET_KEY, which api/_lib prefers over the service-role key set here (issue #2495).
  const env = { ...process.env, ...localStackEnv(stack),
    E4_PROJECTS_SOURCE: summary.source, E4_PROJECTS_RECEIPT: receiptPath };
  summary.stack = { project, origin: stack.API_URL };
  keep();
  const child = command(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config=e2e/endurance/editor-projects.config.ts'], {
    env, stdio: 'inherit', timeout: cap - (Date.now() - started), killSignal: 'SIGTERM',
  });
  if (child.status !== 0 || child.error) throw new Error(`Qualification child failed (exit ${child.status}, signal ${child.signal ?? 'none'}).`);
  const report = JSON.parse(readFileSync(path.join(out, 'report.json'), 'utf8'));
  const tests = [];
  function collect(suite) { for (const spec of suite.specs ?? []) tests.push(...spec.tests); for (const nested of suite.suites ?? []) collect(nested); }
  for (const suite of report.suites ?? []) collect(suite);
  if (report.errors?.length || tests.length !== 1 || report.stats?.expected !== 1 || report.stats?.skipped !== 0 || report.stats?.unexpected !== 0 || report.stats?.flaky !== 0 || tests[0].status !== 'expected' || tests[0].expectedStatus !== 'passed' || tests[0].results?.length !== 1 || tests[0].results[0].status !== 'passed' || tests[0].results[0].retry !== 0) throw new Error('Expected exactly one complete passing test, zero skips/retries/errors.');
  const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  if (receipt.source !== summary.source || receipt.isolated !== true || receipt.firstPageClosedBeforeFreshContext !== true || receipt.historyRestored !== true || receipt.independentCopies !== true || receipt.rollbackSurvivesSyncAndFreshContext !== true || receipt.accountDeleted !== true) throw new Error('The exact-source persistence and cleanup receipt is missing or incomplete.');
  summary.status = 'passed';
  console.log(`PASS E4 isolated persistence at ${summary.source}: 1 test, zero skips/retries; account deleted.`);
} catch (error) {
  summary.error = error.message;
  console.error(`FAIL E4 isolated qualification: ${error.message}`);
  process.exitCode = 1;
} finally {
  summary.finishedAt = new Date().toISOString();
  keep();
}
