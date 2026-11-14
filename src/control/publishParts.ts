// A PUBLISH IN PARTS (docs/work-specs/live-publishing/designs/G4.md section 4).
//
// What `publishRevision` built, sent as the difference from the stored publication: only the
// graphics (PARTS, named by the digest of their whole body, images as content names) the stored head
// does not name, only the images no part of this account's productions names, and the rest (the
// HEAD: cues, settings, each graphic as a reference) and the panel as patches against the stored
// ones while this page holds their maps for the stored stamp `n`. The server (`control_publish_parts`,
// migration 0120) applies them only to that `n`, and writes `output` whole for every older reader.
//
// Answers what the attempt came to, or `fallback` when this path cannot be used (no function on the
// server, a timeout, a server error): the caller then publishes whole, as phase 6 does.

import { getSupabase } from '../backend/supabase';
import { contentName } from '../backend/assets';
import { canonicalJson, diff, digest128, storedMap, type PatchOp, type UnitMap } from '../backend/unitPatch';
import type { OutputGraphicSpec, OutputPayload, PanelGraphicSpec } from './hostedControl';
import type { PayloadVersion } from './payloadVersion';
import { publishedBoxesOf, type PublishedBox } from './keptGeometry.ts';

type Sb = NonNullable<Awaited<ReturnType<typeof getSupabase>>>;

/** One graphic as stored: its whole body, images as content names. */
export interface Part {
  d: string;
  body: Record<string, unknown>;
  assets: string[];
  /** The images' data URLs by content name, to put the ones the server lacks. */
  data: Map<string, string>;
}

/** A graphic's reference in the head. */
interface Ref {
  key: string;
  p: string;
  g: string;
  t?: string;
}

/** What this page knows of a production's stored publication after its own last publish there. */
interface Held {
  /** From this page's own publish (false: read from the server when the page opened). */
  own?: boolean;
  n: number;
  head: UnitMap;
  panel: UnitMap;
  refs: Set<string>;
  title: string;
  profile: string;
}
const held = new Map<string, Held>();

/** Part names by a key covering the whole body: `g` (html, css, js, asset data, resolution, fps,
 *  layer) and the digest of every other field (G4 section 4, "The part's name"). */
const partMemo = new Map<string, Part>();

async function partOf(spec: OutputGraphicSpec, g: string): Promise<Part> {
  const light = { ...spec, html: 0, css: 0, js: 0, assets: spec.assets.map((a) => ({ ...a, data: 0 })) };
  const memoKey = `${g}|${await digest128(canonicalJson(light))}`;
  const known = partMemo.get(memoKey);
  if (known) return known;
  const data = new Map<string, string>();
  const assets: Record<string, unknown>[] = [];
  for (const a of spec.assets) {
    const { data: url, ...rest } = a;
    // Only an image the server stores by content name (a base64 data URL, `control_asset_put`); a
    // sound's reference or a text file stays inline in the part, as its body sent it.
    if (typeof url !== 'string' || !isStorableImage(url)) {
      assets.push({ ...a });
      continue;
    }
    const h = await contentName(url);
    data.set(h, url);
    assets.push({ ...rest, h });
  }
  const body = { ...spec, assets } as Record<string, unknown>;
  const part: Part = { d: await digest128(canonicalJson(body)), body, assets: [...data.keys()], data };
  if (partMemo.size > 400) partMemo.clear();
  partMemo.set(memoKey, part);
  return part;
}

/** What `control_asset_put` accepts (migration 0120): a base64 data URL. */
export const isStorableImage = (url: string): boolean => url.startsWith('data:') && url.includes(';base64,');

/** The outcome of one attempt. */
export type PartsOutcome =
  | { kind: 'landed'; ver: PayloadVersion; brand: unknown; answer: Record<string, unknown> }
  | { kind: 'moved' }
  | { kind: 'gone' }
  | { kind: 'fallback'; why: string };

class Fallback extends Error {}

/** `control_asset_put`'s cap on one image's data URL (migration 0120). */
const ASSET_PUT_CAP = 40_000_000;

