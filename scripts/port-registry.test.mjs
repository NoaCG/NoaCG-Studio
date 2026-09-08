// gate: factory
// (binds ports and spawns servers: seconds on a runner, a cost on every laptop build)
//
// Tests for the dev-server port registry (scripts/port-registry.mjs) and for the tooling that
// reads its result (scripts/dev-port.mjs). Run with `npm run test:ports`.
//
// Node's own test runner, no new dependency - this is build tooling, and the repo has no unit
// suite for the app itself (CLAUDE.md). Every case here is one of the failure modes the
// registry exists to handle; the collision case uses the two REAL worktree paths that collided
// on this machine, so a future change to the hash cannot quietly un-cover it.

import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  PORT_RANGE,
  SLOT_COUNT,
  allocatePort,
  candidatePort,
  listTickets,
  normalizeRoot,
  preferredPort,
  pruneStaleReservations,
  releaseReservation,
  ticketPath,
} from './port-registry.mjs';
import { isPortBusy } from './port-probe.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const temps = [];
let childSeq = 0;
function tempRegistry() {
  const dir = mkdtempSync(join(tmpdir(), 'noacg-ports-'));
  temps.push(dir);
  return join(dir, 'noacg-dev-ports');
}
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/** Allocate with every collaborator defaulted to "nothing else exists". */
function allocate(registryDir, root, overrides = {}) {
  return allocatePort({
    root,
    registryDir,
    isRootActive: () => true,
    isPortBusy: () => false,
    now: () => '2026-07-22T00:00:00.000Z',
    ...overrides,
  });
}

// Two worktree paths from this machine that really do hash to the same slot - the exact
// situation that used to leave the second worktree unable to start.
const COLLIDING_A = 'C:/claude/NoaCG-Studio/.claude/worktrees/hosted-control-entries-e65c80';
const COLLIDING_B = 'C:/claude/NoaCG-Studio/.claude/worktrees/noacg-studio-core-editor-c8d9aa';

describe('preferred ports', () => {
  it('gives two different worktrees their own preferred port', () => {
    const a = 'C:/claude/NoaCG-Studio/.claude/worktrees/adoring-panini-cf2655';
    const b = 'C:/claude/NoaCG-Studio/.claude/worktrees/noacg-studio-ux-review-9e0c2b';
    assert.notEqual(preferredPort(a), preferredPort(b));

    const registry = tempRegistry();
    const first = allocate(registry, a);
    const second = allocate(registry, b);
    assert.equal(first.port, preferredPort(a));
    assert.equal(second.port, preferredPort(b));
    assert.equal(first.livePort, first.port + 1);
  });

  it('keeps every port inside the approved even-numbered range', () => {
    for (let k = 0; k < SLOT_COUNT; k++) {
      const port = candidatePort(COLLIDING_A, k);
      assert.ok(port >= PORT_RANGE.first && port <= PORT_RANGE.last, `${port} out of range`);
      assert.equal((port - PORT_RANGE.first) % PORT_RANGE.stride, 0);
    }
    // The walk visits every slot exactly once, so "no free port" really means none.
    const walked = new Set(Array.from({ length: SLOT_COUNT }, (_, k) => candidatePort(COLLIDING_A, k)));
    assert.equal(walked.size, SLOT_COUNT);
  });
});

describe('hash collision', () => {
  it('falls back to another port when two worktrees prefer the same one', () => {
    assert.equal(preferredPort(COLLIDING_A), preferredPort(COLLIDING_B), 'fixture is no longer a collision');

    const registry = tempRegistry();
    const first = allocate(registry, COLLIDING_A);
    const second = allocate(registry, COLLIDING_B);

    assert.equal(first.port, preferredPort(COLLIDING_A));
    assert.notEqual(second.port, first.port);
    assert.notEqual(second.livePort, first.livePort);
    assert.equal(second.preferred, first.port, 'the preference is still recorded on the ticket');
    assert.deepEqual(
      listTickets(registry).map((t) => t.port),
      [first.port, second.port].sort((x, y) => x - y),
    );
  });

  it('hands the same worktree the same port on every later call', () => {
    const registry = tempRegistry();
    allocate(registry, COLLIDING_A);
    const second = allocate(registry, COLLIDING_B);
    assert.equal(allocate(registry, COLLIDING_B).port, second.port);
    assert.equal(allocate(registry, COLLIDING_B).reused, true);
  });
});

