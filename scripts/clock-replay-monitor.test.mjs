// gate: factory
// needs: browser
// guards: src/control/airState.ts
//
// THE PROGRAM MONITOR AFTER A CLOCK VERB DURING THE RESOLVE (#2099), on the real clock and the real
// machine. air-state.test.mjs proves the page's memory; a monitor is more than that, because a snap
// to the report's pose fires that pose's own calls (a snap to `running` starts the clock), and the
// machine has to move with the clock or the next press is dropped. So a house scorebug and a debate
// board each run in two frames: AIR, which took the verb live, and a MONITOR rebuilt as the page rebuilds one: a report
// older than the verb, this page's own +1 applied during the read, `seedFromResolve`, `restoreItems`,
// `programItems`. Expected: the monitor reads what air reads, and the next press moves both.
//
// AIR here runs the monitor's own fold, not src/output/main.ts, which shares its clock functions: so
// this proves a report plus the replay lands where an uninterrupted run did, on real graphics. A
// fault in the rule they share would not show here (#2161 is one to check on /output).
//
//   node --test scripts/clock-replay-monitor.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withBundledPage } from './catalog-emit.mjs';
import { DRIVEN_CLOCK, installDrivenPage } from './driven-clock.mjs';

const root = (rel) => fileURLToPath(new URL(`../src/${rel}`, import.meta.url));
/** A scorebug drawn as one piece of artwork, for the imported clocks. */
const SCORE_CLOCK = readFileSync(fileURLToPath(new URL('../e2e/fixtures/jev-svg/dev/score-clock-1.svg', import.meta.url)), 'utf8');
const SPECS = [
  ['assets/svgImport.ts', 'NOACG_SVG'],
  ['components/wizard/import/draft.ts', 'NOACG_DRAFT'],
  ['templates/importedDesign/svg.ts', 'NOACG_IMPORTED'],
  ['ai/svgInterpretation/contract.ts', 'NOACG_CONTRACT'],
  ['control/airState.ts', 'NOACG_AIR'],
  ['control/commandRoads.ts', 'NOACG_ROADS'],
  ['control/matchClockWire.ts', 'NOACG_WIRE'],
  ['control/playoutSession.ts', 'NOACG_SESSION'],
  ['preview/composeDocument.ts', 'NOACG_COMPOSE'],
  ['templates/catalog.ts', 'NOACG_CATALOG'],
].map(([rel, globalName]) => ({ entry: root(rel), globalName }));

/** Long enough for any state's transition, and its calls, to have run. */
const SETTLE = 1500;

/** Runs in the browser: one walk, as `before` (what air took before its report), the verb in the
 *  rows after that report, whether this page's own +1 landed during the read, and the next press. */
