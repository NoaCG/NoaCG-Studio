// needs: browser
// guards: src/validation/designRulesWarnings.ts, src/validation/readabilityCheck.ts, src/validation/tickerCheck.ts, src/validation/markLegibility.ts
//
// WHAT THE DESIGN RULES MEASURED, not only what they found (issue #840).
//
// `designRulesWarnings` is the product face of the legibility rules: the export panel, the
// runtime bench and the readiness report all read it. An empty list from it means "clean", so it
// must never be what a frame it could not read produces. And two of the rules it phrases could
// not fire from the product at all: the brand mark's safe-area rule needed a mark field id nobody
// passed, and the ticker-margin rule was reachable only through declared animation data.
//
// Pinned here, in a real engine because every rule reads computed style and layout:
//   - a frame whose text is all faded out says "not checked" instead of nothing, and a frame with
//     visible text or with no text fields at all does not;
//   - the mark rule fires for a mark outside the safe area and not for a cropped picture well;
//   - a ticker with no animation block is held to the margin rule, a lower third is not;
//   - across the whole catalog, in the pose the export panel measures, no shipped design reads
//     as "not checked" - the false positive that would teach people to ignore the warning.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { withBundledPage } from './catalog-emit.mjs';

const SPECS = [
  { entry: fileURLToPath(new URL('../src/templates/catalog.ts', import.meta.url)), globalName: 'NOACG_CATALOG' },
  { entry: fileURLToPath(new URL('../src/preview/composeDocument.ts', import.meta.url)), globalName: 'NOACG_COMPOSE' },
  { entry: fileURLToPath(new URL('../src/validation/designRulesWarnings.ts', import.meta.url)), globalName: 'NOACG_RULES' },
];

const MARK = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#e33"/></svg>',
);

/** Mount a hand-written frame and run the product's design-rules warnings over it. Runs in the
 *  browser. Returns the rule ids and messages. */
const MEASURE_FIXTURE = async ({ type, body, css, fields }) => {
  document.getElementById('fx')?.remove();
  const frame = document.createElement('iframe');
  frame.id = 'fx';
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1920px;height:1080px;border:0;';
  await new Promise((resolve) => {
    frame.onload = resolve;
    frame.srcdoc = `<!doctype html><html><head><style>html,body{margin:0;width:1920px;height:1080px;`
      + `font-family:sans-serif;color:#fff}${css}</style></head><body>${body}</body></html>`;
    document.body.appendChild(frame);
  });
  const template = {
    name: 'fixture', type, resolution: { width: 1920, height: 1080 }, fps: 50,
    html: body, css, js: '', fields, settings: {}, assets: [],
  };
  return window.NOACG_RULES.designRulesWarnings(frame.contentDocument, template, null)
    .map((w) => ({ rule: w.rule, message: w.message }));
};

/** The export panel's own measurement over every catalog design, a few frames at a time. Runs in
 *  the browser; returns each design's rule ids. */
const MEASURE_CATALOG = async () => {
  const ids = Object.values(window.NOACG_CATALOG.CATALOG).flat().map((v) => v.id);
  const out = {};
  const BATCH = 6;
  for (let i = 0; i < ids.length; i += BATCH) {
    await Promise.all(ids.slice(i, i + BATCH).map(async (id) => {
      const template = window.NOACG_CATALOG.variantById(id).create({});
      const warnings = await window.NOACG_RULES.checkTemplateLegibility(template, null);
      out[id] = warnings.map((w) => w.rule);
    }));
  }
  return out;
};

const TEXT_FIELD = [{ field: 'f0', ftype: 'textfield', title: 'Name', value: 'Ana Example' }];
const PANEL = 'position:absolute;left:200px;top:800px;padding:20px 40px;background:#101418;font-size:48px;';

