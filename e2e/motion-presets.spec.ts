import { test, expect, type Page } from '@playwright/test';
import { chooseType, pickDesign } from './_browse';
import { settleDurableWrites } from './_durable';
import { dropSvg, QUIZ_SVG, SCOREBUG_SVG } from './_svg-import';
import { addToProductionFromFinish } from './_create';

// THE UNIVERSAL IN/OUT PRESET PICKER (blocks/motionPresets.ts, components/MotionPresetPicker.tsx):
// the no-code way to change how a graphic comes on and goes off air, for ANY graphic whose motion
// lives in the NOACG_ANIM data block. Two hosts, one engine: a saved graphic's CONTROL page and
// the wizard's Animation step for an imported design. These cases pin:
//   - the control page rewrites the entrance/exit as DATA on the graphic's unit(s), saves it, reads
//     the lit card back from the template (never from component state), and survives a reload;
//   - a phase can be picked alone (In only / Out only) and the speed knob writes NOACG_ANIM.speed;
//   - the engine KEEPS what it promised to keep - lifecycle calls, ambient loops, layers outside
//     the root - and clears a styled lifecycle arrow that would otherwise play instead;
//   - the wizard's imported-design Animation step leads with the bank, drawn as SIX family cards
//     (plus the SVG layer stagger), and a wizard pick lands as the same data the control page
//     reads back;
//   - the easing dropdown offers what the picked motion can actually RENDER, and drops an
//     impossible choice to Auto rather than keeping a setting that does nothing - on the wizard's
//     Animation step AND on the control page, where the curve used to be frozen at creation;
//   - a catalog design keeps its own choreographies and meets the universal six under them.

/** Save one catalog design to the library and open its control page. */
async function openControlPage(page: Page, category: string, name: string): Promise<string> {
  await page.goto('/app');
  await expect(page.locator('.topbar')).toBeVisible();
  const id = await page.evaluate(async ([cat, gname]) => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const { doc, error } = createGraphic(variantsFor(cat)[0].create({}), { name: gname });
    if (error) throw new Error(error);
    return doc.id;
  }, [category, name] as const);
  await settleDurableWrites(page);
  await page.goto(`/app#/control/${id}`);
  await expect(page.getByTestId('graphic-control-page')).toBeVisible();
  return id;
}

