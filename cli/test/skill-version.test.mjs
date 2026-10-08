// Does the door notice it is serving last month's instructions?
//
// A Claude Code or Codex marketplace never updates itself, so a plugin installed once keeps the
// skill text it was installed with - on this laptop, for nineteen days, with nothing on screen
// saying so (https://github.com/NoaCG/NoaCG-Studio/blob/745c6f2dcd9ce5e82cc6655c652e08f0568800fd/docs/backlog/nothing-tells-a-user-their-installed-noacg-plugin-is-stale.md). The row
// `noacg doctor` prints about it is only worth anything if it is never WRONG, so what is covered
// here is mostly the refusals: an unreadable install, a version that could only be guessed, and a
// plugin with two versions cached all have to end in silence rather than a confident number.
//
// Everything runs against fake config directories, so the test says the same thing on a machine
// with the plugin installed, without it, or with a stale copy - and it never reads the real
// ~/.claude. `doctor` is spawned with a browser path that cannot exist and a planted registry
// cache, which keeps it offline and fast: the two version rows print before either matters.
//
// Run `npm run build` first - this drives the built `dist/`.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { installedSkills } from '../dist/skillVersion.js';
import { isBehind } from '../dist/npmLatest.mjs';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

/** A scratch config directory, removed when the test that asked for it ends. */
async function tempDir(t, name) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `noacg-${name}-`));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}

/** A plugin as a harness caches it: `plugins/cache/<marketplace>/<plugin>/<version>/`. */
async function plantPlugin(home, { marketplace = 'noacg-studio', name = 'noacg', dir, manifest, manifestVersion, skill = true } = {}) {
  const root = path.join(home, 'plugins', 'cache', marketplace, name, dir);
  if (skill) {
    await fs.mkdir(path.join(root, 'skills', 'noacg-graphic'), { recursive: true });
    await fs.writeFile(path.join(root, 'skills', 'noacg-graphic', 'SKILL.md'), '# skill\n');
  }
  if (manifest) {
    await fs.mkdir(path.join(root, manifest), { recursive: true });
    await fs.writeFile(path.join(root, manifest, 'plugin.json'), JSON.stringify({ name, version: manifestVersion }));
  }
  return root;
}

/** The harness's own install record, which names the ACTIVE install path. */
async function plantIndex(home, plugins) {
  await fs.mkdir(path.join(home, 'plugins'), { recursive: true });
  await fs.writeFile(path.join(home, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins }));
}

