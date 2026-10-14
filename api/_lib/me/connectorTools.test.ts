// The remote MCP connector's read tools (api/_lib/me/connectorTools.ts), with no network: the
// catalog search over a small index, the index read from the deployment's own origin, the library
// shaped to names and fields with no template code, a team's productions beside the user's own,
// one production's graphics and cues, and noacg_library refused without `graphics:read`.

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  CATALOG_MAX_TYPES,
  createReadTools,
  fieldsView,
  libraryView,
  LIBRARY_FIELDS_UP_TO,
  LIBRARY_MAX_ROWS,
  productionView,
  readCatalogIndex,
  resetCatalogIndexCache,
  searchCatalog,
  wordsOf,
  type LibraryRows,
  type LibraryStore,
  type ProductionDetailRow,
} from './connectorTools.js';
import { createMcpHandler } from './mcp.js';
import { memoryConnectorStore } from '../connectorStore.js';
import type { CatalogIndex, CatalogType } from '../../../src/templates/catalogIndex.js';

beforeEach(() => {
  resetCatalogIndexCache();
  process.env.CONNECTOR_RATE_MAX = '1000';
});

const type = (id: string, category: string, over: Partial<CatalogType> = {}): CatalogType => ({
  id,
  name: id.replace(/-/g, ' '),
  description: '',
  category,
  fields: [{ key: 'name', label: 'Name', kind: 'text' }],
  designs: [{ id: `${id}-1`, name: 'Plain', description: '', style: 'minimal', palette: 'ivory', font: 'inter' }],
  ...over,
});

const INDEX: CatalogIndex = {
  version: 1,
  categories: [
    { id: 'lower-third', name: 'Lower thirds' },
    { id: 'scoreboard', name: 'Scoreboards' },
  ],
  types: [
    type('lower-third', 'lower-third', { description: 'A name and a title.', fields: [{ key: 'name', label: 'Name', kind: 'text' }, { key: 'logo', label: 'Logo', kind: 'image', role: 'logo' }] }),
    type('scoreboard', 'scoreboard', {
      description: 'Two teams and their score.',
      designs: [
        { id: 'sb01', name: 'Stadium', description: 'Football night under lights', style: 'sport', palette: 'signal', font: 'inter' },
        { id: 'sb02', name: 'Studio', description: 'Clean', style: 'minimal', palette: 'ivory', font: 'inter' },
      ],
    }),
    type('esports-score', 'scoreboard', { description: 'Map and round.' }),
  ],
  palettes: [{ id: 'ivory', name: 'Ivory', accent: '#e8c547', text: '#ffffff', panel: 'rgba(12,14,18,0.92)', styles: ['minimal'] }],
  fonts: [{ id: 'inter', family: 'Inter', styles: ['minimal'] }],
};

test('words are lowercase, accent-free and singular, and a word matches by its start', () => {
  assert.deepEqual(wordsOf('Scoreboards, Café & a b'), ['scoreboard', 'cafe']);
  assert.deepEqual(wordsOf('class'), ['class']);
  assert.deepEqual(wordsOf('3 lines'), ['3', 'line'], 'a lone digit is a word');
});

test('the catalog: an overview without arguments, palettes and fonts with every answer', () => {
  const overview = searchCatalog(INDEX, {}) as { categories: Array<{ id: string; types: Array<{ id: string; designs: number }> }>; palettes: unknown[]; fonts: unknown[] };
  assert.deepEqual(overview.categories.map((c) => [c.id, c.types.map((t) => t.id)]), [['lower-third', ['lower-third']], ['scoreboard', ['scoreboard', 'esports-score']]]);
  assert.equal(overview.categories[1].types[0].designs, 2);
  assert.deepEqual(overview.palettes, INDEX.palettes);
  assert.deepEqual(overview.fonts, INDEX.fonts);
});

