// covers: src/ai/video/**, src/video/**, src/components/video/**, api/{ai/**,_lib/ai*{,/**}}
//
// The shared provider/model/key surface. The tier door is where its WORDING is pinned - the
// one defect class (a mislabelled tier, a transport offered as a choice) that builds green.
// covers: src/components/AiProviderSettings.tsx
//
// Settings vs the code the AI wrote.
//
// A project's settings drive the player and the renderer the moment they change - but not the
// composition's CODE, which the AI wrote against whatever they were at the time. Shorten a 6 s
// piece to 2 s and its exit is simply cut off; tick "transparent" and a background the AI
// painted is still there, so the alpha render comes out opaque. The editor has to SAY so, and
// offer to fix it, rather than quietly rendering something nobody asked for.
//
// The Export-tab case asserts UI inside VideoRenderPanel, which mounts only when
// isRenderConfigured() - the offline suite runs with VITE_RENDER_API=1 (playwright.config.ts
// webServer env). A hand-started server on this checkout's port gets REUSED without that pin
// (and _offline-guard.ts only catches pins meant to be EMPTY), so the case then fails as if
// the drift warning broke. Kill any manual server on this port first.

import { test, expect } from '@playwright/test';
import { createVideoProject, mockClaude, useFakeAiKey, type EmittedModule } from './_video';

function moduleFor(headline: string): EmittedModule {
  return {
    summary: `A headline: ${headline}.`,
    tsx: `import { AbsoluteFill, useCurrentFrame } from 'remotion';

export default function Composition({ fields = {} }: { fields?: Record<string, string | number> }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: '#0b0d10', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: '#fff', fontSize: 72, opacity: frame >= 0 ? 1 : 0 }}>
        {fields.headline ?? '${headline}'}
      </div>
    </AbsoluteFill>
  );
}
`,
    inputs: [{ key: 'headline', type: 'text', label: 'Headline', default: headline }],
  };
}

test.beforeEach(async ({ page }) => {
  await useFakeAiKey(page);
});

test('changing the duration warns that the code no longer matches, and the AI can fix it', async ({ page }) => {
  const { emits } = await mockClaude(page, [moduleFor('First Cut'), moduleFor('Retimed')]);
  await createVideoProject(page);

  // Freshly generated: the code was written for exactly these settings, so nothing to say.
  await page.getByTestId('video-tab-settings').click();
  await expect(page.getByTestId('video-settings-drift')).toHaveCount(0);

  // Halve the duration. The player and the render will honour it; the motion won't.
  await page.getByTestId('video-duration').fill('2');
  await page.getByTestId('video-duration').blur();

  const drift = page.getByTestId('video-settings-drift');
  await expect(drift).toBeVisible();
  await expect(drift).toContainText('written to fill 5.00 s');
  await expect(drift).toContainText('now 2.00 s');

  // The render preflight repeats it where it costs real time.
  await page.getByTestId('video-tab-export').click();
  await expect(page.getByTestId('video-render-drift')).toBeVisible();

  // One click hands the job to the AI - down the normal chat path, so it lands as a turn in
  // the conversation and is undoable like any other edit.
  await page.getByTestId('video-tab-settings').click();
  await page.getByTestId('video-drift-fix').click();
  await expect(page.getByTestId('video-chat')).toBeVisible(); // it reveals the chat
  await expect(page.locator('.ai-msg.assistant').nth(1)).toBeVisible({ timeout: 20_000 });
  expect(emits()).toBe(2); // the generation, then the retime

  // The new code was written for the NEW settings, so the warning is gone - everywhere.
  await page.getByTestId('video-tab-settings').click();
  await expect(page.getByTestId('video-settings-drift')).toHaveCount(0);
  await page.getByTestId('video-tab-export').click();
  await expect(page.getByTestId('video-render-drift')).toHaveCount(0);
});

test('turning on transparency warns that the code still paints a background', async ({ page }) => {
  await mockClaude(page, [moduleFor('Opaque')]);
  await createVideoProject(page);

  await page.getByTestId('video-tab-settings').click();
  await page.getByRole('checkbox').check();

  const drift = page.getByTestId('video-settings-drift');
  await expect(drift).toBeVisible();
  await expect(drift).toContainText('paint its own background');
  await expect(drift).toContainText('renders with alpha');
});

test('a project of unknown provenance warns about nothing', async ({ page }) => {
  // When we don't know what the code was written for - the starter composition, which derives
  // everything from useVideoConfig and fits any settings, or a project stored before we began
  // recording it - the honest answer is silence. Guessing would nag about settings nobody
  // touched. (normalizeVideoProject lands exactly this state on an older saved project.)
  await mockClaude(page, [moduleFor('Unknown')]);
  await createVideoProject(page);
  await page.evaluate(async () => {
    const { useVideoProjectStore } = await import('/src/store/videoProjectStore.ts');
    const store = useVideoProjectStore.getState();
    store.loadProject({ ...store.project, authoredFor: null });
  });

  await page.getByTestId('video-tab-settings').click();
  await page.getByTestId('video-duration').fill('2');
  await page.getByTestId('video-duration').blur();
  await expect(page.getByTestId('video-settings-drift')).toHaveCount(0);
});

test('offers live gateway models that satisfy the full video contract', async ({ page }) => {
  await mockClaude(page, [moduleFor('Catalog')]);
  await createVideoProject(page);
  await page.route('**/api/ai/models?provider=vercel', async (route) => {
    await route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        provider: 'vercel',
        syncedAt: '2026-07-28T00:00:00.000Z',
        models: [
          {
            provider: 'vercel',
            id: 'vendor/video-coder',
            name: 'Video Coder',
            description: 'A model suitable for complete compositions.',
            contextLength: 131072,
            maxOutputTokens: 32768,
            inputPerMillion: 0.2,
            outputPerMillion: 0.8,
            inputModalities: ['text', 'image'],
            supportsStructuredOutput: true,
            supportsTools: true,
            supportsSeed: true,
            free: false,
            openWeight: true,
            available: true,
            createdAt: '2026-07-01T00:00:00.000Z',
            revision: 'vendor/video-coder-20260701',
            source: 'vercel-ai-gateway',
          },
          {
            provider: 'vercel',
            id: 'vendor/tiny-context',
            name: 'Tiny Context',
            description: '',
            contextLength: 8192,
            maxOutputTokens: 4096,
            inputPerMillion: 0,
            outputPerMillion: 0,
            inputModalities: ['text'],
            supportsStructuredOutput: true,
            supportsTools: true,
            supportsSeed: false,
            free: true,
            openWeight: true,
            available: true,
            createdAt: null,
            revision: null,
            source: 'vercel-ai-gateway',
          },
        ],
      }),
    });
  });
  await page.evaluate(async () => {
    const { saveAiSettings } = await import('/src/ai/settings.ts');
    saveAiSettings({
      provider: 'vercel',
      model: 'vendor/video-coder',
      configuredProviders: ['vercel'],
    });
  });

  await page.getByTestId('video-tab-settings').click();
  const model = page.locator('input[list="video-ai-models"]');
  await expect(page.locator('datalist#video-ai-models option[value="vendor/video-coder"]')).toHaveCount(1);
  await expect(page.locator('datalist#video-ai-models option[value="vendor/tiny-context"]')).toHaveCount(0);
  await model.fill('vendor/video-coder');
  await expect(model).toHaveValue('vendor/video-coder');
  await expect(page.getByText(/structured output, at least 32K context/)).toBeVisible();
});
