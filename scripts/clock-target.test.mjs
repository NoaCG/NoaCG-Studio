// gate: factory
// needs: browser
// guards: src/control/clockTarget.ts, src/control/matchClockWire.ts, src/templates/behaviours/clock.ts, src/templates/importedDesign/artworkFields.ts, src/components/wizard/import/draft.ts
//
// A CLOCK COUNTING DOWN TO A SET TIME (docs/work-specs/jev-svg-import/spec.md row 10, AC-9): what a
// person types resolves to one instant in a zone, and that instant rides the match clock's existing
// stamped countdown, so a resend, a replay or a reload reads the same second. `now` and the zone are
// injected; the rules are T1-T7 in docs/work-specs/jev-svg-import/evidence/phase-10.md.
//
// The second half builds the graphic the way the wizard does (the real reader, the draft with a
// resolved target, the real assembler) and runs it on a driven clock: two outputs over one hosted
// log, replayed the way output/main.ts applies rows (as scripts/imported-clock-wire.test.mjs does),
// and a third fed only by its fields and play(), as SPX or any host without the wire.
//
//   node --test scripts/clock-target.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withBundledPage } from './catalog-emit.mjs';
import { DRIVEN_CLOCK, installDrivenPage } from './driven-clock.mjs';
import {
  formatClockTarget,
  parseClockTarget,
  parseTargetTime,
  proposeClockTarget,
  resolveClockTarget,
} from '../src/control/clockTarget.ts';
import { clockRowEffect, clockValueAfterUpdate, clockValueAt } from '../src/control/matchClockWire.ts';

// ── The built graphic on a driven clock ──

const root = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const SPECS = [
  ['assets/svgImport.ts', 'NOACG_SVG'],
  ['components/wizard/import/draft.ts', 'NOACG_DRAFT'],
  ['templates/importedDesign/svg.ts', 'NOACG_IMPORTED'],
  ['preview/composeDocument.ts', 'NOACG_COMPOSE'],
  ['ai/svgInterpretation/contract.ts', 'NOACG_CONTRACT'],
  ['control/matchClockWire.ts', 'NOACG_WIRE'],
  ['templates/behaviours/clock.ts', 'NOACG_CLOCK'],
].map(([rel, globalName]) => ({ entry: root(`src/${rel}`), globalName }));
const SCORE_CLOCK = readFileSync(root('e2e/fixtures/jev-svg/dev/score-clock-1.svg'), 'utf8');

/** The server's clock when the walk starts: 2027-01-15 08:00:00Z, 10:00 in Helsinki. */
const WALL = 1800000000000;
/** Noon in Helsinki that day: two hours after the walk starts. */
const TARGET = '2027-01-15T12:00:00+02:00[Europe/Helsinki]';

