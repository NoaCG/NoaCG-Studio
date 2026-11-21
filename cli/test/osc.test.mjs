// OSC OUT through NoaCG Bridge (docs/work-specs/osc-control-cues/spec.md AC-4, AC-5): the encoder's
// exact bytes, the destination rule, the limits, and `POST /osc` against a real UDP listener -
// one datagram per send id, never a second for a repeat, nothing for anything refused.

import assert from 'node:assert/strict';
import { createSocket } from 'node:dgram';
import { test } from 'node:test';
import { casparcgAdapter } from '../dist/playout/adapters/casparcg.js';
import {
  classifyIPv4,
  destinationRefusal,
  encodeOscMessage,
  OSC_BURST,
  OSC_DEADLINE_MS,
  OSC_MAX_BYTES,
  OscSender,
} from '../dist/playout/osc.js';
import { createBridgeServer } from '../dist/playout/server.js';

const hex = (buf) => buf.toString('hex');
const s = (value) => ({ type: 's', value });

test('the encoder writes OSC 1.0 bytes: padding, type tags, big-endian numbers', () => {
  // No arguments: the address, then an empty type tag ",", each padded to four bytes.
  assert.equal(hex(encodeOscMessage('/zeros/playback/go/0', [])), hex(Buffer.concat([Buffer.from('/zeros/playback/go/0\0\0\0\0'), Buffer.from(',\0\0\0')])));
  // Two strings "0" and "5": ",ss" then each string NUL-padded.
  const strings = encodeOscMessage('/zeros/cue/go', [s('0'), s('5')]);
  assert.equal(hex(strings), hex(Buffer.from('/zeros/cue/go\0\0\0,ss\x000\0\0\x005\0\0\0', 'latin1')));
  // The same values as int32 are a different message: ",ii" and four big-endian bytes each.
  const ints = encodeOscMessage('/zeros/cue/go', [{ type: 'i', value: '0' }, { type: 'i', value: '5' }]);
  assert.equal(hex(ints), hex(Buffer.from('/zeros/cue/go\0\0\0,ii\0' + '\0\0\0\0' + '\0\0\0\x05', 'latin1')));
  assert.notEqual(hex(strings), hex(ints));
  // float32 1.5 is 0x3fc00000; a negative int32 is two's complement.
  assert.equal(hex(encodeOscMessage('/a', [{ type: 'f', value: '1.5' }, { type: 'i', value: '-1' }])), '2f610000' + '2c666900' + '3fc00000' + 'ffffffff');
  // A string whose length is already a multiple of four still gets a terminating NUL word.
  assert.equal(encodeOscMessage('/abc', [s('abcd')]).length, 8 + 4 + 8);
});

test('the encoder refuses bad addresses, values and sizes with a sentence', () => {
  for (const bad of ['zeros/go', '/has space', '/wild/*', '/a#b', '/a,b', '', '/ä']) {
    assert.throws(() => encodeOscMessage(bad, []), /OSC address/, bad);
  }
  assert.throws(() => encodeOscMessage('/a', [{ type: 'i', value: '2147483648' }]), /whole number/);
  assert.throws(() => encodeOscMessage('/a', [{ type: 'i', value: '1.5' }]), /whole number/);
  assert.throws(() => encodeOscMessage('/a', [{ type: 'f', value: 'NaN' }]), /decimal/);
  assert.throws(() => encodeOscMessage('/a', [{ type: 'f', value: '1e40' }]), /decimal/);
  assert.throws(() => encodeOscMessage('/a', [{ type: 'T', value: '' }]), /type/);
  assert.throws(() => encodeOscMessage('/a', [s('a\0bcdefg'), { type: 'i', value: '5' }]), /NUL/);
  assert.throws(() => encodeOscMessage('/a', Array.from({ length: 17 }, () => s('x'))), /at most 16/);
  assert.throws(() => encodeOscMessage('/a', [s('x'.repeat(OSC_MAX_BYTES))]), /bytes/);
});

