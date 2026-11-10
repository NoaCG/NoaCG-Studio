// guards: src/control/resultStaging.ts
// guards: src/model/resultCues.ts
// guards: src/model/teamShowMerge.ts
//
// RESULTS TO THE RUNDOWN (docs/work-specs/interaction/spec.md AC-9; the Rules S1 to S16 in its
// phase 3 notes), in Node. The planner and the staging function run against a fake store that
// applies the plan the way model/shows.ts `stageShowResult` does (model/shows.ts is not importable
// in Node). Pinned: the first press adds one cue on the remembered graphic and maps it; a second
// press, a reload (a new page over the stored record) and another tab update that cue; a deleted
// cue or a graphic without the fields gets a new cue with a note; nothing is picked without a
// choice; Change then a pick moves the result to a new cue; Stop finalises only an existing cue
// and never adds one; staging writes only the result fields; a refused write says so; a team merge
// keeps both questions' links; and the staging module imports nothing that can send to an output.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import './lib/tsResolve.mjs';

const { planResultCue, readResultCues } = await import('../src/model/resultCues.ts');
const { pollFieldMap, rememberedResultTarget, resultDestinationOf, resultCueSaysOpen, roundsToFinalise, resultDestinations, stageResults, tallyValues, RESULT_BOARDS } = await import('../src/control/resultStaging.ts');
const { mergeTeamShow } = await import('../src/model/teamShowMerge.ts');

const f = (field, title) => ({ field, title, ftype: 'textfield' });
const graphic = (id, name, fields) => ({ id, name, type: 'x', savedAt: '', template: { name, fields } });
const board = (id, name = 'House Vote') => graphic(id, name, [f('f0', 'Question'), f('f1', 'Options'), f('f2', 'Vote count'), f('f3', 'Sponsor')]);
const strap = graphic('g-strap', 'Hairline', [f('f0', 'Name'), f('f1', 'Title')]);

const round = { question: 'Who wins?', options: ['Home', 'Away'] };
const tally = (a, b) => ({ counts: [a, b], total: a + b });

/** A fake production store applying a plan as model/shows.ts `stageShowResult` does: rebased on
 *  the stored record at write time, refused when `refuse` is set. */
function store(initial) {
  const s = { record: structuredClone(initial), refuse: null, writes: 0 };
  let n = 0;
  s.stage = (showId, questionId, opts) => {
    const show = structuredClone(s.record);
    const takes = (fields) => opts.valuesFor(fields) !== null;
    const plan = planResultCue(show, questionId, takes, opts.chosen);
    if (plan.kind === 'choose' || (opts.closeOnly && plan.kind !== 'update')) return { shows: [s.record], error: null, outcome: () => ({ plan, cueId: null }) };
    if (s.refuse) return { shows: [s.record], error: s.refuse, outcome: () => ({ plan: null, cueId: null }) };
    const g = show.graphics.find((x) => x.id === plan.graphicId);
    const values = opts.valuesFor(g.template.fields);
    let cue = plan.kind === 'update' ? show.cues.find((c) => c.id === plan.cueId) : undefined;
    if (!cue && opts.adopt) cue = show.cues.find((c) => c.id === opts.adopt);
    if (opts.adopt && cue?.id !== opts.adopt) show.cues = show.cues.filter((c) => c.id !== opts.adopt);
    if (cue) cue.values = { ...cue.values, ...values };
    else {
      cue = { id: `cue-${++n}`, sourceId: g.id, label: opts.label, values };
      show.cues.push(cue);
    }
    show.resultCues = { ...readResultCues(show.resultCues), [questionId]: cue.id };
    if (opts.chosen && show.graphics.some((x) => x.id === opts.chosen && takes(x.template.fields))) show.resultTarget = opts.chosen;
    s.record = show;
    s.writes++;
    const id = cue.id;
    return { shows: [show], error: null, outcome: () => ({ plan, cueId: id }) };
  };
  s.deps = { stage: s.stage, commit: async () => null, setShows: () => {}, reread: () => [s.record] };
  return s;
}

const press = (s, input = {}) =>
  stageResults(s.record, { questionId: 'q1', round, tally: tally(2, 1), closed: false, liveFigures: false, label: 'Vote: Who wins?', ...input }, s.deps);