const WALK = async ({ driven, markup, variant, imported, before, verb, resend, overtaken, next, SETTLE: settle }) => {
  const { NOACG_AIR: A, NOACG_ROADS: R, NOACG_WIRE: W, NOACG_SESSION: S, NOACG_COMPOSE: C, NOACG_CATALOG: K } = window;
  const importedTemplate = () => {
    const { NOACG_SVG: V, NOACG_DRAFT: D, NOACG_IMPORTED: I, NOACG_CONTRACT: N } = window;
    const draft = window.__importDraft(V.importSvgMarkup(markup));
    const row = draft.svgFields.find((f) => f.on && f.clock);
    return I.IMPORTED_SVG.create({ designSvg: D.svgDesignOptions({ ...draft, svgClock: { candidateId: row.candidateId, mode: imported, revision: N.svgSourceRevision(draft.designSvg.markup) } }) });
  };
  const template = imported ? importedTemplate() : K.variantById(variant).create({});
  const pair = W.speakingClocksFromHtml(template.html);
  const spec = pair ? null : W.clockSpecFromHtml(template.html);
  const specs = { clocks: new Map(spec ? [['score', spec]] : []), pairs: new Map(pair ? [['score', pair]] : []) };
  const clockFields = pair ? [pair.fieldA, pair.fieldB, pair.allowanceField, pair.penaltyField] : [spec.field];
  // A field no clock reads, for this page's own +1: a figure, or else a line of text.
  const own = (template.fields.find((f) => f.ftype === 'number' && !clockFields.includes(f.field)) ?? template.fields.find((f) => f.field && !clockFields.includes(f.field))).field;
  const values = Object.fromEntries(template.fields.filter((f) => f.field).map((f) => [f.field, String(f.value ?? '')]));
  let wall = 1800000000000;
  const frames = [];

  const mount = async () => {
    const first = driven.replace('var origin = 1700000000000', `var origin = ${wall}`);
    const frame = document.createElement('iframe');
    frame.style.cssText = `position:fixed;left:0;top:0;width:${template.resolution.width}px;height:${template.resolution.height}px;border:0;`;
    await new Promise((resolve) => {
      frame.onload = resolve;
      frame.srcdoc = C.composeDocument(template).replace(/<head[^>]*>/i, (m) => m + first);
      document.body.appendChild(frame);
    });
    frames.push(frame.contentWindow);
    return frame.contentWindow;
  };
  const advance = (ms) => {
    wall += ms;
    for (const w of frames) w.__advance(ms);
  };
  /** What a stage does with what `programItems` hands it. */
  const hand = (w, out) => {
    for (const { msg } of out) {
      if (msg.t === 'update') w.update(JSON.stringify(msg.data));
      else if (msg.t === 'play') w.play();
      else if (msg.t === 'snap') w.noacgSnap(msg.snap, { timers: true });
      else if (msg.t === 'event') {
        w.noacgEventAt = wall;
        w.noacgDispatch(msg.event, msg.payload);
      }
    }
  };
  const text = (w, field) => w.document.getElementById(field)?.textContent ?? null;
  const read = (w) => ({
    value: pair ? [text(w, pair.fieldA), text(w, pair.fieldB)] : w.formatMatchClock(w.matchClockValue()),
    machine: Object.entries(w.noacgMachineState().groups).find(([id]) => id.endsWith('clock') || id === 'floor')?.[1] ?? null,
    own: text(w, own),
  });
  const row = (event) => ({ graphic: 'score', msg: { t: 'event', event, oid: `${event}-${wall}` }, created_at: new Date(wall).toISOString() });

  // AIR: on air, then what it took before its report.
  const airStage = await mount();
  let air = { ...S.NO_AIR, liveCue: { score: 'c1' } };
  const onAir = (items) => {
    const run = A.programItems(air, items, specs, wall);
    air = run.air;
    hand(airStage, run.out);
  };
  onAir([{ graphic: 'score', msg: { t: 'update', data: values } }, { graphic: 'score', msg: { t: 'play' } }]);
  advance(settle);
  for (const event of before) {
    onAir([row(event)]);
    advance(settle);
  }
  advance(60_000);
  // THE REPORT, then the verb it does not hold.
  const held = pair ? (air.speaking.score ?? {}) : air.clocks.score === undefined ? {} : { [spec.field]: air.clocks.score };
  const report = { data: { ...values, ...held }, state: { groups: airStage.noacgMachineState().groups }, event: 40 };
  const rows = verb ? [row(verb)] : [];
  onAir(rows);
  advance(settle);

  // THE PAGE: asked before the verb; this page's +1 during the read; the answer; a fresh stage.
  const applied = R.createAppliedOnce();
  const asked = A.airAtRequest(S.NO_AIR);
  // A +1 carries its field; a ✎ Update resends the cue's whole value set.
  const plusOne = { graphic: 'score', msg: { t: 'update', data: { ...(resend ? values : {}), [own]: '7' }, oid: 'own' } };
  let page = overtaken ? A.claimAndApply(S.NO_AIR, [plusOne], applied, specs, wall).air : S.NO_AIR;
  if (overtaken) onAir([plusOne]);
  const live = { score: report };
  page = A.seedFromResolve(A.withReports(page, live), { liveCue: { score: 'c1' }, live }, rows, asked, [{ id: 'c1', values }], specs);
  const monitor = await mount();
  // The machine states the page has heard are the report's, the same pose.
  const rebuilt = A.restoreItems(page, { score: report.state }, specs);
  const run = A.programItems(rebuilt.air, rebuilt.items, specs, wall);
  page = run.air;
  hand(monitor, run.out);
  advance(settle);
  const rebuiltReading = { air: read(airStage), monitor: read(monitor) };

  // THE NEXT PRESS, live, on both.
  advance(60_000);
  const press = row(next);
  onAir([press]);
  const heard = A.claimAndApply(page, [press], applied, specs, wall);
  hand(monitor, heard.out);
  advance(settle);
  const nextReading = { air: read(airStage), monitor: read(monitor) };
  for (const w of frames) w.frameElement.remove();
  return { rebuilt: rebuiltReading, next: nextReading };
};

