// This spec iterates the CATALOG, so a design added anywhere under src/templates/ must select it.
// Until 2026-08-08 it was reachable from no template path and ten designs landed with every
// branch gate green; e2e-affected.test.mjs now pins that every catalog importer covers src/templates/.
// covers: src/templates/**
// covers: src/blocks/**, src/export/**

import { bootstrapGraphic, finishIntoNewEditor } from './_create';
import { chooseCategory, pickDesign } from './_browse';
import { test, expect } from '@playwright/test';
import { toApp } from './_bench';

// THE COMPETITION PACK (docs/COMPETITION_PACK.md) — the esports, competition, result and
// reveal graphics.
//
// graphic-types.spec.ts already holds every type to the conformance bar (it parses, it
// validates, its machine is sound, its control events are authored, its fields bind). This
// suite covers what that one cannot: the BEHAVIOUR the pack was built for — every branch and
// its guard, the reset/reuse path, an empty data source, the derived step counts, save/load,
// and the export targets.

const CATEGORIES = ['esports-score', 'matchup', 'results-board', 'reveal'] as const;

/** Mount a template in a hidden iframe (one catalog variant, or any document), and return a handle to drive it. */
const HARNESS = `
  async function mount(tpl) {
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    document.querySelectorAll('.pack-frame').forEach((f) => f.remove());
    const f = document.createElement('iframe');
    f.className = 'pack-frame';
    f.style.cssText = 'position:fixed;left:-4000px;top:0;width:1280px;height:720px;';
    document.body.appendChild(f);
    await new Promise((res) => { f.onload = res; f.srcdoc = composeDocument(tpl); });
    await new Promise((r) => setTimeout(r, 80));
    return { tpl, win: f.contentWindow, doc: f.contentDocument };
  }
  async function boot(id, options) {
    const { variantById } = await import('/src/templates/catalog.ts');
    return mount(variantById(id).create(options || {}));
  }
  // Let a dispatched event's timeline settle (they are all well under 700 ms).
  const settle = () => new Promise((r) => setTimeout(r, 700));
`;

test('the pack ships its four categories, and every design creates and validates', async ({ page }) => {
  test.setTimeout(180_000);
  await toApp(page);
  const report = await page.evaluate(`(async () => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { CATEGORIES } = await import('/src/model/wizard.ts');
    const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const out = { counts: {}, missingCategory: [], problems: [] };
    for (const id of ${JSON.stringify(CATEGORIES)}) {
      const info = CATEGORIES.find((c) => c.id === id);
      if (!info || !info.available) out.missingCategory.push(id);
      const variants = CATALOG[id] ?? [];
      out.counts[id] = variants.length;
      for (const v of variants) {
        const tpl = v.create({});
        const verdict = validateTemplate(tpl);
        if (!verdict.ok) out.problems.push(v.id + ': ' + verdict.errors.map((e) => e.rule).join(','));
        // Every design of the pack is a data block with a machine the runtime can drive.
        const data = parseAnimData(tpl.js);
        if (!data) out.problems.push(v.id + ': no animation data');
        else if (!data.machine) out.problems.push(v.id + ': no machine');
      }
    }
    return out;
  })()`) as { counts: Record<string, number>; missingCategory: string[]; problems: string[] };

  expect(report.problems).toEqual([]);
  expect(report.missingCategory).toEqual([]);
  // Every category carries designs, and every design of every one of them creates, validates and
  // carries a machine - which is the claim. The COUNTS deliberately are not asserted: they moved
  // the moment the (type x family) matrix was filled (docs/KIT_MATRIX_GAPS.md), and a spec that
  // pins today's number fails on catalog growth while catching nothing a missing design would
  // not also trip through `problems`.
  for (const id of CATEGORIES) expect(report.counts[id]).toBeGreaterThan(0);
});

test('the match-up walks neutral -> selected -> locked, and the lock is structural', async ({ page }) => {
  await toApp(page);
  const walk = await page.evaluate(`(async () => {
    ${HARNESS}
    const { win, doc } = await boot('mu01');
    const state = () => win.noacgMachineState().groups.main;
    const winnerOf = () => {
      const el = doc.querySelector('.matchup-win');
      return el ? el.getAttribute('data-side') : null;
    };
    const out = {};
    win.play();
    await settle();
    out.afterPlay = { state: state(), winner: winnerOf() };

    // The pick is DATA: the same event carries either side.
    win.noacgDispatch('select', { f5: 'A' });
    await settle();
    out.selectedA = { state: state(), winner: winnerOf() };

    // Changing the pick is a SELF-transition, not a second state.
    win.noacgDispatch('select', { f5: 'B' });
    await settle();
    out.selectedB = { state: state(), winner: winnerOf() };

    // Clearing goes to its own state and repaints the neutral card.
    win.noacgDispatch('clear');
    await settle();
    out.cleared = { state: state(), winner: winnerOf() };

    win.noacgDispatch('select', { f5: 'A' });
    await settle();
    win.noacgDispatch('lock');
    await settle();
    out.locked = { state: state(), winner: winnerOf(), locked: doc.querySelector('.matchup').classList.contains('matchup-locked') };

    // THE GUARD: no select arrow leaves 'locked', so a late pick is dropped WITH its payload.
    win.noacgDispatch('select', { f5: 'B' });
    await settle();
    out.afterLatePick = { state: state(), winner: winnerOf(), field: doc.getElementById('f5').textContent };
    return out;
  })()`) as Record<string, { state: string; winner: string | null; locked?: boolean; field?: string }>;

  expect(walk.afterPlay.winner).toBe(null);
  expect(walk.selectedA).toMatchObject({ state: 'selected', winner: 'A' });
  expect(walk.selectedB).toMatchObject({ state: 'selected', winner: 'B' });
  expect(walk.cleared).toMatchObject({ state: 'neutral', winner: null });
  expect(walk.locked).toMatchObject({ state: 'locked', winner: 'A', locked: true });
  // The late pick moved nothing — not the pointer, and not the field it carried.
  expect(walk.afterLatePick).toMatchObject({ state: 'locked', winner: 'A', field: 'A' });
});

test('the scorebug runs pre-match -> live -> final, and the pause group is independent', async ({ page }) => {
  await toApp(page);
  const run = await page.evaluate(`(async () => {
    ${HARNESS}
    const { win, doc } = await boot('es01');
    const root = () => doc.querySelector('.esports-score');
    const status = () => doc.querySelector('.esports-score-status').textContent;
    const groups = () => win.noacgMachineState().groups;
    const out = {};
    win.play();
    await settle();
    out.pre = { phase: groups().phase, pause: groups().pause, status: status() };

    win.noacgDispatch('goLive');
    await settle();
    out.live = { phase: groups().phase, status: status(), cls: root().classList.contains('esports-score-live') };

    // A technical pause moves its OWN pointer and leaves the phase alone.
    win.noacgDispatch('pause');
    await settle();
    out.paused = { phase: groups().phase, pause: groups().pause, status: status() };
    win.noacgDispatch('resume');
    await settle();
    out.resumed = { phase: groups().phase, pause: groups().pause, status: status() };

    win.noacgDispatch('final');
    await settle();
    out.final = { phase: groups().phase, status: status(), cls: root().classList.contains('esports-score-final') };

    // The next map of the series: final -> live again.
    win.noacgDispatch('nextMap');
    await settle();
    out.nextMap = { phase: groups().phase, status: status() };

    // Scores are DATA: writing one repaints a number and moves no pointer anywhere.
    win.update(JSON.stringify({ f1: '2' }));
    await settle();
    out.afterScore = { phase: groups().phase, pause: groups().pause, score: doc.getElementById('f1').textContent };

    // Reset is two operations. The VISUAL half first…
    win.noacgSnap(null);
    await settle();
    out.afterSnap = { phase: groups().phase, score: doc.getElementById('f1').textContent };
    // …and a replay clears the marks the last run left.
    win.play();
    await settle();
    out.afterReplay = { phase: groups().phase, status: status(), cls: root().className };
    return out;
  })()`) as Record<string, Record<string, unknown>>;

  expect(run.pre).toMatchObject({ phase: 'pre', pause: 'running', status: 'PRE-MATCH' });
  expect(run.live).toMatchObject({ phase: 'live', status: 'LIVE', cls: true });
  expect(run.paused).toMatchObject({ phase: 'live', pause: 'paused', status: 'PAUSE' });
  expect(run.resumed).toMatchObject({ phase: 'live', pause: 'running', status: 'LIVE' });
  expect(run.final).toMatchObject({ phase: 'final', status: 'FINAL', cls: true });
  expect(run.nextMap).toMatchObject({ phase: 'live', status: 'LIVE' });
  // The score write repainted the digit and moved neither pointer.
  expect(run.afterScore).toMatchObject({ phase: 'live', pause: 'running', score: '2' });
  // Snap resets the visual state; the DATA survives it, because they are two operations.
  expect(run.afterSnap).toMatchObject({ phase: 'pre', score: '2' });
  expect(run.afterReplay).toMatchObject({ phase: 'pre', status: 'PRE-MATCH' });
  expect(String(run.afterReplay.cls)).not.toContain('esports-score-final');
});

