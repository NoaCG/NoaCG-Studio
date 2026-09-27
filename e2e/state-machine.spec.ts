// covers: src/blocks/**, src/templates/**, src/components/timeline/MachineGraph.tsx

import { enableAdvancedMode } from './_create';
import { test, expect, type Page } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { LOWER_THIRD_EXPLICIT, LOWER_THIRD_IMPLICIT, MILLIONAIRE, SCOREBUG, TICKER } from './_machines';
import { frameMachineState, frameOpacity } from './_frame';

// Phase 1 of the state-machine model (docs/noacg-master-goals.md §1.4,
// docs/STATE_MACHINE_SCHEMA.md): the five acceptance criteria, driven against HAND-WRITTEN
// template definitions (e2e/_machines.ts) built in page through the real emitters — no
// editor UI involved. Version-1 parity for machine-less templates is NOT re-proven here:
// the whole existing wall (anim-engine parity, timeline-v2, exports, bench, house sweeps)
// runs against the same interpreter and IS that proof.

async function toApp(page: Page) {
  // Editor-subject specs: the Advanced boot keeps '' = the editor under the wizard
  // (the default studio lands on Home - docs/GOALS_ARCHIVE.md "Student release" step 4).
  await enableAdvancedMode(page);
  await page.goto('/app');
  await page.keyboard.press('Escape'); // the wizard modal — most of these tests need no project
}

/** Runs in the page: build a MachineDef into a real SpxTemplate via the actual emitters,
 *  then boot it into a hidden iframe (the anim-engine harness idiom). */
const HARNESS = `
  async function buildMachineTemplate(def) {
    const { runtimeJs } = await import('/src/templates/shared/base.ts');
    const { emitAnimRegion } = await import('/src/templates/shared/animRuntime.ts');
    const { replaceDefinitionInHtml } = await import('/src/model/spxDefinition.ts');
    const { DEFAULT_SETTINGS } = await import('/src/model/types.ts');
    const { createBlankTemplate } = await import('/src/templates/blank.ts');
    const { spxSteps } = await import('/src/blocks/animMachine.ts');
    const settings = { ...DEFAULT_SETTINGS, description: def.name, steps: String(spxSteps(def.data)) };
    const base = createBlankTemplate();
    const shell = '<!DOCTYPE html>\\n<html>\\n<head>\\n</head>\\n<body>\\n' + def.html + '\\n</body>\\n</html>';
    return {
      ...base,
      name: def.name,
      html: replaceDefinitionInHtml(shell, settings, def.fields),
      css: def.css,
      js: runtimeJs(def.name, emitAnimRegion(def.data)) + (def.extraJs ? '\\n\\n' + def.extraJs : ''),
      fields: def.fields,
      settings,
    };
  }
  async function boot(tpl) {
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-3000px;top:0;width:1280px;height:720px;';
    document.body.appendChild(f);
    await new Promise((res) => { f.onload = res; f.srcdoc = composeDocument(tpl); });
    await new Promise((r) => setTimeout(r, 60));
    return f.contentWindow;
  }
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const stateOf = (w, group) => w.noacgMachineState().groups[group];
  const opacityOf = (w, sel) => Number(w.getComputedStyle(w.document.querySelector(sel)).opacity);
  // Read a value once it SETTLES on what we expect, or give up and return whatever it is
  // (so the assertion still reports the real number). Animations run on real wall time here,
  // and a loaded parallel run can starve rAF for a stretch - sleeping a fixed span would make
  // these assertions a race against the machine's mood rather than a check of the model.
  async function settled(read, want, budgetMs) {
    budgetMs = budgetMs || 3000;
    for (var waited = 0; waited < budgetMs; waited += 40) {
      if (read() === want) return read();
      await sleep(40);
    }
    return read();
  }
  /** The same, for a threshold rather than an exact value. */
  async function reaches(read, atLeast, budgetMs) {
    budgetMs = budgetMs || 3000;
    for (var waited = 0; waited < budgetMs; waited += 40) {
      if (read() >= atLeast) return read();
      await sleep(40);
    }
    return read();
  }
`;

