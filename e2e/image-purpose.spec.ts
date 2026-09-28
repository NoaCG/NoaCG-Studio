// covers: src/components/wizard/steps/{AiStep.tsx,ai/**}
// covers: src/components/wizard/**, !src/components/wizard/import/**

import { test, expect, type Page, type Route } from '@playwright/test';
import { chooseNoacgAgent } from './_ai-step';
import { mockClaude, useFakeAiKey } from './_video';
import { enableAdvancedMode } from './_create';

// What an uploaded picture is FOR (src/model/imagePurpose.ts). The step used to bundle every
// dropped image into the graphic; four purposes now travel with the request, and the ones that
// only INFORM the design must never reach the template as assets.
//
// The gateway is mocked at the network level, so the whole flow - preselect, the request the
// provider actually builds, and the as-is screen - runs with no key and no cost. What each
// test asserts is the REQUEST BODY, because that is where a purpose either arrived or did not:
// a card that looks right while the prompt says "use as is" about a mood board is the failure
// this file exists to catch.

const VALID_TEMPLATE = {
  name: 'Purpose Slate',
  type: 'info-card',
  summary: 'A minimal slate.',
  html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Purpose Slate</title>
  <script src="js/gsap.min.js"></script>
  <link rel="stylesheet" href="css/template.css" />
  <script src="js/template.js"></script>
  <script>window.SPXGCTemplateDefinition = {
    "description": "Purpose Slate",
    "playserver": "OVERLAY", "playchannel": "1", "playlayer": "7",
    "webplayout": "7", "out": "manual", "dataformat": "json",
    "DataFields": [ { "field": "f0", "ftype": "textfield", "title": "Name", "value": "Hello" } ]
  };</script>
</head>
<body>
  <div class="slate">
    <div class="slate-box"><span id="f0">Hello</span></div>
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
function buildInTimeline() { var tl = gsap.timeline(); tl.fromTo('.slate', { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power2.out' }); return tl; }
function buildOutTimeline() { var tl = gsap.timeline(); tl.to('.slate', { opacity: 0, duration: 0.3, ease: 'power2.in' }); return tl; }
/* == END ANIMATION == */
function play() { gsap.killTweensOf('*'); buildInTimeline(); }
function stop() { gsap.killTweensOf('*'); buildOutTimeline(); }
function next() {}`,
};

/**
 * The same template, but it "improves" the mark: a drop-shadow filter and rounded corners on
 * the very picture the user said must appear exactly as uploaded. Every declaration here is a
 * defensible design move, which is precisely why a prompt sentence alone does not hold.
 */
const TINTED_TEMPLATE = {
  ...VALID_TEMPLATE,
  html: VALID_TEMPLATE.html.replace(
    '<span id="f0">Hello</span>',
    '<span id="f0">Hello</span><img class="slate-mark" src="images/crest.png" alt="" />',
  ),
  css: `${VALID_TEMPLATE.css}
.slate-mark { width: calc(80px * var(--scale)); filter: drop-shadow(0 2px 6px rgba(0,0,0,0.6)); border-radius: 8px; }`,
};

/** The design stage's router answer: send this brief to the free-form coder. */
const CUSTOM_SPEC = {
  fit: 'custom',
  reason: 'No catalog family carries this structure.',
  name: 'Purpose Slate',
  summary: 'A minimal slate.',
  category: 'info-card',
  lines: [{ title: 'Name', sample: 'Hello' }],
};

/** Which forced tool a request asked for - the mock dispatches on it. */
function requestedTool(route: Route): string {
  const body = route.request().postDataJSON() as { request?: { structuredOutput?: { name?: string } } };
  return body.request?.structuredOutput?.name ?? '';
}

/**
 * What the normalized gateway returns: the forced tool's input as `output` (NOT the raw
 * Anthropic `content: [{type:'tool_use'}]` block - the gateway has already normalized it).
 */
function toolResponse(output: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      output,
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      usage: { inputTokens: 4200, outputTokens: 1100, totalTokens: 5300 },
      attempts: [{ route: { provider: 'anthropic', model: 'claude-sonnet-5' }, attempts: 1 }],
    }),
  };
}

/**
 * Attach pictures through the step's own file input, exactly as a drop would.
 *
 * The PNGs are painted in the page (a canvas is the cheapest way to get real bytes at an exact
 * size and alpha) and handed back as base64, because setInputFiles needs a Node Buffer - the
 * bytes have to cross back out of the browser to become one.
 */
async function attach(page: Page, specs: { name: string; w: number; h: number; alpha: boolean }[]) {
  const encoded = await page.evaluate(
    (list) =>
      list.map((s) => {
        const c = document.createElement('canvas');
        c.width = s.w;
        c.height = s.h;
        const x = c.getContext('2d')!;
        // An opaque picture needs a filled background; a mark keeps its transparency.
        if (!s.alpha) {
          x.fillStyle = '#204060';
          x.fillRect(0, 0, s.w, s.h);
        }
        x.fillStyle = '#f6a623';
        x.fillRect(s.w * 0.2, s.h * 0.2, s.w * 0.6, s.h * 0.6);
        return { name: s.name, base64: c.toDataURL('image/png').split(',')[1] };
      }),
    specs,
  );
  await page.setInputFiles(
    '.wz-drop input[type=file]',
    encoded.map((e) => ({ name: e.name, mimeType: 'image/png', buffer: Buffer.from(e.base64, 'base64') })),
  );
  await expect(page.getByTestId('ai-upload')).toHaveCount(specs.length);
}

async function openAiStep(page: Page) {
  // The Finish step's "open in the editor" door is ADVANCED-ONLY (docs/GOALS_ARCHIVE.md "Student
  // release" step 4), and these tests read the created template through the editor's Assets
  // panel. Without this the door never renders and the click waits out the whole timeout.
  await enableAdvancedMode(page);
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="ai"]').click();
  await chooseNoacgAgent(page);
}

test.beforeEach(async ({ page }) => {
  test.setTimeout(60_000);
  await page.addInitScript(() =>
    localStorage.setItem(
      'spx-gfx-ai',
      JSON.stringify({ provider: 'anthropic', configuredProviders: ['anthropic'], model: 'claude-sonnet-5', useHarness: false }),
    ),
  );
});

test('the preselect reads the picture, and only ever guesses mark-or-not', async ({ page }) => {
  await openAiStep(page);
  await attach(page, [
    { name: 'crest.png', w: 200, h: 200, alpha: true },
    { name: 'flat-crest.png', w: 200, h: 200, alpha: false },
    { name: 'studio.png', w: 1600, h: 900, alpha: false },
  ]);

  const cards = page.getByTestId('ai-upload');
  // SIZE decides first, then transparency. A cut-out mark and the SAME mark flattened onto
  // white are both marks - keying only on alpha called every JPEG logo a mood board.
  await expect(cards.nth(0)).toHaveAttribute('data-purpose', 'asset');
  await expect(cards.nth(1)).toHaveAttribute('data-purpose', 'asset');
  // Frame-shaped and opaque: not a mark. Neither "make one like this" nor "make it work over
  // this" is ever guessed - no pixel distinguishes them from a mood board, so guessing would
  // present a coin flip as a decision.
  await expect(cards.nth(2)).toHaveAttribute('data-purpose', 'mood');

  // The guess is visible and reversible, never a hidden default.
  await cards.nth(2).getByTestId('purpose-plate').click();
  await expect(cards.nth(2)).toHaveAttribute('data-purpose', 'plate');
});

test('the fixed/swappable choice belongs to "use it as it is" alone', async ({ page }) => {
  await openAiStep(page);
  await attach(page, [{ name: 'crest.png', w: 200, h: 200, alpha: true }]);
  const card = page.getByTestId('ai-upload').first();

  await expect(card.getByTestId('binding-swappable')).toHaveAttribute('aria-pressed', 'true');

  // It is a property of being an asset: a reference has no operator control to speak of, so
  // the choice must disappear rather than sit there meaning nothing.
  await card.getByTestId('purpose-mood').click();
  await expect(card.getByTestId('binding-swappable')).toHaveCount(0);

  // Coming back must not silently resurrect a stale choice.
  await card.getByTestId('purpose-asset').click();
  await expect(card.getByTestId('binding-swappable')).toHaveAttribute('aria-pressed', 'true');
});

test('each purpose reaches the model as its own instruction', async ({ page }) => {
  // The gateway body nests the model request under `request` (see e2e/ai-more-control.spec.ts).
  type Body = { request?: { messages?: { content: { type: string; text?: string }[] | string }[] } };
  let body: Body | null = null;
  await page.route('/api/ai/generate', (route: Route) => {
    body = route.request().postDataJSON() as Body;
    return route.fulfill(toolResponse(VALID_TEMPLATE));
  });

  await openAiStep(page);
  await attach(page, [
    { name: 'crest.png', w: 200, h: 200, alpha: true },
    { name: 'rival.png', w: 1600, h: 900, alpha: false },
    { name: 'studio.png', w: 1600, h: 900, alpha: false },
  ]);
  const cards = page.getByTestId('ai-upload');
  await cards.nth(0).getByTestId('binding-fixed').click();
  await cards.nth(1).getByTestId('purpose-layout').click();
  await cards.nth(2).getByTestId('purpose-plate').click();

  await page.locator('.wz-step textarea').fill('A slate for a guest name.');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('[data-testid="ai-upload"]').first()).toBeVisible();
  await expect.poll(() => body !== null, { timeout: 25_000 }).toBe(true);

  const text = (body!.request?.messages ?? [])
    .flatMap((m) => (typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content))
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');

  // The manifest numbers every attachment, so "attachment 3" means one picture in the text
  // and the same picture among the vision blocks.
  expect(text).toContain('images/crest.png — USE AS IS (fixed, no operator field)');
  expect(text).toContain('2. MAKE ONE LIKE THIS');
  expect(text).toContain('3. MAKE IT WORK OVER THIS');

  // Each purpose brings the instruction that makes it different from the others.
  expect(text).toMatch(/take the structure, leave the skin/);
  expect(text).toMatch(/read it as a DIAGRAM of what to build/);
  expect(text).toMatch(/REAL background the graphic will be shown over/);
  expect(text).toMatch(/no recolouring, tinting, CSS filter, crop/);
  expect(text).toMatch(/give it NO data field/);

  // Only the as-is picture is bundled. A reference that reached the assets list would ship
  // in the export as a file nothing draws - and a mood board is not the user's artwork.
  expect(text).not.toContain('images/rival.png — USE AS IS');
  expect(text).not.toContain('images/studio.png — USE AS IS');
});

test('a reference is never bundled into the created template', async ({ page }) => {
  await page.route('/api/ai/generate', (route: Route) => route.fulfill(toolResponse(VALID_TEMPLATE)));
  await openAiStep(page);
  await attach(page, [
    { name: 'crest.png', w: 200, h: 200, alpha: true },
    { name: 'moodboard.png', w: 1600, h: 900, alpha: false },
  ]);

  await page.locator('.wz-step textarea').fill('A slate for a guest name.');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.wz-step .status-ok')).toContainText('Passes validation', { timeout: 25_000 });
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByTestId('wz-finish-editor').click();

  // Read the bundled assets through the ASSETS PANEL, not through an imported store module:
  // `import('/src/store/…')` in an eval context can resolve a different module instance than
  // the running app (the ghost-store trap in AGENTS.md), and it did here - the assertion
  // passed alone and failed in the parallel run, reading state the UI never had.
  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  const panel = page.locator('.assets-panel');
  await expect(panel).toContainText('crest');
  // The mood board informed the design and stopped there. Bundling it would ship a file the
  // export references nowhere and the user never chose to include.
  await expect(panel).not.toContainText('moodboard');
});

test('a design that "improves" an as-is picture is held back', async ({ page }) => {
  // The harness path, because the as-is screen rides inside the INJECTED validator - the one
  // generateRaw deliberately never runs (src/ai/AGENTS.md keeps that baseline pure).
  await page.addInitScript(() =>
    localStorage.setItem(
      'spx-gfx-ai',
      JSON.stringify({ provider: 'anthropic', configuredProviders: ['anthropic'], model: 'claude-sonnet-5', useHarness: true }),
    ),
  );
  await page.route('/api/ai/generate', (route: Route) => {
    const tool = requestedTool(route);
    if (tool === 'emit_design_alternatives') return route.fulfill(toolResponse({ alternatives: [CUSTOM_SPEC] }));
    if (tool === 'emit_design_spec') return route.fulfill(toolResponse(CUSTOM_SPEC));
    return route.fulfill(toolResponse(TINTED_TEMPLATE));
  });

  await openAiStep(page);
  await attach(page, [{ name: 'crest.png', w: 200, h: 200, alpha: true }]);
  await page.locator('.wz-step textarea').fill('A slate with our crest.');
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  // Reported in the user's terms, naming the rule the design broke rather than a CSS property.
  await expect(page.locator('.wz-step')).toContainText('use it as it is', { timeout: 40_000 });
  await expect(page.getByRole('button', { name: 'Next →' })).toBeDisabled();
});

// ── Video: the same four purposes, a different pipeline ──────────────────────
//
// The video half has a harder job than the graphics half: a video asset is reachable four
// ways (the code's `assets.<name>`, the Content panel's image picker, the player's data-URL
// map, and the render manifest's upload), and reference material must reach NONE of them.

test('video: a reference-tagged upload is not composition material', async ({ page }) => {
  await useFakeAiKey(page);
  await mockClaude(page, [
    {
      summary: 'A headline holds centre.',
      // It declares an IMAGE input, so the Content panel really renders the asset picker.
      // Without one there is no <select> at all and "the picker omits the mood board" would
      // pass for the wrong reason - which it did, until a mutation run caught it.
      tsx: `import { AbsoluteFill, Img } from 'remotion';
export default function Composition({ assets = {}, fields = {} }: { assets?: Record<string, string>; fields?: Record<string, string> }) {
  const mark = assets[String(fields.mark ?? '')];
  return (
    <AbsoluteFill style={{ background: '#0a0c10', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 90 }}>
      {mark ? <Img src={mark} style={{ width: 200 }} /> : null}
      {fields.headline ?? 'Hello'}
    </AbsoluteFill>
  );
}`,
      inputs: [
        { key: 'headline', type: 'text', label: 'Headline', default: 'Hello' },
        { key: 'mark', type: 'image', label: 'Mark', default: '' },
      ],
    },
  ]);

  await page.goto('/app');
  await page.getByRole('button', { name: 'Video or animation with AI' }).click();
  await expect(page.getByTestId('video-step')).toBeVisible();
  await page.getByTestId('video-prompt').fill('a clean opener');

  // The video step's own uploader, then tag the second picture as reference material.
  const encoded = await page.evaluate(() => {
    const make = (w: number, h: number, alpha: boolean) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const x = c.getContext('2d')!;
      if (!alpha) {
        x.fillStyle = '#204060';
        x.fillRect(0, 0, w, h);
      }
      x.fillStyle = '#f6a623';
      x.fillRect(w * 0.2, h * 0.2, w * 0.6, h * 0.6);
      return c.toDataURL('image/png').split(',')[1];
    };
    return [
      { name: 'logo.png', base64: make(200, 200, true) },
      { name: 'moodboard.png', base64: make(1600, 900, false) },
    ];
  });
  await page.setInputFiles(
    '[data-testid="video-step"] input[type=file]',
    encoded.map((e) => ({ name: e.name, mimeType: 'image/png', buffer: Buffer.from(e.base64, 'base64') })),
  );
  const cards = page.getByTestId('ai-upload');
  await expect(cards).toHaveCount(2);
  await cards.nth(1).getByTestId('purpose-mood').click();

  // A video composition has no operator-swap control, so the binding choice must not appear.
  await expect(cards.nth(0).getByTestId('binding-swappable')).toHaveCount(0);

  // Scoped to the STEP: Home renders behind the wizard and its Productions section now has its
  // own "＋ Create" (docs/GOALS_ARCHIVE.md "Student release" step 8), which `.first()` resolved to — a
  // disabled button, so the click waited out the whole timeout.
  await page.getByTestId('video-step').getByRole('button', { name: /Create/ }).first().click();
  await expect(page.getByTestId('video-shell')).toBeVisible({ timeout: 25_000 });

  // The Assets panel manages EVERY upload - it is the one surface that must not filter, or a
  // reference could never be re-tagged or deleted.
  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  await expect(page.locator('.video-assets')).toContainText('logo');
  await expect(page.locator('.video-assets')).toContainText('moodboard');

  // The Content panel's image picker offers composition material and nothing else. Asserted
  // in both directions on purpose: "the mood board is absent" is satisfied by an empty picker.
  await page.getByRole('button', { name: 'Content', exact: true }).click();
  const picker = page.locator('[data-testid="video-content-panel"] select');
  await expect(picker.first()).toBeVisible();
  const options = (await picker.locator('option').allTextContents()).join(' ');
  expect(options).toContain('logo');
  expect(options).not.toContain('moodboard');
});
