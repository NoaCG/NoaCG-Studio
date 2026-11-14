// IS THE PRODUCTION RECORD STILL THE ONE THAT WAS PUBLISHED? (docs/work-specs/studio-day-playout
// AC-5 and D5: unpublished changes are judged by CONTENT.)
//
// The production page's "Unpublished changes" used to read `updatedAt > publishedAt`. Every write
// moves `updatedAt`, and changing a cue back is itself a write, so a cue changed and changed back
// kept asking for a publish that would send nothing new (issue #762). A publish now records a
// digest of the record it was built from, and the record counts as changed only while its digest
// differs.
//
// What the digest leaves out:
//   - what a publish writes BACK (the slugs, `publishedAt`, this digest) and bookkeeping that never
//     reaches an output (`updatedAt`, `outputOpenedAt`, `ownReaderStops`, the tombstone, and the
//     question list, which goes to phones through Go live rather than through a publish);
//   - each pool graphic's save time and design stamp (`designAt`), so re-adding, stamping or
//     adopting the same design is no change, and each template's own `name` (the pool name, in the
//     digest through the item).
// Every copy's template stays in, linked or not: the copy is what publishes (live-publishing W2).
// A digest stored before W2 has no format tag and is read by the formula it was written with.
// Everything else stays in, so the check errs towards "changed", never towards hiding a change.
//
// Pure, synchronous and Node-runnable (scripts/published-record.test.mjs).

import { contentHash } from './contentHash.ts';
import type { Show } from './shows';

/** Record fields a publish does not read from the record, or writes back itself. */
const NOT_PUBLISHED = new Set(['updatedAt', 'publishedAt', 'publishedRecord', 'hostedSlug', 'outputSlug', 'joinSlug', 'presenterSlug', 'outputOpenedAt', 'ownReaderStops', 'deleted', 'questions', 'joinPage', 'resultCues', 'resultTarget', 'wordTarget']);

/** JSON with every object's keys sorted, so a record read back from the server (Postgres jsonb
 *  re-orders keys) or rewritten by a mutator digests the same. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonical(v))).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).filter((k) => record[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(record[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

const memo = new WeakMap<Show, string>();
const legacyMemo = new WeakMap<Show, string>();

/** The format tag of the current digest. A stored digest without it was written by the formula
 *  before live-publishing W2 (`legacyRecordDigest`), and is compared by that formula until the next
 *  publish replaces it (designs/G1.md section 1). */
const DIGEST_TAG = '2:';

/** A graphic's template, digested once per copy. The copy's id and `savedAt` name its design, and
 *  the template's own `name` is left out: it is the pool name, already in the digest through the
 *  item, and an in-place rename (the production's own picture graphic, shows.ts `addGraphicToShow`)
 *  moves it without touching `savedAt`, so a cached hash that held the name would go stale. */
const templateMemo = new Map<string, string>();
function templateDigest(graphic: Show['graphics'][number]): string {
  const key = `${graphic.id}|${graphic.savedAt}`;
  let digest = templateMemo.get(key);
  if (digest === undefined) {
    digest = contentHash(canonical({ ...graphic.template, name: '' }));
    if (templateMemo.size > 200) templateMemo.clear();
    templateMemo.set(key, digest);
  }
  return digest;
}

/** The digest of what a publish reads from this record. Every copy's template counts, linked or
 *  not, since copies are what publishes (live-publishing W2); `savedAt` and the design stamp
 *  `designAt` do not, so stamping or adopting an unchanged design is no change. */
export function publishedRecordDigest(show: Show): string {
  const known = memo.get(show);
  if (known !== undefined) return known;
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(show)) if (!NOT_PUBLISHED.has(key)) kept[key] = value;
  kept.graphics = show.graphics.map((g) => {
    const { savedAt: _savedAt, designAt: _designAt, template: _template, ...graphic } = g;
    return { ...graphic, template: templateDigest(g) };
  });
  const digest = DIGEST_TAG + contentHash(canonical(kept));
  memo.set(show, digest);
  return digest;
}

/** The digest before live-publishing W2: a linked graphic's template, an unlinked one's fields,
 *  `designAt` left out (it did not exist). Read only to compare a stored untagged digest. */
const legacyTemplateMemo = new Map<string, string>();
export function legacyRecordDigest(show: Show): string {
  const known = legacyMemo.get(show);
  if (known !== undefined) return known;
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(show)) if (!NOT_PUBLISHED.has(key)) kept[key] = value;
  kept.graphics = show.graphics.map((g) => {
    const { savedAt: _savedAt, designAt: _designAt, template, ...graphic } = g;
    if (!g.graphicId) return { ...graphic, fields: template.fields };
    const key = `${g.id}|${g.savedAt}`;
    let digest = legacyTemplateMemo.get(key);
    if (digest === undefined) {
      digest = contentHash(canonical(template));
      if (legacyTemplateMemo.size > 200) legacyTemplateMemo.clear();
      legacyTemplateMemo.set(key, digest);
    }
    return { ...graphic, template: digest };
  });
  const digest = contentHash(canonical(kept));
  legacyMemo.set(show, digest);
  return digest;
}

/** Forget the cached template digests (tests: a fresh page load). */
export function clearRecordDigestCache(): void {
  templateMemo.clear();
  legacyTemplateMemo.clear();
}

/** The record moved past its publish. A record published before digests were recorded falls
 *  back to its timestamps, the old reading, until its next publish. An untagged digest was written
 *  by the formula before W2 and is read by it. */
export function recordChangedSincePublish(show: Show | null): boolean {
  if (!show?.publishedAt) return false;
  if (show.publishedRecord === undefined) return show.updatedAt > show.publishedAt;
  if (!show.publishedRecord.startsWith(DIGEST_TAG)) return legacyRecordDigest(show) !== show.publishedRecord;
  return publishedRecordDigest(show) !== show.publishedRecord;
}
