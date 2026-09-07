#!/usr/bin/env node
// ONE LIST SAYING WHICH FILES CAN CHANGE WHAT PRODUCTION SERVES, read by the two mechanisms that
// must agree about it:
//
//   - scripts/vercel-ignore-build.mjs decides whether a push to main is worth a production build.
//   - deploy-verify.yml's drift check decides which commit production is expected to be serving.
//
// They have to share the list or they contradict each other. If the ignore step skips a commit the
// drift check still expects live, the alarm fires on a deployment that was never supposed to
// happen - a false alarm on `main`, which is the most expensive kind, because the repo treats a
// red alarm there as something that has already landed broken.
//
// WHAT IT COST. Measured over the 2026-08-08..2026-09-07 Vercel billing cycle: 719 pushes to main,
// each one a production build of about 3.1 minutes on a 4-vCPU Elastic machine, 9.31K build CPU
// minutes, $32.39 against a $20 monthly credit. 345 of those 718 measurable pushes - 48% - changed
// only documentation, contracts, workflow tooling or tests, and rebuilt a byte-identical site.
//
// THE LIST IS A DENY LIST, AND THAT DIRECTION IS THE WHOLE SAFETY ARGUMENT. A file is deploy-
// affecting unless it is named here, so a directory nobody thought about builds, a new top-level
// folder builds, and a rename builds. The two mistakes are not symmetric: a needless build costs
// about $0.045, while a wrongly skipped build leaves production silently serving an older commit
// with every gate green. So when in doubt this file stays quiet and the build runs.
//
// Adding an entry is a claim you have to be able to defend: that nothing under that path is read
// by `npm run build:vercel` (the buildCommand in vercel.json), by `vite build` through an import,
// or by the production pack. docs/DEPLOYMENT.md, "What Vercel builds", is where that reasoning
// lives.
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/**
 * Path prefixes whose contents cannot reach the deployed artifact. Each entry ends in `/` and is
 * matched against repo-relative, forward-slashed paths.
 */
export const NEVER_DEPLOYED_DIRS = [
  '.agent-workflows/', // shared command procedures for agents
  '.agents/', // Codex adapters
  '.claude/', // Claude adapters, worktrees, generated rules
  '.github/', // CI - it gates main, it is not served from it
  '.vscode/',
  'benchmarks/', // measurement harnesses, never imported by src/
  'cli/', // the NoaCG CLI, released by release-cli.yml on its own
  'contracts/', // the rule store; compiled into .claude/rules, not into the bundle
  'docs/',
  'e2e/', // Playwright specs
  'supabase/', // migrations and config; generated types land in src/ and are caught there
];

/** Single files that cannot reach the deployed artifact. */
export const NEVER_DEPLOYED_FILES = ['LICENSE'];

/**
 * `scripts/` is denied wholesale EXCEPT these, which vercel.json's buildCommand actually runs (or
 * is imported by one that does). Keep this in step with the `build:vercel` line in package.json:
 * a check added there and not named here would stop triggering the build that runs it.
 */
export const DEPLOY_AFFECTING_SCRIPTS = new Set([
  'scripts/apiRouteTable.mjs', // imported by check-api-route-depth.mjs
  'scripts/build-production-pack.mjs',
  'scripts/check-api-route-depth.mjs',
  'scripts/check-client-secrets.mjs',
  'scripts/check-function-budget.mjs',
  'scripts/check-vercel-config.mjs',
  'scripts/prerender.mjs',
  'scripts/write-version.mjs',
]);

/**
 * Markdown never reaches the bundle. This covers the per-area AGENTS.md/CLAUDE.md contracts that
 * live inside src/, which is why it is a suffix rule rather than another directory entry - those
 * files sit in the most deploy-affecting directory in the tree and still change nothing.
 * Verified 2026-09-07: no .md exists under public/, and nothing in src/ or api/ imports one.
 */
function isMarkdown(file) {
  return file.toLowerCase().endsWith('.md');
}