test('Pause dims a scorebug body under every entrance it offers, mid-entrance and after a snap (#2275)', async ({ page }) => {
  // Every entrance tweens `.esports-score-body` to opacity 1 and leaves that inline, which beat
  // the design's pause rule when it dimmed the body's opacity, so a technical pause never dimmed
  // the match. The strength read here is what the viewer sees: the body's opacity times any
  // opacity filter on it, so it holds whichever property a design dims with.
  test.setTimeout(120_000);
  await toApp(page);
  const run = await page.evaluate(`(async () => {
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const { variantById } = await import('/src/templates/catalog.ts');
    const cases = [];
    for (const id of ['es01', 'es02', 'es03', 'es04']) {
      for (const presetId of ['comp-impact', 'comp-rise', 'comp-bloom']) cases.push({ id, presetId });
    }
    document.querySelectorAll('.pack-frame').forEach((f) => f.remove());
    const frames = await Promise.all(cases.map(async (c) => {
      const f = document.createElement('iframe');
      f.className = 'pack-frame';
      f.style.cssText = 'position:fixed;left:-4000px;top:0;width:1280px;height:720px;';
      document.body.appendChild(f);
      const tpl = variantById(c.id).create({ animation: { presetId: c.presetId } });
      await new Promise((res) => { f.onload = res; f.srcdoc = composeDocument(tpl); });
      const win = f.contentWindow;
      const body = f.contentDocument.querySelector('.esports-score-body');
      const strength = () => {
        const style = win.getComputedStyle(body);
        const filter = /opacity\\(([\\d.]+)(%?)\\)/.exec(style.filter);
        return Number(style.opacity) * (filter ? Number(filter[1]) / (filter[2] ? 100 : 1) : 1);
      };
      return { key: c.id + ' ' + c.presetId, win, strength };
    }));
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const pauseOf = (win) => win.noacgMachineState().groups.pause;
    await wait(80);
    for (const { win } of frames) win.play();
    await wait(1600);                // the slowest entrance (bloom) lands its body at 1.2 s
    const out = {};
    for (const { key, strength } of frames) out[key] = { played: strength() };
    for (const { win } of frames) win.noacgDispatch('goLive');
    await wait(700);
    for (const { win } of frames) win.noacgDispatch('pause');
    await wait(700);
    for (const { key, win, strength } of frames) out[key].paused = { state: pauseOf(win), strength: strength() };
    for (const { win } of frames) win.noacgDispatch('resume');
    await wait(700);
    for (const { key, strength } of frames) out[key].resumed = strength();
    // Recovery and Back land a state by snap, which runs the entrance to its end at once.
    for (const { win } of frames) win.noacgSnap({ phase: 'live', pause: 'paused' });
    await wait(700);
    for (const { key, strength } of frames) out[key].snapped = strength();
    // A pause pressed while the entrance is still bringing the body in.
    for (const { win } of frames) win.play();
    await wait(150);
    for (const { win } of frames) win.noacgDispatch('pause');
    await wait(1600);
    for (const { key, win, strength } of frames) out[key].early = { state: pauseOf(win), strength: strength() };
    return out;
  })()`) as Record<string, Record<'played' | 'resumed' | 'snapped', number> & Record<'paused' | 'early', { state: string; strength: number }>>;

  expect(Object.keys(run)).toHaveLength(12);
  for (const [key, look] of Object.entries(run)) {
    expect(look.played, `${key}: the body arrives at full strength`).toBe(1);
    expect(look.paused.state, key).toBe('paused');
    expect(look.paused.strength, `${key}: Pause dims the body`).toBeLessThan(0.6);
    expect(look.resumed, `${key}: Resume brings it back`).toBe(1);
    expect(look.snapped, `${key}: a snap to paused dims it too`).toBeLessThan(0.6);
    expect(look.early.state, key).toBe('paused');
    expect(look.early.strength, `${key}: a pause during the entrance holds once it lands`).toBeLessThan(0.6);
  }
});

test('map veto and tabletop initiative reuse parameterized machines with snap recovery', async ({ page }) => {
  await toApp(page);
  const run = await page.evaluate(`(async () => {
    ${HARNESS}
    const veto = await boot('mr04');
    veto.win.play();
    await settle();
    const vetoMarks = () => [...veto.doc.querySelectorAll('.esports-score-row-mark')]
      .map((el) => el.textContent);
    const vetoCurrent = () => veto.doc.querySelector('.esports-score-current')?.getAttribute('data-map') || null;
    const out = {
      vetoDefaults: {
        title: veto.doc.getElementById('f0').textContent,
        rows: vetoMarks(),
      },
    };

    veto.win.noacgDispatch('advance', { f2: '3' });
    await settle();
    out.vetoAdvanced = {
      state: veto.win.noacgMachineState().groups.main,
      row: vetoCurrent(),
    };
    veto.win.noacgDispatch('seriesFinal');
    await settle();
    out.vetoComplete = {
      state: veto.win.noacgMachineState().groups.main,
      cls: veto.doc.querySelector('.esports-score').classList.contains('esports-score-decided'),
    };

    // Recovery is instant: the cursor state repaints from the operator's current-row field.
    veto.win.update(JSON.stringify({ f2: '2' }));
    veto.win.noacgSnap({ main: 'advanced' }, { timers: false });
    out.vetoSnap = {
      state: veto.win.noacgMachineState().groups.main,
      row: vetoCurrent(),
    };

    const turn = await boot('rs04');
    turn.win.play();
    await settle();
    const focused = () => turn.doc.querySelector('.results-board-row-on')?.getAttribute('data-row') || null;
    out.turnDefaults = {
      title: turn.doc.getElementById('f0').textContent,
      encounter: turn.doc.getElementById('f1').textContent,
      names: [...turn.doc.querySelectorAll('.results-board-row-name')].map((el) => el.textContent),
      notes: [...turn.doc.querySelectorAll('.results-board-row-note')].map((el) => el.textContent),
    };

    turn.win.noacgDispatch('spotlight', { f3: '3' });
    await settle();
    out.turnMoved = {
      state: turn.win.noacgMachineState().groups.main,
      row: focused(),
    };
    turn.win.update(JSON.stringify({ f3: '4' }));
    turn.win.noacgSnap({ main: 'spotlight' }, { timers: false });
    out.turnSnap = {
      state: turn.win.noacgMachineState().groups.main,
      row: focused(),
    };
    turn.win.noacgDispatch('clear');
    await settle();
    out.turnCleared = {
      state: turn.win.noacgMachineState().groups.main,
      row: focused(),
    };
    return out;
  })()`) as Record<string, Record<string, unknown>>;

  expect(run.vetoDefaults).toMatchObject({
    title: 'MAP VETO - GRAND FINAL',
    rows: [
      'BAN - TEAM LIQUID',
      'BAN - NATUS VINCERE',
      'PICK - TEAM LIQUID',
      'PICK - NATUS VINCERE',
      'PENDING',
    ],
  });
  expect(run.vetoAdvanced).toMatchObject({ state: 'advanced', row: '3' });
  expect(run.vetoComplete).toMatchObject({ state: 'decided', cls: true });
  expect(run.vetoSnap).toMatchObject({ state: 'advanced', row: '2' });
  expect(run.turnDefaults).toMatchObject({
    title: 'INITIATIVE ORDER',
    encounter: 'THE SUNKEN CITADEL - LOWER VAULT',
    names: [
      'SERAPHINA MOONWHISPER',
      'CAPTAIN ALDRIC VON STURM',
      'ANCIENT CRIMSON OWLBEAR',
      'THANE IRONHEART',
    ],
    notes: ['18 HP', 'CONCENTRATING', 'BLOODIED', 'DODGING'],
  });
  expect(run.turnMoved).toMatchObject({ state: 'spotlight', row: '3' });
  expect(run.turnSnap).toMatchObject({ state: 'spotlight', row: '4' });
  expect(run.turnCleared).toMatchObject({ state: 'level', row: null });
});

