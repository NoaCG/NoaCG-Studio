import { test, expect, type Page } from '@playwright/test';

// THE CREATE-WITH-AI DOOR: which tiers are offered, what they are called, and what the
// bring-your-own-key surface says about money.
//
// Every assertion here is about WORDING and WHICH OPTIONS EXIST, which is exactly the class of
// defect no other gate can see: the shipped build called a bring-your-own-key mode "Custom
// provider", offered NoaCG's own transport as if picking it were a product decision, and
// described a Pro pipeline that had been retired weeks earlier. The app built, linted and
// passed its suite through all three.
//
// The model listing is stubbed at the network level, so this spec needs no key and spends
// nothing while still exercising the real row rendering.

const OPENAI_MODELS = {
  provider: 'openai',
  syncedAt: '2026-08-14T00:00:00.000Z',
  models: [
    {
      provider: 'openai',
      id: 'gpt-5.6-luna',
      name: 'gpt-5.6-luna',
      description: '',
      contextLength: 400_000,
      maxOutputTokens: 128_000,
      inputPerMillion: 1.25,
      outputPerMillion: 10,
      inputModalities: ['text'],
      supportsStructuredOutput: true,
      supportsTools: true,
      supportsSeed: false,
      free: false,
      openWeight: false,
      available: true,
      createdAt: null,
      revision: null,
      source: 'openai-api',
      paidBy: 'user',
    },
  ],
};

const CONFIG = {
  keyStorageAvailable: true,
  providers: ['anthropic', 'openai', 'google', 'vercel', 'huggingface'].map((id) => ({
    id,
    userKey: id === 'openai',
    managedKey: false,
    available: id === 'openai',
    requiresSignIn: false,
  })),
};

async function openAiSettings(page: Page) {
  await page.route('**/api/ai/config', (route) => route.fulfill({ json: CONFIG }));
  await page.route('**/api/ai/models**', (route) => route.fulfill({ json: OPENAI_MODELS }));
  // Lite off, so the tier resolves to the bring-your-own-key surface - and the panel OPENS
  // ITSELF, which is why nothing here clicks the ⚙ button: that decision lands an async tick
  // after this answer, so a blind click is as likely to close the panel as to open it.
  await page.route('**/api/ai/lite/status', (route) => route.fulfill({ json: { enabled: false } }));
  await page.goto('/app');
  // WAIT for the cold-boot auto-open explicitly, the way `_svg-import.ts` does, rather than
  // leaning on the 7 s default. `/app` boots through a watchdog and a durable-store hydration
  // that falls back to localStorage only after 4 s
  // (`root/keep-boot-watchdog-connection-check-working`), so on a slow
  // machine the wizard mounts uncomfortably close to the deadline. That is what made this
  // helper fail a DIFFERENT random subset of the file on every run in a cloud container on
  // 2026-09-06, always here, always before anything the tests are about (e2e/AGENTS.md).
  await page.locator('.wz-modal').waitFor({ state: 'visible', timeout: 10_000 });
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="ai"]').click();
  await expect(page.getByTestId('ai-settings')).toBeVisible();
}

test('the tiers are NoaCG Lite and Bring your own key — and Pro is not a door yet', async ({ page }) => {
  await openAiSettings(page);
  const tiers = page.getByTestId('ai-tier');
  await expect(tiers.getByTestId('ai-tier-lite')).toContainText('NoaCG Lite');
  await expect(tiers.getByTestId('ai-tier-custom')).toContainText('Bring your own key');
  // The old label named a "provider" the tier never asked for.
  await expect(tiers).not.toContainText('Custom provider');
  // Built, and offered only where the server hosts it and the backend can meter it: a tier
  // that cannot run here is absent, not greyed (the rule itself is e2e/pro.spec.ts's).
  await expect(tiers.getByTestId('ai-tier-pro')).toHaveCount(0);
});

