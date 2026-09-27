// covers: src/ai/video/**, src/video/**, src/components/video/**
// covers: src/components/wizard/**, !src/components/wizard/import/**
//
// The HyperFrames engine flow, end to end on the offline stub provider: pick the engine
// in the wizard, auto-generate a composition document, LIVE preview through the sandboxed
// srcdoc driver (clip windows + the paused GSAP timeline seeked by the driver), Content
// edits applying live through set-vars, deterministic scrubbing, manual code edits with
// last-good protection, reload restore, and the engine-aware export. The Remotion flow
// next door (video-project.spec.ts) must stay untouched by all of this.

import { test, expect, type Page } from '@playwright/test';
import { awaitVideoPreview, createHyperframesProject, reloadVideoShell } from './_video';

/** The preview iframe's content (Playwright reaches into sandboxed srcdoc frames). */
function player(page: Page) {
  return page.frameLocator('.video-player-frame');
}

/** Same wait, and the same 30 s reasoning, as video-project.spec.ts's copy. */
async function waitForGeneration(page: Page) {
  await expect(page.locator('.ai-msg.assistant').first()).toBeVisible({ timeout: 30_000 });
}

test('create with the HyperFrames engine -> stub generation -> live preview renders', async ({ page }) => {
  await createHyperframesProject(page);
  await waitForGeneration(page);
  // The assistant turn lands BEFORE the preview reloads with the applied document, so every
  // reading below - the rendered text, the srcdoc's embedded faces - waits for the load first.
  await awaitVideoPreview(page);

  // The stub's stinger sample renders inside the driver iframe.
  await expect(player(page).getByText('GAME ON')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('video-ai-done')).toBeVisible();
  await expect(page.getByTestId('video-stage-busy')).toHaveCount(0);
  await expect(page.getByTestId('video-code-error')).toHaveCount(0);
  await expect(page.getByTestId('video-preview-error')).toHaveCount(0);

  // The code pane shows the HTML source under its engine-appropriate tab name.
  await expect(page.getByRole('button', { name: 'composition.html' })).toBeVisible();

  // The bundled broadcast faces are embedded in the composed document (the sandboxed
  // iframe's opaque origin cannot fetch /fonts, so they must ride as data URLs) - the
  // same faces the Remotion side injects, so both engines honour one typography contract.
  const fonts = await page
    .locator('.video-player-frame')
    .evaluate((el: HTMLIFrameElement) => {
      const doc = el.getAttribute('srcdoc') ?? '';
      return { faces: (doc.match(/@font-face/g) ?? []).length, embedded: doc.includes('data:font') || doc.includes('data:application/font') };
    });
  expect(fonts.faces).toBeGreaterThan(0);
  expect(fonts.embedded).toBe(true);

  // The project records the engine and holds the composition in `html`.
  const stored = await page.evaluate(async () => {
    const { useVideoProjectStore } = await import('/src/store/videoProjectStore.ts');
    const p = useVideoProjectStore.getState().project;
    return { engine: p.engine, hasHtml: p.html.includes('data-composition-id'), tsx: p.tsx };
  });
  expect(stored.engine).toBe('hyperframes');
  expect(stored.hasHtml).toBe(true);
  expect(stored.tsx).toBe('');
});

test('clip windows are framework-owned: a late clip is hidden at frame 0 and shown inside its window', async ({ page }) => {
  await createHyperframesProject(page);
  await waitForGeneration(page);
  await awaitVideoPreview(page);
  await expect(player(page).getByText('GAME ON')).toBeVisible({ timeout: 10_000 });

  // Replace the document with one where a second clip starts at 2s (frame 60 at 30fps).
  await page.evaluate(async () => {
    const { useVideoProjectStore } = await import('/src/store/videoProjectStore.ts');
    const s = useVideoProjectStore.getState();
    const secs = s.project.durationInFrames / s.project.fps;
    s.setSource(`<!doctype html>
<html lang="en">
<head><meta charset="UTF-8" /><title>t</title>
<style>
  body { margin: 0; }
  #root { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: #101319; color: #fff; font: 700 90px Arial; }
  .clip { position: absolute; inset: 0; display: grid; place-items: center; }
</style></head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="${secs}">
  <section id="first" class="clip" data-start="0" data-duration="2" data-track-index="1"><div>EARLY CLIP</div></section>
  <section id="second" class="clip" data-start="2" data-duration="${secs - 2}" data-track-index="1"><div>LATE CLIP</div></section>
</div>
<script>
  window.__timelines = window.__timelines || {};
  var tl = gsap.timeline({ paused: true });
  tl.to('#root', { opacity: 1, duration: 0.1 }, 0);
  window.__timelines['main'] = tl;
</script>
</body>
</html>`);
  });

  // At frame 0 only the early clip is visible…
  const scrub = async (frame: number) => {
    await page.getByTestId('video-scrubber').evaluate((el: HTMLInputElement, f) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, String(f));
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, frame);
  };
  await awaitVideoPreview(page);
  await expect(player(page).getByText('EARLY CLIP')).toBeVisible({ timeout: 10_000 });
  await scrub(0);
  await expect(player(page).getByText('EARLY CLIP')).toBeVisible();
  await expect(player(page).getByText('LATE CLIP')).toBeHidden();

  // …and inside the late window the driver swaps them (visibility, not motion).
  await scrub(75);
  await expect(player(page).getByText('LATE CLIP')).toBeVisible({ timeout: 5_000 });
  await expect(player(page).getByText('EARLY CLIP')).toBeHidden();
  // Deterministic: scrubbing back restores the first state.
  await scrub(10);
  await expect(player(page).getByText('EARLY CLIP')).toBeVisible({ timeout: 5_000 });
});

