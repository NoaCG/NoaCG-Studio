import { enableAdvancedMode, finishIntoEditor } from './_create';
import { test, expect, type Page } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { awaitDurableReady } from './_durable';
import { chooseType, pickDesign } from './_browse';

// THE BRAND CHOOSER (docs/BRAND_PLAN.md §5). A brand is a NAMED, saved record - colours,
// typeface, shape and a logo - and the wizard's footer offers it by name. What this file pins:
//
//   · with no brands saved there is no chooser at all, not a disabled one;
//   · choosing a brand puts its accent, its typeface AND its logo into the created graphic's
//     own code, even on a design whose own default is logo-off;
//   · None takes back exactly what the brand put there;
//   · Create writes no brand record - the anonymous one it used to overwrite is retired;
//   · applying a brand to a graphic that ALREADY exists fills a logo slot it has, and leaves a
//     graphic with no slot untouched.

/** A visible 1×1 red PNG, so an injected mark can be told apart from an empty slot. */
const LOGO_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP4z8DwHwAFAAH/VscvDQAAAABJRU5ErkJggg==';

const ACCENT = '#00ff88';
const BRAND_NAME = 'Channel A7';
/** Not the Hairline Card's own face (`inter`), so the typeface assertion cannot pass by accident. */
const BRAND_FONT = 'oswald';

/** Save a brand the way Home's Brands section does, and point "new graphics" at it. Returns the
 *  record's id. The write is CONFIRMED before the caller reloads - the durable store reports a
 *  refusal after the call returns (model/durableStore.ts). */
async function seedBrand(page: Page, opts: { logo: boolean }): Promise<string> {
  // HYDRATE FIRST. Every mutator in model/ is a read-modify-WHOLE-RECORD write over the
  // synchronous mirror (model/AGENTS.md), so seeding into a mirror that has not finished
  // hydrating is a write against a list that is not yet the list. Measured 2026-09-06: without
  // this the reloaded page read `loadLooks()` as `[]` about one run in three, and the wizard
  // then honestly showed no chooser - a green-or-red coin flip on a fact that was never in
  // question.
  await awaitDurableReady(page);
  return page.evaluate(async ({ logo, accent, name, fontId, data }) => {
    const { createLook } = await import('/src/model/packets.ts');
    const { setDefaultBrand } = await import('/src/model/brand.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const look = createLook(name, {
      styleTag: 'minimal',
      // A CAPTURED palette id, which is the shape a brand made from a real graphic has - and the
      // one `paletteById` cannot resolve, so it has to travel as a custom palette (the comment
      // on wizard/draft.ts `brandPatch` records what happened when it did not).
      palette: { id: 'captured', name: 'Captured', styleTags: ['minimal'], accent, text: '#ffffff', textDim: 'rgba(255,255,255,0.7)', panel: 'rgba(12,14,18,0.92)' },
      fontId,
      customFont: null,
      ...(logo ? { logo: { path: 'images/a7-mark.png', data } } : {}),
    });
    setDefaultBrand(look.id);
    await commitDurableWrites();
    return look.id;
  }, { logo: opts.logo, accent: ACCENT, name: BRAND_NAME, fontId: BRAND_FONT, data: LOGO_DATA_URL });
}

/** The document the wizard just created, read out of the store. */
async function createdTemplate(page: Page) {
  return page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const t = useTemplateStore.getState().template;
    return { html: t.html, css: t.css, fields: t.fields, assets: t.assets.map((a) => a.path) };
  });
}

/** Open the wizard on Browse with a design picked, past the step where the chooser appears.
 *  Advanced mode first: `finishIntoEditor` takes the Finish step's EDITOR door, which the
 *  student release hides behind that switch (e2e/_create.ts `enableAdvancedMode`). */
async function openWizard(page: Page) {
  await enableAdvancedMode(page);
  await page.goto('/app');
}

async function toPickedDesign(page: Page) {
  await expect(page.locator('.wz-modal')).toBeVisible();
  await awaitDurableReady(page);
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, 'Topic');
  await pickDesign(page, 'Hairline Card');
}

test('with no brands saved the wizard offers no chooser', async ({ page }) => {
  await openWizard(page);
  await toPickedDesign(page);
  // ABSENT, not disabled (docs/BRAND_PLAN.md decision 1): an empty chooser is a promise this
  // install cannot keep, and the door to making a brand is Home.
  await expect(page.locator('[data-testid="wz-brand"]')).toHaveCount(0);
});

test('a chosen brand puts its accent, typeface and logo into the created graphic', async ({ page }) => {
  await openWizard(page);
  await seedBrand(page, { logo: true });
  await page.reload();
  await toPickedDesign(page);

  const chooser = page.locator('[data-testid="wz-brand"]');
  await expect(chooser).toBeVisible();
  // None until somebody chooses: matching is explicit, and the DEFAULT brand does not
  // preselect itself here.
  await expect(chooser).toHaveValue('');
  await chooser.selectOption({ label: BRAND_NAME });

  await awaitPreviewRebuild(page, async () => {
    await finishIntoEditor(page);
    await expect(page.locator('.wz-modal')).toBeHidden();
  });

  const t = await createdTemplate(page);
  expect(t.css).toContain(ACCENT);
  expect(t.css).toContain('Oswald');
  // THE LOGO, in the design's own slot - a real SPX image field bound to an <img>, with the
  // mark bundled as an asset. This design declares no `defaultLogo` at all, so its slot is off
  // until something supplies a path; the brand is what supplies one (decision 2). No shipped
  // design declares `defaultLogo: false`, so the stronger half of that decision - a brand
  // overriding an explicit logo-off - has nothing in the catalog to be tested against yet.
  const logoField = t.fields.find((f) => f.ftype === 'filelist');
  expect(logoField).toMatchObject({ value: 'images/a7-mark.png' });
  expect(t.assets).toContain('images/a7-mark.png');
  expect(t.html).toContain(`<img id="${logoField!.field}"`);
  expect(t.html).toContain('src="images/a7-mark.png"');
});

