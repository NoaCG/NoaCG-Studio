// guards: src/model/wordCloud.ts
// guards: src/control/wordStaging.ts
// guards: src/model/questions.ts
// guards: src/audience/localAudience.ts
//
// WORD QUESTIONS (docs/work-specs/interaction/spec.md AC-14; the Rules W1 to W9 in its phase 6
// notes), in Node: one word of at most 25 characters per phone, the words listed by frequency,
// hidden words never reaching the cue, and staging a snapshot onto one word cloud cue. Each
// expectation is written from a Rule (named beside it), not read off the code. The configured walk
// (e2e/configured/audience-live.spec.ts) proves the server half; migration 0114 calls it too.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import './lib/tsResolve.mjs';

const { cleanWord, countWords, countWordTallies, wordCloudFields, wordKey, wordLines, wordsWithout, WORD_MAX, WORD_CLOUD_MAX } = await import('../src/model/wordCloud.ts');
const { readQuestions, makeQuestion, setWordHidden, duplicateQuestion, toLive, isKnownType } = await import('../src/model/questions.ts');
const { createLocalAudience } = await import('../src/audience/localAudience.ts');
const { QUESTION_CLOSED, WORD_ALREADY_SENT, WORD_REFUSED } = await import('../src/audience/audienceTypes.ts');
const { stageWords, wordCloudValues, wordDestinationOf, wordDestinations, WORD_CLOUDS } = await import('../src/control/wordStaging.ts');
const { messageFields } = await import('../src/control/messageStaging.ts');
const { pollFieldMap } = await import('../src/control/resultStaging.ts');
const { planResultCue, readResultCues } = await import('../src/model/resultCues.ts');
const { scrubHiddenWords } = await import('../src/model/wordCues.ts');
const { mergeTeamShow } = await import('../src/model/teamShowMerge.ts');

const target = (round) => ({ roundId: round.id, revision: round.revision });

// ── One word (W2) ───────────────────────────────────────────────────────────────────────────

test('a word is one word of at most 25 characters, trimmed (W2)', () => {
  assert.equal(WORD_MAX, 25);
  assert.equal(cleanWord('  Brilliant '), 'Brilliant');
  assert.equal(cleanWord('x'.repeat(25)), 'x'.repeat(25));
  assert.equal(cleanWord('x'.repeat(26)), null);
  // Characters, not UTF-16 units: 25 emoji are 25 characters.
  assert.equal(cleanWord('🎉'.repeat(25)), '🎉'.repeat(25));
  assert.equal(cleanWord('🎉'.repeat(26)), null);
  for (const bad of ['', '   ', 'two words', 'tab\there', 'a|b', 'line\nbreak']) assert.equal(cleanWord(bad), null, JSON.stringify(bad));
  assert.equal(cleanWord('self-made'), 'self-made');
});

// ── By frequency, hidden never on the cue (W1, W6) ──────────────────────────────────────────

test('words are listed by frequency, case does not split a word, the most used spelling shows (W1)', () => {
  const counts = countWords(['tense', 'Brilliant', 'brilliant', 'Loud', 'BRILLIANT', 'Tense', 'two words', 'Brilliant']);
  assert.deepEqual(
    counts.map((w) => [w.word, w.count]),
    [
      ['Brilliant', 4],
      ['tense', 2],
      ['Loud', 1],
    ],
  );
  assert.equal(counts[0].key, wordKey('BRILLIANT'));
  // Of equal counts, alphabetical by key.
  assert.deepEqual(countWords(['b', 'a']).map((w) => w.word), ['a', 'b']);
});

test('a hidden word stays in the list but never in the cue’s Words (W6)', () => {
  const counts = countWords(['Rude', 'Rude', 'Rude', 'Fun', 'Loud'], [wordKey('rude')]);
  assert.deepEqual(counts.map((w) => [w.word, w.hidden]), [['Rude', true], ['Fun', false], ['Loud', false]]);
  assert.equal(wordLines(counts), 'Fun | 1\nLoud | 1');
  assert.doesNotMatch(wordLines(counts), /rude/i);
});