test('composition variables edit live in the Content panel (set-vars, no reload)', async ({ page }) => {
  await createHyperframesProject(page);
  await waitForGeneration(page);
  await awaitVideoPreview(page);
  await expect(player(page).getByText('GAME ON')).toBeVisible({ timeout: 10_000 });

  // The Content tab exposes the variables the DOCUMENT declares (title + accent).
  await page.getByTestId('video-tab-content').click();
  await expect(page.getByTestId('video-content-panel')).toBeVisible();
  const titleField = page.getByTestId('video-input-title');
  await expect(titleField).toHaveValue('GAME ON');
  await expect(page.getByTestId('video-input-accent')).toBeVisible();

  // Editing flows into the mounted document immediately (data-var-text substitution).
  await titleField.fill('PLAYOFFS');
  await expect(player(page).getByText('PLAYOFFS')).toBeVisible({ timeout: 10_000 });
  await expect(player(page).getByText('GAME ON')).toHaveCount(0);

  // The value lives on the project (it rides into the composed render document too).
  const stored = await page.evaluate(async () => {
    const { useVideoProjectStore } = await import('/src/store/videoProjectStore.ts');
    return useVideoProjectStore.getState().project.inputs.find((i) => i.key === 'title')?.value;
  });
  expect(stored).toBe('PLAYOFFS');
});

test('manual code edits update the preview; a broken document keeps the last good version', async ({ page }) => {
  await createHyperframesProject(page, false);
  await waitForGeneration(page);
  await awaitVideoPreview(page);
  await expect(player(page).getByText('MAIN TITLE')).toBeVisible({ timeout: 10_000 });

  // A hand-written valid document replaces the sample.
  await page.evaluate(async () => {
    const { useVideoProjectStore } = await import('/src/store/videoProjectStore.ts');
    const s = useVideoProjectStore.getState();
    const secs = s.project.durationInFrames / s.project.fps;
    s.setSource(`<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><title>m</title>
<style>body{margin:0}#root{position:relative;width:1920px;height:1080px;background:#000;color:#fff;font:700 90px Arial}.clip{position:absolute;inset:0;display:grid;place-items:center}</style>
</head><body>
<div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="${secs}">
  <section class="clip" data-start="0" data-duration="${secs}" data-track-index="1"><div>MANUAL EDIT OK</div></section>
</div>
<script>
  window.__timelines = window.__timelines || {};
  var tl = gsap.timeline({ paused: true });
  tl.to('#root', { opacity: 1, duration: 0.1 }, 0);
  window.__timelines['main'] = tl;
</script>
</body></html>`);
  });
  await awaitVideoPreview(page);
  await expect(player(page).getByText('MANUAL EDIT OK')).toBeVisible();

  // Break the contract (no timeline registration): the error banner appears with the
  // teaching message, and the last good document keeps rendering.
  await page.evaluate(async () => {
    const { useVideoProjectStore } = await import('/src/store/videoProjectStore.ts');
    useVideoProjectStore.getState().setSource('<html><body><div>broken</div></body></html>');
  });
  await expect(page.getByTestId('video-code-error')).toBeVisible({ timeout: 5_000 });
  await expect(page.getByTestId('video-code-error')).toContainText('composition root');
  await expect(player(page).getByText('MANUAL EDIT OK')).toBeVisible();
});

