// gate: factory
// needs: browser
// guards: src/templates/behaviours/score.ts, src/templates/importedDesign/behaviourRuntime.ts, src/templates/shared/animRuntime.ts, src/control/controlModel.ts, src/control/graphicVerbs.ts, src/control/matchClockWire.ts
//
// THE SCORE EVENT ON ARTWORK NOBODY NAMED FOR US (docs/work-specs/jev-svg-import/spec.md, row 12,
// AC-10 and AC-21). The boards here are the plan's own development fixtures, drawn with generic
// layer ids (`home-score`, `layer3`), with a hidden flash group per team and a hidden Full time
// group added in memory, named just as generically (`object8`), and bound in the mapping step's
// draft the way an author would pick them. Nothing is read from a layer name.
//
// What it proves, in the rules of docs/work-specs/jev-svg-import/evidence/phase-12.md:
// - S1 `+1` awards exactly one point and lights that team's flash, a second press during the
//   flash too (the self-transition replays the moment, score.ts).
// - S2 `-1` takes the point and the flash down; a figure TYPED up or down (an Update, no event)
//   never awards and never replays the pop. Which team's flash stays lit after a figure typed up
//   during a flash is #1908 (open), and so is a reloaded output's flash and a clock row's pop.
// - S3 an event the machine has no arrow for is dropped before its payload lands, and the
//   surfaces grey the same button (`eventLegality`).
// - S4 clock rows leave the scores and the lit flash alone, and score rows the clock: New game zeroes
//   the scores and leaves the clock running; Full time, Out and Take keep both figures.
// - S5 an output that missed rows and caught up agrees with one that saw them all.
// - S6 at the surface, the recipe's own buttons through the real `pressSend` and verbs: a failed
//   send writes nothing into the cue, and an event that went while its shared value did not move
//   says so in words distinct from a failed send.
//
//   node --test scripts/imported-score-event.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import { withBundledPage } from './catalog-emit.mjs';
import { DRIVEN_CLOCK, installDrivenPage } from './driven-clock.mjs';

// controlModel.ts imports without extensions, as Vite does: resolve those to their `.ts` file so
// the press rules run for real (as scripts/graphic-verbs-walk.test.mjs does).
registerHooks({
  resolve(spec, ctx, next) {
    if (ctx.parentURL && /^\.\.?\//.test(spec) && !/\.[a-z]+$/.test(spec)) {
      const url = new URL(`${spec}.ts`, ctx.parentURL);
      if (existsSync(fileURLToPath(url))) return next(url.href, ctx);
    }
    return next(spec, ctx);
  },
});

const { eventButtons, eventLegality, isEventLegal, pressSend, adjustedValue, movedKeys } = await import('../src/control/controlModel.ts');
const { createGraphicVerbs } = await import('../src/control/graphicVerbs.ts');
const { createPlayoutSession } = await import('../src/control/playoutSession.ts');
const { withLiveCue } = await import('../src/control/liveCue.ts');
const { SHARED_NOT_MOVED } = await import('../src/control/liveControls.ts');

const root = (rel) => fileURLToPath(new URL(`../${rel}`, import.meta.url));
const SPECS = [
  ['assets/svgImport.ts', 'NOACG_SVG'],
  ['components/wizard/import/draft.ts', 'NOACG_DRAFT'],
  ['templates/importedDesign/svg.ts', 'NOACG_IMPORTED'],
  ['preview/composeDocument.ts', 'NOACG_COMPOSE'],
  ['ai/svgInterpretation/contract.ts', 'NOACG_CONTRACT'],
  ['control/matchClockWire.ts', 'NOACG_WIRE'],
].map(([rel, globalName]) => ({ entry: root(`src/${rel}`), globalName }));

/** A hidden group the way a designer draws a moment: off in the file, a plain shape inside. */
const moment = (id, x, y, w, h) => `  <g id="${id}" style="display:none"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#e0a020" opacity="0.6"/></g>\n`;
const withMoments = (file, moments) => readFileSync(root(`e2e/fixtures/jev-svg/dev/${file}`), 'utf8').replace('</svg>', `${moments.join('')}</svg>`);

