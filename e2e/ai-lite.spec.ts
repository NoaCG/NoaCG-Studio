import { expect, test, type Page, type Route } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { enableAdvancedMode } from './_create';

const STATUS = {
  profile: 'lite',
  enabled: true,
  available: true,
  requiresSignIn: false,
  supportedCategories: ['lower-third'],
  limits: {
    promptCharacters: 2000,
    conversationTurns: 6,
    conversationCharacters: 6000,
    fields: 2,
    logos: 0,
    logoBytes: 2_000_000,
  },
  allowance: {
    dailyStartsRemaining: 6,
    monthlyStartsRemaining: 30,
    dailySuccessesRemaining: 3,
    monthlySuccessesRemaining: 20,
  },
};

const READY = {
  generationId: '11111111-1111-4111-8111-111111111111',
  decision: {
    status: 'ready',
    aiCategory: 'lower-third',
    spec: {
      fit: 'catalog',
      reason: 'A restrained house lower third carries the requested structure.',
      name: 'Campus News Strap',
      summary: 'A credible university news lower third with a calm entrance.',
      category: 'lower-third',
      variantId: 'lt11',
      intent: {
        kind: 'person',
        primaryRole: 'person-name',
        secondaryRole: 'person-role',
      },
      lines: [
        { title: 'Name', sample: 'Amara Mensah', role: 'person-name' },
        { title: 'Role', sample: 'Student Reporter', role: 'person-role' },
      ],
      paletteId: 'noacg',
      density: 'standard',
      alignment: 'left',
      typography: { headingWeight: 'bold', tracking: 'normal' },
      shape: { corner: 'soft', accentForm: 'bar', panel: 'solid' },
      animation: { presetId: 'line-reveal', speed: 1 },
      flourish: '',
    },
  },
  usage: { inputTokens: 650, outputTokens: 320, totalTokens: 970 },
  attemptCount: 1,
  repairCount: 0,
  expiresAt: '2099-01-01T00:00:00.000Z',
};

async function openLite(page: Page): Promise<void> {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.locator('[data-entry="ai"]').click();
  await expect(page.getByRole('heading', { name: /Create with AI/ })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(60_000);
  // Lite's walk ends in the editor, and that Finish door is Advanced-only since step 6
  // (docs/GOALS_ARCHIVE.md "Student release"; FinishStep `showEditorDoor`).
  await enableAdvancedMode(page);
  await page.route('/api/ai/lite/status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(STATUS),
  }));
});

