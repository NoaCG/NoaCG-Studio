// guards: src/model/publishedRecord.ts, src/model/contentHash.ts
//
// "UNPUBLISHED CHANGES" IS JUDGED BY CONTENT (docs/work-specs/studio-day-playout AC-5, D5; issue
// #762). A cue changed and changed back used to keep the production page amber, because the record
// was compared by timestamp and changing it back is itself a write. The record's digest at publish
// is now what it is compared with. Pure, run here in Node.

import test from 'node:test';
import assert from 'node:assert/strict';

const { publishedRecordDigest, legacyRecordDigest, clearRecordDigestCache, recordChangedSincePublish } = await import('../src/model/publishedRecord.ts');

const PUBLISHED_AT = '2026-10-12T10:00:00.000Z';
/** Every write of a pool copy's template stamps a new save time (addGraphicToShow, refreshGraphicCopies). */
const LATER = '2026-10-12T10:04:00.000Z';

function show(over = {}) {
  return {
    id: 'show-1',
    name: 'Friday quiz',
    updatedAt: PUBLISHED_AT,
    graphics: [
      {
        id: 'pool-1',
        name: 'Lower third',
        type: 'lower-third',
        savedAt: '2026-10-11T09:00:00.000Z',
        graphicId: 'lib-1',
        layer: 20,
        template: { name: 'Lower third', html: '<div></div>', css: '', js: '', assets: [], fields: [{ field: 'f0', ftype: 'textfield', title: 'Name', value: '' }] },
      },
    ],
    cues: [{ id: 'cue-1', sourceId: 'pool-1', label: 'Host', values: { f0: 'Ada' } }],
    ...over,
  };
}

/** A record as a publish leaves it: stamped with the digest of what it published. */
function published(record) {
  return { ...record, publishedAt: PUBLISHED_AT, hostedSlug: 'abc', outputSlug: 'out', publishedRecord: publishedRecordDigest(record) };
}

/** A write, as every mutator in model/shows.ts makes one: a fresh object, a later updatedAt. */
function write(record, change, at = '2026-10-12T10:05:00.000Z') {
  const next = structuredClone(record);
  change(next);
  next.updatedAt = at;
  return next;
}

test('a cue changed reads as unpublished, and changed back reads clean again', () => {
  const live = published(show());
  assert.equal(recordChangedSincePublish(live), false);
  const changed = write(live, (s) => { s.cues[0].values.f0 = 'Grace'; });
  assert.equal(recordChangedSincePublish(changed), true);
  const back = write(changed, (s) => { s.cues[0].values.f0 = 'Ada'; }, '2026-10-12T10:06:00.000Z');
  assert.ok(back.updatedAt > back.publishedAt, 'the revert is a later write');
  assert.equal(recordChangedSincePublish(back), false);
});

test('the same revert under the old timestamp rule still read as unpublished (the defect)', () => {
  const legacy = published(show());
  delete legacy.publishedRecord;
  const back = write(write(legacy, (s) => { s.cues[0].label = 'Guest'; }), (s) => { s.cues[0].label = 'Host'; }, '2026-10-12T10:06:00.000Z');
  // A record published before digests existed keeps the old reading until its next publish.
  assert.equal(recordChangedSincePublish(back), true);
  assert.equal(recordChangedSincePublish(legacy), false);
});

test('a note added and removed again reads clean (the editor deletes an emptied note)', () => {
  const live = published(show());
  const noted = write(live, (s) => { s.cues[0].note = 'Look left'; });
  assert.equal(recordChangedSincePublish(noted), true);
  assert.equal(recordChangedSincePublish(write(noted, (s) => { delete s.cues[0].note; })), false);
});

test('key order does not count: a record read back from the server digests the same', () => {
  const record = show();
  const reordered = Object.fromEntries(Object.entries(structuredClone(record)).reverse());
  reordered.cues = reordered.cues.map((c) => Object.fromEntries(Object.entries(c).reverse()));
  assert.equal(publishedRecordDigest(reordered), publishedRecordDigest(record));
});

test('what a publish writes back, and bookkeeping, never reads as a change', () => {
  const live = published(show());
  const after = write(live, (s) => {
    s.joinSlug = 'friday-quiz';
    s.presenterSlug = 'p1';
    s.outputOpenedAt = '2026-10-12T10:01:00.000Z';
    s.hostedSlug = 'other';
  });
  assert.equal(recordChangedSincePublish(after), false);
});

