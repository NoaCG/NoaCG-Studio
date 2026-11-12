// guards: src/output/hold.ts
//
// HELD TAKES (live-publishing G2 section 3, R3 to R8): what a held queue does when its graphic
// releases. The rules are checked against a small reference model written from the design's words,
// not from the module: random queues of Take, update, event, Next, Out and release times.

import test from 'node:test';
import assert from 'node:assert/strict';

const { ENTRANCE_MS, afterOutcome, compact, demandFor, endsFailure, giveUp, liveStep, heldLate, isCancelled, lastLifecycle, releaseMode, routeLive, surviving } = await import('../src/output/hold.ts');

const row = (at, t, receivedAt = 0, extra = {}) => ({ at, msg: { t, ...extra }, receivedAt });

test('a queue ending in an Out, or holding no Take, is cancelled (R6)', () => {
  assert.equal(isCancelled([row(1, 'play'), row(2, 'stop')]), true);
  assert.equal(isCancelled([row(1, 'update'), row(2, 'next')]), true);
  assert.equal(isCancelled([row(1, 'stop'), row(2, 'play')]), false);
  assert.equal(lastLifecycle([row(1, 'snap'), row(2, 'update')]), 'take');
  assert.equal(releaseMode([row(1, 'play', 0), row(2, 'stop', 0)], 1, false), 'cancelled');
});

test('S4: on time with its entrance up to 5 s after the surviving Take reached the output, late after (R7)', () => {
  const rows = [row(1, 'play', 1_000), row(2, 'stop', 1_200), row(3, 'play', 4_000)];
  assert.equal(surviving(rows), 4_000, 'the newest Take counts');
  assert.equal(releaseMode(rows, 4_000 + ENTRANCE_MS, false), 'onTime');
  assert.equal(releaseMode(rows, 4_001 + ENTRANCE_MS, false), 'late');
  assert.equal(heldLate(rows, 4_001 + ENTRANCE_MS), true);
  assert.equal(heldLate(rows, 4_000 + ENTRANCE_MS), false);
  // A boot frame's history never plays on air, even a moment after the Take.
  assert.equal(releaseMode(rows, 4_000, true), 'late');
});

test('making room merges plain updates and drops superseded entrances, else fails (R8 limit)', () => {
  const rows = [row(1, 'update', 0, { data: { a: '1' } }), row(2, 'update', 0, { data: { b: '2' } }), row(3, 'play'), row(4, 'play'), row(5, 'update', 0, { data: { a: '3' } })];
  const out = compact(rows, 3, false);
  assert.deepEqual(out.map((r) => r.msg.t), ['update', 'play', 'update']);
  assert.deepEqual(out[0].msg.data, { a: '1', b: '2' });
  assert.equal(out[1].at, 4, 'the later Take survives');
  // A graphic with a clock keeps its updates apart: merging would change its clock fields.
  assert.equal(compact(rows, 3, true), null);
  // Updates on different data roads, or carrying a look, are never merged.
  const roads = [row(1, 'update', 0, { data: { a: '1' }, src: 'api' }), row(2, 'update', 0, { data: { a: '2' } }), row(3, 'update', 0, { data: {}, appearance: {} })];
  assert.equal(compact(roads, 2, false), null);
  assert.equal(compact(roads, 3, false).length, 3, 'within the limit nothing changes');
});

// ── The reference model: what each rule says reaches the document, written from G2's words. ──
function model(rows, now, history) {
  const lifecycle = rows.filter((r) => ['play', 'snap', 'stop'].includes(r.msg.t));
  const last = lifecycle[lifecycle.length - 1];
  if (!last || last.msg.t === 'stop') return history ? 'late' : 'cancelled';
  if (history) return 'late';
  let take = null;
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i].msg.t === 'stop') break;
    if (rows[i].msg.t === 'play' || rows[i].msg.t === 'snap') {
      take = rows[i].receivedAt;
      break;
    }
  }
  return now - take <= 5_000 ? 'onTime' : 'late';
}

