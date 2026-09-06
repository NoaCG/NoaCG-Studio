import { expect, type Page } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';

// Fast project bootstrap for specs whose subject is NOT the creation flow itself.
//
// Walking the wizard UI costs ~1.5-2 s per test and re-exercises the same clicks hundreds of
// times per run. This helper produces the EXACT template the wizard's Create button would -
// it runs the same code path in the page (buildDraftTemplate on a default draft with the
// variant picked, formatTemplate, applyTemplate with resetSampleData, setActiveTab, the
// doc-kind flip, and the project-brand capture) - without the click walk. The wizard's own
// specs (wizard-*.spec.ts, flows.spec.ts, ux.spec.ts's direction test, ...) keep clicking
// through the real steps; that is what covers the wizard.

export interface CreateSpec {
  /** Exact catalog variant name, e.g. 'Hairline', 'Match Strip', 'Glass Mark'. */
  name?: string;
  /** Category id ('lower-third') or wizard label ('Lower thirds') - used with `index`. */
  category?: string;
  /** Variant index within the category (the wizard's default order). Defaults to 0. */
  index?: number;
  /** The Animation step's "Reveal in steps" checkbox. */
  steps?: boolean;
}

/**
 * Open /app and create a catalog project directly - the deterministic, fast counterpart of
 * clicking Entry -> Category -> Template -> Create project. Waits out the preview rebuild,
 * so the test starts against the created document.
 */
/**
 * ADVANCED-MODE BOOTSTRAP (docs/GOALS_ARCHIVE.md "Student release" step 4): opt a spec into the
 * classic editor-centric behavior - '' boots into the editor, every editor door shows, and
 * an editor shell renders under the wizard. For specs whose SUBJECT is the editor world;
 * specs asserting the DEFAULT experience simply don't call it. Must run BEFORE the first
 * goto. NOTE: addInitScript also runs inside the same-origin srcdoc preview iframe -
 * WRITING this pref key there is harmless (unlike the documented localStorage-CLEAR trap),
 * it just re-writes the same value.
 */
export async function enableAdvancedMode(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // The WHOLE body is guarded: this init script also runs inside sandboxed preview
    // iframes (allow-scripts without allow-same-origin), where merely TOUCHING
    // localStorage throws a SecurityError - and an uncaught one lands in the page-error
    // listeners some specs assert empty. There is nothing to persist in such a frame.
    try {
      let prefs: Record<string, unknown> = {};
      try {
        prefs = JSON.parse(localStorage.getItem('spx-gfx-prefs') ?? '{}') as Record<string, unknown>;
      } catch {
        prefs = {}; // corrupt JSON - rebuild the key
      }
      if (prefs.advancedMode !== true) {
        localStorage.setItem('spx-gfx-prefs', JSON.stringify({ ...prefs, advancedMode: true }));
      }
    } catch {
      /* opaque-origin frame: no storage to write, nothing to do */
    }
  });
}

/**
 * Create INTO THE EDITOR from any configuring step of a template-mode walk: Skip to finish
 * (the footer's one-click "Create project" became this shortcut - docs/GOALS_ARCHIVE.md "Student
 * release" step 6), then the Finish step's editor door. The door is Advanced-only, so any
 * spec calling this must have run enableAdvancedMode before its goto.
 */
export async function finishIntoEditor(page: Page): Promise<void> {
  await page.getByTestId('wz-skip-to-finish').click();
  await page.getByTestId('wz-finish-editor').click();
}