/** The saved graphic's animation data, read from the LIBRARY record (what the page persisted). */
async function savedAnim(page: Page, id: string) {
  return page.evaluate(async (gid) => {
    const { graphicById } = await import('/src/model/library.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const doc = graphicById(gid);
    if (!doc) throw new Error('graphic gone');
    const d = parseAnimData(doc.template.js);
    if (!d) throw new Error('no data block');
    const step = (i: number) => d.steps[i < 0 ? d.steps.length + i : i];
    const tracks = (i: number, sel: string) => {
      const layer = step(i).layers[sel];
      return layer
        ? Object.fromEntries(Object.entries(layer).map(([prop, kfs]) => [prop, kfs.map((k) => [k.time, k.value])]))
        : null;
    };
    return {
      speed: d.speed,
      inLayers: Object.keys(step(0).layers),
      outLayers: Object.keys(step(-1).layers),
      inDuration: step(0).duration,
      outDuration: step(-1).duration,
      box: { in: tracks(0, '.lower-third-box'), out: tracks(-1, '.lower-third-box') },
      accent: { in: tracks(0, '.lower-third-accent'), out: tracks(-1, '.lower-third-accent') },
    };
  }, id);
}

test('control page: the Motion section rewrites the entrance and exit on the graphic as one unit, saves it, and lights the card it reads back', async ({ page }) => {
  const id = await openControlPage(page, 'lower-third', 'Motion strap');

  // Closed by default, naming what the graphic does now: a catalog strap arrives with its own
  // tuned choreography, which is none of these cards.
  const summary = page.getByTestId('control-motion-summary');
  await expect(summary).toContainText('In: its own');
  await expect(summary).toContainText('Out: its own');
  await summary.click();
  // SIX cards, not ten: Slide's four directions and Wipe's two are arrows inside their own
  // cell, so the grid asks one question per motion rather than one per direction of one motion.
  const cards = page.locator('.motion-card');
  await expect(cards).toHaveCount(6);
  await expect(page.locator('.motion-card[data-selected]')).toHaveCount(0);

  // Pick Rise for both phases (the default direction) — the ↑ arrow of the Slide family.
  await page.getByTestId('motion-rise').click();
  await expect(summary).toContainText('In: Rise · Out: Rise');
  await expect(page.locator('.motion-card[data-selected]')).toHaveText(/Slide/);
  await settleDurableWrites(page);
  let anim = await savedAnim(page, id);
  // The UNIT is the root's children - the accent beside the box and the box - moving together;
  // the strap's own line choreography (#f0, #f1 rising out of their masks) is gone from both
  // steps: a clean swap, so two picks never blend.
  expect(anim.inLayers.sort()).toEqual(['.lower-third-accent', '.lower-third-box']);
  expect(anim.outLayers.sort()).toEqual(['.lower-third-accent', '.lower-third-box']);
  expect(anim.box.in).toEqual({ opacity: [[0, 0], [0.8, 1]], y: [[0, 110], [0.8, 0]] });
  expect(anim.accent.in).toEqual(anim.box.in);
  expect(anim.box.out).toEqual({ opacity: [[0, 1], [0.45, 0]], y: [[0, 0], [0.45, 80]] });
  expect(anim.inDuration).toBe(0.8);
  expect(anim.outDuration).toBe(0.45);

  // Out only: the exit changes, the entrance keeps Rise - "rise in, fade out" without a timeline.
  await page.getByTestId('motion-direction-out').click();
  await page.getByTestId('motion-fade').click();
  await expect(summary).toContainText('In: Rise · Out: Fade');
  await settleDurableWrites(page);
  anim = await savedAnim(page, id);
  expect(anim.box.in).toEqual({ opacity: [[0, 0], [0.8, 1]], y: [[0, 110], [0.8, 0]] });
  expect(anim.box.out).toEqual({ opacity: [[0, 1], [0.45, 0]] });
  expect(anim.outDuration).toBe(0.45);

  // The speed knob is NOACG_ANIM.speed - one number, every phase. 1.8, not the old 1.5: the
  // ±33% steps read as "no change" on the owner's walk (model/wizard.ts AnimSpeed).
  await page.getByTestId('control-speed-1.8').click();
  await expect(summary).toContainText('Faster');
  await settleDurableWrites(page);
  expect((await savedAnim(page, id)).speed).toBe(1.8);

  // A reload reads the cards back from the TEMPLATE: nothing here lived in component state.
  await page.reload();
  await expect(page.getByTestId('graphic-control-page')).toBeVisible();
  await expect(page.getByTestId('control-motion-summary')).toContainText('In: Rise · Out: Fade · Faster');
  await page.getByTestId('control-motion-summary').click();
  await page.getByTestId('motion-direction-in').click();
  await expect(page.locator('.motion-card[data-selected]')).toHaveText(/Slide/);
  // …and the family's own arrow says WHICH slide it is — the direction survives the reload too.
  await expect(page.getByTestId('motion-rise')).toHaveClass(/active/);
  await page.getByTestId('motion-direction-out').click();
  await expect(page.locator('.motion-card[data-selected]')).toHaveText(/Fade/);
});

test('engine: a motion rewrite keeps lifecycle calls, ambient loops and layers outside the root, and clears a styled lifecycle arrow', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('.topbar')).toBeVisible();
  const r = await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { applyMotionPreset, currentMotionPreset, motionTargets, MOTION_PRESETS } = await import('/src/blocks/motionPresets.ts');
    const { deriveMachine } = await import('/src/blocks/animMachine.ts');

    // A clock: its entrance fires startClock and breathes an ambient layer; both are behaviour,
    // not the entrance motion, so they ride through a Fade untouched.
    const clock = variantsFor('starting-soon')[0].create({});
    const clockData = parseAnimData(clock.js)!;
    const clockNext = applyMotionPreset(clock, clockData, { in: 'fade', out: 'fade' })!;
    const loopsBefore = Object.keys(clockData.steps[0].loops ?? {}).sort();
    const loopsAfter = Object.keys(clockNext.steps[0].loops ?? {}).sort();

    // A styled lifecycle arrow would play INSTEAD of the step's keyframes: the rewrite clears it.
    // The strap, with one element parked OUTSIDE its root - where an inserted graphic lives -
    // and its derived machine made explicit so the play arrow can carry a style.
    const plain = variantsFor('lower-third')[0].create({});
    const strap = { ...plain, html: plain.html.replace('</body>', '<div id="outside-part"></div></body>') };
    const base = parseAnimData(strap.js)!;
    const explicit = { ...base, machine: JSON.parse(JSON.stringify(deriveMachine(base))) };
    const play = explicit.machine!.groups[0].transitions.find((t) => t.trigger === 'lifecycle' && t.event === 'play')!;
    play.style = 'push-left';
    play.duration = 0.8;
    // ...and a layer OUTSIDE the root (an inserted graphic's part) keeps its own motion.
    explicit.steps[0].layers['#outside-part'] = { opacity: [{ time: 0, value: 0 }, { time: 1.2, value: 1 }] };
    const strapNext = applyMotionPreset(strap, explicit, { in: 'slide-left' })!;
    const playAfter = strapNext.machine!.groups[0].transitions.find((t) => t.trigger === 'lifecycle' && t.event === 'play')!;
    const stopAfter = strapNext.machine!.groups[0].transitions.find((t) => t.trigger === 'lifecycle' && t.event === 'stop')!;

    // Every preset is recognised back from what it wrote, on every catalog category that
    // carries a data block - the round trip the control page's lit card depends on.
    const misses: string[] = [];
    for (const cat of ['lower-third', 'info-card', 'scoreboard', 'quiz', 'ticker', 'end-credits', 'starting-soon', 'poll', 'audience', 'frame', 'transition', 'esports-score', 'infographic', 'corner-bug']) {
      const t = variantsFor(cat)[0]?.create({});
      const d = t && parseAnimData(t.js);
      if (!t || !d) { misses.push(`${cat}: no data block`); continue; }
      if (motionTargets(t, d).length === 0) misses.push(`${cat}: no unit`);
      for (const p of MOTION_PRESETS) {
        const n = applyMotionPreset(t, d, { in: p.id, out: p.id });
        if (!n) { misses.push(`${cat}/${p.id}: not applied`); continue; }
        if (currentMotionPreset(t, n, 'in') !== p.id) misses.push(`${cat}/${p.id}: in not read back`);
        if (currentMotionPreset(t, n, 'out') !== p.id) misses.push(`${cat}/${p.id}: out not read back`);
      }
      // Hidden data holders (the SPX sources a quiz, a ticker, a clock write into) are never a
      // unit: a motion on a display:none div is noise in the data and nothing on screen.
      const holders = [...new DOMParser().parseFromString(t.html, 'text/html').querySelectorAll('.noacg-data-source')].map((e) => `#${e.id}`);
      for (const h of holders) if (motionTargets(t, d).includes(h)) misses.push(`${cat}: ${h} is a holder, not a unit`);
    }
    return {
      clockCalls: clockNext.steps[0].calls?.map((c) => c.call),
      clockDuration: [clockData.steps[0].duration, clockNext.steps[0].duration],
      loopsBefore,
      loopsAfter,
      playStyle: playAfter.style ?? null,
      stopStyle: stopAfter.style ?? null,
      outsideKept: strapNext.steps[0].layers['#outside-part'],
      inDuration: strapNext.steps[0].duration,
      misses,
    };
  });
  expect(r.clockCalls).toContain('startClock');
  // The clock's entrance step is as long as its kept breath and call need - never truncated.
  expect(r.clockDuration[1]).toBe(r.clockDuration[0]);
  expect(r.loopsAfter).toEqual(r.loopsBefore);
  expect(r.loopsBefore.length).toBeGreaterThan(0);
  expect(r.playStyle).toBeNull();
  expect(r.outsideKept).toEqual({ opacity: [{ time: 0, value: 0 }, { time: 1.2, value: 1 }] });
  // The step stretches to the kept motion's reach (1.2 s) rather than the preset's 0.8 s.
  expect(r.inDuration).toBe(1.2);
  expect(r.misses).toEqual([]);
});

