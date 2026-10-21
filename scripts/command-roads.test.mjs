// guards: src/control/commandRoads.ts
//
// The id a published verb carries on both roads (the fast broadcast and the durable row), and the
// memory that applies it exactly once (production-page refactor phase 1; spec §5.3, "duplicate
// delivery, reconnect, reload, boot replay"). A duplicate `play` leaves no trace on screen, so the
// rule is pinned here as arithmetic: one claim per id, the echo refused, an id-less command always
// applied, the memory bounded at its oldest end. Plus the frame reader every following surface
// runs on a broadcast before anything reaches a stage.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppliedOnce, mintOid, oidOf, readCommandFrame, withOid } from '../src/control/commandRoads.ts';

test('withOid puts a fresh id on a copy and leaves the command alone', () => {
  const msg = { t: 'play' };
  const a = withOid(msg);
  const b = withOid(msg);
  assert.equal(a.t, 'play');
  assert.equal(typeof a.oid, 'string');
  assert.ok(a.oid.length > 0);
  assert.notEqual(a.oid, b.oid, 'two presses of the same command are two commands');
  assert.deepEqual(msg, { t: 'play' }, 'the original is not touched');
});

test('minted ids do not repeat over a long show', () => {
  const ids = new Set();
  for (let i = 0; i < 5000; i++) ids.add(mintOid());
  assert.equal(ids.size, 5000);
});

test('oidOf reads only a non-empty string id', () => {
  assert.equal(oidOf({ t: 'play', oid: 'x1' }), 'x1');
  assert.equal(oidOf({ t: 'play', oid: '' }), null);
  assert.equal(oidOf({ t: 'play', oid: 7 }), null);
  assert.equal(oidOf({ t: 'play' }), null);
  assert.equal(oidOf(null), null);
  assert.equal(oidOf(undefined), null);
});

test('a command arriving on both roads is applied once, in whichever order they land', () => {
  const fastFirst = createAppliedOnce();
  const take = withOid({ t: 'play' });
  const fast = { ...take };
  const durable = JSON.parse(JSON.stringify(take));
  assert.equal(fastFirst.claim(fast), true, 'the first road applies it');
  assert.equal(fastFirst.claim(durable), false, 'the second road is its echo');
  assert.equal(fastFirst.claim(durable), false, 'and stays an echo on a replay');

  const durableFirst = createAppliedOnce();
  assert.equal(durableFirst.claim(durable), true);
  assert.equal(durableFirst.claim(fast), false);

  let applied = 0;
  const surface = createAppliedOnce();
  for (const delivery of [fast, durable, durable, fast]) if (surface.claim(delivery)) applied += 1;
  assert.equal(applied, 1, 'one entrance, however often it is delivered');
});

test('has answers without remembering, and claim remembers', () => {
  const seen = createAppliedOnce();
  const msg = withOid({ t: 'stop' });
  assert.equal(seen.has(msg), false);
  assert.equal(seen.size, 0);
  assert.equal(seen.claim(msg), true);
  assert.equal(seen.has(msg), true);
  assert.equal(seen.size, 1);
});

test('a command with no id is always applied and never remembered', () => {
  const seen = createAppliedOnce();
  const legacy = { t: 'update', data: { f0: 'A' } };
  assert.equal(seen.claim(legacy), true);
  assert.equal(seen.claim(legacy), true);
  assert.equal(seen.has(legacy), false);
  assert.equal(seen.size, 0);
});

test('the memory is bounded: past 400 ids the oldest is forgotten first', () => {
  const seen = createAppliedOnce();
  const sent = Array.from({ length: 401 }, () => withOid({ t: 'next' }));
  for (const msg of sent) assert.equal(seen.claim(msg), true);
  assert.equal(seen.size, 400);
  assert.equal(seen.has(sent[0]), false, 'the oldest id went');
  assert.equal(seen.has(sent[1]), true);
  assert.equal(seen.has(sent[400]), true);
  assert.equal(seen.claim(sent[400]), false, 'the newest is still an echo');
});

test('each surface keeps its own memory', () => {
  const page = createAppliedOnce();
  const output = createAppliedOnce();
  const msg = withOid({ t: 'play' });
  assert.equal(page.claim(msg), true);
  assert.equal(output.claim(msg), true);
});

test('readCommandFrame takes a well-formed frame and refuses anything else whole', () => {
  const items = [
    { graphic: 'Score', msg: { t: 'update', data: { f1: '2' } } },
    { graphic: 'Score', msg: { t: 'play' } },
  ];
  assert.deepEqual(readCommandFrame({ items }), items);
  assert.equal(readCommandFrame(null), null);
  assert.equal(readCommandFrame({}), null);
  assert.equal(readCommandFrame({ items: [] }), null, 'an empty frame');
  assert.equal(readCommandFrame({ items: 'play' }), null);
  assert.equal(readCommandFrame({ items: [{ graphic: '', msg: { t: 'play' } }] }), null, 'no graphic name');
  assert.equal(readCommandFrame({ items: [{ graphic: 'Score', msg: { t: 7 } }] }), null, 'no command');
  assert.equal(readCommandFrame({ items: [{ graphic: 'Score' }] }), null, 'no message');
  assert.equal(readCommandFrame({ items: [...items, { graphic: 'Score', msg: null }] }), null, 'one bad item refuses the frame');
  const big = Array.from({ length: 65 }, () => ({ graphic: 'Score', msg: { t: 'next' } }));
  assert.equal(readCommandFrame({ items: big }), null, 'more than 64 items');
  assert.equal(readCommandFrame({ items: big.slice(0, 64) })?.length, 64);
});
