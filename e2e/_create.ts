import { expect, test, type Page } from '@playwright/test';

/**
 * THE OLD CODE EDITOR IS CLOSED (owner, 2026-09-24). No route renders AppShell and there is no
 * Advanced mode, so a test that needs either cannot pass any more. Each helper below that used to
 * reach the old editor now SKIPS the test calling it, with this reason, instead of letting it
 * fail on a surface that never appears. The backlog file lists every spec that still calls one
 * and what each asserted; they are rewritten against the library, the control page, the export
 * or the new editor, and this reason disappears with the last of them.
 */
export const OLD_EDITOR_SKIP =
  'Reaches the old code editor (AppShell), which no route opens any more - docs/backlog/specs-that-still-open-the-old-editor.md';

/** Skip the running test for the reason above. Call it from a test body or a beforeEach. */
export function skipOldEditor(): void {
  test.skip(true, OLD_EDITOR_SKIP);
}

// Fast project bootstrap for specs whose subject is NOT the creation flow itself.
//
// Walking the wizard UI costs ~1.5-2 s per test and re-exercises the same clicks hundreds of
// times per run. This helper produces the EXACT template the wizard's Create button would -
// it runs the same code path in the page (buildDraftTemplate on a default draft with the
// variant picked, formatTemplate, applyTemplate with resetSampleData, the doc-kind flip, and
// the project-brand capture) - without the click walk. The wizard's own specs
// (wizard-*.spec.ts, flows.spec.ts, ux.spec.ts's direction test, ...) keep clicking through the
// real steps; that is what covers the wizard.

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
 * RETIRED: Advanced mode no longer exists, so a spec that opted into it reached the old editor.
 * It skips the calling test (OLD_EDITOR_SKIP above). The page parameter stays so the specs still
 * calling it compile unchanged until they are rewritten.
 */
export async function enableAdvancedMode(_page: Page): Promise<void> {
  skipOldEditor();
}

/** RETIRED with Advanced mode: skips the calling test (OLD_EDITOR_SKIP above). */
export async function switchToAdvancedMode(_page: Page): Promise<void> {
  skipOldEditor();
}

/**
 * RETIRED: Finish has no door into the old code editor any more, so a walk that ended there
 * skips the calling test (OLD_EDITOR_SKIP above). A walk that wants an editor now ends on
 * Finish's "Edit this graphic" (`wz-finish-edit-artwork`), which opens the new editor.
 */
export async function finishIntoEditor(_page: Page): Promise<void> {
  skipOldEditor();
}

/**
 * RETIRED with the old editor: this bootstrap landed in AppShell and every caller asserted on it,
 * so it skips the calling test (OLD_EDITOR_SKIP above). A spec rewritten off the old editor calls
 * `bootstrapGraphic` below instead, which puts the same graphic in the working slot and lands on
 * Home.
 */
export async function createProject(_page: Page, _spec: string | CreateSpec = 'Hairline'): Promise<void> {
  skipOldEditor();
}

/**
 * Put a created catalog graphic in the working slot and land on HOME (`#/home`). Every surface
 * that still exists starts from there and reads the working document: a production
 * (`openProductionWithCurrent`), the export window (`openExportWindow`) and the new editor.
 * It is `createProject` without the old editor, which that helper landed in until 2026-09-24.
 */
