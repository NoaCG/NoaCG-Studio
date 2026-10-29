// covers: src/ai/**, src/templates/importedDesign/designTypes.ts, src/blocks/**
// covers: src/components/{editorFoundation/EditorFoundation,wizard/steps/FinishStep}.tsx, src/components/ExportWindow.tsx
// covers: src/components/wizard/import/**
// covers: src/components/{fields/**,HostedControlPage.tsx}
// covers: src/components/home/GraphicControlPage.tsx, src/templates/shared/textFit.ts
// covers: src/components/wizard/**, !src/components/wizard/import/**
//
// assets/eraseRegion.ts is the deterministic flat-fill erase behind the Import Graphic Prepare
// step, so an edit there must run this spec rather than leave it to the nightly.
// covers: src/assets/**

import { test, expect, type Page } from '@playwright/test';
import { lowerThirdPng } from './_png';
import { addToProductionFromFinish, finishIntoNewEditor, openExportWindow } from './_create';
import { editorPreview, mountWorkingDocument } from './_frame';
import { settleDurableWrites } from './_durable';

// The Import Graphic workflow, end to end (docs/IMPORT_MVP.md): a flat PNG design becomes
// a working SPX template with editable text fields and per-layer animation.
//
// The wizard is a SETUP flow, not a second editor: the entry card and the drop (one file,
// several, a finished .html, opaque artwork), Prepare (the erase and its opening proposal),
// the Text step (proposed fields, a picture slot, placement room), Finish's doors (the editor,
// a production, the export window), and the created document's fit contract and whole-unit
// animation — the USER'S path, without the old dock's panels.

async function dropDesign(page: Page, width = 1920, height = 1080) {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name: 'lower-third.png',
    mimeType: 'image/png',
    buffer: lowerThirdPng(width, height),
  });
}

/** The fixture with fields: the created design plus Name (f0) and Title (f1), the two the
 *  Text step proposes for the empty panel (assets/suggestFields.ts) before Finish. */
async function createImported(page: Page) {
  await dropDesign(page);
  await page.locator('.wz-next').click(); // Prepare
  await page.locator('.wz-next').click(); // Text
  await expect(page.getByTestId('place-field-Name')).toBeVisible();
  await expect(page.getByTestId('place-field-Title')).toBeVisible();
  await finishIntoNewEditor(page);
}

/**
 * Drop several files at once, the way a browser delivers them.
 *
 * The step's file input has no `multiple`, so `setInputFiles` cannot reach this path at all:
 * only a real drag carries more than one file, which is why this builds a DataTransfer and
 * dispatches the drop itself. The PNGs are drawn here rather than imported as fixtures because
 * the test is about how many files arrived and what was said, never about their pixels.
 */
async function dropFiles(page: Page, names: string[]) {
  await page.evaluate(async (fileNames) => {
    const transfer = new DataTransfer();
    for (const name of fileNames) {
      if (name.endsWith('.svg')) {
        transfer.items.add(
          new File(
            ['<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"></svg>'],
            name,
            { type: 'image/svg+xml' },
          ),
        );
        continue;
      }
      // Anything that is not artwork at all - the readme swept up with the boards.
      if (name.endsWith('.txt')) {
        transfer.items.add(new File(['not artwork'], name, { type: 'text/plain' }));
        continue;
      }
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#3a5f8a';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      transfer.items.add(new File([blob!], name, { type: 'image/png' }));
    }
    document
      .querySelector('.wz-drop')!
      .dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, names);
}

// SEVERAL PICTURES AT ONCE (https://github.com/NoaCG/NoaCG-Studio/blob/01f6cfd26c21be5205177e7f2b540c7fb06f9bb4/docs/backlog/dropping-several-files-at-once.md). One is imported and
// the rest are dropped on the floor, which is fine as a rule and was a defect as behaviour: the
// step used to read as a complete success. What is guarded here is the SENTENCE, because the
// import itself never changed - a green import is exactly what made the old bug invisible.
test('import graphic: a multi-file drop names the design used and every design skipped', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();

  await dropFiles(page, ['board-a.png', 'board-b.png', 'board-c.png', 'board-d.png', 'board-e.png']);

  // The first raster still wins, exactly as before, and the notice accounts for the other four.
  await expect(page.locator('.asset-card')).toContainText('board-a.png');
  const notice = page.getByTestId('import-multi-drop-notice');
  await expect(notice).toContainText('Used board-a.png');
  for (const skipped of ['board-b.png', 'board-c.png', 'board-d.png', 'board-e.png']) {
    await expect(notice).toContainText(skipped);
  }
  // Every picture was equally usable, so there is no ranking to explain and none is offered.
  await expect(notice).not.toContainText('because');

  // MIXED KINDS ARE THE CASE THE USER CANNOT WORK OUT ALONE: two kinds of design file arrived and
  // the SVG outranked the raster whichever way round they were dragged, so the notice says why.
  await dropFiles(page, ['the-one-i-want.png', 'artwork.svg']);
  await expect(page.getByTestId('import-svg-card')).toBeVisible();
  await expect(notice).toContainText('Used artwork.svg');
  await expect(notice).toContainText('the-one-i-want.png');
  await expect(notice).toContainText('the better import');

  // A FILE THIS STEP CANNOT READ IS NAMED, BUT NOT INVITED BACK. "Bring the others in one at a
  // time - each becomes its own graphic" is true of another picture and false of a readme, and
  // sending someone off to drag in a file that errors out is its own small lie.
  await dropFiles(page, ['design.png', 'notes.txt']);
  await expect(notice).toContainText('notes.txt is not a design file');
  await expect(notice).not.toContainText('each becomes its own graphic');

  // The ordinary one-file drop keeps its uncluttered path and clears the earlier explanation.
  await page.getByRole('button', { name: '✕ Use a different design' }).click();
  await dropFiles(page, ['board-only.png']);
  await expect(page.locator('.asset-card')).toContainText('board-only.png');
  await expect(notice).toHaveCount(0);
});

