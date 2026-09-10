import { expect, test, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { awaitPreviewRebuild } from './_preview';
import { finishIntoEditor, enableAdvancedMode, startNewProject } from './_create';
import { pickDesign } from './_browse';

async function pickFormat(
  page: Page,
  prefix: string,
  resolutionId: string,
  fps: number,
): Promise<void> {
  await page.getByTestId(`${prefix}-resolution`).selectOption(resolutionId);
  await page.getByTestId(`${prefix}-fps`).selectOption(String(fps));
}

async function templateFacts(page: Page) {
  return page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const template = useTemplateStore.getState().template;
    return {
      width: template.resolution.width,
      height: template.resolution.height,
      fps: template.fps,
      css: template.css,
    };
  });
}

test('templates author 720p25, 1080p50, and 4K60 from the shared picker', async ({ page }) => {
  const cases = [
    { id: 'landscape-720p', width: 1280, height: 720, fps: 25 },
    { id: 'landscape-1080p', width: 1920, height: 1080, fps: 50 },
    { id: 'landscape-2160p', width: 3840, height: 2160, fps: 60 },
  ];

  for (const [index, format] of cases.entries()) {
    if (index === 0) {
      await enableAdvancedMode(page);
  await page.goto('/app');
      await expect(page.getByTestId('creation-wizard')).toBeVisible();
    } else {
      await startNewProject(page);
    }
    await page.locator('[data-entry="template"]').click();
    await pickFormat(page, 'browse-format', format.id, format.fps);
    await pickDesign(page, 'Hairline');

    if (index === cases.length - 1) {
      for (let step = 0; step < 4; step++) {
        await page.getByRole('button', { name: 'Next →' }).click();
      }
      await expect(page.locator('.wz-finish-summary')).toContainText(
        `16:9 · ${format.width}×${format.height} · ${format.fps} fps`,
      );
      await awaitPreviewRebuild(page, () => page.getByTestId('wz-finish-editor').click());
    } else {
      await awaitPreviewRebuild(page, () =>
        finishIntoEditor(page),
      );
    }

    const facts = await templateFacts(page);
    expect(facts).toMatchObject({
      width: format.width,
      height: format.height,
      fps: format.fps,
    });
    expect(facts.css).toContain(`--scale: ${Number((format.width / 1920).toFixed(3))}`);
  }
});

test('aspect changes select a valid resolution and route switches preserve the choice', async ({ page }) => {
  await enableAdvancedMode(page);
  await page.goto('/app');
  await page.locator('[data-entry="template"]').click();
  await page.getByTestId('browse-format-aspect').selectOption('9:16');
  await expect(page.getByTestId('browse-format-resolution')).toHaveValue('vertical-1080p');
  await page.getByTestId('browse-format-aspect').selectOption('1:1');
  await expect(page.getByTestId('browse-format-resolution')).toHaveValue('square-1080p');

  await page.getByTestId('browse-format-aspect').selectOption('16:9');
  await pickFormat(page, 'browse-format', 'landscape-2160p', 60);
  await page.getByRole('button', { name: '← Back' }).click();
  await page.locator('[data-entry="ai"]').click();
  await expect(page.getByTestId('ai-format-resolution')).toHaveValue('landscape-2160p');
  await expect(page.getByTestId('ai-format-fps')).toHaveValue('60');
});

