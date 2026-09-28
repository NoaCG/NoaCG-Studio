// THE SEQUENCE RUNNER (docs/CLIP_PLAYBACK_PLAN.md §6.10, §18 cases 1-11 and 16): the real Bridge -
// its HTTP route, its slot memory, its runner and the CasparCG adapter - against the stateful fake
// server, with time moved by the test and each fault injected on purpose. No page is involved: a
// sequence runs with nobody reading `/state` at all, which is what happens when the tab is closed.
// Run `npm run build` first.

import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { test } from 'node:test';
import { createCasparcgAdapter } from '../dist/playout/adapters/casparcg.js';
import { RUNNER_INTERVAL_MS, SequenceRunner } from '../dist/playout/runner.js';
import { createBridgeServer } from '../dist/playout/server.js';
import { SlotMemoryBank } from '../dist/playout/slots.js';
import { fakeCasparServer } from './_fakeCasparServer.mjs';

const TOKEN = 'b'.repeat(64);
const AT = { adapter: 'casparcg', channel: 2, layer: 10 };
const MEDIA = {
  A: { kind: 'movie', seconds: 10 },
  B: { kind: 'movie', seconds: 10 },
  C: { kind: 'movie', seconds: 10 },
  D: { kind: 'movie', seconds: 10 },
  X: { kind: 'movie', seconds: 10 },
  TWO: { kind: 'movie', seconds: 2 },
  STILL: { kind: 'still' },
};

/** A sequence entry as the page sends one. */
const entry = (name, playback, seconds = MEDIA[name]?.seconds ?? 10) => ({
  item: { kind: 'media', name },
  cueId: `cue-${name}`,
  media: { kind: 'movie', seconds },
  ...(playback ? { playback } : {}),
});