test('random queues: the release plan agrees with the reference model', () => {
  let seed = 7;
  const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2147483648) % n);
  const verbs = ['play', 'snap', 'stop', 'update', 'event', 'next'];
  for (let trial = 0; trial < 2_000; trial += 1) {
    const rows = [];
    let at = 1;
    let clock = 0;
    rows.push(row(at++, rand(2) ? 'play' : 'snap', clock));
    for (let i = rand(8); i > 0; i -= 1) {
      clock += rand(3_000);
      rows.push(row(at++, verbs[rand(verbs.length)], clock));
    }
    const now = clock + rand(9_000);
    const history = rand(5) === 0;
    const got = releaseMode(rows, now, history);
    assert.equal(got, model(rows, now, history), JSON.stringify({ rows: rows.map((r) => `${r.msg.t}@${r.receivedAt}`), now, history }));
  }
});

test('where a live command goes: join a hold, start one, settle with nothing to run it on, or run (R3, R4)', () => {
  const f = (o) => ({ held: false, ready: false, hosts: false, stageWaits: false, isPackage: false, ...o });
  assert.equal(routeLive(f({ held: true, ready: true }), 'update'), 'join', 'a held graphic keeps every command in order');
  assert.equal(routeLive(f({}), 'play'), 'hold');
  assert.equal(routeLive(f({ hosts: true }), 'snap'), 'hold', 'a frame still loading');
  assert.equal(routeLive(f({}), 'update'), 'settle', 'a data feed to a graphic no output hosts');
  assert.equal(routeLive(f({}), 'stop'), 'settle', 'an Out of a graphic not hosted');
  assert.equal(routeLive(f({ hosts: true }), 'update'), 'settle', 'a publish-added frame still loading, holding nothing');
  assert.equal(routeLive(f({ hosts: true, stageWaits: true }), 'update'), 'run', 'a boot frame keeps its history in order');
  assert.equal(routeLive(f({ hosts: true, isPackage: true }), 'update'), 'run', 'a package waiting for its base');
  assert.equal(routeLive(f({ ready: true }), 'play'), 'run');
});

test('a Take or Out ends a failure; a cancelled hold that cannot go on settles, never fails (R6, R8)', () => {
  assert.equal(endsFailure('play'), true);
  assert.equal(endsFailure('snap'), true);
  assert.equal(endsFailure('stop'), true);
  assert.equal(endsFailure('update'), false);
  assert.equal(endsFailure('next'), false);
  assert.equal(giveUp([row(1, 'play'), row(2, 'stop')]), 'settle');
  assert.equal(giveUp([row(1, 'play'), row(2, 'update')]), 'fail');
  assert.equal(giveUp([row(1, 'update')]), 'settle');
});

