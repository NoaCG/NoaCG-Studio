// covers: none - disposable comparable reference runtime research
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

test('pinned Studio comparable layer and property interactions', async ({ page }) => {
  test.setTimeout(120000);
  const child = spawn(process.env.REFERENCE_EXE!, ['--port','4397','--workspace',process.cwd()+'/.noacg/reference-workspace','--no-open'], {windowsHide:true});
  let log=''; child.stdout.on('data',d=>log+=String(d)); child.stderr.on('data',d=>log+=String(d));
  const observations: Record<string, unknown>={};
  try {
    await expect.poll(async()=>{try{return (await fetch('http://127.0.0.1:4397/health')).ok;}catch{return false;}}).toBe(true);
    await page.setViewportSize({width:1920,height:1080}); await page.goto('http://127.0.0.1:4397/');
    await expect(page.getByRole('button',{name:'Add Rectangle',exact:true})).toBeVisible();
    writeFileSync(test.info().outputPath('reference-initial.txt'),await page.locator('body').ariaSnapshot());
    for(const name of ['Add Rectangle','Add Ellipse','Add Text']) await page.getByRole('button',{name,exact:true}).click();
    const rows=page.locator('.layer-list > li');
    const selected=()=>page.locator('.layer-list > li.active .layer-list-name').allTextContents();
    const ids=()=>page.locator('[data-layer-id]').evaluateAll(es=>es.map(e=>e.getAttribute('data-layer-id')));
    observations.created=await rows.locator('.layer-list-name').allTextContents();
    await rows.nth(0).click(); observations.single=await selected();
    await rows.nth(2).click({modifiers:['Control']}); observations.additive=await selected();
    await rows.nth(0).click(); await rows.nth(2).click({modifiers:['Shift']}); observations.shift=await selected();
    await rows.nth(0).dblclick(); observations.doubleClickInputs=await rows.nth(0).locator('input').count();
    const name=page.locator('.inspector-row:has(> span:text-is("Name")) input');
    const beforeIds=await ids(); await name.fill('Reference headline'); await name.press('Enter');
    observations.rename={beforeIds,afterIds:await ids(),name:await rows.nth(0).locator('.layer-list-name').textContent()};
    observations.transformFields=await page.locator('.inspector-grid .inspector-row').allTextContents();
    const x=page.locator('.inspector-row:has(> span:text-is("X")) input');
    const scrub=async(modifier?:string,escape=false)=>{
      const start=Number(await x.inputValue()),box=(await x.boundingBox())!;
      if(modifier) await page.keyboard.down(modifier);
      await page.mouse.move(box.x+15,box.y+box.height/2); await page.mouse.down(); await page.mouse.move(box.x+35,box.y+box.height/2,{steps:5});
      const during=Number(await x.inputValue()); if(escape) await page.keyboard.press('Escape'); await page.mouse.up();
      if(modifier) await page.keyboard.up(modifier);
      return {start,during,after:Number(await x.inputValue())};
    };
    observations.normal=await scrub(); observations.shiftScrub=await scrub('Shift'); observations.altScrub=await scrub('Alt'); observations.escape=await scrub(undefined,true);
    const count=await page.locator('[data-layer-id]').count(); await rows.nth(0).getByRole('button',{name:'Hide layer',exact:true}).click();
    observations.hide={before:count,after:await page.locator('[data-layer-id]').count(),rowRetained:await rows.count()};
    await rows.nth(0).getByRole('button',{name:'Show layer',exact:true}).click();
    await rows.nth(0).click({button:'right'}); observations.contextMenus=await page.getByRole('menu').count(); await page.keyboard.press('Escape');
    await rows.nth(0).click(); const rowCount=await rows.count();
    await page.getByRole('button',{name:'Add element',exact:true}).count();
    // The reference keyboard shortcuts respect input focus. Its visible row Delete button is the comparable explicit route.
    await rows.nth(0).locator('[title="Delete layer"]').click();
    observations.delete={before:rowCount,after:await rows.count()};
    await page.getByRole('button',{name:'Add Rectangle',exact:true}).focus();
    await page.keyboard.press('Control+z'); observations.undoCount=await rows.count();
    await page.keyboard.press('Control+Shift+z'); observations.redoCount=await rows.count();
    await page.getByRole('button',{name:'Edit',exact:true}).click(); await page.getByRole('menuitem',{name:/^Undo /}).first().click(); observations.explicitUndo=await rows.count();
    await page.getByRole('button',{name:'Edit',exact:true}).click(); await page.getByRole('menuitem',{name:/^Redo /}).first().click(); await expect(rows).toHaveCount(2); observations.explicitRedo=await rows.count();
    writeFileSync(test.info().outputPath('reference-created.txt'),await page.locator('body').ariaSnapshot());
    await page.screenshot({path:test.info().outputPath('reference-created.png')});
  } finally {child.kill();writeFileSync(test.info().outputPath('reference-server.log'),log);writeFileSync(test.info().outputPath('reference-observations.json'),JSON.stringify(observations,null,2));}
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
  await rows.nth(2).click(); const initial=await source(), count=await history();
  await rows.nth(2).press('Delete'); const deleted=await source();
  await rows.nth(2).dblclick(); const rename=await page.getByRole('textbox',{name:/Layer name/}).count();
  await rows.nth(2).press('Escape'); await rows.nth(2).click({button:'right'}); const menu=await page.getByRole('menu').count(); await page.keyboard.press('Escape');
  await rows.nth(2).click();
  const field=page.locator('.ef-animation-properties').getByRole('textbox',{name:/offset X|Position X/}).first();
  const controls=await page.locator('.ef-key-controls button').evaluateAll(els=>els.map(el=>({name:el.getAttribute('aria-label'),title:el.getAttribute('title')})));
  const box=await field.boundingBox(); const before=await field.inputValue(); await page.mouse.move(box!.x+15,box!.y+10); await page.mouse.down(); await page.mouse.move(box!.x+55,box!.y+10,{steps:5}); await page.mouse.up();
  writeFileSync(test.info().outputPath('baseline.json'),JSON.stringify({selectors,shift,additive,deleteChanged:JSON.stringify(initial)!==JSON.stringify(deleted),count,afterCount:await history(),rename,menu,controls,before,after:await field.inputValue(),visibility:await page.getByRole('button',{name:/Hide .*layer|Show .*layer/}).count()},null,2));
  writeFileSync(test.info().outputPath('main-ui.txt'),await page.locator('body').ariaSnapshot()); await page.screenshot({path:test.info().outputPath('main-baseline.png')});
});


