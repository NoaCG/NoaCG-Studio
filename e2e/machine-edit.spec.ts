// covers: src/blocks/**
// (2026-09-27); it runs when edited, on a full escalation and at night

import { test, expect, type Page } from '@playwright/test';
import { MILLIONAIRE } from './_machines';

// Phase 1 left the step editor frozen under an explicit machine: adding, removing or
// reordering a step would have desynced the positional binding (defaultPath[i] owns steps[i]),
// so those four mutators refused. This is the coverage for the machine-aware versions.
//
// The invariant every case re-checks: path length matches the step count, waypoints stay
// unique, validateMachine stays clean, settings.steps stays derived, and the graphic still
// walks. A structural edit that quietly broke any of those would ship a graphic whose
// operator presses no longer line up with what is on screen.

async function toApp(page: Page) {
  // These cases run in-page against the composer and the runtime; no project and no editor.
  await page.goto('/app');
  await page.keyboard.press('Escape');
}

/** Build the Millionaire acceptance template in page, apply an edit, and report the state of
 *  the binding afterwards. `edit` runs against the parsed data with the module's mutators. */
const HARNESS = `
  async function machineTemplate() {
    const { runtimeJs } = await import('/src/templates/shared/base.ts');
    const { emitAnimRegion } = await import('/src/templates/shared/animRuntime.ts');
    const { replaceDefinitionInHtml } = await import('/src/model/spxDefinition.ts');
    const { DEFAULT_SETTINGS } = await import('/src/model/types.ts');
    const { createBlankTemplate } = await import('/src/templates/blank.ts');
    const { spxSteps } = await import('/src/blocks/animMachine.ts');
    const def = ${JSON.stringify(MILLIONAIRE)};
    const settings = { ...DEFAULT_SETTINGS, description: def.name, steps: String(spxSteps(def.data)) };
    const shell = '<!DOCTYPE html>\\n<html>\\n<head>\\n</head>\\n<body>\\n' + def.html + '\\n</body>\\n</html>';
    return { ...createBlankTemplate(), name: def.name,
      html: replaceDefinitionInHtml(shell, settings, def.fields), css: def.css,
      js: runtimeJs(def.name, emitAnimRegion(def.data)) + '\\n\\n' + def.extraJs,
      fields: def.fields, settings };
  }
  /** The binding's health, as a plain object a test can assert on. */
  async function bindingOf(data) {
    const { validateMachine, spxSteps } = await import('/src/blocks/animMachine.ts');
    const { isAnimData } = await import('/src/blocks/animData.ts');
    const main = data.machine.groups[0];
    return {
      shapeOk: isAnimData(data),
      lengthsMatch: main.defaultPath.length === data.steps.length,
      waypointsUnique: new Set(main.defaultPath).size === main.defaultPath.length,
      waypointsResolve: main.defaultPath.every((id) => main.states.some((s) => s.id === id)),
      pathStatesHaveNoInlineTimeline: main.defaultPath.every(
        (id) => !main.states.find((s) => s.id === id).timeline),
      machineErrors: validateMachine(data).errors,
      spxSteps: spxSteps(data),
      stepNames: data.steps.map((s) => s.name),
      waypointNames: main.defaultPath.map((id) => main.states.find((s) => s.id === id).name),
    };
  }
`;

test('adding a step under a machine keeps the path bound and the graphic walkable', async ({ page }) => {
  await toApp(page);
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { addStep } = await import('/src/blocks/animEdit.ts');
    const tpl = await machineTemplate();
    const before = parseAnimData(tpl.js);
    const after = addStep(before);
    return { beforeSteps: before.steps.length, afterSteps: after.steps.length, binding: await bindingOf(after) };
  })()`);
  expect(result).toMatchObject({
    beforeSteps: 5,
    afterSteps: 6,
    binding: {
      shapeOk: true, lengthsMatch: true, waypointsUnique: true, waypointsResolve: true,
      pathStatesHaveNoInlineTimeline: true, machineErrors: [], spxSteps: 5,
    },
  });
});

test('duplicating and renaming keep names in step without ever moving a state id', async ({ page }) => {
  await toApp(page);
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { duplicateStep, renameStep } = await import('/src/blocks/animEdit.ts');
    const tpl = await machineTemplate();
    const data = parseAnimData(tpl.js);

    const dup = duplicateStep(data, 1);
    const renamed = renameStep(data, 2, 'Locked in');
    const rMain = renamed.machine.groups[0];
    return {
      dup: { binding: await bindingOf(dup), steps: dup.steps.length },
      renamed: {
        binding: await bindingOf(renamed),
        // The LABEL follows the step...
        stateName: rMain.states.find((s) => s.id === 'locked').name,
        // ...but the ID never does: transitions, snap assignments and an exported control
        // page all reference it, so moving it would silently break them.
        idStillReferenced: rMain.transitions.some((t) => t.to === 'locked'),
      },
    };
  })()`);
  expect(result).toMatchObject({
    dup: { steps: 6, binding: { shapeOk: true, lengthsMatch: true, machineErrors: [], spxSteps: 5 } },
    renamed: {
      stateName: 'Locked in',
      idStillReferenced: true,
      binding: { shapeOk: true, lengthsMatch: true, machineErrors: [], spxSteps: 4 },
    },
  });
});

test('an off-shape machine blocks export instead of shipping to air unchecked', async ({ page }) => {
  await toApp(page);
  const result = await page.evaluate(`(async () => {
    ${HARNESS}
    const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
    const { animDataFault } = await import('/src/blocks/animData.ts');
    const tpl = await machineTemplate();

    // Corrupt the machine the way a hand edit would: a transition to a state that isn't there.
    const broken = { ...tpl, js: tpl.js.replace('"to": "locked"', '"to": "ghost"') };
    const brokenVerdict = validateTemplate(broken);

    // A hand-crafted block with no machine keeps its old, tolerant treatment - the platform
    // deliberately accepts legacy and hand-written regions.
    const handCrafted = { ...tpl, js: tpl.js.replace('"version": 2', '"version": 7') };
    const handVerdict = validateTemplate(handCrafted);
    return {
      brokenFault: animDataFault(broken.js),
      brokenBlocked: !brokenVerdict.ok,
      brokenRule: brokenVerdict.errors.some((e) => e.rule === 'machine'),
      handFault: animDataFault(handCrafted.js),
      handStillExports: handVerdict.ok,
      handWarns: handVerdict.warnings.some((w) => w.rule === 'anim-data'),
    };
  })()`);
  expect(result).toEqual({
    brokenFault: 'off-shape-machine',
    brokenBlocked: true,
    brokenRule: true,
    handFault: 'off-shape',
    handStillExports: true,
    handWarns: true,
  });
});