test('the cue carries at most WORD_CLOUD_MAX words, the most used (W6)', () => {
  const bodies = [];
  for (let i = 0; i < 40; i += 1) for (let n = 0; n <= i; n += 1) bodies.push(`w${i}`);
  const lines = wordLines(countWords(bodies)).split('\n');
  assert.equal(lines.length, WORD_CLOUD_MAX);
  assert.equal(lines[0], 'w39 | 40');
  assert.equal(lines.at(-1), 'w10 | 11');
});

test('counts per spelling, as a provider gives them, read the same as the words one by one (W1)', () => {
  const tallies = [{ word: 'Loud', count: 1200 }, { word: 'loud', count: 3 }, { word: 'Fun', count: 2 }, { word: 'two words', count: 9 }, { word: 'Zero', count: 0 }];
  assert.deepEqual(countWordTallies(tallies).map((w) => [w.word, w.count]), [['Loud', 1203], ['Fun', 2]]);
  assert.deepEqual(countWordTallies([{ word: 'a', count: 2 }, { word: 'b', count: 1 }]), countWords(['a', 'b', 'a']));
});

test('a word hidden after the press leaves the cue: its line goes, by key, and nothing else changes (W6)', () => {
  const words = 'Brilliant | 4\ntense | 2\nLoud | 1';
  assert.equal(wordsWithout(words, wordKey('TENSE')), 'Brilliant | 4\nLoud | 1');
  assert.equal(wordsWithout(words, wordKey('nowhere')), words);
  assert.equal(wordsWithout('typed by hand\nLoud | 1', 'loud'), 'typed by hand');
  assert.deepEqual(wordCloudFields([{ field: 'f0', title: 'Label' }, { field: 'f1', title: 'Question' }, { field: 'f2', title: 'Words' }]), { question: 'f1', words: 'f2' });
  assert.equal(wordCloudFields([{ field: 'f0', title: 'Question' }, { field: 'f1', title: 'Options' }]), null);
});

// ── The question list (W1, W6) ──────────────────────────────────────────────────────────────

test('a Word question is made, read back, put live as a word, and hides words without being locked', () => {
  const made = makeQuestion('q-word', 'word', '  One word for tonight? ');
  assert.deepEqual(made.question, { id: 'q-word', type: 'word', text: 'One word for tonight?' });
  assert.equal(isKnownType('word'), true);
  assert.deepEqual(toLive(made.question), { id: 'q-word', type: 'word', text: 'One word for tonight?' });

  let list = setWordHidden([made.question], 'q-word', 'rude', true);
  list = setWordHidden(list, 'q-word', 'mean', true);
  assert.deepEqual(list[0].hidden, ['rude', 'mean']);
  // Stored and read back: the hidden words survive, junk in them does not.
  const stored = JSON.parse(JSON.stringify(list));
  stored[0].hidden.push(7, '');
  assert.deepEqual(readQuestions(stored)[0].hidden, ['rude', 'mean']);
  // Shown again, the key leaves; the last one leaves no empty list behind.
  list = setWordHidden(setWordHidden(list, 'q-word', 'rude', false), 'q-word', 'mean', false);
  assert.equal('hidden' in list[0], false);
  // Only a Word question hides words.
  const vote = { id: 'q-vote', type: 'choice', text: 'Who?', options: ['A', 'B'] };
  assert.deepEqual(setWordHidden([vote], 'q-vote', 'a', true), [vote]);
});

test('Duplicate of a Word question starts from zero: no hidden words (R11)', () => {
  const list = setWordHidden([{ id: 'q-word', type: 'word', text: 'One word?' }], 'q-word', 'rude', true);
  const copy = duplicateQuestion(list, 'q-word', 'q-copy')[1];
  assert.deepEqual(copy, { id: 'q-copy', type: 'word', text: 'One word?' });
});

// ── The local provider: one word per phone (W2, W3, R6, R15) ────────────────────────────────

const WORD = { id: 'q-word', type: 'word', text: 'One word for tonight?' };