test('the verdict card is ONE judged state carrying either ruling', async ({ page }) => {
  await toApp(page);
  const run = await page.evaluate(`(async () => {
    ${HARNESS}
    const { win, doc } = await boot('vd01');
    const root = () => doc.querySelector('.reveal');
    const mark = () => doc.querySelector('.reveal-mark').textContent;
    const out = {};
    win.play();
    await settle();
    out.unjudged = { state: win.noacgMachineState().groups.main, mark: mark() };

    win.noacgDispatch('judge', { f3: 'correct' });
    await settle();
    out.correct = { state: win.noacgMachineState().groups.main, mark: mark(), cls: root().classList.contains('reveal-correct') };

    // A correction: the same state, the other value.
    win.noacgDispatch('judge', { f3: 'incorrect' });
    await settle();
    out.incorrect = {
      state: win.noacgMachineState().groups.main,
      mark: mark(),
      correctCls: root().classList.contains('reveal-correct'),
      incorrectCls: root().classList.contains('reveal-incorrect'),
    };

    win.noacgDispatch('clear');
    await settle();
    out.cleared = { state: win.noacgMachineState().groups.main, mark: mark(), cls: root().className };
    return out;
  })()`) as Record<string, Record<string, unknown>>;

  expect(run.unjudged).toMatchObject({ mark: '' });
  expect(run.correct).toMatchObject({ state: 'judged', mark: '✓', cls: true });
  expect(run.incorrect).toMatchObject({ state: 'judged', mark: '✕', correctCls: false, incorrectCls: true });
  expect(run.cleared).toMatchObject({ state: 'unjudged', mark: '' });
  expect(String(run.cleared.cls)).not.toContain('reveal-incorrect');
});

test('the nominee reveal holds for suspense and then names the winner from its field', async ({ page }) => {
  await toApp(page);
  const run = await page.evaluate(`(async () => {
    ${HARNESS}
    const { tpl, win, doc } = await boot('nm01');
    const wonName = () => {
      const el = doc.querySelector('.reveal-won .reveal-nominee-name');
      return el ? el.textContent : null;
    };
    const out = { steps: tpl.settings.steps };
    win.play();
    await settle();
    out.nominees = doc.querySelectorAll('.reveal-nominee').length;

    win.noacgDispatch('suspense');
    await settle();
    out.suspense = doc.querySelector('.reveal').classList.contains('reveal-suspense');

    // The winner is DATA — the reveal carries whichever nominee the field names.
    win.noacgDispatch('reveal', { f3: '3' });
    await settle();
    out.revealed = { won: wonName(), out: doc.querySelectorAll('.reveal-out').length };

    // A replay starts from the nominees again: the reveal's marks AND its inline styles go.
    win.play();
    await settle();
    out.afterReplay = { won: wonName(), revealed: doc.querySelector('.reveal').classList.contains('reveal-revealed') };
    return out;
  })()`) as { steps: string; nominees: number; suspense: boolean; revealed: { won: string; out: number }; afterReplay: { won: string | null; revealed: boolean } };

  // In + Reveal + Out is three steps, so SPX gets two presses — DERIVED, never hard-coded.
  expect(run.steps).toBe('2');
  expect(run.nominees).toBe(4);
  expect(run.suspense).toBe(true);
  expect(run.revealed.won).toBe('M0NESY');
  expect(run.revealed.out).toBe(3);
  expect(run.afterReplay).toMatchObject({ won: null, revealed: false });
});

test('next() alone still walks a reveal card end to end (the playout-server contract)', async ({ page }) => {
  await toApp(page);
  const walk = await page.evaluate(`(async () => {
    ${HARNESS}
    const { win, doc } = await boot('wn01');
    const shown = () => doc.querySelector('.reveal').classList.contains('reveal-result-shown');
    win.play();
    await settle();
    const before = shown();
    const first = win.next();
    await settle();
    const after = shown();
    win.stop();
    await settle();
    return { before, after, advanced: first !== null, opacity: doc.querySelector('.reveal').style.opacity };
  })()`) as { before: boolean; after: boolean; advanced: boolean; opacity: string };

  expect(walk.before).toBe(false);
  expect(walk.advanced).toBe(true);
  expect(walk.after).toBe(true);
  expect(walk.opacity).toBe('0'); // stop() takes it fully off air, ready to play again
});

test('the boards spotlight a row from data, and a decided table survives a replay clean', async ({ page }) => {
  await toApp(page);
  const run = await page.evaluate(`(async () => {
    ${HARNESS}
    const { win, doc } = await boot('st01');
    const lit = () => {
      const el = doc.querySelector('.results-board-row-on');
      return el ? el.getAttribute('data-row') : null;
    };
    const out = {};
    win.play();
    await settle();
    out.rows = doc.querySelectorAll('.results-board-row').length;
    out.columns = doc.querySelectorAll('.results-board-col').length;

    win.noacgDispatch('highlight', { f4: '2' });
    await settle();
    out.highlighted = { state: win.noacgMachineState().groups.main, row: lit() };

    // Moving the highlight is the same state with a new number.
    win.noacgDispatch('highlight', { f4: '4' });
    await settle();
    out.moved = { state: win.noacgMachineState().groups.main, row: lit() };

    win.noacgDispatch('final');
    await settle();
    out.final = { state: win.noacgMachineState().groups.main, cls: doc.querySelector('.results-board').classList.contains('results-board-final'), row: lit() };

    // A SNAP (Back, Reset) lands on the state's own look, never on a mark the last one left: the
    // marks are classes, which the snap's reset of inline styles does not touch (#2181).
    win.noacgSnap({ main: 'enter' });
    await settle();
    out.snappedBack = { state: win.noacgMachineState().groups.main, cls: doc.querySelector('.results-board').className, row: lit() };
    win.noacgSnap({ main: 'highlighted' });
    await settle();
    out.snappedLit = { row: lit() };
    // An update rebuilds the rows; the highlighted one stays lit, on the row the field names now.
    win.update(JSON.stringify({ f4: '3' }));
    await settle();
    out.updatedLit = { row: lit() };
    // A number past the end of the table lights its last row rather than nothing.
    win.update(JSON.stringify({ f4: '9' }));
    await settle();
    out.clampedLit = { row: lit() };
    win.noacgSnap({ main: 'final' });
    await settle();
    out.snappedFinal = { cls: doc.querySelector('.results-board').classList.contains('results-board-final'), row: lit() };

    win.play();
    await settle();
    out.afterReplay = { row: lit(), cls: doc.querySelector('.results-board').className };
    return out;
  })()`) as Record<string, Record<string, unknown> | number>;

  expect(run.rows).toBe(5);
  expect(run.columns).toBe(4);
  expect(run.highlighted).toMatchObject({ state: 'highlighted', row: '2' });
  expect(run.moved).toMatchObject({ state: 'highlighted', row: '4' });
  expect(run.final).toMatchObject({ state: 'final', cls: true, row: null });
  expect(run.snappedBack).toMatchObject({ state: 'enter', row: null });
  expect(String((run.snappedBack as Record<string, unknown>).cls)).not.toContain('results-board-final');
  expect(run.snappedLit).toMatchObject({ row: '4' });
  expect(run.updatedLit).toMatchObject({ row: '3' });
  expect(run.clampedLit).toMatchObject({ row: '5' });
  expect(run.snappedFinal).toMatchObject({ cls: true, row: null });
  expect((run.afterReplay as Record<string, unknown>).row).toBe(null);
  expect(String((run.afterReplay as Record<string, unknown>).cls)).not.toContain('results-board-final');
});