test('the catalog: a category by id or by name; an unknown one is answered with the list', () => {
  for (const category of ['scoreboard', 'Scoreboards', 'SCOREBOARD']) {
    const found = searchCatalog(INDEX, { category }) as { types: CatalogType[] };
    assert.deepEqual(found.types.map((t) => t.id), ['scoreboard', 'esports-score'], category);
  }
  const unknown = searchCatalog(INDEX, { category: 'weather' }) as { types: unknown[]; unknownCategory: string; categories: unknown[] };
  assert.deepEqual(unknown.types, []);
  assert.equal(unknown.unknownCategory, 'weather');
  assert.equal(unknown.categories, INDEX.categories);
});

test('the catalog: words rank the types the type itself names above a design-only match, with fields and designs', () => {
  const found = searchCatalog(INDEX, { query: 'football score' }) as { types: CatalogType[]; palettes: unknown[] };
  assert.deepEqual(found.types.map((t) => t.id), ['scoreboard', 'esports-score']);
  assert.deepEqual(found.types[0].designs.map((d) => d.id), ['sb01', 'sb02']);
  assert.ok(found.palettes.length > 0);
  const logo = searchCatalog(INDEX, { query: 'name' }) as { types: CatalogType[] };
  assert.deepEqual(logo.types[0].fields.find((f) => f.role === 'logo')?.key, 'logo');
  assert.deepEqual((searchCatalog(INDEX, { query: 'zebra' }) as { types: unknown[] }).types, []);
  const many: CatalogIndex = { ...INDEX, types: Array.from({ length: CATALOG_MAX_TYPES + 3 }, (_, i) => type(`board-${i}`, 'scoreboard')) };
  const capped = searchCatalog(many, { query: 'board' }) as { types: unknown[]; more: number };
  assert.equal(capped.types.length, CATALOG_MAX_TYPES);
  assert.equal(capped.more, 3);
});

test('the index is read from the deployment\'s own origin, kept, and refused when unreadable', async () => {
  const asked: string[] = [];
  const ok = (async (url: string) => {
    asked.push(url);
    return new Response(JSON.stringify(INDEX));
  }) as unknown as typeof fetch;
  assert.equal((await readCatalogIndex('http://studio.test', ok, 0)).types.length, 3);
  await readCatalogIndex('http://studio.test', ok, 1000);
  assert.deepEqual(asked, ['http://studio.test/catalog-index.json'], 'one fetch per warm instance');
  resetCatalogIndexCache();
  const empty = (async () => new Response(JSON.stringify({ version: 1, types: [] }))) as unknown as typeof fetch;
  await assert.rejects(readCatalogIndex('http://studio.test', empty, 0));
  const missing = (async () => new Response('not found', { status: 404 })) as unknown as typeof fetch;
  await assert.rejects(readCatalogIndex('http://studio.test', missing, 0));
});

const SOURCE = 'SECRET-TEMPLATE-SOURCE';
const ROWS: LibraryRows = {
  graphics: [
    { id: 'g1', name: 'Sunday names', type: 'lower-third', folder: 'Church', updatedAt: '2026-10-12T10:00:00.000Z' },
    { id: 'g2', name: 'Score', type: 'scoreboard', folder: null, updatedAt: '2026-10-11T10:00:00.000Z' },
  ],
  brands: [
    { id: 'b1', name: 'Parish', palette: { id: 'custom', name: 'Parish', accent: '#123456', text: '#fff', panel: '#000', textDim: '#ccc' }, fontId: null, customFont: 'Gill Sans', logo: true, notes: null },
    { id: 'b2', name: 'House', palette: null, fontId: 'inter', customFont: null, logo: false, notes: 'Calm' },
  ],
  productions: [
    { id: 'p-old-team', name: 'Old team night', updatedAt: '2026-09-01T09:00:00.000Z', brandId: null, teamId: 't1' },
    { id: 'p-team', name: 'Youth night', updatedAt: '2026-10-12T09:00:00.000Z', brandId: null, teamId: 't1' },
    { id: 'p-own', name: 'Sunday service', updatedAt: '2026-10-10T09:00:00.000Z', brandId: 'b1' },
    { id: 'p-team', name: 'Youth night (moved)', updatedAt: '2026-10-01T09:00:00.000Z', brandId: null },
  ],
  teams: [{ id: 't1', name: 'Youth team', role: 'member' }],
};

