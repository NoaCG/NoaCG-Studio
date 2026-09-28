// NoaCG Bridge (cli/src/playout/, docs/BRIDGE.md): the CasparCG adapter's exact wire, and the
// HTTP surface's refusals, against a fake AMCP listener and a Bridge on port 0. No network, no
// browser, no CasparCG. Run `npm run build` first.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  casparcgAdapter,
  casparLine,
  casparLines,
  createCasparcgAdapter,
  disarmLine,
  followLine,
  framesAt,
  LIST_TIMEOUT_MS,
  volumeFilter,
} from '../dist/playout/adapters/casparcg.js';
import { createOgrafAdapter } from '../dist/playout/adapters/ograf.js';
import { amcpQuote } from '../dist/playout/amcp.js';
import { PLAYOUT_V } from '../dist/playout/protocol.js';
import { allowedOrigins, createBridgeServer, originAllowed, readAction } from '../dist/playout/server.js';
import { fakeCaspar } from './_fakeCaspar.mjs';
import { fakeCasparServer } from './_fakeCasparServer.mjs';

const slot = { adapter: 'casparcg', channel: 1, layer: 20 };

test('the protocol file is mirrored byte for byte into the studio', async () => {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const norm = (s) => s.replace(/\r\n/g, '\n');
  const cli = norm(await readFile(new URL('../src/playout/protocol.ts', import.meta.url), 'utf8'));
  const app = norm(await readFile(`${here}/../../src/control/playoutProtocol.ts`, 'utf8'));
  assert.equal(app, cli, 'src/control/playoutProtocol.ts has drifted from cli/src/playout/protocol.ts - copy one over the other');
});

// ── Every verb's exact AMCP line ───────────────────────────────────────────────────────────

test('take: a URL is the HTML producer, a template is CG ADD with play-on-load, a clip is PLAY', () => {
  assert.equal(
    casparLine({ verb: 'take', item: { kind: 'url', name: 'https://noacg.studio/output?production=s' }, slot }),
    'PLAY 1-20 [HTML] "https://noacg.studio/output?production=s"',
  );
  assert.equal(
    casparLine({ verb: 'take', item: { kind: 'template', name: 'HOUSE_STRAP/HOUSE_STRAP' }, slot, data: { f0: 'He said "hi"\nline two ä' } }),
    'CG 1-20 ADD 1 "HOUSE_STRAP/HOUSE_STRAP" 1 "{\\"f0\\":\\"He said \\\\\\"hi\\\\\\"\\\\nline two ä\\"}"',
  );
  assert.equal(casparLine({ verb: 'take', item: { kind: 'template', name: 'T' }, slot }), 'CG 1-20 ADD 1 "T" 1');
  assert.equal(casparLine({ verb: 'take', item: { kind: 'media', name: 'Jääkiekko' }, slot: { ...slot, layer: 10 } }), 'PLAY 1-10 "Jääkiekko"');
  assert.equal(casparLine({ verb: 'take', item: { kind: 'media', name: 'BUMPER' }, slot, loop: true }), 'PLAY 1-20 "BUMPER" LOOP');
});

test('update, next, out, pause and resume', () => {
  assert.equal(casparLine({ verb: 'update', slot, data: { f0: 'x' } }), 'CG 1-20 UPDATE 1 "{\\"f0\\":\\"x\\"}"');
  assert.equal(casparLine({ verb: 'next', slot }), 'CG 1-20 NEXT 1');
  // Out plays a template's exit through its CG layer, and cuts a clip or a page on the video layer.
  assert.equal(casparLine({ verb: 'out', slot, item: { kind: 'template', name: 'T' } }), 'CG 1-20 STOP 1');
  assert.equal(casparLine({ verb: 'out', slot, item: { kind: 'media', name: 'M' } }), 'STOP 1-20');
  assert.equal(casparLine({ verb: 'out', slot }), 'STOP 1-20');
  assert.equal(casparLine({ verb: 'pause', slot }), 'PAUSE 1-20');
  assert.equal(casparLine({ verb: 'resume', slot }), 'RESUME 1-20');
});

