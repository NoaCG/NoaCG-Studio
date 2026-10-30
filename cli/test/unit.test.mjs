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
import { execFile, spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import JSZip from 'jszip';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

import { readDoc, skillDir } from '../dist/commands/docs.js';
import { flagBool, flagList, flagNumber, flagString, parseArgs, table, UsageError } from '../dist/output.js';
import { FRAMES_MARKER, isGeneratedFile, markFramesDir, packageEntries, readPackageInput, removeStaleGenerated, unzipTo, zipDirectory } from '../dist/workspace.js';
import { AGENT_KEY_PREFIX, credentialsPath, displayPrefix, forgetKey, isAgentKey, resolveKey, storeKey } from '../dist/auth.js';
import { bridgeVersion, cliVersion, configDir, credentialsDir, noacgUrl } from '../dist/config.js';
import { parseFieldList } from '../dist/commands/scaffold.js';
import { openUrl, openUrlCommand } from '../dist/openUrl.js';

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

test('frames the CLI wrote inside a package, and the last thumbnail, are never read back in as the graphic', async () => {
  const dir = await tmpdir();
  const pkg = path.join(dir, 'my-graphic');
  await fs.mkdir(path.join(pkg, 'images'), { recursive: true });
  await fs.writeFile(path.join(pkg, 'my_graphic.html'), '<h1>hi</h1>');
  await fs.writeFile(path.join(pkg, 'images', 'logo.png'), 'a real asset');
  await fs.writeFile(path.join(pkg, 'thumbnail.png'), 'the frame of an earlier validate');

  // `--screenshots ./shots` from inside the package: marked, so the frames stay out of the zip.
  assert.equal(await markFramesDir(path.join(pkg, 'shots'), pkg), true);
  await fs.writeFile(path.join(pkg, 'shots', 'onair.png'), 'an old frame');
  // Outside the package, and the package folder itself, are left alone.
  assert.equal(await markFramesDir(path.join(dir, 'elsewhere'), pkg), false);
  assert.equal(await markFramesDir(pkg, pkg), false);
  await assert.rejects(fs.stat(path.join(pkg, FRAMES_MARKER)), 'the package folder is never marked, or nothing would be packaged');

  const entries = await packageEntries(await zipDirectory(pkg));
  assert.deepEqual([...entries.keys()].sort(), ['images/logo.png', 'my_graphic.html']);
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

test("bridgeVersion is the Bridge's own line, and the exe's baked version wins", async () => {
  const pkg = JSON.parse(await fs.readFile(path.join(here, '..', 'package.json'), 'utf8'));
  const before = process.env.NOACG_BRIDGE_VERSION;
  try {
    delete process.env.NOACG_BRIDGE_VERSION;
    assert.equal(bridgeVersion(), pkg.bridgeVersion);
    process.env.NOACG_BRIDGE_VERSION = '7.8.9';
    assert.equal(bridgeVersion(), '7.8.9');
    assert.equal(cliVersion(), pkg.version, "the Bridge's version never becomes the CLI's");
  } finally {
    if (before === undefined) delete process.env.NOACG_BRIDGE_VERSION;
    else process.env.NOACG_BRIDGE_VERSION = before;
  }
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

/** Run `fn` with these environment variables (undefined = unset), then put every one back. */
async function withEnv(vars, fn) {
  const before = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  const apply = (values) => {
    for (const [k, v] of Object.entries(values)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  apply(vars);
  try {
    return await fn();
  } finally {
    apply(before);
  }
}

// The key file lives in the per-OS config directory unless NOACG_CREDENTIALS_DIR names another,
// and that override is also how these tests keep away from the developer's real key.
test('with no override the key store is exactly the per-user config directory it always was', async () => {
  const base = path.resolve('/fixed-config-home');
  await withEnv({ NOACG_CREDENTIALS_DIR: undefined, APPDATA: base, XDG_CONFIG_HOME: base }, async () => {
    const perOs = process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support', 'noacg') : path.join(base, 'noacg');
    assert.equal(configDir(), perOs);
    assert.equal(credentialsDir(), perOs);
    assert.equal(credentialsPath(), path.join(perOs, 'credentials.json'));
  });
  await withEnv({ NOACG_CREDENTIALS_DIR: '  ' }, async () => {
    assert.equal(credentialsDir(), configDir(), 'a blank override is no override');
  });
});

test('two key stores on one account: logging out in one leaves the other signed in', async () => {
  const [a, b] = [await tmpdir(), await tmpdir()];
  const origin = 'http://127.0.0.1:1'; // what run() points the CLI at; neither command calls it
  const keyA = `${AGENT_KEY_PREFIX}${'a'.repeat(32)}`;
  const keyB = `${AGENT_KEY_PREFIX}${'e'.repeat(32)}`;
  for (const [dir, key] of [[a, keyA], [b, keyB]]) {
    const r = await run(['login', '--key', key, '--json'], { NOACG_CREDENTIALS_DIR: dir });
    assert.equal(r.code, 0, r.stderr);
  }
  const out = await run(['logout', '--local', '--json'], { NOACG_CREDENTIALS_DIR: b });
  assert.equal(out.code, 0, out.stderr);
  assert.equal(JSON.parse(out.stdout).forgotten, true);

  const held = (dir) => withEnv({ NOACG_CREDENTIALS_DIR: dir, NOACG_AGENT_KEY: undefined }, () => resolveKey(origin));
  assert.equal(await held(b), null, 'the store that logged out holds nothing');
  assert.equal((await held(a))?.key, keyA, "the sibling's key is untouched");
});

test('the credential store: written per deployment, 0600 where modes exist, and forgotten on request', async () => {
  const home = await tmpdir();
  await withEnv({ NOACG_CREDENTIALS_DIR: home, NOACG_AGENT_KEY: undefined }, async () => {
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
  });
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

test('a word left outside a command\'s flags is refused, on scaffold and on save', async () => {
  // `--name Football scoreboard` without quotes: the shell hands the CLI a stray "scoreboard",
  // and before this refusal the graphic was silently named "Football" - in its <title>, its SPX
  // description and its file names - with nothing said. Found on the 2026-09-09 time-to-air walk.
  // Both verbs must refuse before the browser starts, so a closed port is the deployment here;
  // `save` matters most, because that name is what lands in the user's library.
  const closed = { NOACG_URL: 'http://127.0.0.1:1' };

  const scaffolded = await run(
    ['scaffold', 'scoreboard', '--type', 'scoreboard', '--name', 'Football', '--out', path.join(await tmpdir(), 'fresh'), '--json'],
    closed,
  );
  assert.equal(scaffolded.code, 2);
  const parsed = JSON.parse(scaffolded.stdout);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /"scoreboard"/);
  assert.match(parsed.error, /needs quotes/);

  const dir = await tmpdir();
  await fs.mkdir(path.join(dir, 'graphic'), { recursive: true });
  await fs.writeFile(path.join(dir, 'graphic', 'graphic.html'), '<h1/>');
  const saved = await run(['save', path.join(dir, 'graphic'), 'scoreboard', '--name', 'Football', '--json'], closed);
  assert.equal(saved.code, 2, 'a stray word is a usage error, not a refusal');
  assert.match(JSON.parse(saved.stdout).error, /"scoreboard"/);

  // The package argument itself is not a stray word: inspect gets past the grammar and fails on
  // the closed port instead, which is a different message.
  const clean = await run(['inspect', path.join(dir, 'graphic'), '--json'], closed);
  assert.doesNotMatch(JSON.parse(clean.stdout).error, /outside its flags/);
});

test('`pack --name My Pack` names the unquoted word instead of bundling it as a package', async () => {
  // `pack` takes any number of packages, so a stray word cannot be refused the way `save` and
  // `login` refuse one - "Pack" IS a package argument to the parser. Before this, the pack was
  // called "My", the browser started, and the run failed on a path the user thought was half a
  // title. Now every input is checked before the browser starts, and the refusal shows the quoting.
  const dir = await tmpdir();
  await fs.mkdir(path.join(dir, 'graphic'), { recursive: true });
  await fs.writeFile(path.join(dir, 'graphic', 'graphic.html'), '<h1/>');
  const r = await run(
    ['pack', path.join(dir, 'graphic'), '--name', 'My', 'Pack', '--out', path.join(dir, 'show.noacgpack.json'), '--json'],
    { NOACG_URL: 'http://127.0.0.1:1' },
  );
  assert.equal(r.code, 2, 'a missing package is a usage error, not a bridge failure');
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /"Pack"/);
  assert.match(parsed.error, /--name "My Pack"/, 'the refusal shows the quoting that fixes it');
});

test('pack needs somewhere to go: --save, --out, or both', async () => {
  const dir = await tmpdir();
  await fs.mkdir(path.join(dir, 'graphic'), { recursive: true });
  const neither = await run(['pack', path.join(dir, 'graphic'), '--name', 'Show', '--json']);
  assert.equal(neither.code, 2);
  assert.match(JSON.parse(neither.stdout).error, /--save .*--out/);

  // A sent package has no file name to borrow a name from, so it has to be told one.
  const unnamed = await run(['pack', path.join(dir, 'graphic'), '--save', '--json']);
  assert.equal(unnamed.code, 2);
  assert.match(JSON.parse(unnamed.stdout).error, /--name/);
});

test('pack --save with no key refuses before it starts a browser, and keeps the package it swallowed', async () => {
  // `pack --save ./a` - the parser hands "./a" to --save as its value. It must come back as a
  // package, or the run would be refused as "no packages" with the package right there.
  const dir = await tmpdir();
  await fs.mkdir(path.join(dir, 'graphic'), { recursive: true });
  await fs.writeFile(path.join(dir, 'graphic', 'graphic.html'), '<h1/>');
  const started = Date.now();
  const r = await run(['pack', '--save', path.join(dir, 'graphic'), '--name', 'Show', '--json']);
  assert.equal(r.code, 1, 'a refusal is exit 1, not a usage error');
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.ok, false);
  assert.equal(parsed.reason, 'not-logged-in');
  assert.match(parsed.error, /noacg login/);
  assert.ok(Date.now() - started < 15000, 'the no-key refusal must not wait on a browser');
});

test('pack --share refuses before any browser without --save, the licence, a shown name or a description', async () => {
  // Sharing to Community packs is the user's grant, so every word of it is theirs and is checked
  // before anything starts (docs/AGENT_SAVE.md §8). Nothing here can reach a server: NOACG_URL is
  // a closed port and there is no key.
  const dir = await tmpdir();
  await fs.mkdir(path.join(dir, 'graphic'), { recursive: true });
  await fs.writeFile(path.join(dir, 'graphic', 'graphic.html'), '<h1/>');
  const graphic = path.join(dir, 'graphic');
  const full = ['--name', 'Quiz', '--description', 'A pub quiz', '--license', 'cc-by-4.0', '--shown-as', 'Quizmaster K', '--json'];
  const cases = [
    [['pack', graphic, '--share', '--out', path.join(dir, 'q.noacgpack.json'), ...full], /needs --save/],
    [['pack', graphic, '--save', '--share', '--name', 'Quiz', '--description', 'A pub quiz', '--shown-as', 'K', '--json'], /--license cc-by-4\.0/],
    [['pack', graphic, '--save', '--share', '--name', 'Quiz', '--description', 'A pub quiz', '--license', 'mit', '--shown-as', 'K', '--json'], /--license cc-by-4\.0/],
    [['pack', graphic, '--save', '--share', '--name', 'Quiz', '--description', 'A pub quiz', '--license', 'cc-by-4.0', '--json'], /--shown-as/],
    [['pack', graphic, '--save', '--share', '--name', 'Quiz', '--license', 'cc-by-4.0', '--shown-as', 'K', '--json'], /--description/],
    [['pack', graphic, '--save', '--share', '--name', 'Q'.repeat(81), '--description', 'A pub quiz', '--license', 'cc-by-4.0', '--shown-as', 'K', '--json'], /--name is at most 80/],
  ];
  for (const [args, said] of cases) {
    const r = await run(args);
    assert.equal(r.code, 2, `${args.join(' ')} should be a usage error`);
    assert.match(JSON.parse(r.stdout).error, said);
  }
  // `--share ./a` hands the package to the flag; it comes back as a package, and with every word
  // given the run reaches the next refusal: no key.
  const r = await run(['pack', '--share', graphic, '--save', ...full]);
  assert.equal(r.code, 1);
  assert.equal(JSON.parse(r.stdout).reason, 'not-logged-in');
});

/** A NoaCG with both agent doors, answering each POST with the status the test sets, and recording
 *  every POST so a test can say what was sent. */
function stubDoors(status = { packages: 201, 'community-packs': 201 }) {
  const posts = [];
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        const door = req.url.replace('/api/me/', '');
        // Only what was SENT: the readback after a delivery (GET deliveries) is not a post, and a
        // stub too old to know it answers 404, which leaves the receipt unconfirmed.
        if (req.method === 'POST') posts.push(door);
        const code = req.method === 'POST' ? status[door] ?? 404 : 404;
        res.writeHead(code, { 'content-type': 'application/json' });
        res.end(JSON.stringify(code === 201
          ? (door === 'packages' ? { id: 'p1', url: 'https://example.test/home' } : { id: 'c1', state: 'in_review' })
          : { error: { code: 'limit_exceeded', message: 'Refused by the stub.' } }));
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, posts, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

/** `makePack` with a bridge that reads one graphic and returns `findings` from the community check. */
async function sharePack(origin, findings) {
  const { makePack } = await import('../dist/commands/pack.js');
  const dir = await tmpdir();
  await fs.mkdir(path.join(dir, 'strap'), { recursive: true });
  await fs.writeFile(path.join(dir, 'strap', 'strap.html'), '<h1/>');
  const bridge = {
    readPackage: async () => ({ imported: { template: { name: 'Strap' } } }),
    normalize: async (template) => ({ template }),
    validate: async () => ({ ok: true, merged: { errors: [] } }),
    packEntry: async (template) => ({ name: template.name }),
    communityCheck: async () => findings,
  };
  return withEnv({ NOACG_URL: origin, NOACG_AGENT_KEY: `${AGENT_KEY_PREFIX}${'s'.repeat(32)}` }, () => makePack([path.join(dir, 'strap')], {
    name: 'Quiz',
    save: true,
    share: { license: 'cc-by-4.0', shownAs: 'Quizmaster K', description: 'A pub quiz' },
    description: 'A pub quiz',
  }, bridge, () => {}));
}

test('pack --save --share sends nothing to Home when the share is refused, so a retry adds no copy', async (t) => {
  // #876: the Home copy used to go first, so each refused share left one more package on Home.
  const { describePack } = await import('../dist/commands/pack.js');

  const checked = await stubDoors();
  t.after(() => checked.server.close());
  const byChecks = await sharePack(checked.origin, [{ graphic: 'Strap', message: 'It still says "Lorem ipsum".' }]);
  assert.equal(byChecks.ok, false);
  assert.equal(byChecks.share.reason, 'checks');
  assert.deepEqual(checked.posts, [], 'a check refusal sends nothing anywhere');
  assert.equal(byChecks.reason, 'refused', 'a --json reader sees the refusal at the top level too');
  assert.equal(byChecks.error, byChecks.share.error);
  assert.match(describePack(byChecks), /Strap: It still says/);
  assert.match(describePack(byChecks), /Not sent: Community packs refuses/);

  const door = await stubDoors({ packages: 201, 'community-packs': 409 });
  t.after(() => door.server.close());
  const byDoor = await sharePack(door.origin, []);
  assert.equal(byDoor.ok, false);
  assert.equal(byDoor.share.reason, 'refused');
  assert.deepEqual(door.posts, ['community-packs'], 'a refusal at the share door leaves no Home copy');
  assert.equal(byDoor.url, undefined);
  assert.match(describePack(byDoor), /Refused by the stub\./);

  const both = await stubDoors();
  t.after(() => both.server.close());
  const sent = await sharePack(both.origin, []);
  assert.equal(sent.ok, true);
  assert.deepEqual(both.posts, ['community-packs', 'packages']);
  assert.equal(sent.share.id, 'c1');
  assert.equal(sent.id, 'p1');

  // Shared, then the Home door refuses: say so, and how to send the Home copy without a second share.
  const full = await stubDoors({ packages: 409, 'community-packs': 201 });
  t.after(() => full.server.close());
  const homeRefused = await sharePack(full.origin, []);
  assert.equal(homeRefused.ok, false);
  assert.equal(homeRefused.share.id, 'c1');
  const said = describePack(homeRefused);
  assert.match(said, /for review under CC BY 4\.0/);
  assert.match(said, /Not sent to your Home: Refused by the stub\./);
  assert.match(said, /without sharing/);
});

test('pack --rundown refuses a file that is not a list of cues naming a graphic', async () => {
  const dir = await tmpdir();
  await fs.mkdir(path.join(dir, 'graphic'), { recursive: true });
  const bad = path.join(dir, 'cues.json');
  await fs.writeFile(bad, JSON.stringify([{ label: 'Round 1' }]));
  const r = await run(['pack', path.join(dir, 'graphic'), '--name', 'Show', '--out', path.join(dir, 'x.noacgpack.json'), '--rundown', bad, '--json']);
  assert.equal(r.code, 2);
  assert.match(JSON.parse(r.stdout).error, /cue 1: needs "graphic"/);
});

test('`login --name My Laptop` is refused instead of naming the key "My"', async () => {
  // The same unquoted-value fault as above, with a worse victim. `--name My Laptop` gave the flag
  // "My" and left "Laptop" in the positionals, so the consent page asked the user to authorise
  // "My" and the key sat in Settings -> Account -> Agent access under that name. The name is the
  // only thing telling one machine's key from another's when the user comes to revoke one, so
  // half a name is close to no name. Reproduced 2026-09-09 on 0.3.0: the consent URL carried
  // `name=My` and the word "Laptop" was never mentioned again.
  //
  // The refusal must land BEFORE the loopback listener opens, or a refused login would still be
  // holding a port. NOACG_URL is unreachable here, which proves nothing was contacted either.
  const r = await run(['login', '--name', 'My', 'Laptop', '--no-browser', '--wait', '1', '--json']);
  assert.equal(r.code, 2, 'a stray word is a usage error, not a login failure');
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /"Laptop"/);
  assert.match(parsed.error, /--name "My Laptop"/, 'the refusal shows the quoting that fixes it');
});

test('every caspar sub-command except send refuses a stray word', async () => {
  // `caspar play --url … 1 20` reads as "channel 1, layer 20" and is not: before this, the words
  // were dropped and the PLAY went out on the default channel and layer, putting a production on
  // a layer the operator did not name. a997eabe extended the guard to every verb that takes a
  // package; caspar was left out because it dispatches on a sub-command instead, and it is the
  // one family here that reaches live playout hardware.
  for (const argv of [
    ['caspar', 'play', '--url', 'http://127.0.0.1:1/output', '1', '20'],
    ['caspar', 'stop', 'nonsense'],
    ['caspar', 'status', '--server', '127.0.0.1', 'junk'],
    ['caspar', 'agent', '--token', 'a', 'token'],
  ]) {
    const r = await run([...argv, '--json']);
    assert.equal(r.code, 2, `${argv.join(' ')} should be a usage error`);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.ok, false);
    assert.match(parsed.error, new RegExp(`^caspar ${argv[1]} takes no argument`), 'the refusal names the sub-command');
    // No quoting advice here: not one caspar flag takes a value that can hold a space, so
    // "needs quotes" would send the operator hunting for a value that was never there.
    assert.doesNotMatch(parsed.error, /needs quotes/);
    assert.match(parsed.error, /drop the word or hand it to the flag/);
  }

  // `send` is the deliberate exception: its words ARE the AMCP command, so they must survive the
  // grammar and reach the (closed) port, which is a different failure entirely.
  const sent = await run(['caspar', 'send', 'INFO', '1', '--timeout', '200', '--json']);
  const parsed = JSON.parse(sent.stdout);
  assert.equal(parsed.command, 'INFO 1', 'send keeps every word it was given');
  assert.doesNotMatch(parsed.error ?? '', /outside its flags/);
});

// ---------------------------------------------------------------- the login handoff exits
//
// `noacg login` is the one step of the agent road with a human in it, and on 2026-09-10 it minted
// the key, stored it, printed its success line and then sat for 923 s without exiting, until it
// was killed. Nothing here covered either exit, so both are pinned below.
//
// What holds the process is a socket, and it is not the obvious one: `server.close()` closes
// connections that are IDLE in the HTTP sense, but a browser also opens a speculative connection
// it never sends a request on, and that one has no finished message, so it survives the close and
// keeps the event loop alive. These tests hold exactly that socket open across the handoff, which
// is what makes them fail without `closeAllConnections()` in `login.ts`. The timeout path is
// pinned separately because the 923 s run says nothing about it: a successful handoff cancels the
// giving-up timer by design, so that path was never taken.

/** A stand-in NoaCG deployment. The only endpoint `login` calls is the redeem. */
function stubDeployment(key) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        if (req.method === 'POST' && req.url === '/api/me/agent-keys') {
          res.writeHead(201, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ key, id: 'k_test', name: 'unit test', prefix: displayPrefix(key), createdAt: '2026-09-16T00:00:00.000Z' }));
          return;
        }
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not this deployment');
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

/**
 * Start `login` against a stub deployment, read the consent URL it prints, and behave like the
 * browser: load the callback page and leave a second, request-less socket connected.
 *
 * Returns the child, the loopback port and state, a `complete()` that posts the code back the way
 * the served page does, and `waitForExit`. The caller must call `release()`.
 */
async function drivenLogin({ waitSec }) {
  const key = `${AGENT_KEY_PREFIX}${'d'.repeat(32)}`;
  const { server: stub, origin } = await stubDeployment(key);
  const home = await tmpdir();
  const env = { ...process.env, NOACG_URL: origin, NOACG_CREDENTIALS_DIR: home };
  delete env.NOACG_AGENT_KEY;

  const child = spawn(process.execPath, [cli, 'login', '--no-browser', '--wait', String(waitSec)], { env });
  let stdout = '';
  let stderr = '';
  let exit = null;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (d) => (stdout += d));
  child.stderr.on('data', (d) => (stderr += d));
  const exited = new Promise((resolve) => child.on('exit', (code) => { exit = { code, at: Date.now() }; resolve(exit); }));

  const browser = new http.Agent({ keepAlive: true });
  let speculative = null;
  /** Everything this helper owns, freed once. The caller's `finally` cannot cover the setup
   *  below, so anything that throws before the session object exists frees it here instead -
   *  otherwise the spawned CLI keeps its stdio attached and holds the whole test run open. */
  const release = () => {
    browser.destroy();
    speculative?.destroy();
    stub.close();
    if (exit === null) child.kill();
  };

  try {
    // The consent URL carries the loopback port and the state, and goes to stderr through out.log().
    let consent = null;
    for (let i = 0; i < 300 && !consent; i++) {
      const m = /http:\/\/\S+\/app\?\S+/.exec(stderr);
      if (m) consent = new URL(m[0]);
      else await new Promise((r) => setTimeout(r, 50));
    }
    assert.ok(consent, `login printed no consent URL in 15 s. stderr:\n${stderr}`);
    const port = Number(consent.searchParams.get('port'));
    const state = consent.searchParams.get('agent');

    const request = (options, body) =>
      new Promise((resolve, reject) => {
        const r = http.request({ host: '127.0.0.1', port, agent: browser, ...options }, (res) => {
          let text = '';
          res.setEncoding('utf8');
          res.on('data', (c) => (text += c));
          res.on('end', () => resolve({ status: res.statusCode, text }));
        });
        r.on('error', reject);
        if (body !== undefined) r.write(body);
        r.end();
      });

    const page = await request({ method: 'GET', path: '/callback' });
    assert.equal(page.status, 200, 'the listener serves the callback page');
    speculative = net.connect(port, '127.0.0.1');
    await new Promise((resolve, reject) => {
      speculative.once('connect', resolve);
      speculative.once('error', reject);
    });

    return {
      key,
      origin,
      home,
      state,
      page: page.text,
      out: () => ({ stdout, stderr }),
      complete: (params) => request({ method: 'POST', path: '/complete', headers: { 'content-type': 'text/plain' } }, params),
      waitForExit: async (withinMs) => {
        // The timer is cleared rather than left to fire: a pending one holds the whole test file
        // open for the rest of its budget after the assertion has already passed.
        let timer;
        const deadline = new Promise((resolve) => { timer = setTimeout(() => resolve('timed out'), withinMs); });
        const which = await Promise.race([exited, deadline]).finally(() => clearTimeout(timer));
        assert.notEqual(which, 'timed out', `login did not exit within ${withinMs} ms of the handoff - it is hanging with a browser socket still open. stdout:\n${stdout}\nstderr:\n${stderr}`);
        return exit;
      },
      release,
    };
  } catch (e) {
    release();
    throw e;
  }
}

test('a successful login exits 0 promptly, with the browser tab still open', async () => {
  const session = await drivenLogin({ waitSec: 60 });
  try {
    const done = await session.complete(`code=test-code&state=${session.state}`);
    assert.equal(done.status, 200, 'the listener accepts the code the page hands back');

    // Five seconds is not the target - the fixed path exits in about 0.3 s, and the point is that
    // this never again becomes "as long as the person leaves the tab open". It is the slack a
    // loaded CI runner gets for one redeem and one credentials write.
    const exit = await session.waitForExit(5000);
    assert.equal(exit.code, 0, `a login that minted and stored a key exits 0. stdout:\n${session.out().stdout}`);

    // The line the person reads is on STDOUT (out.say), while every progress line is on stderr
    // (out.log). Reading the wrong stream is what made this defect look like a different one.
    const { stdout, stderr } = session.out();
    assert.match(stdout, /^Logged in to /m, 'the success line reaches stdout, where a person sees it');
    assert.match(stdout, /revoke it any time/, 'the success line says how to take the key back');
    assert.doesNotMatch(stderr, /Logged in to /, 'the success line is not on stderr');

    const stored = JSON.parse(await fs.readFile(path.join(session.home, 'credentials.json'), 'utf8'));
    assert.equal(stored.deployments[session.origin].key, session.key, 'the key it printed about is the key it stored');

    // The tab says what the key may do before the CLI knows which scopes were granted, so its
    // words hold for a graphics-only key and for one that may also make productions.
    assert.match(session.page, /can save graphics to your library and, if you allowed it, make productions of them/);
    assert.doesNotMatch(session.page, /can only save graphics/, 'since 0.12.0 a key may also make productions');
  } finally {
    session.release();
  }
});

test('a login whose code never arrives exits non-zero within its wait, and says it gave up', async () => {
  // Six seconds rather than two: the giving-up clock starts when the listener opens, BEFORE the
  // helper has read the consent URL and connected to it, so a short wait races its own setup on a
  // loaded runner and fails with ECONNREFUSED instead of the assertion below.
  const session = await drivenLogin({ waitSec: 6 });
  try {
    // Nothing is posted back: this is the person who never presses Allow, or closes the tab.
    const exit = await session.waitForExit(20_000);
    assert.equal(exit.code, 1, 'giving up is exit 1, the documented "refused" code');
    const { stdout } = session.out();
    assert.match(stdout, /No reply from the browser within 6 s/, 'it says what it waited for');
    assert.match(stdout, /run `noacg login` again/, 'it says what to do next');
  } finally {
    session.release();
  }
});

test('"Don\'t allow" in the browser ends the login at once, and says nothing was granted', async () => {
  // Phase 1 of the agent-delivery plan found the consent page's refusal never reached the CLI,
  // which then waited out its whole timeout. The page now sends the refusal to the same callback.
  const session = await drivenLogin({ waitSec: 60 });
  try {
    const refused = await session.complete(`error=access_denied&state=${session.state}`);
    assert.equal(refused.status, 200);
    assert.equal(refused.text, 'denied', 'the callback page is told, so it can say so');
    const exit = await session.waitForExit(5000);
    assert.equal(exit.code, 1, 'a refusal is exit 1, the documented "refused" code');
    const { stdout } = session.out();
    assert.match(stdout, /not allowed in the browser - nothing was granted/);
    await assert.rejects(fs.readFile(path.join(session.home, 'credentials.json'), 'utf8'), 'no key was stored');
  } finally {
    session.release();
  }
});

test('the consent URL tells the page this login takes a refusal, and the link names where it works', async () => {
  const session = await drivenLogin({ waitSec: 6 });
  try {
    const { stderr } = session.out();
    assert.match(/http:\/\/\S+\/app\?\S+/.exec(stderr)?.[0] ?? '', /[?&]deny=1(&|$)/);
    // The consent page redirects to 127.0.0.1 here, so any local browser signed in to the account works.
    assert.match(stderr, /any browser on this computer that is signed in to the NoaCG account you want to connect/);
    await session.waitForExit(20_000);
  } finally {
    session.release();
  }
});

// Through 0.12.0 Windows opened the consent URL with `cmd /c start "" <url>`. cmd splits a command
// line at `&`, so the browser got `/app?agent=<state>` alone, the page called it an invalid agent
// request, and cmd's failure on the rest made the CLI say it could not open a browser. The URL
// must reach the opener as one argument, with nothing in between that parses it.
test('on Windows the consent URL goes whole to the URL handler, never through cmd', async () => {
  const url = 'https://noacg.studio/app?agent=s&port=51234&name=noacg+CLI+on+PC&challenge=c&deny=1&scopes=productions%3Acreate';
  const calls = [];
  const run = (ok) => (file, args, options, done) => {
    calls.push({ file, args, options });
    done(ok ? null : new Error('failed'));
  };

  assert.equal(await openUrl(url, 'win32', run(true)), true);
  assert.deepEqual(calls[0], {
    file: 'rundll32',
    args: ['url.dll,FileProtocolHandler', url],
    options: { windowsHide: true, windowsVerbatimArguments: true },
  });
  assert.equal(await openUrl(url, 'win32', run(false)), false, 'an opener that fails is reported as not opened');

  assert.deepEqual(openUrlCommand(url, 'darwin').args, [url]);
  assert.equal(openUrlCommand(url, 'darwin').file, 'open');
  assert.equal(openUrlCommand(url, 'linux').file, 'xdg-open');
  assert.equal(
    await openUrl(url, 'win32', () => {
      throw new Error('spawn failed');
    }),
    false,
    'an opener that cannot start is reported as not opened',
  );
});

// ---------------------------------------------------------------- delivery receipts
//
// docs/AGENT_SAVE.md §9: a write names its operation BEFORE it is sent, so a lost answer can be
// asked about; a readback is what turns "accepted" into "verified"; and the CLI never sends twice.

/** A deployment whose save door answers `writeStatus` and whose readback answers `readStatus`. */
function receiptDeployment({ writeStatus = 201, readStatus = 200, readState = 'saved' } = {}) {
  const seen = { writes: [], reads: [] };
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        const op = req.headers['x-noacg-operation'];
        const receipt = (verified) => ({
          version: 1, operationId: op ?? seen.writes[0], deployment: 'https://noacg.test',
          account: { id: 'u1', email: 'maker@example.test' }, destination: 'library', state: 'saved',
          resources: [{ kind: 'graphic', id: 'g1', state: 'saved', link: 'https://noacg.test/app#/graphic/g1' }],
          link: 'https://noacg.test/app#/graphic/g1', nextAction: null, verified, checkedAt: '2026-10-15T00:00:00.000Z',
        });
        if (req.method === 'POST') {
          seen.writes.push(op);
          res.writeHead(writeStatus, { 'content-type': 'application/json' });
          res.end(JSON.stringify(writeStatus === 201 ? { id: 'g1', url: 'https://noacg.test/app#/graphic/g1', receipt: receipt(false) } : { error: { code: 'x', message: 'Refused by the stub.' } }));
          return;
        }
        seen.reads.push(new URL(req.url, 'http://x').searchParams.get('id'));
        res.writeHead(readStatus, { 'content-type': 'application/json' });
        const read = receipt(true);
        read.state = readState;
        read.resources = read.resources.map((r) => ({ ...r, state: readState }));
        res.end(JSON.stringify(readStatus === 200 ? { receipt: read } : { error: { code: 'not_found', message: 'Nothing.' } }));
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, seen, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

test('a delivery is written once under a named operation, then confirmed by reading it back', async (t) => {
  const { deliverAndConfirm, describeReceipt } = await import('../dist/receipt.js');
  const { saveGraphic } = await import('../dist/auth.js');
  const d = await receiptDeployment();
  t.after(() => d.server.close());
  const done = await deliverAndConfirm(d.origin, 'k', 'graphic', (op) => saveGraphic(d.origin, 'k', {}, op));
  assert.equal(done.ok, true);
  assert.equal(d.seen.writes.length, 1);
  assert.match(d.seen.writes[0], /^[0-9a-f-]{36}$/, 'the operation id travels with the write');
  assert.deepEqual(d.seen.reads, [d.seen.writes[0]], 'and the readback asks about that same operation');
  assert.equal(done.receipt.verified, true);
  const said = describeReceipt(done.receipt).join('\n');
  assert.match(said, /library of maker@example\.test on https:\/\/noacg\.test \(confirmed by reading it back/);
  assert.doesNotMatch(said, /opened/, 'a readback never claims a browser opened it');
});

test('a lost answer is asked about, never resent: found means delivered, not found means unverified', async (t) => {
  const { deliverAndConfirm } = await import('../dist/receipt.js');
  const { saveGraphic } = await import('../dist/auth.js');

  const landed = await receiptDeployment({ writeStatus: 502, readStatus: 200 });
  t.after(() => landed.server.close());
  const found = await deliverAndConfirm(landed.origin, 'k', 'graphic', (op) => saveGraphic(landed.origin, 'k', {}, op));
  assert.equal(found.ok, true, 'the readback found it, so it arrived despite the 502');
  assert.equal(found.receipt.state, 'saved');
  assert.equal(landed.seen.writes.length, 1, 'never written twice');

  const lost = await receiptDeployment({ writeStatus: 502, readStatus: 404 });
  t.after(() => lost.server.close());
  const unknown = await deliverAndConfirm(lost.origin, 'k', 'graphic', (op) => saveGraphic(lost.origin, 'k', {}, op));
  assert.equal(unknown.ok, false);
  assert.equal(unknown.receipt.state, 'delivery_unverified');
  assert.equal(unknown.receipt.verified, false);
  assert.match(unknown.receipt.nextAction, new RegExp(`noacg status ${lost.seen.writes[0]}`));
  assert.equal(lost.seen.writes.length, 1, 'never written twice');

  const refused = await receiptDeployment({ writeStatus: 409 });
  t.after(() => refused.server.close());
  const no = await deliverAndConfirm(refused.origin, 'k', 'graphic', (op) => saveGraphic(refused.origin, 'k', {}, op));
  assert.equal(no.receipt.state, 'failed', 'a refusal the server sent is an answer: nothing was written');
  assert.deepEqual(refused.seen.reads, [], 'so there is nothing to ask about');
});

test('status reads back by id, and an unknown id says nothing is visible to this key', async (t) => {
  const d = await receiptDeployment({ readStatus: 404 });
  t.after(() => d.server.close());
  const env = { ...process.env, NOACG_URL: d.origin, NOACG_AGENT_KEY: `${AGENT_KEY_PREFIX}${'e'.repeat(32)}` };
  const missing = await new Promise((resolve) => {
    execFile(process.execPath, [cli, 'status', '0b7c3d4e-5f60-4a71-8b92-a3b4c5d6e7f8'], { env }, (error, stdout) => resolve({ code: error?.code ?? 0, stdout }));
  });
  assert.equal(missing.code, 1);
  assert.match(missing.stdout, /Nothing delivered under 0b7c3d4e-5f60-4a71-8b92-a3b4c5d6e7f8 by this key/);
  const bad = await new Promise((resolve) => {
    execFile(process.execPath, [cli, 'status', 'nope'], { env }, (error) => resolve(error?.code ?? 0));
  });
  assert.equal(bad, 2, 'a malformed id is a usage error');
});

// ---------------------------------------------------------------- a set, as one delivery
//
// docs/AGENT_SAVE.md §10: `noacg save a b c` sends every graphic in one request under an operation
// named and journaled BEFORE the write. The deployment saves all or none and answers the same
// operation's first delivery when it is sent again, so here - unlike a single save - a lost answer
// IS resent, under the same operation, and a rerun after a restart finds the same operation.

const SET_IDS = ['g1', 'g2', 'g3'];

/** A deployment with the set door. `writes` is the status of each POST in turn (the last repeats). */
function setDeployment({ writes = [201], readStatus = 200, conflictMessage = 'Operation already delivered different graphics.' } = {}) {
  const seen = { writes: [], reads: [] };
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const op = req.headers['x-noacg-operation'];
        const resources = SET_IDS.map((id) => ({ kind: 'graphic', id, state: 'saved', link: `https://noacg.test/app#/graphic/${id}` }));
        const receipt = (verified) => ({
          version: 1, operationId: op ?? seen.writes[0]?.op, deployment: 'https://noacg.test', account: { id: 'u1', email: 'maker@example.test' },
          destination: 'library', state: 'saved', resources, link: resources[0].link, nextAction: null, verified, checkedAt: '2026-10-15T00:00:00.000Z',
        });
        const answer = (status, payload) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(payload)); };
        if (req.method === 'POST') {
          const status = writes[Math.min(seen.writes.length, writes.length - 1)];
          seen.writes.push({ op, path: req.url, count: JSON.parse(body).graphics?.length });
          if (status === 201 || status === 200) {
            return answer(status, { operationId: op, replayed: status === 200, graphics: SET_IDS.map((id, i) => ({ id, name: `N${i}`, url: `https://noacg.test/app#/graphic/${id}` })), receipt: receipt(false) });
          }
          return answer(status, { error: { code: status === 409 ? 'conflict' : status === 404 ? 'not_found' : status === 503 ? 'unavailable' : 'internal', message: status === 409 ? conflictMessage : 'Down.' } });
        }
        seen.reads.push(new URL(req.url, 'http://x').searchParams.get('id'));
        return readStatus === 200 ? answer(200, { receipt: receipt(true) }) : answer(404, { error: { code: 'not_found', message: 'Nothing.' } });
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, seen, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

const OP_A = '0b7c3d4e-5f60-4a71-8b92-a3b4c5d6e7f8';
const setDocs = () => ['N0', 'N1', 'N2'].map((name) => ({ id: crypto.randomUUID(), name, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), template: { html: name } }));

test('a set is written once under its operation, to the set door, then confirmed by reading it back', async (t) => {
  const { deliverSetAndConfirm } = await import('../dist/receipt.js');
  const { saveGraphicSet } = await import('../dist/auth.js');
  const d = await setDeployment();
  t.after(() => d.server.close());
  const done = await deliverSetAndConfirm(d.origin, 'k', OP_A, ['N0', 'N1', 'N2'], () => saveGraphicSet(d.origin, 'k', setDocs(), OP_A), [0, 0]);
  assert.equal(done.ok, true);
  assert.deepEqual(d.seen.writes, [{ op: OP_A, path: '/api/me/graphic-sets', count: 3 }]);
  assert.deepEqual(d.seen.reads, [OP_A]);
  assert.equal(done.receipt.verified, true);
  assert.deepEqual(done.graphics.map((g) => g.id), SET_IDS, 'every exact link, in the order sent');
});

test('a lost answer is sent again under the SAME operation - safe for a set - and only then asked about', async (t) => {
  const { deliverSetAndConfirm } = await import('../dist/receipt.js');
  const { saveGraphicSet } = await import('../dist/auth.js');

  const flaky = await setDeployment({ writes: [502, 500, 200] });
  t.after(() => flaky.server.close());
  const resent = await deliverSetAndConfirm(flaky.origin, 'k', OP_A, [], () => saveGraphicSet(flaky.origin, 'k', setDocs(), OP_A), [0, 0]);
  assert.equal(resent.ok, true);
  assert.equal(resent.replayed, false, 'a replay after this run lost its own answers is this run\'s save, not an earlier one');
  assert.deepEqual(flaky.seen.writes.map((w) => w.op), [OP_A, OP_A, OP_A], 'never a new operation');

  const landed = await setDeployment({ writes: [502] });
  t.after(() => landed.server.close());
  const found = await deliverSetAndConfirm(landed.origin, 'k', OP_A, ['N0', 'N1', 'N2'], () => saveGraphicSet(landed.origin, 'k', setDocs(), OP_A), [0, 0]);
  assert.equal(found.ok, true, 'every answer lost, but the readback finds it');
  assert.deepEqual(found.graphics.map((g) => [g.name, g.id]), [['N0', 'g1'], ['N1', 'g2'], ['N2', 'g3']]);
  assert.equal(landed.seen.writes.length, 3);

  const gone = await setDeployment({ writes: [502], readStatus: 404 });
  t.after(() => gone.server.close());
  const unknown = await deliverSetAndConfirm(gone.origin, 'k', OP_A, [], () => saveGraphicSet(gone.origin, 'k', setDocs(), OP_A), [0, 0]);
  assert.equal(unknown.ok, false);
  assert.equal(unknown.reason, 'unverified');
  assert.equal(unknown.receipt.state, 'delivery_unverified');
  assert.match(unknown.receipt.nextAction, new RegExp(`Run the same command again: it resumes operation ${OP_A} and cannot save the set twice`));
});

test('a refusal after a lost answer is not the last word: the earlier send may have saved the set', async (t) => {
  const { deliverSetAndConfirm } = await import('../dist/receipt.js');
  const { saveGraphicSet } = await import('../dist/auth.js');
  // The first send's answer is lost, the second is refused (it met the rate limit the first used up).
  const landed = await setDeployment({ writes: [502, 429] });
  t.after(() => landed.server.close());
  const saved = await deliverSetAndConfirm(landed.origin, 'k', OP_A, ['N0', 'N1', 'N2'], () => saveGraphicSet(landed.origin, 'k', setDocs(), OP_A), [0, 0]);
  assert.equal(saved.ok, true, 'the readback found the set the first send saved');
  assert.deepEqual(saved.graphics.map((g) => g.id), SET_IDS);
  assert.deepEqual(landed.seen.reads, [OP_A]);

  const refused = await setDeployment({ writes: [502, 429], readStatus: 404 });
  t.after(() => refused.server.close());
  const no = await deliverSetAndConfirm(refused.origin, 'k', OP_A, [], () => saveGraphicSet(refused.origin, 'k', setDocs(), OP_A), [0, 0]);
  assert.equal(no.ok, false);
  assert.equal(no.reason, 'refused', 'asked, and nothing is there: the refusal stands');
});

test('a conflict, a refusal, an offline deployment and one without the set door are answers: nothing is resent', async (t) => {
  const { deliverSetAndConfirm } = await import('../dist/receipt.js');
  const { saveGraphicSet } = await import('../dist/auth.js');
  for (const [status, reason] of [[409, 'conflict'], [403, 'refused'], [404, 'unsupported'], [503, 'refused']]) {
    const d = await setDeployment({ writes: [status], conflictMessage: `Operation ${OP_A} already delivered different graphics.` });
    t.after(() => d.server.close());
    const answer = await deliverSetAndConfirm(d.origin, 'k', OP_A, [], () => saveGraphicSet(d.origin, 'k', setDocs(), OP_A), [0, 0]);
    assert.equal(answer.ok, false);
    assert.equal(answer.reason, reason, `${status}`);
    assert.equal(answer.receipt.state, 'failed');
    assert.equal(d.seen.writes.length, 1, `${status} is not resent`);
    assert.deepEqual(d.seen.reads, [], `${status}: nothing to ask about`);
    if (status === 409) assert.match(answer.error, /already delivered different graphics/, 'the deployment\'s own sentence');
  }
});

test('the journal gives the same set the same operation across runs, and a different set a new one', async (t) => {
  const dir = await tmpdir();
  const before = process.env.NOACG_CREDENTIALS_DIR;
  process.env.NOACG_CREDENTIALS_DIR = dir;
  t.after(() => { if (before === undefined) delete process.env.NOACG_CREDENTIALS_DIR; else process.env.NOACG_CREDENTIALS_DIR = before; });
  const { operationFor, setFingerprint, journalPath, OPERATION_REUSE_MS } = await import('../dist/operations.js');

  // Rebuilt by the bridge: new ids and timestamps, the same content - the same set.
  const fp = setFingerprint('https://noacg.test', 'key-1', setDocs());
  assert.equal(setFingerprint('https://noacg.test', 'key-1', setDocs()), fp);
  assert.notEqual(setFingerprint('https://noacg.test', 'key-2', setDocs()), fp, 'another key is another delivery');
  assert.notEqual(setFingerprint('https://other.test', 'key-1', setDocs()), fp);
  assert.notEqual(setFingerprint('https://noacg.test', 'key-1', setDocs().reverse()), fp);

  const first = await operationFor(fp);
  assert.equal(first.resumed, false);
  const journal = await fs.readFile(journalPath(), 'utf8');
  assert.ok(journal.includes(first.operationId), 'recorded BEFORE anything is sent');
  assert.doesNotMatch(journal, /key-1/, 'the journal never holds a key');
  assert.deepEqual(await operationFor(fp), { operationId: first.operationId, resumed: true }, 'a rerun resumes it');
  const other = await operationFor(setFingerprint('https://noacg.test', 'key-1', setDocs().slice(1)));
  assert.notEqual(other.operationId, first.operationId);

  const later = await operationFor(fp, Date.now() + OPERATION_REUSE_MS + 1000);
  assert.equal(later.resumed, false, 'a day later the same set is a new delivery');
  assert.notEqual(later.operationId, first.operationId);

  // A conflict, or a replay whose graphics were deleted since: forgotten, so the next run starts a
  // new delivery instead of meeting the same answer for a day.
  const { forgetOperation } = await import('../dist/operations.js');
  await forgetOperation(fp, later.operationId);
  const after = await operationFor(fp);
  assert.equal(after.resumed, false);
  assert.notEqual(after.operationId, later.operationId);

  // Two saves of a new set at once share one operation: the journal's lock serialises them.
  const racing = setFingerprint('https://noacg.test', 'key-1', setDocs().slice(0, 1));
  const ids = new Set((await Promise.all(Array.from({ length: 6 }, () => operationFor(racing)))).map((c) => c.operationId));
  assert.equal(ids.size, 1, 'one set, one operation, however many ran together');
  // A lock left by a crashed process is taken over rather than waited on for ever.
  const lock = `${journalPath()}.lock`;
  await fs.writeFile(lock, '');
  const old = new Date(Date.now() - 60_000);
  await fs.utimes(lock, old, old);
  assert.equal((await operationFor(racing)).resumed, true);
  await assert.rejects(fs.stat(lock), 'and released after');
});

test('one graphic on a deployment without the set door asks about its operation first, then uses the single door under it', async (t) => {
  const { saveOneTheOldWay } = await import('../dist/commands/save.js');
  const known = await receiptDeployment();
  t.after(() => known.server.close());
  const found = await saveOneTheOldWay(known.origin, 'k', OP_A, './a', 'Strap', {}, {});
  assert.equal(found.ok, true);
  assert.equal(found.replayed, true);
  assert.equal(found.id, 'g1');
  assert.deepEqual(known.seen.writes, [], 'already there under this operation: nothing is written');

  const gone = await receiptDeployment({ readState: 'missing' });
  t.after(() => gone.server.close());
  const deleted = await saveOneTheOldWay(gone.origin, 'k', OP_A, './a', 'Strap', {}, {});
  assert.equal(deleted.ok, false, 'saved earlier and deleted since is not in the library');
  assert.equal(deleted.reason, 'deleted');
  assert.deepEqual(gone.seen.writes, []);

  const fresh = await receiptDeployment({ readStatus: 404 });
  t.after(() => fresh.server.close());
  const saved = await saveOneTheOldWay(fresh.origin, 'k', OP_A, './a', 'Strap', {}, {});
  assert.deepEqual(fresh.seen.writes, [OP_A], 'written once, under the operation the CLI journaled');
  assert.equal(saved.operationId, OP_A);
});

// ── A production as well (docs/AGENT_SAVE.md §11) ────────────────────────────────────────────

/** A deployment's set door that answers a production too - or, with `old`, one from before the
 *  production destination, which reads the graphics and ignores the rest. `refuse` answers 403. */
function productionDeployment({ old = false, refuse = null } = {}) {
  const seen = { bodies: [], reads: [] };
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        const op = req.headers['x-noacg-operation'];
        const answer = (status, payload) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(payload)); };
        const graphics = SET_IDS.map((id, i) => ({ id, name: `N${i}`, url: `https://noacg.test/app#/graphic/${id}` }));
        const made = !old;
        const resources = [
          ...graphics.map((g) => ({ kind: 'graphic', id: g.id, state: 'saved', link: g.url })),
          ...(made ? [{ kind: 'production', id: 'p1', state: 'saved', link: 'https://noacg.test/app#/production/p1' }] : []),
        ];
        const receipt = (verified) => ({
          version: 1, operationId: op ?? OP_A, deployment: 'https://noacg.test', account: { id: 'u1', email: 'maker@example.test' },
          destination: made ? 'production' : 'library', state: 'saved', resources, link: resources[resources.length - 1].link, nextAction: null, verified, checkedAt: '2026-10-16T00:00:00.000Z',
        });
        if (req.method === 'POST') {
          seen.bodies.push(JSON.parse(body));
          if (refuse) return answer(403, { error: { code: 'forbidden', message: refuse } });
          return answer(201, { operationId: op, replayed: false, graphics, ...(made ? { production: { id: 'p1', name: 'News', url: 'https://noacg.test/app#/production/p1' } } : {}), receipt: receipt(false) });
        }
        seen.reads.push(new URL(req.url, 'http://x').searchParams.get('id'));
        return answer(200, { receipt: receipt(true) });
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, seen, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

/** What `save` needs of the bridge, without a browser: every package reads as a lower third named
 *  after its folder, validates clean, and becomes a record carrying the origin it was given. */
const fakeBridge = {
  readPackage: async (_bytes, fileName) => ({ imported: { template: { name: fileName.replace(/\.zip$/, ''), type: 'lower-third', resolution: { width: 1920, height: 1080 }, fps: 50, html: `<p>${fileName}</p>`, css: '', js: '', fields: [], settings: {}, assets: [], layers: [] } } }),
  normalize: async (template) => ({ template }),
  validate: async () => ({ ok: true, merged: { errors: [], warnings: [] } }),
  graphicDoc: async (template, opts) => ({ version: 1, id: crypto.randomUUID(), name: opts.name, template, origin: opts.origin, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }),
};

/** Three package folders N0..N2, the deployment as NOACG_URL, a key, and a journal of their own. */
async function productionWorld(t, origin) {
  const dir = await tmpdir();
  const inputs = [];
  for (const n of ['N0', 'N1', 'N2']) {
    await fs.mkdir(path.join(dir, n), { recursive: true });
    await fs.writeFile(path.join(dir, n, 'graphic.html'), `<p>${n}</p>`);
    inputs.push(path.join(dir, n));
  }
  const env = { NOACG_URL: origin, NOACG_AGENT_KEY: `${AGENT_KEY_PREFIX}${'ab'.repeat(16)}`, NOACG_CREDENTIALS_DIR: path.join(dir, 'config') };
  const before = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  Object.assign(process.env, env);
  t.after(() => { for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  return inputs;
}

const NEWS = { name: 'News', cues: [{ graphic: 'N1', label: 'Score' }, { graphic: 'N0', label: 'Anna', values: { f0: 'Anna' } }] };

test('save with a production sends it in the same delivery, stamped with item identities, and names the production', async (t) => {
  const { savePackages, describeSave, itemIdentity } = await import('../dist/commands/save.js');
  const d = await productionDeployment();
  t.after(() => d.server.close());
  const inputs = await productionWorld(t, d.origin);
  const outcome = await savePackages(inputs, { bench: false, production: NEWS }, fakeBridge, () => undefined);
  assert.equal(outcome.ok, true, outcome.error);
  assert.deepEqual(outcome.production, { id: 'p1', name: 'News', url: 'https://noacg.test/app#/production/p1' });
  assert.equal(d.seen.bodies.length, 1, 'one request: the graphics and the production together');
  assert.deepEqual(d.seen.bodies[0].production, NEWS);
  // Every record carries the identity `noacg pack` writes on the same graphic's package entry.
  for (const doc of d.seen.bodies[0].graphics) {
    assert.match(doc.origin.item, /^[0-9a-f]{64}$/);
    assert.equal(doc.origin.item, itemIdentity(doc.template));
  }
  const text = describeSave(outcome).join('\n');
  assert.match(text, /Saved 3 graphics and the production "News" in one delivery:/);
  assert.match(text, /- production "News" -> https:\/\/noacg\.test\/app#\/production\/p1/);
  assert.match(text, /In the account of maker@example\.test/);

  // A rundown that names a graphic not in the set is refused before anything is sent.
  const stray = await savePackages(inputs, { bench: false, production: { name: 'News', cues: [{ graphic: 'Nope', label: 'x' }] } }, fakeBridge, () => undefined);
  assert.equal(stray.ok, false);
  assert.match(stray.error, /cues "Nope", which is not one of/);
  assert.equal(d.seen.bodies.length, 1);
});

test('a graphics-only key is told how to get a production; an older deployment that made none is not reported done', async (t) => {
  const { savePackages } = await import('../dist/commands/save.js');
  const message = 'This key may save graphics to the library but not make productions. Nothing was saved. Run `noacg login` again and allow productions, or save without a production to put the graphics in the library only.';
  const refusing = await productionDeployment({ refuse: message });
  t.after(() => refusing.server.close());
  let inputs = await productionWorld(t, refusing.origin);
  const refused = await savePackages(inputs, { bench: false, production: NEWS }, fakeBridge, () => undefined);
  assert.equal(refused.ok, false);
  assert.equal(refused.error, `Not saved: ${message}`, 'the deployment\'s own sentence, with no hint that contradicts it');

  const old = await productionDeployment({ old: true });
  t.after(() => old.server.close());
  inputs = await productionWorld(t, old.origin);
  const partial = await savePackages(inputs, { bench: false, production: NEWS }, fakeBridge, () => undefined);
  assert.equal(partial.ok, false);
  assert.equal(partial.reason, 'no-production');
  assert.equal(partial.graphics.length, 3, 'the graphics it did save are named');
  assert.match(partial.error, /made no production/);
  // The person reading the terminal gets every saved link too, not only `--json`.
  const { describeSave } = await import('../dist/commands/save.js');
  const said = describeSave(partial).join('\n');
  assert.match(said, /made no production/);
  for (const g of partial.graphics) assert.ok(said.includes(`"${g.name}" -> ${g.url}`), `the link of "${g.name}" is printed`);
});

test('the same graphics for the library and as a production are two deliveries; a cause reads as its own sentence', async (t) => {
  const { setFingerprint } = await import('../dist/operations.js');
  const docs = setDocs();
  const library = setFingerprint('https://noacg.test', 'k', docs);
  assert.notEqual(setFingerprint('https://noacg.test', 'k', docs, NEWS), library);
  assert.equal(setFingerprint('https://noacg.test', 'k', setDocs(), NEWS), setFingerprint('https://noacg.test', 'k', docs, NEWS), 'rebuilt, the same delivery');
  assert.notEqual(setFingerprint('https://noacg.test', 'k', docs, { ...NEWS, name: 'Late' }), setFingerprint('https://noacg.test', 'k', docs, NEWS));

  // Nothing listening: the cause ("fetch failed") ends with its full stop before what to do next.
  const { deliverSetAndConfirm } = await import('../dist/receipt.js');
  const { saveGraphicSet } = await import('../dist/auth.js');
  const closed = 'http://127.0.0.1:1';
  const lost = await deliverSetAndConfirm(closed, 'k', OP_A, [], () => saveGraphicSet(closed, 'k', setDocs(), OP_A), [0, 0]);
  assert.equal(lost.reason, 'unverified');
  assert.match(lost.error, /^Unconfirmed: fetch failed\. Run the same command again/);
});

test('save refuses --name with several packages before any browser', async () => {
  const dir = await tmpdir();
  for (const g of ['a', 'b']) {
    await fs.mkdir(path.join(dir, g), { recursive: true });
    await fs.writeFile(path.join(dir, g, 'graphic.html'), '<h1/>');
  }
  const closed = { NOACG_URL: 'http://127.0.0.1:1' };
  const named = await run(['save', path.join(dir, 'a'), path.join(dir, 'b'), '--name', 'Both', '--json'], closed);
  assert.equal(named.code, 2);
  assert.match(JSON.parse(named.stdout).error, /--name names one graphic/);
  // A bare --production would read as absent and save library-only: refused instead, as is a bare
  // --rundown, and a rundown without a production.
  for (const flag of ['--production', '--rundown']) {
    const bare = await run(['save', path.join(dir, 'a'), path.join(dir, 'b'), '--json', flag], closed);
    assert.equal(bare.code, 2, flag);
    assert.match(JSON.parse(bare.stdout).error, new RegExp(`${flag} needs a value`));
  }
  const stray = await run(['save', path.join(dir, 'a'), '--layer', '20,21', '--json'], closed);
  assert.equal(stray.code, 2);
  assert.match(JSON.parse(stray.stdout).error, /add --production/);
  // Several packages are a set, not stray words: with no key it is the ordinary no-login refusal.
  const set = await run(['save', path.join(dir, 'a'), path.join(dir, 'b'), '--json'], closed);
  assert.equal(set.code, 1);
  assert.equal(JSON.parse(set.stdout).reason, 'not-logged-in');
});

// ---------------------------------------------------------------- the shipped skill text
//
// The skill is the only thing standing between an agent and a graphic that carries its state in
// FIELDS instead of buttons. It is plain markdown with no compiler behind it, so what it promises
// is pinned here or nowhere.
//
// WHY THE GATES and not a spell-check of the whole file: authoring a machine was opened on
// 2026-08-27 on the condition of three gates (docs/CONTROL_PANEL_ROAD.md §9), and those gates ARE
// the safety model - there is no other check that an authored machine is one a human wanted.
// A rewrite that drops a gate from the text drops it from practice, silently, because nothing
// else names them. Rewording a gate is fine and should update this test deliberately; losing one
// should fail.

/** The shipped SKILL.md, LF-normalised: a Windows checkout hands it back with CRLF, and a match
 *  that only passes on one platform's checkout teaches people to ignore the test (build-skill.mjs
 *  compares the generated copies the same way, for the same reason). */
async function shippedSkill() {
  return (await fs.readFile(path.join(skillDir(), 'SKILL.md'), 'utf8')).replace(/\r\n/g, '\n');
}

test('the shipped skill names all three gates for an authored machine', async () => {
  const contract = (await readDoc('contract')).replace(/\r\n/g, '\n');
  const skill = await shippedSkill();

  // Pinned by the TOOL and the ACT each gate names, inside the gates section, and never by the
  // sentences around them. An early cut pinned the prose "the bench walks every operator arrow"
  // and would have locked that claim into CI while the bench was still doing less than it said -
  // it capped at eight distinct event names and never snapped back between them, so the accurate
  // rewrite had to be free to change those words. (It walks every arrow since 2026-09-15, which is
  // exactly the point: the sentence became true by someone fixing the bench, not by CI insisting
  // on it.) A pin on wording makes the next author choose between a true contract and a green
  // build, which is how a gate quietly becomes a slogan.
  const section = /### 5a\. The three gates\n([\s\S]*?)\n### /.exec(contract)?.[1];
  assert.ok(section, 'references/contract.md has no "5a. The three gates" section');

  const gates = [
    { name: 'validate, with its machine findings read', tokens: ['noacg validate', 'machine'] },
    { name: 'inspect, and SHOW the user the buttons', tokens: ['noacg inspect', 'SHOW the user the buttons'] },
    { name: 'the bench walking the operator arrows', tokens: ['bench', 'operator arrow'] },
  ];
  for (const gate of gates) {
    for (const token of gate.tokens) {
      assert.ok(section.includes(token), `the gate "${gate.name}" no longer names "${token}"`);
    }
  }

  // The loop is where an agent actually works, so the gates have to be STEPS, not a reference
  // it may never open. Gate 2 is the one with a human in it and the one a loop can silently
  // skip, so it is pinned by its own words.
  assert.match(skill, /MACHINE findings/i, 'the loop does not tell the agent to read the machine findings');
  assert.match(skill, /SHOW the user the buttons/, 'the loop does not tell the agent to show the user the buttons');
  assert.match(skill, /BENCH walk/i, 'the loop does not say the bench walks the arrows');
  assert.match(skill, /Read the printed BUTTONS against/i, 'step 4 lost its read-against-the-brief instruction');
});

test('the skill no longer calls an authored machine a later capability', async () => {
  // The sentence this replaces - "Authoring your own machine is a later capability." - was the
  // measured gap (docs/CONTROL_PANEL_ANY_GRAPHIC.md §2c): everything under it already worked, and
  // the skill was the only thing still saying no. If it comes back, the capability is closed
  // again no matter what the rest of the file says.
  for (const topic of ['contract', 'control']) {
    assert.doesNotMatch(await readDoc(topic), /later capability/i, `references/${topic}.md still defers authoring a machine`);
  }
  assert.doesNotMatch(await shippedSkill(), /later capability/i, 'SKILL.md still defers authoring a machine');
});

// ---------------------------------------------------------------- the look is the agent's (D1)
//
// Owner decision, 2026-10-02 (docs/work-specs/plugin-design-quality/spec.md, D1): by default the
// agent designs freely - no house look and no taste rules in the default skill. NoaCG's half is
// everything around the artwork: the contract, the package, the fields and behaviour, and how the
// graphic works from the control panel. Taste is two OPT-IN tools, a critique and a guidelines
// switch, and neither may cost a session that does not ask for it anything.
//
// So these pin three things that would otherwise drift quietly: the operator guidance stays in
// the default skill, house rules stay out of it, and the opt-in tools stay off and free.

/** The skill's sections, split on `## ` headings (LF-normalised by shippedSkill). */
function sectionsOf(text) {
  const sections = new Map();
  for (const part of text.split(/\n(?=## )/)) {
    const title = /^## (.*)/.exec(part)?.[1];
    if (title) sections.set(title, part);
  }
  return sections;
}

test('the default skill teaches fields and behaviour, with the worked patterns behind it', async () => {
  const skill = await shippedSkill();
  const section = [...sectionsOf(skill)].find(([title]) => /^Fields and behaviour/.test(title))?.[1];
  assert.ok(section, 'SKILL.md lost its "Fields and behaviour" section');
  // Each rule is pinned by the thing it tells the agent to DO, so a rewording stays free.
  const rules = [
    { name: 'live versus set once', pattern: /Live or set once/ },
    { name: 'a live press is a button with an adjust', pattern: /"adjust"/ },
    { name: 'set-once words are hidden word sources', pattern: /"ftype": "hidden"[\s\S]*noacg-data-source/ },
    { name: 'a counter is a number field', pattern: /counter is a number[\s\S]*`number` field/i },
    { name: 'a default is a safe sample or empty', pattern: /safe sample or empty/i },
    { name: 'the common behaviour patterns', pattern: /§5e/ },
  ];
  for (const rule of rules) assert.match(section, rule.pattern, `"Fields and behaviour" no longer teaches: ${rule.name}`);

  const contract = (await readDoc('contract')).replace(/\r\n/g, '\n');
  const patterns = /### 5e\. [^\n]*\n([\s\S]*?)\n## /.exec(contract)?.[1];
  assert.ok(patterns, 'references/contract.md has no §5e worked patterns');
  for (const [name, token] of [
    ['an optional line that collapses', 'collapses when its field is empty'],
    ['a state word from a hidden source', 'hidden word source'],
    ['a second state group', 'second state group'],
    ['a graphic ending its own timed state', "noacgDispatch('timerEnd')"],
    ['a timer arrow', '"trigger": "timer"'],
    ['an action in every state', 'press in every state'],
  ]) assert.ok(patterns.includes(token), `§5e lost its pattern for ${name} ("${token}")`);
});

test('the default skill names no house look: no palette, face, size or timing rule', async () => {
  const skill = await shippedSkill();
  // The opt-in section NAMES the guidelines' topics ("type, colour, placement and motion") - that
  // is a pointer, not a rule - so everything else is the default text the agent always reads.
  const defaults = [...sectionsOf(skill)].filter(([title]) => !/opt-in/i.test(title)).map(([, body]) => body).join('\n');
  const houseRules = [
    { name: 'a colour value', pattern: /#[0-9a-f]{3,8}\b/i },
    { name: 'a pixel size', pattern: /\b\d+\s?px\b/i },
    { name: 'a duration', pattern: /\b\d+(\.\d+)?\s?(-\s?\d+(\.\d+)?\s?)?(s|ms)\b(?!\w)/ },
    { name: 'a typeface', pattern: /\b(Inter|Playfair|Oswald|Montserrat|Roboto|Bebas|Helvetica|Arial)\b/ },
    { name: 'a house palette word', pattern: /\b(amber|navy|gold|volt)\b/i },
  ];
  for (const rule of houseRules) {
    assert.doesNotMatch(defaults, rule.pattern, `the default SKILL.md text carries ${rule.name} - taste belongs in the opt-in guidelines`);
  }
  // Nor a design pass in the loop: no intent step, no critique step, no guidelines read.
  const loop = sectionsOf(skill).get('The loop');
  assert.ok(loop, 'SKILL.md lost "The loop"');
  assert.doesNotMatch(loop, /critique|design-notes|design intent|guidelines/i, 'the default loop runs a design step nobody asked for');

  // The contract's frame section once carried "entrances 0.5-1.4 s", which made a gala agent cut
  // the slower build it wanted (docs/research/plugin-graphics-quality-2026-10-02). It keeps the
  // frame-rate rule and leaves the timing to the author.
  const frame = /## 6\. Frame, safety, legibility\n([\s\S]*?)\n## /.exec((await readDoc('contract')).replace(/\r\n/g, '\n'))?.[1];
  assert.ok(frame, 'references/contract.md has no "6. Frame, safety, legibility" section');
  assert.match(frame, /transform/, 'the frame section lost the frame-rate rule');
  assert.doesNotMatch(frame, /\d(\.\d+)?\s?-\s?\d(\.\d+)?\s?s\b/, 'the contract states a motion duration range again');
});

test('the opt-in tools exist, are off by default, and are reachable in both hosts', async () => {
  const skill = await shippedSkill();
  const optIn = [...sectionsOf(skill)].find(([title]) => /opt-in/i.test(title))?.[1];
  assert.ok(optIn, 'SKILL.md lost its opt-in section');
  assert.match(optIn, /OFF unless the user asks/, 'the opt-in section no longer says the tools are off by default');
  assert.match(optIn, /When none is on, do not open their files/, 'the default no longer keeps the opt-in files closed');
  // Sharing is never offered: only the user's own request switches it on (docs/AGENT_SAVE.md §8).
  assert.match(optIn, /Never offer it, mention it, suggest it or ask\s+about it otherwise/, 'the share tool may be offered');

  for (const [file, word] of [['critique.md', 'critique'], ['design-notes.md', 'guidelines'], ['share.md', 'share']]) {
    const text = (await fs.readFile(path.join(skillDir(), 'references', file), 'utf8')).replace(/\r\n/g, '\n');
    assert.match(text.split('\n')[0], /OPT-IN/, `references/${file} no longer says on its first line that it is opt-in`);
    assert.ok(optIn.includes(`references/${file}`), `the opt-in section no longer points at references/${file} (${word})`);
  }
  // Codex loads skills, not commands, so every switch must also work as words: a request, or a
  // line in the user's own project instructions (which both hosts load with no plugin cost).
  assert.match(optIn, /"critique my\s+graphic"/, 'the critique can no longer be asked for in plain words');
  assert.match(optIn, /`NoaCG design guidelines: on`/, 'the guidelines switch lost its project-instructions line');
  // Claude Code also gets them as flags on /noacg:graphic, which is the plugin's skill itself.
  assert.match(optIn, /--guidelines/, '/noacg:graphic lost its --guidelines switch');
  assert.match(optIn, /--critique/, '/noacg:graphic lost its --critique switch');
});

test('the plugin costs an unrelated session one short skill entry', async () => {
  // docs/AGENT_CLI.md "What a session pays": a skill's description sits in every session where
  // the plugin is enabled. The plugin keeps ONE skill and no command: the skill is named `graphic`,
  // so it is /noacg:graphic itself (Claude Code namespaces plugin skills). 0.10.1 listed a 483-
  // character skill and a 104-character command; raising the ceiling is a deliberate decision.
  const description = (text) => {
    const front = /^---\n([\s\S]*?)\n---/.exec(text.replace(/\r\n/g, '\n'))?.[1] ?? '';
    const folded = /description: >-\n((?: {2}.*\n?)+)/.exec(front)?.[1];
    return (folded ? folded.split('\n').map((line) => line.trim()).join(' ') : /description: (.*)/.exec(front)?.[1] ?? '').trim();
  };
  const plugin = path.join(here, '..', 'plugin');
  assert.deepEqual(await fs.readdir(path.join(plugin, 'skills')), ['noacg-graphic'], 'the plugin ships a second skill');
  await assert.rejects(fs.access(path.join(plugin, 'commands')), 'the plugin ships a command again: the skill is /noacg:graphic');
  const copy = await fs.readFile(path.join(plugin, 'skills', 'noacg-graphic', 'SKILL.md'), 'utf8');
  assert.match(copy, /^---\r?\nname: graphic\r?\n/, 'the plugin skill is no longer named graphic, so /noacg:graphic stops working');
  const skill = description(await shippedSkill());
  assert.ok(skill.length > 100 && skill.length <= 260, `the skill description is ${skill.length} characters (ceiling 260)`);
});

// ---------------------------------------------------------------- a re-derived steps count
// The SPX `steps` is derived from the machine's default path (`spxSteps`), and the bridge's
// normalize re-derives it (e2e/bridge.spec.ts pins that half in a real bridge). This half is what
// the AUTHOR sees: the number lives in their own html, so rewriting it has to be as visible as
// every other regeneration - in the summary, and on the file it changed. Before the re-sync an
// agent that grew a scaffold's path from two waypoints to three kept "steps": "1", validate was
// green, and the OGraf stepCount told a playout server there was no Continue to press.
test('a re-derived SPX steps count is reported, in the summary and on the html it rewrote', async (t) => {
  const { describeNormalize, regenerateInPlace } = await import('../dist/commands/validate.js');
  const dir = await tmpdir();
  const definition = (steps) => `<html><head><script id="spx-template-definition">window.SPXGCTemplateDefinition = { "steps": "${steps}", "DataFields": [] };</script></head><body></body></html>`;
  await fs.mkdir(path.join(dir, 'css'));
  await fs.mkdir(path.join(dir, 'js'));
  await fs.writeFile(path.join(dir, 'grown_path.html'), definition(1));
  await fs.writeFile(path.join(dir, 'css', 'template.css'), 'body{}');
  await fs.writeFile(path.join(dir, 'js', 'template.js'), 'var NOACG_ANIM = {};');
  const template = { name: 'grown_path', resolution: { width: 1920, height: 1080 } };
  const normalized = { converted: false, dataRegion: true, note: 'already data', stepsRewritten: { from: '1', to: '2' } };

  const summary = describeNormalize(normalized);
  for (const line of summary) t.diagnostic(line);
  assert.equal(summary.length, 1, 'a data-shaped region says nothing about its region, only about the count');
  assert.match(summary[0], /^Steps: .*to 2 \(the source said 1\).*default path/);
  assert.deepEqual(describeNormalize({ ...normalized, stepsRewritten: undefined }), [], 'no rewrite, no line');

  // What the bridge exports for the normalized template: the same sources, the definition derived.
  const zip = new JSZip();
  zip.file('grown_path/grown_path.html', definition(2));
  zip.file('grown_path/css/template.css', 'body{}');
  zip.file('grown_path/js/template.js', 'var NOACG_ANIM = {};');
  zip.file('grown_path/grown_path.ograf.json', JSON.stringify({ stepCount: 2 }));
  const bridge = { exportPackage: async () => zip.generateAsync({ type: 'uint8array' }) };
  const before = { 'grown_path.html': definition(1), 'css/template.css': 'body{}', 'js/template.js': 'var NOACG_ANIM = {};' };
  const changes = await regenerateInPlace(bridge, dir, template, { before, normalized });
  for (const c of changes) t.diagnostic(`changed: ${c}`);
  assert.deepEqual(changes, ['grown_path.html (SPX "steps" 1 -> 2, derived from the default path)']);
  assert.match(await fs.readFile(path.join(dir, 'grown_path.html'), 'utf8'), /"steps": "2"/);
});

test('docs skill prints the procedure without its front matter, for a session with no plugin', async () => {
  const { readDoc, docTopics } = await import('../dist/commands/docs.js');
  assert.ok(docTopics().includes('skill'));
  const text = await readDoc('skill');
  assert.match(text, /^Each `references\/<name>\.md` this text names prints with `noacg docs <name>`.*\n\n# Make a NoaCG graphic\r?\n/);
  // The references it names print too, though only the main ones are listed; nothing else does.
  assert.match(await readDoc('setup'), /^# Local toolkit setup/);
  await assert.rejects(readDoc('../SKILL'), /Unknown topic/);
  await assert.rejects(readDoc('nonexistent'), /Unknown topic/);
  // The delivery rules the Downloads prompt relies on: one save, the same command again, pending Install.
  assert.match(text, /save them ALL in ONE\s+command/);
  assert.match(text, /Run the SAME\s+command again/);
  assert.match(text, /pending Install/);
});

// AC-9 (docs/work-specs/pinned-live-controls/spec.md): the derived panel as PREP and LIVE, and the
// validate finding that fires only on a declared live operation left unmet. Both rules live in the
// app's src (the bridge runs them), read here directly: Node strips the types.
const { livePanel } = await import('../../src/control/livePanel.ts');
const { missingLiveControls } = await import('../../src/validation/liveControlsCheck.ts');
const { describeInspection } = await import('../dist/commands/inspect.js');

const select = (key, label, values) => ({ key, label, kind: 'select', defaultValue: values[0], options: values.map((v) => ({ label: v, value: v })) });
const inspection = (descriptors, buttons, pathEvents) => ({
  descriptors,
  buttons,
  stateGroups: [],
  steps: { count: 2, stepped: true },
  panel: livePanel(descriptors, buttons, new Set(pathEvents)),
  notes: [],
});

test('inspect prints the panel as LIVE and PREP: a pick group as its options, a number with its stepper', () => {
  const descriptors = [
    { key: 'f0', label: 'Question', kind: 'text', defaultValue: '' },
    select('f1', 'Answers shown', ['2', '3', '4']),
    select('f2', 'Selected answer', ['A', 'B', 'C', 'D']),
    select('f3', 'Correct answer', ['A', 'B', 'C', 'D']),
    { key: 'f4', label: 'Score', kind: 'number', defaultValue: 0 },
  ];
  // `judge` is on the default path, so its Correct answer stays preparation, never a pick.
  const buttons = [
    { event: 'select', label: 'Select answer', payload: ['f2'] },
    { event: 'judge', label: 'Reveal correct', payload: ['f3'] },
  ];
  const text = describeInspection(inspection(descriptors, buttons, ['judge']));
  assert.ok(
    text.includes('LIVE\n  Select answer: A | B | C | D\n  Reveal correct\n  Score -/+\nPREP\n  Question, Answers shown, Correct answer, Score'),
    text,
  );
  assert.ok(!text.includes('Advice:'), 'a panel with live controls carries no advice');
});

test('inspect advises once when LIVE holds nothing but the transport verbs', () => {
  const text = describeInspection(inspection([{ key: 'f0', label: 'Question', kind: 'text', defaultValue: '' }, select('f1', 'Answers shown', ['2', '3', '4'])], [], []));
  assert.ok(text.includes('LIVE\n  Take / Update / Next / Out only\nPREP\n  Question, Answers shown'), text);
  assert.equal(text.split('\n').filter((l) => l.startsWith('Advice:')).length, 1, text);
});

test('inspect prints what a production can adjust, and an older bridge that says nothing prints nothing', () => {
  const text = describeInspection({ ...inspection([], [], []), adjustable: 'place and size, typeface, accent colour' });
  assert.equal(text.split('\n').filter((l) => l === 'Adjustable: place and size, typeface, accent colour').length, 1, text);
  assert.ok(!describeInspection(inspection([], [], [])).includes('Adjustable:'));
});

const arrow = (event) => ({ from: 'a', to: 'b', trigger: 'operator', event });
const machine = (events, controls) => ({ groups: [{ id: 'main', initial: 'off', defaultPath: ['a', 'b'], states: [], transitions: events.map(arrow) }], ...(controls ? { controls } : {}) });
const live = (m, fields) => missingLiveControls(m, new Set(fields)).map((i) => `${i.rule}: ${i.message}`);

test('validate flags an operator arrow with no controls entry as controls-missing-live', () => {
  const found = live(machine(['reveal', 'next']), ['f0']);
  assert.equal(found.length, 1, found.join('\n'));
  assert.match(found[0], /^controls-missing-live: .*"reveal"/);
});

test('validate flags a set or adjust naming a field the graphic does not have', () => {
  const found = live(machine(['reset', 'goal'], [{ event: 'reset', set: { f9: '0' } }, { event: 'goal', adjust: { f8: 1 } }]), ['f0']);
  assert.deepEqual(found, [
    'controls-missing-live: Machine controls: "reset" sets "f9", but no field has that id.',
    'controls-missing-live: Machine controls: "goal" adjusts "f8", but no field has that id.',
  ]);
});

test('validate never flags a prep field for having no control: Answers shown, a clock duration, a stepped number', () => {
  // A quiz show: Answers shown is a few-option field typed before air.
  assert.deepEqual(live(machine(['judge'], [{ event: 'judge', label: 'Reveal correct', payload: ['f3'] }]), ['f0', 'f1', 'f3']), []);
  // A clock: the duration is set once; Pause and Resume are its declared controls.
  assert.deepEqual(live(machine(['pause', 'resume'], [{ event: 'pause' }, { event: 'resume' }]), ['f0', 'f2']), []);
  // A score with no +1 control: its number already has the derived stepper.
  assert.deepEqual(live(machine([]), ['f0', 'f4']), []);
});
