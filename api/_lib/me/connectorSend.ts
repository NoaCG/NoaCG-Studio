// THE REMOTE MCP CONNECTOR'S SEND TOOL (docs/REMOTE_MCP_PLAN.md, AC-4): `noacg_send_package` puts
// a production's graphics and rundown on the user's Home, WAITING for them to press Install -
// the same waiting row the CLI's package door writes (packages.ts, migration 0065), never a
// production, and never a change to anything that already exists.
//
// THE SERVER NEVER RUNS GRAPHIC CODE (key decision 5). A package entry is either
//
//   a RECIPE   catalog ids (type, design, palette, font) and values by the type's LOGICAL field
//              keys, checked here against the build-time catalog index and stored as a pack
//              RECIPE entry; the studio builds it at Install with the bridge scaffold's own
//              function and validates it through the export gate like any graphic;
//   a COPY     one of the user's OWN library graphics by id, its sources copied as data (a
//              stored asset is read back out of the user's own Storage folder).
//
// A brand is one of the user's OWN saved looks by id, carried into the pack as data and applied
// at Install. "Own" means `user_id` is the caller: a team production can name a teammate's look
// or graphic (phase 3), and those ids are refused here like any id the user does not have.
//
// THE ORDER OF THE CHECKS, and nothing is stored until all of them pass:
//   1. the per-principal send budget (every call counts);
//   2. the arguments' shape, the recipes against the catalog index, the ids against the store;
//   3. the cue values against each graphic's fields (logical keys for a recipe, SPX ids for a
//      copy) - a recipe's are translated to SPX ids here, so the stored rundown speaks one key;
//   4. the package door's own shape guard (packageSaveShape) over the pack it built;
//   5. the waiting cap; then the INSERT, with `origin` naming the client and grant.

import { serviceRoleDb, supabaseAgentAccessStore, type NewWaitingPackage } from '../agentAccessStore.js';
import { checkConnectorSendRateLimit } from '../rateLimit.js';
import { MAX_WAITING_PACKAGES } from './packages.js';
import { PACKAGE_LIMITS, packageSaveShape } from './packageShape.js';
import { packageLink } from './deliveryReceipt.js';
import { readCatalogIndex } from './connectorTools.js';
import type { McpTool, McpToolResult } from './mcp.js';
import type { CatalogIndex, CatalogType } from '../../../src/templates/catalogIndex.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** What the studio's sync writes in place of an asset's bytes (src/backend/assets.ts). */
const STORAGE_SENTINEL = 'spx-storage:';
const ASSET_BUCKET = 'user-assets';

/** One of the user's own library graphics, as stored. */
export interface StoredGraphic {
  name: string;
  /** The stored template (model/types.ts SpxTemplate), assets possibly as Storage references. */
  template: Record<string, unknown>;
}

/** One of the user's own saved looks, as stored. */
export interface StoredLook {
  name: string;
  /** model/brand.ts ProjectBrand, assets possibly as Storage references. */
  brand: Record<string, unknown>;
}

/** What the send tool reads and writes. Every read is scoped by the user id it is given. */
export interface SendStore {
  graphics(userId: string, ids: readonly string[]): Promise<Map<string, StoredGraphic>>;
  look(userId: string, id: string): Promise<StoredLook | null>;
  /** A stored asset of the user's own as a data URL; null when it is not there. */
  asset(userId: string, key: string): Promise<string | null>;
  countWaitingPackages(userId: string): Promise<number>;
  insertPackage(userId: string, row: NewWaitingPackage): Promise<string>;
}