/** Two teams and the match time; a flash per team and a Full time plate. */
const SCORE_CLOCK = withMoments('score-clock-1.svg', [
  moment('object8', 30, 35, 400, 110),
  moment('object9', 770, 35, 400, 110),
  moment('object10', 460, 40, 280, 100),
]);
/** Four teams in rows, a flash behind each. */
const FOUR = withMoments('scoreboard-3.svg', [85, 160, 235, 310].map((y, i) => moment(`object${20 + i}`, 45, y, 850, 60)));

/** Runs in the browser: the graphic as the wizard builds it, its teams picked by their samples. */
const BUILD = ({ markup, teams, clock }) => {
  const { NOACG_SVG: R, NOACG_DRAFT: D, NOACG_IMPORTED: I, NOACG_CONTRACT: C } = window;
  const svg = R.importSvgMarkup(markup);
  const draft = window.__importDraft(svg);
  const id = (sample) => draft.svgFields.find((f) => f.sample === sample)?.candidateId ?? '';
  const group = (label) => svg.groups.find((g) => g.label === label)?.id ?? '';
  const score = {
    kind: 'score',
    rows: teams.rows.map(([name, figure, flash]) => ({ name: id(name), score: id(figure), flash: group(flash) })),
    final: teams.final ? group(teams.final) : '',
  };
  const row = clock ? draft.svgFields.find((f) => f.clock) : null;
  const next = {
    ...draft,
    svgBehaviour: score,
    ...(row ? { svgClock: { candidateId: row.candidateId, mode: clock, revision: C.svgSourceRevision(draft.designSvg.markup) } } : {}),
  };
  return I.IMPORTED_SVG.create({ designSvg: D.svgDesignOptions(next) });
};

/** Runs in the browser: one graphic on two outputs over one command log, driven by `script`.
 *  Each output applies a row as output/main.ts does, the clock's half included (an update keeps a
 *  stamped clock, a row's clock effect is written beside it, an event carries its row's instant). */