test('schema: migration on read, canonical fixed point over machines, shape rejections', async ({ page }) => {
  await toApp(page);
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const { parseAnimData, serializeAnimData, spliceAnimData, isAnimData, migrateAnimData } =
      await import('/src/blocks/animData.ts');
    const quiz = ${JSON.stringify(MILLIONAIRE.data)};

    // A version-1 literal MIGRATES on read — everything downstream sees version 2.
    const v1 = { version: 1, root: '.x', speed: 1, steps: quiz.steps.slice(0, 2) };
    const migrated = parseAnimData('var NOACG_ANIM = ' + JSON.stringify(v1) + ';');

    // The canonical serializer is a FIXED POINT over machine-bearing data too. The fixed
    // point holds over the PARSED shape: parsing normalizes (v1 migration, and injecting
    // the materialised lifecycle play/stop edges into a machine that lacks them), so raw
    // authored data first gains its edges — the migration-moment pattern — and is stable
    // from then on.
    const onceData = parseAnimData('var NOACG_ANIM = ' + JSON.stringify(migrateAnimData({ ...quiz })) + ';');
    const once = serializeAnimData(onceData);
    const twice = serializeAnimData(parseAnimData('var NOACG_ANIM = ' + once + ';'));

    // Splicing machine data touches only the literal — interpreter + engine survive.
    const tpl = await buildMachineTemplate(${JSON.stringify(MILLIONAIRE)});
    const parsed = parseAnimData(tpl.js);
    parsed.steps[0].duration = 0.9;
    const spliced = spliceAnimData(tpl.js, parsed);

    // Shape rejections: each corruption degrades to hand-crafted (parse null), never a crash.
    const broken = (mutate) => {
      const d = JSON.parse(JSON.stringify(quiz));
      mutate(d);
      return !isAnimData(d);
    };
    return {
      migratedVersion: migrated && migrated.version,
      fixedPoint: once === twice,
      machineSurvivesRoundTrip: !!parseAnimData('var NOACG_ANIM = ' + once + ';').machine,
      spliceKeepsEngine: !!spliced && spliced.includes('function noacgDispatch') && spliced.includes('"duration": 0.9'),
      rejectsDupStateIds: broken((d) => d.machine.groups[0].states.push({ id: 'locked' })),
      rejectsPathInlineTimeline: broken((d) => { d.machine.groups[0].states[1].timeline = d.machine.groups[0].states[3].timeline; }),
      rejectsReservedEvent: broken((d) => { d.machine.groups[0].transitions[0].event = 'play'; }),
      rejectsPathLengthMismatch: broken((d) => d.machine.groups[0].defaultPath.pop()),
      rejectsSecondTimer: broken((d) => d.machine.groups[0].transitions.push(
        { from: 'question', to: 'answers', trigger: 'timer', after: 1 },
        { from: 'question', to: 'locked', trigger: 'timer', after: 2 },
      )),
      rejectsDanglingRef: broken((d) => { d.machine.groups[0].transitions[0].to = 'ghost'; }),
    };
  })()`);
  expect(result).toEqual({
    migratedVersion: 2,
    fixedPoint: true,
    machineSurvivesRoundTrip: true,
    spliceKeepsEngine: true,
    rejectsDupStateIds: true,
    rejectsPathInlineTimeline: true,
    rejectsReservedEvent: true,
    rejectsPathLengthMismatch: true,
    rejectsSecondTimer: true,
    rejectsDanglingRef: true,
  });
});

test('derived machine: a catalog template answers as one linear group, editor and runtime agreeing', async ({ page }) => {
  await toApp(page);
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const { variantById } = await import('/src/templates/catalog.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { deriveMachine, spxSteps } = await import('/src/blocks/animMachine.ts');
    const tpl = variantById('lt01').create({});
    const data = parseAnimData(tpl.js);
    const derived = deriveMachine(data); // the editor-side derivation
    const w = await boot(tpl);
    const before = stateOf(w, 'main');
    w.play();
    await sleep(80);
    const onAir = stateOf(w, 'main');
    w.stop();
    await sleep(80);
    return {
      noPersistedMachine: data.machine === undefined,
      oneGroup: derived.groups.length === 1 && derived.groups[0].id === 'main',
      pathMatchesSteps: derived.groups[0].defaultPath.length === data.steps.length,
      spxStepsUnchanged: spxSteps(data) === data.steps.length - 1,
      // The interpreter's own derivation names the SAME states the editor's does.
      startsOff: before === 'off',
      onAirIsFirstWaypoint: onAir === derived.groups[0].defaultPath[0],
      offAfterStop: stateOf(w, 'main') === 'off',
    };
  })()`);
  expect(result).toEqual({
    noPersistedMachine: true,
    oneGroup: true,
    pathMatchesSteps: true,
    spxStepsUnchanged: true,
    startsOff: true,
    onAirIsFirstWaypoint: true,
    offAfterStop: true,
  });
});

