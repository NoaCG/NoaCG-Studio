// covers: src/ai/**, src/components/wizard/steps/{AiStep.tsx,ai/**}, api/{ai/**,_lib/ai*{,/**}}
// covers: scripts/{aiDevPlugin.mjs,apiRouteTable.mjs}

import { test, expect, type Page, type Route } from '@playwright/test';

// Era 3: the Describe-it step's example prompts + brainstorm chat (gateway mocked).

async function openAiStep(page: Page) {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="ai"]').click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('spx-gfx-ai', JSON.stringify({ provider: 'anthropic', configuredProviders: ['anthropic'], model: 'claude-sonnet-5' })),
  );
});

test('example prompts fill the brief with one click', async ({ page }) => {
  await openAiStep(page);
  await expect(page.locator('.wz-example')).toHaveCount(8);
  await page.locator('.wz-example', { hasText: 'Election results' }).click();
  await expect(page.locator('.wz-step textarea')).toHaveValue(/Election results panel/);
});

test('brainstorm chat: replies render and the BRIEF line becomes the prompt', async ({ page }) => {
  await page.route('/api/ai/generate', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        output:
          'A substitution graphic works best as a two-line lower third: player off (red arrow), player on (green arrow). Want the club crest in it?\n' +
          'BRIEF: A football substitution lower third: two fields (player off, player on) with red/green direction arrows, club crest image field on the left, sport family, bottom-left, snap-fast entrance.',
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
        attempts: [{ route: { provider: 'anthropic', model: 'claude-sonnet-5' }, attempts: 1 }],
      }),
    }),
  );
  await openAiStep(page);
  // ONE composer, one transcript: the brief box is also what you talk into.
  await page.locator('.wz-step textarea').fill('halftime of a local derby, we need something for substitutions');
  await page.getByTestId('ai-talk').click();

  // Both sides of the exchange are in the thread…
  await expect(page.locator('.ai-msg.user')).toContainText('halftime of a local derby');
  // …the reply shows WITHOUT the BRIEF line; the brief is offered separately.
  await expect(page.locator('.ai-msg.assistant')).toContainText('two-line lower third');
  await expect(page.locator('.ai-msg.assistant')).not.toContainText('BRIEF:');
  await expect(page.locator('.ai-brief')).toContainText('substitution lower third');

  // The brief is what Generate acts on with an empty box; "Edit it" puts it back for editing.
  await expect(page.locator('.wz-step textarea')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Edit it' }).click();
  await expect(page.locator('.wz-step textarea')).toHaveValue(/football substitution lower third/);
});
