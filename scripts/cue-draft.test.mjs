// guards: src/control/cueDraft.ts
//
// The cue being typed (production-page refactor spec §2 and D12, phase 13b): an edit echoes in the
// session's `draft` part at once and is saved once, with the latest text, on a 300 ms idle or when
// flushed; a verb that waits for the flush then reads the draft or the record, never older text;
// the page going saves at once; cancel drops it; the session's end saves what is owed and drops every
// later answer; and what is unsent is judged against what air was sent. Fakes stand in for the
// history's write, the store, the account gate, the timers and the browser's events.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayoutSession } from '../src/control/playoutSession.ts';
import { FLUSH_DELAY_MS, createCueDraft, editGroup, unsentFields, unsentNow, viewOf } from '../src/control/cueDraft.ts';

const OPENER = { id: 'c1', label: 'Opener', note: null, values: { f0: 'Anna Riva', f1: 'Host' } };
const CLOSER = { id: 'c2', label: 'Closer', note: 'last', values: { f0: 'Ben Lund', f1: 'Guest' } };

/** A draft over fakes. `writes` holds every save sent through the history, each answerable with
 *  `answer(true | false)`; `retained` the synchronous saves; `timers` the live timers. */
function harness() {
  const session = createPlayoutSession('prod-1');
  const records = new Map([OPENER, CLOSER].map((c) => [c.id, c]));
  const writes = [];
  const retained = [];
  const groups = [];
  const timers = new Map();
  const listeners = { hide: new Set(), flush: new Set() };
  let nextTimer = 1;
  const h = {
    session,
    records,
    writes,
    retained,
    groups,
    timers,
    listeners,
    canWrite: true,
    retainOk: true,
    /** Run every live timer, as the clock passing them would. */
    tick() {
      for (const [id, t] of [...timers]) {
        timers.delete(id);
        t.run();
      }
    },
  };
  h.draft = createCueDraft(session, {
    canWrite: () => h.canWrite,
    editing: (group) => groups.push(group),
    writeCue: (cueId, fields) =>
      new Promise((resolve) => writes.push({ cueId, fields: structuredClone(fields), answer: resolve })),
    retainCue: (cueId, fields) => {
      retained.push({ cueId, fields: structuredClone(fields) });
      return h.retainOk;
    },
    record: (cueId) => records.get(cueId),
    setTimeout: (run, ms) => {
      const id = nextTimer++;
      timers.set(id, { run, ms });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
  });
  h.adapters = {
    onPageHide: (run) => {
      listeners.hide.add(run);
      return () => listeners.hide.delete(run);
    },
    onFlushAsked: (run) => {
      listeners.flush.add(run);
      return () => listeners.flush.delete(run);
    },
  };
  return h;
}
const type = (h, cue, field, text) => {
  for (let i = 1; i <= text.length; i += 1) h.draft.edit(cue, { values: { [field]: text.slice(0, i) } });
};
const settle = () => new Promise((resolve) => setImmediate(resolve));

test('an edit echoes in the draft part at once, over the record it started from', () => {
  const h = harness();
  assert.equal(h.session.draft.get(), null);
  h.draft.edit(OPENER, { values: { f0: 'Anna R.' } });
  assert.deepEqual(h.session.draft.get(), { cueId: 'c1', label: 'Opener', note: '', values: { f0: 'Anna R.', f1: 'Host' } });
  assert.deepEqual(h.draft.view(OPENER), { cueId: 'c1', label: 'Opener', note: '', values: { f0: 'Anna R.', f1: 'Host' } });
  assert.deepEqual(h.draft.view(CLOSER), { label: 'Closer', note: 'last', values: { f0: 'Ben Lund', f1: 'Guest' } }, 'another cue reads its record');
  assert.equal(h.writes.length, 0, 'nothing is saved per keystroke');
  assert.deepEqual(OPENER.values, { f0: 'Anna Riva', f1: 'Host' }, 'the record is not touched');
});

test('ten keystrokes then a flush save once, with the latest text, through the history', async () => {
  const h = harness();
  type(h, OPENER, 'f0', 'Typed text');
  assert.equal(h.writes.length, 0);
  const flushed = h.draft.flush();
  assert.equal(h.writes.length, 1);
  assert.deepEqual(h.writes[0], { cueId: 'c1', fields: { label: 'Opener', note: null, values: { f0: 'Typed text', f1: 'Host' } }, answer: h.writes[0].answer });
  assert.equal(h.timers.size, 0, 'the idle save is not also owed');
  assert.equal(await Promise.race([flushed.then(() => 'answered'), settle().then(() => 'waiting')]), 'waiting', 'the flush waits for the save');
  assert.equal(await h.draft.flush(), true, 'a second flush owes nothing while the save is out');
  assert.equal(h.writes.length, 1);
  h.writes[0].answer(true);
  assert.equal(await flushed, true);
  assert.equal(h.writes.length, 1, 'written once');
});

test('the idle save comes 300 ms after the LAST keystroke, once', () => {
  const h = harness();
  assert.equal(FLUSH_DELAY_MS, 300);
  h.draft.edit(OPENER, { values: { f0: 'A' } });
  assert.deepEqual([...h.timers.values()].map((t) => t.ms), [300]);
  h.draft.edit(OPENER, { values: { f0: 'An' } });
  h.draft.edit(OPENER, { values: { f0: 'Ann' } });
  assert.deepEqual([...h.timers.values()].map((t) => t.ms), [300], 'each keystroke restarts the one timer');
  h.tick();
  assert.equal(h.writes.length, 1);
  assert.deepEqual(h.writes[0].fields.values, { f0: 'Ann', f1: 'Host' });
  h.tick();
  assert.equal(h.writes.length, 1, 'no second save');
});

test('a confirmed save drops the draft and the record answers; a refused one keeps it owed', async () => {
  const h = harness();
  h.draft.edit(OPENER, { label: 'Opening' });
  const first = h.draft.flush();
  h.writes[0].answer(false);
  assert.equal(await first, false);
  assert.equal(h.session.draft.get().label, 'Opening', 'a refused save keeps what was typed');
  const second = h.draft.flush();
  assert.equal(h.writes.length, 2, 'and it is owed again');
  // The history hands the store's new record to the page before the store confirms the save.
  h.records.set('c1', { ...OPENER, label: 'Opening' });
  h.writes[1].answer(true);
  assert.equal(await second, true);
  assert.equal(h.session.draft.get(), null);
  assert.equal(h.draft.view(OPENER).label, 'Opening', 'the newest record, not the cue the caller held');
  assert.equal(await h.draft.flush(), true);
  assert.equal(h.writes.length, 2, 'nothing owed after a confirmed save');
});

test('typing during the save keeps the newer draft and owes it', async () => {
  const h = harness();
  h.draft.edit(OPENER, { values: { f0: 'One' } });
  const first = h.draft.flush();
  h.draft.edit(OPENER, { values: { f0: 'Two' } });
  h.writes[0].answer(true);
  await first;
  assert.equal(h.session.draft.get().values.f0, 'Two', 'the answer for "One" does not drop "Two"');
  await Promise.resolve();
  h.draft.flush();
  assert.equal(h.writes.length, 2);
  assert.equal(h.writes[1].fields.values.f0, 'Two');
});

test('Take waits for the flush, then reads what was typed: the draft while the save is out, the record after', async () => {
  // What graphicVerbs' Take does with this module (spec §4.1 R2): `await flush()`, then `view(cue)`.
  const h = harness();
  const take = async () => {
    await h.draft.flush();
    return h.draft.view(OPENER).values.f0;
  };
  h.draft.edit(OPENER, { values: { f0: 'Typed then taken' } });
  const aired = take();
  assert.equal(h.writes.length, 1, 'the Take starts the save at once, not on the idle timer');
  assert.equal(await Promise.race([aired.then(() => 'read'), settle().then(() => 'waiting')]), 'waiting', 'Take reads nothing before the save answers');
  h.records.set('c1', { ...OPENER, values: { f0: 'Typed then taken', f1: 'Host' } });
  h.writes[0].answer(true);
  assert.equal(await aired, 'Typed then taken');

  // A save that fails leaves the draft, and Take still airs the typed text.
  h.draft.edit(OPENER, { values: { f0: 'Typed again' } });
  const again = take();
  h.writes[1].answer(false);
  assert.equal(await again, 'Typed again');
});

test('cancel drops the draft unsaved, and its idle save with it', async () => {
  const h = harness();
  h.draft.edit(OPENER, { values: { f0: 'Nobody sees this' } });
  h.draft.cancel();
  assert.equal(h.session.draft.get(), null);
  assert.equal(h.timers.size, 0);
  assert.equal(await h.draft.flush(), true);
  h.tick();
  assert.equal(h.writes.length + h.retained.length, 0, 'nothing is saved');
  assert.deepEqual(h.draft.view(OPENER).values, { f0: 'Anna Riva', f1: 'Host' });
});

test('an account that may not write starts no draft, and a draft it may not save stays owed', async () => {
  const h = harness();
  h.canWrite = false;
  h.draft.edit(OPENER, { values: { f0: 'Refused' } });
  assert.equal(h.session.draft.get(), null);
  assert.deepEqual(h.groups, [], 'no history group is opened either');
  h.canWrite = true;
  h.draft.edit(OPENER, { values: { f0: 'Held' } });
  h.canWrite = false;
  assert.equal(await h.draft.flush(), true);
  assert.equal(h.writes.length, 0);
  h.canWrite = true;
  h.draft.flush();
  assert.equal(h.writes.length, 1, 'still owed once the account may write');
  assert.equal(h.writes[0].fields.values.f0, 'Held');
});

test('each edit names its history group: one per cue and per thing typed into', () => {
  const h = harness();
  h.draft.edit(OPENER, { values: { f0: 'x' } });
  h.draft.edit(OPENER, { label: 'L' });
  h.draft.edit(OPENER, { note: 'n' });
  h.draft.edit(OPENER, { values: { f1: 'b', f0: 'a' } });
  h.draft.edit(CLOSER, { values: { f0: 'y' } });
  assert.deepEqual(h.groups, ['c1:f0', 'c1:label', 'c1:note', 'c1:f0,f1', 'c2:f0']);
  assert.equal(editGroup('c9', {}), 'c9:');
});

test('a draft of another cue starts from that cue, leaving the earlier one unsaved here', () => {
  const h = harness();
  h.draft.edit(OPENER, { values: { f0: 'First' } });
  h.draft.edit(CLOSER, { note: 'changed' });
  assert.deepEqual(h.session.draft.get(), { cueId: 'c2', label: 'Closer', note: 'changed', values: { f0: 'Ben Lund', f1: 'Guest' } });
  assert.deepEqual(h.draft.view(OPENER).values, { f0: 'Anna Riva', f1: 'Host' });
});

test('the page hiding saves at once, synchronously, without the history, and keeps the draft', async () => {
  const h = harness();
  const stop = h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'Closing' } });
  for (const run of h.listeners.hide) run();
  assert.deepEqual(h.retained, [{ cueId: 'c1', fields: { label: 'Opener', note: null, values: { f0: 'Closing', f1: 'Host' } } }]);
  assert.equal(h.writes.length, 0);
  assert.equal(h.session.draft.get().values.f0, 'Closing', 'the editor still shows it');
  for (const run of h.listeners.hide) run();
  assert.equal(h.retained.length, 1, 'saved once: nothing is owed after');
  assert.equal(await h.draft.flush(), true);
  assert.equal(h.writes.length, 0);
  stop();
});