async function rpc<T>(sb: Sb, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error, status } = await sb.rpc(name, args);
  if (error) {
    // A missing function, a timeout or a server error: publish whole instead (G4 section 4). Any
    // other answer (a refusal by the guard, the row policy, a team) is the publish's outcome,
    // classified as a whole publish's would be, and never sent again whole.
    if (error.code === 'PGRST202' || error.code === '57014' || status >= 500) throw new Fallback(`${name}: ${error.message}`);
    throw Object.assign(new Error(error.message), { code: error.code, status });
  }
  return data as T;
}

/** The stored head's references and the maps, read when this page holds none for `n`. */
async function readStored(sb: Sb, id: string, n: number | null): Promise<{ refs: Set<string>; head: UnitMap | null; panel: UnitMap | null }> {
  const { data, error } = await sb.from('control_shows').select('refs:published_head->graphics, hn:published_head->ver->n, published_units').eq('id', id).maybeSingle();
  if (error) throw new Fallback(error.message);
  const row = (data ?? {}) as { refs?: unknown; hn?: unknown; published_units?: { n?: unknown; head?: unknown; panel?: unknown } | null };
  const current = n !== null && row.hn === n;
  const refs = new Set<string>(current && Array.isArray(row.refs) ? (row.refs as { p?: unknown }[]).flatMap((r) => (typeof r.p === 'string' ? [r.p] : [])) : []);
  const units = row.published_units;
  const mapsValid = current && units && (units as { f?: unknown }).f === 1 && units.n === n;
  return { refs, head: mapsValid ? storedMap(units.head) : null, panel: mapsValid ? storedMap(units.panel) : null };
}

/**
 * One publish of `built` in parts, over the stored stamp `stored` (null: none). `stamp`: the stamp
 * this publish writes, with `r` and `c`. `columns`: the row's other columns as a whole publish
 * writes them.
 */
