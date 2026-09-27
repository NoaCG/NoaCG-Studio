// covers: src/components/canvas/**

import { test, expect, type Page } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { createProject } from './_create';
import { showCode } from './_code';
import { canvasBox, elementPoint } from './_canvas';

// Era 6 — the canvas SELECTION model. Clicking a structural element selects it: an amber
// outline plus a chip speaking the TemplatePart registry's label (the same words the
// timeline strip uses). Hover previews what a click would select. Clicking the selected
// element again climbs to its container (panel → whole graphic); empty canvas or Escape
// deselects. Selection is editor UI state ONLY — it never writes into the template.

async function createHairline(page: Page) {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  // These cases assert what a canvas gesture writes into the CODE, and the pane ships closed.
  await showCode(page);
}

/** The mobile stack has no dock model and its own code toggle, so it bootstraps without one. */
async function createHairlineMobile(page: Page) {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
}

/** Wait until the preview shows the settled graphic (the design view after every rebuild). */
async function waitSettled(page: Page) {
  await expect
    .poll(async () =>
      page.frameLocator('iframe.preview-frame').locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity),
    )
    .toBe('1');
}

/** Screen point over a preview element (pad-agnostic — see e2e/_canvas.ts).
 *  dx/dy pick the spot inside the rect — fractions when <= 1, canvas px offsets when > 1. */
async function partPoint(page: Page, selector: string, dx = 0.5, dy = 0.5) {
  const p = await elementPoint(page, selector, dx, dy);
  return { x: p.x, y: p.y };
}

/** The root rule's anchoring sides from the preview's stylesheet (proof the code is untouched). */
async function rootAnchor(page: Page): Promise<{ top: string; right: string; bottom: string; left: string }> {
  return page.frameLocator('iframe.preview-frame').locator('body').evaluate(() => {
    for (const sheet of Array.from(document.styleSheets)) {
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule instanceof CSSStyleRule && rule.selectorText === '.lower-third') {
          const s = rule.style;
          return { top: s.top, right: s.right, bottom: s.bottom, left: s.left };
        }
      }
    }
    return { top: '', right: '', bottom: '', left: '' };
  });
}

test('clicking a text line selects it: outline + a chip naming the field — no code written', async ({ page }) => {
  await createHairline(page);
  await waitSettled(page);

  const p = await partPoint(page, '#f0');
  await page.mouse.click(p.x, p.y);

  await expect(page.getByTestId('canvas-selection')).toBeVisible();
  const chip = page.getByTestId('selection-chip');
  await expect(chip).toContainText('Name'); // part.label = the field's SPX title
  await expect(chip).toContainText('Double-click edits · drag or arrows move'); // the actions that exist here

  // Selection is editor UI state only: no tab jump, no change highlight, no history entry.
  await page.waitForTimeout(650); // KEEP as a sleep: this asserts nothing changes, so no rebuild ever comes
  await expect(page.locator('.tabs .tab.active')).toHaveText('HTML');
  await expect(page.locator('.change-dot')).toHaveCount(0);
  await expect(page.locator('.editor-host .changed-line')).toHaveCount(0);
});

test('hovering a selectable element previews its name; leaving clears it', async ({ page }) => {
  await createHairline(page);
  await waitSettled(page);

  const p = await partPoint(page, '#f0');
  await page.mouse.move(p.x, p.y);
  await expect(page.getByTestId('canvas-hover')).toBeVisible();
  await expect(page.getByTestId('hover-tag')).toHaveText('Name');

  // Top-center is empty canvas for a bottom-left lower third (fractions of the TRUE canvas).
  const canvas = await canvasBox(page);
  await page.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height * 0.1);
  await expect(page.getByTestId('canvas-hover')).toBeHidden();
});

