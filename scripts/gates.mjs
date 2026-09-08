#!/usr/bin/env node
// THE BUILD'S GATES, DISCOVERED - not enumerated on one line of package.json.
//
//   node scripts/gates.mjs run [--gate build|factory|after-build] [--only checks|tests]   # what the build line calls
//   node scripts/gates.mjs list [--gate <tier>] [--changed <ref>] [--json]                # what would run, and why
//   node scripts/gates.mjs audit                                                          # are the declarations honest
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
//   // gate: after-build                run by this runner as the build line's last step, once the bundle exists
//   // gate: workflow <file.yml>        run by that workflow, which must name it
//   // gate: none - <why>               deliberately unautomated; the reason is required
//   // guards: <glob>, <glob>, ...      the paths whose change this gate can catch
//   // needs: browser                   (a test) needs Chromium, so it runs in the factory tier
//   // measures: none - <why>           it has no countable subject; the reason is required
//
// AND EVERY GATE SAYS HOW MUCH IT LOOKED AT. On 2026-09-08 three mechanisms passed while
// measuring nothing (scripts/measured.mjs carries all three). A gate reports the size of the set
// it resolved with `measured(n, subject)`, that helper refuses a count of zero whoever runs the
// gate, this runner refuses a check that exits 0 having reported NOTHING, and the audit refuses
// a gate that neither reports nor writes down why it has no countable subject.
//
// CHECKS are the entry files of the `check:*` and `test:*` scripts of package.json - each file
// judged once, however many scripts name it; the script is how a person runs the check, the
// header is how the build finds it. A gate-shaped script with no script file at all (a bare
// `playwright test`) has no header to carry, so it must be named by a workflow. TEST FILES are
// `scripts/**/*.test.mjs` on disk - a new test runs from the moment it exists, tracked or not. A
// test's tier is `build` unless its header says otherwise, and its guards are the modules it
// imports plus its sibling `<name>.mjs`, plus whatever the header adds; a test that reads
// fixtures nothing imports (a migration's SQL, a catalog) says so.
//
// `audit` is the inverted gate-coverage: not "does something run this gate" but "does this gate
// declare, truthfully, where it runs and what it guards" - a declared workflow must exist and
// name the gate, a `none` must carry a reason, every guard must match a repository file, and
// each tier's one mechanism must be wired (the build line runs this file, ci.yml runs the
// factory tier), so a guard that names a path that no longer exists fails the build the way a
// stale exemption did.
import { spawnSync } from 'node:child_process';
import { existsSync, globSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseArgs } from './e2e-quarantine.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The tiers a `gate:` line may name, and what each means to the runner. */
export const TIERS = ['build', 'factory', 'after-build', 'workflow', 'none'];

/** The tiers this runner runs; `workflow` and `none` are somebody else's. */
const RUNNABLE = ['build', 'factory', 'after-build'];

/** A script whose name starts with one of these is a promise that something runs it. */
export const GATE_PREFIXES = ['check:', 'test:'];

const ENTRY_POINT = /(?:cli\/)?scripts\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.mjs/g;

/** Every script file a command line would execute, in order. */
export function entryPointsOf(command) {
  return [...new Set(String(command ?? '').match(ENTRY_POINT) ?? [])];
}

/**
 * The declaration in a file's header: `{ gate, workflow, reason, guards, needs }`, each absent
 * when the header does not say. Read from the LEADING comment block only - the shebang, `//`
 * lines and blank lines before the first line of code - so a `gate:` mentioned in prose further
 * down is never mistaken for a declaration, and a declaration below the code is never honoured.
 */