test('simplicity guard: a lower third is three states, drivable end-to-end with next alone', async ({ page }) => {
  await toApp(page);
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    // Implicit half: NO machine key — the schema adds zero weight to the simple case.
    const wi = await boot(await buildMachineTemplate(${JSON.stringify(LOWER_THIRD_IMPLICIT)}));
    const ltOpacity = () => opacityOf(wi, '.lt');
    wi.play();
    const implicitOnAir = await settled(ltOpacity, 1);
    wi.stop();
    const implicitOff = await settled(ltOpacity, 0);
    wi.play(); // replay-safe
    const implicitReplay = await settled(ltOpacity, 1);

    // Explicit twin: Off → On → Out with the authored next→Out arrow.
    const we = await boot(await buildMachineTemplate(${JSON.stringify(LOWER_THIRD_EXPLICIT)}));
    const beforePlayNext = we.revealNextStep(); // next() off air: a deterministic no-op
    we.play();
    const explicitOnAir = await settled(() => opacityOf(we, '.lt'), 1);
    const explicitOn = stateOf(we, 'main');
    we.next(); // fires the authored on→out arrow — next alone finishes the walk
    const explicitOffAfterNext = await settled(() => opacityOf(we, '.lt'), 0);
    return {
      implicitOnAir, implicitOff, implicitReplay,
      beforePlayNextIsNull: beforePlayNext === null,
      explicitOn,
      explicitOnAir,
      explicitOffAfterNext,
      explicitStateAfterNext: stateOf(we, 'main'),
    };
  })()`);
  expect(result).toMatchObject({
    implicitOnAir: 1,
    implicitOff: 0,
    implicitReplay: 1,
    beforePlayNextIsNull: true,
    explicitOn: 'on',
    explicitOnAir: 1,
    explicitOffAfterNext: 0,
    explicitStateAfterNext: 'off',
  });
});

test('millionaire: selection is data on one state, lock makes select structurally illegal', async ({ page }) => {
  await toApp(page);
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const w = await boot(await buildMachineTemplate(${JSON.stringify(MILLIONAIRE)}));
    const has = (sel, cls) => w.document.querySelector(sel).classList.contains(cls);
    const f5 = () => w.document.getElementById('f5').textContent;
    w.play();
    await settled(() => opacityOf(w, '.qz'), 1);
    const rowsBeforeReveal = opacityOf(w, '.qz-rows'); // pre-armed hidden until the reveal
    w.noacgDispatch('reveal');
    const rowsAfterReveal = await settled(() => opacityOf(w, '.qz-rows'), 1);
    // Select B, then change freely to C — ONE Selected state, the answer is a data value.
    // The highlight is painted by the state's entry call, which fires at t=0 of its timeline.
    w.noacgDispatch('select', { f5: 'B' });
    const selectedB = await settled(() => has('.qz-row-b', 'qz-sel'), true);
    w.noacgDispatch('select', { f5: 'C' });
    const changedToC = await settled(() => has('.qz-row-c', 'qz-sel') && !has('.qz-row-b', 'qz-sel'), true);
    w.noacgDispatch('lock');
    const locked = stateOf(w, 'flow'); // the pointer moves synchronously — no wait needed
    // Structurally illegal now: no select arrow leaves Locked — the event AND its payload drop.
    w.noacgDispatch('select', { f5: 'D' });
    await sleep(120); // a real (if brief) chance to wrongly take effect
    const afterIllegal = { state: stateOf(w, 'flow'), f5: f5(), selStays: has('.qz-row-c', 'qz-sel') };
    w.noacgDispatch('judge');
    await settled(() => has('.qz-row-b', 'qz-correct'), true);
    const judged = {
      correctOnB: has('.qz-row-b', 'qz-correct'),
      wrongOnC: has('.qz-row-c', 'qz-wrong'),
      state: stateOf(w, 'flow'),
    };
    // Snap: enter Locked INSTANTLY on a fresh document — pose composed, nothing animated.
    const w2 = await boot(await buildMachineTemplate(${JSON.stringify(MILLIONAIRE)}));
    w2.noacgSnap({ flow: 'locked' }, { timers: false });
    const snapped = {
      state: stateOf(w2, 'flow'),
      rootShown: opacityOf(w2, '.qz'),
      rowsShown: opacityOf(w2, '.qz-rows'),
      // The pose includes what the TARGET state's own calls paint (the lock dim) — a snapped
      // Locked graphic must LOOK locked, or recovery lands on a half-state.
      dimApplied: w2.document.querySelector('.qz').classList.contains('qz-locked'),
    };
    // And snap(null) is the VISUAL reset: every group back to its initial, root hidden.
    w2.noacgSnap(null);
    const resetState = { state: stateOf(w2, 'flow'), rootHidden: opacityOf(w2, '.qz') };
    return { rowsBeforeReveal, rowsAfterReveal, selectedB, changedToC, locked, afterIllegal, judged, snapped, resetState };
  })()`);
  expect(result).toMatchObject({
    rowsBeforeReveal: 0,
    rowsAfterReveal: 1,
    selectedB: true,
    changedToC: true,
    locked: 'locked',
    afterIllegal: { state: 'locked', f5: 'C', selStays: true },
    judged: { correctOnB: true, wrongOnC: true, state: 'reveal' },
    snapped: { state: 'locked', rootShown: 1, rowsShown: 1, dimApplied: true },
    resetState: { state: 'off', rootHidden: 0 },
  });
});

