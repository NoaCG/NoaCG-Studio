// The mark PROBE is read by the Lite legibility gate and by Pro's mark-field trigger, and the
// trigger rests entirely on `inkSpread` separating one ink from several.
// covers: src/assets/assetInfo.ts
//
// A brand mark nobody can see must not ship silently.
//
// The defect, from the owner's blind value-gate ballot (2026-08-14,
// `docs/AI_LITE_BRAND_PLAN.md` §2.2): a knockout wordmark on a light brand package painted white
// ink on a near-white panel. The names beside it were crisp and the logo was simply absent, and
// the graphic passed every gate in the tree. It failed on the generated arm AND on the arm a
// person branded by hand in the wizard - which is why this spec drives `variant.create()`
// directly rather than a Lite decision: the wizard path had no check of any kind.
//
// Three tests, because a gate that can only prove it fires is satisfied by one that flags
// everything:
//   1. the failing pairing raises it;
//   2. the same design and the same mark on a package it can read on stays quiet;
//   3. a mark carrying its OWN field stays quiet even when its tone nearly matches the surface -
//      the measured false positive that decided the gate's scope, pinned so a later widening
//      cannot quietly bring it back.
//
// Free - no model call, no tokens.

import { expect, test } from '@playwright/test';
import { chooseType, pickDesign } from './_browse';
import { enableAdvancedMode } from './_create';

type Page = import('@playwright/test').Page;

/** A transparent-ink wordmark: the shape a channel brings, and the one that can vanish. */
const wordmark = (ink: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="120" viewBox="0 0 480 120">`
  + `<rect x="0" y="26" width="64" height="14" fill="${ink}"/>`
  + `<text x="90" y="76" font-family="Arial" font-size="58" font-weight="700" fill="${ink}">Meridian</text></svg>`;

/** A crest that brings its own field - dark blue, close in LUMINANCE to a red accent tile and
 *  perfectly legible against it, because they separate by hue. */
const crest =
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">'
  + '<rect width="256" height="256" fill="#1f4f9c"/>'
  + '<circle cx="128" cy="128" r="96" fill="none" stroke="#ffffff" stroke-width="10"/></svg>';

const LIGHT_PACKAGE = {
  id: 'brand', name: 'Brand', styleTags: ['glass'],
  accent: '#e8dcc8', text: '#1b1b1b', textDim: '#5a5a5a', panel: '#f5f2ec',
};

async function benchRules(
  page: Page,
  args: { variantId: string; svg: string; palette: typeof LIGHT_PACKAGE | null },
): Promise<string[]> {
  return page.evaluate(async ({ variantId, svg, palette }) => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const bench = await import('/src/validation/runtimeBench.ts');
    const variant = variantById(variantId);
    if (!variant) return ['NO VARIANT'];
    const template = variant.create({
      resolution: { width: 1920, height: 1080, label: '1080p' },
      fps: 50,
      lines: [
        { title: 'Name', sample: 'Tomas Aalto' },
        { title: 'Role', sample: 'Fourth-Generation Baker' },
      ],
      ...(palette ? { palette } : {}),
      importedImages: [{ path: 'images/mark.svg', data: `data:image/svg+xml;base64,${btoa(svg)}` }],
      logoEnabled: true,
      logoAssetPath: 'images/mark.svg',
    } as Parameters<typeof variant.create>[0]);
    const result = await bench.benchTemplateRuntime(template, {});
    return [...result.errors, ...result.warnings].map((finding) => finding.rule);
  }, args);
}

test.describe('a brand mark that cannot be read is reported', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/app');
  });

  test('a knockout mark on a light package raises bench-mark-unreadable', async ({ page }) => {
    const rules = await benchRules(page, { variantId: 'lt15', svg: wordmark('#ffffff'), palette: LIGHT_PACKAGE });
    expect(rules).toContain('bench-mark-unreadable');
  });

  test('the same mark on a package it reads on raises nothing', async ({ page }) => {
    // The design's OWN palette, which is dark - a white mark on it is exactly what a knockout is
    // for. A gate that fired here would be worse than no gate.
    const rules = await benchRules(page, { variantId: 'lt15', svg: wordmark('#ffffff'), palette: null });
    expect(rules).not.toContain('bench-mark-unreadable');
  });

  test('the wizard says so while the palette that broke it is still on screen', async ({ page }) => {
    // THE BALLOT'S OWN PATH. Nothing here is generated: a person picks a design, uploads their
    // only version of the mark, and chooses a package - which is exactly how the DIY arm shipped
    // a lower third with an invisible logo and no warning of any kind.
    await enableAdvancedMode(page);
    await page.goto('/app');
    await expect(page.locator('.wz-modal')).toBeVisible();
    await page.locator('[data-entry="template"]').click();
    await chooseType(page, 'Lower third');
    await pickDesign(page, 'Frost Strap');
    await page.getByRole('button', { name: 'Next →' }).click(); // Fields

    const logoSection = page.locator('.panel-section', { hasText: 'Include a logo slot' });
    await logoSection.getByRole('checkbox').check();
    await logoSection.locator('input[type="file"]').setInputFiles({
      name: 'knockout.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(wordmark('#ffffff'), 'utf8'),
    });
    await expect(logoSection.locator('img[alt="Logo preview"]')).toBeVisible();
    await page.getByRole('button', { name: 'Next →' }).click(); // Style

    const notice = page.getByTestId('mark-legibility-warning');
    // Porcelain is a light package - the pairing that erased the mark on the ballot.
    await page.locator('.wz-palette', { hasText: 'Porcelain' }).click();
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('close to invisible');

    // …and it goes away when the user answers it, which is the half that makes it a warning
    // rather than a decoration.
    await page.locator('.wz-palette', { hasText: 'NoaCG Amber' }).click();
    await expect(notice).toBeHidden();
  });

  test('a mark with its own field is not judged on luminance alone', async ({ page }) => {
    // ls10 seats the crest on the accent tile. Measured at 1.21:1 - and rendered, looked at, and
    // perfectly legible, because blue and red differ in hue rather than in tone. Judging an
    // own-field mark by contrast flagged 2 of the 23 mark-capable lower thirds, both wrongly, so
    // the gate is scoped to transparent ink, which cannot be wrong that way.
    const rules = await benchRules(page, { variantId: 'ls10', svg: crest, palette: null });
    expect(rules).not.toContain('bench-mark-unreadable');
  });
});
