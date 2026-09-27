// covers: src/templates/**
// covers: src/components/wizard/**, !src/components/wizard/import/**
// focus

import { enableAdvancedMode, finishIntoEditor } from './_create';
import { test, expect, type Page } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { chooseType, pickDesign } from './_browse';

// The wizard's logo option: a variant that declares `logo: 'optional'` offers a toggle +
// custom upload on the Fields step; enabling it makes the created template carry a REAL
// SPX image field (filelist) bound to an <img id="fN">, with the uploaded file embedded
// as a data-URL asset. Toggled off, nothing is injected.

// A valid 1×1 fully opaque red RGBA PNG - deliberately visible, so an injected logo can be told apart.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP4z8DwHwAFAAH/VscvDQAAAABJRU5ErkJggg==',
  'base64',
);

async function toFieldsStep(page: Page, category: string, variantName: string) {
  await enableAdvancedMode(page);
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, category);
  await pickDesign(page, variantName);
  await page.getByRole('button', { name: 'Next →' }).click(); // Fields
}

async function createdTemplate(page: Page) {
  return page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const t = useTemplateStore.getState().template;
    return {
      fields: t.fields,
      assets: t.assets.map((a) => a.path),
      html: t.html,
    };
  });
}

test('logo toggle + custom upload: the created template carries the field, asset, and <img>', async ({ page }) => {
  await toFieldsStep(page, 'Topic', 'Hairline Card');

  // The optional-logo section is offered; turn it on and upload a custom logo.
  const logoSection = page.locator('.panel-section', { hasText: 'Include a logo slot' });
  await logoSection.getByRole('checkbox').check();
  await logoSection.locator('input[type="file"]').setInputFiles({
    name: 'club-crest.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(logoSection.locator('img[alt="Logo preview"]')).toBeVisible();

  await awaitPreviewRebuild(page, async () => {
    await finishIntoEditor(page);
    await expect(page.locator('.wz-modal')).toBeHidden();
  });

  const t = await createdTemplate(page);
  // The logo is a real SPX image field after the three text lines…
  const logoField = t.fields.find((f: { ftype: string }) => f.ftype === 'filelist')!;
  expect(logoField).toMatchObject({ field: 'f3', title: 'Logo', value: 'images/club-crest.png' });
  // …the uploaded file rides along as a data-URL asset…
  expect(t.assets).toContain('images/club-crest.png');
  // …and the design carries the bound <img> with the shared slot's class.
  expect(t.html).toContain('<img id="f3" class="info-card-logo"');

  // The preview (already rebuilt above) resolves images/ through the asset shim.
  const src = await page
    .frameLocator('iframe.preview-frame')
    .locator('#f3')
    .evaluate((el) => (el as HTMLImageElement).src);
  expect(src.startsWith('data:image/png')).toBeTruthy();
});

test('a lower third places the logo BESIDE the text, not above it', async ({ page }) => {
  // The 2026-08-13 Pro brand round's standing review rule: lower thirds stay vertically
  // compact - the mark sits beside the text/banner, never stacked above it. The shared slot
  // arranges that with a two-column grid on the box; info cards (the test above) keep the
  // stacked band, because a card is a vertical composition.
  //
  // Measured 2026-08-14, which is why the rule is worth a spec: stacked, the mark made lt02
  // 83% taller, lt25 74% and lt11 57%, and lt11 serves most branded output.
  await toFieldsStep(page, 'Lower thirds', 'House Strap');

  const logoSection = page.locator('.panel-section', { hasText: 'Include a logo slot' });
  await logoSection.getByRole('checkbox').check();
  await logoSection.locator('input[type="file"]').setInputFiles({
    name: 'club-crest.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(logoSection.locator('img[alt="Logo preview"]')).toBeVisible();

  await awaitPreviewRebuild(page, async () => {
    await finishIntoEditor(page);
    await expect(page.locator('.wz-modal')).toBeHidden();
  });

  const t = await createdTemplate(page);
  // The slot is the shared one…
  expect(t.html).toContain('class="lower-third-logo"');
  // …and it is the box's LAST child. That is not a formatting detail: a design addresses its
  // own children positionally (lt02 drops every line after the first below its underline with
  // `.lower-third-mask:nth-child(n + 2)`), so a mark inserted at the FRONT renumbers all of
  // them and the name renders under the rule. Measured 2026-08-14; the grid places the mark in
  // column one regardless of source order, so nothing is lost by putting it last.
  const logoAt = t.html.indexOf('lower-third-logo');
  const lastLineAt = t.html.lastIndexOf('lower-third-mask');
  expect(logoAt).toBeGreaterThan(0);
  expect(logoAt).toBeGreaterThan(lastLineAt);

  // Rendered: the box is a grid and the mark sits BESIDE the first text line - overlapping
  // it vertically, wholly to its left - rather than in a row of its own above it.
  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('.lower-third-box')).toHaveCSS('display', 'grid');
  const boxes = await frame.locator('.lower-third-box').evaluate((box) => {
    const logo = box.querySelector('.lower-third-logo')!.getBoundingClientRect();
    const line = box.querySelector('#f0')!.getBoundingClientRect();
    return { logo: { right: logo.right, top: logo.top, bottom: logo.bottom }, line: { left: line.left, top: line.top, bottom: line.bottom } };
  });
  expect(boxes.logo.right).toBeLessThanOrEqual(boxes.line.left);
  expect(boxes.logo.top).toBeLessThan(boxes.line.bottom);
  expect(boxes.logo.bottom).toBeGreaterThan(boxes.line.top);

  // …and it is centred on the WHOLE stack, not on the first line. The rule that used to claim
  // this - `grid-row: 1 / -1` on the mark - is a NO-OP: a negative row line counts back from
  // the EXPLICIT grid, and the rule declares columns only, so the mark sat in row one. Measured
  // 2026-08-14: 19-28px above the stack's centre on every strap, and a crest re-grew lt11 by
  // 7.7%, which is the height a strap was moved beside the words to stop spending. The design's
  // own children are gathered into .lower-third-lockup so that there is ONE row to centre on.
  // The stack is measured as the union of everything in the box that is not the mark, never as
  // the wrapper element: the wrapper is one WAY of reaching the rule, and a guard written
  // against it would pass the moment a later version reached the rule differently - and fail
  // with a null dereference rather than with the distance, which is the number under test.
  const centres = await frame.locator('.lower-third-box').evaluate((box) => {
    const logo = box.querySelector('.lower-third-logo')!.getBoundingClientRect();
    const rest = [...box.children].filter((el) => !el.classList.contains('lower-third-logo'))
      .map((el) => el.getBoundingClientRect()).filter((r) => r.height > 0);
    const top = Math.min(...rest.map((r) => r.top));
    const bottom = Math.max(...rest.map((r) => r.bottom));
    return { logo: (logo.top + logo.bottom) / 2, stack: (top + bottom) / 2 };
  });
  expect(Math.abs(centres.logo - centres.stack)).toBeLessThan(1);
});

test('a wide lockup is sized by the words, and the strap pays in width', async ({ page }) => {
  // The owner's blind value-gate ballot (2026-08-14): "the logo is too small compared to the
  // name and title", on four of eight briefs. Measured over all 23 mark-capable lower thirds,
  // the cause was arithmetic - the slot's WIDTH cap bound before its height cap, so a 4:1
  // wordmark painted 33px beside a 54px name and a 13:1 rail painted 10px at 1080p.
  //
  // The fix is not a bigger cap on its own: measured, that made 1-3 designs wrap their role and
  // grew those straps up to 73% TALLER, which is the failure the beside-the-text rule above
  // exists to prevent. The strap's own wrap cap is widened by the mark's column instead, so the
  // words keep their whole measure and the graphic grows in the one dimension a strap may spend.
  //
  // This pins both halves, because either alone is satisfiable by a wrong change: a mark big
  // enough to read, AND a strap no taller than the same strap without one.
  const WORDMARK = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="120" viewBox="0 0 480 120">'
    + '<rect width="480" height="120" fill="#1f4f9c"/></svg>',
    'utf8',
  );
  await toFieldsStep(page, 'Lower thirds', 'House Strap');

  const logoSection = page.locator('.panel-section', { hasText: 'Include a logo slot' });
  await logoSection.getByRole('checkbox').check();
  await logoSection.locator('input[type="file"]').setInputFiles({
    name: 'lockup.svg',
    mimeType: 'image/svg+xml',
    buffer: WORDMARK,
  });
  await expect(logoSection.locator('img[alt="Logo preview"]')).toBeVisible();
  await awaitPreviewRebuild(page, async () => {
    await finishIntoEditor(page);
    await expect(page.locator('.wz-modal')).toBeHidden();
  });

  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('.lower-third-logo')).toBeVisible();
  const measured = await frame.locator('.lower-third-box').evaluate((box) => {
    const win = box.ownerDocument.defaultView!;
    const logo = box.querySelector('.lower-third-logo')!.getBoundingClientRect();
    const name = box.querySelector('#f0')!;
    const style = win.getComputedStyle(name);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
    // The WORDS' own block - everything in the box that is not the mark, measured as a union
    // rather than as the wrapper element (the beside-the-text test above says why).
    const rest = [...box.children]
      .filter((el) => !el.classList.contains('lower-third-logo'))
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.height > 0);
    return {
      markHeight: logo.height,
      wordsHeight: Math.max(...rest.map((r) => r.bottom)) - Math.min(...rest.map((r) => r.top)),
      nameFontSize: parseFloat(style.fontSize),
      nameLines: Math.round(name.getBoundingClientRect().height / Math.max(1, lineHeight)),
    };
  });

  // Big enough to read: a 4:1 lockup now paints about 65px against a ~54px name. The floor is
  // the NAME's own type size rather than a pixel count, because that is the comparison the
  // ballot actually made - and it was 0.6 of it before.
  expect(measured.markHeight).toBeGreaterThanOrEqual(measured.nameFontSize);
  // The words keep their measure: the identity line still sets on ONE line. This is the half a
  // bigger cap alone fails - measured, it wrapped this line on lt11 and lt25.
  expect(measured.nameLines).toBe(1);
  // …and the mark never out-grows the words, which is what stops it setting the strap's height.
  // A local invariant rather than a before/after: whatever the design, the words decide.
  expect(measured.markHeight).toBeLessThanOrEqual(measured.wordsHeight + 1);
});