test('scorebug: data stays data, parallel groups fire independently through one queue', async ({ page }) => {
  await toApp(page);
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const w = await boot(await buildMachineTemplate(${JSON.stringify(SCOREBUG)}));
    w.play();
    await settled(() => opacityOf(w, '.sb'), 1);
    // One tick: a data update plus two events for DIFFERENT groups — the serial queue
    // resolves them deterministically, and the update itself moves no state.
    w.update(JSON.stringify({ f0: '14', f1: '7' }));
    w.noacgDispatch('flag');
    w.noacgDispatch('clockStart');
    const rightAfter = { board: stateOf(w, 'board'), flag: stateOf(w, 'flag'), clock: stateOf(w, 'clock') };
    const flagShown = await settled(() => opacityOf(w, '.sb-flag'), 1);
    const landed = {
      score: w.document.getElementById('f0').textContent,
      flagShown,
      clockRunning: w.__clockRunning,
    };
    // The guard drops a repeat: no 'flag' arrow leaves 'shown'.
    w.noacgDispatch('flag');
    const repeatDropped = stateOf(w, 'flag') === 'shown';
    w.noacgDispatch('clearFlag');
    w.noacgDispatch('clockStop');
    const flagHidden = await settled(() => opacityOf(w, '.sb-flag'), 0);
    const cleared = { flag: stateOf(w, 'flag'), flagHidden, clockRunning: w.__clockRunning };
    return { rightAfter, landed, repeatDropped, cleared };
  })()`);
  expect(result).toMatchObject({
    // Pointers move SYNCHRONOUSLY at dispatch — visible before any animation settles.
    rightAfter: { board: 'on', flag: 'shown', clock: 'running' },
    landed: { score: '14', flagShown: 1, clockRunning: true },
    repeatDropped: true,
    cleared: { flag: 'none', flagHidden: 0, clockRunning: false },
  });
});

test('ticker: timer auto-advance cycles items, pause/resume works, a settled preview never advances', async ({ page }) => {
  test.setTimeout(60_000);
  await toApp(page);
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const w = await boot(await buildMachineTemplate(${JSON.stringify(TICKER)}));
    w.gsap.globalTimeline.timeScale(20); // 1 s of authored time ≈ 50 ms of wall clock
    w.play();
    // Cycling by TIMER alone — no operator input. Wait for real beats rather than a fixed
    // span, so a starved rAF slows the test instead of failing it.
    const ticked = await reaches(() => w.__tick, 2);
    const cycling = stateOf(w, 'cycle');
    w.noacgDispatch('pause');
    await sleep(60); // let any beat already in flight land
    const atPause = w.__tick;
    await sleep(500); // several beats' worth of wall time — a paused ticker must not move
    const paused = { state: stateOf(w, 'cycle'), frozen: w.__tick === atPause };
    w.noacgDispatch('resume');
    const resumedTick = await reaches(() => w.__tick, atPause + 1);
    // The settled design view must NEVER auto-advance: settle-style parking (pause +
    // progress(1, true)) suppresses the timer-arming call entirely.
    const w2 = await boot(await buildMachineTemplate(${JSON.stringify(TICKER)}));
    w2.gsap.globalTimeline.timeScale(20);
    const tl = w2.buildInTimeline();
    tl.pause();
    tl.progress(1, true);
    await sleep(500);
    return { ticked, cycling, paused, resumed: resumedTick > atPause, settledTick: w2.__tick };
  })()`);
  expect(result).toMatchObject({
    cycling: 'advance',
    paused: { state: 'paused', frozen: true },
    resumed: true,
    settledTick: 0,
  });
  expect((result as { ticked: number }).ticked).toBeGreaterThanOrEqual(2);
});