test('the field contract: Question and Options by title, the last match wins, a strap is not a board', () => {
  assert.equal(pollFieldMap(strap.template.fields), null);
  const map = pollFieldMap([f('f0', 'Question'), f('f1', 'Options'), f('f9', 'Question'), f('f2', 'Vote count'), f('f3', 'Vote status'), f('f4', 'Live figures')]);
  assert.deepEqual(map, { question: 'f9', options: 'f1', count: 'f2', status: 'f3', live: 'f4' });
  const v = tallyValues(round, tally(3, 1), map, true, true);
  assert.deepEqual(v, { f9: 'Who wins?', f1: 'Home | 3\nAway | 1', f2: '4 votes · voting closed', f3: 'closed', f4: 'live' });
  assert.deepEqual(RESULT_BOARDS.map((b) => b.id), ['pl01', 'pl02', 'pl03', 'pl04', 'pl05']);
});

test('nothing is picked without a choice; the choice is remembered (S5)', async () => {
  const s = store({ id: 's', graphics: [strap, board('g-a')], cues: [] });
  assert.equal(rememberedResultTarget(s.record), null);
  assert.deepEqual(resultDestinations(s.record).map((d) => d.graphicId), ['g-a']);
  const first = await press(s);
  assert.equal(first.ok, false);
  assert.equal(first.choose, true);
  assert.equal(s.writes, 0);
  const picked = await press(s, { chosen: 'g-a' });
  assert.equal(picked.ok, true);
  assert.equal(picked.kind, 'added');
  assert.equal(s.record.resultTarget, 'g-a');
  assert.equal(rememberedResultTarget(s.record).name, 'House Vote');
});

test('one cue per question: a second press, a reload and another tab update the same cue (S1, S2, S4)', async () => {
  const s = store({ id: 's', graphics: [board('g-a')], cues: [{ id: 'other', sourceId: 'g-a', label: 'Kept', values: { f0: 'x' } }], resultTarget: 'g-a' });
  const first = await press(s);
  assert.equal(first.kind, 'added');
  const cueId = first.cueId;
  assert.deepEqual(s.record.resultCues, { q1: cueId });
  // A second press, from a page holding the record as it was BEFORE the first write (a stale tab):
  // the write is decided on the stored record, so it updates, and the note says so (S15).
  const stalePage = { id: 's', graphics: [board('g-a')] };
  const second = await stageResults(stalePage, { questionId: 'q1', round, tally: tally(5, 1), closed: false, liveFigures: false, label: 'Vote: Who wins?' }, s.deps);
  assert.equal(second.kind, 'updated');
  assert.equal(second.cueId, cueId);
  assert.match(second.message, /Updated the result cue on “House Vote” with 6 votes/);
  assert.equal(s.record.cues.length, 2);
  assert.equal(s.record.cues.find((c) => c.id === cueId).values.f1, 'Home | 5\nAway | 1');
  // The unrelated cue on the same graphic is untouched.
  assert.deepEqual(s.record.cues.find((c) => c.id === 'other').values, { f0: 'x' });
});

test('staging writes only the result fields; the cue keeps its other values (S9)', async () => {
  const s = store({ id: 's', graphics: [board('g-a')], cues: [{ id: 'c1', sourceId: 'g-a', label: 'Mine', values: { f3: 'Brought to you by X' } }], resultTarget: 'g-a', resultCues: { q1: 'c1' } });
  await press(s);
  assert.deepEqual(s.record.cues[0].values, { f3: 'Brought to you by X', f0: 'Who wins?', f1: 'Home | 2\nAway | 1', f2: '3 votes · voting open' });
  assert.equal(s.record.cues[0].label, 'Mine');
});

test('a deleted cue or a graphic without the fields gets a new cue with a note (S3)', async () => {
  const s = store({ id: 's', graphics: [board('g-a'), strap], cues: [], resultTarget: 'g-a', resultCues: { q1: 'gone' } });
  const deleted = await press(s);
  assert.equal(deleted.kind, 'added');
  assert.match(deleted.message, /earlier result cue was deleted/);
  assert.equal(s.record.cues.length, 1);

  const t = store({ id: 's', graphics: [board('g-a'), strap], cues: [{ id: 'c-strap', sourceId: 'g-strap', label: 'x', values: {} }], resultTarget: 'g-a', resultCues: { q1: 'c-strap' } });
  const noFields = await press(t);
  assert.equal(noFields.kind, 'added');
  assert.match(noFields.message, /no longer has the result fields/);
  assert.notEqual(noFields.cueId, 'c-strap');
  assert.deepEqual(t.record.cues.find((c) => c.id === 'c-strap').values, {});
});