export function supabaseSendStore(): SendStore {
  const packages = supabaseAgentAccessStore();
  return {
    async graphics(userId, ids) {
      if (ids.length === 0) return new Map();
      const db = await serviceRoleDb();
      const { data, error } = await db
        .from('documents')
        .select('id, name:body->>name, template:body->template')
        .eq('user_id', userId)
        .eq('kind', 'graphic')
        .eq('deleted', false)
        .in('id', [...ids]);
      if (error) throw new Error(error.message);
      return new Map(
        ((data ?? []) as Array<Record<string, unknown>>)
          .filter((r) => r.template && typeof r.template === 'object')
          .map((r) => [String(r.id), { name: String(r.name ?? ''), template: r.template as Record<string, unknown> }]),
      );
    },
    async look(userId, id) {
      const db = await serviceRoleDb();
      const { data, error } = await db
        .from('documents')
        .select('name:body->>name, brand:body->brand')
        .eq('user_id', userId)
        .eq('kind', 'look')
        .eq('deleted', false)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const row = data as { name?: unknown; brand?: unknown } | null;
      return row?.brand && typeof row.brand === 'object' ? { name: String(row.name ?? ''), brand: row.brand as Record<string, unknown> } : null;
    },
    async asset(_userId, key) {
      const db = await serviceRoleDb();
      const { data, error } = await db.storage.from(ASSET_BUCKET).download(key);
      if (error || !data) return null;
      const bytes = Buffer.from(await data.arrayBuffer()).toString('base64');
      return `data:${data.type || 'application/octet-stream'};base64,${bytes}`;
    },
    countWaitingPackages: (userId) => packages.countWaitingPackages(userId),
    insertPackage: (userId, row) => packages.insertPackage(userId, row),
  };
}

// ── results ─────────────────────────────────────────────────────────────────────────────

const refusal = (text: string): McpToolResult => ({ isError: true, content: [{ type: 'text', text }] });

/** A refusal raised while reading the arguments: the sentence the model gets back. */
class Refusal extends Error {}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Values as strings, the SPX update() contract; a number or a boolean is written as one. */
function valuesOf(raw: unknown, where: string): Record<string, string> {
  if (raw === undefined) return {};
  if (!isRecord(raw)) throw new Refusal(`${where}: \`values\` must be an object of strings.`);
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'string') out[k] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
    else throw new Refusal(`${where}: the value of "${k}" must be a string.`);
  }
  return out;
}

const list = (items: readonly string[]) => items.map((i) => `"${i}"`).join(', ');

// ── the package, read from the arguments ────────────────────────────────────────────────

interface RecipeEntry {
  kind: 'recipe';
  name: string;
  layer?: number;
  type: CatalogType;
  recipe: { type: string; design: string; palette?: string; font?: string; values?: Record<string, string> };
}

interface CopyEntry {
  kind: 'copy';
  name: string;
  layer?: number;
  id: string;
}

type Entry = RecipeEntry | CopyEntry;

/** The logical keys a recipe may fill: every field but the logo slot, which the brand fills. */
const valueKeys = (type: CatalogType) => type.fields.filter((f) => f.role !== 'logo');

function recipeEntry(g: Record<string, unknown>, name: string, where: string, index: CatalogIndex): RecipeEntry {
  const typeId = text(g.type);
  const type = index.types.find((t) => t.id === typeId);
  if (!type) throw new Refusal(`${where}: the catalog has no type "${typeId}". noacg_catalog lists the types.`);
  const design = text(g.design);
  if (!type.designs.some((d) => d.id === design)) {
    throw new Refusal(`${where}: "${design}" is not a design of ${type.id}. Its designs: ${list(type.designs.map((d) => d.id))}.`);
  }
  const palette = text(g.palette);
  if (palette && !index.palettes.some((p) => p.id === palette)) throw new Refusal(`${where}: the catalog has no palette "${palette}". noacg_catalog lists them.`);
  const font = text(g.font);
  if (font && !index.fonts.some((f) => f.id === font)) throw new Refusal(`${where}: the catalog has no font "${font}". noacg_catalog lists them.`);
  const values = valuesOf(g.values, where);
  for (const [key, value] of Object.entries(values)) {
    const field = valueKeys(type).find((f) => f.key === key);
    if (!field) throw new Refusal(`${where}: ${type.id} has no field "${key}". Its field keys: ${list(valueKeys(type).map((f) => f.key))}.`);
    if (field.options?.length && !field.options.includes(value)) {
      throw new Refusal(`${where}: "${value}" is not a choice of ${key}. Its choices: ${list(field.options)}.`);
    }
  }
  // A TEXT LINE the recipe leaves out is blank, never the design's sample text: the phase 4 check
  // aired a church's card reading "ELECTIONS 2026". Text lines are the words a show says; a cue
  // fills them. Everything else (a score or a goal line, which is a number; a clock, a "LIVE"
  // word, a choice) keeps the design's default, a working setting rather than sample copy.
  for (const field of type.fields) {
    if (!field.role && (field.kind === 'text' || field.kind === 'lines') && !(field.key in values)) values[field.key] = '';
  }
  return {
    kind: 'recipe',
    name,
    type,
    recipe: { type: type.id, design, ...(palette ? { palette } : {}), ...(font ? { font } : {}), ...(Object.keys(values).length ? { values } : {}) },
  };
}