test('blank and imported artwork require an authored format before creation', async ({ page }) => {
  // Blank is an Advanced-mode door (step 4); the import half needs no toggle but shares the walk.
  await enableAdvancedMode(page);
  await enableAdvancedMode(page);
  await page.goto('/app');
  await page.locator('[data-entry="blank"]').click();
  await expect(page.getByTestId('blank-step')).toBeVisible();
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await pickFormat(page, 'blank-format', 'landscape-720p', 50);
  await expect(page.getByTestId('blank-format-resolution')).toHaveValue('landscape-720p');
  await expect(page.getByTestId('blank-format-fps')).toHaveValue('50');
  await awaitPreviewRebuild(page, async () => {
    await page.getByTestId('blank-create').click();
    await expect(page.getByTestId('creation-wizard')).toBeHidden({ timeout: 30_000 });
  });
  await expect(page.getByTestId('preview-project-format')).toHaveText('1280×720 · 50 fps');

  await startNewProject(page);
  await page.locator('[data-entry="import-graphic"]').click();
  await page.getByTestId('import-design-format-aspect').selectOption('1:1');
  await pickFormat(page, 'import-design-format', 'square-1080p', 60);
  // Use a valid 1×1 fully opaque black RGBA PNG so this test has decodable raster artwork.
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name: 'art.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGD4DwABBAEAgLvRWwAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  await expect(page.getByTestId('import-design-format-picker')).toHaveAttribute('disabled', '');
  await expect(page.getByTestId('import-design-format-resolution')).toBeDisabled();
  await expect(page.getByTestId('import-raster-warning')).toBeVisible();
  await expect(page.locator('.wz-preview-bar')).toContainText('Project 1080×1080 · 60 fps');
  await awaitPreviewRebuild(page, async () => {
    // Design mode keeps the footer's "Create project" - no skip-to-finish there.
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.getByTestId('creation-wizard')).toBeHidden({ timeout: 30_000 });
  });
  await expect(page.getByTestId('preview-project-format')).toHaveText('1080×1080 · 60 fps');
});

test('video AI uses the shared selected project format', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enableAdvancedMode(page);
  await page.goto('/app');
  await page.getByRole('button', { name: 'Video or animation with AI' }).click();
  await expect.poll(() => page.locator('.wz-step').evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.getByTestId('video-format-picker')).toBeInViewport();
  await expect(page.getByTestId('video-format-fps')).toHaveValue('30');
  await pickFormat(page, 'video-format', 'landscape-2160p', 60);
  await page.getByTestId('video-prompt').fill('A simple title animation');
  await page.getByTestId('video-create').click();
  await expect(page.getByTestId('video-shell')).toBeVisible();
  // Wait for the auto-first generation before reading the store. A wizard-created video project
  // fires one the moment the shell mounts, and it lands as its own snapshot - so reading "the
  // project" without waiting reads whichever side of that write the box happened to be on. The
  // assertion below used to be `authoredFor === null` ("no generation has run yet"), which is
  // not a fact about the format picker at all; it just happened to hold while the generation was
  // still in flight, and failed the moment it wasn't.
  await expect(page.locator('.ai-msg.assistant').first()).toBeVisible({ timeout: 30_000 });

  const project = await page.evaluate(async () => {
    const { useVideoProjectStore } = await import('/src/store/videoProjectStore.ts');
    const { settingsDrift } = await import('/src/model/videoTypes.ts');
    const value = useVideoProjectStore.getState().project;
    return {
      width: value.width,
      height: value.height,
      fps: value.fps,
      durationInFrames: value.durationInFrames,
      authoredFor: value.authoredFor,
      drift: settingsDrift(value),
    };
  });
  expect(project).toMatchObject({ width: 3840, height: 2160, fps: 60 });
  expect(project.durationInFrames / project.fps).toBe(6);
  // The point of the test, stated so it holds at any moment: the generation recorded what it
  // was written for, and that is what the picker chose - nothing for the drift warning to say.
  // Both halves matter: settingsDrift is empty for an unrecorded project too, so asserting it
  // alone would pass vacuously if the generation had failed validation instead of applying.
  expect(project.authoredFor).toMatchObject({ width: 3840, height: 2160, fps: 60 });
  expect(project.drift).toEqual([]);
});