test('Change then a pick moves the result to a new cue; the old one stays (S16)', async () => {
  const s = store({ id: 's', graphics: [board('g-a'), board('g-b', 'Volt Vote')], cues: [], resultTarget: 'g-a' });
  const first = await press(s);
  const moved = await press(s, { chosen: 'g-b' });
  assert.equal(moved.kind, 'added');
  assert.match(moved.message, /stays in the rundown/);
  assert.equal(s.record.cues.length, 2);
  assert.equal(s.record.resultCues.q1, moved.cueId);
  assert.ok(s.record.cues.some((c) => c.id === first.cueId));
  // Picking the graphic the cue is already on is not a move.
  const same = await press(s, { chosen: 'g-b' });
  assert.equal(same.kind, 'updated');
});

test('a catalog board picked under S5 adopts its seeded cue as the result cue', async () => {
  const s = store({ id: 's', graphics: [board('g-new')], cues: [{ id: 'seeded', sourceId: 'g-new', label: 'House Vote', values: { f0: 'sample' } }] });
  const made = await press(s, { chosen: 'g-new', adopt: 'seeded' });
  assert.equal(made.cueId, 'seeded');
  assert.equal(s.record.cues.length, 1);
  assert.equal(s.record.cues[0].values.f0, 'Who wins?');
});

test('Stop finalises an existing result cue and never adds one (S7)', async () => {
  const s = store({ id: 's', graphics: [board('g-a')], cues: [], resultTarget: 'g-a' });
  const none = await press(s, { closed: true, closeOnly: true });
  assert.equal(none.kind, 'none');
  assert.equal(s.record.cues.length, 0);
  await press(s);
  const closed = await press(s, { closed: true, closeOnly: true });
  assert.equal(closed.kind, 'updated');
  assert.equal(s.record.cues[0].values.f2, '3 votes · voting closed');
  // A deleted result cue is not brought back by Stop.
  s.record.cues = [];
  const gone = await press(s, { closed: true, closeOnly: true });
  assert.equal(gone.kind, 'none');
  assert.equal(s.record.cues.length, 0);
});

test('a refused write says so and records nothing (S6)', async () => {
  const s = store({ id: 's', graphics: [board('g-a')], cues: [], resultTarget: 'g-a' });
  s.refuse = 'Storage is full.';
  const refused = await press(s);
  assert.equal(refused.ok, false);
  assert.match(refused.message, /Storage is full/);
  assert.doesNotMatch(refused.message, /✓/);
  assert.equal(s.record.cues.length, 0);
  assert.equal(s.record.resultCues, undefined);
  // A write accepted but not landed is said as such too.
  s.refuse = null;
  s.deps.commit = async () => 'The disk refused the write.';
  const unlanded = await press(s);
  assert.equal(unlanded.ok, false);
  assert.match(unlanded.message, /No result cue was added/);
});

test('a team merge keeps both questions links, and theirs on a true clash (S12)', () => {
  const base = { id: 's', name: 'S', graphics: [], cues: [], updatedAt: 'a' };
  const ours = { ...base, resultCues: { q1: 'c1' } };
  const theirs = { ...base, resultCues: { q2: 'c2' } };
  assert.deepEqual(mergeTeamShow(base, ours, theirs, 'z').doc.resultCues, { q1: 'c1', q2: 'c2' });
  const clash = mergeTeamShow(base, { ...base, resultCues: { q1: 'mine' } }, { ...base, resultCues: { q1: 'theirs' } }, 'z');
  assert.deepEqual(clash.doc.resultCues, { q1: 'theirs' });
});

test('staging cannot reach an output: it imports nothing that sends (S8)', async () => {
  for (const file of ['src/control/resultStaging.ts', 'src/model/resultCues.ts']) {
    const src = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    const imports = [...src.matchAll(/^import[^;]*from '([^']+)'/gm)].map((m) => m[1]);
    for (const spec of imports) assert.doesNotMatch(spec, /graphicVerbs|hostedControl|playoutSession|serverVerbs|bridge|output/i, `${file} imports ${spec}`);
  }
});

