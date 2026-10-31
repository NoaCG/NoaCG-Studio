// gate: factory
// needs: browser
// guards: src/templates/importedDesign/artworkFields.ts, src/templates/importedDesign/svgBind.ts, src/templates/importedDesign/svg.ts, src/templates/behaviours/clock.ts, src/templates/shared/matchClock.ts, src/components/wizard/import/draft.ts
//
// THE IMPORTED CLOCK RUNS ON THE MATCH CLOCK (docs/work-specs/jev-svg-import/spec.md, row 8,
// AC-8). A clock the author picks on their own time layer is driven by the match-clock runtime a
// native scorebug runs (templates/shared/matchClock.ts) through that layer's own field: the layer
// keeps its font, place and transform, the old countdown engine is not emitted beside it, counting
// up waits for Start, a duration starts on Take and holds at zero, and Pause, Reset and a typed
// correction work. The rules are in docs/work-specs/jev-svg-import/evidence/phase-08.md (M1-M5).
//
// Each graphic is built the way the wizard builds it - the real reader, the drop's draft with the
// clock chosen on it, the real assembler - and run through the real composer on a clock this file
// drives (scripts/driven-clock.mjs), so every second below is exact.
//
//   node --test scripts/imported-match-clock.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withBundledPage } from './catalog-emit.mjs';
import { installDrivenPage } from './driven-clock.mjs';

const root = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const SPECS = [
  ['assets/svgImport.ts', 'NOACG_SVG'],
  ['components/wizard/import/draft.ts', 'NOACG_DRAFT'],
  ['templates/importedDesign/svg.ts', 'NOACG_IMPORTED'],
  ['preview/composeDocument.ts', 'NOACG_COMPOSE'],
  ['validation/validateTemplate.ts', 'NOACG_VALIDATE'],
  ['ai/svgInterpretation/contract.ts', 'NOACG_CONTRACT'],
].map(([rel, globalName]) => ({ entry: root(`src/${rel}`), globalName }));

/** A scorebug drawn as one piece of artwork: two names, two figures and the match time. */
const SCORE_CLOCK = readFileSync(root('e2e/fixtures/jev-svg/dev/score-clock-1.svg'), 'utf8');

/** Runs in the browser: the helpers every run below shares. */
const HELPERS = () => {
  const { NOACG_SVG: R, NOACG_DRAFT: D, NOACG_IMPORTED: I, NOACG_CONTRACT: C, NOACG_VALIDATE: V } = window;
  /** The drop's draft, with the clock chosen on the layer that reads as a time, as the step does. */
  window.__clockDraft = (markup, mode, extra = {}) => {
    const draft = window.__importDraft(R.importSvgMarkup(markup));
    const row = draft.svgFields.find((f) => f.on && f.clock);
    // The score tracker beside it, its two teams picked by their drawn words (names, then figures).
    const id = (sample) => draft.svgFields.find((f) => f.sample === sample)?.candidateId ?? '';
    const score = { kind: 'score', rows: [{ name: id('FIELD'), score: id('2'), flash: '' }, { name: id('SHORE'), score: id('5'), flash: '' }], final: '' };
    const next = {
      ...draft,
      svgBehaviour: score,
      svgClock: mode ? { candidateId: row.candidateId, mode, revision: C.svgSourceRevision(draft.designSvg.markup) } : null,
      ...extra,
    };
    return { draft: next, row };
  };
  window.__build = (draft) => {
    const designSvg = D.svgDesignOptions(draft);
    const template = I.IMPORTED_SVG.create({ designSvg });
    return { designSvg, template, gate: V.validateTemplate(template).errors.map((e) => `${e.rule}: ${e.message}`) };
  };
  window.__values = (template) => Object.fromEntries((template.fields || []).filter((f) => f.field).map((f) => [f.field, String(f.value ?? '')]));
};

