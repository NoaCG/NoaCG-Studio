#!/usr/bin/env node
// gate: build
// guards: .github/workflows/**, .github/actions/**
//
// Validate every GitHub Actions workflow against the Actions schema, locally, in the build gate.
//
// Why this exists: a workflow file is the one thing in this repository that ONLY GitHub could
// check. `npm run build` never looked at `.github/`, so an edit there was verified by pushing and
// watching - which works right up until it doesn't. On 2026-08-06 an Actions incident throttled
// webhook delivery to ~15%; two pushes of a `ci.yml` change produced no run at all, and there was
// no way left to find out whether the file was even well-formed.
//
// The validator is not a YAML parser with extra steps. Measured against deliberate mutations of
// our own ci.yml, it catches a misspelled key (`runs-onnn`), a wrong-typed value
// (`timeout-minutes: notanumber`), and - the one that matters most here - a `needs:` naming a job
// that does not exist. That last class is exactly what editing the CI gate's dependency set can
// introduce, and nothing else we run would see it.
//
// It is a devDependency rather than an `npx --yes` call on purpose: `npm run build` must not need
// the network. GPL-3.0-only, used as a build-time CLI and never bundled - compatible with this
// project's AGPL-3.0.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workflowDir = path.join(repoRoot, '.github', 'workflows');
const actionDir = path.join(repoRoot, '.github', 'actions');

// Run the CLI's own module with this Node, not the `node_modules/.bin` shim. On Windows that
// shim is a `.cmd`, and Node refuses to spawn a batch file without `shell: true` (EINVAL) - and
// reaching for a shell to fix that puts every path through cmd.exe quoting for no gain.
//
// RESOLVE it rather than joining `<repoRoot>/node_modules`: a linked worktree usually has an
// EMPTY local node_modules and resolves every dependency by walking up to the primary checkout's,
// so the hardcoded path made `npm run build` fail there with MODULE_NOT_FOUND on a checkout where
// nothing was actually missing - and this check is a CI gate, so the failure looked like the
// workflows being invalid. The package.json is resolved rather than the file, because a package's
// "exports" map need not expose its bin path (scripts/dev-bench.mjs hit exactly that with Vite).
const require = createRequire(import.meta.url);
let cli;
try {
  cli = path.join(path.dirname(require.resolve('@action-validator/cli/package.json')), 'cli.mjs');
} catch {
  console.error('Could not resolve @action-validator/cli. Try `npm install`.');
  process.exit(1);
}

let files;
try {
  files = readdirSync(workflowDir)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort()
    .map((name) => path.posix.join('.github/workflows', name));
} catch (error) {
  console.error(`Cannot read ${workflowDir}: ${error.message}`);
  process.exit(1);
}

// An empty workflow directory is a mistake, not a pass. Every CI answer this repo relies on -
// the per-change gate, the nightly sweep, the deployment watch - lives in these files, so a run
// that validates nothing must say so loudly rather than exit 0.
if (files.length === 0) {
  console.error(`No workflow files found in ${workflowDir} - expected at least one.`);
  process.exit(1);
}

// COMPOSITE ACTIONS COUNT TOO. `.github/actions/*/action.yml` is workflow code by another name -
// the jobs that `uses:` one cannot run without it - and it was outside this gate until a step
// shared by three jobs moved into one. An unvalidated action.yml fails the same way an
// unvalidated workflow does: not at build time, but on a push, in whichever job reached it
// first. The validator takes an action file as happily as a workflow file, so including them
// costs a directory read. Absent directory = nothing to add, which is not an error the way an
// empty workflow directory is: a repo with no composite actions is a normal repo.
try {
  const actions = readdirSync(actionDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => readdirSync(path.join(actionDir, entry.name)).includes('action.yml'))
    .map((entry) => path.posix.join('.github/actions', entry.name, 'action.yml'))
    .sort();
  files = files.concat(actions);
} catch (error) {
  if (error.code !== 'ENOENT') {
    console.error(`Cannot read ${actionDir}: ${error.message}`);
    process.exit(1);
  }
}

let failed = 0;
for (const rel of files) {
  const target = path.join(repoRoot, rel);
  const result = spawnSync(process.execPath, [cli, target], { cwd: repoRoot, encoding: 'utf8' });
  if (result.error) {
    console.error(`Could not run action-validator: ${result.error.message}`);
    console.error('Is @action-validator/cli installed? Try `npm install`.');
    process.exit(1);
  }
  if (result.status !== 0) {
    failed += 1;
    console.error(`\n${rel} is invalid:`);
    // The validator reports as JSON on stdout; print it as-is rather than reformatting, so the
    // paths and line numbers it gives are the ones a search will find.
    process.stderr.write(`${(result.stdout || result.stderr || '').trim()}\n`);
  }
}

if (failed > 0) {
  console.error(`\nWorkflow validation failed: ${failed} of ${files.length} file(s).`);
  process.exit(1);
}

console.log(`Workflows OK: ${files.length} validated (${files.map((rel) => path.posix.basename(path.posix.dirname(rel)) === 'workflows' ? path.posix.basename(rel) : rel).join(', ')}).`);