test('Focus row lights a row on its first press, and Back levels the line-up (#2200)', async ({ page }) => {
  // The roster's Focus row press used to do nothing on air until a row number was typed: its
  // field started at 0, which names no row. It now starts at 1, and a number naming no row
  // lights the row at that end of the line-up, so the press always shows.
  await toApp(page);
  const run = await page.evaluate(`(async () => {
    ${HARNESS}
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { win, doc, tpl } = await boot('rs01');
    const lit = () => {
      const el = doc.querySelector('.results-board-row-on');
      return el ? el.getAttribute('data-row') : null;
    };
    const spotlit = () => doc.querySelector('.results-board').classList.contains('results-board-spotlit');
    const out = {};
    win.play();
    await settle();
    // The first press, with the field as the design ships it.
    win.noacgDispatch('spotlight');
    await settle();
    out.firstPress = { state: win.noacgMachineState().groups.main, row: lit(), spotlit: spotlit() };
    // A number naming no row lights the row at that end.
    win.noacgDispatch('spotlight', { f3: '9' });
    await settle();
    out.past = { row: lit() };
    win.noacgDispatch('spotlight', { f3: '0' });
    await settle();
    out.below = { row: lit() };
    // An update while a row is lit (a new note, a new number) keeps a row lit.
    win.update(JSON.stringify({ f2: 'A | ONE\\nB | TWO\\nC | THREE', f3: '2' }));
    await settle();
    out.updated = { row: lit(), spotlit: spotlit() };
    // « Back from the spotlight snaps to the first step, which levels the line-up, as the
    // Show all rows press does where there is no Back.
    const { backTarget } = await import('/src/control/controlModel.ts');
    out.backTarget = backTarget(tpl.js, { groups: { main: 'spotlight' } });
    win.noacgSnap(out.backTarget);
    await settle();
    out.back = { state: win.noacgMachineState().groups.main, row: lit(), spotlit: spotlit() };
    // An update to a level line-up lights nothing: only a spotlight lights a row.
    win.update(JSON.stringify({ f3: '3' }));
    await settle();
    out.levelUpdate = { row: lit(), spotlit: spotlit() };
    // Every roster design: the shipped field names a row, and Show all rows stays for the
    // playout environments that have no Back or Reset.
    out.designs = {};
    for (const v of CATALOG['results-board'].filter((d) => /^rs\\d/.test(d.id))) {
      const tpl = v.create({});
      const holder = new DOMParser().parseFromString(tpl.html, 'text/html').getElementById('f3');
      const machine = parseAnimData(tpl.js).machine;
      out.designs[v.id] = {
        field: Number(holder && holder.textContent) >= 1,
        controls: (machine.controls || []).map((c) => c.event),
      };
    }
    return out;
  })()`) as Record<string, Record<string, unknown>>;

  expect(run.firstPress, 'the first Focus row press lights row 1').toEqual({ state: 'spotlight', row: '1', spotlit: true });
  expect(run.past).toEqual({ row: '5' });
  expect(run.below).toEqual({ row: '1' });
  expect(run.updated, 'an update keeps the spotlit row lit').toEqual({ row: '2', spotlit: true });
  expect(run.backTarget, 'Back from a lit row goes to the first step').toEqual({ main: 'enter' });
  expect(run.back).toEqual({ state: 'enter', row: null, spotlit: false });
  expect(run.levelUpdate, 'an update never starts a spotlight').toEqual({ row: null, spotlit: false });
  expect(Object.keys(run.designs).sort()).toEqual(['rs01', 'rs02', 'rs03', 'rs04', 'rs05']);
  for (const [id, design] of Object.entries(run.designs)) {
    expect(design, id).toEqual({ field: true, controls: ['spotlight', 'clear'] });
  }
});

test('Focus competitor and Spotlight light a row on their first press on every tower and podium board (#2268)', async ({ page }) => {
  // The timing tower's Focus competitor and the podium board's Spotlight did nothing on air until
  // a number was typed: their fields started at 0, which names no row. They now start at 1, and a
  // number naming no row lights the row at that end, as the roster's Focus row does (#2200).
  test.setTimeout(120_000);
  await toApp(page);
  const run = await page.evaluate(`(async () => {
    ${HARNESS}
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { backTarget } = await import('/src/control/controlModel.ts');
    const controls = (tpl) => (parseAnimData(tpl.js).machine.controls || []).map((c) => c.event);
    const out = { towers: {}, podiums: {} };

    for (const id of ['tt01', 'tt02', 'tt03', 'tt04']) {
      const { win, doc, tpl } = await boot(id);
      const lit = () => {
        const on = doc.querySelectorAll('.results-board-row-on');
        return on.length === 1 ? on[0].getAttribute('data-row') : on.length === 0 ? null : 'many';
      };
      const spotlit = () => doc.querySelector('.results-board').classList.contains('results-board-spotlit');
      win.play();
      await settle();
      const rows = String(doc.querySelectorAll('.results-board-row').length);
      // The first press, with the field as the design ships it.
      win.noacgDispatch('focus');
      await settle();
      const first = { state: win.noacgMachineState().groups.main, row: lit(), spotlit: spotlit() };
      // A number naming no row lights the row at that end.
      win.noacgDispatch('focus', { f3: '99' });
      await settle();
      const past = lit() === rows;
      win.noacgDispatch('focus', { f3: '0' });
      await settle();
      const below = lit();
      win.noacgDispatch('focus', { f3: '' });
      await settle();
      const blank = lit();
      // A timing update while a row is in focus keeps the named row lit, held to the new order.
      win.update(JSON.stringify({ f2: 'AAA +0.000\\nBBB +1.000\\nCCC +2.000', f3: '2' }));
      await settle();
      const updated = lit();
      win.update(JSON.stringify({ f2: 'AAA +0.000' }));
      await settle();
      const shrunk = lit();
      // Back from a focused row snaps to the first step, which levels the tower, as Whole field
      // does where there is no Back; then Back re-sends the cue's values.
      const back = { target: backTarget(tpl.js, win.noacgMachineState()) };
      win.noacgSnap(back.target);
      await settle();
      win.update(JSON.stringify({ f2: 'AAA +0.000\\nBBB +1.000', f3: '2' }));
      await settle();
      Object.assign(back, { state: win.noacgMachineState().groups.main, row: lit(), spotlit: spotlit() });
      // Focus pressed before the order is typed lights the named row when the order arrives.
      win.update(JSON.stringify({ f2: '' }));
      await settle();
      win.noacgDispatch('focus', { f3: '2' });
      await settle();
      win.update(JSON.stringify({ f2: 'AAA +0.000\\nBBB +1.000\\nCCC +2.000' }));
      await settle();
      const arrived = lit();
      // Whole field levels it, and an update to a level tower lights nothing.
      win.noacgDispatch('focus');
      await settle();
      win.noacgDispatch('clear');
      await settle();
      win.update(JSON.stringify({ f2: 'AAA +0.000\\nBBB +1.000', f3: '2' }));
      await settle();
      const level = { state: win.noacgMachineState().groups.main, row: lit(), spotlit: spotlit() };
      out.towers[id] = { first, past, below, blank, updated, shrunk, back, arrived, level, controls: controls(tpl) };
    }

    for (const id of ['sb21', 'sb22']) {
      const { win, doc, tpl } = await boot(id);
      const lit = () => {
        const spot = [1, 2, 3, 4].filter((i) => doc.querySelector('.scoreboard-podium-' + i).classList.contains('scoreboard-podium-spot'));
        const dim = [1, 2, 3, 4].filter((i) => doc.querySelector('.scoreboard-podium-' + i).classList.contains('scoreboard-podium-dim'));
        return spot.join(',') + '/' + dim.join(',');
      };
      win.play();
      await settle();
      win.noacgDispatch('spotlight');
      await settle();
      const first = { state: win.noacgMachineState().groups.main, podiums: lit() };
      win.noacgDispatch('spotlight', { f9: '9' });
      await settle();
      const past = lit();
      win.noacgDispatch('spotlight', { f9: '0' });
      await settle();
      const below = lit();
      win.noacgDispatch('spotlight', { f9: '' });
      await settle();
      const blank = lit();
      // A spotlit podium whose contestant is cleared hands the light to the nearest one before it,
      // and the first podium's to the first podium that still has a contestant.
      win.noacgDispatch('spotlight', { f9: '4' });
      await settle();
      win.update(JSON.stringify({ f7: '' }));
      await settle();
      const collapsed = lit();
      win.update(JSON.stringify({ f7: 'SAM', f1: '', f9: '1' }));
      await settle();
      const firstCollapsed = lit();
      // With no contestant at all nothing lights and nothing dims.
      win.update(JSON.stringify({ f1: '', f3: '', f5: '', f7: '' }));
      await settle();
      const empty = lit();
      win.update(JSON.stringify({ f1: 'MAYA', f3: 'JONAS', f5: 'PRIYA', f7: 'SAM' }));
      await settle();
      // Back from a lit podium snaps to the first step and re-sends the cue's values: level.
      const back = { target: backTarget(tpl.js, win.noacgMachineState()) };
      win.noacgSnap(back.target);
      await settle();
      win.update(JSON.stringify({ f9: '2' }));
      await settle();
      Object.assign(back, { state: win.noacgMachineState().groups.main, podiums: lit() });
      // All level levels it, and an update to a level board lights nothing.
      win.noacgDispatch('spotlight');
      await settle();
      win.noacgDispatch('clear');
      await settle();
      win.update(JSON.stringify({ f9: '3' }));
      await settle();
      const level = { state: win.noacgMachineState().groups.main, podiums: lit() };
      out.podiums[id] = { first, past, below, blank, collapsed, firstCollapsed, empty, back, level, controls: controls(tpl) };
    }
    return out;
  })()`) as { towers: Record<string, Record<string, unknown>>; podiums: Record<string, Record<string, unknown>> };

  expect(Object.keys(run.towers)).toEqual(['tt01', 'tt02', 'tt03', 'tt04']);
  for (const [id, tower] of Object.entries(run.towers)) {
    expect(tower.first, `${id}: the first Focus competitor press lights row 1`).toEqual({ state: 'focused', row: '1', spotlit: true });
    expect(tower, id).toMatchObject({ past: true, below: '1', blank: '1', updated: '2', shrunk: '1', arrived: '2' });
    expect(tower.back, `${id}: Back from a focused row levels the tower`).toEqual({ target: { main: 'enter' }, state: 'enter', row: null, spotlit: false });
    expect(tower.level, `${id}: an update never starts a focus`).toEqual({ state: 'level', row: null, spotlit: false });
    // Whole field stays for the playout environments that have no Back or Reset.
    expect(tower.controls, id).toEqual(['focus', 'clear', 'final', 'provisional']);
  }
  expect(Object.keys(run.podiums)).toEqual(['sb21', 'sb22']);
  for (const [id, podium] of Object.entries(run.podiums)) {
    expect(podium.first, `${id}: the first Spotlight press lights podium 1`).toEqual({ state: 'spotlight', podiums: '1/2,3,4' });
    expect(podium, id).toMatchObject({ past: '4/1,2,3', below: '1/2,3,4', blank: '1/2,3,4', collapsed: '3/1,2,4', firstCollapsed: '2/1,3,4', empty: '/' });
    expect(podium.back, `${id}: Back from a lit podium levels the board`).toEqual({ target: { main: 'enter' }, state: 'enter', podiums: '/' });
    expect(podium.level, id).toEqual({ state: 'level', podiums: '/' });
    expect(podium.controls, id).toEqual(['spotlight', 'clear', 'final']);
  }
});