describe('occupied ports', () => {
  it('walks past a preferred port a foreign process is listening on', () => {
    const registry = tempRegistry();
    const preferred = preferredPort(COLLIDING_A);
    const result = allocate(registry, COLLIDING_A, { isPortBusy: (p) => p === preferred });

    assert.notEqual(result.port, preferred);
    assert.equal(existsSync(ticketPath(registry, preferred)), false, 'the claim on the busy port was given back');
    assert.deepEqual(listTickets(registry).map((t) => t.port), [result.port]);
  });

  it('walks past a port whose LIVE-e2e neighbour is occupied', () => {
    const registry = tempRegistry();
    const preferred = preferredPort(COLLIDING_A);
    const result = allocate(registry, COLLIDING_A, { isPortBusy: (p) => p === preferred + 1 });
    assert.notEqual(result.port, preferred);
  });

  it('errors clearly when nothing in the range is available', () => {
    const registry = tempRegistry();
    assert.throws(
      () => allocate(registry, COLLIDING_A, { isPortBusy: () => true }),
      (err) => /No dev-server port is available/.test(err.message) && /5180-5298/.test(err.message),
    );
    assert.deepEqual(listTickets(registry), [], 'a failed allocation leaves no claims behind');
  });
});

describe('stale reservations', () => {
  /** Hand-write a ticket, as a previous run of another worktree would have left it. */
  function seedTicket(registryDir, port, root) {
    mkdirSync(registryDir, { recursive: true });
    const ticket = { port, livePort: port + 1, root, preferred: port, createdAt: '2026-07-01T00:00:00.000Z' };
    writeFileSync(ticketPath(registryDir, port), JSON.stringify(ticket, null, 2) + '\n');
  }

  it('reclaims a port whose worktree is gone', () => {
    const registry = tempRegistry();
    const preferred = preferredPort(COLLIDING_A);
    seedTicket(registry, preferred, 'C:/claude/NoaCG-Studio/.claude/worktrees/deleted-long-ago');

    const result = allocate(registry, COLLIDING_A, { isRootActive: (path) => path !== 'C:/claude/NoaCG-Studio/.claude/worktrees/deleted-long-ago' });
    assert.equal(result.port, preferred, 'the stale ticket did not block the preferred port');
    assert.deepEqual(listTickets(registry).map((t) => t.root), [result.root]);
  });

  it('leaves an ACTIVE worktree its port even when no server is running', () => {
    const registry = tempRegistry();
    const preferred = preferredPort(COLLIDING_A);
    seedTicket(registry, preferred, COLLIDING_B);

    const result = allocate(registry, COLLIDING_A); // isRootActive: everything is live
    assert.notEqual(result.port, preferred);
    assert.equal(readTicketRoot(registry, preferred), COLLIDING_B, 'the other worktree kept its reservation');
  });

  it('prunes only the dead reservations, and only on request for unreadable ones', () => {
    const registry = tempRegistry();
    seedTicket(registry, 5180, COLLIDING_A);
    seedTicket(registry, 5182, 'C:/gone');
    mkdirSync(registry, { recursive: true });
    writeFileSync(ticketPath(registry, 5184), '{ truncated');

    const removed = pruneStaleReservations({ registryDir: registry, isRootActive: (p) => p === COLLIDING_A });
    assert.deepEqual(removed.map((t) => t.port), [5182]);
    assert.deepEqual(listTickets(registry).map((t) => t.port), [5180, 5184]);

    const withCorrupt = pruneStaleReservations({ registryDir: registry, isRootActive: (p) => p === COLLIDING_A, includeCorrupt: true });
    assert.deepEqual(withCorrupt.map((t) => t.port), [5184]);
    assert.deepEqual(listTickets(registry).map((t) => t.port), [5180]);
  });

  it('releases only the caller\'s own reservations', () => {
    const registry = tempRegistry();
    seedTicket(registry, 5180, COLLIDING_A);
    seedTicket(registry, 5182, COLLIDING_B);
    assert.deepEqual(releaseReservation(registry, COLLIDING_B), [5182]);
    assert.deepEqual(listTickets(registry).map((t) => t.root), [COLLIDING_A]);
  });

  it('treats an unreadable ticket as occupied rather than deleting it mid-write', () => {
    const registry = tempRegistry();
    const preferred = preferredPort(COLLIDING_A);
    mkdirSync(registry, { recursive: true });
    writeFileSync(ticketPath(registry, preferred), '{"port":');

    const result = allocate(registry, COLLIDING_A);
    assert.notEqual(result.port, preferred);
    assert.equal(readFileSync(ticketPath(registry, preferred), 'utf8'), '{"port":');
  });
});