test('chat refinement applies an undoable change to the document', async ({ page }) => {
  await createHyperframesProject(page);
  await waitForGeneration(page);

  const before = await page.evaluate(async () => {
    const { useVideoProjectStore } = await import('/src/store/videoProjectStore.ts');
    return useVideoProjectStore.getState().project.html;
  });

  // "faster" hits the stub's deterministic tween-shortening rule for this engine.
  await page.getByTestId('video-chat-field').fill('make it faster');
  await page.getByRole('button', { name: 'Send', exact: true }).click();
  await expect(page.getByTestId('video-chat')).toContainText('snappier', { timeout: 10_000 });

  const after = await page.evaluate(async () => {
    const { useVideoProjectStore } = await import('/src/store/videoProjectStore.ts');
    return useVideoProjectStore.getState().project.html;
  });
  expect(after).not.toBe(before);

  // Undo reverts BOTH the code and the chat turn (one snapshot).
  await page.keyboard.press('Control+z');
  const reverted = await page.evaluate(async () => {
    const { useVideoProjectStore } = await import('/src/store/videoProjectStore.ts');
    return useVideoProjectStore.getState().project.html;
  });
  expect(reverted).toBe(before);
});

test('reload restores the HyperFrames project; export offers composition.html', async ({ page }) => {
  await createHyperframesProject(page);
  await waitForGeneration(page);
  await awaitVideoPreview(page);
  await expect(player(page).getByText('GAME ON')).toBeVisible({ timeout: 10_000 });

  // Reload: the engine, the document, and the preview all come back, straight into the
  // shell — the startup wizard opens only when there is no work to return to.
  await reloadVideoShell(page);
  await expect(page.locator('.wz-modal')).toBeHidden();
  await awaitVideoPreview(page);
  await expect(player(page).getByText('GAME ON')).toBeVisible({ timeout: 10_000 });
  const engine = await page.evaluate(async () => {
    const { useVideoProjectStore } = await import('/src/store/videoProjectStore.ts');
    return useVideoProjectStore.getState().project.engine;
  });
  expect(engine).toBe('hyperframes');

  // The export tab offers the engine's source download (and the standalone file carries
  // its own GSAP so it is plug-and-play).
  await page.getByTestId('video-tab-export').click();
  const downloadButton = page.getByRole('button', { name: /Download composition\.html/ });
  await expect(downloadButton).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await downloadButton.click();
  const download = await downloadPromise;
  const path = await download.path();
  const fs = await import('node:fs');
  const contents = fs.readFileSync(path, 'utf8');
  expect(contents).toContain('data-composition-id');
  expect(contents).toContain('GSAP (bundled)');
});

test('the offline rule blocks real network loads without blocking XML namespaces', async ({ page }) => {
  // The rule exists to stop the document FETCHING anything at render time. A bare
  // /https?:\/\// match also hit xmlns="http://www.w3.org/2000/svg", so any composition
  // that drew part of itself in SVG was rejected - and no repair round could fix it, since
  // the namespace is what the markup needs. Both halves are pinned here: namespaces and
  // URLs inside comments pass, every genuine remote load still fails.
  await page.goto('/app');
  const results = await page.evaluate(async () => {
    const { staticValidateHyperframes } = await import('/src/video/hyperframes/validate.ts');
    const settings = { width: 1920, height: 1080, fps: 30, durationInFrames: 150, transparent: false };
    const doc = (body: string, head = '') =>
      `<!doctype html><html lang="en"><head><style>body{margin:0}${head}</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="5">${body}</div>
<script>window.__timelines={};var tl=gsap.timeline({paused:true});window.__timelines['main']=tl;</script>
</body></html>`;
    const rules = (html: string) => staticValidateHyperframes(html, [], settings).map((i) => i.rule);
    return {
      inlineSvg: rules(doc('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="4"/></svg>')),
      commentUrl: rules(doc('<!-- easing reference: https://greensock.com/docs --><div>x</div>')),
      remoteImage: rules(doc('<img src="https://cdn.example.com/logo.png">')),
      remoteFont: rules(doc('<div>x</div>', "@import url('https://fonts.googleapis.com/css?family=X');")),
    };
  });
  expect(results.inlineSvg).not.toContain('network-url');
  expect(results.commentUrl).not.toContain('network-url');
  expect(results.remoteImage).toContain('network-url');
  expect(results.remoteFont).toContain('network-url');
});