/** Can a change to this one file change what production serves? */
export function affectsDeployment(file) {
  const p = String(file).trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (p === '') return false;
  if (isMarkdown(p)) return false;
  if (NEVER_DEPLOYED_FILES.includes(p)) return false;
  if (NEVER_DEPLOYED_DIRS.some((dir) => p.startsWith(dir))) return false;
  if (p.startsWith('scripts/')) return DEPLOY_AFFECTING_SCRIPTS.has(p);
  return true;
}

/** Can any file in this list? An empty list is `false` - nothing changed, nothing to deploy. */
export function anyAffectsDeployment(files) {
  return files.some((f) => affectsDeployment(f));
}

/**
 * The files a commit range touched, or `null` when git cannot answer (a shallow clone).
 *
 * `--no-renames` is load-bearing, not a preference. With rename detection on, `--name-only` prints
 * ONLY the destination of a rename, so moving `src/Panel.tsx` to `docs/attic/Panel.md` - or into
 * `cli/`, which is a plausible move - reports a single denied path and skips a build that removed a
 * component from the bundle. Turning detection off lists both sides, so the deletion is always seen.
 * check-line-endings.mjs learned the same thing about the same flag; this is that lesson, applied
 * where getting it wrong costs a stale production rather than a missed warning.
 */
export function changedFiles(from, to, cwd = process.cwd()) {
  try {
    const out = execFileSync('git', ['diff', '--no-renames', '--name-only', `${from}`, `${to}`], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * The newest commit at or before `ref` that a production build would have been run for - which is
 * the commit the drift check should expect production to be serving. Returns null if the history
 * runs out, which the caller must treat as "nothing to compare", never as drift.
 */
export function lastAffectingCommit(ref, cwd = process.cwd(), limit = 400) {
  // `--first-parent` because the deployment unit is a push to main, not a commit. Walking into a
  // merged branch's own commits would judge changes that were never deployed separately: a branch
  // that adds a file and removes it again lands as a docs-only merge, but carries a deploy-
  // affecting commit inside it, and returning that commit would demand production serve something
  // that was never a tip of main - a false drift alarm.
  //
  // One `git log` rather than a `git diff` per commit: the drift job walks until it finds an
  // affecting commit, and a run of documentation landings is exactly when this is called.
  const log = execFileSync(
    'git',
    ['log', '--first-parent', '-m', '--no-renames', '--name-only', '--format=%x00%H', `--max-count=${limit}`, ref],
    { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  for (const block of log.split('\0').slice(1)) {
    const [sha, ...files] = block.split('\n');
    if (anyAffectsDeployment(files.map((f) => f.trim()).filter(Boolean))) return sha.trim();
  }
  return null;
}

function main(argv) {
  const [mode, ...rest] = argv;
  if (mode === '--last-affecting') {
    const sha = lastAffectingCommit(rest[0] ?? 'HEAD');
    if (!sha) return 1;
    console.log(sha);
    return 0;
  }
  if (mode === '--range') {
    const [from, to] = rest;
    const files = changedFiles(from, to ?? 'HEAD');
    // Both answers the ignore step gives for a range it cannot judge: an unreadable diff and an
    // empty one (a redeploy of the same tree) build.
    if (files === null || files.length === 0) {
      console.log(`${from}..${to ?? 'HEAD'} ${files === null ? 'cannot be read' : 'changes no files'} - treating as deploy-affecting`);
      return 0;
    }
    const affecting = files.filter((f) => affectsDeployment(f));
    console.log(
      affecting.length > 0
        ? `deploy-affecting (${affecting.length}/${files.length} file(s)): ${affecting.slice(0, 10).join(', ')}`
        : `not deploy-affecting - all ${files.length} file(s) are docs, contracts, tooling or tests`,
    );
    return affecting.length > 0 ? 0 : 1;
  }
  console.error('usage: deploy-affecting-paths.mjs --range <from> [<to>] | --last-affecting <ref>');
  return 2;
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) process.exit(main(process.argv.slice(2)));
