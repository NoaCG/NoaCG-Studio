// Shared harness for video-editor specs that need the real model-backed provider path (the
// offline stub can't express "the model emitted X"). The normalized gateway is mocked at the
// network level, so everything downstream - the staged harness, the forced tools, validation,
// the repair loop, the apply - runs exactly as in production, on emits we choose.

import { expect, type Page, type Route } from '@playwright/test';
import { acceptAiNotice } from './_ai-notice';
import { settleDurableWrites } from './_durable';

/** The player host iframe's content (Playwright reaches into sandboxed frames). */
export function player(page: Page) {
  return page.frameLocator('.video-player-frame');
}

const PLAYER_FRAME = '.video-player-frame';

// A composition load is the debounce (350 ms, VideoPlayerFrame's RELOAD_DEBOUNCE_MS) plus
// whatever the engine needs: for Remotion a compile, a transfer and a mount in the sandboxed
// host; for HyperFrames the seven bundled faces fetched and base64'd, a composed srcdoc of a
// few megabytes, and the driver's own boot (capped at its BOOT_TIMEOUT_MS of 10 s). It also
// QUEUES behind the AI validator, which owns the same bridge chain. Normally a second or two,
// but every step of that is someone else's clock under four parallel workers - so the budget
// is sized to bound the pipeline, not to guess at it. A load that never lands still fails.
const SETTLED = { timeout: 30_000 };

/**
 * Wait until the video preview has SETTLED - no load owed, and a composition mounted.
 *
 * This is the deterministic replacement for asserting straight into the player iframe and
 * hoping. It matters more here than on the SPX side, because a load in this shell RESTARTS
 * PLAYBACK (VideoPlayerFrame loads with `autoplay: true`): a transport or stage reading taken
 * while a load is owed is not merely early, it is about to be undone. That is the race
 * `scrubbing seeks the composition deterministically` lost - it read the transport as paused,
 * correctly, and the queued reload autoplayed before the next assertion, so the spec waited
 * out its budget on a Play button the player was never going to show again.
 *
 * Call it after anything that triggers a reload: a generation landing, a `setSource`, an image
 * input changing, a `page.reload()`. Live scalar field edits (set-props / set-vars) do NOT
 * reload, so they need nothing.
 */
export async function awaitVideoPreview(page: Page): Promise<void> {
  const frame = page.locator(PLAYER_FRAME);
  // The PENDING half first: it is set synchronously when a load becomes owed, so waiting for
  // it to clear is correct whether the load is still debouncing, in flight, or already done.
  await expect(frame).not.toHaveAttribute('data-player-pending', '1', SETTLED);
  await expect(frame).toHaveAttribute('data-player-rev', /\d/, SETTLED);
}

/**
 * Reload the page and come back to the video shell.
 *
 * Two things a bare `page.reload()` gets wrong here. The working project lives in the durable
 * store, which accepts a write and lands it a moment later (e2e/_durable.ts), and the boot
 * decides between the video and SPX shells by READING that slot (model/docKind.ts) - so a
 * reload fired inside that window can abort the write it is about to look for, and the app
 * boots into SPX with no `video-shell` at all. And hydration is the one asynchronous boot step,
 * capped at 4 s before it degrades (model/durableStore.ts), which the suite's default 7 s
 * expect budget barely covers on a loaded box.
 */
export async function reloadVideoShell(page: Page): Promise<void> {
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('video-shell')).toBeVisible(SETTLED);
}

export interface EmittedModule {
  summary: string;
  tsx: string;
  inputs: { key: string; type: string; label: string; default: string | number }[];
}

const MOTION_PLAN = {
  concept: 'A headline holds centre.',
  visualDirection: 'Dark stage, centred type.',
  typography: 'One bold sans headline.',
  background: 'Near-black.',
  easingApproach: 'Clamped interpolate.',
  assetUsage: 'none',
  phases: [{ name: 'Hold', startSec: 0, endSec: 5, description: 'The headline holds centre.' }],
};

function toolResponse(_name: string, input: unknown) {
  return {
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      output: input,
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      attempts: [{ route: { provider: 'anthropic', model: 'claude-sonnet-5' }, attempts: 1 }],
    }),
  };
}

/**
 * Answer every model call by its structured-output name. `modules` are handed out in order to successive
 * emit_remotion_module calls (the first is the generation, the next are refinements); the last
 * one repeats once the list runs out.
 *
 * `delayMs` holds each emit back before answering. Set it whenever the test depends on the
 * LIVE PROBE half of validation: a real generation takes seconds, by which time the preview
 * has mounted and registered its bridge, but an instantly-answered mock beats the player to
 * the screen and validation falls back to the static checks alone.
 */