const RUN = async ({ template, scoreFields, script }) => {
  const W = window.NOACG_WIRE;
  const spec = W.clockSpecFromHtml(template.html);
  const clockField = spec?.field ?? null;
  const scores = scoreFields;
  const values = Object.fromEntries(template.fields.filter((f) => f.field).map((f) => [f.field, String(f.value ?? '')]));
  let wall = 1800000000000;
  const log = [];
  const outputs = [];
  const mount = async (name) => {
    const html = window.NOACG_COMPOSE.composeDocument(template);
    const srcdoc = html.replace(/<head[^>]*>/i, (m) => m + window.__TEST_CLOCK.replace('var origin = 1700000000000', `var origin = ${wall}`));
    const frame = document.createElement('iframe');
    frame.id = `out-${name}`;
    frame.style.cssText = `position:fixed;left:0;top:0;width:${template.resolution.width}px;height:${template.resolution.height}px;border:0;`;
    await new Promise((resolve) => { frame.onload = resolve; frame.srcdoc = srcdoc; document.body.appendChild(frame); });
    const w = frame.contentWindow;
    // Every pop the flash plays, per team: a replayed celebration is counted, never guessed from a picture.
    const out = { name, w, held: {}, connected: true, missed: [], pops: {} };
    const pop = w.noacgPop;
    w.noacgPop = (el) => {
      const role = (el.getAttribute('data-noacg-role') || '').split(/\s+/).find((r) => r.startsWith('team.flash/')) || '?';
      out.pops[role] = (out.pops[role] || 0) + 1;
      return pop(el);
    };
    return out;
  };
  const deliver = (out, row) => {
    const { w } = out;
    let msg = row.msg;
    if (msg.t === 'update') {
      const merged = { ...out.held, ...msg.data };
      if (clockField && msg.data[clockField] !== undefined) {
        merged[clockField] = W.clockValueAfterUpdate(out.held[clockField], msg.data[clockField]);
        msg = { ...msg, data: { ...msg.data, [clockField]: merged[clockField] } };
      }
      out.held = merged;
    } else if (msg.t === 'event' && msg.payload) {
      // The renderer holds a payload only for an event the graphic took: asked of the graphic's own answer below.
    }
    const effect = spec ? W.clockRowEffect(row, spec, out.held[clockField], w.Date.now()) : null;
    const write = (value) => { out.held = { ...out.held, [clockField]: value }; w.update(JSON.stringify({ [clockField]: value })); };
    if (effect?.when === 'before') write(effect.value);
    if (msg.t === 'update') w.update(JSON.stringify(msg.data));
    else if (msg.t === 'play') w.play();
    else if (msg.t === 'stop') w.stop();
    else if (msg.t === 'event') {
      w.noacgEventAt = W.rowInstant(row.created_at, w.Date.now());
      w.noacgDispatch(msg.event, msg.payload);
      if (msg.payload) for (const key of Object.keys(msg.payload)) out.held = { ...out.held, [key]: w.document.getElementById(key)?.textContent ?? '' };
    }
    if (effect?.when === 'after') write(effect.value);
  };
  const send = (msg) => {
    const row = { msg, created_at: new Date(wall).toISOString() };
    log.push(row);
    for (const out of outputs) (out.connected ? deliver(out, row) : out.missed.push(row));
  };
  const advance = (ms) => { wall += ms; for (const out of outputs) out.w.__advance(ms); };
  const read = (out) => {
    const { w } = out;
    const groups = w.noacgMachineState().groups;
    const lit = (role) => [...w.document.querySelectorAll(`[data-noacg-role~="${role}"]`)].some((el) => el.classList.contains('imported-design-on'));
    return {
      scores: scores.map((f) => w.document.getElementById(f)?.textContent ?? null),
      flag: groups.flag ?? null,
      result: groups.result ?? null,
      clock: Object.entries(groups).find(([gid]) => gid.endsWith('clock'))?.[1] ?? null,
      time: clockField ? w.document.getElementById(clockField)?.textContent ?? null : null,
      flashes: scores.map((_, i) => lit(`team.flash/${i + 1}`)),
      final: lit('final'),
      pops: { ...out.pops },
    };
  };
  outputs.push(await mount('A'), await mount('B'));
  const [A, B] = outputs;
  let cue = { ...values };
  const readings = [];
  for (const [verb, arg, extra] of script) {
    if (verb === 'take') { send({ t: 'update', data: { ...cue } }); send({ t: 'play' }); }
    else if (verb === 'out') send({ t: 'stop' });
    else if (verb === 'type') { cue = { ...cue, [scores[arg]]: String(extra) }; send({ t: 'update', data: { ...cue } }); }
    else if (verb === 'typeClock') { cue = { ...cue, [clockField]: arg }; send({ t: 'update', data: { ...cue } }); }
    else if (verb === 'update') send({ t: 'update', data: { ...cue } });
    // +1 and −1 ride their own field moved by one from what air shows (score.ts `adjust`).
    else if (verb === '+1' || verb === '-1') {
      const f = scores[arg];
      cue = { ...cue, [f]: String(Number(A.held[f] ?? cue[f]) + (verb === '+1' ? 1 : -1)) };
      send({ t: 'event', event: `${verb === '+1' ? 'score' : 'unscore'}${arg + 1}`, payload: { [f]: cue[f] } });
    } else if (verb === 'newGame') {
      const zero = Object.fromEntries(scores.map((f) => [f, '0']));
      cue = { ...cue, ...zero };
      send({ t: 'event', event: 'newGame', payload: zero });
    } else if (verb === 'event') send({ t: 'event', event: arg, ...(extra ? { payload: extra } : {}) });
    else if (verb === 'wait') advance(arg);
    else if (verb === 'disconnect') B.connected = false;
    else if (verb === 'reconnect') { B.connected = true; for (const row of B.missed.splice(0)) deliver(B, row); }
    else if (verb === 'read') readings.push({ label: arg, A: read(A), B: read(B) });
  }
  for (const out of outputs) document.getElementById(`out-${out.name}`)?.remove();
  return { readings, scores };
};