test('Lite creates one grounded graphic, records usability and acceptance, and opens the normal editor', async ({ page }) => {
  const outcomes: string[] = [];
  await page.route('/api/ai/lite/generations', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(READY),
  }));
  await page.route('/api/ai/lite/outcome', async (route: Route) => {
    const body = route.request().postDataJSON() as { action: string };
    outcomes.push(body.action);
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"recorded":true}' });
  });

  await openLite(page);
  await expect(page.getByTestId('lite-allowance')).toContainText('3 successful generation(s) left today');
  await expect(page.getByLabel(/Design 3 options/)).toHaveCount(0);
  await expect(page.getByTestId('ai-talk')).toHaveCount(0);
  await expect(page.getByTestId('ai-attach')).toHaveCount(0);
  await expect(page.getByText(/Gemini|Qwen|OpenRouter|Anthropic|OpenAI/)).toHaveCount(0);

  // AI settings describes the hosted path and offers one secondary own-account switch. The
  // hosted path is the default and exposes no provider or model surface.
  await page.getByRole('button', { name: /AI settings/ }).click();
  await expect(page.getByTestId('ai-tier')).toHaveCount(0);
  await expect(page.getByTestId('ai-hosted-note')).toBeVisible();
  await expect(page.getByTestId('ai-own-key')).toBeVisible();
  await expect(page.getByTestId('ai-own-key').getByRole('checkbox')).not.toBeChecked();
  await expect(page.getByTestId('ai-settings').getByText('Provider', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('ai-settings').getByText('Model', { exact: true })).toHaveCount(0);
  // THE ONE GESTURE THIS DOOR HAS, driven rather than seeded: ticking the box is what reveals
  // the provider and model surface, and unticking it is what puts the hosted route back. A
  // stored value proves the reading half only, and the reading half is not where the bug would
  // be - the box writes `tier` and the sheet re-renders off it.
  const ownKey = page.getByTestId('ai-own-key').getByRole('checkbox');
  await ownKey.check();
  await expect(page.getByTestId('ai-settings').getByText('Provider', { exact: true })).toBeVisible();
  await ownKey.uncheck();
  await expect(page.getByTestId('ai-settings').getByText('Provider', { exact: true })).toHaveCount(0);
  await expect(page.getByTestId('ai-hosted-note')).toBeVisible();
  await page.getByRole('button', { name: /AI settings/ }).click();

  await page.getByTestId('more-control-toggle').click();
  await expect(page.getByTestId('more-control')).toBeVisible();
  await expect(page.getByRole('button', { name: /Lower third/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Player card/ })).toHaveCount(0);
  await page.getByRole('button', { name: /Look & references/ }).click();
  await expect(page.getByText(/Image and logo input is paused/)).toBeVisible();
  // Reference images are uploaded in the step's ONE drop zone now, so the check that Lite
  // offers none has to be made there: no purpose picker, and the zone's own Lite copy.
  // (The old assertion named a button this panel no longer has at all, which would have gone
  // on passing whatever Lite did.)
  await expect(page.getByTestId('purpose-mood')).toHaveCount(0);
  await expect(page.locator('.wz-drop')).toContainText(/Image input is paused/);

  await page.locator('.wz-step textarea').fill(
    'A credible university-news lower third for a student reporter name and role.',
  );
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.wz-step .status-ok')).toContainText(
    'Passes validation and the live playout test',
    { timeout: 25_000 },
  );
  await expect(page.getByTestId('ai-alternatives')).toHaveCount(0);
  await expect.poll(() => outcomes).toContain('usable');

  await page.getByRole('button', { name: 'Next →' }).click();
  await awaitPreviewRebuild(page, async () => {
    await page.getByTestId('wz-finish-editor').click();
    await expect(page.getByTestId('creation-wizard')).toBeHidden();
  });
  await expect.poll(() => outcomes).toContain('accepted');
  await expect(page.locator('.topbar .tpl-name')).toHaveText('Campus News Strap');

  const templateFacts = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const template = useTemplateStore.getState().template;
    return {
      fields: template.fields.map((field) => field.field),
      timeline: Boolean(parseAnimData(template.js)),
      generationIdInTemplate: JSON.stringify(template).includes('11111111-1111-4111-8111-111111111111'),
    };
  });
  expect(templateFacts.fields).toEqual(['f0', 'f1']);
  expect(templateFacts.timeline).toBe(true);
  expect(templateFacts.generationIdInTemplate).toBe(false);

  await page.getByRole('button', { name: /Export/ }).first().click();
  await expect(page.getByText('SPX export', { exact: true })).toBeVisible();
  await expect(page.locator('input[name="export-target"]')).toHaveCount(6);
});

test('Lite explains an unsupported package request without calling a code or fallback route', async ({ page }) => {
  let generationCalls = 0;
  await page.route('/api/ai/lite/generations', async (route) => {
    generationCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generationId: 'unsupported-test',
        decision: {
          status: 'unsupported',
          code: 'multi-graphic-request',
          message: 'Lite creates one graphic at a time.',
          suggestedBrief: 'Describe the single most important graphic you need first.',
        },
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        attemptCount: 0,
        repairCount: 0,
        expiresAt: '2099-01-01T00:00:00.000Z',
      }),
    });
  });
  let genericCalls = 0;
  await page.route('/api/ai/generate', async (route) => {
    genericCalls += 1;
    await route.abort();
  });

  await openLite(page);
  await page.locator('.wz-step textarea').fill('Create a package of five graphics with branching states.');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.wz-step .status-bad')).toContainText('Lite creates one graphic at a time.');
  await expect(page.locator('.wz-step .status-bad')).toContainText('Describe the single most important graphic');
  await expect(page.getByRole('button', { name: 'Next →' })).toBeDisabled();
  expect(generationCalls).toBe(1);
  expect(genericCalls).toBe(0);
});