test('the note reports what the stored write did, not this tab’s guess (S4, S15)', async () => {
  // This tab's copy has no link yet, so its run plans an add; the stored record (another tab
  // staged meanwhile) makes the rebased run update that cue. The note follows the stored run.
  let last = { plan: { kind: 'add', graphicId: 'g-a', replaced: null }, cueId: 'phantom' };
  const record = { id: 's', graphics: [board('g-a')], cues: [{ id: 'theirs', sourceId: 'g-a', label: 'Vote', values: {} }], resultTarget: 'g-a', resultCues: { q1: 'theirs' } };
  let shown = null;
  const deps = {
    stage: () => ({ shows: [record], error: null, outcome: () => last }),
    commit: async () => {
      last = { plan: { kind: 'update', cueId: 'theirs', graphicId: 'g-a' }, cueId: 'theirs' };
      return null;
    },
    setShows: (shows) => (shown = shows),
    reread: () => [record],
  };
  const out = await stageResults(record, { questionId: 'q1', round, tally: tally(1, 1), closed: false, liveFigures: false, label: 'Vote' }, deps);
  assert.equal(out.kind, 'updated');
  assert.equal(out.cueId, 'theirs');
  assert.match(out.message, /Updated the result cue/);
  // The page shows the stored productions, not its own phantom cue.
  assert.deepEqual(shown, [record]);
});

test('a pick is remembered even when it lands on the cue already there; an unused seeded cue goes (S5, S16)', async () => {
  const s = store({ id: 's', graphics: [board('g-a'), board('g-b', 'Volt Vote')], cues: [], resultTarget: 'g-a' });
  await press(s);
  delete s.record.resultTarget;
  const same = await press(s, { chosen: 'g-a' });
  assert.equal(same.kind, 'updated');
  assert.equal(s.record.resultTarget, 'g-a');
  // A board added for this pick whose seeded cue the write does not use: the seed goes.
  s.record.cues.push({ id: 'seed', sourceId: 'g-a', label: 'House Vote', values: {} });
  const again = await press(s, { chosen: 'g-a', adopt: 'seed' });
  assert.equal(again.kind, 'updated');
  assert.equal(s.record.cues.some((c) => c.id === 'seed'), false);
  assert.equal(s.record.cues.length, 1);
});

/** Deps whose first (tab) pass says one thing and whose stored pass, after commit, another. */
function twoPass(tabPlan, storedPlan, storedCue) {
  let last = { plan: tabPlan, cueId: null };
  const record = { id: 's', graphics: [board('g-a')], cues: [] };
  return {
    record,
    deps: {
      stage: () => ({ shows: [record], error: null, outcome: () => last }),
      commit: async () => {
        last = { plan: storedPlan, cueId: storedCue };
        return null;
      },
      setShows: () => {},
      reread: () => [record],
    },
  };
}

test('Stop from a tab that has not heard of the link still finalises the stored cue (S13)', async () => {
  const { record, deps } = twoPass({ kind: 'choose', replaced: null }, { kind: 'update', cueId: 'theirs', graphicId: 'g-a' }, 'theirs');
  const out = await stageResults(record, { questionId: 'q1', round, tally: tally(3, 1), closed: true, liveFigures: false, label: 'Vote', closeOnly: true }, deps);
  assert.equal(out.kind, 'updated');
  assert.equal(out.cueId, 'theirs');
  assert.match(out.message, /now carries the final 4 votes/);
});

test('a stored pass with nowhere to write is reported as such, never as the tab’s success (S15)', async () => {
  const { record, deps } = twoPass({ kind: 'update', cueId: 'c1', graphicId: 'g-a' }, { kind: 'choose', replaced: 'no-fields' }, null);
  const out = await stageResults(record, { questionId: 'q1', round, tally: tally(1, 1), closed: false, liveFigures: false, label: 'Vote' }, deps);
  assert.equal(out.ok, false);
  assert.equal(out.choose, true);
  assert.match(out.message, /no longer has the result fields/);
  assert.doesNotMatch(out.message, /✓/);
  // Stop's version of the same: nothing to finalise, said as nothing.
  const t = twoPass({ kind: 'update', cueId: 'c1', graphicId: 'g-a' }, { kind: 'choose', replaced: 'deleted' }, null);
  const stop = await stageResults(t.record, { questionId: 'q1', round, tally: tally(1, 1), closed: true, liveFigures: false, label: 'Vote', closeOnly: true }, t.deps);
  assert.equal(stop.kind, 'none');
});

