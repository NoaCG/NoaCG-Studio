// covers: src/blocks/**
// covers: src/components/timeline/{StepTimeline.tsx,LegacyTimeline.tsx,Inspector.tsx,PlayoutSimulator.tsx}
//
// This spec RECONSTRUCTS a preset's emitted region - the only spec that imports presetRegistry -
// and measures it against the interpreter, so the emit authored under src/templates/ is its subject.
// Reachable only from src/blocks/ until 2026-08-27, when a changed infographic emit reached the
// nightly unplanned and main was red for a day. The pin in e2e-affected.test.mjs is derived from
// that import.
// covers: src/templates/**

import { enableAdvancedMode } from './_create';
import { test, expect, type Page } from '@playwright/test';

// Timeline v2 Phase 1 (docs/TIMELINE_V2_PLAN.md) — the golden parity harness for the
// declarative animation engine. Lower thirds now CREATE as data blocks, so the harness
// builds each preset's LEGACY twin explicitly (the preset's emitted region spliced into
// the same template) and proves the two representations behave identically: same
// durations, same settled states, same press chain, and a playhead resolver that agrees
// with real playback.

async function toApp(page: Page) {
  // Editor-subject specs: the Advanced boot keeps '' = the editor under the wizard
  // (the default studio lands on Home - docs/GOALS_ARCHIVE.md "Student release" step 4).
  await enableAdvancedMode(page);
  await page.goto('/app');
  await page.keyboard.press('Escape'); // the wizard modal — these tests don't need a project
}

/** Runs in the page: boot templates into hidden iframes; build legacy twins. */
const HARNESS = `
  async function boot(tpl) {
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-3000px;top:0;width:1280px;height:720px;';
    document.body.appendChild(f);
    await new Promise((res) => { f.onload = res; f.srcdoc = composeDocument(tpl); });
    await new Promise((r) => setTimeout(r, 60));
    return f.contentWindow;
  }
  function styleOf(w, sel) {
    const el = w.document.querySelector(sel);
    if (!el) return null;
    const s = w.getComputedStyle(el);
    return { opacity: s.opacity, transform: s.transform, filter: s.filter };
  }
  // Compare two computed-style snapshots with numeric tolerance (matrix floats drift).
  function sameStyle(a, b) {
    if (!a || !b) return a === b;
    const nums = (str) => (str.match(/-?[\\d.]+/g) || []).map(Number);
    for (const key of ['opacity', 'transform', 'filter']) {
      const na = nums(a[key]); const nb = nums(b[key]);
      if (na.length !== nb.length) return false;
      for (let i = 0; i < na.length; i++) if (Math.abs(na[i] - nb[i]) > 0.6) return false;
    }
    return true;
  }
  // The preset's ORIGINAL emitted region, spliced over the data region — the legacy twin.
  async function legacyTwin(tpl, presetId, steps) {
    const { anyPresetById } = await import('/src/blocks/presetRegistry.ts');
    const { detectPrefix, countLines } = await import('/src/model/structure.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const preset = anyPresetById(presetId);
    const prefix = detectPrefix(tpl.html);
    const data = parseAnimData(tpl.js);
    const region = preset.emit({
      prefix,
      lineCount: Math.max(1, countLines(tpl.html)),
      hasAccent: tpl.html.includes(prefix + '-accent'),
      hasBars: tpl.html.includes(prefix + '-bar-fill'),
      steps: !!steps,
      stepOutsideParts: [],
      speed: data ? data.speed : 1,
      easeIn: preset.autoEase.easeIn,
      easeOut: preset.autoEase.easeOut,
    });
    const OPEN = '/* == ANIMATION';
    const CLOSE = '/* == END ANIMATION == */';
    const start = tpl.js.indexOf(OPEN);
    const end = tpl.js.indexOf(CLOSE) + CLOSE.length;
    return { ...tpl, js: tpl.js.slice(0, start) + region + tpl.js.slice(end) };
  }
`;

test('parity: created data templates match each preset\'s legacy emit', async ({ page }) => {
  test.setTimeout(120_000);
  await toApp(page);
  // One variant × the preset spread covers every value type the emits use: mask reveals
  // (yPercent, both signs), slides on every axis (x/y + opacity), scale pops, clip-path
  // wipes, filter blurs, skews.
  const failures = await page.evaluate(`(async () => {
    ${HARNESS}
    const { variantById } = await import('/src/templates/catalog.ts');
    const failures = [];
    for (const presetId of ['line-reveal', 'slide-up', 'slide-down', 'slide-left', 'slide-right', 'pop-spring', 'mask-wipe', 'blur-in', 'snap-stinger']) {
      const tpl = variantById('lt01').create({ animation: { presetId } });
      if (!tpl.js.includes('var NOACG_ANIM')) { failures.push(presetId + ': creation did not emit the data block'); continue; }
      const wNew = await boot(tpl);
      const wOld = await boot(await legacyTwin(tpl, presetId, false));
      // Entrance: same length, same settled look.
      const inOld = wOld.buildInTimeline(); inOld.pause();
      const inNew = wNew.buildInTimeline(); inNew.pause();
      if (Math.abs(inOld.duration() - inNew.duration()) > 0.03)
        failures.push(presetId + ': in duration ' + inOld.duration() + ' vs ' + inNew.duration());
      inOld.progress(1, true); inNew.progress(1, true);
      for (const sel of ['.lower-third', '.lower-third-box', '#f0', '#f1']) {
        if (!sameStyle(styleOf(wOld, sel), styleOf(wNew, sel)))
          failures.push(presetId + ': settled IN mismatch on ' + sel + ' ' + JSON.stringify(styleOf(wOld, sel)) + ' vs ' + JSON.stringify(styleOf(wNew, sel)));
      }
      // Exit: same length, both fully hidden at the end.
      const outOld = wOld.buildOutTimeline(); outOld.pause();
      const outNew = wNew.buildOutTimeline(); outNew.pause();
      if (Math.abs(outOld.duration() - outNew.duration()) > 0.03)
        failures.push(presetId + ': out duration ' + outOld.duration() + ' vs ' + outNew.duration());
      outOld.progress(1, true); outNew.progress(1, true);
      const rootOld = styleOf(wOld, '.lower-third'); const rootNew = styleOf(wNew, '.lower-third');
      if (rootOld.opacity !== '0' || rootNew.opacity !== '0')
        failures.push(presetId + ': out did not hide the root (' + rootOld.opacity + ' / ' + rootNew.opacity + ')');
    }
    return failures;
  })()`);
  expect(failures).toEqual([]);
});