/** Runs in the browser: one walk of a built target clock over two hosted outputs and one plain host. */
const WALK = async ({ markup, target, wall, driven, script }) => {
  const { NOACG_SVG: R, NOACG_DRAFT: D, NOACG_IMPORTED: I, NOACG_CONTRACT: C, NOACG_WIRE: W, NOACG_COMPOSE: P } = window;
  const draft = window.__importDraft(R.importSvgMarkup(markup));
  const row = draft.svgFields.find((f) => f.on && f.clock);
  const clockDraft = { candidateId: row.candidateId, mode: 'target-time', revision: C.svgSourceRevision(draft.designSvg.markup) };
  const pending = D.svgClockOption({ ...draft, svgClock: clockDraft });
  const template = I.IMPORTED_SVG.create({ designSvg: D.svgDesignOptions({ ...draft, svgClock: { ...clockDraft, target } }) });
  const spec = W.clockSpecFromHtml(template.html);
  const field = spec.field;
  const values = Object.fromEntries(template.fields.filter((f) => f.field).map((f) => [f.field, String(f.value ?? '')]));
  const prod = { wall, log: [], outputs: [] };
  const mount = async (out) => {
    const html = P.composeDocument(template).replace(/<head[^>]*>/i, (m) => m + driven.replace('var origin = 1700000000000', `var origin = ${prod.wall}`));
    document.getElementById(`out-${out.name}`)?.remove();
    const frame = document.createElement('iframe');
    frame.id = `out-${out.name}`;
    frame.style.cssText = `position:fixed;left:0;top:0;width:${template.resolution.width}px;height:${template.resolution.height}px;border:0;`;
    await new Promise((resolve) => { frame.onload = resolve; frame.srcdoc = html; document.body.appendChild(frame); });
    out.w = frame.contentWindow;
  };
  // output/main.ts `applyCommand`, the clock's half of it; a plain host just gets the row.
  const deliver = (out, row) => {
    const { w } = out;
    let msg = row.msg;
    if (out.plain) {
      // Its panel never shows the hidden field, so it always sends that field's own value.
      if (msg.t === 'update') w.update(JSON.stringify({ ...msg.data, [field]: values[field] }));
      else if (msg.t === 'play') w.play();
      else if (msg.t === 'stop') w.stop();
      return;
    }
    if (msg.t === 'update') {
      const merged = { ...out.held, ...msg.data };
      if (msg.data[field] !== undefined) {
        merged[field] = W.clockValueAfterUpdate(out.held[field], msg.data[field]);
        msg = { ...msg, data: { ...msg.data, [field]: merged[field] } };
      }
      out.held = merged;
    }
    const effect = W.clockRowEffect(row, spec, out.held[field], w.Date.now());
    const write = (value) => { out.held = { ...out.held, [field]: value }; w.update(JSON.stringify({ [field]: value })); };
    if (effect?.when === 'before') write(effect.value);
    if (msg.t === 'update') w.update(JSON.stringify(msg.data));
    else if (msg.t === 'play') w.play();
    else if (msg.t === 'stop') w.stop();
    if (effect?.when === 'after') write(effect.value);
    out.seen = row.seq;
  };
  const output = async (name, lag, plain = false) => {
    const out = { name, lag, plain, held: {}, seen: 0, report: null };
    await mount(out);
    prod.outputs.push(out);
    return out;
  };
  const advance = (ms) => { prod.wall += ms; for (const out of prod.outputs) out.w.__advance(ms); };
  const send = (msg) => {
    const row = { seq: prod.log.length + 1, msg, created_at: new Date(prod.wall).toISOString() };
    prod.log.push(row);
    let waited = 0;
    for (const out of [...prod.outputs].sort((a, b) => a.lag - b.lag)) {
      if (out.lag > waited) { advance(out.lag - waited); waited = out.lag; }
      deliver(out, row);
    }
  };
  const outs = { A: await output('A', 0), B: await output('B', 700), S: await output('S', 0, true) };
  const read = (out) => ({ value: out.w.formatMatchClock(out.w.matchClockValue()), shown: out.w.document.getElementById(field)?.textContent ?? null });
  const readings = [];
  let cue = { ...values };
  for (const [verb, arg] of script) {
    if (verb === 'take') { send({ t: 'update', data: { ...cue } }); send({ t: 'play' }); }
    else if (verb === 'update') send({ t: 'update', data: { ...cue } });
    // A cue holding a plain time (an older cue, or a value set by hand on the wire).
    else if (verb === 'cue') { cue = { ...cue, [field]: arg }; send({ t: 'update', data: { ...cue } }); }
    else if (verb === 'out') send({ t: 'stop' });
    else if (verb === 'wait') advance(arg);
    else if (verb === 'report') outs[arg].report = { data: { ...outs[arg].held }, groups: outs[arg].w.noacgMachineState().groups, seq: outs[arg].seen };
    // A host that reports the layer's PAINTED text (control/hostedReceiver.ts harvest), not the wire value.
    else if (verb === 'painted') outs[arg].report = { data: { ...outs[arg].held, [field]: outs[arg].w.document.getElementById(field).textContent }, groups: outs[arg].w.noacgMachineState().groups, seq: outs[arg].seen };
    else if (verb === 'reload') {
      const out = outs[arg];
      const report = out.report;
      await mount(out);
      out.held = { ...report.data };
      out.w.update(JSON.stringify(report.data));
      out.w.noacgSnap(report.groups, { timers: true });
      out.w.update(JSON.stringify(report.data));
      for (const row of prod.log.filter((r) => r.seq > report.seq)) deliver(out, row);
    } else if (verb === 'read') readings.push({ label: arg, at: prod.wall - wall, A: read(outs.A), B: read(outs.B), S: read(outs.S) });
  }
  for (const out of prod.outputs) document.getElementById(`out-${out.name}`)?.remove();
  const clockFieldDecl = template.fields.find((f) => f.field === field);
  return { spec, readings, pending, field: { ftype: clockFieldDecl.ftype, value: clockFieldDecl.value }, dataStart: new DOMParser().parseFromString(template.html, 'text/html').getElementById(field)?.getAttribute('data-start') };
};