const LITE_STATUS = {
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

const LITE_READY = {
  generationId: '22222222-2222-4222-8222-222222222222',
  decision: {
    status: 'ready',
    aiCategory: 'lower-third',
    spec: {
      fit: 'catalog',
      reason: 'The catalog carries this lower third.',
      name: 'Format Test',
      summary: 'A clean authored-format test.',
      category: 'lower-third',
      variantId: 'lt01',
      lines: [
        { title: 'Name', sample: 'Ada', role: 'person-name' },
        { title: 'Role', sample: 'Presenter', role: 'person-role' },
      ],
      paletteId: 'noacg',
      density: 'standard',
      alignment: 'left',
      typography: { headingWeight: 'bold', tracking: 'normal' },
      shape: { corner: 'square', accentForm: 'line', panel: 'solid' },
      animation: { presetId: 'slide-up', speed: 1 },
      flourish: '',
    },
  },
  usage: { inputTokens: 100, outputTokens: 100, totalTokens: 200 },
  attemptCount: 1,
  repairCount: 0,
  expiresAt: '2099-01-01T00:00:00.000Z',
};

test('Create with AI receives and produces the selected 4K60 format', async ({ page }) => {
  // This spec tests format plumbing. Create with AI begins directly under the public
  // Terms and Privacy contract, so no first-use acknowledgement is seeded here.
  let requestFormat: unknown = null;
  await page.route('/api/ai/lite/status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LITE_STATUS) }),
  );
  await page.route('/api/ai/lite/generations', async (route: Route) => {
    const body = route.request().postDataJSON() as { resolution: unknown; fps: number };
    requestFormat = { resolution: body.resolution, fps: body.fps };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LITE_READY) });
  });
  await page.route('/api/ai/lite/outcome', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"recorded":true}' }),
  );

  await enableAdvancedMode(page);
  await page.goto('/app');
  await page.locator('[data-entry="ai"]').click();
  await expect(page.getByRole('heading', { name: /Create with AI/ })).toBeVisible();
  await pickFormat(page, 'ai-format', 'landscape-2160p', 60);
  await page.locator('.wz-step textarea').fill('A clean lower third for a presenter.');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('.wz-step .status-ok')).toContainText('Passes validation', {
    timeout: 25_000,
  });
  expect(requestFormat).toEqual({ resolution: { width: 3840, height: 2160 }, fps: 60 });

  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.locator('.wz-finish-summary')).toContainText('3840×2160 · 60 fps');
  await awaitPreviewRebuild(page, () => page.getByTestId('wz-finish-editor').click());
  await expect.poll(() => templateFacts(page)).toMatchObject({ width: 3840, height: 2160, fps: 60 });
});

