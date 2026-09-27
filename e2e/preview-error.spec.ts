// covers: none - its subject, PreviewFrame and the preview composer, is CORE, so a change there
// already runs the full suite

import { test, expect } from '@playwright/test';
import { createProject } from './_create';
import { awaitPreviewRebuild } from './_preview';

// A template whose JS throws at load must not fail SILENTLY on the canvas. The preview document
// posts the error back (composeDocument's error hook -> store previewError), and before this
// spec the only surface that showed it was the Export panel - a person watching the stage saw a
// broken graphic and no explanation anywhere. PreviewFrame now wears the error on the stage
// itself (.preview-runtime-error), cleared automatically because every rebuild starts by
// resetting previewError.

/** Swap the working template's JS through the same one-apply path every editor surface uses. */
async function applyJs(page: import('@playwright/test').Page, js: string | null) {
  await awaitPreviewRebuild(page, () =>
    page.evaluate(async (code: string | null) => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const s = useTemplateStore.getState();
      s.applyTemplate({ ...s.template, js: code ?? s.template.js });
    }, js),
  );
}

test('a template runtime error is worn on the stage, and clears on the next good build', async ({ page }) => {
  await createProject(page, 'Hairline');
  const badge = page.getByTestId('preview-runtime-error');
  await expect(badge).toBeHidden();

  // Keep the good code to restore - the "fix" half of the test.
  const goodJs = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.js;
  });

  await applyJs(page, 'throw new Error("boom at load");');
  await expect(badge).toBeVisible();
  await expect(badge).toContainText('boom at load');

  // The badge must not take gestures from the canvas under it (it is a label, not a control).
  await expect(badge).toHaveCSS('pointer-events', 'none');

  await applyJs(page, goodJs);
  await expect(badge).toBeHidden();
});

// A simulator command that throws used to go nowhere: composeDocument's `spx-simulate` tag caught
// every one of them into an empty block. That silence is what hid the 2026-09-02 production bug -
// `runSimCommand` was serialized into the document calling two helpers under names a MINIFIED
// build had renamed, so settle, play, stop, next, scrub and snap all threw `ReferenceError` and
// the deployed editor showed a blank stage and a dead Play button with nothing to read anywhere.
// The rename itself cannot happen under `npm run dev` and so cannot be pinned here - that is
// `scripts/check-preview-serialization.mjs`'s job. What this pins is the part that would have made
// it a five-minute bug instead of a week-old one: when a command throws, the stage SAYS SO.
test('a simulator command that throws is worn on the stage, not swallowed', async ({ page }) => {
  await createProject(page, 'Hairline');
  const badge = page.getByTestId('preview-runtime-error');
  await expect(badge).toBeHidden();

  // Break the house entrance builder the way a broken serialization would: the command runs,
  // reaches template code, and throws. Nothing else about the document changes.
  await applyJs(
    page,
    `window.buildInTimeline = function () { throw new Error('entrance is broken'); };
     window.play = function () {};
     window.stop = function () {};`,
  );

  // SETTLE is the one that runs on its own, after every rebuild, and it is the command whose
  // silent failure leaves the canvas blank. So it is the first thing that must speak up.
  await expect(badge).toBeVisible();
  await expect(badge).toContainText('sim-settle');
  await expect(badge).toContainText('entrance is broken');

  await page.getByRole('button', { name: '▶ Play' }).click();
  await expect(badge).toContainText('sim-play');
  await expect(badge).toContainText('entrance is broken');

  // …and it goes on the press that WORKS. A command failure is about that press, so it must not
  // outlive it: the exit builder is untouched here, so Stop falls through to the template's own
  // stop() and succeeds. This is also why command errors are their own channel rather than the
  // load-time one - that one feeds the export gate, and a single bad scrub must never stand
  // between somebody and their download.
  await page.getByRole('button', { name: '■ Stop' }).click();
  await expect(badge).toBeHidden();
});
