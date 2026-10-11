// What the package.json merge driver unions, what it refuses to guess, and that it still
// reproduces every resolution a person actually made.
//
// The corpus half is the one that matters. `scripts/fixtures/package-merge-corpus.json` holds the
// base, ours, theirs and COMMITTED RESULT of all thirteen package.json resolutions in the 45 days
// to 2026-09-16, recorded straight out of git by `node scripts/package-merge-driver.mjs --record`.
// A driver that reproduces thirteen real human resolutions byte for byte is making the same calls
// a person made; one that quietly resolved a real disagreement would not.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DRIVER_COMMAND, DRIVER_NAME, install, isInstalled, loadCorpus, mergePackageText, namedInAttributes, registeredCommand, replayCorpus } from './package-merge-driver.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DRIVER = path.join(ROOT, 'scripts', 'package-merge-driver.mjs');

const text = (value) => `${JSON.stringify(value, null, 2)}\n`;

/** A small package.json to edit from, in the shape of the real one. */
const BASE = {
  name: 'noacg-studio',
  version: '1.0.0',
  scripts: { build: 'node a.mjs && node b.mjs', lint: 'eslint .', 'test:jobs': 'node --test one.test.mjs two.test.mjs' },
  dependencies: { ai: '^5.0.0' },
  devDependencies: { eslint: '^9.0.0' },
  files: ['dist'],
};

/** `edit` applied to a copy of BASE, as the text git would hand the driver. */
const side = (edit) => {
  const copy = JSON.parse(JSON.stringify(BASE));
  edit(copy);
  return text(copy);
};

const merge = (ours, theirs, base = text(BASE)) => mergePackageText(base, ours, theirs);

// Both streams: a conflict the driver refuses to guess at is reported, and the report is half the
// behaviour - a merge that carries on quietly is the outcome this file exists to rule out.
const run = (args, cwd = ROOT, env = process.env) => {
  const result = spawnSync(process.execPath, [DRIVER, ...args], { cwd, env, encoding: 'utf8', windowsHide: true });
  return { status: result.status, out: `${result.stdout ?? ''}${result.stderr ?? ''}` };
};

test('every resolution a person made in the measured window comes back byte for byte', () => {
  const corpus = loadCorpus();
  // A corpus that emptied itself would let every assertion below pass over nothing.
  assert.ok(corpus.cases.length >= 13, `the corpus holds ${corpus.cases.length} resolutions, and the window measured 13`);
  const { cases, failures } = replayCorpus(corpus);
  assert.deepEqual(failures, [], `the driver no longer reproduces ${failures.length} of ${cases} recorded resolutions`);
});

test('each side adding its own script keeps both, and the file is still what npm writes', () => {
  const { text: merged, conflicts } = merge(
    side((p) => { p.scripts['check:ours'] = 'node ours.mjs'; }),
    side((p) => { p.scripts['check:theirs'] = 'node theirs.mjs'; }),
  );
  assert.deepEqual(conflicts, []);
  const parsed = JSON.parse(merged);
  assert.equal(parsed.scripts['check:ours'], 'node ours.mjs');
  assert.equal(parsed.scripts['check:theirs'], 'node theirs.mjs');
  // npm's own formatting, or the next landing carries a whole-file reformat as its diff.
  assert.equal(merged, text(parsed));
});

test('each side appending a step to the same build chain keeps both steps, in place', () => {
  const { text: merged, conflicts } = merge(
    side((p) => { p.scripts.build = 'node a.mjs && node ours.mjs && node b.mjs'; }),
    side((p) => { p.scripts.build = 'node a.mjs && node b.mjs && node theirs.mjs'; }),
  );
  assert.deepEqual(conflicts, []);
  assert.equal(JSON.parse(merged).scripts.build, 'node a.mjs && node ours.mjs && node b.mjs && node theirs.mjs');
});

test('each side appending to the same list at the same point keeps both, ours first', () => {
  // The real shape of merge e330131d: one branch added two test files to the end of a `node --test`
  // list while main added a third. diff3 calls that a conflict; nothing is actually in dispute.
  const { text: merged, conflicts } = merge(
    side((p) => { p.scripts['test:jobs'] = 'node --test one.test.mjs two.test.mjs ours.test.mjs'; }),
    side((p) => { p.scripts['test:jobs'] = 'node --test one.test.mjs two.test.mjs theirs.test.mjs'; }),
  );
  assert.deepEqual(conflicts, []);
  assert.equal(JSON.parse(merged).scripts['test:jobs'], 'node --test one.test.mjs two.test.mjs ours.test.mjs theirs.test.mjs');
});