/** What the store holds as g1's template fields: values worth repeating, and ones that are not. */
const G1_FIELDS = [
  { field: 'f0', ftype: 'textfield', title: 'Name', value: 'Anna' },
  { field: 'f1', ftype: 'filelist', title: 'Logo', value: `data:image/png;base64,${SOURCE}` },
  { field: 'f2', ftype: 'textarea', title: 'Notes', value: SOURCE.repeat(20) },
  { field: 'f3', ftype: 'dropdown', title: 'Side', value: 'left', items: [{ text: 'Left', value: 'left' }, { text: 'Right', value: 'right' }] },
  { field: 'f4', ftype: 'hidden', title: 'Clock', value: '0' },
  { field: 'f5', ftype: 'instruction', title: 'Read me', value: SOURCE },
];

test('a graphic\'s fields: operator fields with short values only, never inlined files or paragraphs', () => {
  const fields = fieldsView(G1_FIELDS);
  assert.ok(!JSON.stringify(fields).includes(SOURCE));
  assert.deepEqual(fields, [
    { id: 'f0', title: 'Name', type: 'textfield', value: 'Anna' },
    { id: 'f1', title: 'Logo', type: 'filelist' },
    { id: 'f2', title: 'Notes', type: 'textarea' },
    { id: 'f3', title: 'Side', type: 'dropdown', value: 'left', options: ['left', 'right'] },
  ]);
  assert.deepEqual(fieldsView(null), []);
  assert.deepEqual(fieldsView('not a list'), []);
});

test('the library: graphics, brands with a font id or a custom family, productions newest first', () => {
  const view = libraryView(ROWS) as { graphics: unknown[]; brands: unknown[]; productions: Array<{ id: string }>; teams: unknown[]; searched?: string };
  assert.deepEqual(view.graphics, [
    { id: 'g1', name: 'Sunday names', type: 'lower-third', folder: 'Church', updatedAt: '2026-10-12T10:00:00.000Z' },
    { id: 'g2', name: 'Score', type: 'scoreboard', updatedAt: '2026-10-11T10:00:00.000Z' },
  ]);
  assert.deepEqual(view.brands, [
    { id: 'b1', name: 'Parish', palette: { name: 'Parish', accent: '#123456', text: '#fff', panel: '#000' }, customFont: 'Gill Sans', logo: true },
    { id: 'b2', name: 'House', font: 'inter', logo: false, notes: 'Calm' },
  ]);
  assert.deepEqual(view.productions, [
    { id: 'p-team', name: 'Youth night', updatedAt: '2026-10-12T09:00:00.000Z', team: 'Youth team' },
    { id: 'p-own', name: 'Sunday service', updatedAt: '2026-10-10T09:00:00.000Z', brandId: 'b1' },
    { id: 'p-old-team', name: 'Old team night', updatedAt: '2026-09-01T09:00:00.000Z', team: 'Youth team' },
  ], 'own and team productions merged newest first; the personal record a move left behind is not listed');
  assert.deepEqual(view.teams, ROWS.teams);
  assert.equal(view.searched, undefined);
  assert.match(String((libraryView({ ...ROWS, scanLimited: true }) as { searched?: string }).searched), /newest 1000/);
});

test('the library: words narrow every list, and long lists are capped and counted', () => {
  const youth = libraryView(ROWS, 'youth') as { graphics: unknown[]; productions: Array<{ id: string }> };
  assert.deepEqual(youth.graphics, []);
  assert.deepEqual(youth.productions.map((p) => p.id), ['p-team', 'p-old-team'], 'a team name finds its productions');
  const church = libraryView(ROWS, 'church') as { graphics: Array<{ id: string }> };
  assert.deepEqual(church.graphics.map((g) => g.id), ['g1'], 'a folder name finds its graphics');
  const big: LibraryRows = { ...ROWS, graphics: Array.from({ length: 105 }, (_, i) => ({ ...ROWS.graphics[1], id: `g${i}` })) };
  const capped = libraryView(big) as { graphics: unknown[]; more: { graphics: number } };
  assert.equal(capped.graphics.length, LIBRARY_MAX_ROWS);
  assert.equal(capped.more.graphics, 105 - LIBRARY_MAX_ROWS);
});

