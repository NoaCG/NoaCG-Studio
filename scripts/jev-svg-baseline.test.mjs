// gate: factory
// needs: browser
// guards: src/assets/svgImport.ts, src/templates/importedDesign/**, src/templates/behaviours/**, src/components/wizard/import/**, src/preview/composeDocument.ts, src/model/fonts.ts, src/validation/**, src/components/wizard/CreationWizard.tsx, public/fonts/**, e2e/fixtures/jev-svg/**, scripts/svg-import-passes.test.mjs, scripts/ladder-values.mjs, scripts/catalog-emit.mjs, scripts/driven-clock.mjs
//
// WHAT TODAY'S IMPORT DOES WITH THE 18 DEVELOPMENT DESIGNS, BEFORE ANY RECOGNITION WORK.
//
// The jev-svg-import plan (docs/work-specs/jev-svg-import/spec.md, row 3, AC-3) changes how an
// ordinary SVG is read. This records where it starts: each development design of the frozen corpus
// (e2e/fixtures/jev-svg, three per stratum: lower third, scoreboard, clock, quiz, end credits and
// score+clock) through the same path the 51-file harness uses (`recordInPage` in
// scripts/svg-import-passes.test.mjs): the reader's inventory, the wizard's draft and field list,
// the build, the bound artwork, the generated controls, and the design mounted as the preview
// composes it. Per design it holds:
//
//   behaviour   the behaviour the import proposes from the names, or null
//   layers      every importer layer: `<importer id> <tag> @<element path> #<source id or ->`
//   fields      the field list the wizard offers: `<layer> on|off <kind>[ numeric][ clock] "<title>"`
//   controls    the template's SPX controls: `<field> <ftype> "<title>"`
//   labels      each labelled anchor of dev.expect.json against the import:
//               `<role> <kind> @<path> -> <layer or "no layer"> on|off|not offered`; `decoy` for
//               a non-editable one. Facts, not a score: rows 4 onward change them on purpose
//   appearance  sha256 of the reader's markup and of the bound artwork, both canonical (sorted
//               attributes, no namespace declarations: Chromium builds order those differently),
//               and of the emitted css, js and NOACG_LAYOUT / NOACG_BEHAVIOUR tables
//   gate        the export gate's refusals
//   text        the mounted design at rest, then with each LADDER_VALUES entry typed into every
//               text field: `<field> <painted lines> <font size %> over|fits`. Compared on the
//               Chromium build it was recorded on (RECORDED_ON), font size within TOLERANCE
//
// NO RE-RECORD SWITCH, ON PURPOSE. The record below is written by hand. A change that moves it
// edits this file, so the difference is in the pull request's diff for a reviewer, never folded
// into a regenerated snapshot. A failing design prints its fresh record as one
// `[jev-svg-baseline] record <id> <json>` line to compare against.
//
//   node --test scripts/jev-svg-baseline.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LADDER_VALUES } from './ladder-values.mjs';
import { measured } from './measured.mjs';
import { boundSvg, diff, recordInPage } from './svg-import-passes.test.mjs?library';

const root = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const DIR = root('e2e/fixtures/jev-svg/');
const manifest = JSON.parse(readFileSync(`${DIR}manifest.json`, 'utf8'));
const labels = JSON.parse(readFileSync(`${DIR}dev.expect.json`, 'utf8'));
const STRATA = ['lower-third', 'scoreboard', 'clock', 'quiz', 'credits', 'score-clock'];
const sha = (s) => createHash('sha256').update(s ?? '').digest('hex');

/** The Chromium build `text` was recorded on; another build lays text out differently. */
const RECORDED_ON = '149.0.7827.55';
/** Percentage points a font size may move and still match, as in the 51-file harness. */
const TOLERANCE = 1;

const designs = manifest.files.map((f) => {
  const markup = readFileSync(`${DIR}${f.path}`, 'utf8');
  const label = labels.designs.find((d) => d.id === f.id);
  return { name: f.id, file: f, markup, label };
});

/** Runs in the browser: per design, its importer layers with their element paths and source ids,
 *  every labelled anchor resolved to the layer at that path, and both markups in canonical form. */
const LAYERS = (items) => {
  const parse = (s) => new DOMParser().parseFromString(s, 'image/svg+xml').documentElement;
  const pathOf = (el, top) => {
    const out = [];
    for (let n = el; n && n !== top; n = n.parentElement) out.unshift([...n.parentElement.children].indexOf(n));
    return ['0', ...out].join('/');
  };
  const at = (top, path) => path.split('/').slice(1).reduce((el, i) => el?.children[Number(i)] ?? null, top);
  const canon = (el) => {
    const attrs = [...el.attributes].filter((a) => a.name !== 'xmlns' && !a.name.startsWith('xmlns:'))
      .map((a) => `${a.name}="${a.value}"`).sort();
    const kids = [...el.childNodes].map((n) => (n.nodeType === 1 ? canon(n) : n.nodeType === 3 || n.nodeType === 4 ? n.data : '')).join('');
    return `<${el.tagName}${attrs.map((a) => ` ${a}`).join('')}>${kids}</${el.tagName}>`;
  };
  return items.map(({ sanitized, bound, anchors }) => {
    const top = parse(sanitized);
    const layers = [...top.querySelectorAll('[data-noacg-candidate]')].map((el) =>
      `${el.getAttribute('data-noacg-candidate')} ${el.tagName} @${pathOf(el, top)} #${el.getAttribute('id') ?? '-'}`);
    const resolved = anchors.map((a) => {
      const el = at(top, a.path);
      return { ...a, layer: el && el.tagName === a.tag ? el.getAttribute('data-noacg-candidate') : null };
    });
    return { layers, resolved, sanitized: canon(top), bound: bound ? canon(parse(bound)) : null };
  });
};