test('a phone sends one word to a live Word question; a second word, two words or 26 characters are refused (W2, W3)', async () => {
  const b = createLocalAudience({ productionName: 'Show' });
  const round = await b.goLive(WORD);
  assert.equal(round.kind, 'word');
  assert.deepEqual(round.options, []);
  assert.equal((await b.getState()).mode, 'word');

  assert.deepEqual(await b.submit('phone-a-0001', 'Ana', '  Brilliant ', target(round)), { ok: true, error: null });
  assert.deepEqual(await b.submit('phone-a-0001', '', 'Again', target(round)), { ok: false, error: WORD_ALREADY_SENT });
  for (const bad of ['two words', 'x'.repeat(26), 'a|b']) {
    assert.deepEqual(await b.submit('phone-b-0001', '', bad, target(round)), { ok: false, error: WORD_REFUSED }, bad);
  }
  assert.deepEqual(await b.submit('phone-b-0001', '', 'y'.repeat(25), target(round)), { ok: true, error: null });

  // Filed under the round, trimmed; the phone reads its own word under it (W5). Words are not
  // messages: the message list never holds them (W9).
  assert.deepEqual(await b.wordCounts(round.id), [{ word: 'Brilliant', count: 1 }, { word: 'y'.repeat(25), count: 1 }]);
  assert.deepEqual(await b.list(), []);
  const view = await b.joinView('phone-a-0001');
  assert.equal(view.state.round.kind, 'word');
  assert.deepEqual(view.mine.map((m) => [m.body, m.roundId]), [['Brilliant', round.id]]);
});

test('a word sent to a stopped Word question is refused as closed and filed nowhere (R6, R14)', async () => {
  const b = createLocalAudience({ productionName: 'Show' });
  const round = await b.goLive(WORD);
  await b.stop(round.id);
  assert.deepEqual(await b.submit('phone-a-0001', '', 'Late', target(round)), { ok: false, error: QUESTION_CLOSED, closed: true });
  assert.deepEqual(await b.wordCounts(round.id), []);
  // Going live again continues the same result; Clear results removes the words (R2, R9).
  const again = await b.goLive(WORD);
  assert.equal(again.id, round.id);
  await b.submit('phone-a-0001', '', 'Fun', target(again));
  await b.stop(again.id);
  assert.deepEqual(await b.wordCounts(round.id), [{ word: 'Fun', count: 1 }]);
  await b.clearResults('q-word');
  assert.deepEqual(await b.wordCounts(round.id), []);
  // An Open question still takes a sentence, and a Word question keeps its type (R8).
  await assert.rejects(b.goLive({ ...WORD, type: 'open' }), /keeps its type/);
});

test('the provider counts every word of a round per spelling, not a page of the message list (W1)', async () => {
  const b = createLocalAudience({ productionName: 'Show' });
  const round = await b.goLive(WORD);
  for (const [device, word] of [['phone-a-0001', 'Loud'], ['phone-b-0001', 'Loud'], ['phone-c-0001', 'Fun']]) await b.submit(device, '', word, target(round));
  const open = await b.goLive({ id: 'q-open', type: 'open', text: 'Ask' });
  await b.submit('phone-a-0001', '', 'Not a word of the cloud', target(open));
  assert.deepEqual(await b.wordCounts(round.id), [{ word: 'Loud', count: 2 }, { word: 'Fun', count: 1 }]);
  // The message list holds the Open answer and none of the words, whatever the page has read (W9).
  assert.deepEqual((await b.list()).map((r) => r.body), ['Not a word of the cloud']);
});

test('Simulate files one word per simulated phone under the live Word question', async () => {
  const b = createLocalAudience({ productionName: 'Show', seed: 0 });
  const round = await b.goLive(WORD);
  b.simulate(4);
  const words = await b.wordCounts(round.id);
  assert.equal(words.reduce((n, w) => n + w.count, 0), 4);
  for (const w of words) assert.equal(cleanWord(w.word), w.word);
  assert.deepEqual(await b.list(), []);
});

// ── Staging a snapshot onto one word cloud cue (W6, W7, W8) ─────────────────────────────────

const f = (field, title) => ({ field, title, ftype: 'textfield' });
const graphic = (id, name, fields) => ({ id, name, type: 'x', savedAt: '', template: { name, fields } });
const cloud = (id, name = 'House Word Cloud') => graphic(id, name, [f('f0', 'Label'), f('f1', 'Question'), f('f2', 'Words')]);
const board = (id) => graphic(id, 'House Vote', [f('f0', 'Question'), f('f1', 'Options'), f('f2', 'Vote count')]);

/** A fake production store applying a plan as model/shows.ts `stageShowResult` does, with the
 *  word cloud's own remembered graphic. */