test('Focus row and Highlight row pressed on an empty list light the named row when the rows arrive (#2271)', async ({ page }) => {
  // The roster's and standings board's press with no rows typed yet left the board level, so
  // the rows a later update brought in were never lit while the machine said one was. The board
  // is now in focus even with no rows (its CSS dims rows only), as the timing tower is (#2268).
  test.setTimeout(120_000);
  await toApp(page);
  const run = await page.evaluate(`(async () => {
    ${HARNESS}
    const roster = 'ANNA | ONE\\nBEN | TWO\\nCARA | THREE';
    const table = 'ANNA | 3 | 0 | +9 | 9\\nBEN | 2 | 1 | +2 | 6\\nCARA | 0 | 3 | -11 | 0';
    const cases = [
      ...['rs01', 'rs02', 'rs03', 'rs04', 'rs05'].map((id) => ({ id, event: 'spotlight', field: 'f3', rows: roster })),
      ...['st01', 'st02', 'st03', 'st04'].map((id) => ({ id, event: 'highlight', field: 'f4', rows: table })),
    ];
    const out = {};
    for (const c of cases) {
      let { win, doc } = await boot(c.id);
      const look = () => {
        const on = doc.querySelectorAll('.results-board-row-on');
        return {
          state: win.noacgMachineState().groups.main,
          rows: doc.querySelectorAll('.results-board-row').length,
          row: on.length === 1 ? on[0].getAttribute('data-row') : on.length === 0 ? null : 'many',
          spotlit: doc.querySelector('.results-board').classList.contains('results-board-spotlit'),
        };
      };
      // What an empty board in focus shows: only rows are dimmed, so the panel looks level.
      const frame = () => ['.results-board-box', '.results-board-head'].map((s) => win.getComputedStyle(doc.querySelector(s)).opacity).join(',');
      win.play();
      await settle();
      win.update(JSON.stringify({ f2: '' }));
      await settle();
      const levelFrame = frame();
      win.noacgDispatch(c.event, { [c.field]: '2' });
      await settle();
      const empty = Object.assign(look(), { frameUnchanged: frame() === levelFrame });
      win.update(JSON.stringify({ f2: c.rows }));
      await settle();
      const arrived = look();
      // The rows out of focus fall back as on any focused board.
      const dim = Array.from(doc.querySelectorAll('.results-board-row:not(.results-board-row-on)')).map((el) => Number(win.getComputedStyle(el).opacity));
      // A recovery into focus on a freshly loaded board whose list is empty, then the rows arrive.
      ({ win, doc } = await boot(c.id));
      win.update(JSON.stringify({ f2: '', [c.field]: '2' }));
      win.noacgSnap({ main: empty.state });
      await settle();
      win.update(JSON.stringify({ f2: c.rows }));
      await settle();
      out[c.id] = { event: c.event, empty, arrived, dimmed: dim.length > 0 && dim.every((o) => o < 1), recovered: look() };
    }
    return out;
  })()`) as Record<string, { event: string; empty: Record<string, unknown>; arrived: Record<string, unknown>; dimmed: boolean; recovered: Record<string, unknown> }>;

  expect(Object.keys(run)).toEqual(['rs01', 'rs02', 'rs03', 'rs04', 'rs05', 'st01', 'st02', 'st03', 'st04']);
  for (const [id, board] of Object.entries(run)) {
    const state = board.event === 'spotlight' ? 'spotlight' : 'highlighted';
    expect(board.empty, `${id}: a press on an empty list puts the board in focus, and the panel stays level`).toEqual({ state, rows: 0, row: null, spotlit: true, frameUnchanged: true });
    expect(board.arrived, `${id}: the rows that arrive light the named one`).toEqual({ state, rows: 3, row: '2', spotlit: true });
    expect(board.dimmed, `${id}: the rest fall back`).toBe(true);
    expect(board.recovered, `${id}: a recovery into focus on an empty list lights the rows that arrive`).toEqual({ state, rows: 3, row: '2', spotlit: true });
  }
});