/** A design's labelled anchors: its fields (credits through their sub-anchors) and its decoys. */
function anchorsOf(label) {
  if (!label) return [];
  const field = (f) => ({ role: f.role, kind: f.kind, path: f.source.element_path, tag: f.source.tag });
  return [
    ...label.expected.fields.flatMap((f) => (f.source_anchors ? f.source_anchors.map(field) : [field(f)])),
    ...(label.expected.noneditable ?? []).map((n) => ({ role: 'decoy', kind: 'fixed', path: n.source.element_path, tag: n.source.tag })),
  ];
}

const started = Date.now();
let browser = null;
let layered = null;
const raws = await recordInPage(designs, LADDER_VALUES, async (page, records) => {
  browser = page.context().browser().version();
  layered = await page.evaluate(LAYERS, designs.map((d) => {
    const raw = records[d.name];
    return { sanitized: raw.markup ?? '<svg/>', bound: raw.template ? boundSvg(raw.template.html) : null, anchors: anchorsOf(d.label) };
  }));
});
const records = Object.fromEntries(designs.map((d, i) => [d.name, recordOf(raws[d.name], layered[i])]));
const seconds = ((Date.now() - started) / 1000).toFixed(1);
measured(designs.length, 'jev-svg development designs');
console.log(`[jev-svg-baseline] ${designs.length} designs in ${seconds} s on Chromium ${browser}`);

/** One design's record, in the shape of BASELINE below. */
function recordOf(raw, extra) {
  if (raw.refused) return { refused: raw.refused };
  const rows = new Map(raw.fieldList.fields.map((f) => [f.candidateId, f]));
  const offered = (id) => (!id ? '' : rows.has(id) ? (rows.get(id).on ? ' on' : ' off') : ' not offered');
  return {
    behaviour: raw.proposal.behaviour ? raw.proposal.behaviour.kind : null,
    layers: extra.layers,
    fields: raw.fieldList.fields.map((f) => `${f.candidateId} ${f.on ? 'on' : 'off'} ${f.kind}${f.numeric ? ' numeric' : ''}${f.clock ? ' clock' : ''} "${f.title}"`),
    controls: raw.template.fields.map((f) => `${f.field} ${f.ftype} "${f.title}"`),
    labels: extra.resolved.map((a) => `${a.role} ${a.kind} @${a.path} -> ${a.layer ?? 'no layer'}${offered(a.layer)}`),
    appearance: {
      source: sha(extra.sanitized),
      bound: sha(extra.bound),
      css: sha(raw.template.css),
      js: sha(raw.template.js),
      layout: sha(raw.tables.layout),
      behaviour: sha(raw.tables.behaviour),
    },
    gate: raw.gate,
    text: Object.fromEntries(['rest', ...Object.keys(LADDER_VALUES)].map((k) => [k, raw.runtime[k].lines.map((l) =>
      `${l.id} ${l.lines} ${l.sizePct ?? '-'} ${l.over ? 'over' : 'fits'}`)])),
  };
}

/** Every text line that moved: painted lines and overflow exactly, font size within TOLERANCE. */
function textMoves(was = {}, now = {}) {
  const out = [];
  for (const key of new Set([...Object.keys(was), ...Object.keys(now)])) {
    const a = was[key] ?? [];
    const b = now[key] ?? [];
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const [x, y] = [a[i]?.split(' '), b[i]?.split(' ')];
      const same = x && y && x[0] === y[0] && x[1] === y[1] && x[3] === y[3]
        && (x[2] === y[2] || Math.abs(Number(x[2]) - Number(y[2])) <= TOLERANCE);
      if (!same) out.push(`text.${key}.${i}: ${JSON.stringify(a[i])} -> ${JSON.stringify(b[i])}`);
    }
  }
  return out;
}

