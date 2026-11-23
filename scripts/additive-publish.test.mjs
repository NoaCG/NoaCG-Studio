// guards: src/control/additivePublish.ts
//
// NEW GRAPHICS WITHOUT A PUBLISH (docs/work-specs/live-production-reliability/spec.md P2, AC-2).
// A graphic added to a published production goes out alone: the stored publication plus the new
// graphics, their sounds, their panel entries and their cues. Nothing already published moves: not
// a graphic's digest, not a cue, not a setting. Anything the plan cannot prove additive writes
// nothing and says why. The scheduler runs one attempt at a time, shortly after the save.

import test from 'node:test';
import assert from 'node:assert/strict';
import './lib/tsResolve.mjs';

const {
  newGraphicNames, planAdditive, mergeCues, notOnOutputsWhy, createAdditivePublisher,
  UNREADABLE, TOUCHES_PUBLISHED, BIGGER_STAGE, IN_SCENE, SETTLE_MS, WAIT_MS,
} = await import('../src/control/additivePublish.ts');
const { graphicDigest, stampPayload } = await import('../src/control/payloadVersion.ts');

const stage = { width: 1920, height: 1080 };
const spec = (key, css = '.a{}', over = {}) => ({ key, html: `<div>${key}</div>`, css, js: '', assets: [], resolution: stage, fps: 50, layer: 20, ...over });
const cue = (id, graphic, over = {}) => ({ id, graphic, cueKind: 'graphic', label: id, values: {}, ...over });

/** A stored publication, as a full publish wrote it: v5, built from saved revision 7. */
async function stored() {
  const graphics = [spec('Hairline'), spec('Scorebug', '.b{}')];
  const ver = { ...(await stampPayload({ resolution: stage, graphics }, { n: 4, at: '', h: 'x', g: {} }, new Date('2026-11-23T19:00:00Z'), { Hairline: '2026-11-23T18:00:00Z', Scorebug: '2026-11-23T18:00:00Z' })), r: 7, c: 'content' };
  const output = {
    v: 1,
    resolution: { ...stage, label: '1080p' },
    graphics,
    cues: [cue('c1', 'Hairline'), cue('c2', 'Scorebug', { next: 'c1' })],
    playoutCues: [{ id: 's1', label: 'Clip', kind: 'media', name: 'CLIP', layer: 10 }],
    scenes: [{ id: 'scene-a', name: 'Studio', graphics: ['Scorebug'] }],
    outputSetup: { browser: true },
    ver,
  };
  const panel = [{ name: 'Hairline', fields: [], images: [], entries: [], dataRows: [] }, { name: 'Scorebug', fields: [], images: [], entries: [], dataRows: [] }];
  return { output: JSON.parse(JSON.stringify(output)), panel: JSON.parse(JSON.stringify(panel)) };
}

async function added(name, over = {}) {
  const s = spec(name, '.join{}', over.spec);
  return { name, spec: s, digest: over.digest ?? (await graphicDigest(s)), edited: '2026-11-23T20:00:00Z', panel: { name, fields: [], images: [], entries: [], dataRows: [] }, inScene: over.inScene ?? false };
}

test('the new graphics are the pool names the published stamp does not name, in pool order', () => {
  assert.deepEqual(newGraphicNames(['Hairline', 'Join', 'Scorebug', 'Results'], { Hairline: 'a', Scorebug: 'b' }), ['Join', 'Results']);
  assert.deepEqual(newGraphicNames(['Hairline'], { Hairline: 'a' }), []);
});

