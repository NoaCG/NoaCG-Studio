#!/usr/bin/env node
// gate: after-build
// guards: package.json, scripts/**, cli/scripts/**, .github/workflows/**
//
// THE BUILD'S GATES, DISCOVERED - not enumerated on one line of package.json.
//
//   node scripts/gates.mjs run [--gate build|factory] [--only checks|tests]   # what the build line calls
//   node scripts/gates.mjs list [--gate <tier>] [--changed <ref>] [--json]    # what would run, and why
//   node scripts/gates.mjs audit                                              # are the declarations honest
//
// WHY. The `build` script used to name every repo-shape check and every `node --test` file, one
// `&&` at a time: 31 segments, 88 test files, and the single most-conflicted line in the
// repository - 66 edits and 15 merge resolutions in a month, because every new test edited the
// same line (docs/WORKFLOW_ARCHITECTURE.md §1.4, phase 1d). And `check-gate-coverage` refused a
// gate with no home rather than asking each gate where its home is, so the cheap fix was always
// to make the line longer.
//
// NOW EACH GATE SAYS WHERE IT RUNS AND WHAT IT GUARDS, in its own header, and this file reads
// the headers:
//
//   // gate: build                      run by `npm run build`, through this runner
//   // gate: factory                    run by ci.yml's Factory gates job (a browser, servers)
//   // gate: after-build                named on the build line itself, after the bundle exists
//   // gate: workflow <file.yml>        run by that workflow, which must name it
//   // gate: none - <why>               deliberately unautomated; the reason is required
//   // guards: <glob>, <glob>, ...      the paths whose change this gate can catch
//   // needs: browser                   (a test) needs Chromium, so it runs in the factory tier
//
// CHECKS are the `check:*` and `test:*` scripts of package.json whose entry point is a script
// rather than a test file; the script is how a person runs the check, the header is how the
// build finds it. TEST FILES are `scripts/**/*.test.mjs` on disk - a new test runs from the
// moment it exists, tracked or not. A test's tier is `build` unless its header says otherwise,
// and its guards are the modules it imports plus its sibling `<name>.mjs`, plus whatever the
// header adds; a test that reads fixtures nothing imports (a migration's SQL, a catalog) says so.
//
// `audit` is the inverted gate-coverage: not "does something run this gate" but "does this gate
// declare, truthfully, where it runs and what it guards" - a declared workflow must exist and
// name the gate, a `none` must carry a reason, and every guard must match a tracked file, so a
// guard that names a path that no longer exists fails the build the way a stale exemption did.
import { spawnSync } from 'node:child_process';
import { existsSync, globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The tiers a `gate:` line may name, and what each means to the runner. */
export const TIERS = ['build', 'factory', 'after-build', 'workflow', 'none'];

/** A script whose name starts with one of these is a promise that something runs it. */
export const GATE_PREFIXES = ['check:', 'test:'];

const ENTRY_POINT = /(?:cli\/)?scripts\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.mjs/g;
const HEADER_LINES = 80;

/** Every script file a command line would execute, in order. */
export function entryPointsOf(command) {
  return [...new Set(String(command ?? '').match(ENTRY_POINT) ?? [])];
}

/**
 * The declaration in a file's header: `{ gate, workflow, reason, guards, needs }`, each absent
 * when the header does not say. Read from the first HEADER_LINES lines of `//` comments only.
 */
export function parseHeader(text) {
  const out = { gate: null, workflow: null, reason: null, guards: [], needs: [] };
  const lines = String(text ?? '').split(/\r?\n/).slice(0, HEADER_LINES);
  for (const line of lines) {
    const m = line.match(/^\s*\/\/\s*(gate|guards|needs):\s*(.+?)\s*$/);
    if (!m) continue;
    const [, key, value] = m;
    if (key === 'gate') {
      const gate = value.match(/^(\S+)(?:\s+(.*))?$/);
      out.gate = gate[1];
      const rest = (gate[2] ?? '').trim();
      if (out.gate === 'workflow') out.workflow = rest;
      if (out.gate === 'none') out.reason = rest.replace(/^-\s*/, '');
    } else if (key === 'guards') {
      out.guards.push(...value.split(',').map((s) => s.trim()).filter(Boolean));
    } else if (key === 'needs') {
      out.needs.push(...value.split(',').map((s) => s.trim()).filter(Boolean));
    }
  }
  return out;
}

/** Relative static imports of a module, as repo-relative paths (only ones that exist). */
export function relativeImports(file, text) {
  const dir = path.posix.dirname(file);
  const found = new Set();
  for (const m of String(text ?? '').matchAll(/\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]|\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) {
    const spec = m[1] ?? m[2];
    const resolved = path.posix.normalize(path.posix.join(dir, spec));
    if (existsSync(path.join(ROOT, resolved))) found.add(resolved);
  }
  return [...found].sort();
}

/**
 * Discover the checks: every gate-shaped script whose entry point is not a test file. A script
 * whose every entry point is some other script's sole entry point is a COMPOSITE (`check:freshness`
 * chains four checks) and is not judged on its own; the parts are.
 * @param {Record<string,string>} scripts package.json's scripts
 * @param {(file: string) => string|null} read file text, or null when it does not exist
 */
export function discoverChecks(scripts, read = readRepoFile) {
  const names = Object.keys(scripts).filter((name) => GATE_PREFIXES.some((p) => name.startsWith(p)));
  const soleEntries = new Map();
  for (const name of names) {
    const entries = entryPointsOf(scripts[name]);
    if (entries.length === 1) soleEntries.set(entries[0], (soleEntries.get(entries[0]) ?? []).concat(name));
  }
  const checks = [];
  for (const name of names) {
    const entries = entryPointsOf(scripts[name]).filter((e) => !e.endsWith('.test.mjs'));
    if (entries.length === 0) continue;
    const composite = entries.length > 1 && entries.every((e) => (soleEntries.get(e) ?? []).some((n) => n !== name));
    if (composite) continue;
    const entry = entries[0];
    const text = read(entry);
    checks.push({ kind: 'check', name, command: scripts[name], entry, exists: text !== null, header: parseHeader(text ?? '') });
  }
  return checks;
}

/** Discover the test files on disk and read each one's declaration. */
export function discoverTests(read = readRepoFile, files = testFilesOnDisk()) {
  return files.map((file) => {
    const text = read(file) ?? '';
    const header = parseHeader(text);
    const sibling = file.replace(/\.test\.mjs$/, '.mjs');
    const derived = [...new Set([...(existsSync(path.join(ROOT, sibling)) ? [sibling] : []), ...relativeImports(file, text)])];
    const gate = header.gate ?? (header.needs.includes('browser') ? 'factory' : 'build');
    return { kind: 'test', name: file, entry: file, exists: true, header: { ...header, gate }, derivedGuards: derived };
  });
}

export function testFilesOnDisk(root = ROOT) {
  return globSync('scripts/**/*.test.mjs', { cwd: root })
    .map((f) => f.replaceAll('\\', '/'))
    .sort();
}

/** All guards a gate claims: the header's, and for a test what it imports and sits beside. */
export function guardsOf(gate) {
  return [...new Set([...(gate.header.guards ?? []), ...(gate.derivedGuards ?? [])])];
}

/** Does any of the gate's guards match any of the paths? `**` alone matches everything. */
export function guardsHit(guards, paths) {
  return guards.some((g) => g === '**' || paths.some((p) => path.matchesGlob(p, g) || p === g || p.startsWith(`${g.replace(/\/\*\*$/, '')}/`)));
}

/**
 * THE AUDIT. One line per problem, empty when every declaration is honest.
 * @param {{ checks: object[], tests: object[], tracked: string[], workflowText: (name: string) => string|null, buildLine: string }} input
 */
export function auditGates({ checks, tests, tracked, workflowText, buildLine }) {
  const problems = [];
  const trackedSet = new Set(tracked);
  const guardMatches = (glob) => glob === '**' || trackedSet.has(glob) || tracked.some((f) => path.matchesGlob(f, glob));

  const judgeTier = (gate, label) => {
    const { header } = gate;
    if (!header.gate) {
      problems.push(`${label} declares no tier - add \`// gate: build\` (or factory, after-build, workflow <file.yml>, none - <why>) to its header`);
      return;
    }
    if (!TIERS.includes(header.gate)) {
      problems.push(`${label} declares \`gate: ${header.gate}\`, which is not one of ${TIERS.join(', ')}`);
      return;
    }
    if (header.gate === 'workflow') {
      const text = header.workflow ? workflowText(header.workflow) : null;
      if (!header.workflow) problems.push(`${label} declares \`gate: workflow\` without naming the workflow file`);
      else if (text === null) problems.push(`${label} declares \`gate: workflow ${header.workflow}\`, and .github/workflows/${header.workflow} does not exist`);
      else if (!(text.includes(`npm run ${gate.name}`) || text.includes(gate.entry))) {
        problems.push(`${label} declares \`gate: workflow ${header.workflow}\`, but that workflow names neither \`npm run ${gate.name}\` nor ${gate.entry}`);
      }
    }
    if (header.gate === 'none' && !(header.reason && header.reason.trim().length >= 20)) {
      problems.push(`${label} declares \`gate: none\` without a reason a reader can act on ("not wired yet" is the defect this audit exists to catch)`);
    }
    if (header.gate === 'after-build' && !buildLine.includes(gate.entry)) {
      problems.push(`${label} declares \`gate: after-build\`, but the build line does not name ${gate.entry}`);
    }
  };

  const judgeGuards = (gate, label) => {
    const guards = guardsOf(gate);
    if (guards.length === 0) {
      problems.push(`${label} declares no guards - add \`// guards: <paths it reads>\` so the paths it protects are on the record`);
      return;
    }
    for (const g of guards) {
      if (!guardMatches(g)) problems.push(`${label} guards \`${g}\`, which matches no tracked file - the path moved or the declaration is stale`);
    }
  };

  for (const check of checks) {
    const label = `"${check.name}" (${check.entry})`;
    if (!check.exists) {
      problems.push(`${label} names an entry point that does not exist`);
      continue;
    }
    judgeTier(check, label);
    judgeGuards(check, label);
  }
  for (const test of tests) {
    const label = `test ${test.name}`;
    judgeTier(test, label);
    judgeGuards(test, label);
  }

  // A check file nobody can run by name is a check nobody runs: every scripts/check-*.mjs is
  // somebody's `check:` script.
  const named = new Set(checks.map((c) => c.entry));
  for (const file of tracked.filter((f) => /^scripts\/check-[^/]+\.mjs$/.test(f) && !f.endsWith('.test.mjs'))) {
    if (!named.has(file)) problems.push(`${file} is a check with no \`check:\` script in package.json - add one so the build can discover it and a person can run it`);
  }
  return problems;
}

/** The gates a set of changed paths can reach, per tier - a report, never a selection the build acts on. */
export function gatesFor(gates, changed) {
  return gates.map((g) => ({ ...g, hit: guardsHit(guardsOf(g), changed) }));
}

function readRepoFile(file) {
  try {
    return readFileSync(path.join(ROOT, file), 'utf8');
  } catch {
    return null;
  }
}

/**
 * The files a guard may name: tracked, plus untracked files git would not ignore - a new gate is
 * written and audited before it is added, and its guards are real from the first `npm run build`.
 */
export function repositoryFiles() {
  const res = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`git ls-files failed: ${res.stderr}`);
  return [...new Set(res.stdout.split('\0').filter(Boolean).map((f) => f.replaceAll('\\', '/')))];
}

