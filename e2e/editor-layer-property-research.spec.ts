// covers: none - temporary baseline and pinned reference research
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

test('pinned Studio runtime discovery', async ({ page }) => {
  test.setTimeout(120000);
  const child = spawn(process.env.REFERENCE_EXE!, ['--port', '4397', '--workspace', process.cwd() + '/.noacg/reference-workspace', '--no-open'], { windowsHide: true });
  let log = ''; child.stdout.on('data', d => log += String(d)); child.stderr.on('data', d => log += String(d));
  try {
    await expect.poll(async () => { try { return (await fetch('http://127.0.0.1:4397/health')).ok; } catch { return false; } }).toBe(true);
    await page.setViewportSize({ width: 1920, height: 1080 }); await page.goto('http://127.0.0.1:4397/');
    await expect(page.locator('body')).toContainText('Rectangle');
    writeFileSync(test.info().outputPath('reference-initial.txt'), await page.locator('body').ariaSnapshot());
    await page.getByRole('button', {name:'Rectangle', exact:true}).click();
    await page.getByRole('button', {name:'Ellipse', exact:true}).click();
    await page.getByRole('button', {name:'Text', exact:true}).click();
    writeFileSync(test.info().outputPath('reference-created.txt'), await page.locator('body').ariaSnapshot());
    await page.screenshot({path:test.info().outputPath('reference-created.png')});
  } finally { child.kill(); writeFileSync(test.info().outputPath('reference-server.log'), log); }
});

test('current-main ordinary layer property baseline', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({width:1920,height:1080}); await page.goto('/app?editor=foundation#/new');
  await page.locator('[data-entry="import-graphic"]').click(); await page.locator('.wz-drop input[type=file]').setInputFiles('e2e/fixtures/cli-round-trip/riverlight.zip');
  await expect(page.getByTestId('import-template-card')).toContainText('Riverlight'); await page.locator('.wz-next').click(); await page.getByTestId('wz-finish-edit-artwork').click();
  const canvas=page.getByTestId('foundation-canvas'); await expect(canvas).toHaveAttribute('data-pending','false');
  const selected=()=>page.evaluate(async()=> (await import('/src/store/templateStore.ts')).useTemplateStore.getState().selectedParts);
  const source=()=>page.evaluate(async()=> (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template);
  const history=()=>page.evaluate(async()=> (await import('/src/store/templateStore.ts')).useTemplateStore.getState().history.length);
  const rows=page.locator('.ef-track:not(.ef-property-track) .ef-layer');
  const selectors=await page.locator('.ef-track:not(.ef-property-track)').evaluateAll(els=>els.map(el=>el.getAttribute('data-selector')));
  await rows.nth(0).click(); await rows.nth(2).click({modifiers:['Shift']}); const shift=await selected();
  await rows.nth(0).click(); await rows.nth(2).click({modifiers:['Control']}); const additive=await selected();
  await rows.nth(0).click(); const initial=await source(), count=await history();
  await rows.nth(0).press('Delete'); const deleted=await source();
  await rows.nth(0).dblclick(); const rename=await page.getByRole('textbox',{name:/Layer name/}).count();
  await rows.nth(0).press('Escape'); await rows.nth(0).click({button:'right'}); const menu=await page.getByRole('menu').count(); await page.keyboard.press('Escape');
  const field=page.locator('.ef-animation-properties').getByRole('textbox',{name:/offset X|Position X/}).first();
  const controls=await page.locator('.ef-key-controls button').evaluateAll(els=>els.map(el=>({name:el.getAttribute('aria-label'),title:el.getAttribute('title')})));
  const box=await field.boundingBox(); const before=await field.inputValue(); await page.mouse.move(box!.x+15,box!.y+10); await page.mouse.down(); await page.mouse.move(box!.x+55,box!.y+10,{steps:5}); await page.mouse.up();
  writeFileSync(test.info().outputPath('baseline.json'),JSON.stringify({selectors,shift,additive,deleteChanged:JSON.stringify(initial)!==JSON.stringify(deleted),count,afterCount:await history(),rename,menu,controls,before,after:await field.inputValue(),visibility:await page.getByRole('button',{name:/Hide .*layer|Show .*layer/}).count()},null,2));
  writeFileSync(test.info().outputPath('main-ui.txt'),await page.locator('body').ariaSnapshot()); await page.screenshot({path:test.info().outputPath('main-baseline.png')});
});
