import assert from 'node:assert/strict';
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

test('lanes run at the same time: two half-second lanes take well under a second together', async () => {
  const out = capture();
  const started = Date.now();
  const status = await runLanes([node('setTimeout(()=>{},500)'), node('setTimeout(()=>{},500)')], { out: out.stream, err: out.stream });
  assert.equal(status, 0);
  assert.ok(Date.now() - started < 950, `took ${Date.now() - started} ms`);
});

test('a held lane prints as one block after the live lane has streamed, never interleaved', async () => {
  const out = capture();
  await runLanes(
    [node("console.log('live-1');setTimeout(()=>console.log('live-2'),300)"), node("console.log('held-1');console.log('held-2')")],
    { out: out.stream, err: out.stream },
  );
  const text = out.text();
  assert.match(text, /\[lanes\] output of: .*\nheld-1\nheld-2\n/);
  assert.ok(text.indexOf('live-1') < text.indexOf('held-1'), text);
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