test('import graphic: the imported design animates — whole unit in, whole unit out', async ({ page }) => {
  await createImported(page);

  // The created template carries a NOACG_ANIM data block whose default motion names the design
  // box as one unit. Played the way playout plays it, in a composer iframe of the working
  // document: GSAP writes inline styles onto the targets it animates, so the box gets them and a
  // field must not be touched on its own — that is exactly what would tear a flat design away
  // from artwork drawn around it — and the whole graphic leaves together on stop.
  const hasData = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    return !!parseAnimData(useTemplateStore.getState().template.js);
  });
  expect(hasData).toBe(true);
  const doc = await mountWorkingDocument(page);
  const opacity = () => doc.locator('.imported-design').evaluate((el) => getComputedStyle(el).opacity);
  await doc.locator('body').evaluate(() => (window as unknown as { play: () => void }).play());
  await expect.poll(opacity).toBe('1');
  expect(await doc.locator('.imported-design-box').getAttribute('style')).not.toBe('');
  expect(await doc.locator('#f0').getAttribute('style') ?? '').toBe('');
  await doc.locator('body').evaluate(() => (window as unknown as { stop: () => void }).stop());
  await expect.poll(opacity).toBe('0');
});

test('import graphic: a cropped design is placed as an object, not stretched', async ({ page }) => {
  await dropDesign(page, 900, 260);
  await expect(page.locator('.asset-card')).toContainText('900 × 260');
  await expect(page.locator('.wz-step')).toContainText('Smaller than');
  await finishIntoNewEditor(page);

  // A floating design keeps its own size and sits in the default zone as an object.
  const frame = editorPreview(page);
  await expect(frame.locator('.imported-design-art')).toBeVisible();
  const width = await frame
    .locator('.imported-design-box')
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.round(width)).toBe(900);
});

test('import graphic: a 2× export is shown frame-sized, not pushed off the frame', async ({ page }) => {
  // A retina/2x export of a 1080p design is one of the likeliest files to be dropped here.
  // At natural size only its top-left quadrant would fit the frame — a lower third drawn in
  // its bottom half would be entirely off-screen, an invisible graphic.
  await dropDesign(page, 3840, 2160);
  await expect(page.locator('.asset-card')).toContainText('3840 × 2160');
  await expect(page.locator('.wz-step')).toContainText('2× export');
  await finishIntoNewEditor(page);

  // The design unit is exactly the frame's width: edge to edge, as drawn (--scale is 1 here).
  const frame = editorPreview(page);
  await expect(frame.locator('.imported-design-art')).toBeVisible();
  const width = await frame
    .locator('.imported-design-box')
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.round(width)).toBe(1920);
});

// ── Fit: a long operator value has to stay inside the room the design gives the line.
//    Placed lines used to be uncapped and nowrap, so a long name ran clean off the
//    artwork (templates/shared/textFit.ts). ──

test('import graphic: a new field is born with a slot, so a long value cannot run off the design', async ({ page }) => {
  await createImported(page);

  // The Text step's field emits the whole fit contract: the wrapper's slot, the shrink marker
  // on the line, and the design-owned runtime (with the shared update()'s hook calling it).
  const state = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { lineFit } = await import('/src/blocks/designLayout.ts');
    const t = useTemplateStore.getState().template;
    return {
      fit: lineFit(t.html, t.css, 'f0'),
      marked: /<span id="f0"[^>]*data-fit="shrink"/.test(t.html),
      runtime: t.js.includes('function fitPlacedText'),
      hook: t.js.includes('typeof fitPlacedText'),
    };
  });
  expect(state.fit?.mode).toBe('shrink');
  expect(state.fit!.maxWidth!).toBeGreaterThan(0);
  expect(state.marked).toBe(true);
  expect(state.runtime).toBe(true);
  expect(state.hook).toBe(true);
});