test('a carriage return in a name is refused - it would end the command - and data is safe by construction', () => {
  assert.throws(() => casparLine({ verb: 'take', item: { kind: 'media', name: 'x\r\nSTOP 1-20' }, slot }), /carriage return|newline/);
  // Data goes through JSON first, which turns a raw CR into the two characters `\r`, so no line
  // break can reach the wire from a field value however it was typed.
  const line = casparLine({ verb: 'update', slot, data: { f0: 'a\rb\nc' } });
  assert.ok(!/[\r\n]/.test(line), line);
  assert.equal(line, `CG 1-20 UPDATE 1 ${amcpQuote(JSON.stringify({ f0: 'a\rb\nc' }))}`);
});

test('an action from the wire is read field by field, never forwarded on trust', () => {
  assert.deepEqual(readAction({ action: { verb: 'take', item: { kind: 'media', name: 'M' }, slot, data: { f0: 1 } } }), {
    verb: 'take',
    item: { kind: 'media', name: 'M' },
    slot,
    data: { f0: '1' },
    loop: false,
  });
  assert.throws(() => readAction({ action: { verb: 'take', item: { kind: 'scene', name: 'x' }, slot } }), /Unknown item kind/);
  assert.throws(() => readAction({ action: { verb: 'take', item: { kind: 'media', name: 'x' }, slot: { adapter: 'casparcg', channel: '1', layer: 20 } } }), /whole channel/);
  assert.throws(() => readAction({ action: { verb: 'update', slot } }), /carries data/);
  assert.throws(() => readAction({ action: { verb: 'launch', slot } }), /Unknown verb/);
});

// ── A clip's playback, line by line (docs/CLIP_PLAYBACK_PLAN.md §9, phase 3) ─────────────────

const clipSlot = { adapter: 'casparcg', channel: 2, layer: 10 };
const clip = (name) => ({ kind: 'media', name });

test('a legacy clip action writes exactly the line it always wrote', () => {
  // No field newer than the verb: one line, the same one, with or without a rate at hand.
  assert.deepEqual(casparLines({ verb: 'take', item: clip('VT'), slot: clipSlot }, { rate: 50 }), ['PLAY 2-10 "VT"']);
  assert.deepEqual(casparLines({ verb: 'take', item: clip('VT'), slot: clipSlot, loop: true }), ['PLAY 2-10 "VT" LOOP']);
  assert.deepEqual(casparLines({ verb: 'out', slot: clipSlot, item: clip('VT') }), ['STOP 2-10']);
});

test('every playback field, in the one order this adapter writes them', () => {
  const take = (playback, extra = {}) => casparLines({ verb: 'take', item: clip('VT'), slot: clipSlot, playback, ...extra }, { rate: 50 });
  // Trim, fade in, level and loop together: `[IN] [OUT] [MIX] [AF] [LOOP]`, frames at the CHANNEL's rate.
  assert.deepEqual(take({ trim: { in: 1, out: 8 }, fadeIn: 0.5, gain: 0.2512, end: 'loop' }), ['PLAY 2-10 "VT" IN 50 OUT 400 MIX 25 AF "volume=0.2512" LOOP']);
  assert.deepEqual(take({ trim: { in: 2 } }), ['PLAY 2-10 "VT" IN 100']);
  assert.deepEqual(take({ trim: { out: 3.5 } }), ['PLAY 2-10 "VT" OUT 175']);
  assert.deepEqual(take({ fadeIn: 1 }), ['PLAY 2-10 "VT" MIX 50']);
  // Unity gain is the file as it is: no filter at all.
  assert.deepEqual(take({ gain: 1 }), ['PLAY 2-10 "VT"']);
  assert.deepEqual(take({ gain: 1.9953 }), ['PLAY 2-10 "VT" AF "volume=1.9953"']);
  // Hold is the server's own default: nothing more is sent.
  assert.deepEqual(take({ end: 'hold' }), ['PLAY 2-10 "VT"']);
  // The old loop field and the new ending say the same thing.
  assert.deepEqual(take({ fadeIn: 0.5 }, { loop: true }), ['PLAY 2-10 "VT" MIX 25 LOOP']);
});