export function parseHeader(text) {
  const out = { gate: null, workflow: null, reason: null, guards: [], needs: [], measures: null };
  for (const line of String(text ?? '').split(/\r?\n/)) {
    if (line.startsWith('#!') || line.trim() === '') continue;
    if (!line.trimStart().startsWith('//')) break;
    const m = line.match(/^\s*\/\/\s*(gate|guards|needs|measures):\s*(.+?)\s*$/);
    if (!m) continue;
    const [, key, value] = m;
    if (key === 'measures') {
      // Kept raw; the audit judges it. The only thing this line may say is `none - <why>`, because
      // a gate that DOES have a countable subject reports the number from the code, where the
      // number is - a header cannot know it.
      out.measures = value;
    } else if (key === 'gate') {
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

/**
 * Relative static imports of a module, as repo-relative paths (only ones that exist). Read off
 * import statements, not off every string in the file: a test's fixtures quote import lines too.
 */
export function relativeImports(file, text) {
  const dir = path.posix.dirname(file);
  const found = new Set();
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:import|export)\b[^'"]*\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]/) ?? line.match(/^\s*(?:const|let|var|await)?\s*[^'"]*\bawait import\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/);
    if (!m) continue;
    const resolved = path.posix.normalize(path.posix.join(dir, m[1]));
    if (existsSync(path.join(ROOT, resolved))) found.add(resolved);
  }
  return [...found].sort();
}

/**
 * Discover the checks: one per ENTRY FILE named by a gate-shaped script, judged once however many
 * scripts name it. The check's command is the script whose sole entry it is (that is how a person
 * runs it); a file only ever reached through a composite (`a && b`) runs as `node <file>`.
 * Gate-shaped scripts with no script file at all come back as `{ kind: 'script' }` so the audit
 * can ask a workflow to name them.
 * @param {Record<string,string>} scripts package.json's scripts
 * @param {(file: string) => string|null} read file text, or null when it does not exist
 */
export function discoverChecks(scripts, read = readRepoFile) {
  const names = Object.keys(scripts).filter((name) => GATE_PREFIXES.some((p) => name.startsWith(p)));
  const byEntry = new Map();
  const entryless = [];
  for (const name of names) {
    const entries = entryPointsOf(scripts[name]).filter((e) => !e.endsWith('.test.mjs'));
    if (entries.length === 0) {
      if (!/\.test\.mjs/.test(scripts[name])) entryless.push({ kind: 'script', name, command: scripts[name] });
      continue;
    }
    for (const entry of entries) {
      const rec = byEntry.get(entry) ?? { kind: 'check', entry, names: [], command: null };
      rec.names.push(name);
      // The command a person runs it by: a script that runs this file and nothing else. A wrapper
      // that chains something after it (`... && playwright test`) is not that command.
      if (entries.length === 1 && rec.command === null && !/&&|\|\||;/.test(scripts[name])) rec.command = scripts[name];
      byEntry.set(entry, rec);
    }
  }
  const checks = [];
  for (const rec of byEntry.values()) {
    const text = read(rec.entry);
    checks.push({ ...rec, name: rec.names[0], command: rec.command ?? `node ${rec.entry}`, exists: text !== null, header: parseHeader(text ?? '') });
  }
  return { checks, entryless };
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

/** Every non-test script file on disk, for the "a header nothing reads" rule. */
function scriptFilesOnDisk(root = ROOT) {
  return globSync(['scripts/**/*.mjs', 'cli/scripts/**/*.mjs'], { cwd: root })
    .map((f) => f.replaceAll('\\', '/'))
    .filter((f) => !f.endsWith('.test.mjs'))
    .sort();
}

/** All guards a gate claims: the header's, and for a test what it imports and sits beside. */
export function guardsOf(gate) {
  return [...new Set([...(gate.header.guards ?? []), ...(gate.derivedGuards ?? [])])];
}

/**
 * Is this gate exempt from saying how much it measured? Only a header reading `measures: none -
 * <why>` exempts it, and the audit is what holds that line to a reason. One reader, so the runner
 * and the audit cannot disagree about who is exempt.
 */
export function measuresNothing(header) {
  return /^none\s*-\s*\S/.test(header.measures ?? '');
}

/** Does one guard reach one path? `**` alone reaches everything. The one matcher every question uses. */
export function matchesGuard(file, guard) {
  return guard === '**' || file === guard || path.matchesGlob(file, guard);
}

/** Does any of the gate's guards reach any of the paths? */
export function guardsHit(guards, paths) {
  return guards.some((g) => paths.some((p) => matchesGuard(p, g)));
}

/** The mechanisms each runnable tier rests on, checked once per audit rather than once per gate. */
export function tierMechanisms({ buildLine, ciText }) {
  const problems = [];
  if (!/node scripts\/gates\.mjs run(?:\s|$)/.test(buildLine) || /--gate\s+(?:factory|after-build)/.test(buildLine.match(/node scripts\/gates\.mjs run[^&]*/)?.[0] ?? '')) {
    problems.push('the build line does not start the build tier with `node scripts/gates.mjs run` - the build tier has no mechanism');
  }
  if (!/node scripts\/gates\.mjs run --gate after-build/.test(buildLine)) {
    problems.push('the build line does not end with `node scripts/gates.mjs run --gate after-build` - the after-build tier has no mechanism');
  }
  if (!/node scripts\/gates\.mjs run --gate factory/.test(ciText ?? '')) {
    problems.push('.github/workflows/ci.yml does not run `node scripts/gates.mjs run --gate factory` - the factory tier has no mechanism');
  }
  return problems;
}

/**
 * THE AUDIT. One line per problem, empty when every declaration is honest.
 * @param {{ checks: object[], entryless?: object[], tests: object[], tracked: string[], workflowText: (name: string) => string|null, allWorkflowText?: string, buildLine: string, scriptFiles?: string[], read?: (file: string) => string|null }} input
 */
export function auditGates({ checks, entryless = [], tests, tracked, workflowText, allWorkflowText = '', buildLine, scriptFiles = [], read = readRepoFile }) {
  const problems = [];
  const trackedSet = new Set(tracked);
  const memo = new Map();
  const guardMatches = (glob) => {
    if (memo.has(glob)) return memo.get(glob);
    const hit = glob === '**' || trackedSet.has(glob) || tracked.some((f) => path.matchesGlob(f, glob));
    memo.set(glob, hit);
    return hit;
  };

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
    if (header.gate === 'build' && header.needs.includes('browser')) {
      problems.push(`${label} declares \`gate: build\` and \`needs: browser\` - the build tier has no browser; declare \`gate: factory\` or drop the need`);
    }
    if (header.gate === 'workflow') {
      const text = header.workflow ? workflowText(header.workflow) : null;
      if (!header.workflow) problems.push(`${label} declares \`gate: workflow\` without naming the workflow file`);
      else if (text === null) problems.push(`${label} declares \`gate: workflow ${header.workflow}\`, and .github/workflows/${header.workflow} does not exist`);
      else if (!((gate.names ?? [gate.name]).some((n) => text.includes(`npm run ${n}`)) || text.includes(gate.entry))) {
        problems.push(`${label} declares \`gate: workflow ${header.workflow}\`, but that workflow names neither \`npm run ${gate.name}\` nor ${gate.entry}`);
      }
    }
    if (header.gate === 'none' && !(header.reason && header.reason.trim().length >= 20)) {
      problems.push(`${label} declares \`gate: none\` without a reason a reader can act on ("not wired yet" is the defect this audit exists to catch)`);
    }
  };

  const judgeGuards = (gate, label) => {
    const guards = guardsOf(gate);
    if (guards.length === 0) {
      problems.push(`${label} declares no guards - add \`// guards: <paths it reads>\` so the paths it protects are on the record`);
      return;
    }
    for (const g of guards) {
      if (!guardMatches(g)) problems.push(`${label} guards \`${g}\`, which matches no file in the repository - the path moved or the declaration is stale`);
    }
  };

  /**
   * DOES THIS GATE SAY HOW MUCH IT LOOKED AT? The static half of the measurement rule: the gate
   * either reaches for `scripts/measured.mjs` - and that helper refuses a count of zero at run
   * time, whoever runs the gate - or its header writes down why it has no countable subject.
   *
   * Static, because the alternative is discovering the omission on the one run where it would
   * have mattered. This is the rule that makes the NEXT blind gate fail to land rather than pass
   * for a month: three of them did, on 2026-09-08, and each was found by a person reading a log.
   */
  const judgeMeasurement = (gate, label) => {
    const declared = gate.header.measures;
    if (declared !== null) {
      const none = declared.match(/^none\s*-\s*(.+)$/);
      if (!none) {
        problems.push(`${label} declares \`measures: ${declared}\` - that line may only say \`none - <why>\`, because a gate that does measure something reports the NUMBER from the code, where the number is`);
      } else if (none[1].trim().length < 20) {
        problems.push(`${label} declares \`measures: none\` without a reason a reader can act on - say WHY this gate has no countable subject`);
      }
      return;
    }
    if (!(read(gate.entry) ?? '').includes('measured.mjs')) {
      problems.push(
        `${label} never says how much it measured - import { measured } from './measured.mjs' and report the size of the set it resolved, ` +
          'so a moved constant or an emptied directory fails the gate instead of passing it. ' +
          'If it truly has no countable subject, add `// measures: none - <why>` to its header',
      );
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
    judgeMeasurement(check, label);
  }
  for (const test of tests) {
    const label = `test ${test.name}`;
    judgeTier(test, label);
    judgeGuards(test, label);
  }

  // A test file reports its own size to the runner (one `node --test` summary per file), so it
  // carries no `measured` call. What no test file can report is the whole population vanishing:
  // `testFilesOnDisk` is a glob, and a glob that stops matching leaves `runTests` with an empty
  // list, which it used to answer with exit 0.
  if (tests.length === 0) {
    problems.push('scripts/**/*.test.mjs matches no file, so `npm run build` would run no tests at all and still pass - the glob or the tests moved');
  }

  // A gate-shaped script with no script file (a bare Playwright suite) has no header to carry,
  // so the old rule stands for it alone: a workflow must name it.
  for (const script of entryless) {
    if (!allWorkflowText.includes(`npm run ${script.name}`)) {
      problems.push(`"${script.name}" runs no script file, so it cannot declare a tier - a workflow must name \`npm run ${script.name}\`, and none does`);
    }
  }

  // A header nobody reads is decoration that will drift: a script file that declares a tier must
  // be the entry of some check:/test: script, or a test file. This is also what keeps every
  // scripts/check-*.mjs on a `check:` script - the prefix is a convention, the header is the rule.
  const entries = new Set(checks.map((c) => c.entry));
  for (const file of scriptFiles) {
    if (entries.has(file)) continue;
    const header = parseHeader(read(file) ?? '');
    if (header.gate) problems.push(`${file} declares \`gate: ${header.gate}\` but no check: or test: script names it - add the script so the build can discover it and a person can run it, or drop the header`);
  }

  problems.push(...tierMechanisms({ buildLine, ciText: workflowText('ci.yml') ?? '' }));
  return problems;
}

/** The gates a set of changed paths can reach - a report, never a selection the build acts on. */
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
  const { checks, entryless } = discoverChecks(scripts);
  return { scripts, buildLine: scripts.build ?? '', checks, entryless, tests: discoverTests() };
}

/** The audit over the real repository: the problems, or none. `check:gate-coverage` is this. */
export function audit() {
  const { checks, entryless, tests, buildLine } = loadAll();
  const workflowDir = path.join(ROOT, '.github', 'workflows');
  const workflowText = (name) => readRepoFile(path.posix.join('.github/workflows', name));
  const allWorkflowText = globSync('*.yml', { cwd: workflowDir }).map((name) => readFileSync(path.join(workflowDir, name), 'utf8')).join('\n');
  const problems = auditGates({ checks, entryless, tests, tracked: repositoryFiles(), workflowText, allWorkflowText, buildLine, scriptFiles: scriptFilesOnDisk() });
  return { problems, checks, tests };
}

/** Run one check's command: `node <file> [args]` directly, anything else through the shell. */
function runCommand(command, env) {
  const plain = command.match(/^node\s+((?:cli\/)?scripts\/\S+\.mjs)((?:\s+[A-Za-z0-9_./=-]+)*)\s*$/);
  if (plain) {
    const args = plain[2].trim() ? plain[2].trim().split(/\s+/) : [];
    return spawnSync(process.execPath, [plain[1], ...args], { cwd: ROOT, stdio: 'inherit', env, windowsHide: true });
  }
  return spawnSync(command, { cwd: ROOT, stdio: 'inherit', shell: true, env, windowsHide: true });
}

/**
 * The receipts a check wrote through `scripts/measured.mjs`: one row per `measured(...)` call.
 * A check that never called it leaves no file at all, which is the case this exists to tell
 * apart from "measured zero" - the helper already fails the latter on its own.
 */
function readReceipts(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
    const [count, subject, kind] = line.split('\t');
    return { count: Number(count), subject, optional: kind === 'optional' };
  });
}

