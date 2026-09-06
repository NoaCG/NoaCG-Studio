// FACET I — "what is this graphic FOR", and whether searching for it works.
//
// The owner asked for this on the 2026-08-28 walk with an example: *"if they're searching for a
// specific 'thanks for watching', they might not find it if we don't mention that... so if
// someone is confused and not really sure what they want, they can find guidance."*
//
// These are ASSERTIONS ABOUT THE SEARCH RESULT, not about the matcher. The matcher is easy to
// reason about and easy to be wrong about: measured on 2026-09-06, before the occasion facet
// existed, "be right back" returned all 21 holding screens at an identical score and the BRB
// card the reader had asked for came ELEVENTH, under five front doors and a service hold — an
// alias could only ever point at a category, and no facet said what a design was for. Nothing
// short of running the real engine over the real catalog would have said so.
//
// IT NEEDS A REAL DOM, and that is not an oversight — `withBundledPage`'s own comment has the
// reason: the search index is built out of CREATED designs, and creating one parses the html it
// just emitted. Chromium's DOM is the honest one and the whole file costs a couple of seconds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { withBundledPage } from './catalog-emit.mjs';

const SPECS = [
  { entry: fileURLToPath(new URL('../src/templates/templateMeta.ts', import.meta.url)), globalName: 'NOACG_META' },
  { entry: fileURLToPath(new URL('../src/templates/search.ts', import.meta.url)), globalName: 'NOACG_SEARCH' },
  { entry: fileURLToPath(new URL('../src/model/taxonomy.ts', import.meta.url)), globalName: 'NOACG_TAXONOMY' },
];

/** Everything the assertions need, gathered in ONE page — the browser is the expensive part. */
const GATHER = (queries) => {
  const { browseTemplates, NO_BROWSE_FILTERS } = window.NOACG_SEARCH;
  const { validateTaxonomy, allTemplateMeta } = window.NOACG_META;
  const { OCCASIONS } = window.NOACG_TAXONOMY;
  const search = {};
  for (const query of queries) {
    const out = browseTemplates({ ...NO_BROWSE_FILTERS, query });
    search[query] = {
      total: out.total,
      ignored: out.ignored,
      ids: out.best.map((r) => r.variant.id),
      occasionsById: Object.fromEntries(out.best.map((r) => [r.variant.id, r.meta.occasions])),
    };
  }
  return {
    problems: validateTaxonomy(),
    occasions: OCCASIONS.map((o) => ({ id: o.id, name: o.name, phrases: o.phrases })),
    declared: allTemplateMeta()
      .filter(({ meta }) => meta.occasions.length > 0)
      .map(({ meta }) => ({ id: meta.id, occasions: meta.occasions })),
    catalogSize: allTemplateMeta().length,
    search,
  };
};

const QUERIES = [
  'thanks for watching', // the owner's own words
  'goodbye', // the same moment, from a design NOT named after the phrase
  'be right back', // the measured failure: the right card was 11th
  'technical difficulties',
  'starting soon',
  'lower third', // an unrelated query, to prove nothing else moved
];

const gathered = await withBundledPage(SPECS, (page) => page.evaluate(GATHER, QUERIES));

test('the taxonomy validates, occasion rule included', () => {
  assert.deepEqual(gathered.problems, [], gathered.problems.join('\n'));
});

test('the occasion vocabulary stays closed and small', () => {
  // The ceiling and the floor are gated inside validateTaxonomy; this is the other half of the
  // rule — every value declares the words a person would actually type, or it is a filing word.
  assert.ok(gathered.occasions.length > 0 && gathered.occasions.length <= 8);
  for (const occasion of gathered.occasions) {
    assert.ok(occasion.phrases.length >= 3, `occasion "${occasion.id}" declares too few phrases`);
    for (const phrase of occasion.phrases) {
      assert.equal(phrase, phrase.toLowerCase().trim(), `phrase "${phrase}" is not written the way it is typed`);
    }
  }
});