test('Clear at the end queues the empty layer behind the clip, fading for the fade out', () => {
  const take = (playback) => casparLines({ verb: 'take', item: clip('VT'), slot: clipSlot, playback }, { rate: 50 });
  assert.deepEqual(take({ end: 'clear' }), ['PLAY 2-10 "VT"', 'LOADBG 2-10 EMPTY AUTO']);
  assert.deepEqual(take({ end: 'clear', fadeOut: 0.5 }), ['PLAY 2-10 "VT"', 'LOADBG 2-10 EMPTY MIX 25 AUTO']);
  assert.deepEqual(take({ end: 'clear', fadeIn: 1, fadeOut: 1, gain: 0.5012 }), ['PLAY 2-10 "VT" MIX 50 AF "volume=0.5012"', 'LOADBG 2-10 EMPTY MIX 50 AUTO']);
  // A fade out on a clip that holds is used only by Out.
  assert.deepEqual(take({ fadeOut: 1 }), ['PLAY 2-10 "VT"']);
});

test('behind a clip that starts part way in, nothing is queued with the take', () => {
  // Measured on 2.5.0 and 2.3: `LOADBG … AUTO` within about 60 ms of `PLAY … IN n` fires at once and
  // the trimmed clip never airs. The runner queues it once INFO shows the clip inside its segment.
  assert.deepEqual(casparLines({ verb: 'take', item: clip('VT'), slot: clipSlot, playback: { end: 'clear', trim: { in: 2 } } }, { rate: 50 }), ['PLAY 2-10 "VT" IN 100']);
  assert.deepEqual(casparLines({ verb: 'take', item: clip('VT'), slot: clipSlot, playback: { end: 'clear', trim: { out: 8 } } }, { rate: 50 }), ['PLAY 2-10 "VT" OUT 400', 'LOADBG 2-10 EMPTY AUTO']);
  const entry = (name, playback) => ({ item: clip(name), media: { kind: 'movie', seconds: 10 }, ...(playback ? { playback } : {}) });
  assert.deepEqual(casparLines({ verb: 'sequence', slot: clipSlot, entries: [entry('A', { trim: { in: 1 } }), entry('B')] }, { rate: 50 }), ['PLAY 2-10 "A" IN 50']);
});

test('Out fades to nothing, clears a queued follower with it, or stops as it always did', () => {
  assert.deepEqual(casparLines({ verb: 'out', slot: clipSlot, item: clip('VT'), fadeOut: 0.5 }, { rate: 50 }), ['PLAY 2-10 EMPTY MIX 25']);
  // A fade out replaces whatever waited behind the clip, so a follower goes with it.
  assert.deepEqual(casparLines({ verb: 'out', slot: clipSlot, item: clip('VT'), fadeOut: 1 }, { rate: 50, follower: { file: 'NEXT' } }), ['PLAY 2-10 EMPTY MIX 50']);
  // STOP would keep a queued background; CLEAR takes the layer whole (§4 and §6.10, rule 5).
  assert.deepEqual(casparLines({ verb: 'out', slot: clipSlot, item: clip('VT') }, { follower: { file: 'NEXT' } }), ['CLEAR 2-10']);
  assert.deepEqual(casparLines({ verb: 'out', slot: clipSlot, item: clip('VT') }, { follower: { file: 'EMPTY' } }), ['CLEAR 2-10']);
  // A template still plays its own exit.
  assert.deepEqual(casparLines({ verb: 'out', slot: clipSlot, item: { kind: 'template', name: 'T' } }, { follower: { file: 'NEXT' } }), ['CG 2-10 STOP 1']);
  // A refused take owes a follower of a sequence this line.
  assert.equal(disarmLine(clipSlot), 'LOADBG 2-10 EMPTY');
});

