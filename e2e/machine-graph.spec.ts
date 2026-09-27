// covers: src/blocks/**, src/templates/**
// covers: src/components/timeline/{StepTimeline.tsx,LegacyTimeline.tsx,Inspector.tsx,PlayoutSimulator.tsx}
// covers: src/components/timeline/MachineGraph.tsx

import { test, expect, type Page } from '@playwright/test';
import { createProject } from './_create';
import { awaitPreviewRebuild } from './_preview';
import { frameMachineState, frameOpacity, framePlay, frameStop, frameStyleProp, previewFrame } from './_frame';

// Phase 4 of docs/noacg-master-goals.md — the node editor. The machine GRAPH surface in the
// bottom dock: inspect a template's states and arrows, snap the preview, edit transitions
// (trigger / event / timer / STYLE), draw and delete arrows, add branch states and parallel
// groups, drag boxes to persisted positions — and break it all fearlessly, because the
// topbar Reset restores the shipped template. The acceptance bar (goals doc): a
// non-programmer opens a template, sees its graph, changes a transition's style, breaks
// something, and restores the shipped state.

async function openGraph(page: Page) {
  await page.getByTestId('timeline-surface-toggle').click();
  await expect(page.getByTestId('machine-graph')).toBeVisible();
}

/** The preview's machine pointers (the runtime's own introspection). */
async function machineState(page: Page): Promise<Record<string, string>> {
  return frameMachineState(page);
}

async function templateJs(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.js;
  });
}

test('the dock toggles between the step timeline and the machine graph', async ({ page }) => {
  await createProject(page, { category: 'quiz' });
  await expect(page.locator('.tlv2-body')).toBeVisible();
  await openGraph(page);
  // The quiz board's authored machine: the default path as the amber spine plus the
  // select/lock branch — and no "derived" chip, this machine is authored.
  await expect(page.getByTestId('mg-state-main-off')).toBeVisible();
  await expect(page.getByTestId('mg-state-main-selected')).toBeVisible();
  await expect(page.locator('.mg-derived-chip')).toHaveCount(0);
  // The switch is SEGMENTED (both surfaces always visible, active one highlighted):
  // the Timeline segment returns; re-clicking the active States segment is a no-op.
  await expect(page.getByTestId('timeline-surface-toggle')).toHaveClass(/active/);
  await page.getByTestId('timeline-surface-timeline').click();
  await expect(page.locator('.tlv2-body')).toBeVisible();
  await expect(page.getByTestId('timeline-surface-timeline')).toHaveClass(/active/);
});

test('a machine-less template shows its derived walk, honestly labelled', async ({ page }) => {
  await createProject(page, { category: 'lower-third', index: 0 });
  await openGraph(page);
  await expect(page.getByTestId('mg-state-main-off')).toBeVisible();
  await expect(page.locator('.mg-derived-chip')).toBeVisible();
  // The walk's own labels: play into the entrance, stop (dashed) into the exit.
  await expect(page.locator('.mg-arrow-walk text', { hasText: 'play' })).toBeVisible();
  await expect(page.locator('.mg-arrow-stop text', { hasText: 'stop' })).toBeVisible();
});

test('clicking a state snaps the preview there and its card opens the timeline at its step', async ({ page }) => {
  await createProject(page, { category: 'quiz' });
  await openGraph(page);
  await page.getByTestId('mg-state-main-reveal').click();
  await expect.poll(() => machineState(page).then((s) => s.main)).toBe('reveal');
  // The card knows what the state IS, and leads to its timeline parked at its step.
  await expect(page.getByTestId('mg-state-card')).toContainText('step 2 of the default path');
  await page.getByTestId('mg-open-step').click();
  await expect(page.locator('.tlv2-body')).toBeVisible();
  const playhead = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().playhead;
  });
  expect(playhead).toEqual({ step: 1, t: 0 });
});