test('save, reopen, and package exports preserve authored dimensions and timing', async ({ page }) => {
  await enableAdvancedMode(page);
  await page.goto('/app');
  const facts = await page.evaluate(async () => {
    const { createBlankTemplate } = await import('/src/templates/blank.ts');
    const { projectFormatById } = await import('/src/model/projectFormat.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { saveGraphicAs, openGraphicDoc } = await import('/src/store/saveActions.ts');
    const { loadGraphics } = await import('/src/model/library.ts');
    const { EXPORT_TARGETS } = await import('/src/export/registry.ts');

    const resolution = projectFormatById('landscape-2160p')!;
    const authored = createBlankTemplate(resolution, 60);
    useTemplateStore.getState().applyTemplate(authored, { resetSampleData: true });
    saveGraphicAs('4K Format Test', { kind: 'standalone' });
    const saved = loadGraphics()[0];
    useTemplateStore.getState().applyTemplate(createBlankTemplate(), { resetSampleData: true });
    openGraphicDoc(saved);
    const reopened = useTemplateStore.getState().template;

    const output: Record<string, string> = {};
    for (const id of ['spx', 'html-overlay', 'casparcg', 'ograf']) {
      const target = EXPORT_TARGETS.find((candidate) => candidate.id === id)!;
      const zip = await target.build(reopened, { sampleData: {} });
      const path = Object.keys(zip.files).find((name) =>
        id === 'ograf' ? name.endsWith('graphic.mjs') : name.endsWith('.html') && !name.endsWith('controlpanel.html'),
      )!;
      output[id] = await zip.file(path)!.async('string');
    }
    return {
      reopened: {
        width: reopened.resolution.width,
        height: reopened.resolution.height,
        fps: reopened.fps,
      },
      output,
    };
  });

  expect(facts.reopened).toEqual({ width: 3840, height: 2160, fps: 60 });
  for (const id of ['spx', 'html-overlay', 'casparcg']) {
    expect(facts.output[id]).toContain(
      'name="noacg-project-format" content="width=3840;height=2160;fps=60"',
    );
  }
  expect(facts.output.ograf).toContain('Authored project format: 3840×2160 at 60 fps');
});

test('render output settings are explicit scaling from the authored canvas', async ({ page }) => {
  // Drives the editor's Export dock directly, so it needs the Advanced ('' = editor) boot.
  await enableAdvancedMode(page);
  await enableAdvancedMode(page);
  await page.goto('/app');
  await page.evaluate(async () => {
    const { createBlankTemplate } = await import('/src/templates/blank.ts');
    const { projectFormatById } = await import('/src/model/projectFormat.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const template = createBlankTemplate(projectFormatById('landscape-2160p')!, 60);
    useTemplateStore.getState().applyTemplate(template, { resetSampleData: true });
    useTemplateStore.getState().closeGallery();
  });
  await page.getByTestId('dock-tab-export').click();
  await expect(page.getByTestId('render-project-format')).toContainText(
    'Project format (authored): 16:9 · 3840×2160 · 60 fps',
  );
  await expect(page.getByText('Output settings', { exact: true })).toBeVisible();
  await expect(page.getByText('Output resolution', { exact: true })).toBeVisible();
  await page.getByText('Output resolution', { exact: true }).locator('..').getByRole('combobox').selectOption('0.5');
  await expect(page.getByTestId('render-scale-explanation')).toContainText(
    '1920×1080 is scaled from the authored 3840×2160 canvas',
  );
  await expect(page.getByTestId('render-scale-explanation')).toContainText('not reflowed, stretched, or cropped');
});

test('animation seconds remain equal at 25, 50, and 60 fps', async ({ page }) => {
  await enableAdvancedMode(page);
  await page.goto('/app');
  const durations = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { projectFormatById } = await import('/src/model/projectFormat.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const variant = variantById('lt01')!;
    const resolution = projectFormatById('landscape-1080p')!;
    const output: Array<{ fps: number; enter: number; exit: number }> = [];
    for (const fps of [25, 50, 60]) {
      const template = variant.create({ resolution, fps });
      const frame = document.createElement('iframe');
      frame.style.display = 'none';
      document.body.appendChild(frame);
      await new Promise<void>((resolve) => {
        frame.onload = () => resolve();
        frame.srcdoc = composeDocument(template);
      });
      const runtime = frame.contentWindow as Window & {
        buildInTimeline: () => { duration: () => number };
        buildOutTimeline: () => { duration: () => number };
      };
      output.push({
        fps,
        enter: runtime.buildInTimeline().duration(),
        exit: runtime.buildOutTimeline().duration(),
      });
      frame.remove();
    }
    return output;
  });

  expect(durations.map(({ enter }) => enter)).toEqual([durations[0].enter, durations[0].enter, durations[0].enter]);
  expect(durations.map(({ exit }) => exit)).toEqual([durations[0].exit, durations[0].exit, durations[0].exit]);
});

test('native 4K capture is not downsampled and a deliberate 1px hairline stays one CSS pixel', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 3840, height: 2160 });
  await enableAdvancedMode(page);
  await page.goto('/app');
  const measurements = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { projectFormatById } = await import('/src/model/projectFormat.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const variant = variantById('lt01')!;

    const mount = async (id: string, resolutionId: string) => {
      const resolution = projectFormatById(resolutionId)!;
      const base = variant.create({ resolution, fps: 60 });
      const template = {
        ...base,
        html: base.html.replace('</body>', '<div id="native-hairline"></div></body>'),
        css: `${base.css}\nbody { background: #101216; }\n#native-hairline { position: absolute; left: 0; top: 50%; width: 100%; height: 1px; background: #ffb347; }`,
      };
      const frame = document.createElement('iframe');
      frame.id = id;
      frame.style.cssText = `position:fixed;inset:0;width:${resolution.width}px;height:${resolution.height}px;border:0;z-index:99999`;
      document.body.appendChild(frame);
      await new Promise<void>((resolve) => {
        frame.onload = () => resolve();
        frame.srcdoc = composeDocument(template);
      });
      const line = frame.contentDocument!.getElementById('native-hairline')!.getBoundingClientRect();
      return { width: resolution.width, height: resolution.height, lineHeight: line.height };
    };

    const hd = await mount('native-hd', 'landscape-1080p');
    document.getElementById('native-hd')!.remove();
    const uhd = await mount('native-4k', 'landscape-2160p');
    return { hd, uhd };
  });
  expect(measurements.hd.lineHeight).toBe(1);
  expect(measurements.uhd.lineHeight).toBe(1);

  const path = testInfo.outputPath('native-4k.png');
  await page.locator('#native-4k').screenshot({ path });
  const png = readFileSync(path);
  expect(png.readUInt32BE(16)).toBe(3840);
  expect(png.readUInt32BE(20)).toBe(2160);
  await testInfo.attach('native-4k', { path, contentType: 'image/png' });
});
