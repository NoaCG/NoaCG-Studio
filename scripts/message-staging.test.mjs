// guards: src/control/messageStaging.ts
// guards: src/audience/localAudience.ts
//
// PREPARING A MESSAGE (docs/work-specs/data-sources/spec.md C0; audience-flow AC-1, AC-2, AC-6,
// AC-8), run in Node against fake stores. What is pinned: a message goes only where it fits
// (a scoreboard-only pool has no destination, so the cards are offered; a vote board is never
// one; a bound body or name field is refused; nothing is picked without a choice); the cue gets
// the broadcast name and body by field title and nothing else (Source and Reference never reach
// a field); one press makes one cue, a used message needs "Prepare again", and a refused save
// marks nothing used. The refusal of a later binding inside `setFieldBinding` and
// `setFieldBindings` runs in the browser (e2e/production-audience.spec.ts): model/shows.ts is not
// importable in Node (production-page spec §5.2). The last test reads the audience backend
// interface and finds no method that could air anything.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const {
  MESSAGE_CARDS,
  destinationRefusal,
  messageDestinations,
  messageFields,
  messageValues,
  rememberedDestination,
  stageMessage,
} = await import('../src/control/messageStaging.ts');

const f = (field, title) => ({ field, title, ftype: 'textfield' });
const graphic = (id, name, fields) => ({ id, name, type: 'x', savedAt: '', template: { name, fields } });

const scoreboard = graphic('g-score', 'Scoreboard', [f('f0', 'Team A'), f('f1', 'Team B'), f('f2', 'Score A'), f('f3', 'Score B')]);
const qa = graphic('g-qa', 'House Q&A', [f('f0', 'Label'), f('f1', 'Question'), f('f2', 'Answer'), f('f3', 'Asked by'), f('f4', 'Source')]);
const vote = graphic('g-vote', 'House Vote', [f('f0', 'Question'), f('f1', 'Options'), f('f2', 'Vote count')]);
const chat = graphic('g-chat', 'Chat card', [f('f0', 'Handle'), f('f1', 'Comment')]);

const show = (graphics, extra = {}) => ({ id: 'show', name: 'Show', graphics, cues: [], ...extra });

test('a scoreboard-only pool has no destination, and MESSAGE_CARDS names the four Q&A cards (#1313)', () => {
  const s = show([scoreboard]);
  assert.deepEqual(messageDestinations(s), []);
  assert.equal(messageFields(scoreboard.template.fields), null);
  assert.match(destinationRefusal(s, 'g-score'), /no message field/);
  assert.deepEqual([...MESSAGE_CARDS], ['House Q&A', 'Volt Q&A', 'Frost Q&A', 'Clean Q&A']);
});

test('a vote board is never a destination, even though its Question answers to a message title', () => {
  const s = show([vote]);
  assert.equal(messageFields(vote.template.fields), null);
  assert.deepEqual(messageDestinations(s), []);
  assert.deepEqual(messageDestinations(show([vote, qa])).map((d) => d.graphicId), ['g-qa']);
});

test('a graphic whose body or name field is bound is refused, with the separate-card offer', () => {
  const body = show([qa], { bindings: { 'House Q&A': { f1: 'feed.question' } } });
  assert.deepEqual(messageDestinations(body), []);
  assert.match(destinationRefusal(body, 'g-qa'), /separate card/);
  const name = show([qa], { bindings: { 'House Q&A': { f3: 'feed.name' } } });
  assert.deepEqual(messageDestinations(name), []);
  // A binding on an unrelated field (the Label) leaves it a destination.
  const label = show([qa], { bindings: { 'House Q&A': { f0: 'show.title' } } });
  assert.deepEqual(messageDestinations(label).map((d) => d.graphicId), ['g-qa']);
});

test('nothing is picked without a choice: one compatible graphic is still not remembered', () => {
  assert.equal(rememberedDestination(show([scoreboard, qa])), null);
  assert.equal(rememberedDestination(show([qa], { messageTarget: 'g-qa' })).graphicId, 'g-qa');
  // A remembered graphic that became incompatible is asked again, never replaced by a guess.
  assert.equal(rememberedDestination(show([qa, chat], { messageTarget: 'g-qa', bindings: { 'House Q&A': { f1: 'x' } } })), null);
});

test('values go by title: body and name only; Source and Reference never reach a field', () => {
  const [dest] = messageDestinations(show([qa]));
  const values = messageValues(dest, { author: 'Marcus', body: 'What next?' });
  assert.deepEqual(values, { f1: 'What next?', f3: 'Marcus' });
  assert.equal('f4' in values, false, "the card's own Source field is never written");
  const [onChat] = messageDestinations(show([chat]));
  assert.deepEqual(messageValues(onChat, { author: 'kim', body: 'hello' }), { f1: 'hello', f0: 'kim' });
});