test('the transition card edits an arrow: event rename, illegal names refused, styles applied', async ({ page }) => {
  await createProject(page, { category: 'quiz' });
  await openGraph(page);
  // The lock arrow (selected → locked). dispatchEvent: the visible stroke is 1.5px and the
  // hit twin is a curve — a center click would miss both. (Indices count the PARSED order —
  // the canonical sort by from-state, trigger, event: with the sealed/audience branches the
  // selected → locked arrow sits at 6.)
  await page.getByTestId('mg-arrow-main-t-6').dispatchEvent('click');
  await expect(page.getByTestId('mg-transition-card')).toContainText('Answer selected → Locked in');

  // Rename the event; one undoable apply lands in the code.
  await awaitPreviewRebuild(page, async () => {
    await page.getByTestId('mg-event').fill('engage');
    await page.keyboard.press('Enter');
  });
  expect(await templateJs(page)).toContain('"event": "engage"');

  // A reserved name is refused and the input reverts to the real value. (The literal DOES
  // carry `"event": "play"` — the materialised lifecycle entrance edge — so the assertion
  // pins the OPERATOR shape specifically.)
  await page.getByTestId('mg-event').fill('play');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('mg-event')).toHaveValue('engage');
  expect(await templateJs(page)).not.toContain('"trigger": "operator", "event": "play"');

  // Give the arrow a styled change: push-left with a custom duration.
  await awaitPreviewRebuild(page, () => page.getByTestId('mg-style').selectOption('push-left'));
  await awaitPreviewRebuild(page, async () => {
    await page.getByTestId('mg-style-duration').fill('0.4');
    await page.keyboard.press('Enter');
  });
  const js = await templateJs(page);
  expect(js).toContain('"style": "push-left"');
  expect(js).toContain('"duration": 0.4');
});

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

test('drawing an arrow from a port creates a transition; the walk\'s only edge refuses deletion', async ({ page }) => {
  await createProject(page, { category: 'quiz' });
  await openGraph(page);

  // Port drag: Question → Locked in becomes a real operator arrow, selected for renaming.
  await page.hover('[data-testid="mg-state-main-question"]');
  const port = await page.getByTestId('mg-port-main-question').boundingBox();
  const target = await page.getByTestId('mg-state-main-locked').boundingBox();
  await awaitPreviewRebuild(page, async () => {
    await page.mouse.move(port!.x + port!.width / 2, port!.y + port!.height / 2);
    await page.mouse.down();
    await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 8 });
    await page.mouse.up();
  });
  expect(await templateJs(page)).toContain('"from": "question", "to": "locked", "trigger": "operator", "event": "go"');
  await expect(page.getByTestId('mg-transition-card')).toContainText('Question → Locked in');

  // Delete it again through its card.
  await awaitPreviewRebuild(page, () => page.getByTestId('mg-delete-transition').click());
  expect(await templateJs(page)).not.toContain('"from": "question", "to": "locked", "trigger": "operator", "event": "go"');

  // The only arrow behind a default-path edge cannot go — the walk must stay connected.
  await page.getByTestId('mg-arrow-main-walk-1').dispatchEvent('click');
  await expect(page.getByTestId('mg-transition-card')).toContainText('Question → Reveal');
  await page.getByTestId('mg-delete-transition').click();
  await page.waitForTimeout(300);
  expect(await templateJs(page)).toContain('"from": "question", "to": "reveal"');
});

test('a state nothing can enter is marked where it was authored, and the mark clears', async ({ page }) => {
  // validateMachine has always known this, but the finding only reached the EXPORT panel —
  // so a branch could carry a whole hand-built timeline and never be entered, and the
  // surface that let you build it said nothing.
  await createProject(page, { category: 'lower-third' });
  await openGraph(page);

  await page.getByTestId('mg-add-state-main').click();
  await awaitPreviewRebuild(page, () => page.locator('.mg-add-menu button', { hasText: '○ Pose state' }).click());

  const mark = page.getByTestId('mg-problem-main-new-state');
  await expect(mark).toBeVisible();
  await expect(mark).toHaveAttribute('title', /unreachable/);
  // The card says the NEXT MOVE, not the export report's verdict.
  await expect(page.getByTestId('mg-state-problem')).toContainText('No arrow leads here');
  // A pose wears ○ like the rest state does — it used to be the one unmarked box on the graph.
  await expect(page.locator('[data-testid="mg-state-main-new-state"] .mg-badge')).toHaveText('○');

  // Draw a real arrow in; the mark goes with the reason for it.
  await page.hover('[data-testid="mg-state-main-enter"]');
  const port = await page.getByTestId('mg-port-main-enter').boundingBox();
  const target = await page.getByTestId('mg-state-main-new-state').boundingBox();
  await awaitPreviewRebuild(page, async () => {
    await page.mouse.move(port!.x + port!.width / 2, port!.y + port!.height / 2);
    await page.mouse.down();
    await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 8 });
    await page.mouse.up();
  });
  await expect(page.getByTestId('mg-problem-main-new-state')).toHaveCount(0);
  await expect(page.getByTestId('mg-state-problem')).toHaveCount(0);
});

