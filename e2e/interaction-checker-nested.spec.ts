// covers: none - independent checker probe, never land
import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { open, source, selected, inspection, row, frame, ready, select, undo, redo, draw, point } from './_layerProperty';

test('independent nested group copy constrained gesture and rename ownership', async ({page}) => {
  test.setTimeout(150000);
  await page.setViewportSize({width:1920,height:1080}); await open(page);
  const a=await draw(page,.23), b=await draw(page,.44), c=await draw(page,.65);
  await page.getByRole('button',{name:'select tool',exact:true}).click();
  await select(page,a); await row(page,b).locator('.ef-layer').click({modifiers:['Control']});
  await page.getByRole('button',{name:'Group selection',exact:true}).click(); await ready(page);
  const inner=(await selected(page))[0];
  await row(page,c).locator('.ef-layer').click({modifiers:['Control']});
  await page.getByRole('button',{name:'Group selection',exact:true}).click(); await ready(page);
  const outer=(await selected(page))[0];
  await expect((await frame(page)).locator(outer+' '+inner+' '+a)).toHaveCount(1);
  const original=await source(page), history=(await inspection(page)).history;
  await row(page,outer).locator('.ef-layer').press('Enter');
  const rename=page.getByRole('textbox',{name:'Layer name',exact:true});
  await rename.fill('Temporary title'); await rename.press('Control+a'); await rename.press('Control+d');
  expect(await selected(page)).toEqual([outer]); expect(await source(page)).toEqual(original);
  await rename.press('Escape'); expect(await source(page)).toEqual(original); expect((await inspection(page)).history).toEqual(history);
  const p=await point(page,a);
  for (const cancel of [true,false]) {
    await page.keyboard.down('Alt'); await page.keyboard.down('Shift');
    await page.mouse.move(p.x,p.y); await page.mouse.down(); await page.mouse.move(p.x+53,p.y+17,{steps:9});
    await expect((await frame(page)).locator(outer+'-copy-1 '+inner+'-copy-1 '+a+'-copy-1')).toHaveCount(1);
    await expect.poll(async()=> (await point(page,a+'-copy-1')).x).toBeCloseTo(p.x+53,1);
    await expect.poll(async()=> (await point(page,a+'-copy-1')).y).toBeCloseTo(p.y,1);
    expect(await source(page)).toEqual(original); expect((await inspection(page)).history).toEqual(history);
    if(cancel) await page.keyboard.press('Escape');
    await page.mouse.up(); await page.keyboard.up('Shift'); await page.keyboard.up('Alt'); await ready(page);
    if(cancel) {await expect((await frame(page)).locator(outer+'-copy-1')).toHaveCount(0); expect(await source(page)).toEqual(original); expect((await inspection(page)).history).toEqual(history);}
  }
  const copy=(await selected(page))[0], committed=await source(page);
  expect(copy).toBe(outer+'-copy-1'); expect((await inspection(page)).history.undo).toBe(history.undo+1);
  expect(committed.fields).toEqual(original.fields); expect(committed.assets).toEqual(original.assets);
  await undo(page); expect(await source(page)).toEqual(original); expect(await selected(page)).toEqual([outer]);
  await redo(page); expect(await source(page)).toEqual(committed); expect(await selected(page)).toEqual([copy]);
  await expect((await frame(page)).locator(copy+' '+inner+'-copy-1 '+a+'-copy-1')).toHaveCount(1);
  await page.screenshot({path:test.info().outputPath('nested-copy.png')});
  writeFileSync(test.info().outputPath('nested-copy.json'),JSON.stringify({a,b,c,inner,outer,copy,shiftConstraint:true,renameOwnsKeys:true,oneUndo:true,exactEscape:true,stableRedo:true},null,2));
});
