// The release notes gate: a version is published with text a person can read, or not at all.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { bridgeReleasePage, problemsWith, sectionOf } from '../scripts/release-notes.mjs';

const CHANGELOG = `# Changelog

## 0.2.0 - 2026-01-02

Second.

## 0.1.0 - 2026-01-01

First.
`;

test('a version section is read without its heading, and stops at the next one', () => {
  assert.equal(sectionOf(CHANGELOG, '0.2.0'), 'Second.');
  assert.equal(sectionOf(CHANGELOG, '0.1.0'), 'First.');
  assert.equal(sectionOf(CHANGELOG, '0.3.0'), null);
  assert.equal(sectionOf(CHANGELOG, '0.1'), null, 'a version is matched whole, never as a prefix');
});

test('a missing section, a stub and a generated list are all refused, each for its own reason', () => {
  assert.match(problemsWith(null, '9.9.9')[0], /no "## 9\.9\.9" section/);
  assert.match(problemsWith('Bug fixes.', '1.0.0')[0], /2 word\(s\)/);

  // The text GitHub generated for 0.3.4, in miniature.
  const generated = `## What's Changed
* Add a quiz show set in three new style families by @someone in https://github.com/NoaCG/NoaCG-Studio/pull/326
* Keep the CLI's own screenshots out of the package it validates by @someone in https://github.com/NoaCG/NoaCG-Studio/pull/338
**Full Changelog**: https://github.com/NoaCG/NoaCG-Studio/compare/cli-v0.3.3...cli-v0.3.4`;
  const problems = problemsWith(generated, '0.3.4').join('\n');
  assert.match(problems, /@username/);
  assert.match(problems, /pull requests/);
  assert.match(problems, /generated changelog/);
});

test('the package name is not a username, and prose about a change passes', () => {
  const prose = 'Fixed: validate could show old screenshots while reporting success. A screenshots folder inside a package is now marked and never packaged. Update with npm i -g @noacg/cli, or do nothing if you run it through npx.';
  assert.deepEqual(problemsWith(prose, '0.3.4'), []);
});

test('the version this package is at has notes fit to publish', () => {
  const version = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8')).version;
  const changelog = readFileSync(fileURLToPath(new URL('../CHANGELOG.md', import.meta.url)), 'utf8');
  assert.deepEqual(problemsWith(sectionOf(changelog, version), version), []);
});

test('a missing Bridge section names the Bridge changelog, so a refusal says where to write', () => {
  assert.match(problemsWith(null, '9.9.9', 'cli/BRIDGE_CHANGELOG.md')[0], /cli\/BRIDGE_CHANGELOG\.md has no "## 9\.9\.9" section/);
});

test("the Bridge's Release page is the template with the version's changes in it, and nothing else", () => {
  const template = 'What it is.\n\n## What changed\n\n{{changes}}\n\n## Install\n\nDownload it.\n';
  assert.equal(bridgeReleasePage(template, 'First release.'), 'What it is.\n\n## What changed\n\nFirst release.\n\n## Install\n\nDownload it.');
  // The real template has the one placeholder the script fills, and says nothing about the CLI
  // package the Bridge is built from: a playout operator downloads a program, not a package.
  const real = readFileSync(fileURLToPath(new URL('../BRIDGE_RELEASE.md', import.meta.url)), 'utf8');
  assert.equal(real.split('{{changes}}').length, 2);
  assert.doesNotMatch(real, /npx|noacg bridge|built from/);
});
