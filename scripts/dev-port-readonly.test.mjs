// Asking for a dev port never reserves one, and a full registry never stops an install or a build.
// guards: scripts/dev-port.mjs, scripts/port-registry.mjs, scripts/port-probe.mjs, vite.config.ts, playwright.config.ts, playwright.catalog.config.ts, playwright.live.config.ts
//
// On 2026-10-08 a fresh worktree failed `npm ci` in postinstall and `npm run build` failed three
// node tests, all with "No dev-server port is available": 71 worktrees held all 60 ports, and
// every config load, every install and every `vite build` reserved one. Only a server start
// reserves now (scripts/dev-port.mjs). These cases pin both halves: a linked worktree facing a
// FULL registry still runs postinstall and answers every question, and loading every config that
// names a port writes no ticket. The server-start half is in port-registry.test.mjs.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { PORT_RANGE, SLOT_COUNT, normalizeRoot, ticketPath } from './port-registry.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODULES = ['dev-port.mjs', 'port-registry.mjs', 'worktree-cleanup-lib.mjs', 'port-probe.mjs'];

/** The environment a child gets: none of the overrides that would bypass the registry. */
function cleanEnv() {
  const env = { ...process.env };
  delete env.DEV_PORT;
  delete env.NOACG_DEV_PORT_REGISTRY;
  return env;
}

function git(cwd, ...args) {
  const res = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(res.status, 0, `git ${args.join(' ')}: ${res.stderr}`);
  return res.stdout.trim();
}

/** Ticket files and their mtimes - what "the registry is unchanged" means. */
function snapshot(dir) {
  try {
    return readdirSync(dir).sort().map((name) => `${name}@${statSync(join(dir, name)).mtimeMs}`);
  } catch {
    return [];
  }
}

/**
 * A scratch repository with one fresh linked worktree carrying this checkout's port modules, and
 * a registry whose every slot is held by another active checkout (the primary, which git always
 * lists). `ageMs` back-dates every claim.
 */
function fullRegistryRepo(t, ageMs = 0) {
  const root = mkdtempSync(join(tmpdir(), 'noacg-full-registry-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const primary = join(root, 'repo');
  mkdirSync(join(primary, 'scripts'), { recursive: true });
  git(root, 'init', '--initial-branch=main', primary);
  git(primary, 'config', 'user.name', 'Port Tests');
  git(primary, 'config', 'user.email', 'port-tests@example.invalid');
  for (const name of MODULES) copyFileSync(join(repoRoot, 'scripts', name), join(primary, 'scripts', name));
  writeFileSync(join(primary, '.gitignore'), '.claude/\n');
  git(primary, 'add', '.');
  git(primary, 'commit', '-m', 'port modules');
  const fresh = join(primary, '.claude', 'worktrees', 'fresh');
  git(primary, 'worktree', 'add', '-b', 'claude/fresh', fresh);

  const registry = join(primary, '.git', 'noacg-dev-ports');
  mkdirSync(registry, { recursive: true });
  const holder = normalizeRoot(primary);
  const when = (Date.now() - ageMs) / 1000;
  for (let k = 0; k < SLOT_COUNT; k += 1) {
    const port = PORT_RANGE.first + k * PORT_RANGE.stride;
    writeFileSync(ticketPath(registry, port), JSON.stringify({ port, livePort: port + 1, root: holder, preferred: port, createdAt: 'x' }));
    utimesSync(ticketPath(registry, port), when, when);
  }
  return { primary, fresh, registry };
}

function node(cwd, args) {
  return spawnSync(process.execPath, args, { cwd, encoding: 'utf8', env: cleanEnv() });
}

test('with every port reserved, postinstall still succeeds and asking reserves nothing', (t) => {
  const { fresh, registry } = fullRegistryRepo(t);
  const before = snapshot(registry);

  const postinstall = node(fresh, [join(fresh, 'scripts', 'dev-port.mjs')]);
  assert.equal(postinstall.status, 0, postinstall.stderr);
  assert.match(postinstall.stdout.trim(), /^\d+$/);

  const asked = node(fresh, [
    '--input-type=module',
    '-e',
    `import { devPorts, devPort, livePort } from ${JSON.stringify(pathToFileURL(join(fresh, 'scripts', 'dev-port.mjs')).href)};
     const r = devPorts();
     process.stdout.write(JSON.stringify({ ticket: r.ticket, port: devPort(), live: livePort(), source: r.source }));`,
  ]);
  assert.equal(asked.status, 0, asked.stderr);
  const record = JSON.parse(asked.stdout);
  assert.equal(record.ticket, null);
  // Every port is held by another live worktree, so the honest answer is "none" - never one of
  // theirs, which a waiting suite would adopt.
  assert.equal(record.port, 0);
  assert.equal(record.live, 0);
  assert.match(record.source, /no port free/);

  assert.deepEqual(snapshot(registry), before, 'asking wrote to the registry');
});

test('with every port reserved and claimed recently, a server start refuses and says why', (t) => {
  const { fresh, registry } = fullRegistryRepo(t);
  const before = snapshot(registry);
  const claim = node(fresh, [join(fresh, 'scripts', 'dev-port.mjs'), '--claim']);
  assert.notEqual(claim.status, 0);
  assert.match(claim.stderr, /none is idle/);
  assert.deepEqual(snapshot(registry), before);
});

test('with every port reserved but idle, a server start takes one back', (t) => {
  const { fresh, registry } = fullRegistryRepo(t, 60 * 60_000);
  const claim = node(fresh, [join(fresh, 'scripts', 'dev-port.mjs'), '--claim']);
  assert.equal(claim.status, 0, claim.stderr);
  const port = Number(claim.stdout.trim());
  const ticket = JSON.parse(readFileSync(ticketPath(registry, port), 'utf8'));
  assert.equal(ticket.root, normalizeRoot(fresh));
  assert.equal(readdirSync(registry).filter((name) => /^\d+\.json$/.test(name)).length, SLOT_COUNT);
});

test('loading every config that names a port reserves nothing', () => {
  // In this checkout, against the real registry - which is the point: a regression here mints a
  // ticket the way the 2026-10-08 build did. In the primary checkout (and on CI) no ticket is
  // ever needed, so the case holds trivially there; it bites in a linked worktree.
  const script = `
    import { readdirSync, statSync } from 'node:fs';
    import { join } from 'node:path';
    import { registryDir } from './scripts/dev-port.mjs';
    const dir = registryDir();
    const snap = () => { try { return readdirSync(dir).sort().map((n) => n + '@' + statSync(join(dir, n)).mtimeMs); } catch { return []; } };
    const before = snap();
    await import('./playwright.config.ts');
    await import('./playwright.catalog.config.ts');
    await import('./playwright.live.config.ts');
    const { resolveConfig } = await import('vite');
    await resolveConfig({ configFile: 'vite.config.ts', logLevel: 'silent' }, 'build');
    await resolveConfig({ configFile: 'vite.config.ts', logLevel: 'silent', appType: 'custom', server: { middlewareMode: true } }, 'serve');
    process.stdout.write(JSON.stringify({ before, after: snap() }));
  `;
  const res = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: repoRoot, encoding: 'utf8', env: cleanEnv() });
  assert.equal(res.status, 0, res.stderr);
  const { before, after } = JSON.parse(res.stdout.slice(res.stdout.indexOf('{"before"')));
  assert.deepEqual(after, before, 'a config load or a build reserved a dev port');
});
