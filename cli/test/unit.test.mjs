// The CLI's own logic, with no network, no browser and no NoaCG deployment - so unlike
// smoke.test.mjs this file really runs in CI, on every change, and is where a regression in the
// parts an agent depends on gets caught.
//
// What is covered here is chosen by where a fault would be INVISIBLE until it hurt someone:
//
//   - the flag grammar (output.ts). Every command reads its arguments through it, and it is the
//     documented contract in `noacg --help`. A `--no-bench` that stopped meaning `bench: false`
//     would silently start benching in save; nothing else would notice.
//   - the workspace <-> zip boundary (workspace.ts). This is the module that has actually been
//     wrong twice: a PowerShell-authored zip carrying backslash separators, and a regenerate that
//     left a second manifest behind. It is also where a hostile package is refused - `unzipTo`
//     writes attacker-named paths to disk, which is the one genuinely dangerous thing the CLI does.
//   - the credential store (auth.ts). The only secret the CLI holds, and its precedence rule
//     (NOACG_AGENT_KEY beats the file) is what CI setups depend on.
//   - the field-list grammar (scaffold.ts), the one place a typo becomes a graphic.
//   - the process contract: exit codes and the JSON-on-stdout rule an agent parses.
//
// Run `npm run build` first - these import the built `dist/`.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import JSZip from 'jszip';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { flagBool, flagList, flagNumber, flagString, parseArgs, table, UsageError } from '../dist/output.js';
import { isGeneratedFile, packageEntries, readPackageInput, removeStaleGenerated, unzipTo, zipDirectory } from '../dist/workspace.js';
import { AGENT_KEY_PREFIX, credentialsPath, displayPrefix, forgetKey, isAgentKey, resolveKey, storeKey } from '../dist/auth.js';
import { cliVersion, noacgUrl } from '../dist/config.js';
import { parseFieldList } from '../dist/commands/scaffold.js';

const exec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '..', 'dist', 'index.js');

async function tmpdir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'noacg-unit-'));
}

