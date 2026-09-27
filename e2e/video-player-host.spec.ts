// covers: src/ai/video/**, src/video/**, src/components/video/**, player-host/**
//
// The host BUILD is load-bearing for the preview: it inlines the player JS and the bundled
// video fonts into public/player-host/index.html, which the video specs load.
// covers: scripts/build-player-host.mjs
//
// The Remotion player host (public/player-host/, its own package - built by
// scripts/build-player-host.mjs) drives untrusted composition modules behind postMessage.
// These specs pin the protocol: load/loaded, eval + mount error reporting, and the frame
// probe used by AI validation. The page is driven top-level (window.parent === window),
// so postMessage from the page itself is accepted by the host's source check.

import { test, expect, type Page } from '@playwright/test';

const SETTINGS = { width: 1920, height: 1080, fps: 30, durationInFrames: 90 };
const BASE = { channel: 'noacg-player', v: 2, nonce: 'e2e' };

const GOOD_MODULE = `
  const React = require('react');
  const R = require('remotion');
  exports.default = function C() {
    const f = R.useCurrentFrame();
    return React.createElement(R.AbsoluteFill, { style: { background: '#123' } },
      React.createElement('div', { style: { color: '#fff', fontSize: 80 } }, 'frame ' + f));
  };
`;

const THROWS_AFTER_40 = `
  const React = require('react');
  const R = require('remotion');
  exports.default = function C() {
    const f = R.useCurrentFrame();
    if (f > 40) throw new Error('dies after frame 40');
    return React.createElement(R.AbsoluteFill, null, 'ok');
  };
`;

/** A headline cropped by its own fixed-width, overflow-hidden card: "BROADCAST KITCHEN"
 *  paints as "BROADCAST KITCH". The element's OWN box is 420px and reports no clipping -
 *  only the glyph extent does, which is what textChecks measures. */
const CLIPPED_TEXT = `
  const React = require('react');
  const R = require('remotion');
  exports.default = function C() {
    return React.createElement(R.AbsoluteFill, { style: { background: '#101318', alignItems: 'center', justifyContent: 'center' } },
      React.createElement('div', { style: { width: 420, overflow: 'hidden' } },
        React.createElement('div', { style: { color: '#fff', fontSize: 96, fontWeight: 800, whiteSpace: 'nowrap' } }, 'BROADCAST KITCHEN')));
  };
`;

/** Type clipped away ENTIRELY: the glyph sits in an absolutely-positioned span inside a
 *  zero-height overflow:hidden wrapper, so the frame renders blank. Taken from a real bench
 *  logo reveal that shipped a completely empty composition and scored clean - the element's
 *  own box has zero area, which is why the check must measure the GLYPHS, not the box. */
const CLIPPED_TO_NOTHING = `
  const React = require('react');
  const R = require('remotion');
  exports.default = function C() {
    return React.createElement(R.AbsoluteFill, { style: { background: '#101318', alignItems: 'center', justifyContent: 'center' } },
      React.createElement('span', { style: { position: 'relative', display: 'inline-block', overflow: 'hidden', width: '0.62em', fontSize: 160, fontWeight: 900 } },
        React.createElement('span', { style: { position: 'absolute', inset: 0, color: '#fff' } }, 'MERIDIAN')));
  };
`;

/** Nothing is cut - the headline simply runs to the frame edge with no margin, which reads
 *  as an accident on air and is unsafe on any display that overscans. Measured across the
 *  bench: every headline that reads well sat at 11%+ from the edge, this class at 3%. */
const NO_SAFE_MARGIN = `
  const React = require('react');
  const R = require('remotion');
  exports.default = function C() {
    // Pinned 10px from a 1920px frame's left edge (0.5%), so the margin is a fact of the
    // layout rather than a function of the font's metrics.
    return React.createElement(R.AbsoluteFill, { style: { background: '#101318' } },
      React.createElement('div', { style: { position: 'absolute', left: 10, top: '45%', color: '#fff', fontSize: 150, fontWeight: 900, whiteSpace: 'nowrap' } }, 'AURORA VANE'));
  };
`;

/** The same headline, given room. Nothing to report - the false-positive guard. */
const FITTED_TEXT = `
  const React = require('react');
  const R = require('remotion');
  exports.default = function C() {
    return React.createElement(R.AbsoluteFill, { style: { background: '#101318', alignItems: 'center', justifyContent: 'center' } },
      React.createElement('div', { style: { width: 1600, overflow: 'hidden' } },
        React.createElement('div', { style: { color: '#fff', fontSize: 96, fontWeight: 800, whiteSpace: 'nowrap' } }, 'BROADCAST KITCHEN')));
  };
`;

