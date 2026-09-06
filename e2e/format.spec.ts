import { enableAdvancedMode, finishIntoEditor } from './_create';
import { test, expect, type Page } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { showCode } from './_code';
import { chooseType } from './_browse';

// The Prettier formatting layer (src/format/formatCode.ts) and its Monaco wiring. The service is
// house-aware on purpose: it formats HTML freely, but it must NEVER silently rewrite the two
// things other worktrees own — the right-aligned CSS comment style and the timeline's JS
// animation region. These tests pin both the pure formatters and the editor's Format button.

// ── The formatting service (pure functions, run in the app's module context) ──

test('formatHtml / formatCss / formatJs normalize messy code', async ({ page }) => {
  await enableAdvancedMode(page);
  await page.goto('/app');
  const out = await page.evaluate(async () => {
    const { formatHtml, formatCss, formatJs } = await import('/src/format/formatCode.ts');
    return {
      html: await formatHtml('<div   class="a"><span>x</span></div>'),
      css: await formatCss('.a{color:red}'),
      js: await formatJs('var x=1;function f(){return  1}'),
    };
  });
  // HTML: collapsed attribute whitespace (the extra spaces before `class` are gone).
  expect(out.html).toContain('<div class="a">');
  expect(out.html).not.toContain('<div  ');
  // CSS: expanded block, one property per line.
  expect(out.css).toContain('.a {');
  expect(out.css).toContain('\n  color: red;');
  // JS: spacing + braces normalized, single quotes, ES5 preserved.
  expect(out.js).toBe('var x = 1;\nfunction f() {\n  return 1;\n}\n');
});

test('formatJs refuses any file that owns an animation region', async ({ page }) => {
  await enableAdvancedMode(page);
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    const { formatJs, hasProtectedRegion } = await import('/src/format/formatCode.ts');
    // A data-block template: strict-JSON NOACG_ANIM literal the timeline reads with JSON.parse.
    const dataJs = 'var animSpeed=1;\nvar NOACG_ANIM = {"version":1,"root":".x","speed":1,"steps":[]};';
    // A legacy template: the marked ANIMATION region.
    const legacyJs = 'var a=1;\n/* == ANIMATION == */\nfunction buildInTimeline(){return  1}\n/* == END ANIMATION == */';
    return {
      dataFlagged: hasProtectedRegion(dataJs),
      dataUntouched: (await formatJs(dataJs)) === dataJs,
      legacyFlagged: hasProtectedRegion(legacyJs),
      legacyUntouched: (await formatJs(legacyJs)) === legacyJs,
    };
  });
  expect(result.dataFlagged).toBe(true);
  expect(result.dataUntouched).toBe(true); // never reflow the timeline's JSON
  expect(result.legacyFlagged).toBe(true);
  expect(result.legacyUntouched).toBe(true);
});

test('minimalTextChange returns only the changed span (cursor-stable, merge-friendly)', async ({ page }) => {
  await enableAdvancedMode(page);
  await page.goto('/app');
  const out = await page.evaluate(async () => {
    const { minimalTextChange } = await import('/src/format/formatCode.ts');
    return {
      changed: minimalTextChange('abcdef', 'abXYef'),
      identical: minimalTextChange('same', 'same'),
    };
  });
  expect(out.changed).toEqual({ start: 2, end: 4, text: 'XY' });
  expect(out.identical).toBeNull();
});

test('formatTemplate formats HTML but leaves CSS and JS alone by default', async ({ page }) => {
  await enableAdvancedMode(page);
  await page.goto('/app');
  const out = await page.evaluate(async () => {
    const { formatTemplate } = await import('/src/format/formatCode.ts');
    const { createDefaultTemplate } = await import('/src/templates/defaultTemplate.ts');
    const base = createDefaultTemplate();
    const messyHtml = { ...base, html: '<div    id="f0">x</div>', css: '.a{color:red}', js: 'var x=1' };
    const result = await formatTemplate(messyHtml);
    return {
      htmlFormatted: result.html.includes('<div id="f0">'),
      cssUntouched: result.css === '.a{color:red}',
      jsUntouched: result.js === 'var x=1',
    };
  });
  expect(out.htmlFormatted).toBe(true); // HTML is safe to format automatically
  expect(out.cssUntouched).toBe(true); // CSS keeps its house right-aligned comments
  expect(out.jsUntouched).toBe(true); // JS is left for an explicit, region-aware format
});

// ── The Format button in the code editor ──

async function createLowerThird(page: Page) {
  await enableAdvancedMode(page);
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, 'Lower thirds');
  await page.locator('.wz-variant').first().click();
  await awaitPreviewRebuild(page, async () => {
    await finishIntoEditor(page);
    await expect(page.locator('.wz-modal')).toBeHidden();
  });
  // The Format button lives in the code pane's toolbar, and the pane ships closed.
  await showCode(page);
}

test('the Format button reformats the active tab through Monaco and the store', async ({ page }) => {
  await createLowerThird(page);

  // Drop deliberately messy CSS into the store; the controlled editor picks it up. Multi-line
  // (LF) so Monaco keeps LF line endings, like a real template.
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    useTemplateStore.getState().setActiveTab('css');
    useTemplateStore.getState().setCss('.demo{\ncolor:red;\nbackground:blue\n}');
  });
  await page.waitForTimeout(150); // let the value reach Monaco's model

  await page.locator('.format-btn').click();

  // The button ran Prettier, Monaco applied the edit, and onChange wrote it back to the store.
  // Prettier (not Monaco's built-in) also adds the missing semicolon after `blue`.
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { useTemplateStore } = await import('/src/store/templateStore.ts');
        return useTemplateStore.getState().template.css;
      }),
    )
    .toContain('.demo {\n  color: red;\n  background: blue;\n}');
});

test('the Format button is disabled on the JS tab of a data-block template (region protected)', async ({ page }) => {
  await createLowerThird(page);
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    useTemplateStore.getState().setActiveTab('js');
  });
  const button = page.locator('.format-btn');
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute('title', /animation region/i);
});

// ── Format-on-create: every generated project starts from a Prettier-tidied HTML baseline ──

test('a newly created project starts from a Prettier-formatted HTML baseline', async ({ page }) => {
  await createLowerThird(page); // drives the wizard's Create, which routes through applyGenerated

  const result = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { formatHtml } = await import('/src/format/formatCode.ts');
    const t = useTemplateStore.getState().template;
    return {
      // Already-formatted HTML is a fixed point of formatHtml - so re-formatting is a no-op.
      alreadyFormatted: (await formatHtml(t.html)) === t.html,
      // The SPX definition survived the format-on-create re-parse: fields are intact.
      fieldCount: t.fields.length,
    };
  });

  expect(result.alreadyFormatted).toBe(true); // format-on-create left the HTML tidy at birth
  expect(result.fieldCount).toBeGreaterThan(0); // the definition parsed back to real fields
});
