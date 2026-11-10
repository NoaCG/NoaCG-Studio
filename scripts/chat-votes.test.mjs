// guards: src/audience/chatVotes.ts
// guards: src/audience/chatIntake.ts
//
// CHAT VOTES (docs/work-specs/interaction/spec.md, "Chat votes"; AC-10; Rules C1 to C10 in the
// phase notes), on recorded-shape YouTube pages and Twitch frames (scripts/fixtures/youtube/
// chat-vote-pages.json, scripts/fixtures/twitch/chat-votes.json) through the real readers, the real
// intake and the local provider, the room an unpublished production runs on. The configured suite
// proves the same rules against the database (`audience_operator_votes`, migration 0113).
//
// The clock is the fixtures' own: Date is mocked to the moment each question goes live, so the
// window is judged on the platform times exactly as recorded.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { mock } from 'node:test';
import './lib/tsResolve.mjs';

const { createChatIntake } = await import('../src/audience/chatIntake.ts');
const { CHAT_VOTE_ALLOWANCE_MS, voteOption, inVoteWindow, latestPerVoter } = await import('../src/audience/chatVotes.ts');
const { createLocalAudience } = await import('../src/audience/localAudience.ts');
const { openRoundOf } = await import('../src/audience/audienceTypes.ts');

const read = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const yt = read('./fixtures/youtube/chat-vote-pages.json');
const tw = read('./fixtures/twitch/chat-votes.json');

const VOTE = { id: 'q-vote', type: 'choice', text: 'Who wins tonight?', options: ['Home', 'Away', 'Draw'] };
const NEXT = { id: 'q-next', type: 'choice', text: 'Extra time?', options: ['Yes', 'No'] };

const drain = async () => {
  for (let i = 0; i < 30; i += 1) await new Promise((r) => setImmediate(r));
};

/** The room, with browser storage stood in; the intake wired to it as the production page wires it. */
function room(t) {
  const map = new Map();
  globalThis.localStorage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) };
  t.after(() => delete globalThis.localStorage);
  const backend = createLocalAudience({ productionName: 'Show' });
  const wire = (intake) => {
    intake.setAdd((items) => backend.addCandidates(items));
    intake.setSubmit((token, author, body) => backend.submit(token, author, body, { roundId: 'none', revision: 0 }));
    intake.setVotes({ live: async () => openRoundOf(await backend.rounds()), send: (id, votes) => backend.chatVotes(id, votes) });
    return intake;
  };
  const inbox = async () => (await backend.list()).map((s) => s.body);
  const chat = async (round) => (await backend.tally(round.id)).chat;
  return { backend, wire, inbox, chat };
}

const clock = (t, iso) => {
  mock.timers.enable({ apis: ['Date'], now: typeof iso === 'number' ? iso : Date.parse(iso) });
  t.after(() => mock.timers.reset());
};
const at = (iso, seconds) => (typeof iso === 'number' ? iso : Date.parse(iso)) + seconds * 1000;