test('wizard: an imported SVG picks from the same ten motions on its Animation step, and the control page reads the pick back', async ({ page }) => {
  await page.goto('/app');
  await dropSvg(page, SCOREBUG_SVG);
  await page.locator('.wz-modal').getByRole('button', { name: 'Next' }).click(); // Animation
  await expect(page.getByTestId('wz-stepcount')).toContainText('4');

  // The universal bank replaces the category's four whole-unit cards and draws as SIX family
  // cards; the SVG layer stagger - the one card that knows this design's own layers - stays
  // beside them, so seven in total where there used to be eleven.
  await expect(page.locator('.motion-card')).toHaveCount(7);
  await expect(page.getByTestId('wz-anim-design-stagger')).toBeVisible();
  await expect(page.locator('.wz-anim', { hasText: 'Pop' })).toHaveCount(1);
  // Fade is the default, lit for both phases before anything is picked.
  await expect(page.locator('.motion-card[data-selected]')).toHaveText(/Fade/);

  await page.getByTestId('motion-slide-left').click();
  await expect(page.locator('.motion-card[data-selected]')).toHaveText(/Slide/);
  await expect(page.getByTestId('motion-slide-left')).toHaveClass(/active/);

  // Finish into a production, then find the saved graphic's control page.
  await page.locator('.wz-modal').getByRole('button', { name: 'Next' }).click(); // Finish
  await expect(page.getByTestId('wz-stepcount')).toContainText('5');
  await page.getByTestId('wz-finish-name').fill('Slid scorebug');
  await page.getByTestId('wz-finish-production-pick').locator('select').selectOption('new');
  await page.getByTestId('wz-finish-production-name').fill('Motion night');
  await addToProductionFromFinish(page);
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
  await settleDurableWrites(page);

  const id = await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    const g = loadGraphics().find((x) => x.name === 'Slid scorebug');
    if (!g) throw new Error('graphic not saved');
    return g.id;
  });
  await page.goto(`/app#/control/${id}`);
  await expect(page.getByTestId('graphic-control-page')).toBeVisible();
  // One engine: what the wizard wrote is what this page reads back.
  await expect(page.getByTestId('control-motion-summary')).toContainText('In: Slide left · Out: Slide left');
  const unit = await page.evaluate(async (gid) => {
    const { graphicById } = await import('/src/model/library.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const d = parseAnimData(graphicById(gid)!.template.js)!;
    return { inLayers: Object.keys(d.steps[0].layers), x: d.steps[0].layers['.imported-design-box']?.x?.map((k) => k.value) };
  }, id);
  expect(unit.inLayers).toEqual(['.imported-design-box']);
  expect(unit.x).toEqual([170, 0]);
});

