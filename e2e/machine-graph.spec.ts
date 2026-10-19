// covers: src/blocks/**, src/templates/**

import { test, expect, type Page, type FrameLocator } from '@playwright/test';

// The machine graph surface (src/components/timeline/MachineGraph.tsx, the node editor in the
// retired code editor's dock) was deleted on 2026-10-17 with the sixteen cases that drove it.
// What is left is the MUTATOR and RUNTIME half: blocks/machineEdit's edits re-emit the region
// under older interpreters, the walk's arrows survive structural step edits, and a styled
// transition plays and lands on its pose. The two runtime cases style the arrows through the
// same mutator the graph called (setTransitionStyle) and run the styled graphic composed the
// way playout composes it.

/** A catalog design with the named arrows styled through blocks/machineEdit, composed the way
 *  playout composes it and mounted in a hidden iframe. `pick` names a transition of the main
 *  group by its trigger and event. Returns the styled js, for what the region now says. */
async function mountStyled(
  page: Page,
  variantId: string,
  styles: { trigger: string; event: string; style: string }[],
): Promise<{ doc: FrameLocator; js: string; deleteRefused: boolean }> {
  const result = await page.evaluate(
    async ([id, list]) => {
      const { variantById } = await import('/src/templates/catalog.ts');
      const { parseAnimData } = await import('/src/blocks/animData.ts');
      const { setTransitionStyle, removeTransition } = await import('/src/blocks/machineEdit.ts');
      const { deriveMachine } = await import('/src/blocks/animMachine.ts');
      const { writeAnimData } = await import('/src/templates/shared/animRuntime.ts');
      const { composeDocument } = await import('/src/preview/composeDocument.ts');
      const tpl = variantById(id)!.create({});
      let data = parseAnimData(tpl.js)!;
      // The mutators materialize a derived machine on the first edit, in this same order.
      const indexOf = (trigger: string, event: string) =>
        (data.machine ?? deriveMachine(data)).groups[0].transitions.findIndex((t) => t.trigger === trigger && t.event === event);
      let deleteRefused = true;
      for (const pick of list) {
        const index = indexOf(pick.trigger, pick.event);
        if (index < 0) throw new Error(`no ${pick.trigger} transition for ${pick.event}`);
        // Delete refuses a lifecycle edge: play and stop always exist.
        if (pick.trigger === 'lifecycle' && removeTransition(data, 'main', index) !== null) deleteRefused = false;
        const next = setTransitionStyle(data, 'main', index, pick.style);
        if (!next) throw new Error(`the ${pick.event} arrow took no style`);
        data = next;
      }
      const js = writeAnimData(tpl.js, data);
      if (!js) throw new Error('the region did not write');
      document.querySelectorAll('iframe.styled-document').forEach((f) => f.remove());
      const f = document.createElement('iframe');
      f.className = 'styled-document';
      f.style.cssText = 'position:fixed;left:-4000px;top:0;width:1920px;height:1080px;';
      document.body.appendChild(f);
      await new Promise((res) => { f.onload = res; f.srcdoc = composeDocument({ ...tpl, js }); });
      return { js, deleteRefused };
    },
    [variantId, styles] as const,
  );
  return { doc: page.frameLocator('iframe.styled-document'), ...result };
}