test('branch states and parallel groups add and delete; a dragged box parks and persists', async ({ page }) => {
  await createProject(page, { category: 'quiz' });
  await openGraph(page);

  // A new branch state, born selected; deleting it drops its arrows with it. The main
  // lane's + state opens a MENU (pose / step on the path / from a layer) — pose is the
  // classic branch add.
  await page.getByTestId('mg-add-state-main').click();
  await awaitPreviewRebuild(page, () => page.getByTestId('mg-add-pose').click());
  expect(await templateJs(page)).toContain('"id": "new-state"');
  await page.getByTestId('mg-delete-state').click();
  await awaitPreviewRebuild(page);
  expect(await templateJs(page)).not.toContain('"id": "new-state"');

  // A parallel group with its rest state; delete it again from its lane.
  await awaitPreviewRebuild(page, () => page.getByTestId('mg-add-group').click());
  expect(await templateJs(page)).toContain('"id": "group"');
  await awaitPreviewRebuild(page, () => page.getByTestId('mg-del-group-group').click());
  expect(await templateJs(page)).not.toContain('"id": "group"');

  // Dragging a box persists its position as the additive `at` field.
  const box = await page.getByTestId('mg-state-main-selected').boundingBox();
  await awaitPreviewRebuild(page, async () => {
    await page.mouse.move(box!.x + 40, box!.y + 15);
    await page.mouse.down();
    await page.mouse.move(box!.x + 40, box!.y + 75, { steps: 6 });
    await page.mouse.up();
  });
  expect(await templateJs(page)).toMatch(/"at": \[\d+, \d+\]/);
});