test('the question list never reads as a change: it reaches phones through Go live, not a publish', () => {
  // docs/work-specs/interaction/spec.md: writing questions during a show must not turn the
  // production page amber and ask for a publish that would send nothing new.
  const live = published(show());
  const after = write(live, (s) => {
    s.questions = [{ id: 'q1', type: 'open', text: 'Ask the coach' }];
  });
  assert.equal(recordChangedSincePublish(after), false);
});

test('re-adding the same design does not count; what the publish reads from the pool does', () => {
  const live = published(show());
  // addGraphicToShow replaces by name with a fresh save time and a fresh copy of the template.
  assert.equal(recordChangedSincePublish(write(live, (s) => { s.graphics[0].savedAt = '2026-10-12T10:03:00.000Z'; })), false);
  // The render is compared by content elsewhere (usePublishDrift); its fields feed the hosted panel.
  assert.equal(recordChangedSincePublish(write(live, (s) => { s.graphics[0].template.fields[0].title = 'Guest'; s.graphics[0].savedAt = LATER; })), true);
  assert.equal(recordChangedSincePublish(write(live, (s) => { s.graphics[0].layer = 21; })), true);
  assert.equal(recordChangedSincePublish(write(live, (s) => { delete s.graphics[0].graphicId; })), true);
  assert.equal(recordChangedSincePublish(write(live, (s) => { s.name = 'Saturday quiz'; })), true);
  // A linked graphic's copy is what a teammate without its library record would publish.
  assert.equal(recordChangedSincePublish(write(live, (s) => { s.graphics[0].template.html = '<p></p>'; s.graphics[0].savedAt = LATER; })), true);
  // An unlinked graphic's copy is what publishes too (live-publishing W2): its template counts.
  const own = published(show({ graphics: [{ ...show().graphics[0], graphicId: undefined }] }));
  assert.equal(recordChangedSincePublish(write(own, (s) => { s.graphics[0].template.html = '<p></p>'; s.graphics[0].savedAt = LATER; })), true);
  assert.equal(recordChangedSincePublish(write(live, (s) => { s.cues.push({ id: 'cue-2', sourceId: 'pool-1', label: 'Guest', values: {} }); })), true);
});

test('a production that is not published is never unpublished', () => {
  assert.equal(recordChangedSincePublish(null), false);
  assert.equal(recordChangedSincePublish(write(show(), (s) => { s.name = 'x'; })), false);
});

// live-publishing W2 (designs/G1.md section 1, R11).

test('stamping or adopting a copy whose design is unchanged never reads as a change', () => {
  const live = published(show());
  assert.equal(recordChangedSincePublish(write(live, (s) => { s.graphics[0].designAt = s.graphics[0].savedAt; })), false);
  const adopted = '2026-10-12T10:07:00.000Z';
  assert.equal(recordChangedSincePublish(write(live, (s) => { s.graphics[0].savedAt = adopted; s.graphics[0].designAt = adopted; })), false);
  assert.ok(live.publishedRecord.startsWith('2:'), 'the new digest carries its format tag');
});

test('an untagged digest is read by the formula it was written with, until the next publish', () => {
  // A production holding an unlinked copy, published by a build before W2: its stored digest left
  // the unlinked template out. Under the new formula it would differ with no edit at all.
  const record = show({ graphics: [{ ...show().graphics[0], graphicId: undefined }] });
  const old = { ...record, publishedAt: PUBLISHED_AT, hostedSlug: 'abc', outputSlug: 'out', publishedRecord: legacyRecordDigest(record) };
  assert.notEqual(old.publishedRecord, publishedRecordDigest(record), 'the formulas differ for an unlinked copy');
  assert.equal(recordChangedSincePublish(old), false, 'no edit reads as no change');
  assert.equal(recordChangedSincePublish(write(old, (s) => { s.cues[0].values.f0 = 'Grace'; })), true);
  // A stamp added by the new build on such a record is no change either.
  assert.equal(recordChangedSincePublish(write(old, (s) => { s.graphics[0].designAt = s.graphics[0].savedAt; })), false);
});

test('a picture graphic renamed in place, published, then read on a fresh page, reads as unchanged', () => {
  const record = show({ graphics: [{ ...show().graphics[0], graphicId: undefined, name: 'Picture', template: { ...show().graphics[0].template, name: 'Picture' } }] });
  // Digested before the rename, so the per-template cache holds the hash taken under the old name.
  publishedRecordDigest(record);
  const renamed = write(record, (s) => { s.graphics[0].name = 'Picture 2'; s.graphics[0].template.name = 'Picture 2'; });
  const live = published(renamed);
  clearRecordDigestCache();
  assert.equal(recordChangedSincePublish(structuredClone(live)), false);
});
