// guards: src/model/productionDelivery.ts
// The production a set delivery makes (docs/AGENT_SAVE.md §11), and what installing the same
// delivery's package again would repeat (spec AC-8, AC-9). Pure: no storage, no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveredCopy, deliveredProduction, deliveryOverlap } from '../src/model/productionDelivery.ts';

const template = (name, fields = [{ field: 'f0', ftype: 'textfield', title: 'Name', value: `${name} default` }]) => ({
  name, type: 'lower-third', resolution: { width: 1920, height: 1080, label: '1920×1080' }, fps: 50,
  html: '<div id="f0"></div>', css: '', js: '', fields, settings: {}, assets: [], layers: [],
});
const graphics = ['Strap', 'Score', 'Clock'].map((name, i) => ({ id: `lib-${i}`, name, template: template(name) }));
const AT = '2026-10-16T09:00:00.000Z';
const minted = () => {
  let n = 0;
  return () => `id-${++n}`;
};

test('a production pools every delivered graphic, linked to its library record, on free layers from 20', () => {
  const show = deliveredProduction({ id: 'prod-1', at: AT, request: { name: '  Evening news ' }, graphics, mintId: minted() });
  assert.equal(show.id, 'prod-1');
  assert.equal(show.name, 'Evening news');
  assert.equal(show.version, 2);
  assert.equal(show.updatedAt, AT);
  assert.deepEqual(show.outputSetup, { v: 1, destinations: [] }, 'a new, unchosen output - nothing published');
  assert.deepEqual(show.graphics.map((g) => [g.name, g.graphicId, g.layer, g.type, g.savedAt]), [
    ['Strap', 'lib-0', 20, 'lower-third', AT],
    ['Score', 'lib-1', 21, 'lower-third', AT],
    ['Clock', 'lib-2', 22, 'lower-third', AT],
  ]);
  assert.equal(show.graphics[1].template, graphics[1].template, 'the pool holds a copy of the record\'s template');
  assert.ok(!('hostedSlug' in show) && !('outputSlug' in show) && !('publishedAt' in show), 'it is not published');
  // Without a rundown, one cue per graphic in pool order, seeded from the field defaults.
  assert.deepEqual(show.cues.map((c) => [c.label, c.sourceId, c.values.f0]), show.graphics.map((g) => [g.name, g.id, `${g.name} default`]));
});

test('an ordered rundown interleaves graphics, values over the defaults, and a graphic it never names still gets a row', () => {
  const show = deliveredProduction({
    id: 'prod-2', at: AT, graphics, mintId: minted(),
    request: {
      name: 'Match',
      layers: [30, 20],
      cues: [
        { graphic: 'Score', label: 'Kick-off 0-0', values: { f0: '0-0' } },
        { graphic: 'Strap', label: 'Anna', values: { f0: 'Anna' }, note: 'host' },
        { graphic: 'Score', label: 'Half time', values: {} },
      ],
    },
  });
  assert.deepEqual(show.graphics.map((g) => g.layer), [30, 20, 21], 'named layers kept, the rest take the free ones');
  const pool = new Map(show.graphics.map((g) => [g.id, g.name]));
  assert.deepEqual(show.cues.map((c) => [pool.get(c.sourceId), c.label, c.values.f0, c.note ?? null]), [
    ['Score', 'Kick-off 0-0', '0-0', null],
    ['Strap', 'Anna', 'Anna', 'host'],
    ['Score', 'Half time', 'Score default', null],
    ['Clock', 'Clock', 'Clock default', null],
  ]);
  assert.equal(new Set([...show.graphics.map((g) => g.id), ...show.cues.map((c) => c.id)]).size, 7, 'every pool and cue id is its own');
  assert.throws(
    () => deliveredProduction({ id: 'p', at: AT, graphics, mintId: minted(), request: { name: 'x', cues: [{ graphic: 'Nope', label: 'a' }] } }),
    /not in this delivery/,
  );
});

const ITEM = (c) => c.repeat(64);
const library = [
  { id: 'lib-a', name: 'Strap', origin: { tool: 'noacg-cli', item: ITEM('a') } },
  { id: 'lib-b', name: 'Score', origin: { tool: 'noacg-cli', item: ITEM('b') } },
  { id: 'lib-old', name: 'Clock', origin: { tool: 'noacg-cli' } },
  { id: 'lib-studio', name: 'Bug' },
  { id: 'lib-gone', name: 'Ticker', deleted: true, origin: { tool: 'noacg-cli', item: ITEM('d') } },
];

test('a delivered copy is found by its item identity, never by its name', () => {
  assert.equal(deliveredCopy({ item: ITEM('a') }, library)?.id, 'lib-a');
  assert.equal(deliveredCopy({ item: ITEM('d') }, library), null, 'a deleted record is not a copy');
  assert.equal(deliveredCopy({ item: ITEM('e') }, library), null);
  assert.equal(deliveredCopy(undefined, library), null, 'no identity, no match - whatever the name');
});

test('installing again names the production the delivery became, or the graphics identity cannot speak for', () => {
  const made = { id: 'show-1', deleted: false, graphics: [{ graphicId: 'lib-a' }, { graphicId: 'lib-b' }] };
  const both = [{ name: 'Strap', origin: { item: ITEM('a') } }, { name: 'Score', origin: { item: ITEM('b') } }];
  assert.deepEqual(deliveryOverlap(both, library, [made]), { production: made, unidentified: [] });
  assert.deepEqual(deliveryOverlap(both, library, [{ ...made, deleted: true }]), { production: null, unidentified: [] }, 'a deleted production is not one');
  assert.deepEqual(deliveryOverlap(both.slice(0, 1), library, []), { production: null, unidentified: [] }, 'found by identity: Install pools it, no word needed');

  // No identity on the package: a same-named record made outside the studio may be this graphic.
  assert.deepEqual(deliveryOverlap([{ name: 'Strap' }, { name: 'Bug' }, { name: 'New' }], library, [made]).unidentified, ['Strap']);
  // No identity on the library record (an older CLI's save): the same.
  assert.deepEqual(deliveryOverlap([{ name: 'Clock', origin: { item: ITEM('c') } }], library, []).unidentified, ['Clock']);
  // Both carry identities and they differ: different work, however alike the names.
  assert.deepEqual(deliveryOverlap([{ name: 'Strap', origin: { item: ITEM('f') } }], library, []).unidentified, []);
});
