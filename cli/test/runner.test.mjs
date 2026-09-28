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

test('§12 item 7: behind a first clip that starts part way in, the follower waits until that clip runs', async (t) => {
  // Measured on both versions: a follower queued with the take would air at once and the trimmed
  // clip never would. The take plays it alone; the runner queues the next once INFO shows it inside
  // its segment.
  const caspar = await server(t);
  const { act, runner } = await bridgeOver(t, caspar);
  await act({ verb: 'sequence', slot: AT, entries: [entry('A', { trim: { in: 2 } }), entry('B')] });
  assert.deepEqual(caspar.seen.filter((l) => !l.startsWith('INFO')), ['PLAY 2-10 "A" IN 100']);
  await runner.round();
  assert.ok(!caspar.seen.some((l) => l.startsWith('LOADBG')), 'nothing is queued before A reaches its segment');
  const files = await watch(caspar, runner, 20_000);
  assert.deepEqual(airedFiles(caspar, files), ['A', 'B']);
  // A plays its 8 trimmed seconds, then B.
  assert.equal(files.indexOf('B'), 8_000 / 50 - 1);
});

test('Clear at the end of a clip that starts part way in is queued once the clip runs', async (t) => {
  const caspar = await server(t);
  const { act, runner } = await bridgeOver(t, caspar);
  const take = await act({ verb: 'take', item: { kind: 'media', name: 'A' }, slot: AT, cueId: 'cue-A', playback: { end: 'clear', fadeOut: 0.5, trim: { in: 7 } } });
  assert.equal(take.body.ok, true);
  assert.deepEqual(caspar.seen.filter((l) => !l.startsWith('INFO')), ['PLAY 2-10 "A" IN 350']);
  await runner.round();
  const files = await watch(caspar, runner, 6_000);
  assert.deepEqual(airedFiles(caspar, files), ['A', 'EMPTY'], 'A plays its last 3 seconds, then the layer clears');
  assert.equal(caspar.seen.filter((l) => !l.startsWith('INFO')).at(-1), 'LOADBG 2-10 EMPTY MIX 25 AUTO');
  // The runner's part is over once the clear is queued and has played.
  const reads = caspar.seen.filter((l) => l.startsWith('INFO')).length;
  await run(caspar, runner, 2_000);
  assert.equal(caspar.seen.filter((l) => l.startsWith('INFO')).length, reads);
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

test('Out sent while the sequence Take is still being answered takes the follower that Take queued', async (t) => {
  // The Take's LOADBG is held at the server, so the Out arrives while nothing is known of B yet. It
  // waits its turn in the slot's queue and reads what waits behind the clip then: B, so the layer is
  // cleared whole rather than stopped with B still armed.
  let hold = true;
  let release;
  const caspar = await server(t, {
    intercept: async (line) => {
      if (hold && line.startsWith('LOADBG 2-10 "B"')) await new Promise((r) => (release = r));
      return undefined;
    },
  });
  const { act, runner } = await bridgeOver(t, caspar);
  const take = act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B')] });
  while (!release) await new Promise((r) => setTimeout(r, 2));
  const out = act({ verb: 'out', slot: AT, item: { kind: 'media', name: 'A' } });
  await new Promise((r) => setTimeout(r, 20));
  hold = false;
  release();
  assert.equal((await take).body.ok, true);
  assert.equal((await out).body.ok, true);
  assert.equal(caspar.seen.at(-1), 'CLEAR 2-10');
  const files = await watch(caspar, runner, 20_000);
  assert.deepEqual(airedFiles(caspar, files), []);
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

// ── LOOP THE FOLDER (docs/CLIP_PLAYBACK_PLAN.md §6.6 and §6.10, phase 4): a sequence with `loop` plays
// its first entry again after its last, until Out. No file ever carries the server's LOOP - a looping
// file never ends, so nothing queued behind it would play - so the runner queues entry 0 behind the
// last one as it queues any other, and the §18 runner cases hold across that wrap too.

/** The last entry on air and seen by the runner, with the first not yet queued behind it: it was
 *  paused as it came up (nothing is queued onto a paused clip) and has just been resumed. */
async function lastUpAndSeen(caspar, act, runner, entries) {
  await act({ verb: 'sequence', slot: AT, entries, loop: true });
  // A's 10 s, then B's: B is on air from 10 s, and no round has read it yet.
  await run(caspar, runner, 9_000);
  caspar.advance(1_100);
  await act({ verb: 'pause', slot: AT });
  await runner.round();
  assert.equal(onAir(caspar).file, entries.at(-1).item.name);
  await act({ verb: 'resume', slot: AT });
}

test('Loop the folder: the first file plays again after the last, round after round, until Out', async (t) => {
  const caspar = await server(t);
  const { act, state, runner } = await bridgeOver(t, caspar);
  const take = await act({ verb: 'sequence', slot: AT, entries: [entry('A', { fadeIn: 0.5 }), entry('B', { fadeIn: 1 }), entry('C')], loop: true });
  assert.equal(take.body.ok, true);
  // The take is the one a sequence always sends: A now, B queued at once. A's own fade in is a MIX
  // into A from whatever the layer showed.
  assert.deepEqual(caspar.seen.filter((l) => !l.startsWith('INFO')), ['PLAY 2-10 "A" MIX 25', 'LOADBG 2-10 "B" MIX 50 AUTO']);
  const files = await watch(caspar, runner, 80_000);
  // A, B, C, then A again from 28.5 s (B mixes in 1 s early, A 0.5 s): two whole wraps and a third
  // round, with never a frame of nothing.
  assert.deepEqual(airedFiles(caspar, files), ['A', 'B', 'C', 'A', 'B', 'C', 'A', 'B', 'C']);
  assert.ok(!files.includes(null) && !files.includes('EMPTY'), 'no black anywhere in the loop');
  // After C the runner queued A with A's own fade in, and no line anywhere carries LOOP.
  const lines = caspar.seen.filter((l) => !l.startsWith('INFO'));
  assert.deepEqual(lines.slice(2, 6), ['LOADBG 2-10 "C" AUTO', 'LOADBG 2-10 "A" MIX 25 AUTO', 'LOADBG 2-10 "B" MIX 50 AUTO', 'LOADBG 2-10 "C" AUTO']);
  assert.ok(!lines.some((l) => / LOOP/.test(l)), lines.join(' | '));
  // A loop never ends by itself, so the runner keeps reading the channel, unlike a sequence whose
  // last entry holds.
  const reads = caspar.seen.filter((l) => l.startsWith('INFO')).length;
  await run(caspar, runner, 2_000);
  assert.equal(caspar.seen.filter((l) => l.startsWith('INFO')).length - reads, 2_000 / RUNNER_INTERVAL_MS);
  // The reading says it loops, and lists every other entry in the order they come round.
  const s = (await state()).body.slots[0];
  const next = s.sequence.next.map((e) => e.cueId);
  assert.equal(s.sequence.loop, true);
  assert.equal(next.length, 2);
  assert.deepEqual(next, { A: ['cue-B', 'cue-C'], B: ['cue-C', 'cue-A'], C: ['cue-A', 'cue-B'] }[s.file]);
  // Out ends it: the follower queued behind the clip goes with the layer, and nothing airs after.
  await act({ verb: 'out', slot: AT, item: { kind: 'media', name: s.file } });
  assert.equal(caspar.seen.at(-1), 'CLEAR 2-10');
  const after = await watch(caspar, runner, 40_000);
  assert.deepEqual(airedFiles(caspar, after), []);
  assert.ok(!caspar.seen.slice(caspar.seen.indexOf('CLEAR 2-10')).some((l) => l.startsWith('LOADBG') || l.startsWith('PLAY')));
  // And the runner has stopped reading the channel: the loop ended with Out.
  const readsAfterOut = caspar.seen.filter((l) => l.startsWith('INFO')).length;
  await run(caspar, runner, 2_000);
  assert.equal(caspar.seen.filter((l) => l.startsWith('INFO')).length, readsAfterOut);
});

test('Loop the folder with two files: neither is sent with LOOP, and the pair alternates', async (t) => {
  const caspar = await server(t);
  const { act, runner } = await bridgeOver(t, caspar);
  await act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B')], loop: true });
  // Without the loop a two-file sequence queues its second as the last one; with it B is not last.
  assert.deepEqual(caspar.seen.filter((l) => !l.startsWith('INFO')), ['PLAY 2-10 "A"', 'LOADBG 2-10 "B" AUTO']);
  const files = await watch(caspar, runner, 45_000);
  assert.deepEqual(airedFiles(caspar, files), ['A', 'B', 'A', 'B', 'A']);
});

test('Loop the folder with the same file twice in a row: the wrap onto it is still seen', async (t) => {
  // A then A: the switch is the same file again from its start, which the reading tells from a clip
  // that merely plays on by its position jumping back.
  const caspar = await server(t);
  const { act, state, runner } = await bridgeOver(t, caspar);
  await act({ verb: 'sequence', slot: AT, entries: [{ ...entry('A'), cueId: 'first' }, { ...entry('A'), cueId: 'second' }], loop: true });
  const cues = [];
  for (let at = 0; at < 45_000; at += 500) {
    await run(caspar, runner, 500);
    cues.push((await state()).body.slots[0].cueId);
  }
  const turns = cues.filter((c, i) => c !== cues[i - 1]);
  assert.deepEqual(turns, ['first', 'second', 'first', 'second', 'first']);
});

test('§18 case 1 across the wrap: the first file queued from a reading before Out, or a new Take, never airs', async (t) => {
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
  const loop = [entry('A'), entry('B')];
  await lastUpAndSeen(caspar, act, runner, loop);
  // The runner's reading - B on air, A to queue - is answered from before the Out and lands after it.
  release = undefined;
  hold = true;
  const round = runner.round();
  while (!release) await new Promise((r) => setTimeout(r, 2));
  hold = false;
  await act({ verb: 'out', slot: AT, item: { kind: 'media', name: 'B' } });
  release();
  await round;
  const files = await watch(caspar, runner, 30_000);
  assert.deepEqual(airedFiles(caspar, files), [], 'nothing airs after Out');
  assert.equal(caspar.seen.filter((l) => l.startsWith('LOADBG 2-10 "A"')).length, 0, 'A was never queued again');

  // Across a new Take: the late wrap must not land behind the new clip either.
  await lastUpAndSeen(caspar, act, runner, loop);
  release = undefined;
  hold = true;
  const again = runner.round();
  while (!release) await new Promise((r) => setTimeout(r, 2));
  hold = false;
  await act({ verb: 'take', item: { kind: 'media', name: 'X' }, slot: AT });
  release();
  await again;
  const after = await watch(caspar, runner, 30_000);
  assert.deepEqual(airedFiles(caspar, after), ['X'], 'the new clip plays and holds; the old loop never comes round');
  assert.equal(caspar.seen.filter((l) => l.startsWith('LOADBG 2-10 "A"')).length, 0);
});

test('§18 case 1 across the wrap, in the queue: the wrap waiting behind another command is dropped when an Out overtakes it', async (t) => {
  // The slot's serial queue is held by a slow command; the runner decides to queue A again and waits
  // behind it; Out arrives and moves the generation. When the runner's turn comes nothing is sent.
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
  await lastUpAndSeen(caspar, act, runner, [entry('A'), entry('B')]);
  hold = true;
  const slow = act({ verb: 'next', slot: AT });
  while (!release) await new Promise((r) => setTimeout(r, 2));
  const round = runner.round();
  await new Promise((r) => setTimeout(r, 30));
  const out = act({ verb: 'out', slot: AT, item: { kind: 'media', name: 'B' } });
  await new Promise((r) => setTimeout(r, 10));
  hold = false;
  release();
  await Promise.all([slow, round, out]);
  assert.ok(!caspar.seen.some((l) => l.startsWith('LOADBG 2-10 "A"')), 'the wrap was dropped unsent');
  const files = await watch(caspar, runner, 30_000);
  assert.deepEqual(airedFiles(caspar, files), []);
});

test('§18 case 2 across the wrap: a refused replacement Take disarms the first file queued behind the last', async (t) => {
  const caspar = await server(t);
  const { act, runner } = await bridgeOver(t, caspar);
  await act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B')], loop: true });
  // B on air and A queued behind it by the runner: the wrap is armed on the server.
  await run(caspar, runner, 10_500);
  assert.equal(onAir(caspar).file, 'B');
  assert.equal(caspar.seen.filter((l) => l === 'LOADBG 2-10 "A" AUTO').length, 1);
  const refused = await act({ verb: 'take', item: { kind: 'media', name: 'GONE' }, slot: AT });
  assert.equal(refused.body.error.code, 'not-found');
  assert.deepEqual(caspar.seen.slice(-2), ['PLAY 2-10 "GONE"', 'LOADBG 2-10 EMPTY']);
  const files = await watch(caspar, runner, 30_000);
  assert.deepEqual(airedFiles(caspar, files), ['B'], 'B plays out and holds; A never comes round');
  assert.equal(onAir(caspar).ended, true);
});

test('§18 case 3 across the wrap: a Pause as the last file comes up holds the first back until Resume', async (t) => {
  const caspar = await server(t);
  const { act, runner } = await bridgeOver(t, caspar);
  await act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B', { fadeIn: 1 })], loop: true });
  // B mixes in 1 s before A ends; pause it the moment it is on air, before the runner has read.
  caspar.advance(9_100);
  await act({ verb: 'pause', slot: AT });
  await run(caspar, runner, 20_000);
  assert.ok(!caspar.seen.some((l) => l.startsWith('LOADBG 2-10 "A"')), 'nothing queued at the wrap while paused');
  assert.deepEqual([onAir(caspar).file, onAir(caspar).paused], ['B', true]);
  await act({ verb: 'resume', slot: AT });
  await run(caspar, runner, 500);
  assert.equal(caspar.seen.filter((l) => l.startsWith('LOADBG 2-10 "A"')).length, 1, 'queued once after Resume');
  const files = await watch(caspar, runner, 25_000);
  assert.deepEqual(airedFiles(caspar, files), ['B', 'A', 'B']);
});

test('§18 case 9 across the wrap: another client takes the slot as the last file plays; the loop ends and nothing is sent', async (t) => {
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
  const { act, state, runner } = await bridgeOver(t, caspar);
  await lastUpAndSeen(caspar, act, runner, [entry('A'), entry('B')]);
  hold = true;
  const round = runner.round();
  while (!release) await new Promise((r) => setTimeout(r, 2));
  // The CasparCG Client plays something else there between the reading and the queue.
  assert.equal(await fakeClient(caspar.port, 'PLAY 2-10 "X"'), '202 PLAY OK');
  const sent = caspar.seen.length;
  release();
  await round;
  const files = await watch(caspar, runner, 30_000);
  assert.deepEqual(airedFiles(caspar, files), ['X']);
  assert.deepEqual(caspar.seen.slice(sent).filter((l) => !l.startsWith('INFO')), [], 'the runner sent nothing');
  const s = (await state()).body.slots[0];
  assert.deepEqual([s.file, s.instance, s.sequence], ['X', undefined, undefined]);
});

test('§18 case 10 across the wrap: a second Bridge takes the slot as the last file plays; the first never queues the wrap', async (t) => {
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
  await lastUpAndSeen(caspar, one.act, one.runner, [entry('A'), entry('B')]);
  hold = true;
  const round = one.runner.round();
  while (!release) await new Promise((r) => setTimeout(r, 2));
  await two.act({ verb: 'take', item: { kind: 'media', name: 'X' }, slot: AT });
  release();
  await round;
  assert.ok(!caspar.seen.some((l) => l.startsWith('LOADBG 2-10 "A"')), 'the first Bridge queued nothing behind the other take');
  const files = [];
  for (let at = 0; at < 30_000; at += 250) {
    caspar.advance(250);
    await one.runner.round();
    await two.runner.round();
    files.push(onAir(caspar)?.file ?? null);
  }
  assert.deepEqual(airedFiles(caspar, files), ['X']);
});

test('§18 case 11 mid-loop: a restarted Bridge has no loop, and a dropped connection is not a restart', async (t) => {
  let drop = false;
  const caspar = await server(t, {
    intercept: (line) => {
      if (drop && line.startsWith('INFO')) throw new Error('connection dropped');
      return undefined;
    },
  });
  const first = await bridgeOver(t, caspar, 'first');
  await first.act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B')], loop: true });
  caspar.advance(10_100);
  // A dropped reading as B comes up: the next round reads again, and the wrap is still queued.
  drop = true;
  await first.runner.round();
  drop = false;
  await run(caspar, first.runner, 1_000);
  assert.equal(caspar.seen.filter((l) => l === 'LOADBG 2-10 "A" AUTO').length, 1, 'the loop went on after the dropped reading');

  // A restart: a new Bridge, a new session, no memory. B plays with A queued behind it, which the
  // server still plays by its own rule - once - and then A holds: nothing queues B again.
  const second = await bridgeOver(t, caspar, 'second');
  const s = (await second.state()).body.slots[0];
  assert.deepEqual([s.file, s.instance, s.sequence, s.queued], ['B', undefined, undefined, { file: 'A', auto: true }]);
  const sent = caspar.seen.length;
  const files = await watch(caspar, second.runner, 30_000);
  assert.deepEqual(airedFiles(caspar, files), ['B', 'A']);
  assert.equal(onAir(caspar).ended, true, 'A holds its last frame');
  assert.deepEqual(caspar.seen.slice(sent).filter((l) => !l.startsWith('INFO')), [], 'the restarted Bridge sent nothing');
});

test('Loop the folder queues each file once a round: the first again exactly when the last comes up', async (t) => {
  // `queued: 0` is a real value for the first entry: read as nothing, it would be queued every round.
  const caspar = await server(t);
  const { act, runner } = await bridgeOver(t, caspar);
  await act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B')], loop: true });
  await watch(caspar, runner, 45_000);
  // A at 0, 20 and 40 s: queued behind B at 10 and 30 s, and never again in between.
  assert.equal(caspar.seen.filter((l) => l === 'LOADBG 2-10 "A" AUTO').length, 2);
  // B queued with the take, then behind A at 20 and 40 s.
  assert.equal(caspar.seen.filter((l) => l === 'LOADBG 2-10 "B" AUTO').length, 3);
});

test('Loop the folder of one file twice, at the two-second minimum with a long fade: every switch is seen', async (t) => {
  // During a MIX, INFO reports the incoming file's position, so the jump back from one copy to the
  // next can be as small as 2 s less the 1 s fade less a reading's gap: 0.75 s, no more.
  for (const dropOne of [false, true]) {
    let drop = false;
    const caspar = await server(t, {
      intercept: (line) => {
        if (drop && line.startsWith('INFO')) {
          drop = false;
          throw new Error('connection dropped');
        }
        return undefined;
      },
    });
    const { act, state, runner } = await bridgeOver(t, caspar);
    const first = { ...entry('TWO', undefined, 2), cueId: 'first' };
    const second = { ...entry('TWO', { fadeIn: 1 }, 2), cueId: 'second' };
    await act({ verb: 'sequence', slot: AT, entries: [first, second], loop: true });
    const cues = [];
    for (let at = 0; at < 10_000; at += 250) {
      caspar.advance(250);
      // One reading lost right after the first switch, and the loop still carries on.
      if (dropOne && at === 1_250) drop = true;
      await runner.round();
      cues.push((await state()).body.slots[0].cueId);
      assert.notEqual(onAir(caspar).ended, true, `the file held at ${at} ms`);
    }
    const turns = cues.filter((c, i) => c !== cues[i - 1]);
    assert.ok(turns.length >= 8, `${dropOne ? 'with a dropped reading: ' : ''}${turns.join(' ')}`);
    assert.deepEqual(turns.slice(0, 4), ['first', 'second', 'first', 'second']);
  }
});

test('Loop the folder: another client takes the slot after the first file is queued behind the last', async (t) => {
  const caspar = await server(t);
  const { act, state, runner } = await bridgeOver(t, caspar);
  await act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B')], loop: true });
  // B on air and A queued behind it.
  await run(caspar, runner, 10_500);
  assert.equal(caspar.seen.filter((l) => l === 'LOADBG 2-10 "A" AUTO').length, 1);
  assert.equal(await fakeClient(caspar.port, 'PLAY 2-10 "X"'), '202 PLAY OK');
  const sent = caspar.seen.length;
  const files = await watch(caspar, runner, 30_000);
  assert.deepEqual(airedFiles(caspar, files), ['X']);
  assert.deepEqual(caspar.seen.slice(sent).filter((l) => !l.startsWith('INFO')), [], 'the runner sent nothing');
  assert.ok(caspar.seen.slice(sent).filter((l) => l.startsWith('INFO')).length <= 2, 'and stopped reading the slot');
  const s = (await state()).body.slots[0];
  assert.deepEqual([s.file, s.instance, s.sequence], ['X', undefined, undefined]);
});

test('Loop the folder: the server refuses the first file at the wrap; the last holds and nothing is tried again', async (t) => {
  let refuse = false;
  const caspar = await server(t, { intercept: (line) => (refuse && line.startsWith('LOADBG 2-10 "A"') ? '404 LOADBG FAILED\r\n' : undefined) });
  const { act, state, runner } = await bridgeOver(t, caspar);
  await act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B')], loop: true });
  refuse = true;
  const files = await watch(caspar, runner, 25_000);
  assert.deepEqual(airedFiles(caspar, files), ['A', 'B']);
  assert.equal(onAir(caspar).ended, true, 'B holds its last frame');
  assert.equal(caspar.seen.filter((l) => l.startsWith('LOADBG 2-10 "A"')).length, 1, 'one attempt');
  const reads = caspar.seen.filter((l) => l.startsWith('INFO')).length;
  await run(caspar, runner, 2_000);
  assert.equal(caspar.seen.filter((l) => l.startsWith('INFO')).length, reads, 'the runner stopped reading');
  assert.equal((await state()).body.slots[0].sequence, undefined);
});

test('behind a file the server switched to that starts part way in, nothing is queued until it runs', async (t) => {
  // Measured for PLAY … IN (§4). After an AUTO switch into a file with IN the real server shows no such
  // window (measured 2026-09-28, fixtures/info/p4-auto-into-in.json); the fake models it anyway, so the
  // runner's guard - reading that the clip has not reached its segment - is proven at the wrap too.
  const caspar = await server(t, { autoStarting: true });
  const { act, runner } = await bridgeOver(t, caspar);
  await act({ verb: 'sequence', slot: AT, entries: [entry('A', { trim: { in: 2 } }), entry('B')], loop: true });
  assert.deepEqual(caspar.seen.filter((l) => !l.startsWith('INFO')), ['PLAY 2-10 "A" IN 100']);
  const files = await watch(caspar, runner, 60_000);
  // A plays its 8 trimmed seconds on every lap: A, B, A, B, A, B, A...
  assert.deepEqual(airedFiles(caspar, files).slice(0, 6), ['A', 'B', 'A', 'B', 'A', 'B']);
  const firstB = files.indexOf('B');
  const secondA = files.indexOf('A', firstB);
  const secondB = files.indexOf('B', secondA);
  assert.ok(Math.abs((secondB - secondA) * 50 - 8_000) <= 50, `the second A plays all 8 trimmed seconds, not ${(secondB - secondA) * 50} ms`);
});

test('a round that goes wrong is logged and never thrown: the Bridge outlives it', async (t) => {
  const caspar = await server(t);
  const logged = [];
  const memory = new SlotMemoryBank('b1', () => caspar.clock.now());
  const adapter = createCasparcgAdapter(() => caspar.clock.now());
  const broken = { ...adapter, state: async () => { throw new Error('boom'); } };
  const runner = new SequenceRunner({ memory, adapters: [broken], log: (l) => logged.push(l) });
  const server2 = createBridgeServer({ token: TOKEN, origins: [], adapters: [adapter], version: '0.5.0', memory, runner }, () => {});
  await new Promise((r) => server2.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server2.close(r)));
  const port = server2.address().port;
  await fetch(`http://127.0.0.1:${port}/act`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ target: { adapter: 'casparcg', host: '127.0.0.1', port: caspar.port }, action: { verb: 'sequence', slot: AT, entries: [entry('A'), entry('B'), entry('C')] } }),
  });
  await runner.round();
  assert.deepEqual(logged, ["the sequence runner's round failed: boom"]);
  // And the next round runs, rather than the runner staying stuck as busy.
  await runner.round();
  assert.equal(logged.length, 2);
});