export async function createProject(page: Page, spec: string | CreateSpec = 'Hairline'): Promise<void> {
  const wanted: CreateSpec = typeof spec === 'string' ? { name: spec } : spec;
  // Editor subject by definition - see enableAdvancedMode above.
  await enableAdvancedMode(page);
  await page.goto('/app');
  // Boot signal only — deliberately NOT the wizard: the wizard auto-opens solely on a
  // first-ever visit (no autosaved project), so a mid-test re-bootstrap lands straight in
  // the editor. This helper never drives the wizard UI; both shells render a `.topbar`.
  //
  // 30 s, NOT the 7 s default. This is a COLD /app boot: Vite transforms the app's module graph
  // on first request, and `/app` then boots through app.html's watchdog with durable-store
  // hydration allowed 4 s of its own before it falls back to localStorage. Under a nine-worker
  // suite on a RAM-bound laptop the first spec through this door regularly wants more than seven
  // seconds, and it fails as "element(s) not found" - which reads like a broken shell rather
  // than a slow one. Measured 2026-09-05: the first two wave2 tests failed here on two
  // consecutive full plans and all six passed in 15 s when the file ran alone.
  await expect(page.locator('.topbar')).toBeVisible({ timeout: 30_000 });
  await awaitPreviewRebuild(page, () =>
    page.evaluate(async (s: CreateSpec) => {
      const { CATALOG, variantsFor } = await import('/src/templates/catalog.ts');
      const { CATEGORIES } = await import('/src/model/wizard.ts');
      const { initialDraft, mergeDraft, buildDraftTemplate } = await import('/src/components/wizard/draft.ts');
      const { formatTemplate } = await import('/src/format/formatCode.ts');
      const { setDefaultBrand } = await import('/src/model/brand.ts');
      const { createLook } = await import('/src/model/packets.ts');
      const { saveProject } = await import('/src/model/project.ts');
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const { useDocKindStore } = await import('/src/store/docKindStore.ts');

      const cat = s.category
        ? CATEGORIES.find((c) => c.id === s.category || c.name === s.category)
        : undefined;
      const pool = cat ? variantsFor(cat.id) : Object.values(CATALOG).flat();
      // Exact name first; substring second (the specs historically matched card text with
      // hasText); no name = the category's first card, the wizard's default order.
      const variant = s.name
        ? pool.find((v) => v.name === s.name) ?? pool.find((v) => v.name.includes(s.name!))
        : pool[s.index ?? 0];
      if (!variant) throw new Error(`createProject: no catalog variant for ${JSON.stringify(s)}`);

      // The same draft the wizard holds after picking this variant card (CreationWizard's
      // onPickVariant patch on a fresh draft), then the same create path as its Create button.
      const draft = mergeDraft(initialDraft(), {
        variantId: variant.id,
        lines: variant.suggestedLines.map((l) => ({ ...l })),
        zone: null,
        logoEnabled: null,
        animation: s.steps ? { presetId: null, outPresetId: null, steps: true } : { presetId: null, outPresetId: null },
        paletteId: null,
        customPalette: null,
        fontId: null,
      });
      const template = await formatTemplate(buildDraftTemplate(variant, draft));
      const store = useTemplateStore.getState();
      store.applyTemplate(template, { resetSampleData: true });
      store.setActiveTab('html');
      useDocKindStore.getState().setKind('spx');
      // A NAMED brand, and the default pointer at it - the anonymous record Create used to
      // write is retired (model/brand.ts). This is what makes the wizard's footer chooser
      // appear in a spec that starts from a created project, exactly as the old toggle did.
      const made = createLook(`${variant.name} look`, {
        styleTag: variant.styleTag,
        palette: variant.defaultPalette,
        fontId: variant.defaultFontId,
        customFont: null,
      });
      setDefaultBrand(made.id);

      // The production autosaver intentionally waits 800 ms, but this direct bootstrap can
      // reach a reload assertion sooner than a person can finish the wizard. Persist the same
      // working-slot payload now so returning-user tests start from a durable created project.
      const created = useTemplateStore.getState();
      saveProject(
        created.template,
        created.baseline,
        { graphicId: created.saved.graphicId, dirty: created.saved.dirty },
        created.aiSpec,
        created.aiThread,
      );
    }, wanted),
  );
  await expect(page.locator('.wz-modal')).toBeHidden();
}

/**
 * Open the creation wizard from the topbar's "+ New graphic", clearing the unsaved-changes
 * guard when it interposes.
 *
 * Creating REPLACES the working document, so the SPX topbar routes that button through
 * `requestSwitch` (store/saveActions.ts) and a DIRTY project asks first - which is every
 * project a spec just created, since a wizard create marks the fresh document unsaved. A spec
 * whose subject is not the save flow discards, the same choice library.spec.ts makes for the
 * other switch route; library.spec.ts owns proving that the guard appears at all. A clean
 * project (or the video shell, which never guards) goes straight to the wizard.
 */
export async function startNewProject(page: Page): Promise<void> {
  await page.getByRole('button', { name: '+ New graphic' }).click();
  const guard = page.getByTestId('confirm-switch');
  const wizard = page.getByTestId('creation-wizard');
  await expect(guard.or(wizard)).toBeVisible();
  if (await guard.isVisible()) await guard.getByTestId('switch-discard').click();
  await expect(wizard).toBeVisible();
}

/**
 * Press the Finish step's primary door and answer the confirmation it raises.
 *
 * The door stopped being a one-click hand-off on 2026-09-02 (owner walk): it now names the
 * production the graphic is going into
 * before leaving the wizard, because the door BESIDE it always asked something and the silent
 * one was being pressed by mistake. Every spec that only wants to BE on the production page
 * goes through here, so the ceremony is stated once - wizard-finish.spec.ts owns proving the
 * dialog itself.
 */
export async function addToProductionFromFinish(page: Page): Promise<void> {
  await page.getByTestId('wz-finish-production-go').click();
  await page.getByTestId('wz-finish-production-confirm-go').click();
}
