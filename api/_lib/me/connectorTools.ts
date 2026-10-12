// THE REMOTE MCP CONNECTOR'S READ TOOLS (docs/REMOTE_MCP_PLAN.md, AC-3): what a chat client may
// look at before it assembles a package.
//
//   noacg_catalog   public data: the catalog's types, designs, fields, palettes and fonts, from
//                   the build-time index the deployment serves (src/templates/catalogIndex.ts)
//   noacg_library   `graphics:read`: the user's graphics, brands and productions, and their
//                   teams' productions; one production's graphics and cues on request
//
// Every schema here is in the model's context in EVERY chat where the connector is added, NoaCG
// or not, so descriptions say what a tool returns and nothing about how to design; the total is
// pinned under the plan's ceiling by mcp.test.ts. There is no `noacg_guide`: reading needs no
// contract text, and what a recipe looks like belongs to the send tool's own schema (phase 4).
//
// THE LIBRARY IS READ WITH THE SERVICE ROLE, scoped by the principal's user id - never with the
// connector's token, which PostgREST refuses outright (migration 0089). Each query names the
// user or the user's own team memberships, so nothing of another account can be selected. What
// leaves is NAMES AND FIELDS: no template code, no assets, no data-URL values - a chat client
// assembles from ids, and the code stays with NoaCG (key decision 5).

import { serviceRoleDb } from '../agentAccessStore.js';
import type { McpTool, McpToolResult } from './mcp.js';
import { CATALOG_INDEX_PATH, type CatalogIndex, type CatalogType } from '../../../src/templates/catalogIndex.js';

// ── results ─────────────────────────────────────────────────────────────────────────────

function result(data: Record<string, unknown>): McpToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
}

function refusal(text: string): McpToolResult {
  return { isError: true, content: [{ type: 'text', text }] };
}

/** Lowercase words without accents; a trailing plural `s` dropped, so "scoreboards" finds
 *  "scoreboard". */
export function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

/** A query word matches a text when one of the text's words starts with it ("foot" finds
 *  "football", "score" finds "scoreboard"). */
const matches = (textWords: readonly string[], word: string) => textWords.some((w) => w.startsWith(word));

// ── noacg_catalog ───────────────────────────────────────────────────────────────────────

/** Types answered with fields and designs at most (an answer is then 9 to 17 KB); the rest are
 *  counted, and words or a category narrow them. */
export const CATALOG_MAX_TYPES = 8;
const INDEX_TTL_MS = 10 * 60_000;
let indexCache: { origin: string; at: number; index: CatalogIndex } | null = null;

/** Test seam. */
export function resetCatalogIndexCache(): void {
  indexCache = null;
}

/** The index this deployment serves, fetched from its own origin and kept per warm instance. */
export async function readCatalogIndex(origin: string, fetchFn: typeof fetch = fetch, nowMs = Date.now()): Promise<CatalogIndex> {
  if (indexCache && indexCache.origin === origin && nowMs - indexCache.at < INDEX_TTL_MS) return indexCache.index;
  const res = await fetchFn(`${origin}${CATALOG_INDEX_PATH}`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`catalog index: ${res.status}`);
  const index = (await res.json()) as CatalogIndex;
  if (index?.version !== 1 || !Array.isArray(index.types) || index.types.length === 0) throw new Error('catalog index: unreadable');
  indexCache = { origin, at: nowMs, index };
  return index;
}

export interface CatalogQuery {
  category?: string;
  query?: string;
}

/** Search the index. No category and no words: the overview (every category and type by name).
 *  Otherwise the matching types, best first, with their fields and designs. Palettes and fonts
 *  come with every answer: a recipe may name any of them. */
