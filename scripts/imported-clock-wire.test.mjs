// gate: factory
// needs: browser
// guards: src/control/matchClockWire.ts, src/templates/behaviours/clock.ts, src/templates/behaviours/score.ts, src/templates/importedDesign/svg.ts, src/templates/shared/matchClock.ts, src/output/main.ts
//
// THE IMPORTED CLOCK ON THE WIRE (docs/work-specs/jev-svg-import/spec.md, row 9, AC-8, AC-10). A
// clock an author picks on their own artwork answers to its own namespaced verbs (`clock_start`,
// `clock_pause`, `clock_reset`), and the wire (control/matchClockWire.ts) stamps, banks and resets
// it from each row's SERVER time exactly as it does a native scorebug's, so two outputs paint the
// same second, and a reload or a reconnect comes back to the time on air. A duration is stamped by
// its Take. Score rows leave the clock's origin alone and clock rows leave the scores and the
// flash alone. The rules are W1-W6 in docs/work-specs/jev-svg-import/evidence/phase-09.md.
//
// Each graphic is built the way the wizard builds it (the real reader, the drop's draft with the
// clock and the score tracker chosen on it, the real assembler) and run through the real composer
// on a clock this file drives. Each OUTPUT is the renderer's command path (output/main.ts
// `applyCommand` and its boot recovery) replayed in the same order over the same pure wire
// functions: an update keeps a stamped clock (`clockValueAfterUpdate`), a row's clock effect
// (`clockRowEffect`) is written before or after the row, an event carries its row's instant, and a
// boot writes the report's data, snaps its pose and writes the data again.
//
//   node --test scripts/imported-clock-wire.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { withBundledPage } from './catalog-emit.mjs';
import { DRIVEN_CLOCK, installDrivenPage } from './driven-clock.mjs';

const root = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const SPECS = [
  ['assets/svgImport.ts', 'NOACG_SVG'],
  ['components/wizard/import/draft.ts', 'NOACG_DRAFT'],
  ['templates/importedDesign/svg.ts', 'NOACG_IMPORTED'],
  ['preview/composeDocument.ts', 'NOACG_COMPOSE'],
  ['ai/svgInterpretation/contract.ts', 'NOACG_CONTRACT'],
  ['control/matchClockWire.ts', 'NOACG_WIRE'],
  ['templates/catalog.ts', 'NOACG_CATALOG'],
].map(([rel, globalName]) => ({ entry: root(`src/${rel}`), globalName }));

/** A scorebug drawn as one piece of artwork: two names, two figures and the match time. */
const SCORE_CLOCK = readFileSync(root('e2e/fixtures/jev-svg/dev/score-clock-1.svg'), 'utf8');

/** How long the second output's rows take to reach it: long enough that a clock anchored to its
 *  own arrival would read a different second from the first output for most of every second. */
const LAG = 700;