test('each side adding to the same array keeps both entries', () => {
  const { text: merged, conflicts } = merge(
    side((p) => { p.files.push('cli'); }),
    side((p) => { p.files.push('docs'); }),
  );
  assert.deepEqual(conflicts, []);
  assert.deepEqual(JSON.parse(merged).files, ['dist', 'cli', 'docs']);
});

test('a dependency the two sides bumped to different versions conflicts, and says which key', () => {
  const { text: merged, conflicts } = merge(
    side((p) => { p.dependencies.ai = '^5.1.0'; }),
    side((p) => { p.dependencies.ai = '^5.2.0'; }),
  );
  assert.deepEqual(conflicts, ['dependencies.ai']);
  assert.match(merged, /<<<<<<< ours/);
  assert.match(merged, /"ai": "\^5\.1\.0"[\s\S]*\|\|\|\|\|\|\| base[\s\S]*"ai": "\^5\.0\.0"[\s\S]*=======[\s\S]*"ai": "\^5\.2\.0"/);
});

test('a dependency BOTH sides added, at different ranges, conflicts rather than unioning the text', () => {
  // With no base text every token on both sides reads as an insertion, so the insertion rule would
  // cheerfully produce "^3.0.0 ^4.0.0". This is the silent corruption the driver must not have.
  const { text: merged, conflicts } = merge(
    side((p) => { p.dependencies.zod = '^3.0.0'; }),
    side((p) => { p.dependencies.zod = '^4.0.0'; }),
  );
  assert.deepEqual(conflicts, ['dependencies.zod']);
  assert.ok(!merged.includes('^3.0.0 ^4.0.0'), 'two version ranges were spliced into one string');
});

test('a script body the two sides rewrote differently conflicts', () => {
  const { conflicts } = merge(
    side((p) => { p.scripts.lint = 'eslint . --max-warnings 0'; }),
    side((p) => { p.scripts.lint = 'biome check .'; }),
  );
  assert.deepEqual(conflicts, ['scripts.lint']);
});

test('a key one side deleted and the other side changed conflicts rather than vanishing', () => {
  // Key ORDER is merged by the same diff3, and reading that merge as the key SET made this delete
  // resolve itself silently in the direction that loses the other side's edit.
  const { text: merged, conflicts } = merge(
    side((p) => { delete p.scripts.lint; }),
    side((p) => { p.scripts.lint = 'eslint . --fix'; }),
  );
  assert.deepEqual(conflicts, ['scripts.lint']);
  assert.match(merged, /<<<<<<< ours\n\|\|\|\|\|\|\| base/, 'the side that deleted the key shows an empty section');
});

test('a key one side deleted and the other side left alone is deleted', () => {
  const { text: merged, conflicts } = merge(
    side((p) => { delete p.scripts.lint; }),
    side((p) => { p.scripts['check:theirs'] = 'node theirs.mjs'; }),
  );
  assert.deepEqual(conflicts, []);
  assert.deepEqual(Object.keys(JSON.parse(merged).scripts), ['build', 'test:jobs', 'check:theirs']);
});

test('a value whose type the two sides changed differently conflicts', () => {
  const { conflicts } = merge(
    side((p) => { p.files = 'dist'; }),
    side((p) => { p.files = ['dist', 'docs']; }),
  );
  assert.deepEqual(conflicts, ['files']);
});

test('nothing but ours changing means the merge is ours, and the reverse', () => {
  const ours = side((p) => { p.scripts['check:ours'] = 'node ours.mjs'; });
  assert.equal(merge(ours, text(BASE)).text, ours);
  assert.equal(merge(text(BASE), ours).text, ours);
});

test('a CRLF working copy comes back CRLF, because that is what the checkout had', () => {
  const ours = side((p) => { p.scripts['check:ours'] = 'node ours.mjs'; }).replaceAll('\n', '\r\n');
  const { text: merged } = merge(ours, side((p) => { p.scripts['check:theirs'] = 'node theirs.mjs'; }));
  assert.ok(merged.includes('\r\n'), 'the driver dropped the checkout line endings');
  assert.equal(merged.replaceAll('\r\n', '\n'), text(JSON.parse(merged)));
});

