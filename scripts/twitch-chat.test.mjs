// guards: src/audience/twitchChat.ts
//
// TWITCH CHAT, the existing anonymous reader, regression-checked on recorded frames (data-sources
// C7, AC-16; audience-flow AC-9). scripts/fixtures/twitch/anonymous-read.json holds the frames the
// reader receives over IRC-on-WebSocket in Twitch's wire format; every name, id and line is
// invented, and no test opens a socket. Pinned, each against a literal so a changed value goes red:
// the three opening commands; "live" only on the end-of-names reply; PING answered; chat lines,
// escaped names, /me actions and unicode delivered as sent; everything that is not chat ignored; the
// reconnect ladder (1 s doubling to a 30 s ceiling, reset by a confirmed join); stop is final; and,
// through the intake, the Twitch author line and device token, the dedupe of a re-delivered line and
// the 10-in-10-seconds throttle.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test, { mock } from 'node:test';
import './lib/tsResolve.mjs';

const { normalizeTwitchChannel, twitchChatDriver } = await import('../src/audience/twitchChat.ts');
const { createChatIntake } = await import('../src/audience/chatIntake.ts');

const recorded = JSON.parse(readFileSync(new URL('./fixtures/twitch/anonymous-read.json', import.meta.url), 'utf8'));

/** A stand-in for the browser's WebSocket: the test opens it, feeds it frames and closes it. */
class FakeSocket {
  static made = [];
  constructor(url) {
    this.url = url;
    this.sent = [];
    this.closed = false;
    FakeSocket.made.push(this);
  }
  send(line) {
    this.sent.push(line);
  }
  close() {
    this.closed = true;
  }
  replay(frames) {
    for (const frame of frames) this.onmessage({ data: frame.data });
  }
}

function withSockets(t) {
  FakeSocket.made = [];
  const before = globalThis.WebSocket;
  globalThis.WebSocket = FakeSocket;
  mock.timers.enable({ apis: ['setTimeout'] });
  t.after(() => {
    mock.timers.reset();
    globalThis.WebSocket = before;
  });
}

function recorder() {
  const messages = [];
  const statuses = [];
  return {
    messages,
    statuses,
    handlers: { onMessage: (m) => messages.push(m), onStatus: (s, d) => statuses.push(d ? `${s}: ${d}` : s) },
  };
}

test('a channel is a name, #name or the channel URL; anything else is refused', () => {
  assert.equal(normalizeTwitchChannel('Rehearsal_Room'), 'rehearsal_room');
  assert.equal(normalizeTwitchChannel('  #rehearsal_room '), 'rehearsal_room');
  assert.equal(normalizeTwitchChannel('https://www.twitch.tv/Rehearsal_Room?sr=a'), 'rehearsal_room');
  assert.equal(normalizeTwitchChannel('a'.repeat(25)), 'a'.repeat(25));
  assert.equal(normalizeTwitchChannel('a'.repeat(26)), null, 'logins are at most 25 characters');
  assert.equal(normalizeTwitchChannel('two words'), null);
  assert.equal(normalizeTwitchChannel(''), null);
});