const CASES = [
  { name: 'a Stop over a running report', variant: 'sb05', before: ['clockStart'], verb: 'clockStop', next: 'clockStart' },
  { name: 'a Reset over a running report', variant: 'sb05', before: ['clockStart'], verb: 'clockReset', next: 'clockStart' },
  { name: 'a Start over a stopped report', variant: 'sb05', before: [], verb: 'clockStart', next: 'clockStop' },
  { name: 'a switch over a speaker running', variant: 'dc01', before: ['switch'], verb: 'switch', next: 'switch' },
  { name: 'the first switch over nobody speaking', variant: 'dc01', before: [], verb: 'switch', next: 'switch' },
  { name: 'a reset over a speaker running', variant: 'dc01', before: ['switch'], verb: 'reset', next: 'switch' },
  { name: 'a penalty over a speaker running', variant: 'dc01', before: ['switch'], verb: 'penalty', next: 'switch' },
  { name: 'a Pause over an imported count-up running', imported: 'count-up', before: ['clock_start'], verb: 'clock_pause', next: 'clock_start' },
  { name: 'a Reset over an imported duration running', imported: 'duration', before: [], verb: 'clock_reset', next: 'clock_start' },
  { name: 'a Pause over an imported duration running', imported: 'duration', before: [], verb: 'clock_pause', next: 'clock_start' },
  { name: 'no verb, a running clock', variant: 'sb05', before: ['clockStart'], resend: true, next: 'clockStop' },
  { name: 'no verb, a speaker running', variant: 'dc01', before: ['switch'], resend: true, next: 'switch' },
  { name: 'no verb, a later speech running', variant: 'dc01', before: ['switch', 'switch'], resend: true, next: 'switch' },
];

const walks = await withBundledPage(SPECS, async (page) => {
  await installDrivenPage(page);
  const out = [];
  for (const c of CASES) for (const overtaken of [false, true]) {
    out.push({ ...c, overtaken, result: await page.evaluate(WALK, { driven: DRIVEN_CLOCK, markup: SCORE_CLOCK, ...c, overtaken, SETTLE }) });
  }
  return out;
});

const walkResend = (name) => name.startsWith('no verb');
const seconds = (text) => text.split(':').reduce((total, part) => total * 60 + Number(part), 0);
/** The same pose and field. A board's engine paints on its own one-second tick, which starts when
 *  its frame does, so a running time may read one tick apart; a match clock paints from its origin. */
const assertSame = (monitor, air, label) => {
  assert.equal(monitor.machine, air.machine, label);
  assert.equal(monitor.own, air.own, label);
  if (!Array.isArray(air.value)) return assert.equal(monitor.value, air.value, label);
  air.value.forEach((value, side) => assert.ok(Math.abs(seconds(monitor.value[side]) - seconds(value)) <= 1, `${label}: ${monitor.value} against ${air.value}`));
};

for (const { name, verb, next, overtaken, result } of walks) {
  const how = !overtaken ? 'on a quiet read' : walkResend(name) ? 'with this page\'s own Update during the read' : 'with this page\'s own +1 during the read';
  test(`${name}, ${how}: the monitor reads what air reads, and the next press moves both`, () => {
    assertSame(result.rebuilt.monitor, result.rebuilt.air, `after ${verb}, the rebuilt monitor against air`);
    assertSame(result.next.monitor, result.next.air, `after ${next}, a live press, the monitor against air`);
    if (overtaken) assert.equal(result.rebuilt.monitor.own, '7', 'and it shows the +1 applied during the read');
  });
}
