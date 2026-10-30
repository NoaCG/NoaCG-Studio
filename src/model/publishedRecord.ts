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
//     reaches an output (`updatedAt`, `outputOpenedAt`, `ownReaderStops`, the tombstone);
//   - each pool graphic's save time, so re-adding the same design is no change;
//   - the embedded template of a graphic with no library link. What it RENDERS is compared by
//     content already (`libraryGraphicDigests` against the published stamp, usePublishDrift), and
//     a production's picture graphic can carry megabytes. Its fields stay in, because the hosted
//     panel is built from them and the render digest does not cover them. A LINKED graphic's
//     copy stays in whole: where this browser has no library record for it (a teammate's), the
//     render digest skips it and this copy is what a publish would send.
// Everything else stays in, so the check errs towards "changed", never towards hiding a change.
//
// Pure, synchronous and Node-runnable (scripts/published-record.test.mjs).

import { contentHash } from './contentHash.ts';
import type { Show } from './shows';

/** Record fields a publish does not read from the record, or writes back itself. */
const NOT_PUBLISHED = new Set(['updatedAt', 'publishedAt', 'publishedRecord', 'hostedSlug', 'outputSlug', 'joinSlug', 'presenterSlug', 'outputOpenedAt', 'ownReaderStops', 'deleted']);

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

/** A linked graphic's embedded template, digested once per copy: every write of a pool copy
 *  stamps a new `savedAt`, so the id and that stamp name its content, and a cue edit does not
 *  re-walk a design that can carry pictures. */
const templateMemo = new Map<string, string>();
function templateDigest(graphic: Show['graphics'][number]): string {
  const key = `${graphic.id}|${graphic.savedAt}`;
  let digest = templateMemo.get(key);
  if (digest === undefined) {
    digest = contentHash(canonical(graphic.template));
    if (templateMemo.size > 200) templateMemo.clear();
    templateMemo.set(key, digest);
  }
  return digest;
}

/** The digest of what a publish reads from this record. */
export function publishedRecordDigest(show: Show): string {
  const known = memo.get(show);
  if (known !== undefined) return known;
  const kept: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(show)) if (!NOT_PUBLISHED.has(key)) kept[key] = value;
  kept.graphics = show.graphics.map((g) => {
    const { savedAt: _savedAt, template, ...graphic } = g;
    return { ...graphic, ...(g.graphicId ? { template: templateDigest(g) } : { fields: template.fields }) };
  });
  const digest = contentHash(canonical(kept));
  memo.set(show, digest);
  return digest;
}

/** The record moved past its publish. A record published before digests were recorded falls
 *  back to its timestamps, the old reading, until its next publish. */
export function recordChangedSincePublish(show: Show | null): boolean {
  if (!show?.publishedAt) return false;
  if (show.publishedRecord === undefined) return show.updatedAt > show.publishedAt;
  return publishedRecordDigest(show) !== show.publishedRecord;
}