/** Start collecting host->app events on the page (call before triggering them). */
async function collectEvents(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __events: unknown[] };
    w.__events = [];
    window.addEventListener('message', (ev) => {
      const d = ev.data as { channel?: string; type?: string };
      if (d && d.channel === 'noacg-player' && !['load', 'probe', 'seek', 'play', 'pause', 'replay', 'set-props'].includes(d.type ?? '')) {
        w.__events.push(ev.data);
      }
    });
  });
}

async function post(page: Page, msg: Record<string, unknown>): Promise<void> {
  await page.evaluate((m) => window.postMessage(m, '*'), { ...BASE, ...msg });
}

async function eventsOfType(page: Page, type: string): Promise<Record<string, unknown>[]> {
  return page.evaluate(
    (t) => ((window as unknown as { __events: { type: string }[] }).__events ?? []).filter((e) => e.type === t),
    type,
  ) as Promise<Record<string, unknown>[]>;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/player-host/index.html#n=e2e');
  await collectEvents(page);
});

test('demo mode renders a playing composition', async ({ page }) => {
  // beforeEach landed on the same URL with a different hash - force a real reload so
  // main.tsx re-evaluates the hash.
  await page.goto('/player-host/index.html#demo');
  await page.reload();
  await expect(page.getByTestId('demo-title')).toBeAttached();
});

test('loads a good module and reports loaded', async ({ page }) => {
  await post(page, { type: 'load', id: 1, compiledJs: GOOD_MODULE, settings: SETTINGS, inputProps: {}, assets: [], autoplay: false });
  await expect.poll(() => eventsOfType(page, 'loaded')).toHaveLength(1);
  // The module actually rendered frame 0.
  await expect(page.locator('text=frame 0')).toBeAttached();
});

test('reports eval errors for disallowed imports and missing default export', async ({ page }) => {
  await post(page, { type: 'load', id: 2, compiledJs: 'const axios = require("axios"); exports.default = () => null;', settings: SETTINGS, inputProps: {}, assets: [], autoplay: false });
  await expect.poll(async () => (await eventsOfType(page, 'load-error')).length).toBe(1);
  await post(page, { type: 'load', id: 3, compiledJs: 'exports.helper = 1;', settings: SETTINGS, inputProps: {}, assets: [], autoplay: false });
  await expect.poll(async () => (await eventsOfType(page, 'load-error')).length).toBe(2);
  const errors = await eventsOfType(page, 'load-error');
  expect(String(errors[0].message)).toContain('axios');
  expect(String(errors[1].message)).toContain('default-export');
});

test('reports a mount error and keeps the last good module', async ({ page }) => {
  await post(page, { type: 'load', id: 4, compiledJs: GOOD_MODULE, settings: SETTINGS, inputProps: {}, assets: [], autoplay: false });
  await expect.poll(() => eventsOfType(page, 'loaded')).toHaveLength(1);
  await post(page, { type: 'load', id: 5, compiledJs: 'exports.default = function C(){ throw new Error("boom at render"); };', settings: SETTINGS, inputProps: {}, assets: [], autoplay: false });
  await expect.poll(async () => (await eventsOfType(page, 'load-error')).length).toBe(1);
  const [err] = await eventsOfType(page, 'load-error');
  expect(err.phase).toBe('mount');
  expect(String(err.message)).toContain('boom at render');
  // The previous module is still mounted (frame 0 content visible again).
  await expect(page.locator('text=frame 0')).toBeAttached();
});

test('probe renders the requested frames and catches frame-specific errors', async ({ page }) => {
  // A clean module probes clean.
  await post(page, { type: 'load', id: 6, compiledJs: GOOD_MODULE, settings: SETTINGS, inputProps: {}, assets: [], autoplay: false });
  await expect.poll(() => eventsOfType(page, 'loaded')).toHaveLength(1);
  await post(page, { type: 'probe', id: 6, frames: [0, 45, 89] });
  await expect.poll(async () => (await eventsOfType(page, 'probe-result')).length).toBe(1);
  const [ok] = await eventsOfType(page, 'probe-result');
  expect(ok.ok).toBe(true);

  // A module that dies past frame 40 fails the mid/last-frame probe with frame numbers.
  await post(page, { type: 'load', id: 7, compiledJs: THROWS_AFTER_40, settings: SETTINGS, inputProps: {}, assets: [], autoplay: false });
  await expect.poll(() => eventsOfType(page, 'loaded')).toHaveLength(2);
  await post(page, { type: 'probe', id: 7, frames: [0, 45, 89] });
  await expect.poll(async () => (await eventsOfType(page, 'probe-result')).length).toBe(2);
  const results = await eventsOfType(page, 'probe-result');
  const bad = results[1] as { ok: boolean; errors: { frame: number; message: string }[] };
  expect(bad.ok).toBe(false);
  expect(bad.errors.some((e) => e.frame >= 41 && e.message.includes('dies after frame 40'))).toBe(true);
});