describe('simultaneous allocation', () => {
  it('gives six colliding worktrees six distinct ports when they all start at once', async () => {
    const registry = tempRegistry();
    // Real concurrency, not interleaved promises: the exclusive-create claim is what is under
    // test, and inside one process the synchronous fs calls could never race.
    const roots = collidingRoots(6);
    const preferred = preferredPort(roots[0]);
    const startAt = Date.now() + 1500;
    const results = await Promise.all(roots.map((root) => allocateInChild({ registry, root, startAt })));

    const ports = results.map((r) => r.port);
    assert.equal(new Set(ports).size, roots.length, `expected distinct ports, got ${ports.join(', ')}`);
    assert.ok(ports.includes(preferred), 'somebody got the contested preferred port');
    assert.equal(listTickets(registry).length, roots.length);
    // Everyone's ticket agrees with what their own process returned.
    for (const r of results) assert.equal(readTicketRoot(registry, r.port), r.root);
  });

  it('lands two tools in the SAME worktree on one port', async () => {
    const registry = tempRegistry();
    const root = COLLIDING_A;
    const startAt = Date.now() + 1500;
    // EIGHT, not the two the name describes. The walk steps 7 slots at a time and wraps, so a
    // process pushed far enough along it reaches a candidate NUMBERED BELOW the preferred port -
    // and that is the shape that used to make two tools disagree about which of the root's
    // tickets won. Three racers never walk that far: at three this case passed 100 runs in a row
    // on a machine where eight failed 8 times in 30.
    const results = await Promise.all(
      Array.from({ length: 8 }, () => allocateInChild({ registry, root, startAt })),
    );
    assert.equal(new Set(results.map((r) => r.port)).size, 1, 'a worktree must not end up with two ports');
    assert.equal(listTickets(registry).length, 1);
  });
});

describe('port probe', () => {
  /** Listen on ONE loopback family and hand back its port. */
  function listenOn(host) {
    return new Promise((resolvePromise, rejectPromise) => {
      const server = createServer();
      server.once('error', rejectPromise);
      server.listen(0, host, () => resolvePromise({ server, port: server.address().port }));
    });
  }

  // Vite binds [::1] and nothing on 127.0.0.1, so a v4-only probe reported every running dev
  // server as free - the allocator would hand out an occupied port and the e2e preflight guard
  // would wave through the server it exists to catch.
  for (const host of ['127.0.0.1', '::1']) {
    it(`sees a server listening only on ${host}`, async () => {
      const { server, port } = await listenOn(host);
      try {
        assert.equal(await isPortBusy(port), true);
      } finally {
        server.close();
      }
    });
  }

  it('reports a free port as free', async () => {
    const { server, port } = await listenOn('127.0.0.1');
    await new Promise((done) => server.close(done));
    assert.equal(await isPortBusy(port), false);
  });
});

