// The remote MCP connector's send tool (api/_lib/me/connectorSend.ts), with no network: recipes
// checked against a small catalog index, copies and the brand read from the user's own records
// (assets read back out of Storage), cue keys translated to SPX ids, one waiting package stored
// with the connector's origin - and every refusal (budget, cap, unknown or foreign ids, malformed
// recipes, wrong field keys) storing nothing.

import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { createSendTool, type SendStore, type StoredGraphic, type StoredLook } from './connectorSend.js';
import { resetCatalogIndexCache } from './connectorTools.js';
import { MAX_WAITING_PACKAGES } from './packages.js';
import type { NewWaitingPackage } from '../agentAccessStore.js';
import type { Principal } from '../../../src/entitlements/permissions.js';
import type { CatalogIndex } from '../../../src/templates/catalogIndex.js';

const USER = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const OTHER = '0b8e6c1a-1f2d-4c3b-9a8e-7d6c5b4a3f21';
const GRAPHIC = '11111111-2222-4333-8444-555555555555';
const TEAMMATE_GRAPHIC = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const LOOK = 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff';
const ORIGIN = 'http://studio.test';

let n = 0;
beforeEach(() => {
  resetCatalogIndexCache();
  // A fresh principal per test, so one test's sends never spend another's budget.
  n += 1;
  delete process.env.CONNECTOR_SEND_RATE_MAX;
});
const principal = (): Principal => ({
  kind: 'connector',
  userId: `${USER.slice(0, -4)}${String(n).padStart(4, '0')}`,
  clientId: 'client-1',
  grantId: 'grant-1',
  permissions: ['graphics:read', 'graphics:create'],
} as unknown as Principal);

const INDEX: CatalogIndex = {
  version: 1,
  categories: [{ id: 'lower-third', name: 'Lower thirds' }],
  types: [
    {
      id: 'lower-third',
      name: 'Lower third',
      description: '',
      category: 'lower-third',
      fields: [
        { key: 'name', label: 'Name', kind: 'text' },
        { key: 'title', label: 'Title', kind: 'text' },
        { key: 'side', label: 'Side', kind: 'select', role: 'data', options: ['left', 'right'] },
        { key: 'logo', label: 'Logo', kind: 'image', role: 'logo' },
      ],
      designs: [{ id: 'lt01', name: 'Plain', description: '', style: 'minimal', palette: 'ivory', font: 'inter' }],
    },
  ],
  palettes: [{ id: 'ivory', name: 'Ivory', accent: '#e8c547', text: '#ffffff', panel: '#000', styles: ['minimal'] }],
  fonts: [{ id: 'inter', family: 'Inter', styles: ['minimal'] }],
};
const fetchIndex = (async () => new Response(JSON.stringify(INDEX))) as typeof fetch;

const ownTemplate = (userId: string) => ({
  name: 'Sermon',
  type: 'lower-third',
  resolution: { width: 1920, height: 1080, label: '1920×1080' },
  fps: 50,
  html: '<script>window.SPXGCTemplateDefinition = {};</script><div id="f0"></div>',
  css: '.a{}',
  js: 'function update(){}',
  fields: [{ field: 'f0', ftype: 'textfield', title: 'Text', value: '' }],
  settings: {},
  assets: [{ path: 'images/mark.png', data: `spx-storage:${userId}/abc123` }],
  layers: [],
});

interface Memory extends SendStore {
  packages: Array<NewWaitingPackage & { userId: string }>;
  waiting: number;
}

function memory(userId: string): Memory {
  const graphics = new Map<string, StoredGraphic & { userId: string }>([
    [GRAPHIC, { userId, name: 'Sermon', template: ownTemplate(userId) }],
    [TEAMMATE_GRAPHIC, { userId: OTHER, name: 'Theirs', template: ownTemplate(OTHER) }],
  ]);
  const looks = new Map<string, StoredLook & { userId: string }>([
    [LOOK, { userId, name: 'Church', brand: { styleTag: 'minimal', palette: { id: 'custom', name: 'Blue', styleTags: [], accent: '#1d4ed8', text: '#fff', textDim: '#ccc', panel: '#012' }, fontId: 'inter', customFont: null, logo: { path: 'images/church.png', data: `spx-storage:${userId}/logo1` } } }],
  ]);
  const store: Memory = {
    packages: [],
    waiting: 0,
    async graphics(uid, ids) {
      return new Map([...graphics].filter(([id, g]) => ids.includes(id) && g.userId === uid).map(([id, g]) => [id, { name: g.name, template: g.template }]));
    },
    async look(uid, id) {
      const look = looks.get(id);
      return look && look.userId === uid ? { name: look.name, brand: look.brand } : null;
    },
    async asset(_uid, key) {
      return key.endsWith('/abc123') || key.endsWith('/logo1') ? 'data:image/png;base64,AAAA' : null;
    },
    async countWaitingPackages(uid) {
      return store.waiting + store.packages.filter((p) => p.userId === uid).length;
    },
    async insertPackage(uid, row) {
      store.packages.push({ ...row, userId: uid });
      return `pkg-${store.packages.length}`;
    },
  };
  return store;
}

