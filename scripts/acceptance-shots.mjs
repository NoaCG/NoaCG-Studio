// Build the ACCEPTANCE FIXTURE end to end in a real browser and capture the evidence:
// screenshots of every core surface plus the exported SPX / CasparCG packages for the
// manual playout test (docs/ACCEPTANCE_SPX_CASPARCG.md). Run with the dev server up:
//   node scripts/acceptance-shots.mjs <out-dir>
// Deliberately NOT part of the e2e suite — it produces artifacts, it doesn't assert.

import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { outDir } from './out-dir.mjs';

const out = outDir(process.argv[2], 'acceptance-out', 'Usage: node scripts/acceptance-shots.mjs [out-dir]');
mkdirSync(out, { recursive: true });
const port = execSync('node scripts/dev-port.mjs').toString().trim();
const base = `http://localhost:${port}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const shot = (name) => page.screenshot({ path: join(out, name), animations: 'disabled' });

// ── 1. The wizard's entry: Continue working + the separated video strip ──
await page.goto(`${base}/app`);
await page.waitForSelector('.wz-modal');
await shot('01-wizard-entry.png');

// ── 2. Create the lower third (the seeded bootstrap = the wizard's exact create path) ──
await page.evaluate(async () => {
  const { CATALOG } = await import('/src/templates/catalog.ts');
  const { initialDraft, mergeDraft, buildDraftTemplate } = await import('/src/components/wizard/draft.ts');
  const { formatTemplate } = await import('/src/format/formatCode.ts');
  const { useTemplateStore } = await import('/src/store/templateStore.ts');
  const variant = Object.values(CATALOG).flat().find((v) => v.name === 'House Strap');
  const draft = mergeDraft(initialDraft(), { variantId: variant.id, lines: variant.suggestedLines.map((l) => ({ ...l })) });
  const template = await formatTemplate(buildDraftTemplate(variant, draft));
  useTemplateStore.getState().applyTemplate(template, { resetSampleData: true });
});
await page.waitForTimeout(600);

// ── 3. Name In / Title In from the graph's add-menu (the layer-timeline walk) ──
await page.getByTestId('timeline-surface-toggle').click();
await page.getByTestId('mg-add-state-main').click();
await page.getByTestId('mg-add-layer-f0').click();
await page.waitForTimeout(500);
await page.getByTestId('mg-add-state-main').click();
await page.getByTestId('mg-add-layer-f1').click();
await page.waitForTimeout(500);
// A cut on the first advance, for the external test to see.
await page.getByTestId('mg-arrow-main-walk-1').click({ force: true });
await page.getByTestId('mg-style').selectOption('cut');
await page.waitForTimeout(600);
await shot('02-states-graph.png');

// ── 4. Save through the real dialog (standalone - packages are retired) ──
await page.getByTestId('save-graphic').click();
await page.getByTestId('save-name').fill('Presenter lower third');
await page.getByTestId('save-confirm').click();
await page.waitForSelector('[data-testid="save-status"]:has-text("Saved")');
await shot('03-editor-saved.png');

// ── 5. The control panel: three entries, active one played into the preview ──
await page.getByTestId('open-home').click();
await page.getByTestId('home-nav-controls').click();
await page.locator('button', { hasText: 'Open control panel' }).first().click();
await page.waitForSelector('[data-testid="graphic-control-page"]');
const fill = async (name, title) => {
  await page.getByTestId('add-entry').click();
  await page.getByTestId('entry-field-f0').fill(name);
  await page.getByTestId('entry-field-f1').fill(title);
};
await fill('Anna Andersson', 'Presenter');
await fill('Michael Smith', 'Guest');
await fill('Lisa Virtanen', 'Correspondent');
await page.locator('.control-entry').first().locator('[data-testid="select-entry"]').click();
await page.getByTestId('control-play').click();
await page.waitForTimeout(1200);
await shot('04-control-entries.png');

// ── 6. Home: the library ──
await page.goBack();
await page.getByTestId('home-nav-graphics').click();
await page.waitForTimeout(300);
await shot('05-home-library.png');

// ── 7. Export the fixture: SPX starter folder + CasparCG single file ──
await page.getByTestId('home-continue-editing').click();
await page.waitForTimeout(400);
const exports_ = await page.evaluate(async () => {
  const { useTemplateStore } = await import('/src/store/templateStore.ts');
  const { EXPORT_TARGETS } = await import('/src/export/registry.ts');
  const { slug } = await import('/src/model/slug.ts');
  const template = useTemplateStore.getState().template;
  const sampleData = useTemplateStore.getState().sampleData;
  const outFiles = [];
  for (const id of ['spx', 'casparcg']) {
    const target = EXPORT_TARGETS.find((t) => t.id === id);
    const zip = await target.build(template, { sampleData });
    outFiles.push({
      filename: `${slug(template.name)}_${id}.zip`,
      b64: await zip.generateAsync({ type: 'base64' }),
    });
  }
  return outFiles;
});
for (const f of exports_) {
  writeFileSync(join(out, f.filename), Buffer.from(f.b64, 'base64'));
  console.log('exported', f.filename);
}

// ── 8. The import wizard's Text step, mid-placement ──
await page.evaluate(() => {
  window.location.hash = '#/new';
});
await page.waitForSelector('.wz-modal');
await page.locator('[data-entry="import-graphic"]').click();
await page.evaluate(() => {
  const c = document.createElement('canvas');
  c.width = 1600; c.height = 900;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 700, 900, 700);
  grad.addColorStop(0, '#12203a'); grad.addColorStop(1, '#0c1526');
  g.fillStyle = grad; g.fillRect(80, 680, 860, 140);
  g.fillStyle = '#f6a623'; g.fillRect(80, 680, 10, 140);
  return new Promise((resolve) =>
    c.toBlob((blob) => {
      const dt = new DataTransfer();
      dt.items.add(new File([blob], 'artwork.png', { type: 'image/png' }));
      const input = document.querySelector('.wz-modal input[type=file]');
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      resolve(null);
    }, 'image/png'),
  );
});
await page.waitForTimeout(500);
await page.locator('.wz-next').click();
await page.locator('.wz-next').click();
await page.waitForSelector('[data-testid="place-stage"]');
const stage = await page.getByTestId('place-stage').boundingBox();
const sc = 520 / 1600;
await page.mouse.click(stage.x + 140 * sc, stage.y + 700 * sc);
await page.waitForTimeout(200);
await page.getByTestId('tool-text').click();
await page.mouse.click(stage.x + 140 * sc, stage.y + 762 * sc);
await page.waitForTimeout(400);
await shot('06-import-text-step.png');

await browser.close();
console.log('done →', out);
