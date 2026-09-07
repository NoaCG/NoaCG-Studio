#!/usr/bin/env node
// gate: build
// guards: scripts/deploy-affecting-paths.mjs, scripts/vercel-ignore-build.mjs, package.json
//
// The list in deploy-affecting-paths.mjs decides whether production gets rebuilt. A wrong entry
// there does not fail anything: the build is skipped, every gate stays green, and production
// quietly serves an older commit. So the properties that make the list safe are asserted here
// rather than left to review - above all that the deny list is a deny list, and that anything
// unrecognised builds.
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DEPLOY_AFFECTING_SCRIPTS,
  NEVER_DEPLOYED_DIRS,
  affectsDeployment,
  anyAffectsDeployment,
  lastAffectingCommit,
  changedFiles,
} from './deploy-affecting-paths.mjs';

test('everything the bundle is built from is deploy-affecting', () => {
  for (const file of [
    'src/main.tsx',
    'src/templates/shared/base.ts',
    'api/render/start.ts',
    'public/fonts/inter.woff2',
    'packs/fight-night/template.html',
    'render-worker/bundle.mjs',
    'index.html',
    'app.html',
    'vite.config.ts',
    'tsconfig.json',
    'package.json',
    'package-lock.json',
    'vercel.json',
  ]) {
    assert.equal(affectsDeployment(file), true, `${file} must trigger a build`);
  }
});

test('documentation, contracts, tooling and tests are not', () => {
  for (const file of [
    'docs/DEPLOYMENT.md',
    'docs/GOALS.md',
    'e2e/catalog-baseline.spec.ts',
    'benchmarks/ai-compare/run.mjs',
    'contracts/rules/templates-versus/whatever.md',
    '.agent-workflows/queue-merge.md',
    '.github/workflows/ci.yml',
    '.claude/rules/everywhere.md',
    'supabase/migrations/0052_x.sql',
    'cli/scripts/build-skill.mjs',
    'LICENSE',
  ]) {
    assert.equal(affectsDeployment(file), false, `${file} must not trigger a build`);
  }
});

test('markdown never triggers a build, including the contracts inside src/', () => {
  // These are the per-area AGENTS.md/CLAUDE.md files. They sit in the most deploy-affecting
  // directory in the tree and still cannot reach the bundle, and they churn constantly.
  assert.equal(affectsDeployment('src/ai/AGENTS.md'), false);
  assert.equal(affectsDeployment('src/components/CLAUDE.md'), false);
  assert.equal(affectsDeployment('AGENTS.md'), false);
  assert.equal(affectsDeployment('README.md'), false);
  assert.equal(affectsDeployment('src/thing.MD'), false);
});

test('scripts/ is denied except the ones build:vercel runs', () => {
  assert.equal(affectsDeployment('scripts/jobs.mjs'), false);
  assert.equal(affectsDeployment('scripts/auto-merge.mjs'), false);
  assert.equal(affectsDeployment('scripts/gates.mjs'), false);
  for (const kept of DEPLOY_AFFECTING_SCRIPTS) {
    assert.equal(affectsDeployment(kept), true, `${kept} runs at deploy time and must trigger a build`);
  }
});

test('every script the buildCommand runs is named in the allow list', () => {
  // The trap this closes: adding a check to `build:vercel` without naming it here means changing
  // that check no longer triggers the build that runs it.
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const vercelJson = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  const line = `${pkg.scripts['build:vercel']} ${vercelJson.buildCommand ?? ''}`;
  const referenced = [...line.matchAll(/scripts\/[\w-]+\.mjs/g)].map((m) => m[0]);
  assert.ok(referenced.length > 0, 'expected build:vercel to name at least one script');
  for (const script of new Set(referenced)) {
    assert.equal(
      DEPLOY_AFFECTING_SCRIPTS.has(script),
      true,
      `${script} runs during the Vercel build but is missing from DEPLOY_AFFECTING_SCRIPTS`,
    );
  }
});

test('anything unrecognised builds - the list is a deny list', () => {
  assert.equal(affectsDeployment('some-new-top-level-dir/thing.ts'), true);
  assert.equal(affectsDeployment('player-host/index.html'), true);
  assert.equal(affectsDeployment('weird-file-with-no-extension'), true);
  assert.equal(affectsDeployment('re-design/mock.tsx'), true);
});

test('a directory that merely starts with a denied name still builds', () => {
  // `docs.html` is a real page in this repo, and `docs/` is denied. Prefix matching must not
  // confuse them.
  assert.equal(affectsDeployment('docs.html'), true);
  assert.equal(affectsDeployment('cli-something/file.ts'), true);
  assert.equal(affectsDeployment('e2e-helpers/file.ts'), true);
});