const SETTLE = 1500;
const TWO = { rows: [['FIELD', '2', 'object8'], ['SHORE', '5', 'object9']], final: 'object10' };
const FOUR_TEAMS = { rows: [['Marsh', '7', 'object20'], ['Dune', '3', 'object21'], ['Reef', '8', 'object22'], ['Grove', '5', 'object23']] };

const runs = await withBundledPage(SPECS, async (page) => {
  await installDrivenPage(page);
  const build = (markup, teams, clock) => page.evaluate(BUILD, { markup, teams, clock });
  // The teams' figures, in row order: what each `+1` moves (a board can draw other numbers, a year).
  const figures = (template) => eventButtons(template.js).filter((b) => /^score\d+$/.test(b.event)).map((b) => Object.keys(b.adjust)[0]);
  const run = (template, script) => page.evaluate(RUN, { template, scoreFields: figures(template), script });
  const twoClock = await build(SCORE_CLOCK, TWO, 'count-up');
  const four = await build(FOUR, FOUR_TEAMS, null);
  const r = (label) => ['read', label];
  const s = ['wait', SETTLE];
  return {
    twoClock,
    four,
    awards: await run(four, [
      ['take'], s, r('taken'),
      ['+1', 2], s, r('+1 Reef'),
      ['+1', 2], ['wait', 120], ['+1', 2], s, r('+1 Reef twice more, during its flash'),
      ['+1', 0], s, r('+1 Marsh'),
      ['+1', 3], s, r('+1 Grove'),
    ]),
    corrections: await run(four, [
      ['take'], s,
      ['+1', 1], s, r('+1 Dune'),
      ['type', 0, 12], s, r('Marsh typed up while Dune flashes'),
      ['type', 1, 9], s, r('Dune typed up while it flashes'),
      ['type', 3, 2], s, r('Grove typed down while Dune flashes'),
      ['-1', 1], s, r('-1 Dune'),
      ['type', 2, 20], s, r('Reef typed up with no flash'),
      ['-1', 3], s, r('-1 Grove with no flash'),
      ['update'], s, r('a resend of every figure'),
      ['+1', 0], s, r('+1 Marsh after the corrections'),
    ]),
    illegal: await run(twoClock, [
      ['take'], s, r('taken'),
      ['event', 'clearFlag', { f1: '40' }], s, r('Clear flash with nothing flashing, carrying a figure'),
      ['event', 'final'], s,
      ['event', 'final', { f3: '41' }], s, r('Full time twice, the second carrying a figure'),
      ['event', 'noSuchEvent', { f1: '42' }], s, r('an event the machine does not know, carrying a figure'),
      ['event', 'score1', { f1: '3' }], s, r('a legal +1 after them'),
    ]),
    clock: await run(twoClock, [
      ['take'], s,
      ['event', 'clock_start'], s, r('clock started'),
      ['+1', 0], s, r('+1 FIELD'), ['wait', 2000], r('two seconds on'),
      ['-1', 1], s, r('-1 SHORE'),
      ['+1', 1], s, r('+1 SHORE'),
      ['event', 'clock_pause'], s, r('clock paused'),
      ['typeClock', '40:00'], s, r('clock corrected'),
      ['event', 'clock_start'], s, r('clock restarted'),
      ['event', 'final'], s, r('Full time'),
      ['newGame'], s, r('New game'), ['wait', 3000], r('three seconds into the new game'),
      ['+1', 1], s, ['event', 'clock_reset'], s, r('clock reset after a point'),
      ['out'], ['wait', 2000], r('out'),
      ['take'], s, r('taken again'),
    ]),
    reconnect: await run(twoClock, [
      ['take'], s, ['event', 'clock_start'], s,
      ['disconnect'],
      ['+1', 0], ['wait', 300], ['+1', 0], ['wait', 300], ['+1', 1], s,
      ['type', 0, 9], ['-1', 0], ['event', 'final'], s,
      ['reconnect'], s, r('B caught up'),
      ['disconnect'], ['+1', 1], ['wait', 4000], ['reconnect'], s, r('B caught up after a point'),
    ]),
  };
});

