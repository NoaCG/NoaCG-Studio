// Pins the render schedule + limits math (src/render/schedule.ts, limits.ts) — the pure
// contract both the Export UI and the render worker compute from. Logic-only: modules are
// imported in-page (Vite serves source), no UI is driven.

import { test, expect } from '@playwright/test';

const MEASURED = {
  inMs: 1000,
  stepMs: [500, 500],
  outMs: 600,
  continuous: { in: false, out: false },
  hasBuilders: true,
  runtimeVersion: 1,
};
const TIMING = { totalDurationMs: 10_000, outMode: 'auto', minHoldMs: 500, epochMs: 0 };

test('computeSchedule: equal hold split, frame-snapped cues, hard error when too short', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(
    async ({ MEASURED, TIMING }) => {
      const { computeSchedule, defaultStillTimeMs } = await import('/src/render/schedule.ts');
      return {
        ok: computeSchedule(MEASURED, TIMING, 50, '{"f0":"x"}'),
        tooShort: computeSchedule(MEASURED, { ...TIMING, totalDurationMs: 2000 }, 50, '{}'),
        exactFit: computeSchedule(MEASURED, { ...TIMING, totalDurationMs: 2600 }, 50, '{}'),
        noneMode: computeSchedule(MEASURED, { ...TIMING, outMode: 'none' }, 50, '{}'),
        continuousIn: computeSchedule(
          { ...MEASURED, stepMs: [], inMs: 0, continuous: { in: true, out: false } },
          TIMING, 50, '{}',
        ),
        noBuildersAuto: computeSchedule({ ...MEASURED, hasBuilders: false }, TIMING, 50, '{}'),
        noBuildersNone: computeSchedule({ ...MEASURED, hasBuilders: false }, { ...TIMING, outMode: 'none' }, 50, '{}'),
        still: defaultStillTimeMs(MEASURED, TIMING),
      };
    },
    { MEASURED, TIMING },
  );

  // fixed = 1000 + 500 + 500 + 600 = 2600; 3 hold slots → hold = 7400/3 ≈ 2466.67 ms
  const cues = r.ok.schedule.cues;
  expect(cues.map((c: { action: string }) => c.action)).toEqual(['update', 'play', 'next', 'next', 'stop']);
  expect(cues[0].payload).toBe('{"f0":"x"}');
  // Cues snap to the 20 ms (50 fps) grid: 3466.67 → 3460, 6433.33 → 6440, stop exact at 9400.
  expect(cues[2].atMs).toBe(3460);
  expect(cues[3].atMs).toBe(6440);
  expect(cues[4].atMs).toBe(9400);
  expect(r.ok.issues).toEqual([]);

  // Too short is a hard error naming the measured need; exact fit renders with zero hold.
  expect(r.tooShort.schedule).toBeNull();
  expect(r.tooShort.issues[0].code).toBe('too-short');
  expect(r.tooShort.issues[0].message).toContain('2.6 s');
  expect(r.exactFit.schedule).not.toBeNull();

  // outMode none: no stop cue, the final hold runs to the end.
  const noneCues = r.noneMode.schedule.cues.map((c: { action: string }) => c.action);
  expect(noneCues).toEqual(['update', 'play', 'next', 'next']);
  const lastSeg = r.noneMode.schedule.segments.at(-1);
  expect(lastSeg.startMs + lastSeg.durationMs).toBe(10_000);

  // A continuous (repeat -1) entrance costs 0 fixed time — the hold absorbs the loop.
  expect(r.continuousIn.schedule.cues.map((c: { action: string }) => c.action)).toEqual(['update', 'play', 'stop']);
  expect(r.continuousIn.schedule.cues.at(-1).atMs).toBe(9400);

  // No builder contract: auto-out impossible (error), play-and-hold allowed.
  expect(r.noBuildersAuto.schedule).toBeNull();
  expect(r.noBuildersAuto.issues[0].code).toBe('no-builders');
  expect(r.noBuildersNone.schedule.cues.map((c: { action: string }) => c.action)).toEqual(['update', 'play']);

  // Default still moment = IN end + half the first hold.
  expect(r.still).toBeCloseTo(1000 + 2466.67 / 2, 0);
});