/** Runs in the browser: what the built graphic carries for the clock, and how its layer was bound. */
const ANATOMY = ({ markup, mode }) => {
  const { draft, row } = window.__clockDraft(markup, mode);
  const { designSvg, template, gate } = window.__build(draft);
  const plain = window.__build({ ...draft, svgClock: null });
  const index = designSvg.fields.findIndex((f) => f.candidateId === row.candidateId);
  const doc = new DOMParser().parseFromString(template.html, 'text/html');
  const node = doc.getElementById(`f${index}`);
  const plainNode = new DOMParser().parseFromString(plain.template.html, 'text/html').getElementById(`f${index}`);
  const attrs = (el) => Object.fromEntries([...el.attributes].map((a) => [a.name, a.value]));
  return {
    behaviour: draft.svgBehaviour?.kind ?? null,
    extras: designSvg.extras,
    gate,
    field: template.fields.find((f) => f.field === `f${index}`),
    fieldCount: template.fields.length,
    plainFieldCount: plain.template.fields.length,
    clocks: doc.querySelectorAll('.imported-design-clock').length,
    tag: node?.tagName ?? null,
    text: node?.textContent ?? null,
    attrs: node ? attrs(node) : null,
    plainAttrs: plainNode ? attrs(plainNode) : null,
    // Everything but the time layer's own attributes is the same markup as without the clock.
    restSame: template.html.replace(/<text[^>]*id="f\d+"[^>]*imported-design-clock[^>]*>/, '') === plain.template.html.replace(new RegExp(`<text[^>]*id="f${index}"[^>]*>`), ''),
    js: {
      matchClock: /function startMatchClock\(/.test(template.js),
      adopts: /function importedClockUpdate\(/.test(template.js),
      countdownEngine: /function startClock\(|function clockDataUpdated\(/.test(template.js),
      hookBeforeFit: template.js.indexOf('importedClockUpdate(fields)') < template.js.indexOf('fitSvgText();') && template.js.includes('importedClockUpdate(fields)'),
    },
    plainJs: { matchClock: /MatchClock/.test(plain.template.js), adopts: /importedClockUpdate/.test(plain.template.js) },
    sameJsWithout: plain.template.js === window.__build({ ...draft, svgClock: undefined }).template.js,
  };
};

/** Runs in the browser: a graphic played on the driven clock, a script of steps read as it goes. */
const RUN = async ({ markup, mode, script }) => {
  const { draft, row } = window.__clockDraft(markup, mode);
  const { designSvg, template } = window.__build(draft);
  const field = `f${designSvg.fields.findIndex((f) => f.candidateId === row.candidateId)}`;
  const scores = designSvg.fields.flatMap((f, i) => (f.numeric ? [`f${i}`] : []));
  let values = window.__values(template);
  let w = await window.__mountDesign(template);
  const read = () => ({
    time: w.document.getElementById(field).textContent,
    // The clock's truth; the painted time follows it on the next one-second repaint.
    value: w.formatMatchClock(w.matchClockValue()),
    start: w.document.getElementById(field).getAttribute('data-start'),
    expired: w.document.querySelector('.imported-design').classList.contains('imported-design-expired'),
    clock: w.noacgMachineState().groups.clock_clock,
    scores: scores.map((s) => w.document.getElementById(s).textContent),
  });
  const out = [];
  for (const [verb, arg] of script) {
    if (verb === 'update') { values = { ...values, ...(arg === undefined ? {} : { [field]: arg }) }; w.update(JSON.stringify(values)); }
    else if (verb === 'score') { values = { ...values, [scores[0]]: arg }; w.update(JSON.stringify(values)); }
    else if (verb === 'stamped') { const at = w.Date.now() - arg.ago; w.update(JSON.stringify({ ...values, [field]: `${arg.value}@${at}` })); }
    else if (verb === 'take') { w.update(JSON.stringify(values)); w.play(); }
    else if (verb === 'out') w.stop();
    else if (verb === 'event') w.noacgDispatch(arg);
    else if (verb === 'wait') w.__advance(arg);
    else if (verb === 'reload') w = await window.__mountDesign(template);
    else if (verb === 'read') out.push({ label: arg, ...read() });
  }
  document.getElementById('fx')?.remove();
  return { field, out };
};

/** Long enough for any clock state's transition, and its calls, to have run. */
const SETTLE = 1500;

/** "12:08" -> 728. */
const secs = (t) => { const [m, ss] = t.split(':').map(Number); return m * 60 + ss; };

const runs = await withBundledPage(SPECS, async (page) => {
  await installDrivenPage(page);
  await page.evaluate(HELPERS);
  const anatomy = {};
  for (const mode of ['count-up', 'duration', 'target-time']) anatomy[mode] = await page.evaluate(ANATOMY, { markup: SCORE_CLOCK, mode });
  const run = (mode, script) => page.evaluate(RUN, { markup: SCORE_CLOCK, mode, script });
  return {
    anatomy,
    // Every event is read after SETTLE: a state's calls run inside its own short transition.
    up: await run('count-up', [
      ['take'], ['wait', 5000], ['read', 'on air, before Start'],
      ['event', 'clock_start'], ['wait', SETTLE], ['read', 'started'], ['wait', 3000], ['read', 'three seconds later'],
      ['event', 'clock_pause'], ['wait', SETTLE], ['read', 'paused'], ['wait', 4000], ['read', 'held four seconds'],
      ['update', '40:00'], ['read', 'corrected while held'], ['wait', 2000], ['read', 'still held'],
      ['event', 'clock_start'], ['wait', SETTLE], ['read', 'restarted'],
      ['update', '45:00'], ['read', 'corrected while running'], ['wait', 2000], ['read', 'two seconds after the correction'],
      ['score', '3'], ['read', 'a goal resends the whole value set'],
      ['event', 'clock_reset'], ['wait', SETTLE], ['read', 'reset'], ['wait', 3000], ['read', 'three seconds after reset'],
    ]),
    duration: await run('duration', [
      ['wait', 3000], ['read', 'off air'],
      ['update', '0:05'], ['read', 'length set before the Take'],
      ['take'], ['wait', SETTLE], ['read', 'taken'], ['wait', 2000], ['read', 'two seconds later'],
      ['wait', 10000], ['read', 'run out'], ['wait', 3000], ['read', 'held at zero'],
      ['event', 'clock_reset'], ['wait', SETTLE], ['read', 'reset'],
      ['event', 'clock_start'], ['wait', SETTLE], ['read', 'started again'], ['wait', 1000], ['read', 'a second later'],
      ['update', '0:30'], ['wait', 1000], ['read', 'a second after a correction'],
      ['event', 'clock_pause'], ['wait', SETTLE], ['event', 'clock_reset'], ['wait', SETTLE], ['read', 'reset after a correction'],
      ['out'], ['wait', 3000], ['take'], ['wait', SETTLE], ['read', 'second Take'], ['wait', 2000], ['read', 'two seconds into it'],
    ]),
    recovery: await run('count-up', [
      ['take'], ['event', 'clock_start'], ['wait', 60000],
      ['reload'], ['take'], ['stamped', { value: '12:08', ago: 60000 }], ['read', 'a reloaded output given the running origin'],
    ]),
  };
});

const at = (run, label) => {
  const r = run.out.find((o) => o.label === label);
  assert.ok(r, `no reading "${label}"`);
  return r;
};

test('the clock binds the time layer itself, keeping the artwork, and builds no second engine (M1, M2)', () => {
  for (const [mode, a] of Object.entries(runs.anatomy)) {
    assert.equal(a.behaviour, 'score', 'the drop proposes the score tracker beside the clock');
    assert.deepEqual(a.extras.filter((e) => e.kind === 'clock').map((e) => e.mode), [mode]);
    assert.deepEqual(a.gate, [], `${mode}: the validation gate passes`);
    assert.equal(a.clocks, 1, `${mode}: one readout`);
    assert.equal(a.tag, 'text');
    // Field identity: the readout is the operator's own text field, and the clock adds none.
    assert.equal(a.field.ftype, 'textfield');
    assert.equal(a.field.value, '12:08');
    assert.equal(a.fieldCount, a.plainFieldCount);
    // The designer's font, place and anchor, unchanged; three attributes added and nothing else.
    const { class: cls, 'data-count': count, 'data-start': start, ...rest } = a.attrs;
    assert.deepEqual(rest, a.plainAttrs);
    assert.equal(cls, 'imported-design-clock');
    assert.equal(count, mode === 'count-up' ? 'up' : 'down');
    assert.equal(start, '12:08');
    assert.equal(a.text, '12:08');
    assert.ok(a.restSame, `${mode}: the rest of the markup is the markup without a clock`);
    assert.deepEqual(a.js, { matchClock: true, adopts: true, countdownEngine: false, hookBeforeFit: true });
    assert.deepEqual(a.plainJs, { matchClock: false, adopts: false });
    assert.ok(a.sameJsWithout);
  }
});

test('counting up waits for Start; Pause holds, a typed time corrects it held or running, Reset returns to the drawn time (M3)', () => {
  const r = runs.up;
  assert.equal(at(r, 'on air, before Start').time, '12:08');
  assert.equal(at(r, 'started').clock, 'running');
  assert.equal(secs(at(r, 'three seconds later').time) - secs(at(r, 'started').time), 3);
  assert.equal(at(r, 'paused').clock, 'stopped');
  assert.equal(at(r, 'held four seconds').time, at(r, 'paused').time);
  assert.equal(at(r, 'corrected while held').time, '40:00');
  assert.equal(at(r, 'still held').time, '40:00');
  assert.equal(at(r, 'restarted').clock, 'running');
  assert.equal(at(r, 'corrected while running').time, '45:00');
  assert.equal(at(r, 'two seconds after the correction').value, '45:02', 'a correction moves a running clock without stopping it');
  const goal = at(r, 'a goal resends the whole value set');
  assert.equal(goal.value, '45:02', 'a resend of the typed value never pulls the clock back');
  assert.equal(goal.time, '45:02', 'and the typed text update() wrote is painted over with the real time at once');
  assert.deepEqual(goal.scores, ['3', '5']);
  const reset = at(r, 'reset');
  assert.deepEqual([reset.time, reset.start, reset.clock], ['12:08', '12:08', 'armed'], 'counting up, Reset goes back to the drawn time, held');
  assert.equal(at(r, 'three seconds after reset').time, '12:08');
  assert.deepEqual(reset.scores, ['3', '5'], 'the clock never touches the score');
});

test('a duration starts on Take from the length set before it, holds at zero, and Reset goes back to that length (M4)', () => {
  const r = runs.duration;
  assert.equal(at(r, 'off air').time, '12:08', 'nothing counts before the Take');
  assert.equal(at(r, 'length set before the Take').time, '0:05');
  const taken = at(r, 'taken');
  assert.equal(taken.clock, 'running');
  assert.ok(secs(taken.time) <= 5 && secs(taken.time) >= 4, taken.time);
  assert.equal(secs(taken.time) - secs(at(r, 'two seconds later').time), 2);
  for (const label of ['run out', 'held at zero']) assert.deepEqual([at(r, label).time, at(r, label).expired], ['0:00', true], label);
  const reset = at(r, 'reset');
  assert.deepEqual([reset.time, reset.expired, reset.clock], ['0:05', false, 'armed']);
  assert.equal(secs(at(r, 'started again').time) - secs(at(r, 'a second later').time), 1);
  assert.equal(at(r, 'a second after a correction').value, '0:29');
  assert.equal(at(r, 'reset after a correction').time, '0:05', 'a correction to a running clock leaves the length alone');
  const again = at(r, 'second Take');
  assert.ok(secs(again.time) >= 4, `a second Take is a new count of the same length (${again.time})`);
  assert.equal(secs(again.time) - secs(at(r, 'two seconds into it').time), 2);
});

test('a reloaded output given the running origin comes back at the real time (M5)', () => {
  assert.equal(at(runs.recovery, 'a reloaded output given the running origin').time, '13:08');
});
