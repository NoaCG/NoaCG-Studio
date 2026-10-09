// FRAMES OF THE PLAYOUT DASHBOARD, at the window sizes the owner actually reads it on.
// Run with the dev server up:
//   node scripts/playout-dashboard-shots.mjs [out-dir]
//
// It exists because every read of this surface has been answered with measurements - track
// widths, button pitches, overflow numbers - and the person deciding whether the layout is right
// reads PICTURES. The measurements stay in the specs, where they can fail; this produces the
// frames that go with them.
//
// Deliberately NOT part of the e2e suite: it asserts nothing, it produces artifacts. It is named
// so `scripts/command-match.mjs` queues it behind any other browser-driving job on this machine -
// it drives a real Chromium over the whole app, which is the only thing that module cares about.
//
// The fixture is built through the SAME create path the wizard's Create button runs (the
// `_create.ts` bootstrap), so what is photographed is a real project, not a hand-written one:
// a two-sided SCOREBOARD (the graphic the 2026-08-21 report was about, and the only shape the
// field grouping applies to) plus a plain LOWER THIRD beside it, so both halves of the grouping
// rule - grouped and deliberately ungrouped - are in the same set of frames.

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { outDir } from './out-dir.mjs';

const out = outDir(process.argv[2], 'playout-shots', 'Usage: node scripts/playout-dashboard-shots.mjs [out-dir]');
mkdirSync(out, { recursive: true });
const port = execSync('node scripts/dev-port.mjs', { windowsHide: true }).toString().trim();
const base = `http://localhost:${port}`;

/** The windows this surface is read on: the minimum supported, a scaled 1080p, and two big ones. */
const SIZES = [
  { name: '1366x768', width: 1366, height: 768 },
  { name: '1536x814', width: 1536, height: 814 },
  { name: '1920x1080', width: 1920, height: 1080 },
  { name: '2560x1400', width: 2560, height: 1400 },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

/** Build one catalog project into the working document - the wizard's own create path. */
const createProject = (variantName) =>
  page.evaluate(async (name) => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { initialDraft, mergeDraft, buildDraftTemplate } = await import('/src/components/wizard/draft.ts');
    const { formatTemplate } = await import('/src/format/formatCode.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const variant = Object.values(CATALOG).flat().find((v) => v.name === name);
    if (!variant) throw new Error(`no catalog variant called ${name}`);
    const draft = mergeDraft(initialDraft(), {
      variantId: variant.id,
      lines: variant.suggestedLines.map((l) => ({ ...l })),
    });
    const template = await formatTemplate(buildDraftTemplate(variant, draft));
    useTemplateStore.getState().applyTemplate(template, { resetSampleData: true });
  }, variantName);

await page.goto(`${base}/app`);
await page.waitForSelector('.topbar');

// Decline analytics before anything is photographed. The consent banner is non-blocking by
// design, but it parks itself over the bottom-right of the app - which at 1366x768 is exactly
// where the cue editor is, so the first run of this script produced a frame of the surface
// under review with a dialog across it. Through the module's own setter, never a hand-written
// storage key, so this cannot drift from where consent actually lives.
await page.evaluate(async () => {
  const { setAnalyticsConsent } = await import('/src/backend/events.ts');
  setAnalyticsConsent(false);
});
await page.waitForSelector('[data-testid="analytics-consent"]', { state: 'detached' });

// ── The fixture: one production holding both graphics ──────────────────────────────────────
await createProject('House Scorebug');
const showId = await page.evaluate(async () => {
  const shows = await import('/src/model/shows.ts');
  const { useTemplateStore } = await import('/src/store/templateStore.ts');
  const { commitDurableWrites } = await import('/src/model/durableStore.ts');
  const list = shows.createShow('Match Night');
  const show = list[list.length - 1];
  shows.addGraphicToShow(show.id, useTemplateStore.getState().template);
  // The durable store answers a refusal AFTER the call returns, and the navigation below would
  // abort a transaction still in flight - the production would open with no graphics in it.
  const failure = await commitDurableWrites();
  if (failure) throw new Error(failure);
  return show.id;
});
await createProject('Hairline');
await page.evaluate(async (id) => {
  const shows = await import('/src/model/shows.ts');
  const { useTemplateStore } = await import('/src/store/templateStore.ts');
  const { commitDurableWrites } = await import('/src/model/durableStore.ts');
  shows.addGraphicToShow(id, useTemplateStore.getState().template);
  const failure = await commitDurableWrites();
  if (failure) throw new Error(failure);
}, showId);

await page.goto(`${base}/app#/production/${showId}`);
await page.waitForSelector('[data-testid="cue-editor"]');

/** Select a cue by the name on its row - the operator's own gesture. */
const selectCue = async (name) => {
  await page.locator('.pd-cue', { hasText: name }).locator('.pd-cue-label').click();
  await page.waitForFunction(
    (n) => document.querySelector('[data-testid="cue-label"]')?.value === n,
    name,
  );
};

for (const size of SIZES) {
  await page.setViewportSize({ width: size.width, height: size.height });
  // The monitors rescale through a ResizeObserver; give the layout a frame to settle so a shot
  // never catches a stage mid-resize.
  await page.waitForTimeout(400);
  for (const [cue, slug] of [
    ['House Scorebug', 'scoreboard'],
    ['Hairline', 'lower-third'],
  ]) {
    await selectCue(cue);
    await page.waitForTimeout(250);
    await page.screenshot({ path: join(out, `${slug}-${size.name}.png`), animations: 'disabled' });
  }
}

// One close-up of the editor itself at the width the report came from, where the bands and the
// cue-settings strip are the whole subject and the monitors above are not.
await page.setViewportSize({ width: 1920, height: 1080 });
await selectCue('House Scorebug');
await page.waitForTimeout(300);
await page.locator('[data-testid="cue-editor"]').screenshot({ path: join(out, 'cue-editor-1920.png') });

await browser.close();
console.log(`Playout dashboard frames written to ${out}`);
