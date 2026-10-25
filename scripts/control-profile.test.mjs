// guards: src/model/profile.ts, supabase/migrations/0058_control_profile.sql
//
// Unit tests for the production CONTROL PROFILE format (src/model/profile.ts,
// docs/CONTROL_PANEL_ANY_GRAPHIC.md §6; AC-4 of docs/work-specs/control-panel-any-graphic).
//
// These run in the BUILD GATE rather than in Playwright because there is no browser in the
// question: bytes in, a profile out, and a list of refusals. The module is TypeScript and imports
// nothing at runtime, which is what makes one `transpileModule` call enough (the `csv.ts` and
// `productionData.ts` pattern) - and is why `profile.ts` must stay dependency-free.
//
// The two readers are tested separately and on purpose. `readShowProfile` DEGRADES (a show
// mid-programme renders what it can); `validateShowProfile` REFUSES (an authoring surface must
// not save a broken profile). A test that confused them would let one of the two quietly become
// the other.
//
// COMBINED CONTROLS were removed on 2026-10-02. The format keeps v1 and a stored `combine` list
// is read without error and ignored; the cases below pin that, so a record written before the
// removal still opens its production.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const source = readFileSync(fileURLToPath(new URL('../src/model/profile.ts', import.meta.url)), 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = await import(`data:text/javascript,${encodeURIComponent(js)}`);
const {
  PROFILE_VERSION,
  emptyProfile,
  profileForPublish,
  readShowProfile,
  readPublishedProfile,
  serializeShowProfile,
  validateShowProfile,
  withGraphicArrange,
  withPinnedGraphic,
  pinnedGraphicsOf,
  profileIsEmpty,
} = mod;

/** The proof case's production (docs/CONTROL_PANEL_ANY_GRAPHIC.md §3): two boards. */
const POOL = {
  controls: {
    'Votes board': ['reveal', 'clear'],
    'Totals board': ['plus_katri', 'plus_mikko', 'new_game'],
  },
};

/** A profile that exercises every presentation key. Written the way an authoring surface would
 *  hand it over. */
function goodProfile() {
  return {
    v: 1,
    arrange: {
      'Totals board': {
        plus_katri: { order: 0, section: 'Points', name: '+1 Katri', pinned: true },
        new_game: { hidden: true },
      },
    },
  };
}

/** A profile as a build from before 2026-10-02 stored it: the arrangement plus a combined control. */
function legacyProfile() {
  return {
    ...goodProfile(),
    combine: [
      {
        id: 'c1',
        name: 'Reveal, then the points',
        steps: [
          { kind: 'event', graphic: 'Votes board', control: 'reveal' },
          { kind: 'event', graphic: 'Totals board', control: 'plus_katri', after: 3, ask: { default: true } },
        ],
      },
    ],
  };
}

/** Every error a validation produced, as `where` strings — what the assertions below read. */
const errorsAt = (findings) => findings.filter((f) => f.level === 'error').map((f) => f.where);
const warningsAt = (findings) => findings.filter((f) => f.level === 'warning').map((f) => f.where);

// ── Reading, serializing, round trips ────────────────────────────────────────────────────────

test('a v1 profile round trips through read and serialize unchanged', () => {
  const read = readShowProfile(goodProfile());
  assert.equal(read.status, 'ok');
  const once = serializeShowProfile(read.profile);
  const twice = serializeShowProfile(readShowProfile(once).profile);
  assert.deepEqual(twice, once);
  assert.deepEqual(Object.keys(once), ['v', 'arrange']);
});

test('a stored profile that still carries Combined controls reads, renders its arrangement and drops the list', () => {
  const read = readShowProfile(legacyProfile());
  assert.equal(read.status, 'ok', 'a legacy profile must not read as read-only or none');
  assert.deepEqual(read.profile, readShowProfile(goodProfile()).profile);
  assert.equal('combine' in read.profile, false);
  assert.deepEqual(readPublishedProfile(legacyProfile()), readPublishedProfile(goodProfile()));
  // The next write is canonical and carries no `combine` key, so the list leaves the record then.
  assert.equal(
    JSON.stringify(serializeShowProfile(legacyProfile())),
    JSON.stringify(serializeShowProfile(goodProfile())),
  );
  // An authoring surface is not told about a list it can neither see nor change.
  assert.deepEqual(validateShowProfile(legacyProfile(), POOL), []);
  // ...and arranging on top of it keeps the arrangement and drops the list.
  const after = withGraphicArrange(legacyProfile(), 'Votes board', { reveal: { pinned: true } });
  assert.deepEqual(Object.keys(after), ['v', 'arrange']);
  assert.deepEqual(after.arrange['Totals board'], serializeShowProfile(goodProfile()).arrange['Totals board']);
});

