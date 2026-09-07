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
import { readFileSync } from 'node:fs';

import {
  DEPLOY_AFFECTING_SCRIPTS,
  NEVER_DEPLOYED_DIRS,
  affectsDeployment,
  anyAffectsDeployment,
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

test('a mixed changeset builds, and an all-denied one does not', () => {
  assert.equal(anyAffectsDeployment(['docs/A.md', 'src/main.tsx']), true);
  assert.equal(anyAffectsDeployment(['docs/A.md', 'e2e/b.spec.ts', 'AGENTS.md']), false);
  assert.equal(anyAffectsDeployment([]), false);
});
