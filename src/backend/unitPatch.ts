// ONLY WHAT CHANGED (docs/work-specs/live-publishing/designs/G4.md section 1).
//
// A document (a production record, a publication's head, its panel) is sent in UNITS: each
// top-level member is one, except a KEYED LIST, an array whose elements are all objects carrying
// the same unique string identity (`id`, else `key`, else `name`), where each element is a unit of
// its own and the identities' order is one more. A unit's DIGEST is SHA-256 over its canonical JSON
// (keys sorted), first 128 bits, hex.
//
// `diff(base, doc)` leaves a unit out only when its digest equals the one the base's map holds for
// it (R2); the server applies the patch only to that base's revision (R1), so what is left out is
// on the server. `applyPatch` is the reference the database's `unit_patch_apply` is tested against
// (R3).

export type Identity = 'id' | 'key' | 'name';
const IDENTITIES: Identity[] = ['id', 'key', 'name'];

/** A keyed list's map entry: its identity, the order and each element's digest. */
export interface KeyedEntry {
  by: Identity;
  order: string[];
  d: Record<string, string>;
}
/** One member's map entry: the member's digest, or a keyed list's entry. */
export type UnitEntry = string | KeyedEntry;
/** Every member's entry. */
export type UnitMap = Record<string, UnitEntry>;