test('import graphic: live long-to-short values restore the text size in the same control preview', async ({ page }) => {
  await createImported(page);
  await page.locator('.ef-track[data-selector="#f0"] .ef-layer').click();
  const width = page.getByRole('spinbutton', { name: 'Width', exact: true });
  await width.fill('420');
  await width.press('Enter');
  await expect.poll(() => editorPreview(page).locator('#fw0').evaluate(el => getComputedStyle(el).maxWidth)).toBe('420px');

  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Live text fit');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await settleDurableWrites(page);
  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-graphics').click();
  const row = page.locator('.lib-row', { hasText: 'Live text fit' });
  await row.getByTestId('row-menu').click();
  await row.getByTestId('open-control').click();
  await expect(page.getByTestId('graphic-control-page')).toBeVisible();
  await page.getByTestId('add-entry').click();
  const name = page.getByTestId('entry-field-f0');
  const frame = page.frameLocator('iframe[title="Graphic preview"]');
  const line = frame.locator('#f0');
  await name.fill('Ada Lovelace');
  await page.getByTestId('control-play').click();
  await expect(line).toHaveText('Ada Lovelace');
  await line.evaluate(async () => { await document.fonts.ready; });
  const drawnSize = await line.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(drawnSize).toBeGreaterThan(0);
  // Holding the actual Document proves an update, rather than a reload that clears fitted styles.
  const previewDocument = await frame.locator('body').evaluateHandle(el => el.ownerDocument);

  await name.fill('Alexandra Fitzgerald');
  await page.getByTestId('control-update').click();
  await expect(line).toHaveText('Alexandra Fitzgerald');
  await expect.poll(() => line.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeLessThan(drawnSize);
  const fitted = await line.evaluate(el => ({ width: el.getBoundingClientRect().width, size: parseFloat(getComputedStyle(el).fontSize) }));
  expect(fitted.size).toBeGreaterThanOrEqual(drawnSize * .55 - .01);
  expect(fitted.width).toBeLessThanOrEqual(421);

  await name.fill('Ada Lovelace');
  await page.getByTestId('control-update').click();
  await expect(line).toHaveText('Ada Lovelace');
  await expect.poll(() => line.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeCloseTo(drawnSize, 1);
  expect(await previewDocument.evaluate(original => original === original.defaultView?.document)).toBe(true);
  await previewDocument.dispose();
});

test('import graphic: the exported SPX package validates', async ({ page }) => {
  await createImported(page);
  await openExportWindow(page);
  // Export is gated on zero validation errors; the window says so inline.
  await expect(page.getByTestId('export-window').locator('.status-ok')).toContainText('valid and ready');
});

test('the Text step places fields in the artwork’s empty panel by itself', async ({ page }) => {
  // An empty backplate is the common import: a strap drawn to hold words, exported with the
  // words left out. assets/suggestFields.ts measures that panel (no model call, no network),
  // so the step opens with Name and Title already inside it — the manual tools stay exactly
  // where they were for artwork it cannot read.
  await dropDesign(page);
  await page.waitForTimeout(800);
  await page.locator('.wz-next').click(); // Prepare
  await page.locator('.wz-next').click(); // Text
  await expect(page.getByTestId('place-stage')).toBeVisible();

  await expect(page.getByTestId('place-field-Name')).toBeVisible();
  await expect(page.getByTestId('place-field-Title')).toBeVisible();
  await expect(page.getByTestId('suggest-note')).toBeVisible();

  // And they land INSIDE the panel: lowerThirdPng draws its opaque block across 6–53% of the
  // width and 70–86% of the height, so a field outside that range is on transparent nothing.
  const stage = (await page.getByTestId('place-stage').boundingBox())!;
  for (const title of ['Name', 'Title']) {
    const box = (await page.getByTestId(`place-field-${title}`).boundingBox())!;
    const left = (box.x - stage.x) / stage.width;
    const top = (box.y - stage.y) / stage.height;
    const bottom = (box.y + box.height - stage.y) / stage.height;
    expect(left, `${title} left`).toBeGreaterThanOrEqual(0.06);
    expect(left, `${title} left`).toBeLessThan(0.53);
    expect(top, `${title} top`).toBeGreaterThanOrEqual(0.70);
    expect(bottom, `${title} bottom`).toBeLessThanOrEqual(0.87);
  }
});

test('the Text step gives the placement canvas more room than the passive preview', async ({ page }) => {
  // You PLACE fields on the left canvas; the right pane only shows the result. The working
  // surface used to be the smaller of the two (a fixed 520px against a ~700px preview), so
  // text was positioned on a downscaled picture of the artwork.
  await dropDesign(page);
  await page.waitForTimeout(800);
  await page.locator('.wz-next').click(); // Prepare
  await page.locator('.wz-next').click(); // Text
  await expect(page.getByTestId('place-stage')).toBeVisible();
  const working = (await page.getByTestId('place-stage').boundingBox())!;
  const preview = (await page.locator('.wz-stage').boundingBox())!;
  expect(working.width).toBeGreaterThan(preview.width);
  expect(working.width).toBeGreaterThan(700); // and it actually grew, not just won by shrinking the preview
});

/** A finished SPX template as a file — what a student who already has the graphic brings. */
const FINISHED_TEMPLATE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Studio strap</title>
<style>
  body { margin: 0; background: transparent; }
  #root { position: absolute; left: 120px; top: 760px; width: 900px; height: 190px;
          background: #12203a; color: #fff; font: 700 54px/1 sans-serif; padding: 24px; box-sizing: border-box; }
</style>
<script>
  window.SPXGCTemplateDefinition = { description: 'Studio strap', DataFields: [
    { field: 'f0', ftype: 'textfield', title: 'Name', value: 'Alexandra Riva' },
    { field: 'f1', ftype: 'textfield', title: 'Title', value: 'Correspondent' } ] };
  function update(data) {}
  function play() {}
  function stop() {}
  function next() {}
</script></head>
<body><div id="root"><span id="f0">Alexandra Riva</span><span id="f1">Correspondent</span></div></body></html>`;

test('import graphic: a finished .html template comes in as itself, fields and all', async ({ page }) => {
  // "I already have this graphic" is the same errand as "I already have this picture", so the
  // same drop zone takes both and the FILE decides the walk. A template has nothing to erase,
  // place or animate — it declares all three — so its rail is two stops, not six.
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name: 'studio-strap.html',
    mimeType: 'text/html',
    buffer: Buffer.from(FINISHED_TEMPLATE, 'utf8'),
  });

  // What it FOUND — led by the operator fields, which are what make it usable on air rather
  // than a picture that plays.
  await expect(page.getByTestId('import-template-card')).toContainText('Studio strap');
  await expect(page.getByTestId('import-template-fields')).toContainText('Name, Title');
  await expect(page.locator('.wz-dots .wz-dot')).toHaveCount(3);

  await page.locator('.wz-next').click();
  await expect(page.getByTestId('wz-finish-production-go')).toBeVisible();
  await expect(page.getByTestId('wz-finish-export')).toBeVisible();
  // The editor is never the way out of an import: the default studio hides that door.
  await expect(page.getByTestId('wz-finish-editor')).toHaveCount(0);
  await expect(page.locator('.wz-finish-summary')).toContainText('Kept exactly as written');
});

test('import graphic: the production door goes straight to the rundown, never through the editor', async ({ page }) => {
  // The owner watched the canvas flash past on the way to the rundown (walk, 2026-09-01). It was
  // a real route, not a paint: the create applied with no `skipNavigation`, so it replaced the
  // route with the editor's and the production replace landed a beat later, mounting the whole
  // editor shell in between.
  //
  // Asserted on the ROUTES WRITTEN, because that is the thing that was wrong and the thing a
  // screenshot cannot catch. `routeHash({ view: 'editor' })` is the empty hash, so an editor
  // route shows up here as a bare pathname.
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name: 'studio-strap.html',
    mimeType: 'text/html',
    buffer: Buffer.from(FINISHED_TEMPLATE, 'utf8'),
  });
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('wz-finish-production-go')).toBeVisible();

  await page.evaluate(() => {
    const w = window as unknown as { __routes: string[] };
    w.__routes = [];
    const orig = history.replaceState.bind(history);
    history.replaceState = (a, b, url) => {
      w.__routes.push(String(url));
      return orig(a, b, url ?? null);
    };
  });
  await addToProductionFromFinish(page);

  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('creation-wizard')).toBeHidden();
  const routes = await page.evaluate(() => (window as unknown as { __routes: string[] }).__routes);
  // Exactly one route was written, and it is the production's. Before the fix this read
  // ["/app", "#/production/…"] - the editor, then the rundown.
  expect(routes).toHaveLength(1);
  expect(routes[0]).toMatch(/^#\/production\//);
});

test('import graphic: the imported template exports as the code that was dropped', async ({ page }) => {
  await page.goto('/app');
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name: 'studio-strap.html',
    mimeType: 'text/html',
    buffer: Buffer.from(FINISHED_TEMPLATE, 'utf8'),
  });
  await page.locator('.wz-next').click();
  await page.getByTestId('wz-finish-name').fill('Studio strap A');
  await page.getByTestId('wz-finish-export').click();

  // The export door saves first, so the working project IS the imported file — its own markup,
  // its own fields, under the name that slugs the package.
  const built = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const t = useTemplateStore.getState().template;
    return { name: t.name, fields: t.fields.map((f) => f.title), root: t.html.includes('id="root"') };
  });
  expect(built).toMatchObject({ name: 'Studio strap A', fields: ['Name', 'Title'], root: true });
});

test('the Text step places a picture slot the operator fills from the control panel', async ({ page }) => {
  // A crest, a headshot, a sponsor mark: the design reserves the box, the operator brings the
  // file. It has to be reachable WITHOUT the editor, like every other field on this step.
  await dropDesign(page);
  await page.waitForTimeout(800);
  await page.locator('.wz-next').click(); // Prepare
  await page.locator('.wz-next').click(); // Text
  const stage = page.getByTestId('place-stage');
  await expect(stage).toBeVisible();

  await page.getByTestId('tool-image').click();
  const box = (await stage.boundingBox())!;
  const x = box.x + box.width * 0.34;
  const y = box.y + box.height * 0.73;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y + 55, { steps: 6 });
  await page.mouse.up();

  // Named, sized, and typography-free: what an operator supplies here is a FILE.
  await expect(page.getByTestId('place-field-Logo')).toBeVisible();
  await expect(page.getByTestId('field-slot-width')).toBeVisible();
  await expect(page.getByTestId('field-size')).toHaveCount(0);

  await finishIntoNewEditor(page);

  // A real SPX image field (filelist), a real <img> in the design, and a placed, sized box.
  const built = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const t = useTemplateStore.getState().template;
    const logo = t.fields.find((f) => f.title === 'Logo');
    // Built with concatenation, not a template literal: `\s` and `\{` are NOT escapes inside
    // one, so an inlined pattern silently becomes `#fw2s*{…` and matches nothing.
    const wrapper = logo
      ? t.css.match(new RegExp('#fw' + logo.field.slice(1) + '\\s*\\{[^}]*\\}'))?.[0] ?? ''
      : '';
    return {
      ftype: logo?.ftype ?? null,
      img: logo ? new RegExp('<img[^>]*id="' + logo.field + '"').test(t.html) : false,
      sized: /width:\s*calc\(\d+px/.test(wrapper) && /height:\s*calc\(\d+px/.test(wrapper),
    };
  });
  expect(built).toEqual({ ftype: 'filelist', img: true, sized: true });
});

test('import graphic: full-frame artwork with no transparency says it will cover the picture', async ({ page }) => {
  // The commonest export mistake: the lower third saved with its mock-up background (or a
  // frame of footage) still behind it. On air that covers the live picture completely. It is
  // stated, never blocked — a full-screen card is a real graphic with the same pixels.
  await page.goto('/app');
  await page.locator('[data-entry="import-graphic"]').click();
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#0b0f16';
    g.fillRect(0, 0, 1920, 1080); // opaque, edge to edge
    g.fillStyle = '#161d2a';
    g.fillRect(120, 760, 900, 190);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob!], 'flattened.png', { type: 'image/png' }));
    const input = document.querySelector('.wz-drop input[type=file]') as HTMLInputElement;
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.getByTestId('import-opaque-warning')).toBeVisible();

  // The same design exported properly — a strap on transparency — says nothing.
  await page.locator('.wz-drop').click({ position: { x: 10, y: 10 } });
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, 1920, 1080);
    g.fillStyle = '#161d2a';
    g.fillRect(120, 760, 900, 190);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob!], 'strap.png', { type: 'image/png' }));
    const input = document.querySelector('.wz-drop input[type=file]') as HTMLInputElement;
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('.asset-card')).toContainText('strap.png');
  await expect(page.getByTestId('import-opaque-warning')).toHaveCount(0);
});