test('slide family: each direction produces its own axis and sign of travel', async ({ page }) => {
  await toApp(page);
  const entries = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const out: Record<string, { axis: string; sign: number }> = {};
    for (const presetId of ['slide-up', 'slide-down', 'slide-left', 'slide-right'] as const) {
      const tpl = variantById('lt01')!.create({ animation: { presetId } });
      const data = parseAnimData(tpl.js)!;
      const box = data.steps[0].layers['.lower-third-box'];
      const axis = box.x ? 'x' : 'y';
      const first = (box.x ?? box.y)![0].value as number;
      out[presetId] = { axis, sign: Math.sign(first) };
    }
    return out;
  });
  // The entrance's first keyframe sits on the origin side: up rises from below (+y),
  // down settles from above (−y), left glides in from the right (+x), right from the left (−x).
  expect(entries).toEqual({
    'slide-up': { axis: 'y', sign: 1 },
    'slide-down': { axis: 'y', sign: -1 },
    'slide-left': { axis: 'x', sign: 1 },
    'slide-right': { axis: 'x', sign: -1 },
  });
});

test('parity: the press chain — pre-hidden reveals, per-press timelines, exhaustion', async ({ page }) => {
  test.setTimeout(60_000);
  await toApp(page);
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const { variantById } = await import('/src/templates/catalog.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const tpl = variantById('lt01').create({ animation: { steps: true } });
    const data = parseAnimData(tpl.js);
    if (!data) return { fail: 'creation did not emit the data block' };
    const wNew = await boot(tpl);
    const wOld = await boot(await legacyTwin(tpl, 'line-reveal', true));
    const run = (w) => {
      w.buildInTimeline().pause().progress(1, true);
      const hidden = styleOf(w, '#f1');
      const presses = [];
      let tw;
      while ((tw = w.revealNextStep())) { tw.pause(); presses.push(tw.duration()); tw.progress(1, true); }
      return { hidden, shown: styleOf(w, '#f1'), presses };
    };
    const a = run(wOld);
    const b = run(wNew);
    return {
      hiddenMatch: sameStyle(a.hidden, b.hidden),
      shownMatch: sameStyle(a.shown, b.shown),
      pressesOld: a.presses.length,
      pressesNew: b.presses.length,
      durationsClose: a.presses.every((d, i) => Math.abs(d - b.presses[i]) < 0.03),
      dataReveals: data.steps[1].reveals,
    };
  })()`);
  expect(result).toMatchObject({
    hiddenMatch: true,
    shownMatch: true,
    pressesOld: 1,
    pressesNew: 1,
    durationsClose: true,
    dataReveals: ['#f1'],
  });
});

test('parity: clock templates carry startClock/stopClock through the step-call model', async ({ page }) => {
  test.setTimeout(60_000);
  await toApp(page);
  // Game timers create as data blocks now (docs/TIMELINE_V2_PLAN.md §3b): the preset's
  // tl.call(startClock)/tl.call(stopClock) hooks must survive the conversion as step calls,
  // and the data interpreter must run them exactly where the legacy emit did.
  const failures = await page.evaluate(`(async () => {
    ${HARNESS}
    const { variantById } = await import('/src/templates/catalog.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const failures = [];
    for (const pair of [['gt01', 'timer-line-reveal'], ['gt02', 'timer-run']]) {
      const variant = pair[0], presetId = pair[1];
      const tpl = variantById(variant).create({ animation: { presetId } });
      if (!tpl.js.includes('var NOACG_ANIM')) { failures.push(variant + ': the flip did not emit the data block'); continue; }
      const data = parseAnimData(tpl.js);
      if (!data) { failures.push(variant + ': the data block is not readable'); continue; }
      // The hooks land on the right steps: startClock on the entrance, stopClock on the Out.
      const enter = (data.steps[0].calls || []).map((c) => c.call);
      const out = (data.steps[data.steps.length - 1].calls || []).map((c) => c.call);
      if (!enter.includes('startClock')) failures.push(variant + ': entrance missing startClock (' + JSON.stringify(enter) + ')');
      if (!out.includes('stopClock')) failures.push(variant + ': Out missing stopClock (' + JSON.stringify(out) + ')');

      const wNew = await boot(tpl);
      const wOld = await boot(await legacyTwin(tpl, presetId, false));

      // Entrance + exit: identical length and settled look as the legacy emit.
      const inOld = wOld.buildInTimeline(); inOld.pause();
      const inNew = wNew.buildInTimeline(); inNew.pause();
      if (Math.abs(inOld.duration() - inNew.duration()) > 0.05) failures.push(variant + ': in duration ' + inOld.duration() + ' vs ' + inNew.duration());
      inOld.progress(1, true); inNew.progress(1, true);
      for (const sel of ['.game-timer', '.game-timer-box', '#f0', '.game-timer-clock']) {
        if (!sameStyle(styleOf(wOld, sel), styleOf(wNew, sel)))
          failures.push(variant + ': settled IN mismatch on ' + sel + ' ' + JSON.stringify(styleOf(wOld, sel)) + ' vs ' + JSON.stringify(styleOf(wNew, sel)));
      }
      const outOld = wOld.buildOutTimeline(); outOld.pause();
      const outNew = wNew.buildOutTimeline(); outNew.pause();
      if (Math.abs(outOld.duration() - outNew.duration()) > 0.05) failures.push(variant + ': out duration ' + outOld.duration() + ' vs ' + outNew.duration());

      // Clock lifecycle: with the clock functions spied, a real (non-suppressed) run fires
      // startClock during the entrance and stopClock during the exit — identically in both
      // representations. (The data interpreter resolves window[name] at fire time; the legacy
      // emit captured the identifier at build time — reassigning before build covers both.)
      for (const w of [wOld, wNew]) { w.__started = 0; w.__stopped = 0; w.startClock = function () { w.__started++; }; w.stopClock = function () { w.__stopped++; }; }
      wOld.buildInTimeline().progress(1); wNew.buildInTimeline().progress(1);
      wOld.buildOutTimeline().progress(1); wNew.buildOutTimeline().progress(1);
      if (wOld.__started < 1) failures.push(variant + ': legacy startClock never fired under the trigger');
      if (wOld.__started !== wNew.__started) failures.push(variant + ': startClock count ' + wOld.__started + ' vs ' + wNew.__started);
      if (wOld.__stopped !== wNew.__stopped) failures.push(variant + ': stopClock count ' + wOld.__stopped + ' vs ' + wNew.__stopped);

      // The settle contract: progress(1, true) suppresses callbacks, so a scrubbed/settled
      // state never ticks the clock.
      wNew.__started = 0; wNew.__stopped = 0;
      wNew.buildInTimeline().progress(1, true); wNew.buildOutTimeline().progress(1, true);
      if (wNew.__started !== 0 || wNew.__stopped !== 0) failures.push(variant + ': settle re-fired the clock (' + wNew.__started + '/' + wNew.__stopped + ')');
    }
    return failures;
  })()`);
  expect(failures).toEqual([]);
});

test('parity: starting-soon flips to a data block and its ambient loop matches the legacy emit', async ({ page }) => {
  test.setTimeout(60_000);
  await toApp(page);
  // docs/PRESET_MODEL_REVIEW.md gap 6 — the loop/yoyo primitive lets starting-soon migrate:
  // its breathing hold (a scale track with repeat:-1, yoyo:true) is now describable as data,
  // and the converted interpreter must breathe identically to the legacy emit (and start/stop
  // the clock in the same places). Tickers/credits stay legacy (DOM-measured) — pinned below.
  const failures = await page.evaluate(`(async () => {
    ${HARNESS}
    const { variantById } = await import('/src/templates/catalog.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { resolveValue } = await import('/src/blocks/animEval.ts');
    const failures = [];
    const PULSE = '.starting-soon-pulse';

    const tpl = variantById('ss01').create({ animation: { presetId: 'hold-loop' } });
    if (!tpl.js.includes('var NOACG_ANIM')) return ['starting-soon did not flip to a data block'];
    const data = parseAnimData(tpl.js);
    if (!data) return ['the converted data block is not readable'];
    // The ambient breath imported as a per-track loop on the pulse element.
    const loop = data.steps[0].loops && data.steps[0].loops[PULSE] && data.steps[0].loops[PULSE].scale;
    if (!loop) failures.push('no loop on the pulse (' + JSON.stringify(data.steps[0].loops) + ')');
    else {
      if (loop.repeat !== -1) failures.push('pulse loop repeat ' + loop.repeat + ' != -1');
      if (loop.yoyo !== true) failures.push('pulse loop is not a yoyo');
    }

    const wNew = await boot(tpl);
    const wOld = await boot(await legacyTwin(tpl, 'hold-loop', false));
    const speed = data.speed || 1;

    // The breath itself: sample the pulse scale across several periods — the converted loop
    // must track the legacy tween (both eased sine yoyos with the same phase).
    const inOld = wOld.buildInTimeline(); inOld.pause();
    const inNew = wNew.buildInTimeline(); inNew.pause();
    for (const t of [1.2, 2.0, 3.0, 4.5, 6.0, 8.0]) {
      inOld.pause(t); inNew.pause(t);
      const so = Number(wOld.gsap.getProperty(PULSE, 'scaleX'));
      const sn = Number(wNew.gsap.getProperty(PULSE, 'scaleX'));
      if (Math.abs(so - sn) > 0.01) failures.push('pulse scale @' + t + 's: legacy ' + so + ' vs data ' + sn);
      // The loop-aware resolver folds the same time into the same value (linear vs eased
      // differ only mid-tween by a sliver at this amplitude).
      const resolved = Number(resolveValue(data, PULSE, 'scale', 0, t * speed));
      if (Math.abs(resolved - sn) > 0.02) failures.push('resolver @' + t + 's: ' + resolved + ' vs interp ' + sn);
    }

    // Clock lifecycle survives the flip: startClock on the entrance, stopClock on the exit,
    // identically in both representations (the §3b step-call contract).
    for (const w of [wOld, wNew]) { w.__started = 0; w.__stopped = 0; w.startClock = function () { w.__started++; }; w.stopClock = function () { w.__stopped++; }; }
    wOld.buildInTimeline().progress(1); wNew.buildInTimeline().progress(1);
    wOld.buildOutTimeline().progress(1); wNew.buildOutTimeline().progress(1);
    if (wOld.__started < 1) failures.push('legacy startClock never fired');
    if (wOld.__started !== wNew.__started) failures.push('startClock count ' + wOld.__started + ' vs ' + wNew.__started);
    if (wOld.__stopped !== wNew.__stopped) failures.push('stopClock count ' + wOld.__stopped + ' vs ' + wNew.__stopped);

    // Tickers now flip too: their measured travel lives in a named builder outside the
    // region, which the importer carries as a dynamics segment
    // (docs/DYNAMIC_MOTION_SCOPE.md). The behaviour itself is pinned by the measured-motion
    // parity test below; here we only pin that they ARE data blocks now.
    for (const v of ['tk01', 'tk02']) {
      const t = variantById(v).create({});
      if (!t.js.includes('var NOACG_ANIM')) failures.push(v + ' should have flipped to a data block');
    }

    return failures;
  })()`);
  expect(failures).toEqual([]);
});

test('resolver: agrees with the real interpreter at keyframe times', async ({ page }) => {
  await toApp(page);
  const mismatches = await page.evaluate(`(async () => {
    ${HARNESS}
    const { variantById } = await import('/src/templates/catalog.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { resolveValue } = await import('/src/blocks/animEval.ts');
    const tpl = variantById('lt01').create({});
    const data = parseAnimData(tpl.js);
    const w = await boot(tpl);
    const tl = w.buildInTimeline(); tl.pause();
    const speed = data.speed || 1;
    const mismatches = [];
    const step = data.steps[0];
    for (const selector of Object.keys(step.layers)) {
      for (const prop of Object.keys(step.layers[selector])) {
        for (const kf of step.layers[selector][prop]) {
          if (typeof kf.value !== 'number') continue;
          // pause(0) on a never-rendered timeline writes nothing (GSAP renders lazily) —
          // sample a hair after zero; the tolerance absorbs the sliver of motion.
          tl.pause(Math.min(Math.max(kf.time / speed, 0.001), tl.duration()));
          const live = Number(w.gsap.getProperty(selector, prop));
          const resolved = resolveValue(data, selector, prop, 0, kf.time);
          if (Math.abs(live - Number(resolved)) > 0.6)
            mismatches.push(selector + '.' + prop + '@' + kf.time + ': live ' + live + ' vs resolved ' + resolved);
        }
      }
    }
    // Cross-step inheritance: with no Out keyframes for a prop, the Out-step resolution
    // returns the entrance's final value.
    const inherited = resolveValue(data, '#f0', 'yPercent', data.steps.length - 1, 0);
    const lastEnter = step.layers['#f0'].yPercent.slice(-1)[0].value;
    if (inherited !== lastEnter && data.steps[data.steps.length - 1].layers['#f0']?.yPercent === undefined)
      mismatches.push('inheritance: ' + inherited + ' vs ' + lastEnter);
    return mismatches;
  })()`);
  expect(mismatches).toEqual([]);
});

test('3D transforms: rotationX/Y/z + perspective author and play through the real interpreter', async ({ page }) => {
  // docs/PRESET_MODEL_REVIEW.md gap 7 — the 3D vocabulary is ordinary numeric tracks: the
  // model round-trips them, and the SAME interpreter (no special-casing) applies them via
  // GSAP as a genuine 3D transform. Author a card-flip on #f0 through the real mutators,
  // then prove the played result is 3D and settles to the resolver's values.
  await toApp(page);
  const problems = await page.evaluate(`(async () => {
    ${HARNESS}
    const { variantById } = await import('/src/templates/catalog.ts');
    const { parseAnimData, spliceAnimData } = await import('/src/blocks/animData.ts');
    const { setKeyframe } = await import('/src/blocks/animEdit.ts');
    const { resolveValue } = await import('/src/blocks/animEval.ts');
    const tpl = variantById('lt01').create({});
    let data = parseAnimData(tpl.js);
    const enterDur = data.steps[0].duration;
    // Perspective set once at the entrance; rotationY 90 -> 0 (the card flip), plus an X
    // tilt and a depth push, all resolving to identity by the settled state.
    data = setKeyframe(data, 0, '#f0', 'transformPerspective', 0, 600);
    data = setKeyframe(data, 0, '#f0', 'rotationY', 0, 90);
    data = setKeyframe(data, 0, '#f0', 'rotationY', enterDur, 0);
    data = setKeyframe(data, 0, '#f0', 'rotationX', 0, 20);
    data = setKeyframe(data, 0, '#f0', 'rotationX', enterDur, 0);
    data = setKeyframe(data, 0, '#f0', 'z', 0, -200);
    data = setKeyframe(data, 0, '#f0', 'z', enterDur, 0);
    const js = spliceAnimData(tpl.js, data);
    if (!js || js === tpl.js) return ['splice produced no change'];
    const w = await boot({ ...tpl, js });
    const tl = w.buildInTimeline(); tl.pause();
    const problems = [];
    // Near the start: #f0 is mid-flip — the live transform must be a real 3D matrix and
    // rotationY still near its 90deg 'from' value.
    tl.pause(0.001);
    const startTransform = w.getComputedStyle(w.document.querySelector('#f0')).transform;
    if (!/matrix3d/.test(startTransform)) problems.push('entrance is not 3D: ' + startTransform);
    const startRotY = Number(w.gsap.getProperty('#f0', 'rotationY'));
    if (Math.abs(startRotY - 90) > 3) problems.push('start rotationY ' + startRotY + ' not ~90');
    // Settled: every 3D prop matches the resolver AND the authored end values.
    tl.progress(1, true);
    for (const spec of [['rotationX', 0], ['rotationY', 0], ['z', 0], ['transformPerspective', 600]]) {
      const prop = spec[0], want = spec[1];
      const live = Number(w.gsap.getProperty('#f0', prop));
      const resolved = Number(resolveValue(data, '#f0', prop, 0, enterDur));
      if (Math.abs(live - want) > 1) problems.push(prop + ' settled live ' + live + ' != ' + want);
      if (Math.abs(live - resolved) > 1) problems.push(prop + ' live/resolver drift ' + live + ' / ' + resolved);
    }
    return problems;
  })()`);
  expect(problems).toEqual([]);
});

test('serializer: canonical fixed point, lossless splice, hand-edit round-trip', async ({ page }) => {
  await toApp(page);
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const { variantById } = await import('/src/templates/catalog.ts');
    const { parseAnimData, serializeAnimData, spliceAnimData } = await import('/src/blocks/animData.ts');
    const tpl = variantById('lt01').create({});
    const js = tpl.js; // created AS a data block now
    const data = parseAnimData(js);
    // Fixed point: parse(serialize) then serialize again is byte-identical.
    const once = serializeAnimData(data);
    const twice = serializeAnimData(parseAnimData('var NOACG_ANIM = ' + once + ';'));
    // A visual edit (splice) touches only the literal — the interpreter and everything
    // around it survive byte-for-byte.
    const parsed = parseAnimData(js);
    parsed.steps[0].duration = 1.5;
    const spliced = spliceAnimData(js, parsed);
    // A HAND edit in the code round-trips: change one value in the text (only the first
    // of several 110s — the others must survive), the parse sees it.
    const handEdited = js.replace('"value": 110', '"value": 90');
    const reparsed = parseAnimData(handEdited);
    const values = [];
    for (const s of reparsed.steps) for (const l of Object.values(s.layers))
      for (const kfs of Object.values(l)) for (const kf of kfs) values.push(kf.value);
    // The loops field is a new serialized shape — it must round-trip and stay a fixed point
    // too. Starting-soon carries a real loop; serialize/parse/serialize is byte-identical and
    // the loop survives with its repeat/yoyo intact.
    const loopTpl = variantById('ss01').create({ animation: { presetId: 'hold-loop' } });
    const loopData = parseAnimData(loopTpl.js);
    const loopOnce = serializeAnimData(loopData);
    const loopTwice = serializeAnimData(parseAnimData('var NOACG_ANIM = ' + loopOnce + ';'));
    const roundLoop = parseAnimData('var NOACG_ANIM = ' + loopOnce + ';').steps[0].loops;
    const roundPulse = roundLoop && roundLoop['.starting-soon-pulse'] && roundLoop['.starting-soon-pulse'].scale;
    return {
      fixedPoint: once === twice,
      spliceKeepsInterpreter: spliced.includes('function buildStepTimeline') && spliced.includes('"duration": 1.5'),
      spliceKeepsOutsideCode: spliced.split('== ANIMATION')[0] === js.split('== ANIMATION')[0],
      handEditSeen: values.includes(90) && values.includes(110),
      loopFixedPoint: loopOnce === loopTwice,
      loopSurvives: !!roundPulse && roundPulse.repeat === -1 && roundPulse.yoyo === true,
    };
  })()`);
  expect(result).toEqual({
    fixedPoint: true,
    spliceKeepsInterpreter: true,
    spliceKeepsOutsideCode: true,
    handEditSeen: true,
    loopFixedPoint: true,
    loopSurvives: true,
  });
});

// ── Measured motion (docs/DYNAMIC_MOTION_SCOPE.md) ──
// Tickers and end credits move by magnitudes that only exist once the operator's text is
// rendered: a marquee slides one track-width, a roll covers its own content height, a flip
// runs one segment per item. Those live in named builder functions outside the marked
// region, and the animation data references them with a `dynamics` segment.
//
// The parity bar is the same as every other preset's: the created DATA template must behave
// exactly like that preset's LEGACY emit. Because the builders are shared by both, this is a
// real test of the CONVERSION — that the importer placed the segment at the right moment on
// the step clock and kept the fade around it. It runs across two very different content
// lengths, since a measured value that ignored the content would pass at one and fail at the
// other.

const MEASURED_CASES = [
  { variant: 'tk01', presetId: 'ticker-marquee', build: 'tickerMarquee', track: '#ticker-track', box: '.ticker-box', times: [0, 0.25, 0.5, 2, 6, 11] },
  { variant: 'tk01', presetId: 'ticker-flip', build: 'tickerFlipCycle', track: '#ticker-track', box: '.ticker-box', times: [0, 0.5, 0.9, 2, 4.8] },
  { variant: 'cr01', presetId: 'credits-roll', build: 'creditsRoll', track: '#credits-track', box: '.credits-box', times: [0, 0.3, 0.6, 5, 15] },
  { variant: 'cr01', presetId: 'credits-crawl', build: 'creditsCrawl', track: '#credits-track', box: '.credits-box', times: [0, 0.2, 0.4, 4, 12] },
  { variant: 'cr01', presetId: 'credits-pages', build: 'creditsPages', track: '#credits-track', box: '.credits-box', times: [0, 0.5, 3, 4, 7] },
];

// Short vs long: the measured travel must scale with the content, and both twins must agree.
const SHORT_TEXT = 'One line only\nAnd a second';
const LONG_TEXT = Array.from({ length: 12 }, (_, i) => `Role ${i + 1} | Person Number ${i + 1}`).join('\n');

test('parity: measured motion matches the legacy emit across content lengths', async ({ page }) => {
  test.setTimeout(180_000);
  await toApp(page);
  const failures = await page.evaluate(
    `(async (cases, texts) => {
      ${HARNESS}
      const { variantById } = await import('/src/templates/catalog.ts');
      const { parseAnimData } = await import('/src/blocks/animData.ts');
      const failures = [];

      for (const c of cases) {
        const tpl = variantById(c.variant).create({ animation: { presetId: c.presetId } });
        const data = parseAnimData(tpl.js);
        if (!data) { failures.push(c.presetId + ': creation did not emit the data block'); continue; }

        // The measured travel must ride across as a dynamics segment naming its builder.
        const dyn = (data.steps[0].dynamics || [])[0];
        if (!dyn || dyn.build !== c.build) {
          failures.push(c.presetId + ': expected a dynamics segment building ' + c.build + ', got ' + JSON.stringify(dyn));
          continue;
        }
        // The builder itself must ship OUTSIDE the marked region — otherwise the data names
        // a function the export would not carry.
        const outside = tpl.js.split('/* == ANIMATION')[0];
        if (!outside.includes('function ' + c.build + '(')) {
          failures.push(c.presetId + ': ' + c.build + '() is not defined outside the marked region');
        }

        const wNew = await boot(tpl);
        const wOld = await boot(await legacyTwin(tpl, c.presetId, false));

        for (const [label, text] of Object.entries(texts)) {
          // Feed both the same operator text and let each rebuild + re-measure.
          for (const w of [wOld, wNew]) w.update(JSON.stringify({ f0: text }));
          await new Promise((r) => setTimeout(r, 30));

          const tlOld = wOld.buildInTimeline(); tlOld.pause();
          const tlNew = wNew.buildInTimeline(); tlNew.pause();
          // Prime a render before sampling. A legacy fromTo() applies its from-value eagerly
          // at construction; the interpreter's set()-at-0 only lands when the timeline first
          // renders. Both agree from the first drawn frame on (and the root is CSS-hidden
          // until that frame, so nothing is ever visible un-faded) — but a paused timeline
          // that has never rendered would compare against stale CSS defaults at t=0.
          tlOld.seek(0.001); tlNew.seek(0.001);

          for (const t of c.times) {
            tlOld.seek(t); tlNew.seek(t);
            for (const sel of [c.track, c.box]) {
              if (!sameStyle(styleOf(wOld, sel), styleOf(wNew, sel))) {
                failures.push(
                  c.presetId + ' [' + label + ' @' + t + 's] ' + sel + ': ' +
                  JSON.stringify(styleOf(wOld, sel)) + ' vs ' + JSON.stringify(styleOf(wNew, sel)),
                );
              }
            }
          }
          tlOld.kill(); tlNew.kill();
        }
      }
      return failures;
    })(${JSON.stringify(MEASURED_CASES)}, ${JSON.stringify({ short: SHORT_TEXT, long: LONG_TEXT })})`,
  );
  expect(failures).toEqual([]);
});

test('measured motion actually tracks the content — and the timeline shows it read-only', async ({ page }) => {
  test.setTimeout(90_000);
  await toApp(page);
  const result = await page.evaluate(
    `(async (short, long) => {
      ${HARNESS}
      const { variantById } = await import('/src/templates/catalog.ts');
      const tpl = variantById('tk01').create({ animation: { presetId: 'ticker-marquee' } });
      const w = await boot(tpl);

      // The travel is MEASURED: more text must mean a longer marquee. A baked-in keyframe
      // would give the same number twice — that is the whole reason this primitive exists.
      const travelFor = (text) => {
        w.update(JSON.stringify({ f0: text }));
        const seg = w.tickerMarquee('#ticker-track');
        const d = seg.duration();
        seg.kill();
        return d;
      };
      const shortTravel = travelFor(short);
      const longTravel = travelFor(long);

      // A missing builder must be a silent no-op, never a crash (the interpreter's contract).
      const broken = { ...tpl, js: tpl.js.replace('"build": "tickerMarquee"', '"build": "goneAway"') };
      const wBroken = await boot(broken);
      let survived = true;
      try { wBroken.buildInTimeline().pause(); } catch (e) { survived = false; }

      return { shortTravel, longTravel, longerWithMoreText: longTravel > shortTravel * 1.5, survived };
    })(${JSON.stringify(SHORT_TEXT)}, ${JSON.stringify(LONG_TEXT)})`,
  );
  expect(result.longerWithMoreText).toBe(true);
  expect(result.survived).toBe(true);

  // The timeline surfaces the segment read-only: it names the builder, and it carries no
  // keyframe diamonds — there is nothing here to edit visually, and the UI must not pretend.
  await page.evaluate(`(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    useTemplateStore.getState().applyTemplate(variantById('tk01').create(), { resetSampleData: true });
  })()`);
  const bar = page.getByTestId('tlv2-measured-tickerMarquee');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('tickerMarquee()');
  await expect(page.locator('.tlv2-measured-row .tlv2-diamond')).toHaveCount(0);
});

// The importer can carry a NAMED builder across (that is what `tl.add(tickerMarquee(...))`
// buys us). It cannot lift arbitrary measured JS out of somebody's hand-written
// buildInTimeline — so a saved/community ticker that inlines its own scrollWidth math is
// REFUSED honestly: it stays legacy and renders read-only on the classic strip, rather than
// being half-converted or guessed at (docs/DYNAMIC_MOTION_SCOPE.md §8.1 — the ratified reason
// Phase 8 keeps a read-only legacy renderer instead of deleting the strip outright).
const HAND_WRITTEN_MEASURED_REGION = [
  '/* == ANIMATION (generated — the Animation panel rewrites this block) == */',
  'var animSpeed = 1;',
  "var easeIn = 'power2.out';",
  "var easeOut = 'power2.in';",
  'function buildInTimeline() {',
  "  var track = document.getElementById('ticker-track');",
  '  var oneSet = track.scrollWidth / 2;', // measured inline — nothing here can be named
  '  var tl = gsap.timeline();',
  "  tl.set('.ticker', { opacity: 1 });",
  "  tl.fromTo(track, { x: 0 }, { x: -oneSet, duration: 8, ease: 'none', repeat: -1 });",
  '  return tl;',
  '}',
  'function buildOutTimeline() {',
  '  var tl = gsap.timeline();',
  "  tl.set('.ticker', { opacity: 0 });",
  '  return tl;',
  '}',
  '/* == END ANIMATION == */',
].join('\n');

test('a hand-written DOM-measured region is refused, not guessed at', async ({ page }) => {
  await toApp(page);
  const result = await page.evaluate(async (region) => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { importAnimData } = await import('/src/blocks/animImport.ts');
    const tpl = variantById('tk01').create({});
    const OPEN = '/* == ANIMATION';
    const CLOSE = '/* == END ANIMATION == */';
    const s = tpl.js.indexOf(OPEN);
    const e = tpl.js.indexOf(CLOSE) + CLOSE.length;
    const handWritten = { ...tpl, js: tpl.js.slice(0, s) + region + tpl.js.slice(e) };
    return {
      handWrittenRefused: importAnimData(handWritten) === null,
      // …while the catalog's own ticker, whose region names its builder instead of inlining
      // the measurement, creates as a data block in the first place.
      catalogIsDataBlock: tpl.js.includes('var NOACG_ANIM'),
    };
  }, HAND_WRITTEN_MEASURED_REGION);
  expect(result).toEqual({ handWrittenRefused: true, catalogIsDataBlock: true });
});