test('the rows a board dims look dimmed once the entrance has landed, and after a snap (#2272)', async ({ page }) => {
  // The row cascade tweened every row to opacity 1 and left that inline, which beats a design's
  // dim rule (`.results-board-spotlit .results-board-row { opacity: 0.45 }`), so the rows out of
  // focus stayed at full strength. It now lands each row on its own CSS opacity and hands the
  // row back to the stylesheet. The brackets and map ladders dim their rows the same way.
  test.setTimeout(120_000);
  await toApp(page);
  const run = await page.evaluate(`(async () => {
    ${HARNESS}
    const B = 'results-board';
    const E = 'esports-score';
    const board = (ids, event, state, payload) => ids.map((id) => ({
      id, event, state, payload, dim: '.' + B + '-row:not(.' + B + '-row-on)', lit: '.' + B + '-row-on',
    }));
    const cases = [
      ...board(['rs01', 'rs02', 'rs03', 'rs05'], 'spotlight', 'spotlight', { f3: '2' }),
      ...board(['st01', 'st02', 'st03', 'st04'], 'highlight', 'highlighted', { f4: '2' }),
      ...board(['tt01', 'tt02', 'tt03', 'tt04'], 'focus', 'focused', { f3: '2' }),
      ...['br01', 'br02', 'br03', 'br04'].map((id) => ({
        id, event: 'crown', state: 'crowned', dim: '.' + B + '-round:not(:last-child)', lit: '.' + B + '-round:last-child',
      })),
      // A map still to play rests dimmed under the cursor's full-strength row; Complete drops
      // every unplayed map further back, and the won ones hold.
      ...['mr01', 'mr02', 'mr03', 'mr05'].map((id) => ({
        id, event: 'seriesFinal', state: 'decided', rest: '.' + E + '-open:not(.' + E + '-current)',
        dim: '.' + E + '-open', lit: '.' + E + '-won-a, .' + E + '-won-b',
      })),
    ];
    // Every design in its own frame at once, so the waits below are paid once, not twenty times.
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const { variantById } = await import('/src/templates/catalog.ts');
    document.querySelectorAll('.pack-frame').forEach((f) => f.remove());
    const frames = await Promise.all(cases.map(async (c) => {
      const f = document.createElement('iframe');
      f.className = 'pack-frame';
      f.style.cssText = 'position:fixed;left:-4000px;top:0;width:1280px;height:720px;';
      document.body.appendChild(f);
      await new Promise((res) => { f.onload = res; f.srcdoc = composeDocument(variantById(c.id).create({})); });
      const win = f.contentWindow;
      const doc = f.contentDocument;
      const read = (sel) => Array.from(doc.querySelectorAll(sel)).map((el) => Number(win.getComputedStyle(el).opacity));
      const inline = () => Array.from(doc.querySelectorAll('.' + B + '-body > *, .' + E + '-body > *')).filter((el) => el.style.opacity !== '').length;
      return { c, win, read, inline };
    }));
    await new Promise((r) => setTimeout(r, 80));
    for (const { win } of frames) win.play();
    // The whole entrance, cascade included, before anything is pressed. A row that rests dimmed
    // arrives dimmed: its peak on the way in is sampled, so a rise to 1 and a drop back fails.
    const peak = {};
    for (const started = Date.now(); Date.now() - started < 2500;) {
      for (const { c, read } of frames) if (c.rest) peak[c.id] = Math.max(peak[c.id] || 0, ...read(c.rest));
      await new Promise((r) => setTimeout(r, 30));
    }
    const out = {};
    for (const { c, read, inline } of frames) {
      out[c.id] = { rest: { dim: c.rest ? read(c.rest) : null, peak: c.rest ? peak[c.id] : null, inline: inline() } };
    }
    for (const { c, win } of frames) win.noacgDispatch(c.event, c.payload);
    await settle();
    for (const { c, win, read, inline } of frames) {
      out[c.id].pressed = { state: win.noacgMachineState().groups.main, dim: read(c.dim), lit: read(c.lit), inline: inline() };
    }
    // Recovery and Back land a state by snap, which runs the entrance to its end at once.
    for (const { c, win } of frames) win.noacgSnap({ main: c.state });
    await settle();
    for (const { c, read, inline } of frames) out[c.id].snapped = { dim: read(c.dim), lit: read(c.lit), inline: inline() };
    return out;
  })()`) as Record<string, {
    rest: { dim: number[] | null; peak: number | null; inline: number };
    pressed: { state: string; dim: number[]; lit: number[]; inline: number };
    snapped: { dim: number[]; lit: number[]; inline: number };
  }>;

  expect(Object.keys(run)).toHaveLength(20);
  for (const [id, design] of Object.entries(run)) {
    expect(design.rest.inline, `${id}: the entrance leaves no inline opacity on a row`).toBe(0);
    if (design.rest.dim) {
      expect(design.rest.dim.length, id).toBeGreaterThan(0);
      for (const o of design.rest.dim) expect(o, `${id}: a map still to play rests dimmed`).toBeLessThan(0.6);
      expect(design.rest.peak, `${id}: and arrives dimmed, never lit first`).toBeLessThanOrEqual(Math.max(...design.rest.dim) + 0.01);
    }
    for (const phase of ['pressed', 'snapped'] as const) {
      const look = design[phase];
      expect(look.inline, `${id} ${phase}: no inline opacity on a row`).toBe(0);
      expect(look.dim.length, `${id} ${phase}: rows to dim`).toBeGreaterThan(0);
      for (const o of look.dim) expect(o, `${id} ${phase}: a row out of focus looks dimmed`).toBeLessThan(0.6);
      expect(look.lit.length, `${id} ${phase}: a row in focus`).toBeGreaterThan(0);
      for (const o of look.lit) expect(o, `${id} ${phase}: the row in focus stays at full strength`).toBe(1);
    }
  }
});

test('a data write after the reveal keeps the winner lit on every nominee card (#2266)', async ({ page }) => {
  // The nominee rows carry the reveal's marks, and every update() rebuilds those rows. Nothing
  // marked them again, so an edit to the list after the reveal, or the trailing update of a
  // recovery (update, snap, update), left the card revealed with no nominee lit.
  test.setTimeout(120_000);
  await toApp(page);
  const run = await page.evaluate(`(async () => {
    ${HARNESS}
    const out = {};
    for (const id of ['nm01', 'nm02', 'nm03', 'nm04']) {
      let { win, doc } = await boot(id);
      const look = () => {
        const won = Array.from(doc.querySelectorAll('.reveal-won .reveal-nominee-name')).map((el) => el.textContent);
        return { won: won.join(','), out: doc.querySelectorAll('.reveal-out').length, revealed: doc.querySelector('.reveal').classList.contains('reveal-revealed') };
      };
      win.play();
      await settle();
      const third = doc.querySelectorAll('.reveal-nominee-name')[2].textContent;
      win.noacgDispatch('reveal', { f3: '3' });
      await settle();
      const revealed = Object.assign(look(), { third });
      const state = win.noacgMachineState().groups;
      // An edit to the nominee list after the reveal.
      win.update(JSON.stringify({ f2: 'ANNA | ONE\\nBEN | TWO\\nCARA | THREE\\nDEV | FOUR\\nEVE | FIVE' }));
      await settle();
      const edited = look();
      // The winner field changed on air: the nominee it names now is lit.
      win.update(JSON.stringify({ f3: '5' }));
      await settle();
      const moved = look();
      // A recovery, as the hosted receiver's boot runs it on a freshly loaded graphic: the data,
      // the pose, then the data again.
      const data = { f2: 'ANNA | ONE\\nBEN | TWO\\nCARA | THREE', f3: '2' };
      ({ win, doc } = await boot(id));
      win.update(JSON.stringify(data));
      win.noacgSnap(state);
      win.update(JSON.stringify(data));
      await settle();
      const recovered = look();
      // Back to the nominees levels the card, and an update there lights nothing.
      win.noacgSnap({ main: 'enter' });
      await settle();
      win.update(JSON.stringify(data));
      await settle();
      const back = Object.assign(look(), { state: win.noacgMachineState().groups.main });
      out[id] = { revealed, edited, moved, recovered, back };
    }
    return out;
  })()`) as Record<string, Record<string, { won: string; out: number; revealed: boolean; state?: string; third?: string }>>;

  expect(Object.keys(run)).toEqual(['nm01', 'nm02', 'nm03', 'nm04']);
  for (const [id, card] of Object.entries(run)) {
    expect(card.revealed.third, id).toBeTruthy();
    expect(card.revealed, `${id}: the reveal lights the third nominee`).toEqual({ won: card.revealed.third, out: 3, revealed: true, third: card.revealed.third });
    expect(card.edited, `${id}: an edit to the list keeps the named nominee lit`).toEqual({ won: 'CARA', out: 4, revealed: true });
    expect(card.moved, `${id}: a new winner number lights that nominee`).toEqual({ won: 'EVE', out: 4, revealed: true });
    expect(card.recovered, `${id}: a recovery into the reveal shows the winner`).toEqual({ won: 'BEN', out: 2, revealed: true });
    expect(card.back, `${id}: an update to the nominees lights nothing`).toEqual({ won: '', out: 0, revealed: false, state: 'enter' });
  }
});

