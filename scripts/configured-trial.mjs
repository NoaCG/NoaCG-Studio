#!/usr/bin/env node
// A REPEAT TRIAL OF ONE CONFIGURED SPEC, on a CI runner, as `.github/workflows/endurance.yml`
// starts it with its local Supabase stack on:
//
//   npm run trial:<name> -- --minutes <n>
//
// where package.json names the spec and the count, written down before the run:
//
//   "trial:<name>": "node scripts/configured-trial.mjs --spec e2e/configured/<name>.spec.ts --repeat <n>"
//
// AN OFFLINE SPEC (one file directly under e2e/) runs the same way with no backend: endurance.yml
// without local-supabase, playwright.config.ts with CI's one worker, and `--grep <title words>`
// to name the test(s) the flake is in (cicd-followup cf08, #1954). Its count may go higher, because
// an offline test takes seconds, not a minute; `--minutes` still caps the run, and a run it cuts
// off fails.
//
// WHY. A flake fix is shown stable by running the spec a number of times fixed in advance, with
// zero failures (docs/work-specs/cicd-followup/spec.md, cf05 to cf08 (b)). The configured suite
// runs each spec once per landing, and its dispatch takes no inputs on purpose
// (scripts/candidate-dispatch.mjs: every run of it at one commit is the same check). endurance.yml
// is the generic dispatch-only workflow for exactly this: it is never a required check, and a
// trial only adds the npm script it runs.
//
// THE CONDITIONS ARE CI's: an ubuntu-latest runner, the same Supabase CLI and stack command
// (`supabase start -x studio,edge-runtime`), playwright.live.config.ts with its one worker. What
// differs: retries are off, so a fail-then-pass counts as the failure it is (the configured
// verdict counts a flaky test red as well); a failing run keeps its trace; the spec runs alone,
// not after its shard's neighbours; and the stack is not put through the configured-stack
// action's schema, grant and publication assertions, only the account is made and signed in.
//
// The verdict: every one of the `--repeat` runs passed, and exactly that many ran. Anything else,
// including a run cut off by `--minutes`, fails. endurance-output/ keeps the JSON report, the
// summary and each failure's trace.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { specFilterArg } from './e2e-spec-names.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'endurance-output');

/** The most runs one trial may ask for: one a minute fits the job's 75 minutes, so a longer
 *  trial is refused here rather than cut off by the clock. */
export const MAX_REPEAT = 75;
/** The same bound for an offline spec: a test of about five seconds, 400 times, still ends
 *  inside the job's 75 minutes. */
export const MAX_OFFLINE_REPEAT = 400;

/**
 * Read and check the trial's arguments.
 * @param {string[]} argv
 * @returns {{ spec: string, repeat: number, minutes: number, offline: boolean, grep: string | null }}
 */
export function trialArgs(argv) {
  // The last occurrence wins, so a value given after `npm run trial:<name> --` overrides the script's.
  const value = (name) => (argv.includes(name) ? argv[argv.lastIndexOf(name) + 1] : undefined);
  const spec = String(value('--spec') ?? '');
  const offline = /^e2e\/[\w.-]+\.spec\.ts$/.test(spec);
  if (!offline && !/^e2e\/configured\/[\w.-]+\.spec\.ts$/.test(spec)) {
    throw new Error(`--spec must be one file under e2e/configured/, or one offline file directly under e2e/, got "${spec}"`);
  }
  const max = offline ? MAX_OFFLINE_REPEAT : MAX_REPEAT;
  const repeat = Number(value('--repeat'));
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > max) throw new Error(`--repeat must be a whole number from 1 to ${max}`);
  const minutes = Number(value('--minutes'));
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 75) throw new Error('--minutes must be a whole number from 1 to 75');
  const grep = value('--grep') ?? null;
  if (grep !== null && !String(grep).trim()) throw new Error('--grep must name some words of the test titles');
  return { spec, repeat, minutes, offline, grep };
}

/**
 * Judge a Playwright JSON report of the trial: each run is one result of one test, and only a pass counts.
 * @param {any} report
 * @param {number} repeat the runs asked for, per test in the spec
 */
export function trialVerdict(report, repeat) {
  const runs = [];
  const walk = (suite) => {
    for (const child of suite.suites ?? []) walk(child);
    for (const spec of suite.specs ?? []) {
      // One test is its file, line and title: two tests may share a title, and the report lists
      // each repetition as its own entry with its own id, so the id would count every run as a test.
      const id = `${spec.file}:${spec.line}:${spec.title}`;
      for (const test of spec.tests ?? []) {
        for (const result of test.results ?? []) runs.push({ id, status: result.status, retry: result.retry ?? 0 });
      }
    }
  };
  for (const suite of report?.suites ?? []) walk(suite);
  const titles = new Set(runs.map((r) => r.id));
  const passed = runs.filter((r) => r.status === 'passed').length;
  const failed = runs.length - passed;
  const expected = titles.size * repeat;
  const problems = [];
  if (titles.size === 0) problems.push('no test ran');
  if (runs.some((r) => r.retry > 0)) problems.push('a run was retried: a trial runs with retries off');
  if (runs.length !== expected) problems.push(`${runs.length} runs, but ${titles.size} test(s) x ${repeat} = ${expected} were asked for`);
  if (failed > 0) problems.push(`${failed} of ${runs.length} runs did not pass`);
  return { tests: titles.size, runs: runs.length, passed, failed, expected, ok: problems.length === 0, problems };
}