test('compatibility: update/play/next/stop alone — the export surface — walk the default path', async ({ page }) => {
  await toApp(page);
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const tpl = await buildMachineTemplate(${JSON.stringify(MILLIONAIRE)});
    const w = await boot(tpl);
    // Every export target calls EXACTLY these four globals — nothing else.
    w.update(JSON.stringify({ f0: 'Which planet is second from the sun?', f5: '', f6: 'B' }));
    w.play();
    await settled(() => opacityOf(w, '.qz'), 1);
    // The pointer moves synchronously on each next(), so the walk itself needs no waiting —
    // only the final fade to black does.
    const walk = [stateOf(w, 'flow')];
    for (let i = 0; i < 4; i++) {
      w.next();
      walk.push(stateOf(w, 'flow'));
    }
    const offAirAtEnd = await settled(() => opacityOf(w, '.qz'), 0);
    return {
      walk,
      offAirAtEnd,
      spxSteps: tpl.settings.steps,
      globalsEmitted: ['function play()', 'function stop()', 'function next()', 'function update(data)']
        .every((g) => tpl.js.includes(g)),
    };
  })()`);
  expect(result).toEqual({
    // next() fires each default-path arrow WHATEVER its authored event name, and the
    // authored next→out arrow finishes the walk off air (pointers reset to initial).
    walk: ['question', 'answers', 'locked', 'reveal', 'off'],
    offAirAtEnd: 0,
    spxSteps: '4',
    globalsEmitted: true,
  });
});

test('drift guards: the export gate accepts every machine, editor and runtime agree on the snap route', async ({ page }) => {
  await toApp(page);
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { canonicalPath } = await import('/src/blocks/animMachine.ts');

    // Every acceptance machine must clear the EXPORT GATE — a machine no target could ship
    // would make the whole model theoretical.
    const gate = [];
    for (const def of [${JSON.stringify(LOWER_THIRD_EXPLICIT)}, ${JSON.stringify(MILLIONAIRE)}, ${JSON.stringify(SCOREBUG)}, ${JSON.stringify(TICKER)}]) {
      const tpl = await buildMachineTemplate(def);
      const verdict = validateTemplate(tpl);
      gate.push({ name: def.name, ok: verdict.ok, errors: verdict.errors.map((e) => e.rule + ': ' + e.message) });
    }

    // The canonical snap route is implemented TWICE — blocks/animMachine.ts for the editor and
    // the emitted ES5 for the runtime (the animEval precedent). They must not drift, so ask
    // both for the same routes, including an off-path branch state.
    const tpl = await buildMachineTemplate(${JSON.stringify(MILLIONAIRE)});
    const group = parseAnimData(tpl.js).machine.groups[0];
    const w = await boot(tpl);
    const routes = ['question', 'locked', 'selected', 'out'].map((id) => ({
      id,
      editor: canonicalPath(group, true, id),
      // The interpreter's functions are plain top-level declarations, so the emitted
      // implementation is directly callable — no test-only hook in the shipped runtime.
      runtime: w.noacgCanonicalPath(w.noacgMachine.groups[0], id),
    }));
    return { gate, routeDrift: routes.filter((r) => JSON.stringify(r.editor) !== JSON.stringify(r.runtime)) };
  })()`);
  expect((result as { gate: Array<{ ok: boolean }> }).gate.every((g) => g.ok)).toBe(true);
  expect(result).toMatchObject({ routeDrift: [] });
});