/**
 * THE RUNNER'S HALF OF THE MEASUREMENT RULE. `measured()` refuses a count of zero inside the
 * gate, whoever ran it. What only the runner can see is a check that reported NOTHING: the call
 * was deleted, or the code path carrying it stopped being reached. A green exit with no receipt
 * is the same claim as `PASS` over an empty set, so it is the same verdict.
 */
function measurementProblem(check, receipts) {
  if (measuresNothing(check.header)) return null;
  if (receipts.length === 0) {
    return `${check.name} exited 0 without saying how much it measured - it must call measured(n, subject) from scripts/measured.mjs on the set it resolved`;
  }
  return null;
}

function runChecks(checks) {
  const failed = [];
  const dir = mkdtempSync(path.join(os.tmpdir(), 'noacg-gates-'));
  try {
    for (const check of checks) {
      const started = Date.now();
      const receiptFile = path.join(dir, `${check.name.replace(/[^A-Za-z0-9]+/g, '-')}.tsv`);
      process.stdout.write(`\n[gates] ${check.name}: ${check.command}\n`);
      const res = runCommand(check.command, { ...process.env, GATE_MEASURED_FILE: receiptFile });
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      if (res.status !== 0) {
        failed.push(check.name);
        process.stdout.write(`[gates] ${check.name} FAILED (exit ${res.status}, ${seconds}s)\n`);
        continue;
      }
      const receipts = readReceipts(receiptFile);
      const blind = measurementProblem(check, receipts);
      if (blind) {
        failed.push(check.name);
        process.stdout.write(`[gates] ${check.name} MEASURED NOTHING (${seconds}s): ${blind}\n`);
        continue;
      }
      const what = receipts.map((r) => `${r.count} ${r.subject}`).join(', ');
      process.stdout.write(`[gates] ${check.name} ok (${seconds}s)${what ? ` - ${what}` : ''}\n`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return failed;
}

/** The reporter that counts each test file's tests, next to the one a person reads. */
const TEST_COUNT_REPORTER = './scripts/gates-test-count.mjs';

/**
 * `node --test` over the tier's files, and then the same question the checks answer: did each
 * file actually run any tests? A test file whose cases are generated from a list - a catalog, a
 * directory, a registry - registers ZERO tests when that list resolves to nothing, and node
 * reports the file itself as one passing test. The build used to read that as 99 files green.
 */
function runTests(files, tier) {
  if (files.length === 0) {
    // A TIER may honestly hold no tests - `after-build` holds one check and nothing else. The
    // BUILD tier holding none is a different claim: that is where every `scripts/**/*.test.mjs`
    // lands by default, so zero there means the glob or the tests moved. The whole population
    // going empty is the audit's rule, in `auditGates`, and it runs in this same build.
    if (tier !== 'build') {
      process.stdout.write(`\n[gates] the ${tier} tier holds no test files.\n`);
      return 0;
    }
    process.stderr.write('\n[gates] the build tier holds no test files - `scripts/**/*.test.mjs` matched nothing, which is a broken glob, not a pass.\n');
    return 1;
  }
  process.stdout.write(`\n[gates] node --test over ${files.length} file(s)\n`);
  const countsAt = path.join(os.tmpdir(), `noacg-test-counts-${process.pid}.tsv`);
  const args = [
    '--test',
    `--test-reporter=${process.stdout.isTTY ? 'spec' : 'tap'}`, '--test-reporter-destination=stdout',
    `--test-reporter=${TEST_COUNT_REPORTER}`, `--test-reporter-destination=${countsAt}`,
    ...files,
  ];
  const res = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit', windowsHide: true });
  const status = res.status ?? 1;
  try {
    if (status !== 0) return status;
    const counted = new Map(readReceipts(countsAt).map((r) => [r.subject, r.count]));
    const silent = files.filter((file) => !(counted.get(file) > 0));
    if (silent.length === 0) {
      process.stdout.write(`[gates] ${files.length} test file(s) ran ${[...counted.values()].reduce((a, b) => a + b, 0)} test(s)\n`);
      return 0;
    }
    process.stderr.write(`\n[gates] ${silent.length} test file(s) registered NO tests, so they passed having measured nothing:\n`);
    for (const file of silent) process.stderr.write(`  - ${file}\n`);
    process.stderr.write('  A test file whose cases come from a resolved list registers none when that list resolves to nothing.\n\n');
    return 1;
  } finally {
    rmSync(countsAt, { force: true });
  }
}

function main(argv) {
  const { command, flags } = parseArgs(argv);
  const tier = flags.get('--gate') ?? 'build';
  const only = flags.get('--only');
  if (typeof tier !== 'string' || !TIERS.includes(tier)) {
    console.error(`gates: --gate must be one of ${TIERS.join(', ')} (got ${tier})`);
    return 2;
  }
  if (only !== undefined && only !== 'checks' && only !== 'tests') {
    console.error(`gates: --only must be checks or tests (got ${only})`);
    return 2;
  }

  if (command === 'audit') {
    const { problems, checks, tests } = audit();
    if (problems.length > 0) {
      console.error(`\ngates audit: ${problems.length} problem(s):\n`);
      for (const p of problems) console.error(`  - ${p}`);
      console.error('');
      return 1;
    }
    console.log(`gates audit: OK - ${checks.length} check(s) and ${tests.length} test file(s) declare where they run and what they guard.`);
    return 0;
  }

  const { checks, tests } = loadAll();
  const inTier = (g) => g.header.gate === tier;
  const tierChecks = checks.filter(inTier);
  const tierTests = tests.filter(inTier);

  if (command === 'list') {
    const ref = flags.get('--changed');
    const changed = typeof ref === 'string' ? changedFiles(ref) : null;
    const rows = gatesFor([...tierChecks, ...tierTests], changed ?? []);
    if (flags.has('--json')) {
      console.log(JSON.stringify(rows.map((g) => ({ kind: g.kind, name: g.name, entry: g.entry, gate: g.header.gate, guards: guardsOf(g), hit: changed ? g.hit : undefined })), null, 2));
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
    if (!RUNNABLE.includes(tier)) {
      console.error(`gates run: --gate must be ${RUNNABLE.join(', ')} (got ${tier}); a ${tier} gate is run by what its header names`);
      return 2;
    }
    let failed = [];
    if (only !== 'tests') failed = runChecks(tierChecks);
    if (failed.length > 0) {
      console.error(`\n[gates] ${failed.length} check(s) failed: ${failed.join(', ')}${only === 'checks' ? '' : ' - tests not run'}`);
      return 1;
    }
    if (only === 'checks') return 0;
    const status = runTests(tierTests.map((t) => t.entry), tier);
    if (status !== 0) console.error(`\n[gates] tests failed (exit ${status})`);
    return status;
  }

  console.error('usage: gates.mjs run [--gate build|factory|after-build] [--only checks|tests] | list [--gate <tier>] [--changed <ref>] [--json] | audit');
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
