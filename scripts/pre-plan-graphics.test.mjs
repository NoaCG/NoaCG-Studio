// gate: factory
// needs: browser
// guards: src/templates/importedDesign/**, src/templates/behaviours/**, src/blocks/behaviourData.ts, src/validation/validateTemplate.ts, src/model/importTemplate.ts, src/components/wizard/import/draft.ts, src/preview/composeDocument.ts, scripts/fixtures/pre-tl2/**, e2e/fixtures/illustrator-exports/live-vote.svg
//
// GRAPHICS AND EXPORTS MADE BEFORE THE SVG TEMPLATE LIBRARY PLAN KEEP WORKING (svg-template-library
// TL2, AC-9; spec Rules C7 and C8). The fixtures in scripts/fixtures/pre-tl2 are committed bytes, built
// at df0c7a0 (the last main before the plan) and never regenerated: an imported live vote and an
// imported countdown, and the vote's downloaded package (SPX and OGraf in one folder).
//
//   1. A FROZEN OLD IMPORT plays through today's preview: the vote's readouts paint its shares and
//      its drawn percents follow the Live figures switch; the countdown counts, warns inside its threshold
//      and holds at zero. Its saved code reaches the page unchanged.
//   2. AN OLD EXPORT, imported again through today's zip door, keeps its frozen runtime byte for
//      byte, passes the export gate's behaviour check, and plays; the package's own page plays as
//      a playout server would load it.
//   3. A REIMPORT of edited artwork over the old vote (a layer added in front of every field, a
//      colour changed) keeps every field id, so a cue's values recorded on the old graphic paint
//      the same figures on the new one, whose rebuilt table its new runtime reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { withBundledPage } from './catalog-emit.mjs';
import { installDrivenPage } from './driven-clock.mjs';
import { measured } from './measured.mjs';

const at = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const entry = (rel) => at(`src/${rel}`);
const SPECS = [
  { entry: entry('assets/svgImport.ts'), globalName: 'NOACG_SVG' },
  { entry: entry('components/wizard/import/draft.ts'), globalName: 'NOACG_DRAFT' },
  { entry: entry('templates/importedDesign/svg.ts'), globalName: 'NOACG_IMPORTED' },
  { entry: entry('preview/composeDocument.ts'), globalName: 'NOACG_COMPOSE' },
  { entry: entry('model/importTemplate.ts'), globalName: 'NOACG_IMPORT' },
  { entry: entry('validation/validateTemplate.ts'), globalName: 'NOACG_VALIDATE' },
  { entry: entry('templates/importedDesign/behaviourReads.ts'), globalName: 'NOACG_READS' },
];
const VOTE = JSON.parse(readFileSync(at('scripts/fixtures/pre-tl2/vote.json'), 'utf8'));
const COUNTDOWN = JSON.parse(readFileSync(at('scripts/fixtures/pre-tl2/countdown.json'), 'utf8'));
const PACKAGE = readFileSync(at('scripts/fixtures/pre-tl2/vote-package.zip'));
const BOARD = readFileSync(at('e2e/fixtures/illustrator-exports/live-vote.svg'), 'utf8');

/** The edited artwork: a badge drawn in front of every field (so the build numbers it first and
 *  every earlier id would move by one) and a new panel colour. */
const EDITED = BOARD.replace('#1d2b53', '#22305e').replace(
  '<g id="Board">',
  '<g id="Board">\n    <text id="Badge" class="st7" transform="translate(1400 220)"><tspan x="0" y="0">LIVE</tspan></text>',
);

/** A cue recorded on the old vote: its values by the OLD graphic's field ids. */
const byTitle = (t, title) => t.fields.find((f) => f.title === title)?.field;
const CUE = {
  [byTitle(VOTE, 'Question')]: 'Where next?',
  [byTitle(VOTE, 'Options')]: 'Coast | 7\nForest | 2\nCity | 1',
  [byTitle(VOTE, 'Vote status')]: 'open',
  [byTitle(VOTE, 'Live figures')]: 'live',
};

// ── In the browser ──────────────────────────────────────────────────────────────────────────