test('editing a derived machine materializes it, and Reset restores the shipped template', async ({ page }) => {
  await createProject(page, { category: 'lower-third', index: 0 });
  await openGraph(page);
  await expect(page.locator('.mg-derived-chip')).toBeVisible();

  // The first structural edit writes the derived machine into the code — with the edit.
  const box = await page.getByTestId('mg-state-main-enter').boundingBox();
  await awaitPreviewRebuild(page, async () => {
    await page.mouse.move(box!.x + 30, box!.y + 15);
    await page.mouse.down();
    await page.mouse.move(box!.x + 30, box!.y + 85, { steps: 6 });
    await page.mouse.up();
  });
  const parsed = await page.evaluate(async () => {
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return !!parseAnimData(useTemplateStore.getState().template.js)?.machine;
  });
  expect(parsed).toBe(true);
  await expect(page.locator('.mg-derived-chip')).toHaveCount(0);

  // Break fearlessly: the topbar Reset (two-click confirm) restores the shipped template.
  await page.getByTestId('reset-project').click();
  await awaitPreviewRebuild(page, () => page.getByTestId('reset-project').click());
  const afterReset = await page.evaluate(async () => {
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return !!parseAnimData(useTemplateStore.getState().template.js)?.machine;
  });
  expect(afterReset).toBe(false);
  await expect(page.locator('.mg-derived-chip')).toBeVisible();
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

test('a layer gets its own timeline from the graph: ▤ step, cut style, Delete restores by undo', async ({ page }) => {
  await createProject(page, { category: 'lower-third', index: 0 });
  await openGraph(page);

  // "+ state" on the main lane opens the three-way menu; "from layer: Name" adds a
  // "Name In" waypoint whose reveal the layer moves into (the LAYER TIMELINE, badged ▤).
  await page.getByTestId('mg-add-state-main').click();
  await expect(page.getByTestId('mg-add-menu')).toBeVisible();
  await awaitPreviewRebuild(page, () => page.getByTestId('mg-add-layer-f0').click());
  const nameIn = page.locator('.mg-state', { hasText: 'Name In' });
  await expect(nameIn).toBeVisible();
  await expect(nameIn.locator('.mg-kind-layer')).toBeVisible();
  const js = await templateJs(page);
  expect(js).toContain('"Name In"');
  expect(js).toMatch(/"reveals": \[\s*"#f0"\s*\]/);

  // The walk's enter → Name In arrow takes the CUT style: instant change, no duration knob.
  // (The invisible hit path needs a forced click — same geometry the pointer really uses.)
  await page.getByTestId('mg-arrow-main-walk-1').click({ force: true });
  await page.getByTestId('mg-style').selectOption('cut');
  await awaitPreviewRebuild(page);
  expect(await templateJs(page)).toContain('"style": "cut"');
  await expect(page.getByTestId('mg-style-duration')).toHaveCount(0);

  // Delete removes the selected waypoint (its step goes with it); Ctrl+Z restores both.
  // A press on the empty canvas first clears the arrow selection, so its floating card
  // no longer overlaps the boxes.
  await page.locator('.mg-canvas').click({ position: { x: 8, y: 8 } });
  await expect(page.getByTestId('mg-transition-card')).toHaveCount(0);
  await nameIn.click();
  await awaitPreviewRebuild(page, () => page.keyboard.press('Delete'));
  expect(await templateJs(page)).not.toContain('"Name In"');
  await awaitPreviewRebuild(page, () => page.keyboard.press('Control+z'));
  expect(await templateJs(page)).toContain('"Name In"');
});

test('the timeline clips and the switch carry the layer/graphic vocabulary', async ({ page }) => {
  await createProject(page, { category: 'lower-third', index: 0 });
  // The segmented switch names both surfaces; the clip strip badges each step's kind.
  await expect(page.getByTestId('timeline-surface-timeline')).toHaveText(/Timeline/);
  await expect(page.getByTestId('timeline-surface-toggle')).toHaveText(/States/);
  await expect(page.locator('.tlv2-clip-kind').first()).toBeVisible();
});

test('two complete graphic timelines chain on the path (the ◇ > ◇ rundown case)', async ({ page }) => {
  await createProject(page, { category: 'lower-third', index: 0 });
  // Duplicate the entrance (the clip context menu's action, applied at the mutator seam):
  // the copy is a second COMPLETE-GRAPHIC timeline standing after the first.
  await awaitPreviewRebuild(page, () =>
    page.evaluate(async () => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const { parseAnimData } = await import('/src/blocks/animData.ts');
      const { duplicateStep, renameStep } = await import('/src/blocks/animEdit.ts');
      const { spxSteps } = await import('/src/blocks/animMachine.ts');
      const { writeAnimData } = await import('/src/templates/shared/animRuntime.ts');
      const { replaceDefinitionInHtml } = await import('/src/model/spxDefinition.ts');
      const s = useTemplateStore.getState();
      const data = parseAnimData(s.template.js)!;
      let next = duplicateStep(data, 0)!;
      next = renameStep(next, 0, 'Presenter Lower Third')!;
      next = renameStep(next, 1, 'Guest Lower Third')!;
      const js = writeAnimData(s.template.js, next)!;
      const settings = { ...s.template.settings, steps: String(spxSteps(next)) };
      const html = replaceDefinitionInHtml(s.template.html, settings, s.template.fields);
      s.applyTemplate({ ...s.template, js, html, settings });
    }),
  );
  // Both clips badge as ◇ GRAPHIC timelines on the timeline strip…
  await expect(page.locator('.tlv2-clip-kind-graphic')).toHaveCount(3); // two chained + Out
  // …and as ◇ boxes chained on the graph's spine.
  await openGraph(page);
  await expect(page.locator('.mg-state', { hasText: 'Presenter Lower Third' }).locator('.mg-kind-graphic')).toBeVisible();
  await expect(page.locator('.mg-state', { hasText: 'Guest Lower Third' }).locator('.mg-kind-graphic')).toBeVisible();
});

test('a branch state gets its own timeline, and it really plays', async ({ page }) => {
  await createProject(page, { category: 'lower-third', index: 0 });
  await openGraph(page);

  // A branch off the entrance, reachable by an authored event.
  await page.getByTestId('mg-add-state-main').click();
  await awaitPreviewRebuild(page, () => page.getByTestId('mg-add-pose').click());
  const port = (await page.getByTestId('mg-port-main-enter').boundingBox())!;
  const target = (await page.getByTestId('mg-state-main-new-state').boundingBox())!;
  await page.mouse.move(port.x + 4, port.y + 4);
  await page.mouse.down();
  await page.mouse.move(target.x + 40, target.y + 17, { steps: 8 });
  await page.mouse.up();
  await awaitPreviewRebuild(page, async () => {
    await page.getByTestId('mg-event').fill('showBio');
    await page.keyboard.press('Enter');
  });

  // Until it has a timeline the state holds whatever look it arrives with — which is exactly
  // why every authorable branch used to be a copy of its predecessor.
  await page.getByTestId('mg-state-main-new-state').click();
  await expect(page.getByTestId('mg-state-card')).toContainText('holds the look it arrives with');
  await awaitPreviewRebuild(page, () => page.getByTestId('mg-add-state-timeline').click());

  // The dock swings onto that timeline and says so, and the affordances that only mean
  // something on the ordered walk stand down.
  await expect(page.getByTestId('tlv2-branch-bar')).toContainText('New state');
  await expect(page.locator('.tlv2-clip')).toHaveCount(1);
  await expect(page.getByTestId('tlv2-add-step')).toHaveCount(0);
  await expect(page.getByTestId('tlv2-hold')).toHaveCount(0);

  // Keyframes written through the ordinary mutators land in the STATE, not in `steps` — the
  // lens folds the one-step projection back where it came from.
  await awaitPreviewRebuild(page, () =>
    page.evaluate(async () => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const { parseAnimData } = await import('/src/blocks/animData.ts');
      const { setKeyframe } = await import('/src/blocks/animEdit.ts');
      const { lensRead, lensWrite } = await import('/src/blocks/timelineLens.ts');
      const { writeAnimData } = await import('/src/templates/shared/animRuntime.ts');
      const s = useTemplateStore.getState();
      const doc = parseAnimData(s.template.js)!;
      let projected = lensRead(doc, s.timelineTarget)!;
      projected = setKeyframe(projected, 0, '.lower-third-box', 'x', 0, 0)!;
      projected = setKeyframe(projected, 0, '.lower-third-box', 'x', 0.45, 140)!;
      const next = lensWrite(doc, s.timelineTarget, projected)!;
      s.applyTemplate({ ...s.template, js: writeAnimData(s.template.js, next)! });
    }),
  );
  const shape = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const d = parseAnimData(useTemplateStore.getState().template.js)!;
    const state = d.machine!.groups[0].states.find((s) => s.id === 'new-state')!;
    return { steps: d.steps.map((s) => s.name), keyed: Object.keys(state.timeline?.layers ?? {}) };
  });
  expect(shape.steps).toEqual(['Enter', 'Out']); // the path is untouched
  expect(shape.keyed).toEqual(['.lower-third-box']);

  // `reveals`/`hides` are invalid on an inline timeline; the export gate has to stay green.
  const validation = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
    return validateTemplate(useTemplateStore.getState().template).errors;
  });
  expect(validation).toEqual([]);

  // And the point of the whole exercise: entering the branch PLAYS its timeline. ONE evaluate
  // call, like the interpreter's own dispatch sequence used to run against a direct
  // contentWindow reference — see the identical note on the "styled transition" test above.
  const moved = await previewFrame(page)
    .locator('body')
    .evaluate(async () => {
      const w = window as unknown as { play?: () => void; noacgDispatch?: (e: string) => unknown };
      const x = () => getComputedStyle(document.querySelector('.lower-third-box')!).transform;
      w.play?.();
      await new Promise((r) => setTimeout(r, 1400));
      const before = x();
      w.noacgDispatch?.('showBio');
      await new Promise((r) => setTimeout(r, 900));
      return { before, after: x() };
    });
  expect(moved.before).not.toContain('140');
  expect(moved.after).toContain('140');

  // SCRUBBING the branch drives the preview. The scrub protocol only ever addressed the
  // WALK's phases, so a branch sent nothing at all and its timeline was authored blind — the
  // playhead moved and the picture did not. It now answers `state:<group>:<state>`, which the
  // simulator resolves through the runtime's OWN entry timeline.
  const canvas = (await page.getByTestId('tlv2-canvas').boundingBox())!;
  /** The box's live translateX, read off the matrix — a scrub lands NEAR a keyframe, not on
   *  its exact number, so this compares distances rather than substrings. */
  const boxX = async () => {
    const m = await frameStyleProp(page, '.lower-third-box', 'transform');
    return Number(m.match(/matrix\(([^)]+)\)/)?.[1].split(',')[4] ?? NaN);
  };
  await page.mouse.click(canvas.x + 2, canvas.y + 8);
  await page.waitForTimeout(500);
  const atStart = await boxX();
  await page.mouse.click(canvas.x + canvas.width - 6, canvas.y + 8);
  await page.waitForTimeout(500);
  const atEnd = await boxX();
  expect(Math.abs(atEnd - atStart)).toBeGreaterThan(50); // the preview follows the branch playhead
  expect(atEnd).toBeGreaterThan(130); // and lands on the branch's own last keyframe (140)

  // Back to the graphic's own sequence.
  await page.getByTestId('tlv2-branch-back').click();
  await expect(page.getByTestId('tlv2-branch-bar')).toHaveCount(0);
  await expect(page.locator('.tlv2-clip')).toHaveCount(2);
});