test('clicking empty canvas or pressing Escape deselects', async ({ page }) => {
  await createHairline(page);
  await waitSettled(page);

  const p = await partPoint(page, '#f0');
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('canvas-selection')).toBeVisible();

  // The first selection auto-opened the Inspector and narrowed the stage — read the
  // canvas fresh, and probe empty canvas at 25% width (the stage toolbar floats top-right).
  const canvas = await canvasBox(page);
  await page.mouse.click(canvas.x + canvas.width * 0.25, canvas.y + canvas.height * 0.1);
  await expect(page.getByTestId('canvas-selection')).toBeHidden();

  const p2 = await partPoint(page, '#f0');
  await page.mouse.click(p2.x, p2.y);
  await expect(page.getByTestId('canvas-selection')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('canvas-selection')).toBeHidden();
});

test('clicking the selected part again climbs to its container; the whole graphic keeps the scale handle', async ({ page }) => {
  await createHairline(page);
  await waitSettled(page);

  // The box's left padding strip (12 canvas px in): inside the panel, left of the text masks.
  const p = await partPoint(page, '.lower-third-box', 12, 0.3);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('selection-chip')).toContainText('Panel');

  await page.waitForTimeout(600); // spaced clicks — this is selection climbing, not a dblclick
  // The first selection auto-opened the Inspector and narrowed the stage — recompute.
  const p2 = await partPoint(page, '.lower-third-box', 12, 0.3);
  await page.mouse.click(p2.x, p2.y);
  const chip = page.getByTestId('selection-chip');
  await expect(chip).toContainText('Whole graphic');
  await expect(chip).toContainText('Corner handle resizes');

  // The root's one existing action stays reachable: the handle holds even off-hover.
  // Empty canvas is probed at 25% width — the stage toolbar floats top-RIGHT, and the
  // auto-opened Inspector narrows the stage enough for it to reach the horizontal center.
  const canvas = await canvasBox(page);
  await page.mouse.move(canvas.x + canvas.width * 0.25, canvas.y + canvas.height * 0.1);
  await expect(page.getByTestId('scale-handle')).toBeVisible();
  await expect(page.getByTestId('canvas-hover')).toBeHidden(); // hover cleared, selection held

  await page.keyboard.press('Escape');
  await expect(page.getByTestId('canvas-selection')).toBeHidden();
  await expect(page.getByTestId('scale-handle')).toBeHidden(); // it was anchored to the selection
});

test('selection layers cleanly under inline editing and never blocks drag-to-move', async ({ page }) => {
  await createHairline(page);
  await waitSettled(page);
  const before = await rootAnchor(page);

  // Double-click opens the inline editor; the chip yields the spot while it is open.
  const p = await partPoint(page, '#f0');
  await page.mouse.dblclick(p.x, p.y);
  await expect(page.getByTestId('inline-editor')).toBeVisible();
  await expect(page.getByTestId('selection-chip')).toBeHidden();

  // First Escape cancels only the edit; selection followed the edited field.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('inline-editor')).toBeHidden();
  await expect(page.getByTestId('selection-chip')).toContainText('Name');
  expect(await rootAnchor(page)).toEqual(before); // still nothing written

  // A drag that starts on the graphic still re-anchors it (selection is not a mode).
  const canvas = await canvasBox(page);
  await page.mouse.move(canvas.x + canvas.width * 0.15, canvas.y + canvas.height * 0.82);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * 0.85, canvas.y + canvas.height * 0.15, { steps: 8 });
  await page.mouse.up();
  await awaitPreviewRebuild(page);
  const anchor = await rootAnchor(page);
  expect(anchor.right).not.toBe('auto');
  expect(anchor.top).not.toBe('auto');

  // The drag was a move, not a click: the selection survived it unchanged.
  await expect(page.getByTestId('selection-chip')).toContainText('Name');
});

