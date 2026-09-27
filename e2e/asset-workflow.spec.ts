// covers: src/blocks/**, src/components/canvas/**
// covers: src/components/timeline/{StepTimeline.tsx,LegacyTimeline.tsx,Inspector.tsx,PlayoutSimulator.tsx}
// covers: src/components/{AssetsPanel.tsx,InsertTemplateDialog.tsx}, src/assets/**

import { test, expect, type Page } from '@playwright/test';
import { createProject } from './_create';

// The asset-to-states workflow: dropping an asset creates ONE connected element (canvas +
// layer row + registry + selection), and its STEP/STATE participation is decided right on
// the canvas chip ("appears …") or in the Inspector's Appears/Disappears rows — the same
// changePartPress / createStepFromLayer / setLayerHide transforms every surface writes.
// Pins the core promise: drag in a logo, introduce it as the graphic's next step, undo it
// all — without ever touching the timeline or the node editor by hand.

// A valid 1×1 fully opaque black RGBA PNG - the image path needs real decodable bytes.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGD4DwABBAEAgLvRWwAAAABJRU5ErkJggg==',
  'base64',
);
// Not a decodable movie — the import gate keys on extension + size, and the probe falls
// back to a default box when metadata never loads. Playback isn't this spec's subject.
const TINY_WEBM = Buffer.from('1a45dfa3', 'hex');

async function importAsset(page: Page, name: string, mimeType: string, buffer: Buffer) {
  await page.getByTestId('dock-tab-assets').click();
  await expect(page.getByTestId('assets-panel')).toBeVisible();
  await page.getByTestId('assets-import-input').setInputFiles({ name, mimeType, buffer });
}

/** HTML5 drag from an asset row to a canvas point (Playwright can't native-drag). */
async function dropOnCanvas(page: Page, path: string, fx = 0.6, fy = 0.4) {
  const row = page.locator(`[data-path="${path}"]`);
  await expect(row).toBeVisible();
  const dt = await page.evaluateHandle(() => new DataTransfer());
  await row.dispatchEvent('dragstart', { dataTransfer: dt });
  const canvas = (await page.getByTestId('canvas-layer').boundingBox())!;
  await page.getByTestId('canvas-layer').dispatchEvent('drop', {
    dataTransfer: dt,
    clientX: canvas.x + canvas.width * fx,
    clientY: canvas.y + canvas.height * fy,
  });
}

const animState = (page: Page) =>
  page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const s = useTemplateStore.getState();
    const data = parseAnimData(s.template.js);
    return {
      selected: s.selectedPart,
      html: s.template.html,
      steps: data?.steps.map((st) => ({ name: st.name, reveals: st.reveals ?? [], hides: st.hides ?? [] })) ?? null,
      spxSteps: s.template.settings.steps,
    };
  });

test('drop a logo, make it the NEXT STEP from the canvas chip — connected everywhere, fully undoable', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await importAsset(page, 'team-logo.png', 'image/png', TINY_PNG);
  await dropOnCanvas(page, 'images/team-logo.png');

  // The drop created ONE connected element: code + selection (registry/layer/timeline
  // rows derive from the same HTML, so they cannot disagree).
  await expect.poll(async () => (await animState(page)).selected).toBe('#img-team-logo');
  // Default participation: visible from the graphic's entrance — no reveal entries.
  let st = await animState(page);
  expect(st.steps!.every((s) => !s.reveals.includes('#img-team-logo'))).toBe(true);

  // The chip's "appears" control is offered IMMEDIATELY — even though this template has
  // no middle steps yet — and "a new step" is what creates one.
  const appears = page.getByTestId('canvas-appears');
  await expect(appears).toBeVisible();
  await expect(appears.locator('option', { hasText: 'appears in a new step »' })).toHaveCount(1);
  await appears.selectOption('0'); // the new-step option (presses.length = 0)

  // One click made the logo the graphic's next step: a named step on the default path,
  // revealing the logo, with the SPX steps setting re-derived.
  await expect.poll(async () => (await animState(page)).steps?.length).toBe(3);
  st = await animState(page);
  expect(st.steps![1].name).toBe('img-team-logo In');
  expect(st.steps![1].reveals).toContain('#img-team-logo');
  expect(st.spxSteps).toBe('2');

  // The states graph shows the same fact — steps ARE the default path (positional binding).
  await page.getByTestId('timeline-surface-toggle').click();
  await expect(page.locator('.machine-graph')).toContainText('img-team-logo In');
  await page.getByTestId('timeline-surface-timeline').click();

  // The whole flow is two undo steps: the participation choice, then the placement.
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await animState(page)).steps?.length).toBe(2);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await animState(page)).html).not.toContain('img-team-logo');
  // Redo replays both faithfully.
  await page.keyboard.press('Control+y');
  await page.keyboard.press('Control+y');
  await expect.poll(async () => (await animState(page)).steps?.length).toBe(3);
  st = await animState(page);
  expect(st.steps![1].reveals).toContain('#img-team-logo');
});