test('a sequence plays its first file and queues the second at once; the runner queues the rest', () => {
  const entry = (name, playback, seconds = 10) => ({ item: clip(name), media: { kind: 'movie', seconds }, ...(playback ? { playback } : {}) });
  // The incoming clip decides the transition: its fade in is the MIX into it (§6.6).
  assert.deepEqual(
    casparLines({ verb: 'sequence', slot: clipSlot, entries: [entry('A', { fadeIn: 0.5, gain: 0.5012 }), entry('B', { fadeIn: 1, trim: { in: 1 } }), entry('C')] }, { rate: 50 }),
    ['PLAY 2-10 "A" MIX 25 AF "volume=0.5012"', 'LOADBG 2-10 "B" IN 50 MIX 50 AUTO'],
  );
  // The last entry's own Loop goes with it when it is queued; a Loop before the last never does.
  assert.deepEqual(casparLines({ verb: 'sequence', slot: clipSlot, entries: [entry('A'), entry('B', { end: 'loop' })] }), ['PLAY 2-10 "A"', 'LOADBG 2-10 "B" LOOP AUTO']);
  assert.equal(followLine(clipSlot, { entry: entry('C', { end: 'loop' }), last: true }, 50), 'LOADBG 2-10 "C" LOOP AUTO');
  assert.equal(followLine(clipSlot, { entry: entry('C', { fadeIn: 0.5 }), last: false }, 50), 'LOADBG 2-10 "C" MIX 25 AUTO');
  // After the last entry, its own Clear.
  assert.equal(followLine(clipSlot, { clear: { fadeOut: 1 } }, 50), 'LOADBG 2-10 EMPTY MIX 50 AUTO');
  assert.equal(followLine(clipSlot, { clear: {} }, undefined), 'LOADBG 2-10 EMPTY AUTO');
});

test('seconds become the channel\'s frames at 25p, 50p, 29.97 and 59.94; a fade is at least one frame', () => {
  assert.deepEqual([framesAt(0.5, 25), framesAt(1, 25)], [13, 25]);
  assert.deepEqual([framesAt(0.5, 50), framesAt(1, 50)], [25, 50]);
  assert.deepEqual([framesAt(0.5, 30000 / 1001), framesAt(1, 30000 / 1001)], [15, 30]);
  assert.deepEqual([framesAt(0.5, 60000 / 1001), framesAt(1, 60000 / 1001)], [30, 60]);
  assert.equal(framesAt(0.001, 50), 1);
  assert.throws(() => framesAt(1, 0), /frames/);
  // A trim point counts from frame 0.
  assert.deepEqual(casparLines({ verb: 'take', item: clip('VT'), slot: clipSlot, playback: { trim: { in: 0, out: 2.5 } } }, { rate: 30000 / 1001 }), ['PLAY 2-10 "VT" IN 0 OUT 75']);
  // Nothing timed is written without a rate: the adapter reads one first.
  assert.throws(() => casparLines({ verb: 'take', item: clip('VT'), slot: clipSlot, playback: { fadeIn: 1 } }), /frame rate/);
});

test('the level is the clip\'s own audio filter, four decimals, and no action ever sends MIXER', () => {
  assert.equal(volumeFilter(10 ** (-12 / 20)), 'volume=0.2512');
  assert.equal(volumeFilter(10 ** (6 / 20)), 'volume=1.9953');
  assert.equal(volumeFilter(0), 'volume=0.0000');
  // §18 case 24: the layer gain would multiply with the clip's and outlive it, so it is never sent.
  const playback = { end: 'clear', fadeIn: 1, fadeOut: 1, gain: 0.2512, trim: { in: 1, out: 5 } };
  const entry = { item: clip('B'), media: { kind: 'movie', seconds: 10 }, playback: { gain: 0.1 } };
  const every = [
    { verb: 'take', item: clip('A'), slot: clipSlot, playback },
    { verb: 'take', item: clip('A'), slot: clipSlot, loop: true, playback: { gain: 2 } },
    { verb: 'out', slot: clipSlot, item: clip('A'), fadeOut: 1 },
    { verb: 'out', slot: clipSlot, item: clip('A') },
    { verb: 'pause', slot: clipSlot },
    { verb: 'resume', slot: clipSlot },
    { verb: 'sequence', slot: clipSlot, entries: [{ ...entry, item: clip('A') }, entry] },
  ].flatMap((a) => casparLines(a, { rate: 50, follower: { file: 'X' } }));
  every.push(followLine(clipSlot, { entry, last: true }, 50), followLine(clipSlot, { clear: { fadeOut: 1 } }, 50), disarmLine(clipSlot));
  assert.ok(every.length >= 11);
  for (const line of every) assert.ok(!/^MIXER\b/.test(line), line);
});