export function searchCatalog(index: CatalogIndex, { category = '', query = '' }: CatalogQuery): Record<string, unknown> {
  const styles = { palettes: index.palettes, fonts: index.fonts };
  const asked = wordsOf(query);
  const cat = category.trim().toLowerCase();

  if (!cat && asked.length === 0) {
    return {
      categories: index.categories.map((c) => ({
        ...c,
        types: index.types.filter((t) => t.category === c.id).map((t) => ({ id: t.id, name: t.name, designs: t.designs.length })),
      })),
      ...styles,
    };
  }

  let pool = index.types;
  if (cat) {
    const wanted = wordsOf(cat).join(' ');
    const ids = new Set(
      index.categories.filter((c) => c.id === cat || wordsOf(c.name).join(' ') === wanted || wordsOf(c.id).join(' ') === wanted).map((c) => c.id),
    );
    pool = pool.filter((t) => ids.has(t.category));
    if (pool.length === 0) {
      return { types: [], unknownCategory: category, categories: index.categories, ...styles };
    }
  }

  const categoryName = new Map(index.categories.map((c) => [c.id, c.name]));
  const ranked = pool
    .map((type) => ({ type, score: asked.length ? scoreType(type, asked, categoryName.get(type.category) ?? '') : 1 }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score);
  return {
    types: ranked.slice(0, CATALOG_MAX_TYPES).map((r) => r.type),
    ...(ranked.length > CATALOG_MAX_TYPES ? { more: ranked.length - CATALOG_MAX_TYPES } : {}),
    ...styles,
  };
}

/** Two points for a word the type itself names (its name, id, description, category, field
 *  labels), one for a word only a design names. */
function scoreType(type: CatalogType, asked: readonly string[], categoryName: string): number {
  const own = wordsOf([type.id, type.name, type.description, type.category, categoryName, ...type.fields.map((f) => f.label)].join(' '));
  const designs = wordsOf(type.designs.map((d) => `${d.id} ${d.name} ${d.description} ${d.style}`).join(' '));
  return asked.reduce((score, word) => score + (matches(own, word) ? 2 : matches(designs, word) ? 1 : 0), 0);
}

// ── noacg_library ───────────────────────────────────────────────────────────────────────

/** An SPX field as stored in a graphic's template (model/types.ts SpxField). */
interface StoredField {
  field?: unknown;
  ftype?: unknown;
  title?: unknown;
  value?: unknown;
  items?: unknown;
}

export interface LibraryGraphicRow {
  id: string;
  name: string | null;
  type: string | null;
  folder: string | null;
  updatedAt: string;
  fields: unknown;
}

export interface LibraryBrandRow {
  id: string;
  name: string | null;
  palette: unknown;
  fontId: string | null;
  customFont: string | null;
  logo: boolean;
  notes: string | null;
}

export interface LibraryProductionRow {
  id: string;
  name: string | null;
  updatedAt: string;
  brandId: string | null;
  /** The team that holds it; absent for the user's own. */
  teamId?: string;
}

export interface LibraryTeamRow {
  id: string;
  name: string;
  role: string;
}

export interface LibraryRows {
  graphics: LibraryGraphicRow[];
  brands: LibraryBrandRow[];
  productions: LibraryProductionRow[];
  teams: LibraryTeamRow[];
}

export interface ProductionDetailRow extends LibraryProductionRow {
  /** The holding team's name, when a team holds it. */
  teamName?: string;
  graphics: unknown;
  cues: unknown;
}

/** The reads behind noacg_library. Every method is scoped by the user id it is given. */
export interface LibraryStore {
  library(userId: string): Promise<LibraryRows>;
  /** One production the user owns or a team of theirs holds; null for anything else. */
  production(userId: string, id: string): Promise<ProductionDetailRow | null>;
}

/** Lists are answered newest first, this many at most; the rest are counted. */
export const LIBRARY_MAX_ROWS = 100;
/** A stored value longer than this is not repeated back (it is a paragraph, not a sample). */
const MAX_VALUE_CHARS = 200;
/** SPX field types that carry an operator value; buttons, captions, dividers and hidden
 *  runtime fields do not. */
const VALUE_FTYPES = new Set(['textfield', 'textarea', 'dropdown', 'filelist', 'number', 'checkbox', 'color']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A value worth repeating to the model: short text, never an inlined file. */
function sample(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value);
  return text.length <= MAX_VALUE_CHARS && !text.startsWith('data:') ? text : undefined;
}

/** A graphic's operator fields: id, title, type, a short current value, dropdown choices. */
export function fieldsView(stored: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(stored)) return [];
  return (stored as StoredField[])
    .filter((f) => typeof f?.field === 'string' && VALUE_FTYPES.has(String(f.ftype)))
    .map((f) => {
      const value = sample(f.value);
      const options = Array.isArray(f.items) ? (f.items as Array<{ value?: unknown }>).map((i) => sample(i?.value)).filter((v) => v !== undefined) : [];
      return {
        id: f.field,
        title: typeof f.title === 'string' ? f.title : '',
        type: f.ftype,
        ...(value === undefined || value === '' ? {} : { value }),
        ...(options.length ? { options } : {}),
      };
    });
}