/** A library wider than the fields threshold, its oldest graphic past the list cap. */
const WIDE_ID = 'a1b2c3d4-0000-4000-8000-000000000105';
const WIDE: LibraryRows = {
  ...ROWS,
  graphics: Array.from({ length: 30 }, (_, i) => ({ ...ROWS.graphics[1], id: i === 29 ? WIDE_ID : `w${i}`, name: `Score ${i}` })),
};

test('a graphic id answers that graphic alone, even one past the list cap', () => {
  const one = libraryView(WIDE, ` ${WIDE_ID} `) as Record<string, unknown> & { graphics: Array<{ id: string }> };
  assert.deepEqual(one.graphics.map((g) => g.id), [WIDE_ID]);
  assert.deepEqual(Object.keys(one), ['graphics'], 'no brands or productions beside it');
});


test('one production: its pool with fields, and its cues by graphic name with short values only', () => {
  const row: ProductionDetailRow = {
    id: 'p-team',
    name: 'Youth night',
    updatedAt: '2026-10-12T09:00:00.000Z',
    brandId: null,
    teamId: 't1',
    teamName: 'Youth team',
    graphics: [{ id: 'pool1', name: 'Names', type: 'lower-third', graphicId: 'g1', layer: 20, template: { html: SOURCE, css: SOURCE, js: SOURCE, assets: [{ path: 'a.png', data: SOURCE }], fields: [{ field: 'f0', ftype: 'textfield', title: 'Name', value: 'Anna' }] } }],
    cues: [
      { id: 'c1', sourceId: 'pool1', label: 'Pastor', values: { f0: 'Pastor Lee', f1: `data:image/png;base64,${SOURCE}` } },
      { id: 'c2', sourceId: 'clip', source: 'playout', label: 'Intro clip', values: {} },
    ],
  };
  const view = productionView(row);
  assert.ok(!JSON.stringify(view).includes(SOURCE));
  assert.deepEqual(view, {
    production: {
      id: 'p-team',
      name: 'Youth night',
      updatedAt: '2026-10-12T09:00:00.000Z',
      team: 'Youth team',
      graphics: [{ id: 'pool1', name: 'Names', type: 'lower-third', graphicId: 'g1', layer: 20, fields: [{ id: 'f0', title: 'Name', type: 'textfield', value: 'Anna' }] }],
      cues: [
        { label: 'Pastor', graphic: 'Names', values: { f0: 'Pastor Lee' } },
        { label: 'Intro clip', graphic: null, values: {} },
      ],
    },
  });
});

// ── through the endpoint, as a connector ────────────────────────────────────────────────

const USER = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const CLIENT = '6c1f0c3e-6a0e-4a43-9d0a-1c2b3d4e5f60';
const TOKEN = 'connector-token';
const PRODUCTION = '0b7e3d58-4f0e-4b8f-9d61-6f3c2a1b0c9d';

async function endpoint(permissions: string[], rows: LibraryRows = ROWS) {
  const asked: string[] = [];
  const library: LibraryStore = {
    async library(userId) {
      asked.push(`library:${userId}`);
      return rows;
    },
    async graphicFields(userId, ids) {
      asked.push(`fields:${userId}:${ids.join(',')}`);
      return new Map([['g1', G1_FIELDS]]);
    },
    async production(userId, id) {
      asked.push(`production:${userId}:${id}`);
      return id === PRODUCTION ? { id, name: 'Sunday service', updatedAt: '2026-10-10T09:00:00.000Z', brandId: null, graphics: [], cues: [] } : null;
    },
  };
  const fetched: string[] = [];
  const fetchIndex = (async (url: string) => {
    fetched.push(url);
    return new Response(JSON.stringify(INDEX));
  }) as unknown as typeof fetch;
  const grants = memoryConnectorStore();
  await grants.createGrant({ userId: USER, clientId: CLIENT, clientName: 'Claude', permissions });
  const handler = createMcpHandler({
    grants,
    configured: () => true,
    enabled: async () => true,
    verifyConnector: async (token) => (token === TOKEN ? { userId: USER, clientId: CLIENT } : null),
    tools: createReadTools({ library, fetch: fetchIndex }),
  });
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await handler.fetch(
      new Request('https://studio.test/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}`, 'mcp-protocol-version': '2025-11-25' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
      }),
    );
    return ((await res.json()) as { result: { isError?: boolean; content: Array<{ text: string }>; structuredContent?: Record<string, unknown> } }).result;
  };
  return { call, asked, fetched };
}

