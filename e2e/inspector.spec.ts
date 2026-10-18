// covers: src/blocks/**

import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic, skipOldEditor } from './_create';

// The old Inspector column (src/components/timeline/Inspector.tsx, the retired code editor's
// panel) was deleted on 2026-10-17 with the seven cases that drove it; the new editor's own
// Inspector is pinned by e2e/editor-*.spec.ts. Left here: the filter-track runtime check, and
// the redo-branch case, which skips itself (its speed knob was the old Inspector's) until it is
// rewritten as a store test (issue #800).

async function createHairline(page: Page) {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
}

test('redo: Ctrl+Shift+Z restores an undone edit; a new edit clears the redo branch', async ({ page }) => {
  skipOldEditor();
  await createHairline(page);
  // The speed knob writes the data block's speed field (one undoable apply per pick).
  const speed = async () =>
    page.evaluate(async () => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const { parseAnimData } = await import('/src/blocks/animData.ts');
      return parseAnimData(useTemplateStore.getState().template.js)?.speed;
    });
  await page.getByTestId('tlv2-speed').selectOption('1.5');
  expect(await speed()).toBe(1.5);
  await page.keyboard.press('Control+z');
  expect(await speed()).toBe(1);
  await page.keyboard.press('Control+Shift+z');
  expect(await speed()).toBe(1.5);
  // Undo again, make a DIFFERENT edit — the redo branch is gone (the classic cut).
  await page.keyboard.press('Control+z');
  await page.getByTestId('tlv2-speed').selectOption('0.75');
  expect(await speed()).toBe(0.75);
  await page.keyboard.press('Control+Shift+z');
  expect(await speed()).toBe(0.75); // no stale redo applied
});

test('filter track: every keyframe keeps the same shape, so the runtime really interpolates it', async ({ page }) => {
  await createHairline(page);
  // Author a two-filter entrance directly, then prove BOTH numbers move at runtime. This is the
  // invariant the composed track rests on: GSAP matches a filter string's numbers positionally,
  // so keyframes that disagreed on their function list would jump instead of tweening.
  const result = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData, spliceAnimData } = await import('/src/blocks/animData.ts');
    const { setFilterComponent } = await import('/src/blocks/animEdit.ts');
    const { resolveValue } = await import('/src/blocks/animEval.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');

    const store = useTemplateStore.getState();
    const tpl = store.template;
    let d = parseAnimData(tpl.js)!;
    const SEL = '#f0';
    d = setFilterComponent(d, 0, SEL, 'blur', 12, 0);
    d = setFilterComponent(d, 0, SEL, 'blur', 0, 0.6);
    d = setFilterComponent(d, 0, SEL, 'brightness', 2, 0);
    d = setFilterComponent(d, 0, SEL, 'brightness', 1, 0.6);
    const track = d.steps[0].layers[SEL].filter.map((k) => String(k.value));

    // One shape across the whole track — the interpolable invariant.
    const shape = (s: string) => (s.match(/[a-z-]+\(/g) ?? []).join(',');
    const shapes = [...new Set(track.map(shape))];

    // The editor resolves the in-between too (strings used to STEP — the other half of gap 8).
    const midEditor = String(resolveValue(d, SEL, 'filter', 0, 0.3));

    // The runtime: boot it and read the computed filter mid-tween.
    const js = spliceAnimData(tpl.js, d)!;
    const midRuntime = await new Promise<string>((res) => {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:-9999px;width:1280px;height:720px';
      f.srcdoc = composeDocument({ ...tpl, js });
      f.onload = () => {
        const w = f.contentWindow as unknown as { buildInTimeline: () => gsap.core.Timeline; getComputedStyle: typeof getComputedStyle };
        const el = f.contentDocument!.querySelector(SEL)!;
        const tl = w.buildInTimeline();
        tl.pause();
        tl.seek(0.001);
        tl.seek(0.3);
        const v = w.getComputedStyle(el).filter;
        f.remove();
        res(v);
      };
      document.body.appendChild(f);
    });

    const nums = (s: string) => (s.match(/-?[\d.]+/g) ?? []).map(Number);
    return { track, shapes, midEditor, midRuntime, runtimeNums: nums(midRuntime) };
  });

  expect(result.shapes).toHaveLength(1); // one function list across every keyframe
  expect(result.track.every((v) => v.includes('blur(') && v.includes('brightness('))).toBe(true);

  // Mid-tween, BOTH filters are strictly between their endpoints — they really interpolate,
  // and neither has been frozen or dropped by the other.
  const [blur, brightness] = result.runtimeNums;
  expect(blur).toBeGreaterThan(0);
  expect(blur).toBeLessThan(12);
  expect(brightness).toBeGreaterThan(1);
  expect(brightness).toBeLessThan(2);

  // The editor no longer steps, and it reads the SAME eased in-between the runtime renders: both
  // evaluate the step's ease through the shared ease source (templates/shared/easeRuntime.ts).
  const editorNums = (result.midEditor.match(/-?[\d.]+/g) ?? []).map(Number);
  expect(editorNums).toHaveLength(2);
  expect(Math.abs(editorNums[0] - blur)).toBeLessThan(0.01);
  expect(Math.abs(editorNums[1] - brightness)).toBeLessThan(0.01);
});
