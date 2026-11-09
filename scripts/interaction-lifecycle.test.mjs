// guards: src/audience/localAudience.ts
// guards: src/audience/audienceTypes.ts
//
// THE QUESTION LIFECYCLE on the local provider (docs/work-specs/interaction/spec.md AC-2, AC-3,
// AC-4, AC-7; Rules R1 to R15). The configured suite proves the same against the database
// (e2e/configured/audience-live.spec.ts); this is the rehearsal half, which an unpublished
// production runs on. Each expectation is written from a Rule (named beside it), not read off the
// provider's code.

import assert from 'node:assert/strict';
import test from 'node:test';

const { createLocalAudience, LOCAL_ROOM_KEY } = await import('../src/audience/localAudience.ts');
const { QUESTION_CLOSED } = await import('../src/audience/audienceTypes.ts');

/** A localStorage stand-in, shared by every provider made while it is installed (two tabs). */
function storage() {
  const map = new Map();
  globalThis.localStorage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
  return { map, restore: () => delete globalThis.localStorage };
}

const VOTE = { id: 'q-vote', type: 'choice', text: 'Who wins?', options: ['Home', 'Away'] };
const OPEN = { id: 'q-open', type: 'open', text: 'Ask the coach' };

const target = (round) => ({ roundId: round.id, revision: round.revision });
const openRounds = async (b) => (await b.rounds()).filter((r) => !r.closedAt);

test('Go live opens one round and points the state at it; another question closes it (R1, R3, AC-3)', async () => {
  const b = createLocalAudience({ productionName: 'Show' });
  const vote = await b.goLive(VOTE);
  assert.equal(vote.kind, 'poll');
  assert.equal(vote.questionId, 'q-vote');
  let state = await b.getState();
  assert.equal(state.open, true);
  assert.equal(state.mode, 'poll');
  assert.equal(state.round.id, vote.id);
  assert.equal(state.prompt, 'Who wins?');

  // Multiple choice to Open closes the vote: one round open, the state on the new one.
  const open = await b.goLive(OPEN);
  assert.deepEqual((await openRounds(b)).map((r) => r.id), [open.id]);
  state = await b.getState();
  assert.equal(state.mode, 'question');
  assert.equal(state.round.id, open.id);

  // A vote to the closed round is refused as closed, and counts nothing.
  const refused = await b.vote('device-1', vote.id, 0, vote.revision);
  assert.deepEqual(refused, { ok: false, error: QUESTION_CLOSED, closed: true });
  assert.equal((await b.tally(vote.id)).total, 0);
});

test('Stop names its round: stopping one that is no longer live leaves the live one up (R4)', async () => {
  const b = createLocalAudience({ productionName: 'Show' });
  const vote = await b.goLive(VOTE);
  const open = await b.goLive(OPEN);
  await b.stop(vote.id);
  assert.equal((await b.getState()).round.id, open.id, 'a late Stop on the old question changed nothing');
  const state = await b.stop(open.id);
  assert.equal(state.open, false);
  assert.equal(state.mode, 'waiting');
  assert.equal(state.round, null);
  assert.equal((await openRounds(b)).length, 0);
  const late = await b.submit('device-1', '', 'After stop', target(open));
  assert.equal(late.closed, true, 'an answer after Stop is refused');
  assert.equal((await b.list()).length, 0);
});

test('going live again continues the same count, and a phone that voted changes its vote rather than adding one (AC-2)', async () => {
  const b = createLocalAudience({ productionName: 'Show' });
  const first = await b.goLive(VOTE);
  assert.equal((await b.vote('device-1', first.id, 0, first.revision)).ok, true);
  assert.equal((await b.vote('device-2', first.id, 1, first.revision)).ok, true);
  await b.stop(first.id);
  const again = await b.goLive(VOTE);
  assert.equal(again.id, first.id, 'one question, one result');
  assert.equal(again.revision, first.revision, 'a plain reopen keeps the revision');
  assert.equal((await b.vote('device-1', again.id, 1, again.revision)).ok, true);
  const tally = await b.tally(again.id);
  assert.deepEqual(tally.counts, [0, 2]);
  assert.equal(tally.total, 2);
  const view = await b.joinView('device-1');
  assert.equal(view.myVote, 1, 'the phone sees its changed vote');
});

test('a duplicate starts from zero, and Clear results needs the question stopped and leaves nothing (AC-2, R9, R11)', async () => {
  const b = createLocalAudience({ productionName: 'Show' });
  const vote = await b.goLive(VOTE);
  await b.vote('device-1', vote.id, 0, vote.revision);
  const copy = await b.goLive({ ...VOTE, id: 'q-vote-copy' });
  assert.notEqual(copy.id, vote.id);
  assert.equal((await b.tally(copy.id)).total, 0);

  await assert.rejects(b.clearResults('q-vote-copy'), /stop the question/);
  await b.stop(copy.id);
  const open = await b.goLive(OPEN);
  await b.submit('device-1', 'Ana', 'An answer', target(open));
  await b.addCandidates([{ body: 'Pasted under it', roundId: open.id }]);
  await b.stop(open.id);
  const clearedOpen = await b.clearResults('q-open');
  assert.equal(clearedOpen.revision, open.revision + 1);
  assert.equal((await b.list()).filter((r) => r.roundId === open.id).length, 0, 'no answers left');
  const clearedVote = await b.clearResults('q-vote');
  assert.equal((await b.tally(clearedVote.id)).total, 0, 'no votes left');
  assert.equal(await b.clearResults('never-live'), null);
});

