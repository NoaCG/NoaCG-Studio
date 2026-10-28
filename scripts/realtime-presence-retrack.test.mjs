// guards: src/control/livePath.ts, package.json, package-lock.json
//
// A RE-TRACK LEAVES ONE ENTRY, NOT A GHOST (#1798). Every page on air keeps the live topic's
// Presence state (src/control/livePath.ts `joinLivePresence`), and each change to an entry is a
// re-track: the server sends a join of the new meta and a leave of the old one on the same key.
// supabase-js 2.110.2 deleted `phx_ref` in place on the metas phoenix still held while it built the
// join event, so the leave matched nothing and the old meta stayed for good. On an output that
// was about 6 metas a minute, the 10 KB a minute of heap the hour-long endurance runs measured.
// This drives the real realtime-js Presence with the server's own frames, no socket, and counts.

import test from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeClient } from '@supabase/realtime-js';

const RETRACKS = 500;

test('a key re-tracked many times holds one meta, in the state supabase-js keeps', () => {
  const client = new RealtimeClient('ws://127.0.0.1:1/realtime/v1', { params: { apikey: 'local' } });
  const channel = client.channel('live:retrack', { config: { presence: { key: 'output', enabled: true } } });
  const phoenix = channel.channelAdapter.getChannel();
  // As if joined: phoenix applies diffs only once a state arrived for the current join.
  phoenix.joinPush.ref = '1';
  const meta = (n) => ({ phx_ref: `r${n}`, ...(n > 0 ? { phx_ref_prev: `r${n - 1}` } : {}), kind: 'output', at: n });
  let left = 0;
  channel.on('presence', { event: 'leave' }, () => (left += 1));
  phoenix.trigger('presence_state', { output: { metas: [meta(0)] }, operator: { metas: [{ phx_ref: 'o0', kind: 'operator' }] } });

  for (let n = 1; n <= RETRACKS; n++) {
    phoenix.trigger('presence_diff', { joins: { output: { metas: [meta(n)] } }, leaves: { output: { metas: [{ phx_ref: `r${n - 1}`, kind: 'output', at: n - 1 }] } } });
  }

  assert.equal(left, RETRACKS, 'every re-track reports its leave');
  const state = channel.presenceState();
  assert.deepEqual(
    state.output.map((m) => m.at),
    [RETRACKS],
    `the output key holds only its latest meta after ${RETRACKS} re-tracks, not one per re-track`,
  );
  assert.equal(state.operator.length, 1, 'another key is untouched');
  // What the heap holds is phoenix's own state, which presenceState() is copied from.
  assert.equal(channel.presence.presenceAdapter.presence.state.output.metas.length, 1);
  client.disconnect();
});