/** `installedSkills()` reads the environment, so every case runs with both homes pinned. */
async function withHomes(claudeHome, codexHome, fn) {
  const before = { c: process.env.CLAUDE_CONFIG_DIR, x: process.env.CODEX_HOME };
  process.env.CLAUDE_CONFIG_DIR = claudeHome;
  process.env.CODEX_HOME = codexHome;
  try {
    return await fn();
  } finally {
    if (before.c === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = before.c;
    if (before.x === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = before.x;
  }
}

test('no plugin installed is silence, not an error', async (t) => {
  const empty = await tempDir(t, 'empty');
  const skills = await withHomes(path.join(empty, 'claude'), path.join(empty, 'codex'), installedSkills);
  assert.deepEqual(skills, [], 'a terminal user who never installed a plugin has nothing to report');
});

test('the version comes from the manifest beside the skill, never from the directory name', async (t) => {
  // The two disagree on purpose: a cache directory is named by whoever wrote it, and the whole
  // point of this command is that it states a measured version rather than a plausible one.
  const home = await tempDir(t, 'claude');
  const root = await plantPlugin(home, { dir: '9.9.9', manifest: '.claude-plugin', manifestVersion: '0.2.0' });
  await plantIndex(home, { 'noacg@noacg-studio': [{ scope: 'user', installPath: root, version: '9.9.9' }] });

  const [skill, ...rest] = await withHomes(home, path.join(home, 'no-codex'), installedSkills);
  assert.equal(rest.length, 0);
  assert.equal(skill.version, '0.2.0');
  assert.equal(skill.harness, 'Claude Code');
  assert.equal(skill.plugin, 'noacg@noacg-studio');
  assert.equal(skill.update, 'claude plugin marketplace update noacg-studio && claude plugin update noacg@noacg-studio');
});

test('a skill folder with no manifest beside it is reported as nothing', async (t) => {
  // How a Codex user without `codex plugin` installs it: copy skills/noacg-graphic/ by hand
  // (cli/README.md). There is no version anywhere in those files, so there is nothing to say.
  const home = await tempDir(t, 'manifestless');
  await plantPlugin(home, { dir: '0.3.3' });
  const skills = await withHomes(home, path.join(home, 'no-codex'), installedSkills);
  assert.deepEqual(skills, []);
});

test('a plugin with two versions cached and no install record is ambiguous, so silent', async (t) => {
  const home = await tempDir(t, 'codex');
  await plantPlugin(home, { dir: '0.2.0', manifest: '.codex-plugin', manifestVersion: '0.2.0' });
  const skills = await withHomes(path.join(home, 'no-claude'), home, installedSkills);
  assert.equal(skills.length, 1, 'one cached version is unambiguous - that one is the install');
  assert.equal(skills[0].harness, 'Codex');
  assert.equal(skills[0].update, 'codex plugin marketplace upgrade noacg-studio && codex plugin add noacg@noacg-studio');

  await plantPlugin(home, { dir: '0.3.3', manifest: '.codex-plugin', manifestVersion: '0.3.3' });
  const both = await withHomes(path.join(home, 'no-claude'), home, installedSkills);
  assert.deepEqual(both, [], 'with two cached versions, which one a session loaded is a guess');
});

test('isBehind orders releases and refuses everything it cannot order', () => {
  assert.equal(isBehind('0.2.0', '0.3.3'), true);
  assert.equal(isBehind('0.3.3', '0.3.3'), false);
  assert.equal(isBehind('0.3.4', '0.3.3'), false, 'a checkout built ahead of the release is not stale');
  assert.equal(isBehind('0.9.0', '1.0.0'), true);
  assert.equal(isBehind('0.10.0', '0.9.0'), false, 'numeric, not lexical');
  assert.equal(isBehind('0.3.3-rc.1', '0.3.3'), false, 'a prerelease of the same triple is not behind it');
  for (const bad of [null, undefined, '', 'latest', 'v0.3.3', '0.3']) {
    assert.equal(isBehind(bad, '0.3.3'), false, `"${bad}" is unknown, and unknown is not behind`);
    assert.equal(isBehind('0.3.3', bad), false, `"${bad}" is unknown, and nothing is behind unknown`);
  }
});

test('doctor names the stale install and the command that fixes it', async (t) => {
  const home = await tempDir(t, 'doctor');
  const root = await plantPlugin(home, { dir: '0.2.0', manifest: '.claude-plugin', manifestVersion: '0.2.0' });
  await plantIndex(home, { 'noacg@noacg-studio': [{ scope: 'user', installPath: root }] });
  // A planted registry cache keeps the run offline; `latest` equal to whatever this CLI is means
  // the second row - the CLI's own staleness - stays silent and cannot be confused with the first.
  const cache = path.join(home, 'latest.json');
  const { version } = JSON.parse(await fs.readFile(path.join(DIST, '..', 'package.json'), 'utf8'));
  await fs.writeFile(cache, JSON.stringify({ latest: version, checkedAt: Date.now() }));

  const run = (env) => new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(DIST, 'index.js'), 'doctor'], {
      env: {
        ...process.env,
        CLAUDE_CONFIG_DIR: home,
        CODEX_HOME: path.join(home, 'no-codex'),
        NOACG_CLI_LATEST_CACHE_FILE: cache,
        // A browser that cannot exist: doctor reports it as missing and never opens one, so this
        // test costs no browser launch and no network.
        NOACG_BROWSER: path.join(home, 'no-such-browser'),
        ...env,
      },
    });
    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.resume();
    child.on('close', (code) => resolve({ stdout, code }));
  });

  const stale = await run({});
  assert.match(stale.stdout, /skill {8}0\.2\.0 in Claude Code, but this CLI ships /);
  assert.match(stale.stdout, /run: claude plugin marketplace update noacg-studio && claude plugin update noacg@noacg-studio/);
  assert.doesNotMatch(stale.stdout, /^update /m, 'the CLI matches the planted latest, so it says nothing about itself');

  // The same run with the version the CLI ships: no row at all.
  await fs.writeFile(path.join(root, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'noacg', version }));
  const current = await run({});
  assert.doesNotMatch(current.stdout, /^skill /m, 'matching versions print nothing');
  assert.equal(current.code, stale.code, 'a version row never changes the exit code');

  // The ordinary machine: the CLI and the plugin were installed on the same day and are equally
  // old. Measured against the CLI alone they agree and nothing is said, and the user would hear
  // about the skill only on the doctor run AFTER the one that told them to update the CLI.
  await fs.writeFile(cache, JSON.stringify({ latest: '9.9.9', checkedAt: Date.now() }));
  const bothOld = await run({});
  assert.match(bothOld.stdout, new RegExp(`^skill {8}${version.replace(/\./g, '\\.')} in Claude Code, but npm's latest is 9\\.9\\.9`, 'm'));
  assert.match(bothOld.stdout, /^update {7}npm's latest @noacg\/cli is 9\.9\.9 - run: npm i -g @noacg\/cli@latest$/m);
});
