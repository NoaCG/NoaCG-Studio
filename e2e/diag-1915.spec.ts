// TEMPORARY DIAGNOSTIC for #1915 - never lands. Logs runner readings for import-svg.spec.ts:988.
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { finishIntoNewEditor } from './_create';
import { editorPreview } from './_frame';

const SVG = readFileSync(
  fileURLToPath(new URL('fixtures/svg-corpus/effects-gradient-shadow-lower-third.svg', import.meta.url)),
  'utf8',
);

async function read(page: Page, value: string) {
  return editorPreview(page).locator('#f0').evaluate((el, v) => {
    const w = window as unknown as { update: (j: string) => void; svgFitSizes: Record<string, number> };
    w.update(JSON.stringify({ f0: v }));
    const r = (e: Element) => { const b = e.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom].map((n) => Math.round(n * 100) / 100); };
    const role = document.getElementById('f1')!;
    const cs = getComputedStyle(el);
    const fonts: string[] = [];
    document.fonts.forEach((f) => fonts.push(`${f.family}/${f.weight}:${f.status}`));
    return {
      t: Math.round(performance.now()),
      fontsStatus: document.fonts.status,
      fonts: fonts.join(','),
      check: { archivo: document.fonts.check(`bold 56px ${cs.fontFamily}`), role: document.fonts.check(`30px ${getComputedStyle(role).fontFamily}`) },
      ff: cs.fontFamily, fs: cs.fontSize, lh: cs.lineHeight, roleFf: getComputedStyle(role).fontFamily,
      drawnSize: w.svgFitSizes.f0, lines: el.children.length || 1,
      name: r(el), role: r(role), plate: r(document.querySelector('[data-noacg-el~="g0"]')!),
      roleAttr: { y: role.getAttribute('y'), transform: role.getAttribute('transform'), style: role.getAttribute('style') },
      nameAttr: { y: el.getAttribute('y'), transform: el.getAttribute('transform'), style: el.getAttribute('style') },
    };
  }, value);
}

for (let i = 0; i < 40; i++) {
  test(`diag-1915 #${i}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()} ${m.text().slice(0, 200)}`); });
    const t0 = Date.now();
    await page.goto('/app');
    const tGoto = Date.now() - t0;
    let modalMs = -1;
    try {
      await expect(page.locator('.wz-modal')).toBeVisible({ timeout: 7000 });
      modalMs = Date.now() - t0;
    } catch {
      const state = await page.evaluate(() => ({ url: location.href, ready: document.readyState, root: document.getElementById('root')?.innerHTML.slice(0, 300), body: document.body.className }));
      await page.screenshot({ path: test.info().outputPath('nomodal.png') });
      await expect(page.locator('.wz-modal')).toBeVisible({ timeout: 60_000 }).catch(() => {});
      console.log(`DIAG1915 NOMODAL ${i} ${JSON.stringify({ tGoto, late: Date.now() - t0, state, errors })}`);
    }
    await page.locator('[data-entry="import-graphic"]').click();
    await page.locator('.wz-drop input[type="file"]').setInputFiles({ name: 'g.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(SVG) });
    await page.locator('.wz-next').click();
    await finishIntoNewEditor(page);
    const drawn0 = await read(page, 'Alexandra Riva');
    const wrapped0 = await read(page, 'Alexandra Konstantinopolous-Riva de la Vega y Santa Maria del Carmen');
    await editorPreview(page).locator('#f0').evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1500);
    const drawn1 = await read(page, 'Alexandra Riva');
    const wrapped1 = await read(page, 'Alexandra Konstantinopolous-Riva de la Vega y Santa Maria del Carmen');
    const gap = (s: typeof drawn0) => Math.round(s.role[1]) - Math.round(s.name[3]);
    console.log(`DIAG1915 RUN ${i} modalMs=${modalMs} gotoMs=${tGoto} gaps drawn0=${gap(drawn0)} wrapped0=${gap(wrapped0)} drawn1=${gap(drawn1)} wrapped1=${gap(wrapped1)}`);
    console.log(`DIAG1915 DATA ${i} ${JSON.stringify({ drawn0, wrapped0, drawn1, wrapped1, errors: errors.slice(0, 10) })}`);
  });
}