/** The template's readers, which import the type registry and so run in the bundle. */
let clockTargetStart, clockReadout, CLOCK_PICKER_MODES, t10;

const walk = await withBundledPage(SPECS, async (page) => {
  await installDrivenPage(page);
  const stored = [
    TARGET, '2026-11-01T19:00:00+02:00[Europe/Helsinki]', '2026-11-14T19:00:00+02:00[Europe/Helsinki]', '2026-10-25T03:30:00+02:00[Europe/Helsinki]',
    '2026-10-25T03:30:00+03:00[Europe/Helsinki]', '2026-11-02T00:00:00-05:00[America/New_York]', '2026-10-31T19:00:00+02:00[Europe/Helsinki]', '1969-12-31T00:00:00+00:00[UTC]', '', 'tonight', '2026-11-14T19:00:00+02:00', 'garbage',
  ];
  const readouts = [['target-time', '12:08', stored[2]], ['count-up', ' 12:08 ', stored[2]], ['duration', '0:30', stored[2]], ['target-time', '12:08', undefined], ['target-time', '12:08', 'garbage']];
  const t = await page.evaluate(({ stored, readouts }) => ({
    starts: Object.fromEntries(stored.map((x) => [x, window.NOACG_CLOCK.clockTargetStart(x)])),
    readouts: readouts.map(([m, d, x]) => [JSON.stringify([m, d, x ?? null]), window.NOACG_CLOCK.clockReadout(m, d, x)]),
    modes: window.NOACG_CLOCK.CLOCK_PICKER_MODES.map((m) => ({ mode: m.mode })),
  }), { stored, readouts });
  clockTargetStart = (x) => { assert.ok(x in t.starts, `unbundled reading of ${x}`); return t.starts[x]; };
  const readoutMap = new Map(t.readouts);
  clockReadout = (m, d, x) => readoutMap.get(JSON.stringify([m, d, x ?? null]));
  CLOCK_PICKER_MODES = t.modes;
  // T10, through the draft's own reader: a proposal or a time typed alone, built after it passed.
  t10 = await page.evaluate(({ now }) => {
    const D = window.NOACG_DRAFT;
    const at = (target, targetProposed, when) => D.svgClockTarget({ target, targetProposed }, when);
    return {
      // Proposed 16:00 at 15:59, built at 16:03: tomorrow's 16:00, never a clock stuck at 0:00.
      rolled: at('2026-11-01T16:00:00+02:00[Europe/Helsinki]', true, Date.parse('2026-11-01T14:03:00Z')),
      // Still ahead: unchanged.
      ahead: at('2026-11-01T16:00:00+02:00[Europe/Helsinki]', true, Date.parse('2026-11-01T13:59:00Z')),
      // A dated target is fixed: past stays past.
      dated: at('2026-11-01T16:00:00+02:00[Europe/Helsinki]', undefined, Date.parse('2026-11-01T14:03:00Z')),
      // 03:30 proposed on the eve of the fall-back night, built after it: tomorrow's 03:30 is a fold, so it keeps its instant.
      fold: at('2026-10-24T03:30:00+03:00[Europe/Helsinki]', true, Date.parse('2026-10-24T01:00:00Z')),
      none: at(undefined, true, now) ?? null,
    };
  }, { now: 1793539230000 });
  return page.evaluate(WALK, {
    markup: SCORE_CLOCK,
    target: TARGET,
    wall: WALL,
    driven: DRIVEN_CLOCK,
    script: [
      ['read', 'before the Take'],
      ['take'], ['wait', 3000], ['read', 'taken'],
      ['update'], ['wait', 500], ['read', 'a resend'],
      ['cue', '12:08'], ['wait', 500], ['read', 'a plain time sent over it'],
      ['report', 'B'], ['wait', 600_000], ['reload', 'B'], ['wait', 300], ['read', 'B reloaded ten minutes on'],
      ['painted', 'B'], ['wait', 3_600_000], ['reload', 'B'], ['wait', 300], ['read', 'B rebooted from painted text an hour old'],
      ['out'], ['wait', 5000], ['read', 'off air'],
      ['take'], ['wait', 500], ['read', 'taken again'],
      ['wait', 7_200_000], ['read', 'past the instant'],
      ['report', 'A'], ['reload', 'A'], ['wait', 300], ['read', 'A reloaded past it'],
      ['take'], ['wait', 500], ['read', 'taken after it'],
    ],
  });
});