test('selection is shared: a canvas click highlights the timeline row, a row label selects on canvas', async ({ page }) => {
  await createHairline(page);
  await waitSettled(page);

  // Canvas → timeline: clicking the Name line highlights its overview row.
  const p = await partPoint(page, '#f0');
  await page.mouse.click(p.x, p.y);
  await expect(page.locator('[data-part="#f0"]')).toHaveClass(/selected/);

  // Timeline → canvas: clicking the Title row's label selects the element on the canvas.
  await page.locator('[data-part="#f1"]').click();
  await expect(page.getByTestId('selection-chip')).toContainText('Title');
  await expect(page.getByTestId('canvas-selection')).toBeVisible();
  await expect(page.locator('[data-part="#f1"]')).toHaveClass(/selected/);
  await expect(page.locator('[data-part="#f0"]')).not.toHaveClass(/selected/);

  // Clicking the selected label again deselects on BOTH surfaces; nothing was written.
  await page.locator('[data-part="#f1"]').click();
  await expect(page.getByTestId('canvas-selection')).toBeHidden();
  await expect(page.locator('[data-part="#f1"]')).not.toHaveClass(/selected/);
  await expect(page.locator('.change-dot')).toHaveCount(0);
});

test('the chip assigns the selected part to a press — the data chain, from the canvas', async ({ page }) => {
  await createHairline(page); // lower thirds create as data blocks now
  await waitSettled(page);

  // Enter the steps world from the step timeline (»+ adds the first press).
  await page.getByTestId('tlv2-add-step').click();
  await awaitPreviewRebuild(page);

  // Select the accent via its timeline row label (shared selection — and a click target
  // far kinder than the 3px hairline itself).
  await page.locator('[data-part=".lower-third-accent"]').click();
  const chip = page.getByTestId('selection-chip');
  await expect(chip).toContainText('Accent line');

  // The chip carries the press control; the accent enters with ▶ Play today.
  const appears = page.getByTestId('canvas-appears');
  await expect(appears).toHaveValue('-1');

  // Assign it to press 1 — the data twin of the gutter's patch (a reveals move).
  await appears.selectOption('0');
  await awaitPreviewRebuild(page);
  await expect(page.getByTestId('canvas-appears')).toHaveValue('0'); // re-parsed from the code
  // The write landed in the code (the JS tab shows its change dot; HTML is the active tab).
  await expect(page.locator('.tabs .tab', { hasText: 'JS' }).locator('.change-dot')).toBeVisible();
  const reveals = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    return parseAnimData(useTemplateStore.getState().template.js)!.steps[1].reveals;
  });
  expect(reveals).toContain('.lower-third-accent');

  // And back to the entrance, from the canvas too. The emptied press disappears from the
  // data — but the control STAYS: "appears in a new step »" is always one click away, so a
  // dropped-in element can become the graphic's next step without a timeline detour.
  await page.getByTestId('canvas-appears').selectOption('-1');
  await awaitPreviewRebuild(page);
  await expect(page.getByTestId('canvas-appears')).toHaveValue('-1');
  await expect(
    page.getByTestId('canvas-appears').locator('option', { hasText: 'appears in a new step »' }),
  ).toHaveCount(1);
  const data = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    return parseAnimData(useTemplateStore.getState().template.js);
  });
  expect(data!.steps).toHaveLength(2);
  expect(Object.keys(data!.steps[0].layers)).toContain('.lower-third-accent');
});

// ── The chip on a PHONE (≤768px): the affordance hints describe pointer/keyboard gestures —
//    double-click, arrow keys, the corner handle — that a touch screen doesn't have, so the
//    chip speaks only the registry label there. And whatever the label length, it must stay
//    fully inside the stage: at 390px the old fixed clamp let a hinted chip clip off the
//    right edge. ──

