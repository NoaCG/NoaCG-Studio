// gate: build
// guards: src/templates/importedDesign/svgLayout.ts, src/templates/importedDesign/artworkFields.ts, src/templates/importedDesign/creditsRoll.ts
//
// THE LAYOUT TABLE AN IMPORTED SVG EMITS, from plain inputs (docs/SVG_IMPORT_PLAN.md §6c).
//
// `NOACG_LAYOUT` is a persisted format: every exported graphic that grows carries it, and the
// growth runtime reads it back on air. `svgLayout.ts` builds it from a `DesignSvg` - the rules,
// normalized from the older one-rectangle `stretch`, and the lines the author aligned - and this
// pins that text on literals, without a browser. The corpus harness
// (scripts/svg-import-passes.test.mjs, the `layout` record) pins the same pass on the real files;
// this file pins the branches a corpus file may not reach: a cap, both follower modes, a nudge,
// and the countdown and credits layers that never get a row.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** One TypeScript module of the app's graph, importable here. */
async function load(entry) {
  const bundle = await rolldown({ input: entry, platform: 'neutral', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  return import(`data:text/javascript;base64,${Buffer.from(output[0].code, 'utf8').toString('base64')}`);
}

const { layoutRules, saidLines, layoutDataJs, PANEL_SAFE, LAYOUT_VERSION } = await load(
  path.join(projectRoot, 'src/templates/importedDesign/svgLayout.ts'),
);

const field = (candidateId, title, extra = {}) => ({ candidateId, title, sample: title, numeric: false, ...extra });
const design = (extra) => ({ markup: '<svg/>', width: 1920, height: 1080, fields: [], images: [], outlines: [], fonts: [], ...extra });
/** The table the runtime reads: the emitted text run as the script it is. */
const tableOf = (text) => new Function(`${text}\nreturn NOACG_LAYOUT;`)();
const label = (id) => ({ panel: 'Plate' })[id] ?? id;

test('layoutRules: no rule, the old stretch as one sideways rule, and growth over stretch', () => {
  assert.deepEqual(layoutRules(design({})), []);
  assert.deepEqual(layoutRules(design({ growth: [] })), []);
  assert.deepEqual(layoutRules(design({ stretch: { candidateId: 'panel' } })), [{ candidateId: 'panel', axis: 'x' }]);
  const growth = [{ candidateId: 'plate', axis: 'y' }];
  // A design that has both is one written after growth existed: its growth list is the truth.
  assert.equal(layoutRules(design({ growth, stretch: { candidateId: 'panel' } })), growth);
});

test('saidLines: the lines with an alignment or a nudge, by field index, never the countdown or the credits sample', () => {
  const fields = [
    field('c0', 'Name', { align: { h: 'middle', v: 'top' } }),
    field('c1', 'Clock', { countdown: true, align: { h: 'end', v: 'bottom' } }),
    field('c2', 'Role', { nudge: true }),
    field('c3', 'Plain'),
    field('c4', 'Credits', { align: { h: 'start', v: 'top' } }),
  ];
  const credits = { kind: 'recipe', recipe: 'credits', layers: {}, fields: { credits: 4 } };
  assert.deepEqual(
    saidLines(design({ fields, behaviour: credits })).map(({ f, i }) => [f.title, i]),
    [['Name', 0], ['Role', 2]],
  );
  // Without the credits recipe, the same field is an ordinary aligned line.
  assert.deepEqual(saidLines(design({ fields })).map(({ i }) => i), [0, 2, 4]);
});

test('layoutDataJs: the whole emitted table for two rules and two said lines', () => {
  const svg = design({
    fields: [
      field('c0', 'Name', { align: { h: 'middle', v: 'top' } }),
      field('c1', 'Clock', { countdown: true, align: { h: 'end', v: 'bottom' } }),
      field('c2', 'Role', { nudge: true }),
      field('c3', 'Plain'),
    ],
    growth: [
      { candidateId: 'panel', followers: [{ candidateId: 'cap' }, { candidateId: 'rail', mode: 'grow' }] },
      { candidateId: 'panel', axis: 'y', cap: 0.083333 },
    ],
  });
  assert.equal(
    layoutDataJs(svg, label),
    `
// ── Layout relationships (SVG) ────────────────────────────────────────────────
// WHICH ELEMENT MAY GROW, WHICH WAY, HOW FAR, AND WHAT TRAVELS WITH IT.
//
// Nothing here is elastic by default: a graphic with an empty table never moves, which is what
// every board and every scorebug wants. Each row names one element by the data-noacg-el stamp
// it carries in the artwork above, the axis it may grow on, and how close to the frame's edge
// it may get (\`safe\`, a fraction of the frame). \`cap\` is a tighter limit the author set by
// hand: the margin the growing edge must leave on the side it grows towards, as a fraction of
// the frame. Leave it out and the element keeps the margin the design drew on its other side.
// A row with its own \`followers\` list moves
// exactly those layers; a row without one falls back to measuring what sits past the growing
// edge, which is a fair guess sideways and a poor one downwards - so a vertical rule is
// normally written with its followers spelled out.
//
// A follower travels by default (\`mode: 'move'\`): it keeps its distance and its size. Write
// \`mode: 'grow'\` instead and the layer is STRETCHED by what the panel gained, which is what a
// rail or a tint band wants. You rarely need to: furniture drawn to the panel's own two edges is
// measured and stretched automatically, and never appears in this list.
//
// Delete a row and that element stops growing. Edit \`axis\` and it grows the other way.
var NOACG_LAYOUT = {
  version: 1,
  rules: [
    // "Plate" grows wider; 2 layer(s) travel with it.
    { el: 'g0', axis: 'x', safe: 0.04,
      followers: [{ el: 'g0f0', mode: 'move' }, { el: 'g0f1', mode: 'grow' }] },
    // "Plate" grows taller; whatever is drawn past its moving edge travels with it. It stops 8% of the frame short of the edge it grows towards.
    { el: 'g1', axis: 'y', safe: 0.04, cap: 0.0833 }
  ],
  // Which edge each of these lines fills from and where its block sits in its box, as the author
  // set it on the Fields step. A line not listed is aligned the way it was drawn. \`nudge: true\`
  // keeps the offset the designer left between the block and its anchor.
  lines: [
    // "Name" - centred, top.
    { el: 'f0', h: 'middle', v: 'top' },
    // "Role" - as drawn; keeps the nudge it was drawn with.
    { el: 'f2', nudge: true }
  ]
};
`,
  );
});

test('layoutDataJs: the table runs as a script and says what the design said', () => {
  const svg = design({
    fields: [field('c0', 'Title', { align: { h: 'end', v: 'middle' }, nudge: true })],
    stretch: { candidateId: 'panel' },
  });
  assert.deepEqual(tableOf(layoutDataJs(svg, label)), {
    version: LAYOUT_VERSION,
    rules: [{ el: 'g0', axis: 'x', safe: PANEL_SAFE }],
    lines: [{ el: 'f0', h: 'end', v: 'middle', nudge: true }],
  });
});

test('layoutDataJs: a design nobody aligned emits no lines list, and a stretch reads as one sideways row', () => {
  const text = layoutDataJs(design({ fields: [field('c0', 'Title')], stretch: { candidateId: 'panel' } }), label);
  assert.ok(!text.includes('lines:'), 'an untouched import keeps the bytes it emitted before the lines list existed');
  assert.ok(
    text.endsWith(`    // "Plate" grows wider; whatever is drawn past its moving edge travels with it.
    { el: 'g0', axis: 'x', safe: 0.04 }
  ]
};
`),
  );
  // Only the author's lines and no rule: the table still comes out, with an empty rules list.
  const lines = tableOf(layoutDataJs(design({ fields: [field('c0', 'Title', { align: { h: 'start', v: 'bottom' } })] }), label));
  assert.deepEqual(lines, { version: 1, rules: [], lines: [{ el: 'f0', h: 'start', v: 'bottom' }] });
});