test('an additive publication adds only the new graphic, its sound, its panel entry and its cues; everything published stays exactly as published', async () => {
  const before = await stored();
  const join = await added('Join', { spec: { assets: [{ path: 'sfx.mp3', data: 'x', audio: { hash: 'h1', name: 'sfx' } }] } });
  // The saved rundown: a new cue on the new graphic, a new cue on a published graphic, and the
  // published Hairline cue edited (its label) since the publish.
  const saved = [cue('c1', 'Hairline', { label: 'edited since' }), cue('j1', 'Join', { next: 'c9' }), cue('c9', 'Hairline'), cue('c2', 'Scorebug', { next: 'c1' })];
  const plan = await planAdditive({ ...before, added: [join], cues: saved, now: new Date('2026-11-23T21:00:00Z') });
  assert.equal(plan.kind, 'publish');
  const { output, panel, ver, base } = plan;
  // Every published graphic, byte for byte, with the digest it was published with.
  assert.deepEqual(output.graphics.slice(0, 2), before.output.graphics);
  for (const g of output.graphics.slice(0, 2)) assert.equal(await graphicDigest(g), before.output.ver.g[g.key]);
  assert.equal(output.graphics[2], join.spec);
  assert.deepEqual(ver.g, { ...before.output.ver.g, Join: join.digest });
  assert.equal(ver.n, 6, 'the next number over the stamp read');
  assert.equal(base.n, 5);
  assert.notEqual(ver.h, before.output.ver.h);
  assert.equal(ver.r, 7, 'still the saved revision whose content it shows');
  assert.equal(ver.c, undefined, 'never taken for a whole revision by a later automatic publish');
  assert.deepEqual(ver.t, { Hairline: '2026-11-23T18:00:00Z', Scorebug: '2026-11-23T18:00:00Z', Join: '2026-11-23T20:00:00Z' });
  assert.deepEqual(output.ver, ver);
  // Cues: the published ones as published (the edit and the new cue on Hairline wait for Publish
  // changes), the Join cue after its saved predecessor, its `next` dropped (c9 is not published).
  assert.deepEqual(output.cues.map((c) => c.id), ['c1', 'j1', 'c2']);
  assert.equal(output.cues[0].label, 'c1');
  assert.equal(output.cues[1].next, undefined);
  assert.equal(output.cues[2].next, 'c1');
  // Settings, server cues, scenes and the stage as stored.
  for (const key of ['playoutCues', 'scenes', 'outputSetup', 'resolution']) assert.deepEqual(output[key], before.output[key], key);
  assert.equal(output.v, 2);
  assert.deepEqual(output.soundAssets, [{ hash: 'h1', name: 'sfx' }]);
  assert.deepEqual(panel.map((p) => p.name), ['Hairline', 'Scorebug', 'Join']);
  assert.deepEqual(panel.slice(0, 2), before.panel);
});

test('it is idempotent: the publication it wrote, read again, has nothing to add', async () => {
  const before = await stored();
  const join = await added('Join');
  const first = await planAdditive({ ...before, added: [join], cues: [cue('j1', 'Join')] });
  assert.equal(first.kind, 'publish');
  const again = await planAdditive({ output: JSON.parse(JSON.stringify(first.output)), panel: first.panel, added: [join], cues: [cue('j1', 'Join')] });
  assert.equal(again.kind, 'nothing');
  assert.equal((await planAdditive({ ...before, added: [], cues: [] })).kind, 'nothing');
});

test('a stored publication that does not read back to its own stamp writes nothing', async () => {
  const join = await added('Join');
  const refused = async (mutate) => {
    const before = await stored();
    mutate(before.output);
    return planAdditive({ ...before, added: [join], cues: [] });
  };
  assert.deepEqual(await refused((o) => { o.graphics[0].css = '.changed{}'; }), { kind: 'refused', reason: UNREADABLE });
  assert.deepEqual(await refused((o) => { delete o.ver; }), { kind: 'refused', reason: UNREADABLE });
  assert.deepEqual(await refused((o) => { o.graphics.pop(); }), { kind: 'refused', reason: UNREADABLE }, 'the stamp names a graphic the payload lacks');
  assert.deepEqual(await refused((o) => { o.graphics.push(spec('Stray')); }), { kind: 'refused', reason: UNREADABLE }, 'the payload holds a graphic the stamp does not name');
  assert.deepEqual(await planAdditive({ output: null, panel: null, added: [join], cues: [] }), { kind: 'refused', reason: UNREADABLE });
});

test('a new graphic that would change a published one, needs a bigger stage or sits in an OBS scene is not added', async () => {
  const before = await stored();
  // The digest a full publish would write differs from the spec added: the look's face would move to it.
  assert.deepEqual(await planAdditive({ ...before, added: [await added('Join', { digest: 'other' })], cues: [] }), { kind: 'refused', reason: TOUCHES_PUBLISHED });
  assert.deepEqual(await planAdditive({ ...before, added: [await added('Join', { spec: { resolution: { width: 3840, height: 2160 } } })], cues: [] }), { kind: 'refused', reason: BIGGER_STAGE });
  assert.deepEqual(await planAdditive({ ...before, added: [await added('Join', { inScene: true })], cues: [] }), { kind: 'refused', reason: IN_SCENE });
  // One refused graphic holds the others back: nothing is written.
  assert.equal((await planAdditive({ ...before, added: [await added('Join'), await added('Results', { inScene: true })], cues: [] })).kind, 'refused');
});

test('new cues go after the nearest earlier published cue, or first', () => {
  const stored = [cue('a', 'X'), cue('b', 'Y')];
  const saved = [cue('n0', 'N'), cue('a', 'X'), cue('n1', 'N'), cue('n2', 'N'), cue('e', 'X'), cue('b', 'Y'), cue('n3', 'N')];
  assert.deepEqual(mergeCues(stored, saved, new Set(['N'])).map((c) => c.id), ['n0', 'a', 'n1', 'n2', 'b', 'n3']);
  assert.deepEqual(mergeCues(stored, [cue('a', 'X', { label: 'new' })], new Set(['N']))[0].label, 'a', 'a published cue is never rewritten');
});