test('mobile: the chip drops the desktop-gesture hints and stays inside the canvas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await createHairlineMobile(page);
  await waitSettled(page);

  // Select through the shared selection (the timeline row label — the same real UI path
  // the mobile layout spec uses; canvas tap mechanics are pinned by the desktop specs).
  await page.locator('.tlv2-labels .timeline-label[data-part="#f0"]').click();
  const chip = page.getByTestId('selection-chip');
  await expect(chip).toBeVisible();
  await expect(chip).toContainText('Name'); // part.label — the registry's word, unchanged
  await expect(chip.locator('.canvas-chip-hint')).toHaveCount(0); // no desktop-only guidance

  // Contained: the chip never leaves the stage overlay, and never clips at the viewport.
  const layer = (await page.getByTestId('canvas-layer').boundingBox())!;
  const box = (await chip.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(layer.x - 1);
  expect(box.x + box.width).toBeLessThanOrEqual(layer.x + layer.width + 1);
  expect(box.x + box.width).toBeLessThanOrEqual(390);

  // The panel selected too ("Panel" hint on desktop is the corner handle — also desktop-only).
  await page.locator('.tlv2-labels .timeline-label[data-part=".lower-third-box"]').click();
  await expect(chip).toContainText('Panel');
  await expect(chip.locator('.canvas-chip-hint')).toHaveCount(0);
});

test('a block element outside the root joins the press chain: hidden until its press, gone with the exit', async ({ page }) => {
  await createHairline(page);
  await waitSettled(page);

  // Insert the Logo building block — a data-gfx element OUTSIDE the graphic's root, so it
  // misses the root's opacity gate entirely.
  await page.evaluate(async () => {
    const [{ useTemplateStore }, { BUILDING_BLOCKS }] = await Promise.all([
      import('/src/store/templateStore.ts'),
      import('/src/blocks/registry.ts'),
    ]);
    const s = useTemplateStore.getState();
    const logo = BUILDING_BLOCKS.find((b: { id: string }) => b.id === 'logo')!;
    s.applyTemplate(logo.apply(s.template));
  });
  await awaitPreviewRebuild(page);

  // Enter the steps world (»+ on the step timeline), then put the Title on press 1 so
  // the chain matches the classic flow this test pinned before the data flip.
  await page.getByTestId('tlv2-add-step').click();
  await awaitPreviewRebuild(page);
  await page.locator('[data-part="#f1"]').click();
  await page.getByTestId('canvas-appears').selectOption('0');
  await awaitPreviewRebuild(page);

  // The block's row exists now; select it and give it its OWN press from the canvas chip.
  await page.locator('[data-part="#logo"]').click();
  await expect(page.getByTestId('selection-chip')).toContainText('logo');
  await page.getByTestId('canvas-appears').selectOption('1'); // "appears on a new press"
  await awaitPreviewRebuild(page);
  await expect(page.getByTestId('canvas-appears')).toHaveValue('1');

  // The data chain carries the reveal; the outside gate is the INTERPRETER's job now
  // (containment checked live at runtime — no emitted gate code to drift).
  const revealData = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    return parseAnimData(useTemplateStore.getState().template.js)!.steps.map((s) => s.reveals ?? []);
  });
  expect(revealData[2]).toContain('#logo');

  // The gate, behaviorally. Settled design view (the entrance played out): still hidden.
  const logoOpacity = () =>
    page.frameLocator('iframe.preview-frame').locator('#logo').evaluate((el) => getComputedStyle(el).opacity);
  await expect.poll(logoOpacity).toBe('0');

  // Play, then press » Next twice — the second press reveals the block.
  await page.getByRole('button', { name: '▶ Play' }).click();
  await page.waitForTimeout(900);
  await page.getByRole('button', { name: '» Next' }).click(); // press 1: the Title line
  await page.getByRole('button', { name: '» Next' }).click(); // press 2: the block
  await expect.poll(logoOpacity).toBe('1');

  // ■ Stop: the exit fades the block too — it leaves with the graphic, not after it.
  await page.getByRole('button', { name: '■ Stop' }).click();
  await expect.poll(logoOpacity).toBe('0');

  // Unassigning removes the reveal: the block is an always-on decoration again.
  await page.getByTestId('canvas-appears').selectOption('-1');
  await awaitPreviewRebuild(page);
  const revealsAfter = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    return parseAnimData(useTemplateStore.getState().template.js)!
      .steps.flatMap((s) => s.reveals ?? []);
  });
  expect(revealsAfter).not.toContain('#logo');
  await expect.poll(logoOpacity).toBe('1');
});