const HEL = 'Europe/Helsinki';
const NY = 'America/New_York';
/** 2026-11-01 15:20:30 in Helsinki (UTC+2). */
const NOW = Date.parse('2026-11-01T13:20:30Z');

function resolved(input, now = NOW) {
  const r = resolveClockTarget(input, now);
  assert.equal(r.kind, 'resolved', JSON.stringify(r));
  return r;
}

test('the ways a time of day is typed', () => {
  assert.equal(parseTargetTime('19:00'), 19 * 60);
  assert.equal(parseTargetTime('7 pm'), 19 * 60);
  assert.equal(parseTargetTime('7PM'), 19 * 60);
  assert.equal(parseTargetTime('7:30 p.m.'), 19 * 60 + 30);
  assert.equal(parseTargetTime('12 am'), 0);
  assert.equal(parseTargetTime('12 pm'), 12 * 60);
  assert.equal(parseTargetTime('0:00'), 0);
  for (const bad of ['7', '24:00', '19:60', '13 pm', '0 am', '', 'soon', '19:00:00']) {
    assert.equal(parseTargetTime(bad), null, bad);
  }
});

test('T1: a bare 7 pm is tonight, proposed, with its date and zone to confirm', () => {
  const r = resolved({ time: '7 pm', zone: HEL });
  assert.equal(r.at, Date.parse('2026-11-01T17:00:00Z'));
  assert.deepEqual([r.date, r.time, r.zone, r.offset, r.proposed, r.expired], ['2026-11-01', '19:00', HEL, '+02:00', true, false]);
  assert.equal(formatClockTarget(r), '2026-11-01T19:00:00+02:00[Europe/Helsinki]');
});

test('T1: a bare time already gone today is tomorrow, never expired', () => {
  const r = resolved({ time: '15:20', zone: HEL });
  assert.equal(r.at, Date.parse('2026-11-02T13:20:00Z'));
  assert.equal(r.date, '2026-11-02');
  assert.equal(r.expired, false);
  // The same instant read in another zone is that zone's wall time.
  const ny = resolved({ time: '7 pm', zone: NY });
  assert.equal(ny.at, Date.parse('2026-11-01T19:00:00-05:00'), 'New York left summer time this morning');
  assert.equal(ny.offset, '-05:00');
});

test('T2: an explicit date is that day, and a past one stays expired', () => {
  const future = resolved({ time: '19:00', date: '2026-11-14', zone: HEL });
  assert.equal(future.at, Date.parse('2026-11-14T17:00:00Z'));
  assert.equal(future.proposed, false);
  const past = resolved({ time: '19:00', date: '2026-10-31', zone: HEL });
  assert.equal(past.at, Date.parse('2026-10-31T17:00:00Z'), 'never rolled forward to a later day');
  assert.equal(past.expired, true);
  const earlierToday = resolved({ time: '09:00', date: '2026-11-01', zone: HEL });
  assert.equal(earlierToday.expired, true, 'today, explicitly, but gone');
  assert.deepEqual(resolveClockTarget({ time: '19:00', date: '2026-02-30', zone: HEL }, NOW), { kind: 'invalid', reason: 'date' });
  assert.deepEqual(resolveClockTarget({ time: '19:00', zone: 'Mars/Olympus' }, NOW), { kind: 'invalid', reason: 'zone' });
  assert.deepEqual(resolveClockTarget({ time: 'later', zone: HEL }, NOW), { kind: 'invalid', reason: 'time' });
});