// ── The Prepare step's OPENING PROPOSAL ──────────────────────────────────────────────────
//
// The erase is the workhorse of this flow (docs/IMPORT_MVP.md's audit: it answers 9 of the 10
// designs, where the empty-panel detector answers none of the baked ones), but it only ran if
// the student thought to drag a box. `assets/eraseRegion.ts proposeEraseRect` scans the
// artwork and opens with the rectangle drawn, deterministically and with no model call.

const STRAP = { x: 120, y: 760, w: 940, h: 190 };
/** The second baked block: a score bug at the top of the frame, on its own panel. */
const SCORE = { x: 120, y: 120, w: 560, h: 120 };

/**
 * A strap with REAL typeset words baked into the file — what a student sends when nobody told
 * them to export the design without its text. It returns the artwork AND the true box of the
 * painted glyphs, scanned off the canvas: the proposal is checked against the words as they
 * landed, not against the coordinates the fixture asked for.
 *
 * With `score`, a SECOND baked block is drawn far above the strap — a design carrying two
 * separate pieces of text, which is what a real scoreboard is. The scan offers one region at a
 * time, so the second block's ink box is returned alongside the first.
 */
async function bakedStrap(page: Page, opts: { score?: boolean } = {}) {
  return page.evaluate(
    async ({ s, sc, withScore }) => {
      const face = new FontFace('Inter', 'url(/fonts/inter.woff2)');
      await face.load();
      document.fonts.add(face);
      const c = document.createElement('canvas');
      c.width = 1920;
      c.height = 1080;
      const g = c.getContext('2d')!;
      g.fillStyle = '#101b2e';
      g.fillRect(s.x, s.y, s.w, s.h);
      g.fillStyle = '#f6a623';
      g.fillRect(s.x, s.y, 14, s.h); // the accent bar: furniture the erase must not swallow
      g.fillStyle = '#ffffff';
      g.textBaseline = 'top';
      g.font = '700 56px Inter';
      g.fillText('Alexandra Riva', 170, 800);
      g.font = '400 31px Inter';
      g.fillText('Correspondent', 170, 870);
      if (withScore) {
        g.fillStyle = '#101b2e';
        g.fillRect(sc.x, sc.y, sc.w, sc.h);
        g.fillStyle = '#ffffff';
        g.font = '700 48px Inter';
        g.fillText('ARS 2 - 1 CHE', 150, 155);
      }
      const d = g.getImageData(0, 0, 1920, 1080).data;
      /** The true box of the white glyphs inside one zone, as they actually landed. */
      const inkIn = (z: { x: number; y: number; w: number; h: number }) => {
        const ink = { left: 1e9, right: -1, top: 1e9, bottom: -1 };
        for (let y = z.y; y < z.y + z.h; y++) {
          for (let x = z.x; x < z.x + z.w; x++) {
            const p = (y * 1920 + x) * 4;
            if (d[p] > 200 && d[p + 1] > 200 && d[p + 2] > 200) {
              if (x < ink.left) ink.left = x;
              if (x > ink.right) ink.right = x;
              if (y < ink.top) ink.top = y;
              if (y > ink.bottom) ink.bottom = y;
            }
          }
        }
        return ink;
      };
      return {
        base64: c.toDataURL('image/png').split(',')[1],
        ink: inkIn(s),
        scoreInk: withScore ? inkIn(sc) : null,
      };
    },
    { s: STRAP, sc: SCORE, withScore: Boolean(opts.score) },
  );
}

