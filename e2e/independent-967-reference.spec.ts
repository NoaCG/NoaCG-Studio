import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
test('fresh Studio layer property comparison', async ({page}) => {
 test.setTimeout(150000);
 const child=spawn(process.env.REFERENCE_EXE!,['--port','4397','--workspace',process.cwd()+'/.noacg/fresh-reference','--no-open']);
 let log=''; child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
 const receipt:Record<string,unknown>={};
 try {
  await expect.poll(async()=>{try{return(await fetch('http://127.0.0.1:4397/health')).ok;}catch{return false;}}).toBe(true);
  await page.setViewportSize({width:1920,height:1080});await page.goto('http://127.0.0.1:4397/');
  for(const label of ['Add Ellipse','Add Rectangle','Add Text']) await page.getByRole('button',{name:label,exact:true}).click();
  const rows=page.locator('.layer-list > li'),active=()=>page.locator('.layer-list > li.active .layer-list-name').allTextContents();
  await expect(rows).toHaveCount(3);await rows.nth(0).click();await rows.nth(2).click({modifiers:['Control']});receipt.ctrl=await active();expect((receipt.ctrl as string[]).length).toBe(2);
  await rows.nth(0).click();await rows.nth(2).click({modifiers:['Shift']});receipt.shift=await active();expect((receipt.shift as string[]).length).toBe(1);
  await rows.nth(0).dblclick();receipt.inlineInputs=await rows.nth(0).locator('input').count();expect(receipt.inlineInputs).toBe(0);
  const ids=()=>page.locator('[data-layer-id]').evaluateAll(es=>es.map(e=>e.getAttribute('data-layer-id')).sort());
  const before=await ids(),name=page.locator('.inspector-row:has(> span:text-is("Name")) input');
  await name.fill('Independent reference presenter');await name.press('Enter');expect(await ids()).toEqual(before);
  receipt.rename={before,after:await ids(),label:await rows.nth(0).locator('.layer-list-name').textContent()};
  const x=page.locator('.inspector-row:has(> span:text-is("X")) input');
  const scrub=async(distance:number,modifier?:string,cancel=false)=>{const start=Number(await x.inputValue()),b=(await x.boundingBox())!;if(modifier)await page.keyboard.down(modifier);await page.mouse.move(b.x+16,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+16+distance,b.y+b.height/2,{steps:8});const during=Number(await x.inputValue());if(cancel)await page.keyboard.press('Escape');await page.mouse.up();if(modifier)await page.keyboard.up(modifier);return{start,during,after:Number(await x.inputValue())};};
  const normal=await scrub(26),coarse=await scrub(26,'Shift'),fine=await scrub(26,'Alt'),cancel=await scrub(34,undefined,true);
  expect(normal.after-normal.start).toBe(13);expect(coarse.after-coarse.start).toBe(130);expect(fine.after-fine.start).toBeCloseTo(1.3,5);expect(cancel.after).toBe(cancel.during);
  receipt.scrub={normal,coarse,fine,cancel};
  const rendered=await ids();await rows.nth(0).getByRole('button',{name:'Hide layer',exact:true}).click();await expect(page.locator('[data-layer-id]')).toHaveCount(2);expect(await rows.count()).toBe(3);receipt.eye={before:rendered,hidden:await ids(),rows:await rows.count()};
  await rows.nth(0).getByRole('button',{name:'Show layer',exact:true}).click();await expect(page.locator('[data-layer-id]')).toHaveCount(3);
  await rows.nth(0).click({button:'right'});receipt.contextMenus=await page.getByRole('menu').count();expect(receipt.contextMenus).toBe(0);await page.keyboard.press('Escape');
  receipt.properties=await page.locator('.inspector-grid .inspector-row').allTextContents();
  await page.screenshot({path:test.info().outputPath('reference-desktop.png')});
  // Let the inspected 500 ms burst flush, so Delete has a separately observable history boundary.
  await page.waitForTimeout(600);await rows.nth(0).locator('[title="Delete layer"]').click();await expect(rows).toHaveCount(2);await page.waitForTimeout(600);
  await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByRole('menuitem',{name:/^Undo /}).first().click();await expect(rows).toHaveCount(3);expect(await ids()).toEqual(before);
  await page.getByRole('button',{name:'Edit',exact:true}).click();await page.getByRole('menuitem',{name:/^Redo /}).first().click();await expect(rows).toHaveCount(2);
  receipt.history={deleted:2,explicitUndo:3,explicitRedo:2,burstWaitMs:600};
  writeFileSync(test.info().outputPath('reference-ui.txt'),await page.locator('body').ariaSnapshot());
 } finally {child.kill();writeFileSync(test.info().outputPath('reference.json'),JSON.stringify(receipt,null,2));writeFileSync(test.info().outputPath('reference-server.log'),log);}
});