test('the timeline says how each step is really reached, timers included', async ({ page }) => {
  await createProject(page, { category: 'lower-third', index: 0 });
  await openGraph(page);
  await page.getByTestId('mg-add-state-main').click();
  await awaitPreviewRebuild(page, () => page.getByTestId('mg-add-step').click());

  // Before: the ordinary walk. The derived machine authors `next`, so a machine-less
  // template reads exactly as it always did.
  await page.getByTestId('timeline-surface-timeline').click();
  await expect(page.getByTestId('tlv2-clip-0')).toHaveAttribute('title', /Plays on ▶ Play/);
  await expect(page.getByTestId('tlv2-clip-1')).toHaveAttribute('title', /Plays on press 1 of » Next/);

  // Turn that arrow into a 1.5s timer in the States tab.
  await openGraph(page);
  await page.getByTestId('mg-arrow-main-walk-1').dispatchEvent('click');
  await awaitPreviewRebuild(page, () => page.getByTestId('mg-trigger').selectOption('timer'));
  await awaitPreviewRebuild(page, async () => {
    await page.getByTestId('mg-after').fill('1.5');
    await page.keyboard.press('Enter');
  });

  // The timeline has to say so. It used to keep promising the operator a press, because the
  // cue and the tooltip were computed from the step INDEX and never consulted the machine.
  await page.getByTestId('timeline-surface-timeline').click();
  const clip = page.getByTestId('tlv2-clip-1');
  await expect(clip).toHaveAttribute('title', /Plays by itself, 1\.5s after the previous step settles/);
  await expect(clip).not.toHaveAttribute('title', /Next/);
  await expect(clip.locator('.tlv2-cue')).toHaveText('⏱');
});