test('destinations: this computer, the studio network and VPNs; never broadcast, multicast or 0.0.0.0', () => {
  assert.equal(classifyIPv4('127.0.0.1'), 'loopback');
  assert.equal(classifyIPv4('192.168.1.40'), 'private');
  assert.equal(classifyIPv4('10.2.3.4'), 'private');
  assert.equal(classifyIPv4('172.20.0.9'), 'private');
  assert.equal(classifyIPv4('169.254.10.10'), 'link-local');
  assert.equal(classifyIPv4('100.101.102.103'), 'cgnat');
  assert.equal(classifyIPv4('8.8.8.8'), 'public');
  for (const never of ['0.0.0.0', '255.255.255.255', '224.0.0.1', '239.1.1.1', '192.168.1.255']) {
    assert.match(destinationRefusal(never, true), /broadcast, multicast or unspecified/, never);
  }
  assert.match(destinationRefusal('8.8.8.8', false), /on the internet/);
  assert.equal(destinationRefusal('8.8.8.8', true), null);
  assert.equal(destinationRefusal('100.64.0.1', false), null);
});

function fakeIo(over = {}) {
  let now = 1_000;
  const sent = [];
  return {
    sent,
    tick: (ms) => (now += ms),
    io: {
      now: () => now,
      resolve: async (host) => (host === 'desk.local' ? '192.168.1.40' : host),
      send: async (packet, ip, port) => void sent.push({ packet, ip, port }),
      ...over,
    },
  };
}

const req = (sendId, extra = {}) => ({ sendId, host: '192.168.1.40', port: 8830, address: '/zeros/cue/go', args: [s('0'), s('5')], ...extra });