test('a design that draws its own slot is left alone by the shared one', async ({ page }) => {
  // `designHasLogoSlot` is what keeps the shared slot away from a design that hand-authors one,
  // and until 2026-08-15 both this file's neighbour docs and src/templates/AGENTS.md recorded
  // that five designs slipped past it. Swept over all 24 mark-capable lower thirds, none does:
  // a design's slot is conditional on the same `logoEnabled` the check is guarded by, so by the
  // time the check runs the design has already emitted BOTH halves - the <img> and the filelist
  // field. lt07 "Number Badge" is the sharpest case, because its `.lower-third-logo` CSS is
  // emitted UNCONDITIONALLY (the badge is an accent square with or without a mark), which is
  // exactly why the proposed `design.css` clause would have been wrong: it would read that as
  // "has its own slot" on a design that had emitted none.
  await toFieldsStep(page, 'Lower thirds', 'Number Badge');

  const logoSection = page.locator('.panel-section', { hasText: 'Include a logo slot' });
  await logoSection.getByRole('checkbox').check();
  await logoSection.locator('input[type="file"]').setInputFiles({
    name: 'club-crest.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  await expect(logoSection.locator('img[alt="Logo preview"]')).toBeVisible();
  await awaitPreviewRebuild(page, async () => {
    await finishIntoEditor(page);
    await expect(page.locator('.wz-modal')).toBeHidden();
  });

  const t = await createdTemplate(page);
  // The design's OWN slot is there - one field, one <img>, no duplicate.
  const logoFields = t.fields.filter((f: { ftype: string }) => f.ftype === 'filelist');
  expect(logoFields).toHaveLength(1);
  expect(t.html.match(/class="lower-third-logo"/g) ?? []).toHaveLength(1);
  // …and NOTHING of the shared slot landed. The lockup wrapper is the tell: it is emitted only
  // by `applyLogoSlot`, so its absence is the injection not having run - which is the assertion
  // that fails if `designHasLogoSlot` ever stops recognising a hand-authored slot.
  expect(t.html).not.toContain('lower-third-lockup');

  // Rendered: the mark is inside the design's own badge, not a column of the box's grid.
  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('.lower-third-accent > .lower-third-logo')).toBeVisible();
  await expect(frame.locator('.lower-third-lockup')).toHaveCount(0);
});

test('logo toggle off: nothing is injected', async ({ page }) => {
  await toFieldsStep(page, 'Topic', 'Hairline Card');
  // Offered but left off (the default when no image was imported).
  await expect(page.locator('.panel-section', { hasText: 'Include a logo slot' })).toBeVisible();
  await finishIntoEditor(page);
  await expect(page.locator('.wz-modal')).toBeHidden();

  const t = await createdTemplate(page);
  expect(t.fields.some((f: { ftype: string }) => f.ftype === 'filelist')).toBeFalsy();
  expect(t.html).not.toContain('info-card-logo');
});

test('a no-logo design offers no logo section', async ({ page }) => {
  await toFieldsStep(page, 'Lower thirds', 'Hairline');
  await expect(page.locator('.wz-line-row').first()).toBeVisible();
  await expect(page.locator('.panel-section', { hasText: 'Include a logo slot' })).toBeHidden();
});


// ── PLACEMENT IS THE DESIGN'S, NOT THE CATEGORY'S ─────────────────────────────────────────
//
// `beside = prefix === 'lower-third'` decided this for every design in every category until
// 2026-08-21 - the hard placement rule the owner says does not exist ("it depends on the
// design"). A design may now answer for itself through `TemplateVariant.markPlacement`, and
// absent it keeps its family's answer, so nothing shipped moves.
//
// It exercises the two real steps the answer travels through - `resolveOptions` reading the
// VARIANT record, then `applyLogoSlot` reading the resolved options - rather than a template
// build, because a design's placement is declared on its variant and `create` closes over its
// own meta: spreading a copy of the record proves nothing (it silently did, first attempt).
test('a design places its own mark, and silence keeps the category default', async ({ page }) => {
  await page.goto('/app');
  await page.locator('.topbar').waitFor();

  const out = await page.evaluate(async () => {
    const bust = '?t=' + Date.now();
    const { resolveOptions } = await import('/src/model/wizard.ts' + bust);
    const { applyLogoSlot } = await import('/src/templates/shared/logoSlot.ts' + bust);

    const design = (prefix: string) => ({
      html: `    <div class="${prefix}-box">\n      <div class="${prefix}-mask"><span id="f0">Name</span></div>\n    </div>`,
      css: '',
      hasAccent: false,
    });
    const variant = (prefix: string, markPlacement?: string) => ({
      id: 'probe', category: prefix, name: 'Probe', styleTag: 'minimal', description: '',
      maxLines: 2, suggestedLines: [{ title: 'Name', sample: 'Name' }],
      logo: 'optional', animationPresets: ['fade'],
      defaultPalette: { id: 'signal', name: 'Signal', styleTags: ['minimal'], accent: '#f00', text: '#fff', textDim: '#aaa', panel: '#000' },
      defaultFontId: 'inter', defaultZone: 'bottom-left',
      ...(markPlacement ? { markPlacement } : {}),
      create: () => ({ html: '', css: '', js: '', fields: [], assets: [], resolution: { width: 1920, height: 1080 } }),
    });
    const slot = (prefix: string, markPlacement?: string) => {
      const o = resolveOptions(variant(prefix, markPlacement) as never, {
        logoEnabled: true, logoAssetPath: 'images/m.svg',
      });
      return applyLogoSlot(design(prefix) as never, prefix, o).html;
    };
    return {
      strapDefault: slot('lower-third'),
      strapAsBand: slot('lower-third', 'band'),
      cardDefault: slot('info-card'),
      cardAsBeside: slot('info-card', 'beside'),
    };
  });

  // A strap's default is BESIDE: the design's own children are gathered into a lockup so the
  // mark has ONE row to sit against, which is what costs width and no height.
  expect(out.strapDefault).toContain('lower-third-lockup');
  // The same category, a design that asks for a band: no lockup, the mark leads the box.
  expect(out.strapAsBand).not.toContain('lower-third-lockup');

  // A card's default is the band; asking for beside builds the lockup instead.
  expect(out.cardDefault).not.toContain('info-card-lockup');
  expect(out.cardAsBeside).toContain('info-card-lockup');
});