test('a take with a fade reads the channel\'s rate first, once, and keeps it', async (ctx) => {
  const caspar = await fakeCasparServer({ media: { VT: { kind: 'movie', seconds: 30 } }, channels: { 2: { fps: 50 } } });
  ctx.after(() => caspar.close());
  const adapter = createCasparcgAdapter();
  const t = { adapter: 'casparcg', host: '127.0.0.1', port: caspar.port };
  const take = { verb: 'take', item: clip('VT'), slot: clipSlot, playback: { fadeIn: 0.5 } };
  assert.equal((await adapter.act(t, take)).ok, true);
  assert.equal((await adapter.act(t, take)).ok, true);
  // The second take counted the same fade without asking again; a take with nothing timed never asks.
  assert.equal((await adapter.act(t, { verb: 'take', item: clip('VT'), slot: clipSlot })).ok, true);
  assert.deepEqual(caspar.seen, ['INFO 2', 'PLAY 2-10 "VT" MIX 25', 'PLAY 2-10 "VT" MIX 25', 'PLAY 2-10 "VT"']);
  // A reading of the channel after its format changed counts the next fade in the new rate (§18, case 7).
  caspar.setRate(2, 25);
  await adapter.state(t, 2);
  await adapter.act(t, take);
  assert.equal(caspar.seen.at(-1), 'PLAY 2-10 "VT" MIX 13');
});

test('an action with a field the adapter cannot honour is refused on the Bridge\'s hop, never dropped', async () => {
  // §18 case 13. OGraf has no fades, levels, trims or sequences: nothing is sent at all.
  const ograf = createOgrafAdapter({ timeoutMs: 200 });
  const target = { adapter: 'ograf', baseUrl: 'http://127.0.0.1:9' };
  const slot = { adapter: 'ograf', rendererId: 'r1', renderTarget: { layer: 1 } };
  for (const action of [
    { verb: 'take', item: { kind: 'template', name: 'g' }, slot, playback: { gain: 0.5 } },
    { verb: 'out', slot, fadeOut: 1 },
    { verb: 'sequence', slot, entries: [] },
  ]) {
    const r = await ograf.act(target, action);
    assert.equal(r.ok, false);
    assert.deepEqual([r.error.hop, r.error.code], ['agent', 'unsupported']);
    assert.match(r.error.detail, /OGraf adapter cannot play .*nothing was sent/);
  }
  // A level-only update is refused before any adapter sees it: a level applies at the next Take.
  assert.throws(() => readAction({ action: { verb: 'update', slot: clipSlot, data: {}, playback: { gain: 0.5 } } }), /carries no playback/);
  // A playback field this Bridge does not know is refused by name, never dropped.
  assert.throws(() => readAction({ action: { verb: 'take', item: clip('VT'), slot: clipSlot, playback: { speed: 2 } } }), /does not know the playback field "speed"/);
});