test('a dependency whose base value is blank conflicts, because blank is not a base', () => {
  // `base !== ''` was not enough: a single space has no tokens either, so both sides read as pure
  // insertions and the two ranges were spliced into "^5.1.0^5.2.0" with no conflict at all.
  const blank = text({ ...BASE, dependencies: { ai: ' ' } });
  const { text: merged, conflicts } = merge(
    text({ ...BASE, dependencies: { ai: '^5.1.0' } }),
    text({ ...BASE, dependencies: { ai: '^5.2.0' } }),
    blank,
  );
  assert.deepEqual(conflicts, ['dependencies.ai']);
  assert.ok(!merged.includes('^5.1.0^5.2.0'), 'two version ranges were spliced into one string');
});

test('a conflict on the LAST key of an object still parses once the person picks a side', () => {
  // The deleting side shows an empty section, so taking it means deleting lines - and the comma
  // that separated the key before it has to go with them, or the finished file no longer parses.
  const base = text({ name: 'demo', scripts: { build: 'node b.mjs', lint: 'eslint .' } });
  const { text: merged, conflicts } = merge(
    text({ name: 'demo', scripts: { build: 'node b.mjs' } }),
    text({ name: 'demo', scripts: { build: 'node b.mjs', lint: 'eslint . --fix' } }),
    base,
  );
  assert.deepEqual(conflicts, ['scripts.lint']);
  // Resolve it the way a person does: keep one side's lines and delete the markers and the rest.
  const lines = merged.split('\n');
  const marker = (name) => lines.indexOf(name);
  const resolve = (from, to) => [...lines.slice(0, marker('<<<<<<< ours')), ...lines.slice(from + 1, to), ...lines.slice(marker('>>>>>>> theirs') + 1)].join('\n');
  const ours = resolve(marker('<<<<<<< ours'), marker('||||||| base'));
  const theirs = resolve(marker('======='), marker('>>>>>>> theirs'));
  assert.deepEqual(JSON.parse(ours), { name: 'demo', scripts: { build: 'node b.mjs' } }, 'taking ours, which deletes the key');
  assert.deepEqual(JSON.parse(theirs), { name: 'demo', scripts: { build: 'node b.mjs', lint: 'eslint . --fix' } }, 'taking theirs');
});

