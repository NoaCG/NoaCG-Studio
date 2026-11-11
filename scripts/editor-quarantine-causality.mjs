// Opt-in historical measurement for #2295. No phase launch or causal verdict.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLAN = JSON.parse(readFileSync(path.join(ROOT, 'scripts/editor-quarantine-causality-plan.json'), 'utf8'));
const OUT = path.join(ROOT, 'endurance-output');
const SPEC_HASH = { clock: '4bfa5c28801f21ba2a8e711ae60591e76e45815c', operator: 'e5441f2354eeb8a7537b16e1110c59a439d1e5ad' };
const LOCK = '1c3ad6751b041f98c23da018098027d6d7011c41';
const SUPABASE = '3c50971d600367dff5fe4beea34314da52e8d9d4';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const quote = text => `'${String(text).replaceAll("'", "'\\''")}'`;
const json = file => JSON.parse(readFileSync(file, 'utf8'));
const save = (file, value) => writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
function run(command, args, cwd = ROOT, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 0, `${command} failed: ${String(result.stderr).slice(0, 500)}`);
  return result.stdout.trim();
}

export function batch(ref) {
  const hit = /^codex\/editor-causality-20261111-(clock|operator)-(\d{2})$/.exec(ref);
  assert(hit, 'unexpected diagnostic batch ref');
  const kind = hit[1], index = Number(hit[2]), size = kind === 'clock' ? 5 : 15;
  assert(index >= 1 && index <= 60 / size, 'batch outside prewritten count');
  return { kind, index, size, start: (index - 1) * size };
}
export function caseRows(suites) {
  return suites.flatMap(suite => [
    ...(suite.specs ?? []).flatMap(spec => spec.tests.map(test => ({ title: spec.title, project: test.projectName, results: test.results }))),
    ...caseRows(suite.suites ?? []),
  ]);
}
export function validateReport(report, count, job) {
  const rows = caseRows(report.suites ?? []), stats = report.stats;
  assert.equal(report.config.workers, 1, 'wrong worker count');
  assert.equal(rows.length, count, 'missing/extra cases');
  assert.equal(stats.skipped, 0, 'skipped cases');
  assert.equal(stats.flaky, 0, 'retry/flaky cases');
  assert.equal(stats.expected + stats.unexpected, count, 'incomplete case outcomes');
  assert.equal((report.errors ?? []).length, 0, 'global error');
  assert(rows.every(row => row.results.length === 1 && row.results[0].retry === 0 && ['passed', 'failed', 'timedOut'].includes(row.results[0].status)), 'invalid first attempts');
  assert(['done', 'failed'].includes(job.state), 'nonterminal queue');
  assert.equal(job.exitCode === 0, stats.unexpected === 0, 'queue/report disagreement');
  return { failed: stats.unexpected > 0, stats, cases: rows };
}

function prepareArm(kind, arm, sha) {
  const directory = path.join(path.dirname(ROOT), `causality-${kind}-${arm}`);
  run('git', ['fetch', '--no-tags', 'origin', sha]);
  run('git', ['worktree', 'add', '-b', `diagnostic-${kind}-${arm}`, directory, sha]);
  assert.equal(run('git', ['rev-parse', 'HEAD'], directory), sha);
  for (const [file, hash] of [['package-lock.json', LOCK], [PLAN[kind].spec, SPEC_HASH[kind]]]) {
    assert.equal(run('git', ['hash-object', file], directory), hash);
  }
  assert.equal(run('git', ['rev-parse', 'HEAD:supabase'], directory), SUPABASE);
  for (const relative of ['node_modules', 'player-host/node_modules']) {
    const source = path.join(ROOT, relative), target = path.join(directory, relative);
    assert.equal(run('git', ['hash-object', relative.startsWith('player') ? 'player-host/package-lock.json' : 'package-lock.json'], directory), run('git', ['hash-object', relative.startsWith('player') ? 'player-host/package-lock.json' : 'package-lock.json']));
    run('cp', ['-al', source, target]);
    for (const cache of ['.vite', '.vite-temp', '.cache']) rmSync(path.join(target, cache), { recursive: true, force: true });
  }
  writeFileSync(path.join(OUT, `${arm}-postinstall.log`), run('npm', ['run', 'postinstall'], directory));
  assert.equal(run('git', ['status', '--porcelain'], directory), '');
  return directory;
}

