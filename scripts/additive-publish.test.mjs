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
  UNREADABLE, TOUCHES_PUBLISHED, BIGGER_STAGE, IN_SCENE, GONE, SETTLE_MS, WAIT_MS,
  OTHER_OWNER_SOUNDS, SOUND_NOT_UPLOADED, SOUND_REFUSED, SOUND_NOT_SENT, soundsStayFetchable, uploadSounds, additiveRefusal,
  publishChangesDue, WAITS_SAID, SAVE_WAITING, recordAfterAdd,
} = await import('../src/control/additivePublish.ts');
const { graphicDigest, stampPayload } = await import('../src/control/payloadVersion.ts');
const { publishedRecordDigest } = await import('../src/model/publishedRecord.ts');

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
  const uploaded = [{ hash: 'h1', name: 'sfx', storageKey: 'u1/audio-h1' }];
  const plan = await planAdditive({ ...before, added: [join], cues: saved, sounds: uploaded, uploader: 'u1', now: new Date('2026-11-23T21:00:00Z') });
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
  // The manifest names the uploaded key, as a full publish's does (api/_lib/outputAudio.ts).
  assert.deepEqual(output.soundAssets, uploaded);
  assert.deepEqual(panel.map((p) => p.name), ['Hairline', 'Scorebug', 'Join']);
  assert.deepEqual(panel.slice(0, 2), before.panel);
});

test('the sound manifest stays fetchable: new sounds carry their uploaded key, and sounds another account published are never re-owned (review on #2741)', async () => {
  const before = await stored();
  const sfx = { path: 'sfx.mp3', data: 'x', audio: { hash: 'h1', name: 'sfx' } };
  // publishAudio strips the key from the graphic's own reference: the manifest must not be built
  // from it, or a cold output is refused the sound (403).
  const stripped = await planAdditive({ ...before, added: [await added('Join', { spec: { assets: [sfx] } })], cues: [], uploader: 'u1' });
  assert.deepEqual(stripped, { kind: 'refused', reason: SOUND_NOT_UPLOADED });
  const keyed = await planAdditive({ ...before, added: [await added('Join', { spec: { assets: [sfx] } })], cues: [], sounds: [{ hash: 'h1', name: 'sfx', storageKey: 'u1/audio-h1' }], uploader: 'u1' });
  assert.equal(keyed.output.soundAssets[0].storageKey, 'u1/audio-h1');
  assert.deepEqual(await planAdditive({ ...before, added: [await added('Join', { spec: { assets: [sfx] } })], cues: [], sounds: [{ hash: 'h1', name: 'sfx', storageKey: 'u0/audio-h1' }], uploader: 'u1' }), { kind: 'refused', reason: SOUND_NOT_UPLOADED });
  // A team production whose sounds a teammate published: this write would make this account their
  // owner, so the teammate's keys would stop matching. Left to Publish changes, which uploads all.
  const teammate = await stored();
  teammate.output.v = 2;
  teammate.output.soundAssets = [{ hash: 'h0', name: 'bed', storageKey: 'u0/audio-h0' }];
  assert.deepEqual(await planAdditive({ ...teammate, added: [await added('Join')], cues: [], uploader: 'u1' }), { kind: 'refused', reason: OTHER_OWNER_SOUNDS });
  const own = await planAdditive({ ...teammate, added: [await added('Join')], cues: [], uploader: 'u0' });
  assert.equal(own.kind, 'publish');
  assert.deepEqual(own.output.soundAssets, teammate.output.soundAssets, 'the stored manifest kept as it was');
  // No stored sounds: any account may add a silent graphic.
  assert.equal(soundsStayFetchable(before.output, null), true);
  assert.equal(soundsStayFetchable(teammate.output, null), false);
  assert.equal(soundsStayFetchable({ soundAssets: [{ hash: 'h0', name: 'bed' }] }, 'u0'), false, 'a sound with no key is not fetchable either');
});