/** Runs in the browser: the graphics, and a small production of outputs over one command log. */
const SETUP = (driven) => {
  const { NOACG_SVG: R, NOACG_DRAFT: D, NOACG_IMPORTED: I, NOACG_CONTRACT: C, NOACG_WIRE: W, NOACG_CATALOG: K } = window;

  /** The imported score+clock in `mode`, or the house scorebug for `native`. */
  window.__graphic = (markup, mode) => {
    if (mode === 'native') return K.variantById('sb05').create({});
    const draft = window.__importDraft(R.importSvgMarkup(markup));
    const row = draft.svgFields.find((f) => f.on && f.clock);
    const id = (sample) => draft.svgFields.find((f) => f.sample === sample)?.candidateId ?? '';
    const score = { kind: 'score', rows: [{ name: id('FIELD'), score: id('2'), flash: '' }, { name: id('SHORE'), score: id('5'), flash: '' }], final: '' };
    const next = { ...draft, svgBehaviour: score, svgClock: { candidateId: row.candidateId, mode, revision: C.svgSourceRevision(draft.designSvg.markup) } };
    return I.IMPORTED_SVG.create({ designSvg: D.svgDesignOptions(next) });
  };

  /** One production: a server clock, its log, and the outputs following it. */
  window.__production = (template) => {
    const spec = W.clockSpecFromHtml(template.html);
    const field = spec.field;
    const prod = { wall: 1800000000000, log: [], outputs: [], spec, template };
    const iso = (t) => new Date(t).toISOString();

    /** An output's document, its local clock in step with the server's (an NTP-synced machine). */
    const mount = async (out) => {
      const html = window.NOACG_COMPOSE.composeDocument(template);
      const first = driven.replace('var origin = 1700000000000', `var origin = ${prod.wall}`);
      const srcdoc = html.replace(/<head[^>]*>/i, (m) => m + first);
      document.getElementById(`out-${out.name}`)?.remove();
      const frame = document.createElement('iframe');
      frame.id = `out-${out.name}`;
      frame.style.cssText = `position:fixed;left:0;top:0;width:${template.resolution.width}px;height:${template.resolution.height}px;border:0;`;
      await new Promise((resolve) => { frame.onload = resolve; frame.srcdoc = srcdoc; document.body.appendChild(frame); });
      out.w = frame.contentWindow;
    };

    /** output/main.ts `applyCommand`, the clock's half of it, in its order. */
    const deliver = (out, row) => {
      const { w } = out;
      let msg = row.msg;
      if (msg.t === 'update') {
        const prior = out.held;
        const merged = { ...prior, ...msg.data };
        if (msg.data[field] !== undefined) {
          merged[field] = W.clockValueAfterUpdate(prior[field], msg.data[field]);
          msg = { ...msg, data: { ...msg.data, [field]: merged[field] } };
        }
        out.held = merged;
      } else if (msg.t === 'event' && msg.payload) {
        out.held = { ...out.held, ...msg.payload };
      }
      const effect = W.clockRowEffect(row, spec, out.held[field], w.Date.now());
      const write = (value) => {
        out.held = { ...out.held, [field]: value };
        w.update(JSON.stringify({ [field]: value }));
      };
      if (effect?.when === 'before') write(effect.value);
      if (msg.t === 'update') w.update(JSON.stringify(msg.data));
      else if (msg.t === 'play') w.play();
      else if (msg.t === 'stop') w.stop();
      else if (msg.t === 'event') {
        w.noacgEventAt = W.rowInstant(row.created_at, w.Date.now());
        w.noacgDispatch(msg.event, msg.payload);
      }
      if (effect?.when === 'after') write(effect.value);
      out.seen = row.seq;
    };

    prod.output = async (name, lag) => {
      const out = { name, lag, held: {}, connected: true, missed: [], seen: 0, report: null };
      await mount(out);
      prod.outputs.push(out);
      return out;
    };
    prod.advance = (ms) => {
      prod.wall += ms;
      for (const out of prod.outputs) out.w.__advance(ms);
    };
    /** One operator press: one row with the server's time, reaching each output after its lag. */
    prod.send = (msg) => {
      const row = { seq: prod.log.length + 1, msg, created_at: iso(prod.wall) };
      prod.log.push(row);
      let waited = 0;
      for (const out of [...prod.outputs].sort((a, b) => a.lag - b.lag)) {
        if (out.lag > waited) { prod.advance(out.lag - waited); waited = out.lag; }
        if (out.connected) deliver(out, row);
        else out.missed.push(row);
      }
    };
    /** What a renderer banks: the values it holds and its pose, at the row it had applied. */
    prod.report = (out) => { out.report = { data: { ...out.held }, groups: out.w.noacgMachineState().groups, seq: out.seen }; };
    /** A browser source reloaded: its last report back (data, snap, data again), then the rows
     *  after it replayed in order (output/main.ts boot). */
    prod.reload = async (out) => {
      const report = out.report;
      await mount(out);
      out.held = { ...report.data };
      out.w.update(JSON.stringify(report.data));
      out.w.noacgSnap(report.groups, { timers: true });
      out.w.update(JSON.stringify(report.data));
      for (const row of prod.log.filter((r) => r.seq > report.seq)) deliver(out, row);
    };
    prod.disconnect = (out) => { out.connected = false; };
    /** Back online: the rows it missed, caught up in order with their own server times. */
    prod.reconnect = (out) => {
      out.connected = true;
      for (const row of out.missed.splice(0)) deliver(out, row);
    };
    prod.read = (out) => {
      const w = out.w;
      const groups = w.noacgMachineState().groups;
      return {
        value: w.formatMatchClock(w.matchClockValue()),
        held: out.held[field],
        expired: !!w.document.querySelector('.imported-design-expired'),
        clock: Object.entries(groups).find(([id]) => id.endsWith('clock'))?.[1] ?? null,
        flag: groups.flag ?? null,
        scores: template.fields.filter((f) => f.ftype === 'number').map((f) => w.document.getElementById(f.field)?.textContent ?? null),
      };
    };
    return prod;
  };
};