/** Drop artwork built in the page, and walk Design -> Prepare. */
async function toPrepare(page: Page, base64: string, name = 'strap.png') {
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer: Buffer.from(base64, 'base64'),
  });
  await expect(page.locator('.asset-card')).toContainText('1920 × 1080');
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('erase-surface')).toBeVisible();
}

/** The proposal rectangle in the ARTWORK's own pixels, read back off its rendered box. */
async function proposedRect(page: Page) {
  const surface = (await page.getByTestId('erase-surface').boundingBox())!;
  const box = (await page.getByTestId('erase-proposal-rect').boundingBox())!;
  const k = 1920 / surface.width;
  return {
    x: (box.x - surface.x) * k,
    y: (box.y - surface.y) * k,
    width: box.width * k,
    height: box.height * k,
  };
}

test('the Prepare step opens with the baked-in text already boxed', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  const art = await bakedStrap(page);
  await toPrepare(page, art.base64);

  // The question "does it have baked-in text?" is answered by measuring, so it is not asked.
  await expect(page.getByTestId('erase-proposal')).toContainText('2 lines');
  await expect(page.getByTestId('baked-yes')).toHaveCount(0);

  // The box covers every painted glyph — and stays inside the strap, so the ring that decides
  // the fill has real background to sample and the amber accent bar is not swallowed with it.
  const rect = await proposedRect(page);
  expect(rect.x).toBeLessThanOrEqual(art.ink.left);
  expect(rect.x + rect.width).toBeGreaterThanOrEqual(art.ink.right);
  expect(rect.y).toBeLessThanOrEqual(art.ink.top);
  expect(rect.y + rect.height).toBeGreaterThanOrEqual(art.ink.bottom);
  expect(rect.x).toBeGreaterThan(STRAP.x + 14);
  expect(rect.y).toBeGreaterThan(STRAP.y);
  expect(rect.y + rect.height).toBeLessThan(STRAP.y + STRAP.h);

  // Accepting it is the ordinary erase: flat fill, a field per measured line.
  await page.getByTestId('erase-proposal-accept').click();
  await expect(page.getByTestId('erase-done')).toContainText('erased cleanly');
  await expect(page.getByTestId('erase-done')).toContainText('2 text fields');
  await expect(page.getByTestId('erase-warning')).toHaveCount(0);
  // …and the scan re-runs on the CLEANED artwork, which now holds no words to offer.
  await expect(page.getByTestId('erase-proposal')).toHaveCount(0);
});