test('a styled transition plays the arrow\'s change and lands exactly on the target pose', async ({ page }) => {
  await page.goto('/app');
  await page.keyboard.press('Escape');
  // Style the question → selected arrow (fade), then fire it in the composed graphic.
  const { doc } = await mountStyled(page, 'qz01', [{ trigger: 'operator', event: 'select', style: 'fade' }]);

  // ONE evaluate call, like the interpreter's own dispatch sequence used to run against a
  // direct contentWindow reference: noacgDispatch can recurse synchronously into processing a
  // queued follow-up event, and splitting this into separate round trips (a play() call, an
  // externally-timed wait, then a dispatch call) desyncs that recursion from real wall time
  // closely enough to throw — reproducible even against the pre-conversion app code, so it is
  // purely about keeping the sequence in one page-side execution, not about same-origin access.
  const result = await doc
    .locator('body')
    .evaluate(async () => {
      const w = window as unknown as {
        play?: () => void;
        noacgDispatch?: (e: string) => unknown;
        noacgMachineState?: () => { groups: Record<string, string> };
      };
      const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
      w.play?.();
      await sleep(900); // the entrance settles
      w.noacgDispatch?.('select');
      const pointerMovedSynchronously = w.noacgMachineState?.().groups.main === 'selected';
      // The pose alone also passes for a broken fade. Sample the change itself in-frame.
      const root = document.querySelector('.quiz') as HTMLElement;
      let minimumOpacity = 1;
      const until = performance.now() + 1400;
      while (performance.now() < until) {
        minimumOpacity = Math.min(minimumOpacity, Number(getComputedStyle(root).opacity));
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      const opacity = Number(getComputedStyle(root).opacity);
      return { pointerMovedSynchronously, minimumOpacity, opacity, state: w.noacgMachineState?.().groups.main };
    });

  expect(result.pointerMovedSynchronously).toBe(true);
  expect(result.state).toBe('selected');
  expect(result.minimumOpacity).toBeLessThan(0.9);
  // The fade ends ON the pose: fully visible again, never stuck half-faded.
  expect(result.opacity).toBeGreaterThan(0.99);
});

test('a style write under a pre-styles interpreter re-emits the region (the pairing rule)', async ({ page }) => {
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const result = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { setTransitionStyle } = await import('/src/blocks/machineEdit.ts');
    const { writeAnimData, hasTransitionStyleRuntime } = await import('/src/templates/shared/animRuntime.ts');
    const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
    const tpl = variantById('qz01')!.create({});
    // Simulate a saved template whose frozen interpreter predates transition styles.
    const oldJs = tpl.js.replace(/function noacgStyleTimeline/g, 'function noacgFrozenStyleTimeline');
    const data = parseAnimData(oldJs)!;
    const styled = setTransitionStyle(data, 'main', 1, 'fade')!;
    const written = writeAnimData(oldJs, styled)!;
    // The write re-emitted the whole region, so the styled arrow can actually play…
    const reEmitted = hasTransitionStyleRuntime(written);
    // …while validation catches the broken pairing if someone hand-splices instead.
    const spliced = { ...tpl, js: oldJs.replace('"trigger": "operator", "event": "select"', '"trigger": "operator", "event": "select", "style": "fade"') };
    const verdict = validateTemplate(spliced);
    const pairingError = verdict.errors.some((e) => e.message.includes('predates transition styles'));
    return { reEmitted, pairingError };
  });
  expect(result.reEmitted).toBe(true);
  expect(result.pairingError).toBe(true);
});

test('the entrance and exit are real arrows: stylable, guarded, and next() keeps its no-op parity', async ({ page }) => {
  await page.goto('/app');
  await page.keyboard.press('Escape');

  // A default two-step lower third used to have NO selectable arrow at all — play and the
  // final-stop edge were the walk's own synthetic drawing, so Cut/Fade could never be applied
  // to an entrance or an exit. They are materialised lifecycle transitions now: styling the
  // entrance materializes the derived machine WITH the edge, style and all, the exit takes the
  // broadcast CUT, and delete refuses a lifecycle edge (play and stop always exist).
  const { doc, js, deleteRefused } = await mountStyled(page, 'lt01', [
    { trigger: 'lifecycle', event: 'play', style: 'fade' },
    { trigger: 'lifecycle', event: 'stop', style: 'cut' },
  ]);
  expect(js).toContain('"trigger": "lifecycle", "event": "play", "style": "fade"');
  expect(js).toContain('"trigger": "lifecycle", "event": "stop", "style": "cut"');
  expect(deleteRefused).toBe(true);

  // V1 PARITY in the composed graphic: the stop edge exists as an arrow now, yet next() must
  // still no-op when only Out remains — and the styled stop must land the off pose.
  const parity = await doc.locator('body').evaluate(async () => {
    const w = window as unknown as {
      play?: () => void;
      stop?: () => void;
      revealNextStep?: () => unknown;
      noacgMachineState?: () => { groups: Record<string, string> };
    };
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const state = () => w.noacgMachineState?.().groups.main;
    w.play?.();
    await sleep(1000); // the styled (fade) entrance settles
    const onAir = state();
    const advanced = w.revealNextStep ? w.revealNextStep() : undefined;
    const afterNext = state();
    w.stop?.();
    await sleep(200); // a CUT exit is instant
    const root = document.querySelector('.lower-third') as HTMLElement;
    return { onAir, nextNoOp: advanced === null, afterNext, off: state(), opacity: Number(getComputedStyle(root).opacity) };
  });
  expect(parity.onAir).toBe('enter');
  expect(parity.nextNoOp).toBe(true);
  expect(parity.afterNext).toBe('enter');
  expect(parity.off).toBe('off');
  expect(parity.opacity).toBe(0);
});