function changedFiles(ref) {
  const diff = spawnSync('git', ['diff', '--name-only', `${ref}...HEAD`], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  const status = spawnSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  const fromDiff = diff.status === 0 ? diff.stdout.split('\n') : [];
  const fromStatus = status.stdout.split('\n').map((l) => l.slice(3).trim());
  return [...new Set([...fromDiff, ...fromStatus].map((f) => f.replaceAll('\\', '/')).filter(Boolean))];
}

function loadAll() {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const scripts = pkg.scripts ?? {};
  return { scripts, buildLine: scripts.build ?? '', checks: discoverChecks(scripts), tests: discoverTests() };
}

function runChecks(checks) {
  const failed = [];
  for (const check of checks) {
    const started = Date.now();
    process.stdout.write(`\n[gates] ${check.name}: ${check.command}\n`);
    const res = spawnSync(check.command, { cwd: ROOT, stdio: 'inherit', shell: true, windowsHide: true });
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (res.status !== 0) {
      failed.push(check.name);
      process.stdout.write(`[gates] ${check.name} FAILED (exit ${res.status}, ${seconds}s)\n`);
    } else process.stdout.write(`[gates] ${check.name} ok (${seconds}s)\n`);
  }
  return failed;
}

function runTests(files) {
  if (files.length === 0) return 0;
  process.stdout.write(`\n[gates] node --test over ${files.length} file(s)\n`);
  const res = spawnSync(process.execPath, ['--test', ...files], { cwd: ROOT, stdio: 'inherit', windowsHide: true });
  return res.status ?? 1;
}

function main(argv) {
  const command = argv[0];
  const flag = (name) => (argv.indexOf(name) >= 0 ? argv[argv.indexOf(name) + 1] : undefined);
  const tier = flag('--gate') ?? 'build';
  const only = flag('--only');
  const { checks, tests, buildLine } = loadAll();

  if (command === 'audit') {
    const problems = auditGates({
      checks,
      tests,
      tracked: repositoryFiles(),
      workflowText: (name) => readRepoFile(`.github/workflows/${name}`),
      buildLine,
    });
    if (problems.length > 0) {
      console.error(`\ngates audit: ${problems.length} problem(s):\n`);
      for (const p of problems) console.error(`  - ${p}`);
      console.error('');
      return 1;
    }
    console.log(`gates audit: OK - ${checks.length} check(s) and ${tests.length} test file(s) declare where they run and what they guard.`);
    return 0;
  }

  const inTier = (g) => g.header.gate === tier;
  const tierChecks = checks.filter(inTier);
  const tierTests = tests.filter(inTier);

  if (command === 'list') {
    const changed = flag('--changed') ? changedFiles(flag('--changed')) : null;
    const rows = gatesFor([...tierChecks, ...tierTests], changed ?? []);
    if (argv.includes('--json')) {
      console.log(JSON.stringify(rows.map((g) => ({ kind: g.kind, name: g.name, gate: g.header.gate, guards: guardsOf(g), hit: changed ? g.hit : undefined })), null, 2));
      return 0;
    }
    for (const g of rows) {
      const mark = changed ? (g.hit ? 'hit ' : 'miss') : '    ';
      console.log(`${mark} ${g.kind.padEnd(5)} ${g.name}  [${guardsOf(g).join(', ')}]`);
    }
    if (changed) console.log(`\n${rows.filter((g) => g.hit).length} of ${rows.length} ${tier} gate(s) reach the ${changed.length} changed path(s).`);
    return 0;
  }

  if (command === 'run') {
    if (!TIERS.includes(tier) || tier === 'workflow' || tier === 'none') {
      console.error(`gates run: --gate must be build, factory or after-build (got ${tier})`);
      return 2;
    }
    let failed = [];
    if (only !== 'tests') failed = runChecks(tierChecks);
    if (failed.length > 0) {
      console.error(`\n[gates] ${failed.length} check(s) failed: ${failed.join(', ')}${only === 'checks' ? '' : ' - tests not run'}`);
      return 1;
    }
    if (only === 'checks') return 0;
    const status = runTests(tierTests.map((t) => t.entry));
    if (status !== 0) console.error(`\n[gates] tests failed (exit ${status})`);
    return status;
  }

  console.error('usage: gates.mjs run [--gate build|factory|after-build] [--only checks|tests] | list [--gate <tier>] [--changed <ref>] [--json] | audit');
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