/** Run the built CLI. Never inherits the developer's key or deployment. */
async function run(args, env = {}) {
  const clean = { ...process.env, NOACG_URL: 'http://127.0.0.1:1', ...env };
  if (!env.NOACG_AGENT_KEY) delete clean.NOACG_AGENT_KEY;
  try {
    const { stdout, stderr } = await exec(process.execPath, [cli, ...args], { env: clean, maxBuffer: 16 * 1024 * 1024 });
    return { code: 0, stdout, stderr };
  } catch (e) {
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

// ---------------------------------------------------------------- the flag grammar

test('parseArgs reads the documented forms', () => {
  const a = parseArgs(['validate', './pkg', '--screenshots', './shots', '--out=x.png', '--json', '--no-bench']);
  assert.deepEqual(a._, ['validate', './pkg']);
  assert.equal(a.flags.screenshots, './shots');
  assert.equal(a.flags.out, 'x.png');
  assert.equal(a.flags.json, true);
  assert.equal(a.flags.bench, false, '--no-bench must land as bench:false, not a "bench" string');
});

test('parseArgs collects a repeated key into an array', () => {
  const a = parseArgs(['pack', 'a', 'b', '--layer', '20', '--layer', '21', '--out', 'p.json']);
  assert.deepEqual(a._, ['pack', 'a', 'b']);
  assert.deepEqual(a.flags.layer, ['20', '21']);
  assert.deepEqual(flagList(a, 'layer'), ['20', '21']);
});

test('parseArgs: a lone flag before another flag is true, and `--` ends flag parsing', () => {
  const a = parseArgs(['screenshot', 'pkg', '--json', '--out', 'x.png', '--', '--not-a-flag']);
  assert.equal(a.flags.json, true);
  assert.equal(a.flags.out, 'x.png');
  assert.deepEqual(a._, ['screenshot', 'pkg', '--not-a-flag']);
});

test('parseArgs: an `=` value keeps everything after the first `=`', () => {
  // `--set` values are user data: "Home=FC Bar=None" must survive intact.
  const a = parseArgs(['scaffold', '--set=Home=FC Bar=None']);
  assert.equal(a.flags.set, 'Home=FC Bar=None');
});

test('parseArgs: an empty `=` value is an empty string, not true', () => {
  // `--name=` means "no name", and the difference matters: `true` would be stringified into one.
  const a = parseArgs(['scaffold', '--name=']);
  assert.equal(a.flags.name, '');
  assert.equal(flagString(parseArgs(['scaffold', '--name=']), 'name'), '');
});

test('flag readers: the last value wins, booleans have a fallback, numbers are checked', () => {
  const a = parseArgs(['x', '--name', 'first', '--name', 'second', '--fps', '50', '--flagged']);
  assert.equal(flagString(a, 'name'), 'second');
  assert.equal(flagString(a, 'missing'), undefined);
  assert.equal(flagString(a, 'flagged'), undefined, 'a boolean flag is not a string value');
  assert.equal(flagNumber(a, 'fps'), 50);
  assert.equal(flagNumber(a, 'missing'), undefined);
  assert.equal(flagBool(a, 'missing', true), true);
  assert.equal(flagBool(a, 'flagged', false), true);
  assert.equal(flagBool(parseArgs(['x', '--bench=false']), 'bench', true), false);
  assert.equal(flagBool(parseArgs(['x', '--bench=off']), 'bench', true), false);
  assert.equal(flagBool(parseArgs(['x', '--no-bench']), 'bench', true), false);
  assert.throws(() => flagNumber(parseArgs(['x', '--fps', 'fast']), 'fps'), UsageError);
});

test('table pads every column but the last', () => {
  const rendered = table([['a', 'bb', 'c'], ['aaa', 'b', 'dddd']]);
  assert.deepEqual(rendered.split('\n'), ['a    bb  c', 'aaa  b   dddd']);
});

// ---------------------------------------------------------------- the field-list grammar

test('parseFieldList reads kinds, defaults and select options', () => {
  const fields = parseFieldList('Artist:text=Anna, Song, Progress:number=42, Mood:select=calm|loud');
  assert.deepEqual(fields[0], { label: 'Artist', kind: 'text', value: 'Anna' });
  assert.deepEqual(fields[1], { label: 'Song', kind: 'text' }, 'no kind means text, no `=` means no default');
  assert.deepEqual(fields[2], { label: 'Progress', kind: 'number', value: '42' });
  assert.equal(fields[3].kind, 'select');
  assert.equal(fields[3].value, 'calm', 'the first option is the default');
  assert.deepEqual(fields[3].options, [{ label: 'calm', value: 'calm' }, { label: 'loud', value: 'loud' }]);
});

test('parseFieldList: an empty default is kept, and blank items are dropped', () => {
  assert.deepEqual(parseFieldList('Note:text='), [{ label: 'Note', kind: 'text', value: '' }]);
  assert.deepEqual(parseFieldList('A,,  ,B').map((f) => f.label), ['A', 'B']);
});

test('parseFieldList refuses an unknown kind and a select with no options', () => {
  assert.throws(() => parseFieldList('Score:tally=3'), (e) => e instanceof UsageError && /kinds are/.test(e.message));
  assert.throws(() => parseFieldList('Mood:select'), (e) => e instanceof UsageError && /needs options/.test(e.message));
});

// ---------------------------------------------------------------- the workspace <-> zip boundary

test('isGeneratedFile names the generated half, and only at the top level', () => {
  for (const generated of ['thing.ograf.json', 'graphic.mjs', 'FIELDS.md', 'README.md', 'GETTING-ON-AIR.md', 'controlpanel.html', 'thumbnail.png']) {
    assert.equal(isGeneratedFile(generated), true, generated);
  }
  for (const source of ['scoreboard.html', 'css/style.css', 'js/graphic.js', 'assets/logo.png']) {
    assert.equal(isGeneratedFile(source), false, source);
  }
  assert.equal(isGeneratedFile('nested/graphic.mjs'), false, 'a nested file is never the generated half');
});

test('zipDirectory -> packageEntries round trips under one top folder, with / separators', async () => {
  const dir = await tmpdir();
  const pkg = path.join(dir, 'my-graphic');
  await fs.mkdir(path.join(pkg, 'css'), { recursive: true });
  await fs.writeFile(path.join(pkg, 'my_graphic.html'), '<h1>hi</h1>');
  await fs.writeFile(path.join(pkg, 'css', 'style.css'), 'body{}');
  await fs.mkdir(path.join(pkg, 'node_modules'), { recursive: true });
  await fs.writeFile(path.join(pkg, 'node_modules', 'junk.js'), 'nope');

  const bytes = await zipDirectory(pkg);
  const raw = Object.keys((await JSZip.loadAsync(bytes)).files).filter((p) => !p.endsWith('/'));
  assert.ok(raw.every((p) => !p.includes('\\')), `a zip entry must never carry a backslash: ${raw.join(', ')}`);
  assert.ok(raw.every((p) => p.startsWith('my-graphic/')), `every entry sits under the top folder: ${raw.join(', ')}`);
  assert.ok(!raw.some((p) => p.includes('node_modules')), 'node_modules is never packaged');

  const entries = await packageEntries(bytes);
  assert.deepEqual([...entries.keys()].sort(), ['css/style.css', 'my_graphic.html']);
  assert.equal(Buffer.from(entries.get('css/style.css')).toString('utf8'), 'body{}');
});

test('packageEntries strips one top folder only when every entry shares it', async () => {
  const shared = new JSZip();
  shared.file('slug/a.html', 'a');
  shared.file('slug/css/b.css', 'b');
  assert.deepEqual([...(await packageEntries(await shared.generateAsync({ type: 'uint8array' }))).keys()].sort(), ['a.html', 'css/b.css']);

  // Two top folders, or a file at the root, mean there is no export wrapper to strip.
  const mixed = new JSZip();
  mixed.file('one/a.html', 'a');
  mixed.file('two/b.html', 'b');
  assert.deepEqual([...(await packageEntries(await mixed.generateAsync({ type: 'uint8array' }))).keys()].sort(), ['one/a.html', 'two/b.html']);

  const flat = new JSZip();
  flat.file('a.html', 'a');
  flat.file('css/b.css', 'b');
  assert.deepEqual([...(await packageEntries(await flat.generateAsync({ type: 'uint8array' }))).keys()].sort(), ['a.html', 'css/b.css']);
});

test('unzipTo --generatedOnly leaves every source untouched', async () => {
  const dir = await tmpdir();
  const pkg = path.join(dir, 'ws');
  await fs.mkdir(pkg, { recursive: true });
  await fs.writeFile(path.join(pkg, 'ws.html'), 'MINE - the agent designed this');
  await fs.writeFile(path.join(pkg, 'graphic.mjs'), 'old');

  const zip = new JSZip();
  zip.file('ws/ws.html', 'REGENERATED - must not land');
  zip.file('ws/graphic.mjs', 'new');
  zip.file('ws/ws.ograf.json', '{}');
  const written = await unzipTo(await zip.generateAsync({ type: 'uint8array' }), pkg, { generatedOnly: true });

  assert.deepEqual(written.sort(), ['graphic.mjs', 'ws.ograf.json']);
  assert.equal(await fs.readFile(path.join(pkg, 'ws.html'), 'utf8'), 'MINE - the agent designed this');
  assert.equal(await fs.readFile(path.join(pkg, 'graphic.mjs'), 'utf8'), 'new');
});

const BACKSLASH = String.fromCharCode(92);

/**
 * A zip carrying entry names JSZip's own API refuses to create. `zip.file('../x')` is resolved
 * away on the way in, so a traversal fixture has to be planted on the ZipObject after the fact -
 * which is exactly what a hostile zip authored by anything other than JSZip looks like on read.
 */
async function hostileZip(names) {
  const zip = new JSZip();
  zip.file('graphic.mjs', 'legitimate');
  names.forEach((name, i) => {
    const slot = `slot${i}`;
    zip.file(slot, 'pwned');
    const entry = zip.files[slot];
    delete zip.files[slot];
    entry.name = name;
    zip.files[name] = entry;
  });
  return zip.generateAsync({ type: 'uint8array' });
}

test('unzipTo refuses a zip entry that escapes the target directory', async () => {
  // A package can come from anywhere - the Import door, a colleague, a registry - so the one
  // operation here that writes attacker-named paths to disk has to refuse to leave its directory.
  //
  // Two spellings, and they are NOT defended by the same thing:
  //   `../x`  - JSZip resolves it away while reading, so it arrives already flattened to a
  //             contained path. Harmless, and asserted here so a JSZip upgrade that stopped doing
  //             it could not pass silently.
  //   `..\x`  - a zip path is `/`-separated by spec, so JSZip leaves this exactly as it found it -
  //             and then path.join on Windows reads `\` as a separator and it escapes for real.
  //             `packageEntries` normalizes the separator so both spellings meet the same check,
  //             and the check compares against `<dir><sep>` rather than `<dir>`, because
  //             `..\pkg-evil\x` resolves to a SIBLING whose name merely STARTS with the target's -
  //             which a bare startsWith accepted, until 2026-08-26.
  const dir = await tmpdir();
  const pkg = path.join(dir, 'pkg');
  const bytes = await hostileZip([
    '../../escaped.txt',
    '../pkg-evil/graphic.mjs',
    `..${BACKSLASH}..${BACKSLASH}escaped-windows.txt`,
    `..${BACKSLASH}pkg-evil${BACKSLASH}graphic.mjs`,
  ]);

  const written = await unzipTo(bytes, pkg);
  for (const rel of written) {
    const target = path.resolve(pkg, ...rel.split('/'));
    assert.ok(target.startsWith(path.resolve(pkg) + path.sep), `${rel} was written outside the package directory`);
  }
  assert.ok(!written.some((f) => /escaped-windows/.test(f)), `a \\-separated traversal must be dropped: ${written.join(', ')}`);
  assert.deepEqual((await fs.readdir(dir)).sort(), ['pkg'], 'nothing was written beside the package directory');
  assert.equal(await fs.readFile(path.join(pkg, 'graphic.mjs'), 'utf8'), 'legitimate');
});

test('packageEntries reads a Windows-authored zip the same way on every platform', async () => {
  // PowerShell's Compress-Archive writes `\` separators. Without normalizing, Linux writes one
  // file literally named `pkg\css\style.css` and the package is quietly broken.
  const zip = new JSZip();
  zip.file('slot', 'body{}');
  const entry = zip.files.slot;
  delete zip.files.slot;
  entry.name = `pkg${BACKSLASH}css${BACKSLASH}style.css`;
  zip.files[entry.name] = entry;
  zip.file('pkg/pkg.html', '<h1/>');

  const entries = await packageEntries(await zip.generateAsync({ type: 'uint8array' }));
  assert.deepEqual([...entries.keys()].sort(), ['css/style.css', 'pkg.html'], 'the top folder is stripped from both spellings');
  assert.equal(Buffer.from(entries.get('css/style.css')).toString('utf8'), 'body{}');
});

test('removeStaleGenerated drops the previous name pair, and nothing else', async () => {
  const dir = await tmpdir();
  const manifest = (html) => JSON.stringify({ v_noacg: { format: 'noacg-graphic', source: { html } } });
  await fs.writeFile(path.join(dir, 'new_name.ograf.json'), manifest('new_name.html'));
  await fs.writeFile(path.join(dir, 'new_name.html'), 'new');
  await fs.writeFile(path.join(dir, 'old_name.ograf.json'), manifest('old_name.html'));
  await fs.writeFile(path.join(dir, 'old_name.html'), 'old');
  // A third-party OGraf manifest is not ours to remove, and neither is its html.
  await fs.writeFile(path.join(dir, 'third_party.ograf.json'), JSON.stringify({ id: 'x', main: 'third_party.html' }));
  await fs.writeFile(path.join(dir, 'third_party.html'), 'theirs');
  await fs.writeFile(path.join(dir, 'broken.ograf.json'), 'not json at all');

  const removed = await removeStaleGenerated(dir, ['new_name.ograf.json', 'new_name.html', 'graphic.mjs']);
  assert.deepEqual(removed.map((r) => r.file).sort(), ['old_name.html', 'old_name.ograf.json']);
  assert.deepEqual((await fs.readdir(dir)).sort(), ['broken.ograf.json', 'new_name.html', 'new_name.ograf.json', 'third_party.html', 'third_party.ograf.json']);
});

test('removeStaleGenerated never follows a manifest to a path outside the folder', async () => {
  const dir = await tmpdir();
  const victim = path.join(dir, 'keep.html');
  await fs.writeFile(victim, 'not yours');
  await fs.mkdir(path.join(dir, 'pkg'), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'pkg', 'stale.ograf.json'),
    JSON.stringify({ v_noacg: { format: 'noacg-graphic', source: { html: '../keep.html' } } }),
  );

  const removed = await removeStaleGenerated(path.join(dir, 'pkg'), []);
  assert.deepEqual(removed.map((r) => r.file), ['stale.ograf.json'], 'the manifest itself goes');
  assert.equal(await fs.readFile(victim, 'utf8'), 'not yours', 'a path with a separator is never followed');
});

test('readPackageInput takes a directory or a .zip, and says so when it takes neither', async () => {
  const dir = await tmpdir();
  const pkg = path.join(dir, 'graphic');
  await fs.mkdir(pkg, { recursive: true });
  await fs.writeFile(path.join(pkg, 'graphic.html'), '<h1/>');
  const fromDir = await readPackageInput(pkg);
  assert.equal(fromDir.isDirectory, true);
  assert.equal(fromDir.fileName, 'graphic.zip');
  assert.deepEqual([...(await packageEntries(fromDir.bytes)).keys()], ['graphic.html']);

  const zipFile = path.join(dir, 'exported.zip');
  await fs.writeFile(zipFile, Buffer.from(fromDir.bytes));
  const fromZip = await readPackageInput(zipFile);
  assert.equal(fromZip.isDirectory, false);
  assert.equal(fromZip.fileName, 'exported.zip');

  await fs.writeFile(path.join(dir, 'notes.txt'), 'hello');
  await assert.rejects(readPackageInput(path.join(dir, 'notes.txt')), /expected a package directory or a \.zip file/);
  await assert.rejects(readPackageInput(path.join(dir, 'nope')), /no such file or directory/);
});

// ---------------------------------------------------------------- config + the credential store

test('noacgUrl defaults to the hosted studio and strips trailing slashes', () => {
  const before = process.env.NOACG_URL;
  try {
    delete process.env.NOACG_URL;
    assert.equal(noacgUrl(), 'https://noacg.studio');
    process.env.NOACG_URL = 'http://localhost:5184///';
    assert.equal(noacgUrl(), 'http://localhost:5184');
    process.env.NOACG_URL = '  https://studio.example.com/  ';
    assert.equal(noacgUrl(), 'https://studio.example.com');
    process.env.NOACG_URL = '   ';
    assert.equal(noacgUrl(), 'https://noacg.studio', 'a blank value is not a deployment');
  } finally {
    if (before === undefined) delete process.env.NOACG_URL;
    else process.env.NOACG_URL = before;
  }
});

test('cliVersion is the package version the release tags', async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(here, '..', 'package.json'), 'utf8'));
  assert.equal(cliVersion(), pkg.version);
  assert.match(cliVersion(), /^\d+\.\d+\.\d+/);
});