/** Runs in the browser: one scenario, as a list of steps over a production of two outputs. */
const RUN = async ({ markup, mode, script }) => {
  const template = window.__graphic(markup, mode);
  const prod = window.__production(template);
  const values = Object.fromEntries(template.fields.filter((f) => f.field).map((f) => [f.field, String(f.value ?? '')]));
  const clockField = prod.spec.field;
  const scoreFields = template.fields.filter((f) => f.ftype === 'number').map((f) => f.field);
  const outs = { A: await prod.output('A', 0), B: await prod.output('B', 0) };
  const readings = [];
  let cue = { ...values };
  for (const [verb, arg, extra] of script) {
    if (verb === 'lag') outs[arg].lag = extra;
    else if (verb === 'type') { cue = { ...cue, [clockField]: arg }; prod.send({ t: 'update', data: { ...cue } }); }
    // The operator types the time the clock shows (a cue edit that happens to equal it).
    // …or the time the wire banked it at, exactly.
    else if (verb === 'typeBanked') { cue = { ...cue, [clockField]: String(outs.A.held[clockField]).split('@')[0] }; prod.send({ t: 'update', data: { ...cue } }); }
    else if (verb === 'typeShown') { cue = { ...cue, [clockField]: prod.read(outs.A).value }; prod.send({ t: 'update', data: { ...cue } }); }
    else if (verb === 'take') { prod.send({ t: 'update', data: { ...cue } }); prod.send({ t: 'play' }); }
    else if (verb === 'out') prod.send({ t: 'stop' });
    else if (verb === 'event') prod.send({ t: 'event', event: arg, ...(extra ? { payload: extra } : {}) });
    // A goal or its correction: the surface moves the figure by one and it rides the event (score.ts `adjust`).
    else if (verb === 'goal' || verb === 'unscore') {
      const f = scoreFields[arg];
      cue = { ...cue, [f]: String(Number(cue[f]) + (verb === 'goal' ? 1 : -1)) };
      prod.send({ t: 'event', event: `${verb === 'goal' ? 'score' : 'unscore'}${arg + 1}`, payload: { [f]: cue[f] } });
    } else if (verb === 'newGame') {
      const zero = Object.fromEntries(scoreFields.map((f) => [f, '0']));
      cue = { ...cue, ...zero };
      prod.send({ t: 'event', event: 'newGame', payload: zero });
    } else if (verb === 'update') prod.send({ t: 'update', data: { ...cue } });
    else if (verb === 'wait') prod.advance(arg);
    else if (verb === 'report') prod.report(outs[arg]);
    else if (verb === 'reload') await prod.reload(outs[arg]);
    else if (verb === 'disconnect') prod.disconnect(outs[arg]);
    else if (verb === 'reconnect') prod.reconnect(outs[arg]);
    else if (verb === 'read') readings.push({ label: arg, A: prod.read(outs.A), B: prod.read(outs.B) });
  }
  for (const out of prod.outputs) document.getElementById(`out-${out.name}`)?.remove();
  return { spec: prod.spec, readings };
};