export async function publishInParts(
  sb: Sb,
  showId: string,
  built: OutputPayload,
  panel: PanelGraphicSpec[],
  stamp: PayloadVersion,
  stored: PayloadVersion | null,
  columns: { title: string; bindings: unknown; sources: unknown; collections: unknown; profile: unknown; team_id?: string },
  /** Awaited before each step of work, so a Take goes first (G3 section 5). */
  pace: () => Promise<void> = () => Promise.resolve(),
): Promise<PartsOutcome> {
  try {
    const named = stored ? stored.n : null;
    // The parts and the head's references.
    const parts: Part[] = [];
    const refs: Ref[] = [];
    for (const spec of built.graphics) {
      await pace();
      const part = await partOf(spec, stamp.g[spec.key]);
      parts.push(part);
      const t = stamp.t?.[spec.key];
      refs.push({ key: spec.key, p: part.d, g: stamp.g[spec.key], ...(typeof t === 'string' ? { t } : {}) });
    }
    const { graphics: _bodies, ver: _ver, ...rest } = built;
    const headDoc: Record<string, unknown> = { ...rest, graphics: refs };
    const panelDoc: Record<string, unknown> = { panel };

    // The base: this page's own last publish, else the stored maps when they describe `named`.
    const mine = held.get(showId);
    let base: { refs: Set<string>; head: UnitMap | null; panel: UnitMap | null; own: boolean };
    if (mine && named !== null && mine.n === named) base = { refs: mine.refs, head: mine.head, panel: mine.panel, own: mine.own === true };
    else base = { ...(await readStored(sb, showId, named)), own: false };

    const head = await diff(base.head, headDoc, pace);
    const pan = await diff(base.panel, panelDoc, pace);
    const title = canonicalJson(columns.title);
    const profile = canonicalJson(columns.profile);
    let whole = !base.head || !base.panel;
    let sendAll = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // Only parts the stored head does not name (all of them once the server said one is missing).
      const sending = sendAll ? parts : parts.filter((p) => !base.refs.has(p.d));
      const unique = [...new Map(sending.map((p) => [p.d, p] as const)).values()];
      // Images first: only those no part of this account's productions names.
      const hashes = [...new Set(unique.flatMap((p) => p.assets))];
      if (hashes.length) {
        const missing = await rpc<string[]>(sb, 'control_assets_missing', { p_show: showId, p_hashes: hashes });
        for (const h of missing ?? []) {
          const data = unique.find((p) => p.data.has(h))?.data.get(h);
          // Over the server's cap for one image (G4 section 3): this publish goes whole.
          if (data && data.length > ASSET_PUT_CAP) throw new Fallback('an image over the 40 MB cap of one put');
          if (data) await rpc<string>(sb, 'control_asset_put', { p_show: showId, p_data: data });
        }
      }
      const ownBase = base.own && !whole;
      const cols: Record<string, unknown> = { bindings: columns.bindings, sources: columns.sources, collections: columns.collections, ...(columns.team_id ? { team_id: columns.team_id } : {}) };
      if (!ownBase || mine?.title !== title) cols.title = columns.title;
      if (!ownBase || mine?.profile !== profile) cols.profile = columns.profile;
      const { g: _g, t: _t, ...ver } = stamp;
      const answer = await rpc<Record<string, unknown> | null>(sb, 'control_publish_parts', {
        p_id: showId,
        p_named_n: named,
        p_ver: ver,
        p_head: whole ? { whole: headDoc, units: { f: 1, m: head.map } } : { ops: head.ops as PatchOp[] },
        p_panel: whole ? { whole: panel, units: { f: 1, m: pan.map } } : { ops: pan.ops as PatchOp[] },
        p_parts: unique.map((p) => ({ d: p.d, body: p.body, assets: p.assets })),
        p_columns: cols,
      });
      const a = answer ?? {};
      if (a.landed === true) {
        held.set(showId, { own: true, n: stamp.n, head: head.map, panel: pan.map, refs: new Set(refs.map((r) => r.p)), title, profile });
        return { kind: 'landed', ver: stamp, brand: a.brand ?? null, answer: a };
      }
      if (a.gone === true) return { kind: 'gone' };
      if (a.part_conflict === true) throw new Fallback('a part name the server holds for another body');
      if (a.moved === true) {
        held.delete(showId);
        return { kind: 'moved' };
      }
      if (a.replaced === true) {
        if (whole) throw new Fallback('the whole head was refused');
        whole = true;
        continue;
      }
      if (a.missing_parts === true) {
        if (sendAll) throw new Fallback('parts missing after sending them all');
        sendAll = true;
        continue;
      }
      if (Array.isArray(a.missing_assets)) continue; // the images are checked again on the next attempt
      throw new Fallback('an answer this build does not know');
    }
    throw new Fallback('three attempts');
  } catch (e) {
    if (e instanceof Fallback) {
      held.delete(showId);
      // Reported, so a publish that keeps going whole is visible (G4 section 4).
      console.warn(`[control] publish in parts went whole: ${e.message.slice(0, 200)}`);
      return { kind: 'fallback', why: e.message };
    }
    throw e;
  }
}

/** Read a production's stored publication maps and references when its page opens (G4 section 1),
 *  so its first publish in parts reads nothing inside the edit. Title and profile are not known
 *  from the server, so that publish still sends them. */
export async function prefetchPublishedBase(sb: Sb, showId: string): Promise<void> {
  if (held.has(showId)) return;
  const { data, error } = await sb.from('control_shows').select('n:published_ver->n').eq('id', showId).maybeSingle();
  const n = (data as { n?: unknown } | null)?.n;
  if (error || typeof n !== 'number') return;
  const stored = await readStored(sb, showId, n).catch(() => null);
  if (!stored || !stored.head || !stored.panel || held.has(showId)) return;
  held.set(showId, { n, head: stored.head, panel: stored.panel, refs: stored.refs, title: '', profile: '' });
}

/** A stored publication's cue boxes and the stamp they were read at, or written with. */
export interface BoxSnapshot {
  /** The stamp's identity (`stampKey`): a carried box is the stored one only while the stamp a
   *  publish builds on is this one (an unpublish restarts `n`, so `n` alone is not enough). */
  ver: string;
  boxes: Map<string, PublishedBox>;
}

/** A stamp's identity: its number and the time it was written. */
export const stampKey = (ver: { n?: unknown; at?: unknown } | null | undefined): string | null =>
  ver && typeof ver.n === 'number' && typeof ver.at === 'string' ? `${ver.n}|${ver.at}` : null;