test('noacg_library reads only the connector user\'s library, and only with graphics:read', async () => {
  const granted = await endpoint(['graphics:read', 'graphics:create']);
  const listed = await granted.call('noacg_library');
  assert.notEqual(listed.isError, true);
  assert.deepEqual(JSON.parse(listed.content[0].text), listed.structuredContent);
  const graphics = listed.structuredContent!.graphics as Array<{ id: string; fields: unknown[] }>;
  assert.deepEqual(graphics.map((g) => [g.id, g.fields]), [['g1', fieldsView(G1_FIELDS)], ['g2', []]], 'fields are read for the answered graphics');
  assert.ok(!listed.content[0].text.includes(SOURCE));
  const one = await granted.call('noacg_library', { production: PRODUCTION });
  assert.equal((one.structuredContent!.production as { name: string }).name, 'Sunday service');
  const unknown = await granted.call('noacg_library', { production: '00000000-0000-4000-8000-000000000000' });
  assert.equal(unknown.isError, true);
  assert.match(unknown.content[0].text, /No production/);
  const notAnId = await granted.call('noacg_library', { production: "'; drop table documents; --" });
  assert.equal(notAnId.isError, true);
  assert.deepEqual(granted.asked, [`library:${USER}`, `fields:${USER}:g1,g2`, `production:${USER}:${PRODUCTION}`, `production:${USER}:00000000-0000-4000-8000-000000000000`], 'a non-id never reaches the store');

  const createOnly = await endpoint(['graphics:create']);
  const refused = await createOnly.call('noacg_library');
  assert.equal(refused.isError, true);
  assert.deepEqual(createOnly.asked, [], 'a withheld permission reads nothing');
});

test('a wide list is names and ids; a few graphics, by search or id, carry their fields', async () => {
  const wide = await endpoint(['graphics:read'], WIDE);
  const listed = await wide.call('noacg_library');
  const graphics = listed.structuredContent!.graphics as Array<Record<string, unknown>>;
  assert.equal(graphics.length, LIBRARY_MAX_ROWS);
  assert.ok(graphics.every((g) => !('fields' in g)), 'no fields in a wide list');
  assert.deepEqual(wide.asked, [`library:${USER}`], 'a wide list reads no fields at all');

  const few = await wide.call('noacg_library', { query: 'score 7' });
  const found = few.structuredContent!.graphics as Array<{ id: string; fields?: unknown[] }>;
  assert.ok(found.length > 0 && found.length <= LIBRARY_FIELDS_UP_TO);
  assert.ok(found.every((g) => Array.isArray(g.fields)));

  const byId = await wide.call('noacg_library', { query: WIDE_ID });
  assert.deepEqual((byId.structuredContent!.graphics as Array<{ id: string }>).map((g) => g.id), [WIDE_ID]);
  assert.equal(wide.asked[wide.asked.length - 1], `fields:${USER}:${WIDE_ID}`);
});

test('noacg_catalog is public data, read from the index on the request\'s own origin', async () => {
  const { call, fetched } = await endpoint(['graphics:create']);
  const found = await call('noacg_catalog', { category: 'scoreboard' });
  assert.notEqual(found.isError, true);
  assert.deepEqual((found.structuredContent!.types as CatalogType[]).map((t) => t.id), ['scoreboard', 'esports-score']);
  assert.deepEqual(fetched, ['https://studio.test/catalog-index.json']);
});