const measured = await withBundledPage(SPECS, async (page) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const fixture = (args) => page.evaluate(MEASURE_FIXTURE, args);
  return {
    visible: await fixture({
      type: 'lower-third', fields: TEXT_FIELD, css: `.p{${PANEL}}`,
      body: '<div class="p"><span id="f0">Ana Example</span></div>',
    }),
    faded: await fixture({
      type: 'lower-third', fields: TEXT_FIELD, css: `.p{${PANEL}} #f0{opacity:0}`,
      body: '<div class="p"><span id="f0">Ana Example</span></div>',
    }),
    noTextFields: await fixture({
      type: 'corner-bug', fields: [], css: '.b{position:absolute;right:120px;top:80px;width:120px;height:60px;background:#e33}',
      body: '<div class="b"></div>',
    }),
    markOutside: await fixture({
      type: 'lower-third',
      fields: [...TEXT_FIELD, { field: 'f1', ftype: 'filelist', title: 'Logo', value: '' }],
      css: `.p{${PANEL}} #f1{position:absolute;left:10px;top:10px;width:200px;height:100px}`,
      body: `<div class="p"><span id="f0">Ana Example</span></div><img id="f1" src="${MARK}">`,
    }),
    pictureOutside: await fixture({
      type: 'lower-third',
      fields: [...TEXT_FIELD, { field: 'f1', ftype: 'filelist', title: 'Photo', value: '' }],
      css: `.p{${PANEL}} #f1{position:absolute;left:10px;top:10px;width:200px;height:100px;object-fit:cover}`,
      body: `<div class="p"><span id="f0">Ana Example</span></div><img id="f1" src="${MARK}">`,
    }),
    // A band hard against the left edge that stops 320px short of the right: the off-centre shape
    // the ticker rule exists for. No NOACG_ANIM block, as in a hand-written or imported ticker.
    tickerUneven: await fixture({
      type: 'ticker', fields: TEXT_FIELD,
      css: '.band{position:absolute;left:0;top:960px;width:1600px;height:72px;background:#101418;font-size:40px}',
      body: '<div class="band"><span id="f0">Ana Example</span></div>',
    }),
    strapUneven: await fixture({
      type: 'lower-third', fields: TEXT_FIELD,
      css: '.band{position:absolute;left:0;top:960px;width:1600px;height:72px;background:#101418;font-size:40px}',
      body: '<div class="band"><span id="f0">Ana Example</span></div>',
    }),
    catalog: await page.evaluate(MEASURE_CATALOG),
  };
});

const rules = (warnings) => warnings.map((w) => w.rule);

test('a frame whose text is all faded out reports that legibility was not checked', () => {
  assert.ok(rules(measured.faded).includes('legibility-unmeasured'), JSON.stringify(measured.faded));
  assert.ok(!rules(measured.visible).includes('legibility-unmeasured'), JSON.stringify(measured.visible));
});

test('a graphic with no text fields is measured, not unmeasured', () => {
  assert.deepEqual(rules(measured.noTextFields), []);
});

test('a brand mark outside the safe area is reported, a cropped picture well is not', () => {
  const mark = (warnings) => warnings.filter((w) => w.message.startsWith('The brand mark'));
  assert.equal(mark(measured.markOutside).length, 1, JSON.stringify(measured.markOutside));
  assert.equal(mark(measured.pictureOutside).length, 0, JSON.stringify(measured.pictureOutside));
});

test('a ticker with no animation block is held to the margin rule, a lower third is not', () => {
  assert.ok(rules(measured.tickerUneven).includes('legibility-ticker-margins'), JSON.stringify(measured.tickerUneven));
  assert.ok(!rules(measured.strapUneven).includes('legibility-ticker-margins'), JSON.stringify(measured.strapUneven));
});

test('no catalog design reads as "not checked" in the pose the export panel measures', () => {
  const ids = Object.keys(measured.catalog);
  assert.ok(ids.length > 100, `measured ${ids.length} catalog designs`);
  const unmeasured = ids.filter((id) => measured.catalog[id].includes('legibility-unmeasured'));
  assert.deepEqual(unmeasured, [], `${unmeasured.length} of ${ids.length} designs were not measured`);
});