test('a malformed playback or sequence is refused with the reason', () => {
  const take = (playback, extra = {}) => readAction({ action: { verb: 'take', item: clip('VT'), slot: clipSlot, playback, ...extra } });
  assert.deepEqual(take({ end: 'clear', fadeOut: 0.5, gain: 0.25, trim: { in: 1, out: 4 } }).playback, { end: 'clear', fadeOut: 0.5, gain: 0.25, trim: { in: 1, out: 4 } });
  // §18 case 6: a trim that ends before it starts, or before the file does.
  assert.throws(() => take({ trim: { in: 5, out: 2 } }), /ends after it starts/);
  assert.throws(() => take({ trim: { in: -1 } }), /from 0/);
  assert.throws(() => take({ trim: {} }), /names where/);
  assert.throws(() => take({ fadeIn: 0 }), /above 0/);
  assert.throws(() => take({ fadeOut: 60 }), /at most/);
  assert.throws(() => take({ gain: 3 }), /from 0 to 2/);
  assert.throws(() => take({ end: 'next' }), /hold, clear or loop/);
  assert.throws(() => take({ end: 'clear' }, { loop: true }), /both loop and clear/);
  assert.throws(() => readAction({ action: { verb: 'take', item: { kind: 'template', name: 'T' }, slot: clipSlot, playback: { gain: 1 } } }), /Only a clip/);
  assert.throws(() => readAction({ action: { verb: 'pause', slot: clipSlot, fadeOut: 1 } }), /carries no fadeOut/);

  const entry = (name, seconds, playback, kind = 'movie') => ({ item: clip(name), media: { kind, seconds }, ...(playback ? { playback } : {}) });
  const seq = (entries) => readAction({ action: { verb: 'sequence', slot: clipSlot, entries } });
  assert.equal(seq([entry('A', 1), entry('B', 2), entry('C', 30, { end: 'clear' })]).entries.length, 3);
  // §18 case 4: a still never ends, so nothing after it could play.
  assert.throws(() => seq([entry('A', 10), entry('S', 10, undefined, 'still')]), /is a still, which never ends/);
  // §18 case 5: a file whose kind or length is not known cannot join.
  assert.throws(() => seq([entry('A', 10), { item: clip('B'), media: { kind: 'movie' } }]), /no known length/);
  assert.throws(() => seq([entry('A', 10), { item: clip('B') }]), /does not say what kind/);
  // §18 case 8: every member after the first plays at least two seconds, trimmed or not.
  assert.throws(() => seq([entry('A', 10), entry('B', 1.5)]), /plays 1.5 s/);
  assert.throws(() => seq([entry('A', 10), entry('B', 10, { trim: { in: 9 } })]), /plays 1 s/);
  assert.throws(() => seq([entry('A', 10), entry('B', 10, { trim: { in: 12 } })]), /outside its 10 s file/);
  // Only the last entry ends by its own setting: the next file plays after each of the others.
  assert.throws(() => seq([entry('A', 10, { end: 'loop' }), entry('B', 10)]), /only the last entry/);
  assert.throws(() => seq([entry('A', 10)]), /at least two/);
});

// ── The adapter against a fake server ──────────────────────────────────────────────────────

const target = (port) => ({ adapter: 'casparcg', host: '127.0.0.1', port });

