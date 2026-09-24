// Smoke: the built CLI against a live NoaCG bridge (NOACG_URL). Skips when no bridge answers -
// an offline `npm test` is honest, not green by accident. Run `npm run build` first.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { test } from 'node:test';

const exec = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const cli = path.join(here, '..', 'dist', 'index.js');
const url = process.env.NOACG_URL?.replace(/\/+$/, '');

async function bridgeUp() {
  if (!url) return false;
  try {
    const res = await fetch(`${url}/bridge`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function run(args, env = {}) {
  try {
    const { stdout, stderr } = await exec(process.execPath, [cli, ...args], { env: { ...process.env, ...env }, maxBuffer: 64 * 1024 * 1024 });
    return { code: 0, stdout, stderr };
  } catch (e) {
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

const up = await bridgeUp();
const skip = up ? false : `no NoaCG bridge at NOACG_URL=${url ?? '(unset)'} - start a dev server and set NOACG_URL`;

test('help prints usage', async () => {
  const r = await run(['--help']);
  assert.match(r.stdout, /Usage: noacg <command>/);
});

test('types lists the registry', { skip }, async () => {
  const r = await run(['types', '--json']);
  assert.equal(r.code, 0, r.stderr);
  const json = JSON.parse(r.stdout);
  assert.ok(json.types.length >= 30, `expected >= 30 types, got ${json.types.length}`);
  assert.ok(json.types.some((t) => t.id === 'scoreboard'));
});

test('scaffold -> validate -> inspect -> screenshot on a neutral scoreboard', { skip }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'noacg-smoke-'));
  const pkg = path.join(dir, 'football-scoreboard');
  const s = await run(['scaffold', '--type', 'scoreboard', '--design', 'neutral', '--name', 'Football scoreboard', '--out', pkg, '--json']);
  assert.equal(s.code, 0, s.stderr);
  const files = await fs.readdir(pkg);
  for (const expected of ['css', 'js', 'graphic.mjs', 'FIELDS.md']) assert.ok(files.includes(expected), `missing ${expected} in ${files.join(', ')}`);
  assert.ok(files.some((f) => f.endsWith('.ograf.json')), 'no manifest');
  assert.ok(files.some((f) => f.endsWith('.html') && f !== 'controlpanel.html'), 'no html source');

  const v = await run(['validate', pkg, '--json']);
  const vj = JSON.parse(v.stdout);
  assert.equal(vj.ok, true, `validate not ok: ${JSON.stringify(vj.validation?.merged?.errors)}`);
  assert.equal(v.code, 0);

  // The regenerate must keep the folder ONE graphic: the name given at scaffold lives in the
  // sources, so the re-read package keeps its slug - exactly one manifest, one source html, and a
  // second validate changes nothing. (A scaffold whose sources carried the design's own name once
  // came back as a second <slug>.html + .ograf.json beside the first, 2026-08-22.)
  const once = await fs.readdir(pkg);
  assert.deepEqual(once.filter((f) => f.endsWith('.ograf.json')), ['football_scoreboard.ograf.json'], `manifests after validate: ${once.join(', ')}`);
  assert.deepEqual(once.filter((f) => f.endsWith('.html') && f !== 'controlpanel.html'), ['football_scoreboard.html'], `html after validate: ${once.join(', ')}`);
  const again = await run(['validate', pkg, '--json', '--no-bench']);
  assert.equal(again.code, 0, again.stderr);
  assert.deepEqual(JSON.parse(again.stdout).sourceChanges, [], 'a second validate must be a no-op on the sources');
  assert.deepEqual((await fs.readdir(pkg)).sort(), once.sort(), 'a second validate must not add or remove files');

  const i = await run(['inspect', pkg, '--json']);
  const ij = JSON.parse(i.stdout);
  assert.equal(ij.inspection.descriptors.length, 4);

  const png = path.join(dir, 'onair.png');
  const sh = await run(['screenshot', pkg, '--state', 'onair', '--out', png, '--json']);
  assert.equal(sh.code, 0, sh.stderr);
  const stat = await fs.stat(png);
  assert.ok(stat.size > 1024, `png too small: ${stat.size}`);
});

test('a typeless graphic from a field list validates', { skip }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'noacg-smoke-'));
  const pkg = path.join(dir, 'now-playing');
  const s = await run(['scaffold', '--fields', 'Artist:text=Anna,Song:text=Northern Lights,Progress:number=42', '--name', 'Now playing', '--out', pkg, '--json']);
  assert.equal(s.code, 0, s.stderr);
  const v = await run(['validate', pkg, '--json']);
  const vj = JSON.parse(v.stdout);
  assert.equal(vj.ok, true, `validate not ok: ${JSON.stringify(vj.validation?.merged?.errors)}`);
  const i = await run(['inspect', pkg, '--json']);
  assert.equal(JSON.parse(i.stdout).inspection.descriptors.length, 3);
});