/** Recorded 2026-10-31 on main 6b3592c3, before any jev-svg-import row changed the importer. */
const BASELINE = {
  'lower-third-1': {
    behaviour: null,
    layers: [
      's0 rect @0/0 #-',
      's1 rect @0/1 #-',
      's2 rect @0/2 #-',
      't0 text @0/3 #presenter',
      't1 text @0/4 #role',
      't2 text @0/5 #score',
    ],
    fields: [
      't0 on text "presenter"',
      't1 on text "role"',
      't2 on text "score"',
    ],
    controls: [
      'f0 textfield "presenter"',
      'f1 textfield "role"',
      'f2 textfield "score"',
    ],
    labels: [
      'person.name text @0/3 -> t0 on',
      'person.role text @0/4 -> t1 on',
      'decoy fixed @0/5 -> t2 on',
    ],
    appearance: {
      source: 'c11ff0e5efc100270167a4c29b6021ae4ff89d8640a30758b79c7897ef5fe8e8',
      bound: 'ba52f6970fab55360dc7ffe7f18ce3dedfeacdae0a0f4ea3e4ec2f00af9683b1',
      css: '498c73f97cea1a2c645f783063534d6c103f4c71664d7f4d7edb3d5c7fa3bb32',
      js: '3931a1d05782f6637d45f80749a3b8d295e60ed459abbc78979112da257ef7c3',
      layout: 'd40e212dcc07d578378d3d4302bf6375a4c8a9c2f349fa097e25e95ad9e10534',
      behaviour: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
    },
    gate: [],
    text: { rest: ['f0 1 100 fits', 'f1 1 100 fits', 'f2 1 100 fits'] },
  },
  'lower-third-2': {
    behaviour: null,
    layers: [
      's0 rect @0/0 #-',
      's1 rect @0/1/0 #-',
      't0 text @0/1/1/0 #-',
      't1 text @0/1/1/1 #-',
      't2 text @0/1/1/2 #-',
      't3 text @0/2 #-',
    ],
    fields: [
      't0 on text "Ім’я"',
      't1 on text "Посада"',
      't2 on text "Text 3"',
      't3 off text numeric "Text 4"',
    ],
    controls: [
      'f0 textfield "Ім’я"',
      'f1 textfield "Посада"',
      'f2 textfield "Text 3"',
    ],
    labels: [
      'person.name text @0/1/1/0 -> t0 on',
      'person.role text @0/1/1/1 -> t1 on',
      'location text @0/1/1/2 -> t2 on',
      'decoy fixed @0/2 -> t3 off',
      'decoy fixed @0/3/0 -> no layer',
    ],
    appearance: {
      source: '2b973ffd791bd08d8e38d0c20b7482fcf85db62bb8a7bab69f2c7226567506c1',
      bound: '6cb7ef4c66e6ab74462597f4871d4be449c45b85252a3d0e3e36727aa3281546',
      css: '7b29d76737fa66c5f178a783bb772c4f57c56464f23177abd0bca413d1ed8111',
      js: 'fb74c3164c1fd1e2997c8413e271005c18de5a963b8d365acff43b06195a103b',
      layout: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
      behaviour: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
    },
    gate: [],
    text: { rest: ['f0 1 100 fits', 'f1 1 100 fits', 'f2 1 100 fits'] },
  },
  'lower-third-3': {
    behaviour: null,
    layers: [
      's0 rect @0/0 #-',
    ],
    fields: [
    ],
    controls: [
    ],
    labels: [
    ],
    appearance: {
      source: '9832827458dfc70b303c3862be64f0c1f3b20544d7354b39da1d853c4a1c187b',
      bound: 'd0043df951dcc1031f3f7e4712d0f43a6c797fa2bc8f83733bc019c9e4b55a3f',
      css: '6567d0949e35e614d4bd88dcdd2a6e1c904496599f5b377146961ed0394704ff',
      js: 'fb74c3164c1fd1e2997c8413e271005c18de5a963b8d365acff43b06195a103b',
      layout: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
      behaviour: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
    },
    gate: [],
    text: { rest: [] },
  },
  'scoreboard-1': {
    behaviour: null,
    layers: [
      's0 rect @0/0 #-',
      's1 rect @0/1 #-',
      's2 rect @0/2 #-',
      't0 text @0/3 #Team-A',
      't1 text @0/4 #Team-B',
      't2 text @0/5 #Value-A',
      't3 text @0/6 #Value-B',
      't4 text @0/7 #Clock',
    ],
    fields: [
      't0 on text "Team-A"',
      't1 on text "Team-B"',
      't2 on text numeric "Value-A"',
      't3 on text numeric "Value-B"',
      't4 on text numeric "Clock"',
    ],
    controls: [
      'f0 textfield "Team-A"',
      'f1 textfield "Team-B"',
      'f2 number "Value-A"',
      'f3 number "Value-B"',
      'f4 number "Clock"',
    ],
    labels: [
      'team.home text @0/3 -> t0 on',
      'team.away text @0/4 -> t1 on',
      'score.home number @0/5 -> t2 on',
      'score.away number @0/6 -> t3 on',
      'decoy fixed @0/7 -> t4 on',
    ],
    appearance: {
      source: '94c20bf404f28a8ebbe0ee66836c5ab4a1d9c7152c5c259b18387820699da501',
      bound: 'ea1f5c0a5bac9cf90f2b7c730d4c8e796d390718a9b669e77abd435b10b66095',
      css: 'f7c1131d1b32d7076c382c459f749c45626445e71f99424f61f87f3664bba078',
      js: 'fb74c3164c1fd1e2997c8413e271005c18de5a963b8d365acff43b06195a103b',
      layout: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
      behaviour: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
    },
    gate: [],
    text: { rest: ['f0 1 100 fits', 'f1 1 100 fits', 'f2 1 100 fits', 'f3 1 100 fits', 'f4 1 100 fits'] },
  },
  'scoreboard-2': {
    behaviour: null,
    layers: [
      's0 rect @0/0 #-',
      's1 rect @0/1 #-',
      't0 text @0/2 #-',
      't1 text @0/4 #-',
      't2 text @0/5 #-',
      't3 text @0/6 #-',
      't4 text @0/7 #-',
    ],
    fields: [
      't0 on text "Text 1"',
      't1 on text "Команда"',
      't2 on text numeric "Шар 7"',
      't3 on text "Команда 2"',
      't4 on text numeric "Шар 8"',
    ],
    controls: [
      'f0 textfield "Text 1"',
      'f1 textfield "Команда"',
      'f2 number "Шар 7"',
      'f3 textfield "Команда 2"',
      'f4 number "Шар 8"',
    ],
    labels: [
      'team.home text @0/4 -> t1 on',
      'score.home number @0/5 -> t2 on',
      'team.away text @0/6 -> t3 on',
      'score.away number @0/7 -> t4 on',
      'decoy fixed @0/2 -> t0 on',
    ],
    appearance: {
      source: 'a4f829d9232738a9da05765fe740e88ffc37f87b4223f2e3384164aaacdfcd83',
      bound: '5961e51cf88d9ae2678d7a43fe934ee23788c5219f7c9ee12fc1404808b982b2',
      css: '525695f02378c8589697bf3af856aa600119bddfb8e8f9b83c419d50725e04f8',
      js: 'fb74c3164c1fd1e2997c8413e271005c18de5a963b8d365acff43b06195a103b',
      layout: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
      behaviour: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
    },
    gate: [],
    text: { rest: ['f0 1 100 fits', 'f1 1 100 fits', 'f2 1 100 fits', 'f3 1 100 fits', 'f4 1 100 fits'] },
  },
  'scoreboard-3': {
    behaviour: null,
    layers: [
      's0 rect @0/0 #-',
      't0 text @0/1 #-',
      't1 text @0/2 #Score',
      's1 rect @0/3 #-',
      't2 text @0/4 #layer0',
      't3 text @0/5 #layer1',
      's2 rect @0/6 #-',
      't4 text @0/7 #layer2',
      't5 text @0/8 #layer3',
      's3 rect @0/9 #-',
      't6 text @0/10 #layer4',
      't7 text @0/11 #layer5',
      's4 rect @0/12 #-',
      't8 text @0/13 #layer6',
      't9 text @0/14 #layer7',
    ],
    fields: [
      't0 on text "Text 1"',
      't1 on text numeric "Score"',
      't2 on text "Text 3"',
      't3 on text numeric "Text 4"',
      't4 on text "Text 5"',
      't5 on text numeric "Text 6"',
      't6 on text "Text 7"',
      't7 on text numeric "Text 8"',
      't8 on text "Text 9"',
      't9 on text numeric "Text 10"',
    ],
    controls: [
      'f0 textfield "Text 1"',
      'f1 number "Score"',
      'f2 textfield "Text 3"',
      'f3 number "Text 4"',
      'f4 textfield "Text 5"',
      'f5 number "Text 6"',
      'f6 textfield "Text 7"',
      'f7 number "Text 8"',
      'f8 textfield "Text 9"',
      'f9 number "Text 10"',
    ],
    labels: [
      'team.1 text @0/4 -> t2 on',
      'score.1 number @0/5 -> t3 on',
      'team.2 text @0/7 -> t4 on',
      'score.2 number @0/8 -> t5 on',
      'team.3 text @0/10 -> t6 on',
      'score.3 number @0/11 -> t7 on',
      'team.4 text @0/13 -> t8 on',
      'score.4 number @0/14 -> t9 on',
      'decoy fixed @0/1 -> t0 on',
      'decoy fixed @0/2 -> t1 on',
    ],
    appearance: {
      source: '77f392c2fe969590cbff92114cdb35c3d3ea0c44d46586abbc86667cbc56b615',
      bound: 'f0a641dd34c0d4f05f5db2717f00640f44ac7c8fe282d7b24729477f898f9174',
      css: 'ec9422e22a12cdded5b345fd6f718d9250fe5fb057d3727f851db35d9fff7f15',
      js: 'fb74c3164c1fd1e2997c8413e271005c18de5a963b8d365acff43b06195a103b',
      layout: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
      behaviour: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
    },
    gate: [],
    text: { rest: ['f0 1 100 fits', 'f1 1 100 fits', 'f2 1 100 fits', 'f3 1 100 fits', 'f4 1 100 fits', 'f5 1 100 fits', 'f6 1 100 fits', 'f7 1 100 fits', 'f8 1 100 fits', 'f9 1 100 fits'] },
  },
  'clock-1': {
    behaviour: null,
    layers: [
      's0 rect @0/0 #-',
      't0 text @0/2 #timer',
      't1 text @0/3 #-',
    ],
    fields: [
      't0 on text clock "timer"',
      't1 on text "Text 2"',
    ],
    controls: [
      'f0 textfield "timer"',
      'f1 textfield "Text 2"',
    ],
    labels: [
      'clock.display clock @0/2 -> t0 on',
      'decoy fixed @0/3 -> t1 on',
    ],
    appearance: {
      source: 'd936634e037322aa14325264afec90d506b9793458875eaaa89e8c159ec01ade',
      bound: 'c947e13448175dbd10e6421103ca57d8e6f1731d00a8002a2bf985e47deac39b',
      css: '65c402060317c057e11930c055ef120182fc8f4c67538ee92c8d00388ec9c2a7',
      js: 'fb74c3164c1fd1e2997c8413e271005c18de5a963b8d365acff43b06195a103b',
      layout: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
      behaviour: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
    },
    gate: [],
    text: { rest: ['f0 1 100 fits', 'f1 1 100 fits'] },
  },
  'clock-2': {
    behaviour: null,
    layers: [
      's0 rect @0/0 #-',
      's1 rect @0/1/0 #-',
      't0 text @0/1/1 #-',
      't1 text @0/1/2/0 #-',
    ],
    fields: [
      't0 on text "Text 1"',
      't1 on text clock "Текст 2"',
    ],
    controls: [
      'f0 textfield "Text 1"',
      'f1 textfield "Текст 2"',
    ],
    labels: [
      'clock.display clock @0/1/2/0 -> t1 on',
      'decoy fixed @0/1/1 -> t0 on',
      'decoy fixed @0/2/0 -> no layer',
    ],
    appearance: {
      source: 'cda54f525856560c0213775a5b424007e88372ff9d53415835d212a042a7c89f',
      bound: '1cffa17d67699e07608d1ea07239aa0c8895408205d32e6f740afc88d527ba0e',
      css: 'e87362dfd3c8f9bd2030a318e97002276992619d92f6e934d0d33f5d8c45051b',
      js: '3931a1d05782f6637d45f80749a3b8d295e60ed459abbc78979112da257ef7c3',
      layout: 'd40e212dcc07d578378d3d4302bf6375a4c8a9c2f349fa097e25e95ad9e10534',
      behaviour: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
    },
    gate: [],
    text: { rest: ['f0 1 100 fits', 'f1 1 100 fits'] },
  },
  'clock-3': {
    behaviour: null,
    layers: [
      's0 rect @0/0 #-',
      't0 text @0/1 #-',
      't1 text @0/2 #Text_04',
      't2 text @0/3 #-',
    ],
    fields: [
      't0 on text "Text 1"',
      't1 on text clock "Text 2"',
      't2 on text "Text 3"',
    ],
    controls: [
      'f0 textfield "Text 1"',
      'f1 textfield "Text 2"',
      'f2 textfield "Text 3"',
    ],
    labels: [
      'clock.display clock @0/2 -> t1 on',
      'decoy fixed @0/1 -> t0 on',
      'decoy fixed @0/3 -> t2 on',
    ],
    appearance: {
      source: '2e4a7d20e04821a06a29be2e5e0c46cd48d00b97794b0ae75f2f080c39466efb',
      bound: '89355751179d4167b43b2b4f47e5190cc0b23658f6d43eb25136ef256a1359fe',
      css: '7d1c698e7200e429524a075bec4628bf228d5ed7996fad441e8eb204bc8f75b9',
      js: 'fb74c3164c1fd1e2997c8413e271005c18de5a963b8d365acff43b06195a103b',
      layout: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
      behaviour: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
    },
    gate: [],
    text: { rest: ['f0 1 100 fits', 'f1 1 100 fits', 'f2 1 100 fits'] },
  },
  'quiz-1': {
    behaviour: 'quiz',
    layers: [
      's0 rect @0/0 #-',
      't0 text @0/1 #Question',
      's1 rect @0/2 #-',
      't1 text @0/3 #answer1',
      's2 rect @0/4 #-',
      't2 text @0/5 #answer2',
      's3 rect @0/6 #-',
      't3 text @0/7 #answer3',
      's4 rect @0/8 #-',
      't4 text @0/9 #answer4',
    ],
    fields: [
      't0 on text "Question"',
      't1 on text "answer1"',
      't2 on text "answer2"',
      't3 on text "answer3"',
      't4 on text "answer4"',
    ],
    controls: [
      'f0 textfield "Question"',
      'f1 textfield "answer1"',
      'f2 textfield "answer2"',
      'f3 textfield "answer3"',
      'f4 textfield "answer4"',
      'f5 dropdown "Correct answer"',
      'f6 dropdown "Selected answer"',
    ],
    labels: [
      'quiz.question text @0/1 -> t0 on',
      'quiz.answer.1 text @0/3 -> t1 on',
      'quiz.answer.2 text @0/5 -> t2 on',
      'quiz.answer.3 text @0/7 -> t3 on',
      'quiz.answer.4 text @0/9 -> t4 on',
    ],
    appearance: {
      source: '7edec9d4cba89875210266468da3d884691380501ed28f537876223987eb9c52',
      bound: 'a723ea4bf9b9e7333b58c99a0e69470d66ca32260d4ac8a4c5a53c0cf637f21f',
      css: '90b01af24c48512bd868a7cbcc2bb2f73d4b52b1a4228be519d2b37568459fbf',
      js: '13b1a5cbfbcc9185d0518da9a87a35c9374100a4c269b2bba49cfeb0a6ccc5b1',
      layout: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
      behaviour: 'a7ebb963fa864b84c15fc3fa9fa6b6f1b94ba3ed701fa60fb27ac61333229f8d',
    },
    gate: [],
    text: { rest: ['f0 1 100 fits', 'f1 1 100 fits', 'f2 1 100 fits', 'f3 1 100 fits', 'f4 1 100 fits'] },
  },
  'quiz-2': {
    behaviour: null,
    layers: [
      's0 rect @0/0 #-',
      't0 text @0/1 #-',
      't1 text @0/3 #-',
      't2 text @0/4 #-',
      't3 text @0/6 #-',
      't4 text @0/7 #-',
      't5 text @0/9 #-',
      't6 text @0/10 #-',
      't7 text @0/12 #-',
      't8 text @0/13 #-',
    ],
    fields: [
      't0 on text "Питання"',
      't1 on text numeric "Text 2"',
      't2 on text "Текст"',
      't3 on text numeric "Text 4"',
      't4 on text "Текст 2"',
      't5 on text numeric "Text 6"',
      't6 on text "Текст 3"',
      't7 on text numeric "Text 8"',
      't8 on text "Текст 4"',
    ],
    controls: [
      'f0 textfield "Питання"',
      'f1 number "Text 2"',
      'f2 textfield "Текст"',
      'f3 number "Text 4"',
      'f4 textfield "Текст 2"',
      'f5 number "Text 6"',
      'f6 textfield "Текст 3"',
      'f7 number "Text 8"',
      'f8 textfield "Текст 4"',
    ],
    labels: [
      'quiz.question text @0/1 -> t0 on',
      'quiz.answer.1 text @0/4 -> t2 on',
      'quiz.answer.2 text @0/7 -> t4 on',
      'quiz.answer.3 text @0/10 -> t6 on',
      'quiz.answer.4 text @0/13 -> t8 on',
      'decoy fixed @0/3 -> t1 on',
      'decoy fixed @0/6 -> t3 on',
      'decoy fixed @0/9 -> t5 on',
      'decoy fixed @0/12 -> t7 on',
      'decoy fixed @0/14/0 -> no layer',
    ],
    appearance: {
      source: '0f9e9bb7dcab94de234c29b9ab106380d0b3da95a9e1726e4b058751bf83da72',
      bound: 'a4513ab23281a4e0d9b4c743036509fab8d3b5c211f7a3ee6c239d0f7d8b2996',
      css: '8ba74b0f51551503728cc9acff363bf3e093705eba8a472085ba22dfe3c31cac',
      js: 'fb74c3164c1fd1e2997c8413e271005c18de5a963b8d365acff43b06195a103b',
      layout: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
      behaviour: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
    },
    gate: [],
    text: { rest: ['f0 1 100 fits', 'f1 1 100 fits', 'f2 1 100 fits', 'f3 1 100 fits', 'f4 1 100 fits', 'f5 1 100 fits', 'f6 1 100 fits', 'f7 1 100 fits', 'f8 1 100 fits'] },
  },
  'quiz-3': {
    behaviour: 'recipe',
    layers: [
      's0 rect @0/0 #-',
      't0 text @0/1 #score',
      's1 path @0/2 #-',
      's2 path @0/3 #-',
      't1 text @0/4 #Clock',
      't2 text @0/5 #Reveal',
      't3 text @0/6 #-',
    ],
    fields: [
      't0 on text "score"',
      't1 on text "Clock"',
      't2 on text "Reveal"',
      't3 on text "Text 4"',
    ],
    controls: [
      'f0 textfield "score"',
      'f1 textfield "Clock"',
      'f2 textfield "Text 4"',
      'f3 textfield "The reveal"',
    ],
    labels: [
      'quiz.question text @0/1 -> t0 on',
      'quiz.answer.1 text @0/4 -> t1 on',
      'quiz.answer.2 text @0/5 -> t2 on',
      'decoy fixed @0/6 -> t3 on',
    ],
    appearance: {
      source: '65e9444e39a061aaffcd1fbad49a0c1d3a0eefacec4e134bd966cb009afba194',
      bound: 'f5903bfb7e6221cb596a372a27f8d9c311a389377b13ff30ecfeb9018819a5aa',
      css: 'f6574fb12c84a128b5f2110595c66ca00f1542234a8c9f60b7860b5baa470eda',
      js: 'b869f5a1b20a48c2f503d8eb3b0ad0e176abff4382e7f1cee0d67f7232b8a270',
      layout: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
      behaviour: '17d5e70f01e2236b374607c10b45818cf0369ba2243d5b870813db1d30bfa5b4',
    },
    gate: [],
    text: { rest: ['f0 1 100 fits', 'f1 1 100 fits', 'f2 1 100 fits'] },
  },
  'credits-1': {
    behaviour: null,
    layers: [
      's0 rect @0/0 #-',
      't0 text @0/1 #-',
      't1 text @0/2 #role0',
      't2 text @0/3 #name0-0',
      't3 text @0/4 #name0-1',
      't4 text @0/5 #role1',
      't5 text @0/6 #name1-0',
    ],
    fields: [
      't0 on text "Text 1"',
      't1 on text "role0"',
      't2 on text "name0-0"',
      't3 on text "name0-1"',
      't4 on text "role1"',
      't5 on text "name1-0"',
    ],
    controls: [
      'f0 textfield "Text 1"',
      'f1 textfield "role0"',
      'f2 textfield "name0-0"',
      'f3 textfield "name0-1"',
      'f4 textfield "role1"',
      'f5 textfield "name1-0"',
    ],
    labels: [
      'credits.role text @0/2 -> t1 on',
      'credits.name text @0/3 -> t2 on',
      'credits.name text @0/4 -> t3 on',
      'credits.role text @0/5 -> t4 on',
      'credits.name text @0/6 -> t5 on',
      'decoy fixed @0/1 -> t0 on',
    ],
    appearance: {
      source: 'b86d4fc6aa7abe990d8812f92f3c5026a6ce939860479cc43f7c5a6a0ffbe3da',
      bound: '23f85597b9369980b891369a99063b105d7c8d7b484b4e693ae66aaf40b2d0dd',
      css: '20f978ebb75e7989c548fa95049a677a90a7acc5e98c62f6c57d29754ac47c55',
      js: 'fb74c3164c1fd1e2997c8413e271005c18de5a963b8d365acff43b06195a103b',
      layout: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
      behaviour: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
    },
    gate: [],
    text: { rest: ['f0 1 100 fits', 'f1 1 100 fits', 'f2 1 100 fits', 'f3 1 100 fits', 'f4 1 100 fits', 'f5 1 100 fits'] },
  },
  'credits-2': {
    behaviour: null,
    layers: [
      's0 rect @0/0 #-',
      's1 rect @0/1 #-',
      't0 text @0/2 #-',
      't1 text @0/3 #-',
      't2 text @0/4 #-',
      't3 text @0/5 #-',
      't4 text @0/6 #-',
      't5 text @0/7 #-',
    ],
    fields: [
      't0 on text "Text 1"',
      't1 on text "fonction"',
      't2 on text "nom"',
      't3 on text "fonction 2"',
      't4 on text "nom 2"',
      't5 on text "nom 3"',
    ],
    controls: [
      'f0 textfield "Text 1"',
      'f1 textfield "fonction"',
      'f2 textfield "nom"',
      'f3 textfield "fonction 2"',
      'f4 textfield "nom 2"',
      'f5 textfield "nom 3"',
    ],
    labels: [
      'credits.role text @0/3 -> t1 on',
      'credits.name text @0/4 -> t2 on',
      'credits.role text @0/5 -> t3 on',
      'credits.name text @0/6 -> t4 on',
      'credits.name text @0/7 -> t5 on',
      'decoy fixed @0/2 -> t0 on',
    ],
    appearance: {
      source: 'f05607f440799635b3f7d83d6b023b1c5a1e1b8bc1c660b483d043e67771dda2',
      bound: '54a242e4979cf22ae7b777359b5f44b090949a39c5073858be46108fc37bafe4',
      css: '64c8c40059781e38f0a4579ccaa245537b429113205d3f1b999265cb20168bed',
      js: 'fb74c3164c1fd1e2997c8413e271005c18de5a963b8d365acff43b06195a103b',
      layout: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
      behaviour: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
    },
    gate: [],
    text: { rest: ['f0 1 100 fits', 'f1 1 100 fits', 'f2 1 100 fits', 'f3 1 100 fits', 'f4 1 100 fits', 'f5 1 100 fits'] },
  },
  'credits-3': {
    behaviour: null,
    layers: [
      's0 rect @0/0 #-',
      't0 text @0/1 #-',
      't1 text @0/2/0 #Layer1',
      't2 text @0/2/1 #Layer2',
      't3 text @0/3/0 #Layer3',
      't4 text @0/3/1 #Layer4',
    ],
    fields: [
      't0 on text "Text 1"',
      't1 on text "Text 2"',
      't2 on text "Text 3"',
      't3 on text "Text 4"',
      't4 on text "Text 5"',
    ],
    controls: [
      'f0 textfield "Text 1"',
      'f1 textfield "Text 2"',
      'f2 textfield "Text 3"',
      'f3 textfield "Text 4"',
      'f4 textfield "Text 5"',
    ],
    labels: [
      'credits.role text @0/2/0 -> t1 on',
      'credits.name text @0/2/1 -> t2 on',
      'credits.role text @0/3/0 -> t3 on',
      'credits.name text @0/3/1 -> t4 on',
      'decoy fixed @0/1 -> t0 on',
    ],
    appearance: {
      source: '6c5e8aa57c329ace20351353719349142ac807e89b44f0ef23dfc7572b8c1907',
      bound: '2a6897581c16daaca1a091c7f71da829da406e995aa4d3954e53470efa91bc58',
      css: 'f7c1131d1b32d7076c382c459f749c45626445e71f99424f61f87f3664bba078',
      js: 'fb74c3164c1fd1e2997c8413e271005c18de5a963b8d365acff43b06195a103b',
      layout: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
      behaviour: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
    },
    gate: [],
    text: { rest: ['f0 1 100 fits', 'f1 1 100 fits', 'f2 1 100 fits', 'f3 1 100 fits', 'f4 1 100 fits'] },
  },
  'score-clock-1': {
    behaviour: null,
    layers: [
      's0 rect @0/0 #-',
      's1 rect @0/1 #-',
      't0 text @0/2 #home',
      't1 text @0/3 #home-score',
      's2 rect @0/4 #-',
      't2 text @0/5 #match-time',
      't3 text @0/6 #away-score',
      't4 text @0/7 #away',
    ],
    fields: [
      't0 on text "home"',
      't1 on text numeric "home-score"',
      't2 on text clock "match-time"',
      't3 on text numeric "away-score"',
      't4 on text "away"',
    ],
    controls: [
      'f0 textfield "home"',
      'f1 number "home-score"',
      'f2 textfield "match-time"',
      'f3 number "away-score"',
      'f4 textfield "away"',
    ],
    labels: [
      'team.home text @0/2 -> t0 on',
      'score.home number @0/3 -> t1 on',
      'clock.display clock @0/5 -> t2 on',
      'score.away number @0/6 -> t3 on',
      'team.away text @0/7 -> t4 on',
    ],
    appearance: {
      source: 'e687c84991ce5cf6adc490fba7cb6360ca3ccc41da5bdbc63a98ac51c55905e5',
      bound: 'a8d8230df7449d470708336d817c618971051ea7b1ce364da29184b98c9109f6',
      css: '2f879d10da8fc370c3f1a4979f24d825fcb6888c72d51e3023dffced7b3c9848',
      js: 'fb74c3164c1fd1e2997c8413e271005c18de5a963b8d365acff43b06195a103b',
      layout: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
      behaviour: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
    },
    gate: [],
    text: { rest: ['f0 1 100 fits', 'f1 1 100 fits', 'f2 1 100 fits', 'f3 1 100 fits', 'f4 1 100 fits'] },
  },
  'score-clock-2': {
    behaviour: null,
    layers: [
      's0 rect @0/0 #-',
      't0 text @0/2 #-',
      's1 rect @0/3 #-',
      's2 rect @0/4 #-',
      't1 text @0/5 #-',
      't2 text @0/6 #-',
      't3 text @0/7 #-',
      't4 text @0/8 #-',
    ],
    fields: [
      't0 on text clock "Zegar"',
      't1 on text "Nazwa"',
      't2 on text "Nazwa 2"',
      't3 on text numeric "Wynik"',
      't4 on text numeric "Wynik 2"',
    ],
    controls: [
      'f0 textfield "Zegar"',
      'f1 textfield "Nazwa"',
      'f2 textfield "Nazwa 2"',
      'f3 number "Wynik"',
      'f4 number "Wynik 2"',
    ],
    labels: [
      'clock.display clock @0/2 -> t0 on',
      'team.home text @0/5 -> t1 on',
      'team.away text @0/6 -> t2 on',
      'score.home number @0/7 -> t3 on',
      'score.away number @0/8 -> t4 on',
    ],
    appearance: {
      source: 'a2c63734bfd2327fc1207b9e9ce72f1570f5161c3e8062fad1243c93af572008',
      bound: '74437f7f0496db83406bfdf34565fbb88d56d6dc7f093be26412d0a2fbe7b7dc',
      css: '6567d0949e35e614d4bd88dcdd2a6e1c904496599f5b377146961ed0394704ff',
      js: 'fb74c3164c1fd1e2997c8413e271005c18de5a963b8d365acff43b06195a103b',
      layout: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
      behaviour: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
    },
    gate: [],
    text: { rest: ['f0 1 100 fits', 'f1 1 100 fits', 'f2 1 100 fits', 'f3 1 100 fits', 'f4 1 100 fits'] },
  },
  'score-clock-3': {
    behaviour: null,
    layers: [
      's0 rect @0/0 #-',
      't0 text @0/1 #timer',
      's1 rect @0/2/0 #-',
      't1 text @0/2/1 #object0',
      't2 text @0/2/2 #object2',
      's2 rect @0/2/3 #-',
      't3 text @0/2/4 #object1',
      't4 text @0/2/5 #object3',
      't5 text @0/3 #object4',
      't6 text @0/4 #-',
    ],
    fields: [
      't0 on text "timer"',
      't1 on text "object0"',
      't2 on text numeric "object2"',
      't3 on text "object1"',
      't4 on text numeric "object3"',
      't5 on text clock "object4"',
      't6 on text "Text 7"',
    ],
    controls: [
      'f0 textfield "timer"',
      'f1 textfield "object0"',
      'f2 number "object2"',
      'f3 textfield "object1"',
      'f4 number "object3"',
      'f5 textfield "object4"',
      'f6 textfield "Text 7"',
    ],
    labels: [
      'team.home text @0/2/1 -> t1 on',
      'score.home number @0/2/2 -> t2 on',
      'team.away text @0/2/4 -> t3 on',
      'score.away number @0/2/5 -> t4 on',
      'clock.display clock @0/3 -> t5 on',
      'decoy fixed @0/1 -> t0 on',
      'decoy fixed @0/4 -> t6 on',
    ],
    appearance: {
      source: 'e7e5fb3c76e73cc7b1515cbac7c5f54d75856f964c564465d6fddabc9fd48cef',
      bound: '69f7310d070a24894337fc963b6365e2c89d796824499af2a846c3adf9a1bbca',
      css: '35b28f091e6113399d1caefce9d1d1900d74fef7496b998cc7a138ab62ea06d8',
      js: 'fb74c3164c1fd1e2997c8413e271005c18de5a963b8d365acff43b06195a103b',
      layout: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
      behaviour: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b',
    },
    gate: [],
    text: { rest: ['f0 1 100 fits', 'f1 1 100 fits', 'f2 1 100 fits', 'f3 1 100 fits', 'f4 1 100 fits', 'f5 1 100 fits', 'f6 1 100 fits'] },
  },
};