/** The graphics argument as entries, every recipe checked against the index. */
function readEntries(raw: unknown, index: CatalogIndex): Entry[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Refusal('`graphics` must list at least one graphic.');
  if (raw.length > PACKAGE_LIMITS.graphics) throw new Refusal(`A package holds at most ${PACKAGE_LIMITS.graphics} graphics.`);
  const names = new Set<string>();
  return raw.map((g, i) => {
    if (!isRecord(g)) throw new Refusal(`Graphic ${i + 1} is not an object.`);
    const name = text(g.name);
    const where = `Graphic ${i + 1}${name ? ` ("${name}")` : ''}`;
    if (!name) throw new Refusal(`${where} needs a name.`);
    if (names.has(name)) throw new Refusal(`Two graphics are both named "${name}"; names are unique in a package.`);
    names.add(name);
    const layer = g.layer === undefined ? undefined : Number(g.layer);
    if (layer !== undefined && (!Number.isInteger(layer) || layer < 1 || layer > 100)) throw new Refusal(`${where}: \`layer\` must be a whole number from 1 to 100.`);
    const id = text(g.graphic);
    const recipe = text(g.type) || text(g.design);
    if (id && recipe) throw new Refusal(`${where}: give either \`graphic\` (a library graphic id) or \`type\` and \`design\` (a catalog recipe), not both.`);
    const entry: Entry = id
      ? copyEntry(g, id, name, where)
      : recipe
        ? recipeEntry(g, name, where, index)
        : (() => {
            throw new Refusal(`${where}: give \`type\` and \`design\` from noacg_catalog, or \`graphic\`, an id from noacg_library.`);
          })();
    return layer === undefined ? entry : { ...entry, layer };
  });
}

function copyEntry(g: Record<string, unknown>, id: string, name: string, where: string): CopyEntry {
  if (g.values !== undefined || g.palette !== undefined || g.font !== undefined) {
    throw new Refusal(`${where}: a library graphic is copied as it is; set its values in \`cues\`, by its field ids.`);
  }
  if (!UUID.test(id)) throw new Refusal(`${where}: "${id}" is not a graphic id. noacg_library lists the user's graphics.`);
  return { kind: 'copy', name, id };
}

interface ReadCue {
  graphic: string;
  label: string;
  values: Record<string, string>;
}

function readCues(raw: unknown, entries: readonly Entry[]): ReadCue[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Refusal('`cues` must be a list.');
  if (raw.length > PACKAGE_LIMITS.cues) throw new Refusal(`A package carries at most ${PACKAGE_LIMITS.cues} cues.`);
  return raw.map((c, i) => {
    const where = `Cue ${i + 1}`;
    if (!isRecord(c)) throw new Refusal(`${where} is not an object.`);
    const graphic = text(c.graphic);
    if (!entries.some((e) => e.name === graphic)) throw new Refusal(`${where} names "${graphic}", which is not a graphic in this package. Its graphics: ${list(entries.map((e) => e.name))}.`);
    const label = text(c.label);
    if (!label) throw new Refusal(`${where} needs a label.`);
    return { graphic, label, values: valuesOf(c.values, where) };
  });
}

// ── stored data, copied ─────────────────────────────────────────────────────────────────

/** A deep copy of `body` with every asset the studio's sync moved to Storage read back as a data
 *  URL - only from the user's own folder, which is the only place their own records point. */