test('T3: midnight starts a day; a bare midnight is the next one', () => {
  const bare = resolved({ time: '12 am', zone: HEL });
  assert.equal(bare.at, Date.parse('2026-11-01T22:00:00Z'));
  assert.equal(bare.date, '2026-11-02');
  const dated = resolved({ time: '00:00', date: '2026-11-14', zone: HEL });
  assert.equal(dated.at, Date.parse('2026-11-13T22:00:00Z'), 'the start of the 14th, not its end');
  // Just before midnight, the next midnight is minutes away, never a day later.
  const late = resolved({ time: '0:00', zone: HEL }, Date.parse('2026-11-01T21:59:00Z'));
  assert.equal(late.at, Date.parse('2026-11-01T22:00:00Z'));
});

test('T4: a DST gap has no instant until another time is chosen', () => {
  // Helsinki skips 03:00-03:59 on 2026-03-29.
  const gap = resolveClockTarget({ time: '03:30', date: '2026-03-29', zone: HEL }, NOW);
  assert.deepEqual(gap, { date: '2026-03-29', time: '03:30', zone: HEL, kind: 'gap' });
  assert.deepEqual(resolveClockTarget({ time: '03:30', date: '2026-03-29', zone: HEL, fold: 'later' }, NOW).kind, 'gap', 'a fold choice does not invent a gap time');
  // A bare time that falls in today's gap is today's gap, not silently tomorrow.
  const springMorning = Date.parse('2026-03-28T23:00:00Z'); // 01:00 local, 29 March
  assert.equal(resolveClockTarget({ time: '3:30 am', zone: HEL }, springMorning).kind, 'gap');
  const after = resolved({ time: '04:00', date: '2026-03-29', zone: HEL }, springMorning);
  assert.equal(after.at, Date.parse('2026-03-29T01:00:00Z'));
  assert.equal(after.offset, '+03:00');
});

test('T4: a DST fold offers both instants and resolves only on a choice', () => {
  // Helsinki repeats 03:00-03:59 on 2026-10-25.
  const fold = resolveClockTarget({ time: '03:30', date: '2026-10-25', zone: HEL }, NOW);
  assert.equal(fold.kind, 'fold');
  assert.equal(fold.earlier, Date.parse('2026-10-25T00:30:00Z'));
  assert.equal(fold.later, Date.parse('2026-10-25T01:30:00Z'));
  const earlier = resolved({ time: '03:30', date: '2026-10-25', zone: HEL, fold: 'earlier' });
  const later = resolved({ time: '03:30', date: '2026-10-25', zone: HEL, fold: 'later' });
  assert.deepEqual([earlier.at, earlier.offset], [fold.earlier, '+03:00']);
  assert.deepEqual([later.at, later.offset], [fold.later, '+02:00']);
  assert.equal(formatClockTarget(later), '2026-10-25T03:30:00+02:00[Europe/Helsinki]');
  assert.equal(parseClockTarget(formatClockTarget(earlier)).at, fold.earlier, 'the offset keeps the choice');
  // A bare time on the fold day is the next occurrence: once the first has gone, only the repeat.
  const between = Date.parse('2026-10-25T00:50:00Z'); // 03:50 summer time
  const next = resolved({ time: '03:45', zone: HEL }, between);
  assert.deepEqual([next.at, next.offset, next.expired], [Date.parse('2026-10-25T01:45:00Z'), '+02:00', false]);
  assert.equal(resolveClockTarget({ time: '03:45', zone: HEL }, Date.parse('2026-10-25T00:30:00Z')).kind, 'fold', 'both still ahead: a choice');
  // The hour either side is plain.
  assert.equal(resolved({ time: '04:00', date: '2026-10-25', zone: HEL }).offset, '+02:00');
});