export async function bootstrapGraphic(page: Page, spec: string | CreateSpec = 'Hairline'): Promise<void> {
  const wanted: CreateSpec = typeof spec === 'string' ? { name: spec } : spec;
  // `#/home` rather than the bare route: a first-ever visit rewrites the bare route to `#/new`
  // and opens the wizard, while an explicit Home route closes the startup wizard (App.tsx), so a
  // first visit and a mid-test re-bootstrap land on the same page. This helper never drives the
  // wizard UI.
  await page.goto('/app#/home');
  // 30 s, NOT the 7 s default. This is a COLD /app boot: Vite transforms the app's module graph
  // on first request, and `/app` then boots through app.html's watchdog with durable-store
  // hydration allowed 4 s of its own before it falls back to localStorage. Under a nine-worker
  // suite on a RAM-bound laptop the first spec through this door regularly wants more than seven
  // seconds, and it fails as "element(s) not found" - which reads like a broken shell rather
  // than a slow one. Measured 2026-09-05: the first two wave2 tests failed here on two
  // consecutive full plans and all six passed in 15 s when the file ran alone.
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
  await page.evaluate(async (s: CreateSpec) => {
    const { CATALOG, variantsFor } = await import('/src/templates/catalog.ts');
    const { CATEGORIES } = await import('/src/model/wizard.ts');
    const { initialDraft, mergeDraft, buildDraftTemplate } = await import('/src/components/wizard/draft.ts');
    const { formatTemplate } = await import('/src/format/formatCode.ts');
    const { setDefaultBrand } = await import('/src/model/brand.ts');
    const { createLook } = await import('/src/model/packets.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
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
    if (!variant) throw new Error(`bootstrapGraphic: no catalog variant for ${JSON.stringify(s)}`);

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
    useDocKindStore.getState().setKind('spx');
    // A NAMED brand, and the default pointer at it - the anonymous record Create used to
    // write is retired (model/brand.ts). This is what makes the wizard's footer chooser
    // appear in a spec that starts from a created project, exactly as the old toggle did.
    //
    // It is a DURABLE write where the old `saveBrand` was a synchronous localStorage one, so
    // it is committed below before this bootstrap returns: a spec that reloads soon after
    // would otherwise come back to an empty look list about one time in three, and read as
    // the chooser being broken (e2e/AGENTS.md, the durable-seed hazard).
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
    await commitDurableWrites();
  }, wanted);
  await expect(page.locator('.wz-modal')).toBeHidden();
}

/**
 * Put the working graphic into a NEW production and land on that production's page. The old
 * editor's Rehearse panel did this with "Create", "+ Add current" and "Open production page";
 * this calls the same model functions that panel called (`createShowNamedChecked`, then
 * `addGraphicToShow` with the saved library id when there is one), waits for the durable write,
 * and navigates inside the app rather than reloading, so the page keeps whatever state the spec
 * built up. Returns the production's id.
 */
export async function openProductionWithCurrent(page: Page, name: string): Promise<string> {
  const id = await page.evaluate(async (showName: string) => {
    const { createShowNamedChecked, addGraphicToShow } = await import('/src/model/shows.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { useRouter } = await import('/src/app/router.ts');
    const { show, error: notCreated } = createShowNamedChecked(showName);
    if (notCreated) throw new Error(`openProductionWithCurrent: ${notCreated}`);
    const { template, saved } = useTemplateStore.getState();
    const { error } = addGraphicToShow(show.id, template, { graphicId: saved.graphicId });
    const failure = error ?? (await commitDurableWrites());
    if (failure) throw new Error(`openProductionWithCurrent: ${failure}`);
    useRouter.getState().navigate({ view: 'production', id: show.id });
    return show.id;
  }, name);
  await expect(page.getByTestId('production-page')).toBeVisible();
  return id;
}

/**
 * Open the NEW editor on the working graphic, by its route (`/app?editor=foundation#/editor-
 * foundation`), the same place Finish's "Edit this graphic" lands. Its header carries the save
 * controls (`save-graphic`, the save dialog) that the old editor's topbar used to. The working
 * slot is durable by then (bootstrapGraphic commits it), so the load reads the created graphic.
 */
export async function openWorkingGraphicInEditor(page: Page): Promise<void> {
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible({ timeout: 30_000 });
}

/**
 * Open the export window on the WORKING graphic: its template, its sample data and its saved
 * library id, which is exactly what the old editor's Export panel exported. The window renders
 * the same ExportSurface that panel did (components/ExportWindow.tsx), so the target list, the
 * validation and "Validate & download" are the ones under test. The doors that open it (Finish,
 * a Home row) have their own specs.
 */
export async function openExportWindow(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { useExportUi } = await import('/src/components/ExportWindow.tsx');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { template, sampleData, saved } = useTemplateStore.getState();
    useExportUi.getState().openExport({ template, sampleData, graphicId: saved.graphicId });
  });
  await expect(page.getByTestId('export-window')).toBeVisible();
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
  // The DOOR (NewGraphicButton, `data-door`), never any button with that name: Home's empty
  // library carries a plain "+ New graphic" call to action as well, and a role query then fails
  // strict mode. That is how every signed-in configured spec went red on 2026-09-24, once sign-in
  // landed on Home instead of the old editor. Every surface mounts the door once; the wizard
  // mounts its own copy too, so with the wizard already open this still matches two, as the role
  // query always did.
  await page.locator('[data-door="new-graphic"]').click();
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