test('the page hiding saves nothing while the account may not write, and the edit stays owed', () => {
  const h = harness();
  h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'Paused' } });
  h.canWrite = false;
  for (const run of h.listeners.hide) run();
  assert.equal(h.retained.length, 0);
  h.canWrite = true;
  for (const run of h.listeners.hide) run();
  assert.deepEqual(h.retained.map((r) => r.fields.values.f0), ['Paused']);
});

test('a refused synchronous save stays owed', () => {
  const h = harness();
  h.draft.listen(h.adapters);
  h.retainOk = false;
  h.draft.edit(OPENER, { values: { f0: 'Refused' } });
  for (const run of h.listeners.hide) run();
  h.retainOk = true;
  for (const run of h.listeners.hide) run();
  assert.equal(h.retained.length, 2);
});

test('the account asking for a save flushes through the history', () => {
  const h = harness();
  h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'Asked' } });
  for (const run of h.listeners.flush) run();
  assert.equal(h.writes.length, 1);
  assert.equal(h.timers.size, 0);
});

test('the listening stops with its stop, which also saves what is owed at once', () => {
  const h = harness();
  const stop = h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'Leaving' } });
  stop();
  assert.equal(h.listeners.hide.size + h.listeners.flush.size, 0);
  assert.equal(h.retained.length, 1);
  assert.equal(h.retained[0].fields.values.f0, 'Leaving');
  const again = h.draft.listen(h.adapters);
  again();
  assert.equal(h.retained.length, 1, 'nothing owed: the next stop saves nothing');
});