test('Reset lands a winner card on its first step with nothing its result painted (#2181)', async ({ page }) => {
  // ⟲ Reset is a snap to the first step. A winner card's marks are classes, which a snap's reset
  // of inline styles never touches, so the pack clears them on that snap, as play() does.
  await toApp(page);
  const run = await page.evaluate(`(async () => {
    ${HARNESS}
    const { win, doc } = await boot('wn01');
    const marks = () => {
      const cls = doc.querySelector('.reveal').classList;
      return { result: cls.contains('reveal-result-shown'), celebrating: cls.contains('reveal-celebrating') };
    };
    win.play();
    await settle();
    win.next();
    await settle();
    win.noacgDispatch('celebrate');
    await settle();
    const before = marks();
    win.noacgSnap({ main: 'enter' });
    await settle();
    const reset = { state: win.noacgMachineState().groups.main, ...marks() };
    // A late call that lands after the Reset (the same frame as a press) leaves a mark at the
    // first step; Reset pressed again, in place, clears it.
    win.markCelebration();
    win.noacgSnap({ main: 'enter' });
    await settle();
    return { before, reset, again: marks() };
  })()`) as Record<string, Record<string, unknown>>;

  expect(run.before).toEqual({ result: true, celebrating: true });
  expect(run.reset, 'Reset shows the card before its result').toEqual({ state: 'enter', result: false, celebrating: false });
  expect(run.again, 'Reset in place clears a mark a late call left').toEqual({ result: false, celebrating: false });
});

test('Back to a later step lands on its own look, not the look of the step it left (#2201)', async ({ page }) => {
  // « Back snaps to the state before the current one, and a snap fires only the target's own call.
  // The reveal cards' moments are classes, so the board is painted from the state it lands on:
  // nothing the left state added stays, and what the states before the target painted is there.
  await toApp(page);
  const run = await page.evaluate(`(async () => {
    ${HARNESS}
    const CASES = [
      // design, root, the step's mark and what it shows, the branch state and its mark, its
      // event and its way back
      ['wn01', 'reveal', 'reveal-result-shown', '.reveal-subject', 'celebrating', 'reveal-celebrating', 'celebrate', 'settle'],
      ['aw01', 'reveal', 'reveal-open', '.reveal-subject', 'celebrating', 'reveal-celebrating', 'celebrate', 'settle'],
      ['pc01', 'matchup', 'matchup-stats-shown', '.matchup-stat', 'mvp', 'matchup-mvp', 'mvp', 'clearMvp'],
    ];
    const out = {};
    const { backTarget } = await import('/src/control/controlModel.ts');
    for (const [id, root, step, payload, branchState, branch, mark, unmark] of CASES) {
      const { tpl, win, doc } = await boot(id);
      // The step's mark, and what the frame shows: a class alone would pass with the result held
      // back by a tween still playing it in.
      const look = () => {
        const cls = doc.querySelector('.' + root).classList;
        const shown = getComputedStyle(doc.querySelector(payload)).opacity === '1';
        return { state: win.noacgMachineState().groups.main, step: cls.contains(step) && shown, branch: cls.contains(branch) };
      };
      const stepState = win.noacgMachine.groups[0].defaultPath[1];
      win.play();
      await settle();
      win.next();
      await settle();
      win.noacgDispatch(mark);
      await settle();
      // « Back from the branch: the dashboard's own target, which is the step.
      const backTo = backTarget(tpl.js, win.noacgMachineState());
      win.noacgSnap(backTo);
      await settle();
      const back = look();
      // A recovery straight into the branch, from a card that has not run its step.
      win.play();
      await settle();
      win.noacgSnap({ main: branchState });
      await settle();
      const recovered = look();
      // Back from the branch's way out to the branch.
      win.noacgDispatch(unmark);
      await settle();
      const unmarked = look();
      win.noacgSnap({ main: branchState });
      await settle();
      out[id] = { stepState, backTo, branchState, back, recovered, unmarked, backToBranch: look() };
    }
    {
      // The nominee card: a snap (a recovery, a host's state write) from the revealed winner
      // into the suspense hold.
      const { win, doc } = await boot('nm01');
      const look = () => {
        const cls = doc.querySelector('.reveal').classList;
        return {
          state: win.noacgMachineState().groups.main,
          suspense: cls.contains('reveal-suspense'),
          revealed: cls.contains('reveal-revealed'),
          won: doc.querySelectorAll('.reveal-won').length,
        };
      };
      win.play();
      await settle();
      win.noacgDispatch('suspense');
      await settle();
      win.noacgDispatch('reveal');
      await settle();
      win.noacgSnap({ main: 'suspense' });
      await settle();
      out.nm01 = look();
    }
    {
      // A board of three groups: a snap of the phase (a recovery, a host's state write) keeps
      // what the pause group shows.
      const { win, doc } = await boot('es01');
      win.play();
      await settle();
      win.noacgDispatch('goLive');
      await settle();
      win.noacgDispatch('final');
      await settle();
      win.noacgDispatch('pause');
      await settle();
      win.noacgSnap({ phase: 'live' });
      await settle();
      const cls = doc.querySelector('.esports-score').classList;
      out.es01 = {
        groups: win.noacgMachineState().groups,
        live: cls.contains('esports-score-live'),
        final: cls.contains('esports-score-final'),
        paused: cls.contains('esports-score-paused'),
        chipIsPause: doc.querySelector('.esports-score-status').textContent === doc.getElementById('f11').textContent,
      };
      // A snap that moves only the pause group brings back the phase's chip.
      win.noacgSnap({ pause: 'running' });
      await settle();
      out.es01Resumed = {
        live: cls.contains('esports-score-live'),
        paused: cls.contains('esports-score-paused'),
        chipIsLive: doc.querySelector('.esports-score-status').textContent === doc.getElementById('f9').textContent,
      };
    }
    {
      // A route with a call on the way: a recovery into a locked match-up shows the pick under the lock.
      const { win, doc } = await boot('mu01');
      win.play();
      await settle();
      win.update(JSON.stringify({ f5: 'A' }));
      win.noacgSnap({ main: 'locked' });
      await settle();
      out.mu01 = {
        state: win.noacgMachineState().groups.main,
        locked: doc.querySelector('.matchup').classList.contains('matchup-locked'),
        winners: doc.querySelectorAll('.matchup-win').length,
      };
      // Back from the lock to the pick, followed by the data write a dashboard's Back sends.
      win.noacgSnap({ main: 'selected' });
      win.update(JSON.stringify({ f5: 'A' }));
      await settle();
      out.mu01Back = {
        state: win.noacgMachineState().groups.main,
        locked: doc.querySelector('.matchup').classList.contains('matchup-locked'),
        winners: doc.querySelectorAll('.matchup-win').length,
      };
    }
    {
      // A snap that moves nothing (a host settling the state it is in) keeps what the route the
      // board really took painted: a bracket crowned after its final round keeps that cursor.
      const { win, doc } = await boot('br01');
      win.play();
      await settle();
      win.noacgDispatch('advance', { f2: 'FINAL' });
      await settle();
      win.noacgDispatch('crown', { f3: 'TEAM LIQUID' });
      await settle();
      win.noacgSnap(win.noacgMachineState().groups);
      await settle();
      const on = doc.querySelector('.results-board-round-on');
      out.br01 = {
        state: win.noacgMachineState().groups.main,
        crowned: doc.querySelector('.results-board').classList.contains('results-board-crowned'),
        round: on ? on.getAttribute('data-round') : null,
      };
    }
    return out;
  })()`) as Record<string, Record<string, unknown>>;

  for (const id of ['wn01', 'aw01', 'pc01']) {
    const { stepState, branchState } = run[id] as { stepState: string; branchState: string };
    expect(run[id].backTo, `${id}: Back from the branch goes to the step`).toEqual({ main: stepState });
    expect(run[id].back, `${id}: Back to the step leaves no branch mark`).toEqual({ state: stepState, step: true, branch: false });
    expect(run[id].recovered, `${id}: a snap into the branch shows the step under it`).toEqual({ state: branchState, step: true, branch: true });
    expect((run[id].unmarked as Record<string, unknown>).branch, `${id}: the branch's way back clears it`).toBe(false);
    expect(run[id].backToBranch, `${id}: Back to the branch paints it again`).toEqual({ state: branchState, step: true, branch: true });
  }
  expect(run.nm01, 'a snap from the winner into the hold shows the hold').toEqual({ state: 'suspense', suspense: true, revealed: false, won: 0 });
  expect(run.es01, 'a snap of the phase keeps the pause and its chip').toMatchObject({ live: true, final: false, paused: true, chipIsPause: true });
  expect((run.es01 as { groups: Record<string, string> }).groups).toMatchObject({ phase: 'live', pause: 'paused' });
  expect(run.es01Resumed, 'a snap of the pause alone brings back the live chip').toEqual({ live: true, paused: false, chipIsLive: true });
  expect(run.mu01, 'a recovery into the lock shows the pick under it').toEqual({ state: 'locked', locked: true, winners: 1 });
  expect(run.mu01Back, 'Back from the lock keeps the pick and drops the lock').toEqual({ state: 'selected', locked: false, winners: 1 });
  expect(run.br01, 'a settle in place keeps the round under the crowned bracket').toEqual({ state: 'crowned', crowned: true, round: 'FINAL' });
});