test('words stay as asked once answered; cleared, they may change and stale phones are refused (R5, R8, AC-4)', async () => {
  const b = createLocalAudience({ productionName: 'Show' });
  const vote = await b.goLive(VOTE);
  await assert.rejects(b.goLive({ ...VOTE, text: 'Live and changed' }), /live question cannot change/);
  await b.vote('device-1', vote.id, 1, vote.revision);
  await b.stop(vote.id);
  await assert.rejects(b.goLive({ ...VOTE, options: ['Home', 'Away', 'Draw'] }), /has answers/);
  await assert.rejects(b.goLive({ ...VOTE, type: 'open' }), /keeps its type/);

  // Stop, Clear results, an edit and Go live again: a phone still holding the old options is
  // refused rather than counted against the new ones.
  await b.clearResults('q-vote');
  const edited = await b.goLive({ ...VOTE, options: ['Draw', 'Home', 'Away'] });
  assert.equal(edited.id, vote.id);
  assert.equal(edited.revision, vote.revision + 2, 'one for the clear, one for the edit');
  const stale = await b.vote('device-1', vote.id, 1, vote.revision);
  assert.equal(stale.closed, true);
  assert.equal((await b.tally(vote.id)).total, 0);
  assert.equal((await b.vote('device-1', edited.id, 1, edited.revision)).ok, true);
});

test('answers are filed under the round they were sent to, and later changes never move them (AC-7, R7, R13)', async () => {
  const b = createLocalAudience({ productionName: 'Show' });
  const open = await b.goLive(OPEN);
  assert.equal((await b.submit('device-1', 'Ana', 'First answer', target(open))).ok, true);
  await b.addCandidates([{ body: 'Pasted to the live question', roundId: open.id }, { body: 'Pasted to none' }]);
  await assert.rejects(b.addCandidates([{ body: 'Somewhere else', roundId: 'not-a-round' }]), /not a question of this production/);

  const second = await b.goLive({ id: 'q-second', type: 'open', text: 'Second question' });
  // A phone still holding the first question sends: refused, nothing filed under the second.
  const stale = await b.submit('device-2', '', 'Meant for the first', target(open));
  assert.equal(stale.closed, true);
  assert.equal((await b.submit('device-2', '', 'For the second', target(second))).ok, true);

  const by = Object.groupBy(await b.list(), (r) => r.roundId ?? 'none');
  assert.deepEqual(by[open.id].map((r) => r.body).sort(), ['First answer', 'Pasted to the live question']);
  assert.deepEqual(by[second.id].map((r) => r.body), ['For the second']);
  assert.deepEqual(by.none.map((r) => r.body), ['Pasted to none']);
  assert.ok(!(await b.list()).some((r) => 'device' in r), 'no device reaches an operator surface');
});

test('a vote and an answer go only to their own kind of question (R6)', async () => {
  const b = createLocalAudience({ productionName: 'Show' });
  const open = await b.goLive(OPEN);
  assert.equal((await b.vote('device-1', open.id, 0, open.revision)).closed, true);
  await b.stop(open.id);
  const vote = await b.goLive(VOTE);
  assert.equal((await b.submit('device-1', '', 'Not a vote', target(vote))).closed, true);
  assert.equal((await b.vote('device-1', vote.id, 5, vote.revision)).error, 'That vote could not be counted.');
});

test('the room is kept per production: a reload and a second tab see the same rounds, and a race ends with one open (R1, R15)', async () => {
  const store = storage();
  try {
    const tabA = createLocalAudience({ productionName: 'Show', showId: 'p1' });
    const tabB = createLocalAudience({ productionName: 'Show', showId: 'p1' });
    const open = await tabA.goLive(OPEN);
    await tabA.addCandidates([{ body: 'Pasted', roundId: open.id }]);
    // Two operators press Go live on different questions in the same moment.
    await Promise.all([tabA.goLive(VOTE), tabB.goLive({ id: 'q-other', type: 'open', text: 'Other' })]);
    const reloaded = createLocalAudience({ productionName: 'Show', showId: 'p1' });
    const live = await openRounds(reloaded);
    assert.equal(live.length, 1, 'one open round');
    assert.equal((await reloaded.getState()).round.id, live[0].id, 'the state points at it');
    const pasted = (await reloaded.list()).find((r) => r.body === 'Pasted');
    assert.equal(pasted.roundId, open.id, 'a pasted message keeps its question across a reload');
    assert.ok((await reloaded.rounds()).some((r) => r.id === open.id), 'and that question’s round is still there');
    assert.ok(store.map.has(LOCAL_ROOM_KEY));
    // A different production's room is its own.
    const other = createLocalAudience({ productionName: 'Other', showId: 'p2' });
    assert.equal((await other.getState()).round, null);
  } finally {
    store.restore();
  }
});