test('new sounds are uploaded with the manifest, whose keys the plan carries; a refused add uploads nothing; a refused sound holds, a failed send retries', async () => {
  // As publishAudio does: every reference keyed, the graphics' own keys then stripped.
  const calls = [];
  const publishAudio = async (body) => {
    calls.push(body);
    const clone = JSON.parse(JSON.stringify(body));
    for (const s of clone.soundAssets ?? []) s.storageKey = `u1/audio-${s.hash}`;
    for (const g of clone.graphics) for (const a of g.assets) if (a.audio) delete a.audio.storageKey;
    return clone;
  };
  const sfx = { path: 'sfx.mp3', data: 'x', audio: { hash: 'h1', name: 'sfx' } };
  const join = await added('Join', { spec: { assets: [sfx, { ...sfx, path: 'again.mp3' }] } });
  const up = await uploadSounds([join.spec], publishAudio);
  assert.deepEqual(calls[0].soundAssets, [sfx.audio], 'the manifest goes with the graphics, once per sound');
  assert.deepEqual(up.sounds, [{ hash: 'h1', name: 'sfx', storageKey: 'u1/audio-h1' }]);
  const before = await stored();
  const plan = await planAdditive({ ...before, added: [{ ...join, spec: up.graphics[0] }], cues: [], sounds: up.sounds, uploader: 'u1' });
  assert.equal(plan.output.soundAssets[0].storageKey, 'u1/audio-h1', 'a cold output can fetch it');
  // Silent graphics upload nothing.
  calls.length = 0;
  assert.deepEqual(await uploadSounds([spec('Quiet')], publishAudio), { graphics: [spec('Quiet')], sounds: [] });
  assert.equal(calls.length, 0);
  // Refusals that need no upload are known before it.
  assert.deepEqual(await additiveRefusal(before.output, [await added('Join', { inScene: true })], 'u1'), { kind: 'refused', reason: IN_SCENE });
  assert.equal(await additiveRefusal(before.output, [join], 'u1'), null);
  assert.deepEqual(await additiveRefusal(before.output, [], 'u1'), { kind: 'nothing' });
  // Only a fault of the file itself holds, in this module's words; anything that can clear by itself
  // (storage full, signed out, no answer, a copy not in this browser yet) is tried again.
  const failing = (message) => async () => { throw new Error(message); };
  for (const permanent of ['Sound changed: sfx. Prepare again after replacing it.', 'a file in it is larger than the cloud accepts in one upload']) {
    assert.deepEqual(await uploadSounds([join.spec], failing(permanent)), { kind: 'refused', reason: SOUND_REFUSED }, permanent);
  }
  for (const passing of ['this account is out of cloud storage', 'Sign in to publish sounds.', 'Sound upload failed: timeout', 'Sound unavailable: sfx. Prepare while connected.', 'boom']) {
    assert.deepEqual(await uploadSounds([join.spec], failing(passing)), { kind: 'transient', reason: SOUND_NOT_SENT }, passing);
  }
});