test('wizard: the layer stagger spends its beats on what is visible, and the words take their turn', async ({
  page,
}) => {
  // OWNER, 2026-09-05, on the quiz board: "it staggers the background graphic, but they're not one
  // at a time… The text is also visible from the start, which is not how an animation should work.
  // The animation should also stagger the text."
  //
  // Two faults, one measurement. The member list took every top-level group, and on this board 13
  // of 19 are the drawn moments a quiz hides until it needs them - so most of the cascade was
  // beats with nothing in them. And a field could never be a member at all, so the words sat at
  // full opacity while the artwork arrived behind them.
  await page.goto('/app');
  await dropSvg(page, QUIZ_SVG);
  await page.locator('.wz-modal').getByRole('button', { name: 'Next' }).click(); // Animation
  await page.getByTestId('wz-anim-design-stagger').click();
  await page.locator('.wz-modal').getByRole('button', { name: 'Next' }).click(); // Finish
  await page.getByTestId('wz-finish-name').fill('Staggered quiz');
  await page.getByTestId('wz-finish-production-pick').locator('select').selectOption('new');
  await page.getByTestId('wz-finish-production-name').fill('Stagger night');
  await addToProductionFromFinish(page);
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
  await settleDurableWrites(page);

  const beats = await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const g = loadGraphics().find((x) => x.name === 'Staggered quiz');
    if (!g) throw new Error('graphic not saved');
    const step = parseAnimData(g.template.js)!.steps[0];
    return Object.entries(step.layers).map(([selector, tracks]) => ({
      selector,
      // When this member's first keyframe sits, and what it opens at.
      start: Math.min(...Object.values(tracks).map((kfs) => kfs[0].time)),
      opensAt: tracks.opacity?.[0]?.value,
      props: Object.keys(tracks).sort(),
    }));
  });

  // NOT ONE HIDDEN LAYER. The quiz's looks keep the designer's own ids ("A selected",
  // "B correct", "Locked in" - `data-noacg-role` says what each is); every one of them is
  // display:none until the operator gets there, and a beat spent on one is a beat the viewer
  // sees nothing happen in.
  expect(beats.filter((b) => /selected|correct|wrong|Locked/i.test(b.selector))).toEqual([]);

  // The words ARE members, and each opens hidden - which is the half he could see.
  const words = beats.filter((b) => /^#f\d+$/.test(b.selector));
  expect(words.length).toBeGreaterThanOrEqual(4);
  for (const w of words) {
    expect(w.opensAt).toBe(0);
    // Opacity alone: their rise belongs to the layer they sit in, and tweening y on both would
    // move a word twice as far as the plate under it.
    expect(w.props).toEqual(['opacity']);
  }

  // ONE AT A TIME: every member starts after the one before it, by a gap big enough to read as
  // separate. The exact number is tuned; that it is a real gap is the contract.
  const starts = beats.map((b) => b.start).sort((a, b) => a - b);
  const gaps = starts.slice(1).map((t, i) => +(t - starts[i]).toFixed(3));
  expect(Math.min(...gaps.filter((g) => g > 0))).toBeGreaterThanOrEqual(0.07);
  // …and the whole cascade still lands in a broadcast entrance rather than a slideshow.
  expect(starts[starts.length - 1]).toBeLessThan(2.5);
});