test("the session's end saves what is owed, drops the idle save, and every later answer", async () => {
  const h = harness();
  h.draft.edit(OPENER, { values: { f0: 'In flight' } });
  const out = h.draft.flush();
  h.draft.edit(OPENER, { values: { f0: 'Owed at the end' } });
  h.session.dispose();
  assert.deepEqual(h.retained.map((r) => r.fields.values.f0), ['Owed at the end'], 'saved at once');
  assert.equal(h.timers.size, 0, 'the idle save never comes');
  h.writes[0].answer(false);
  await out;
  assert.equal(h.session.draft.get().values.f0, 'Owed at the end', 'a late answer changes nothing');
  assert.equal(await h.draft.flush(), true);
  assert.equal(h.writes.length, 1, 'nothing is written after the end');
  const groups = h.groups.length;
  h.draft.edit(OPENER, { values: { f0: 'After' } });
  assert.equal(h.groups.length, groups, 'no history group opens');
  assert.equal(h.timers.size, 0, 'and no idle save is owed');
  h.draft.cancel();
  assert.equal(h.session.draft.get().values.f0, 'Owed at the end', 'nor typed or cancelled');
  assert.equal(h.timers.size, 0);
  assert.equal(h.retained.length, 1);
});

test("a confirmed save that lands after the session's end does not drop the draft", async () => {
  const h = harness();
  h.draft.edit(OPENER, { values: { f0: 'Saving' } });
  const out = h.draft.flush();
  h.session.dispose();
  assert.equal(h.retained.length, 0, 'nothing was owed: the save was already out');
  h.writes[0].answer(true);
  assert.equal(await out, true);
  assert.equal(h.session.draft.get().values.f0, 'Saving');
});