async function withAssetData<T>(body: T, userId: string, store: SendStore, what: string): Promise<T> {
  const clone = JSON.parse(JSON.stringify(body)) as T;
  const nodes: Array<{ data: string }> = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!isRecord(v)) return;
    if (typeof v.path === 'string' && typeof v.data === 'string' && v.data.startsWith(STORAGE_SENTINEL)) nodes.push(v as { data: string });
    Object.values(v).forEach(walk);
  };
  walk(clone);
  for (const node of nodes) {
    const key = node.data.slice(STORAGE_SENTINEL.length);
    const data = key.startsWith(`${userId}/`) ? await store.asset(userId, key) : null;
    if (!data) throw new Refusal(`A file of ${what} could not be read. Opening it in NoaCG once lets it sync; then send again.`);
    node.data = data;
  }
  return clone;
}

/** A library graphic as a pack file entry: its sources, assets inlined, nothing else. */
function copiedEntry(entry: CopyEntry, template: Record<string, unknown>): Record<string, unknown> {
  const resolution = isRecord(template.resolution) ? { width: template.resolution.width, height: template.resolution.height } : undefined;
  const assets = Array.isArray(template.assets) ? (template.assets as Array<{ path: unknown; data: unknown }>).map((a) => ({ path: a?.path, data: a?.data })) : [];
  return {
    name: entry.name,
    type: template.type,
    ...(entry.layer !== undefined ? { layer: entry.layer } : {}),
    html: template.html,
    css: template.css,
    js: template.js,
    ...(assets.length ? { assets } : {}),
    ...(resolution ? { resolution } : {}),
    ...(typeof template.fps === 'number' ? { fps: template.fps } : {}),
  };
}

/** A cue's values keyed by SPX field id: a recipe's logical keys become the `fN` they compile
 *  to (the type's declaration order, templates/types/graphicType.ts typeFieldsToSpx); a copy's
 *  must already be its own field ids. */
function cueValues(cue: ReadCue, where: string, entry: Entry, copyFields: Map<string, string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  if (entry.kind === 'recipe') {
    for (const [key, value] of Object.entries(cue.values)) {
      const at = entry.type.fields.findIndex((f) => f.key === key && f.role !== 'logo');
      if (at < 0) throw new Refusal(`${where}: ${entry.type.id} has no field "${key}". Its field keys: ${list(valueKeys(entry.type).map((f) => f.key))}.`);
      out[`f${at}`] = value;
    }
    return out;
  }
  const ids = copyFields.get(entry.name) ?? [];
  for (const [key, value] of Object.entries(cue.values)) {
    if (!ids.includes(key)) throw new Refusal(`${where}: "${entry.name}" has no field "${key}". Its field ids: ${list(ids)}.`);
    out[key] = value;
  }
  return out;
}

// ── the tool ────────────────────────────────────────────────────────────────────────────

export interface SendToolDeps {
  store?: SendStore;
  fetch?: typeof fetch;
}

const STRINGS = { type: 'object', additionalProperties: { type: 'string' } } as const;

