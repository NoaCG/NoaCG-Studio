// "ANOTHER SYSTEM" (docs/work-specs/data-sources/spec.md, phase C5; AC-3, AC-7, AC-8): the data
// key as one source. An outside system (a results service, a timing system, a script) writes the
// production's tree through `PATCH /api/data/patch`; the fields it fills are connected to paths
// under `api.`, one group per graphic, through the cue editor's Connect data… like any source.
//
// Everything here is plain and runs in Node (scripts/data-pause.test.mjs): the paths a graphic's
// fields are offered, the example the card generates from the connected destinations, and the
// words of the receipt and Pause. The card is in home/ProductionDataWorkspace.tsx; the Pause
// itself is the database's (supabase/migrations/0100_data_api_pause.sql).

import type { OfferedValue, ProductionBindings } from '../model/productionData';

/** The first segment every path Another system fills starts with. */
export const API_PREFIX = 'api';

export const isApiPath = (path: string | null | undefined): boolean => !!path && path.startsWith(`${API_PREFIX}.`);

/** A path segment from a name: lower case, letters and digits joined by `_` (never a dot). */
export function pathKey(name: string, fallback: string): string {
  const key = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return key === '' ? fallback : key.slice(0, 40);
}

/** The group a graphic's fields fill: the one it already uses, else its own name, made unique
 *  against every other graphic's group so two graphics never share a path by accident (AC-8). */
export function apiGroup(bindings: ProductionBindings | undefined, graphic: string): string {
  const groupOf = (fields: Record<string, string> | undefined): string | null => {
    for (const path of Object.values(fields ?? {})) if (isApiPath(path)) return path.split('.')[1] || null;
    return null;
  };
  const own = groupOf(bindings?.[graphic]);
  if (own) return own;
  // Every group another graphic's fields use, not only its first: a graphic bound by hand under
  // Advanced can span several.
  const taken = new Set<string>();
  for (const [g, fields] of Object.entries(bindings ?? {})) {
    if (g === graphic) continue;
    for (const path of Object.values(fields)) if (isApiPath(path) && path.split('.')[1]) taken.add(path.split('.')[1]);
  }
  const base = pathKey(graphic, 'graphic');
  let group = base;
  for (let n = 2; taken.has(group); n += 1) group = `${base}_${n}`;
  return group;
}

/**
 * The values a graphic's fields are offered when Connect data… connects it to Another system:
 * one path per field, named after the field's label, each keyed by its field so the review
 * proposes the whole graphic at once. A field already connected under `api.` keeps its path.
 */
export function apiOffers(
  bindings: ProductionBindings | undefined,
  graphic: string,
  fields: { key: string; label: string }[],
  samples: Record<string, string>,
): OfferedValue[] {
  const group = apiGroup(bindings, graphic);
  const current = bindings?.[graphic] ?? {};
  const used = new Set(Object.values(current).filter(isApiPath));
  // The next suffix to try per name, so a graphic of many same-named fields stays linear.
  const next = new Map<string, number>();
  const out: OfferedValue[] = [];
  for (const field of fields) {
    let path = isApiPath(current[field.key]) ? current[field.key] : '';
    if (!path) {
      const base = `${API_PREFIX}.${group}.${pathKey(field.label, field.key)}`;
      let n = next.get(base) ?? 2;
      path = base;
      while (used.has(path)) path = `${base}_${n++}`;
      next.set(base, n);
      used.add(path);
    }
    out.push({ path, label: field.label || field.key, sample: samples[field.key] ?? '', key: field.key });
  }
  return out;
}

/** One connected destination: the path the outside system writes and the field it fills. */
export interface ApiDestination {
  path: string;
  graphic: string;
  fieldId: string;
  label: string;
  sample: string;
}

/** Every destination connected to Another system, graphics still in the production only, in
 *  path order so the example reads the same on every render. One path filling two fields (an
 *  explicit share) is one destination. */
export function apiDestinations(
  bindings: ProductionBindings | undefined,
  graphics: { name: string; fields: { key: string; label: string }[]; values: Record<string, string> }[],
): ApiDestination[] {
  const byPath = new Map<string, ApiDestination>();
  for (const g of graphics) {
    for (const [fieldId, path] of Object.entries(bindings?.[g.name] ?? {})) {
      if (!isApiPath(path) || byPath.has(path)) continue;
      const field = g.fields.find((f) => f.key === fieldId);
      byPath.set(path, { path, graphic: g.name, fieldId, label: field?.label || fieldId, sample: g.values[fieldId] ?? '' });
    }
  }
  return [...byPath.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** The `/patch` body that writes every destination: their paths nested, each with its sample. */
export function examplePatch(destinations: ApiDestination[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const d of destinations) {
    const parts = d.path.split('.');
    let at = out;
    for (const part of parts.slice(0, -1)) {
      if (typeof at[part] !== 'object' || at[part] === null) at[part] = {};
      at = at[part] as Record<string, unknown>;
    }
    at[parts[parts.length - 1]] = d.sample;
  }
  return out;
}

/** The example as a shell command. The key is read from the environment, so the command can be
 *  copied, shown and shared without the credential in it. */
export function exampleCurl(address: string, patch: Record<string, unknown>): string {
  const body = JSON.stringify(patch, null, 2).replace(/'/g, `'\\''`);
  return [
    `curl -X PATCH ${address} \\`,
    `  -H "Authorization: Bearer $NOACG_DATA_KEY" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '${body}'`,
  ].join('\n');
}

/** The file the card downloads for the prepared sample sender (scripts/data-sample-sender.mjs):
 *  where to send, what to send and which field each path fills. Never the key. */
export function senderExample(address: string, destinations: ApiDestination[]): string {
  return `${JSON.stringify(
    {
      address,
      patch: examplePatch(destinations),
      fields: destinations.map(({ path, label, graphic, fieldId }) => ({ path, label, graphic, field: fieldId })),
    },
    null,
    2,
  )}\n`;
}

/** "Received 4 s ago", from the row's last receipt, or that nothing has arrived. */
export function receivedWords(receivedAt: string | null, now: number): string {
  const at = receivedAt ? Date.parse(receivedAt) : NaN;
  if (!Number.isFinite(at)) return 'Nothing received yet';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return `Received ${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `Received ${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `Received ${h} h ago` : `Received ${new Date(at).toLocaleString()}`;
}
