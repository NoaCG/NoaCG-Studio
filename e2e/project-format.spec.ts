import { expect, test, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { awaitPreviewRebuild } from './_preview';
import { createProject, finishIntoEditor, enableAdvancedMode, startNewProject } from './_create';
import { pickDesign } from './_browse';
import { settleDurableWrites } from './_durable';

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

test('NoaCG Lite receives and produces the selected 4K60 format', async ({ page }) => {
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
  await expect(page.getByRole('heading', { name: 'NoaCG Lite' })).toBeVisible();
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

// ── A format the catalogue does NOT offer ────────────────────────────────────────────────────
//
// Everything above pins what happens when a project format is CHOSEN. These two pin what happens
// when one arrives that nobody could have chosen: the owner screenshotted a graphic at 1920x1880
// on 2026-08-29 (docs/backlog/editor-canvas-1920x1880.md) and the number reached the header, the
// canvas chip and a saved record without one word of complaint, because `validateProjectFormat`
// had no callers anywhere in src/.
//
// Nothing refuses. Refusing to open would lose the reader's work and refusing to save would
// strand it; an unknown format is a document nobody has measured, not a broken one. So the two
// halves are a MARK on the live format label (components/ProjectFormatMeta.tsx, one derived call
// that covers every load door at once) and a WORD on the save status (store/saveActions.ts).
// Remove either call and one of these two tests goes red - that is what they are for.

/** Put the unsupported resolution on the AUTOSAVE SLOT, so the boot restore is what carries it -
 *  the same road as the owner's screenshot, which showed a document already `Saved` and `Synced`.
 *
 *  It applies the template to the STORE before writing the slot, and that ordering is the whole
 *  reason this is a helper. The 800 ms autosave timer armed by whatever created the project is
 *  still pending: writing the slot behind the store's back leaves that timer to fire afterwards
 *  with the template the store actually holds, putting 1920x1080 back. The reload would then read
 *  a supported format and the assertion would fail as if the feature were broken. */
async function seedUnsupportedFormat(page: Page): Promise<void> {
  await page.evaluate(`(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { saveProject } = await import('/src/model/project.ts');
    const s = useTemplateStore.getState();
    const template = { ...s.template, resolution: { width: 1920, height: 1880, label: '1920×1880' } };
    s.applyTemplate(template);
    saveProject(template, s.baseline, { graphicId: s.saved.graphicId, dirty: false }, s.aiSpec, s.aiThread, s.legibility);
  })()`);
  await settleDurableWrites(page);
  await page.reload();
}

test('a restored graphic whose format the catalogue does not offer is marked, not refused', async ({ page }) => {
  await createProject(page, 'Hairline');
  await seedUnsupportedFormat(page);

  // It still opened. The chip prints the number it really carries, now with the warning glyph.
  await expect(page.getByTestId('preview-project-format')).toHaveText('⚠ 1920×1880 · 25 fps');
  await expect(page.getByTestId('preview-project-format')).toHaveAttribute(
    'title',
    /^Unsupported project resolution 1920×1880\./,
  );
  await expect(page.getByTestId('topbar-project-format')).toHaveAttribute('data-format-unsupported', 'true');

  // THE TOPBAR IS WIDTH-BANDED, and both sides of that are asserted because the temptation is to
  // make a warning immune to the bar's width ladder - which is how the account avatar ends up off
  // the right edge on the commonest laptop there is. The suite runs at 1280
  // (devices['Desktop Chrome']), under the 1400px rule that drops the format line: it stays
  // dropped, warning or not. Above the breakpoint the warning is worn in the header too.
  // VISIBILITY, never text: `toHaveText` passes on a hidden span.
  await expect(page.getByTestId('topbar-project-format')).toBeHidden();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId('topbar-project-format')).toBeVisible();
  await expect(page.getByTestId('topbar-project-format')).toHaveText('⚠ 1920×1880 · 25 fps');
  await page.setViewportSize({ width: 1280, height: 720 });

  // And the mark is CONDITIONAL. An ordinary catalogue format carries neither glyph nor flag.
  await createProject(page, 'Hairline');
  await expect(page.getByTestId('preview-project-format')).toHaveText('1920×1080 · 25 fps');
  await expect(page.getByTestId('preview-project-format')).not.toHaveAttribute('data-format-unsupported', 'true');
  await expect(page.getByTestId('topbar-project-format')).not.toHaveAttribute('data-format-unsupported', 'true');
});

/** The topbar's own overflow test, the same arithmetic as `configured/signed-in-ux.spec.ts`:
 *  how far past the bar's right edge its widest child reaches. Positive is an overflow, which is
 *  the account avatar hanging off the screen. */
async function topbarOverflowPx(page: Page): Promise<number> {
  return page.locator('.topbar').evaluate((bar) => {
    const boxes = [...bar.children].map((c) => c.getBoundingClientRect()).filter((r) => r.width > 0);
    return Math.round(Math.max(...boxes.map((r) => r.right)) - bar.getBoundingClientRect().right);
  });
}

test('a save carrying an unsupported format lands and says so instead of "Saved"', async ({ page }) => {
  await createProject(page, 'Hairline');

  // First save = saveGraphicAs. A catalogue format must not warn.
  await page.getByTestId('save-graphic').click();
  await expect(page.getByTestId('save-dialog')).toBeVisible();
  await page.getByTestId('save-name').fill('Format guard');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await expect(page.getByTestId('save-status')).not.toHaveAttribute('data-format-unsupported', 'true');

  // Now make the OPEN document carry it. `applyTemplate` with no opts keeps the save link
  // (store/templateStore.ts only resets `saved` when resetSampleData is set), so the next press
  // is saveCurrentGraphic rather than a second Save As.
  await page.evaluate(`(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const s = useTemplateStore.getState();
    s.applyTemplate({ ...s.template, resolution: { width: 1920, height: 1880, label: '1920×1880' } });
  })()`);
  await expect(page.getByTestId('save-status')).toHaveText('Unsaved changes');

  await page.getByTestId('save-graphic').click();
  // The save WORD is banded too, and unlike the header's line it survives the narrow bar: at 1280
  // the amber ⚠ carries it alone (the reason costs ~150px, the glyph ~15), and the full sentence
  // is on the title at every width. Assert the flag and the title here, then widen for the words.
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-format-unsupported', 'true');
  await expect(page.getByTestId('save-status')).toHaveAttribute(
    'title',
    /^Unsupported project resolution 1920×1880\./,
  );
  // useInnerText, because the reason is dropped with `display: none` and the default textContent
  // read would report it at every width - the assertion would pass on a bar that overflows.
  await expect(page.getByTestId('save-status')).toHaveText('Saved', { useInnerText: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId('save-status')).toHaveText('Saved · unsupported format', { useInnerText: true });
  await page.setViewportSize({ width: 1280, height: 720 });

  // A copy carries the same warning: saveGraphicAs is the OTHER save door and calls the
  // validator on its own. Without this the Save-As call would be unpinned - the first save
  // above ran it too, but on a format the catalogue offers, where a missing call reads as a pass.
  await page.getByTestId('save-menu').click();
  await page.getByTestId('save-as').click();
  await expect(page.getByTestId('save-dialog')).toBeVisible();
  await page.getByTestId('save-name').fill('Format guard copy');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-format-unsupported', 'true');

  // AND THE BAR STILL FITS in the warned state, which is the thing this whole banding is for.
  // `configured/signed-in-ux.spec.ts` walks the same ladder with the account cluster in the bar
  // and can only run with credentials; this is the signed-out half, in the one state that spec
  // never reaches. 1366 is the commonest laptop and the width app-shell.css was measured at.
  for (const width of [1440, 1366, 1280, 1100]) {
    await page.setViewportSize({ width, height: width >= 1400 ? 900 : 768 });
    expect(await topbarOverflowPx(page), `topbar overflow at ${width}px with an unsupported format`)
      .toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1280, height: 720 });

  // Both records LANDED - the saves were announced, never refused.
  await settleDurableWrites(page);
  const stored = await page.evaluate(`(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    const size = (name) => {
      const doc = loadGraphics().find((g) => g.name === name);
      return doc ? doc.template.resolution.width + 'x' + doc.template.resolution.height : null;
    };
    return { original: size('Format guard'), copy: size('Format guard copy') };
  })()`);
  expect(stored).toEqual({ original: '1920x1880', copy: '1920x1880' });
});
