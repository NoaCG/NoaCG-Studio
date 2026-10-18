import { expect, type Page } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';

// LEGACY TEMPLATES, for the specs that cover what Phase 8 deliberately KEPT.
//
// Every category creates as a NOACG_ANIM data block, so no wizard path produces a legacy marked
// region any more. Legacy regions still exist in the wild, though — a project saved before the
// migration, an import, hand-written GSAP — and the editor must still render them settled.
// This helper writes the one shape that case drives; the unconvertible and unreadable shapes
// went with the retired dock's surfaces.

/** Swap the current template's marked region for `region`, and apply it (one undoable apply).
 *
 *  The rebuild wait WRAPS the evaluate rather than following it. The change happens inside the
 *  page, and the evaluate's round trip - including a cold dynamic import of the store module -
 *  can easily outlast the preview's 350 ms debounce. Waiting afterwards then reads a revision
 *  that has ALREADY advanced and waits out the clock for a second rebuild nothing will trigger.
 *  Wrapping snapshots the revision first, so "it changed" can only mean this splice. */
async function spliceRegion(page: Page, region: string) {
  await awaitPreviewRebuild(page, () =>
    page.evaluate(async (body) => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const store = useTemplateStore.getState();
      const tpl = store.template;
      const start = tpl.js.indexOf('/* == ANIMATION');
      const end = tpl.js.indexOf('/* == END ANIMATION == */');
      store.applyTemplate({
        ...tpl,
        js: tpl.js.slice(0, start) + body + tpl.js.slice(end + '/* == END ANIMATION == */'.length),
      });
    }, region),
  );
}

/**
 * A legacy region the importer CAN read — the ordinary case: a project saved before the
 * migration. Its motion is shown on the step timeline, READ-ONLY, with "use keyframes" one
 * click away; there is no second editing surface for it.
 */
export async function applyLegacyRegion(
  page: Page,
  opts: { prefix: string; presetId: string; steps?: boolean },
) {
  const region = await page.evaluate(async ({ prefix, presetId, steps }) => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { anyPresetById } = await import('/src/blocks/presetRegistry.ts');
    const { countLines } = await import('/src/model/structure.ts');
    const tpl = useTemplateStore.getState().template;
    const preset = anyPresetById(presetId as Parameters<typeof anyPresetById>[0]);
    return preset.emit({
      prefix,
      lineCount: Math.max(1, countLines(tpl.html)),
      hasAccent: tpl.html.includes(`${prefix}-accent`),
      hasBars: tpl.html.includes(`${prefix}-bar-fill`),
      steps: !!steps,
      stepOutsideParts: [],
      speed: 1,
      easeIn: preset.autoEase.easeIn,
      easeOut: preset.autoEase.easeOut,
    });
  }, opts);
  await spliceRegion(page, region);
  await expect(page.getByTestId('timeline-v2')).toBeVisible();
  await expect(page.getByTestId('timeline-v2-convert')).toBeVisible();
}