test('a board with no data, and an image field with no file, degrade quietly', async ({ page }) => {
  await toApp(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  const run = await page.evaluate(`(async () => {
    ${HARNESS}
    const { win, doc } = await boot('rs01');
    win.play();
    await settle();
    // Empty the rows source the way an operator would, mid-show.
    win.update(JSON.stringify({ f2: '' }));
    await settle();
    const emptied = { rows: doc.querySelectorAll('.results-board-row').length, html: doc.getElementById('results-board-rows').innerHTML };
    // A spotlight that names a row which no longer exists must not throw or lie.
    win.noacgDispatch('spotlight', { f3: '3' });
    await settle();
    const afterGhost = { spotlit: doc.querySelector('.results-board').classList.contains('results-board-spotlit'), lit: doc.querySelectorAll('.results-board-row-on').length };
    // The crest slot with no file: hidden image, no broken icon, placeholder styling intact.
    const img = doc.getElementById('f4');
    const slot = { display: img.style.display, hasSrc: img.hasAttribute('src'), parentHasImage: img.parentNode.classList.contains('has-image') };
    // And a file that IS picked shows up.
    win.update(JSON.stringify({ f4: 'images/crest.png' }));
    await settle();
    const withFile = { hasSrc: img.hasAttribute('src'), parentHasImage: img.parentNode.classList.contains('has-image') };
    return { emptied, afterGhost, slot, withFile };
  })()`) as {
    emptied: { rows: number; html: string };
    afterGhost: { spotlit: boolean; lit: number };
    slot: { display: string; hasSrc: boolean; parentHasImage: boolean };
    withFile: { hasSrc: boolean; parentHasImage: boolean };
  };

  expect(run.emptied.rows).toBe(0);
  expect(run.emptied.html).toBe('');
  // With no rows the press lights nothing and dims nothing (the CSS dims rows only); the board
  // is in focus so the rows that arrive light the named one (#2271).
  expect(run.afterGhost).toEqual({ spotlit: true, lit: 0 });
  expect(run.slot).toMatchObject({ display: 'none', hasSrc: false, parentHasImage: false });
  expect(run.withFile).toMatchObject({ hasSrc: true, parentHasImage: true });
  expect(errors).toEqual([]);
});

test('every design exports to all six targets with its runtime intact', async ({ page }) => {
  test.setTimeout(240_000);
  await toApp(page);
  const report = await page.evaluate(`(async () => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { EXPORT_TARGETS } = await import('/src/export/registry.ts');
    const problems = [];
    let packages = 0;
    // What "every design" means is READ from the catalog, so the assertion below stays "each of
    // them built for each target" rather than "there are still 44 of them".
    let expected = 0;
    for (const id of ${JSON.stringify(CATEGORIES)}) expected += (CATALOG[id] ?? []).length * EXPORT_TARGETS.length;
    for (const id of ${JSON.stringify(CATEGORIES)}) {
      for (const variant of CATALOG[id] ?? []) {
        const tpl = variant.create({});
        for (const target of EXPORT_TARGETS) {
          try {
            const zip = await target.build(tpl);
            const names = Object.keys(zip.files);
            packages++;
            // Every package must carry the graphic's own JS somewhere — the machine engine
            // and the design runtime travel with it or the export is a picture.
            const js = names.filter((n) => n.endsWith('.js') || n.endsWith('.html'));
            if (js.length === 0) problems.push(variant.id + '/' + target.id + ': no html or js in the package');
          } catch (e) {
            problems.push(variant.id + '/' + target.id + ': ' + String(e));
          }
        }
      }
    }
    return { problems, packages, expected };
  })()`) as { problems: string[]; packages: number; expected: number };

  expect(report.problems).toEqual([]);
  expect(report.packages).toBe(report.expected);
  expect(report.expected).toBeGreaterThan(0);
});

test('a pack graphic saves to the library and reloads with its machine and marks working', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'reveal', name: 'House Award' });
  const round = await page.evaluate(`(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { createGraphic, graphicById } = await import('/src/model/library.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const before = useTemplateStore.getState().template;
    const doc = createGraphic(before, { name: 'Award reveal', baseline: before }).doc;
    const reloaded = graphicById(doc.id);
    const tpl = reloaded.template;
    const data = parseAnimData(tpl.js);

    // Boot the RELOADED template and run its moment, to prove the round trip kept the runtime.
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-4000px;top:0;width:1280px;height:720px;';
    document.body.appendChild(f);
    await new Promise((res) => { f.onload = res; f.srcdoc = composeDocument(tpl); });
    await new Promise((r) => setTimeout(r, 120));
    const win = f.contentWindow;
    win.play();
    await new Promise((r) => setTimeout(r, 700));
    win.next();
    await new Promise((r) => setTimeout(r, 700));
    const opened = f.contentDocument.querySelector('.reveal').classList.contains('reveal-open');
    win.noacgDispatch('celebrate');
    await new Promise((r) => setTimeout(r, 700));
    return {
      sameHtml: tpl.html === before.html,
      sameJs: tpl.js === before.js,
      events: data.machine.groups[0].transitions.filter((t) => t.trigger === 'operator').map((t) => t.event).sort(),
      steps: tpl.settings.steps,
      opened,
      state: win.noacgMachineState().groups.main,
    };
  })()`) as { sameHtml: boolean; sameJs: boolean; events: string[]; steps: string; opened: boolean; state: string };

  expect(round.sameHtml).toBe(true);
  expect(round.sameJs).toBe(true);
  expect(round.steps).toBe('2');
  expect([...new Set(round.events)].sort()).toEqual(['celebrate', 'next', 'open', 'settle']);
  expect(round.opened).toBe(true);
  expect(round.state).toBe('celebrating');
});

test('the pack is discoverable in the wizard and creates from a category card', async ({ page }) => {
  // The real door: the wizard's Browse step narrowed to the shelf the scorebug sits on (the
  // pack's category is browsed as a scoreboard, src/templates/meta.ts), the design's card, and
  // Finish into the editor, which makes the created graphic the working document.
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseCategory(page, 'scoreboard');
  await pickDesign(page, 'House Series');
  await finishIntoNewEditor(page);
  // Played in a hidden composer iframe, it settles on its entrance pose with the sample data the
  // category card promised.
  const played = await page.evaluate(`(async () => {
    ${HARNESS}
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { win, doc } = await mount(useTemplateStore.getState().template);
    win.play();
    await settle();
    return { opacity: getComputedStyle(doc.querySelector('.esports-score')).opacity, f0: doc.getElementById('f0').textContent };
  })()`) as { opacity: string; f0: string };
  expect(played).toEqual({ opacity: '1', f0: 'TEAM LIQUID' });
  // The generated control page's buttons come from the machine — the phase events are there.
  const events = await page.evaluate(`(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { allOperatorEvents } = await import('/src/blocks/animMachine.ts');
    const data = parseAnimData(useTemplateStore.getState().template.js);
    return allOperatorEvents(data.machine).sort();
  })()`) as string[];
  expect(events).toEqual(['final', 'goLive', 'nextMap', 'pause', 'resume']);
});
