// covers: src/components/wizard/steps/{AiStep.tsx,ai/**}, api/{ai/**,_lib/ai*{,/**}}
// covers: scripts/{aiDevPlugin.mjs,apiRouteTable.mjs}
// covers: src/components/wizard/**, !src/components/wizard/import/**

import { test, expect, type Page, type Route } from '@playwright/test';
import { enableAdvancedMode } from './_create';

// Create with AI — the "More control" structured setup: category pinning, user-defined
// data fields, animation intensity, draft persistence, and the untouched prompt-only
// default. The normalized gateway is mocked at the network level (see ai.spec.ts); the harness
// runs its REAL pipeline — applySpecLocks, grounded assembly, validation + runtime bench.

const GROUNDED_SPEC = {
  fit: 'catalog',
  reason: 'A lower third carries this brief.',
  name: 'Pinned Strap',
  summary: 'A lower third assembled from the catalog design system.',
  category: 'lower-third',
  variantId: 'lt01',
  // The model "forgot" the user's fields — applySpecLocks must restore them.
  lines: [{ title: 'Name', sample: 'Ada Lovelace' }],
};

function toolUse(_name: string, input: unknown) {
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

interface CapturedRequest {
  tool: string;
  schema: Record<string, unknown> | undefined;
  userText: string;
}

function capture(route: Route): CapturedRequest {
  const body = route.request().postDataJSON() as {
    request?: {
      structuredOutput?: { name: string; schema: Record<string, unknown> };
      messages?: { role: string; content: { type: string; text?: string }[] | string }[];
    };
  };
  return {
    tool: body.request?.structuredOutput?.name ?? '',
    schema: body.request?.structuredOutput?.schema,
    userText: (body.request?.messages ?? [])
      .flatMap((message) => typeof message.content === 'string' ? [message.content] : message.content.map((item) => item.text ?? ''))
      .join('\n'),
  };
}

/** The category enum of the (possibly narrowed) alternatives tool schema. */
function categoryEnum(schema: Record<string, unknown> | undefined): string[] {
  const root = schema as { properties?: { alternatives?: { items?: { properties?: { category?: { enum?: string[] } } } } } } | undefined;
  return root?.properties?.alternatives?.items?.properties?.category?.enum ?? [];
}

const GENERATED = { timeout: 25_000 };

async function openAiStep(page: Page) {
  // These setups create through the AI Finish EDITOR door - Advanced-only since step 6.
  await enableAdvancedMode(page);
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="ai"]').click();
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() =>
    localStorage.setItem('spx-gfx-ai', JSON.stringify({ provider: 'anthropic', configuredProviders: ['anthropic'], model: 'claude-sonnet-5', useHarness: true })),
  );
});

test('structured setup: pinned category + user fields + intensity land in the created project', async ({ page }) => {
  const requests: CapturedRequest[] = [];
  let templateCalls = 0;
  await page.route('/api/ai/generate', (route: Route) => {
    const req = capture(route);
    requests.push(req);
    if (req.tool === 'emit_template') templateCalls += 1;
    if (req.tool === 'emit_design_alternatives')
      return route.fulfill(toolUse(req.tool, { alternatives: [GROUNDED_SPEC] }));
    return route.fulfill(toolUse('emit_design_spec', GROUNDED_SPEC));
  });
  await openAiStep(page);

  // Expand More control, pin Lower third — its suggested fields seed the field list.
  await page.getByTestId('more-control-toggle').click();
  await expect(page.getByTestId('more-control')).toBeVisible();
  await page.locator('.mc-cat', { hasText: 'Lower third' }).first().click();
  await page.locator('.mc-head', { hasText: 'Data fields' }).click();
  const labels = page.locator('.mc-field input[aria-label="Field label"]');
  await expect(labels.first()).toHaveValue(/.+/); // seeded from the graphic type

  // Add a third field of our own.
  await page.getByRole('button', { name: '+ Add field' }).click();
  await labels.last().fill('Location');
  await page.locator('.mc-field input[aria-label="Example value"]').last().fill('Helsinki');

  // Animation character: energetic maps deterministically onto speed 1.5.
  await page.locator('.mc-head', { hasText: 'Animation' }).click();
  await page.locator('.mc-intensity .mc-cat', { hasText: 'Energetic' }).click();

  await page.locator('.wz-step textarea').first().fill('A guest strap for our tech show');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.wz-step .status-ok')).toContainText('Passes validation', GENERATED);
  expect(templateCalls).toBe(0); // grounded — the platform assembled it

  // The design-stage request was narrowed to the pinned category and carried the setup.
  const design = requests.find((r) => r.tool === 'emit_design_alternatives');
  expect(design).toBeTruthy();
  expect(categoryEnum(design!.schema)).toEqual(['lower-third']);
  expect(design!.userText).toContain('Structured setup');
  expect(design!.userText).toContain('Location');

  // Create with AI ends on the shared Finish step now — Next, then the editor door.
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByTestId('wz-finish-editor').click();
  await expect(page.locator('.wz-modal')).toBeHidden();

  // The created template carries the user's fields as real DataFields, the intensity as
  // the motion speed, and the spec rides the working document for later refines.
  const state = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const s = useTemplateStore.getState();
    return {
      fieldTitles: s.template.fields.map((f) => f.title),
      speed: parseAnimData(s.template.js)?.speed ?? null,
      aiSpecCategory: s.aiSpec?.category ?? null,
      draft: localStorage.getItem('spx-gfx-ai-spec-draft'),
    };
  });
  expect(state.fieldTitles).toContain('Location');
  expect(state.fieldTitles.length).toBeGreaterThanOrEqual(3);
  expect(state.speed).toBe(1.5);
  expect(state.aiSpecCategory).toBe('lower-third');
  expect(state.draft).toBeNull(); // creating consumed the draft
});