/** Fake stores: the record, every write, and a commit that can be made to refuse. */
function harness(s, { refuse = false } = {}) {
  const state = { show: structuredClone(s), used: [], commits: 0, refuse };
  let n = 0;
  const deps = {
    addCue: (showId, sourceId, seed) => {
      const cue = { id: `c${++n}`, sourceId, label: seed.label, values: { ...seed.values }, stagedFrom: seed.stagedFrom };
      if (!state.refuse) state.show.cues.push(cue);
      return { shows: [state.show], cueId: cue.id, error: null };
    },
    updateCue: (showId, cueId, patch) => {
      const cue = state.show.cues.find((c) => c.id === cueId);
      Object.assign(cue.values, patch.values);
      cue.stagedFrom = patch.stagedFrom;
      if (patch.label) cue.label = patch.label;
      return { shows: [state.show], error: null };
    },
    commit: async () => {
      state.commits += 1;
      await new Promise((r) => setTimeout(r, 5));
      return state.refuse ? 'The browser refused the save.' : null;
    },
    markUsed: async (id) => {
      state.used.push(id);
    },
    setShows: () => {},
    now: () => '2026-10-20T12:00:00.000Z',
  };
  return { state, deps };
}

const candidate = (id, extra = {}) => ({ id, usedAt: null, air: { author: 'Sam', body: 'How did you prepare?' }, ...extra });

test('one press makes one cue: a double press while saving is refused, and the cue carries its receipt', async () => {
  const { state, deps } = harness(show([qa], { messageTarget: 'g-qa' }));
  const [first, second] = await Promise.all([
    stageMessage(state.show, candidate('m1'), { graphicId: 'g-qa' }, deps),
    stageMessage(state.show, candidate('m1'), { graphicId: 'g-qa' }, deps),
  ]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'pending');
  assert.equal(state.show.cues.length, 1);
  assert.deepEqual(state.show.cues[0].values, { f1: 'How did you prepare?', f3: 'Sam' });
  assert.deepEqual(state.show.cues[0].stagedFrom, { candidateId: 'm1', fields: ['f1', 'f3'], at: '2026-10-20T12:00:00.000Z' });
  assert.deepEqual(state.used, ['m1']);
});

test('a used message is refused unless Prepare again asks for the deliberate second cue', async () => {
  const { state, deps } = harness(show([qa]));
  const used = candidate('m2', { usedAt: '2026-10-20T11:00:00.000Z' });
  const refused = await stageMessage(state.show, used, { graphicId: 'g-qa' }, deps);
  assert.equal(refused.reason, 'used');
  assert.equal(state.show.cues.length, 0);
  const again = await stageMessage(state.show, used, { graphicId: 'g-qa', again: true }, deps);
  assert.equal(again.ok, true);
  assert.equal(state.show.cues.length, 1);
});

test('a refused save marks nothing used, and the retry makes exactly one cue', async () => {
  const { state, deps } = harness(show([qa]), { refuse: true });
  const failed = await stageMessage(state.show, candidate('m3'), { graphicId: 'g-qa' }, deps);
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'save');
  assert.deepEqual(state.used, []);
  state.refuse = false;
  const retried = await stageMessage(state.show, candidate('m3'), { graphicId: 'g-qa' }, deps);
  assert.equal(retried.ok, true);
  assert.equal(state.show.cues.length, 1);
  assert.deepEqual(state.used, ['m3']);
});

test('staging refuses a vote board, a scoreboard and a bound card, writing nothing', async () => {
  for (const [s, id] of [
    [show([vote]), 'g-vote'],
    [show([scoreboard]), 'g-score'],
    [show([qa], { bindings: { 'House Q&A': { f1: 'x' } } }), 'g-qa'],
  ]) {
    const { state, deps } = harness(s);
    const result = await stageMessage(state.show, candidate('m4'), { graphicId: id }, deps);
    assert.equal(result.reason, 'refused');
    assert.equal(state.show.cues.length, 0);
    assert.equal(state.commits, 0);
  }
});

test('the cue editor door fills the edited cue in place and keeps its name unless asked', async () => {
  const base = show([qa]);
  base.cues.push({ id: 'existing', sourceId: 'g-qa', label: 'Opening question', values: { f0: 'AUDIENCE Q&A', f1: 'old' } });
  const { state, deps } = harness(base);
  const result = await stageMessage(state.show, candidate('m5'), { graphicId: 'g-qa', cueId: 'existing' }, deps);
  assert.equal(result.ok, true);
  assert.equal(state.show.cues.length, 1);
  assert.equal(state.show.cues[0].label, 'Opening question');
  assert.deepEqual(state.show.cues[0].values, { f0: 'AUDIENCE Q&A', f1: 'How did you prepare?', f3: 'Sam' });
});

test('a refused write is said, and a cue removed meanwhile is refused, marking nothing used', async () => {
  const { state, deps } = harness(show([qa]));
  deps.addCue = () => ({ shows: [state.show], cueId: 'c9', error: 'Account editing is paused.' });
  const refused = await stageMessage(state.show, candidate('m6'), { graphicId: 'g-qa' }, deps);
  assert.equal(refused.reason, 'save');
  assert.match(refused.message, /Account editing is paused/);
  const gone = await stageMessage(state.show, candidate('m6'), { graphicId: 'g-qa', cueId: 'deleted' }, deps);
  assert.equal(gone.reason, 'refused');
  assert.deepEqual(state.used, []);
  assert.equal(state.commits, 0);
});