test('the editor greys an event the machine would drop', async ({ page }) => {
  await createProject(page, { category: 'quiz' });
  const select = page.getByTestId('sim-event-select');
  const revealChoice = page.getByTestId('sim-event-revealChoice');
  const lock = page.getByTestId('sim-event-lock');

  // The preview settles on the entrance after every rebuild, so that is where this starts.
  // From there `select` (and `lock` — the hidden-pick flow seals from the question) have
  // arrows; `revealChoice` does not — its only arrow leaves `sealed`.
  await expect.poll(() => machineState(page).then((s) => s.main)).toBe('question');
  await expect(select).toBeEnabled();
  await expect(lock).toBeEnabled();
  await expect(revealChoice).toBeDisabled();

  await select.click();
  await expect.poll(() => machineState(page).then((s) => s.main)).toBe('selected');
  await expect(lock).toBeEnabled();
  await expect(revealChoice).toBeDisabled();

  // Once locked, selecting again is structurally impossible — there is no select arrow out of
  // `locked`. The guard already dropped the press; the button now says so instead of taking
  // it and doing nothing.
  await lock.click();
  await expect.poll(() => machineState(page).then((s) => s.main)).toBe('locked');
  await expect(select).toBeDisabled();
  await expect(select).toHaveAttribute('title', /no arrow out of the current state/);
});