test('the probe reports text clipped at the check frames - and stays quiet when it fits', async ({ page }) => {
  type ProbeResult = {
    ok: boolean;
    textIssues: { frame: number; kind: string; key: string; message: string }[];
  };
  const probeResults = async () => (await eventsOfType(page, 'probe-result')) as unknown as ProbeResult[];

  // A headline cropped by its card is reported at EVERY check frame (it never resolves -
  // that is exactly what separates a real crop from an entrance still in flight).
  await post(page, { type: 'load', id: 8, compiledJs: CLIPPED_TEXT, settings: SETTINGS, inputProps: {}, assets: [], autoplay: false });
  await expect.poll(() => eventsOfType(page, 'loaded')).toHaveLength(1);
  await post(page, { type: 'probe', id: 8, frames: [0, 45, 89], checkFrames: [45, 58] });
  await expect.poll(async () => (await probeResults()).length).toBe(1);
  const clipped = (await probeResults())[0];
  // Runtime errors and readability findings are separate verdicts: the module renders fine.
  expect(clipped.ok).toBe(true);
  expect(clipped.textIssues.map((i) => i.frame).sort()).toEqual([45, 58]);
  expect(clipped.textIssues.every((i) => i.kind === 'clip')).toBe(true);
  expect(clipped.textIssues[0].message).toContain('BROADCAST KITCHEN');
  expect(clipped.textIssues[0].message).toContain('CUT OFF');

  // The same headline with room to breathe produces nothing.
  await post(page, { type: 'load', id: 9, compiledJs: FITTED_TEXT, settings: SETTINGS, inputProps: {}, assets: [], autoplay: false });
  await expect.poll(() => eventsOfType(page, 'loaded')).toHaveLength(2);
  await post(page, { type: 'probe', id: 9, frames: [0, 45, 89], checkFrames: [45, 58] });
  await expect.poll(async () => (await probeResults()).length).toBe(2);
  expect((await probeResults())[1].textIssues).toEqual([]);

  // Type clipped away to NOTHING - the worst case, and the one a box-area filter hides,
  // because the element's own rect has zero area while the glyphs are fully cropped.
  await post(page, { type: 'load', id: 10, compiledJs: CLIPPED_TO_NOTHING, settings: SETTINGS, inputProps: {}, assets: [], autoplay: false });
  await expect.poll(() => eventsOfType(page, 'loaded')).toHaveLength(3);
  await post(page, { type: 'probe', id: 10, frames: [0, 45, 89], checkFrames: [45, 58] });
  await expect.poll(async () => (await probeResults()).length).toBe(3);
  const blank = (await probeResults())[2];
  expect(blank.textIssues.length).toBeGreaterThan(0);
  expect(blank.textIssues[0].message).toContain('MERIDIAN');
  // One finding per element: type that is CUT is reported as a clip, never also as a
  // margin problem.
  expect(blank.textIssues.every((i) => i.kind === 'clip')).toBe(true);
});

test('the probe reports text crowding the frame edge, even though nothing is cut', async ({ page }) => {
  type ProbeResult = { textIssues: { frame: number; kind: string; message: string }[] };
  const probeResults = async () => (await eventsOfType(page, 'probe-result')) as unknown as ProbeResult[];

  await post(page, { type: 'load', id: 11, compiledJs: NO_SAFE_MARGIN, settings: SETTINGS, inputProps: {}, assets: [], autoplay: false });
  await expect.poll(() => eventsOfType(page, 'loaded')).toHaveLength(1);
  await post(page, { type: 'probe', id: 11, frames: [0, 45, 89], checkFrames: [45, 58] });
  await expect.poll(async () => (await probeResults()).length).toBe(1);
  const tight = (await probeResults())[0];
  expect(tight.textIssues.map((i) => i.frame).sort()).toEqual([45, 58]);
  expect(tight.textIssues.every((i) => i.kind === 'safe-area')).toBe(true);
  expect(tight.textIssues[0].message).toContain('AURORA VANE');
  expect(tight.textIssues[0].message).toContain('edge of the frame');

  // A headline with room reports nothing - the same guard the clip check gets.
  await post(page, { type: 'load', id: 12, compiledJs: FITTED_TEXT, settings: SETTINGS, inputProps: {}, assets: [], autoplay: false });
  await expect.poll(() => eventsOfType(page, 'loaded')).toHaveLength(2);
  await post(page, { type: 'probe', id: 12, frames: [0, 45, 89], checkFrames: [45, 58] });
  await expect.poll(async () => (await probeResults()).length).toBe(2);
  expect((await probeResults())[1].textIssues).toEqual([]);
});
