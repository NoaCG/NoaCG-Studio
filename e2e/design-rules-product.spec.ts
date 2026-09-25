import { test, expect, type Page, type Route } from '@playwright/test';
import { createProject, enableAdvancedMode } from './_create';
import { settleDurableWrites, awaitDurableReady } from './_durable';

// THE DESIGN RULES AS A PRODUCT PROPERTY (docs/DESIGN_RULES_PLAN.md §5 R4).
//
// What is pinned here, per the ratified severity policy (owner, 2026-08-19):
//   · the wizard's viewing-target select and the size-floor tri-state PERSIST with the
//     project (additive optional - the default state serializes to nothing);
//   · choosing "Allow denser, smaller type" changes the AI REQUEST - the design-rules block
//     on the user message carries the relaxed-floors honesty line (no tokens: the gateway is
//     mocked at the network level, the ai.spec pattern);
//   · undersized text yields a plain-language WARNING in the editor's export panel and the
//     export still runs - warnings never block (the catalog's 312 audit-indicted designs
//     stay shipped and simply warn);
//   · the computed floors scale off the template's OWN frame (short side), so 16:9 and 9:16
//     share one floor while 720p gets a smaller one - the math is node-tested
//     (scripts/design-rules.test.mjs); this pins the product wiring.

// A house-shaped template whose ONE text line renders at 24px - under every profile's
// primary floor (~50px at 1080p, ~33px at 720p), while passing validation and the bench.
const SMALL_TEMPLATE = {
  name: 'Tiny Slate',
  type: 'info-card',
  summary: 'A slate whose primary line is deliberately under the broadcast floor.',
  html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Tiny Slate</title>
  <script src="js/gsap.min.js"></script>
  <link rel="stylesheet" href="css/template.css" />
  <script src="js/template.js"></script>
  <script>window.SPXGCTemplateDefinition = {
    "description": "Tiny Slate",
    "playserver": "OVERLAY", "playchannel": "1", "playlayer": "7",
    "webplayout": "7", "out": "manual", "dataformat": "json",
    "DataFields": [ { "field": "f0", "ftype": "textfield", "title": "Name", "value": "Hello Tiny" } ]
  };</script>
</head>
<body>
  <div class="slate">
    <div class="slate-box"><span id="f0">Hello Tiny</span></div>
  </div>
</body>
</html>`,
  css: `:root { --accent: #e8c547; --text-color: #ffffff; --text-dim: rgba(255,255,255,0.7); --panel-bg: rgba(12,14,18,0.92); --font-heading: sans-serif; --scale: 1; }
.slate { position: absolute; left: 120px; bottom: 120px; opacity: 0; }
.slate-box { color: var(--text-color); background: var(--panel-bg); font-size: 24px; padding: calc(20px * var(--scale)); width: fit-content; max-width: calc(900px * var(--scale)); overflow-wrap: break-word; }`,
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

/** The whole text of a mocked gateway request - what the model was actually told. */
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

/** Raw one-shot config (useHarness false): ONE mocked call, straight to the coder tool. */
async function rawAiConfig(page: Page): Promise<void> {
  await page.addInitScript(() =>
    localStorage.setItem(
      'spx-gfx-ai',
      JSON.stringify({ provider: 'anthropic', configuredProviders: ['anthropic'], model: 'claude-sonnet-5', useHarness: false }),
    ),
  );
}

async function openAiStep(page: Page) {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="ai"]').click();
}

// A generation runs the real quality gate (live bench); same honest budget ai.spec carries.
const GENERATED = { timeout: 25_000 };

test.beforeEach(async ({ page }) => {
  test.setTimeout(60_000);
  await enableAdvancedMode(page);
});

test('the wizard viewing settings persist with the project across a reload', async ({ page }) => {
  // ON THE AI STEP, WHICH IS THE WIZARD SURFACE THAT STILL ASKS. The catalog walk's Style step
  // carried the same control until 2026-09-02 and no longer does: measured there, moving the
  // target from TV to Mobile or the floor from standard to safe left the composed document
  // byte-identical, so on that path it was an input with no visible effect
  // (docs/backlog/size-questionnaire-purpose.md). Here it is the opposite of decorative - the
  // two tests below prove it reaches the request - and this one is about what the CREATE does
  // with it, which is the half neither of those sees.
  await rawAiConfig(page);
  await page.route('/api/ai/generate', (route: Route) => route.fulfill(toolUse(SMALL_TEMPLATE)));
  await openAiStep(page);
  await expect(page.getByTestId('wz-viewing')).toBeVisible();

  await page.getByTestId('wz-viewing-profile').selectOption('streaming');
  // "Allow denser, smaller type" = the deliberate small-by-request act ('relaxed'). One
  // tri-state, three radios: the control now says what each option permits instead of leaving
  // two checkboxes to change each other's meaning.
  await page.getByTestId('wz-floors-relaxed').check();
  await page.locator('.wz-step textarea').fill('A dense stats panel, small type is fine');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.wz-step .status-ok')).toContainText('Passes validation', GENERATED);
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByTestId('wz-finish-editor').click();
  await expect(page.getByTestId('creation-wizard')).toBeHidden();

  // The create landed the settings on the store; the debounced autosave persists them with
  // the working slot. Poll the mirror rather than sleeping out the debounce.
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { loadProject } = await import('/src/model/project.ts');
        return loadProject()?.legibility ?? null;
      }),
    )
    .toEqual({ viewing: { profile: 'streaming' }, floors: 'relaxed' });

  await settleDurableWrites(page);
  await page.reload();
  await expect(page.locator('.topbar')).toBeVisible();
  await awaitDurableReady(page);
  const restored = await page.evaluate(async () => {
    const { loadProject } = await import('/src/model/project.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return { slot: loadProject()?.legibility ?? null, store: useTemplateStore.getState().legibility };
  });
  expect(restored.slot).toEqual({ viewing: { profile: 'streaming' }, floors: 'relaxed' });
  expect(restored.store).toEqual({ viewing: { profile: 'streaming' }, floors: 'relaxed' });
});

test('an untouched project serializes NO legibility key at all', async ({ page }) => {
  await createProject(page, 'Hairline');
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { loadProject } = await import('/src/model/project.ts');
        const p = loadProject();
        return p ? 'legibility' in p && p.legibility !== undefined && p.legibility !== null : null;
      }),
    )
    .toBe(false);
});

test('choosing denser type changes the AI request to the relaxed mode', async ({ page }) => {
  await rawAiConfig(page);
  const requests: string[] = [];
  await page.route('/api/ai/generate', (route: Route) => {
    requests.push(requestText(route));
    return route.fulfill(toolUse(SMALL_TEMPLATE));
  });
  await openAiStep(page);

  await page.getByTestId('wz-viewing-profile').selectOption('streaming');
  await page.getByTestId('wz-floors-relaxed').check();
  await page.locator('.wz-step textarea').fill('A dense stats panel, small type is fine');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.wz-step .status-ok')).toContainText('Passes validation', GENERATED);

  // The request the model actually received: the rules block rides the user message, and the
  // relaxed line states honestly that the customer chose the smaller scale.
  expect(requests.length).toBe(1);
  expect(requests[0]).toContain('BROADCAST LEGIBILITY RULES');
  expect(requests[0]).toContain('viewed on streaming');
  expect(requests[0]).toContain('SIZE FLOORS RELAXED BY THE CUSTOMER');
  // The result card stamps what its request carried - the wizard-to-request wiring, visible.
  await expect(page.locator('.change-preview')).toHaveAttribute('data-legibility', 'relaxed:streaming');
});

test('with the defaults the AI request carries the binding rules and no relaxed line', async ({ page }) => {
  await rawAiConfig(page);
  const requests: string[] = [];
  await page.route('/api/ai/generate', (route: Route) => {
    requests.push(requestText(route));
    return route.fulfill(toolUse(SMALL_TEMPLATE));
  });
  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('A clean news lower third');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.wz-step .status-ok')).toContainText('Passes validation', GENERATED);

  expect(requests[0]).toContain('BROADCAST LEGIBILITY RULES');
  expect(requests[0]).toContain('viewed on tv');
  expect(requests[0]).not.toContain('SIZE FLOORS RELAXED');
  await expect(page.locator('.change-preview')).toHaveAttribute('data-legibility', 'standard:tv');
});

test('undersized primary text warns in the editor in plain language and still exports', async ({ page }) => {
  await rawAiConfig(page);
  await page.route('/api/ai/generate', (route: Route) => route.fulfill(toolUse(SMALL_TEMPLATE)));
  await openAiStep(page);
  await page.locator('.wz-step textarea').fill('A tiny slate');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.wz-step .status-ok')).toContainText('Passes validation', GENERATED);
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByTestId('wz-finish-editor').click();
  await expect(page.locator('.topbar .tpl-name')).toHaveText('Tiny Slate');

  // The export panel: the design-rules warning, in the ratified plain-language copy, naming
  // the viewing context it was computed under.
  await page.getByTestId('dock-tab-export').click();
  const warning = page.locator('.issue.warn', { hasText: 'legibility-size' });
  await expect(warning.first()).toContainText('smaller than the ~28px we recommend for TV viewing distance', {
    timeout: 15_000,
  });
  await expect(warning.first()).toContainText('may be hard to read from a couch');

  // WARN-FIRST: no errors, and the download is live - export never blocks on these.
  await expect(page.locator('.issue.error')).toHaveCount(0);
  const download = page.getByRole('button', { name: /Validate & download/i });
  await expect(download).toBeEnabled();
  const saved = page.waitForEvent('download');
  await download.click();
  expect((await saved).suggestedFilename()).toMatch(/\.zip$/);
});

test('a shipped catalog design warns under the same rule and is not blocked', async ({ page }) => {
  // lt48 is one of the EIGHT shipped designs the type-aware floor still warns about (its name
  // renders at 26px against the card band's 28px). It used to be one of 322, which is why this
  // test named lt14 at 38px until 2026-09-08 - under the new bands lt14 passes clean, and a test
  // that proves "shipped work warns" is only worth anything when warning is the exception.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const name = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    return variantById('lt48')?.name ?? null;
  });
  expect(name).toBeTruthy();
  await createProject(page, name!);

  await page.getByTestId('dock-tab-export').click();
  const warning = page.locator('.issue.warn', { hasText: 'legibility-size' });
  await expect(warning.first()).toContainText('we recommend for TV viewing distance', { timeout: 15_000 });
  await expect(page.locator('.issue.error')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Validate & download/i })).toBeEnabled();
});

test('the computed floors scale off the template frame: 16:9 = 9:16, 720p smaller', async ({ page }) => {
  // The math is node-tested (scripts/design-rules.test.mjs); this pins the PRODUCT wiring:
  // checkTemplateLegibility computes each warning off the template's own resolution.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const floors = await page.evaluate(async (tpl) => {
    const { checkTemplateLegibility } = await import('/src/validation/designRulesWarnings.ts');
    const { DEFAULT_SETTINGS } = await import('/src/model/types.ts');
    const at = async (width: number, height: number) => {
      const template = {
        ...tpl,
        assets: [],
        fields: [{ field: 'f0', ftype: 'textfield', title: 'Name', value: 'Hello Tiny' }],
        settings: DEFAULT_SETTINGS,
        resolution: { width, height },
        fps: 50,
      };
      const warnings = await checkTemplateLegibility(template, null);
      const size = warnings.find((w) => w.rule === 'legibility-size');
      return size ? /~(\d+)px we recommend/.exec(size.message)?.[1] ?? null : null;
    };
    return {
      landscape: await at(1920, 1080),
      portrait: await at(1080, 1920),
      hd720: await at(1280, 720),
    };
  }, SMALL_TEMPLATE);
  // One table serves 16:9 and 9:16 - the short side is 1080 in both. The floor is 28px there
  // since it became type-aware (2026-09-08): a project with no category takes the CARD band.
  expect(floors.landscape).toBe('28');
  expect(floors.portrait).toBe('28');
  // The SAME 24px line passes at 720p, and that is the scaling this test exists to pin: the floor
  // composes off the frame's short side (0.0259 * 720 = 18.6px), so what is undersized on a 1080
  // frame is not on a 720 one. Asserting the absence is stronger than asserting a number, because
  // a floor that stopped scaling would keep warning here.
  expect(floors.hd720).toBeNull();
});

test('the editor can change the viewing target of an already-saved project', async ({ page }) => {
  // The R4 slice put the viewing decision only in the wizard, which froze it at create time
  // for every project that already existed. The Style panel carries the SAME control, the
  // change persists with the project, and the export panel's warnings re-measure under it.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const name = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    return variantById('lt48')?.name ?? null;
  });
  expect(name).toBeTruthy();
  await createProject(page, name!);

  // Before: the warning is phrased for the TV default.
  await page.getByTestId('dock-tab-export').click();
  const warning = page.locator('.issue.warn', { hasText: 'legibility-size' });
  await expect(warning.first()).toContainText('we recommend for TV viewing distance', { timeout: 15_000 });

  await page.getByTestId('dock-tab-style').click();
  await expect(page.getByTestId('wz-viewing')).toBeVisible();
  await page.getByTestId('wz-viewing-profile').selectOption('mobile');

  // The store took it, and the debounced autosave wrote it to the working slot — a template
  // edit is NOT required to persist a legibility change.
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { loadProject } = await import('/src/model/project.ts');
        return loadProject()?.legibility ?? null;
      }),
    )
    .toEqual({ viewing: { profile: 'mobile' } });

  // After: the same measurement, re-run under the new target, in the phone's words — and
  // still a warning, never a block.
  await page.getByTestId('dock-tab-export').click();
  await expect(warning.first()).toContainText('phone screens', { timeout: 15_000 });
  await expect(page.locator('.issue.error')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Validate & download/i })).toBeEnabled();

  await settleDurableWrites(page);
  await page.reload();
  await expect(page.locator('.topbar')).toBeVisible();
  await awaitDurableReady(page);
  const restored = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().legibility;
  });
  expect(restored).toEqual({ viewing: { profile: 'mobile' } });
});

test('the size floors are ONE choice with three answers, and each says what it permits', async ({ page }) => {
  // They used to be two checkboxes over a single tri-state, which is a control that lies about
  // its own shape: ticking "Guaranteed readable size" silently changed what "Broadcast text
  // sizes" meant, un-ticking one could not say which of the other two states you landed in, and
  // the pair could express a fourth combination the model does not have.
  await createProject(page, 'Hairline');
  await page.getByTestId('dock-tab-style').click();
  const floors = page.getByTestId('wz-floors');
  await expect(floors).toBeVisible();

  // Three radios, one group: exactly one is on at any moment, and the DEFAULT is visible —
  // which is the thing two checkboxes could not show ("neither ticked" looked like nothing).
  await expect(floors.locator('input[type="radio"]')).toHaveCount(3);
  await expect(page.getByTestId('wz-floors-standard')).toBeChecked();
  // Each option states what it PERMITS, because a floor is a rule about what may ship.
  await expect(floors).toContainText('Permits text below the broadcast sizes');
  await expect(floors).toContainText('Permits any size at or above');
  await expect(floors).toContainText('Permits only large type');

  const stored = () =>
    page.evaluate(async () => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      return useTemplateStore.getState().legibility?.floors ?? null;
    });

  await page.getByTestId('wz-floors-safe').check();
  await expect.poll(stored).toBe('safe');
  await expect(page.getByTestId('wz-floors-relaxed')).not.toBeChecked();

  await page.getByTestId('wz-floors-relaxed').check();
  await expect.poll(stored).toBe('relaxed');
  await expect(page.getByTestId('wz-floors-safe')).not.toBeChecked();

  // Back to the default, and the default serializes to NOTHING — the additive-optional rule.
  await page.getByTestId('wz-floors-standard').check();
  await expect.poll(stored).toBeNull();
});

test('supporting text has its own size rule, reported on the readiness row and never gating', async ({ page }) => {
  // The three choices move the SECONDARY floors and barely touch the primary one (standard puts
  // supporting text at 1.85% with a warning band to 2.2%; safe puts it at 5% with no band), so a
  // person choosing between them is choosing about supporting text. One `legibility-size` rule
  // could not say which of their findings the choice governs.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const read = await page.evaluate(async () => {
    const { readinessRows, unclaimedFindings } = await import('/src/validation/readiness.ts');
    const warnings = [
      { rule: 'legibility-size', message: 'Primary text is small', severity: 'warn' },
      { rule: 'legibility-secondary-size', message: 'Supporting text is small', severity: 'warn' },
    ];
    const validation = { ok: true, errors: [], warnings };
    const rows = readinessRows(validation as never, true);
    return {
      legibility: rows.find((r) => r.id === 'legibility') ?? null,
      // A findings id no row claims is surfaced raw rather than swallowed — the row set must
      // claim this one, or it would read as an unexplained loose warning.
      unclaimed: unclaimedFindings(validation as never).map((f) => f.rule),
      // It is a WARNING, so the row warns; it can never make the row fail, because nothing on
      // this row is ever an error (designRulesWarnings only ever pushes warnings).
      state: rows.find((r) => r.id === 'legibility')?.state ?? null,
    };
  });
  expect(read.state).toBe('warn');
  expect(read.legibility?.messages).toEqual(['Primary text is small', 'Supporting text is small']);
  expect(read.unclaimed).toEqual([]);
});