test('an image kept visible from the beginning stays out of every reveal list, and its row exists', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await importAsset(page, 'backdrop.png', 'image/png', TINY_PNG);
  await dropOnCanvas(page, 'images/backdrop.png', 0.3, 0.3);

  await expect.poll(async () => (await animState(page)).selected).toBe('#img-backdrop');
  // The chip reads the default honestly.
  await expect(page.getByTestId('canvas-appears')).toHaveValue('-1');
  // The timeline grew a layer row for it (derived from the HTML, no manual add).
  await expect(page.locator('.timeline-label[data-part="#img-backdrop"]')).toBeVisible();
  const st = await animState(page);
  expect(st.steps!.every((s) => !s.reveals.includes('#img-backdrop'))).toBe(true);
});

test('drop into an EXISTING step, then retarget participation afterwards from the Inspector', async ({ page }) => {
  // steps: true creates the graphic with per-line reveal steps already on the path.
  await createProject(page, { category: 'Lower thirds', name: 'Hairline', steps: true });
  await importAsset(page, 'badge.png', 'image/png', TINY_PNG);
  await dropOnCanvas(page, 'images/badge.png');
  await expect.poll(async () => (await animState(page)).selected).toBe('#img-badge');

  const before = await animState(page);
  const middleCount = before.steps!.length - 2;
  expect(middleCount).toBeGreaterThan(0);

  // The chip lists every existing step BY NAME — join the first one.
  const appears = page.getByTestId('canvas-appears');
  await expect(appears.locator('option', { hasText: `appears in “${before.steps![1].name}”` })).toHaveCount(1);
  await appears.selectOption('0');
  await expect
    .poll(async () => (await animState(page)).steps![1].reveals)
    .toContain('#img-badge');
  // Joining an existing step adds NO step.
  expect((await animState(page)).steps!.length).toBe(before.steps!.length);

  // Retarget from the Inspector's Appears row: back to "visible from the beginning"…
  await page.locator('.inspector-tabs').getByRole('button', { name: 'Animations' }).click();
  const inspectorAppears = page.getByTestId('inspector-appears');
  await expect(inspectorAppears).toBeVisible();
  await expect(inspectorAppears).toHaveValue('0');
  await inspectorAppears.selectOption('-1');
  await expect
    .poll(async () => (await animState(page)).steps!.every((s) => !s.reveals.includes('#img-badge')))
    .toBe(true);
  // …and forward again into a NEW step of its own ("appears in step 2" as a fresh state).
  await inspectorAppears.selectOption(String(middleCount));
  const after = await animState(page);
  expect(after.steps!.length).toBe(before.steps!.length + 1);
  expect(after.steps!.some((s) => s.name === 'img-badge In' && s.reveals.includes('#img-badge'))).toBe(true);
});

test('the Inspector names the preset targets and writes an early exit (Disappears)', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline', steps: true });
  await importAsset(page, 'badge.png', 'image/png', TINY_PNG);
  await dropOnCanvas(page, 'images/badge.png');
  await expect.poll(async () => (await animState(page)).selected).toBe('#img-badge');

  // The Animations tab says WHERE a preset lands — the state transition being edited.
  await page.locator('.inspector-tabs').getByRole('button', { name: 'Animations' }).click();
  await expect(page.getByTestId('inspector-preset-target')).toContainText('In plays when');

  // Disappears: give the (from-the-start) badge an early exit at the first middle step.
  const st = await animState(page);
  const disappears = page.getByTestId('inspector-disappears');
  await expect(disappears).toBeVisible();
  await expect(disappears).toHaveValue(String(st.steps!.length - 1)); // with ■ Out
  await disappears.selectOption('1');
  await expect.poll(async () => (await animState(page)).steps![1].hides).toContain('#img-badge');
  // And back to the end.
  await disappears.selectOption(String(st.steps!.length - 1));
  await expect
    .poll(async () => (await animState(page)).steps!.every((s) => !s.hides.includes('#img-badge')))
    .toBe(true);
});