test('status reads the version; list reads templates and media; a 404 is not-found', async () => {
  const caspar = await fakeCaspar((line) => {
    if (line === 'VERSION') return '201 VERSION OK\r\n2.5.0 69e8ad5 Stable\r\n';
    if (line === 'TLS') return '200 TLS OK\r\nBK/SB01\r\nHOUSE_STRAP/HOUSE_STRAP\r\n\r\n';
    // The last field is a time base, seconds per frame: 1/25 is a 25 fps clip.
    if (line === 'CLS') return '200 CLS OK\r\n"GIORNO"  MOVIE  10485760 20260814221648 1500 1/25\r\n\r\n';
    if (line.startsWith('THUMBNAIL RETRIEVE')) return '201 THUMBNAIL RETRIEVE OK\r\niVBORw0KGgo=\r\n';
    if (line === 'PLAY 1-10 "NOSUCHCLIP"') return '404 PLAY FAILED\r\n';
    return '202 CG OK\r\n';
  });
  const t = target(caspar.port);
  const status = await casparcgAdapter.status(t);
  assert.deepEqual(status, { ok: true, value: { version: '2.5.0 69e8ad5 Stable' }, raw: '201 VERSION OK' });
  const templates = await casparcgAdapter.list(t, 'template');
  assert.deepEqual(templates.value, [
    { name: 'BK/SB01', kind: 'template' },
    { name: 'HOUSE_STRAP/HOUSE_STRAP', kind: 'template' },
  ]);
  const media = await casparcgAdapter.list(t, 'media');
  assert.deepEqual(media.value, [{ name: 'GIORNO', kind: 'movie', frames: 1500, fps: 25, bytes: 10485760, changed: '20260814221648' }]);
  const thumb = await casparcgAdapter.thumbnail(t, 'GIORNO');
  assert.deepEqual(thumb.value, { png: 'iVBORw0KGgo=' });
  const missing = await casparcgAdapter.act(t, { verb: 'take', item: { kind: 'media', name: 'NOSUCHCLIP' }, slot: { ...slot, layer: 10 } });
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'not-found');
  assert.equal(missing.error.raw, '404 PLAY FAILED');
  await caspar.close();
});

test('a 501 on a list is the media scanner missing, told apart from a dead server', async () => {
  // Measured 2026-09-22 on 2.5.0 with scanner.exe stopped: VERSION answers, TLS answers
  // `501 TLS FAILED` about 5 s later. The list wait is longer than that on purpose.
  assert.ok(LIST_TIMEOUT_MS > 6000);
  const caspar = await fakeCaspar((line) => (line === 'TLS' ? '501 TLS FAILED\r\n' : '201 VERSION OK\r\n2.5.0\r\n'));
  const r = await casparcgAdapter.list(target(caspar.port), 'template');
  assert.equal(r.ok, false);
  assert.equal(r.error.code, 'no-media-scanner');
  assert.match(r.error.detail, /media scanner is not running/);
  await caspar.close();

  const dead = await casparcgAdapter.status(target(1));
  assert.equal(dead.ok, false);
  assert.equal(dead.error.code, 'unreachable');
});

// ── The Bridge's own refusals ───────────────────────────────────────────────────────────────

const ORIGINS = ['https://noacg.studio'];

test('the origin allowlist takes the deployment and loopback, and nothing else', () => {
  assert.deepEqual(allowedOrigins(['https://staging.example/']).slice(-1), ['https://staging.example']);
  assert.equal(originAllowed('https://noacg.studio', ORIGINS), true);
  assert.equal(originAllowed('https://noacg.studio/', ORIGINS), true);
  assert.equal(originAllowed('http://localhost:5184', ORIGINS), true);
  assert.equal(originAllowed('http://127.0.0.1:5184', ORIGINS), true);
  assert.equal(originAllowed(undefined, ORIGINS), true); // a terminal, which the token gates
  assert.equal(originAllowed('https://evil.example', ORIGINS), false);
  assert.equal(originAllowed('https://noacg.studio.evil.example', ORIGINS), false);
});

