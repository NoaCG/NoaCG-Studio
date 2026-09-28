// covers: src/ai/**, src/components/wizard/steps/{AiStep.tsx,ai/**}
// covers: src/components/wizard/**, !src/components/wizard/import/**

import { test, expect, type Page, type Route } from '@playwright/test';
import { chooseNoacgAgent } from './_ai-step';
import { enableAdvancedMode } from './_create';
import { previewFrame } from './_frame';
import { awaitPreviewRebuild } from './_preview';

// ADAPT-FIRST Create with AI, end to end (docs/ADAPT_FIRST_PLAN.md).
//
// The product promise is "describe the graphic you need, and NoaCG turns a PROVEN broadcast
// design into a customized, editable, production-ready graphic". This spec walks that whole
// sentence with the gateway mocked at the network level — so the harness runs its real
// pipeline (intent -> retrieval -> design stage -> grounded assembly -> validation + runtime
// bench) and nothing depends on a model actually designing anything.
//
// What it pins, in the order the promise makes the claims:
//   1. the design stage is shown the RETRIEVED designs, not the 430-variant catalog;
//   2. the schema accepts exactly what the prompt showed;
//   3. the assembled graphic keeps the zone its design was drawn for;
//   4. the result names the proven design it was adapted from;
//   5. what lands in the editor is customized, valid, and editable.

const GENERATED = { timeout: 25_000 };

/** A worship brief the catalog answers with designs drawn for exactly that production. */
const BRIEF = 'A worship service lower third with the scripture reference and the reader name';

const WORSHIP_INTENT = {
  kind: 'family',
  families: ['strap'],
  confidence: 'high',
  summary: 'A lower third naming a reader and a scripture reference.',
  parts: [{ id: 'line', role: 'line' }],
  fields: [
    { key: 'reader', role: 'line', label: 'Reader' },
    { key: 'reference', role: 'line', label: 'Scripture reference' },
  ],
  tone: ['calm'],
  originalityRequested: false,
};

/** The design decision the model returns. `zone` is deliberately wrong for the chassis — a
 *  top-right lower third is the "it stopped reading as one" defect the platform now refuses. */
const spec = (variantId: string) => ({
  fit: 'catalog',
  reason: 'A catalog strap carries this brief.',
  name: 'Reading Strap',
  summary: 'A worship reading strap adapted from the catalog design system.',
  category: 'lower-third',
  variantId,
  zone: 'top-right',
  paletteId: 'porcelain',
  density: 'airy',
  typography: { scaleRatio: 2.2, headingWeight: 'semibold', tracking: 'wide' },
  lines: [
    { title: 'Reader', sample: 'Miriam Aalto' },
    { title: 'Scripture reference', sample: 'John 1:1-5' },
  ],
});

function ok(input: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      output: input,
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      attempts: [{ route: { provider: 'anthropic', model: 'claude-sonnet-5' }, attempts: 1 }],
    }),
  };
}

interface Captured {
  tool: string;
  system: string;
  variantEnum: string[];
}

function capture(route: Route): Captured {
  const body = route.request().postDataJSON() as {
    request?: { system?: string; structuredOutput?: { name: string; schema: Record<string, unknown> } };
  };
  const schema = body.request?.structuredOutput?.schema as
    | { properties?: { alternatives?: { items?: { properties?: { variantId?: { enum?: string[] } } } }; variantId?: { enum?: string[] } } }
    | undefined;
  return {
    tool: body.request?.structuredOutput?.name ?? '',
    system: body.request?.system ?? '',
    variantEnum:
      schema?.properties?.alternatives?.items?.properties?.variantId?.enum ??
      schema?.properties?.variantId?.enum ??
      [],
  };
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() =>
    localStorage.setItem(
      'spx-gfx-ai',
      JSON.stringify({ provider: 'anthropic', configuredProviders: ['anthropic'], model: 'claude-sonnet-5', useHarness: true }),
    ),
  );
  // Claim 5 walks into the EDITOR through the Finish step's editor door, which has been
  // Advanced-only since step 6 (docs/GOALS_ARCHIVE.md "Student release"; FinishStep `showEditorDoor`).
  // The sibling AI specs opt in the same way - see e2e/ai-more-control.spec.ts.
  await enableAdvancedMode(page);
});