test('a preset Delay shifts the written keyframes and grows the step — no keyframe editing needed', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await importAsset(page, 'badge.png', 'image/png', TINY_PNG);
  await dropOnCanvas(page, 'images/badge.png');
  await expect.poll(async () => (await animState(page)).selected).toBe('#img-badge');

  await page.locator('.inspector-tabs').getByRole('button', { name: 'Animations' }).click();
  const entranceBefore = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    return parseAnimData(useTemplateStore.getState().template.js)!.steps[0].duration;
  });

  await page.getByTestId('inspector-preset-select').selectOption({ label: 'Fade' });
  await page.getByTestId('inspector-preset-dur-in').fill('0.4');
  await page.getByTestId('inspector-preset-delay-in').fill('0.5');
  await page.getByTestId('inspector-preset-apply').click();

  const after = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const data = parseAnimData(useTemplateStore.getState().template.js)!;
    const tracks = data.steps[0].layers['#img-badge'];
    const times = Object.values(tracks).flat().map((k) => k.time);
    return { min: Math.min(...times), max: Math.max(...times), duration: data.steps[0].duration };
  });
  // Every written keyframe sits AT or AFTER the delay (the layer holds its first pose
  // until then — a donor may stagger its own start later still), the motion fits inside
  // the chosen 0.4s + 0.5s hold, and the step length honours choice plus hold.
  expect(entranceBefore).toBeGreaterThan(0);
  expect(after.min).toBeGreaterThanOrEqual(0.5);
  expect(after.max).toBeLessThanOrEqual(0.901);
  expect(after.duration).toBeCloseTo(0.9, 3);
});

test('video assets: capped import, VIDEO badge, and a muted looping <video> on drop', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await page.getByTestId('dock-tab-assets').click();

  // Over the cap: rejected with an honest note, nothing imported.
  await page.getByTestId('assets-import-input').setInputFiles({
    name: 'huge.webm', mimeType: 'video/webm', buffer: Buffer.alloc(4 * 1024 * 1024),
  });
  await expect(page.locator('.assets-panel .status-bad')).toContainText('videos import up to');
  await expect(page.getByTestId('asset-row')).toHaveCount(0);

  // Under the cap: lands in videos/ with its own badge.
  await page.getByTestId('assets-import-input').setInputFiles({
    name: 'loop.webm', mimeType: 'video/webm', buffer: TINY_WEBM,
  });
  await expect(page.locator('[data-path="videos/loop.webm"]')).toBeVisible();
  await expect(page.locator('.asset-badge-video')).toHaveText('VIDEO');

  await dropOnCanvas(page, 'videos/loop.webm');
  const code = () =>
    page.evaluate(async () => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      return useTemplateStore.getState().template.html;
    });
  await expect.poll(code).toContain('id="vid-loop"');
  const html = await code();
  expect(html).toContain('src="videos/loop.webm"');
  expect(html).toMatch(/<video[^>]*\bautoplay\b[^>]*\bmuted\b[^>]*\bloop\b/);
  // A video element is a selectable, step-assignable part like any insert.
  await expect.poll(async () => (await animState(page)).selected).toBe('#vid-loop');
  await expect(page.getByTestId('canvas-appears')).toBeVisible();
});

test('the Assets panel marks which assets the graphic actually uses, per row', async ({ page }) => {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await importAsset(page, 'team-logo.png', 'image/png', TINY_PNG);
  // Imported but not placed: no usage mark.
  await expect(page.locator('[data-path="images/team-logo.png"] [data-testid="asset-used"]')).toHaveCount(0);

  await dropOnCanvas(page, 'images/team-logo.png');
  await expect.poll(async () => (await animState(page)).selected).toBe('#img-team-logo');
  // Placing it marks the row (the selection reveal moved the dock to the Inspector).
  await page.getByTestId('dock-tab-assets').click();
  await expect(page.locator('[data-path="images/team-logo.png"] [data-testid="asset-used"]')).toBeVisible();

  // A second placement from the same file is a NEW element, not a duplicate asset.
  await dropOnCanvas(page, 'images/team-logo.png', 0.4, 0.6);
  await expect.poll(async () => (await animState(page)).html).toContain('img-team-logo-2');
  await page.getByTestId('dock-tab-assets').click();
  await expect(page.getByTestId('asset-row')).toHaveCount(1);
});