test('a design with two baked blocks offers them one at a time until nothing is left', async ({
  page,
}) => {
  // Every other fixture bakes exactly ONE block, so the branch that serves a real scoreboard —
  // "accepting this rectangle re-runs the scan, which offers the next" — has never executed.
  // This design carries a strap AND a score bug: two separate pieces of text, erased in two
  // rounds, and the scan says nothing only once both are gone.
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  const art = await bakedStrap(page, { score: true });
  await toPrepare(page, art.base64, 'scoreboard.png');

  /** Does the offered rectangle cover this zone's ink, and stay inside the zone's panel? */
  const covers = (
    rect: { x: number; y: number; width: number; height: number },
    ink: { left: number; right: number; top: number; bottom: number },
    zone: { x: number; y: number; w: number; h: number },
  ) =>
    rect.x <= ink.left &&
    rect.x + rect.width >= ink.right &&
    rect.y <= ink.top &&
    rect.y + rect.height >= ink.bottom &&
    rect.x >= zone.x &&
    rect.x + rect.width <= zone.x + zone.w &&
    rect.y >= zone.y &&
    rect.y + rect.height <= zone.y + zone.h;

  // ROUND ONE. Whichever block the scan ranks strongest, it offers ONE of them — never a box
  // spanning both, which is what a scan guessing at all of them at once would draw.
  await expect(page.getByTestId('erase-proposal')).toBeVisible();
  const first = await proposedRect(page);
  const firstIsStrap = covers(first, art.ink, STRAP);
  expect(firstIsStrap || covers(first, art.scoreInk!, SCORE)).toBe(true);

  await page.getByTestId('erase-proposal-accept').click();
  await expect(page.getByTestId('erase-done')).toContainText('erased cleanly');
  await expect(page.getByTestId('erase-warning')).toHaveCount(0);
  await expect(page.getByTestId('erase-marks').locator('li')).toHaveCount(1);

  // ROUND TWO: the scan re-ran on the CLEANED artwork and found the OTHER block.
  await expect(page.getByTestId('erase-proposal')).toBeVisible();
  const second = await proposedRect(page);
  expect(
    firstIsStrap ? covers(second, art.scoreInk!, SCORE) : covers(second, art.ink, STRAP),
  ).toBe(true);

  await page.getByTestId('erase-proposal-accept').click();
  await expect(page.getByTestId('erase-marks').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('erase-done')).toContainText('erased cleanly');
  await expect(page.getByTestId('erase-warning')).toHaveCount(0);

  // Both regions kept their own measured lines: the strap's name over its title is two, the
  // score bug is one — so three fields, not one per rectangle and not two for the pair.
  const marks = page.getByTestId('erase-marks').locator('li');
  await expect(marks.filter({ hasText: '2 lines' })).toHaveCount(1);
  await expect(marks.filter({ hasText: '1 line' })).toHaveCount(1);
  await expect(page.getByTestId('erase-done')).toContainText('3 text fields');

  // …and the loop STOPS: the cleaned artwork holds no words, so nothing more is offered.
  await expect(page.getByTestId('erase-proposal')).toHaveCount(0);
  await expect(page.getByTestId('erase-proposal-rect')).toHaveCount(0);
});