test('a comment saying the composition avoids a banned API is not a use of it', async ({ page }) => {
  // The prompts ask for commented code, so the model writes exactly the sentences that trip
  // the patterns: `// deterministic distance, no repeat:-1` matched /repeat\s*:\s*-1/ and was
  // rejected. Measured in a 21-run bench: three of three forbidden-api findings were this,
  // and one burned BOTH repair rounds and failed the generation - the finding quotes the
  // offending line, so the model rewords the comment and matches again. Same unwinnable shape
  // as the xmlns bug above. Both halves are pinned: the comment passes, the real call fails.
  await page.goto('/app');
  const results = await page.evaluate(async () => {
    const { staticValidateHyperframes } = await import('/src/video/hyperframes/validate.ts');
    const settings = { width: 1920, height: 1080, fps: 30, durationInFrames: 150, transparent: false };
    const doc = (script: string, body = '<div>x</div>') =>
      `<!doctype html><html lang="en"><head><style>body{margin:0}</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="5">${body}</div>
<script>window.__timelines={};var tl=gsap.timeline({paused:true});${script}window.__timelines['main']=tl;</script>
</body></html>`;
    const rules = (html: string) => staticValidateHyperframes(html, [], settings).map((i) => i.rule);
    return {
      lineComment: rules(doc('// two legs, deterministic and finite (no repeat:-1)\n')),
      blockComment: rules(doc('/* seeded scatter - never Math.random() */\n')),
      htmlComment: rules(doc('', '<!-- the pulse is finite, no repeat: -1 --><div>x</div>')),
      realRepeat: rules(doc('tl.to("#x",{opacity:0,repeat: -1,yoyo:true},0);')),
      realRandom: rules(doc('var j = Math.random();')),
    };
  });
  expect(results.lineComment).not.toContain('forbidden-api');
  expect(results.blockComment).not.toContain('forbidden-api');
  expect(results.htmlComment).not.toContain('forbidden-api');
  expect(results.realRepeat).toContain('forbidden-api');
  expect(results.realRandom).toContain('forbidden-api');
});

test('a declared variable nothing reads is rejected as a control that would do nothing', async ({ page }) => {
  // Prompt guidance alone did not hold this: benchmarking saw an accent colour declared and
  // then written as a hex literal, leaving a Content-panel control that changed nothing.
  // Binding is deterministic and checkable, so the platform checks it.
  await page.goto('/app');
  const results = await page.evaluate(async () => {
    const { staticValidateHyperframes } = await import('/src/video/hyperframes/validate.ts');
    const settings = { width: 1920, height: 1080, fps: 30, durationInFrames: 90, transparent: false };
    const doc = (vars: string, body: string, css = '') =>
      `<!doctype html><html lang="en" data-composition-variables='${vars}'>
<head><style>body{margin:0}${css}</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-width="1920" data-height="1080" data-duration="3">
<section class="clip" data-start="0" data-duration="3" data-track-index="1">${body}</section></div>
<script>window.__timelines={};var tl=gsap.timeline({paused:true});window.__timelines['main']=tl;</script>
</body></html>`;
    const unbound = (html: string) =>
      staticValidateHyperframes(html, [], settings)
        .filter((i) => /nothing reads it/.test(i.message))
        .map((i) => i.message.match(/Variable "([^"]+)"/)?.[1]);
    const TITLE = '[{"id":"title","type":"string","label":"T","default":"HELLO"}]';
    const ACCENT = '[{"id":"accent","type":"color","label":"A","default":"#f6a623"}]';
    return {
      boundText: unbound(doc(TITLE, '<h1 data-var-text="title">HELLO</h1>')),
      boundCss: unbound(doc(ACCENT, '<h1>HELLO</h1>', '#root h1 { color: var(--accent, #f6a623); }')),
      boundImage: unbound(
        doc('[{"id":"logo","type":"image","label":"L","default":"logo"}]', '<img data-var-src="logo" src="asset:logo" alt="">'),
      ),
      hardcoded: unbound(doc(ACCENT, '<h1>HELLO</h1>', '#root h1 { color: #f6a623; }')),
      // A container style query reads the custom property without ever writing var(--id),
      // and it is the only route by which a boolean or an enum can change what a viewer
      // sees. The generation contract steers models away from those types for that reason,
      // but a hand-written composition may use one, and rejecting a binding that WORKS is
      // the expensive kind of wrong - it is unfixable, so it burns every repair round.
      styleQuery: unbound(
        doc(
          '[{"id":"compact","type":"boolean","label":"C","default":true}]',
          '<h1>HELLO</h1>',
          '@container style(--compact: true) { #root h1 { font-size: 40px; } }',
        ),
      ),
    };
  });
  expect(results.boundText, 'data-var-text counts as bound').toEqual([]);
  expect(results.boundCss, 'var(--id) in CSS counts as bound').toEqual([]);
  expect(results.boundImage, 'data-var-src counts as bound').toEqual([]);
  expect(results.hardcoded, 'a hex literal instead of var(--accent) is a dead control').toEqual(['accent']);
  expect(results.styleQuery, 'a container style query is a real binding').toEqual([]);
});