function cap<T>(rows: T[]): { rows: T[]; more: number } {
  return { rows: rows.slice(0, LIBRARY_MAX_ROWS), more: Math.max(0, rows.length - LIBRARY_MAX_ROWS) };
}

/** The library as the tool answers it. Pure: the rows in, the answer out. */
export function libraryView(rows: LibraryRows, query = ''): Record<string, unknown> {
  const asked = wordsOf(query);
  const wanted = (...texts: Array<string | null | undefined>) => {
    if (asked.length === 0) return true;
    const words = wordsOf(texts.filter(Boolean).join(' '));
    return asked.every((w) => matches(words, w));
  };
  const teamName = new Map(rows.teams.map((t) => [t.id, t.name]));
  // A production moved into a team leaves a personal record of the same id behind
  // (model/teamShows.ts); the team's copy is the production.
  const teamIds = new Set(rows.productions.filter((p) => p.teamId).map((p) => p.id));

  const graphics = cap(
    rows.graphics
      .filter((g) => wanted(g.name, g.folder, g.type))
      .map((g) => ({
        id: g.id,
        name: g.name ?? '',
        type: g.type ?? '',
        ...(g.folder ? { folder: g.folder } : {}),
        updatedAt: g.updatedAt,
        fields: fieldsView(g.fields),
      })),
  );
  const brands = cap(
    rows.brands
      .filter((b) => wanted(b.name))
      .map((b) => {
        const p = b.palette && typeof b.palette === 'object' ? (b.palette as Record<string, unknown>) : null;
        return {
          id: b.id,
          name: b.name ?? '',
          ...(p ? { palette: { name: p.name, accent: p.accent, text: p.text, panel: p.panel } } : {}),
          ...(b.fontId || b.customFont ? { font: b.fontId ?? b.customFont } : {}),
          logo: b.logo,
          ...(b.notes ? { notes: b.notes } : {}),
        };
      }),
  );
  const productions = cap(
    rows.productions
      .filter((p) => (p.teamId || !teamIds.has(p.id)) && wanted(p.name, p.teamId ? teamName.get(p.teamId) : null))
      .map((p) => ({
        id: p.id,
        name: p.name ?? '',
        updatedAt: p.updatedAt,
        ...(p.brandId ? { brandId: p.brandId } : {}),
        ...(p.teamId ? { team: teamName.get(p.teamId) ?? p.teamId } : {}),
      })),
  );
  const more = { graphics: graphics.more, brands: brands.more, productions: productions.more };
  return {
    graphics: graphics.rows,
    brands: brands.rows,
    productions: productions.rows,
    teams: rows.teams,
    ...(Object.values(more).some((n) => n > 0) ? { more } : {}),
  };
}