async function main() {
  const { spec, repeat, minutes, offline, grep } = trialArgs(process.argv.slice(2));
  if (!existsSync(path.join(ROOT, spec))) throw new Error(`${spec} does not exist`);
  const env = { ...(offline ? process.env : await configuredEnv()), PLAYWRIGHT_JSON_OUTPUT_NAME: path.join(OUT, 'trial-report.json') };
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  console.log(`Trial: ${spec}${grep ? ` (tests matching "${grep}")` : ''}, ${repeat} runs, retries off, within ${minutes} min.`);
  const started = Date.now();
  const suite = run(
    'npx',
    [
      'playwright', 'test', `--config=${offline ? 'playwright.config.ts' : 'playwright.live.config.ts'}`,
      `--repeat-each=${repeat}`, '--retries=0', '--trace=retain-on-failure',
      // The run-integrity reporter goes back in: a --reporter flag replaces the config's list.
      `--output=${path.join(OUT, 'test-results')}`, '--reporter=list,json,./scripts/e2e-run-integrity.mjs',
      `--global-timeout=${minutes * 60_000}`, ...(grep ? ['--grep', grep] : []), specFilterArg(spec),
    ],
    { cwd: ROOT, env, stdio: ['ignore', 'inherit', 'inherit'] },
  );
  let report = null;
  try {
    report = JSON.parse(readFileSync(env.PLAYWRIGHT_JSON_OUTPUT_NAME, 'utf8'));
  } catch {
    // No report is judged below as nothing having run.
  }
  const v = trialVerdict(report, repeat);
  const summary = { spec, grep, repeat, minutes, exit: suite.status, seconds: Math.round((Date.now() - started) / 1000), ...v };
  writeFileSync(path.join(OUT, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`Trial verdict: ${v.passed} of ${v.runs} runs passed (${v.expected} asked for) - ${v.ok ? 'PASS' : 'FAIL'}`);
  for (const p of v.problems) console.log(`::error title=Trial::${p}`);
  process.exit(v.ok && suite.status === 0 ? 0 : 1);
}

const run = (cmd, args, options = {}) => spawnSync(cmd, args, { encoding: 'utf8', ...options, windowsHide: true });

/** A configured spec's environment: the local stack's keys and a signed-in account. */
async function configuredEnv() {
  // The local stack only: its keys are the CLI's published defaults and live only on this machine.
  const status = run('supabase', ['status', '-o', 'json'], { cwd: ROOT });
  if (status.status !== 0) throw new Error(`no local Supabase stack (supabase status: ${status.stderr.trim()}); start it first, as endurance.yml does with local-supabase`);
  let stack;
  try {
    stack = JSON.parse(status.stdout.slice(status.stdout.indexOf('{'), status.stdout.lastIndexOf('}') + 1));
  } catch {
    throw new Error(`supabase status -o json printed no readable JSON: ${status.stdout.slice(0, 200)}`);
  }
  for (const name of ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY']) if (!stack[name]) throw new Error(`supabase status gave no ${name}`);
  if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(stack.API_URL)) throw new Error(`refusing a stack that is not on this machine: ${stack.API_URL}`);
  const env = {
    ...process.env,
    VITE_SUPABASE_URL: stack.API_URL,
    VITE_SUPABASE_ANON_KEY: stack.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: stack.SERVICE_ROLE_KEY,
    SUPABASE_DB_URL: stack.DB_URL ?? '',
    E2E_EMAIL: 'e2e-trial@noacg.local',
    E2E_PASSWORD: 'noacg-e2e-local-pw',
  };

  // The account, made and proved by signing in, as the configured stack action does.
  const made = await fetch(`${stack.API_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: stack.SERVICE_ROLE_KEY, authorization: `Bearer ${stack.SERVICE_ROLE_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ email: env.E2E_EMAIL, password: env.E2E_PASSWORD, email_confirm: true }),
  });
  if (!made.ok && made.status !== 422) throw new Error(`could not make the account: ${made.status}`);
  const signedIn = await fetch(`${stack.API_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: stack.ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: env.E2E_EMAIL, password: env.E2E_PASSWORD }),
  });
  const token = signedIn.ok ? (await signedIn.json().catch(() => ({}))).access_token : null;
  if (!token) throw new Error(`the account cannot sign in (${signedIn.status})`);
  return env;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`::error title=Trial::${error.message}`);
    process.exit(1);
  });
}