const at = (run, label) => {
  const r = run.readings.find((o) => o.label === label);
  assert.ok(r, `no reading "${label}"`);
  return r;
};
/** Only team `n` (1-based) flashing, on both outputs; 0 for none. */
const flashOnly = (r, n, label) => {
  const want = r.A.flashes.map((_, i) => i + 1 === n);
  assert.deepEqual(r.A.flashes, want, `${label}: which flash is lit`);
  assert.deepEqual(r.B.flashes, want, `${label}: the second output lights the same flash`);
};
const scoresAre = (r, want, label) => {
  assert.deepEqual(r.A.scores, want, `${label}: the figures`);
  assert.deepEqual(r.B.scores, want, `${label}: the second output's figures`);
};

test('the board on unfamiliar artwork offers a point and a correction per team, and the board verbs it drew', () => {
  const four = eventButtons(runs.four.js).map((b) => b.event);
  assert.deepEqual(four.filter((e) => /score/.test(e)).sort(), ['score1', 'score2', 'score3', 'score4', 'unscore1', 'unscore2', 'unscore3', 'unscore4']);
  assert.ok(four.includes('clearFlag') && four.includes('newGame') && !four.includes('final'), 'no Full time drawn, no Full time button');
  const two = eventButtons(runs.twoClock.js);
  const plus = two.find((b) => b.event === 'score1');
  // The ids the rest of this file presses with: the two figures, as the importer bound them.
  assert.deepEqual(two.filter((b) => /^score\d$/.test(b.event)).map((b) => Object.keys(b.adjust)[0]), ['f1', 'f3']);
  assert.deepEqual(Object.values(plus.adjust), [1], '+1 moves one figure by exactly one');
  assert.deepEqual(Object.values(two.find((b) => b.event === 'unscore2').adjust), [-1]);
  assert.ok(two.some((b) => b.event === 'final'), 'Full time drawn, Full time offered');
});

test('+1 awards exactly one point with that team\'s flash, a press during the flash too (S1, AC-21)', () => {
  const r = runs.awards;
  const taken = at(r, 'taken');
  scoresAre(taken, ['7', '3', '8', '5'], 'taken');
  flashOnly(taken, 0, 'taken');
  const reef = at(r, '+1 Reef');
  scoresAre(reef, ['7', '3', '9', '5'], '+1 Reef');
  assert.equal(reef.A.flag, 'shown');
  flashOnly(reef, 3, '+1 Reef');
  assert.equal(reef.A.pops['team.flash/3'], 1, 'the flash plays once');
  const again = at(r, '+1 Reef twice more, during its flash');
  scoresAre(again, ['7', '3', '11', '5'], 'two presses during the flash');
  flashOnly(again, 3, 'two presses during the flash');
  assert.equal(again.A.pops['team.flash/3'], 3, 'each press replays its moment: one pop per point');
  flashOnly(at(r, '+1 Marsh'), 1, '+1 Marsh');
  const grove = at(r, '+1 Grove');
  scoresAre(grove, ['8', '3', '11', '6'], '+1 Grove');
  flashOnly(grove, 4, '+1 Grove');
  assert.deepEqual(grove.A.pops, { 'team.flash/3': 3, 'team.flash/1': 1, 'team.flash/4': 1 }, 'one pop per point, each on its own team');
});

test('-1 and a typed figure never award: no point and no pop (S2, AC-21)', () => {
  const r = runs.corrections;
  const dune = at(r, '+1 Dune');
  flashOnly(dune, 2, '+1 Dune');
  const popsAfterPoint = dune.A.pops;
  for (const [label, scores] of [
    ['Marsh typed up while Dune flashes', ['12', '4', '8', '5']],
    ['Dune typed up while it flashes', ['12', '9', '8', '5']],
    ['Grove typed down while Dune flashes', ['12', '9', '8', '2']],
  ]) {
    const x = at(r, label);
    scoresAre(x, scores, label);
    assert.equal(x.A.flag, 'shown', `${label}: no award and no correction of the moment`);
    assert.deepEqual(x.A.pops, popsAfterPoint, `${label}: nothing replays`);
    // Not asserted: which team's flash is lit after a figure TYPED up while a flash is up. Today
    // the flash follows the figure that rose last, data writes included (#1908, item 1).
  }
  const minus = at(r, '-1 Dune');
  scoresAre(minus, ['12', '8', '8', '2'], '-1 Dune');
  assert.equal(minus.A.flag, 'none', 'the correction takes the moment down');
  flashOnly(minus, 0, '-1 Dune');
  for (const label of ['Reef typed up with no flash', '-1 Grove with no flash', 'a resend of every figure']) {
    const x = at(r, label);
    assert.equal(x.A.flag, 'none', `${label}: no award`);
    flashOnly(x, 0, label);
    assert.deepEqual(x.A.pops, popsAfterPoint, `${label}: nothing plays`);
  }
  scoresAre(at(r, 'a resend of every figure'), ['12', '8', '20', '1'], 'a resend');
  const marsh = at(r, '+1 Marsh after the corrections');
  scoresAre(marsh, ['13', '8', '20', '1'], '+1 Marsh');
  flashOnly(marsh, 1, '+1 Marsh after the corrections');
});