/** Mount a template, play it with a cue's values and read the vote's readouts and looks. */
const PAINT_VOTE = async ({ template, values, thenWith }) => {
  const w = await window.__mountDesign(template);
  const layer = (name) => w.document.querySelector(`[data-name="${name}"], #${name}`);
  w.update(JSON.stringify(values));
  w.play();
  w.__advance(3000);
  const read = () => ({
    question: w.document.getElementById(Object.keys(values)[0])?.textContent ?? null,
    percents: [1, 2, 3].map((n) => layer(`Percent_${n}`)?.textContent ?? null),
    lit: [...w.document.querySelectorAll('.imported-design-on')].map((el) => el.getAttribute('data-noacg-role')).sort(),
  });
  const open = read();
  w.update(JSON.stringify({ ...values, ...thenWith }));
  w.__advance(2000);
  const closed = read();
  const js = w.document.documentElement.outerHTML.includes('NOACG_BEHAVIOUR_READS');
  document.getElementById('fx')?.remove();
  return { open, closed, declares: js };
};

const RUN = async ({ vote, countdown, edited, cue, pkg }) => {
  const out = {};
  // The second write turns Live figures off: the drawn percent looks follow the select kind.
  const liveId = vote.fields.find((f) => f.title === 'Live figures').field;
  const thenWith = { [liveId]: '' };
  const check = (t) => window.NOACG_VALIDATE.validateTemplate(t).errors.filter((e) => e.rule === 'behaviour').map((e) => e.message);

  // 1. The frozen old import.
  out.frozenVote = await (async () => {
    const js = vote.js;
    const painted = await window.__paintVote({ template: vote, values: cue, thenWith });
    return { ...painted, sameCode: vote.js === js, errors: check(vote) };
  })();
  out.frozenCountdown = await (async () => {
    const minutes = countdown.fields.find((f) => f.title === 'Clock (minutes)').field;
    const warnAt = countdown.fields.find((f) => f.title === 'Warn at (seconds)').field;
    const w = await window.__mountDesign(countdown);
    const lit = (role) => [...w.document.querySelectorAll(`[data-noacg-role~="${role}"]`)].some((el) => el.classList.contains('imported-design-on'));
    const has = (role) => w.document.querySelectorAll(`[data-noacg-role~="${role}"]`).length > 0;
    const clock = () => (w.document.querySelector('.imported-design-clock')?.textContent ?? '').trim();
    w.update(JSON.stringify({ [minutes]: '0.25', [warnAt]: '10' }));
    w.play();
    w.__advance(2000);
    const early = { clock: clock(), warning: lit('warning'), expired: lit('expired') };
    w.__advance(5000);
    const warned = { clock: clock(), warning: lit('warning'), expired: lit('expired') };
    w.__advance(12000);
    const done = { clock: clock(), warning: lit('warning'), expired: lit('expired') };
    document.getElementById('fx')?.remove();
    return { early, warned, done, roles: { warning: has('warning'), expired: has('expired') }, errors: check(countdown) };
  })();

  // 2. The old export, through today's zip door, and on its own page.
  out.export = await (async () => {
    const bytes = Uint8Array.from(atob(pkg), (c) => c.charCodeAt(0));
    const imported = await window.NOACG_IMPORT.importZipTemplate('imported_svg_design.zip', bytes.buffer);
    const t = imported.template;
    const painted = await window.__paintVote({ template: t, values: cue, thenWith });
    return { js: t.js, errors: check(t), fieldIds: t.fields.map((f) => `${f.field}:${f.title}`), painted };
  })();

  // 3. Reimport of edited artwork over the old vote.
  out.reimport = await (async () => {
    const svg = window.NOACG_SVG.importSvgMarkup(edited);
    const draft = window.__importDraft(svg);
    const built = window.NOACG_IMPORTED.IMPORTED_SVG.create({ designSvg: window.NOACG_DRAFT.svgDesignOptions(draft) });
    const done = window.NOACG_DRAFT.svgReimported({ template: vote, baseline: vote }, built);
    if (!done) return { error: 'not a reimport' };
    const t = done.template;
    const painted = await window.__paintVote({ template: t, values: cue, thenWith });
    return {
      unresolved: done.unresolved,
      before: vote.fields.map((f) => `${f.field}:${f.title}`),
      after: t.fields.map((f) => `${f.field}:${f.title}`),
      builtIds: built.fields.map((f) => `${f.field}:${f.title}`),
      verdict: window.NOACG_READS.behaviourReadsVerdict(t.js),
      errors: check(t),
      painted,
    };
  })();
  return out;
};

/** Open the package's own page from the files of the zip, the way a playout server serves the
 *  folder, and drive it as SPX does: update, then play. */
