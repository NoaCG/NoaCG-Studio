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
import { FLUSH_DELAY_MS, PRESS_HOLD_MAX_MS, createCueDraft, editGroup, unsentFields, unsentNow, viewOf } from '../src/control/cueDraft.ts';

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
  const listeners = { hide: new Set(), shown: new Set(), flush: new Set(), press: new Set() };
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
    /** The owed-edit record (model/owedCueEdit.ts). */
    owed: null,
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
    owed: {
      keep: (edit) => {
        h.owed = structuredClone(edit);
      },
      read: () => h.owed,
      forget: () => {
        h.owed = null;
      },
    },
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
    onPageShown: (run) => {
      listeners.shown.add(run);
      return () => listeners.shown.delete(run);
    },
    onFlushAsked: (run) => {
      listeners.flush.add(run);
      return () => listeners.flush.delete(run);
    },
    onSendsFirstPress: (run) => {
      listeners.press.add(run);
      return () => listeners.press.delete(run);
    },
  };
  /** A pointer goes down on a control that sends first (`true`), or comes up (`false`). */
  h.press = (down) => {
    for (const run of listeners.press) run(down);
  };
  return h;
}
const type = (h, cue, field, text) => {
  for (let i = 1; i <= text.length; i += 1) h.draft.edit(cue, { values: { [field]: text.slice(0, i) } });
};
const settle = () => new Promise((resolve) => setImmediate(resolve));
/** Run the live timers set for `ms`, as the clock reaching them would. */
const runTimers = (h, ms) => {
  for (const [id, t] of [...h.timers]) {
    if (t.ms !== ms) continue;
    h.timers.delete(id);
    t.run();
  }
};

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
  for (const run of h.listeners.hide) run(true);
  assert.deepEqual(h.retained, [{ cueId: 'c1', fields: { label: 'Opener', note: null, values: { f0: 'Closing', f1: 'Host' } } }]);
  assert.equal(h.writes.length, 0);
  assert.equal(h.session.draft.get().values.f0, 'Closing', 'the editor still shows it');
  for (const run of h.listeners.hide) run(true);
  assert.equal(h.retained.length, 1, 'saved once: nothing is owed after');
  assert.equal(await h.draft.flush(), true);
  assert.equal(h.writes.length, 0);
  stop();
});

test('the page hiding while a save is out through the history saves it at once, once', async () => {
  // Phase 3 check on 92e581a7: the history writes a flushed draft from its queue, a moment later,
  // so a reload in between lost it. The page going saves it synchronously, and only once.
  const h = harness();
  const stop = h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'Out when hidden' } });
  const out = h.draft.flush();
  assert.equal(h.writes.length, 1, 'the save is out');
  for (const run of h.listeners.hide) run(true);
  assert.deepEqual(h.retained.map((r) => r.fields.values.f0), ['Out when hidden']);
  for (const run of h.listeners.hide) run(true);
  assert.equal(h.retained.length, 1, 'saved once');
  h.writes[0].answer(true);
  assert.equal(await out, true);
  for (const run of h.listeners.hide) run(true);
  assert.equal(h.retained.length, 1, 'nothing owed once confirmed');
  stop();
});

test('a save already confirmed is not saved again when the page hides', async () => {
  const h = harness();
  const stop = h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'Confirmed' } });
  const out = h.draft.flush();
  h.writes[0].answer(true);
  await out;
  for (const run of h.listeners.hide) run(true);
  assert.equal(h.retained.length, 0);
  stop();
});

test('P1: the page going records the owed edit, with the text its cue held when the typing started', () => {
  const h = harness();
  const stop = h.draft.listen(h.adapters);
  type(h, OPENER, 'f0', 'Rec');
  for (const run of h.listeners.hide) run(true);
  assert.deepEqual(h.owed, {
    cueId: 'c1',
    bases: [{ label: 'Opener', note: null, values: { f0: 'Anna Riva', f1: 'Host' } }],
    fields: { label: 'Opener', note: null, values: { f0: 'Rec', f1: 'Host' } },
  });
  assert.equal(h.retained.length, 1, 'and saved to the store as before');
  stop();
});