test('a send id is sent once: a repeat answers the first outcome and sends nothing', async () => {
  const f = fakeIo();
  const sender = new OscSender(false, f.io);
  const [a, b] = await Promise.all([sender.send(req('press-1')), sender.send(req('press-1'))]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(b.repeat, true);
  assert.equal(f.sent.length, 1);
  await sender.send(req('press-2'));
  assert.equal(f.sent.length, 2, 'a new press is a new send');
  // After the id is forgotten it is a new press again.
  f.tick(61_000);
  await sender.send(req('press-1'));
  assert.equal(f.sent.length, 3);
});

test('a host name is resolved once and the number is what is checked and used', async () => {
  const f = fakeIo();
  const sender = new OscSender(false, f.io);
  const r = await sender.send(req('n1', { host: 'desk.local' }));
  assert.deepEqual(r, { ok: true, value: { to: '192.168.1.40:8830', bytes: 28 } });
  assert.equal(f.sent[0].ip, '192.168.1.40');
  const sneaky = new OscSender(false, fakeIo({ resolve: async () => '255.255.255.255' }).io);
  const refused = await sneaky.send(req('n2', { host: 'everyone.local' }));
  assert.equal(refused.ok, false);
  assert.equal(refused.error.code, 'refused');
});

test('a slow lookup refuses unsent; a socket error is reported; neither is retried', async () => {
  const slow = fakeIo({ resolve: () => new Promise((r) => setTimeout(() => r('192.168.1.40'), OSC_DEADLINE_MS + 100)) });
  const late = await new OscSender(false, slow.io).send(req('s1', { host: 'slow.local' }));
  assert.equal(late.ok, false);
  assert.equal(late.error.code, 'unreachable');
  assert.equal(slow.sent.length, 0);
  let tries = 0;
  const broken = fakeIo({ send: async () => { tries++; throw new Error('EHOSTUNREACH'); } });
  const r = await new OscSender(false, broken.io).send(req('s2'));
  assert.equal(r.ok, false);
  assert.match(r.error.message, /EHOSTUNREACH/);
  assert.equal(tries, 1);
});

test('a flood is refused at once, and the bucket refills with time', async () => {
  const f = fakeIo();
  const sender = new OscSender(false, f.io);
  const results = await Promise.all(Array.from({ length: OSC_BURST + 5 }, (_, i) => sender.send(req(`f${i}`))));
  assert.equal(results.filter((r) => r.ok).length, OSC_BURST);
  assert.equal(results.filter((r) => !r.ok && /Too many/.test(r.error.message)).length, 5);
  f.tick(1000);
  assert.equal((await sender.send(req('after'))).ok, true);
});

// ── Through the Bridge, to a real UDP listener ───────────────────────────────────────────────

async function listener() {
  const socket = createSocket('udp4');
  const packets = [];
  socket.on('message', (msg) => packets.push(msg));
  await new Promise((r) => socket.bind(0, '127.0.0.1', r));
  return { port: socket.address().port, packets, close: () => new Promise((r) => socket.close(r)) };
}

async function withBridge(fn, extra = {}) {
  const server = createBridgeServer({ token: 'secret-token', origins: ['https://noacg.studio'], adapters: [casparcgAdapter], version: '0.0.0-test', ...extra }, () => {});
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const post = (base, body, token = 'secret-token') =>
  fetch(`${base}/osc`, { method: 'POST', headers: { Origin: 'https://noacg.studio', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const settle = () => new Promise((r) => setTimeout(r, 50));

test('POST /osc sends one datagram per send id to a real listener, with no CasparCG anywhere', async () => {
  const desk = await listener();
  try {
    await withBridge(async (base) => {
      const health = await (await fetch(`${base}/health`)).json();
      assert.ok(health.features.includes('osc'));

      const body = { sendId: 'press-1', host: '127.0.0.1', port: desk.port, address: '/zeros/cue/go', args: [s('0'), s('5')] };
      const first = await (await post(base, body)).json();
      assert.deepEqual(first, { ok: true, v: health.v, sent: { to: `127.0.0.1:${desk.port}`, bytes: 28 } });
      const again = await (await post(base, body)).json();
      assert.equal(again.repeat, true);
      await post(base, { ...body, sendId: 'press-2' });
      await settle();
      assert.equal(desk.packets.length, 2, 'two deliberate presses, one repeated delivery');
      assert.equal(hex(desk.packets[0]), hex(encodeOscMessage('/zeros/cue/go', [s('0'), s('5')])));

      // Refused before anything is sent: no token, a bad message, a broadcast address.
      assert.equal((await post(base, { ...body, sendId: 'x1' }, 'nope')).status, 401);
      assert.equal((await post(base, { ...body, sendId: 'x2', address: 'no-slash' })).status, 400);
      assert.equal((await post(base, { ...body, sendId: 'x3', port: 70000 })).status, 400);
      const bcast = await (await post(base, { ...body, sendId: 'x4', host: '255.255.255.255' })).json();
      assert.equal(bcast.ok, false);
      assert.equal(bcast.error.code, 'refused');
      const internet = await (await post(base, { ...body, sendId: 'x5', host: '8.8.8.8' })).json();
      assert.match(internet.error.detail, /on the internet/);
      await settle();
      assert.equal(desk.packets.length, 2);
    });
  } finally {
    await desk.close();
  }
});

test('an IPv6 destination is named as such, and nothing is sent', async () => {
  const sender = new OscSender(false);
  const r = await sender.send(req('v6', { host: '::1' }));
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'refused');
  assert.match(r.error.message, /IPv6/);
});

test('the deadline runs from receipt: a request that arrived late is refused unsent', async () => {
  const f = fakeIo();
  const sender = new OscSender(false, f.io);
  const arrived = f.io.now();
  f.tick(OSC_DEADLINE_MS + 1);
  const r = await sender.send(req('late'), arrived);
  assert.equal(r.ok, false);
  assert.match(r.error.message, /too long to arrive/);
  assert.equal(f.sent.length, 0);
});
