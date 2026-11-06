// guards: src/control/markerSender.ts
//
// One sender's live marker from its answers, as the hosted control page and the production page's
// sender both drive it: a Take whose send fails gives the marker back (#1713), a row of a press that
// got no answer lands it late, and on protocol 1 the last answer stands (#1721).

import test from 'node:test';
import assert from 'node:assert/strict';
import { withLiveCue } from '../src/control/liveCue.ts';
import { createMarkerSender } from '../src/control/markerSender.ts';

/** A page whose marker starts at `live`; `fast` stands in for the fast road's move at the press. */
function page(live = {}, ordered = true) {
  const state = { live, ordered };
  const sender = createMarkerSender({
    live: () => state.live,
    mark: (graphic, cue) => (state.live = withLiveCue(state.live, graphic, cue)),
    ordered: () => state.ordered,
    mintOid: (n) => `oid-${n}`,
  });
  const take = (graphic, cue) => {
    const { batches, pressed } = sender.stamp([[{ graphic, msg: { t: 'play' } }, { graphic, msg: { t: 'cue', cue } }]]);
    sender.press(pressed);
    state.live = withLiveCue(state.live, graphic, cue);
    return { batches, pressed };
  };
  return { state, sender, take };
}

test('a Take whose send fails gives the marker back to what stood before it (#1713)', () => {
  const { state, sender, take } = page({ Bug: 'c0' });
  const { batches, pressed } = take('Bug', 'c1');
  assert.equal(batches[0][1].msg.oid, 'oid-1', 'the marker leaves with its own id');
  assert.equal(state.live.Bug, 'c1', 'moved at the press');
  sender.answer(pressed, () => false);
  assert.equal(state.live.Bug, 'c0');
  assert.deepEqual(sender.out(), []);
});

test('a Take with no answer whose row is heard later is marked on air after all', () => {
  const { state, sender, take } = page({});
  const { batches, pressed } = take('Bug', 'c1');
  sender.failed(pressed, 0, [], true);
  assert.equal(state.live.Bug, undefined);
  sender.heardLate(batches[0]);
  assert.equal(state.live.Bug, 'c1');
});

test('own cue rows are left to the answers; another screen\'s are applied and stand over a failure', () => {
  const { state, sender, take } = page({ Bug: 'c0' });
  const { batches, pressed } = take('Bug', 'c1');
  const foreign = { graphic: 'Bug', msg: { t: 'cue', cue: 'x1', oid: 'other' } };
  const heard = [];
  assert.deepEqual(sender.withoutOwn([...batches[0], foreign], undefined, (graphic, cue) => heard.push([graphic, cue])), [batches[0][0], foreign]);
  assert.deepEqual(heard, [['Bug', 'x1']]);
  state.live = { Bug: 'x1' };
  sender.answer(pressed, () => false);
  assert.equal(state.live.Bug, 'x1');
});

test('on protocol 1 the last answer stands, not the newest press (#1721)', () => {
  for (const [ordered, want] of [[false, 'c1'], [true, 'c2']]) {
    const { state, sender, take } = page({}, ordered);
    const first = take('Bug', 'c1');
    const second = take('Bug', 'c2');
    sender.answer(second.pressed, () => true);
    sender.answer(first.pressed, () => true);
    assert.equal(state.live.Bug, want, ordered ? 'protocol 2' : 'protocol 1');
  }
});