test('the stop edge and its style survive step inserts and deletes (rehoming)', async ({ page }) => {
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const result = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { parseAnimData, serializeAnimData } = await import('/src/blocks/animData.ts');
    const { removeTransition, setTransitionStyle, setTransitionTrigger } = await import('/src/blocks/machineEdit.ts');
    const { addStep, deleteStep } = await import('/src/blocks/animEdit.ts');
    const { lifecyclePair } = await import('/src/blocks/animMachine.ts');
    type Data = NonNullable<ReturnType<typeof parseAnimData>>;
    const stopOf = (d: Data) =>
      d.machine!.groups[0].transitions.find((t) => t.trigger === 'lifecycle' && t.event === 'stop');
    const tpl = variantById('lt01')!.create({});
    const data = parseAnimData(tpl.js)!;
    // The derived two-step walk's transitions are [play, stop] — style the stop edge, which
    // materializes the machine with the styled lifecycle edge in it.
    const styled = setTransitionStyle(data, 'main', 1, 'fade')!;
    // Insert a step before Out: the exit pair moved, and the styled edge must move with it.
    const grown = addStep(styled)!;
    const grownSeat = lifecyclePair(grown.machine!.groups[0], 'stop')!;
    const afterGrow = stopOf(grown);
    // Delete the inserted penultimate step again: the edge comes home, style intact — this
    // is the case where dropping-transitions-with-the-state would have eaten the style.
    const shrunk = deleteStep(grown, grown.steps.length - 2, () => 'rise')!;
    const homeSeat = lifecyclePair(shrunk.machine!.groups[0], 'stop')!;
    const afterShrink = stopOf(shrunk);
    const once = serializeAnimData(shrunk);
    const twice = serializeAnimData(parseAnimData('var NOACG_ANIM = ' + once + ';')!);
    return {
      styledAtStop: stopOf(styled)?.style === 'fade',
      movedWithInsert:
        afterGrow?.from === grownSeat.from && afterGrow?.to === grownSeat.to && afterGrow?.style === 'fade',
      homeAfterDelete:
        afterShrink?.from === homeSeat.from && afterShrink?.to === homeSeat.to && afterShrink?.style === 'fade',
      fixedPoint: once === twice,
      // The mutator-level guards, pinned where they cannot pass vacuously: a lifecycle edge
      // refuses deletion and refuses being retimed to another trigger.
      guardDelete: removeTransition(styled, 'main', 1) === null,
      guardRetime: setTransitionTrigger(styled, 'main', 1, 'timer') === null,
    };
  });
  expect(result).toEqual({
    styledAtStop: true,
    movedWithInsert: true,
    homeAfterDelete: true,
    fixedPoint: true,
    guardDelete: true,
    guardRetime: true,
  });
});