async function openAiStep(page: Page) {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="ai"]').click();
  await chooseNoacgAgent(page);
}

test('a brief becomes a customized graphic adapted from a proven design', async ({ page }) => {
  const seen: Captured[] = [];
  // Whichever design retrieval put first is the one the "model" picks — the spec must not
  // hard-code a catalog id, or it goes red the day a better worship design lands.
  let picked = '';
  await page.route('/api/ai/generate', (route: Route) => {
    const req = capture(route);
    seen.push(req);
    if (req.tool === 'emit_structural_intent') return route.fulfill(ok(WORSHIP_INTENT));
    picked = req.variantEnum[0] ?? 'lt01';
    const one = spec(picked);
    if (req.tool === 'emit_design_alternatives') return route.fulfill(ok({ alternatives: [one, one, one] }));
    return route.fulfill(ok(one));
  });

  await openAiStep(page);
  await page.locator('.wz-step textarea').first().fill(BRIEF);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.wz-step .status-ok')).toContainText('Passes validation', GENERATED);

  // ── 1. The design stage read a shortlist, not the catalog ───────────────────
  const design = seen.find((r) => r.tool.startsWith('emit_design'));
  expect(design, 'the design stage ran').toBeTruthy();
  expect(design!.system).toContain('closest PROVEN designs');
  // The full listing is ~81k characters. Anything near that means retrieval did not run.
  expect(design!.system.length).toBeLessThan(20_000);
  // It is a lower-third shortlist: no other category's designs are in the prompt.
  expect(design!.system).not.toContain('category: ticker');
  expect(design!.system).not.toContain('category: corner-bug');

  // ── 2. The schema accepts exactly the designs the prompt showed ─────────────
  expect(design!.variantEnum.length).toBeGreaterThan(0);
  expect(design!.variantEnum.length).toBeLessThan(20);
  for (const id of design!.variantEnum) expect(design!.system).toContain(`- ${id} "`);

  // The retrieval is relevant, not merely small: the designs drawn for a reading lead it.
  expect(['ls15', 'ls14']).toContain(picked);

  // ── 3. The chassis kept the zone it was drawn for ───────────────────────────
  // The spec asked for top-right; the design is a bottom-anchored strap, and 88 of 89 catalog
  // lower thirds are (docs/ADAPT_FIRST_PLAN.md §1.1).
  const declaredZone = await page.evaluate(async (id) => {
    const { variantById } = await import('/src/templates/catalog.ts');
    return (variantById(id) as { defaultZone: string }).defaultZone;
  }, picked);
  expect(declaredZone).toMatch(/^bottom-/);

  // ── 4. The result says which proven design it adapted ───────────────────────
  const variantName = await page.evaluate(async (id) => {
    const { variantById } = await import('/src/templates/catalog.ts');
    return (variantById(id) as { name: string }).name;
  }, picked);
  await expect(page.getByTestId('ai-adapted-from')).toContainText(variantName);
  await expect(page.getByTestId('ai-adapted-from')).toContainText('lower third');

  // ── 5. What lands in the editor is customized, valid and editable ───────────
  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.getByTestId('wz-finish-editor')).toBeVisible();
  await page.getByTestId('wz-finish-editor').click();
  await awaitPreviewRebuild(page);

  const root = previewFrame(page).locator('.lower-third');
  await expect(root).toBeAttached();
  // Bottom band, in frame coordinates — the placement rule, measured rather than asserted
  // from the CSS text.
  const box = await root.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { centreY: (r.top + r.bottom) / 2, height: el.ownerDocument.documentElement.clientHeight };
  });
  expect(box.centreY).toBeGreaterThan(box.height * 0.6);

  // The brief's own content is in the graphic, and it is a real SPX field.
  await expect(previewFrame(page).locator('#f0')).toContainText('Miriam Aalto');

  const state = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const tpl = (useTemplateStore.getState() as { template: { css: string; js: string; fields: unknown[] } }).template;
    const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
    const res = await validateTemplate(tpl);
    return {
      errors: res.errors,
      // Adapted, not merely assembled: the design spec's compositional parameters land as a
      // marked override block, which is what makes the result different from the design the
      // user could have picked in Browse themselves.
      adjusted: tpl.css.includes('Design adjustments'),
      // Editable: a readable data block is what the timeline dock and Style panel drive.
      timelineEditable: tpl.js.includes('NOACG_ANIM'),
      fields: tpl.fields.length,
    };
  });
  expect(state.errors, JSON.stringify(state.errors, null, 2)).toEqual([]);
  expect(state.adjusted).toBe(true);
  expect(state.timelineEditable).toBe(true);
  expect(state.fields).toBeGreaterThanOrEqual(2);
});

