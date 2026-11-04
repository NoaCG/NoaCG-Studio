// guards: companion-module/package.json, companion-module/CHANGELOG.md, companion-module/companion/manifest.json, .github/workflows/release-companion.yml
//
// Landing a new module version with its notes publishes it (release-companion.yml), and the
// module's release must never become the repository's `releases/latest`, which is the Bridge's.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { decideRelease, notesProblems, packageProblems, releasePage, TAG_PREFIX } from './companion-release.mjs';

const repoFile = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const run = (over) => ({ event: 'push', ref: 'refs/heads/main', version: '1.2.3', released: false, onMain: true, ...over });
const PROSE = 'The keys now show what is on air, and a press that was refused flashes amber so the operator sees it at once. Nothing to change in your setup, just import the new file.';

test('a push to main releases a version the Releases page does not have, and passes over one it has', () => {
  assert.deepEqual(
    [decideRelease(run()).release, decideRelease(run()).dryRun],
    [true, false],
  );
  const again = decideRelease(run({ released: true }));
  assert.equal(again.release, false);
  assert.equal(again.refusal, undefined, 'an unrelated change to the notes stays green');
});

test('a pull request and a default manual run rehearse, and never publish', () => {
  for (const over of [
    { event: 'pull_request', ref: 'refs/pull/1/merge', onMain: false },
    { event: 'pull_request', ref: 'refs/pull/1/merge', released: true },
    { event: 'workflow_dispatch', ref: 'refs/heads/some-branch', onMain: false },
    { event: 'workflow_dispatch', ref: 'refs/heads/main', released: true },
  ]) {
    assert.deepEqual([decideRelease(run(over)).release, decideRelease(run(over)).dryRun], [true, true], JSON.stringify(over));
  }
});

test('an event or a branch nobody thought of releases nothing', () => {
  for (const over of [{ event: 'schedule' }, { ref: 'refs/heads/other' }, { ref: 'refs/tags/bridge-v1.2.3' }]) {
    const decision = decideRelease(run(over));
    assert.deepEqual([decision.release, decision.dryRun], [false, true], JSON.stringify(over));
  }
});

test('a run that asks to publish is refused off main, on a taken version, and on a tag naming another version', () => {
  const dispatch = { event: 'workflow_dispatch', dispatchDryRun: false };
  const tag = { ref: `refs/tags/${TAG_PREFIX}1.2.3` };
  assert.equal(decideRelease(run(dispatch)).dryRun, false, 'a real manual run on main');
  assert.equal(decideRelease(run(tag)).dryRun, false, 'a re-drive by tag');
  for (const [over, why] of [
    [{ ...dispatch, onMain: false }, /not on main/],
    [{ ...dispatch, released: true }, /already on the Releases page/],
    [{ ...tag, onMain: false }, /not on main/],
    [{ ...tag, released: true }, /already on the Releases page/],
    [{ ref: `refs/tags/${TAG_PREFIX}9.9.9` }, /another version/],
  ]) {
    const decision = decideRelease(run(over));
    assert.match(decision.refusal ?? '', why, JSON.stringify(over));
    assert.equal(decision.release, false);
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
