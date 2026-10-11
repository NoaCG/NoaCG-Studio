// THE VERSION A PUBLISHED PAYLOAD IS (Phase 6 Step 3, docs/work-specs/playout-ready/spec.md R2).
//
// READY's second guarantee is "this output holds the production version the operator is working
// from" (docs/PLAYOUT_ISOLATION_RESEARCH.md §9.2), and today nothing names a version: a re-publish
// overwrites `control_shows.output`, and an open output keeps whatever it booted with. Step 4 brings
// a manifest with real versions. Until then this stamp stands in for one, written INSIDE the
// payload at publish (an additive optional field of the v1 payload: no migration, no format bump):
//
//   n   the label, "v12": the previous stamp's n plus one. A publish lands only over the n it
//       read (the publish guard), so two racing publishes cannot write the same one.
//   g   per graphic, a digest of exactly what the output renders of it (html, css, js, assets,
//       resolution, fps, layer). Preparing a newer version builds only the graphics whose digest
//       moved (R3).
//   h   one digest over the stage resolution and every `g`: THE identity. Two payloads with the
//       same h render the same, so a cue-only publish moves n and makes no output behind.
//   t   per graphic, when its DESIGN was last edited (the publisher's library record, or the copy
//       the production embeds). A publish never puts an older design over a newer one
//       (docs/work-specs/publish-guard/spec.md G3, `olderDesigns`). Absent before 2026-10.
//
// Only the publisher digests, from the object it just built; everyone else reads the stamp. That
// matters: Postgres stores jsonb with its keys re-ordered, so a payload read back from the server
// does not stringify to the text that was hashed, and no reader could recompute it.
//
// No DOM, no imports: the output renderer reads it on CasparCG 2.3's Chromium 71, and
// scripts/payload-version.test.mjs runs it in Node.

/** The stamp as it rides the payload. */
export interface PayloadVersion {
  n: number;
  /** When it was published, ISO. */
  at: string;
  h: string;
  g: Record<string, string>;
  /** Per graphic, when its design was last edited, ISO. */
  t?: Record<string, string>;
}

/** The part of a graphic spec the digest covers: what the output renders, nothing else. */
export interface VersionedGraphic {
  key: string;
  html: string;
  css: string;
  js: string;
  assets: { path: string; data: string }[];
  resolution: { width: number; height: number };
  fps: number;
  layer?: number;
}

/** Hex digits kept of each digest: plenty to tell one production's versions apart. */
const DIGEST_CHARS = 16;

/**
 * SHA-256 of `text`, hex, through WebCrypto where the page has it (every studio page: https, or
 * localhost in development). Where it has not (a page served over plain http from another host),
 * a 53-bit string hash prefixed `c:`, so the two can never be mistaken for each other: a stamp is
 * compared only with other stamps of the same production, and a publisher on the fallback simply
 * makes every graphic read as changed once.
 */
export async function digestText(text: string): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (subtle && typeof TextEncoder !== 'undefined') {
    const bytes = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(text)));
    let hex = '';
    for (let i = 0; i < DIGEST_CHARS / 2; i += 1) hex += bytes[i].toString(16).padStart(2, '0');
    return hex;
  }
  return `c:${cyrb53(text).toString(16)}`;
}

/** cyrb53 (public domain): a fast, well-mixed 53-bit string hash. */
function cyrb53(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** One graphic's digest, over a fixed-order array so the key order of the spec object cannot
 *  change it. */
export function graphicDigest(spec: VersionedGraphic): Promise<string> {
  return digestText(
    JSON.stringify([
      spec.html,
      spec.css,
      spec.js,
      spec.assets.map((a) => [a.path, a.data]),
      spec.resolution.width,
      spec.resolution.height,
      spec.fps,
      spec.layer ?? null,
    ]),
  );
}

/** The stamp for a payload about to be published, `previous` being the stamp it replaces (or
 *  null: none, or published before stamps existed). `edited`: per graphic, when its design was
 *  last edited. */
export async function stampPayload(
  payload: { resolution: { width: number; height: number }; graphics: VersionedGraphic[] },
  previous: PayloadVersion | null,
  now: Date = new Date(),
  edited?: Record<string, string>,
): Promise<PayloadVersion> {
  const g: Record<string, string> = {};
  for (const spec of payload.graphics) g[spec.key] = await graphicDigest(spec);
  const keys = Object.keys(g).sort();
  const h = await digestText(JSON.stringify([payload.resolution.width, payload.resolution.height, keys.map((k) => [k, g[k]])]));
  return { n: (previous?.n ?? 0) + 1, at: now.toISOString(), h, g, ...(edited ? { t: edited } : {}) };
}

/** The string values of a wire map, the rest dropped. */
function strings(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const item = (value as Record<string, unknown>)[key];
      if (typeof item === 'string') out[key] = item;
    }
  }
  return out;
}

/** A stamp read off the wire, or null: absent (published before this step) or not one. */
export function readPayloadVersion(value: unknown): PayloadVersion | null {
  const v = value as Partial<PayloadVersion> | null;
  if (!v || typeof v !== 'object') return null;
  if (typeof v.n !== 'number' || !isFinite(v.n) || typeof v.h !== 'string' || !v.h) return null;
  return { n: v.n, at: typeof v.at === 'string' ? v.at : '', h: v.h, g: strings(v.g), ...(v.t && typeof v.t === 'object' ? { t: strings(v.t) } : {}) };
}

/**
 * The graphics a publish of `next` would put an OLDER design over (docs/work-specs/publish-guard
 * spec G3): `published` renders them differently and names a later edit than `next` does. A
 * graphic either side gives no edit time for is not counted (published before edit times, or new).
 * Times compare as instants, so two clocks' ISO spellings cannot mislead.
 */
export function olderDesigns(next: { g: Record<string, string>; t?: Record<string, string> }, published: PayloadVersion | null): string[] {
  const theirs = published?.t;
  const mine = next.t;
  if (!published || !theirs || !mine) return [];
  return Object.keys(next.g).filter((key) => {
    if (published.g[key] === undefined || published.g[key] === next.g[key]) return false;
    const was = Date.parse(theirs[key] ?? '');
    const now = Date.parse(mine[key] ?? '');
    return isFinite(was) && isFinite(now) && was > now;
  });
}

/**
 * The graphics of `next` an output holding `held` has to build: every one whose digest moved, and
 * every one that is new. Without a held stamp every graphic counts, because nothing says which of
 * them are the same. A graphic `next` no longer has is not listed: nothing needs preparing for it.
 */
export function changedGraphics(held: PayloadVersion | null, next: PayloadVersion, keys: readonly string[]): string[] {
  return keys.filter((key) => !held || !held.g[key] || held.g[key] !== next.g[key]);
}

/**
 * Would a publish now change what the outputs render (docs/work-specs/studio-day-playout AC-5)?
 * `now` is what a publish would write for the graphics this page reads from its own library, by key;
 * `published` the published stamp's `g`. A graphic the stamp does not name (added since, or published
 * before stamps existed) is not counted: adding or removing a graphic changes the production record,
 * whose own timestamp already says so.
 */
export function rendersDiffer(now: Record<string, string>, published: Record<string, string>): boolean {
  return Object.keys(now).some((key) => published[key] !== undefined && published[key] !== now[key]);
}

/** "v12", or "" for no stamp. */
export function versionLabel(v: { n: number } | null | undefined): string {
  return v ? `v${v.n}` : '';
}