test('paths are normalised before matching', () => {
  assert.equal(affectsDeployment('docs\\DEPLOYMENT.md'), false, 'backslashes (Windows) must match');
  assert.equal(affectsDeployment('./docs/DEPLOYMENT.md'), false, 'a leading ./ must match');
  assert.equal(affectsDeployment('  src/main.tsx  '), true, 'surrounding whitespace must not matter');
});

test('every denied directory entry ends in a slash', () => {
  // Without the slash the entry becomes a prefix match against sibling names.
  for (const dir of NEVER_DEPLOYED_DIRS) {
    assert.ok(dir.endsWith('/'), `${dir} must end in "/" or it matches sibling paths too`);
  }
});

test('a rename out of the bundle is seen, not hidden behind the destination', () => {
  // git's rename detection prints ONLY the destination for `--name-only`, so moving a component
  // into docs/ or cli/ would report one denied path while genuinely removing code from the bundle.
  // changedFiles passes --no-renames for exactly this; assert against a real repository rather
  // than trusting the flag.
  const repo = mkdtempSync(join(tmpdir(), 'noacg-rename-'));
  try {
    const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
    git('init', '-q', '.');
    git('config', 'user.email', 'gate@noacg.studio');
    git('config', 'user.name', 'gate');
    mkdirSync(join(repo, 'src'));
    mkdirSync(join(repo, 'docs'));
    writeFileSync(join(repo, 'src/Panel.tsx'), 'export const Panel = () => null;\n');
    writeFileSync(join(repo, 'docs/keep.md'), 'keep\n');
    git('add', '-A');
    git('commit', '-qm', 'one');
    git('mv', 'src/Panel.tsx', 'docs/Panel.md');
    git('commit', '-qm', 'move a component out of the bundle');

    const files = changedFiles('HEAD~1', 'HEAD', repo);
    assert.ok(files.includes('src/Panel.tsx'), `the deleted source must be listed, got ${JSON.stringify(files)}`);
    assert.equal(anyAffectsDeployment(files), true, 'removing a component from the bundle must build');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('lastAffectingCommit walks back over a run of docs-only landings', () => {
  // What the drift alarm asks. Production is expected to serve the newest commit that was BUILT,
  // so a run of documentation landings on top of a src change must resolve to the src change and
  // not to the tip - otherwise every deliberate skip reads as a failed deployment.
  const repo = mkdtempSync(join(tmpdir(), 'noacg-drift-'));
  try {
    const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
    const sha = (rev) => execFileSync('git', ['rev-parse', rev], { cwd: repo, encoding: 'utf8' }).trim();
    git('init', '-q', '.');
    git('config', 'user.email', 'gate@noacg.studio');
    git('config', 'user.name', 'gate');
    mkdirSync(join(repo, 'src'));
    mkdirSync(join(repo, 'docs'));
    writeFileSync(join(repo, 'src/app.ts'), 'export const v = 1;\n');
    git('add', '-A');
    git('commit', '-qm', 'ship the app');
    const deployed = sha('HEAD');

    for (const n of [1, 2, 3]) {
      writeFileSync(join(repo, `docs/note-${n}.md`), `note ${n}\n`);
      git('add', '-A');
      git('commit', '-qm', `write note ${n}`);
    }
    assert.notEqual(sha('HEAD'), deployed, 'the tip must have moved past the deployed commit');
    assert.equal(lastAffectingCommit('HEAD', repo), deployed, 'must walk back to the src commit');

    // And once real code lands again, the tip is what production owes.
    writeFileSync(join(repo, 'src/app.ts'), 'export const v = 2;\n');
    git('add', '-A');
    git('commit', '-qm', 'change the app');
    assert.equal(lastAffectingCommit('HEAD', repo), sha('HEAD'));
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('lastAffectingCommit returns null when nothing in reach was ever deployable', () => {
  const repo = mkdtempSync(join(tmpdir(), 'noacg-drift-none-'));
  try {
    const git = (...args) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
    git('init', '-q', '.');
    git('config', 'user.email', 'gate@noacg.studio');
    git('config', 'user.name', 'gate');
    writeFileSync(join(repo, 'README.md'), 'hello\n');
    git('add', '-A');
    git('commit', '-qm', 'docs only');
    // The drift check must treat this as "nothing to compare", never as drift.
    assert.equal(lastAffectingCommit('HEAD', repo), null);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('a mixed changeset builds, and an all-denied one does not', () => {
  assert.equal(anyAffectsDeployment(['docs/A.md', 'src/main.tsx']), true);
  assert.equal(anyAffectsDeployment(['docs/A.md', 'e2e/b.spec.ts', 'AGENTS.md']), false);
  assert.equal(anyAffectsDeployment([]), false);
});