async function playPackage(browser, zip) {
  const files = new Map();
  for (const [name, file] of Object.entries(zip.files)) if (!file.dir) files.set(name, await file.async('nodebuffer'));
  const page = await browser.newPage();
  await page.route('http://package.test/**', (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
    const body = files.get(name);
    if (!body) return route.fulfill({ status: 404, body: '' });
    const type = name.endsWith('.html') ? 'text/html' : name.endsWith('.css') ? 'text/css' : name.endsWith('.js') || name.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream';
    return route.fulfill({ status: 200, contentType: type, body });
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('http://package.test/imported_svg_design/imported_svg_design.html');
  const result = await page.evaluate(async (cue) => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const layer = (name) => document.querySelector(`[data-name="${name}"], #${name}`);
    window.update(JSON.stringify(cue));
    window.play();
    await wait(2500);
    return [1, 2, 3].map((n) => layer(`Percent_${n}`)?.textContent ?? null);
  }, CUE);
  await page.close();
  return { percents: result, errors };
}

const { out, own } = await withBundledPage(SPECS, async (page) => {
  await installDrivenPage(page);
  await page.evaluate((src) => { window.__paintVote = new Function(`return (${src})`)(); }, PAINT_VOTE.toString());
  const result = await page.evaluate(RUN, { vote: VOTE, countdown: COUNTDOWN, edited: EDITED, cue: CUE, pkg: PACKAGE.toString('base64') });
  const own = await playPackage(page.context().browser(), await JSZip.loadAsync(PACKAGE));
  return { out: result, own };
});

measured(3, 'graphics and exports made before the plan');

const SHARES = ['70%', '20%', '10%'];

test('a frozen old vote plays through today\'s preview: its shares paint, and its live figures show and hide', () => {
  const v = out.frozenVote;
  assert.equal(v.sameCode, true);
  assert.deepEqual(v.errors, []);
  assert.equal(v.declares, false, 'its frozen runtime declares nothing, as built');
  assert.deepEqual(v.open.percents, SHARES);
  assert.equal(v.open.question, 'Where next?');
  assert.deepEqual(v.open.lit, ['percent/1', 'percent/2', 'percent/3'], 'live figures show the drawn percents');
  assert.deepEqual(v.closed.lit, [], 'and hide them when turned off');
});

test('a frozen old countdown counts, warns inside its threshold and holds at zero', () => {
  const c = out.frozenCountdown;
  assert.deepEqual(c.errors, []);
  const secs = (text) => { const m = /^(\d+):(\d\d)$/.exec(text); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
  assert.ok(secs(c.early.clock) > 10 && secs(c.early.clock) < 15, `counting, outside the warning: ${c.early.clock}`);
  assert.ok(secs(c.warned.clock) > 0 && secs(c.warned.clock) <= 10, `inside the warning: ${c.warned.clock}`);
  assert.equal(c.done.clock, '0:00');
  if (c.roles.warning) assert.deepEqual([c.early.warning, c.warned.warning], [false, true]);
  if (c.roles.expired) assert.deepEqual([c.warned.expired, c.done.expired], [false, true]);
  assert.ok(c.roles.warning || c.roles.expired, 'the board draws a warning or a time-up look');
});

test('an old export, imported again, keeps its frozen runtime byte for byte, passes the check and plays', async () => {
  const zip = await JSZip.loadAsync(PACKAGE);
  const saved = await zip.file('imported_svg_design/js/template.js').async('string');
  assert.equal(out.export.js, saved);
  assert.ok(!saved.includes('NOACG_BEHAVIOUR_READS'));
  assert.deepEqual(out.export.errors, []);
  assert.deepEqual(out.export.fieldIds, VOTE.fields.map((f) => `${f.field}:${f.title}`));
  assert.deepEqual(out.export.painted.open.percents, SHARES);
});

test('an old export\'s own page still plays as a playout server loads it', () => {
  assert.deepEqual(own.errors, []);
  assert.deepEqual(own.percents, SHARES);
});

test('reimporting edited artwork over the old vote keeps every field id, so the old cue paints the same figures', () => {
  const r = out.reimport;
  assert.equal(r.error, undefined);
  assert.deepEqual(r.unresolved, []);
  // The new build numbered the badge first; the reimport gave every earlier field its old id.
  assert.notDeepEqual(r.builtIds.filter((x) => !/Badge/.test(x)), r.before, 'the edit moved the built ids');
  for (const field of r.before) assert.ok(r.after.includes(field), `${field} kept`);
  assert.deepEqual(r.verdict, { status: 'ok' });
  assert.deepEqual(r.errors, []);
  assert.equal(r.painted.declares, true, 'the rebuilt runtime declares what it reads');
  assert.deepEqual(r.painted.open.percents, SHARES);
  assert.equal(r.painted.open.question, 'Where next?');
  assert.deepEqual(r.painted.open.lit, out.frozenVote.open.lit);
  assert.deepEqual(r.painted.closed.lit, out.frozenVote.closed.lit);
});