test('P1: a save out through the history is recorded too when the page goes', () => {
  const h = harness();
  const stop = h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'Out' } });
  void h.draft.flush();
  for (const run of h.listeners.hide) run(true);
  assert.equal(h.owed?.fields.values.f0, 'Out');
  assert.deepEqual(h.owed?.bases.map((b) => b.values.f0), ['Anna Riva', 'Out']);
  stop();
});

test('P1: a draft of another cue records that cue and the text it started from', () => {
  const h = harness();
  const stop = h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'First' } });
  h.draft.cancel();
  h.draft.edit(CLOSER, { label: 'Ending' });
  for (const run of h.listeners.hide) run(true);
  assert.equal(h.owed?.cueId, 'c2');
  assert.deepEqual(h.owed?.bases, [{ label: 'Closer', note: 'last', values: { f0: 'Ben Lund', f1: 'Guest' } }]);
  assert.equal(h.owed?.fields.label, 'Ending');
  stop();
});

test('P5: the session end and the listening stop save without a record', () => {
  const h = harness();
  const stop = h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'Leaving' } });
  stop();
  assert.equal(h.retained.length, 1);
  assert.equal(h.owed, null);
  const g = harness();
  g.draft.edit(OPENER, { values: { f0: 'Ended' } });
  g.session.dispose();
  assert.equal(g.retained.length, 1);
  assert.equal(g.owed, null);
});

test('P3: a save the store confirms removes the record; a refused one keeps it', async () => {
  const h = harness();
  const stop = h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'Hidden then back' } });
  for (const run of h.listeners.hide) run(true);
  h.draft.edit(OPENER, { values: { f0: 'Typed on' } });
  const refused = h.draft.flush();
  h.writes[0].answer(false);
  await refused;
  assert.notEqual(h.owed, null, 'refused: kept');
  const saved = h.draft.flush();
  h.writes[1].answer(true);
  await saved;
  assert.equal(h.owed, null, 'confirmed: removed');
  stop();
});

test('P3: the record stays when the page comes back; a draft this page recorded and then dropped removes it', () => {
  // The hide's save may still be committing when the operator comes back, so coming back is no
  // proof (PR review of 43bcf60). An undo or another cue drops the draft: the record goes then,
  // so an undone edit never comes back on the next visit.
  const h = harness();
  const stop = h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'Hidden' } });
  for (const run of h.listeners.hide) run(true);
  h.draft.cancel();
  assert.notEqual(h.owed, null, 'dropped while hidden or going (the history resetting): kept');
  h.draft.edit(OPENER, { values: { f0: 'Hidden again' } });
  for (const run of h.listeners.hide) run(true);
  for (const run of h.listeners.shown) run();
  assert.notEqual(h.owed, null, 'kept while the page is back');
  h.draft.cancel();
  assert.equal(h.owed, null, 'dropped by the operator after recording: removed');
  stop();
});

test('P3: a page removes only the record it wrote: another tab of the production may have written its own since', async () => {
  // Final review of 43bcf60: both tabs share one record per production.
  const h = harness();
  const stop = h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'Mine' } });
  for (const run of h.listeners.hide) run(true);
  for (const run of h.listeners.shown) run();
  const theirs = { cueId: 'c2', bases: [{ label: 'Closer', note: 'last', values: { f0: 'Ben Lund', f1: 'Guest' } }], fields: { label: 'Theirs', note: 'last', values: {} } };
  h.owed = structuredClone(theirs);
  h.draft.edit(OPENER, { values: { f0: 'Mine, typed on' } });
  const saved = h.draft.flush();
  h.writes.at(-1).answer(true);
  await saved;
  assert.deepEqual(h.owed, theirs, 'a confirmed save leaves the other tab\'s record');
  h.draft.edit(OPENER, { values: { f0: 'Again' } });
  for (const run of h.listeners.hide) run(true);
  for (const run of h.listeners.shown) run();
  h.owed = structuredClone(theirs);
  h.draft.cancel();
  assert.deepEqual(h.owed, theirs, 'a dropped draft leaves the other tab\'s record');
  stop();
});