test('None takes back exactly what the brand put there', async ({ page }) => {
  await openWizard(page);
  await seedBrand(page, { logo: true });
  await page.reload();
  await toPickedDesign(page);

  const chooser = page.locator('[data-testid="wz-brand"]');
  await chooser.selectOption({ label: BRAND_NAME });
  await chooser.selectOption('');

  await awaitPreviewRebuild(page, async () => {
    await finishIntoEditor(page);
    await expect(page.locator('.wz-modal')).toBeHidden();
  });

  const t = await createdTemplate(page);
  expect(t.css).not.toContain(ACCENT);
  expect(t.css).not.toContain('Oswald');
  expect(t.assets).not.toContain('images/a7-mark.png');
  // …and the slot went with it: nothing is left pointing at a file the graphic no longer holds.
  expect(t.fields.some((f) => f.ftype === 'filelist')).toBe(false);
});

test('creating a graphic writes no brand record', async ({ page }) => {
  await openWizard(page);
  const id = await seedBrand(page, { logo: false });
  await page.reload();
  await toPickedDesign(page);
  await awaitPreviewRebuild(page, async () => {
    await finishIntoEditor(page);
    await expect(page.locator('.wz-modal')).toBeHidden();
  });

  // Create used to overwrite one anonymous record with whatever had just been made, which is
  // why the old footer offer proposed a look nobody had chosen (docs/BRAND_PLAN.md decision 6).
  // A post-reload read from an `evaluate` outruns hydration unless it is asked to wait
  // (e2e/_durable.ts): the mirror falls back to localStorage, where looks do not live, and the
  // answer is an honest, wrong, empty list.
  await awaitDurableReady(page);
  const after = await page.evaluate(async () => {
    const { loadLooks } = await import('/src/model/packets.ts');
    return {
      looks: loadLooks().map((l) => l.name),
      legacy: localStorage.getItem('spx-gfx-brand'),
    };
  });
  expect(after.looks).toEqual([BRAND_NAME]);
  expect(after.legacy).toBeNull();
  expect(id).toBeTruthy();
});

test('applying a brand fills an existing logo slot and leaves a slotless graphic untouched', async ({ page }) => {
  await openWizard(page);
  await seedBrand(page, { logo: true });

  const result = await page.evaluate(async ({ accent, data }) => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { initialDraft, mergeDraft, buildDraftTemplate } = await import('/src/components/wizard/draft.ts');
    const { applyLookToTemplate, loadBrand } = await import('/src/model/packets.ts');

    const all = Object.values(CATALOG).flat();
    const build = (variantId: string, logoEnabled: boolean | null) => {
      const variant = all.find((v) => v.id === variantId)!;
      return buildDraftTemplate(
        variant,
        mergeDraft(initialDraft(), {
          variantId: variant.id,
          lines: variant.suggestedLines.map((l) => ({ ...l })),
          zone: null,
          logoEnabled,
          animation: { presetId: null, outPresetId: null },
        }),
      );
    };

    // A design that CAN hold a mark, created with its slot on but no file in it - the ordinary
    // shape of a graphic somebody made before they had a brand.
    const withSlot = all.find((v) => v.logo === 'optional')!;
    // …and one that declares no slot at all.
    const slotless = all.find((v) => v.logo === 'none')!;

    const before = build(withSlot.id, true);
    const bare = build(slotless.id, null);
    const brand = loadBrand()!;
    const filled = applyLookToTemplate(before, brand);
    const untouched = applyLookToTemplate(bare, brand);

    const slotField = filled.fields.find((f) => f.ftype === 'filelist');
    return {
      accentWritten: filled.css.includes(accent) && untouched.css.includes(accent),
      slotValue: slotField?.value ?? null,
      // The definition block the operator's file picker reads, not just the parsed copy.
      definitionCarriesPath: filled.html.includes('"images/a7-mark.png"'),
      srcWritten: /<img[^>]*src="images\/a7-mark\.png"/.test(filled.html),
      // The empty slot hides itself inline while it holds no file; leaving that behind would
      // bundle the mark and show nothing.
      stillHidden: /<img[^>]*id="[^"]*"[^>]*style="display: none"/.test(filled.html),
      markBundled: filled.assets.some((a) => a.path === 'images/a7-mark.png' && a.data === data),
      slotlessHtmlUnchanged: untouched.html === bare.html,
      slotlessFieldsUnchanged: JSON.stringify(untouched.fields) === JSON.stringify(bare.fields),
      slotlessHasNoMark: untouched.assets.every((a) => a.path !== 'images/a7-mark.png'),
    };
  }, { accent: ACCENT, data: LOGO_DATA_URL });

  expect(result.accentWritten).toBe(true);
  expect(result.slotValue).toBe('images/a7-mark.png');
  expect(result.definitionCarriesPath).toBe(true);
  expect(result.srcWritten).toBe(true);
  expect(result.stillHidden).toBe(false);
  expect(result.markBundled).toBe(true);
  // NOTHING IS INVENTED for a design with no place for a mark: same markup, same fields, no
  // asset. That is what makes "apply a brand" safe to press on anything (decision 2).
  expect(result.slotlessHtmlUnchanged).toBe(true);
  expect(result.slotlessFieldsUnchanged).toBe(true);
  expect(result.slotlessHasNoMark).toBe(true);
});