async function withBridge(fn, extra = {}) {
  const server = createBridgeServer(
    { token: 'secret-token', origins: ORIGINS, adapters: [casparcgAdapter], version: '0.0.0-test', ...extra },
    () => {},
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const post = (base, path, body, headers = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { Origin: 'https://noacg.studio', Authorization: 'Bearer secret-token', 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

test('presence answers any origin without a token and says nothing about the studio', async () => {
  await withBridge(async (base) => {
    const health = await fetch(`${base}/health`, { headers: { Origin: 'https://another-noacg.example' } });
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('access-control-allow-origin'), 'https://another-noacg.example');
    // `features` says what this Bridge understands and nothing about any server: the one route that
    // answers without a token still names no studio.
    assert.deepEqual(await health.json(), {
      ok: true,
      agent: 'noacg-bridge',
      v: PLAYOUT_V,
      version: '0.0.0-test',
      adapters: ['casparcg'],
      features: ['state', 'playback', 'sequence'],
    });

    const noToken = await fetch(`${base}/status`, { method: 'POST', headers: { Origin: 'https://noacg.studio' } });
    assert.equal(noToken.status, 401);
    const wrong = await post(base, '/status', {}, { Authorization: 'Bearer nope' });
    assert.equal(wrong.status, 401);
  });
});

test('a foreign origin is refused with no CORS headers at all, so a guessed token still reads nothing', async () => {
  await withBridge(async (base) => {
    const res = await post(base, '/status', {}, { Origin: 'https://evil.example' });
    assert.equal(res.status, 403);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
  });
});

test('a forged Host header is refused, so a name resolving to 127.0.0.1 cannot reach in', async () => {
  await withBridge(async (base) => {
    const url = new URL(base);
    const status = await new Promise((resolve, reject) => {
      const req = httpRequest(
        { host: '127.0.0.1', port: Number(url.port), path: '/health', method: 'GET', headers: { Host: 'rebind.evil.example', Origin: 'https://noacg.studio' } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on('error', reject);
      req.end();
    });
    assert.equal(status, 403);
  });
});

test('pairing spends a one-time code for the token, once, and only while it is fresh', async () => {
  const pairing = { code: 'fresh-code', expiresAt: Date.now() + 60_000, used: false };
  await withBridge(async (base) => {
    const wrong = await post(base, '/pair', { code: 'guess' }, { Authorization: '' });
    assert.equal(wrong.status, 401);
    const first = await post(base, '/pair', { code: 'fresh-code' }, { Authorization: '' });
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { ok: true, v: PLAYOUT_V, token: 'secret-token' });
    const again = await post(base, '/pair', { code: 'fresh-code' }, { Authorization: '' });
    assert.equal(again.status, 401);
  }, { pairing });
  await withBridge(async (base) => {
    const stale = await post(base, '/pair', { code: 'old-code' }, { Authorization: '' });
    assert.equal(stale.status, 401);
  }, { pairing: { code: 'old-code', expiresAt: Date.now() - 1, used: false } });
});

test('every request names its target, and an action reaches AMCP as exactly one line', async () => {
  const caspar = await fakeCaspar('202 CG OK\r\n');
  await withBridge(async (base) => {
    const noTarget = await post(base, '/act', { action: { verb: 'next', slot } });
    assert.equal(noTarget.status, 400);
    assert.equal((await noTarget.json()).error.code, 'usage');

    const res = await post(base, '/act', {
      target: target(caspar.port),
      action: { verb: 'take', item: { kind: 'template', name: 'BK/SB01' }, slot: { adapter: 'casparcg', channel: 2, layer: 30 }, data: { f0: 'Home', f1: '3' } },
    });
    assert.equal(res.status, 200);
    // The reply carries the slot's generation, the session that counted it and the take's instance
    // (docs/CLIP_PLAYBACK_PLAN.md §6.7); the LINE on the wire is exactly what it was before any
    // of them existed.
    const reply = await res.json();
    assert.deepEqual(
      { ...reply, instance: typeof reply.instance, session: typeof reply.session },
      { ok: true, v: PLAYOUT_V, raw: '202 CG OK', generation: 1, session: 'string', instance: 'string' },
    );
    assert.ok(reply.instance.startsWith(`${reply.session}.`), 'an instance id starts with its session');
    assert.deepEqual(caspar.seen, ['CG 2-30 ADD 1 "BK/SB01" 1 "{\\"f0\\":\\"Home\\",\\"f1\\":\\"3\\"}"']);
  });
  await caspar.close();
});

test('CasparCG being absent is reported on the target hop - the Bridge itself is fine', async () => {
  await withBridge(async (base) => {
    const res = await post(base, '/status', { target: target(1) });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error.hop, 'target');
    assert.equal(body.error.code, 'unreachable');
    assert.match(body.error.detail, /ECONNREFUSED|EACCES/);
  });
});