test('a publish pins the canonical profile, keeps a newer build verbatim, and writes {} for none', () => {
  // A legacy list never reaches `control_shows.profile`, whatever a sync left on the record.
  assert.deepEqual(profileForPublish(legacyProfile()), serializeShowProfile(goodProfile()));
  const future = { v: 2, arrange: {}, conditions: [{ when: 'score > 50' }] };
  assert.equal(profileForPublish(future), future);
  for (const none of [undefined, null, {}, 'garbage']) assert.deepEqual(profileForPublish(none), {});
});

test('serializing is canonical: key order and written defaults cannot change the bytes', () => {
  // The same profile, authored in a different key order and with every default spelled out.
  const spelled = {
    arrange: {
      'Totals board': {
        new_game: { hidden: true, pinned: false },
        plus_katri: { pinned: true, name: '+1 Katri', section: 'Points', order: 0, hidden: false },
      },
    },
    v: 1,
  };
  assert.equal(
    JSON.stringify(serializeShowProfile(readShowProfile(spelled).profile)),
    JSON.stringify(serializeShowProfile(readShowProfile(goodProfile()).profile)),
  );
});

test('an empty profile is one shape, and deleting is not the same as emptying', () => {
  assert.deepEqual(emptyProfile(), { v: PROFILE_VERSION, arrange: {} });
  assert.equal(JSON.stringify(serializeShowProfile(emptyProfile())), '{"v":1,"arrange":{}}');
});

test('a profile from a newer build reads as READ-ONLY and keeps its bytes verbatim', () => {
  // The case the version invariant exists for. Dropping it instead would mean an older build
  // opening a show once quietly erased a profile it simply did not understand.
  const future = { v: 2, arrange: {}, conditions: [{ when: 'score > 50' }] };
  const read = readShowProfile(future);
  assert.equal(read.status, 'read-only');
  assert.equal(read.version, 2);
  assert.deepEqual(read.raw, future);
});

test('garbage reads as no profile and never throws', () => {
  for (const value of [null, undefined, 7, 'profile', [], {}, { v: 'one' }, { v: Number.NaN }]) {
    assert.equal(readShowProfile(value).status, 'none', `${JSON.stringify(value)} should read as none`);
  }
});

test('reading DROPS what it cannot use rather than refusing it', () => {
  const messy = {
    v: 1,
    arrange: {
      'Totals board': {
        plus_katri: { order: 'first', section: '', name: '+1 Katri', hidden: false, when: 'ignored' },
        new_game: {},
      },
      'Gone board': 'not an object',
    },
    combine: 'not even a list',
  };
  const { profile } = readShowProfile(messy);
  // A wrongly typed `order`, an empty `section` and an unknown key all go; the name survives.
  assert.deepEqual(profile, { v: 1, arrange: { 'Totals board': { plus_katri: { name: '+1 Katri' } } } });
});

test('every shape the PUBLISHED column can hand back reads correctly', () => {
  // The read side of `control_shows.profile` (migration 0058). Getting one of these wrong shows
  // up on air and nowhere else, so all four are pinned here rather than left to a surface.
  const pinned = serializeShowProfile(readShowProfile(goodProfile()).profile);
  assert.deepEqual(readPublishedProfile(pinned), pinned);
  // A row published before 0058 has no column at all; one published by a build with no profile
  // carries the `'{}'` default. Both mean "render the generated panel", which is null.
  assert.equal(readPublishedProfile(undefined), null);
  assert.equal(readPublishedProfile({}), null);
  // A profile from a NEWER build degrades to the generated panel rather than to a half-rendered
  // one: a surface may render only a profile it fully understands.
  assert.equal(readPublishedProfile({ v: 2, arrange: {}, conditions: [] }), null);
  // An empty profile is still a profile: it exists and changes nothing.
  assert.deepEqual(readPublishedProfile(emptyProfile()), emptyProfile());
});