export async function mockClaude(
  page: Page,
  modules: EmittedModule[],
  { delayMs = 0 }: { delayMs?: number } = {},
): Promise<{ emits: () => number; surfaces: () => (string | undefined)[] }> {
  let emits = 0;
  const surfaces: (string | undefined)[] = [];
  await page.route('/api/ai/generate', async (route: Route) => {
    const body = route.request().postDataJSON() as {
      surface?: string;
      request?: { structuredOutput?: { name?: string } };
    };
    const tool = body.request?.structuredOutput?.name ?? '';
    surfaces.push(body.surface);
    // Asserted HERE, in the shared mock, rather than in one spec: every video model call must
    // carry the surface tag api/ai/generate.ts gates ai.video on (docs/ADMIN.md), and a call
    // site that forgot it still works - it just stops being gateable, silently. Checking the
    // wire in the one place all video traffic passes through means any spec that drives a new
    // video call enforces the tag for free. Named explicitly in video-surface-tag.spec.ts.
    expect(
      body.surface,
      `a video model call (${tool || 'coder'}) reached the gateway WITHOUT surface: 'video' - ` +
        'it bypassed src/ai/video/videoGateway.ts and would escape the ai.video entitlement',
    ).toBe('video');
    if (tool === 'emit_motion_plan') return route.fulfill(toolResponse(tool, MOTION_PLAN));
    if (tool === 'detect_skills') return route.fulfill(toolResponse(tool, { skills: [] }));
    const module = modules[Math.min(emits, modules.length - 1)];
    emits += 1;
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
    return route.fulfill(toolResponse('emit_remotion_module', module));
  });
  return { emits: () => emits, surfaces: () => [...surfaces] };
}

/**
 * Fail loudly when the dev server carries a REAL AI key.
 *
 * The suite pins offline mode through `webServer.env`, but `reuseExistingServer` means a
 * server already running on this checkout's port is reused with whatever `.env` it started
 * from. Since the video bench wants a real key in `.env` (scripts/video-bench.mjs), a
 * hand-started server makes the stub-provider specs drive the REAL provider: they fail as a
 * baffling "no assistant turn in 10s", and - the part that actually matters - each one fires
 * a live generation and SPENDS MONEY. Observed six specs doing exactly that. Assert the
 * transport before touching the wizard, so the failure names its own cause on the first line
 * and no generation is ever started.
 *
 * Specs that mock the gateway (mockClaude + useFakeAiKey) seed non-secret availability
 * into localStorage and are unaffected; this guard is for the stub-provider specs.
 */
export async function expectOfflineAi(page: Page): Promise<void> {
  const configured = await page.evaluate(async () => {
    const { aiConfigured } = await import('/src/ai/settings.ts');
    return aiConfigured();
  });
  expect(
    configured,
    'this spec needs the OFFLINE stub provider, but the dev server resolves AI as configured - ' +
      "a hand-started server on this checkout's port is being reused with a real key in .env. " +
      'Stop it and let the suite start its own ' +
      '(see e2e/AGENTS.md "Gotchas when writing a spec").',
  ).toBe(false);
}

/** Non-secret configured status, so the real provider runs and the route above answers it. */
export async function useFakeAiKey(page: Page): Promise<void> {
  await page.addInitScript(() =>
    localStorage.setItem('spx-gfx-ai', JSON.stringify({ provider: 'anthropic', configuredProviders: ['anthropic'], model: 'claude-sonnet-5' })),
  );
  // A configured provider makes the remote path live, so the disclosure gate would open
  // before the first generation - these specs test generation, not the notice.
  await acceptAiNotice(page);
}

/**
 * Create a HYPERFRAMES project from the wizard (the stinger example -> the HF stinger sample)
 * and wait for the shell. Shared, because both the engine-flow specs and the readability specs
 * need a live HyperFrames preview mounted before they can assert anything about it.
 */
export async function createHyperframesProject(page: Page, useExample = true): Promise<void> {
  await page.goto('/app');
  // These specs run on the offline stub; a reused server with a real key would drive the
  // real provider and spend money. Say so before doing anything else.
  await expectOfflineAi(page);
  await page.getByRole('button', { name: 'Video or animation with AI' }).click();
  await expect(page.getByTestId('video-step')).toBeVisible();
  // The engine selector: Remotion is preselected; HyperFrames is the experimental card.
  await expect(page.getByTestId('video-engine-remotion')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('video-engine-hyperframes').click();
  await expect(page.getByTestId('video-engine-hyperframes')).toHaveAttribute('aria-checked', 'true');
  if (useExample) {
    await page.getByRole('button', { name: 'Sports stinger', exact: true }).click();
  } else {
    await page.getByTestId('video-prompt').fill('a nice clean opener for my channel');
  }
  await page.getByTestId('video-create').click();
  await expect(page.getByTestId('video-shell')).toBeVisible();
}

/** Create a video project through the wizard and wait for its first generation to land. */
export async function createVideoProject(page: Page): Promise<void> {
  await page.goto('/app');
  await page.getByRole('button', { name: 'Video or animation with AI' }).click();
  await page.getByRole('button', { name: 'Countdown', exact: true }).click();
  await page.getByTestId('video-create').click();
  await expect(page.getByTestId('video-shell')).toBeVisible();
  // 30 s: a first generation runs the harness plus an untimed live probe against the player
  // host. Same budget and same reasoning as the specs' own waitForGeneration helpers.
  await expect(page.locator('.ai-msg.assistant').first()).toBeVisible({ timeout: 30_000 });
}