// Extract exactly the immutable composite action's literal shell, without rewriting its guards.
export function actionShell(text, name) {
  const header = `    - name: ${name}\n`, at = text.indexOf(header);
  assert(at >= 0 && text.indexOf(header, at + 1) === -1, 'ambiguous composite step');
  const tail = text.slice(at + header.length), start = tail.indexOf('      run: |\n');
  assert(start >= 0, 'missing literal shell');
  const lines = tail.slice(start + '      run: |\n'.length).split('\n'), kept = [];
  for (const line of lines) {
    if (line.trim() && !line.startsWith('        ')) break;
    kept.push(line.slice(8));
  }
  assert(kept.some(line => line.trim()), 'empty composite step');
  return kept.join('\n');
}
function operatorEnvironment() {
  assert.equal(run('git', ['rev-parse', 'HEAD:supabase']), SUPABASE);
  const env = { ...process.env, E2E_EMAIL: 'causality@noacg.local', E2E_PASSWORD: 'noacg-causality-local-pw', E2E_TEAMMATE_EMAIL: 'causality-mate@noacg.local', E2E_TEAMMATE_PASSWORD: 'noacg-causality-local-pw', SUPABASE_AUTH_GOOGLE_CLIENT_ID: 'local-e2e-unused', SUPABASE_AUTH_GOOGLE_SECRET: 'local-e2e-unused' };
  const action = run('git', ['show', `${PLAN.operator.landing}:.github/actions/configured-stack/action.yml`]);
  assert.equal(action, readFileSync(path.join(ROOT, '.github/actions/configured-stack/action.yml'), 'utf8').trim());
  for (const name of ["Export the local stack's URL and keys", 'Assert the schema, its grants, and the realtime publication', 'Create the test account and prove it can sign in']) {
    // Service keys are masked by the original export block before any subsequent output.
    const shell = actionShell(action + '\n', name);
    const result = spawnSync('bash', ['-euo', 'pipefail', '-c', shell], { cwd: ROOT, env, encoding: 'utf8', timeout: 120_000 });
    writeFileSync(path.join(OUT, `stack-${name.split(' ')[0]}.log`), result.stdout + result.stderr);
    process.stdout.write(result.stdout ?? '');
    assert.equal(result.status, 0, 'original configured-stack guard failed');
    for (const line of readFileSync(env.GITHUB_ENV, 'utf8').split('\n')) {
      const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line);
      if (match) env[match[1]] = match[2];
    }
  }
  assert(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(env.VITE_SUPABASE_URL), 'nonlocal backend');
  return env;
}
async function emptyPort(port) {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  await new Promise(resolve => server.close(resolve));
}
function matchingJob(directory, command, jobsDirectory) {
  const found = readdirSync(jobsDirectory).filter(name => /^j-\d+\.json$/.test(name)).map(name => json(path.join(jobsDirectory, name))).filter(job => job.checkout === directory && job.command === command);
  assert(found.length <= 1, 'duplicate queue admission');
  return found[0];
}
async function trial(kind, pair, arm, directory, env, deadline) {
  assert(Date.now() + 5 * 60_000 < deadline, 'insufficient time for a capped invocation');
  assert.equal(run('git', ['rev-parse', 'HEAD'], directory), PLAN[kind][arm]);
  assert.equal(run('git', ['status', '--porcelain'], directory), '');
  const out = path.join(OUT, `pair-${String(pair).padStart(3, '0')}-${arm}`);
  mkdirSync(out); // Refuse an accidental repeated invocation under the same identity.
  const ports = json(path.join(directory, '.claude/dev-port.json'));
  await emptyPort(kind === 'clock' ? ports.port : ports.livePort);
  const argv = ['npm', 'run', kind === 'clock' ? 'test:e2e' : 'test:e2e:live', '--', PLAN[kind].spec, '--workers=1', '--retries=0', '--reporter=line,github,blob,./scripts/e2e-run-integrity.mjs,json', `--output=${out}/test-results`];
  const command = `env ${quote(`PLAYWRIGHT_JSON_OUTPUT_FILE=${out}/report.json`)} ${quote(`PLAYWRIGHT_BLOB_OUTPUT_DIR=${out}/blob`)} ${argv.join(' ')}`;
  const common = path.resolve(directory, run('git', ['rev-parse', '--git-common-dir'], directory));
  const jobsDirectory = path.join(common, 'noacg-jobs');
  const intent = { kind, pair, arm, source: PLAN[kind][arm], specHash: SPEC_HASH[kind], directory, command, started: new Date().toISOString() };
  save(path.join(out, 'intent.json'), intent);
  const admitted = spawnSync('node', ['scripts/jobs.mjs', 'add', command, '--kind', 'sweep', '--cap', '5'], { cwd: directory, env, encoding: 'utf8', timeout: 30_000 });
  writeFileSync(path.join(out, 'admission.log'), String(admitted.stdout) + String(admitted.stderr));
  let job = existsSync(jobsDirectory) && matchingJob(directory, command, jobsDirectory);
  assert(job, 'queue admission unresolved; do not resubmit');
  save(path.join(out, 'queue-identity.json'), { id: job.id });
  while (['waiting', 'running'].includes(job.state)) {
    assert(Date.now() < deadline, '75-minute diagnostic ceiling reached');
    await sleep(2_000);
    job = json(path.join(jobsDirectory, `${job.id}.json`));
  }
  save(path.join(out, 'queue-result.json'), job);
  if (job.logPath && existsSync(job.logPath)) cpSync(job.logPath, path.join(out, 'queue.log'));
  const log = readFileSync(path.join(out, 'queue.log'), 'utf8');
  assert(!log.includes('stopped and re-queued as browser work'), 'hidden queue replacement attempt');
  assert(existsSync(path.join(out, 'report.json')), 'missing report retained as unresolved');
  const result = { ...intent, job: job.id, ...validateReport(json(path.join(out, 'report.json')), PLAN[kind].expectedCases, job) };
  save(path.join(out, 'trial.json'), result);
  console.log(JSON.stringify({ pair, arm, job: job.id, failed: result.failed, stats: result.stats }));
  return { pair, arm, job: job.id, failed: result.failed, source: result.source };
}
async function main() {
  assert.equal(process.env.GITHUB_ACTIONS, 'true', 'Actions runner required');
  assert.equal(process.env.GITHUB_RUN_ATTEMPT, '1', 'workflow re-run cannot replace primary measurements');
  assert.equal(process.env.GITHUB_REPOSITORY, 'NoaCG/NoaCG-Studio');
  assert.equal(process.env.GITHUB_SHA, run('git', ['rev-parse', 'HEAD']));
  assert.equal(process.argv.at(-1), '75', 'use prewritten 75-minute diagnostic bound');
  const selection = batch(process.env.GITHUB_REF_NAME);
  assert.equal(PLAN.pairs.length, 60);
  assert.equal(PLAN.pairs.filter(x => x === 'parent-first').length, 30);
  mkdirSync(OUT, { recursive: true });
  assert(!existsSync(path.join(OUT, 'environment.json')), 'existing batch evidence; no replacement');
  const deadline = Date.now() + 75 * 60_000;
  save(path.join(OUT, 'environment.json'), { ...selection, head: process.env.GITHUB_SHA, run: process.env.GITHUB_RUN_ID, attempt: 1, ref: process.env.GITHUB_REF_NAME, node: process.version, playwright: run('node', ['-p', 'require("@playwright/test/package.json").version']), platform: run('uname', ['-a']), profile: run('node', ['scripts/execution-profile.mjs']), plan: PLAN });
  const directories = Object.fromEntries(['parent', 'landing'].map(arm => [arm, prepareArm(selection.kind, arm, PLAN[selection.kind][arm])]));
  const env = selection.kind === 'operator' ? operatorEnvironment() : process.env;
  const rows = [];
  for (let i = selection.start; i < selection.start + selection.size; i++) {
    const order = PLAN.pairs[i] === 'parent-first' ? ['parent', 'landing'] : ['landing', 'parent'];
    for (const arm of order) {
      rows.push(await trial(selection.kind, i + 1, arm, directories[arm], env, deadline));
      save(path.join(OUT, 'progress.json'), { ...selection, rows });
    }
  }
  save(path.join(OUT, 'complete.json'), { ...selection, rows, note: 'Complete measurements; this is not a causal verdict or a quarantine release.' });
  // A real first-attempt failure remains visible in the workflow conclusion and reports.
  if (rows.some(row => row.failed)) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    mkdirSync(OUT, { recursive: true });
    save(path.join(OUT, 'unresolved.json'), { error: error.message });
    console.error(error.message);
    process.exitCode = 1;
  });
}