test('the recorded session: three opening commands, live only on the join, PING answered, chat delivered as sent', (t) => {
  withSockets(t);
  t.mock.method(Math, 'random', () => 0);
  const r = recorder();
  const driver = twitchChatDriver('#Rehearsal_Room', r.handlers);
  const [ws] = FakeSocket.made;
  assert.equal(ws.url, 'wss://irc-ws.chat.twitch.tv:443');
  assert.deepEqual(r.statuses, ['connecting']);
  ws.onopen();
  assert.equal(ws.sent.length, 3);
  assert.equal(ws.sent[0], 'CAP REQ :twitch.tv/tags');
  assert.equal(ws.sent[1], 'NICK justinfan10000', 'an anonymous justinfan nickname, five digits at the lowest draw');
  assert.equal(ws.sent[2], 'JOIN #rehearsal_room');

  const [welcome, join, ...chat] = recorded.session;
  ws.replay([welcome]);
  assert.deepEqual(r.statuses, ['connecting'], 'the welcome is not yet the room');
  ws.replay([join]);
  assert.deepEqual(r.statuses, ['connecting', 'live'], 'the end-of-names reply confirms the join');
  ws.onmessage({ data: new ArrayBuffer(4) });
  ws.replay(chat);

  assert.deepEqual(ws.sent.slice(3), ['PONG :tmi.twitch.tv']);
  assert.deepEqual(r.messages, [
    { id: 'a1000000-0000-4000-8000-000000000001', authorId: 'quiz_fan_01', authorName: 'Quiz_Fan_01', text: 'Is the final round worth double points?' },
    { id: 'a1000000-0000-4000-8000-000000000002', authorId: 'river_otter', authorName: 'River_Otter', text: 'Greetings from the north stand' },
    { id: 'a1000000-0000-4000-8000-000000000003', authorId: 'nina_k', authorName: 'Nina K', text: 'Score check; who leads?' },
    { id: 'a1000000-0000-4000-8000-000000000004', authorId: 'river_otter', authorName: 'River_Otter', text: 'waves a scarf' },
    { id: 'a1000000-0000-4000-8000-000000000005', authorId: 'lumi_9', authorName: 'lumi_9', text: 'Hyvää iltaa studio 👋' },
    { id: 'a1000000-0000-4000-8000-000000000006', authorId: 'quiz_fan_01', authorName: 'Quiz_Fan_01', text: 'We counted 366 votes in round two' },
    { id: 'a1000000-0000-4000-8000-000000000008', authorId: 'lumi_9', authorName: 'Lumi_9', text: '   ' },
  ]);
  assert.deepEqual(r.statuses, ['connecting', 'live'], 'a chat line about 366 votes is chat, not a second join');
  driver.stop();
});