test('T9: Target time first proposes the next whole hour the clocks neither skip nor repeat', () => {
  assert.equal(proposeClockTarget(HEL, NOW), '2026-11-01T16:00:00+02:00[Europe/Helsinki]');
  assert.equal(proposeClockTarget(HEL, Date.parse('2026-11-01T21:30:00Z')), '2026-11-02T00:00:00+02:00[Europe/Helsinki]', 'past midnight, tomorrow');
  // 02:10 on the spring-forward night: 03:00 does not exist, so 04:00.
  assert.equal(proposeClockTarget(HEL, Date.parse('2026-03-29T00:10:00Z')), '2026-03-29T04:00:00+03:00[Europe/Helsinki]');
  // 02:10 summer time on the fall-back night: 03:00 happens twice, so 04:00.
  assert.equal(proposeClockTarget(HEL, Date.parse('2026-10-24T23:10:00Z')), '2026-10-25T04:00:00+02:00[Europe/Helsinki]');
  assert.equal(proposeClockTarget('Mars/Olympus', NOW), null);
});

test('T10: an undated target moves to its next occurrence once behind the build; a dated one never does', () => {
  assert.equal(t10.rolled, '2026-11-02T16:00:00+02:00[Europe/Helsinki]');
  assert.equal(t10.ahead, '2026-11-01T16:00:00+02:00[Europe/Helsinki]');
  assert.equal(t10.dated, '2026-11-01T16:00:00+02:00[Europe/Helsinki]');
  assert.equal(t10.fold, '2026-10-24T03:30:00+03:00[Europe/Helsinki]', 'no silent choice of a fold');
  assert.equal(t10.none, null);
});

test('T5: the stored form round-trips the instant and the zone', () => {
  const r = resolved({ time: '19:00', date: '2026-11-14', zone: HEL });
  assert.deepEqual(parseClockTarget(formatClockTarget(r)), { at: r.at, date: '2026-11-14', time: '19:00', zone: HEL });
  for (const bad of [null, '', '2026-11-14T19:00:00+02:00', '2026-11-14T19:00:00+02:00[Nowhere/Here]', 'tonight']) {
    assert.equal(parseClockTarget(bad), null, String(bad));
  }
  // A historic local mean time has no whole-minute offset, so it has no stored form either.
  assert.deepEqual(resolveClockTarget({ time: '12:00', date: '1900-01-01', zone: HEL }, NOW), { kind: 'invalid', reason: 'date' });
});

test('T6: the stored instant starts the clock as the stamped countdown, reaching 0:00 on it', () => {
  const stored = '2026-11-01T19:00:00+02:00[Europe/Helsinki]';
  const at = parseClockTarget(stored).at;
  const start = clockTargetStart(stored);
  assert.match(start, /^\d+:\d{2}@\d+$/);
  assert.equal((at - Number(start.split('@')[1])) % 1000, 0, 'a whole number of seconds before the instant');
  assert.equal(clockValueAt(start, true, NOW), '219:30', '3 h 39 min 30 s left');
  assert.equal(clockValueAt(start, true, at - 61_000), '1:01');
  assert.equal(clockValueAt(start, true, at - 1), '0:01');
  assert.equal(clockValueAt(start, true, at), '0:00', 'zero on the instant');
  assert.equal(clockValueAt(start, true, at + 3_600_000), '0:00', 'and held there');
  assert.equal(clockTargetStart(stored), start, 'a pure function of the instant: the same build is the same bytes');
  // The two readers of the stored form agree: the template's start counts to the control's instant.
  for (const r of [resolved({ time: '03:30', date: '2026-10-25', zone: HEL, fold: 'later' }), resolved({ time: '12 am', zone: NY })]) {
    const s2 = clockTargetStart(formatClockTarget(r));
    assert.equal(clockValueAt(s2, true, r.at - 5_000), '0:05', formatClockTarget(r));
    assert.equal(clockValueAt(s2, true, r.at), '0:00');
  }
  for (const bad of ['', 'tonight', '2026-11-14T19:00:00+02:00']) assert.equal(clockTargetStart(bad), null, bad);
});

