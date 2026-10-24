import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { cleanupStaging, STAGING_RETENTION_MS } from './cleanup-staging.mjs';

const git = (path, ...args) => {
  const out = spawnSync('git', ['-C', path, ...args], { encoding: 'utf8', windowsHide: true });
  assert.equal(out.status, 0, out.stderr);
  return out.stdout.trim();
};
function fixture(t) {
  const home = mkdtempSync(join(tmpdir(), 'noacg-staging-test-'));
  const source = join(home, 'source');
  const root = join(home, 'staging');
  mkdirSync(source);
  mkdirSync(root);
  git(source, 'init', '--initial-branch=main');
  git(source, 'config', 'user.name', 'Cleanup tests');
  git(source, 'config', 'user.email', 'test@example.invalid');
  writeFileSync(join(source, 'README.md'), 'published\n');
  writeFileSync(join(source, '.gitignore'), '.env\n');
  git(source, 'add', '.');
  git(source, 'commit', '-m', 'Published marketplace');
  const head = git(source, 'rev-parse', 'HEAD');
  const f = { root, source, head, beforeRemove: null };
  t.after(async () => {
    await f.beforeRemove?.();
    rmSync(home, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  f.add = (name = 'marketplace-upgrade-ABC123') => {
    const path = join(root, name);
    git(source, 'clone', '--quiet', source, path);
    git(path, 'remote', 'set-url', 'origin', 'https://github.com/openai/marketplace-test.git');
    git(path, 'config', 'user.name', 'Cleanup tests');
    git(path, 'config', 'user.email', 'test@example.invalid');
    return path;
  };
  f.run = (options = {}) =>
    cleanupStaging({
      root,
      apply: true,
      platform: 'win32',
      now: Date.now() + STAGING_RETENTION_MS + 60_000,
      list: () => ({ ok: true, processes: [] }),
      heads: () => [head],
      ...options,
    });
  return f;
}

test('an old clean remote-backed staging clone is removed with a recovery journal', (t) => {
  const f = fixture(t);
  const path = f.add();
  const dry = f.run({ apply: false });
  assert.equal(dry.removed.length, 0);
  assert.equal(existsSync(path), true);
  assert.match(dry.kept[0].why, /dry run/);
  assert.equal(existsSync(join(f.root, 'noacg-cleanup.jsonl')), false);
  const done = f.run();
  assert.equal(done.removed.length, 1, JSON.stringify(done));
  assert.equal(existsSync(path), false);
  const journal = readFileSync(join(f.root, 'noacg-cleanup.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map(JSON.parse);
  assert.deepEqual(
    journal.map((row) => row.state),
    ['planned', 'removed'],
  );
  assert.equal(journal[0].head, f.head);
});

test('recent, dirty, ignored-secret and partial copies stay', (t) => {
  const f = fixture(t);
  const recent = f.add();
  assert.equal(f.run({ now: Date.now() }).removed.length, 0);
  writeFileSync(join(recent, 'owner-work.txt'), 'uncommitted');
  assert.equal(f.run().removed.length, 0);
  rmSync(join(recent, 'owner-work.txt'));
  writeFileSync(join(recent, '.env'), 'private fixture');
  assert.equal(f.run().removed.length, 0);
  rmSync(join(recent, '.env'));
  const partial = join(f.root, 'marketplace-upgrade-XYZ123');
  mkdirSync(partial);
  writeFileSync(join(partial, 'README.md'), 'unverified source');
  const done = f.run();
  assert.equal(done.removed.length, 1);
  assert.equal(existsSync(partial), true);
});

test('unique committed work on any ref and unavailable remote evidence keep the clone', (t) => {
  const f = fixture(t);
  const path = f.add();
  writeFileSync(join(path, 'unique.txt'), 'keep');
  git(path, 'add', '.');
  git(path, 'commit', '-m', 'Unpublished');
  const unique = git(path, 'rev-parse', 'HEAD');
  git(path, 'branch', 'owner-work', unique);
  git(path, 'checkout', '--detach', f.head);
  assert.equal(f.run().removed.length, 0, 'even a non-HEAD ref must be backed up');
  const second = f.add('marketplace-upgrade-DEF123');
  assert.equal(f.run({ heads: () => null }).removed.length, 0);
  assert.equal(existsSync(path), true);
  assert.equal(existsSync(second), true);
});

test('running references, unreadable process inventory, and concurrent sweeps retain data', (t) => {
  const f = fixture(t);
  const path = f.add();
  assert.equal(
    f.run({ list: () => ({ ok: true, processes: [{ command: `node ${path}/helper.mjs` }] }) }).removed.length,
    0,
  );
  assert.equal(f.run({ list: () => ({ ok: false }) }).removed.length, 0);
  writeFileSync(join(f.root, '.noacg-cleanup.lock'), 'other sweep');
  assert.equal(f.run().removed.length, 0);
  assert.equal(existsSync(path), true);
});

test('linked paths and unrecognized origins are never disposable', (t) => {
  const f = fixture(t);
  const path = f.add();
  git(path, 'remote', 'set-url', 'origin', 'https://example.invalid/owner/repo.git');
  assert.equal(f.run().removed.length, 0);
  git(path, 'remote', 'set-url', 'origin', 'https://github.com/openai/marketplace-test.git');
  symlinkSync(f.source, join(path, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(f.run().removed.length, 0);
  assert.equal(readFileSync(join(f.source, 'README.md'), 'utf8'), 'published\n');
});

test('Git operation locks retain staging even with a clean published HEAD', (t) => {
  const f = fixture(t);
  const path = f.add();
  writeFileSync(join(path, '.git', 'BISECT_LOG'), 'unfinished investigation');
  assert.equal(f.run().removed.length, 0);
  assert.equal(existsSync(join(path, 'README.md')), true);
});

test(
  'a staging directory held as a working directory survives on Windows',
  { skip: process.platform !== 'win32' },
  async (t) => {
    const f = fixture(t);
    const path = f.add();
    const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], {
      cwd: path,
      stdio: 'ignore',
      windowsHide: true,
    });
    await new Promise((done) => holder.once('spawn', done));
    f.beforeRemove = () =>
      new Promise((done) => {
        holder.once('exit', done);
        holder.kill();
      });
    const done = f.run();
    assert.equal(done.removed.length, 0);
    assert.equal(existsSync(join(path, 'README.md')), true);
  },
);

test('automatic removal is Windows-only and bounded to five clones', (t) => {
  const f = fixture(t);
  for (let i = 0; i < 6; i++) f.add(`marketplace-upgrade-ABCD0${i}`);
  assert.equal(f.run({ platform: 'linux' }).removed.length, 0);
  const done = f.run();
  assert.equal(done.removed.length, 5, JSON.stringify(done));
  assert.equal(existsSync(join(f.root, 'marketplace-upgrade-ABCD05')), true);
});


test('an old clone can be proven against a newer remote without changing its refs', (t) => {
  const f = fixture(t); const path = f.add(); const tip = 'a'.repeat(40);
  const calls = [];
  const done = f.run({ heads: () => [tip], contains: (origin, sha, current) => { calls.push({ sha, current }); return sha === f.head && current === tip; } });
  assert.equal(done.removed.length, 1, JSON.stringify(done));
  assert.deepEqual(calls, [{ sha: f.head, current: tip }]);
  assert.equal(existsSync(path), false);
});
