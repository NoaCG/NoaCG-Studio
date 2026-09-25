// What the merge driver does with a conflicted generated contract, and what it refuses to guess.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  DRIVER_COMMAND, DRIVER_NAME, SKIP_INSTALL_ENV, install, isInstalled, registeredCommand,
} from './contracts-merge-driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRIVER = path.join(ROOT, 'scripts', 'contracts-merge-driver.mjs');

// The path inside the registered command, unquoted. Every registration test is really a test of
// this one string, because it is what git resolves.
const REGISTERED_PATH = DRIVER_COMMAND.split('"')[1];

// Both streams: the driver reports a target it cannot produce on stderr, and that report is the
// whole behaviour under test - a merge that carries on quietly is the failure it exists to avoid.
const run = (args, cwd = ROOT, env = process.env) => {
  const result = spawnSync(process.execPath, [DRIVER, ...args], { cwd, env, encoding: 'utf8', windowsHide: true });
  return { status: result.status, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};

// A disposable repository with an identity of its own, so nothing here depends on - or disturbs -
// the developer's git config. Returns its path; the caller removes it.
function scratchRepo(prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  const g = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  g('init', '-q', '-b', 'main');
  g('config', 'user.email', 'contracts-driver-test@example.invalid');
  g('config', 'user.name', 'contracts driver test');
  return dir;
}

test('installing registers a command with the four placeholders git passes, and is idempotent', () => {
  // Use a disposable repository. The checkout running the suite may deliberately expose its Git
  // metadata read-only, and a test of the installer must not mutate the developer's real config.
  const dir = scratchRepo('merge-driver-install-');
  try {
    assert.equal(install(dir), true);
    assert.equal(registeredCommand(dir), DRIVER_COMMAND);
    assert.match(DRIVER_COMMAND, /contracts-merge-driver\.mjs" %O %A %B %P$/);
    assert.equal(isInstalled(dir), true);
    assert.equal(install(dir), true, 'registering twice is a no-op, so every compile can do it');
    assert.equal(run(['--install'], ROOT, { ...process.env, GIT_DIR: path.join(dir, '.git') }).status, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('called with nothing useful it refuses rather than writing a file it guessed at', () => {
  const bad = run([]);
  assert.equal(bad.status, 2);
  assert.match(bad.out, /expects git's %O %A %B %P/);
});

// This one runs the real driver, which spawns the real compiler. It leaves the developer's config
// alone because the driver tells that child not to register - see SKIP_INSTALL_ENV and the test of
// both its arms further down.
test('a conflicted generated contract is replaced by what the store currently renders', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'merge-driver-'));
  const ours = path.join(dir, 'ours.md');
  writeFileSync(ours, '<<<<<<< HEAD\nboth sides of a file neither side is right about\n>>>>>>> theirs\n', 'utf8');
  // The target is a real generated file in this checkout, which is what the driver regenerates.
  const result = run([path.join(dir, 'base.md'), ours, path.join(dir, 'theirs.md'), 'AGENTS.md']);
  assert.equal(result.status, 0);
  const written = readFileSync(ours, 'utf8');
  // The driver's own words go into the message: it keeps git's file whenever the compile fails,
  // and on 2026-09-10 this assertion failed on CI saying only "the conflict is gone", with the
  // reason the compile died thrown away.
  assert.ok(!written.includes('<<<<<<<'), `the conflict is gone - the driver said: ${result.out || '(nothing)'}`);
  assert.equal(written, readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8'));
  rmSync(dir, { recursive: true, force: true });
});

test('a target the merged store no longer produces leaves the file to git and says so', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'merge-driver-'));
  const ours = path.join(dir, 'ours.md');
  writeFileSync(ours, 'whatever git wrote', 'utf8');
  const result = run([path.join(dir, 'base.md'), ours, path.join(dir, 'theirs.md'), '.claude/rules/no-such-group.md']);
  assert.equal(result.status, 0, 'a merge never stops dead on a generated file');
  assert.match(result.out, /no longer produces/);
  assert.equal(readFileSync(ours, 'utf8'), 'whatever git wrote');
  rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------------
// The registration itself. On 2026-09-16 this clone's `merge.noacg-contracts.driver` named a
// worktree that had been deleted, so every merge of a file `.gitattributes` hands to this driver
// had been running nothing - for as long as that worktree had been gone, with nothing said. The
// tests below pin both halves of the repair: the command cannot go stale, and a stale one is
// rewritten rather than left standing.
// ---------------------------------------------------------------------------------------------

// Windows hands back short names and mixed case for a temp directory, so compare resolved paths.
const samePath = (a, b) => {
  const norm = (p) => {
    const real = path.resolve(p);
    return process.platform === 'win32' ? real.toLowerCase() : real;
  };
  return norm(a) === norm(b);
};

// A stand-in for this script, committed into a scratch repository at the same relative path. The
// subject of these tests is the REGISTRATION - whether git finds and runs the relatively named
// command from every worktree and every subdirectory - so the stub records where git ran it and
// resolves the file, and nothing depends on the contract compiler being runnable there.
const STUB = [
  "import { writeFileSync } from 'node:fs';",
  'const [, ours, , target] = process.argv.slice(2);',
  'writeFileSync(ours, `resolved by the driver\\ncwd=${process.cwd()}\\ntarget=${target}\\n`);',
  '',
].join('\n');

// A repository whose `rules.md` is handed to the driver, with two branches that rewrite the same
// line of it - the case plain git cannot settle, so a clean merge proves the driver ran.
function repoWithDriverAttribute(prefix) {
  const dir = scratchRepo(prefix);
  const g = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  mkdirSync(path.join(dir, 'scripts'), { recursive: true });
  mkdirSync(path.join(dir, 'sub'), { recursive: true });
  writeFileSync(path.join(dir, 'scripts', 'contracts-merge-driver.mjs'), STUB, 'utf8');
  writeFileSync(path.join(dir, '.gitattributes'), 'rules.md merge=noacg-contracts\n', 'utf8');
  writeFileSync(path.join(dir, 'sub', 'anything.txt'), 'a place to run git from\n', 'utf8');
  writeFileSync(path.join(dir, 'rules.md'), 'rule one\nrule two\nrule three\n', 'utf8');
  g('add', '-A');
  g('commit', '-qm', 'base');
  const base = g('rev-parse', 'HEAD').trim();
  g('checkout', '-q', '-B', 'theirs', base);
  writeFileSync(path.join(dir, 'rules.md'), 'rule one\nTHEIR RULE TWO\nrule three\n', 'utf8');
  g('commit', '-qam', 'theirs rewrites rule two');
  g('checkout', '-q', '-B', 'ours', base);
  writeFileSync(path.join(dir, 'rules.md'), 'rule one\nOUR RULE TWO\nrule three\n', 'utf8');
  g('commit', '-qam', 'ours rewrites rule two');
  return dir;
}

const mergeTheirs = (cwd) => {
  const result = spawnSync('git', ['merge', '--no-edit', 'theirs'], { cwd, encoding: 'utf8', windowsHide: true });
  return { status: result.status, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};

test('the registered path is relative, and names a file that is actually there', () => {
  assert.ok(
    !path.isAbsolute(REGISTERED_PATH),
    'git runs a merge driver from the worktree top, so only a relative path is right in every ' +
      'worktree of a clone at once - an absolute one is right until its worktree is deleted',
  );
  // The loud half: rename or move this script without updating DRIVER_COMMAND and this fails here,
  // rather than in somebody's merge weeks later, which is exactly how the last one went unnoticed.
  assert.ok(
    existsSync(path.join(ROOT, REGISTERED_PATH)),
    `the registered command names ${REGISTERED_PATH}, which does not exist under ${ROOT}`,
  );
  assert.ok(samePath(path.join(ROOT, REGISTERED_PATH), DRIVER), 'and it is this script');
});

test('a stale command left by an older version is rewritten, not left standing', () => {
  const dir = scratchRepo('merge-driver-stale-');
  try {
    // Verbatim what this clone carried on 2026-09-16, pointing into a worktree long since deleted.
    const stale =
      'node "C:\\claude\\NoaCG-Studio\\.claude\\worktrees\\agent-ae47713a44213dee3\\scripts\\contracts-merge-driver.mjs" %O %A %B %P';
    execFileSync('git', ['config', `merge.${DRIVER_NAME}.driver`, stale], { cwd: dir, encoding: 'utf8' });
    assert.equal(registeredCommand(dir), stale);
    assert.equal(
      isInstalled(dir),
      false,
      'the key is present and the driver is dead - reading presence alone is what hid this',
    );
    assert.equal(install(dir), true);
    assert.equal(registeredCommand(dir), DRIVER_COMMAND);
    assert.equal(isInstalled(dir), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a key that has somehow collected two values is replaced, not refused', () => {
  const dir = scratchRepo('merge-driver-doubled-');
  try {
    // `git config <key> <value>` exits 5 on a multi-valued key - "cannot overwrite multiple values
    // with a single value" - and leaves both in place. `--get` answers with the LAST of them, and
    // so does git when it runs the driver, so a doubled key is a stale command nothing reports.
    const g = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
    g('config', '--add', `merge.${DRIVER_NAME}.driver`, 'node "gone-one.mjs" %O %A %B %P');
    g('config', '--add', `merge.${DRIVER_NAME}.driver`, 'node "gone-two.mjs" %O %A %B %P');
    assert.equal(install(dir), true);
    assert.equal(
      g('config', '--get-all', `merge.${DRIVER_NAME}.driver`).trim(),
      DRIVER_COMMAND,
      'one value, and it is ours',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the compiler registers on a normal run, and not when the driver is the one running it', () => {
  // The compiler registers the driver every time it writes. That is right when a person runs it,
  // and wrong inside a merge: git is mid-operation and every worktree of the clone shares the one
  // `.git/config` this would write. Both arms run here, so a flag that stopped working could not
  // pass as "nothing was written".
  const compile = (dir, extraEnv) =>
    spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'compile-contracts.mjs')], {
      cwd: ROOT,
      encoding: 'utf8',
      windowsHide: true,
      // GIT_DIR sends the registration into a disposable repository. The compile itself is
      // unaffected: it reads the store off disk, and its one git call only asks which files are
      // tracked, which stands down when it cannot tell.
      env: { ...process.env, GIT_DIR: path.join(dir, '.git'), ...extraEnv },
    });

  const normal = scratchRepo('merge-driver-installs-');
  const driven = scratchRepo('merge-driver-noinstall-');
  try {
    const a = compile(normal, {});
    assert.equal(a.status, 0, a.stderr);
    assert.equal(registeredCommand(normal), DRIVER_COMMAND, 'an ordinary compile registers');

    const b = compile(driven, { [SKIP_INSTALL_ENV]: '1' });
    assert.equal(b.status, 0, b.stderr);
    assert.equal(registeredCommand(driven), null, "the driver's own child writes nothing");
  } finally {
    rmSync(normal, { recursive: true, force: true });
    rmSync(driven, { recursive: true, force: true });
  }
});

test('git runs the relative command from the worktree top, including a merge started deeper in', () => {
  const dir = repoWithDriverAttribute('merge-driver-relative-');
  try {
    assert.equal(install(dir), true);

    const top = mergeTheirs(dir);
    assert.equal(top.status, 0, `the driver settled the merge - git said: ${top.out}`);
    const fromTop = readFileSync(path.join(dir, 'rules.md'), 'utf8');
    assert.match(fromTop, /^resolved by the driver$/m);
    assert.match(fromTop, /^target=rules\.md$/m, 'git passes %P as the path in the tree');
    assert.ok(
      samePath(/^cwd=(.*)$/m.exec(fromTop)[1], dir),
      'git runs the driver from the top of the working tree it is merging into',
    );

    execFileSync('git', ['reset', '-q', '--hard', 'ours'], { cwd: dir, encoding: 'utf8' });

    // The same merge started from a subdirectory. A relative command would be worthless if git
    // resolved it against the caller's directory, so this is the measurement the design rests on.
    const deeper = mergeTheirs(path.join(dir, 'sub'));
    assert.equal(deeper.status, 0, `started from sub/, the driver still ran - git said: ${deeper.out}`);
    const fromSub = readFileSync(path.join(dir, 'rules.md'), 'utf8');
    assert.match(fromSub, /^resolved by the driver$/m);
    assert.ok(
      samePath(/^cwd=(.*)$/m.exec(fromSub)[1], dir),
      'still the worktree top, not sub/ - which is why one relative command serves the whole clone',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a second worktree of the same clone runs its OWN copy of the driver', () => {
  const dir = repoWithDriverAttribute('merge-driver-worktree-');
  const second = path.join(tmpdir(), `merge-driver-wt-${process.pid}-${Date.now()}`);
  try {
    // One `git config` for the clone, and every worktree it makes is covered. This is the case
    // the absolute path got wrong: it registered ONE worktree and outlived it.
    assert.equal(install(dir), true);
    execFileSync('git', ['worktree', 'add', '-q', '-b', 'ours-again', second, 'ours'], {
      cwd: dir,
      encoding: 'utf8',
    });
    const result = mergeTheirs(second);
    assert.equal(result.status, 0, `the driver ran in a worktree that never registered - git said: ${result.out}`);
    const written = readFileSync(path.join(second, 'rules.md'), 'utf8');
    assert.match(written, /^resolved by the driver$/m);
    assert.ok(
      samePath(/^cwd=(.*)$/m.exec(written)[1], second),
      'and it ran the copy in THAT worktree, so it regenerates the tree being merged',
    );
  } finally {
    rmSync(second, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a command git cannot run leaves ours unmarked - the failure the relative form prevents', () => {
  const dir = repoWithDriverAttribute('merge-driver-dead-');
  try {
    const dead = `node "${path.join(dir, 'gone', 'contracts-merge-driver.mjs')}" %O %A %B %P`;
    execFileSync('git', ['config', `merge.${DRIVER_NAME}.driver`, dead], { cwd: dir, encoding: 'utf8' });
    const result = mergeTheirs(dir);
    assert.equal(result.status, 1, 'git does stop the merge');
    assert.match(
      execFileSync('git', ['status', '--short', 'rules.md'], { cwd: dir, encoding: 'utf8' }),
      /^UU /,
      'and it does mark the file unmerged',
    );
    // What it does NOT do is put anything in the file. Ours stands, with no marker in it, so the
    // one artefact a person inspects says the merge went fine. Stage that and the merge commit
    // records ours alone, after which `git merge` answers "Already up to date" for good.
    const written = readFileSync(path.join(dir, 'rules.md'), 'utf8');
    assert.ok(!written.includes('<<<<<<<'), 'no conflict markers are written');
    assert.ok(!written.includes('THEIR RULE TWO'), 'and their side is nowhere in it');
    assert.match(written, /OUR RULE TWO/, 'the file is ours, verbatim');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