/** One production: its graphics (pool order, with their fields) and its cues. */
export function productionView(row: ProductionDetailRow): Record<string, unknown> {
  const pool = Array.isArray(row.graphics) ? (row.graphics as Array<Record<string, unknown>>) : [];
  const nameOf = new Map(pool.map((g) => [g?.id, typeof g?.name === 'string' ? g.name : '']));
  const cues = Array.isArray(row.cues) ? (row.cues as Array<Record<string, unknown>>) : [];
  return {
    production: {
      id: row.id,
      name: row.name ?? '',
      updatedAt: row.updatedAt,
      ...(row.brandId ? { brandId: row.brandId } : {}),
      ...(row.teamId ? { team: row.teamName ?? row.teamId } : {}),
      graphics: pool.map((g) => {
        const template = g?.template && typeof g.template === 'object' ? (g.template as Record<string, unknown>) : {};
        return {
          id: g?.id,
          name: typeof g?.name === 'string' ? g.name : '',
          type: g?.type,
          ...(typeof g?.graphicId === 'string' ? { graphicId: g.graphicId } : {}),
          ...(typeof g?.layer === 'number' ? { layer: g.layer } : {}),
          fields: fieldsView(template.fields),
        };
      }),
      cues: cues.map((c) => {
        const values = c?.values && typeof c.values === 'object' ? (c.values as Record<string, unknown>) : {};
        return {
          label: typeof c?.label === 'string' ? c.label : '',
          graphic: c?.source === 'playout' ? null : (nameOf.get(c?.sourceId) ?? null),
          values: Object.fromEntries(Object.entries(values).flatMap(([k, v]) => (sample(v) === undefined ? [] : [[k, sample(v)]]))),
        };
      }),
    },
  };
}

// ── the Supabase store ──────────────────────────────────────────────────────────────────

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

export function supabaseLibraryStore(): LibraryStore {
  async function teamsOf(userId: string): Promise<LibraryTeamRow[]> {
    const db = await serviceRoleDb();
    const { data, error } = await db.from('team_members').select('role, team:teams(id, name)').eq('user_id', userId);
    if (error) throw new Error(error.message);
    return (data ?? []).flatMap((m) => {
      const team = (Array.isArray(m.team) ? m.team[0] : m.team) as { id?: string; name?: string } | null;
      return team?.id ? [{ id: team.id, name: team.name ?? '', role: String(m.role) }] : [];
    });
  }

  return {
    async library(userId) {
      const db = await serviceRoleDb();
      const docs = (kind: string, columns: string) =>
        db.from('documents').select(columns).eq('user_id', userId).eq('kind', kind).eq('deleted', false).order('updated_at', { ascending: false }).limit(1000);
      const teams = await teamsOf(userId);
      const [graphics, looks, shows, teamShows] = await Promise.all([
        docs('graphic', 'id, updated_at, name:body->>name, type:body->>type, folder:body->>folder, fields:body->template->fields'),
        docs('look', 'id, updated_at, name:body->>name, palette:body->brand->palette, fontId:body->brand->>fontId, customFont:body->brand->customFont->>family, logo:body->brand->logo->>path, notes:body->brand->>notes'),
        docs('show', 'id, updated_at, name:body->>name, brandId:body->>brandId'),
        teams.length
          ? db.from('team_productions').select('id, team_id, updated_at, name:doc->>name, brandId:doc->>brandId').in('team_id', teams.map((t) => t.id)).order('updated_at', { ascending: false }).limit(1000)
          : Promise.resolve({ data: [], error: null }),
      ]);
      for (const r of [graphics, looks, shows, teamShows]) if (r.error) throw new Error(r.error.message);
      const rowsOf = (r: { data: unknown }) => (r.data ?? []) as Array<Record<string, unknown>>;
      return {
        graphics: rowsOf(graphics).map((r) => ({ id: String(r.id), name: str(r.name), type: str(r.type), folder: str(r.folder), updatedAt: String(r.updated_at), fields: r.fields })),
        brands: rowsOf(looks).map((r) => ({ id: String(r.id), name: str(r.name), palette: r.palette, fontId: str(r.fontId), customFont: str(r.customFont), logo: Boolean(r.logo), notes: str(r.notes) })),
        productions: [
          ...rowsOf(teamShows).map((r) => ({ id: String(r.id), name: str(r.name), updatedAt: String(r.updated_at), brandId: str(r.brandId), teamId: String(r.team_id) })),
          ...rowsOf(shows).map((r) => ({ id: String(r.id), name: str(r.name), updatedAt: String(r.updated_at), brandId: str(r.brandId) })),
        ],
        teams,
      };
    },

    async production(userId, id) {
      const db = await serviceRoleDb();
      const teams = await teamsOf(userId);
      // The team's copy first: a moved production leaves a personal record of the same id.
      if (teams.length) {
        const { data, error } = await db
          .from('team_productions')
          .select('id, team_id, updated_at, name:doc->>name, brandId:doc->>brandId, graphics:doc->graphics, cues:doc->cues')
          .eq('id', id)
          .in('team_id', teams.map((t) => t.id))
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (data) {
          const r = data as Record<string, unknown>;
          const teamId = String(r.team_id);
          return { id: String(r.id), name: str(r.name), updatedAt: String(r.updated_at), brandId: str(r.brandId), teamId, teamName: teams.find((t) => t.id === teamId)?.name, graphics: r.graphics, cues: r.cues };
        }
      }
      const { data, error } = await db
        .from('documents')
        .select('id, updated_at, name:body->>name, brandId:body->>brandId, graphics:body->graphics, cues:body->cues')
        .eq('user_id', userId)
        .eq('kind', 'show')
        .eq('deleted', false)
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const r = data as Record<string, unknown>;
      return { id: String(r.id), name: str(r.name), updatedAt: String(r.updated_at), brandId: str(r.brandId), graphics: r.graphics, cues: r.cues };
    },
  };
}

