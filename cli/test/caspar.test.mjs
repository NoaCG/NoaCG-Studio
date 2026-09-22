// The AMCP reader (cli/src/playout/amcp.ts), against a fake AMCP listener. No network, no
// browser, no CasparCG - so this really runs in CI, which matters because the reader is the
// riskiest pure logic in the Bridge: its response shapes differ per command, and a reader that
// waits for a line that is never coming HANGS a live operator. Run `npm run build` first.
//
// Every captured reply here came off a real server: 2.3.2 and 2.5.0 on 2026-09-10, and 2.5.0
// again on 2026-09-22 for TLS, CLS, CINF, THUMBNAIL and the scanner-missing 501.

import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { test } from 'node:test';
import {
  amcpQuote,
  amcpSend,
  AmcpTimeout,
  layerAddress,
  MAX_REPLY_BYTES,
  parseCls,
  parseTls,
  parseVersion,
} from '../dist/playout/amcp.js';
import { playCommand, stopCommand } from '../dist/commands/caspar.js';
import { fakeCaspar } from './_fakeCaspar.mjs';

test('the command builders produce CasparCG addressing, and refuse what cannot go on the wire', () => {
  assert.equal(layerAddress(1, 20), '1-20');
  assert.equal(playCommand(2, 30, 'https://x/output?production=s'), 'PLAY 2-30 [HTML] "https://x/output?production=s"');
  assert.equal(stopCommand(1, 20), 'STOP 1-20');
  // A newline would end the COMMAND early - command injection into a live playout server -
  // and no escape exists for a carriage return, so both are refused.
  assert.throws(() => playCommand(1, 20, 'https://x\r\nSTOP 1-20'), /newline/);
  assert.throws(() => layerAddress(0, 20), /Channel/);
  assert.throws(() => layerAddress(1, -1), /Layer/);
});

test('amcpQuote escapes exactly what the tokenizer reads, and refuses a carriage return', () => {
  // server src/protocol/util/tokenize.cpp: \\ \" \n are the escapes; anything else is dropped.
  assert.equal(amcpQuote('plain'), '"plain"');
  assert.equal(amcpQuote('He said "hi"'), '"He said \\"hi\\""');
  assert.equal(amcpQuote('C:\\media\\clip'), '"C:\\\\media\\\\clip"');
  assert.equal(amcpQuote('line one\nline two'), '"line one\\nline two"');
  assert.equal(amcpQuote('Jääkiekko'), '"Jääkiekko"');
  assert.equal(amcpQuote(JSON.stringify({ f0: 'a "b"' })), '"{\\"f0\\":\\"a \\\\\\"b\\\\\\"\\"}"');
  assert.throws(() => amcpQuote('a\rb'), /carriage return/);
});

test('201 carries one data line - the server version', async () => {
  const caspar = await fakeCaspar('201 VERSION OK\r\n2.5.0 69e8ad5 Stable\r\n');
  const reply = await amcpSend({ host: '127.0.0.1', port: caspar.port }, 'VERSION');
  assert.equal(reply.code, 201);
  assert.deepEqual(reply.lines, ['2.5.0 69e8ad5 Stable']);
  assert.equal(parseVersion(reply), '2.5.0 69e8ad5 Stable');
  assert.deepEqual(caspar.seen, ['VERSION']);
  await caspar.close();
});

test('a long 200 reply arriving in chunks over more than a moment is read whole, never cut short', async () => {
  // The grace timer that resolves a 400 without its echo must never resolve a 2xx early: a
  // media list of a few hundred files arrives in several chunks from the server's scanner proxy.
  const caspar = await fakeCaspar((_line, socket) => {
    socket.write('200 CLS OK\r\n"A"  STILL  1 20260101000000 0 0/1\r\n');
    setTimeout(() => socket.write('"B"  STILL  2 20260101000000 0 0/1\r\n'), 450);
    setTimeout(() => socket.write('"C"  STILL  3 20260101000000 0 0/1\r\n\r\n'), 700);
    return null;
  });
  const reply = await amcpSend({ host: '127.0.0.1', port: caspar.port, timeoutMs: 4000 }, 'CLS');
  assert.equal(reply.code, 200);
  assert.equal(reply.lines.length, 3);
  await caspar.close();
});