export function createSendTool(deps: SendToolDeps = {}): McpTool {
  const storeOf = () => deps.store ?? supabaseSendStore();
  return {
    name: 'noacg_send_package',
    title: 'Send a package to Home',
    description:
      "Put a production's graphics and rundown on the user's NoaCG Home, waiting for them to press Install. Each graphic is a catalog recipe (type, design, values by field key) or a copy of a library graphic (graphic id). Returns the link.",
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Production name' },
        description: { type: 'string' },
        brand: { type: 'string', description: 'A brand id from noacg_library, applied to every graphic' },
        graphics: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Unique in the package' },
              type: { type: 'string', description: 'Catalog type id' },
              design: { type: 'string', description: 'A design id of that type' },
              palette: { type: 'string' },
              font: { type: 'string' },
              values: { ...STRINGS, description: "By the type's field keys. Text lines (no role) left out are blank; other fields keep the design's default" },
              graphic: { type: 'string', description: 'A library graphic id, instead of type and design' },
              layer: { type: 'integer', minimum: 1, maximum: 100 },
            },
            required: ['name'],
          },
        },
        cues: {
          type: 'array',
          description: 'The rundown, in order',
          items: {
            type: 'object',
            properties: {
              graphic: { type: 'string', description: 'A graphic name above' },
              label: { type: 'string' },
              values: { ...STRINGS, description: 'Field keys for a recipe, field ids for a copy' },
            },
            required: ['graphic', 'label'],
          },
        },
      },
      required: ['name', 'graphics'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    permission: 'graphics:create',
    async call(principal, args, ctx) {
      const userId = principal.userId!;
      const budget = checkConnectorSendRateLimit(userId);
      if (budget) return refusal(`Too many packages sent in a short time. Wait ${budget.retryAfterSec} seconds, then send again.`);
      const store = storeOf();
      try {
        const name = text(args.name);
        if (!name) throw new Refusal('`name` is required: the production name the user will see on Home.');
        const index = await readCatalogIndex(ctx.origin, deps.fetch);
        const entries = readEntries(args.graphics, index);
        const cues = readCues(args.cues, entries);

        // The user's own graphics and brand, by id; anything else is refused by name.
        const copies = entries.filter((e): e is CopyEntry => e.kind === 'copy');
        const stored = await store.graphics(userId, [...new Set(copies.map((e) => e.id))]);
        const missing = copies.find((e) => !stored.has(e.id));
        if (missing) throw new Refusal(`"${missing.name}": no graphic "${missing.id}" in this user's own library. noacg_library lists their graphics; a teammate's cannot be sent.`);
        const brandId = text(args.brand);
        if (brandId && !UUID.test(brandId)) throw new Refusal(`"${brandId}" is not a brand id. noacg_library lists the user's brands.`);
        const look = brandId ? await store.look(userId, brandId) : null;
        if (brandId && !look) throw new Refusal(`No brand "${brandId}" among this user's own brands. noacg_library lists them; a teammate's cannot be used.`);

        const files: Array<Record<string, unknown>> = [];
        const copyFields = new Map<string, string[]>();
        for (const entry of entries) {
          if (entry.kind === 'recipe') {
            files.push({ name: entry.name, recipe: entry.recipe, ...(entry.layer !== undefined ? { layer: entry.layer } : {}) });
            continue;
          }
          const template = await withAssetData(stored.get(entry.id)!.template, userId, store, `"${entry.name}"`);
          const fields = Array.isArray(template.fields) ? (template.fields as Array<{ field?: unknown }>) : [];
          copyFields.set(entry.name, fields.flatMap((f) => (typeof f?.field === 'string' ? [f.field] : [])));
          files.push(copiedEntry(entry, template));
        }
        const rundown = cues.map((cue, i) => ({
          graphic: cue.graphic,
          label: cue.label,
          values: cueValues(cue, `Cue ${i + 1}`, entries.find((e) => e.name === cue.graphic)!, copyFields),
        }));
        const brand = look ? { id: brandId, name: look.name || 'Brand', look: await withAssetData(look.brand, userId, store, 'the brand') } : undefined;

        // The package door's own guard over what was built: one format, one set of limits.
        const shaped = packageSaveShape({
          format: 'noacg-pack',
          version: 1,
          name,
          description: text(args.description),
          graphics: files,
          ...(rundown.length ? { cues: rundown } : {}),
          ...(brand ? { brand } : {}),
        });
        if (!shaped.ok) throw new Refusal(shaped.reason);

        if ((await store.countWaitingPackages(userId)) >= MAX_WAITING_PACKAGES) {
          throw new Refusal(`${MAX_WAITING_PACKAGES} packages are already waiting on the user's Home → Productions. Ask them to install or dismiss some, then send again.`);
        }
        const id = await store.insertPackage(userId, {
          name: shaped.pack.name,
          description: shaped.pack.description,
          graphicCount: shaped.pack.graphics.length,
          origin: { tool: 'noacg-connector', ...(principal.clientId ? { client: principal.clientId } : {}), ...(principal.grantId ? { grant: principal.grantId } : {}) },
          body: shaped.pack,
        });
        const url = packageLink(ctx.origin, id);
        const data = { id, url, graphics: shaped.pack.graphics.length, cues: rundown.length };
        return {
          content: [{ type: 'text', text: `Sent "${shaped.pack.name}" to the user's Home: ${url}. It waits there until they press Install.` }],
          structuredContent: data,
        };
      } catch (e) {
        if (e instanceof Refusal) return refusal(e.message);
        throw e;
      }
    },
  };
}