test('the proposed box is dragged and resized before it is accepted', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  const art = await bakedStrap(page);
  await toPrepare(page, art.base64);
  const before = await proposedRect(page);

  // The corner grip resizes from its own edges: the far edges hold still.
  const grip = (await page.getByTestId('erase-proposal-grip-se').boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 24, grip.y + grip.height / 2 + 10, { steps: 4 });
  await page.mouse.up();
  const resized = await proposedRect(page);
  expect(resized.width).toBeGreaterThan(before.width + 40);
  expect(resized.height).toBeGreaterThan(before.height + 10);
  expect(Math.abs(resized.x - before.x)).toBeLessThan(3);
  expect(Math.abs(resized.y - before.y)).toBeLessThan(3);

  // The body drags the whole box, keeping its size.
  const body = (await page.getByTestId('erase-proposal-rect').boundingBox())!;
  await page.mouse.move(body.x + body.width / 2, body.y + body.height / 2);
  await page.mouse.down();
  await page.mouse.move(body.x + body.width / 2 + 18, body.y + body.height / 2, { steps: 4 });
  await page.mouse.up();
  const dragged = await proposedRect(page);
  expect(dragged.x).toBeGreaterThan(resized.x + 40);
  expect(Math.abs(dragged.width - resized.width)).toBeLessThan(3);

  // Nothing has been filled by any of this — it is an offer until it is accepted.
  await expect(page.getByTestId('erase-done')).toHaveCount(0);
  await page.getByTestId('erase-proposal-dismiss').click();
  await expect(page.getByTestId('erase-proposal-rect')).toHaveCount(0);
  await expect(page.getByTestId('erase-done')).toHaveCount(0);
});