/** One operation of a patch. `u` is the member's new map entry, so the server keeps the map. */
export type PatchOp =
  | { m: string; set: unknown; u: UnitEntry }
  | { m: string; drop: true }
  | { m: string; by: Identity; put: { v: unknown; d: string }[]; del: string[]; order?: string[]; len: number };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The text JSON.stringify would write, with every object's keys sorted. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const text = JSON.stringify(value);
    return text === undefined ? 'null' : text;
  }
  if (typeof (value as { toJSON?: unknown }).toJSON === 'function') return canonicalJson((value as { toJSON: () => unknown }).toJSON());
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined || typeof v === 'function' ? 'null' : canonicalJson(v))).join(',')}]`;
  const keys = Object.keys(value).sort();
  const parts: string[] = [];
  for (const k of keys) {
    const v = (value as Record<string, unknown>)[k];
    if (v === undefined || typeof v === 'function' || typeof v === 'symbol') continue;
    parts.push(`${JSON.stringify(k)}:${canonicalJson(v)}`);
  }
  return `{${parts.join(',')}}`;
}

const encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

/** SHA-256 of `text` in hex, its first `bytes` bytes (all 32 by default). */
export async function sha256Hex(text: string, bytes = 32): Promise<string> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle || !encoder) throw new Error('No Web Crypto: nothing can be named by its content');
  const digest = new Uint8Array(await subtle.digest('SHA-256', encoder.encode(text)));
  let hex = '';
  for (let i = 0; i < bytes; i += 1) hex += digest[i].toString(16).padStart(2, '0');
  return hex;
}

/** SHA-256 of `text`, first 128 bits, hex. */
export const digest128 = (text: string): Promise<string> => sha256Hex(text, 16);

/** Digests already made, by object: an element that is the same object as last time is not
 *  stringified again. Objects only; a document is never mutated in place by its writers. */
const memo = new WeakMap<object, string>();

export async function unitDigest(value: unknown): Promise<string> {
  if (typeof value === 'object' && value !== null) {
    const known = memo.get(value);
    if (known) return known;
    const d = await digest128(canonicalJson(value));
    memo.set(value, d);
    return d;
  }
  return digest128(canonicalJson(value));
}

/** The identity a keyed list is keyed by, or null when the array is not one. */
export function keyedBy(value: unknown): Identity | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  for (const by of IDENTITIES) {
    const seen = new Set<string>();
    let ok = true;
    for (const el of value) {
      if (!isObject(el) || typeof el[by] !== 'string' || seen.has(el[by] as string)) {
        ok = false;
        break;
      }
      seen.add(el[by] as string);
    }
    if (ok) return by;
  }
  return null;
}

/** The members JSON would write, in order. */
function members(doc: Record<string, unknown>): [string, unknown][] {
  return Object.keys(doc)
    .filter((k) => doc[k] !== undefined && typeof doc[k] !== 'function' && typeof doc[k] !== 'symbol')
    .map((k) => [k, doc[k]]);
}

async function entryOf(value: unknown, pace?: () => Promise<void>): Promise<UnitEntry> {
  const by = keyedBy(value);
  if (!by) {
    if (pace) await pace();
    return unitDigest(value);
  }
  const list = value as Record<string, unknown>[];
  const d: Record<string, string> = {};
  const order: string[] = [];
  for (const el of list) {
    const id = el[by] as string;
    order.push(id);
    if (pace) await pace();
    d[id] = await unitDigest(el);
  }
  return { by, order, d };
}

/** The unit map of a document. */
export async function unitMap(doc: Record<string, unknown>, pace?: () => Promise<void>): Promise<UnitMap> {
  const map: UnitMap = {};
  for (const [k, v] of members(doc)) map[k] = await entryOf(v, pace);
  return map;
}

/** The format every map this build writes and trusts carries (G4 Terms). */
export const UNIT_FORMAT = 1;

/** A stored map, as the server keeps it: `{f, m, rev}` or `{f, m, n}`. A map of another format, or
 *  with no members, is no base. */
export function storedMap(value: unknown): UnitMap | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as { f?: unknown; m?: unknown };
  if (v.f !== UNIT_FORMAT || !v.m || typeof v.m !== 'object' || Array.isArray(v.m)) return null;
  return v.m as UnitMap;
}

const sameOrder = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * The patch from `base` (the stored document's map) to `doc`, and `doc`'s own map. With no base,
 * every member is set (a whole write in patch form).
 */
export async function diff(
  base: UnitMap | null,
  doc: Record<string, unknown>,
  /** Awaited before each member is digested, so a page's Takes go first (G4 R18). */
  pace?: () => Promise<void>,
): Promise<{ ops: PatchOp[]; map: UnitMap }> {
  const map: UnitMap = {};
  const ops: PatchOp[] = [];
  const present = new Set<string>();
  for (const [m, value] of members(doc)) {
    present.add(m);
    const now = await entryOf(value, pace);
    map[m] = now;
    const was = base ? base[m] : undefined;
    if (typeof now === 'string') {
      if (was !== now) ops.push({ m, set: value, u: now });
      continue;
    }
    if (!was || typeof was === 'string' || was.by !== now.by) {
      ops.push({ m, set: value, u: now });
      continue;
    }
    const list = value as Record<string, unknown>[];
    const put: { v: unknown; d: string }[] = [];
    for (const el of list) {
      const id = el[now.by] as string;
      if (was.d[id] !== now.d[id]) put.push({ v: el, d: now.d[id] });
    }
    const kept = new Set(now.order);
    const del = was.order.filter((id) => !kept.has(id));
    if (put.length === 0 && del.length === 0 && sameOrder(was.order, now.order)) continue;
    // The order the server reaches without being told: the base's, less what is deleted, then the
    // new elements in the order they are put.
    const fresh = put.map((p) => (p.v as Record<string, unknown>)[now.by] as string).filter((id) => !(id in was.d));
    const reached = was.order.filter((id) => kept.has(id)).concat(fresh);
    ops.push({ m, by: now.by, put, del, ...(sameOrder(reached, now.order) ? {} : { order: now.order }), len: now.order.length });
  }
  if (base) for (const m of Object.keys(base)) if (!present.has(m)) ops.push({ m, drop: true });
  return { ops, map };
}

/** A patch the stored document cannot take: nothing is applied. */
export class PatchRefused extends Error {}

/** The reference apply: what `unit_patch_apply` does on the server. Returns a new document. */
export function applyPatch(doc: Record<string, unknown>, ops: readonly PatchOp[]): Record<string, unknown> {
  const out: Record<string, unknown> = { ...doc };
  for (const op of ops) {
    if ('drop' in op) {
      delete out[op.m];
      continue;
    }
    if ('set' in op) {
      out[op.m] = op.set;
      continue;
    }
    const current = out[op.m];
    if (!Array.isArray(current) || (current.length > 0 && keyedBy(current) !== op.by)) throw new PatchRefused(`${op.m} is not keyed by ${op.by}`);
    const deleted = new Set(op.del);
    const byId = new Map<string, unknown>();
    for (const p of op.put) byId.set((p.v as Record<string, unknown>)[op.by] as string, p.v);
    let next: unknown[] = [];
    const placed = new Set<string>();
    for (const el of current as Record<string, unknown>[]) {
      const id = el[op.by] as string;
      if (deleted.has(id)) continue;
      next.push(byId.has(id) ? byId.get(id) : el);
      placed.add(id);
    }
    for (const [id, v] of byId) if (!placed.has(id)) next.push(v);
    if (op.order) {
      const at = new Map(next.map((el) => [(el as Record<string, unknown>)[op.by] as string, el] as const));
      if (op.order.length !== at.size || new Set(op.order).size !== op.order.length || op.order.some((id) => !at.has(id))) {
        throw new PatchRefused(`${op.m}: the order is not the list's identities`);
      }
      next = op.order.map((id) => at.get(id));
    }
    if (next.length !== op.len) throw new PatchRefused(`${op.m}: ${next.length} elements, expected ${op.len}`);
    out[op.m] = next;
  }
  return out;
}

/** The map after `ops`, kept as the server keeps it. */
export function applyToMap(map: UnitMap, ops: readonly PatchOp[], next: Record<string, unknown>): UnitMap {
  const out: UnitMap = { ...map };
  for (const op of ops) {
    if ('drop' in op) delete out[op.m];
    else if ('set' in op) out[op.m] = op.u;
    else {
      const was = out[op.m] as KeyedEntry;
      const d = { ...was.d };
      for (const id of op.del) delete d[id];
      for (const p of op.put) d[(p.v as Record<string, unknown>)[op.by] as string] = p.d;
      const order = (next[op.m] as Record<string, unknown>[]).map((el) => el[op.by] as string);
      out[op.m] = { by: op.by, order, d };
    }
  }
  return out;
}
