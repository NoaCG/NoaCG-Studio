// covers: src/ai/video/**, src/video/**, src/components/video/**, player-host/**
//
// The host BUILD is load-bearing for the preview: it inlines the player JS and the bundled
// video fonts into public/player-host/index.html, which the video specs load.
// covers: scripts/build-player-host.mjs
//
// Text clipping as a GENERATION gate, not just a bench observation.
//
// The failure this pins shipped twice before it was detectable: a hero headline cropped by
// its own card - "BROADCAST KITCHEN" painting as "BROADCAST KITCH" - passed compile, the
// static contract, and the runtime probe, because nothing throws when glyphs are cut. The
// player host now measures the glyph extent at the hold frames (src/video/textChecks.js,
// inlined into the host at build time) and the validator turns a persistent crop into a
// repair round.
//
// The Anthropic API is mocked at the network level, so the real provider path runs: motion
// plan, module emit, validation, repair, apply - on emits we choose.

import { readFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import {
  createHyperframesProject,
  createVideoProject,
  mockClaude,
  player,
  useFakeAiKey,
  type EmittedModule,
} from './_video';

/** A benched lower-third whose hero text sits ~3300px left of the frame for its whole hold -
 *  nothing in it is readable, so the runtime checks must flag it at every hold frame. Read
 *  from disk, not fetched: the dev server injects its HMR client into any .html it serves,
 *  which would trip the external-script rule before the live probe ever ran. */
const OFF_FRAME_LOWER_THIRD = readFileSync(
  new URL('./fixtures/hf-transparent-lower-third.html', import.meta.url),
  'utf8',
);
const FIXTURE_SETTINGS = { width: 1920, height: 1080, fps: 30, durationInFrames: 120, transparent: true };

/**
 * `boxWidth` decides the verdict: 420 crops the headline, 1600 gives it room. `shiftX` slides
 * the text inside that box - large negative values push it entirely outside, which is a TOTAL
 * crop (nothing painted) rather than a partial one, and the two are gated differently.
 */
function moduleFor(summary: string, boxWidth: number, shiftX = 0): EmittedModule {
  return {
    summary,
    tsx: `import { AbsoluteFill } from 'remotion';

export default function Composition({ fields = {} }: { fields?: Record<string, string | number> }) {
  const headline = fields.headline ?? 'BROADCAST KITCHEN';
  return (
    <AbsoluteFill style={{ background: '#101318', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: ${boxWidth}, overflow: 'hidden' }}>
        <div style={{ color: '#fff', fontSize: 96, fontWeight: 800, whiteSpace: 'nowrap', marginLeft: ${shiftX} }}>
          {headline}
        </div>
      </div>
    </AbsoluteFill>
  );
}
`,
    inputs: [{ key: 'headline', type: 'text', label: 'Headline', default: 'BROADCAST KITCHEN' }],
  };
}

test('the HyperFrames runtime runs the same checks as the Remotion host', async ({ page }) => {
  // Both engines inline ONE implementation (src/video/textChecks.js) - the Remotion host at
  // build time, the HyperFrames driver at compose time - because neither opaque-origin
  // runtime can import a module from the app. This pins that the HyperFrames half is
  // actually there and reaches the same verdict on the same two documents.
  await page.goto('/app');
  await page.getByRole('button', { name: 'Video or animation with AI' }).click();
  await page.getByTestId('video-engine-hyperframes').click();
  await page.getByRole('button', { name: 'Sports stinger', exact: true }).click();
  await page.getByTestId('video-create').click();
  await expect(page.getByTestId('video-shell')).toBeVisible();
  await expect(page.locator('.ai-msg.assistant').first()).toBeVisible({ timeout: 10_000 });

  const secs = await page.evaluate(async () => {
    const { useVideoProjectStore } = await import('/src/store/videoProjectStore.ts');
    const p = useVideoProjectStore.getState().project;
    return p.durationInFrames / p.fps;
  });

  // `shiftX` slides the line inside a box that is wide enough for it - the "positioned
  // outside the visible area" case, which reads as the same percentage as being oversized.
  const documentWith = (boxWidth: number, shiftX = 0) => `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8" /><title>t</title>
<style>
  body { margin: 0; }
  #root { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: #101319; }
  .card { position: absolute; left: 200px; top: 480px; width: ${boxWidth}px; overflow: hidden; }
  .headline { color: #fff; font: 800 96px Arial; white-space: nowrap; margin-left: ${shiftX}px; }
</style></head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="${secs}">
  <section class="clip" data-start="0" data-duration="${secs}" data-track-index="1">
    <!-- id AND class: generated compositions overwhelmingly select structure by id, so the
         finding must name the id even when a class is also present. -->
    <div id="hero-mask" class="card"><div class="headline">BROADCAST KITCHEN</div></div>
  </section>
</div>
<script>
  window.__timelines = window.__timelines || {};
  var tl = gsap.timeline({ paused: true });
  tl.to('#root', { opacity: 1, duration: 0.1 }, 0);
  window.__timelines['main'] = tl;
</script>
</body>
</html>`;

  const clipFindings = async (boxWidth: number, shiftX = 0) => {
    await page.evaluate(async (doc) => {
      const { useVideoProjectStore } = await import('/src/store/videoProjectStore.ts');
      useVideoProjectStore.getState().setSource(doc);
    }, documentWith(boxWidth, shiftX));
    // The preview reloads on a debounce and every one of these documents shows the same
    // headline, so wait on THIS document's own geometry before reading any finding. Both
    // numbers, because two calls share a box width and matching on width alone would read
    // the PREVIOUS composition and measure it instead of this one.
    //
    // Measured INSIDE the frame rather than off the srcdoc string: that proves the document
    // reached the player and laid out, not merely that the attribute was set. It also has to
    // survive a zero-width box, which is what rules out waiting on the headline's visibility
    // - Playwright calls a 0-wide element invisible, and a 0-wide box is exactly what the
    // collapsed case below mounts.
    await expect
      .poll(
        () =>
          page
            .frameLocator('.video-player-frame')
            .locator('#hero-mask')
            .evaluate((el: HTMLElement) => {
              const line = el.firstElementChild as HTMLElement | null;
              return el.offsetWidth + '/' + (line ? getComputedStyle(line).marginLeft : '?');
            })
            // A frame swapped out mid-evaluate throws; that is just "not this document yet".
            .catch(() => null),
        { timeout: 10_000 },
      )
      .toBe(`${boxWidth}/${shiftX}px`);
    return page
      .frameLocator('.video-player-frame')
      .locator('body')
      .evaluate(
        () =>
          (window as unknown as { __noacgTextChecks?: { clip: () => { message: string }[] } })
            .__noacgTextChecks?.clip() ?? null,
      );
  };

  const cropped = await clipFindings(420);
  expect(cropped).not.toBeNull();
  expect(cropped!.length).toBeGreaterThan(0);
  expect(cropped![0].message).toContain('BROADCAST KITCHEN');
  expect(cropped![0].message).toContain('CUT OFF');

  // The finding has to be ACTIONABLE, not merely correct - it is fed to the model verbatim
  // and is the only thing a repair round has to work from. Two things make it so, and both
  // were missing: the box is named by its id (measured: nine of eleven real clip findings
  // said only "<div>", in documents holding thirty of them), and the arithmetic is handed
  // over, because "fit the type to the box" is unanswerable without the box's width.
  expect(cropped![0].message).toContain('id="hero-mask"');
  expect(cropped![0].message).toMatch(/needs \d+px but that box gives it 420px/);
  expect(cropped![0].message).toContain('Give the text room');

  expect(await clipFindings(1600)).toEqual([]);

  // Text that FITS its box and is cut anyway is a different defect taking the OPPOSITE fix:
  // it is parked outside the visible area, and shrinking it is the one repair that cannot
  // work. Measured on a real generation - 1183px of line inside a 1920px box, half of it
  // cropped - where quoting widths alone would have sent the model to shrink type that fits.
  const shifted = await clipFindings(1600, -1400);
  expect(shifted).not.toBeNull();
  expect(shifted!.length).toBeGreaterThan(0);
  expect(shifted![0].message).toMatch(/FITS that \d+px box/);
  expect(shifted![0].message).toContain('move it into view rather than shrinking it');
  expect(shifted![0].message).not.toContain('Give the text room');

  // A box COLLAPSED to zero width is the third defect wearing that same percentage, and it
  // takes a third fix - the box never opened, so neither resizing nor moving the text can
  // help. It is reachable at a hold frame whenever the narrowest clipper measures 0: a
  // reveal mask that never opened, or a flex item collapsed to nothing. Folding it into
  // either message above printed a contradiction - "at 1181px it FITS that 0px box" - and
  // then prescribed the opposite repair, the exact failure those two messages exist to avoid.
  const collapsed = await clipFindings(0);
  expect(collapsed).not.toBeNull();
  expect(collapsed!.length).toBeGreaterThan(0);
  expect(collapsed![0].message).toContain('That box measures 0px wide');
  expect(collapsed![0].message).toContain('Fix the BOX, not the text');
  // Neither other prescription may appear here - both are the wrong repair.
  expect(collapsed![0].message).not.toContain('FITS');
  expect(collapsed![0].message).not.toContain('Give the text room');
});

// Both cases hang on the LIVE probe, so the emits are delayed: an instant answer would beat
// the preview to the screen and validation would fall back to the static checks (see mockClaude).
const AS_SLOW_AS_REAL = { delayMs: 800 };

// These two need the real provider (mocked at the network level); the HyperFrames case above
// deliberately runs on the OFFLINE stub, so the fake key is scoped to this block.
test.describe('the generation gate', () => {
  test.beforeEach(async ({ page }) => {
    await useFakeAiKey(page);
  });

  test('a cropped headline is sent back for repair, and the fixed version applies', async ({ page }) => {
    const { emits } = await mockClaude(
      page,
      [moduleFor('Headline in a tight card.', 420), moduleFor('Headline given room.', 1600)],
      AS_SLOW_AS_REAL,
    );
    await createVideoProject(page);

    // Two emits: the generation plus exactly one repair round - the crop was caught and the
    // second, fitting composition passed.
    await expect.poll(() => emits(), { timeout: 20_000 }).toBe(2);
    await expect(page.locator('.ai-msg.assistant').last()).toContainText('Headline given room.');
    await expect(page.locator('.ai-msg.assistant').last()).not.toContainText('failed validation');
    await expect(player(page).getByText('BROADCAST KITCHEN')).toBeVisible({ timeout: 10_000 });
  });

  test('a crop that survives both repair rounds ships with a warning instead of being thrown away', async ({ page }) => {
    // The model never fixes it (mockClaude repeats its last module), so the finding outlives
    // the repair budget. A readability finding is not a broken composition: the user waited
    // for this, so it applies and the crop is surfaced as a warning - the SPX harness's rule
    // for its editability findings.
    const { emits } = await mockClaude(page, [moduleFor('Headline in a tight card.', 420)], AS_SLOW_AS_REAL);
    await createVideoProject(page);

    await expect.poll(() => emits(), { timeout: 40_000 }).toBe(3); // generation + 2 repair rounds
    const reply = page.locator('.ai-msg.assistant').last();
    await expect(reply).toContainText('Headline in a tight card.');
    await expect(reply).not.toContainText('failed validation');
    await expect(player(page).getByText('BROADCAST KITCHEN')).toBeVisible({ timeout: 10_000 });
  });

  test('a TOTAL crop is kept failed instead of shipping with a warning', async ({ page }) => {
    // The counterpart of the test above, and the line between them is the whole point. That
    // one survives its repair rounds and ships, because a partial crop might be a false
    // positive or still legible. This one paints NOTHING - the headline sits far outside its
    // own clipping box at every hold frame - which cannot be a false positive, so the
    // demotion must not rescue it. Measured shipping for real before this rule existed
    // (docs/HYPERFRAMES_QUALITY.md, the re-measurement's r1).
    const { emits } = await mockClaude(page, [moduleFor('Headline pushed off its card.', 1600, -4000)], AS_SLOW_AS_REAL);
    await createVideoProject(page);

    await expect.poll(() => emits(), { timeout: 40_000 }).toBe(3); // generation + 2 repair rounds
    const reply = page.locator('.ai-msg.assistant').last();
    await expect(reply, 'a composition with no visible text must not be presented as done').toContainText(
      'failed validation',
    );
    // The previous working composition is kept, and the failure names the total crop.
    await expect(page.getByText(/CUT OFF - 100%/)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('the gate reports whether it actually ran', () => {
  // The findings above exist ONLY when a preview is mounted to measure them. A validation
  // with no player attached has therefore checked NOTHING - but it used to return an empty
  // error list, which is indistinguishable from a clean result. Since the repair loop only
  // fires on !ok, a composition whose text sits permanently off-frame sailed through
  // untouched, and the same input passed or failed purely on whether the preview happened to
  // be mounted: stable within a session, contradictory across them. `probed` is what makes
  // "not checked" legible, and both halves of that contract are pinned here.

  test('a validation that could not measure anything says so instead of reporting clean', async ({ page }) => {
    await page.goto('/app');
    const results = await page.evaluate(
      async ([html, settings]) => {
        const { validateHyperframesComposition } = await import('/src/video/hyperframes/validate.ts');
        const { HyperframesBridge } = await import('/src/video/hyperframes/bridge.ts');
        const sum = (r: { ok: boolean; probed: boolean; errors: { rule: string }[] }) => ({
          ok: r.ok,
          probed: r.probed,
          rules: r.errors.map((e) => e.rule),
        });
        return {
          // No preview at all - the offline stub's shape, and every headless caller.
          nullBridge: sum(await validateHyperframesComposition(html, settings, [], null)),
          // A bridge exists but its iframe was never attached: the panel had not mounted yet.
          neverAttached: sum(
            await validateHyperframesComposition(html, settings, [], new HyperframesBridge({})),
          ),
        };
      },
      [OFF_FRAME_LOWER_THIRD, FIXTURE_SETTINGS] as const,
    );

    for (const [name, r] of Object.entries(results)) {
      expect(r.probed, `${name}: nothing was measured, so probed must say so`).toBe(false);
      expect(r.rules, `${name}: no runtime finding of any kind can exist without a probe`).toEqual([]);
    }
  });

  test('with a preview mounted the checks run - and a bridge that died mid-validation recovers onto the live one', async ({
    page,
  }) => {
    await createHyperframesProject(page);
    await expect(page.locator('.ai-msg.assistant').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.video-player-frame')).toBeVisible();
    // Deliberately NOT waiting for the preview to go quiet. The panel rebuilds this same
    // frame on a debounce after a generation applies, so validating right now races that
    // rebuild - which is the point: validation mounts its candidate and probes it as ONE
    // bridge chain entry, so a rebuild cannot land in between and have the checks measure
    // the project's composition instead. Waiting here would hide a regression in exactly
    // that guarantee.

    const results = await page.evaluate(
      async ([html, settings]) => {
        const { validateHyperframesComposition } = await import('/src/video/hyperframes/validate.ts');
        const { HyperframesBridge } = await import('/src/video/hyperframes/bridge.ts');
        const { getActiveHyperframesBridge } = await import('/src/video/bridgeRegistry.ts');
        const sum = (r: { ok: boolean; probed: boolean; errors: { rule: string }[] }) => ({
          ok: r.ok,
          probed: r.probed,
          rules: r.errors.map((e) => e.rule),
        });
        const live = getActiveHyperframesBridge();
        // A bridge disposed under a remount must not take the checks down with it: the
        // validator retries against whatever preview is mounted NOW.
        const dead = new HyperframesBridge({});
        dead.dispose();
        // Whether the fixture is still the mounted document when the probe finishes. If a
        // preview rebuild raced in and replaced it, the findings describe some other
        // composition and a "clean" verdict means nothing - so the assertions check this
        // rather than silently trusting an empty list.
        const fixtureStillMounted = () =>
          (document.querySelector('.video-player-frame') as HTMLIFrameElement | null)
            ?.getAttribute('srcdoc')
            ?.includes('name-mask') ?? false;
        const a = live ? sum(await validateHyperframesComposition(html, settings, [], live)) : null;
        const aMounted = fixtureStillMounted();
        const b = sum(await validateHyperframesComposition(html, settings, [], dead));
        const bMounted = fixtureStillMounted();
        return {
          mountedPreview: a ? { ...a, fixtureStillMounted: aMounted } : null,
          deadBridgeRecovers: { ...b, fixtureStillMounted: bMounted },
        };
      },
      [OFF_FRAME_LOWER_THIRD, FIXTURE_SETTINGS] as const,
    );

    expect(results.mountedPreview, 'the mounted preview registers itself for sibling validators').not.toBeNull();
    for (const [name, r] of Object.entries(results)) {
      expect(r!.probed, `${name}: the checks must have actually run`).toBe(true);
      expect(
        r!.fixtureStillMounted,
        `${name}: the probe measured whatever was mounted - if a rebuild replaced the fixture, ` +
          'its verdict is about the wrong composition',
      ).toBe(true);
      // Nothing of this fixture's text is painted, so it escalates past the soft rule.
      expect(r!.rules, `${name}: text painted nowhere is a TOTAL clip`).toContain('text-clip-total');
      expect(r!.ok, `${name}: an unreadable composition must not validate`).toBe(false);
    }
  });
});

test('text painted behind a panel is caught by the gate, not just by the bench', async ({ page }) => {
  // textChecks.js has always exported occlusion(), and the bench has always called it - but
  // neither engine's VALIDATOR did, so a hero parked behind a panel shipped unflagged on both.
  // Benchmarking watched exactly that happen (docs/HYPERFRAMES_QUALITY.md, the re-measurement's
  // r2: bench saw the hero covered at 4 of 5 sample points, the gate called the run clean).
  // Both halves are pinned: the occluded document is rejected, the same document with the panel
  // moved off the text is not - so this cannot pass by flagging everything.
  await createHyperframesProject(page);
  await expect(page.locator('.ai-msg.assistant').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.video-player-frame')).toBeVisible();

  const results = await page.evaluate(async () => {
    const { validateHyperframesComposition } = await import('/src/video/hyperframes/validate.ts');
    const { getActiveHyperframesBridge } = await import('/src/video/bridgeRegistry.ts');
    const settings = { width: 1920, height: 1080, fps: 30, durationInFrames: 120, transparent: false };

    // `panelLeft` decides the verdict: 0 parks an opaque panel over the headline for the whole
    // hold, 1500 leaves it clear. Everything else about the two documents is identical.
    const documentWith = (panelLeft: number) => `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8" /><title>t</title>
<style>
  body { margin: 0; }
  #root { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: #0e1117; }
  .headline { position: absolute; left: 200px; top: 480px; color: #fff; font: 800 96px Arial; white-space: nowrap; }
  .panel { position: absolute; left: ${panelLeft}px; top: 400px; width: 900px; height: 260px; background: #1d2430; }
</style></head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="4">
  <section class="clip" data-start="0" data-duration="4" data-track-index="1">
    <div class="headline">BROADCAST KITCHEN</div>
    <div class="panel"></div>
  </section>
</div>
<script>
  window.__timelines = window.__timelines || {};
  var tl = gsap.timeline({ paused: true });
  tl.to('#root', { opacity: 1, duration: 0.1 }, 0);
  window.__timelines['main'] = tl;
</script>
</body>
</html>`;

    const verdict = async (panelLeft: number) => {
      const r = await validateHyperframesComposition(
        documentWith(panelLeft),
        settings,
        [],
        getActiveHyperframesBridge(),
      );
      return { probed: r.probed, ok: r.ok, rules: r.errors.map((e) => e.rule), messages: r.errors.map((e) => e.message) };
    };
    // The covered case first, then the clear one, through the same live bridge.
    return { covered: await verdict(0), clear: await verdict(1500) };
  });

  expect(results.covered.probed, 'the covered case must actually have been measured').toBe(true);
  expect(results.covered.rules, 'a hero behind a panel is an occlusion finding').toContain('text-occluded');
  expect(results.covered.messages.join(' '), 'the repair message must name LAYERING, not size').toContain(
    'LAYERING problem',
  );

  expect(results.clear.probed, 'the clear case must actually have been measured').toBe(true);
  expect(results.clear.rules, 'the same document with the panel moved off the text is clean').not.toContain(
    'text-occluded',
  );
});

test('gradient wordmarks broken by same-color slabs are caught by the gate', async ({ page }) => {
  // A real OpenRouter smoke output put three white decorative slabs behind the right half of
  // a white gradient wordmark. The text painted later, so this was not occlusion, but the
  // same-color backdrop erased large bands of the glyphs. The old contrast check skipped every
  // background-clip:text fill and also required every sample to fail, scoring the result clean.
  await createHyperframesProject(page);
  await expect(page.locator('.ai-msg.assistant').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.video-player-frame')).toBeVisible();

  const results = await page.evaluate(async () => {
    const { validateHyperframesComposition } = await import('/src/video/hyperframes/validate.ts');
    const { getActiveHyperframesBridge } = await import('/src/video/bridgeRegistry.ts');
    const settings = { width: 1920, height: 1080, fps: 30, durationInFrames: 120, transparent: false };

    const documentWith = (slabLeft: number) => `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8" /><title>t</title>
<style>
  body { margin: 0; }
  #root { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: #101216; }
  .slab { position: absolute; left: ${slabLeft}px; width: 780px; height: 60px; background: #fff; }
  #top { top: 420px; } #mid { top: 540px; } #bottom { top: 660px; }
  #title {
    position: absolute; left: 290px; top: 395px; margin: 0;
    color: #fff; font: 700 240px/1 Arial; letter-spacing: -0.02em; white-space: nowrap;
    background: linear-gradient(to bottom, rgba(255,255,255,.95), rgba(255,255,255,.55));
    -webkit-background-clip: text; background-clip: text;
    z-index: 2;
  }
</style></head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="4">
  <section class="clip" data-start="0" data-duration="4" data-track-index="1">
    <div id="top" class="slab"></div><div id="mid" class="slab"></div><div id="bottom" class="slab"></div>
  </section>
  <section class="clip" data-start="0" data-duration="4" data-track-index="2">
    <h1 id="title">NORTHLINE</h1>
  </section>
</div>
<script>
  window.__timelines = window.__timelines || {};
  var tl = gsap.timeline({ paused: true });
  tl.to('#root', { opacity: 1, duration: 0.1 }, 0);
  window.__timelines['main'] = tl;
</script>
</body>
</html>`;

    const verdict = async (slabLeft: number) => {
      const r = await validateHyperframesComposition(
        documentWith(slabLeft),
        settings,
        [],
        getActiveHyperframesBridge(),
      );
      return { probed: r.probed, rules: r.errors.map((e) => e.rule), messages: r.errors.map((e) => e.message) };
    };

    return { broken: await verdict(960), clear: await verdict(1700) };
  });

  expect(results.broken.probed, 'the broken wordmark must actually have been measured').toBe(true);
  expect(results.broken.rules, 'same-color slabs erase large bands of the gradient wordmark').toContain(
    'text-contrast',
  );
  expect(results.broken.messages.join(' '), 'the repair must identify text/backdrop color').toContain(
    'TEXT COLOR',
  );
  expect(results.clear.rules, 'the same wordmark with the slabs moved clear is clean').not.toContain(
    'text-contrast',
  );
});

test('competing duplicate wordmark bindings are rejected without flagging an aligned effect layer', async ({
  page,
}) => {
  // A real Qwen HyperFrames output tried to build a sliced wordmark from three elements carrying
  // the same data-var-text binding. The runtime correctly replaced every "slice" with the full
  // editable value, leaving three overlapping NORTHLINE runs. The old overlap check skipped any
  // equal text because an exactly aligned duplicate can be a legitimate sheen or glow.
  await createHyperframesProject(page);
  await expect(page.locator('.ai-msg.assistant').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.video-player-frame')).toBeVisible();

  const results = await page.evaluate(async () => {
    const { validateHyperframesComposition } = await import('/src/video/hyperframes/validate.ts');
    const { getActiveHyperframesBridge } = await import('/src/video/bridgeRegistry.ts');
    const settings = { width: 1920, height: 1080, fps: 30, durationInFrames: 120, transparent: false };

    const documentWith = (broken: boolean) => `<!doctype html>
<html lang="en" data-composition-variables='[
  {"id":"title","type":"string","label":"Title","default":"NORTHLINE"}
]'>
<head><meta charset="UTF-8" /><title>t</title>
<style>
  body { margin: 0; }
  #root { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: #101216; }
  .word {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
    color: #fff; font: 900 160px/1 Arial; letter-spacing: -0.02em; white-space: nowrap;
  }
  #left { transform: translate(-62%, -50%); }
  #right { transform: translate(-38%, -50%); }
  .effect { color: rgba(255,255,255,.24); filter: blur(8px); }
</style></head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="4">
  <section class="clip" data-start="0" data-duration="4" data-track-index="1">
    ${
      broken
        ? `<div id="left" class="word" data-var-text="title">NORT</div>
           <div id="middle" class="word" data-var-text="title">H</div>
           <div id="right" class="word" data-var-text="title">HLINE</div>`
        : `<div id="middle" class="word" data-var-text="title">NORTHLINE</div>
           <div class="word effect" aria-hidden="true">NORTHLINE</div>`
    }
  </section>
</div>
<script>
  window.__timelines = window.__timelines || {};
  var tl = gsap.timeline({ paused: true });
  tl.to('#root', { opacity: 1, duration: 0.1 }, 0);
  window.__timelines['main'] = tl;
</script>
</body>
</html>`;

    const verdict = async (broken: boolean) => {
      const r = await validateHyperframesComposition(
        documentWith(broken),
        settings,
        [],
        getActiveHyperframesBridge(),
      );
      return { probed: r.probed, rules: r.errors.map((e) => e.rule), messages: r.errors.map((e) => e.message) };
    };

    return { broken: await verdict(true), effect: await verdict(false) };
  });

  expect(results.broken.probed, 'the duplicate wordmark must actually have been measured').toBe(true);
  expect(results.broken.rules, 'overlapping full values are not valid sliced typography').toContain(
    'text-duplicate',
  );
  expect(results.broken.messages.join(' '), 'the repair must name the repeated variable binding').toContain(
    'data-var-text="title"',
  );
  expect(results.effect.rules, 'an aligned unbound glow remains an intentional effect layer').not.toContain(
    'text-duplicate',
  );
});

test('dark-on-dark text and text painted across other text are caught by the gate', async ({ page }) => {
  // Two real bench failures shipped "clean" before these checks existed (scripts/
  // video-bench-briefs.varied.json): esports-opener drew its second title word in a
  // near-background fill on the background itself - no check measured contrast at all - and
  // single-word-hero laid its kicker across the wordmark's baseline, which occlusion cannot
  // see because a text element with a transparent background never registers as a blocker.
  // Both halves of each are pinned: the broken document is flagged, the corrected one is not.
  await createHyperframesProject(page);
  await expect(page.locator('.ai-msg.assistant').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.video-player-frame')).toBeVisible();

  const results = await page.evaluate(async () => {
    const { validateHyperframesComposition } = await import('/src/video/hyperframes/validate.ts');
    const { getActiveHyperframesBridge } = await import('/src/video/bridgeRegistry.ts');
    const settings = { width: 1920, height: 1080, fps: 30, durationInFrames: 120, transparent: false };

    const documentWith = (body: string, css: string) => `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8" /><title>t</title>
<style>
  body { margin: 0; }
  #root { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: #16101e; }
  ${css}
</style></head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="4">
  <section class="clip" data-start="0" data-duration="4" data-track-index="1">${body}</section>
</div>
<script>
  window.__timelines = window.__timelines || {};
  var tl = gsap.timeline({ paused: true });
  tl.to('#root', { opacity: 1, duration: 0.1 }, 0);
  window.__timelines['main'] = tl;
</script>
</body>
</html>`;

    const verdict = async (body: string, css: string) => {
      const r = await validateHyperframesComposition(
        documentWith(body, css),
        settings,
        [],
        getActiveHyperframesBridge(),
      );
      return { probed: r.probed, rules: r.errors.map((e) => e.rule), messages: r.errors.map((e) => e.message) };
    };

    // `color` decides the contrast verdict: a fill a shade off the #16101e background, vs white.
    const heroWith = (color: string) =>
      verdict(
        `<div id="second-word" style="position:absolute;left:600px;top:450px;font:900 180px Archivo,sans-serif;color:${color};">RIFT</div>`,
        '',
      );
    // Use the bundled video fonts so Linux CI and local browsers measure identical glyphs.
    // `top` still decides the verdict: 590 puts the kicker well inside the wordmark's ink,
    // while 820 leaves an unambiguous gap.
    const kickerAt = (top: number) =>
      verdict(
        `<div id="mark" style="position:absolute;left:200px;top:400px;font:900 280px Archivo,sans-serif;color:#fff;">LANDFALL</div>
         <div id="kicker" style="position:absolute;left:560px;top:${top}px;font:700 48px 'Space Grotesk',sans-serif;color:#9fb8bb;">STORM COVERAGE // COLD OPEN</div>`,
        '',
      );

    return {
      darkOnDark: await heroWith('#231a30'),
      lightOnDark: await heroWith('#f2eefa'),
      crossed: await kickerAt(590),
      cleared: await kickerAt(820),
    };
  });

  expect(results.darkOnDark.probed, 'the dark-on-dark case must actually have been measured').toBe(true);
  expect(results.darkOnDark.rules, 'a fill matching its backdrop is a contrast finding').toContain('text-contrast');
  expect(results.darkOnDark.messages.join(' '), 'the repair message must name the COLOR, not size or position').toContain(
    'Change the TEXT COLOR',
  );
  expect(results.lightOnDark.rules, 'the same word in white is clean').not.toContain('text-contrast');

  expect(results.crossed.probed, 'the crossed case must actually have been measured').toBe(true);
  expect(results.crossed.rules, 'a kicker across a wordmark is an overlap finding').toContain('text-overlap');
  expect(results.crossed.messages.join(' '), 'the repair message must name SPACING').toContain('SPACING problem');
  expect(results.cleared.rules, 'the same kicker moved clear of the wordmark is clean').not.toContain('text-overlap');
});