function store(initial) {
  const s = { record: structuredClone(initial), refuse: null };
  let n = 0;
  s.stage = (showId, questionId, opts) => {
    const show = structuredClone(s.record);
    const takes = (fields) => opts.valuesFor(fields) !== null;
    const plan = planResultCue(show, questionId, takes, opts.chosen, opts.target);
    if (plan.kind === 'choose') return { shows: [s.record], error: null, outcome: () => ({ plan, cueId: null }) };
    if (s.refuse) return { shows: [s.record], error: s.refuse, outcome: () => ({ plan: null, cueId: null }) };
    const g = show.graphics.find((x) => x.id === plan.graphicId);
    const values = opts.valuesFor(g.template.fields);
    let cue = plan.kind === 'update' ? show.cues.find((c) => c.id === plan.cueId) : undefined;
    if (!cue && opts.adopt) cue = show.cues.find((c) => c.id === opts.adopt);
    if (cue) cue.values = { ...cue.values, ...values };
    else {
      cue = { id: `cue-${++n}`, sourceId: g.id, label: opts.label, values };
      show.cues.push(cue);
    }
    show.resultCues = { ...readResultCues(show.resultCues), [questionId]: cue.id };
    if (opts.chosen && show.graphics.some((x) => x.id === opts.chosen && takes(x.template.fields))) show[opts.target ?? 'resultTarget'] = opts.chosen;
    s.record = show;
    const id = cue.id;
    return { shows: [show], error: null, outcome: () => ({ plan, cueId: id }) };
  };
  s.deps = { stage: s.stage, commit: async () => null, setShows: () => {}, reread: () => [s.record] };
  return s;
}

const input = (counts, extra = {}) => ({ questionId: 'q-word', question: 'One word?', counts, label: 'Words: One word?', ...extra });

test('a word cloud takes Question and Words; it is neither a vote board nor a message destination', () => {
  const fields = cloud('g').template.fields;
  assert.deepEqual(wordCloudValues(fields, 'One word?', countWords(['Fun', 'fun', 'Loud'])), { f1: 'One word?', f2: 'Fun | 2\nLoud | 1' });
  assert.equal(wordCloudValues(board('b').template.fields, 'Q', []), null);
  assert.equal(pollFieldMap(fields), null);
  assert.equal(messageFields(fields), null);
  assert.deepEqual(WORD_CLOUDS.map((w) => w.id), ['wc01']);
});

test('the first press asks; a pick adds one cue and is remembered; a second press updates that cue with a new snapshot (W7)', async () => {
  const s = store({ id: 's', graphics: [board('g-vote'), cloud('g-cloud')], cues: [] });
  let out = await stageWords(s.record, input(countWords(['Fun'])), s.deps);
  assert.equal(out.ok, false);
  assert.equal(out.choose, true);
  assert.equal(s.record.cues.length, 0);
  assert.deepEqual(wordDestinations(s.record).map((d) => d.graphicId), ['g-cloud']);

  out = await stageWords(s.record, input(countWords(['Fun', 'Loud', 'Fun']), { chosen: 'g-cloud' }), s.deps);
  assert.equal(out.ok, true);
  assert.equal(out.kind, 'added');
  assert.equal(s.record.wordTarget, 'g-cloud');
  assert.equal(s.record.resultTarget, undefined, 'a word cloud is not remembered as a vote’s result graphic');
  assert.deepEqual(s.record.cues[0].values, { f1: 'One word?', f2: 'Fun | 2\nLoud | 1' });
  assert.deepEqual(wordDestinationOf(s.record, 'q-word'), { graphicId: 'g-cloud', name: 'House Word Cloud' });

  // A snapshot: later words reach the cue only on the next press, onto the same cue.
  out = await stageWords(s.record, input(countWords(['Fun', 'Loud', 'Fun', 'Loud', 'Loud', 'Rude'], [wordKey('rude')])), s.deps);
  assert.equal(out.kind, 'updated');
  assert.equal(s.record.cues.length, 1);
  assert.equal(s.record.cues[0].values.f2, 'Loud | 3\nFun | 2');
  assert.match(out.message, /Updated the word cloud cue on “House Word Cloud” with 2 words/);

  // A deleted cue gets a new one, and the note says why (S3).
  s.record.cues = [];
  out = await stageWords(s.record, input(countWords(['Fun'])), s.deps);
  assert.equal(out.kind, 'added');
  assert.match(out.message, /deleted, so this is a new one/);
});

