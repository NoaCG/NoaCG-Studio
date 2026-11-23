// guards: src/audience/voteExport.ts
//
// THE VOTES FILE (docs/work-specs/live-production-reliability/spec.md, P1 AC-3): a round's votes as
// a CSV an operator can check a result against. Pinned: the header and one row per vote, oldest
// first; the option by its letter and its words as asked; quoting that keeps a comma or quote in an
// option whole; a cell a spreadsheet would run as a formula kept as text; a file name that is safe
// anywhere; and a local voter key of the server's shape that never shows the device and differs
// from round to round.

import assert from 'node:assert/strict';
import test from 'node:test';

const { votesCsv, votesFileName, localVoterKey } = await import('../src/audience/voteExport.ts');

const round = { question: 'Who wins, tonight?', options: ['Home', 'Away, "the visitors"', '=1+1'], openedAt: '2026-11-23T19:00:00.000Z' };

test('one row per vote, oldest first, with the option by letter and by its words', () => {
  const csv = votesCsv(round, [
    { at: '2026-11-23T19:00:05.000Z', option: 1, source: 'chat', voter: 'bbbbbbbbbb' },
    { at: '2026-11-23T19:00:02.000Z', option: 0, source: 'phone', voter: 'aaaaaaaaaa' },
    { at: '2026-11-23T19:00:09.000Z', option: 2, source: 'phone', voter: 'cccccccccc' },
  ]);
  const lines = csv.split('\r\n');
  assert.equal(lines.pop(), '', 'the file ends with a line break');
  assert.deepEqual(lines, [
    'Time (UTC),Option,Answer,Source,Voter',
    '2026-11-23T19:00:02.000Z,A,Home,phone,aaaaaaaaaa',
    '2026-11-23T19:00:05.000Z,B,"Away, ""the visitors""",chat,bbbbbbbbbb',
    "2026-11-23T19:00:09.000Z,C,'=1+1,phone,cccccccccc",
  ]);
});

test('no votes is a header only', () => {
  assert.equal(votesCsv(round, []), 'Time (UTC),Option,Answer,Source,Voter\r\n');
});

test('the file name carries the question and the day, and nothing a file system refuses', () => {
  assert.equal(votesFileName(round), 'votes-who-wins-tonight-2026-11-23.csv');
  assert.equal(votesFileName({ question: '???', openedAt: 'not a date' }), 'votes-question-votes.csv');
  assert.match(votesFileName({ question: 'a/b\\c:d*e', openedAt: round.openedAt }), /^votes-[\w-]+-2026-11-23\.csv$/);
});

test('a local voter key has the server key shape, is stable, hides the device and differs per round', () => {
  const key = localVoterKey('round-1', 'device-secret');
  assert.match(key, /^[0-9a-f]{10}$/);
  assert.equal(localVoterKey('round-1', 'device-secret'), key);
  assert.notEqual(localVoterKey('round-2', 'device-secret'), key);
  assert.notEqual(localVoterKey('round-1', 'device-other'), key);
  assert.ok(!key.includes('device'));
});
