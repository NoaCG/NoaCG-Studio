#!/usr/bin/env node
// gate: build
// guards: *
//
// Refuse tracked files that nobody meant to commit: an unexpected entry at the repo ROOT, or a
// path segment that is really a mistyped command-line flag.
//
// Why this exists. On 2026-08-09 a sweep was invoked as `node scripts/l3-sweep.mjs --category
// lower-third`. That script takes POSITIONAL arguments, so `--category` became its output
// directory: it created one with that literal name, wrote 90 screenshots into it, and a
// `git add -A` in an unrelated commit carried all of them onto `main`. Nothing referenced them,
// every gate stayed green, and it was found two merges later by reading a diff during handoff.
//
// The specific cause is fixed where it happened (`scripts/out-dir.mjs`, used by every script
// that takes an out-dir). This is the layer under that: it does not care WHICH tool produced a
// stray file or which flag was mistyped, only that something is tracked which should not be. The
// two shapes below are the ones that cost real time, and both are cheap to state exactly.
//
// It is a hard gate rather than a report because the failure is invisible by nature - junk at the
// root breaks nothing, so nothing else will ever complain about it, and it propagates into every
// worktree created afterwards.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every entry allowed at the top level, as of 2026-08-09.
 *
 * Deliberately a LIST rather than a pattern. A new top-level directory is a real architectural
 * decision - it changes what the repo IS - and about twice a year is the honest rate. Adding a
 * line here is the right amount of friction for that, and the wrong amount for anything else,
 * which is exactly the discrimination this gate exists to make. Keep it sorted.
 */
export const ALLOWED_ROOT_ENTRIES = new Set([
  // `.claude-plugin/` holds ONLY marketplace.json - the Claude Code plugin marketplace entries for
  // the `noacg` plugin under cli/plugin/ and the optional `noacg-mcp` plugin under cli/plugin-mcp/
  // (docs/AGENT_CLI.md "Distribution"). The marketplace manifest has to sit at the repository root
  // for `claude plugin marketplace add NoaCG/NoaCG-Studio` to find it; the plugins stay under cli/.
  '.agent-workflows', '.agents', '.claude', '.claude-plugin', '.codex', '.dependency-cruiser.cjs', '.env.bench',
  '.env.example', '.gitattributes', '.github', '.gitignore', '.nvmrc', 'AGENTS.md', 'CLAUDE.md', 'LICENSE',
  'NoaCG-Brand-Kit', 'README.md', 'admin.html', 'api', 'app.html', 'benchmarks', 'bridge.html', 'cli',
  // `contracts/` is the rule store the loaded contracts are compiled from (docs/WORKFLOW_ARCHITECTURE.md
  // §5.3): one rule per file, one record per incident, neither loaded into a session.
  'contracts', 'docs',
  'docs.html', 'e2e',
  'eslint.config.js', 'index.html', 'join.html', 'ograf.html', 'output.html', 'package-lock.json',
  'package.json', 'packs', 'player-host', 'playwright.catalog.config.ts', 'playwright.config.ts',
  'playwright.live.config.ts', 'privacy.html', 'public', 're-design', 'render-worker', 'scripts', 'src',
  'supabase', 'terms.html', 'tsconfig.api.json', 'tsconfig.json', 'vercel.json', 'vite.config.ts',
]);

/** Tracked paths, one per line, from git itself rather than a directory walk - the question is
 *  "what is COMMITTED", and a walk would also see ignored and untracked files. */
export function trackedPaths(cwd = repoRoot) {
  return execFileSync('git', ['ls-files', '-z'], { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean);
}

export function treeShapeProblems(paths, allowed = ALLOWED_ROOT_ENTRIES) {
  const problems = [];
  const unexpectedRoots = new Map();
  const flagSegments = new Map();

  for (const file of paths) {
    const segments = file.split('/');
    if (!allowed.has(segments[0])) {
      unexpectedRoots.set(segments[0], (unexpectedRoots.get(segments[0]) ?? 0) + 1);
    }
    // A path segment starting with `-` is a mistyped flag wherever it appears, not only at the
    // root: the same mistake inside scripts/ or benchmarks/ would pass the allowlist above.
    const flagged = segments.find((segment) => segment.startsWith('-'));
    if (flagged) flagSegments.set(flagged, (flagSegments.get(flagged) ?? 0) + 1);
  }

  for (const [entry, count] of [...unexpectedRoots].sort()) {
    problems.push(`unexpected top-level entry "${entry}" (${count} tracked file(s))`);
  }
  for (const [segment, count] of [...flagSegments].sort()) {
    problems.push(`path segment "${segment}" looks like a command-line flag (${count} tracked file(s))`);
  }
  return problems;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = treeShapeProblems(trackedPaths());
  if (!problems.length) {
    console.log('Tree shape OK - no unexpected top-level entries, no flag-shaped path segments.');
  } else {
    for (const problem of problems) console.error(`  x ${problem}`);
    console.error(
      `\n${problems.length} problem(s). Either the files should not be committed - delete them and `
      + 'check which tool wrote them - or the entry is a deliberate new part of the repo, in which '
      + 'case add it to ALLOWED_ROOT_ENTRIES in scripts/check-tree-shape.mjs.',
    );
    process.exit(1);
  }
}