/** Runs in the browser: the event names each clock's machine and controls actually carry. */
const NAMES = ({ markup }) => {
  const names = {};
  for (const mode of ['count-up', 'duration', 'native']) {
    const t = window.__graphic(markup, mode);
    names[mode] = { spec: window.NOACG_WIRE.clockSpecFromHtml(t.html), events: [...new Set(t.js.match(/"event":\s*"(clock[A-Za-z_]+)"/g) ?? [])].map((m) => m.replace(/.*"(clock[^"]+)"$/, '$1')).sort() };
  }
  return names;
};

/** Long enough for any state's transition, and its calls, to have run. */
const SETTLE = 1500;

const runs = await withBundledPage(SPECS, async (page) => {
  await installDrivenPage(page);
  await page.evaluate(SETUP, DRIVEN_CLOCK);
  const run = (mode, script) => page.evaluate(RUN, { markup: SCORE_CLOCK, mode, script });
  const native = mode => mode === 'native';
  /** One walk for a clock the operator starts: the native scorebug's and the imported count-up's. */
  const started = (mode) => {
    const [start, pause, reset] = native(mode) ? ['clockStart', 'clockStop', 'clockReset'] : ['clock_start', 'clock_pause', 'clock_reset'];
    return run(mode, [
      ['lag', 'B', LAG],
      ['take'], ['wait', 3000], ['read', 'on air, before Start'],
      ['event', start], ['wait', SETTLE], ['read', 'started'], ['wait', 4250], ['read', 'running'],
      ...(native(mode) ? [] : [['goal', 0], ['wait', SETTLE], ['read', 'a goal'], ['wait', 2000], ['read', 'after the goal']]),
      ['update'], ['wait', 600], ['read', 'an unrelated update'],
      ['report', 'B'], ['wait', 30000], ['reload', 'B'], ['wait', 300], ['read', 'B reloaded'],
      ['disconnect', 'B'], ['event', pause], ['wait', 5000], ['reconnect', 'B'], ['wait', SETTLE], ['read', 'B reconnected after a pause'],
      ['wait', 4000], ['read', 'held'],
      ...(native(mode) ? [] : [['update'], ['wait', 600], ['read', 'a resend while paused']]),
      ['type', '40:00'], ['wait', 600], ['read', 'corrected while held'],
      ['event', start], ['wait', SETTLE], ['read', 'restarted'],
      ['report', 'A'], ['disconnect', 'A'], ['wait', 20000], ['reload', 'A'], ['reconnect', 'A'], ['wait', 300], ['read', 'A reloaded from a report, then reconnected'],
      ...(native(mode) ? [] : [['unscore', 1], ['newGame'], ['wait', SETTLE], ['read', 'a correction and a new game']]),
      ['event', reset], ['wait', SETTLE], ['read', 'reset'],
      ['report', 'B'], ['reload', 'B'], ['wait', 300], ['read', 'B reloaded after the reset'],
    ]);
  };
  return {
    names: await page.evaluate(NAMES, { markup: SCORE_CLOCK }),
    native: await started('native'),
    up: await started('count-up'),
    duration: await run('duration', [
      ['lag', 'B', LAG],
      ['type', '0:30'], ['wait', 2000], ['read', 'length set off air'],
      // Read where a count anchored to B's own arrival, 700 ms late, would show the second before.
      ['take'], ['wait', 500], ['read', 'just taken'], ['wait', 4000], ['read', 'counting'],
      ['update'], ['wait', 400], ['read', 'after a resend'],
      ['goal', 1], ['wait', SETTLE], ['read', 'a goal'],
      ['report', 'B'], ['wait', 6000], ['reload', 'B'], ['wait', 300], ['read', 'B reloaded'],
      ['event', 'clock_pause'], ['wait', SETTLE], ['read', 'paused'], ['wait', 3000], ['read', 'held'],
      ['update'], ['wait', 600], ['read', 'a resend while paused'],
      ['report', 'B'], ['reload', 'B'], ['wait', 300], ['read', 'B reloaded while paused'],
      ['type', '0:20'], ['wait', 600], ['read', 'corrected while paused'],
      ['disconnect', 'B'], ['event', 'clock_start'], ['wait', 2000], ['reconnect', 'B'], ['wait', 600], ['read', 'B reconnected while running'],
      ['disconnect', 'B'], ['type', '0:12'], ['wait', 3000], ['reconnect', 'B'], ['wait', 600], ['read', 'corrected while running, B caught up'],
      ['wait', 30000], ['read', 'run out'],
      ['report', 'A'], ['reload', 'A'], ['wait', 300], ['read', 'A reloaded at zero'],
      ['event', 'clock_reset'], ['wait', SETTLE], ['read', 'reset'],
      ['report', 'B'], ['wait', 4000], ['reload', 'B'], ['wait', 300], ['read', 'B reloaded after the reset'],
      ['out'], ['wait', 3000], ['type', '0:09'], ['take'], ['wait', 500], ['read', 'a second Take, with a new length'],
      ['wait', 2000], ['read', 'two seconds into it'],
      ['report', 'B'], ['wait', 5000], ['reload', 'B'], ['wait', 300], ['read', 'B reloaded into the second Take'],
      // A Take of a graphic already on air: the entrance plays again, from a new server origin.
      ['wait', 2000], ['take'], ['wait', 500], ['read', 're-taken on air'], ['wait', 3000], ['read', 'three seconds into the re-take'],
      // Paused, taken out and taken again with nothing typed: a new count of the length.
      ['event', 'clock_pause'], ['wait', SETTLE], ['out'], ['wait', 3000], ['take'], ['wait', 500], ['read', 'a Take after a pause'],
      // Taken out while it runs, a new length typed off air: the next Take counts that length.
      ['wait', 2000], ['out'], ['wait', 3000], ['type', '0:07'], ['take'], ['wait', 500], ['read', 'a new length after a running Out'],
    ]),
    // What a resend is, after a correction (the time the cue last sent, not the clock's own).
    corrections: await run('duration', [
      ['lag', 'B', LAG],
      ['type', '0:30'], ['take'], ['wait', 2000], ['type', '0:25'], ['wait', 2000],
      ['event', 'clock_pause'], ['wait', SETTLE], ['read', 'paused after a correction'],
      ['goal', 0], ['update'], ['wait', 600], ['read', 'a score sent while paused'],
      ['event', 'clock_start'], ['wait', 1000], ['out'], ['wait', 2000],
      ['take'], ['wait', 500], ['read', 'taken again with nothing typed'],
      ['event', 'clock_pause'], ['wait', SETTLE], ['type', '0:30'], ['wait', 600], ['read', 'the length typed while paused'],
      // Two cue edits while paused, the first equal to the time shown: the second is still a change.
      ['event', 'clock_start'], ['wait', 3000], ['event', 'clock_pause'], ['wait', SETTLE],
      ['typeShown'], ['wait', 600], ['type', '0:30'], ['wait', 600], ['read', 'two edits, the first equal to the time shown'],
      // Corrected while paused ON AIR, then out and in again: a correction, never a new length.
      ['type', '0:20'], ['wait', 600], ['out'], ['wait', 2000], ['take'], ['wait', 500], ['read', 'a Take after a paused correction and an Out'],
      // A length typed OFF AIR stands through a Reset pressed off air, and the Take counts it.
      ['out'], ['wait', 2000], ['type', '0:45'], ['event', 'clock_reset'], ['wait', SETTLE], ['read', 'a length typed off air, then Reset'],
      ['take'], ['wait', 500], ['read', 'taken after it'],
      // Run, out, and the time it was banked at typed off air: that is the new length too.
      ['wait', 3000], ['out'], ['wait', 2000], ['typeBanked'], ['take'], ['wait', 500], ['read', 'the banked time typed off air, taken'],
    ]),
  };
});

const at = (run, label) => {
  const r = run.readings.find((o) => o.label === label);
  assert.ok(r, `no reading "${label}"`);
  return r;
};
/** A wire value with no origin: a held clock, whatever it carries after the `@`. */
const clockHeld = (v) => !/@\d*[1-9]/.test(v);
const plainOf = (v) => v.split('@')[0];
const secs = (t) => { const [m, s] = t.split(':').map(Number); return m * 60 + s; };
/** Both outputs paint the same time and hold the same wire value. */
const agree = (r, label) => {
  assert.equal(r.B.value, r.A.value, `${label}: both outputs read the same second`);
  assert.equal(r.B.held, r.A.held, `${label}: both outputs hold the same value`);
};

test('the wire knows each clock by the verbs its machine answers to, and a native spec is unchanged (W1)', () => {
  const { names } = runs;
  assert.deepEqual(names.native.spec, { field: names.native.spec.field, countsDown: false, seed: '0:00', resetTo: '0:00' }, 'a native spec carries exactly what it always did');
  for (const mode of ['count-up', 'duration']) {
    const { spec, events } = names[mode];
    assert.deepEqual(events, ['clock_pause', 'clock_reset', 'clock_start'], `${mode}: the machine's own verbs`);
    assert.deepEqual(Object.values(spec.events).sort(), events, `${mode}: the wire's names are the machine's (one map in each layer, pinned here)`);
    assert.equal(spec.startsOnTake, mode === 'duration');
  }
});

for (const [name, mode] of [['an imported count-up', 'up'], ['a native scorebug', 'native']]) {
  test(`${name}: Start stamps the server's time, so two outputs a ${LAG} ms hop apart read the same second; Pause and Reset bank it (W2)`, () => {
    const r = runs[mode];
    const before = at(r, 'on air, before Start');
    agree(before, 'before Start');
    assert.equal(before.A.held.includes('@'), false, 'nothing runs before Start');
    const started = at(r, 'started');
    agree(started, 'started');
    assert.match(started.A.held, mode === 'native' ? /@\d+$/ : /@\d+\/12:08\/12:08$/, 'the running value carries its origin (and an imported one its length and what was sent)');
    const running = at(r, 'running');
    agree(running, 'running');
    assert.equal(secs(running.A.value) - secs(started.A.value), 4);
    assert.equal(at(r, 'an unrelated update').A.held, started.A.held, 'a resend keeps the origin (W3)');
    agree(at(r, 'an unrelated update'), 'an unrelated update');
    const reloaded = at(r, 'B reloaded');
    agree(reloaded, 'B reloaded');
    assert.equal(reloaded.B.clock, 'running');
    const paused = at(r, 'B reconnected after a pause');
    agree(paused, 'B reconnected after a pause');
    assert.equal(clockHeld(paused.A.held), true, 'Pause banks a held time');
    assert.deepEqual([paused.A.clock, paused.B.clock], ['stopped', 'stopped']);
    assert.equal(at(r, 'held').A.value, paused.A.value);
    if (mode !== 'native') {
      const resent = at(r, 'a resend while paused');
      agree(resent, 'a resend while paused');
      assert.equal(resent.A.value, paused.A.value, 'a resend of the cue\'s time never pulls a paused clock back (W3)');
    }
    agree(at(r, 'corrected while held'), 'corrected');
    assert.equal(at(r, 'corrected while held').A.value, '40:00');
    agree(at(r, 'restarted'), 'restarted');
    const back = at(r, 'A reloaded from a report, then reconnected');
    agree(back, 'A reloaded and reconnected');
    assert.equal(secs(back.A.value) - secs(at(r, 'restarted').A.value), 20, 'twenty seconds counted while A was gone');
    const reset = at(r, 'reset');
    agree(reset, 'reset');
    assert.equal(plainOf(reset.A.held), mode === 'native' ? '0:00' : '12:08', 'Reset banks what the runtime returns to');
    assert.equal(clockHeld(reset.A.held), true);
    assert.equal(reset.A.value, plainOf(reset.A.held));
    agree(at(r, 'B reloaded after the reset'), 'B reloaded after the reset');
    assert.equal(at(r, 'B reloaded after the reset').B.clock, 'armed');
  });
}

test('score rows keep the clock origin and clock rows keep the scores and the flash (W3, AC-10)', () => {
  const r = runs.up;
  const goal = at(r, 'a goal');
  agree(goal, 'a goal');
  assert.equal(goal.A.held, at(r, 'started').A.held, 'a +1 never moves the clock origin');
  assert.deepEqual(goal.A.scores, ['3', '5']);
  assert.equal(goal.A.flag, 'shown', 'the +1 flashes');
  assert.equal(secs(at(r, 'after the goal').A.value) - secs(goal.A.value), 2, 'and the clock runs on through it');
  // The flash and the figures ride every clock row untouched.
  for (const label of ['B reloaded', 'B reconnected after a pause', 'corrected while held', 'restarted', 'A reloaded from a report, then reconnected']) {
    const x = at(r, label);
    assert.deepEqual([x.A.scores, x.B.scores], [['3', '5'], ['3', '5']], `${label}: the scores`);
    assert.deepEqual([x.A.flag, x.B.flag], ['shown', 'shown'], `${label}: the flash`);
  }
  const game = at(r, 'a correction and a new game');
  agree(game, 'a new game');
  assert.deepEqual(game.A.scores, ['0', '0'], '-1 and New game reach the board');
  assert.deepEqual([game.A.flag, game.B.flag], ['none', 'none'], 'a correction and a new game take the flash down');
  assert.equal(game.A.held, at(r, 'restarted').A.held, 'New game does not reset the clock');
  assert.equal(game.A.clock, 'running');
  const reset = at(r, 'reset');
  assert.deepEqual(reset.A.scores, ['0', '0'], 'a clock reset leaves the scores');
});

test('a duration is stamped by its Take: both outputs count the server origin from its first frame, through a reload and a reconnect, and hold at zero (W4)', () => {
  const r = runs.duration;
  const set = at(r, 'length set off air');
  assert.deepEqual([set.A.value, set.B.value, set.A.held], ['0:30', '0:30', '0:30'], 'the length typed off air shows, held: nothing counts before the Take');
  const taken = at(r, 'just taken');
  agree(taken, 'just taken');
  assert.match(taken.A.held, /^0:30@\d+\/0:30\/0:30$/, 'the Take stamps its server time, and the time taken is the length');
  assert.deepEqual([taken.A.clock, taken.B.clock], ['running', 'running']);
  const counting = at(r, 'counting');
  agree(counting, 'counting');
  assert.equal(counting.A.value, '0:25');
  const resent = at(r, 'after a resend');
  agree(resent, 'after a resend');
  assert.equal(resent.A.held, taken.A.held, 'a resend keeps the Take origin');
  const goal = at(r, 'a goal');
  agree(goal, 'a goal');
  assert.deepEqual(goal.A.scores, ['2', '6']);
  assert.equal(goal.A.held, taken.A.held, 'a goal keeps the Take origin');
  const reloaded = at(r, 'B reloaded');
  agree(reloaded, 'B reloaded');
  assert.equal(reloaded.B.clock, 'running');
  const paused = at(r, 'paused');
  agree(paused, 'paused');
  assert.match(paused.A.held, /^\d+:\d{2}@\/0:30\/0:30$/, 'Pause banks the time and keeps the length');
  assert.equal(at(r, 'held').A.value, paused.A.value);
  const pausedResend = at(r, 'a resend while paused');
  agree(pausedResend, 'a resend while paused');
  assert.deepEqual([pausedResend.A.value, pausedResend.A.held], [paused.A.value, paused.A.held], 'a resend of the cue\'s length never pulls a paused clock back');
  const pausedReload = at(r, 'B reloaded while paused');
  agree(pausedReload, 'B reloaded while paused');
  assert.equal(pausedReload.B.clock, 'stopped');
  agree(at(r, 'corrected while paused'), 'corrected while paused');
  assert.equal(at(r, 'corrected while paused').A.held, '0:20@/0:30/0:20', 'a correction while paused on air keeps the length and stays a correction');
  const back = at(r, 'B reconnected while running');
  agree(back, 'B reconnected');
  assert.equal(back.A.value, '0:17', 'three seconds and a hop since Start, counted while B was gone');
  const corrected = at(r, 'corrected while running, B caught up');
  agree(corrected, 'a correction while running, replayed late');
  assert.match(corrected.A.held, /^0:12@\d+\/0:30\/0:12$/, 'a time typed while it runs keeps running, from the row\'s own time, and keeps the length');
  assert.equal(corrected.A.value, '0:08', 'counted from the update row (4.3 s ago), not from when B heard it');
  const out = at(r, 'run out');
  agree(out, 'run out');
  assert.deepEqual([out.A.value, out.A.expired, out.B.expired], ['0:00', true, true]);
  const zero = at(r, 'A reloaded at zero');
  agree(zero, 'A reloaded at zero');
  assert.deepEqual([zero.A.value, zero.A.expired], ['0:00', true], 'a reload holds at zero, it never counts again');
});

test('a duration\'s Reset goes back to its length on every output and is banked, so a reload keeps it; a new Take takes a new length (W5)', () => {
  const r = runs.duration;
  const reset = at(r, 'reset');
  agree(reset, 'reset');
  assert.deepEqual([reset.A.value, reset.A.held, reset.A.expired], ['0:30', '0:30@/0:30/0:12', false], 'back to the length, after a correction and a run-out');
  const reloaded = at(r, 'B reloaded after the reset');
  agree(reloaded, 'B reloaded after the reset');
  assert.deepEqual([reloaded.B.value, reloaded.B.clock], ['0:30', 'armed'], 'a reload after Reset holds at the length');
  const again = at(r, 'a second Take, with a new length');
  agree(again, 'a second Take');
  assert.match(again.A.held, /^0:09@\d+\/0:09\/0:09$/, 'a time typed off air is the next Take\'s length');
  assert.equal(again.A.value, '0:08');
  assert.equal(at(r, 'two seconds into it').A.value, '0:06');
  agree(at(r, 'B reloaded into the second Take'), 'B reloaded into the second Take');
  assert.equal(at(r, 'B reloaded into the second Take').B.value, '0:01');
  const retake = at(r, 're-taken on air');
  agree(retake, 're-taken on air');
  assert.match(retake.A.held, /^0:09@\d+\/0:09\/0:09$/);
  assert.notEqual(retake.A.held, again.A.held, 'a re-take is a new origin');
  assert.equal(retake.A.value, '0:08');
  agree(at(r, 'three seconds into the re-take'), 'three seconds into the re-take');
  const afterPause = at(r, 'a Take after a pause');
  agree(afterPause, 'a Take after a pause');
  assert.match(afterPause.A.held, /^0:09@\d+\/0:09\/0:09$/, 'a paused clock is taken again from its length, not from where it paused');
  assert.equal(afterPause.A.value, '0:08');
  const newLength = at(r, 'a new length after a running Out');
  agree(newLength, 'a new length after a running Out');
  assert.match(newLength.A.held, /^0:07@\d+\/0:07\/0:07$/, 'a time typed off air after a running clock went out is the next Take\'s length');
  assert.equal(newLength.A.value, '0:06');
});

test('a duration tells a resend from a change by what the cue last sent: a score never moves it, and an untyped Take counts its length (W3, W5)', () => {
  const r = runs.corrections;
  const paused = at(r, 'paused after a correction');
  agree(paused, 'paused after a correction');
  assert.match(paused.A.held, /^0:2\d@\/0:30\/0:25$/, 'paused below the correction, the length and the last time sent kept');
  const score = at(r, 'a score sent while paused');
  agree(score, 'a score sent while paused');
  assert.deepEqual([score.A.value, score.A.held], [paused.A.value, paused.A.held], 'a score sent with the cue\'s old correction never moves a paused clock');
  assert.deepEqual(score.A.scores, ['3', '5']);
  const again = at(r, 'taken again with nothing typed');
  agree(again, 'taken again with nothing typed');
  assert.match(again.A.held, /^0:30@\d+\/0:30\/0:25$/, 'taken out running and taken again untyped: a new count of the length, not of the old correction');
  const typed = at(r, 'the length typed while paused');
  agree(typed, 'the length typed while paused');
  assert.deepEqual([typed.A.value, typed.A.held], ['0:30', '0:30@/0:30/0:30'], 'typing the length is a change when the cue last sent something else: a correction, on air');
  const two = at(r, 'two edits, the first equal to the time shown');
  agree(two, 'two edits');
  assert.equal(two.A.value, '0:30', 'a cue edit equal to the time shown still becomes what the cue last sent');
  const afterOut = at(r, 'a Take after a paused correction and an Out');
  agree(afterOut, 'a Take after a paused correction and an Out');
  assert.match(afterOut.A.held, /^0:30@\d+\/0:30\/0:20$/, 'a correction made while paused on air never becomes the length');
  const offReset = at(r, 'a length typed off air, then Reset');
  agree(offReset, 'a length typed off air, then Reset');
  assert.deepEqual([offReset.A.value, offReset.A.held], ['0:45', '0:45@out/0:45/0:45'], 'a time typed off air is the length, so a Reset off air returns to it');
  const taken = at(r, 'taken after it');
  agree(taken, 'taken after it');
  assert.match(taken.A.held, /^0:45@\d+\/0:45\/0:45$/, 'and the Take counts it');
  const banked = at(r, 'the banked time typed off air, taken');
  agree(banked, 'the banked time typed off air, taken');
  assert.match(banked.A.held, /^(0:\d\d)@\d+\/\1\/\1$/, 'a length typed off air equal to the time it was banked at is still the new length');
});