test('P3: a page that recorded nothing leaves a record alone when it drops a draft', () => {
  // A page just opened drops a draft while it starts, before `recover`.
  const h = harness();
  h.owed = { cueId: 'c1', bases: [], fields: {} };
  h.draft.edit(OPENER, { values: { f0: 'x' } });
  h.draft.cancel();
  assert.notEqual(h.owed, null);
});

test('P1: a save handed to the history is listed under the edit before the store confirms it', () => {
  // PR review of 43bcf60: a team production's outbox holds it before the server answers.
  const h = harness();
  const stop = h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'B' } });
  void h.draft.flush();
  h.draft.edit(OPENER, { values: { f0: 'C' } });
  for (const run of h.listeners.hide) run(true);
  assert.deepEqual(h.owed?.bases.map((b) => b.values.f0), ['Anna Riva', 'B']);
  assert.equal(h.owed?.fields.values.f0, 'C');
  stop();
});

test('P1: the account pausing saves as before and keeps no record', () => {
  // Final review of 7901c00: the page stays, so nothing would ever remove such a record, and an
  // undo after it would come back on the next visit.
  const h = harness();
  const stop = h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'Paused' } });
  for (const run of h.listeners.hide) run(false);
  assert.equal(h.retained.length, 1);
  assert.equal(h.owed, null);
  stop();
});

test('P1: after a hide the page came back from, typing on is applied over the text that hide saved', () => {
  // Final review of 7901c00: type, switch tab and back, type on, then the page goes.
  const h = harness();
  const stop = h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'A' } });
  for (const run of h.listeners.hide) run(true);
  for (const run of h.listeners.shown) run();
  h.draft.edit(OPENER, { values: { f0: 'AB' } });
  for (const run of h.listeners.hide) run(true);
  assert.deepEqual(h.owed?.bases.map((b) => b.values.f0), ['Anna Riva', 'A']);
  assert.equal(h.owed?.fields.values.f0, 'AB');
  stop();
});

const owedOver = (base) => ({ cueId: 'c1', bases: [base], fields: { label: 'Opener', note: null, values: { f0: 'From the record', f1: 'Host' } } });
const ASTYPED = { label: 'Opener', note: null, values: { f0: 'Anna Riva', f1: 'Host' } };

test('P2: a record over the text the cue still holds is written through the history, and goes once confirmed', async () => {
  const h = harness();
  h.owed = owedOver(ASTYPED);
  h.draft.recover();
  assert.deepEqual(h.writes.map((w) => [w.cueId, w.fields]), [['c1', owedOver(ASTYPED).fields]]);
  assert.equal(h.retained.length, 0);
  assert.notEqual(h.owed, null, 'kept until the store confirms');
  h.writes[0].answer(true);
  await settle();
  assert.equal(h.owed, null);
});

test('P2: an unconfirmed recovery keeps the record for the next visit', async () => {
  const h = harness();
  h.owed = owedOver(ASTYPED);
  h.draft.recover();
  h.writes[0].answer(false);
  await settle();
  assert.notEqual(h.owed, null);
});

test('P2: a newer record written while the recovery is out is not removed by its confirmation', async () => {
  const h = harness();
  h.owed = owedOver(ASTYPED);
  h.draft.recover();
  const newer = { cueId: 'c1', bases: [ASTYPED], fields: { ...ASTYPED, label: 'Newer' } };
  h.owed = newer;
  h.writes[0].answer(true);
  await settle();
  assert.deepEqual(h.owed, newer);
});

test('P2: a cue changed since the typing started keeps what it holds, and the record goes', () => {
  const h = harness();
  h.owed = owedOver({ ...ASTYPED, values: { f0: 'Someone else', f1: 'Host' } });
  h.draft.recover();
  assert.equal(h.writes.length, 0);
  assert.equal(h.owed, null);
  h.owed = owedOver({ ...ASTYPED, label: 'Renamed since' });
  h.draft.recover();
  assert.equal(h.writes.length, 0);
});

