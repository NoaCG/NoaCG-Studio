// guards: companion-module/package.json, companion-module/CHANGELOG.md, companion-module/companion/manifest.json, .github/workflows/release-companion.yml
//
// A run of release-companion.yml publishes only when asked to, from main, and the module's release
// must never become the repository's `releases/latest`, which is the Bridge's.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { decideRelease, notesProblems, packageProblems, releasePage } from './companion-release.mjs';

const repoFile = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const run = (over) => ({ version: '1.2.3', released: false, onMain: true, dispatchDryRun: false, ...over });
const PROSE = 'The keys now show what is on air, and a press that was refused flashes amber so the operator sees it at once. Nothing to change in your setup, just import the new file.';

test('a run asked to publish releases a version the Releases page does not have', () => {
  for (const unreleased of [undefined, null, '']) {
    const decision = decideRelease(run({ unreleased }));
    assert.equal(decision.dryRun, false);
    assert.equal(decision.refusal, undefined);
  }
});

test('a dry run rehearses from anywhere, and is what a run does unless asked otherwise', () => {
  for (const over of [{ dispatchDryRun: true }, { dispatchDryRun: undefined }, { dispatchDryRun: true, onMain: false }, { dispatchDryRun: true, released: true }, { dispatchDryRun: true, unreleased: 'Not ready.' }]) {
    const decision = decideRelease(run(over));
    assert.equal(decision.dryRun, true, JSON.stringify(over));
    assert.equal(decision.refusal, undefined, JSON.stringify(over));
  }
});

test('a run asked to publish is refused off main and on a version already released', () => {
  for (const [over, why] of [
    [{ onMain: false }, /not on main/],
    [{ released: true }, /already on the Releases page/],
    [{ unreleased: 'A change not ready yet.' }, /notes under ## Unreleased/],
  ]) {
    const decision = decideRelease(run(over));
    assert.match(decision.refusal ?? '', why, JSON.stringify(over));
    assert.equal(decision.dryRun, true);
  }
});

test('the notes and the version move together, and an Unreleased section is not a version', () => {
  const withUnreleased = `# Changelog\n\n## Unreleased\n\nNot ready yet.\n\n## 1.2.3 - 2026-11-04\n\n${PROSE}\n`;
  assert.deepEqual(notesProblems(withUnreleased, '1.2.3'), []);
  assert.match(notesProblems(withUnreleased, '1.3.0').join(), /no "## 1\.3\.0" section/);
  const ahead = `## 1.3.0\n\n${PROSE}\n\n## 1.2.3\n\n${PROSE}\n`;
  assert.match(notesProblems(ahead, '1.2.3').join(), /newest section .* is 1\.3\.0/);
  assert.match(notesProblems(`## 1.2.3\n\nFixes.\n`, '1.2.3').join(), /1 word/);
});

test('the module on this tree can be released: its version is the newest section of its notes', () => {
  const { version } = JSON.parse(repoFile('companion-module/package.json'));
  assert.deepEqual(notesProblems(repoFile('companion-module/CHANGELOG.md'), version), []);
});

test('the Release page carries the changes and how to install', () => {
  const page = releasePage(PROSE);
  assert.ok(page.includes(PROSE));
  assert.ok(page.includes('Import module package'));
  assert.ok(page.includes('https://noacg.studio/downloads#companion-setup'));
});

function unpacked({ version = '1.2.3', manifest = {}, omit = [] } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'companion-package-'));
  const root = path.join(dir, 'noacg-studio');
  mkdirSync(path.join(root, 'companion'), { recursive: true });
  const files = {
    'main.js': 'export {}',
    LICENSE: 'MIT',
    'package.json': JSON.stringify({ name: 'noacg-studio', version }),
    'companion/HELP.md': 'help',
    'companion/manifest.json': JSON.stringify({
      id: 'noacg-studio',
      version,
      runtime: { apiVersion: '2.0.4', entrypoint: '../main.js' },
      ...manifest,
    }),
  };
  for (const [file, text] of Object.entries(files)) {
    if (!omit.includes(file)) writeFileSync(path.join(root, file), text);
  }
  return dir;
}

test('a package in the shape companion-module-build writes passes', (t) => {
  const dir = unpacked();
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(packageProblems(dir, '1.2.3'), []);
});

test('a package whose manifest kept the source placeholders, or that lacks a file, is refused', (t) => {
  const cases = [
    [{ manifest: { version: '0.0.0' } }, /manifest says version 0\.0\.0/],
    [{ manifest: { runtime: { apiVersion: '0.0.0', entrypoint: '../main.js' } } }, /placeholder 0\.0\.0/],
    [{ manifest: { runtime: { apiVersion: '2.0.4', entrypoint: '../dist/main.js' } } }, /entrypoint/],
    [{ omit: ['main.js'] }, /no noacg-studio\/main\.js/],
    [{ omit: ['companion/HELP.md'] }, /HELP\.md/],
  ];
  for (const [over, why] of cases) {
    const dir = unpacked(over);
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    assert.match(packageProblems(dir, '1.2.3').join(), why);
  }
});

test('the source manifest keeps its placeholder: the package tool fills in the version', () => {
  assert.equal(JSON.parse(repoFile('companion-module/companion/manifest.json')).version, '0.0.0');
});

test('the module release never takes latest, and the workflow never holds a write token while it builds', () => {
  const workflow = repoFile('.github/workflows/release-companion.yml');
  assert.match(workflow, /gh release create[\s\S]*--latest=false/);
  assert.ok(!/--latest(?!=false)\b/.test(workflow.replace(/^\s*#.*$/gm, '')), 'no bare --latest');
  const jobs = workflow.slice(workflow.indexOf('\njobs:'));
  const packageJob = jobs.slice(jobs.indexOf('\n  package:'), jobs.indexOf('\n  publish:'));
  assert.ok(packageJob.length > 0 && !packageJob.includes('contents: write'));
  assert.match(jobs.slice(jobs.indexOf('\n  publish:')), /contents: write/);
  assert.match(jobs.slice(jobs.indexOf('\n  publish:')), /needs\.decide\.outputs\.dry_run == 'false'/);
});