// ── Validating ───────────────────────────────────────────────────────────────────────────────

test('a profile that validated clean still validates clean after serializing', () => {
  assert.deepEqual(validateShowProfile(goodProfile(), POOL), []);
  assert.deepEqual(validateShowProfile(serializeShowProfile(readShowProfile(goodProfile()).profile), POOL), []);
});

test('an unknown version validates as one error saying it is read-only, not as a pile of them', () => {
  const findings = validateShowProfile({ v: 2, arrange: { 'Gone board': 'nonsense' } }, POOL);
  assert.deepEqual(errorsAt(findings), ['profile.v']);
  assert.match(findings[0].message, /read-only/);
});

test('something that is not a profile at all is refused once', () => {
  assert.deepEqual(errorsAt(validateShowProfile('a profile', POOL)), ['profile']);
  assert.deepEqual(errorsAt(validateShowProfile({ arrange: {} }, POOL)), ['profile.v']);
});

test('a graphic named after an Object member is a name, not a member', () => {
  // Every key in this format is somebody's typed name, so a bare `map[name]` lookup answers a
  // FUNCTION for a graphic called `constructor`. Measured before the fix: the validator THREW
  // instead of reporting.
  const pool = { controls: { Bug: ['reveal'] } };
  for (const name of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
    const arranged = { v: 1, arrange: { [name]: { reveal: { pinned: true } } } };
    assert.deepEqual(
      warningsAt(validateShowProfile(arranged, pool)),
      [`arrange[${JSON.stringify(name)}]`],
      `an arrangement for "${name}" must warn, not resolve against Object.prototype`,
    );
    // And the same name survives a round trip as an ordinary graphic when it really is one.
    assert.deepEqual(serializeShowProfile(readShowProfile(arranged).profile).arrange, {
      [name]: { reveal: { pinned: true } },
    });
  }
});

test('a damaged version is not blamed on a newer build', () => {
  // The cause is only knowable in one direction, and pointing an operator at a build that does not
  // exist is worse than saying the record is damaged.
  assert.match(validateShowProfile({ v: 2, arrange: {} }, POOL)[0].message, /written by a newer build/);
  for (const v of [0, -1, 1.5]) {
    const message = validateShowProfile({ v, arrange: {} }, POOL)[0].message;
    assert.match(message, /the record is damaged/, `version ${v} should read as damage, not as a newer build`);
    assert.equal(readShowProfile({ v, arrange: {} }).status, 'read-only');
  }
});

// ── Validating: what only WARNS, so a renamed graphic degrades ───────────────────────────────

test('an arrangement pointing at a graphic or control that is gone WARNS, and the profile still reads', () => {
  const profile = goodProfile();
  profile.arrange = {
    'Totals board': { plus_katri: { pinned: true }, declare_winner: { hidden: true } },
    'Scorebug': { reveal: { order: 1 } },
  };
  const findings = validateShowProfile(profile, POOL);
  assert.deepEqual(errorsAt(findings), []);
  // A graphic that is gone warns ONCE, naming the graphic - not once per control under it, which
  // would flood an authoring surface with a list of symptoms of one cause.
  assert.deepEqual(warningsAt(findings), ['arrange["Totals board"].declare_winner', 'arrange["Scorebug"]']);
  // A warning is not a refusal: the production keeps working and the panel falls back to what
  // the machine generates for whatever the entry no longer matches.
  assert.equal(readShowProfile(profile).status, 'ok');
});

test('an arrangement carries only the five presentation keys', () => {
  const profile = goodProfile();
  profile.arrange = { 'Totals board': { plus_katri: { pinned: true, disabled: true, order: 'first' } } };
  assert.deepEqual(errorsAt(validateShowProfile(profile, POOL)), [
    'arrange["Totals board"].plus_katri.disabled',
    'arrange["Totals board"].plus_katri.order',
  ]);
});

