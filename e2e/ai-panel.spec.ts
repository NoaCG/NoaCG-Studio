import { test, expect, type Route } from '@playwright/test';
import { createProject } from './_create';
import { acceptAiNotice } from './_ai-notice';

// The editor's AI assistant panel (AIPromptPanel). Its provider calls inject the production
// validator (static + live runtime bench + the safety screen — the same composition the
// wizard's AiStep wires), so the repair loop works against real findings and the
// confirm-before-apply card reports what was actually measured. The gateway is mocked at the
// network level, exactly like e2e/ai.spec.ts.

// House-shaped and live-bench-clean (binds f0, plays, hides on stop, replays).
const VALID_TEMPLATE = {
  name: 'Panel Slate',
  type: 'info-card',
  summary: 'A minimal slate with one name field.',
  html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Panel Slate</title>
  <script src="js/gsap.min.js"></script>
  <link rel="stylesheet" href="css/template.css" />
  <script src="js/template.js"></script>
  <script>window.SPXGCTemplateDefinition = {
    "description": "Panel Slate",
    "playserver": "OVERLAY", "playchannel": "1", "playlayer": "7",
    "webplayout": "7", "out": "manual", "dataformat": "json",
    "DataFields": [ { "field": "f0", "ftype": "textfield", "title": "Name", "value": "Hello AI" } ]
  };</script>
</head>
<body>
  <div class="slate">
    <div class="slate-box"><span id="f0">Hello AI</span></div>
  </div>
</body>
</html>`,
  css: `:root { --accent: #e8c547; --text-color: #ffffff; --text-dim: rgba(255,255,255,0.7); --panel-bg: rgba(12,14,18,0.92); --font-heading: sans-serif; --scale: 1; }
.slate { position: absolute; left: 80px; bottom: 80px; opacity: 0; }
.slate-box { color: var(--text-color); background: var(--panel-bg); padding: calc(20px * var(--scale)); width: fit-content; max-width: calc(900px * var(--scale)); overflow-wrap: break-word; }`,
  js: `function update(data) {
  var fields = (typeof data === 'string') ? JSON.parse(data) : data;
  for (var key in fields) { var el = document.getElementById(key); if (el) el.textContent = fields[key]; }
}
/* == ANIMATION (generated — the timeline edits the data block below) == */
var NOACG_ANIM = {
  "version": 1,
  "root": ".slate",
  "speed": 1,
  "steps": [
    { "name": "In", "duration": 0.5, "ease": "power2.out", "layers": { ".slate": { "opacity": [ { "time": 0, "value": 0 }, { "time": 0.5, "value": 1 } ] } } },
    { "name": "Out", "duration": 0.3, "ease": "power2.in", "layers": { ".slate": { "opacity": [ { "time": 0.3, "value": 0 } ] } } }
  ]
};
function buildInTimeline() { var tl = gsap.timeline(); tl.to('.slate', { opacity: 1, duration: 0.5, ease: 'power2.out' }); return tl; }
function buildOutTimeline() { var tl = gsap.timeline(); tl.to('.slate', { opacity: 0, duration: 0.3, ease: 'power2.in' }); return tl; }
/* == END ANIMATION == */
function play() { gsap.killTweensOf('*'); buildInTimeline(); }
function stop() { gsap.killTweensOf('*'); buildOutTimeline(); }
function next() {}`,
};

// The discriminating fixture: update() exists but writes nothing, so STATIC validation
// passes (functions present, definition parses, #f0 exists) while the LIVE bench fails
// field binding. Before the panel injected the validator, this showed "✓ Passes validation".
const BENCH_TRAP = {
  ...VALID_TEMPLATE,
  js: VALID_TEMPLATE.js.replace(
    /function update\(data\) \{[\s\S]*?\n\}/,
    'function update(data) { /* writes nothing - the bench must catch this */ }',
  ),
};

/** The whole text of a request, for asserting what the model was actually told. */
function requestText(route: Route): string {
  const body = route.request().postDataJSON() as {
    request: { messages: { content: { type: string; text?: string }[] | string }[] };
  };
  return body.request.messages
    .map((m) => (Array.isArray(m.content) ? m.content.map((c) => c.text ?? '').join(' ') : m.content))
    .join(' ');
}

function toolUse(input: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      output: input,
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      usage: { inputTokens: 4200, outputTokens: 1100, totalTokens: 5300 },
      attempts: [{ route: { provider: 'anthropic', model: 'claude-sonnet-5' }, attempts: 1 }],
    }),
  };
}

// A modify runs the bench once per emit (initial + up to 2 repair rounds), ~2 s each.
const GENERATED = { timeout: 25_000 };

test.beforeEach(async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() =>
    localStorage.setItem(
      'spx-gfx-ai',
      JSON.stringify({ provider: 'anthropic', configuredProviders: ['anthropic'], model: 'claude-sonnet-5', useHarness: true }),
    ),
  );
  await acceptAiNotice(page);
});

test('a bench-failing modify burns real repair rounds and the card reports the failure', async ({ page }) => {
  const requests: string[] = [];
  await page.route('/api/ai/generate', (route: Route) => {
    requests.push(requestText(route));
    return route.fulfill(toolUse(BENCH_TRAP));
  });
  await createProject(page, 'Hairline');
  await page.getByTestId('dock-tab-ai').click();

  const panel = page.locator('.panel-body', { has: page.getByRole('heading', { name: 'AI assistant' }) });
  await panel.locator('textarea').fill('Turn this into a test slate');
  await panel.getByRole('button', { name: 'Modify', exact: true }).click();

  // The confirm card reports the MEASURED verdict: the bench caught the dead update().
  await expect(panel.locator('.change-preview .status-bad')).toBeVisible(GENERATED);
  await expect(panel.getByRole('button', { name: 'Apply' })).toBeDisabled();

  // The repair loop ran against the BENCH findings: initial emit + 2 repair rounds, and the
  // repair instruction quotes a bench rule. Before the panel injected the production
  // validator this was one call and a green card — the mutation this spec exists to catch.
  expect(requests.length).toBe(3);
  expect(requests[1]).toContain('bench-');
});

test('a clean modify passes the injected gate and applies', async ({ page }) => {
  let calls = 0;
  await page.route('/api/ai/generate', (route: Route) => {
    calls += 1;
    return route.fulfill(toolUse(VALID_TEMPLATE));
  });
  await createProject(page, 'Hairline');
  await page.getByTestId('dock-tab-ai').click();

  const panel = page.locator('.panel-body', { has: page.getByRole('heading', { name: 'AI assistant' }) });
  await panel.locator('textarea').fill('Turn this into a test slate');
  await panel.getByRole('button', { name: 'Modify', exact: true }).click();

  await expect(panel.locator('.change-preview .status-ok')).toContainText('Passes validation', GENERATED);
  expect(calls).toBe(1); // clean first emit - the injected gate demanded no repair round
  await panel.getByRole('button', { name: 'Apply' }).click();
  await expect(panel.locator('.change-preview')).toBeHidden();
  await expect(page.frameLocator('iframe.preview-frame').locator('.slate')).toBeVisible();
});

test('with no AI configured, "add a lower third" adds one rather than crashing the offline stub', async ({ page }) => {
  // The offline stub (src/ai/stubProvider.ts) is what a visitor with no key reaches. Its modify
  // rule for a lower third named a block id the registry never had, so the most likely first
  // prompt in a broadcast-graphics tool threw. This test removes the provider the beforeEach seeds,
  // so the panel is on the stub, and asks for exactly that.
  await page.addInitScript(() => localStorage.removeItem('spx-gfx-ai'));
  await createProject(page, 'Hairline');
  await page.getByTestId('dock-tab-ai').click();
  const panel = page.locator('.panel-body', { has: page.getByRole('heading', { name: 'AI assistant' }) });
  await panel.locator('textarea').fill('add a lower third');
  await panel.getByRole('button', { name: 'Modify', exact: true }).click();
  await expect(panel).toContainText('Added a lower third with a name and a title.', GENERATED);
  await panel.getByRole('button', { name: 'Apply' }).click();
  await expect(page.frameLocator('iframe.preview-frame').locator('.lower3-name')).toHaveText('Firstname Lastname');
});