// THE EASING DROPDOWN REACTS TO THE MOTION (session A, 2026-08-23). The owner: "I never use the
// dropdown menu because I feel like it doesn't change the easing … How can you do a back ease or
// bounce ease with a fade?" The measurement (model/easings.ts's header) says the choice always
// reached the keyframes and the overshoot curves simply had nowhere to go on a clamped property.
// These cases pin the rule that came out of it: the list is what the motion can SHOW, and a
// choice the new motion cannot show falls back to Auto instead of sitting there doing nothing.
test('wizard: the easing list is what the picked motion can render, and an impossible curve falls back to Auto', async ({ page }) => {
  await page.goto('/app');
  await dropSvg(page, SCOREBUG_SVG);
  await page.locator('.wz-modal').getByRole('button', { name: 'Next' }).click(); // Animation
  await expect(page.getByTestId('wz-stepcount')).toContainText('4');

  const easing = page.locator('.wz-modal .panel-section', { hasText: 'Easing' }).locator('select');
  const options = () => easing.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));

  // Fade animates opacity only, which the renderer clamps at 1: the three displacement curves
  // are absent. Soft is absent too, for the other rule - Fade's tuned entrance IS `sine.out`,
  // so offering Soft beside Auto would be offering the same curve twice.
  await page.getByTestId('motion-fade').click();
  expect(await options()).toEqual(['auto', 'ease-out', 'expo', 'linear']);

  // Slide up moves the graphic, so overshoot has somewhere to go and the same list grows by
  // exactly the three that need it. Nothing else changes — this is one rule, not two lists.
  await page.getByTestId('motion-rise').click();
  // The order is the doctrine's own (safe curves, then playful, then the continuous one), so
  // the three appear before Steady rather than appended at the end.
  expect(await options()).toEqual(['auto', 'ease-out', 'sine', 'expo', 'back', 'bounce', 'elastic', 'linear']);

  // Pick one of the three, then go back to Fade: the choice cannot be rendered there, so it
  // drops to Auto rather than persisting invisibly.
  await easing.selectOption('bounce');
  await expect(easing).toHaveValue('bounce');
  await page.getByTestId('motion-fade').click();
  await expect(easing).toHaveValue('auto');
  expect(await options()).toEqual(['auto', 'ease-out', 'expo', 'linear']);

  // A curve the new motion CAN show is kept — the fallback fires on impossibility, not on
  // every motion click.
  await easing.selectOption('expo');
  await page.getByTestId('motion-zoom').click();
  await expect(easing).toHaveValue('expo');
});