test('structural step edits carry the walk\'s arrows: a timer survives a delete, a split keeps its event', async ({ page }) => {
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const result = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { setTransitionEvent, setTransitionTrigger } = await import('/src/blocks/machineEdit.ts');
    const { addStep, deleteStep, duplicateStep } = await import('/src/blocks/animEdit.ts');
    type Data = NonNullable<ReturnType<typeof parseAnimData>>;
    const arrows = (d: Data) => d.machine!.groups[0].transitions;
    const tpl = variantById('lt01')!.create({});

    // ── A timer arriving at a deleted middle step is CARRIED to its successor. ──
    // Four steps [Enter, Step 2, Step 3, Out]; retime the walk's Enter → Step 2 arrow to a
    // timer (transitions parse sorted: play, next, next, stop — index 1), then delete Step 2.
    const four = addStep(addStep(parseAnimData(tpl.js)!)!)!;
    const timed = setTransitionTrigger(four, 'main', 1, 'timer')!;
    const afterDelete = deleteStep(timed, 1, () => 'rise')!;
    const carried = arrows(afterDelete).find((t) => t.from === 'enter' && t.to === 'step-3');
    // The predecessor's auto-advance survived — same trigger, same delay, and reconnectPath
    // minted no parallel `next` for a pair the carried arrow already connects.
    const carriedTimer = carried?.trigger === 'timer' && carried?.after === 3;
    const noMintedNext = !arrows(afterDelete).some(
      (t) => t.from === 'enter' && t.to === 'step-3' && t.trigger === 'operator',
    );

    // ── …EXCEPT into the final waypoint: that would grant an auto-stop nobody drew. ──
    // Deleting the (now penultimate) Step 3 drops the arrival; the exit pair keeps only its
    // lifecycle stop edge, so next() keeps its no-op and nothing auto-stops the graphic.
    const atOut = deleteStep(afterDelete, 1, () => 'rise')!;
    const noTimerLeft = !arrows(atOut).some((t) => t.trigger === 'timer');
    const onlyStopIntoOut = arrows(atOut)
      .filter((t) => t.to === 'out')
      .every((t) => t.trigger === 'lifecycle' && t.event === 'stop');

    // ── An inserted waypoint keeps the split arrow's EVENT on its first half. ──
    // Three steps, the walk arrow renamed to "go"; duplicating the entrance splits that
    // pair. The original arrow follows its from-state (Enter → the copy, still "go") and
    // only the new second half arrives as a plain `next`.
    const three = addStep(parseAnimData(tpl.js)!)!;
    const named = setTransitionEvent(three, 'main', 1, 'go')!;
    const split = duplicateStep(named, 0)!;
    const firstHalf = arrows(split).find((t) => t.from === 'enter' && t.to === 'enter-copy');
    const secondHalf = arrows(split).find((t) => t.from === 'enter-copy' && t.to === 'step-2');
    const noStray = !arrows(split).some((t) => t.from === 'enter' && t.to === 'step-2');
    return {
      carriedTimer,
      noMintedNext,
      noTimerLeft,
      onlyStopIntoOut,
      splitKeepsEvent: firstHalf?.trigger === 'operator' && firstHalf?.event === 'go',
      secondHalfIsNext: secondHalf?.trigger === 'operator' && secondHalf?.event === 'next',
      noStray,
    };
  });
  expect(result).toEqual({
    carriedTimer: true,
    noMintedNext: true,
    noTimerLeft: true,
    onlyStopIntoOut: true,
    splitKeepsEvent: true,
    secondHalfIsNext: true,
    noStray: true,
  });
});

test('a styled lifecycle edge under an older interpreter re-emits the region (the pairing rule, one step on)', async ({ page }) => {
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const result = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { parseAnimData, spliceAnimData } = await import('/src/blocks/animData.ts');
    const { setTransitionStyle } = await import('/src/blocks/machineEdit.ts');
    const { writeAnimData, hasLifecycleStyleRuntime } = await import('/src/templates/shared/animRuntime.ts');
    const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
    const tpl = variantById('lt01')!.create({});
    // Simulate a saved template whose frozen interpreter has styles but predates the
    // materialised play/stop edges (its play()/stop() never consult them).
    const oldJs = tpl.js.replace(/function noacgLifecycleEdge/g, 'function noacgFrozenLifecycleEdge');
    const data = parseAnimData(oldJs)!;
    const styled = setTransitionStyle(data, 'main', 1, 'fade')!; // the stop edge
    const written = writeAnimData(oldJs, styled)!;
    const reEmitted = hasLifecycleStyleRuntime(written);
    // …while validation catches the broken pairing if someone hand-splices instead.
    const spliced = { ...tpl, js: spliceAnimData(oldJs, styled)! };
    const verdict = validateTemplate(spliced);
    const pairingError = verdict.errors.some((e) => e.message.includes('materialised play/stop edges'));
    return { reEmitted, pairingError };
  });
  expect(result.reEmitted).toBe(true);
  expect(result.pairingError).toBe(true);
});