test('a stored payload is hashed once for the check before the upload and the plan after it', async () => {
  const before = await stored();
  const join = await added('Join');
  assert.equal(await additiveRefusal(before.output, [join], 'u1'), null);
  // Changed after the check: the plan trusts the check made on this very object, and a fresh read
  // of the same row is checked again.
  const fresh = JSON.parse(JSON.stringify(before.output));
  fresh.graphics[0].css = '.changed{}';
  assert.deepEqual(await additiveRefusal(fresh, [join], 'u1'), { kind: 'refused', reason: UNREADABLE });
  assert.equal((await planAdditive({ ...before, added: [join], cues: [], uploader: 'u1' })).kind, 'publish');
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

test('Publish changes is due only for what the add cannot send: never for graphics the page adds itself (configured playout-status AC-5, PR #2741)', () => {
  const none = { drift: false, added: false, removed: false, unstamped: false };
  // A graphic added, and this page adds it: no press offered, so none is left disabled and then
  // taken away when the add lands.
  assert.equal(publishChangesDue({ ...none, added: true }, true), false);
  // It does not add it here (no permission, automatic updates, a refusal): the press is due.
  assert.equal(publishChangesDue({ ...none, added: true }, false), true);
  // What only Publish changes sends stays due whatever the add does.
  assert.equal(publishChangesDue({ ...none, added: true, drift: true }, true), true);
  assert.equal(publishChangesDue({ ...none, removed: true }, true), true);
  assert.equal(publishChangesDue({ ...none, unstamped: true }, true), true);
  assert.equal(publishChangesDue(none, false), false);
});

test('once the add lands, the record is the published one only when adding was its only change (the panel then offers nothing)', () => {
  const graphic = (id, name, css = '.a{}') => ({ id, name, type: 'lower-third', savedAt: '2026-11-23T18:00:00Z', template: { name, html: '<div></div>', css, js: '', fields: [], assets: [] } });
  const published = { id: 'p1', name: 'Show', graphics: [graphic('g1', 'Hairline')], cues: [{ id: 'c1', sourceId: 'g1', label: 'Strap', values: {} }] };
  const record = publishedRecordDigest(published);
  const added = { ...published, publishedRecord: record, graphics: [...published.graphics, graphic('g2', 'Join')], cues: [...published.cues, { id: 'j1', sourceId: 'g2', label: 'Join', values: {} }] };
  assert.equal(recordAfterAdd(added, new Set(['Join'])), publishedRecordDigest(added));
  // Anything else changed too (a cue on a published graphic, a design edit): still due.
  const plusCue = { ...added, cues: [...added.cues, { id: 'c2', sourceId: 'g1', label: 'Another', values: {} }] };
  assert.equal(recordAfterAdd(plusCue, new Set(['Join'])), null);
  // A design edit saves the copy again (a new savedAt names its design).
  const edited = { ...added, graphics: [{ ...graphic('g1', 'Hairline', '.b{}'), savedAt: '2026-11-23T20:30:00Z' }, added.graphics[1]] };
  assert.equal(recordAfterAdd(edited, new Set(['Join'])), null);
  assert.equal(recordAfterAdd({ ...added, publishedRecord: undefined }, new Set(['Join'])), null, 'no record digest known');
});

test('the words on a cue and at its Take say what the graphic waits for', () => {
  assert.equal(notOnOutputsWhy({ refusal: null }), 'It is being added to the outputs now.');
  assert.equal(notOnOutputsWhy({ refusal: IN_SCENE }), 'It is in an OBS scene. Publish changes to play it.');
  assert.equal(notOnOutputsWhy({ refusal: SAVE_WAITING }), 'Its save has not reached the server yet. Publish changes to play it.');
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

test('a save that never reaches the server is said after about 20 s, and still waited for', async () => {
  const w = world();
  const p = createAdditivePublisher(w.io);
  p.want('Join@1');
  await w.advance(SETTLE_MS);
  for (let i = 1; i < WAITS_SAID; i++) {
    await w.answer({ kind: 'wait' });
    assert.equal(p.view().refusal, null, `wait ${i}`);
    await w.advance(WAIT_MS);
  }
  await w.answer({ kind: 'wait' });
  assert.equal(p.view().refusal, SAVE_WAITING);
  await w.advance(WAIT_MS);
  assert.equal(w.attempts, WAITS_SAID + 1, 'still waited for');
  await w.answer({ kind: 'published' });
  assert.equal(p.view().refusal, null);
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
  assert.equal(p.view().refusal, IN_SCENE, 'said until the new attempt answers, so Publish changes is not taken away meanwhile');
  await w.advance(SETTLE_MS);
  assert.equal(w.attempts, 2, 'a new save is a new attempt');
  await w.answer({ kind: 'transient', reason: 'no answer' });
  assert.equal(p.view().refusal, IN_SCENE, 'a failure that is not news yet leaves the reason said');
  await w.advance(1_999);
  assert.equal(w.attempts, 2);
  await w.advance(1);
  assert.equal(w.attempts, 3, 'after 2 s');
  await w.answer({ kind: 'transient', reason: 'no answer' });
  await w.advance(4_000);
  assert.equal(w.attempts, 4, 'then 4 s');
  assert.equal(p.view().refusal, IN_SCENE, 'two failures are not news yet');
  await w.answer({ kind: 'transient', reason: 'the server did not answer' });
  assert.equal(p.view().refusal, 'the server did not answer', 'a third says why, and is still retried');
  await w.advance(8_000);
  assert.equal(w.attempts, 5);
  await w.answer({ kind: 'gone' });
  p.want('Other@1');
  await w.advance(60_000);
  assert.equal(w.attempts, 5, 'stopped once the production is no longer published');
  assert.equal(p.view().refusal, GONE, 'and never says it is adding again');
});