describe('tooling reads the allocated port', () => {
  it('agrees across allocatePort, a second process, and the ticket on disk', async () => {
    const registry = tempRegistry();
    const root = COLLIDING_A;
    const mine = allocate(registry, root);
    const fromChild = await allocateInChild({ registry, root });
    assert.equal(fromChild.port, mine.port);
    // Against the NORMALIZED root, because that is what a ticket carries: `normalizeRoot`
    // runs `resolve()`, and COLLIDING_A is only already-absolute on Windows. On Linux the
    // fixture picks up the CWD, so comparing to the raw string asserted a Windows-only fact
    // and failed the first time this file ran on a GitHub runner (2026-09-06). What the test
    // is actually about is the three readings AGREEING, which holds on either platform.
    assert.equal(readTicketRoot(registry, mine.port), normalizeRoot(root));
  });

  it('makes dev-port.mjs, its CLI, launch.json and dev-port.json report one number', () => {
    // The real checkout this test runs in - the end-to-end contract every consumer relies on.
    const cli = Number(execFileSync(process.execPath, [join(repoRoot, 'scripts', 'dev-port.mjs')], { encoding: 'utf8' }).trim());
    const json = JSON.parse(execFileSync(process.execPath, [join(repoRoot, 'scripts', 'dev-port.mjs'), '--json'], { encoding: 'utf8' }));
    const launch = JSON.parse(readFileSync(join(repoRoot, '.claude', 'launch.json'), 'utf8'));
    const record = JSON.parse(readFileSync(join(repoRoot, '.claude', 'dev-port.json'), 'utf8'));

    assert.equal(json.port, cli);
    assert.equal(record.port, cli);
    assert.equal(record.livePort, cli + 1);
    for (const config of launch.configurations) assert.equal(config.port, cli);
  });
});

/** The root recorded on the ticket holding `port`. */
function readTicketRoot(registryDir, port) {
  return JSON.parse(readFileSync(ticketPath(registryDir, port), 'utf8')).root;
}

/**
 * `count` distinct worktree paths that all hash to ONE slot - the collision staged from the
 * outside, with no test-only hook in the allocator. The search walks suffixes in order, so the
 * set is the same on every run.
 */
function collidingRoots(count) {
  const target = preferredPort(COLLIDING_A);
  const found = [];
  for (let i = 0; found.length < count; i++) {
    const root = `C:/claude/NoaCG-Studio/.claude/worktrees/racer-${i}`;
    if (preferredPort(root) === target) found.push(root);
    assert.ok(i < 20_000, 'could not stage a collision - the hash no longer spreads');
  }
  return found;
}

/**
 * Run one allocation in its own process, so several can genuinely collide. `startAt` is a
 * shared wall-clock instant the children spin until: process startup alone is too jittery to
 * put two claims in the same millisecond, and a race test that never races proves nothing.
 */
function allocateInChild({ registry, root, startAt = 0 }) {
  const source = `
    import { allocatePort } from ${JSON.stringify(pathToFileURL(join(here, 'port-registry.mjs')).href)};
    const [registryDir, root, startAt] = process.argv.slice(2);
    while (Date.now() < Number(startAt)) { /* spin to the shared start instant */ }
    // Pretend every root is a live worktree with nothing listening: the exclusive-create
    // claim, not the environment probing, is what this exercises.
    const result = allocatePort({ root, registryDir, isRootActive: () => true, isPortBusy: () => false });
    process.stdout.write(JSON.stringify(result));
  `;
  const scriptPath = join(dirname(registry), `alloc-child-${childSeq++}.mjs`);
  mkdirSync(dirname(scriptPath), { recursive: true });
  writeFileSync(scriptPath, source);

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(process.execPath, [scriptPath, registry, root, String(startAt)]);
    let out = '';
    let err = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('exit', (code) => {
      if (code !== 0) return rejectPromise(new Error(`child allocation failed (${code}): ${err}`));
      try {
        resolvePromise(JSON.parse(out));
      } catch (parseError) {
        rejectPromise(new Error(`unparseable child output ${JSON.stringify(out)}: ${parseError.message}`));
      }
    });
  });
}