test("the owner's example: \"thanks for watching\" finds ss09, and its company is honest", () => {
  const result = gathered.search['thanks for watching'];
  assert.equal(result.ids[0], 'ss09', `expected ss09 first, got ${result.ids.slice(0, 3).join(', ')}`);
  assert.deepEqual(result.ignored, [], 'no word of the phrase may be dropped');
  // "does not drown in every same-skin sibling": every design that comes back is a sign-off, so
  // the front doors ss09 shares a skin and a shelf with (ss04 House Hold and its siblings) are
  // not in the list at all.
  for (const id of result.ids) {
    assert.ok(
      result.occasionsById[id].includes('sign-off'),
      `${id} came back for "thanks for watching" without being a sign-off`,
    );
  }
  assert.ok(result.total >= 5, 'a confused reader should be shown the family, not one card');
  assert.ok(result.total < gathered.catalogSize / 10, 'a moment must narrow the catalog, not open it');
});

test('a sign-off is findable by a word no design is named after', () => {
  const result = gathered.search['goodbye'];
  // Measured 2026-09-06 before facet I: "goodbye" returned NOTHING and the word was reported as
  // ignored. It is the case the owner's own phrase hides, because ss09 is literally called
  // "Thanks for Watching" and would have been found by its name alone.
  assert.ok(result.total > 0, '"goodbye" reaches no design');
  assert.deepEqual(result.ignored, []);
  assert.ok(result.ids.includes('ss09'));
  assert.ok(result.ids.includes('cr01'), 'the moment must cross the shelf: a credit roll is an ending too');
  for (const id of result.ids) assert.ok(result.occasionsById[id].includes('sign-off'));
});

test('the moment outranks the form: "be right back" leads with break cards', () => {
  const result = gathered.search['be right back'];
  // The phrase is also an alias for the whole holding CATEGORY, and that stays true — a front
  // door is still offered, just under the five cards that are actually for a break. Ranking,
  // never hiding, is the rule the programme facets already follow.
  const lead = result.ids.slice(0, 5);
  for (const id of lead) {
    assert.ok(
      result.occasionsById[id].includes('break'),
      `"${id}" leads "be right back" without being a break card`,
    );
  }
  assert.ok(result.ids.includes('ss06'), 'the house BRB card must be in the result');
  assert.ok(result.ids.indexOf('ss06') < 5, 'and near the top — it was 11th before facet I');
  assert.ok(result.ids.includes('ss04'), 'the front doors are ranked down, never hidden');
  assert.ok(result.ids.indexOf('ss04') > result.ids.indexOf('ss06'));
});

test('"technical difficulties" reaches all three of them, across two shelves', () => {
  const result = gathered.search['technical difficulties'];
  for (const id of ['ss08', 'al07', 'al10']) assert.ok(result.ids.includes(id), `${id} missing`);
  assert.deepEqual(result.ignored, [], '"difficulties" used to be dropped as an unreachable word');
});

test('an undeclared design behaves exactly as it did before facet I', () => {
  // Most of the catalog declares no occasion, and that is the designed default rather than a
  // gap to be filled with guesses. The proof it costs nothing: a moment query never returns one,
  // and an ordinary query is untouched by the facet.
  const declaredIds = new Set(gathered.declared.map((d) => d.id));
  assert.ok(declaredIds.size < gathered.catalogSize / 2, 'occasions are the exception, not the rule');
  for (const query of ['thanks for watching', 'goodbye', 'technical difficulties']) {
    for (const id of gathered.search[query].ids) {
      assert.ok(declaredIds.has(id), `undeclared "${id}" answered the moment query "${query}"`);
    }
  }
  // An unrelated query still answers with the shelf it always did.
  assert.ok(gathered.search['lower third'].total > 50);
});

test('every declared occasion is one of the closed vocabulary', () => {
  const known = new Set(gathered.occasions.map((o) => o.id));
  for (const { id, occasions } of gathered.declared) {
    for (const occasion of occasions) assert.ok(known.has(occasion), `${id} declares unknown occasion "${occasion}"`);
  }
});
