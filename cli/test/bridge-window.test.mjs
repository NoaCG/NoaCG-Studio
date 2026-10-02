// What the Bridge's own window says and does (cli/src/commands/bridge.ts, docs/work-specs/studio-day-playout
// D8, D19): one line per step, how to pair another browser, and Enter for a new one-time link. The real
// program, started the way the exe starts it, over a scratch config folder - never the operator's own.
// Run `npm run build` first.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ENTRY = fileURLToPath(new URL('../dist/playoutEntry.js', import.meta.url));

/** A free loopback port: the window prints the port it listens on, so 0 will not do. */
const freePort = () =>
  new Promise((resolve) => {
    const s = createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

/** Start the Bridge, with stdin a keyboard (`isTTY`) or not, and read its window as it prints. */
async function startBridge({ keyboard }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'noacg-window-'));
  const port = await freePort();
  // The test's stdin is a pipe; `keyboard` makes the Bridge see it as the window's keyboard.
  const args = [...(keyboard ? ['--import', 'data:text/javascript,process.stdin.isTTY=true'] : []), ENTRY, '--port', String(port), '--no-open'];
  const child = spawn(process.execPath, args, {
    env: { ...process.env, APPDATA: dir, XDG_CONFIG_HOME: dir, NOACG_URL: 'https://noacg.studio' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let text = '';
  child.stdout.on('data', (b) => (text += b.toString()));
  child.stderr.on('data', (b) => (text += b.toString()));
  const until = async (re) => {
    for (let i = 0; i < 100 && !re.test(text); i += 1) await new Promise((r) => setTimeout(r, 50));
    assert.match(text, re);
  };
  const stop = async () => {
    // Forced, so the test never waits on the Bridge's own graceful close.
    child.kill('SIGKILL');
    await new Promise((r) => child.once('exit', r));
    await rm(dir, { recursive: true, force: true });
  };
  return { port, child, text: () => text, until, stop };
}

const pair = async (port, code) =>
  (await fetch(`http://127.0.0.1:${port}/pair`, { method: 'POST', headers: { Origin: 'https://noacg.studio', 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) })).status;

test('the window says one line per step, and Enter prints a new link that pairs another browser', async () => {
  const bridge = await startBridge({ keyboard: true });
  try {
    await bridge.until(/Press Ctrl\+C to stop\./);
    const window = bridge.text();
    assert.match(window, /1\. Pair your browser with this link\. It works once, within two minutes\./);
    assert.match(window, /To pair another browser, copy the link into it, or press Enter here for a new one\./);
    assert.match(window, /2\. On that page, enter the IP address of your CasparCG server\./);
    assert.doesNotMatch(window, /—/, 'no em dash in what an operator reads');
    const first = window.match(/app\?bridge=\d+&code=([0-9a-f]+)/)[1];

    bridge.child.stdin.write('\n');
    await bridge.until(/A new pairing link\. It works once, within two minutes:\s+\S+code=[0-9a-f]+/);
    const second = bridge.text().match(/A new pairing link[^\n]*\n\s+\S+code=([0-9a-f]+)/)[1];
    assert.notEqual(second, first);
    // Both open: the new link never spends the one another browser was about to use.
    assert.equal(await pair(bridge.port, second), 200);
    assert.equal(await pair(bridge.port, first), 200);
    assert.equal(await pair(bridge.port, second), 401, 'and each works once');
  } finally {
    await bridge.stop();
  }
});

test('with no keyboard behind it, the window does not offer Enter', async () => {
  const bridge = await startBridge({ keyboard: false });
  try {
    await bridge.until(/Press Ctrl\+C to stop\./);
    assert.match(bridge.text(), /To pair another browser, copy the link into it\.\n/);
    assert.doesNotMatch(bridge.text(), /press Enter/);
  } finally {
    await bridge.stop();
  }
});