test('a follower the server refused with the take is reported and never tried again', async (t) => {
  const caspar = await server(t, {
    intercept: (line) => (line === 'LOADBG 2-10 EMPTY AUTO' || line.startsWith('LOADBG 2-10 "GONE"') ? '404 LOADBG FAILED\r\n' : undefined),
  });
  const { act, state, runner } = await bridgeOver(t, caspar);
  // A sequence whose second file is not on the server: the first plays, the reply says the rest did not.
  const seq = await act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('GONE', undefined, 10)] });
  assert.equal(seq.body.ok, true);
  assert.match(seq.body.warning, /^the server refused what was to follow it: CasparCG has no such file/);
  await run(caspar, runner, 3_000);
  assert.equal(caspar.seen.filter((l) => l.startsWith('LOADBG 2-10 "GONE"')).length, 1, 'the refused file was not queued again');
  assert.equal((await state()).body.slots[0].sequence, undefined);
  // A Clear at the end the server refused: the same.
  const take = await act({ verb: 'take', item: { kind: 'media', name: 'B' }, slot: AT, playback: { end: 'clear' } });
  assert.match(take.body.warning, /refused what was to follow it/);
  await run(caspar, runner, 3_000);
  assert.equal(caspar.seen.filter((l) => l === 'LOADBG 2-10 EMPTY AUTO').length, 1, 'the refused clear was not queued again');
});

test('one reading a round for a channel, however many of its layers run a sequence', async (t) => {
  const caspar = await server(t);
  const { act, runner } = await bridgeOver(t, caspar);
  await act({ verb: 'sequence', slot: AT, entries: [entry('A'), entry('B'), entry('C')] });
  await act({ verb: 'sequence', slot: { ...AT, layer: 11 }, entries: [entry('B'), entry('C'), entry('D')] });
  caspar.advance(2_000);
  const before = caspar.seen.filter((l) => l.startsWith('INFO')).length;
  for (let i = 0; i < 4; i += 1) {
    caspar.advance(RUNNER_INTERVAL_MS);
    await runner.round();
  }
  assert.equal(caspar.seen.filter((l) => l.startsWith('INFO')).length - before, 4);
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
