// covers: src/blocks/**, src/templates/**

import { test, expect, type Page } from '@playwright/test';
import { createProject } from './_create';
import { awaitPreviewRebuild } from './_preview';
import { frameMachineState, frameOpacity, framePlay, frameStop, previewFrame } from './_frame';

// The machine graph surface (src/components/timeline/MachineGraph.tsx, the node editor in the
// retired code editor's dock) was deleted on 2026-10-17 with the sixteen cases that drove it.
// What is left is the MUTATOR and RUNTIME half: blocks/machineEdit's edits re-emit the region
// under older interpreters, the walk's arrows survive structural step edits, and a styled
// transition plays and lands on its pose. Two of these still boot through the retired helper and
// skip until they are rewritten onto a composed preview (issue #800).

async function openGraph(page: Page) {
  await page.getByTestId('timeline-surface-toggle').click();
  await expect(page.getByTestId('machine-graph')).toBeVisible();
}

async function templateJs(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.js;
  });
}

test('a styled transition plays the arrow\'s change and lands exactly on the target pose', async ({ page }) => {
  await createProject(page, { category: 'quiz' });
  await openGraph(page);
  // Style the question → selected arrow (fade), then fire it in the live preview.
  await page.getByTestId('mg-arrow-main-t-3').dispatchEvent('click');
  await expect(page.getByTestId('mg-transition-card')).toContainText('Question → Answer selected');
  await awaitPreviewRebuild(page, () => page.getByTestId('mg-style').selectOption('fade'));

  // ONE evaluate call, like the interpreter's own dispatch sequence used to run against a
  // direct contentWindow reference: noacgDispatch can recurse synchronously into processing a
  // queued follow-up event, and splitting this into separate round trips (a play() call, an
  // externally-timed wait, then a dispatch call) desyncs that recursion from real wall time
  // closely enough to throw — reproducible even against the pre-conversion app code, so it is
  // purely about keeping the sequence in one page-side execution, not about same-origin access.
  const result = await previewFrame(page)
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
      // The styled change is 0.6 s total; give it time plus slack, then read the pose.
      await sleep(1400);
      const root = document.querySelector('.quiz') as HTMLElement;
      const opacity = Number(getComputedStyle(root).opacity);
      return { pointerMovedSynchronously, opacity, state: w.noacgMachineState?.().groups.main };
    });

  expect(result.pointerMovedSynchronously).toBe(true);
  expect(result.state).toBe('selected');
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
  await createProject(page, { category: 'lower-third', index: 0 });
  await openGraph(page);

  // A default two-step lower third used to have NO selectable arrow at all — play and the
  // final-stop edge were the walk's own synthetic drawing, so Cut/Fade could never be applied
  // to an entrance or an exit. They are now materialised lifecycle transitions with cards.
  await page.getByTestId('mg-arrow-main-walk-0').dispatchEvent('click');
  await expect(page.getByTestId('mg-lifecycle-note')).toContainText('the entrance');
  // Play and stop are what they are: no trigger switch, no event rename, no delete button.
  await expect(page.getByTestId('mg-trigger')).toHaveCount(0);
  await expect(page.getByTestId('mg-event')).toHaveCount(0);
  await expect(page.getByTestId('mg-delete-transition')).toHaveCount(0);

  // Styling the entrance materializes the derived machine WITH the edge, style and all.
  await awaitPreviewRebuild(page, () => page.getByTestId('mg-style').selectOption('fade'));
  expect(await templateJs(page)).toContain('"trigger": "lifecycle", "event": "play", "style": "fade"');
  await expect(page.locator('.mg-derived-chip')).toHaveCount(0);

  // The exit edge takes the broadcast CUT (duration/ease stand down for it).
  await page.getByTestId('mg-arrow-main-walk-1').dispatchEvent('click');
  await expect(page.getByTestId('mg-lifecycle-note')).toContainText('the exit');
  await awaitPreviewRebuild(page, () => page.getByTestId('mg-style').selectOption('cut'));
  expect(await templateJs(page)).toContain('"trigger": "lifecycle", "event": "stop", "style": "cut"');
  await expect(page.getByTestId('mg-style-duration')).toHaveCount(0);

  // Delete refuses a lifecycle edge — play and stop always exist. Focus is parked off the
  // style select first: the Delete handler stands down while a form control is focused, and
  // asserting "nothing changed" with focus still in the select would pass vacuously.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('Delete');
  await page.waitForTimeout(250);
  expect(await templateJs(page)).toContain('"trigger": "lifecycle", "event": "stop", "style": "cut"');

  // V1 PARITY in the live preview: the stop edge exists as an arrow now, yet next() must
  // still no-op when only Out remains — and the styled stop must land the off pose.
  await framePlay(page);
  await page.waitForTimeout(1000); // the styled (fade) entrance settles
  const onAir = (await frameMachineState(page)).main;
  const advanced = await previewFrame(page).locator('body').evaluate(() => {
    const w = window as unknown as { revealNextStep?: () => unknown };
    return w.revealNextStep ? w.revealNextStep() : undefined;
  });
  const afterNext = (await frameMachineState(page)).main;
  await frameStop(page);
  await page.waitForTimeout(200); // a CUT exit is instant
  const parity = {
    onAir,
    nextNoOp: advanced === null,
    afterNext,
    off: (await frameMachineState(page)).main,
    opacity: await frameOpacity(page, '.lower-third'),
  };
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