test('a primed frame gets the place hint its held look came with, and a republished log never settles old work by position', async () => {
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../src/output/main.ts', import.meta.url), 'utf8');
  const stage = readFileSync(new URL('../src/output/stage.ts', import.meta.url), 'utf8');
  // The look an update carried keeps its place hint, and the primed update carries both (W1 placer).
  assert.match(main, /heldLook\.set\(row\.graphic, \{ appearance: msg\.appearance, place: msg\.place \}\);/);
  assert.match(main, /\{ appearance: look\.appearance, \.\.\.\(look\.place !== undefined \? \{ place: look\.place \} : \{\}\) \}/);
  // Each command waits under a key of its own; its log position goes out only in the outcome.
  assert.match(stage, /const key = \+\+lastKey;\n\s+atOf\.set\(msg, key\);\n\s+unsettled\.set\(key, \{ at, graphic, since: Date\.now\(\), watch \}\);/);
  assert.match(stage, /for \(const cb of outcomeCbs\) cb\(entry\.at, entry\.graphic, outcome\);/);
  assert.match(stage, /if \(entry\.graphic === graphic && \(oldest === null \|\| entry\.at < oldest\)\) oldest = entry\.at;/);
  assert.doesNotMatch(stage, /unsettled\.set\(at,/);
});

test('a failure only reports: it never decides where a command goes, a Take or Out clears it, and a Take on a ready frame primes it first', () => {
  const bools = [false, true];
  for (const held of bools) for (const ready of bools) for (const hosts of bools) for (const stageWaits of bools) for (const isPackage of bools) {
    for (const t of ['play', 'snap', 'update', 'next', 'event', 'stop']) {
      const base = { held, ready, hosts, stageWaits, isPackage };
      const ok = liveStep({ ...base, failed: false }, t);
      const failed = liveStep({ ...base, failed: true }, t);
      assert.equal(failed.route, ok.route, `failed never reroutes ${t} (${JSON.stringify(base)})`);
      assert.equal(ok.clear, false);
      assert.equal(ok.prime, false, 'nothing to prime without a failure');
      assert.equal(failed.clear, t === 'play' || t === 'snap' || t === 'stop');
      assert.equal(failed.prime, (t === 'play' || t === 'snap') && failed.route === 'run');
      if (ready && !held) assert.equal(failed.route, 'run', 'a ready frame with no hold runs every command, failed or not');
    }
  }
});

test('reference walk: on a ready frame a failed graphic keeps taking commands, and every Take airs the values sent so far', () => {
  // The model, from the corrected rule's words: values sent to a graphic are what it should show;
  // a ready frame with no hold gets every command; a failure (from a stage that lost a command) is
  // a report; a Take that clears it first hands the frame everything kept.
  let seed = 7;
  const rand = (n) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
  for (let walk = 0; walk < 2_000; walk++) {
    const sent = {};
    const doc = {};
    let failed = false;
    for (let i = 0; i < 30; i++) {
      const roll = rand(10);
      if (roll < 2) {
        // The stage loses one update (a watchdog or a limit): its values never reach the document.
        const key = `f${rand(3)}`;
        sent[key] = `lost${i}`;
        failed = true;
        continue;
      }
      const t = roll < 6 ? 'update' : roll < 8 ? 'play' : roll < 9 ? 'next' : 'stop';
      const step = liveStep({ held: false, ready: true, hosts: true, stageWaits: false, isPackage: false, failed }, t);
      assert.equal(step.route, 'run');
      if (step.clear) failed = false;
      if (step.prime) Object.assign(doc, sent);
      if (t === 'update') {
        const key = `f${rand(3)}`;
        sent[key] = `v${i}`;
        doc[key] = sent[key];
      }
      if (t === 'play') assert.deepEqual(doc, sent, `walk ${walk}: a Take airs every value sent so far`);
    }
  }
});

test('D1: a command overdue at 20 s is reported failed once and kept; its queue running in full clears the red', async () => {
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../src/output/main.ts', import.meta.url), 'utf8');
  const stage = readFileSync(new URL('../src/output/stage.ts', import.meta.url), 'utf8');
  assert.match(stage, /if \(!entry\.watch \|\| entry\.overdue \|\| now - entry\.since < OUTCOME_WATCHDOG_MS\) return;/);
  assert.match(stage, /entry\.overdue = true;\n\s+for \(const cb of outcomeCbs\) cb\(entry\.at, entry\.graphic, \{ failed: 'load', overdue: true \}\);/);
  assert.doesNotMatch(stage, /frame\.queue = frame\.queue\.filter\(\(item\) => item\.at !== at\)/, 'nothing is dropped from a queue');
  // Boot history is watched like any other command.
  assert.doesNotMatch(main, /, at, following\);/);
  assert.match(main, /const after = afterOutcome\(before, at, outcome, stage\.waitingFor\(graphic\) === null\);/);
});