/** One Bridge over the fake: its route, and its runner, whose rounds the test drives. */
async function bridgeOver(t, caspar, session = 'b1') {
  const memory = new SlotMemoryBank(session, () => caspar.clock.now());
  const adapter = createCasparcgAdapter(() => caspar.clock.now());
  const runner = new SequenceRunner({ memory, adapters: [adapter] });
  const server = createBridgeServer({ token: TOKEN, origins: [], adapters: [adapter], version: '0.5.0', memory, runner }, () => {});
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const port = server.address().port;
  const call = (path, body) =>
    new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = httpRequest(
        { host: '127.0.0.1', port, path, method: 'POST', headers: { host: `127.0.0.1:${port}`, 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` } },
        (res) => {
          let raw = '';
          res.on('data', (c) => (raw += c));
          res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
        },
      );
      req.on('error', reject);
      req.end(data);
    });
  const target = { adapter: 'casparcg', host: '127.0.0.1', port: caspar.port };
  const act = (action) => call('/act', { target, action });
  const state = () => call('/state', { target, channel: AT.channel });
  return { act, state, runner, memory };
}

/** A fake CasparCG with channel 2 at 50p. */
async function server(t, extra = {}) {
  const caspar = await fakeCasparServer({ media: MEDIA, channels: { 2: { fps: 50 } }, ...extra });
  t.after(() => caspar.close());
  return caspar;
}

/** Move time the way the Bridge lives it: a runner round every quarter second. */
async function run(caspar, runner, ms) {
  for (let left = ms; left > 0; left -= RUNNER_INTERVAL_MS) {
    caspar.advance(Math.min(RUNNER_INTERVAL_MS, left));
    await runner.round();
  }
}

const onAir = (caspar) => caspar.layer(2, 10).foreground;
/** Every file that has aired on 2-10, in order, from the model's history of commands and switches. */
function airedFiles(caspar, sample) {
  const seen = [];
  for (const f of sample) if (f && seen.at(-1) !== f) seen.push(f);
  return seen;
}

/** Sample what is on air every 50 ms for `ms`, with runner rounds on the Bridge's own beat. */
async function watch(caspar, runner, ms) {
  const files = [];
  for (let at = 0; at < ms; at += 50) {
    caspar.advance(50);
    if (at % RUNNER_INTERVAL_MS === 0) await runner.round();
    files.push(onAir(caspar)?.producer === 'colour' ? 'EMPTY' : (onAir(caspar)?.file ?? null));
  }
  return files;
}

test('a sequence plays through with no gap: each file queued as the one before it starts', async (t) => {
  const caspar = await server(t);
  const { act, state, runner } = await bridgeOver(t, caspar);
  const take = await act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B', { fadeIn: 1 }), entry('C', { fadeIn: 0.5 })] });
  assert.equal(take.body.ok, true);
  assert.deepEqual([take.body.generation, take.body.instance], [1, 'b1.1']);
  // The take plays the first file and queues the second at once, the MIX into it counted in the
  // channel's frames (read once, from INFO).
  assert.deepEqual(caspar.seen, ['INFO 2', 'PLAY 2-10 "A"', 'LOADBG 2-10 "B" MIX 50 AUTO']);

  const files = await watch(caspar, runner, 31_000);
  // A, then B from 9 s (its 1 s MIX starts 1 s before A ends), then C from 18.5 s: never black.
  assert.deepEqual(airedFiles(caspar, files), ['A', 'B', 'C']);
  assert.ok(!files.slice(0, files.lastIndexOf('C')).includes(null), 'nothing but a clip between the first frame and the last');
  assert.equal(files.indexOf('B'), 9_000 / 50 - 1);
  // The runner queued C once it saw B, and nothing after C: C is the last and holds its last frame.
  assert.deepEqual(
    caspar.seen.filter((l) => !l.startsWith('INFO')),
    ['PLAY 2-10 "A"', 'LOADBG 2-10 "B" MIX 50 AUTO', 'LOADBG 2-10 "C" MIX 25 AUTO'],
  );
  assert.deepEqual([onAir(caspar).file, onAir(caspar).ended], ['C', true]);
  // Nobody asked `/state` at all (§18 case 16, the Bridge's half): the page could have been closed.
  // And once the last entry holds by itself, the runner stops reading the channel.
  const reads = caspar.seen.filter((l) => l.startsWith('INFO')).length;
  await run(caspar, runner, 2_000);
  assert.equal(caspar.seen.filter((l) => l.startsWith('INFO')).length, reads);
  // The reading names the entry on air, by its cue.
  const s = (await state()).body.slots[0];
  assert.deepEqual([s.file, s.instance, s.cueId, s.sequence], ['C', 'b1.1', 'cue-C', undefined]);
});

test('while a sequence runs, a reading says which entry is on air and what is still to play', async (t) => {
  const caspar = await server(t);
  const { act, state, runner } = await bridgeOver(t, caspar);
  await act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B'), entry('C', { end: 'clear', fadeOut: 0.5 })] });
  caspar.advance(2_000);
  let s = (await state()).body.slots[0];
  assert.deepEqual([s.file, s.cueId, s.sequence.next.map((e) => e.cueId)], ['A', 'cue-A', ['cue-B', 'cue-C']]);
  assert.deepEqual(s.queued, { file: 'B', auto: true });
  // The server switches by itself; the page's reading may see it before the runner does.
  caspar.advance(8_100);
  s = (await state()).body.slots[0];
  assert.deepEqual([s.file, s.cueId, s.sequence.next.map((e) => e.cueId)], ['B', 'cue-B', ['cue-C']]);
  // ...and the runner, reading after it, still queues the next one exactly once.
  await runner.round();
  await runner.round();
  assert.equal(caspar.seen.filter((l) => l.startsWith('LOADBG 2-10 "C"')).length, 1);
  // The last entry's own Clear, once it is on air, fading out 25 frames before its end.
  await run(caspar, runner, 10_000);
  assert.equal(caspar.seen.filter((l) => !l.startsWith('INFO')).at(-1), 'LOADBG 2-10 EMPTY MIX 25 AUTO');
  await run(caspar, runner, 10_000);
  assert.equal(onAir(caspar).producer, 'colour', 'the layer cleared at the end of the last clip');
  const after = (await state()).body.slots[0];
  assert.deepEqual([after.producer, after.instance], ['colour', undefined]);
});

test('Out in the middle stops the sequence, and nothing else airs', async (t) => {
  const caspar = await server(t);
  const { act, runner } = await bridgeOver(t, caspar);
  await act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B'), entry('C')] });
  await run(caspar, runner, 12_000);
  assert.equal(onAir(caspar).file, 'B');
  const out = await act({ verb: 'out', slot: AT, item: { kind: 'media', name: 'B' } });
  assert.equal(out.body.ok, true);
  // C was queued behind B: STOP would keep it loaded, so Out clears the layer whole (rule 5).
  assert.equal(caspar.seen.at(-1), 'CLEAR 2-10');
  const files = await watch(caspar, runner, 30_000);
  assert.deepEqual(airedFiles(caspar, files), []);
  assert.ok(!caspar.seen.slice(caspar.seen.indexOf('CLEAR 2-10')).some((l) => l.startsWith('LOADBG') || l.startsWith('PLAY')));
});

test('Out with a fade mixes to nothing and takes the queued follower with it', async (t) => {
  const caspar = await server(t);
  const { act, runner } = await bridgeOver(t, caspar);
  await act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B')] });
  caspar.advance(3_000);
  await act({ verb: 'out', slot: AT, item: { kind: 'media', name: 'A' }, fadeOut: 0.5 });
  assert.equal(caspar.seen.at(-1), 'PLAY 2-10 EMPTY MIX 25');
  const files = await watch(caspar, runner, 20_000);
  assert.deepEqual(airedFiles(caspar, files), ['EMPTY']);
});

test('§18 case 1: a queue decided before Out never reaches the emptied layer, nor one a new Take holds', async (t) => {
  // The runner's reading is answered from BEFORE the Out and delivered after it: the one moment a
  // runner could decide to queue onto a layer that has since been emptied - where LOADBG … AUTO
  // plays at once (§4, the empty-layer row).
  let hold = false;
  let release;
  const caspar = await server(t, {
    intercept: async (line, { answer }) => {
      if (!hold || !line.startsWith('INFO')) return undefined;
      const early = answer();
      await new Promise((r) => (release = r));
      return early;
    },
  });
  const { act, runner } = await bridgeOver(t, caspar);
  /** B on air, seen by the runner, and C still to queue: B was paused as it came up (nothing is
   *  queued onto a paused clip) and has just been resumed. The next reading decides to queue C. */
  const readyToQueueC = async () => {
    release = undefined;
    await act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B'), entry('C')] });
    caspar.advance(10_100);
    await act({ verb: 'pause', slot: AT });
    await runner.round();
    assert.equal(onAir(caspar).file, 'B');
    await act({ verb: 'resume', slot: AT });
  };
  await readyToQueueC();
  hold = true;
  const round = runner.round();
  while (!release) await new Promise((r) => setTimeout(r, 2));
  hold = false;
  await act({ verb: 'out', slot: AT, item: { kind: 'media', name: 'B' } });
  release();
  await round;
  const files = await watch(caspar, runner, 20_000);
  assert.deepEqual(airedFiles(caspar, files), [], 'nothing airs after Out');
  assert.ok(!caspar.seen.some((l) => l.startsWith('LOADBG 2-10 "C"')), 'the old follower was never queued');

  // Across a new Take: the late decision must not land behind the new clip either.
  await readyToQueueC();
  hold = true;
  const again = runner.round();
  while (!release) await new Promise((r) => setTimeout(r, 2));
  hold = false;
  await act({ verb: 'take', item: { kind: 'media', name: 'X' }, slot: AT });
  release();
  await again;
  const after = await watch(caspar, runner, 20_000);
  assert.deepEqual(airedFiles(caspar, after), ['X'], 'the new clip plays and holds; no follower of the old sequence airs');
  assert.equal(caspar.seen.filter((l) => l.startsWith('LOADBG 2-10 "C"')).length, 0);
});

test('§18 case 1, in the queue: runner work waiting behind another command is dropped when an Out overtakes its plan', async (t) => {
  // The slot's serial queue is held by a slow command; the runner decides to queue C and waits
  // behind it; Out arrives. When the runner's turn comes its generation is old, and nothing is sent.
  let hold = false;
  let release;
  const caspar = await server(t, {
    intercept: async (line) => {
      if (hold && line.startsWith('CG 2-10 NEXT')) await new Promise((r) => (release = r));
      return undefined;
    },
    templates: [],
  });
  const { act, runner } = await bridgeOver(t, caspar);
  await act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B'), entry('C')] });
  caspar.advance(10_100);
  hold = true;
  const slow = act({ verb: 'next', slot: AT });
  while (!release) await new Promise((r) => setTimeout(r, 2));
  const round = runner.round();
  // Let the runner read and join the queue behind the held command.
  await new Promise((r) => setTimeout(r, 30));
  const out = act({ verb: 'out', slot: AT, item: { kind: 'media', name: 'B' } });
  await new Promise((r) => setTimeout(r, 10));
  hold = false;
  release();
  await Promise.all([slow, round, out]);
  assert.ok(!caspar.seen.some((l) => l.startsWith('LOADBG 2-10 "C"')), 'the queue was dropped unsent');
  const files = await watch(caspar, runner, 20_000);
  assert.deepEqual(airedFiles(caspar, files), []);
});

test('§18 case 2: a replacement Take the server refuses disarms the old follower', async (t) => {
  const caspar = await server(t);
  const { act, runner } = await bridgeOver(t, caspar);
  await act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B')] });
  caspar.advance(3_000);
  const refused = await act({ verb: 'take', item: { kind: 'media', name: 'GONE' }, slot: AT });
  assert.equal(refused.body.ok, false);
  assert.equal(refused.body.error.code, 'not-found');
  // The refused PLAY left B armed behind A; the Bridge replaces it with nothing, without AUTO.
  assert.deepEqual(caspar.seen.slice(-2), ['PLAY 2-10 "GONE"', 'LOADBG 2-10 EMPTY']);
  const files = await watch(caspar, runner, 20_000);
  assert.deepEqual(airedFiles(caspar, files), ['A'], 'A plays out and holds; B never airs');
  assert.equal(onAir(caspar).ended, true);
});

test('§18 case 3: the runner never queues onto a paused clip, and carries on after Resume', async (t) => {
  const caspar = await server(t);
  const { act, runner } = await bridgeOver(t, caspar);
  await act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B', { fadeIn: 1 }), entry('C', { fadeIn: 1 })] });
  // B switches in 1 s before A ends; pause B the moment it is on air, before the runner has read.
  caspar.advance(9_100);
  await act({ verb: 'pause', slot: AT });
  await run(caspar, runner, 20_000);
  assert.ok(!caspar.seen.some((l) => l.startsWith('LOADBG 2-10 "C"')), 'nothing queued while paused');
  assert.deepEqual([onAir(caspar).file, onAir(caspar).paused], ['B', true]);
  await act({ verb: 'resume', slot: AT });
  await run(caspar, runner, 500);
  assert.equal(caspar.seen.filter((l) => l.startsWith('LOADBG 2-10 "C"')).length, 1, 'queued once after Resume');
  const files = await watch(caspar, runner, 20_000);
  assert.deepEqual(airedFiles(caspar, files), ['B', 'C']);
});

test('§18 cases 1 and 3: a queue decided from a reading taken before a Pause is dropped unsent', async (t) => {
  // Pause keeps the sequence, so only the generation tells the runner its reading is from before
  // it: the decision to queue C was made on a playing B, and B is paused by the time it is sent.
  let hold = false;
  let release;
  const caspar = await server(t, {
    intercept: async (line, { answer }) => {
      if (!hold || !line.startsWith('INFO')) return undefined;
      const early = answer();
      await new Promise((r) => (release = r));
      return early;
    },
  });
  const { act, runner } = await bridgeOver(t, caspar);
  await act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B'), entry('C')] });
  caspar.advance(10_100);
  hold = true;
  const round = runner.round();
  while (!release) await new Promise((r) => setTimeout(r, 2));
  hold = false;
  await act({ verb: 'pause', slot: AT });
  release();
  await round;
  assert.ok(!caspar.seen.some((l) => l.startsWith('LOADBG 2-10 "C"')), 'nothing was queued onto the paused clip');
  await run(caspar, runner, 5_000);
  assert.ok(!caspar.seen.some((l) => l.startsWith('LOADBG 2-10 "C"')), 'nor while it stays paused');
  await act({ verb: 'resume', slot: AT });
  const files = await watch(caspar, runner, 20_000);
  assert.deepEqual(airedFiles(caspar, files), ['B', 'C']);
});

test('§18 case 3: a pause before, at and inside the MIX threshold of a queued follower', async (t) => {
  // The server checks AUTO before pause (§4): paused before the window the follower waits; paused
  // inside it the follower starts anyway, and the runner then follows the server rather than
  // queuing onto anything paused.
  for (const [pausedAt, starts] of [
    [8_500, false], // 1.5 s before the end, before the 1 s window
    [9_000, true], // at the threshold
    [9_500, true], // inside it
  ]) {
    const caspar = await server(t);
    const { act, runner } = await bridgeOver(t, caspar);
    await act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B', { fadeIn: 1 }), entry('C')] });
    caspar.advance(pausedAt);
    await act({ verb: 'pause', slot: AT });
    await run(caspar, runner, 5_000);
    assert.equal(onAir(caspar).file === 'B', starts, `paused at ${pausedAt} ms`);
    // Whatever the server did, the runner queued C only onto a clip that is playing.
    const queuedC = caspar.seen.some((l) => l.startsWith('LOADBG 2-10 "C"'));
    assert.equal(queuedC, starts && !onAir(caspar).paused, `paused at ${pausedAt} ms`);
    await act({ verb: 'resume', slot: AT });
    const files = await watch(caspar, runner, 25_000);
    assert.deepEqual(airedFiles(caspar, files).slice(-1), ['C'], `paused at ${pausedAt} ms: the sequence still reaches its end`);
  }
});

test('§18 case 4: a still that joined as a movie ends the sequence; nothing more is sent', async (t) => {
  const caspar = await server(t);
  const { act, runner } = await bridgeOver(t, caspar);
  // The page's list was wrong about the file: it is a still, which never ends.
  await act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('STILL', undefined, 10), entry('C')] });
  await run(caspar, runner, 12_000);
  assert.equal(onAir(caspar).producer, 'still');
  assert.ok(!caspar.seen.some((l) => l.startsWith('LOADBG 2-10 "C"')));
  await run(caspar, runner, 2_000);
  const reads = caspar.seen.filter((l) => l.startsWith('INFO')).length;
  await run(caspar, runner, 2_000);
  assert.equal(caspar.seen.filter((l) => l.startsWith('INFO')).length, reads, 'the runner stopped reading');
});

test('§18 case 7: a format change mid-sequence counts the next fade in the new rate', async (t) => {
  const caspar = await server(t);
  const { act, runner } = await bridgeOver(t, caspar);
  await act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B', { fadeIn: 1 }), entry('C', { fadeIn: 1 })] });
  assert.ok(caspar.seen.includes('LOADBG 2-10 "B" MIX 50 AUTO'));
  caspar.setRate(2, 25);
  await run(caspar, runner, 12_000);
  assert.ok(caspar.seen.includes('LOADBG 2-10 "C" MIX 25 AUTO'), caspar.seen.filter((l) => l.startsWith('LOADBG')).join(' | '));
});

test('§18 case 8: a two-second member has its follower queued in time; a shorter one is refused', async (t) => {
  const caspar = await server(t);
  const { act, runner } = await bridgeOver(t, caspar);
  await act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('TWO', undefined, 2), entry('C')] });
  const files = await watch(caspar, runner, 20_000);
  assert.deepEqual(airedFiles(caspar, files), ['A', 'TWO', 'C']);
  // TWO ends at 12 s; C starts on the next frame, with no hold on TWO's last frame.
  assert.equal(files.indexOf('C') - files.indexOf('TWO'), 2_000 / 50);
  const short = await act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('TWO', { trim: { in: 0.5 } }, 2)] });
  assert.equal(short.status, 400);
  assert.deepEqual([short.body.error.hop, short.body.error.code], ['agent', 'usage']);
  assert.match(short.body.error.detail, /plays 1.5 s/);
});

test('§18 case 9: another client takes the slot; the runner ends its sequence and sends nothing', async (t) => {
  const caspar = await server(t);
  const { act, state, runner } = await bridgeOver(t, caspar);
  await act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B'), entry('C')] });
  // Past the take's own arrival (slots.ts LOADING_GRACE_MS), when another file there means another client.
  await run(caspar, runner, 2_000);
  // The CasparCG Client plays something else there, on its own connection.
  const other = await fakeClient(caspar.port, 'PLAY 2-10 "X"');
  assert.equal(other, '202 PLAY OK');
  const sent = caspar.seen.length;
  const files = await watch(caspar, runner, 25_000);
  assert.deepEqual(airedFiles(caspar, files), ['X']);
  assert.deepEqual(caspar.seen.slice(sent).filter((l) => !l.startsWith('INFO')), [], 'the runner sent nothing');
  // Its sequence is over, so it stops reading the slot too.
  assert.ok(caspar.seen.slice(sent).filter((l) => l.startsWith('INFO')).length <= 2, 'the runner stopped reading once it saw the slot taken');
  const s = (await state()).body.slots[0];
  assert.deepEqual([s.file, s.instance, s.sequence], ['X', undefined, undefined]);
});

test('§18 cases 9 and 10: a queue decided just before somebody else took the slot is never sent', async (t) => {
  // No generation of this Bridge moves when ANOTHER Bridge or client takes the slot, so the slot is
  // read once more right before a follower goes. The first reading here is answered from before the
  // other take and delivered after it.
  let hold = false;
  let release;
  const caspar = await server(t, {
    intercept: async (line, { answer }) => {
      if (!hold || !line.startsWith('INFO')) return undefined;
      hold = false;
      const early = answer();
      await new Promise((r) => (release = r));
      return early;
    },
  });
  const one = await bridgeOver(t, caspar, 'one');
  const two = await bridgeOver(t, caspar, 'two');
  await one.act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B'), entry('C')] });
  caspar.advance(10_100);
  // B on air and seen, C still to queue: B was paused as it came up and has just been resumed.
  await one.act({ verb: 'pause', slot: AT });
  await one.runner.round();
  await one.act({ verb: 'resume', slot: AT });
  hold = true;
  const round = one.runner.round();
  while (!release) await new Promise((r) => setTimeout(r, 2));
  await two.act({ verb: 'take', item: { kind: 'media', name: 'X' }, slot: AT });
  release();
  await round;
  assert.ok(!caspar.seen.some((l) => l.startsWith('LOADBG 2-10 "C"')), 'the first Bridge queued nothing behind the other take');
  const files = await watch(caspar, one.runner, 25_000);
  assert.deepEqual(airedFiles(caspar, files), ['X']);
});

test('§18 case 10: two Bridges on one slot - the last taker owns it, and the other never re-queues', async (t) => {
  const caspar = await server(t);
  const one = await bridgeOver(t, caspar, 'one');
  const two = await bridgeOver(t, caspar, 'two');
  await one.act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B'), entry('C')] });
  await run(caspar, one.runner, 1_000);
  await two.act({ verb: 'sequence', slot: AT, entries: [entry('X'), entry('D')] });
  const sent = caspar.seen.length;
  const files = [];
  for (let at = 0; at < 25_000; at += 250) {
    caspar.advance(250);
    await one.runner.round();
    await two.runner.round();
    files.push(onAir(caspar)?.file ?? null);
  }
  assert.deepEqual(airedFiles(caspar, files), ['X', 'D']);
  assert.ok(!caspar.seen.slice(sent).some((l) => /LOADBG 2-10 "(B|C)"/.test(l)), 'the first Bridge queued nothing more');
});

test('§18 case 11: a restarted Bridge has no sequence; a dropped connection is not a restart', async (t) => {
  // A dropped connection: one reading fails, and the runner simply reads again next round.
  let drop = false;
  const caspar = await server(t, {
    intercept: (line) => {
      if (drop && line.startsWith('INFO')) throw new Error('connection dropped');
      return undefined;
    },
  });
  const first = await bridgeOver(t, caspar, 'first');
  await first.act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B'), entry('C', { end: 'loop' })] });
  caspar.advance(10_100);
  drop = true;
  await first.runner.round();
  drop = false;
  await run(caspar, first.runner, 1_000);
  assert.equal(caspar.seen.filter((l) => l.startsWith('LOADBG 2-10 "C" LOOP AUTO')).length, 1, 'the sequence went on after the dropped reading');

  // A restart: a new Bridge, a new session, no memory. What the server holds is nobody's, and what
  // the server had queued plays by its own rule - the looping last clip loops.
  const second = await bridgeOver(t, caspar, 'second');
  const s = (await second.state()).body.slots[0];
  assert.deepEqual([s.file, s.instance, s.sequence, s.queued], ['B', undefined, undefined, { file: 'C', auto: true }]);
  await run(caspar, second.runner, 30_000);
  assert.deepEqual([onAir(caspar).file, onAir(caspar).loop], ['C', true]);
});

/** One command from somebody else's client: its own connection, its own reply. */
async function fakeClient(port, line) {
  const { createConnection } = await import('node:net');
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port }, () => socket.write(`${line}\r\n`));
    let raw = '';
    socket.on('data', (c) => {
      raw += c.toString('utf8');
      if (raw.includes('\r\n')) {
        socket.end();
        resolve(raw.split('\r\n')[0]);
      }
    });
    socket.on('error', reject);
  });
}