test('a state that only fires a lifecycle call is not described as doing nothing', async ({ page }) => {
  await createProject(page, { category: 'quiz' });
  await openGraph(page);

  // `Answer selected` animates no layer at all — its timeline calls applySelection, which
  // repaints the board from the data. Counting only animated layers scored that as a pose and
  // had the card saying "entering plays nothing · its own inline timeline", both at once.
  await page.getByTestId('mg-state-main-selected').click();
  const card = page.getByTestId('mg-state-card');
  await expect(card).toContainText('changes the whole graphic');
  await expect(card).not.toContainText('nothing');
  await expect(page.getByTestId('mg-state-main-selected').locator('.mg-kind-graphic')).toBeVisible();

  // A genuine pose — one with no timeline at all — describes itself as a hold, not as an
  // omission: "Off" is the graphic's rest state, not an unfinished step.
  await page.getByTestId('mg-state-main-off').click();
  await expect(card).toContainText('holds the look it arrives with');
  await expect(card).toContainText('the rest state');
});

test('the transition card names the two ends the way the boxes do', async ({ page }) => {
  await createProject(page, { category: 'lower-third', index: 0 });
  await openGraph(page);
  await page.getByTestId('mg-add-state-main').click();
  await awaitPreviewRebuild(page, () => page.getByTestId('mg-add-step').click());
  // A styled arrow MATERIALIZES the derived machine, freezing the ids at today's names.
  await page.getByTestId('mg-arrow-main-walk-1').dispatchEvent('click');
  await awaitPreviewRebuild(page, () => page.getByTestId('mg-style').selectOption('cut'));

  // Now rename the waypoint. Its id deliberately stays `step-2` — transitions, snap
  // assignments and exported control pages reference it — so the card would otherwise read
  // "enter → step-2" beside a box labelled "Hold".
  await page.locator('.mg-state', { hasText: 'Step 2' }).click();
  await awaitPreviewRebuild(page, async () => {
    await page.getByTestId('mg-state-name').fill('Hold');
    await page.keyboard.press('Enter');
  });
  const js = await templateJs(page);
  expect(js).toContain('"id": "step-2"');
  expect(js).toContain('"name": "Hold"');

  await page.getByTestId('mg-arrow-main-walk-1').dispatchEvent('click');
  const name = page.getByTestId('mg-transition-card').locator('.mg-card-name');
  await expect(name).toHaveText('Enter → Hold');
  // The machine's own vocabulary is one hover away, not gone.
  await expect(name).toHaveAttribute('title', 'enter → step-2');
});

/**
 * Is `sel`'s box inside `clipper`'s box?
 *
 * `toBeVisible()` says YES to an element clipped away by an ancestor's overflow, which is
 * exactly how the "▤ timeline from layer" entries and the transition card's style picker both
 * shipped unreachable while this suite stayed green. Reaching a control is a question about
 * geometry, so ask it about geometry.
 */
