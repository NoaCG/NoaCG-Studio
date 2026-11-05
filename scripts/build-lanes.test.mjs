import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import { runLanes } from './build-lanes.mjs';

function capture() {
  const stream = new PassThrough();
  let text = '';
  stream.on('data', (chunk) => (text += chunk));
  return { stream, text: () => text };
}

const node = (code) => `"${process.execPath}" -e "${code}"`;

test('lanes run at the same time: each lane waits for a file only the other lane writes', async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'build-lanes-'));
  // Run one after the other, the first lane would wait for a lane that has not started, and give up.
  const lane = (mine, theirs) => node(
    `require('fs').writeFileSync('${path.join(dir, mine)}','');const t=Date.now();` +
    `(function w(){if(require('fs').existsSync('${path.join(dir, theirs)}'))process.exit(0);if(Date.now()-t>20000)process.exit(9);setTimeout(w,20)})()`,
  );
  const out = capture();
  try {
    assert.equal(await runLanes([lane('a', 'b'), lane('b', 'a')], { out: out.stream, err: out.stream }), 0, out.text());
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a held lane prints as one block under its command, never interleaved with the live lane', async () => {
  const out = capture();
  await runLanes(
    [node("console.log('live-1');setTimeout(()=>console.log('live-2'),300)"), node("console.log('held-1');console.log('held-2')")],
    { out: out.stream, err: out.stream },
  );
  const text = out.text();
  assert.match(text, /\[lanes\] output of: .*\nheld-1\nheld-2\n/);
  assert.match(text, /live-1/);
  assert.match(text, /live-2/);
});

test('every lane runs to its end and the first failing lane in argument order sets the status', async () => {
  const out = capture();
  const status = await runLanes(
    [node("setTimeout(()=>{console.log('slow-done');process.exit(3)},300)"), node('process.exit(5)')],
    { out: out.stream, err: out.stream },
  );
  assert.equal(status, 3);
  assert.match(out.text(), /slow-done/);
  assert.match(out.text(), /failed \(exit 5\)/);
  assert.match(out.text(), /failed \(exit 3\)/);
});

test('a later lane failing alone fails the run', async () => {
  const out = capture();
  assert.equal(await runLanes([node(''), node('process.exit(1)')], { out: out.stream, err: out.stream }), 1);
});

test('no command is refused', async () => {
  await assert.rejects(runLanes([]), /at least one command/);
});