test("the user's own coding agent is named as the preferred route before any tier and any key", async ({ page }) => {
  // Owner, 2026-08-26 and 2026-09-03 (docs/backlog/byo-key-and-create-with-ai-guidance.md):
  // steer users to their own Claude Code before any key entry - it is the PREFERRED route, not
  // a hint beside the tier picker. This build has nothing configured, so the key field is
  // about to be on screen and the card is open by itself, commands showing.
  await openAiSettings(page);
  const route = page.getByTestId('ai-agent-route');
  await expect(route).toContainText('Preferred');
  await expect(route).toContainText('Claude Code or Codex');
  const body = page.getByTestId('ai-agent-route-body');
  // The commands are docs/AGENT_CLI.md's Distribution table, never an invented one-liner.
  await expect(body).toContainText('claude plugin marketplace add NoaCG/NoaCG-Studio');
  await expect(body).toContainText('claude plugin install noacg@noacg-studio');
  await expect(body).toContainText('codex plugin add noacg@noacg-studio');
  await expect(body.getByRole('link')).toHaveAttribute('href', '/docs#agent-install');
  // Honest about what it needs, and no brush-off for somebody with no agent.
  await expect(body).toContainText('a terminal');
  await expect(body).toContainText('No coding agent?');
  // In the sheet the pointer comes BEFORE the tier picker - first, in document order.
  const sheet = page.getByTestId('ai-settings');
  const pointerFirst = await sheet.evaluate((el) => {
    const pointer = el.querySelector('[data-testid="ai-agent-pointer"]');
    const tiers = el.querySelector('[data-testid="ai-tier"]');
    return Boolean(pointer && tiers && pointer.compareDocumentPosition(tiers) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(pointerFirst).toBe(true);
  // And the key tier itself tells a coding-agent user they do not need it.
  await expect(sheet.getByTestId('ai-tier-custom')).toContainText('you do not need this');
  // Hide, then the sheet's pointer brings it back.
  await page.getByTestId('ai-agent-route-toggle').click();
  await expect(body).toHaveCount(0);
  await sheet.getByRole('button', { name: 'Show me' }).click();
  await expect(body).toBeVisible();
});

test('the bring-your-own-key picker lists exactly the four providers a user can pay', async ({ page }) => {
  await openAiSettings(page);
  const providers = page.locator('#ai-provider option');
  await expect(providers).toHaveText(['OpenAI', 'Anthropic', 'Google', 'Hugging Face']);
});

test('a model row carries its price per 1M tokens and says which key pays for it', async ({ page }) => {
  await openAiSettings(page);
  // The suggestion rows live in a datalist, so they are read as text rather than as visible
  // elements - the browser owns their presentation.
  const rows = page.locator('[data-testid="ai-model-options"] option');
  await expect(rows.first()).toHaveText(/\$1\.25 in \/ \$10\.00 out per 1M · your key/);
  await expect(page.getByTestId('ai-model-cost')).toContainText('$1.25 in / $10.00 out per 1M');
  await expect(page.getByTestId('ai-model-cost')).toContainText('Charged to your OpenAI key.');
});

test('a provider is asked for the credential IT issues, not for an "API key" it has none of', async ({ page }) => {
  // Hugging Face issues user access TOKENS and has no API keys at all, so a field labelled
  // "Hugging Face key" sends a customer looking for a page that does not exist. Verified
  // against a real token on 2026-08-14; the wording is what was wrong, not the route.
  await openAiSettings(page);
  await page.locator('#ai-provider').selectOption('huggingface');
  await expect(page.getByLabel('Hugging Face token')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Store token' })).toBeVisible();
  await page.locator('#ai-provider').selectOption('openai');
  await expect(page.getByLabel('OpenAI key')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Store key' })).toBeVisible();
});

test('the tier runs on a key the user owns, never on the funded route', async ({ page }) => {
  // The saved route is the managed transport - the harness default, and what every bench sets.
  // Entering the tier must move it onto a real bring-your-own-key provider, or the tier spends
  // NoaCG's credential under a promise that says the opposite.
  await page.addInitScript(() =>
    localStorage.setItem('spx-gfx-ai', JSON.stringify({
      tier: 'custom',
      provider: 'vercel',
      model: 'alibaba/qwen3-coder-next',
    })),
  );
  await openAiSettings(page);
  await expect(page.locator('#ai-provider')).toHaveValue('openai');
  await expect(page.locator('#ai-model')).not.toHaveValue('alibaba/qwen3-coder-next');
});

test('nothing a user reads names the transport NoaCG funds', async ({ page }) => {
  await openAiSettings(page);
  const step = page.locator('.wz-step');
  const shown = (await step.innerText()) + ' ' + (await page.getByTestId('ai-settings').innerText());
  // Vercel, "AI Gateway" and OpenRouter are all plumbing: which pipe NoaCG reaches a model
  // through is not a product decision, and naming one dates the copy to whatever it was built
  // on. `openai` as a PROVIDER is fine and expected - it is the user's own key.
  expect(shown).not.toMatch(/vercel|gateway|openrouter/i);
});