test('the shortlist is shown, and picking another design rebuilds on it for free', async ({ page }) => {
  let calls = 0;
  let picked = '';
  await page.route('/api/ai/generate', (route: Route) => {
    const req = capture(route);
    calls += 1;
    if (req.tool === 'emit_structural_intent') return route.fulfill(ok(WORSHIP_INTENT));
    picked = req.variantEnum[0] ?? 'lt01';
    const one = spec(picked);
    if (req.tool === 'emit_design_alternatives') return route.fulfill(ok({ alternatives: [one, one, one] }));
    return route.fulfill(ok(one));
  });

  await openAiStep(page);
  await page.locator('.wz-step textarea').first().fill(BRIEF);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.wz-step .status-ok')).toContainText('Passes validation', GENERATED);

  // The designs the AI chose BETWEEN, as pictures - the claim's evidence.
  const cards = page.getByTestId('ai-shortlist').locator('.wz-shortlist-card');
  await expect(cards.first()).toBeVisible();
  const shown = await cards.count();
  expect(shown).toBeGreaterThan(1);
  await expect(page.getByTestId('ai-shortlist').locator(`[data-variant="${picked}"]`)).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Pick a different one. It must rebuild WITHOUT another model call - that is the whole
  // point: the shortlist is already on the result, and assembly is deterministic.
  const spent = calls;
  const other = cards.filter({ hasNot: page.locator('[aria-pressed="true"]') }).first();
  const otherId = await other.getAttribute('data-variant');
  await other.click();

  await expect(page.getByTestId('ai-shortlist').locator(`[data-variant="${otherId}"]`)).toHaveAttribute(
    'aria-pressed',
    'true',
    GENERATED,
  );
  expect(calls, 'rebuilding on another design costs nothing').toBe(spent);

  // The result now names the design that was picked, and still passes its checks.
  const otherName = await page.evaluate(async (id) => {
    const { variantById } = await import('/src/templates/catalog.ts');
    return (variantById(id!) as { name: string }).name;
  }, otherId);
  await expect(page.getByTestId('ai-adapted-from')).toContainText(otherName);
  await expect(page.locator('.wz-step .status-ok')).toContainText('Passes validation');

  // The brief's own content survived the swap - the spec carried over onto the new design.
  // Read from the wizard's live preview, which is where an un-created result actually is;
  // the store only holds a template once Create runs.
  await expect(page.frameLocator('.wz-side iframe').locator('#f0')).toContainText('Miriam Aalto', GENERATED);
});

test('an off-catalog brief keeps the full catalog listing, so the create route is untouched', async ({ page }) => {
  const seen: Captured[] = [];
  await page.route('/api/ai/generate', (route: Route) => {
    const req = capture(route);
    seen.push(req);
    if (req.tool === 'emit_structural_intent') {
      return route.fulfill(ok({
        kind: 'novel',
        novelDescription: 'A rotating three-axis data sculpture.',
        confidence: 'high',
        summary: 'Nothing listed describes this.',
        parts: [], fields: [], originalityRequested: false,
      }));
    }
    // The create route gets no shortlist, so the fit enum is narrowed to custom and the
    // design call must still be able to name any chassis it likes.
    return route.fulfill(ok({ alternatives: [{ ...spec('lt01'), fit: 'custom' }] }));
  });

  await openAiStep(page);
  await page.locator('.wz-step textarea').first().fill('A rotating three-axis data sculpture, unlike anything on air');
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  await expect.poll(() => seen.filter((r) => r.tool.startsWith('emit_design')).length, GENERATED).toBeGreaterThan(0);
  const call = seen.find((r) => r.tool.startsWith('emit_design'))!;
  // The frozen benchmark control's prompt must not move (src/ai/AGENTS.md, plan §8).
  expect(call.system).not.toContain('closest PROVEN designs');
  expect(call.system.length).toBeGreaterThan(60_000);
  expect(call.variantEnum.length).toBeGreaterThan(400);
});