test('a proposal against the artwork edge still has grips you can grab', async ({ page }) => {
  // MOST professional lower thirds have no panel at all (the corpus's §4 finding), so their
  // baked words sit against the artwork's own edge and the proposal is drawn clamped to it.
  // Every other fixture here boxes text in the MIDDLE of a panel, so the edge case — where the
  // grips straddle the surface's own boundary and `.wz-prep-surface` clips its overflow — is
  // only ever exercised by driving one. It is driven rather than asserted on, because a
  // clipped element still reports its full box to `boundingBox` and still passes
  // `toBeVisible`: whether the press LANDS is the only honest question.
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  const base64 = await page.evaluate(async () => {
    const face = new FontFace('Inter', 'url(/fonts/inter.woff2)');
    await face.load();
    document.fonts.add(face);
    const c = document.createElement('canvas');
    c.width = 1920;
    c.height = 1080;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 1920, 1080); // panel-less: nothing but the words, on transparency
    g.fillStyle = '#ffffff';
    g.textBaseline = 'top';
    g.font = '700 56px Inter';
    g.fillText('Alexandra Riva', 2, 2);
    return c.toDataURL('image/png').split(',')[1];
  });
  await toPrepare(page, base64, 'edge.png');

  // Clamped to the artwork's own edges. The few source px of slack are the surface's 1px
  // border: `proposedRect` measures against the surface's BORDER box while the overlay is
  // placed against its padding box, and one screen px is three source px at this scale.
  const before = await proposedRect(page);
  expect(before.x).toBeLessThan(10);
  expect(before.y).toBeLessThan(10);

  // A box drawn tight around one line of type is only about a dozen SCREEN px tall, so the
  // vertical drag is small on purpose: a bigger one collapses the box onto its minimum size,
  // where the clamp — not the grip — decides the result and the test proves nothing.
  const grip = (await page.getByTestId('erase-proposal-grip-nw').boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 24, grip.y + grip.height / 2 + 4, { steps: 4 });
  await page.mouse.up();

  // The press landed on the grip, so the box resized from its own corner: the far edges held.
  const after = await proposedRect(page);
  expect(after.x).toBeGreaterThan(before.x + 40);
  expect(after.y).toBeGreaterThan(before.y + 8);
  expect(Math.abs(after.x + after.width - (before.x + before.width))).toBeLessThan(6);
  expect(Math.abs(after.y + after.height - (before.y + before.height))).toBeLessThan(6);
});

test('artwork with no baked-in text is offered nothing, and names the rule that refused', async ({ page }) => {
  // The SAME strap exported the way students are told to: with the words left out. A design
  // made of solid shapes carries two stroke edges per shape per row and never reaches the
  // bar, so the honest answer is an empty canvas — a box drawn on the wrong thing costs the
  // student more than one they simply drag themselves.
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  const base64 = await page.evaluate(async (s) => {
    const c = document.createElement('canvas');
    c.width = 1920;
    c.height = 1080;
    const g = c.getContext('2d')!;
    g.fillStyle = '#101b2e';
    g.fillRect(s.x, s.y, s.w, s.h);
    g.fillStyle = '#f6a623';
    g.fillRect(s.x, s.y, 14, s.h);
    return c.toDataURL('image/png').split(',')[1];
  }, STRAP);
  await toPrepare(page, base64, 'clean.png');

  await expect(page.getByTestId('erase-proposal')).toHaveCount(0);
  await expect(page.getByTestId('erase-proposal-rect')).toHaveCount(0);
  await expect(page.getByTestId('erase-scan-refusal')).toContainText('stroke edges');
  // The manual path is untouched: the question is still asked, and answering it still works.
  await page.getByTestId('baked-yes').click();
  await expect(page.getByTestId('erase-surface')).toBeVisible();
});

test('detected text walked past unerased follows to the Text step as an honest note', async ({ page }) => {
  // The wizard never blocks Next, so ignoring the proposal must not silently drop the fact:
  // fields placed now would sit ON TOP of the baked words, and nothing said so (the broadcaster-demo
  // complaint "the text is not being removed" was exactly this walk).
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  const art = await bakedStrap(page);
  await toPrepare(page, art.base64);
  await expect(page.getByTestId('erase-proposal')).toBeVisible();

  await page.locator('.wz-next').click();
  const note = page.getByTestId('placefields-baked-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('still part of the artwork');

  // Its door goes back to Prepare, where the proposal still stands.
  await page.getByTestId('placefields-baked-back').click();
  await expect(page.getByTestId('erase-proposal')).toBeVisible();
});

test('"it is meant to be there" is an answer the wizard remembers', async ({ page }) => {
  // A wordmark or a deliberate slogan LOOKS like baked text to the scan. Declaring it
  // intentional must silence the note AND stop Prepare re-proposing on every return - an
  // answer that lasts one render is a nag, not a question.
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  const art = await bakedStrap(page);
  await toPrepare(page, art.base64);
  await expect(page.getByTestId('erase-proposal')).toBeVisible();

  await page.locator('.wz-next').click();
  await page.getByTestId('placefields-baked-keep').click();
  await expect(page.getByTestId('placefields-baked-note')).toHaveCount(0);

  // Back on Prepare: no auto-reopened proposal - the quiet "nothing to erase" state, with
  // its own way to change the answer.
  await page.locator('.wz-back').click();
  await expect(page.getByTestId('erase-surface')).toBeVisible();
  await expect(page.getByTestId('erase-proposal')).toHaveCount(0);
  await page.getByTestId('baked-yes').click();
  await expect(page.getByTestId('erase-proposal')).toBeVisible();

  // And forward again: changing the answer back re-arms the note.
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('placefields-baked-note')).toBeVisible();
});