test('an event the machine has no arrow for is refused before its payload lands, and the surface greys it (S3, AC-21)', () => {
  const r = runs.illegal;
  const legality = eventLegality(runs.twoClock.js);
  assert.equal(isEventLegal(legality, 'clearFlag', { groups: { flag: 'none', result: 'live' } }), false, 'Clear flash greyed with nothing flashing');
  assert.equal(isEventLegal(legality, 'final', { groups: { flag: 'none', result: 'final' } }), false, 'Full time greyed at full time');
  assert.equal(isEventLegal(legality, 'score1', { groups: { flag: 'shown', result: 'final' } }), true, '+1 is legal wherever the board is');
  assert.equal(isEventLegal(legality, 'unscore2', { groups: { flag: 'none', result: 'live' } }), true, '-1 is legal wherever the board is');
  const taken = at(r, 'taken');
  for (const label of ['Clear flash with nothing flashing, carrying a figure', 'Full time twice, the second carrying a figure', 'an event the machine does not know, carrying a figure']) {
    scoresAre(at(r, label), taken.A.scores, `${label}: the payload never landed`);
    flashOnly(at(r, label), 0, label);
  }
  assert.equal(at(r, 'Full time twice, the second carrying a figure').A.result, 'final');
  const legal = at(r, 'a legal +1 after them');
  scoresAre(legal, ['3', '5'], 'a legal +1');
  flashOnly(legal, 1, 'a legal +1');
});

test('clock rows keep the scores and the flash; score rows, Full time and New game keep the clock (S4, AC-10)', () => {
  const r = runs.clock;
  const started = at(r, 'clock started');
  assert.equal(started.A.clock, 'running');
  const goal = at(r, '+1 FIELD');
  scoresAre(goal, ['3', '5'], '+1 FIELD');
  flashOnly(goal, 1, '+1 FIELD');
  assert.equal(goal.A.clock, 'running', 'a point does not touch the clock');
  const secs = (t) => t.split(':').reduce((a, n) => a * 60 + Number(n), 0);
  assert.equal(secs(at(r, 'two seconds on').A.time) - secs(goal.A.time), 2, 'the clock runs on through a point');
  assert.equal(at(r, '-1 SHORE').A.clock, 'running');
  const point = at(r, '+1 SHORE');
  flashOnly(point, 2, '+1 SHORE');
  for (const label of ['clock paused', 'clock corrected', 'clock restarted']) {
    const x = at(r, label);
    scoresAre(x, ['3', '5'], label);
    assert.equal(x.A.flag, 'shown', `${label}: the flash stays`);
    flashOnly(x, 2, label);
    // Not asserted: that the pop does not play again. Today any state entry, a clock's included,
    // replays every lit pop (#1908, item 3).
  }
  assert.equal(at(r, 'clock corrected').A.time, '40:00');
  assert.equal(at(r, 'clock paused').A.clock, 'stopped');
  const full = at(r, 'Full time');
  assert.equal(full.A.final, true);
  assert.equal(full.A.clock, 'running', 'Full time does not stop the clock: that is the operator\'s Pause');
  scoresAre(full, ['3', '5'], 'Full time');
  const game = at(r, 'New game');
  scoresAre(game, ['0', '0'], 'New game');
  assert.equal(game.A.final, false, 'New game takes the Full time plate down');
  flashOnly(game, 0, 'New game');
  assert.equal(game.A.clock, 'running', 'New game does not reset the clock');
  assert.equal(secs(at(r, 'three seconds into the new game').A.time) - secs(game.A.time), 3);
  assert.ok(secs(game.A.time) > secs('40:00'), 'the clock kept the time it had');
  const reset = at(r, 'clock reset after a point');
  scoresAre(reset, ['0', '1'], 'a clock reset');
  flashOnly(reset, 2, 'a clock reset keeps the flash');
  const out = at(r, 'out');
  scoresAre(out, ['0', '1'], 'Out');
  const again = at(r, 'taken again');
  scoresAre(again, ['0', '1'], 'a Take keeps the figures');
  assert.equal(again.A.flag, 'none', 'a Take starts the board with no moment up');
  flashOnly(again, 0, 'taken again');
});