test('a cue that landed while marking the message used failed is reported ready, and a retry makes no second cue', async () => {
  const { state, deps } = harness(show([qa]));
  deps.markUsed = async () => {
    throw new Error('network');
  };
  const first = await stageMessage(state.show, candidate('m7'), { graphicId: 'g-qa' }, deps);
  assert.equal(first.ok, true);
  assert.match(first.warning, /could not be marked as used: network/);
  const retry = await stageMessage(state.show, candidate('m7'), { graphicId: 'g-qa' }, deps);
  assert.equal(retry.reason, 'used');
  assert.equal(state.show.cues.length, 1);
  const again = await stageMessage(state.show, candidate('m7'), { graphicId: 'g-qa', again: true }, deps);
  assert.equal(again.ok, true);
  assert.equal(state.show.cues.length, 2);
});

// ── The local inbox's stored format (src/audience/localAudience.ts) ──

/** A localStorage stand-in, installed for one test. */
function withStorage(initial) {
  const map = new Map(initial === undefined ? [] : [['spx-gfx-audience-inbox', initial]]);
  globalThis.localStorage = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v) };
  return { raw: () => map.get('spx-gfx-audience-inbox'), restore: () => delete globalThis.localStorage };
}

const local = await import('../src/audience/localAudience.ts');

test('kept messages are stored versioned, damaged rows are skipped, and a newer store is never rewritten', async () => {
  const store = withStorage();
  try {
    const inbox = local.createLocalAudience({ productionName: 'P', showId: 's1' });
    await inbox.addCandidates([{ author: 'Ana', body: 'Kept', source: 'Pasted' }]);
    assert.equal(JSON.parse(store.raw()).v, local.LOCAL_INBOX_VERSION);
    assert.deepEqual((await inbox.list()).map((r) => r.body), ['Kept']);

    // A damaged row is skipped, not handed to the view.
    const saved = JSON.parse(store.raw());
    saved.inbox.s1.push({ id: 'bad', body: 3 });
    withStorage(JSON.stringify(saved));
    assert.deepEqual((await local.createLocalAudience({ productionName: 'P', showId: 's1' }).list()).map((r) => r.body), ['Kept']);

    // A store from a newer build: read where it can be, never overwritten.
    const newer = JSON.stringify({ v: local.LOCAL_INBOX_VERSION + 1, inbox: saved.inbox });
    const later = withStorage(newer);
    const readOnly = local.createLocalAudience({ productionName: 'P', showId: 's1' });
    assert.deepEqual((await readOnly.list()).map((r) => r.body), ['Kept']);
    await assert.rejects(readOnly.addCandidates([{ body: 'More' }]), /refused/);
    assert.equal(later.raw(), newer);
  } finally {
    store.restore();
  }
});

test('publishing moves kept messages into the published inbox once, with their edits and use', async () => {
  const store = withStorage();
  try {
    const inbox = local.createLocalAudience({ productionName: 'P', showId: 's2' });
    const [a] = await inbox.addCandidates([{ author: 'Ana', body: 'First', source: 'Pasted' }]);
    await inbox.addCandidates([{ author: 'Ben', body: 'Second', source: 'Pasted' }]);
    await inbox.update(a.id, { broadcastBody: 'First, tidied', status: 'approved', usedAt: '2026-10-20T12:00:00.000Z' });

    const published = local.createLocalAudience({ productionName: 'P' }); // memory only, as a server
    await local.moveKeptMessages('s2', published);
    await local.moveKeptMessages('s2', published); // a second open adds nothing twice
    const rows = await published.list();
    assert.deepEqual(rows.map((r) => r.body), ['First', 'Second']);
    assert.equal(rows[0].broadcastBody, 'First, tidied');
    assert.equal(rows[0].usedAt, '2026-10-20T12:00:00.000Z');
    assert.equal(rows[0].source, 'Pasted');
    assert.deepEqual(await inbox.list(), [], 'moved rows are forgotten locally');
  } finally {
    store.restore();
  }
});

test('the audience backend interface has no method that airs anything', async () => {
  // AC-10's structural half: the operator surface can list, moderate, add candidates and run
  // the join page's state - and reach neither the command log nor production values.
  const source = await readFile(new URL('../src/audience/audienceTypes.ts', import.meta.url), 'utf8');
  const block = /export interface AudienceBackend \{([\s\S]*?)\n\}/.exec(source);
  assert.ok(block, 'AudienceBackend is where this test expects it');
  const methods = [...block[1].matchAll(/^\s+(\w+)\(/gm)].map((m) => m[1]).sort();
  assert.deepEqual(methods, [
    'addCandidates',
    'closeRound',
    'getState',
    'joinView',
    'list',
    'openRound',
    'rounds',
    'setState',
    'submit',
    'tally',
    'update',
    'vote',
  ]);
  for (const words of ['control_events', 'control_data', 'runVerb', 'addShowCue', 'take(']) {
    assert.equal(block[1].includes(words), false, `the interface names ${words}`);
  }
});