/** Each production's stored cue boxes: the read made when it last opened, or what this page's own
 *  last publish wrote, whichever came later. A read that failed is not kept, so the next publish
 *  reads again. */
const publishedBoxes = new Map<string, Promise<BoxSnapshot | null>>();

/** Read the stored publication's stamp and cue boxes in one request (null: the read failed). */
export function readPublishedBoxes(sb: Sb, showId: string): Promise<BoxSnapshot | null> {
  const read = (async (): Promise<BoxSnapshot | null> => {
    const { data, error } = await sb.from('control_shows').select('cues:output->cues, ver:output->ver').eq('id', showId).maybeSingle();
    const row = data as { cues?: unknown; ver?: { n?: unknown; at?: unknown; g?: unknown } | null } | null;
    const ver = stampKey(row?.ver);
    return error || !ver ? null : { ver, boxes: publishedBoxesOf(row?.cues, row?.ver?.g) };
  })().catch(() => null);
  publishedBoxes.set(showId, read);
  void read.then((snap) => {
    if (!snap && publishedBoxes.get(showId) === read) publishedBoxes.delete(showId);
  });
  return read;
}

/** This page's own publish landed: what it wrote is the stored publication now, so it replaces the
 *  snapshot (a read still in flight was started before it and no longer stands for the store). */
export function notePublishedBoxes(showId: string, ver: PayloadVersion, cues: unknown): void {
  const key = stampKey(ver);
  if (key) publishedBoxes.set(showId, Promise.resolve({ ver: key, boxes: publishedBoxesOf(cues, ver.g) }));
}

/** With parts on, when the production opens: the stored boxes read afresh (a publication made since
 *  an earlier visit of this page load is then the one read), so a publish before the page has
 *  measured a cue keeps its box (keptGeometry.ts `publishBox`). */
export function prefetchPublishedBoxes(sb: Sb, showId: string): Promise<void> {
  return readPublishedBoxes(sb, showId).then(() => undefined);
}

/** The stored boxes a publish builds with: the snapshot, waited for, or a read of its own when there
 *  is none (null: none could be read; the publish then carries only what the page measured). */
export async function storedBoxes(showId: string, sbOf: () => Promise<Sb | null> = getSupabase): Promise<BoxSnapshot | null> {
  const known = publishedBoxes.get(showId);
  if (known) return known;
  const sb = await sbOf();
  return sb ? readPublishedBoxes(sb, showId) : null;
}

/** The stamp a publish's boxes were carried from (`appearanceFor` marks the function it answers when
 *  it carried any), so a publish that finds the stored stamp moved builds again rather than land a
 *  carried box on another publication. */
export const carriedFrom = (publishedOf: unknown): string | undefined => (publishedOf as { carriedFrom?: string } | undefined)?.carriedFrom;

/** What this page's own last publish of each production wrote: the stamp, the revision, the OBS
 *  scenes and the panel (until this page publishes, the publication as read when the production
 *  opened, `prefetchPublication`). While the stored stamp is that one, a publish uses it instead of
 *  reading it (G4 section 11); a stale one answers `moved`, and the caller forgets it and reads. */
export interface OwnPublish {
  ver: PayloadVersion;
  rev: number | null;
  scenes: unknown[];
  panel: PanelGraphicSpec[];
}
const ownPublishes = new Map<string, OwnPublish>();
export const ownPublish = (id: string): OwnPublish | null => ownPublishes.get(id) ?? null;
export const noteOwnPublish = (id: string, own: OwnPublish): void => void ownPublishes.set(id, own);
export const forgetOwnPublish = (id: string): void => void ownPublishes.delete(id);

/** When this page last pruned each production's old log rows: at most hourly with parts on, as a
 *  publish now follows every save. */
const prunedAt = new Map<string, number>();
export function pruneDue(id: string): boolean {
  if (Date.now() - (prunedAt.get(id) ?? 0) <= 3_600_000) return false;
  prunedAt.set(id, Date.now());
  return true;
}

/** Tests only. */
export function forgetPublishedParts(): void {
  ownPublishes.clear();
  held.clear();
  partMemo.clear();
  publishedBoxes.clear();
}