test('a refused write says so and records nothing (S6)', async () => {
  const s = store({ id: 's', graphics: [cloud('g-cloud')], cues: [], wordTarget: 'g-cloud' });
  s.refuse = 'storage is full';
  const out = await stageWords(s.record, input(countWords(['Fun'])), s.deps);
  assert.equal(out.ok, false);
  assert.match(out.message, /No word cloud was written: storage is full/);
  assert.equal(s.record.cues.length, 0);
});

test('staging cannot reach an output: it imports nothing that sends (W8)', async () => {
  for (const file of ['src/control/wordStaging.ts', 'src/model/wordCloud.ts']) {
    const src = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    const imports = [...src.matchAll(/^import[^;]*from '([^']+)'/gm)].map((m) => m[1]);
    for (const spec of imports) assert.doesNotMatch(spec, /graphicVerbs|hostedControl|playoutSession|serverVerbs|bridge|output/i, `${file} imports ${spec}`);
  }
});

// ── W11: the record a write lands on decides which words are hidden ─────────────────────────

const wordShow = (hidden, words) => ({
  id: 's',
  name: 'Show',
  graphics: [cloud('g-cloud'), board('g-vote')],
  questions: [{ id: 'q-word', type: 'word', text: 'One word?', ...(hidden.length ? { hidden } : {}) }],
  resultCues: { 'q-word': 'c-mapped' },
  cues: [
    { id: 'c-mapped', sourceId: 'g-cloud', label: 'Words: One word?', values: { f0: 'YOUR WORDS', f1: 'One word?', f2: words } },
    // Left behind by Change, or duplicated: it carries the same question's words.
    { id: 'c-moved', sourceId: 'g-cloud', label: 'Words: One word?', values: { f0: 'YOUR WORDS', f1: 'One word?', f2: words } },
    // Another question's cloud and a vote board are not this question's.
    { id: 'c-other', sourceId: 'g-cloud', label: 'Words: Other', values: { f0: 'YOUR WORDS', f1: 'Something else?', f2: words } },
    { id: 'c-vote', sourceId: 'g-vote', label: 'Vote', values: { f0: 'One word?', f1: 'Rude | 3' } },
  ],
});

test('every cue carrying a question\'s words loses its hidden words; nothing else changes (W6, W11)', () => {
  const show = wordShow(['rude'], 'Fun | 4\nRude | 3\nLoud | 1');
  assert.equal(scrubHiddenWords(show), true);
  const byId = Object.fromEntries(show.cues.map((c) => [c.id, c.values]));
  assert.equal(byId['c-mapped'].f2, 'Fun | 4\nLoud | 1');
  assert.equal(byId['c-moved'].f2, 'Fun | 4\nLoud | 1');
  assert.equal(byId['c-other'].f2, 'Fun | 4\nRude | 3\nLoud | 1');
  assert.deepEqual(byId['c-vote'], { f0: 'One word?', f1: 'Rude | 3' });
  assert.equal(byId['c-mapped'].f1, 'One word?');
  assert.equal(scrubHiddenWords(show), false, 'a second pass changes nothing');
  assert.equal(scrubHiddenWords(wordShow([], 'Rude | 3')), false);
});

test('a team merge never keeps a hidden word on a cue, whichever side hid it (W11)', () => {
  // Base: Rude on the cue, nothing hidden. Ours hides Rude (and took it off the cue); theirs pressed
  // again with a stale list and saved first, so their cue still carries Rude and wins the cue.
  const base = wordShow([], 'Fun | 4\nRude | 3');
  const ours = wordShow(['rude'], 'Fun | 4');
  const theirs = wordShow([], 'Fun | 5\nRude | 3');
  const { doc } = mergeTeamShow(base, ours, theirs, '2026-11-10T00:00:00.000Z');
  assert.deepEqual(readQuestions(doc.questions)[0].hidden, ['rude']);
  for (const id of ['c-mapped', 'c-moved']) assert.doesNotMatch(doc.cues.find((c) => c.id === id).values.f2, /Rude/, id);
});