async function boxInside(page: Page, sel: string, clipper: string): Promise<boolean> {
  return page.evaluate(([s, c]) => {
    const el = document.querySelector(s);
    const clip = document.querySelector(c);
    if (!el || !clip) return false;
    const a = el.getBoundingClientRect();
    const b = clip.getBoundingClientRect();
    return a.top >= b.top - 0.5 && a.bottom <= b.bottom + 0.5 && a.left >= b.left - 0.5 && a.right <= b.right + 0.5;
  }, [sel, clipper]);
}

test('every "+ state" entry is reachable at the default dock size', async ({ page }) => {
  await createProject(page, { category: 'lower-third', index: 0 });
  await openGraph(page);
  await page.getByTestId('mg-add-state-main').click();
  await expect(page.getByTestId('mg-add-menu')).toBeVisible();

  // The menu sizes against the DOCK, not against the two-state diagram it hangs off — which
  // is what it used to do, leaving every layer entry below the fold.
  expect(await boxInside(page, '[data-testid="mg-add-menu"]', '[data-testid="machine-graph"]')).toBe(true);

  // A lower third offers a layer timeline per part, and a short window cannot show them all
  // at once — so the bar is REACHABLE, not "fits without scrolling": each entry lands inside
  // the menu's visible box once scrolled to. (Clipped-with-nowhere-to-scroll is the failure
  // this pins; `toBeVisible()` cannot tell the two apart.)
  const layers = page.locator('[data-testid^="mg-add-layer-"]');
  await expect(layers).toHaveCount(4);
  for (const testid of await layers.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.testid!))) {
    await page.getByTestId(testid).scrollIntoViewIfNeeded();
    expect(await boxInside(page, `[data-testid="${testid}"]`, '[data-testid="mg-add-menu"]'), `${testid} is unreachable`).toBe(true);
  }
  // And it really adds the layer's own step, from the last entry — the one that used to be
  // furthest out of sight.
  await awaitPreviewRebuild(page, () => page.getByTestId('mg-add-layer-f1').click());
  await expect(page.locator('.mg-state', { hasText: 'Title In' })).toBeVisible();
});

test('the transition card is reachable and stays put while the diagram scrolls', async ({ page }) => {
  await createProject(page, { category: 'lower-third', index: 0 });
  await openGraph(page);
  // A two-step lower third's only arrows are the lifecycle play/stop edges, whose card has
  // no trigger row: a third waypoint is what gives the graph an OPERATOR arrow to select.
  await page.getByTestId('mg-add-state-main').click();
  await awaitPreviewRebuild(page, () => page.getByTestId('mg-add-step').click());
  await page.getByTestId('mg-arrow-main-walk-1').dispatchEvent('click');
  await expect(page.getByTestId('mg-transition-card')).toBeVisible();

  // The card sizes against the DOCK now, not against the diagram, so it opens on its controls
  // rather than on "fires on" alone — the style picker is there without touching anything.
  expect(await boxInside(page, '[data-testid="mg-transition-card"]', '[data-testid="machine-graph"]')).toBe(true);
  for (const testid of ['mg-trigger', 'mg-event', 'mg-style']) {
    expect(await boxInside(page, `[data-testid="${testid}"]`, '[data-testid="mg-transition-card"]'), `${testid} is below the fold`).toBe(true);
  }
  // A short window still scrolls the tail of the card — reachable is the bar there, since
  // being clipped with nowhere to scroll is the failure this pins.
  await page.getByTestId('mg-delete-transition').scrollIntoViewIfNeeded();
  expect(await boxInside(page, '[data-testid="mg-delete-transition"]', '[data-testid="mg-transition-card"]')).toBe(true);
  // …and reachable means operable: the change really lands in the code.
  await awaitPreviewRebuild(page, () => page.getByTestId('mg-style').selectOption('fade'));
  expect(await templateJs(page)).toContain('"style": "fade"');

  // The card is pinned to the graph FRAME, not to the diagram: panning sideways used to drag
  // it across the very boxes it describes.
  const before = await page.getByTestId('mg-transition-card').boundingBox();
  await page.locator('.mg-viewport').evaluate((v) => { v.scrollLeft = 400; });
  const after = await page.getByTestId('mg-transition-card').boundingBox();
  expect(after).toEqual(before);
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
