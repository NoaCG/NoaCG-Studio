// covers: none - disposable pinned reference comparison; never land
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

test('Studio keyboard copy context and modifier drag comparison', async ({page}) => {
  test.setTimeout(120000);
  const child=spawn(process.env.REFERENCE_EXE!,['--port','4398','--workspace',process.cwd()+'/.noacg/interaction-reference','--no-open']);
  let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
  const receipt:Record<string,unknown>={pin:'3142fc7d02934494931eb14e7dc255393e4110d0',release:'v0.17'};
  try {
    await expect.poll(async()=>{try{return(await fetch('http://127.0.0.1:4398/health')).ok;}catch{return false;}}).toBe(true);
    await page.addInitScript(()=>{Object.defineProperty(window,'showSaveFilePicker',{value:undefined});});
    await page.setViewportSize({width:1920,height:1080});await page.goto('http://127.0.0.1:4398/');
    await page.getByRole('button',{name:'Add Rectangle',exact:true}).click();
    const rows=page.locator('.layer-list > li'),ids=()=>page.locator('[data-layer-id]').evaluateAll(es=>es.map(e=>e.getAttribute('data-layer-id')).sort());
    await expect(rows).toHaveCount(1);const before=await ids();await rows.first().click();await page.keyboard.press('Control+d');await expect(rows).toHaveCount(2);const copied=await ids();
    expect(copied).toHaveLength(2);expect(copied).toEqual(expect.arrayContaining(before));
    await page.keyboard.press('Control+z');await expect(rows).toHaveCount(1);await page.keyboard.press('Control+Shift+z');await expect(rows).toHaveCount(2);expect(await ids()).toEqual(copied);
    await rows.first().click();await page.keyboard.press('Control+a');await expect(page.locator('.layer-list > li.active')).toHaveCount(2);receipt.keyboard={original:before,copies:copied,undo:1,redo:2,selectAll:2};
    await rows.first().click();const x=page.locator('.inspector-row:has(> span:text-is("X")) input');await x.focus();await x.press('Control+d');await expect(rows).toHaveCount(2);receipt.inputOwnsDuplicate=true;
    const selectedId=await page.locator('[data-layer-id].selected').first().getAttribute('data-layer-id');const layer=page.locator(`[data-layer-id="${selectedId}"]`);const box=(await layer.boundingBox())!;
    await page.mouse.click(box.x+box.width/2,box.y+box.height/2,{button:'right'});await expect(page.getByRole('menuitem',{name:/Duplicate/}).first()).toBeVisible();await page.keyboard.press('Escape');receipt.canvasContext=true;
    await rows.first().click();const start=Number(await x.inputValue());
    await page.keyboard.down('Alt');await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+40,box.y+box.height/2+12,{steps:8});await page.mouse.up();await page.keyboard.up('Alt');
    await expect(rows).toHaveCount(2);receipt.altDrag={rowCount:await rows.count(),start,after:Number(await x.inputValue()),duplicates:false};
    await page.screenshot({path:test.info().outputPath('studio-interactions.png')});
    const waiting=page.waitForEvent('download');await page.getByRole('button',{name:'Save Project',exact:true}).click();const download=await waiting;receipt.project=JSON.parse(readFileSync((await download.path())!,'utf8'));
  } finally {child.kill();writeFileSync(test.info().outputPath('studio-interactions.json'),JSON.stringify(receipt,null,2));writeFileSync(test.info().outputPath('studio.log'),log);}
});

test('Eyevinn selection properties and modifier drag comparison',async({page})=>{
  test.setTimeout(120000);
  const child=spawn('node',['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4399','--strictPort'],{cwd:process.cwd()+'/.noacg/reference-eyevinn'});
  let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
  const receipt:Record<string,unknown>={pin:'616841bd949e3a21137579451123f66c292543f0'};
  try {
    await expect.poll(async()=>{try{return(await fetch('http://127.0.0.1:4399/')).ok;}catch{return false;}},{timeout:20000}).toBe(true);
    await page.setViewportSize({width:1366,height:768});await page.goto('http://127.0.0.1:4399/');
    await page.getByRole('button',{name:'New Template',exact:true}).click();await page.locator('#template-id').fill('interaction-qualification');await page.locator('#template-name').fill('Interaction qualification');await page.locator('#template-type').selectOption('custom');await page.getByRole('button',{name:'Create',exact:true}).click();
    await page.getByRole('button',{name:'Add Rectangle',exact:true}).click();await page.getByRole('button',{name:'Fit the whole canvas in view',exact:true}).click();
    const elements=page.locator('.graphics-element');await expect(elements).toHaveCount(2);await elements.last().click();
    const x=page.locator('[data-property="x"]');await expect(x).toBeVisible();await x.fill('300');await x.press('Tab');await expect(elements.last()).toHaveCSS('left','300px');
    await x.focus();await x.press('Delete');await expect(elements).toHaveCount(2);await x.fill('300');await x.press('Tab');
    let box=(await elements.last().boundingBox())!;await page.mouse.click(box.x+box.width/2,box.y+box.height/2);await page.keyboard.press('Control+d');await expect(elements).toHaveCount(2);receipt.keyboardDuplicate=false;
    box=(await elements.last().boundingBox())!;await page.keyboard.down('Alt');await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+30,box.y+box.height/2+10,{steps:6});await page.mouse.up();await page.keyboard.up('Alt');await expect(elements).toHaveCount(2);expect(Number(await x.inputValue())).toBeGreaterThan(300);receipt.altDrag={duplicates:false,x:Number(await x.inputValue())};
    await page.mouse.click(box.x+box.width/2+30,box.y+box.height/2+10,{button:'right'});expect(await page.getByRole('menu').count()).toBe(0);receipt.contextMenu=false;
    await page.screenshot({path:test.info().outputPath('eyevinn-interactions.png')});receipt.propertyNames=await page.locator('#properties-content label').allTextContents();receipt.elements=await elements.evaluateAll(es=>es.map(e=>({id:e.getAttribute('data-element-id'),style:e.getAttribute('style')})));
    await page.reload();await expect(elements).toHaveCount(2);receipt.reopen=true;
  } finally {child.kill();writeFileSync(test.info().outputPath('eyevinn-interactions.json'),JSON.stringify(receipt,null,2));writeFileSync(test.info().outputPath('eyevinn.log'),log);}
});