test('preview: snap-to-state works in the editor, and the event strip guards like the graph', async ({ page }) => {
  // Asserts EDITOR surfaces (the simulator's event strip), so it needs the Advanced boot.
  await enableAdvancedMode(page);
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await awaitPreviewRebuild(page, () =>
    page.evaluate(`(async () => {
      ${HARNESS}
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const { useDocKindStore } = await import('/src/store/docKindStore.ts');
      const tpl = await buildMachineTemplate(${JSON.stringify(MILLIONAIRE)});
      useTemplateStore.getState().applyTemplate(tpl, { resetSampleData: true });
      useDocKindStore.getState().setKind('spx');
    })()`),
  );
  // The minimal machine surface: one button per authored operator event + the state chip.
  await expect(page.getByTestId('sim-events')).toBeVisible();
  await expect(page.getByTestId('sim-event-select')).toBeVisible();
  // The chip wears the state's NAME, not its id (controlModel.ts formatMachineState): the ids
  // are the author's vocabulary and the names are what every operator surface shows.
  await expect(page.getByTestId('sim-state-chip')).toHaveText('Question', { timeout: 5000 });

  // Snap through the store (the programmatic path the done-when names): instant Locked.
  await page.evaluate(`(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    useTemplateStore.getState().sendSnap({ flow: 'locked' });
  })()`);
  await expect(page.getByTestId('sim-state-chip')).toHaveText('Locked', { timeout: 5000 });
  const pose = {
    state: (await frameMachineState(page)).flow,
    root: await frameOpacity(page, '.qz'),
    rows: await frameOpacity(page, '.qz-rows'),
  };
  expect(pose).toEqual({ state: 'locked', root: 1, rows: 1 });

  // The strip is guarded by the graph: select after lock is dead — and now SAYS so, rather
  // than taking the press and silently dropping it. (Dispatching it anyway still moves
  // nothing; that is the runtime guard, covered by the dispatch cases above.)
  await expect(page.getByTestId('sim-event-select')).toBeDisabled();
  await page.evaluate(`(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    useTemplateStore.getState().sendEvent('select');
  })()`);
  await page.waitForTimeout(200);
  await expect(page.getByTestId('sim-state-chip')).toHaveText('Locked');

  // And a LEGAL event dispatched from the strip actually plays its state's timeline through
  // the whole app path (store -> simulator -> preview iframe), not just moves the pointer.
  const frame = page.frameLocator('iframe.preview-frame');
  await page.locator('.simulator button', { hasText: 'Play' }).click();
  await expect(page.getByTestId('sim-state-chip')).toHaveText('Question');
  await expect
    .poll(async () => frame.locator('.qz-rows').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('0'); // pre-armed by the entrance: the rows wait for their reveal
  await page.getByTestId('sim-event-reveal').click();
  await expect(page.getByTestId('sim-state-chip')).toHaveText('Answers up');
  await expect
    .poll(async () => Number(await frame.locator('.qz-rows').evaluate((el) => getComputedStyle(el).opacity)))
    .toBeGreaterThan(0.9);
});