// ── Infographics: parity on the MEASURED VALUES ──────────────────────────────────────────
//
// Every infographic moves by a number that only exists once the operator's data is in the DOM:
// the stat counts to the figure they typed, each bar grows to its own data-value, the ring draws
// to that percent, the list cascades one row per line they wrote. So the parity bar here is not
// opacity and transform (the generic harness's vocabulary — it would pass vacuously) but the
// measured outputs themselves. Both twins are seeked WITH events, because the count's motion IS
// a callback: it writes textContent on every update, and a suppressed seek would show nothing
// moving in either twin and prove nothing.

// THE ZERO RULE, and why parity here is not "identical at every frame"
// (src/templates/infographics/AGENTS.md; the interpreter's side in templates/shared/animRuntime.ts).
//
// A playout server writes the data BEFORE it takes the graphic - SPX, CasparCG and the playout
// dashboard all call update() and then play(). A count that empties its own readout when the
// COUNT starts therefore leaves the operator's real figure on air for the whole head start the
// entrance gives it, then snaps to zero and counts back up to the number that was just there.
// The owner walked that defect and ruled on it (2026-08-28): a played graphic must NEVER show
// its figure before the count. So a builder that owns a readout now takes the step's head start
// as opts.lead and marks the timeline it returns, and the interpreter adds that one at 0 - the
// opening zero lands on the entrance's FIRST frame while the count still starts and lands
// exactly where it did.
//
// The legacy twin cannot do that: the region's `tl.add(builder(...), 0.4 / animSpeed)` positions
// the whole segment, opening zero included, at the head start. That is the behaviour the fix
// deliberately changed, so before the count begins the two representations DIVERGE ON PURPOSE -
// and on the readout alone. `zeroRule` names the times inside that window: there the emitted
// graphic must already show the zero form, while every other measured channel (bars, ring, rows)
// still has to match the legacy twin frame for frame. `times` is the window where the two are
// simply equal again.
//
// Only the emitted representation ships - every catalog infographic creates as a data block, and
// the interpreter is what a playout client runs. e2e/counting-settle.spec.ts drives that real
// document in the playout order across the whole catalog; this spec's job is the narrower one of
// keeping the two representations honest about where, and why, they differ.
const IG_CASES = [
  { variant: 'ig01', presetId: 'count-up', build: 'infographicCountUp', zeroRule: [0], times: [1.2, 2.0, 3.0] },
  { variant: 'ig05', presetId: 'count-up', build: 'infographicCountUp', zeroRule: [0], times: [1.2, 2.0, 3.0] },
  { variant: 'ig02', presetId: 'bars-grow', build: 'infographicBarsGrow', zeroRule: [], times: [0, 0.6, 1.0, 2.2] },
  // 0.4s is ring-fill's head start, and the boundary frame still belongs to the window: the
  // legacy segment's opening set is positioned exactly there and has not rendered yet.
  { variant: 'ig04', presetId: 'ring-fill', build: 'infographicRingFill', zeroRule: [0, 0.4], times: [1.1, 1.8] },
  { variant: 'ig03', presetId: 'rows-cascade', build: 'infographicRowsCascade', zeroRule: [], times: [0, 0.5, 0.7, 1.5] },
  { variant: 'ig06', presetId: 'rows-cascade', build: 'infographicRowsCascade', zeroRule: [], times: [0, 0.5, 0.7, 1.5] },
];