test('T6: an expired target shows 0:00 from the first frame and never counts', () => {
  const past = resolved({ time: '19:00', date: '2026-10-31', zone: HEL });
  const start = clockTargetStart(formatClockTarget(past));
  assert.equal(clockValueAt(start, true, NOW), '0:00');
  assert.equal(clockValueAt(start, true, NOW + 86_400_000), '0:00');
  // Before the origin itself: still a fixed, expired start, never the drawn time.
  const ancient = clockTargetStart('1969-12-31T00:00:00+00:00[UTC]');
  assert.equal(ancient, '0:00@1000');
  assert.equal(clockValueAt(ancient, true, NOW), '0:00');
});

test('the readout and the picker: a resolved target is offered, and only a target time takes it', () => {
  assert.deepEqual(CLOCK_PICKER_MODES.map((m) => m.mode), ['count-up', 'duration', 'target-time']);
  const stored = '2026-11-14T19:00:00+02:00[Europe/Helsinki]';
  assert.deepEqual(clockReadout('target-time', '12:08', stored), { count: 'down', start: clockTargetStart(stored), fixed: true });
  // Every other clock is exactly what it was.
  assert.deepEqual(clockReadout('count-up', ' 12:08 ', stored), { count: 'up', start: '12:08', fixed: false });
  assert.deepEqual(clockReadout('duration', '0:30', stored), { count: 'down', start: '0:30', fixed: false });
  assert.deepEqual(clockReadout('target-time', '12:08'), { count: 'down', start: '12:08', fixed: false });
  assert.deepEqual(clockReadout('target-time', '12:08', 'garbage'), { count: 'down', start: '12:08', fixed: false });
});

test('T7: the wire never restarts, holds or replaces a fixed instant', () => {
  const seed = clockTargetStart('2026-11-01T19:00:00+02:00[Europe/Helsinki]');
  const spec = { field: 'f2', countsDown: true, seed, resetTo: seed, events: { start: 'clock_start', stop: 'clock_pause', reset: 'clock_reset' }, startsOnTake: false, fixedInstant: true };
  const iso = new Date(NOW).toISOString();
  const row = (msg) => ({ msg, created_at: iso });
  assert.equal(clockRowEffect(row({ t: 'play' }), spec, seed, NOW), null, 'a Take of the start it holds changes nothing');
  assert.equal(clockRowEffect(row({ t: 'update', data: {} }), spec, seed, NOW), null);
  assert.deepEqual(clockRowEffect(row({ t: 'update', data: { f2: '12:08' } }), spec, '12:08', NOW), { value: seed, when: 'after' }, 'a plain time from a cue is answered with the instant');
  assert.deepEqual(clockRowEffect(row({ t: 'play' }), spec, undefined, NOW), null, 'nothing held: the seed stands in, and is the instant');
  assert.deepEqual(clockRowEffect(row({ t: 'play' }), spec, '5:00@1700000000000', NOW), { value: seed, when: 'after' }, 'an older instant from a cue');
  assert.equal(clockRowEffect(row({ t: 'stop' }), spec, seed, NOW), null, 'an Out holds nothing');
  for (const event of ['clock_start', 'clock_pause', 'clock_reset']) assert.equal(clockRowEffect(row({ t: 'event', event }), spec, seed, NOW), null, event);
});

test('T6: a resend, a replay at another time and a reload all read the same second', () => {
  const start = clockTargetStart('2026-11-14T19:00:00+02:00[Europe/Helsinki]');
  assert.equal(clockValueAfterUpdate(start, start), start, 'an Update resending it keeps it');
  assert.equal(clockValueAfterUpdate(undefined, start), start);
  for (const read of [NOW, NOW + 3_600_500, NOW + 86_400_000 * 3 + 999]) {
    assert.equal(clockValueAt(clockValueAfterUpdate(start, start), true, read), clockValueAt(start, true, read));
  }
});

const reading = (label) => {
  const r = walk.readings.find((o) => o.label === label);
  assert.ok(r, `no reading "${label}"`);
  return r;
};
/** The time left at `ms` after the walk starts: the instant is two hours on, painted in hours from
 *  row 11 ("1:59:58"; the wire keeps minutes and seconds), under an hour as minutes ("59:59"). */
