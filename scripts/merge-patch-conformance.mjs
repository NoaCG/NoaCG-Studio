// THE MERGE-PATCH CONFORMANCE TABLE - the one place the production-data write semantics are
// written down as data (docs/PRODUCTION_DATA_PLAN.md §4).
//
// Production data is merged in TWO implementations on purpose: TypeScript
// (src/model/productionData.ts) for the local/offline path, and plpgsql
// (supabase/migrations/0048_*.sql `jsonb_merge_patch`) for the hosted one, where the merge has
// to be ATOMIC with the row lock so two feeds cannot lose an update between a read and a write.
// Two implementations of one semantic is exactly how a system grows two quiet opinions.
//
// So neither implementation owns the rules. This file does, and three things check against it:
//
//   1. scripts/production-data.test.mjs   - runs every case against the REAL TypeScript module.
//   2. the 0048 migration's own self-check - runs every case against the REAL plpgsql body,
//      from a jsonb literal embedded in the migration; a case added later is called the same
//      way by a later migration (0048 is applied history and is never edited).
//   3. scripts/production-data-migration.test.mjs - asserts that those embedded literals still
//      equal this table, so ADDING A CASE HERE FAILS THE BUILD until the SQL side carries it too.
//
// Add a case here before changing either implementation. Every entry is RFC 7386 behaviour a
// live production depends on.

/** @type {{name: string, base: unknown, patch: unknown, expect: unknown}[]} */
export const MERGE_PATCH_CONFORMANCE = [
  {
    name: 'a nested patch keeps the siblings it did not mention',
    base: { a: { b: 1, c: 2 } },
    patch: { a: { b: 5 } },
    expect: { a: { b: 5, c: 2 } },
  },
  {
    name: 'null deletes exactly its own key',
    base: { a: { b: 1, c: 2 } },
    patch: { a: { b: null } },
    expect: { a: { c: 2 } },
  },
  {
    name: 'a patch creates the branch it needs',
    base: {},
    patch: { match: { home: { score: 4 } } },
    expect: { match: { home: { score: 4 } } },
  },
  {
    name: 'arrays REPLACE wholesale - no element merging',
    base: { rows: [1, 2, 3] },
    patch: { rows: [9] },
    expect: { rows: [9] },
  },
  {
    name: 'a scalar replaces an object',
    base: { a: { b: 1 } },
    patch: { a: 'gone' },
    expect: { a: 'gone' },
  },
  {
    name: 'an object replaces a scalar',
    base: { a: 'text' },
    patch: { a: { b: 1 } },
    expect: { a: { b: 1 } },
  },
  {
    name: 'deleting a key that is not there is not an error',
    base: { a: 1 },
    patch: { b: null },
    expect: { a: 1 },
  },
  {
    name: 'an empty patch changes nothing',
    base: { a: { b: 1 } },
    patch: {},
    expect: { a: { b: 1 } },
  },
  {
    name: 'false and 0 are values, not absences',
    base: { open: true, votes: 7 },
    patch: { open: false, votes: 0 },
    expect: { open: false, votes: 0 },
  },
  {
    name: 'deleting a whole branch',
    base: { match: { home: { score: 1 } }, weather: { temp: 4 } },
    patch: { weather: null },
    expect: { match: { home: { score: 1 } } },
  },
  {
    name: 'a deep patch merges without disturbing a sibling branch',
    base: { match: { home: { name: 'Finland', score: 1 }, away: { name: 'Sweden', score: 0 } } },
    patch: { match: { home: { score: 2 } } },
    expect: { match: { home: { name: 'Finland', score: 2 }, away: { name: 'Sweden', score: 0 } } },
  },
  {
    name: 'an empty object value creates an empty branch rather than deleting',
    base: { a: 1 },
    patch: { b: {} },
    expect: { a: 1, b: {} },
  },
  {
    // A list adapter writes "" when a valid read has no rows (data-sources "Formats"), so an
    // emptied list clears on air. A list written earlier as an ARRAY (a /patch sender) is
    // replaced by the string like any other scalar, never kept beside it.
    name: 'an empty string replaces a list, so an emptied list clears',
    base: { sheet: { s1: { lines: ['United win', 'Polls close'] } } },
    patch: { sheet: { s1: { lines: '' } } },
    expect: { sheet: { s1: { lines: '' } } },
  },
];