test('a dropped socket reconnects at 1 s, doubling to 30 s, and a confirmed join resets the ladder', (t) => {
  withSockets(t);
  const r = recorder();
  twitchChatDriver('rehearsal_room', r.handlers);
  const waits = [];
  for (let attempt = 0; attempt < 7; attempt += 1) {
    const count = FakeSocket.made.length;
    FakeSocket.made.at(-1).onclose();
    assert.equal(r.statuses.at(-1), 'error: Connection lost - reconnecting.');
    let waited = 0;
    while (FakeSocket.made.length === count) {
      mock.timers.tick(250);
      waited += 250;
      assert.ok(waited <= 60_000, 'it reconnects');
    }
    waits.push(waited);
  }
  assert.deepEqual(waits, [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);

  const ws = FakeSocket.made.at(-1);
  ws.onopen();
  ws.replay(recorded.reconnect.slice(0, 2));
  assert.equal(r.statuses.at(-1), 'live');
  const count = FakeSocket.made.length;
  ws.onclose();
  mock.timers.tick(999);
  assert.equal(FakeSocket.made.length, count);
  mock.timers.tick(1);
  assert.equal(FakeSocket.made.length, count + 1, 'back to 1 s after a confirmed join');
});

test('stop is final: the socket closes, nothing reconnects, and an error before stop does not retry after it', (t) => {
  withSockets(t);
  const r = recorder();
  const driver = twitchChatDriver('rehearsal_room', r.handlers);
  const [ws] = FakeSocket.made;
  ws.onclose();
  driver.stop();
  mock.timers.tick(120_000);
  assert.equal(FakeSocket.made.length, 1, 'the pending retry was cancelled');
  driver.stop();

  const second = twitchChatDriver('rehearsal_room', recorder().handlers);
  const live = FakeSocket.made.at(-1);
  second.stop();
  assert.equal(live.closed, true);
  live.onclose();
  mock.timers.tick(120_000);
  assert.equal(FakeSocket.made.length, 2, 'a close after stop does not reconnect');
});

test('a name that is no channel reports an error after the caller is wired, and opens nothing', (t) => {
  withSockets(t);
  const r = recorder();
  twitchChatDriver('not a channel!', r.handlers);
  assert.deepEqual(r.statuses, [], 'nothing reported synchronously');
  mock.timers.tick(0);
  assert.deepEqual(r.statuses, ['error: Not a Twitch channel name.']);
  assert.equal(FakeSocket.made.length, 0);
});

test('through the intake: Twitch author line and token, a re-delivered line deduped, blanks skipped', async (t) => {
  withSockets(t);
  const submitted = [];
  const intake = createChatIntake();
  intake.setSubmit(async (token, author, body) => {
    submitted.push({ token, author, body });
    return { ok: true };
  });
  intake.add({ platform: 'twitch', channel: 'rehearsal_room' });
  t.after(() => intake.stopAll());
  const [first] = FakeSocket.made;
  first.onopen();
  first.replay(recorded.session);
  first.onclose();
  mock.timers.tick(1_000);
  const second = FakeSocket.made.at(-1);
  assert.notEqual(second, first, 'reconnected');
  second.onopen();
  second.replay(recorded.reconnect);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(submitted.slice(0, 3), [
    { token: 'chat-tw-quiz_fan_01', author: 'Quiz_Fan_01 · Twitch', body: 'Is the final round worth double points?' },
    { token: 'chat-tw-river_otter', author: 'River_Otter · Twitch', body: 'Greetings from the north stand' },
    { token: 'chat-tw-nina_k', author: 'Nina K · Twitch', body: 'Score check; who leads?' },
  ]);
  assert.deepEqual(
    submitted.map((s) => s.body),
    [
      'Is the final round worth double points?',
      'Greetings from the north stand',
      'Score check; who leads?',
      'waves a scarf',
      'Hyvää iltaa studio 👋',
      'We counted 366 votes in round two',
      'Back after the break',
    ],
  );
  const [state] = intake.sources();
  assert.equal(state.platform, 'twitch');
  assert.equal(state.status, 'live');
  assert.equal(state.received, 8, 'seven lines and one re-delivery; the blank line is not counted');
  assert.equal(state.submitted, 7);
  assert.equal(state.dropped, 1, 'the re-delivered line');
});

test('through the intake: at most 10 Twitch lines in 10 seconds go to the door; the rest are counted', async (t) => {
  withSockets(t);
  let sent = 0;
  const intake = createChatIntake();
  intake.setSubmit(async () => {
    sent += 1;
    return { ok: true };
  });
  intake.add({ platform: 'twitch', channel: 'rehearsal_room' });
  t.after(() => intake.stopAll());
  const [ws] = FakeSocket.made;
  ws.onopen();
  ws.replay(recorded.session.slice(0, 2));
  const line = recorded.session[2].data;
  for (let n = 0; n < 12; n += 1) ws.onmessage({ data: line.replace('000000000001', `0000000001${String(n).padStart(2, '0')}`) });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sent, 10);
  assert.equal(intake.sources()[0].dropped, 2);
});

test('hostile frames parse in linear time', (t) => {
  withSockets(t);
  const r = recorder();
  twitchChatDriver('rehearsal_room', r.handlers);
  const [ws] = FakeSocket.made;
  const n = 200_000;
  const hostile = [
    `@${'\\'.repeat(n)} :a!a@a.tmi.twitch.tv PRIVMSG #rehearsal_room :x`,
    `@${'k=v;'.repeat(n / 4)} :a!a@a.tmi.twitch.tv PRIVMSG #rehearsal_room :y`,
    `:${'a'.repeat(n)}`,
    `:a!${'!'.repeat(n)} PRIVMSG`,
    `@${'a'.repeat(n)}`,
  ];
  const started = performance.now();
  ws.onmessage({ data: hostile.join('\r\n') });
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 1_000, `took ${Math.round(elapsed)} ms`);
  assert.deepEqual(r.messages.map((m) => m.text), ['x', 'y']);
});