/** The YouTube reader's doors: recorded answers in order, timers fired by hand. */
function youtubeIo() {
  const queue = [];
  const timers = [];
  let lookedUp = false;
  const io = {
    fetch: async (url) => {
      let body;
      if (!lookedUp && String(url).includes('/videos?')) {
        lookedUp = true;
        body = read('./fixtures/youtube/video-live.json');
      } else body = queue.shift() ?? read('./fixtures/youtube/chat-empty-page.json');
      return { ok: true, status: 200, json: async () => body };
    },
    setTimer: (run, ms) => {
      const timer = { run, ms, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      if (timer) timer.cleared = true;
    },
  };
  const fire = async () => {
    const timer = timers.filter((x) => !x.cleared).at(-1);
    timer.cleared = true;
    timer.run();
    await drain();
  };
  return { io, queue, fire };
}

/** A stand-in for the browser's WebSocket (as scripts/twitch-chat.test.mjs has it). */
class FakeSocket {
  static made = [];
  constructor(url) {
    this.url = url;
    this.sent = [];
    FakeSocket.made.push(this);
  }
  send(line) {
    this.sent.push(line);
  }
  close() {
    this.onclose?.();
  }
  deliver(...frames) {
    for (const data of frames) this.onmessage({ data });
  }
}

function twitchSocket(t) {
  const before = globalThis.WebSocket;
  globalThis.WebSocket = FakeSocket;
  t.after(() => {
    globalThis.WebSocket = before;
  });
  const open = () => {
    const ws = FakeSocket.made.at(-1);
    ws.onopen();
    ws.deliver(tw.join);
    return ws;
  };
  return { open };
}

test('a vote is only a number or a letter naming an option (C1)', () => {
  assert.equal(voteOption('2', 3), 1);
  assert.equal(voteOption('B', 3), 1);
  assert.equal(voteOption('b', 3), 1);
  assert.equal(voteOption(' 2 ', 3), 1);
  assert.equal(voteOption('1', 3), 0);
  assert.equal(voteOption('c', 3), 2);
  assert.equal(voteOption('D', 3), null, 'a letter past the options is a message');
  assert.equal(voteOption('4', 3), null);
  assert.equal(voteOption('0', 3), null);
  assert.equal(voteOption('12', 8), null);
  assert.equal(voteOption('2!', 3), null);
  assert.equal(voteOption('B wins', 3), null);
  assert.equal(voteOption('h', 8), 7);
});

test('the clock allowance is the coarsest platform time in the recorded fixtures (C6)', () => {
  // YouTube's publishedAt: every recorded time is whole seconds, so a line said in Go live's own
  // second can read up to 999 ms earlier. Twitch's tmi-sent-ts carries milliseconds.
  // The coarsest step a page's times are given in: a page whose every time is a whole second has a
  // one-second step. The two live-chat pages from the recording count (chat-vote-pages.json is
  // invented, so it is no measure); the later page, as recorded, gives whole seconds.
  const pageStep = (name) => {
    const text = readFileSync(new URL(`./fixtures/youtube/${name}`, import.meta.url), 'utf8');
    const ms = [...text.matchAll(/"publishedAt": "[^"]+?(?:\.(\d+))?Z"/g)].map((m) => Number(m[1] ?? 0));
    assert.ok(ms.length > 0);
    return ms.some((n) => n !== 0) ? 1 : 1000;
  };
  const youtubeStep = Math.max(pageStep('chat-first-page.json'), pageStep('chat-later-page.json'));
  const twitch = readFileSync(new URL('./fixtures/twitch/anonymous-read.json', import.meta.url), 'utf8');
  const sent = [...twitch.matchAll(/tmi-sent-ts=(\d+)/g)].map((m) => Number(m[1]));
  assert.ok(sent.length > 0 && sent.some((n) => n % 1000 !== 0), 'Twitch times carry milliseconds');
  assert.equal(youtubeStep, 1000);
  assert.equal(CHAT_VOTE_ALLOWANCE_MS, youtubeStep);
  // The window, at its edges.
  const round = { openedAt: '2026-10-20T21:30:00.400Z', closedAt: '2026-10-20T21:31:00.000Z' };
  assert.equal(inVoteWindow(Date.parse('2026-10-20T21:30:00Z'), round), true, 'the same second as Go live');
  assert.equal(inVoteWindow(Date.parse('2026-10-20T21:29:59Z'), round), false, 'the second before');
  assert.equal(inVoteWindow(Date.parse('2026-10-20T21:31:00Z'), round), true);
  assert.equal(inVoteWindow(Date.parse('2026-10-20T21:31:01Z'), round), false, 'after Stop');
  assert.equal(inVoteWindow(NaN, round), false, 'no platform time, no vote');
});

test('per voter the latest platform time wins, of equal times the last to arrive (C4)', () => {
  const v = (voter, option, s) => ({ voter, option, at: `2026-10-20T21:30:${s}Z` });
  assert.deepEqual(latestPerVoter([v('yt:a', 2, '20'), v('yt:a', 0, '12'), v('yt:b', 1, '05'), v('yt:b', 2, '05')]), [v('yt:a', 2, '20'), v('yt:b', 2, '05')]);
});

test('YouTube: once per author, a repeated id once, the latest by platform time, the earlier page and a paused backlog vote only inside the window, other lines reach the inbox (AC-10)', async (t) => {
  clock(t, yt.goLiveAt);
  const { backend, wire, inbox, chat } = room(t);
  const q = await backend.goLive(VOTE);
  await backend.vote('phone-device-0001', q.id, 0, q.revision);

  const { io, queue, fire } = youtubeIo();
  const intake = wire(createChatIntake({ youtubeIo: io }));
  t.after(() => intake.stopAll());

  // Connecting reads the chat's recent history, marked earlier. The window judges it: `2` and `B`
  // said before Go live vote on nothing, `1` said two seconds after counts; its other lines reach
  // the inbox as before.
  mock.timers.setTime(at(yt.goLiveAt, 4));
  queue.push(yt.pages.first);
  const source = intake.add({ platform: 'youtube', videoId: '4xDzrJKXOOY', apiKey: 'KEY', sourceId: 'y1' });
  await drain();
  assert.deepEqual(await chat(q), [1, 0, 0]);
  assert.deepEqual(await inbox(), ['Hello from the stands']);

  // Votes: `1`, `b`, ` 2 `; the first voter changes to `B`; `D` names no option, so it is a message.
  mock.timers.setTime(at(yt.goLiveAt, 11));
  queue.push(yt.pages.votes);
  await fire();
  assert.deepEqual(await chat(q), [1, 3, 0]);
  assert.deepEqual((await inbox()).slice(1), ['Great show tonight', 'D']);

  // The same message again counts once; one author's later-said `3` beats an earlier `1` that
  // arrives after it.
  mock.timers.setTime(at(yt.goLiveAt, 21));
  queue.push(yt.pages.repeat);
  await fire();
  assert.deepEqual(await chat(q), [1, 3, 1]);

  // Across pages too: a vote said earlier, arriving on a later page, does not replace a newer one.
  mock.timers.setTime(at(yt.goLiveAt, 31));
  queue.push(yt.pages.newer, yt.pages.older);
  await fire();
  await fire();
  assert.deepEqual(await chat(q), [2, 3, 1]);

  // Phone and chat apart, and summed.
  const tally = await backend.tally(q.id);
  assert.deepEqual(tally.phone, [1, 0, 0]);
  assert.deepEqual(tally.chat, [2, 3, 1]);
  assert.deepEqual(tally.counts, [3, 3, 1]);
  assert.equal(tally.total, 7);
  assert.equal(intake.sources()[0].votes, 6, 'the older vote that changed nothing is not counted as one');

  // Paused, the room moves to the next question; on resume, the backlog read after the pause votes
  // on the new question only with what was said after it went live (`1` at 40 s does not, `2` at
  // 70 s does), and its other lines are messages. What is said after the resume counts too.
  intake.setPaused(source.id, true);
  mock.timers.setTime(Date.parse(yt.secondLiveAt));
  await backend.stop(q.id);
  const next = await backend.goLive(NEXT);
  mock.timers.setTime(at(yt.goLiveAt, 76));
  queue.push(yt.pages.backlog, yt.pages.afterResume);
  intake.setPaused(source.id, false);
  await drain();
  assert.deepEqual(await chat(next), [0, 1]);
  assert.ok((await inbox()).includes('Still here'));
  assert.ok(!(await inbox()).includes('1'), 'a vote-shaped line that does not count is not a message either');
  await fire();
  assert.deepEqual(await chat(next), [0, 2]);
  assert.deepEqual(await chat(q), [2, 3, 1], 'the closed question keeps its count');
});

test('Twitch: once per author, in order by platform time, a reconnect replay votes on nothing new, other lines reach the inbox (AC-10, C10)', async (t) => {
  clock(t, tw.goLiveAt);
  const { backend, wire, inbox, chat } = room(t);
  const q = await backend.goLive(VOTE);
  const socket = twitchSocket(t);
  const intake = wire(createChatIntake());
  t.after(() => intake.stopAll());
  intake.add({ platform: 'twitch', channel: 'rehearsal_room' });
  const ws = socket.open();

  mock.timers.setTime(at(tw.goLiveAt, 13));
  ws.deliver(...tw.votes.map((f) => f.data));
  await drain();
  // 600001 `1` then `B`; 600002 `b` (delivered twice); 600003 ` 2 `; 600005 said `1` at 9.7 s and
  // `3` at 12.5 s, the later-said one arriving first.
  assert.deepEqual(await chat(q), [0, 3, 1]);
  // With a vote live, a Twitch line that is not a vote reaches the inbox (no Open question to answer).
  const rows = await backend.list();
  assert.deepEqual(rows.map((r) => [r.body, r.source]), [['Who scores first?', 'Twitch chat']]);

  // The room moves on; the socket drops and a reconnect replays what was said before.
  mock.timers.setTime(tw.secondLiveAt);
  await backend.stop(q.id);
  const next = await backend.goLive(NEXT);
  mock.timers.setTime(at(tw.goLiveAt, 66));
  ws.close();
  await new Promise((r) => setTimeout(r, 1_100)); // the reader's first reconnect step
  const again = socket.open();
  again.deliver(...tw.votes.map((f) => f.data), ...tw.second.map((f) => f.data));
  await drain();
  assert.deepEqual(await chat(next), [1, 0], 'only the line said after the new question went live');
  assert.deepEqual(await chat(q), [0, 3, 1]);

  // A reloaded page has forgotten which ids it saw: the window alone keeps the replay off the new
  // question. (`3` names no option of a two-option question, so it is a message.)
  const fresh = wire(createChatIntake());
  t.after(() => fresh.stopAll());
  fresh.add({ platform: 'twitch', channel: 'rehearsal_room' });
  socket.open().deliver(...tw.votes.map((f) => f.data));
  await drain();
  assert.deepEqual(await chat(next), [1, 0]);
  assert.equal(fresh.sources()[0].votes, 0, 'the page sends none of them: the window is judged before the server');
  assert.ok(!(await inbox()).includes('1'), 'a replayed vote is not a message either');
});

test('a burst of 500 chat votes is not limited by the message throttle, which still holds for messages (AC-10, C8)', async (t) => {
  clock(t, tw.goLiveAt);
  const { backend, wire, inbox, chat } = room(t);
  const q = await backend.goLive(VOTE);
  const socket = twitchSocket(t);
  const intake = wire(createChatIntake());
  t.after(() => intake.stopAll());
  intake.add({ platform: 'twitch', channel: 'rehearsal_room' });
  const ws = socket.open();
  mock.timers.setTime(at(tw.goLiveAt, 10));

  const template = tw.votes[0].data;
  const line = (n, text) =>
    template
      .replace(/user-id=\d+/, `user-id=${700000 + n}`)
      .replace(/id=b2000000-0000-4000-8000-\d+/, `id=c3000000-0000-4000-8000-${String(n).padStart(12, '0')}`)
      .replace(/tmi-sent-ts=(\d+)/, (_, ms) => `tmi-sent-ts=${Number(ms) + n}`)
      .replace(/:1\r\n$/, `:${text}\r\n`);
  const burst = Array.from({ length: 500 }, (_, n) => line(n, n % 3 === 0 ? 'A' : n % 3 === 1 ? '2' : 'c'));
  const chatter = Array.from({ length: 20 }, (_, n) => line(1000 + n, `Message ${n}`));
  ws.deliver(burst.join('') + chatter.join(''));
  await drain();
  await drain();
  const tally = await backend.tally(q.id);
  assert.deepEqual(tally.chat, [167, 167, 166]);
  assert.equal(tally.total, 500);
  assert.equal((await inbox()).length, 10, 'messages keep the 10-in-10-seconds intake throttle');
  assert.deepEqual(await chat(q), [167, 167, 166]);
});

test('votes the server refuses as closed are tried once on the question live now, inside its window (C5)', async (t) => {
  clock(t, tw.goLiveAt);
  const live = { first: { id: 'r1', kind: 'poll', options: ['A', 'B'], openedAt: new Date(tw.goLiveAt).toISOString(), closedAt: null } };
  live.now = live.first;
  const sent = [];
  const intake = createChatIntake();
  intake.setVotes({
    live: async () => live.now,
    send: async (roundId, votes) => {
      sent.push([roundId, votes.map((v) => v.voter)]);
      if (roundId === 'r1') {
        // Another operator's Go live closed r1 between the reading and the send.
        live.now = { id: 'r2', kind: 'poll', options: ['A', 'B'], openedAt: new Date(at(tw.goLiveAt, 5)).toISOString(), closedAt: null };
        return { counted: 0, closed: true };
      }
      return { counted: votes.length };
    },
  });
  const test1 = intake.addTest('T');
  mock.timers.setTime(at(tw.goLiveAt, 8));
  test1.push('Early', '1', 'm1', { at: at(tw.goLiveAt, 3), voter: 'tw:1' });
  test1.push('Late', '2', 'm2', { at: at(tw.goLiveAt, 7), voter: 'tw:2' });
  await drain();
  assert.deepEqual(sent, [
    ['r1', ['tw:1', 'tw:2']],
    ['r2', ['tw:2']],
  ]);
  const state = intake.sources()[0];
  assert.equal(state.votes, 1);
  assert.equal(state.dropped, 1, 'the vote said before the new question went live is not moved to it');
});

test('a failed reading of what is live is tried again, never taken as nothing live (C1, C11)', async (t) => {
  clock(t, tw.goLiveAt);
  const round = { id: 'r1', kind: 'poll', options: ['A', 'B'], openedAt: new Date(tw.goLiveAt).toISOString(), closedAt: null };
  let reads = 0;
  const sent = [];
  const added = [];
  const intake = createChatIntake();
  intake.setAdd(async (items) => (added.push(...items), items));
  intake.setVotes({
    live: async () => {
      reads += 1;
      if (reads === 1) throw new Error('offline for a moment');
      return round;
    },
    send: async (roundId, votes) => (sent.push([roundId, votes.length]), { counted: votes.length }),
  });
  const source = intake.addTest('T');
  mock.timers.setTime(at(tw.goLiveAt, 2));
  source.push('Viewer', 'b', 'f1', { at: at(tw.goLiveAt, 1), voter: 'tw:1' });
  await new Promise((r) => setTimeout(r, 5_300));
  await drain();
  assert.deepEqual(sent, [['r1', 1]], 'the vote waited for a reading and counted');
  assert.deepEqual(added, [], 'it never became a message');
});

test("this page's Go live is read at once, not after the reading's three seconds (C1)", async (t) => {
  clock(t, tw.goLiveAt);
  const first = { id: 'r1', kind: 'open', options: [], openedAt: new Date(tw.goLiveAt).toISOString(), closedAt: null };
  let live = first;
  const sent = [];
  const intake = createChatIntake();
  intake.setAdd(async (items) => items);
  intake.setSubmit(async () => ({ ok: true, error: null }));
  intake.setVotes({ live: async () => live, send: async (roundId, votes) => (sent.push(roundId), { counted: votes.length }) });
  const source = intake.addTest('T');
  source.push('Viewer', 'Hello', 'g1', { at: at(tw.goLiveAt, 1) });
  await drain();
  // The operator puts a vote live in this page; within the same second a viewer votes.
  mock.timers.setTime(at(tw.goLiveAt, 2));
  live = { id: 'r2', kind: 'poll', options: ['A', 'B'], openedAt: new Date(at(tw.goLiveAt, 2)).toISOString(), closedAt: null };
  intake.liveChanged();
  source.push('Viewer', 'a', 'g2', { at: at(tw.goLiveAt, 2), voter: 'tw:1' });
  await drain();
  assert.deepEqual(sent, ['r2']);
});