const GOOD = {
  name: 'Sunday service',
  brand: LOOK,
  graphics: [
    { name: 'Speaker', type: 'lower-third', design: 'lt01', values: { name: 'Anna', title: 'Pastor' }, layer: 20 },
    { name: 'Reader', type: 'lower-third', design: 'lt01', palette: 'ivory', font: 'inter', values: { side: 'right' } },
    { name: 'Song', type: 'lower-third', design: 'lt01' },
    { name: 'Sermon copy', graphic: GRAPHIC },
  ],
  cues: [
    { graphic: 'Speaker', label: 'Anna', values: { name: 'Anna', title: 'Pastor' } },
    { graphic: 'Sermon copy', label: 'Sermon', values: { f0: 'Grace' } },
    { graphic: 'Speaker', label: 'Ben', values: { name: 'Ben' } },
  ],
};

async function send(args: Record<string, unknown>, store?: Memory, who = principal()) {
  const s = store ?? memory(who.userId!);
  const result = await createSendTool({ store: s, fetch: fetchIndex }).call(who, args, { origin: ORIGIN });
  return { result, store: s };
}

test('three recipes, a copy, a brand and cues become ONE waiting package with the connector origin', async () => {
  const who = principal();
  const { result, store } = await send(GOOD, undefined, who);
  assert.equal(result.isError, undefined, result.content[0].text);
  assert.deepEqual(result.structuredContent, { id: 'pkg-1', url: `${ORIGIN}/app#/home/productions`, graphics: 4, cues: 3 });
  assert.equal(store.packages.length, 1);
  const row = store.packages[0];
  assert.equal(row.userId, who.userId);
  assert.deepEqual(row.origin, { tool: 'noacg-connector', client: 'client-1', grant: 'grant-1' });
  assert.equal(row.graphicCount, 4);
  const body = row.body as { format: string; graphics: Array<Record<string, unknown>>; cues: Array<Record<string, unknown>>; brand: Record<string, unknown> };
  assert.equal(body.format, 'noacg-pack');
  assert.deepEqual(body.graphics[0], { name: 'Speaker', recipe: { type: 'lower-third', design: 'lt01', values: { name: 'Anna', title: 'Pastor' } }, layer: 20 });
  // A line the recipe left out is blank, never the design's sample text; a setting keeps its default.
  assert.deepEqual(body.graphics[1].recipe, { type: 'lower-third', design: 'lt01', palette: 'ivory', font: 'inter', values: { side: 'right', name: '', title: '' } });
  assert.deepEqual(body.graphics[2].recipe, { type: 'lower-third', design: 'lt01', values: { name: '', title: '' } });
  // The copy carries its sources as data: the Storage reference was read back.
  assert.equal(body.graphics[3].name, 'Sermon copy');
  assert.match(String(body.graphics[3].html), /SPXGCTemplateDefinition/);
  assert.deepEqual(body.graphics[3].assets, [{ path: 'images/mark.png', data: 'data:image/png;base64,AAAA' }]);
  // Recipe cue keys became SPX ids in the type's declaration order; a copy's stay its own.
  assert.deepEqual(body.cues.map((c) => c.values), [{ f0: 'Anna', f1: 'Pastor' }, { f0: 'Grace' }, { f0: 'Ben' }]);
  // The brand travels as data, its logo inlined.
  assert.equal(body.brand.id, LOOK);
  assert.equal(body.brand.name, 'Church');
  assert.deepEqual((body.brand.look as { logo: unknown }).logo, { path: 'images/church.png', data: 'data:image/png;base64,AAAA' });
  assert.match(result.content[0].text, /app#\/home\/productions/);
});

const refusals: Array<[string, Record<string, unknown>, RegExp]> = [
  ['an unknown type', { name: 'x', graphics: [{ name: 'a', type: 'nope', design: 'lt01' }] }, /no type "nope".*noacg_catalog/],
  ['a design of another type', { name: 'x', graphics: [{ name: 'a', type: 'lower-third', design: 'sb01' }] }, /"sb01" is not a design of lower-third\. Its designs: "lt01"/],
  ['an unknown palette', { name: 'x', graphics: [{ name: 'a', type: 'lower-third', design: 'lt01', palette: 'pink' }] }, /no palette "pink"/],
  ['an unknown value key', { name: 'x', graphics: [{ name: 'a', type: 'lower-third', design: 'lt01', values: { f0: 'Anna' } }] }, /no field "f0"\. Its field keys: "name", "title", "side"/],
  ['the logo slot as a value', { name: 'x', graphics: [{ name: 'a', type: 'lower-third', design: 'lt01', values: { logo: 'x.png' } }] }, /no field "logo"/],
  ['a choice that is not one', { name: 'x', graphics: [{ name: 'a', type: 'lower-third', design: 'lt01', values: { side: 'up' } }] }, /"up" is not a choice of side/],
  ['neither a recipe nor a copy', { name: 'x', graphics: [{ name: 'a' }] }, /give `type` and `design`/],
  ['both a recipe and a copy', { name: 'x', graphics: [{ name: 'a', type: 'lower-third', design: 'lt01', graphic: GRAPHIC }] }, /not both/],
  ['values on a copy', { name: 'x', graphics: [{ name: 'a', graphic: GRAPHIC, values: { f0: 'x' } }] }, /copied as it is/],
  ['a graphic that is not the user\'s', { name: 'x', graphics: [{ name: 'a', graphic: TEAMMATE_GRAPHIC }] }, /no graphic "6666.*own library.*teammate/],
  ['a malformed graphic id', { name: 'x', graphics: [{ name: 'a', graphic: 'abc' }] }, /not a graphic id/],
  ['an unknown brand', { name: 'x', brand: OTHER, graphics: [{ name: 'a', type: 'lower-third', design: 'lt01' }] }, /No brand .* own brands/],
  ['duplicate names', { name: 'x', graphics: [{ name: 'a', type: 'lower-third', design: 'lt01' }, { name: 'a', type: 'lower-third', design: 'lt01' }] }, /both named "a"/],
  ['no graphics', { name: 'x', graphics: [] }, /at least one graphic/],
  ['no name', { graphics: [{ name: 'a', type: 'lower-third', design: 'lt01' }] }, /`name` is required/],
  ['a cue on a graphic not in the package', { name: 'x', graphics: [{ name: 'a', type: 'lower-third', design: 'lt01' }], cues: [{ graphic: 'b', label: 'B' }] }, /names "b", which is not a graphic/],
  ['a recipe cue by SPX id', { name: 'x', graphics: [{ name: 'a', type: 'lower-third', design: 'lt01' }], cues: [{ graphic: 'a', label: 'A', values: { f0: 'x' } }] }, /no field "f0"/],
  ['a copy cue by logical key', { name: 'x', graphics: [{ name: 'a', graphic: GRAPHIC }], cues: [{ graphic: 'a', label: 'A', values: { name: 'x' } }] }, /has no field "name"\. Its field ids: "f0"/],
  ['a bad layer', { name: 'x', graphics: [{ name: 'a', type: 'lower-third', design: 'lt01', layer: 0 }] }, /`layer` must be a whole number/],
];

for (const [what, args, message] of refusals) {
  test(`refused, storing nothing: ${what}`, async () => {
    const { result, store } = await send(args);
    assert.equal(result.isError, true, what);
    assert.match(result.content[0].text, message);
    assert.equal(store.packages.length, 0);
  });
}

test('over the waiting cap: refused with what to do, nothing stored', async () => {
  const who = principal();
  const store = memory(who.userId!);
  store.waiting = MAX_WAITING_PACKAGES;
  const { result } = await send(GOOD, store, who);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, new RegExp(`${MAX_WAITING_PACKAGES} packages are already waiting.*install or dismiss`));
  assert.equal(store.packages.length, 0);
});

test('over the send budget: every call counts, the next is refused with a wait, nothing stored', async () => {
  process.env.CONNECTOR_SEND_RATE_MAX = '2';
  const who = principal();
  const store = memory(who.userId!);
  assert.equal((await send({ name: 'x', graphics: [] }, store, who)).result.isError, true, 'a refused call still counts');
  assert.equal((await send(GOOD, store, who)).result.isError, undefined);
  const third = await send(GOOD, store, who);
  assert.equal(third.result.isError, true);
  assert.match(third.result.content[0].text, /Too many packages.*Wait \d+ seconds/);
  assert.equal(store.packages.length, 1);
});

test('an asset outside the user\'s own folder is not read', async () => {
  const who = principal();
  const store = memory(who.userId!);
  const stolen = await store.graphics(who.userId!, [GRAPHIC]);
  (stolen.get(GRAPHIC)!.template.assets as Array<{ data: string }>)[0].data = `spx-storage:${OTHER}/abc123`;
  store.graphics = async () => stolen;
  const { result } = await send({ name: 'x', graphics: [{ name: 'a', graphic: GRAPHIC }] }, store, who);
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /could not be read/);
  assert.equal(store.packages.length, 0);
});