test('200 carries several lines and ends on a blank one', async () => {
  const caspar = await fakeCaspar('200 INFO OK\r\n1 1080i5000 PLAYING\r\n2 720p5000 STOPPED\r\n\r\n');
  const reply = await amcpSend({ host: '127.0.0.1', port: caspar.port }, 'INFO');
  assert.equal(reply.code, 200);
  assert.deepEqual(reply.lines, ['1 1080i5000 PLAYING', '2 720p5000 STOPPED']);
  await caspar.close();
});

test('the wire is UTF-8 both ways: a non-ASCII clip name goes out and comes back intact', async () => {
  // Measured 2026-09-22 on 2.5.0: `PLAY 1-10 "Jääkiekko"` answered 202 and CLS listed the
  // file. Split the reply across two chunks in the middle of a multi-byte character to prove
  // the decoder holds the partial byte rather than emitting a replacement character.
  const full = Buffer.from('200 CLS OK\r\n"JÄÄKIEKKO"  STILL  259408 20260922174500 0 0/1\r\n\r\n', 'utf8');
  const cut = full.indexOf(Buffer.from('Ä', 'utf8')) + 1; // one byte into the two-byte Ä
  const caspar = await fakeCaspar((line, socket) => {
    assert.equal(line, 'PLAY 1-10 "Jääkiekko"');
    socket.write(full.subarray(0, cut));
    setTimeout(() => socket.write(full.subarray(cut)), 20);
    return null;
  });
  const reply = await amcpSend({ host: '127.0.0.1', port: caspar.port }, 'PLAY 1-10 "Jääkiekko"');
  assert.deepEqual(parseCls(reply.lines), [
    { name: 'JÄÄKIEKKO', kind: 'still', bytes: 259408, changed: '20260922174500', frames: 0, fps: 0 },
  ]);
  await caspar.close();
});

test('202 is a whole answer on its own, and does not wait for a line that never comes', async () => {
  const caspar = await fakeCaspar('202 PLAY OK\r\n');
  const started = Date.now();
  const reply = await amcpSend({ host: '127.0.0.1', port: caspar.port, timeoutMs: 3000 }, 'PLAY 1-20');
  assert.equal(reply.code, 202);
  assert.deepEqual(reply.lines, []);
  assert.ok(Date.now() - started < 1500, `took ${Date.now() - started}ms`);
  await caspar.close();
});

test('a 4xx is reported as itself, so a refusal is never read as a success', async () => {
  const caspar = await fakeCaspar('404 PLAY FAILED\r\n');
  const reply = await amcpSend({ host: '127.0.0.1', port: caspar.port }, 'PLAY 9-9');
  assert.equal(reply.code, 404);
  assert.equal(reply.status, '404 PLAY FAILED');
  await caspar.close();
});

test('400 echoing the refused command is read, and a build that echoes nothing still answers', async () => {
  const withEcho = await fakeCaspar('400 ERROR\r\nNONSENSE\r\n');
  const a = await amcpSend({ host: '127.0.0.1', port: withEcho.port }, 'NONSENSE');
  assert.deepEqual(a.lines, ['NONSENSE']);
  await withEcho.close();

  const bare = await fakeCaspar('400 ERROR\r\n');
  const started = Date.now();
  const b = await amcpSend({ host: '127.0.0.1', port: bare.port, timeoutMs: 5000 }, 'NONSENSE');
  assert.equal(b.code, 400);
  assert.ok(Date.now() - started < 2000, `took ${Date.now() - started}ms`);
  await bare.close();
});