const left = (ms) => {
  const s = Math.max(0, Math.ceil((7_200_000 - ms) / 1000));
  const m = Math.floor(s / 60);
  const ss = String(s % 60).padStart(2, '0');
  return m < 60 ? `${m}:${ss}` : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${ss}`;
};

test('the built graphic: a resolved target ships its instant', () => {
  assert.equal(walk.pending.target, undefined, 'a target time with no instant carries none (rows 7-9 compile it as before)');
  assert.equal(walk.spec.fixedInstant, true);
  assert.ok(!walk.spec.startsOnTake, 'no Take restarts it');
  assert.equal(walk.dataStart, clockTargetStart(TARGET));
  assert.deepEqual(walk.field, { ftype: 'hidden', value: clockTargetStart(TARGET) }, 'no drawn time for a cue or SPX to send over it');
});

test('the built graphic counts to the instant on every output, through resends, reloads, Outs and Takes', () => {
  const live = ['before the Take', 'taken', 'a resend', 'a plain time sent over it', 'B reloaded ten minutes on', 'B rebooted from painted text an hour old', 'off air', 'taken again'];
  for (const label of live) {
    const r = reading(label);
    assert.equal(r.A.value, left(r.at), `${label}: output A, ${r.at} ms into the walk`);
    assert.equal(r.B.value, r.A.value, `${label}: B, 700 ms behind on every row, reads A's second`);
    assert.equal(r.S.value, r.A.value, `${label}: a host with no wire reads it too`);
  }
  for (const label of ['past the instant', 'A reloaded past it', 'taken after it']) {
    const r = reading(label);
    assert.deepEqual([r.A.value, r.B.value, r.S.value], ['0:00', '0:00', '0:00'], `${label}: held at zero, never rolled forward`);
  }
  for (const label of ['before the Take', 'taken', 'past the instant']) {
    assert.equal(reading(label).A.shown, reading(label).A.value, `${label}: the layer paints the time, never the raw wire value (#1894)`);
  }
  assert.match(reading('before the Take').A.shown, /^\d:\d\d:\d\d$/, 'two hours out, the layer paints hours (row 11)');
});

test('T1 and T4 (#1894): a bare time in a gap already behind today is tomorrow\'s; one still ahead is today\'s gap', () => {
  // Helsinki skips 03:00-03:59 on 2026-03-29. At 05:00 local the skipped 03:30 is behind.
  const springLater = Date.parse('2026-03-29T02:00:00Z');
  const next = resolved({ time: '03:30', zone: HEL }, springLater);
  assert.deepEqual([next.date, next.at, next.offset, next.proposed], ['2026-03-30', Date.parse('2026-03-30T00:30:00Z'), '+03:00', true]);
  // At 02:30 local the gap is still ahead: it asks for another time.
  assert.equal(resolveClockTarget({ time: '03:30', zone: HEL }, Date.parse('2026-03-29T00:30:00Z')).kind, 'gap');
  // A dated gap stays a gap, past or not.
  assert.equal(resolveClockTarget({ time: '03:30', date: '2026-03-29', zone: HEL }, springLater).kind, 'gap');
});

test('row 11: a target paints hours; a native clock is unchanged', async () => {
  const { matchClockJs } = await import('../src/templates/shared/matchClock.ts');
  const runtime = (opts) => {
    const js = matchClockJs('x', opts);
    const pick = (name) => `function ${name}${js.split(`function ${name}`)[1].split('\n}\n')[0]}\n}`;
    return new Function(`${pick('parseMatchClock')}\n${pick('formatMatchClock')}\nreturn { parse: parseMatchClock, format: formatMatchClock };`)();
  };
  const target = runtime({ target: true });
  assert.deepEqual([0, 3599, 3600, 13170].map(target.format), ['0:00', '59:59', '1:00:00', '3:39:30']);
  assert.equal(target.parse('219:30@1000'), 13170, 'the wire and data-start keep minutes and seconds');
  const native = runtime();
  assert.equal(native.format(4020), '67:00', 'a native match clock keeps minutes');
  assert.equal(native.parse('1:30:00'), 90, 'and reads three parts as it always has');
  assert.equal(matchClockJs('scoreboard'), matchClockJs('scoreboard', {}), 'without target the runtime is the same text');
});