test('an output that missed the rows and caught up agrees with the one that saw them (S5, AC-21)', () => {
  const r = runs.reconnect;
  const caught = at(r, 'B caught up');
  assert.deepEqual(caught.B.scores, caught.A.scores);
  assert.deepEqual(caught.A.scores, ['8', '6'], 'two points, nine typed, one taken back; one point');
  assert.deepEqual([caught.B.flag, caught.B.result, caught.B.final], [caught.A.flag, caught.A.result, caught.A.final]);
  assert.deepEqual(caught.B.flashes, caught.A.flashes);
  assert.equal(caught.B.time, caught.A.time, 'the clock reads the same second');
  const later = at(r, 'B caught up after a point');
  assert.deepEqual(later.B.scores, later.A.scores);
  flashOnly(later, 2, 'caught up after a point');
  assert.equal(later.B.time, later.A.time);
});

// ── S6: the surface ──────────────────────────────────────────────────────────────────────────

const held = () => {
  let resolve, reject;
  const promise = new Promise((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};
const settle = () => new Promise((resolve) => setImmediate(resolve));
const noneLeft = { skipped: [], superseded: [], pressedAgain: [] };

/** The production page's verbs over a scripted wire and page, the imported board on air.
 *  Only what a live event press reads is scripted; the arithmetic and the payload are the real
 *  `pressSend`, `adjustedValue` and `movedKeys`. */
function surface({ bound = {}, tree = {}, patchOk = true } = {}) {
  const session = createPlayoutSession('p1');
  const log = [];
  const sends = [];
  const notes = [];
  const cue = { id: 'c1', sourceId: 'g-Board', label: 'C1', values: { f1: '2', f3: '5' }, graphic: 'Board' };
  const sender = {
    published: 'slug-1', showId: 'show-1',
    here: () => {}, logSent: () => {}, armSpecFor: () => null, applyHere: () => false, fastEvent: () => false,
    debts: () => ({ landed: () => (shown) => shown, failed: (items, note) => log.push(['owed', note]), owed: () => 0 }),
    outputUsable: () => true, sending: () => {}, owed: () => {}, loggedAt: () => {}, noOutput: () => {},
    note: (n) => typeof n === 'string' && notes.push(n),
  };
  const page = {
    graphics: [{ name: 'Board' }], liveCue: { Board: 'c1' }, aired: { Board: { ...cue.values } },
    liveLayers: [{ graphic: 'Board' }], livePlayoutLayers: [],
    graphicOf: (c) => c.graphic ?? null, cueView: (c) => ({ values: { ...c.values } }), resolvedOf: () => ({}),
    flush: () => Promise.resolve(), boundFields: () => bound, selectionFor: () => ({ status: 'none' }),
    selectionAired: () => ({ landed: () => {}, undo: () => {} }), selectionStale: () => {},
    candidateFields: () => [], airedCandidate: () => null, airedCandidateFields: () => [],
    boundNow: () => ({ ...tree }), boundReady: () => true,
    patchBound: async (writes) => { log.push(['patch', writes.map((w) => `${w.path}=${w.text}`).join(',')]); return patchOk ? undefined : false; },
    writeCue: (id, values) => log.push(['writeCue', id, values]), savedValues: () => undefined,
    writeLive: (id, values) => log.push(['writeLive', id, values]),
  };
  const io = {
    sendControlVerbs: (opts) => { const h = held(); sends.push({ ...opts, answer: h }); return h.promise; },
    verbStale: (e) => e.stale === true, verbAired: () => false, verbsLanded: () => 0, verbsSkipped: () => [], verbSentItems: () => null,
    headsSay: () => null, headsStillOn: async () => [],
    adjustedValue, movedKeys, pressSend,
    nameList: (names) => names.join(' and '), now: () => 1234, mintOid: (n) => `oid-${n}`,
    setTimeout: () => 0, clearTimeout: () => {},
  };
  session.apply((parts) => ({ ...parts, air: { ...parts.air, liveCue: withLiveCue(parts.air.liveCue, 'Board', 'c1'), aired: { Board: { ...cue.values } } } }));
  const verbs = createGraphicVerbs(session, io, () => sender, () => page);
  const view = { selectedCue: cue, selectedGraphic: 'Board', selectedLayerLive: true, selectedPlayoutLive: false, editingCue: cue, editingIsLive: true, airCue: cue };
  const button = (event) => eventButtons(runs.twoClock.js).find((b) => b.event === event);
  return { verbs, view, button, log, sends, notes };
}

test('the board\'s +1 sends one point counted from air, and writes it into the cue only once the event went (S6, AC-21)', async () => {
  const s = surface();
  const pressing = s.verbs.event(s.view, s.button('score1'));
  await settle();
  assert.equal(s.sends.length, 1);
  const msg = s.sends[0].batches[0][0].msg;
  assert.equal(msg.event, 'score1');
  assert.deepEqual({ ...msg.payload }, { f1: '3' }, 'one point, from what air shows');
  assert.equal(s.log.filter(([k]) => k === 'writeLive').length, 0, 'nothing is written before the answer');
  s.sends[0].answer.resolve({ ...noneLeft });
  assert.deepEqual(await pressing, { outcome: 'accepted' });
  assert.deepEqual(s.log.filter(([k]) => k === 'writeLive'), [['writeLive', 'c1', { f1: '3' }]]);
});

test('a +1 whose send failed commits nothing here and says the send failed (S6, AC-21)', async () => {
  const s = surface();
  const pressing = s.verbs.event(s.view, s.button('score1'));
  await settle();
  s.sends[0].answer.reject(new Error('network down'));
  const done = await pressing;
  assert.equal(done.outcome, 'failed');
  assert.match(done.note, /network down/);
  assert.notEqual(done.note, SHARED_NOT_MOVED);
  assert.deepEqual(s.log.filter(([k]) => k === 'writeLive' || k === 'patch'), [], 'no live value and no shared value is written');
});

test('a +1 that went while its shared figure did not move says that, not that the send failed (S6, AC-21)', async () => {
  const s = surface({ bound: { f1: 'match.home' }, tree: { f1: '2' }, patchOk: false });
  const pressing = s.verbs.event(s.view, s.button('score1'));
  await settle();
  const msg = s.sends[0].batches[0][0].msg;
  assert.equal(msg.event, 'score1');
  assert.equal(msg.payload, undefined, 'a bound figure rides the shared data, not the event');
  s.sends[0].answer.resolve({ ...noneLeft });
  assert.deepEqual(await pressing, { outcome: 'failed', note: SHARED_NOT_MOVED });
  assert.deepEqual(s.log.filter(([k]) => k === 'patch'), [['patch', 'match.home=3']], 'one point asked of the shared value, after the event went');
  // The same press refused by the wire writes no shared value at all.
  const refused = surface({ bound: { f1: 'match.home' }, tree: { f1: '2' } });
  const going = refused.verbs.event(refused.view, refused.button('score1'));
  await settle();
  refused.sends[0].answer.reject(new Error('network down'));
  const done = await going;
  assert.equal(done.outcome, 'failed');
  assert.notEqual(done.note, SHARED_NOT_MOVED);
  assert.deepEqual(refused.log.filter(([k]) => k === 'patch'), []);
});