test('P2: a record applies over any text listed under it: the start, or a part handed to the store', () => {
  const h = harness();
  h.owed = { ...owedOver({ ...ASTYPED, values: { f0: 'Start', f1: 'Host' } }), bases: [{ ...ASTYPED, values: { f0: 'Start', f1: 'Host' } }, ASTYPED] };
  h.draft.recover();
  assert.equal(h.writes.length, 1, 'the cue holds the second listed text');
});

test('P2: a record for a cue that is gone, or that the cue already holds, writes nothing and goes', () => {
  const h = harness();
  h.owed = { ...owedOver(ASTYPED), cueId: 'gone' };
  h.draft.recover();
  assert.equal(h.writes.length, 0);
  assert.equal(h.owed, null);
  h.owed = { cueId: 'c1', bases: [{ ...ASTYPED, values: { f0: 'Older' } }], fields: ASTYPED };
  h.draft.recover();
  assert.equal(h.writes.length, 0);
  assert.equal(h.owed, null);
});

test('P2: while the account may not write, the record stays for a later visit', () => {
  const h = harness();
  h.owed = owedOver(ASTYPED);
  h.canWrite = false;
  h.draft.recover();
  assert.equal(h.writes.length, 0);
  assert.notEqual(h.owed, null);
  h.canWrite = true;
  h.draft.recover();
  assert.equal(h.writes.length, 1);
});

test('P1: an earlier save of the same cue confirmed while typing went on is listed under the edit', async () => {
  // PR review of 7901c00: the store then holds that save's text, so the newer typing must be applied
  // over it, not over the text before it.
  const h = harness();
  const stop = h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'B' } });
  const first = h.draft.flush();
  h.draft.edit(OPENER, { values: { f0: 'C' } });
  h.writes[0].answer(true);
  await first;
  for (const run of h.listeners.hide) run(true);
  assert.deepEqual(h.owed?.bases.map((b) => b.values.f0), ['Anna Riva', 'B']);
  assert.equal(h.owed?.fields.values.f0, 'C');
  stop();
});

test('the page hiding saves nothing while the account may not write, and the edit stays owed', () => {
  const h = harness();
  h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'Paused' } });
  h.canWrite = false;
  for (const run of h.listeners.hide) run(true);
  assert.equal(h.retained.length, 0);
  h.canWrite = true;
  for (const run of h.listeners.hide) run(true);
  assert.deepEqual(h.retained.map((r) => r.fields.values.f0), ['Paused']);
});

test('a refused synchronous save stays owed', () => {
  const h = harness();
  h.draft.listen(h.adapters);
  h.retainOk = false;
  h.draft.edit(OPENER, { values: { f0: 'Refused' } });
  for (const run of h.listeners.hide) run(true);
  h.retainOk = true;
  for (const run of h.listeners.hide) run(true);
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

// #2388: a Take pressed right after an unsaved edit. The press's pointer-down takes the focus, and
// the editor's blur owes the save; that save rewrites the stored productions synchronously, so it
// runs only once the press is over and its handler has sent.

test('a blur saves at once when no press that sends first took the focus', () => {
  const h = harness();
  h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'Tabbed away' } });
  const saves = [];
  h.draft.blurred(() => saves.push('save'));
  assert.deepEqual(saves, ['save']);
  h.press(false);
  h.draft.blurred(() => saves.push('again'));
  assert.deepEqual(saves, ['save', 'again'], 'a press elsewhere is no press that sends first');
});

test('a blur by a press that sends first saves after the press, once, and keeps the edit owed meanwhile', () => {
  const h = harness();
  h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'Typed then Take' } });
  const saves = [];
  h.press(true);
  h.draft.blurred(() => saves.push(h.draft.view(OPENER).values.f0));
  assert.deepEqual(saves, [], 'the press runs before the save');
  assert.ok(![...h.timers.values()].some((t) => t.ms === FLUSH_DELAY_MS), 'the idle save does not land on the press');
  assert.deepEqual(h.draft.view(OPENER).values.f0, 'Typed then Take', 'the press reads the edit from memory');
  h.press(false);
  assert.deepEqual(saves, [], 'not inside the release: its click is dispatched in the same task');
  // A second fast press inside the idle delay: the save waits for it too.
  h.press(true);
  runTimers(h, FLUSH_DELAY_MS);
  assert.deepEqual(saves, [], 'never during a press');
  h.press(false);
  assert.deepEqual(saves, []);
  runTimers(h, FLUSH_DELAY_MS);
  assert.deepEqual(saves, ['Typed then Take'], 'once presses pause for the idle delay');
  h.tick();
  assert.equal(saves.length, 1, 'once');
  assert.equal(h.timers.size, 0, 'the cap goes with it');
});

