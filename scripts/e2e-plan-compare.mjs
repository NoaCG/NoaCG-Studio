#!/usr/bin/env node
// Compare two e2e planners over real diffs: the planner at a git ref (the OLD one) against the
// planner in this working tree (the NEW one), on the same changed-file lists and the same spec
// directory. Written for the move of the spec map into spec headers, whose whole claim is "no
// change to which specs run for any diff" - so any difference is a failure, and the exit code
// says so. Reusable whenever the planner is refactored rather than re-mapped.
//
//   node scripts/e2e-plan-compare.mjs                      # old = origin/main, last 50 landings,
//                                                          # every unmerged remote branch, this checkout
//   node scripts/e2e-plan-compare.mjs --old <ref>          # a different old planner
//   node scripts/e2e-plan-compare.mjs --landings 100       # more history
//   node scripts/e2e-plan-compare.mjs --branch <name> ...  # branches beyond the open PRs
//   node scripts/e2e-plan-compare.mjs --sweep              # also every path git has ever seen,
//                                                          # one file at a time
//
// Every case is planned twice, with and without sprint focus, and compared on the whole plan:
// mode, specs, catalog, configured, unmapped, focusApplied. The old planner is loaded from
// `git show <ref>:scripts/...` into a temporary directory, with every local module it imports.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const lines = (text) => text.split('\n').map((l) => l.trim()).filter(Boolean);

function parse(argv) {
  const opts = { old: 'origin/main', landings: 50, branches: [], sweep: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--old') opts.old = argv[++i];
    else if (a === '--landings') opts.landings = Number(argv[++i]);
    else if (a === '--branch') opts.branches.push(argv[++i]);
    else if (a === '--sweep') opts.sweep = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!opts.old || !Number.isInteger(opts.landings) || opts.landings < 0) throw new Error('bad --old or --landings');
  return opts;
}

/**
 * The planner module at `ref`, with its local imports and that ref's specs, loaded from a
 * temporary copy. The copy is removed once the module is loaded: `planFor` is pure, and a planner
 * that reads spec headers has read them at import.
 */
async function plannerAt(ref) {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-plan-old-'));
  try {
    const seen = new Set();
    const queue = ['scripts/e2e-affected.mjs'];
    while (queue.length) {
      const file = queue.pop();
      if (seen.has(file)) continue;
      seen.add(file);
      const text = git('show', `${ref}:${file}`);
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), text);
      for (const [, rel] of text.matchAll(/from\s+'(\.\/[^']+\.mjs)'/g)) queue.push(`scripts/${rel.slice(2)}`);
    }
    // The specs at that ref too: a planner that reads spec headers reads them from the directory
    // beside its own scripts, and the old planner must see the old headers.
    for (const file of lines(git('ls-tree', '-r', '--name-only', ref, 'e2e')).filter((f) => f.endsWith('.spec.ts'))) {
      mkdirSync(dirname(join(dir, file)), { recursive: true });
      writeFileSync(join(dir, file), git('show', `${ref}:${file}`));
    }
    return await import(pathToFileURL(join(dir, 'scripts/e2e-affected.mjs')).href);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Every remote branch not merged into the old ref - the open work a landing would carry. */
function openBranches(old) {
  return lines(git('branch', '-r', '--no-merged', old, '--format=%(refname:short)'))
    .filter((ref) => ref.startsWith('origin/') && ref !== 'origin/HEAD')
    .map((ref) => ref.slice('origin/'.length));
}

function refExists(ref) {
  return spawnSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: ROOT, stdio: 'ignore' }).status === 0;
}

const key = (p) => JSON.stringify({ mode: p.mode, specs: p.specs, catalog: p.catalog, configured: p.configured, unmapped: p.unmapped, focusApplied: p.focusApplied });