test('control page: the operator can change the curve after creation, and it lands in the emitted code', async ({ page }) => {
  const id = await openControlPage(page, 'lower-third', 'Curved strap');

  /** The ease STRING each phase's unit tracks actually carry — the code, not the control. */
  const savedEases = (gid: string) =>
    page.evaluate(async (g) => {
      const { graphicById } = await import('/src/model/library.ts');
      const { parseAnimData } = await import('/src/blocks/animData.ts');
      const d = parseAnimData(graphicById(g)!.template.js)!;
      const eases = (i: number) => [
        ...new Set(
          Object.values(d.steps[i < 0 ? d.steps.length + i : i].layers).flatMap((layer) =>
            Object.values(layer).map((kfs) => kfs[kfs.length - 1].ease ?? null),
          ),
        ),
      ];
      return { in: eases(0), out: eases(-1) };
    }, gid);

  await page.getByTestId('control-motion-summary').click();
  const easing = page.getByTestId('control-easing');
  const options = () => easing.locator('option').evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value));

  // A catalog strap arrives on its own choreography: there is no universal motion for a curve to
  // shape, so the control says so instead of offering a setting that would go nowhere.
  await expect(easing).toBeDisabled();
  expect(await options()).toEqual(['auto']);

  // Pick Rise, and the same list the wizard offers for it appears — one rule, two hosts.
  await page.getByTestId('motion-rise').click();
  await expect(easing).toBeEnabled();
  expect(await options()).toEqual(['auto', 'ease-out', 'sine', 'expo', 'back', 'bounce', 'elastic', 'linear']);
  // Auto is what a fresh pick holds: each phase on the motion's own tuned pair.
  await expect(easing).toHaveValue('auto');
  await settleDurableWrites(page);
  expect(await savedEases(id)).toEqual({ in: ['power3.out'], out: ['power2.in'] });

  // THE POINT OF THIS CASE: the choice reaches the emitted code after creation.
  await easing.selectOption('bounce');
  await expect(page.getByTestId('control-motion-summary')).toContainText('Bounce');
  await settleDurableWrites(page);
  expect(await savedEases(id)).toEqual({ in: ['bounce.out'], out: ['power2.in'] });

  // …and it is read back from the TEMPLATE, so a reload still shows what plays.
  await page.reload();
  await expect(page.getByTestId('graphic-control-page')).toBeVisible();
  await expect(page.getByTestId('control-motion-summary')).toContainText('In: Rise · Out: Rise · Normal · Bounce');
  await page.getByTestId('control-motion-summary').click();
  await expect(page.getByTestId('control-easing')).toHaveValue('bounce');

  // A motion that cannot SHOW the curve drops it to Auto (Fade animates opacity, which clamps) —
  // and the phase that was not picked is rewritten with it, so no phase keeps a curve the
  // control has stopped offering.
  await page.getByTestId('motion-direction-out').click();
  await page.getByTestId('motion-fade').click();
  await expect(page.getByTestId('control-easing')).toHaveValue('auto');
  await settleDurableWrites(page);
  expect(await savedEases(id)).toEqual({ in: ['power3.out'], out: ['sine.in'] });

  // A curve the new motion CAN show is kept — the fallback fires on impossibility, not on every
  // motion click.
  await page.getByTestId('control-easing').selectOption('expo');
  await settleDurableWrites(page);
  expect(await savedEases(id)).toEqual({ in: ['expo.out'], out: ['expo.in'] });
  await page.getByTestId('motion-direction-both').click();
  await page.getByTestId('motion-zoom').click();
  await expect(page.getByTestId('control-easing')).toHaveValue('expo');
  await settleDurableWrites(page);
  expect(await savedEases(id)).toEqual({ in: ['expo.out'], out: ['expo.in'] });
});