test('parity: infographic measured motion matches the legacy emit, and lands on the data', async ({ page }) => {
  test.setTimeout(180_000);
  await toApp(page);
  const result = await page.evaluate(
    `(async (cases) => {
      ${HARNESS}
      const { variantById } = await import('/src/templates/catalog.ts');
      const { parseAnimData } = await import('/src/blocks/animData.ts');
      const failures = [];
      const landed = {};

      // The measured state of an infographic: what the data made of it.
      function shot(w) {
        const d = w.document;
        const stat = d.getElementById('f0');
        const ring = d.querySelector('.infographic-ring-fill');
        const rows = d.getElementById('infographic-rows');
        return {
          stat: stat ? stat.textContent : null,
          bars: [...d.querySelectorAll('.infographic-bar-fill')].map((b) => b.style.width).join(' '),
          ring: ring ? String(ring.style.strokeDashoffset || '') : '',
          rows: rows ? [...rows.children].map((r) => Number(w.getComputedStyle(r).opacity).toFixed(1)).join(' ') : '',
        };
      }

      for (const c of cases) {
        const tpl = variantById(c.variant).create({ animation: { presetId: c.presetId } });
        const data = parseAnimData(tpl.js);
        if (!data) { failures.push(c.variant + ': creation did not emit the data block'); continue; }

        // The measured motion must ride across as a dynamics segment naming its builder...
        const dyn = (data.steps[0].dynamics || [])[0];
        if (!dyn || dyn.build !== c.build) {
          failures.push(c.variant + ': expected a dynamics segment building ' + c.build + ', got ' + JSON.stringify(dyn));
          continue;
        }
        // ...and the builder must ship OUTSIDE the marked region, or the export would carry a
        // data block naming a function that isn't there.
        if (!tpl.js.split('/* == ANIMATION')[0].includes('function ' + c.build + '(')) {
          failures.push(c.variant + ': ' + c.build + '() is not defined outside the marked region');
        }

        const wNew = await boot(tpl);
        const wOld = await boot(await legacyTwin(tpl, c.presetId, false));
        const tlOld = wOld.buildInTimeline(); tlOld.pause();
        const tlNew = wNew.buildInTimeline(); tlNew.pause();
        tlOld.seek(0.001, false); tlNew.seek(0.001, false);

        // Inside the zero-rule window the readout is the ONE channel allowed to differ, and the
        // emitted side is the one that has to be right: it already shows the zero form while the
        // legacy twin still carries the operator's figure. Everything else is held to full parity
        // here too, so dropping these frames from the equality pass costs no coverage.
        // Everything BUT the readout, spread rather than listed: a channel added to shot()
        // is covered here the day it is added, instead of quietly falling out of this pass.
        const rest = (s) => JSON.stringify({ ...s, stat: null });
        for (const t of (c.zeroRule || [])) {
          tlOld.seek(t, false); tlNew.seek(t, false);   // false = let the callbacks fire
          const a = shot(wOld); const b = shot(wNew);
          if (rest(a) !== rest(b))
            failures.push(c.variant + ' @' + t + 's (zero rule): everything but the readout must still match: ' + rest(a) + ' vs ' + rest(b));
          // parseFloat, not a pattern: it reads the figure out of '0%' / '0' / '124,213' alike,
          // and this string lives inside a page-evaluated template literal where a backslash is
          // one more thing to get wrong.
          if (parseFloat(String(b.stat)) !== 0)
            failures.push(c.variant + ' @' + t + 's (zero rule): the played graphic must show the zero form before its count, got ' + JSON.stringify(b.stat));
        }

        for (const t of c.times) {
          tlOld.seek(t, false); tlNew.seek(t, false);   // false = let the callbacks fire
          const a = JSON.stringify(shot(wOld));
          const b = JSON.stringify(shot(wNew));
          if (a !== b) failures.push(c.variant + ' @' + t + 's: ' + a + ' vs ' + b);
        }
        landed[c.variant] = shot(wNew);   // the settled state: it must be the operator's data
        tlOld.kill(); tlNew.kill();
      }
      return { failures, landed };
    })(${JSON.stringify(IG_CASES)})`,
  );
  expect(result.failures).toEqual([]);

  // And the measured values are the DATA's, not a hard-coded number: the stat lands on exactly
  // the text the field holds (commas and suffix intact), each bar on its own data-value.
  const landed = result.landed as Record<string, { stat: string; bars: string; ring: string; rows: string }>;
  expect(landed.ig01.stat).toBe('87%');
  expect(landed.ig05.stat).toBe('124,213');
  expect(landed.ig05.bars).toBe('49.6852%'); // total / goal
  expect(landed.ig02.bars).toBe('78% 54% 36%'); // one bar per line, each on its own value
  expect(landed.ig04.ring).toBe('32px'); // 100 - 68: the ring drew to the stat's percent
  expect(landed.ig03.rows).toBe('1.0 1.0 1.0 1.0 1.0');
  expect(landed.ig06.rows).toBe('1.0 1.0 1.0');
});

test('the preset registry lists every family exactly once', async ({ page }) => {
  // ALL_PRESETS is a SET, and nothing about the shape of a hand-written concatenation says so.
  // It shipped with six families spread TWICE (starting soon, game timers, infographics,
  // versus, quiz, imported design) while the second block was being extended with poll and
  // audience — so the wizard's Animation step drew each of those presets as two identical
  // cards, and the only thing that ever mentioned it was React's duplicate-key warning in the
  // console. Module-level: the claim is about the registry, not about any one design.
  await page.goto('/app');
  const report = await page.evaluate(async () => {
    const { ALL_PRESETS } = await import('/src/blocks/presetRegistry.ts');
    const ids = (ALL_PRESETS as unknown as { id: string }[]).map((p) => p.id);
    return { total: ids.length, dupes: [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))] };
  });
  expect(report.dupes).toEqual([]);
  expect(report.total).toBeGreaterThan(0);
});