test('the page closing during the press saves the edit at once', () => {
  const h = harness();
  h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'Closed after Take' } });
  h.press(true);
  h.draft.blurred(() => void h.draft.flush());
  for (const run of h.listeners.hide) run(true);
  assert.deepEqual(h.retained.map((r) => r.fields.values.f0), ['Closed after Take']);
});

test('the idle save that falls during a press that sends first waits for its release', () => {
  const h = harness();
  h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'Idle' } });
  h.press(true);
  h.tick();
  assert.equal(h.writes.length, 0, 'not during the press');
  h.press(false);
  h.tick();
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].fields.values.f0, 'Idle');
});

test('a press held past the cap no longer holds the save', () => {
  const h = harness();
  h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'Held' } });
  const saves = [];
  h.press(true);
  h.draft.blurred(() => saves.push('save'));
  const cap = [...h.timers].find(([, t]) => t.ms === PRESS_HOLD_MAX_MS);
  assert.ok(cap, 'capped');
  h.timers.delete(cap[0]);
  cap[1].run();
  h.tick();
  assert.deepEqual(saves, ['save']);
});

test("the session's end during a press saves the edit and drops the held save", () => {
  const h = harness();
  h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'Ended' } });
  const saves = [];
  h.press(true);
  h.draft.blurred(() => saves.push('save'));
  h.session.dispose();
  assert.deepEqual(h.retained.map((r) => r.fields.values.f0), ['Ended']);
  h.press(false);
  h.tick();
  assert.deepEqual(saves, []);
});

test('typing again before the held save ran carries on in the same draft and group, and starts no write', () => {
  const h = harness();
  h.draft.listen(h.adapters);
  h.draft.edit(OPENER, { values: { f0: 'Before' } });
  const saves = [];
  h.press(true);
  h.draft.blurred(() => saves.push('held save'));
  h.press(false);
  h.draft.edit(OPENER, { values: { f0: 'After' } });
  assert.equal(h.writes.length, 0, 'no write starts inside an edit');
  assert.deepEqual(h.groups, ['c1:f0', 'c1:f0'], 'the same group carries on');
  runTimers(h, FLUSH_DELAY_MS);
  assert.deepEqual(saves, [], 'the held save is dropped');
  assert.deepEqual(h.writes.map((w) => w.fields.values.f0), ['After'], 'the idle save writes the latest text once');
  assert.equal(h.timers.size, 0);
});

test('the editor moving to another cue starts the save of the draft it left, once, and keeps it until confirmed', async () => {
  const h = harness();
  h.draft.listen(h.adapters);
  h.draft.showing('c1', () => assert.fail('no draft yet'));
  h.draft.edit(OPENER, { values: { f0: 'Typed on air' } });
  h.draft.showing('c1', () => assert.fail('still this cue'));
  h.draft.showing('c2', () => void h.draft.flush());
  assert.deepEqual(h.writes.map((w) => [w.cueId, w.fields.values.f0]), [['c1', 'Typed on air']], 'saved as it stood');
  h.draft.showing('c2', () => assert.fail('only when the cue changes'));
  assert.deepEqual(h.draft.view(CLOSER).values, CLOSER.values, 'the new cue reads its record');
  h.writes[0].answer(false);
  await settle();
  assert.equal(h.session.draft.get().values.f0, 'Typed on air', 'a failed save keeps the draft');
  for (const run of h.listeners.hide) run(true);
  assert.deepEqual(h.retained.map((r) => r.fields.values.f0), ['Typed on air'], 'and the page going saves it');
});