test('the button names where this question\u2019s press would write: its cue first, then the remembered graphic', () => {
  const show = { id: 's', graphics: [board('g-a'), board('g-b', 'Volt Vote'), strap], cues: [{ id: 'c1', sourceId: 'g-a', label: 'Vote', values: {} }], resultTarget: 'g-b', resultCues: { q1: 'c1' } };
  assert.equal(resultDestinationOf(show, 'q1').name, 'House Vote');
  assert.equal(resultDestinationOf(show, 'q2').name, 'Volt Vote');
  assert.equal(resultDestinationOf({ ...show, resultTarget: undefined }, 'q2'), null);
  // A cue whose graphic lost its fields: the next press adds on the remembered graphic, so that is named.
  assert.equal(resultDestinationOf({ ...show, cues: [{ id: 'c1', sourceId: 'g-strap', label: 'x', values: {} }] }, 'q1').name, 'Volt Vote');
});

test('the closing sweep finds every closed poll round whose cue still says open, whatever closed it (S26)', () => {
  const r = (id, questionId, closedAt = null, kind = 'poll') => ({ id, questionId, closedAt, kind });
  const show = {
    id: 's',
    graphics: [board('g-a'), graphic('g-st', 'Imported', [f('f0', 'Question'), f('f1', 'Options'), f('f2', 'Vote status')])],
    cues: [
      { id: 'c1', sourceId: 'g-a', label: 'V', values: { f2: '3 votes · voting open' } },
      { id: 'c2', sourceId: 'g-a', label: 'V', values: { f2: '3 votes · voting closed' } },
      { id: 'c3', sourceId: 'g-st', label: 'V', values: { f2: 'open' } },
    ],
    resultCues: { q1: 'c1', q2: 'c2', q3: 'c3', q5: 'gone' },
  };
  assert.equal(resultCueSaysOpen(show, 'q1'), true);
  assert.equal(resultCueSaysOpen(show, 'q2'), false);
  assert.equal(resultCueSaysOpen(show, 'q3'), true);
  assert.equal(resultCueSaysOpen(show, 'q4'), false);
  assert.equal(resultCueSaysOpen(show, 'q5'), false);
  // The page saw Q1 live; another operator opened Q2 then this tab opened Q3 (r3 just opened):
  // the sweep takes what the provider says now, not what the page saw.
  const after = [r('r1', 'q1', 'then'), r('r2', 'q2', 'now'), r('r3', 'q3', null), r('r4', 'q4', 'now', 'open')];
  assert.deepEqual(roundsToFinalise(show, after, 'r3').map((x) => x.id), ['r1']);
  // Q3's cue says open but its round is the one just opened, or still open: left alone.
  assert.deepEqual(roundsToFinalise(show, [r('r3', 'q3', 'x')], 'r3'), []);
  assert.deepEqual(roundsToFinalise(show, [r('r3', 'q3', null)], null), []);
});

test('a staging write that read "open" closes the cue itself when the round closed before it landed (S29)', async () => {
  // A Stop elsewhere found no cue yet (close-only, nothing to do); this press wrote "open" after.
  const s = store({ id: 's', graphics: [board('g-a')], cues: [], resultTarget: 'g-a' });
  s.deps.recheck = async () => ({ closed: true, tally: tally(4, 2) });
  const out = await press(s);
  assert.equal(out.ok, true);
  assert.match(out.message, /Voting closed meanwhile/);
  assert.equal(s.record.cues.length, 1);
  assert.equal(s.record.cues[0].values.f2, '6 votes · voting closed');
  assert.equal(s.record.cues[0].values.f1, 'Home | 4\nAway | 2');
  // Still open on the re-read: the open values stand.
  const t = store({ id: 's', graphics: [board('g-a')], cues: [], resultTarget: 'g-a' });
  t.deps.recheck = async () => ({ closed: false, tally: tally(9, 9) });
  await press(t);
  assert.equal(t.record.cues[0].values.f2, '3 votes · voting open');
  // The re-read fails: nothing more is written, and the open write is reported as it landed.
  const u = store({ id: 's', graphics: [board('g-a')], cues: [], resultTarget: 'g-a' });
  u.deps.recheck = async () => null;
  const quiet = await press(u);
  assert.equal(quiet.kind, 'added');
});