test('installing registers a worktree-independent command, and corrects a stale one', () => {
  // A disposable repository: the checkout running the suite may expose its git metadata read-only,
  // and a test of the installer must not rewrite the developer's real config.
  const dir = mkdtempSync(path.join(tmpdir(), 'package-merge-install-'));
  try {
    execFileSync('git', ['init'], { cwd: dir, encoding: 'utf8', windowsHide: true });
    const configured = () => execFileSync('git', ['config', '--get', `merge.${DRIVER_NAME}.driver`], { cwd: dir, encoding: 'utf8', windowsHide: true }).trim();
    assert.equal(install(dir), true);
    assert.equal(configured(), DRIVER_COMMAND);
    assert.match(configured(), /package-merge-driver\.mjs" %O %A %B %P$/);
    // Worktrees share one config, and this repository makes and deletes one per session, so an
    // absolute path would go stale - and a driver git cannot run leaves OUR version in place with
    // no markers, which is the silent loss the whole file is built to be incapable of.
    assert.ok(!path.isAbsolute(DRIVER_COMMAND.split('"')[1]), 'the registered path is relative to the worktree git runs it in');
    assert.equal(isInstalled(dir), true);

    execFileSync('git', ['config', `merge.${DRIVER_NAME}.driver`, 'node "C:/gone/package-merge-driver.mjs" %O %A %B %P'], { cwd: dir, encoding: 'utf8', windowsHide: true });
    assert.equal(
      isInstalled(dir),
      false,
      'the key is present and the driver is dead - reading presence alone is what hid this',
    );
    assert.equal(install(dir), true, 'registering again is what corrects it, so every build can do it');
    assert.equal(configured(), DRIVER_COMMAND, 'a stale command left by an older version is rewritten');
    assert.equal(isInstalled(dir), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a key that has somehow collected two values is replaced, not refused', () => {
  // `git config <key> <value>` exits 5 on a multi-valued key - "cannot overwrite multiple values
  // with a single value" - and leaves both in place. `--get` answers with the LAST of them, and so
  // does git when it runs the driver, so a doubled key is a stale command nothing reports.
  const dir = mkdtempSync(path.join(tmpdir(), 'package-merge-doubled-'));
  try {
    const g = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', windowsHide: true });
    g('init');
    g('config', '--add', `merge.${DRIVER_NAME}.driver`, 'node "gone-one.mjs" %O %A %B %P');
    g('config', '--add', `merge.${DRIVER_NAME}.driver`, 'node "gone-two.mjs" %O %A %B %P');
    assert.equal(install(dir), true);
    assert.equal(
      g('config', '--get-all', `merge.${DRIVER_NAME}.driver`).trim(),
      DRIVER_COMMAND,
      'one value, and it is ours',
    );
    assert.equal(registeredCommand(dir), DRIVER_COMMAND);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('git merge-file still reports an error ABOVE its conflict cap, which is what the guard reads', () => {
  // The driver reads merge-file's exit status as a conflict count, and a count of 0 as a clean
  // merge. An error exits 255 with empty output, so reading it as a count turns an unwritable
  // temp directory into "merged to nothing" - empty stdout, no conflicts, `"build": ""` committed
  // in silence. The guard is `status > 127`, and this is the fact it rests on.
  const dir = mkdtempSync(path.join(tmpdir(), 'package-merge-status-'));
  try {
    const real = path.join(dir, 'real.txt');
    writeFileSync(real, 'a\n', 'utf8');
    const failed = spawnSync('git', ['merge-file', '--diff3', '-q', '-p', path.join(dir, 'no-such-file.txt'), real, real], { cwd: dir, encoding: 'utf8', windowsHide: true });
    assert.ok(failed.status > 127, `merge-file reported ${failed.status} for a missing file, which is inside the conflict-count range`);
    assert.equal(failed.stdout, '', 'and it wrote nothing, which is what made the misread look like an empty merge');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('.gitattributes hands package.json to this driver', () => {
  // Registering the driver in git config achieves nothing without this line, and the two halves
  // live in different files - so this is the assertion that catches one of them going missing.
  assert.equal(namedInAttributes(ROOT), true);
});

test('run as git runs it, it writes the merged file and exits 0', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'package-merge-'));
  try {
    const file = (name, body) => { const p = path.join(dir, name); writeFileSync(p, body, 'utf8'); return p; };
    const ours = file('ours.json', side((p) => { p.scripts['check:ours'] = 'node ours.mjs'; }));
    const result = run([file('base.json', text(BASE)), ours, file('theirs.json', side((p) => { p.scripts['check:theirs'] = 'node theirs.mjs'; })), 'package.json']);
    assert.equal(result.status, 0, result.out);
    const written = JSON.parse(readFileSync(ours, 'utf8'));
    assert.equal(written.scripts['check:ours'], 'node ours.mjs');
    assert.equal(written.scripts['check:theirs'], 'node theirs.mjs');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('run as git runs it on a real disagreement, it exits non-zero and names the key', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'package-merge-'));
  try {
    const file = (name, body) => { const p = path.join(dir, name); writeFileSync(p, body, 'utf8'); return p; };
    const ours = file('ours.json', side((p) => { p.dependencies.ai = '^5.1.0'; }));
    const result = run([file('base.json', text(BASE)), ours, file('theirs.json', side((p) => { p.dependencies.ai = '^5.2.0'; })), 'package.json']);
    assert.notEqual(result.status, 0, 'a real disagreement must stop the merge');
    assert.match(result.out, /dependencies\.ai/);
    assert.match(readFileSync(ours, 'utf8'), /<<<<<<< ours/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a side that is not parseable JSON is left to git rather than guessed at', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'package-merge-'));
  try {
    const file = (name, body) => { const p = path.join(dir, name); writeFileSync(p, body, 'utf8'); return p; };
    const ours = file('ours.json', '<<<<<<< HEAD\nsomething already went wrong upstream\n>>>>>>> theirs\n');
    const result = run([file('base.json', text(BASE)), ours, file('theirs.json', text(BASE)), 'package.json']);
    assert.notEqual(result.status, 0);
    assert.match(result.out, /could not merge package\.json as JSON/);
    assert.match(readFileSync(ours, 'utf8'), /something already went wrong upstream/, 'git\'s own file was overwritten');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('called with nothing useful it refuses rather than writing a file it guessed at', () => {
  const bad = run([]);
  assert.equal(bad.status, 2);
  assert.match(bad.out, /expects git's %O %A %B %P/);
});