test('render limits: tier gates on format, resolution, fps, and duration', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(async () => {
    const { validateRenderRequest, formatNeedsSignIn, resolveTier, RENDER_LIMITS } =
      await import('/src/render/limits.ts');
    const base = {
      kind: 'html',
      width: 1920, height: 1080, fps: 25, scale: 1,
      timing: { totalDurationMs: 10_000, outMode: 'auto', minHoldMs: 500, epochMs: 0 },
      output: { format: 'mp4' },
    };
    // kind:'remotion' expresses duration as frames - the same caps must apply.
    const remotion = {
      kind: 'remotion',
      width: 1920, height: 1080, fps: 25, scale: 1,
      durationInFrames: 250, // 10 s
      output: { format: 'mp4' },
    };
    return {
      remotionOk: validateRenderRequest(remotion, 'anonymous'),
      remotionLong: validateRenderRequest({ ...remotion, durationInFrames: 25 * 30 }, 'anonymous'), // 30 s > 15 s cap
      remotionFps: validateRenderRequest({ ...remotion, fps: 60, durationInFrames: 600 }, 'anonymous'),
      remotionProresFreeLong: validateRenderRequest(
        { ...remotion, durationInFrames: 25 * 45, output: { format: 'prores4444' } },
        'free',
      ),
      anonMp4: validateRenderRequest(base, 'anonymous'),
      anonProres: validateRenderRequest({ ...base, output: { format: 'prores4444' } }, 'anonymous'),
      anonLong: validateRenderRequest({ ...base, timing: { ...base.timing, totalDurationMs: 30_000 } }, 'anonymous'),
      anonFps: validateRenderRequest({ ...base, fps: 60 }, 'anonymous'),
      anon4k: validateRenderRequest({ ...base, scale: 2 }, 'anonymous'),
      free4k: validateRenderRequest({ ...base, scale: 2 }, 'free'),
      freeProresLong: validateRenderRequest(
        { ...base, output: { format: 'prores4444' }, timing: { ...base.timing, totalDurationMs: 45_000 } },
        'free',
      ),
      freeProresOk: validateRenderRequest(
        { ...base, output: { format: 'prores4444' }, timing: { ...base.timing, totalDurationMs: 20_000 } },
        'free',
      ),
      signinGates: ['mp4', 'webm', 'png-still', 'png-sequence', 'prores4444'].map(formatNeedsSignIn),
      tiers: [resolveTier(false), resolveTier(true)],
      grantedDefined: RENDER_LIMITS.granted.maxWidth,
    };
  });

  expect(r.remotionOk).toEqual([]);
  expect(r.remotionLong.map((i: { code: string }) => i.code)).toContain('duration');
  expect(r.remotionFps.map((i: { code: string }) => i.code)).toContain('fps');
  expect(r.remotionProresFreeLong.map((i: { code: string }) => i.code)).toContain('duration');
  expect(r.anonMp4).toEqual([]);
  expect(r.anonProres.map((i: { code: string }) => i.code)).toContain('format-signin');
  expect(r.anonLong.map((i: { code: string }) => i.code)).toContain('duration');
  expect(r.anonFps.map((i: { code: string }) => i.code)).toContain('fps');
  expect(r.anon4k.map((i: { code: string }) => i.code)).toContain('resolution');
  expect(r.free4k.map((i: { code: string }) => i.code)).toContain('resolution'); // 4K stays on the granted tier
  expect(r.freeProresLong.map((i: { code: string }) => i.code)).toContain('duration'); // per-format cap
  expect(r.freeProresOk).toEqual([]);
  expect(r.signinGates).toEqual([false, false, false, true, true]);
  expect(r.tiers).toEqual(['anonymous', 'free']);
  expect(r.grantedDefined).toBe(4096);
});