test('collapsing sections and closing the wizard preserve the entered setup', async ({ page }) => {
  await openAiStep(page);
  await page.getByTestId('more-control-toggle').click();
  await page.locator('.mc-cat', { hasText: 'Quiz' }).first().click();
  await page.locator('.mc-head', { hasText: 'Data fields' }).click();
  const labels = page.locator('.mc-field input[aria-label="Field label"]');
  await expect(labels.first()).toHaveValue(/.+/);
  const seeded = await labels.count();

  // Collapse the fields section (open Look instead) and reopen — values intact.
  await page.locator('.mc-head', { hasText: 'Look & references' }).click();
  await expect(labels).toHaveCount(0);
  await page.locator('.mc-head', { hasText: 'Data fields' }).click();
  await expect(labels).toHaveCount(seeded);

  // Close the wizard entirely and come back: the draft survives (localStorage). Leaving takes
  // TWO presses now: from a working step ✕ rewinds to the wizard's front page, and only from
  // there does it leave (e2e/wizard-shell.spec.ts owns that contract). Both presses have to
  // preserve the setup - the first discards the wizard's own draft, which is a different
  // thing from the structured setup the panel persists.
  await page.locator('.gallery-close').click();
  await expect(page.locator('[data-entry="ai"]')).toBeVisible();
  await page.locator('.gallery-close').click();
  await expect(page.locator('.wz-modal')).toBeHidden();
  // This file runs in Advanced mode (openAiStep), so the close rewinds to the EDITOR - reopen
  // through its "+ New graphic" like a user would.
  await page.getByRole('button', { name: '+ New graphic' }).click();
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="ai"]').click();
  // A non-empty draft opens the panel by itself, summarizing the picked category.
  await expect(page.getByTestId('more-control')).toBeVisible();
  await expect(page.locator('.mc-cat.selected')).toContainText('Quiz');
});

test('prompt-only generation injects no structured setup and keeps the full category space', async ({ page }) => {
  const requests: CapturedRequest[] = [];
  await page.route('/api/ai/generate', (route: Route) => {
    const req = capture(route);
    requests.push(req);
    if (req.tool === 'emit_design_alternatives')
      return route.fulfill(toolUse(req.tool, { alternatives: [GROUNDED_SPEC] }));
    return route.fulfill(toolUse('emit_design_spec', GROUNDED_SPEC));
  });
  await openAiStep(page);
  await page.locator('.wz-step textarea').first().fill('A clean news lower third');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.wz-step .status-ok')).toContainText('Passes validation', GENERATED);

  const design = requests.find((r) => r.tool === 'emit_design_alternatives');
  expect(design).toBeTruthy();
  expect(design!.userText).not.toContain('Structured setup');
  expect(categoryEnum(design!.schema).length).toBeGreaterThan(1); // schema untouched
});