test('save drives the whole client path and stops at the server', { skip }, async () => {
  // `save` is the one command whose end is not in this repository's control: everything up to the
  // POST runs here (read the package, normalize it in the bridge's own browser, run the static
  // gate and the runtime bench, build the library record), and only the last hop needs an account
  // and a real backend. A dev server has neither, so this asserts the CLIENT half - which is the
  // half that can regress - and asserts that the refusal it gets is the DOCUMENTED one rather than
  // a crash: `reason: 'refused'`, exit 1, the validation attached so an agent can still read it.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'noacg-smoke-'));
  const pkg = path.join(dir, 'save-probe');
  const s = await run(['scaffold', '--fields', 'Headline:text=Hello', '--name', 'Save probe', '--out', pkg, '--json']);
  assert.equal(s.code, 0, s.stderr);

  const key = `noacg_ak_${'0'.repeat(32)}`;
  const r = await run(['save', pkg, '--json', '--no-bench'], { NOACG_AGENT_KEY: key });
  const json = JSON.parse(r.stdout);
  assert.equal(r.code, 1, `expected the documented refusal, got exit ${r.code}: ${r.stdout}`);
  assert.equal(json.ok, false);
  assert.equal(json.reason, 'refused', `a bogus key must be REFUSED, not a crash: ${JSON.stringify(json)}`);
  // The refusal came from the server hop, which means everything before it succeeded.
  assert.equal(json.validation?.merged?.errors?.length, 0, `the graphic validated before the save was attempted: ${JSON.stringify(json.validation?.merged?.errors)}`);
  assert.match(json.error, /^Not saved:/);
});

test('pack --save validates every graphic, writes the file, and stops at the server', { skip }, async () => {
  // The package twin of the save smoke above: two scaffolded graphics, a rundown naming both,
  // `--out` AND `--save`. The file is written before the send, so it proves the whole client
  // half - read, normalize, gate, packEntry, the rundown check - and the send is refused by a
  // dev server with no account backend, which must be the documented refusal, not a crash.
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'noacg-smoke-'));
  const a = path.join(dir, 'strap');
  const b = path.join(dir, 'headline');
  for (const [out, name] of [[a, 'Pack strap'], [b, 'Pack headline']]) {
    const s = await run(['scaffold', '--fields', 'Headline:text=Hello', '--name', name, '--out', out, '--json']);
    assert.equal(s.code, 0, s.stderr);
  }
  const rundown = path.join(dir, 'cues.json');
  await fs.writeFile(rundown, JSON.stringify([
    { graphic: 'Pack headline', label: 'Open', values: { f0: 'TONIGHT' } },
    { graphic: 'Pack strap', label: 'Host' },
  ]));
  const file = path.join(dir, 'show.noacgpack.json');
  const key = `noacg_ak_${'0'.repeat(32)}`;
  const r = await run(
    ['pack', a, b, '--name', 'Smoke show', '--rundown', rundown, '--layer', '10', '--out', file, '--save', '--no-bench', '--json'],
    { NOACG_AGENT_KEY: key },
  );
  const json = JSON.parse(r.stdout);
  assert.equal(r.code, 1, `expected the documented refusal, got exit ${r.code}: ${r.stdout}`);
  assert.equal(json.reason, 'refused', `the send must be REFUSED by a backend-less server, not crash: ${JSON.stringify(json)}`);
  assert.match(json.error, /^Not sent:/);

  const pack = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(pack.format, 'noacg-pack');
  assert.equal(pack.name, 'Smoke show');
  assert.deepEqual(pack.graphics.map((g) => [g.name, g.layer]), [['Pack strap', 10], ['Pack headline', 11]]);
  assert.deepEqual(pack.cues.map((c) => c.graphic), ['Pack headline', 'Pack strap']);
});

test('a third-party OGraf package is inspected and driven in the OGraf host', { skip }, async () => {
  // The repo's hand-written fixture (e2e/fixtures/ograf/scorebug-demo): not a NoaCG template -
  // semantic keys, two custom actions, two steps. `noacg validate` must mount it in the host
  // and drive load / update / every action / play / stop with 2xx ReturnPayloads.
  const fixture = path.join(here, '..', '..', 'e2e', 'fixtures', 'ograf', 'scorebug-demo');
  const v = await run(['validate', fixture, '--json']);
  const vj = JSON.parse(v.stdout);
  assert.equal(vj.ok, true, `validate not ok: ${JSON.stringify(vj.errors)}`);
  assert.equal(v.code, 0);
  assert.ok(Array.isArray(vj.steps) && vj.steps.length >= 6, `expected the host steps, got ${JSON.stringify(vj.steps)}`);
  assert.ok(vj.steps.every((s) => s.statusCode < 400), `a host step failed: ${JSON.stringify(vj.steps)}`);
  assert.equal(vj.contract.descriptors.length, 4);
  assert.equal(vj.contract.buttons.length, 2);
  const i = await run(['inspect', fixture, '--json']);
  assert.equal(i.code, 0, i.stderr);
  assert.equal(JSON.parse(i.stdout).inspection.descriptors.length, 4);
});