test('the baseline is the 18 development designs, three per stratum, each file as the manifest pins it', () => {
  assert.equal(manifest.partition, 'development');
  assert.equal(designs.length, 18);
  for (const stratum of STRATA) assert.equal(designs.filter((d) => d.label?.stratum === stratum).length, 3, stratum);
  for (const d of designs) assert.equal(sha(d.markup), d.file.sha256, `${d.name}: the file is not the one the manifest pins`);
  assert.deepEqual(Object.keys(BASELINE), designs.map((d) => d.name), 'a design has no record, or the record names one the manifest does not');
});

for (const d of designs) {
  test(`${d.name}: the import matches its recorded baseline`, () => {
    const { text: wasText, ...was } = BASELINE[d.name] ?? {};
    const { text, ...now } = records[d.name];
    const lines = diff(was, now, 0);
    const textMoved = textMoves(wasText, text);
    if (browser === RECORDED_ON) lines.push(...textMoved);
    // Printed when anything moved, the uncompared text included, so a CI log carries it.
    if (lines.length || textMoved.length) console.log(`[jev-svg-baseline] record ${d.name} ${JSON.stringify(records[d.name])}`);
    assert.equal(lines.length, 0, `${d.name} moved from its baseline:\n  ${lines.join('\n  ')}`);
  });
}

// On CI a different build fails rather than skips: a browser upgrade must re-take `text` in the diff,
// never switch the comparison off unseen.
test('the text is compared on the build it was recorded on', { skip: browser === RECORDED_ON || process.env.CI ? false : `recorded on Chromium ${RECORDED_ON}, this is ${browser}: CI compares it` }, () => {
  assert.equal(browser, RECORDED_ON, `CI runs Chromium ${browser}, the record's text is from ${RECORDED_ON}: take the printed records on this build and update RECORDED_ON`);
});
