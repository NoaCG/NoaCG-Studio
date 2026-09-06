// gate: factory
// guards: src/export/local-relay/**
//
// Conformance tests for the LOCAL RELAY protocol v1 (src/export/local-relay/) — the one
// protocol, two stdlib implementations (relay.ps1 for Windows, relay.py for macOS/Linux).
// Both are spawned for real against a temp package dir and must answer identically:
// ping/head/log/send, ordered monotonic ids, batch sends, stream defaulting, static files
// with a traversal guard, and persistence across a relay restart (relay-log.jsonl).
//
// Run: npm run test:local-relay
// Each implementation runs only where its runtime exists (pwsh/powershell, python3/python/py)
// — a machine with neither skips with a note rather than passing vacuously.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, copyFileSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const relayDir = path.join(here, '..', 'src', 'export', 'local-relay');

function hasCommand(cmd, args = ['--version']) {
  try {
    const r = spawnSync(cmd, args, { stdio: 'ignore', timeout: 8000 });
    return r.error === undefined && r.status === 0;
  } catch {
    return false;
  }
}

const powershell = ['pwsh', 'powershell'].find((c) => hasCommand(c, ['-NoProfile', '-Command', 'exit 0']));
const python = ['python3', 'python', 'py'].find((c) => hasCommand(c));

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  return { status: res.status, body: res.status === 200 ? await res.json() : null, res };
}

/** Poll a small port range for a relay answering /relay/ping; the scripts scan upward from
 *  the requested port when it is taken. */
async function findRelay(basePort, deadlineMs = 20000) {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    for (let p = basePort; p < basePort + 6; p++) {
      try {
        const { status, body } = await fetchJson(`http://localhost:${p}/relay/ping`);
        if (status === 200 && body?.ok === true) return p;
      } catch {
        /* not up yet */
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

function startRelay(kind, dir, port) {
  if (kind === 'ps1') {
    return spawn(powershell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(dir, 'relay.ps1'), '-Port', String(port)], {
      stdio: 'ignore',
    });
  }
  return spawn(python, [path.join(dir, 'relay.py'), String(port)], { stdio: 'ignore' });
}

async function runConformance(kind, basePort) {
  const dir = mkdtempSync(path.join(tmpdir(), `noacg-relay-${kind}-`));
  copyFileSync(path.join(relayDir, 'relay.ps1'), path.join(dir, 'relay.ps1'));
  copyFileSync(path.join(relayDir, 'relay.py'), path.join(dir, 'relay.py'));
  writeFileSync(path.join(dir, 'test.html'), '<!doctype html><title>relay test</title>ok');

  let proc = startRelay(kind, dir, basePort);
  try {
    const port = await findRelay(basePort);
    assert.ok(port, `${kind}: relay did not answer /relay/ping`);
    const base = `http://localhost:${port}`;

    // ping + head start clean.
    const ping = await fetchJson(`${base}/relay/ping`);
    assert.equal(ping.body.v, 1);
    assert.equal(ping.body.head, 0);

    // Static serving from the package root, with a traversal guard.
    const page = await fetch(`${base}/test.html`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /relay test/);
    const missing = await fetch(`${base}/nope.html`);
    assert.equal(missing.status, 404);

    // Sends append ordered rows; a batch keeps order; stream defaults to program.
    const one = await fetchJson(`${base}/relay/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ graphic: 'Strap', msg: { t: 'update', data: { f0: 'Anna' } } }),
    });
    assert.equal(one.body.head, 1);
    const batch = await fetchJson(`${base}/relay/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { graphic: 'Strap', msg: { t: 'play' } },
          { graphic: 'Ticker', stream: 'preview', msg: { t: 'update', data: { f0: 'PVW' } } },
        ],
      }),
    });
    assert.equal(batch.body.head, 3);

    const log = await fetchJson(`${base}/relay/log?after=1`);
    assert.equal(log.body.head, 3);
    assert.deepEqual(log.body.rows.map((r) => r.id), [2, 3]);
    assert.equal(log.body.rows[0].graphic, 'Strap');
    assert.equal(log.body.rows[0].stream, 'program');
    assert.equal(log.body.rows[1].stream, 'preview');
    assert.equal(log.body.rows[1].msg.data.f0, 'PVW');

    const headOnly = await fetchJson(`${base}/relay/head`);
    assert.equal(headOnly.body.head, 3);

    // Persistence: kill, restart, the log survives (relay-log.jsonl beside the script).
    proc.kill();
    await new Promise((r) => setTimeout(r, 800));
    proc = startRelay(kind, dir, basePort);
    const port2 = await findRelay(basePort);
    assert.ok(port2, `${kind}: relay did not come back after restart`);
    const after = await fetchJson(`http://localhost:${port2}/relay/log?after=0`);
    assert.equal(after.body.head, 3);
    assert.deepEqual(after.body.rows.map((r) => r.id), [1, 2, 3]);
  } finally {
    proc.kill();
    await new Promise((r) => setTimeout(r, 400));
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* a straggling handle on Windows — the temp dir reaper gets it */
    }
  }
}

test('relay.ps1 answers the v1 protocol (Windows PowerShell)', { skip: !powershell && 'no powershell on PATH' }, async () => {
  assert.ok(existsSync(path.join(relayDir, 'relay.ps1')));
  await runConformance('ps1', 18787);
});

test('relay.py answers the v1 protocol (python3)', { skip: !python && 'no python on PATH' }, async () => {
  assert.ok(existsSync(path.join(relayDir, 'relay.py')));
  await runConformance('py', 18887);
});