test('D1 and D2 driven through outcomes: overdue clears when drained, a real failure stays until a Take or Out', () => {
  const overdue = { failed: 'load', overdue: true };
  // Overdue, then the queue runs: still waiting keeps red, drained clears it.
  let f = afterOutcome(undefined, 10, overdue, false);
  assert.deepEqual(f, { from: 10, why: 'load', overdue: true });
  assert.equal(afterOutcome(f, 10, overdue, false), f, 'reported once');
  assert.equal(afterOutcome(f, 10, 'posted', false), f, 'not drained yet');
  assert.equal(afterOutcome(f, 11, 'posted', true), undefined, 'the queue ran in full');
  // Overdue, then a real failure, then posts: the red stays (D2).
  f = afterOutcome(undefined, 10, overdue, false);
  f = afterOutcome(f, 12, { failed: 'typed' }, false);
  assert.deepEqual(f, { from: 10, why: 'typed' });
  assert.equal(afterOutcome(f, 13, 'posted', true), f);
  assert.equal(afterOutcome(f, 13, 'skipped', true), f);
  // A real failure first: an overdue one never softens it, a post never clears it.
  f = afterOutcome(undefined, 5, { failed: 'limit' }, true);
  assert.equal(afterOutcome(f, 6, overdue, false), f);
  assert.equal(afterOutcome(f, 7, 'posted', true), f);
  // Only a Take or Out clears it (liveStep).
  const step = liveStep({ held: false, ready: true, hosts: true, stageWaits: false, isPackage: false, failed: true }, 'play');
  assert.equal(step.clear, true);
  // An overdue queue that ends skipped stays red until a Take or Out: the safe direction.
  f = afterOutcome(undefined, 10, overdue, false);
  assert.equal(afterOutcome(f, 10, 'skipped', true), f);
});

test('a late Take stays hidden until its stage work has run: stillness counts only once nothing waits', async () => {
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../src/output/main.ts', import.meta.url), 'utf8');
  assert.match(main, /still = stage\.waitingFor\(graphic\) === null && stoodStill\(previous, reading\) \? still \+ 1 : 0;/);
});

test('a demand read settles only the holds it started after; a newer hold waits for the next read', async () => {
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../src/output/main.ts', import.meta.url), 'utf8');
  assert.match(main, /const covered = new Set<object>\(holds\.values\(\)\);/);
  assert.match(main, /covered: covered\.has\(hold\)/);
});

test('a graphic published and taken while a demand read is in flight keeps its Take for the next read', () => {
  const base = { hosted: false, covered: true, answered: true, published: false, cancelled: false };
  // The read started before the second publish: its answer does not name the new graphic.
  assert.equal(demandFor({ ...base, covered: false }), 'skip', 'a hold started after the read is the next read\'s');
  assert.equal(demandFor(base), 'fail', 'a hold the read covers and the payload does not name fails unpublished');
  assert.equal(demandFor({ ...base, published: true }), 'add');
  assert.equal(demandFor({ ...base, cancelled: true }), 'settle');
  assert.equal(demandFor({ ...base, answered: false }), 'skip', 'no answer: the hold waits');
  assert.equal(demandFor({ ...base, hosted: true }), 'skip');
  // A scene link: the read names the graphic in another scene, so it settles, never fails.
  assert.equal(demandFor({ ...base, elsewhere: true }), 'settle');
});

test('a scene link holds a graphic it has not heard of, reads past another scene\'s, and keeps a demand read to its scene', async () => {
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../src/output/main.ts', import.meta.url), 'utf8');
  assert.match(main, /if \(!inScope\(row\.graphic\) && \(elsewhere\(row\.graphic\) \|\| !following \|\| !seqMode\)\) return;/);
  assert.match(main, /const elsewhere = \(graphic: string\): boolean => scene !== null && !sceneKeys\.has\(graphic\) && productionKeys\.has\(graphic\);/);
  assert.match(main, /const payload = answer\.ok && answer\.value && answer\.value\.output \? scoped\(answer\.value\.output\) : null;/);
  // The pre-Take update of a graphic the link has not heard of keeps its values for the frame.
  assert.match(main, /if \(!inScope\(graphic\) && elsewhere\(graphic\)\) return;/);
});