test('an agent key is recognised by prefix and length, and only ever shown as a prefix', () => {
  const key = `${AGENT_KEY_PREFIX}${'a'.repeat(32)}`;
  assert.equal(isAgentKey(key), true);
  assert.equal(isAgentKey(`${AGENT_KEY_PREFIX}short`), false);
  assert.equal(isAgentKey(`sk_live_${'a'.repeat(32)}`), false);
  const shown = displayPrefix(key);
  assert.equal(shown, `${AGENT_KEY_PREFIX}aaaaaa…`);
  assert.ok(shown.length < key.length, 'the display prefix is a prefix, never the key');
  assert.equal(shown.includes(key), false);
});

// configDir() is per-OS: %APPDATA% on Windows, $XDG_CONFIG_HOME on Linux, and a fixed path under
// ~/Library on macOS with no env door. CI is Linux and this project is developed on Windows, so
// the store is covered on both; macOS would need a real home directory to write into.
const noConfigDoor = process.platform === 'darwin' ? 'configDir() has no env override on darwin' : false;

test('the credential store: written per deployment, 0600 where modes exist, and forgotten on request', { skip: noConfigDoor }, async () => {
  const home = await tmpdir();
  const before = { APPDATA: process.env.APPDATA, XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME, NOACG_AGENT_KEY: process.env.NOACG_AGENT_KEY };
  try {
    process.env.APPDATA = home;
    process.env.XDG_CONFIG_HOME = home;
    delete process.env.NOACG_AGENT_KEY;

    const key = `${AGENT_KEY_PREFIX}${'b'.repeat(32)}`;
    await storeKey('https://noacg.studio', { key, prefix: displayPrefix(key), name: 'laptop', createdAt: '2026-08-26T00:00:00.000Z' });
    await storeKey('http://localhost:5184', { key: `${AGENT_KEY_PREFIX}${'c'.repeat(32)}`, prefix: 'x…', name: 'dev', createdAt: '2026-08-26T00:00:00.000Z' });

    const hosted = await resolveKey('https://noacg.studio');
    assert.equal(hosted.key, key);
    assert.equal(hosted.source, 'file');
    assert.equal(hosted.stored.name, 'laptop');
    assert.equal((await resolveKey('http://localhost:5184')).stored.name, 'dev', 'one machine holds a key per deployment');
    assert.equal(await resolveKey('https://someone-elses.example'), null);

    const file = JSON.parse(await fs.readFile(credentialsPath(), 'utf8'));
    assert.equal(file.version, 1, 'a persisted format carries a version');
    if (process.platform !== 'win32') {
      assert.equal((await fs.stat(credentialsPath())).mode & 0o777, 0o600);
      assert.equal((await fs.stat(path.dirname(credentialsPath()))).mode & 0o777, 0o700);
    }
    assert.deepEqual((await fs.readdir(path.dirname(credentialsPath()))).filter((n) => n.includes('.tmp')), [], 'no temp file is left behind');

    assert.equal(await forgetKey('https://noacg.studio'), true);
    assert.equal(await forgetKey('https://noacg.studio'), false, 'forgetting twice is not an error');
    assert.equal(await resolveKey('https://noacg.studio'), null);
    assert.ok(await resolveKey('http://localhost:5184'), 'the other deployment keeps its key');

    // The rule every CI setup depends on: the environment beats the file.
    process.env.NOACG_AGENT_KEY = `${AGENT_KEY_PREFIX}${'d'.repeat(32)}`;
    const fromEnv = await resolveKey('http://localhost:5184');
    assert.equal(fromEnv.source, 'env');
    assert.equal(fromEnv.key, process.env.NOACG_AGENT_KEY);
  } finally {
    for (const [k, v] of Object.entries(before)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

// ---------------------------------------------------------------- the process contract

test('--version prints the version, on stdout, as JSON when asked', async () => {
  const plain = await run(['--version']);
  assert.equal(plain.code, 0);
  assert.equal(plain.stdout.trim(), cliVersion());

  const json = await run(['version', '--json']);
  assert.equal(json.code, 0);
  assert.deepEqual(JSON.parse(json.stdout), { ok: true, version: cliVersion() });
});

test('no command is exit 2 with usage; `help` is exit 0; an unknown command is exit 2', async () => {
  const none = await run([]);
  assert.equal(none.code, 2, 'a bare `noacg` is a usage error, so a script notices');
  assert.match(none.stdout, /Usage: noacg <command>/);

  const help = await run(['help']);
  assert.equal(help.code, 0);
  assert.match(help.stdout, /Usage: noacg <command>/);

  const unknown = await run(['sacffold']);
  assert.equal(unknown.code, 2);
  assert.match(unknown.stdout, /Unknown command "sacffold"/);
});

test('a usage error is exit 2 and, in --json mode, one parsable object on stdout', async () => {
  // The contract an agent parses (docs/AGENT_CLI.md): in JSON mode stdout carries exactly one
  // JSON object and nothing else, however the command ended.
  const r = await run(['scaffold', '--out', path.join(await tmpdir(), 'fresh'), '--json']);
  assert.equal(r.code, 2);
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /--type|--fields/);
  assert.equal(r.stdout.trim().endsWith('}'), true, 'nothing follows the JSON object on stdout');
});

test('save with no key refuses before it starts a browser', async () => {
  // The cheapest refusal in the tool, and the one a logged-out agent meets first: it must not cost
  // a Chromium launch or a network round trip, and it must name the fix.
  const dir = await tmpdir();
  await fs.mkdir(path.join(dir, 'graphic'), { recursive: true });
  await fs.writeFile(path.join(dir, 'graphic', 'graphic.html'), '<h1/>');

  const started = Date.now();
  const r = await run(['save', path.join(dir, 'graphic'), '--json'], { NOACG_URL: 'http://127.0.0.1:1' });
  assert.equal(r.code, 1, 'a refusal is exit 1, not a usage error');
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, 'not-logged-in');
  assert.match(parsed.error, /noacg login/);
  assert.ok(Date.now() - started < 15000, 'the no-key refusal must not wait on a browser');
});

test('save needs a package argument', async () => {
  const r = await run(['save', '--json']);
  assert.equal(r.code, 2);
  assert.match(JSON.parse(r.stdout).error, /needs a package directory/);
});

test('scaffold refuses a word left outside its flags, which is always an unquoted value', async () => {
  // `--name Football scoreboard` without quotes: the shell hands the CLI a stray "scoreboard",
  // and before this refusal the graphic was silently named "Football" - in its <title>, its SPX
  // description and its file names - with nothing said. Found on the 2026-09-09 time-to-air walk.
  // It must refuse before the browser starts, so a closed port is the deployment here.
  const r = await run(['scaffold', 'scoreboard', '--type', 'scoreboard', '--name', 'Football', '--out', path.join(await tmpdir(), 'fresh'), '--json'], {
    NOACG_URL: 'http://127.0.0.1:1',
  });
  assert.equal(r.code, 2);
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /"scoreboard"/);
  assert.match(parsed.error, /needs quotes/);
});