export async function compare(opts) {
  const oldPlanner = await plannerAt(opts.old);
  const newPlanner = await import(pathToFileURL(join(ROOT, 'scripts/e2e-affected.mjs')).href);
  const { specFilesOnDisk } = await import(pathToFileURL(join(ROOT, 'scripts/e2e-durations.mjs')).href);
  const specsOnDisk = specFilesOnDisk();
  const cases = [];

  for (const sha of lines(git('rev-list', '--first-parent', '-n', String(opts.landings), opts.old))) {
    const subject = git('log', '-1', '--format=%s', sha);
    const parents = git('rev-list', '--parents', '-n', '1', sha).split(/\s+/);
    const changed = parents.length > 1 ? lines(git('diff', '--name-only', parents[1], sha)) : lines(git('show', '--name-only', '--format=', sha));
    cases.push({ kind: 'landing', name: `${sha.slice(0, 9)} ${subject}`, changed });
  }
  const branches = [...new Set([...openBranches(opts.old), ...opts.branches])];
  for (const branch of branches) {
    const ref = refExists(`origin/${branch}`) ? `origin/${branch}` : branch;
    if (!refExists(ref)) {
      cases.push({ kind: 'branch', name: branch, missing: true });
      continue;
    }
    cases.push({ kind: 'branch', name: branch, changed: lines(git('diff', '--name-only', `${opts.old}...${ref}`)) });
  }
  cases.push({ kind: 'branch', name: 'HEAD (this checkout, working tree included)', changed: newPlanner.changedFilesSince(opts.old, ROOT) });

  if (opts.sweep) {
    const known = new Set([...lines(git('ls-files')), ...lines(git('log', '--all', '--name-only', '--format='))]);
    for (const file of [...known].sort()) cases.push({ kind: 'path', name: file, changed: [file], quiet: true });
  }

  const differences = [];
  for (const c of cases) {
    if (c.missing) continue;
    for (const sprintFocus of [false, true]) {
      const before = oldPlanner.planFor(c.changed, { sprintFocus, specsOnDisk });
      const after = newPlanner.planFor(c.changed, { sprintFocus, specsOnDisk });
      if (key(before) !== key(after)) differences.push({ ...c, sprintFocus, before, after });
    }
    c.plan = newPlanner.planFor(c.changed, { specsOnDisk });
  }
  return { cases, differences };
}

function report({ cases, differences }, opts) {
  const out = [];
  const count = (kind) => cases.filter((c) => c.kind === kind && !c.missing).length;
  out.push(`Old planner: \`${opts.old}\` (${git('rev-parse', '--short', opts.old)}). New planner: this working tree.`);
  out.push(`Compared ${count('landing')} landings, ${count('branch')} branches${opts.sweep ? `, ${count('path')} single paths` : ''}; each with and without sprint focus.`);
  out.push('');
  out.push('| case | changed files | mode | specs | catalog |');
  out.push('|---|---:|---|---:|---|');
  for (const c of cases.filter((x) => !x.quiet)) {
    if (c.missing) out.push(`| ${c.kind} ${c.name} | - | ref not found | - | - |`);
    else out.push(`| ${c.kind} ${c.name.replace(/\|/g, '/')} | ${c.changed.length} | ${c.plan.mode} | ${c.plan.specs.length} | ${c.plan.catalog} |`);
  }
  out.push('');
  if (differences.length === 0) out.push('RESULT: IDENTICAL - every plan matches, plan mode included.');
  else {
    out.push(`RESULT: ${differences.length} DIFFERENCE(S)`);
    for (const d of differences.slice(0, 40)) {
      out.push(`- ${d.kind} ${d.name} (focus ${d.sprintFocus}):`);
      out.push(`    old ${key(d.before)}`);
      out.push(`    new ${key(d.after)}`);
    }
  }
  return out.join('\n');
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('scripts/e2e-plan-compare.mjs')) {
  const opts = parse(process.argv.slice(2));
  const result = await compare(opts);
  console.log(report(result, opts));
  process.exit(result.differences.length === 0 ? 0 : 1);
}