test('silence is its own error, and a reply past the cap is refused rather than buffered', async () => {
  const silent = await fakeCaspar(() => null);
  await assert.rejects(amcpSend({ host: '127.0.0.1', port: silent.port, timeoutMs: 200 }, 'TLS'), (e) => e instanceof AmcpTimeout);
  await silent.close();

  const flood = await fakeCaspar((_line, socket) => {
    socket.write('201 THUMBNAIL RETRIEVE OK\r\n');
    const chunk = Buffer.alloc(1024 * 1024, 65);
    for (let i = 0; i < 10; i++) socket.write(chunk);
    return null;
  });
  await assert.rejects(
    amcpSend({ host: '127.0.0.1', port: flood.port, timeoutMs: 5000 }, 'THUMBNAIL RETRIEVE "x"'),
    new RegExp(`more than ${MAX_REPLY_BYTES} bytes`),
  );
  await flood.close();
});

test('a server that closes without answering is an error, not an empty success', async () => {
  const caspar = await fakeCaspar((_line, socket) => {
    socket.end();
    return null;
  });
  await assert.rejects(
    amcpSend({ host: '127.0.0.1', port: caspar.port }, 'VERSION'),
    /closed the connection without answering/,
  );
  await caspar.close();
});

test('nothing listening is refused quickly, with the socket error intact', async () => {
  await assert.rejects(amcpSend({ host: '127.0.0.1', port: 1, timeoutMs: 3000 }, 'VERSION'), /ECONNREFUSED|EACCES/);
});

// ── Reading the library ─────────────────────────────────────────────────────────────────────

test('TLS lines are bare ids on 2.5.0, and a quoted older shape still reads', () => {
  // Captured 2026-09-22 from 2.5.0 with the scanner running.
  const lines = ['BK/SB01-NOSHIM', 'HOUSE_STRAP/HOUSE_STRAP', 'SHOWEOOM/HOUSE_ACTIONS/HOUSE_ACTIONS', ''];
  assert.deepEqual(
    parseTls(lines).map((t) => t.name),
    ['BK/SB01-NOSHIM', 'HOUSE_STRAP/HOUSE_STRAP', 'SHOWEOOM/HOUSE_ACTIONS/HOUSE_ACTIONS'],
  );
  assert.deepEqual(parseTls(['"OLD/SHAPE" 12345 20200101093000']), [{ name: 'OLD/SHAPE' }]);
});

test('CLS lines carry the name, kind, size, timestamp, frames and rate, and an odd line is skipped', () => {
  // Captured 2026-09-22 from 2.5.0: two spaces after the name and after the kind.
  const lines = [
    '"1"  STILL  259408 20220920122751 0 0/1',
    '"GIORNO"  MOVIE  10485760 20260814221648 1500 25/1',
    '"NTSC_CLIP"  MOVIE  1 20260101000000 60 30000/1001',
    // Captured 2026-09-22 from 2.3.2: a still with no frame count, and one with a nominal rate.
    '"OLD_STILL"  STILL  259408 20220920133631 NaN 0/0',
    '"OLD_STILL_2"  STILL  8596 20260922184039 1 1/25',
    'garbage line',
  ];
  const items = parseCls(lines);
  assert.equal(items.length, 5);
  assert.deepEqual(items[3], { name: 'OLD_STILL', kind: 'still', bytes: 259408, changed: '20220920133631', frames: 0, fps: 0 });
  assert.equal(items[4].fps, 0.04);
  assert.deepEqual(items[0], { name: '1', kind: 'still', bytes: 259408, changed: '20220920122751', frames: 0, fps: 0 });
  assert.deepEqual(items[1], { name: 'GIORNO', kind: 'movie', bytes: 10485760, changed: '20260814221648', frames: 1500, fps: 25 });
  assert.ok(Math.abs(items[2].fps - 29.97) < 0.01);
});