// ── withGraphicArrange: the one write door an authoring surface uses ──────────────────────────
// It lives in this module rather than in the Controls panel because a pool graphic's name is
// somebody's typed text, and the obvious spread is a `__proto__` bug waiting for one production.

test('withGraphicArrange writes one graphic and leaves the others alone', () => {
  const before = serializeShowProfile({
    v: 1,
    arrange: { 'Votes board': { reveal: { pinned: true } }, 'Totals board': { new_game: { hidden: true } } },
  });
  const after = withGraphicArrange(before, 'Totals board', { plus_katri: { order: 0 } });
  assert.deepEqual(after.arrange, {
    'Totals board': { plus_katri: { order: 0 } },
    'Votes board': { reveal: { pinned: true } },
  });
  // Canonical on the way out, so an authoring surface cannot store two spellings of one
  // arrangement - and the keys come out sorted whichever order the caller wrote them in.
  assert.equal(JSON.stringify(after), JSON.stringify(serializeShowProfile(after)));
});

test('withGraphicArrange starts a profile for a production that has none', () => {
  const made = withGraphicArrange(undefined, 'Votes board', { reveal: { order: 0 } });
  assert.equal(made.v, PROFILE_VERSION);
  assert.deepEqual(made.arrange, { 'Votes board': { reveal: { order: 0 } } });
});

test('an emptied arrangement removes the graphic rather than storing an empty map', () => {
  const before = withGraphicArrange(undefined, 'Votes board', { reveal: { pinned: true } });
  // Three roads to "nothing", and all of them must leave the same bytes: an empty map, an empty
  // entry, and a mark that means the default. One state for "as the graphic declared it" is what
  // keeps a diff honest about what an operator actually did.
  assert.deepEqual(withGraphicArrange(before, 'Votes board', {}).arrange, {});
  assert.deepEqual(withGraphicArrange(before, 'Votes board', { reveal: {} }).arrange, {});
  assert.deepEqual(withGraphicArrange(before, 'Votes board', { reveal: { hidden: false } }).arrange, {});
});

test('a graphic named __proto__ is stored as a key, not as a prototype', () => {
  // Measured on the transpiled module: `{ ...arrange, [graphic]: entries }` sets the PROTOTYPE
  // here and the entry vanishes with no error at all - the panel would say saved and change
  // nothing. This is the same measurement `own()` and `put()` were added for.
  const made = withGraphicArrange(undefined, '__proto__', { reveal: { pinned: true } });
  assert.deepEqual(Object.keys(made.arrange), ['__proto__']);
  assert.equal(readShowProfile(made).profile.arrange['__proto__'].reveal.pinned, true);
});

test('withGraphicArrange starts from empty on a profile this build cannot read', () => {
  // A newer build's bytes must never be MERGED into: rebasing a new arrangement onto them would
  // hand back something that looks writable while dropping the half this build cannot see. The
  // refusal itself is `setShowProfile`'s, so the two never disagree about WHICH profile is being
  // written - only about whether the write lands.
  const made = withGraphicArrange({ v: 99, arrange: {} }, 'Votes board', { reveal: { order: 0 } });
  assert.equal(made.v, PROFILE_VERSION);
  assert.deepEqual(made.arrange, { 'Votes board': { reveal: { order: 0 } } });
});

// ── Pinned live controls (docs/work-specs/pinned-live-controls/spec.md D1, D7; AC-6) ─────────────

const NAMES = Object.keys(POOL.controls);

test('pins read in pin order; a malformed list is dropped and the rest of the profile kept', () => {
  const read = readShowProfile({ ...goodProfile(), pinnedGraphics: ['Totals board', 'Votes board', 'Totals board', '', 7] });
  assert.deepEqual(read.profile.pinnedGraphics, ['Totals board', 'Votes board']);
  const bad = readShowProfile({ ...goodProfile(), pinnedGraphics: 'Totals board' });
  assert.equal(bad.status, 'ok');
  assert.equal(bad.profile.pinnedGraphics, undefined);
  assert.deepEqual(bad.profile.arrange, goodProfile().arrange);
});