test('label: the draft wins for its cue, the newest record for the rest, null for no cue', () => {
  const h = harness();
  h.draft.edit(OPENER, { label: 'Renamed' });
  assert.equal(h.draft.label('c1'), 'Renamed');
  assert.equal(h.draft.label('c2'), 'Closer');
  h.records.set('c2', { ...CLOSER, label: 'Closing' });
  assert.equal(h.draft.label('c2'), 'Closing');
  assert.equal(h.draft.label('gone'), null);
});

test('unsent: a typed field differs from what air was sent until it matches again; a bound field never', () => {
  const h = harness();
  const aired = { f0: 'Anna Riva', f1: 'Host' };
  assert.deepEqual(h.draft.unsent(OPENER, aired, {}), []);
  h.draft.edit(OPENER, { values: { f0: 'Anna Rivas' } });
  assert.deepEqual(h.draft.unsent(OPENER, aired, {}), ['f0']);
  h.draft.edit(OPENER, { values: { f1: 'Hostess' } });
  assert.deepEqual(h.draft.unsent(OPENER, aired, {}), ['f0', 'f1']);
  assert.deepEqual(h.draft.unsent(OPENER, aired, { f1: 'show.role' }), ['f0'], 'a bound field is the tree’s, never unsent');
  h.draft.edit(OPENER, { values: { f0: 'Anna Riva', f1: 'Host' } });
  assert.deepEqual(h.draft.unsent(OPENER, aired, {}), []);
  assert.deepEqual(unsentFields({ f0: '' }, undefined, {}), [], 'nothing sent reads as empty');
  assert.deepEqual(unsentFields({ f0: 'x' }, {}, {}), ['f0']);
});

test('the page’s selection changes on the FIRST keystroke into a field and not on the nine after it', () => {
  const h = harness();
  const aired = { G: { f0: 'Anna Riva', f1: 'Host' }, H: { f0: 'Ben Lund', f1: 'Guest' } };
  const boundOf = () => ({});
  const select = () =>
    JSON.stringify(
      unsentNow(h.draft, { cue: OPENER, graphic: 'G' }, [{ cue: OPENER, graphic: 'G' }, { cue: CLOSER, graphic: 'H' }], aired, boundOf),
    );
  const seen = [select()];
  for (const text of ['X', 'XY', 'XYZ', 'XYZW', 'XYZWV', 'XYZWVU', 'XYZWVUT', 'XYZWVUTS', 'XYZWVUTSR', 'XYZWVUTSRQ']) {
    h.draft.edit(OPENER, { values: { f0: text } });
    seen.push(select());
  }
  assert.deepEqual([...new Set(seen)], ['{"fields":[],"cues":[]}', '{"fields":["f0"],"cues":["c1"]}']);
  h.draft.edit(OPENER, { values: { f0: 'Anna Riva' } });
  assert.equal(select(), '{"fields":[],"cues":[]}', 'and back when the field matches air again');
  assert.deepEqual(unsentNow(h.draft, null, [], aired, boundOf), { fields: [], cues: [] }, 'nothing edited live, nothing said');
});

test('viewOf reads the draft only for its own cue', () => {
  const draft = { cueId: 'c1', label: 'D', note: 'n', values: { f0: 'd' } };
  assert.equal(viewOf(draft, OPENER), draft);
  assert.deepEqual(viewOf(draft, CLOSER), { label: 'Closer', note: 'last', values: { f0: 'Ben Lund', f1: 'Guest' } });
  assert.deepEqual(viewOf(null, OPENER), { label: 'Opener', note: '', values: { f0: 'Anna Riva', f1: 'Host' } });
});
