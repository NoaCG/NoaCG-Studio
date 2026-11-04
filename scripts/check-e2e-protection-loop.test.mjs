// guards: scripts/check-e2e-protection.mjs, scripts/alarm-owner.mjs, scripts/growth-ceilings.json
// The regression for #1911, end to end and black-box: removing one case from a looped test fails
// the test-removal check. It imports nothing from the checker and drives its command line in a
// throwaway git repository with a real Playwright listing, exactly as ci.yml runs it, so the same
// file run against the old line-counting checker fails (that checker exits 0 here). The cf10
// evidence (docs/work-specs/cicd-followup/evidence/phase-cf10.md) records that run and the mutations.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TODAY = '2026-11-04';

test('removing one looped case fails the check, and a current entry lets it through', { timeout: 120_000 }, (t) => {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'e2e-protection-fixture-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...a) => execFileSync('git', a, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  mkdirSync(path.join(repo, 'scripts'));
  mkdirSync(path.join(repo, 'e2e'));
  mkdirSync(path.join(repo, 'docs', 'work-specs', 'fixture'), { recursive: true });
  for (const f of ['check-e2e-protection.mjs', 'alarm-owner.mjs', 'measured.mjs', 'measured-receipt.mjs', 'growth-ceilings.json']) copyFileSync(path.join(ROOT, 'scripts', f), path.join(repo, 'scripts', f));
  symlinkSync(path.join(ROOT, 'node_modules'), path.join(repo, 'node_modules'), 'dir');
  writeFileSync(path.join(repo, '.gitignore'), 'node_modules\n');
  writeFileSync(path.join(repo, 'playwright.config.ts'), "import { defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: './e2e' });\n");
  // Long enough that git sees a move with an edit as a rename, as it does for a real spec.
  const body = Array.from({ length: 30 }, (_, i) => `test('plain ${i}', () => { expect(${i}).toBe(${i}); });`).join('\n');
  const spec = (cases) => `import { test, expect } from '@playwright/test';\n\n${body}\n\nfor (const name of ${JSON.stringify(cases)}) test(\`case \${name}\`, () => { expect(name).toBeTruthy(); });\n`;
  writeFileSync(path.join(repo, 'e2e', 'loop.spec.ts'), spec(['a', 'b', 'c']));
  writeFileSync(path.join(repo, 'docs', 'work-specs', 'fixture', 'spec.md'), '# Fixture\n');
  git('init', '-q', '-b', 'main');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'add', '-A');
  git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qm', 'base');
  const base = git('rev-parse', 'HEAD').trim();
  // One looped case goes. No line that begins `test(` changes, so a line count sees nothing.
  writeFileSync(path.join(repo, 'e2e', 'loop.spec.ts'), spec(['a', 'b']));
  const commit = (msg) => { git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-qam', msg); };
  commit('drop one looped case');
  const run = () => spawnSync(process.execPath, ['scripts/check-e2e-protection.mjs', '--changed', base, '--today', TODAY], { cwd: repo, encoding: 'utf8', env: { ...process.env, CI: '' } });

  const refused = run();
  assert.equal(refused.status, 1, `the check must fail when a looped case is removed:\n${refused.stdout}${refused.stderr}`);
  assert.match(refused.stdout, /e2e\/loop\.spec\.ts: 1 test\(s\) fewer than before \(33 -> 32, counted by playwright --list\)/);

  writeFileSync(path.join(repo, 'docs', 'work-specs', 'fixture', 'spec.md'), '# Fixture\n\n## Test maintenance\n\n- e2e/loop.spec.ts: case c is covered by scripts/x.test.mjs; receipt evidence/x.md, owner miwco, expires 2026-11-10\n');
  commit('entry');
  const allowed = run();
  assert.equal(allowed.status, 0, `a current entry covers it:\n${allowed.stdout}${allowed.stderr}`);
  assert.match(allowed.stdout, /owner miwco, expires 2026-11-10\) covers it/);

  const lapsed = spawnSync(process.execPath, ['scripts/check-e2e-protection.mjs', '--changed', base, '--today', '2026-11-11'], { cwd: repo, encoding: 'utf8', env: { ...process.env, CI: '' } });
  assert.equal(lapsed.status, 1, 'the same entry fails once it has expired');
  assert.match(lapsed.stdout, /does not count: it expired on 2026-11-10\./);

  // A spec renamed inside e2e/ is compared with its old self: moving the file and dropping a case
  // still counts, and a pure move removes nothing.
  const head = git('rev-parse', 'HEAD').trim();
  const check = (from) => spawnSync(process.execPath, ['scripts/check-e2e-protection.mjs', '--changed', from, '--today', TODAY], { cwd: repo, encoding: 'utf8', env: { ...process.env, CI: '' } });
  git('mv', 'e2e/loop.spec.ts', 'e2e/moved.spec.ts');
  commit('move');
  assert.equal(check(head).status, 0, 'a pure move removes nothing');
  writeFileSync(path.join(repo, 'e2e', 'moved.spec.ts'), spec(['a']));
  commit('move and drop a case');
  const moved = check(head);
  assert.equal(moved.status, 1, `a move that drops a case is refused:\n${moved.stdout}`);
  assert.match(moved.stdout, /e2e\/moved\.spec\.ts: 1 test\(s\) fewer than before \(32 -> 31, counted by playwright --list\)/);

  // A spec Playwright cannot load is never read as unchanged.
  const loaded = git('rev-parse', 'HEAD').trim();
  writeFileSync(path.join(repo, 'e2e', 'moved.spec.ts'), `throw new Error('broken at load');\n${spec(['a', 'b', 'c'])}`);
  commit('break it');
  const broken = check(loaded);
  assert.equal(broken.status, 1, `an unlistable spec fails the check:\n${broken.stdout}`);
  assert.match(broken.stdout, /cannot check the change against .*broken at load/);

  // Loop data in an e2e helper: the spec is untouched, one case goes from the helper.
  writeFileSync(path.join(repo, 'e2e', 'moved.spec.ts'), `import { CASES } from './_cases';\n${spec(['a'])}\nfor (const c of CASES) test(\`helper \${c}\`, () => {});\n`);
  writeFileSync(path.join(repo, 'e2e', '_cases.ts'), "export const CASES = ['x', 'y', 'z'];\n");
  git('add', '-A');
  commit('cases in a helper');
  const helperBase = git('rev-parse', 'HEAD').trim();
  writeFileSync(path.join(repo, 'e2e', '_cases.ts'), "export const CASES = ['x', 'y'];\n");
  commit('drop a helper case');
  const helper = check(helperBase);
  assert.equal(helper.status, 1, `a case removed from helper data is refused:\n${helper.stdout}`);
  assert.match(helper.stdout, /every spec is counted/);
  assert.match(helper.stdout, /e2e\/moved\.spec\.ts: 1 test\(s\) fewer than before \(34 -> 33, counted by playwright --list\)/);

  // A move into another suite takes the file out of this gate, whatever the count says.
  mkdirSync(path.join(repo, 'e2e', 'configured'));
  writeFileSync(path.join(repo, 'playwright.live.config.ts'), "import { defineConfig } from '@playwright/test';\nexport default defineConfig({ testDir: './e2e/configured' });\n");
  git('add', '-A');
  commit('live config');
  const liveBase = git('rev-parse', 'HEAD').trim();
  git('mv', 'e2e/moved.spec.ts', 'e2e/configured/moved.spec.ts');
  writeFileSync(path.join(repo, 'e2e', 'configured', 'moved.spec.ts'), `${spec(['a'])}\nfor (const c of ['x', 'y']) test(\`helper \${c}\`, () => {});\n`);
  commit('move to the configured suite');
  const suite = check(liveBase);
  assert.equal(suite.status, 1, `a move into another suite is refused:\n${suite.stdout}`);
  assert.match(suite.stdout, /the spec moves from e2e\/moved\.spec\.ts under playwright\.config\.ts to playwright\.live\.config\.ts, a different suite/);

  // The owner is read at the merge base: a change that renames the owner and writes an entry
  // under the new name in one go is still refused.
  const ownerBase = git('rev-parse', 'HEAD').trim();
  const ceilings = path.join(repo, 'scripts', 'growth-ceilings.json');
  writeFileSync(ceilings, readFileSync(ceilings, 'utf8').replace('"ownerLogin": "miwco"', '"ownerLogin": "claude"'));
  writeFileSync(path.join(repo, 'e2e', 'configured', 'moved.spec.ts'), `${spec(['a'])}\nfor (const c of ['x']) test(\`helper \${c}\`, () => {});\n`);
  writeFileSync(path.join(repo, 'docs', 'work-specs', 'fixture', 'spec.md'), '# Fixture\n\n## Test maintenance\n\n- e2e/configured/moved.spec.ts: case y is covered elsewhere, owner claude, expires 2026-11-10\n');
  commit('rename the owner and use it');
  const renamedOwner = check(ownerBase);
  assert.equal(renamedOwner.status, 1, `an owner renamed in the same change does not count:\n${renamedOwner.stdout}`);
  assert.match(renamedOwner.stdout, /its owner "claude" is not the accountable owner \(miwco/);

  // A base the check cannot diff fails the check instead of passing it.
  const missing = check('1234567890abcdef1234567890abcdef12345678');
  assert.equal(missing.status, 1, `an undiffable base fails:\n${missing.stdout}`);
  assert.match(missing.stdout, /cannot check the change against 1234567890abcdef/);
  assert.match(git('worktree', 'list'), /^[^\n]*\n?$/, 'each base worktree is removed afterwards');
});