// ── the tools ───────────────────────────────────────────────────────────────────────────

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, openWorldHint: false } as const;
const text = (v: unknown) => (typeof v === 'string' ? v : '');

export interface ReadToolsDeps {
  library?: LibraryStore;
  fetch?: typeof fetch;
}

export function createReadTools(deps: ReadToolsDeps = {}): McpTool[] {
  const store = (): LibraryStore => deps.library ?? supabaseLibraryStore();
  return [
    {
      name: 'noacg_catalog',
      title: 'Find catalog designs',
      description:
        "Search NoaCG's ready-made broadcast graphics. Without arguments: every category and type. With a category or words: matching types with their fields and designs. Palettes and fonts come with every answer.",
      inputSchema: {
        type: 'object',
        properties: {
          category: { type: 'string', description: 'A category id or name' },
          query: { type: 'string', description: 'Words, e.g. "football score"' },
        },
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      permission: null,
      async call(_principal, args, ctx) {
        const index = await readCatalogIndex(ctx.origin, deps.fetch);
        return result(searchCatalog(index, { category: text(args.category), query: text(args.query) }));
      },
    },
    {
      name: 'noacg_library',
      title: "Read the user's library",
      description:
        "The user's graphics with their fields, brands and productions, their own and their teams'. Pass a production id for its graphics and cues. Never returns graphic code.",
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Words in a name' },
          production: { type: 'string', description: 'A production id' },
        },
        additionalProperties: false,
      },
      annotations: READ_ONLY,
      permission: 'graphics:read',
      async call(principal, args) {
        const userId = principal.userId!;
        const wanted = text(args.production).trim();
        if (wanted) {
          const row = UUID.test(wanted) ? await store().production(userId, wanted) : null;
          if (!row) return refusal(`No production "${wanted}" in this user's library. noacg_library without arguments lists their productions.`);
          return result(productionView(row));
        }
        return result(libraryView(await store().library(userId), text(args.query)));
      },
    },
  ];
}