test('wizard: a catalog design keeps its own cards and offers the universal six under them', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, 'Lower thirds');
  await pickDesign(page, 'Hairline');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.locator('.wz-anim-grid')).toBeVisible();

  // The design's own choreographies lead, in their own grid. Not one of them is a whole-unit
  // motion the universal bank duplicates (they all move a box AND stagger the lines inside it),
  // so the bank is an addition here — folded away, and empty-handed until it is opened.
  const fold = page.getByTestId('wz-anim-universal');
  await expect(fold).toBeVisible();
  // Closed: the cards are in the DOM but take no room. `toBeVisible()` is blind to the UA's
  // display rule on a closed <details> (e2e/AGENTS.md), so this measures the height.
  const gridHeight = () => page.locator('.motion-grid').evaluate((el) => el.getBoundingClientRect().height);
  expect(await gridHeight()).toBe(0);
  await fold.locator('summary').click();
  expect(await gridHeight()).toBeGreaterThan(0);
  await expect(page.locator('.motion-card')).toHaveCount(6);

  // Picking one writes the unit motion onto THIS design — the same engine, on a category that
  // never saw the universal bank before. Read out of the LIVE PREVIEW's own emitted data block,
  // which is the code the Create button would hand over.
  await page.getByTestId('motion-drop').click();
  await expect(page.locator('.motion-card[data-selected]')).toHaveText(/Slide/);
  await expect
    .poll(
      async () => {
        try {
          return await page
            .frameLocator('.wz-side iframe')
            .locator('body')
            .evaluate(() => {
              const anim = (window as unknown as Record<string, { steps: { layers: Record<string, Record<string, { value: unknown }[]>> }[] }>).NOACG_ANIM;
              if (!anim) return null;
              const layers = anim.steps[0].layers;
              const y = layers['.lower-third-box']?.y?.map((k) => k.value);
              // The lines' own stagger is gone from the entrance: a unit motion is a clean swap
              // here exactly as it is on the control page.
              const lines = Object.keys(layers).filter((s) => /#f\d/.test(s)).length;
              return JSON.stringify({ y, lines });
            });
        } catch {
          return null; // caught mid-rebuild; the poll retries against the fresh document
        }
      },
      { timeout: 15_000 },
    )
    .toBe(JSON.stringify({ y: [-110, 0], lines: 0 }));
});