test('canonical form keeps pin order, leaves the key out when nothing is pinned, and round trips', () => {
  const pinned = serializeShowProfile({ v: 1, arrange: {}, pinnedGraphics: ['Votes board', 'Totals board'] });
  assert.equal(JSON.stringify(pinned), '{"v":1,"arrange":{},"pinnedGraphics":["Votes board","Totals board"]}');
  assert.equal(JSON.stringify(serializeShowProfile({ v: 1, arrange: {}, pinnedGraphics: [] })), '{"v":1,"arrange":{}}');
  assert.deepEqual(serializeShowProfile(readShowProfile(pinned).profile), pinned);
  assert.deepEqual(profileForPublish(pinned), pinned);
  assert.ok(profileIsEmpty(serializeShowProfile({ v: 1, arrange: {}, pinnedGraphics: [] })));
  assert.ok(!profileIsEmpty(pinned));
});

test('a pin is appended, an unpin removes only it, and a name outside the pool is refused', () => {
  const one = withPinnedGraphic(undefined, 'Totals board', true, NAMES);
  assert.deepEqual(one, { v: 1, arrange: {}, pinnedGraphics: ['Totals board'] });
  const two = withPinnedGraphic(one, 'Votes board', true, NAMES);
  assert.deepEqual(two.pinnedGraphics, ['Totals board', 'Votes board']);
  assert.deepEqual(withPinnedGraphic(two, 'Totals board', false, NAMES).pinnedGraphics, ['Votes board']);
  assert.deepEqual(withPinnedGraphic(two, 'Not here', true, NAMES), two);
  // A pin keeps the arrangement it was written over.
  assert.deepEqual(withPinnedGraphic(goodProfile(), 'Votes board', true, NAMES).arrange, serializeShowProfile(goodProfile()).arrange);
});

test('an orphan pin is dropped by the next pin or arrangement write, and no other arrangement moves (D7)', () => {
  const stored = { ...goodProfile(), arrange: { ...goodProfile().arrange, Gone: { x: { hidden: true } } }, pinnedGraphics: ['Gone', 'Totals board'] };
  const pinWrite = withPinnedGraphic(stored, 'Votes board', true, NAMES);
  assert.deepEqual(pinWrite.pinnedGraphics, ['Totals board', 'Votes board']);
  assert.deepEqual(pinWrite.arrange, serializeShowProfile(stored).arrange);
  const arrangeWrite = withGraphicArrange(stored, 'Votes board', { reveal: { pinned: true } }, NAMES);
  assert.deepEqual(arrangeWrite.pinnedGraphics, ['Totals board']);
  assert.ok(arrangeWrite.arrange.Gone, 'the gone graphic\'s arrangement is not the pin rule\'s to drop');
  // Without the pool, an arrangement write keeps every pin (the older callers).
  assert.deepEqual(withGraphicArrange(stored, 'Votes board', {}).pinnedGraphics, ['Gone', 'Totals board']);
});

test('the validator warns about an orphan pin and refuses only a malformed list', () => {
  const orphan = validateShowProfile({ v: 1, arrange: {}, pinnedGraphics: ['Gone', 'Totals board'] }, POOL);
  assert.deepEqual(errorsAt(orphan), []);
  assert.deepEqual(warningsAt(orphan), ['pinnedGraphics[0]']);
  assert.deepEqual(errorsAt(validateShowProfile({ v: 1, arrange: {}, pinnedGraphics: 'Totals board' }, POOL)), ['pinnedGraphics']);
  assert.deepEqual(errorsAt(validateShowProfile({ v: 1, arrange: {}, pinnedGraphics: [3] }, POOL)), ['pinnedGraphics[0]']);
});

test('a profile from a newer build pins nothing and its pins cannot be edited here', () => {
  const newer = { v: 2, arrange: {}, pinnedGraphics: ['Totals board'] };
  assert.deepEqual(pinnedGraphicsOf(newer), []);
  assert.deepEqual(pinnedGraphicsOf(undefined), []);
  assert.deepEqual(pinnedGraphicsOf({ v: 1, arrange: {}, pinnedGraphics: ['Totals board'] }), ['Totals board']);
});