test('the words on a cue and at its Take say what the graphic waits for', () => {
  assert.equal(notOnOutputsWhy({ refusal: null }), 'It is being added to the outputs now.');
  assert.equal(notOnOutputsWhy({ refusal: IN_SCENE }), 'It is not added by itself: it is in an OBS scene. Publish changes to play it.');
  assert.equal(notOnOutputsWhy(null), 'Publish changes to play it.');
});

// ── The scheduler ───────────────────────────────────────────────────────────────────────────────

function world() {
  let now = 0;
  let timers = [];
  const w = {
    busy: false,
    attempts: 0,
    inFlight: 0,
    maxInFlight: 0,
    answers: [],
    views: [],
    pending: [],
    now: () => now,
    io: {
      setTimer(ms, run) {
        const t = { at: now + ms, run, live: true };
        timers.push(t);
        return () => { t.live = false; };
      },
      busy: () => w.busy,
      attempt: () => {
        w.attempts += 1;
        w.inFlight += 1;
        w.maxInFlight = Math.max(w.maxInFlight, w.inFlight);
        return new Promise((resolve) => w.pending.push((o) => { w.inFlight -= 1; resolve(o); }));
      },
      changed: (v) => w.views.push(v),
    },
    async answer(outcome) {
      w.pending.shift()(outcome);
      await settle();
    },
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        timers = timers.filter((t) => t.live);
        const next = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!next) break;
        now = next.at;
        next.live = false;
        next.run();
        await settle();
      }
      now = end;
      await settle();
    },
  };
  return w;
}
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

test('one attempt runs shortly after the new graphics are saved, never two at once, and a change during it is read again', async () => {
  const w = world();
  const p = createAdditivePublisher(w.io);
  p.want('Join@1');
  await w.advance(SETTLE_MS - 1);
  assert.equal(w.attempts, 0, 'not before the save settles');
  await w.advance(1);
  assert.equal(w.attempts, 1);
  assert.equal(p.view().running, true);
  p.want('Join@1\nResults@1');
  await w.advance(SETTLE_MS * 3);
  assert.equal(w.maxInFlight, 1, 'never two at once');
  await w.answer({ kind: 'published' });
  await w.advance(SETTLE_MS);
  assert.equal(w.attempts, 2, 'the newer set is attempted afresh');
  await w.answer({ kind: 'published' });
  assert.deepEqual(p.view(), { running: false, refusal: null });
  p.want(null);
  await w.advance(60_000);
  assert.equal(w.attempts, 2);
});

test('it waits while another publish runs, and for a save on its way', async () => {
  const w = world();
  const p = createAdditivePublisher(w.io);
  w.busy = true;
  p.want('Join@1');
  await w.advance(SETTLE_MS + WAIT_MS * 3);
  assert.equal(w.attempts, 0, 'never while a press or automatic publish runs');
  w.busy = false;
  await w.advance(WAIT_MS);
  assert.equal(w.attempts, 1);
  await w.answer({ kind: 'wait' });
  await w.advance(WAIT_MS);
  assert.equal(w.attempts, 2);
});

test('a refusal holds until the new graphics change; a transient failure retries with a backoff', async () => {
  const w = world();
  const p = createAdditivePublisher(w.io);
  p.want('Join@1');
  await w.advance(SETTLE_MS);
  await w.answer({ kind: 'refused', reason: IN_SCENE });
  assert.deepEqual(p.view(), { running: false, refusal: IN_SCENE });
  await w.advance(10 * 60_000);
  assert.equal(w.attempts, 1, 'held');
  p.want('Join@2');
  assert.equal(p.view().refusal, null, 'a new save is a new attempt');
  await w.advance(SETTLE_MS);
  assert.equal(w.attempts, 2);
  await w.answer({ kind: 'transient', reason: 'no answer' });
  await w.advance(1_999);
  assert.equal(w.attempts, 2);
  await w.advance(1);
  assert.equal(w.attempts, 3, 'after 2 s');
  await w.answer({ kind: 'transient', reason: 'no answer' });
  await w.advance(4_000);
  assert.equal(w.attempts, 4, 'then 4 s');
  assert.equal(p.view().refusal, null, 'two failures are not news yet');
  await w.answer({ kind: 'transient', reason: 'the server did not answer' });
  assert.equal(p.view().refusal, 'the server did not answer', 'a third says why, and is still retried');
  await w.advance(8_000);
  assert.equal(w.attempts, 5);
  await w.answer({ kind: 'gone' });
  p.want('Other@1');
  await w.advance(60_000);
  assert.equal(w.attempts, 5, 'stopped once the production is no longer published');
});
