// covers: src/ai/**
//
// A Lite graphic reaches air no smaller than its category's type floor.
//
// The gap this closes: `scripts/type-floor.mjs` renders every catalog variant and fails on any
// text under the floor (20px for a lower third) - but it measures each design AS AUTHORED, and
// `designAdjust` rewrites those same font sizes afterwards on the AI path. `designAdjust`
// clamped a supporting line at a hard 14px, six points under the number the catalog gate
// certifies, and nothing re-measured the adjusted result. A design could pass every gate and
// still reach air illegible.
//
// So there are two halves and this pins both, because a fix that only clamps is untestable and
// a gate that never fires is decoration:
//
//   1. the adjuster now clamps to the CATEGORY floor, so an extreme ratio cannot go under it;
//   2. the live bench raises `bench-type-floor` when something does render under it - proven by
//      mutating a compiled template rather than by trusting that half 1 is the only path there.
//
// Both drive the shared compile path (`compileLiteDecision`), so no model call and no tokens.

import { expect, test } from '@playwright/test';

const FLOOR_PX = 20; // lower-third, from src/validation/typeFloor.ts

/** Compile one Lite decision through the real grounded path. */
async function compile(page: import('@playwright/test').Page, scaleRatio: number) {
  return page.evaluate(async (ratio) => {
    const mod = await import('/src/ai/lite/pipeline.ts');
    type Decision = Parameters<typeof mod.compileLiteDecision>[0];
    type Context = Parameters<typeof mod.compileLiteDecision>[1];
    const decision = {
      fit: 'catalog',
      reason: 'pinned by e2e',
      name: 'Type floor',
      summary: 'Type floor',
      category: 'lower-third',
      variantId: 'lt32',
      intent: { kind: 'person', primaryRole: 'person-name', secondaryRole: 'person-role' },
      lines: [
        { title: 'Name', sample: 'Amina Okafor', role: 'person-name' },
        { title: 'Role', sample: 'Head Coach', role: 'person-role' },
      ],
      // The whole point of the fixture: a ratio at the top of the accepted band shrinks the
      // supporting line hardest, which is what used to reach 14px.
      typography: { scaleRatio: ratio },
      flourish: null,
    } as unknown as Decision;
    const result = await mod.compileLiteDecision(decision, {} as Context);
    return {
      rules: [...result.validation.errors, ...result.validation.warnings].map((f) => f.rule),
      css: result.template?.css ?? '',
    };
  }, scaleRatio);
}

test.describe('a Lite graphic is never adjusted below its type floor', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
  });

  test('an extreme heading:body ratio clamps at the floor instead of 14px', async ({ page }) => {
    const { rules, css } = await compile(page, 2.6);

    // Every font-size the adjustment BLOCK wrote, in px. The design's own CSS is not read:
    // the catalog gate already certified that, and this is about what the adjuster did to it.
    const written = [...css.matchAll(/font-size:\s*calc\((\d+(?:\.\d+)?)px \* var\(--scale\)\)/g)]
      .map((match) => Number(match[1]));
    expect(written.length, 'the adjustment wrote at least one font size').toBeGreaterThan(0);
    // 14 was the old hard floor; anything at or below it is the regression coming back.
    expect(Math.min(...written)).toBeGreaterThanOrEqual(FLOOR_PX);

    // And with the clamp holding, the measured gate stays quiet - a floor that fires on its
    // own output would mean the clamp and the gate disagree about the same number.
    expect(rules).not.toContain('bench-type-floor');
  });

  test('the bench RAISES bench-type-floor when text really does render under it', async ({ page }) => {
    // The mutation half. Compile normally, then shrink a field in the template's own CSS and
    // re-bench. Without this, the spec above would pass identically if the check were deleted.
    const raised = await page.evaluate(async () => {
      const pipeline = await import('/src/ai/lite/pipeline.ts');
      const bench = await import('/src/validation/runtimeBench.ts');
      type Decision = Parameters<typeof pipeline.compileLiteDecision>[0];
      type Context = Parameters<typeof pipeline.compileLiteDecision>[1];
      const decision = {
        fit: 'catalog', reason: 'x', name: 'x', summary: 'x',
        category: 'lower-third', variantId: 'lt32',
        intent: { kind: 'person', primaryRole: 'person-name', secondaryRole: 'person-role' },
        lines: [
          { title: 'Name', sample: 'Amina Okafor', role: 'person-name' },
          { title: 'Role', sample: 'Head Coach', role: 'person-role' },
        ],
        flourish: null,
      } as unknown as Decision;
      const compiled = await pipeline.compileLiteDecision(decision, {} as Context);
      const template = compiled.template;
      if (!template) return ['NO TEMPLATE'];
      const field = template.fields.find((f) => f.ftype === 'textfield' || f.ftype === 'textarea');
      if (!field) return ['NO FIELD'];
      const shrunk = {
        ...template,
        css: `${template.css}\n#${field.field} { font-size: 9px !important; }\n`,
      };
      const result = await bench.benchTemplateRuntime(shrunk, { typeFloorPx: 20 });
      return [...result.errors, ...result.warnings].map((f) => f.rule);
    });

    expect(raised).toContain('bench-type-floor');
  });

  test('the floor is off unless a caller asks for it', async ({ page }) => {
    // A hand-written template may set any size it likes, so the check must not be ambient.
    const raised = await page.evaluate(async () => {
      const pipeline = await import('/src/ai/lite/pipeline.ts');
      const bench = await import('/src/validation/runtimeBench.ts');
      type Decision = Parameters<typeof pipeline.compileLiteDecision>[0];
      type Context = Parameters<typeof pipeline.compileLiteDecision>[1];
      const decision = {
        fit: 'catalog', reason: 'x', name: 'x', summary: 'x',
        category: 'lower-third', variantId: 'lt32',
        intent: { kind: 'person', primaryRole: 'person-name', secondaryRole: 'person-role' },
        lines: [
          { title: 'Name', sample: 'Amina Okafor', role: 'person-name' },
          { title: 'Role', sample: 'Head Coach', role: 'person-role' },
        ],
        flourish: null,
      } as unknown as Decision;
      const compiled = await pipeline.compileLiteDecision(decision, {} as Context);
      const template = compiled.template;
      if (!template) return ['NO TEMPLATE'];
      const field = template.fields.find((f) => f.ftype === 'textfield' || f.ftype === 'textarea');
      const shrunk = {
        ...template,
        css: `${template.css}\n#${field?.field} { font-size: 9px !important; }\n`,
      };
      const result = await bench.benchTemplateRuntime(shrunk, {});
      return [...result.errors, ...result.warnings].map((f) => f.rule);
    });

    expect(raised).not.toContain('bench-type-floor');
  });
});
